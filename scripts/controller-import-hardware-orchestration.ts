export const benchStepOrder = [2, 1, 3, 4, 5, 6, 7] as const
export type BenchRole = 'a' | 'b'
export function benchSnapshot(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}
export function benchRoleUrl(role: BenchRole, path: string): string {
  const base = role === 'a' ? 'http://localhost:5174/PXLBLZ-IDE/' : 'http://localhost:5179/PXLBLZ-IDE/'
  const url = new URL(path, base)
  if (url.origin !== new URL(base).origin) throw new Error('Cross-origin diagnostic request refused')
  return url.href
}
export function pinBenchRevision(pins: Partial<Record<BenchRole, string>>, role: BenchRole, commit: string): void {
  if (!/^[a-f0-9]{40}$/.test(commit) || (pins[role] && pins[role] !== commit)) throw new Error(`Served ${role.toUpperCase()} revision changed or invalid`)
  pins[role] = commit
}
export async function runSelectedBenchSteps(steps: readonly number[], actions: Record<number, () => Promise<void>>): Promise<void> {
  if (!steps.length || steps.length > benchStepOrder.length || steps.some((n, i) => n !== benchStepOrder[i])) throw new Error('Invalid diagnostic step prefix')
  for (const n of steps) { if (!actions[n]) throw new Error(`Missing action ${n}`); await actions[n]() }
}
export interface BenchOperatorRecord {
  expectedToken: string; responseKind: 'exact' | 'wrong' | 'eof'; utc: string
}
export async function awaitBenchOperator(prompt: () => Promise<string | null>, expectedToken: string, record: (value: BenchOperatorRecord) => void): Promise<BenchOperatorRecord> {
  const response = await prompt()
  const result: BenchOperatorRecord = { expectedToken, responseKind: response === null ? 'eof' : response === expectedToken ? 'exact' : 'wrong', utc: new Date().toISOString() }
  record(result)
  if (result.responseKind !== 'exact') throw new Error(`Operator ${result.responseKind}; exact token required; writes stopped`)
  return result
}
export function selectBenchDismiss(buttons: { label: string; secondary: boolean; type: string | null }[]): number {
  const secondary = buttons.flatMap((button, i) => button.secondary && button.type !== 'submit' ? [i] : [])
  const named = buttons.flatMap((button, i) => /^(Cancel|Done)$/.test(button.label) && button.type !== 'submit' ? [i] : [])
  const candidates = new Set([...secondary, ...named])
  if (candidates.size !== 1) throw new Error('Missing or ambiguous non-submit dialog dismiss control')
  return [...candidates][0]
}
/** The provider first clears reconnect intent; only the native event licenses handoff. */
export async function closeBenchConnection(ports: { disconnect(): Promise<void>; closeAndWait(): Promise<void>; flush(): Promise<void>; destroy?(): Promise<void> }): Promise<void> {
  await ports.disconnect()
  try { await ports.closeAndWait() } finally { await ports.flush() }
  await ports.destroy?.()
}
export interface BenchFinalizationContext {
  disconnectGate(): Promise<void>
  destroy(): Promise<void>
}
export interface BenchFinalizationFailure {
  stage: 'disconnect-gate' | 'context-close' | 'profile-remove'
  error: unknown
}
export async function finalizeBenchResources(
  contexts: readonly BenchFinalizationContext[],
  removeProfiles: readonly (() => void)[],
): Promise<BenchFinalizationFailure[]> {
  const failures: BenchFinalizationFailure[] = []
  for (const context of contexts) {
    try { await context.disconnectGate() } catch (error) { failures.push({ stage: 'disconnect-gate', error }) }
    try { await context.destroy() } catch (error) { failures.push({ stage: 'context-close', error }) }
  }
  for (const remove of removeProfiles) {
    try { remove() } catch (error) { failures.push({ stage: 'profile-remove', error }) }
  }
  return failures
}
export interface BenchPair { id: string; name: string }
export interface BenchCleanupInventory {
  startup: BenchPair & { source: 'operator-confirmed-startup' }
  controller: BenchPair[]; a: BenchPair[]; b: BenchPair[]
}
export type BenchInventories = Record<'controller' | BenchRole, BenchPair[]>
export interface BenchCleanupMetadata {
  bindings: Record<string, Record<string, string>>
  pushes: Record<string, Record<string, unknown>>
  receipts: { version: number; byPatternId: Record<string, unknown> }
  labels: Record<string, Record<string, string>>
}
const testName = (name: string) => /^Test pat(?:[ -]|$)/.test(name)
const samePair = (a: BenchPair, b: BenchPair) => a.id === b.id && a.name === b.name
function requirePair(pair: BenchPair, rows: BenchPair[]): void {
  if (rows.filter(p => p.id === pair.id).length !== 1 || rows.filter(p => p.name === pair.name).length !== 1 || !rows.some(p => samePair(pair, p))) throw new Error('Exact cleanup pair missing, mismatched or ambiguous')
}
function pairs(value: unknown): BenchPair[] {
  if (!Array.isArray(value)) throw new Error('Cleanup inventory arrays required')
  return value.map(item => {
    if (!item || typeof item !== 'object' || Object.keys(item).sort().join(',') !== 'id,name' || typeof item.id !== 'string' || !item.id || typeof item.name !== 'string' || !testName(item.name)) throw new Error('Cleanup requires exact Test pat pairs')
    return { id: item.id, name: item.name }
  })
}
export function validateBenchCleanupInventory(value: unknown, known: BenchInventories, fresh: BenchInventories, original: BenchPair[]): BenchCleanupInventory {
  if (!value || typeof value !== 'object' || Object.keys(value).sort().join(',') !== 'a,b,controller,startup') throw new Error('Explicit cleanup object required')
  const input = value as BenchCleanupInventory
  const startup = input.startup
  const unavailable = () => { throw new Error('Original saved startup Pattern is unavailable; cleanup held') }
  if (!startup || Object.keys(startup).sort().join(',') !== 'id,name,source' || startup.source !== 'operator-confirmed-startup' || typeof startup.id !== 'string' || !startup.id || typeof startup.name !== 'string' || !startup.name || testName(startup.name)) unavailable()
  try { requirePair(startup, original); requirePair(startup, fresh.controller) } catch { unavailable() }
  const result: BenchCleanupInventory = { startup: { ...startup }, controller: [], a: [], b: [] }
  for (const role of ['controller', 'a', 'b'] as const) {
    const prior = pairs(input[role]); const current = pairs(known[role])
    const merged = [...prior, ...current]
    if (new Set(merged.map(p => p.id)).size !== merged.length || new Set(merged.map(p => p.name)).size !== merged.length) throw new Error('Duplicate cleanup identity')
    for (const pair of merged) requirePair(pair, fresh[role])
    result[role] = merged
  }
  return result
}
/** Copies only: diagnostic maintenance never changes the product storage contract. */
export function pruneBenchMetadata(input: BenchCleanupMetadata, removed: BenchPair[], slots: BenchPair[], deviceId: string): BenchCleanupMetadata {
  const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  if (!object(input) || !object(input.receipts) || input.receipts.version !== 1 || !object(input.receipts.byPatternId)
    || ![input.bindings, input.pushes, input.labels].every(map => object(map) && Object.values(map).every(object))) throw new Error('Cleanup metadata is unreadable; cleanup held')
  const output = structuredClone(input)
  for (const pair of removed) {
    for (const bindings of Object.values(output.bindings)) delete bindings[pair.id]
    for (const pushes of Object.values(output.pushes)) delete pushes[pair.id]
    delete output.receipts.byPatternId[pair.id]
  }
  const labels = output.labels[deviceId]
  if (labels) for (const slot of slots) delete labels[slot.id]
  return output
}
export interface BenchCleanupPorts {
  read(): Promise<BenchInventories>
  activate(pair: BenchPair): Promise<void>
  active(): Promise<string | undefined>
  deleteController(pair: BenchPair): Promise<void>
  deleteAccount(role: BenchRole, pair: BenchPair): Promise<void>
  readMetadata(role: BenchRole): Promise<BenchCleanupMetadata>
  writeMetadata(role: BenchRole, metadata: BenchCleanupMetadata): Promise<void>
}
export interface BenchCleanupProof extends BenchOperatorRecord {
  runId: string; diagnosticRevision: string; servedRevisions: Partial<Record<BenchRole, string>>
}
export async function runBenchCleanup(input: {
  inventory: unknown; known: BenchInventories; original: BenchPair[]; completed: number[]; proof?: BenchCleanupProof
  runId: string; diagnosticRevision: string; servedRevisions: Partial<Record<BenchRole, string>>; deviceId: string
  ports: BenchCleanupPorts; record(value: BenchCleanupInventory): void
}): Promise<void> {
  const { ports, proof } = input
  if (input.completed.join(',') !== '2,1,3,4,5,6' || !proof || proof.responseKind !== 'exact' || proof.expectedToken !== `PROOF ${input.runId} S2 S3 POT LIT`
    || proof.runId !== input.runId || proof.diagnosticRevision !== input.diagnosticRevision || !proof.utc || !proof.servedRevisions.a || !proof.servedRevisions.b
    || benchSnapshot(proof.servedRevisions) !== benchSnapshot(input.servedRevisions)) throw new Error('Cleanup held: complete steps 1-6 and bound S2/S3/POT/LIT proof required')
  const before = await ports.read()
  const admitted = validateBenchCleanupInventory(input.inventory, input.known, before, input.original)
  const metadata = { a: await ports.readMetadata('a'), b: await ports.readMetadata('b') }
  const expectedMetadata = {
    a: pruneBenchMetadata(metadata.a, admitted.a, admitted.controller, input.deviceId),
    b: pruneBenchMetadata(metadata.b, admitted.b, admitted.controller, input.deviceId),
  }
  input.record(admitted)
  // Recheck startup immediately before the first mutation, without guessing from activeProgramId.
  requirePair(admitted.startup, (await ports.read()).controller)
  await ports.activate(admitted.startup)
  if (await ports.active() !== admitted.startup.id) throw new Error('Startup activation not confirmed; cleanup stopped')
  for (const pair of admitted.controller) {
    if (await ports.active() !== admitted.startup.id) throw new Error('Original saved startup stopped running; cleanup held')
    requirePair(pair, (await ports.read()).controller)
    await ports.deleteController(pair)
  }
  for (const role of ['a', 'b'] as const) {
    for (const pair of admitted[role]) {
      requirePair(pair, (await ports.read())[role])
      await ports.deleteAccount(role, pair)
    }
    // Preserve any intervening sibling metadata changes; remove only admitted refs.
    const fresh = await ports.readMetadata(role)
    const next = pruneBenchMetadata(fresh, admitted[role], admitted.controller, input.deviceId)
    const expected = expectedMetadata[role]
    if (benchSnapshot(next) !== benchSnapshot(expected)) throw new Error('Cleanup sibling metadata changed; writes held')
    await ports.writeMetadata(role, next)
    if (benchSnapshot(await ports.readMetadata(role)) !== benchSnapshot(next)) throw new Error('Cleanup metadata readback differs')
  }
  const after = await ports.read()
  for (const role of ['controller', 'a', 'b'] as const) {
    const expected = before[role].filter(pair => !admitted[role].some(p => p.id === pair.id))
    const sorted = (rows: BenchPair[]) => [...rows].sort((a, b) => a.id.localeCompare(b.id))
    if (benchSnapshot(sorted(after[role])) !== benchSnapshot(sorted(expected))) throw new Error(`Cleanup ${role} preservation/readback failed`)
  }
  if (await ports.active() !== admitted.startup.id) throw new Error('Original saved startup is no longer active')
}
