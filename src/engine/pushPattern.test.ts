import { describe, it, expect, vi } from 'vitest'
import {
  CONTROLLER_DRAIN_PATTERN_SOURCE,
  CONTROLLER_REPLACEMENT_OVERLAP_BUDGET_BYTES,
  pushPattern,
  requiresControllerDrain,
  type PushPatternDeps,
} from './pushPattern'
import { decodePbp } from './pbpEncode'
import { parsePxlblzBanner, stampArtifact, stripPxlblzBanner } from './artifactStamp'
import type { BindingStore } from './controllerBinding'

// A reconciling bytecode blob: header declares 0 opcode + 0 export bytes, len 8.
function goodBytecode(byteLength = 8): Uint8Array {
  const bytecode = new Uint8Array(byteLength)
  new DataView(bytecode.buffer).setUint32(0, byteLength - 8, true)
  return bytecode
}

// A bad blob whose header does not reconcile with its length.
function badBytecode(): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setUint32(0, 99, true) // claims 99 opcode bytes
  return b
}

function makeProvider(overrides: Partial<PushPatternDeps['provider']> = {}) {
  return {
    compile: vi.fn().mockResolvedValue(goodBytecode()),
    getActiveProgramBytecodeSize: vi.fn().mockResolvedValue(0),
    listPrograms: vi.fn().mockResolvedValue([]),
    pushBytecode: vi.fn().mockResolvedValue(undefined),
    saveProgram: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

function makeDeps(overrides: Partial<PushPatternDeps> = {}): {
  deps: PushPatternDeps
  saved: BindingStore[]
  pushRecords: Array<Record<string, unknown>>
} {
  const saved: BindingStore[] = []
  const pushRecords: Array<Record<string, unknown>> = []
  const deps: PushPatternDeps = {
    provider: makeProvider(),
    controllerId: 'ctrl-A',
    patternId: 'pat-1',
    source: 'export function render(i){}',
    name: 'My Pattern',
    loadBindings: async () => ({}),
    saveBindings: async (b) => {
      saved.push(b)
    },
    loadPushRecords: async () => ({}),
    savePushRecords: async (records) => {
      pushRecords.push(records)
    },
    stampedAt: '2026-07-09T12:34:56.000Z',
    mintId: () => 'MINTED00000000000',
    ...overrides,
  }
  return { deps, saved, pushRecords }
}

describe('Controller replacement overlap policy (#547)', () => {
  it('keeps the exact measured overlap budget direct and drains one byte above it', () => {
    const outgoingBytecodeBytes = 30_000

    expect(requiresControllerDrain(
      CONTROLLER_REPLACEMENT_OVERLAP_BUDGET_BYTES - outgoingBytecodeBytes,
      outgoingBytecodeBytes,
    )).toBe(false)
    expect(requiresControllerDrain(
      CONTROLLER_REPLACEMENT_OVERLAP_BUDGET_BYTES - outgoingBytecodeBytes + 1,
      outgoingBytecodeBytes,
    )).toBe(true)
  })

  it('drains conservatively when the outgoing bytecode footprint is unknown', () => {
    expect(requiresControllerDrain(8, null)).toBe(true)
  })

  it('keeps the qualified black drain source at the measured 140-byte footprint', () => {
    expect(new TextEncoder().encode(CONTROLLER_DRAIN_PATTERN_SOURCE)).toHaveLength(140)
    expect(CONTROLLER_DRAIN_PATTERN_SOURCE).toContain('rgb(0, 0, 0)')
  })
})

describe('pushPattern — run-only (default)', () => {
  it('mints a throwaway id and loads + runs via pushBytecode, never touching the binding', async () => {
    const loadPushRecords = vi.fn().mockResolvedValue({})
    const savePushRecords = vi.fn().mockResolvedValue(undefined)
    const { deps, saved, pushRecords } = makeDeps({ loadPushRecords, savePushRecords })
    const result = await pushPattern(deps)

    expect(result).toEqual({ programId: 'MINTED00000000000', created: true })
    // #237: the run path sends an empty name — a run-only program is never persisted,
    // so a name on its setCode would be a phantom. The display name lives in the local
    // label cache (recorded by the caller against the returned id), not on the device.
    expect(deps.provider.pushBytecode).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
      name: '',
    })
    expect(deps.provider.compile).toHaveBeenCalledTimes(1)
    expect(deps.provider.getActiveProgramBytecodeSize).toHaveBeenCalledTimes(1)
    expect(deps.provider.pushBytecode).toHaveBeenCalledTimes(1)
    // The #236 reframe: run-only never consults the program list or persists a binding.
    expect(deps.provider.listPrograms).not.toHaveBeenCalled()
    expect(deps.provider.saveProgram).not.toHaveBeenCalled()
    expect(saved).toEqual([])
    expect(pushRecords).toEqual([])
    expect(loadPushRecords).not.toHaveBeenCalled()
    expect(savePushRecords).not.toHaveBeenCalled()
  })

  it('mints a fresh throwaway id each push (no overwrite-in-place)', async () => {
    let n = 0
    const { deps } = makeDeps({ mintId: () => `MINT${n++}000000000000` })
    const a = await pushPattern(deps)
    const b = await pushPattern(deps)
    expect(a.programId).not.toBe(b.programId)
  })

  it('runs the black drain under a separate throwaway id before an unsafe large replacement', async () => {
    const targetBytecode = goodBytecode(40_518)
    const drainBytecode = goodBytecode(153)
    const compile = vi.fn()
      .mockResolvedValueOnce(targetBytecode)
      .mockResolvedValueOnce(drainBytecode)
    const provider = makeProvider({
      compile,
      getActiveProgramBytecodeSize: vi.fn().mockResolvedValue(49_426),
    })
    const { deps } = makeDeps({
      provider,
      mintDrainId: () => 'DRAIN000000000000',
    })

    await pushPattern(deps)

    expect(compile).toHaveBeenNthCalledWith(1, deps.source)
    expect(compile).toHaveBeenNthCalledWith(2, CONTROLLER_DRAIN_PATTERN_SOURCE)
    expect(provider.pushBytecode).toHaveBeenNthCalledWith(1, drainBytecode, {
      id: 'DRAIN000000000000',
      name: '',
    })
    expect(provider.pushBytecode).toHaveBeenNthCalledWith(2, targetBytecode, {
      id: 'MINTED00000000000',
      name: '',
    })
  })

  it('surfaces a contextual drain activation error and never sends the target', async () => {
    const provider = makeProvider({
      compile: vi.fn()
        .mockResolvedValueOnce(goodBytecode(40_518))
        .mockResolvedValueOnce(goodBytecode(153)),
      getActiveProgramBytecodeSize: vi.fn().mockResolvedValue(49_426),
      pushBytecode: vi.fn().mockRejectedValueOnce(new Error('socket closed')),
    })
    const { deps } = makeDeps({
      provider,
      mintDrainId: () => 'DRAIN000000000000',
    })

    await expect(pushPattern(deps)).rejects.toThrow(
      'Controller drain activation failed: socket closed',
    )
    expect(provider.pushBytecode).toHaveBeenCalledTimes(1)
    expect(provider.saveProgram).not.toHaveBeenCalled()
  })
})

