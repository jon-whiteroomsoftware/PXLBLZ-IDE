import { vi } from 'vitest'
import { importControllerPattern, ControllerPatternImportExecutionError } from './controllerPatternImportExecution'
import { makeProgramId } from './bytecodePush'
import { stampArtifact, parsePxlblzBanner } from './artifactStamp'
import { bundleWithPasses } from './passEngine'
import { decodePbp, encodePbp } from './pbpEncode'
import { recoverSavedProgram } from './controllerSavedProgramRead'
import type { PatternRecord } from './personalContentRecords'
import { getControllerPushRecordsRevision, subscribeControllerPushRecordsRevision, type ControllerMetadataStorage } from './controllerMetadataStorage'
import { readControllerPatternImportLedger, type ControllerPatternImportLedger } from './controllerPatternImport'
import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecords } from './controllerPushRecord'
import { defaultControllerProfile } from '@/store/controllerProfileStore'
import { prepareControllerArtifactDelivery } from './controllerArtifactDelivery'
import { loadPattern } from './loadPattern'
import { createShim } from './shim'
import { createPlaneMap } from './maps'

const source = '// Author: Ada\nexport function render(i) { rgb(0.8, 0.4, 0.2) }'
const slot = makeProgramId(() => 0)
const input = { programId: slot, controllerDeviceId: 'physical-A' }
function goodBytecode(byteLength = 8) {
  const bytes = new Uint8Array(byteLength)
  new DataView(bytes.buffer).setUint32(0, byteLength - 8, true)
  return bytes
}
function blob(body = source, id = slot) {
  return encodePbp({ id, name: 'Device name', byteCode: goodBytecode(),
    sourceCode: stampArtifact(body, { kind: 'pattern', id: 'demo:origin', name: 'Original', stampedAt: '2026-01-01' }),
    previewImage: Uint8Array.of(255, 216, 255, 217) })
}
function hardwareBrightnessProfile(pin = 36) {
  const profile = defaultControllerProfile({ id: 'bench', now: 1 })
  profile.inputs = [{ id: 'brightness-pot', name: 'Pot', pin, signal: 'analog', smoothing: 1, fallback: 0.5, invert: false }]
  profile.globalTransforms = profile.globalTransforms.map((t) => t.type === 'hardware-brightness'
    ? { ...t, enabled: true, inputId: 'brightness-pot' } : t)
  return profile
}
function render(stored: string) {
  const bundled = bundleWithPasses(stored, {}, [])
  const shim = createShim({ mapPoints: createPlaneMap({ rows: 1, cols: 1 }).resolve(1),
    pixelCount: 1, dimensions: 1, getVirtualTime: () => 0 })
  const analogRead = vi.fn((pin: number) => pin === 36 ? 0.5 : 0.25)
  const pattern = loadPattern(bundled.code, bundled.metadata, { ...shim.builtins, analogRead })
  pattern.beforeRender(16)
  pattern.render(0)
  return { rgb: shim.capturedPixel(), pins: analogRead.mock.calls.map(([pin]) => pin) }
}
function makeDeps() {
  const programs = new Map([[slot, blob()], ['unrelated', blob('export function render(i) {}', 'unrelated')]])
  const accounts = new Map<string, PatternRecord>()
  let ledger: ControllerPatternImportLedger = readControllerPatternImportLedger(undefined)
  let bindings: BindingStore = { sibling: { seed: 'keep' } }
  let records: ControllerPushRecords = { sibling: { seed: { transforms: [], artifactHash: 'hash', stampedAt: 'time', name: 'Seed' } } }
  const faults = new Set<string>()
  const fail = (key: string) => { if (faults.delete(key)) throw new Error(key) }
  const storage = (): ControllerMetadataStorage => ({
    id: 'memory', getPatternImports: async () => { fail('ledger-get'); return structuredClone(ledger) },
    setPatternImports: async (next) => {
      const entries = Object.values(next.byPatternId)
      const stage = entries[entries.length - 1].stage
      fail(`ledger-${stage}-before`); ledger = structuredClone(next); fail(`ledger-${stage}-after`)
    },
    getControllerBindings: async () => structuredClone(bindings),
    setControllerBindings: async (next) => { fail('binding-before'); bindings = structuredClone(next); fail('binding-after') },
    getPushRecords: async () => structuredClone(records),
    setPushRecords: async (next) => { fail('record-before'); records = structuredClone(next); fail('record-after') },
    getProgramLabels: async () => ({}), setProgramLabels: async () => {},
  })
  let allocated = 0
  const provider = {
    compile: vi.fn(async () => { fail('compile'); return goodBytecode(12) }),
    getActiveProgramBytecodeSize: vi.fn(async (): Promise<number | null> => 8),
    pushBytecode: vi.fn(async (_bytes: Uint8Array, _opts: { id: string; name: string }) => { fail('activate') }),
    saveProgram: vi.fn(async (bytes: Uint8Array, opts: { id: string }) => {
      fail('save-before'); programs.set(opts.id, bytes.slice()); fail('save-after')
    }),
    readSavedProgram: vi.fn(async (id: string) => {
      fail('read'); const bytes = programs.get(id)
      if (!bytes) return null
      const recovered = recoverSavedProgram(id, bytes)
      return recovered.ok ? recovered.value : null
    }),
  }
  const personalContent = {
    listPatterns: vi.fn(async () => {
      fail('list')
      return [...accounts.values()].map((record) => Object.fromEntries(Object.entries(structuredClone(record)).reverse()) as PatternRecord)
    }),
    createPattern: vi.fn(async (record: PatternRecord) => {
      fail('create-before')
      if (accounts.has(record.id)) throw new Error('duplicate ID')
      accounts.set(record.id, structuredClone(record)); fail('create-after')
    }),
  }
  const deps = {
    provider, controllerId: 'address-A', metadataStorage: storage(), personalContent,
    assertCurrent: vi.fn(() => {}), resolveKnownSource: vi.fn(async () => undefined as { originId: string; source: string } | undefined),
    waitForProfileWrites: vi.fn(async () => {}),
    loadProfile: vi.fn(async () => ({ profile: hardwareBrightnessProfile(35), signature: 'profile-1' })),
    assertProfileCurrent: vi.fn(() => {}), libraries: {}, mapDim: 1 as const, firmwareVersion: '3.67',
    allocatePatternId: vi.fn(() => `personal-${++allocated}`), now: () => 123,
    onPatternVerified: vi.fn((_record: PatternRecord) => {}),
  }
  return { deps, programs, accounts, faults, storage, ledger: () => ledger, bindings: () => bindings, records: () => records }
}
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((res) => { resolve = res })
  return { promise, resolve }
}
function authoredFixture() {
  const f = makeDeps()
  f.programs.set(slot, blob(bundleWithPasses(source, {}, []).code))
  f.deps.resolveKnownSource.mockResolvedValue({ originId: 'demo:origin', source })
  return f
}

