import { describe, expect, it, vi } from 'vitest'
import { awaitBenchOperator, closeBenchConnection, selectBenchDismiss, runSelectedBenchSteps, pinBenchRevision, benchRoleUrl, validateBenchCleanupInventory, runBenchCleanup, type BenchCleanupInventory, type BenchCleanupPorts } from './controller-import-hardware-orchestration'

const order = [2, 1, 3, 4, 5, 6, 7] as const
describe('real prefix dispatcher and operator boundaries', () => {
  it.each(['Cancel', 'Done', 'Close'])('selects the actual secondary non-submit %s button', label => {
    expect(selectBenchDismiss([{ label, secondary: true, type: 'button' }, { label: 'Import and save', secondary: false, type: 'button' }])).toBe(0)
  })
  it('admits exact Cancel/Done labels and rejects ambiguous, missing or submit dismiss controls', () => {
    expect(selectBenchDismiss([{ label: 'Done', secondary: false, type: 'button' }])).toBe(0)
    for (const rows of [[], [{ label: 'Close', secondary: false, type: 'button' }], [{ label: 'Cancel', secondary: true, type: 'submit' }], [{ label: 'Cancel', secondary: true, type: 'button' }, { label: 'Done', secondary: true, type: 'button' }]]) expect(() => selectBenchDismiss(rows)).toThrow()
  })
  it.each(order.map((_, i) => [order.slice(0, i + 1)]))('runs only prefix %j', async (steps) => {
    const trace: number[] = []; const actions = Object.fromEntries(order.map(n => [n, async () => { trace.push(n) }]))
    await runSelectedBenchSteps(steps, actions); expect(trace).toEqual(steps)
  })
  it.each(order)('stops at rejected step %s', async (failed) => {
    const trace: number[] = []; const actions = Object.fromEntries(order.map(n => [n, async () => { trace.push(n); if (n === failed) throw Error('stop') }]))
    await expect(runSelectedBenchSteps(order, actions)).rejects.toThrow('stop'); expect(trace).toEqual(order.slice(0, order.indexOf(failed) + 1))
  })
  it('blocks until exact token, records UTC and never treats READY as PROOF', async () => {
    let answer!: (s: string) => void
    const prompt = vi.fn(() => new Promise<string>(resolve => { answer = resolve })); const record = vi.fn(); const mutate = vi.fn()
    const pending = awaitBenchOperator(prompt, 'READY run', record).then(mutate)
    await Promise.resolve(); expect(mutate).not.toHaveBeenCalled()
    answer('READY run'); await pending; expect(record).toHaveBeenCalledWith(expect.objectContaining({ utc: expect.any(String), responseKind: 'exact', expectedToken: 'READY run' }))
    await expect(awaitBenchOperator(async () => 'READY run', 'PROOF run S2 S3 POT LIT', record)).rejects.toThrow()
    await expect(awaitBenchOperator(async () => null, 'READY run', record)).rejects.toThrow()
  })
  it('pins each role independently and keeps account URLs role-local', () => {
    const pins = {}; pinBenchRevision(pins, 'a', 'a'.repeat(40)); pinBenchRevision(pins, 'b', 'b'.repeat(40))
    expect(pins).toEqual({ a: 'a'.repeat(40), b: 'b'.repeat(40) })
    expect(() => pinBenchRevision(pins, 'a', 'b'.repeat(40))).toThrow()
    expect(benchRoleUrl('b', '/api/patterns')).toBe('http://localhost:5179/api/patterns')
    expect(benchRoleUrl('a', 'src/module.ts')).toBe('http://localhost:5174/PXLBLZ-IDE/src/module.ts')
    expect(() => benchRoleUrl('a', 'http://localhost:5179/api/me')).toThrow()
  })
  it('holds navigation/context destruction until disconnect and actual close, flushes evidence before destroy', async () => {
    const trace: string[] = []; let close!: () => void
    const pending = closeBenchConnection({ disconnect: async () => { trace.push('disconnect') }, closeAndWait: () => new Promise<void>(resolve => { close = resolve }), flush: async () => { trace.push('flush') }, destroy: async () => { trace.push('destroy') } })
    await Promise.resolve(); expect(trace).toEqual(['disconnect'])
    close(); await pending; expect(trace).toEqual(['disconnect', 'flush', 'destroy'])
    const destroy = vi.fn()
    await expect(closeBenchConnection({ disconnect: async () => {}, closeAndWait: async () => { throw Error('no actual close') }, flush: async () => {}, destroy })).rejects.toThrow('no actual close')
    expect(destroy).not.toHaveBeenCalled()
  })
  it('hands fake pages/Controller ports through the real full dispatcher without simultaneous owners', async () => {
    const trace: string[] = []; let owner: string | undefined
    const contexts = { a: { role: 'a' as const, page: { path: '' } }, b: { role: 'b' as const, page: { path: '' } } }
    const connect = async (role: 'a' | 'b') => { if (owner) throw Error('simultaneous hardware owner'); owner = role; trace.push(`connect:${role}`) }
    const close = async (role: 'a' | 'b') => closeBenchConnection({ disconnect: async () => { expect(owner).toBe(role); trace.push(`disconnect:${role}`) }, closeAndWait: async () => { trace.push(`actual1000:${role}`); owner = undefined }, flush: async () => { trace.push(`flush:${role}`) }, destroy: async () => { trace.push(`close:${role}`) } })
    const navigate = (role: 'a' | 'b') => { contexts[role].page.path = benchRoleUrl(contexts[role].role, 'studio/patterns'); trace.push(`navigate:${role}`) }
    await runSelectedBenchSteps(order, {
      2: async () => { navigate('b'); await connect('b'); await close('b') },
      1: async () => { navigate('a'); await connect('a'); await close('a') },
      3: async () => { navigate('b'); await connect('b') },
      4: async () => { await awaitBenchOperator(async () => 'READY run', 'READY run', () => {}); trace.push('import:single') },
      5: async () => { trace.push('import:bulk') },
      6: async () => { await close('b'); navigate('a'); await connect('a') },
      7: async () => { trace.push('account-api:b:unconnected'); await close('a') },
    })
    expect(trace).toEqual(['navigate:b', 'connect:b', 'disconnect:b', 'actual1000:b', 'flush:b', 'close:b', 'navigate:a', 'connect:a', 'disconnect:a', 'actual1000:a', 'flush:a', 'close:a', 'navigate:b', 'connect:b', 'import:single', 'import:bulk', 'disconnect:b', 'actual1000:b', 'flush:b', 'close:b', 'navigate:a', 'connect:a', 'account-api:b:unconnected', 'disconnect:a', 'actual1000:a', 'flush:a', 'close:a'])
    expect(owner).toBeUndefined()
  })
})