describe('pushPattern — save mode (persist: true)', () => {
  it('mints + binds + saves a PBP record on the first save for a pattern', async () => {
    const { deps, saved } = makeDeps({ persist: true })
    const result = await pushPattern(deps)

    expect(result).toEqual({ programId: 'MINTED00000000000', created: true })
    expect(deps.provider.saveProgram).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
    })
    // Save-and-run (#238): the saved program is also run under the SAME stable id so
    // the device switches to it (LEDs change, config.activeProgramId becomes S) and the
    // panel resolves it via the list tier. Unlike run-only, the run carries the real name.
    expect(deps.provider.pushBytecode).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
      name: 'My Pattern',
    })
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'MINTED00000000000' } }])
  })

  it('runs the saved program under the SAME id used to save it', async () => {
    const { deps } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: makeProvider({
        listPrograms: vi.fn().mockResolvedValue([{ id: 'DEVPROG1', name: 'x' }]),
      }),
    })
    await pushPattern(deps)
    const saveId = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0][1].id
    const runId = (deps.provider.pushBytecode as ReturnType<typeof vi.fn>).mock.calls[0][1].id
    expect(runId).toBe(saveId)
    expect(runId).toBe('DEVPROG1')
  })

  it('drains before saving and activating a large target without persisting the drain identity', async () => {
    const targetBytecode = goodBytecode(40_518)
    const drainBytecode = goodBytecode(153)
    const provider = makeProvider({
      compile: vi.fn()
        .mockResolvedValueOnce(targetBytecode)
        .mockResolvedValueOnce(drainBytecode),
      getActiveProgramBytecodeSize: vi.fn().mockResolvedValue(49_426),
    })
    const { deps, saved, pushRecords } = makeDeps({
      persist: true,
      provider,
      mintDrainId: () => 'DRAIN000000000000',
    })

    await pushPattern(deps)

    expect(provider.pushBytecode).toHaveBeenNthCalledWith(1, drainBytecode, {
      id: 'DRAIN000000000000',
      name: '',
    })
    expect(provider.saveProgram).toHaveBeenCalledTimes(1)
    expect(provider.saveProgram).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
    })
    expect(provider.pushBytecode).toHaveBeenNthCalledWith(2, targetBytecode, {
      id: 'MINTED00000000000',
      name: 'My Pattern',
    })
    expect(vi.mocked(provider.pushBytecode).mock.invocationCallOrder[0])
      .toBeLessThan(vi.mocked(provider.saveProgram).mock.invocationCallOrder[0])
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'MINTED00000000000' } }])
    expect(pushRecords).toHaveLength(1)
  })

  it('binds a persisted target before activation so a retry overwrites instead of duplicating', async () => {
    const targetId = 'SAVED00000000000'
    let bindings: BindingStore = {}
    const bindingWrites: BindingStore[] = []
    const mintId = vi.fn()
      .mockReturnValueOnce(targetId)
      .mockReturnValueOnce('DUPLICATE0000000')
    const provider = makeProvider({
      compile: vi.fn(async (source: string) => (
        source === CONTROLLER_DRAIN_PATTERN_SOURCE
          ? goodBytecode(153)
          : goodBytecode(40_518)
      )),
      getActiveProgramBytecodeSize: vi.fn().mockResolvedValue(49_426),
      listPrograms: vi.fn().mockResolvedValue([{ id: targetId, name: 'My Pattern' }]),
      pushBytecode: vi.fn()
        .mockResolvedValueOnce(undefined)
        .mockRejectedValueOnce(new Error('activation timed out'))
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined),
    })
    const { deps, pushRecords } = makeDeps({
      persist: true,
      provider,
      loadBindings: async () => bindings,
      saveBindings: async (next) => {
        bindings = next
        bindingWrites.push(next)
      },
      mintId,
      mintDrainId: () => 'DRAIN000000000000',
    })

    await expect(pushPattern(deps)).rejects.toThrow(
      'Controller target activation failed: activation timed out',
    )
    expect(provider.saveProgram).toHaveBeenCalledTimes(1)
    expect(bindingWrites).toEqual([{ 'ctrl-A': { 'pat-1': targetId } }])
    expect(pushRecords).toEqual([])

    await expect(pushPattern(deps)).resolves.toEqual({ programId: targetId, created: false })
    expect(mintId).toHaveBeenCalledTimes(1)
    expect(provider.saveProgram).toHaveBeenNthCalledWith(2, expect.any(Uint8Array), {
      id: targetId,
    })
    expect(bindingWrites).toHaveLength(1)
    expect(pushRecords).toHaveLength(1)
  })

  it('still activates the target and retries when the pre-activation binding write fails', async () => {
    const targetBytecode = goodBytecode(40_518)
    const drainBytecode = goodBytecode(153)
    const saveBindings = vi.fn().mockRejectedValue(new Error('metadata offline'))
    const provider = makeProvider({
      compile: vi.fn(async (source: string) => (
        source === CONTROLLER_DRAIN_PATTERN_SOURCE ? drainBytecode : targetBytecode
      )),
      getActiveProgramBytecodeSize: vi.fn().mockResolvedValue(49_426),
    })
    const { deps, pushRecords } = makeDeps({
      persist: true,
      provider,
      saveBindings,
      mintDrainId: () => 'DRAIN000000000000',
    })

    await expect(pushPattern(deps)).rejects.toThrow('metadata offline')

    expect(provider.pushBytecode).toHaveBeenNthCalledWith(1, drainBytecode, {
      id: 'DRAIN000000000000',
      name: '',
    })
    expect(provider.pushBytecode).toHaveBeenNthCalledWith(2, targetBytecode, {
      id: 'MINTED00000000000',
      name: 'My Pattern',
    })
    expect(saveBindings).toHaveBeenCalledTimes(2)
    expect(pushRecords).toEqual([])
  })

  it('can overwrite a managed saved program without activating it', async () => {
    const { deps, pushRecords } = makeDeps({
      persist: true,
      activateOnSave: false,
      requireExisting: true,
      profileSignature: 'profile-signature-v2',
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: makeProvider({
        listPrograms: vi.fn().mockResolvedValue([{ id: 'DEVPROG1', name: 'My Pattern' }]),
      }),
    })

    const result = await pushPattern(deps)

    expect(result).toEqual({ programId: 'DEVPROG1', created: false })
    expect(deps.provider.saveProgram).toHaveBeenCalledWith(expect.any(Uint8Array), { id: 'DEVPROG1' })
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(deps.provider.getActiveProgramBytecodeSize).not.toHaveBeenCalled()
    expect(pushRecords[0]).toMatchObject({
      'ctrl-A': { 'pat-1': { profileSignature: 'profile-signature-v2' } },
    })
  })

  it('never recreates a missing managed program during background reconciliation', async () => {
    const { deps, saved, pushRecords } = makeDeps({
      persist: true,
      requireExisting: true,
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DELETED1' } }),
      provider: makeProvider({ listPrograms: vi.fn().mockResolvedValue([]) }),
    })

    await expect(pushPattern(deps)).rejects.toThrow(
      'Managed saved program no longer exists on the Controller',
    )
    expect(deps.provider.saveProgram).not.toHaveBeenCalled()
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(saved).toEqual([])
    expect(pushRecords).toEqual([])
  })

  it('preserves a canonical pre-stamped Show source in the saved PBP', async () => {
    const source = stampArtifact('export function render(index) { rgb(1, 0, 0) }', {
      kind: 'show',
      id: 'show-1',
      name: 'Opening Night',
      transforms: ['show'],
      showOutputContract: {
        version: 1,
        kind: 'installation',
        pixelCount: 256,
        outputMap: { kind: 'stock', id: 'plane', name: 'Square', fingerprint: '11111111' },
      },
      stampedAt: '2026-07-11T12:00:00.000Z',
    })
    const { deps, pushRecords } = makeDeps({
      persist: true,
      patternId: 'show:show-1',
      name: 'Opening Night',
      source,
      artifactStamp: {
        kind: 'show',
        id: 'show-1',
        name: 'Opening Night',
        transforms: ['show'],
        showOutputContract: {
          version: 1,
          kind: 'installation',
          pixelCount: 256,
          outputMap: { kind: 'stock', id: 'plane', name: 'Square', fingerprint: '11111111' },
        },
        stampedAt: '2026-07-11T12:00:00.000Z',
      },
    })

    await pushPattern(deps)

    const blob = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0][0]
    const decoded = decodePbp(blob)
    if (!decoded) throw new Error('Expected a decodable saved Show PBP')
    expect(decoded.sourceCode).toBe(source)
    expect(parsePxlblzBanner(decoded.sourceCode)).toMatchObject({
      kind: 'show',
      id: 'show-1',
      name: 'Opening Night',
      transforms: ['show'],
      showOutputContract: { kind: 'installation', pixelCount: 256 },
    })
    expect(pushRecords[0]).toMatchObject({
      'ctrl-A': {
        'show:show-1': {
          showOutputContract: {
            kind: 'installation',
            pixelCount: 256,
            outputMap: { name: 'Square', fingerprint: '11111111' },
          },
        },
      },
    })
  })

  it('encodes the PBP blob with the pattern name and stamped source', async () => {
    const { deps } = makeDeps({
      persist: true,
      name: 'Rainbow',
      source: 'export function render(index){ hsv(0,1,1) }',
      transforms: ['hardware-brightness', 'power-cap'],
    })
    await pushPattern(deps)
    const [blob] = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0]
    const decoded = decodePbp(blob as Uint8Array)
    expect(decoded!.name).toBe('Rainbow')
    expect(stripPxlblzBanner(decoded!.sourceCode)).toBe('export function render(index){ hsv(0,1,1) }')
    expect(parsePxlblzBanner(decoded!.sourceCode)).toMatchObject({
      kind: 'pattern',
      id: 'pat-1',
      name: 'Rainbow',
      transforms: ['hardware-brightness', 'power-cap'],
      stamped: '2026-07-09T12:34:56.000Z',
    })
  })

  it('persists the canonical artifact stamp as a push record beside the binding', async () => {
    const { deps, pushRecords } = makeDeps({
      persist: true,
      name: 'Rainbow',
      source: 'export function render(index){ hsv(0,1,1) }',
      transforms: ['hardware-brightness', 'power-cap'],
    })

    await pushPattern(deps)

    const [blob] = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0]
    const banner = parsePxlblzBanner(decodePbp(blob as Uint8Array)!.sourceCode)!
    expect(pushRecords).toEqual([{
      'ctrl-A': {
        'pat-1': {
          transforms: banner.transforms,
          artifactHash: banner.hash,
          stampedAt: banner.stamped,
          name: 'Rainbow',
        },
      },
    }])
  })

  it('threads the previewImage into the PBP jpeg section (#259)', async () => {
    const previewImage = new Uint8Array([0xff, 0xd8, 1, 2, 3, 0xff, 0xd9])
    const { deps } = makeDeps({ persist: true, previewImage })
    await pushPattern(deps)
    const [blob] = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0]
    const decoded = decodePbp(blob as Uint8Array)
    expect(Array.from(decoded!.jpeg)).toEqual(Array.from(previewImage))
  })

  it('writes an empty jpeg section when no previewImage is supplied', async () => {
    const { deps } = makeDeps({ persist: true })
    await pushPattern(deps)
    const [blob] = (deps.provider.saveProgram as ReturnType<typeof vi.fn>).mock.calls[0]
    const decoded = decodePbp(blob as Uint8Array)
    expect(decoded!.jpeg.length).toBe(0)
  })

  it('reuses the bound id (overwrite in place) and does NOT re-save the binding when still on the device', async () => {
    const { deps, saved, pushRecords } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      loadPushRecords: async () => ({
        'ctrl-A': {
          'pat-1': {
            transforms: [],
            artifactHash: 'old-hash',
            stampedAt: '2020-01-01T00:00:00.000Z',
            name: 'Old name',
          },
          'pat-2': {
            transforms: ['hardware-brightness'],
            artifactHash: 'sibling-hash',
            stampedAt: '2025-01-01T00:00:00.000Z',
            name: 'Sibling',
          },
        },
        'ctrl-B': {
          'pat-9': {
            transforms: [],
            artifactHash: 'other-controller-hash',
            stampedAt: '2025-06-01T00:00:00.000Z',
            name: 'Other Controller',
          },
        },
      }),
      provider: makeProvider({
        listPrograms: vi.fn().mockResolvedValue([{ id: 'DEVPROG1', name: 'x' }]),
      }),
    })
    const result = await pushPattern(deps)
    expect(result).toEqual({ programId: 'DEVPROG1', created: false })
    expect(deps.provider.saveProgram).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'DEVPROG1',
    })
    expect(saved).toEqual([]) // no re-save when reusing
    expect(pushRecords).toHaveLength(1)
    expect(pushRecords[0]).toMatchObject({
      'ctrl-A': {
        'pat-1': {
          transforms: [],
          stampedAt: '2026-07-09T12:34:56.000Z',
          name: 'My Pattern',
        },
      },
    })
    expect(pushRecords[0]).not.toEqual(expect.objectContaining({
      'ctrl-A': expect.objectContaining({
        'pat-1': expect.objectContaining({ artifactHash: 'old-hash' }),
      }),
    }))
    expect(pushRecords[0]).toMatchObject({
      'ctrl-A': { 'pat-2': { artifactHash: 'sibling-hash' } },
      'ctrl-B': { 'pat-9': { artifactHash: 'other-controller-hash' } },
    })
  })

  it('silently re-creates when the bound id was deleted on the device', async () => {
    const { deps, saved } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: makeProvider({
        listPrograms: vi.fn().mockResolvedValue([{ id: 'SOMETHING_ELSE', name: 'y' }]),
      }),
      mintId: () => 'REMINTED000000000',
    })
    const result = await pushPattern(deps)
    expect(result).toEqual({ programId: 'REMINTED000000000', created: true })
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'REMINTED000000000' } }])
  })

  it('preserves sibling bindings when adding a new one', async () => {
    const { deps, saved } = makeDeps({
      persist: true,
      loadBindings: async () => ({ 'ctrl-B': { 'pat-9': 'D9' } }),
    })
    await pushPattern(deps)
    expect(saved[0]).toEqual({
      'ctrl-B': { 'pat-9': 'D9' },
      'ctrl-A': { 'pat-1': 'MINTED00000000000' },
    })
  })
})

describe('pushPattern — guards (both modes)', () => {
  it('throws and does not push when the bytecode header does not reconcile', async () => {
    const { deps, saved } = makeDeps({
      provider: makeProvider({ compile: vi.fn().mockResolvedValue(badBytecode()) }),
    })
    await expect(pushPattern(deps)).rejects.toThrow(/header sanity check/)
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(deps.provider.saveProgram).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('propagates a compile failure without pushing', async () => {
    const { deps } = makeDeps({
      provider: makeProvider({
        compile: vi.fn().mockRejectedValue(new Error('compile FAILED: syntax')),
      }),
    })
    await expect(pushPattern(deps)).rejects.toThrow(/compile FAILED/)
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
  })
})