describe('selected-slot Controller Pattern import execution', () => {
  it('copies wrapped bytes exactly, reopens policy, preserves siblings and completes each slot once', async () => {
    const f = makeDeps()
    const origin = f.programs.get(slot)!.slice()
    const seed = f.programs.get('unrelated')!.slice()
    expect(await importControllerPattern(input, f.deps)).toEqual({ patternId: 'personal-1', programId: slot, complete: true })
    expect(f.accounts.get('personal-1')).toEqual({ id: 'personal-1', name: 'Original', src: decodePbp(origin)!.sourceCode,
      controls: {}, authors: ['Ada'], updatedAt: 123 })
    expect(f.programs.get(slot)).toEqual(origin)
    expect(f.programs.get('unrelated')).toEqual(seed)
    expect(f.bindings()).toEqual({ sibling: { seed: 'keep' }, 'address-A': { 'personal-1': slot } })
    expect(f.records()).toEqual({ sibling: { seed: { transforms: [], artifactHash: 'hash', stampedAt: 'time', name: 'Seed' } } })
    expect(f.deps.loadProfile).not.toHaveBeenCalled()
    expect(f.deps.waitForProfileWrites).not.toHaveBeenCalled()
    f.deps.metadataStorage = f.storage()
    f.accounts.clear(); f.programs.delete(slot)
    await importControllerPattern(input, f.deps)
    expect(f.deps.allocatePatternId).toHaveBeenCalledTimes(1)
    const slot2 = makeProgramId(() => 0.5)
    f.programs.set(slot2, origin)
    await importControllerPattern({ ...input, programId: slot2 }, f.deps)
    expect(Object.keys(f.ledger().byPatternId)).toEqual(['personal-1', 'personal-2'])
  })

  it('renders old wrapped behavior and independently matched authored behavior with the current profile', async () => {
    const wrapped = makeDeps()
    const before = getControllerPushRecordsRevision()
    const onRevision = vi.fn()
    const unsubscribe = subscribeControllerPushRecordsRevision(onRevision)
    try {
      const old = prepareControllerArtifactDelivery({ source, artifactId: 'demo:origin', profile: hardwareBrightnessProfile() })
      wrapped.programs.set(slot, blob(old.source))
      await importControllerPattern(input, wrapped.deps)
      expect(render(decodePbp(wrapped.programs.get(slot)!)!.sourceCode)).toEqual({ rgb: [0.4, 0.2, 0.1], pins: [36] })
      expect(getControllerPushRecordsRevision()).toBe(before)
      expect(onRevision).not.toHaveBeenCalled()
      const authored = makeDeps()
      authored.programs.set(slot, blob(bundleWithPasses(source, {}, []).code))
      authored.deps.resolveKnownSource.mockResolvedValue({ originId: 'demo:origin', source })
      await importControllerPattern(input, authored.deps)
      const decoded = decodePbp(authored.programs.get(slot)!)!
      expect(authored.accounts.get('personal-1')!.src).toBe(source)
      expect(parsePxlblzBanner(decoded.sourceCode)).toMatchObject({ id: 'personal-1', transforms: ['hardware-brightness'] })
      expect(render(decoded.sourceCode)).toEqual({ rgb: [0.2, 0.1, 0.05], pins: [35] })
      expect(authored.deps.provider.pushBytecode).toHaveBeenLastCalledWith(decoded.byteCode, { id: slot, name: 'Original' })
      expect(authored.records()['address-A']['personal-1']).toMatchObject({ profileSignature: 'profile-1' })
      expect(getControllerPushRecordsRevision()).toBe(before + 1)
      expect(onRevision).toHaveBeenCalledTimes(1)
    } finally { unsubscribe() }
  })

  it.each(['create-before', 'create-after', 'save-before', 'save-after', 'activate', 'binding-before', 'binding-after',
    'ledger-planned-after', 'ledger-account-saved-after', 'ledger-write-pending-after', 'ledger-saved-verified-after',
    'ledger-activated-after', 'ledger-metadata-pending-after', 'ledger-complete-before', 'ledger-complete-after'])(
  'recovers %s without replacing account or saved identities', async (fault) => {
    const f = makeDeps(); f.faults.add(fault)
    const first = importControllerPattern(input, f.deps)
    if (fault === 'create-after') await first
    else await expect(first).rejects.toBeInstanceOf(ControllerPatternImportExecutionError)
    f.deps.metadataStorage = f.storage()
    await expect(importControllerPattern(input, f.deps)).resolves.toMatchObject({ patternId: 'personal-1', complete: true })
    expect(f.deps.allocatePatternId).toHaveBeenCalledTimes(1)
    expect(f.accounts.size).toBe(1)
    expect(f.ledger().byPatternId['personal-1'].stage).toBe('complete')
  })

  it('resends ambiguous fallback writes but only activates a durable verified copy', async () => {
    const f = makeDeps(); f.faults.add('save-after')
    await expect(importControllerPattern(input, f.deps)).rejects.toMatchObject({ stage: 'write-pending', patternId: 'personal-1', programId: slot })
    f.faults.add('activate')
    await expect(importControllerPattern(input, f.deps)).rejects.toMatchObject({ stage: 'saved-verified' })
    const writes = f.deps.provider.saveProgram.mock.calls.length
    await importControllerPattern(input, f.deps)
    expect(f.deps.provider.saveProgram).toHaveBeenCalledTimes(writes)
    expect(writes).toBe(2)
  })

  it.each(['account', 'slot'])('retains divergent %s on incomplete retry', async (kind) => {
    const f = makeDeps(); f.faults.add('save-before')
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow()
    if (kind === 'account') f.accounts.get('personal-1')!.name = 'Edited'
    else f.programs.set(slot, blob('export function render(i) { rgb(1,0,0) }'))
    const before = structuredClone([...f.accounts])
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow(kind === 'account'
      ? 'The imported account Pattern changed.' : 'Saved Pattern changed on the Controller.')
    expect([...f.accounts]).toEqual(before)
    expect(f.deps.provider.saveProgram).toHaveBeenCalledTimes(1)
  })

  it('stops after an account guard invalidates during preparation', async () => {
    const f = makeDeps()
    f.deps.resolveKnownSource.mockImplementation(async () => {
      f.deps.assertCurrent.mockImplementation(() => { throw new Error('changed') })
      return undefined
    })
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow('Controller session or account changed.')
    expect(f.deps.personalContent.createPattern).not.toHaveBeenCalled()
    expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
  })

  it.each([
    ['show', stampArtifact(source, { kind: 'show', id: 'show', name: 'Show' }), 'This saved artifact is a Show, not a Pattern.'],
    ['empty', '', 'This saved program has no source code to import.'],
    ['syntax', 'export function {', 'Saved Pattern source cannot compile. Nothing was sent.'],
  ])('refuses %s before account publication or device mutation', async (_name, sourceCode, message) => {
    const f = makeDeps()
    f.programs.set(slot, encodePbp({ id: slot, name: '', sourceCode, byteCode: goodBytecode() }))
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow(message)
    expect(f.accounts.size).toBe(0)
    expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
    expect(f.deps.provider.pushBytecode).not.toHaveBeenCalled()
  })

  it.each(['missing', 'lossless', 'header', 'unreadable'])('refuses %s saved data', async (kind) => {
    const f = makeDeps()
    if (kind === 'missing') f.programs.delete(slot)
    if (kind === 'unreadable') f.programs.set(slot, Uint8Array.of(1))
    if (kind === 'header') f.programs.set(slot, encodePbp({ id: slot, name: '', sourceCode: source, byteCode: Uint8Array.of(1) }))
    if (kind === 'lossless') f.deps.provider.readSavedProgram.mockResolvedValue({
      programId: slot, deviceName: '', sourceCode: source, stamp: null,
    })
    await expect(importControllerPattern(input, f.deps)).rejects.toMatchObject({ stage: 'assessment', patternId: null, programId: slot })
    expect(f.deps.personalContent.createPattern).not.toHaveBeenCalled()
    expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
  })

  it.each(['compile', 'header', 'firmware'])('prepares authored %s rejection before publishing an intent', async (kind) => {
    const f = authoredFixture()
    if (kind === 'compile') f.faults.add('compile')
    if (kind === 'header') f.deps.provider.compile.mockResolvedValue(Uint8Array.of(1))
    if (kind === 'firmware') {
      const src2d = 'export function render2D(i,x,y) { rgb(x,y,0) }'
      f.programs.set(slot, blob(bundleWithPasses(src2d, {}, []).code))
      f.deps.resolveKnownSource.mockResolvedValue({ originId: 'demo:origin', source: src2d })
      f.deps.firmwareVersion = '2.0'
    }
    await expect(importControllerPattern(input, f.deps)).rejects.toMatchObject({ stage: 'preparation', patternId: 'personal-1' })
    expect(f.ledger().byPatternId).toEqual({})
    expect(f.accounts.size).toBe(0)
    expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
  })

  it('reopens a rejected POST and retains planned state when that read fails', async () => {
    const f = makeDeps()
    f.deps.personalContent.createPattern.mockImplementationOnce(async (record) => {
      f.accounts.set(record.id, structuredClone(record)); f.faults.add('list'); throw new Error('lost POST response')
    })
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow('Account copy could not be confirmed.')
    expect(f.ledger().byPatternId['personal-1'].stage).toBe('planned')
    expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
    await importControllerPattern(input, f.deps)
    expect(f.deps.personalContent.createPattern).toHaveBeenCalledTimes(1)
  })

  it.each(['read-error', 'mismatch'])('does not verify a %s save readback', async (kind) => {
    const f = makeDeps()
    const save = f.deps.provider.saveProgram.getMockImplementation()!
    f.deps.provider.saveProgram.mockImplementationOnce(async (bytes, opts) => {
      await save(bytes, opts)
      if (kind === 'read-error') f.faults.add('read')
      else f.programs.set(slot, blob('export function render(i) { rgb(1,0,0) }'))
    })
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow('Controller write could not be confirmed.')
    expect(f.ledger().byPatternId['personal-1'].stage).toBe('write-pending')
    expect(f.deps.provider.pushBytecode).not.toHaveBeenCalled()
    if (kind === 'read-error') await importControllerPattern(input, f.deps)
    else await expect(importControllerPattern(input, f.deps)).rejects.toThrow('Saved Pattern changed on the Controller.')
  })

  it.each(['record-before', 'record-after', 'ledger-saved-verified-before'])(
  'adopts distinct authored delivery after %s and finishes without recompilation/resave', async (fault) => {
    const f = authoredFixture(); f.faults.add(fault)
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow()
    const saves = f.deps.provider.saveProgram.mock.calls.length
    const compiles = f.deps.provider.compile.mock.calls.length
    await importControllerPattern(input, f.deps)
    expect(f.deps.provider.saveProgram).toHaveBeenCalledTimes(saves)
    expect(f.deps.provider.compile).toHaveBeenCalledTimes(compiles)
    expect(f.accounts.size).toBe(1)
  })

  it('reprepares a changed authored profile using the old verified delivery as baseline', async () => {
    const f = authoredFixture(); f.faults.add('binding-before')
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow()
    const previous = structuredClone(f.ledger().byPatternId['personal-1'])
    f.deps.loadProfile.mockResolvedValue({ profile: hardwareBrightnessProfile(34), signature: 'profile-2' })
    await importControllerPattern(input, f.deps)
    const next = f.ledger().byPatternId['personal-1']
    expect(next).toMatchObject({ ...previous, stage: 'complete', profileSignature: 'profile-2',
      writeBaselineDigest: previous.deliveryDigest, deliveryDigest: next.deliveryDigest })
    expect(next.deliveryDigest).not.toBe(previous.deliveryDigest)
    expect(f.accounts.size).toBe(1)
    expect(f.deps.allocatePatternId).toHaveBeenCalledTimes(1)
  })

  it.each(['compile', 'readback', 'queue', 'profile'])('guards deferred %s work', async (point) => {
    const f = authoredFixture()
    const entered = deferred<void>(); const release = deferred<void>()
    let changed = false
    f.deps.assertCurrent.mockImplementation(() => { if (changed) throw new Error('account/provider/epoch changed') })
    if (point === 'compile' || point === 'profile') {
      f.deps.provider.compile.mockImplementationOnce(async () => { entered.resolve(); await release.promise; return goodBytecode() })
    } else if (point === 'readback') {
      const read = f.deps.provider.readSavedProgram.getMockImplementation()!
      f.deps.provider.readSavedProgram.mockImplementation(async (id) => {
        const saved = await read(id)
        if (f.deps.provider.saveProgram.mock.calls.length > 0) { entered.resolve(); await release.promise }
        return saved
      })
    }
    const queue = point === 'queue' ? async <T>(_id: string, action: () => Promise<T>) => {
      entered.resolve(); await release.promise; return action()
    } : undefined
    const result = importControllerPattern(input, { ...f.deps, queue })
    await entered.promise
    if (point === 'profile') f.deps.assertProfileCurrent.mockImplementation(() => { throw new Error('profile changed') })
    else changed = true
    release.resolve()
    await expect(result).rejects.toThrow('Controller session or account changed.')
    expect(f.deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(Object.values(f.ledger().byPatternId).some((r) => r.stage === 'complete')).toBe(false)
    if (point !== 'readback') expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
  })

  it('preserves seed and concurrent Controller intents through a persisted rejected ledger PUT', async () => {
    const a = makeDeps(); await importControllerPattern(input, a.deps)
    const seed = structuredClone(a.ledger().byPatternId['personal-1'])
    const slot2 = makeProgramId(() => 0.5); a.programs.set(slot2, blob())
    const b = makeDeps()
    b.deps.personalContent = a.deps.personalContent
    b.deps.metadataStorage = a.storage()
    b.deps.allocatePatternId = a.deps.allocatePatternId
    b.deps.controllerId = 'address-B'
    a.faults.add('ledger-account-saved-after')
    const inputs = [{ ...input, programId: slot2 }, { ...input, controllerDeviceId: 'physical-B' }]
    const outcomes = await Promise.allSettled([importControllerPattern(inputs[0], a.deps), importControllerPattern(inputs[1], b.deps)])
    expect(outcomes.filter((r) => r.status === 'rejected')).toHaveLength(1)
    await Promise.all([importControllerPattern(inputs[0], a.deps), importControllerPattern(inputs[1], b.deps)])
    expect(a.ledger().byPatternId['personal-1']).toEqual(seed)
    expect(Object.values(a.ledger().byPatternId).map((r) => r.stage)).toEqual(['complete', 'complete', 'complete'])
    expect(a.bindings()).toMatchObject({ sibling: { seed: 'keep' }, 'address-A': { 'personal-1': slot, 'personal-2': slot2 },
      'address-B': { 'personal-3': slot } })
    expect(a.accounts.size).toBe(3)
  })

  it('supports success/failure/success and a retry of only the failed item', async () => {
    const f = makeDeps()
    const slots = [slot, makeProgramId(() => 0.3), makeProgramId(() => 0.7)]
    slots.forEach((id) => f.programs.set(id, blob()))
    await importControllerPattern({ ...input, programId: slots[0] }, f.deps)
    f.faults.add('save-before')
    await expect(importControllerPattern({ ...input, programId: slots[1] }, f.deps)).rejects.toThrow()
    await importControllerPattern({ ...input, programId: slots[2] }, f.deps)
    await importControllerPattern({ ...input, programId: slots[1] }, f.deps)
    expect(Object.values(f.ledger().byPatternId).map((r) => [r.patternId, r.programId, r.stage]))
      .toEqual(slots.map((id, i) => [`personal-${i + 1}`, id, 'complete']))
    expect(f.deps.allocatePatternId).toHaveBeenCalledTimes(3)
  })

  it.each(['invalid-canonical', 'transformed', 'damaged'])('keeps %s source in stored-artifact mode', async (kind) => {
    const f = authoredFixture()
    if (kind === 'invalid-canonical') f.deps.resolveKnownSource.mockResolvedValue({ originId: 'demo:origin', source: 'export function {' })
    if (kind === 'transformed') f.programs.set(slot, encodePbp({ id: slot, name: 'Old', byteCode: goodBytecode(),
      sourceCode: stampArtifact(bundleWithPasses(source, {}, []).code, { kind: 'pattern', id: 'demo:origin', name: 'Old', transforms: ['power-cap'] }) }))
    if (kind === 'damaged') {
      const old = decodePbp(f.programs.get(slot)!)!
      f.programs.set(slot, encodePbp({ id: slot, name: old.name, sourceCode: old.sourceCode + '\n// changed', byteCode: old.byteCode }))
    }
    const before = f.programs.get(slot)!.slice()
    await importControllerPattern(input, f.deps)
    expect(f.programs.get(slot)).toEqual(before)
    expect(f.ledger().byPatternId['personal-1'].sourceMode).toBe('stored-artifact')
    expect(f.deps.loadProfile).not.toHaveBeenCalled()
  })

  it('refuses already-linked slots and divergent destination bindings before another save', async () => {
    const f = makeDeps(); f.faults.add('activate')
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow()
    const metadata = f.deps.metadataStorage
    await metadata.setControllerBindings({ 'address-A': { 'personal-1': 'another-slot' } })
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow('The import binding points to another saved program.')
    expect(f.deps.provider.saveProgram).toHaveBeenCalledTimes(1)
    const other = makeDeps()
    await other.deps.metadataStorage.setControllerBindings({ 'address-A': { existing: slot } })
    await expect(importControllerPattern(input, other.deps)).rejects.toThrow('This saved program is already linked to an account Pattern.')
    expect(other.deps.personalContent.createPattern).not.toHaveBeenCalled()
  })

  it('refuses planned reconstruction when intervening names change the original account record', async () => {
    const f = makeDeps(); f.faults.add('create-before')
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow()
    f.accounts.set('peer', { id: 'peer', name: 'Original', src: source, controls: {}, updatedAt: 9 })
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow('The imported account Pattern changed.')
    expect(f.deps.personalContent.createPattern).toHaveBeenCalledTimes(1)
    expect(f.deps.provider.saveProgram).not.toHaveBeenCalled()
  })

  it.each([false, true])('classifies unsafe drain failure before save/activation (verified=%s)', async (verified) => {
    const f = makeDeps()
    if (verified) {
      f.faults.add('activate'); await expect(importControllerPattern(input, f.deps)).rejects.toThrow()
    }
    f.deps.provider.getActiveProgramBytecodeSize.mockResolvedValue(null)
    f.faults.add('activate')
    await expect(importControllerPattern(input, f.deps)).rejects.toThrow(verified
      ? 'Controller copy verified; activation did not complete.' : 'Account copy saved; Controller write could not be confirmed.')
    expect(f.deps.provider.saveProgram).toHaveBeenCalledTimes(verified ? 1 : 0)
  })
})