const pair = (id: string, name = `Test pat ${id}`) => ({ id, name })
function cleanupFixture() {
  const startup = { id: 'startup', name: 'Saved light', source: 'operator-confirmed-startup' as const }
  const inventory: BenchCleanupInventory = { startup, controller: [pair('old')], a: [], b: [] }
  const current = { controller: [startup, pair('old'), pair('new'), pair('sibling', 'Sibling')], a: [pair('a'), pair('a-sibling', 'Sibling')], b: [pair('b'), pair('b-sibling', 'Sibling')] }
  const known = { controller: [pair('new')], a: [pair('a')], b: [pair('b')] }
  const trace: string[] = []; let active = 'new'
  const metadata = () => ({ bindings: { device: { a: 'new', b: 'new', sibling: 'other' }, sibling: { a: 'sibling-slot' } }, pushes: { device: { a: { name: 'A' }, b: { name: 'B' }, sibling: { name: 'Sibling' } } }, receipts: { version: 1, byPatternId: { a: { patternId: 'a' }, b: { patternId: 'b' }, sibling: { patternId: 'sibling' } } }, labels: { device: { new: 'Test pat new', other: 'Other' } } })
  const metas = { a: metadata(), b: metadata() }
  const ports: BenchCleanupPorts = {
    read: async () => structuredClone(current), activate: async (p) => { trace.push(`activate:${p.id}`); active = p.id }, active: async () => active,
    deleteController: async p => { trace.push(`controller:${p.id}`); current.controller = current.controller.filter(x => x.id !== p.id) },
    deleteAccount: async (role, p) => { trace.push(`${role}:${p.id}`); current[role] = current[role].filter(x => x.id !== p.id) },
    readMetadata: async role => structuredClone(metas[role]), writeMetadata: async (role, value) => { trace.push(`metadata:${role}`); metas[role] = value as typeof metas.a },
  }
  const proof = { runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, utc: new Date().toISOString(), responseKind: 'exact' as const, expectedToken: 'PROOF run S2 S3 POT LIT' }
  return { inventory, known, current, trace, ports, proof, metas, original: structuredClone(current.controller), deviceId: 'device' }
}
describe('actual cleanup admission and sequence', () => {
  it('requires bound proof and all six completed steps before even activation', async () => {
    const f = cleanupFixture()
    for (const proof of [undefined, { ...f.proof, expectedToken: 'READY run' }, { ...f.proof, runId: 'other' }]) {
      await expect(runBenchCleanup({ ...f, completed: [2, 1, 3, 4, 5, 6], proof, runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() })).rejects.toThrow()
    }
    expect(f.trace).toEqual([])
  })
  it.each(['mismatch', 'duplicate', 'ambiguous', 'non-test', 'startup-missing', 'test-startup'])('refuses %s before mutations', (kind) => {
    const f = cleanupFixture()
    if (kind === 'mismatch') f.inventory.controller[0].name = 'Test pat wrong'
    if (kind === 'duplicate') f.inventory.controller.push(f.inventory.controller[0])
    if (kind === 'ambiguous') f.current.controller.push(pair('ambiguity', 'Test pat old'))
    if (kind === 'non-test') f.inventory.controller[0].name = 'Saved light'
    if (kind === 'startup-missing') f.original.splice(0, 1)
    if (kind === 'test-startup') f.inventory.startup.name = 'Test pat startup'
    expect(() => validateBenchCleanupInventory(f.inventory, f.known, f.current, f.original)).toThrow(); expect(f.trace).toEqual([])
  })
  it('activates and confirms exact startup first, deletes only admitted pairs, preserves siblings and reopens', async () => {
    const f = cleanupFixture(); const before = structuredClone(f.metas)
    await runBenchCleanup({ ...f, completed: [2, 1, 3, 4, 5, 6], runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() })
    expect(f.trace).toEqual(['activate:startup', 'controller:old', 'controller:new', 'a:a', 'metadata:a', 'b:b', 'metadata:b'])
    expect(f.current.controller).toEqual([f.inventory.startup, pair('sibling', 'Sibling')])
    expect(f.current.a).toEqual([pair('a-sibling', 'Sibling')]); expect(f.current.b).toEqual([pair('b-sibling', 'Sibling')])
    expect(f.metas.a).toEqual({ ...before.a, bindings: { device: { b: 'new', sibling: 'other' }, sibling: {} }, pushes: { device: { b: { name: 'B' }, sibling: { name: 'Sibling' } } }, receipts: { version: 1, byPatternId: { b: { patternId: 'b' }, sibling: { patternId: 'sibling' } } }, labels: { device: { other: 'Other' } } })
  })
  it('stops on wrong activation and on stale per-delete inventory without reconnecting', async () => {
    const f = cleanupFixture(); f.ports.active = async () => 'wrong'
    await expect(runBenchCleanup({ ...f, completed: [2, 1, 3, 4, 5, 6], runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() })).rejects.toThrow()
    expect(f.trace).toEqual(['activate:startup'])
  })
  it('merges empty prior arrays with known fixtures without mutating inputs', () => {
    const f = cleanupFixture(); f.inventory.controller = []
    const before = structuredClone(f.inventory)
    expect(validateBenchCleanupInventory(f.inventory, f.known, f.current, f.original)).toEqual({ ...before, ...f.known })
    expect(f.inventory).toEqual(before)
    expect(validateBenchCleanupInventory(before, { controller: [], a: [], b: [] }, f.current, f.original)).toEqual(before)
  })
  it('refuses missing confirmation or proof revisions and missing completed steps before mutations', async () => {
    const f = cleanupFixture()
    const base = { ...f, completed: [2, 1, 3, 4, 5, 6], runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() }
    for (const change of [{ completed: [2, 1, 3, 4, 5] }, { proof: { ...f.proof, diagnosticRevision: 'other' } }, { proof: { ...f.proof, servedRevisions: { a: 'other', b: 'b' } } }, { inventory: { ...f.inventory, startup: { id: 'startup', name: 'Saved light' } } }]) {
      await expect(runBenchCleanup({ ...base, ...change })).rejects.toThrow()
      expect(f.trace).toEqual([])
    }
  })
  it('rereads each deletion pair and stops immediately if a later pair has gone stale', async () => {
    const f = cleanupFixture(); const remove = f.ports.deleteController
    f.ports.deleteController = async p => { await remove(p); f.current.controller.find(x => x.id === 'new')!.name = 'Test pat renamed' }
    await expect(runBenchCleanup({ ...f, completed: [2, 1, 3, 4, 5, 6], runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() })).rejects.toThrow(/pair/)
    expect(f.trace).toEqual(['activate:startup', 'controller:old'])
  })
  it('stops on an account failure with no B deletion or retry and detects sibling metadata loss', async () => {
    const f = cleanupFixture()
    f.ports.deleteAccount = async () => { throw Error('account refused') }
    await expect(runBenchCleanup({ ...f, completed: [2, 1, 3, 4, 5, 6], runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() })).rejects.toThrow('account refused')
    expect(f.trace).toEqual(['activate:startup', 'controller:old', 'controller:new'])
    const g = cleanupFixture(); const remove = g.ports.deleteAccount
    g.ports.deleteAccount = async (role, p) => { await remove(role, p); delete g.metas[role].bindings.device.sibling }
    await expect(runBenchCleanup({ ...g, completed: [2, 1, 3, 4, 5, 6], runId: 'run', diagnosticRevision: 'd', servedRevisions: { a: 'a', b: 'b' }, record: vi.fn() })).rejects.toThrow(/sibling metadata/)
    expect(g.trace).toEqual(['activate:startup', 'controller:old', 'controller:new', 'a:a'])
  })
})
