import { describe, it, expect, vi } from 'vitest'
import { pushPattern, type PushPatternDeps } from './pushPattern'
import type { BindingStore } from './controllerBinding'

// A reconciling bytecode blob: header declares 0 opcode + 0 export bytes, len 8.
function goodBytecode(): Uint8Array {
  return new Uint8Array(8)
}

// A bad blob whose header does not reconcile with its length.
function badBytecode(): Uint8Array {
  const b = new Uint8Array(8)
  new DataView(b.buffer).setUint32(0, 99, true) // claims 99 opcode bytes
  return b
}

function makeDeps(overrides: Partial<PushPatternDeps> = {}): {
  deps: PushPatternDeps
  saved: BindingStore[]
} {
  const saved: BindingStore[] = []
  const deps: PushPatternDeps = {
    provider: {
      compile: vi.fn().mockResolvedValue(goodBytecode()),
      listPrograms: vi.fn().mockResolvedValue([]),
      pushBytecode: vi.fn().mockResolvedValue(undefined),
    },
    controllerId: 'ctrl-A',
    patternId: 'pat-1',
    source: 'export function render(i){}',
    name: 'My Pattern',
    loadBindings: async () => ({}),
    saveBindings: async (b) => {
      saved.push(b)
    },
    mintId: () => 'MINTED00000000000',
    ...overrides,
  }
  return { deps, saved }
}

describe('pushPattern', () => {
  it('mints + binds + pushes on the first push for a pattern', async () => {
    const { deps, saved } = makeDeps()
    const result = await pushPattern(deps)

    expect(result).toEqual({ programId: 'MINTED00000000000', created: true })
    expect(deps.provider.pushBytecode).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'MINTED00000000000',
      name: 'My Pattern',
    })
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'MINTED00000000000' } }])
  })

  it('reuses the bound id (overwrite in place) and does NOT re-save when it is still on the device', async () => {
    const { deps, saved } = makeDeps({
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: {
        compile: vi.fn().mockResolvedValue(goodBytecode()),
        listPrograms: vi.fn().mockResolvedValue([{ id: 'DEVPROG1', name: 'x' }]),
        pushBytecode: vi.fn().mockResolvedValue(undefined),
      },
    })
    const result = await pushPattern(deps)
    expect(result).toEqual({ programId: 'DEVPROG1', created: false })
    expect(deps.provider.pushBytecode).toHaveBeenCalledWith(expect.any(Uint8Array), {
      id: 'DEVPROG1',
      name: 'My Pattern',
    })
    expect(saved).toEqual([]) // no re-save when reusing
  })

  it('silently re-creates when the bound id was deleted on the device', async () => {
    const { deps, saved } = makeDeps({
      loadBindings: async () => ({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } }),
      provider: {
        compile: vi.fn().mockResolvedValue(goodBytecode()),
        listPrograms: vi.fn().mockResolvedValue([{ id: 'SOMETHING_ELSE', name: 'y' }]),
        pushBytecode: vi.fn().mockResolvedValue(undefined),
      },
      mintId: () => 'REMINTED000000000',
    })
    const result = await pushPattern(deps)
    expect(result).toEqual({ programId: 'REMINTED000000000', created: true })
    expect(saved).toEqual([{ 'ctrl-A': { 'pat-1': 'REMINTED000000000' } }])
  })

  it('preserves sibling bindings when adding a new one', async () => {
    const { deps, saved } = makeDeps({
      loadBindings: async () => ({ 'ctrl-B': { 'pat-9': 'D9' } }),
    })
    await pushPattern(deps)
    expect(saved[0]).toEqual({
      'ctrl-B': { 'pat-9': 'D9' },
      'ctrl-A': { 'pat-1': 'MINTED00000000000' },
    })
  })

  it('throws and does not push when the bytecode header does not reconcile', async () => {
    const { deps, saved } = makeDeps({
      provider: {
        compile: vi.fn().mockResolvedValue(badBytecode()),
        listPrograms: vi.fn().mockResolvedValue([]),
        pushBytecode: vi.fn().mockResolvedValue(undefined),
      },
    })
    await expect(pushPattern(deps)).rejects.toThrow(/header sanity check/)
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
    expect(saved).toEqual([])
  })

  it('propagates a compile failure without pushing', async () => {
    const { deps } = makeDeps({
      provider: {
        compile: vi.fn().mockRejectedValue(new Error('compile FAILED: syntax')),
        listPrograms: vi.fn().mockResolvedValue([]),
        pushBytecode: vi.fn().mockResolvedValue(undefined),
      },
    })
    await expect(pushPattern(deps)).rejects.toThrow(/compile FAILED/)
    expect(deps.provider.pushBytecode).not.toHaveBeenCalled()
  })
})
