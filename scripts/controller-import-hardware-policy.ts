import { isPxlblzProgramId } from '../src/engine/bytecodePush'
import { decodePbp, PBP_HEADER_SIZE, PBP_VERSION } from '../src/engine/pbpEncode'
import { parsePxlblzBanner } from '../src/engine/artifactStamp'
import type { ControllerProfile } from '../src/engine/controllerProfile'

export function requireBenchSavedSlot(result: { ok: boolean; message?: string } | null, slot: string | undefined): string {
  if (result === null) throw new Error('Studio Save completed without a result; no automatic retry')
  if (!result.ok) throw new Error(`Studio Save failed: ${result.message || 'No failure message was returned'}; no automatic retry`)
  if (!slot) throw new Error('Save succeeded without admitting the pending fixture')
  return slot
}

export class BenchWorkerObservations<T> {
  readonly active = new Set<T>()
  readonly counts = new Map<T, number>()
  readonly closing = new Set<T>()
  private stopped = false
  get readOnly(): boolean { return this.stopped }

  add(worker: T): void { this.active.add(worker) }
  beginClose(workers: Iterable<T>): void {
    for (const worker of workers) if (this.active.has(worker)) this.closing.add(worker)
  }
  closed(worker: T): void {
    this.failed(worker)
    this.active.delete(worker)
    this.counts.delete(worker)
    this.closing.delete(worker)
  }
  failed(worker: T): void {
    if (this.active.has(worker) && !this.closing.has(worker)) this.stopped = true
  }
}

export function assertBenchProfile(profile: ControllerProfile, role: 'a' | 'b'): void {
  const enabled = profile.globalTransforms.filter((transform) => transform.enabled)
  const input = profile.inputs[0]
  const transform = enabled[0]
  const common = profile.board.kind === 'pixelblaze-v3-standard' && profile.keepPatternsUpToDate === false
    && profile.patternBindings.length === 0 && profile.electricalProfile === undefined
  const effective = role === 'a' ? profile.inputs.length === 0 && enabled.length === 0
    : profile.inputs.length === 1 && input.pin === 35 && input.signal === 'analog'
      && Number.isFinite(input.smoothing) && input.smoothing >= 0 && input.smoothing <= 1
      && input.fallback === 0.5 && input.invert === false && enabled.length === 1
      && transform.type === 'hardware-brightness' && transform.mode === 'multiply-output' && transform.inputId === input.id
  if (!common || !effective) throw new Error('Existing synthetic profile differs; preserved without overwrite')
}

export interface BenchOptions {
  help: boolean
  device: string
  url: string
  sessionA: string
  sessionB: string
  out: string
  headless: boolean
  runId: string
}
export function parseBenchArgs(argv: string[]): BenchOptions {
  if (argv.length === 1 && argv[0] === '--help') return { help: true } as BenchOptions
  const values = new Map<string, string>()
  const flags = new Set<string>()
  const valued = ['--device', '--url', '--session-a', '--session-b', '--out', '--run-id']
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i]
    if (values.has(key) || flags.has(key)) throw new Error(`Duplicate argument ${key}`)
    if (['--run', '--headless'].includes(key)) flags.add(key)
    else if (valued.includes(key) && argv[i + 1] && !argv[i + 1].startsWith('--')) values.set(key, argv[++i])
    else throw new Error(`Unknown or incomplete argument ${key}`)
  }
  if (!flags.has('--run')) throw new Error('Explicit --run is required; nothing was started')
  for (const key of valued.filter((key) => key !== '--run-id')) if (!values.get(key)) throw new Error(`Required ${key}`)
  if (values.get('--device') !== '192.168.8.196') throw new Error('Only Controller 192.168.8.196 is admitted')
  if (values.get('--url') !== 'http://localhost:5174/PXLBLZ-IDE/') throw new Error('Only http://localhost:5174/PXLBLZ-IDE/ is admitted')
  const runId = values.get('--run-id') ?? new Date().toISOString().replace(/[^0-9A-Za-z]/g, '')
  if (!/^[A-Za-z0-9-]+$/.test(runId)) throw new Error('run-id must be ASCII alphanumeric/hyphen')
  return { help: false, device: values.get('--device')!, url: values.get('--url')!, sessionA: values.get('--session-a')!, sessionB: values.get('--session-b')!, out: values.get('--out')!, headless: flags.has('--headless'), runId }
}

export interface BenchSession {
  user: { userId: string }
  cookie: { name: string; value: string; domain: 'localhost'; path: '/'; httpOnly?: boolean; secure?: boolean; sameSite?: 'Lax' | 'Strict' | 'None'; expires?: number }
}
function session(value: unknown): BenchSession {
  if (!value || typeof value !== 'object') throw new Error('Invalid session object')
  const s = value as Partial<BenchSession>
  if (!s.user || typeof s.user.userId !== 'string' || !/^github:(local-dev|local-agent-\d+)$/.test(s.user.userId)) throw new Error('Only supported local synthetic accounts are admitted')
  const c = s.cookie
  if (!c || typeof c.name !== 'string' || !c.name || typeof c.value !== 'string' || !c.value || c.domain !== 'localhost' || c.path !== '/' || c.secure === true) throw new Error('A localhost session cookie is required')
  return { user: { userId: s.user.userId }, cookie: { name: c.name, value: c.value, domain: 'localhost', path: '/', httpOnly: true, secure: false, sameSite: 'Lax', expires: -1 } }
}
export function validateBenchSessions(a: unknown, b: unknown): { a: BenchSession; b: BenchSession } {
  const result = { a: session(a), b: session(b) }
  if (result.a.user.userId === result.b.user.userId) throw new Error('Two distinct synthetic users are required')
  return result
}

export type DeniedBenchMethod = 'setVars' | 'setRendererPaused' | 'setControls' | 'setBrightness' | 'setName' | 'setPixelCount' | 'setPixelMap'
export type BenchMutation =
  | { method: 'saveProgram'; id: string; pbp: Uint8Array }
  | { method: 'pushBytecode'; id: string; name?: string; digest: string }
  | { method: 'setActiveProgram'; id: string; save: boolean }
  | { method: 'deleteProgram'; id: string }
  | { method: DeniedBenchMethod }
export interface BenchAdmissionState {
  target: string
  scope: 'idle' | 'save' | 'import' | 'pattern'
  allowedNames: string[]
  pendingSaveName: string | null
  pendingImport: { id: string; name: string } | null
  pendingPattern?: { id: string; name: string } | null
  savedSlots: Record<string, string>
  admittedSlots: Record<string, string>
  priorActiveIds: string[]
  usedDrainIds: string[]
  drainDigest: string | null
  allowNewSaveSlot: boolean
}
/** Reads observe production row order; they never grant arbitrary write authority. */
export function observeBenchImportRead(state: BenchAdmissionState, capturedTargets: readonly { id: string; name: string }[], programId: string): boolean {
  if (state.scope !== 'import') return false
  const next = capturedTargets.findIndex((target) => target.id === programId && state.savedSlots[target.id] === target.name)
  const current = state.pendingImport ? capturedTargets.findIndex((target) => target.id === state.pendingImport!.id && target.name === state.pendingImport!.name) : -1
  if (next < 0 || next <= current || (state.pendingImport && current < 0)) return false
  state.pendingImport = { ...capturedTargets[next] }
  return true
}
/** Admission is retained before delegation; it never asserts flash persistence. */
export function assertBenchMutation(request: BenchMutation, state: BenchAdmissionState): void {
  const refuse = (why: string): never => { throw new Error(`Hardware admission refused: ${why}`) }
  if (state.target !== '192.168.8.196') refuse('wrong target')
  if (state.scope === 'idle') refuse('idle scope')
  if (state.scope === 'pattern') {
    const pair = state.pendingPattern
    if (!pair || state.savedSlots[pair.id] !== pair.name) refuse('Pattern pair is absent from captured slots')
    if (!('id' in request) || request.id !== pair!.id) refuse('Pattern substituted the captured slot')
    if (request.method === 'setActiveProgram') {
      if (request.save !== false) refuse('Pattern activation must be transient')
      return
    }
    if (request.method === 'deleteProgram') return
  }
  if (request.method !== 'saveProgram' && request.method !== 'pushBytecode') refuse(request.method)
  if (request.method !== 'saveProgram' && request.method !== 'pushBytecode') return
  if (state.scope !== 'pattern' && !isPxlblzProgramId(request.id)) refuse('invalid Controller program id')
  const expectedName = state.scope === 'pattern' ? state.pendingPattern?.name : state.scope === 'save' ? state.pendingSaveName : state.pendingImport?.name
  if (!expectedName || (state.scope !== 'pattern' && !state.allowedNames.includes(expectedName))) refuse('no pending run fixture')
  if (state.scope === 'import' && (!state.pendingImport || state.savedSlots[state.pendingImport.id] !== expectedName)) refuse('Import selected pair is absent from captured slots')
  if (request.method === 'pushBytecode' && !request.name) {
    if (state.scope === 'pattern') refuse('Pattern scope has no drain')
    if (!state.drainDigest || request.digest !== state.drainDigest) refuse('drain bytecode mismatch')
    if (Object.prototype.hasOwnProperty.call(state.savedSlots, request.id) || Object.prototype.hasOwnProperty.call(state.admittedSlots, request.id)
      || state.priorActiveIds.includes(request.id) || state.usedDrainIds.includes(request.id)) refuse('drain id was already used')
    state.usedDrainIds.push(request.id)
    return
  }
  if (state.scope === 'import' && request.id !== state.pendingImport?.id) refuse('Import substituted the selected slot')
  const existing = state.savedSlots[request.id]
  if (existing !== undefined && existing !== expectedName) refuse('unrelated saved slot')
  if (request.method === 'pushBytecode') {
    if (request.name !== expectedName || state.admittedSlots[request.id] !== expectedName) refuse('target pair was not admitted by Save')
    return
  }
  if (existing === undefined && !(state.scope === 'save' && state.allowNewSaveSlot)) refuse('new slot outside permitted A Save')
  let decoded
  try { decoded = decodePbp(request.pbp) } catch { refuse('malformed PBP') }
  if (!decoded || decoded.version !== PBP_VERSION || !decoded.sourceCode.trim()
    || (state.scope !== 'pattern' && !parsePxlblzBanner(decoded.sourceCode))) refuse('unreadable PBP source/header')
  // decodePbp checks section bounds; require the canonical disjoint section order too.
  const view = new DataView(request.pbp.buffer, request.pbp.byteOffset, request.pbp.byteLength)
  let end = PBP_HEADER_SIZE
  for (const index of [1, 3, 5, 7]) {
    const offset = view.getUint32(index * 4, true)
    if (offset !== end) refuse('malformed PBP section header')
    end = offset + view.getUint32((index + 1) * 4, true)
  }
  if (end !== request.pbp.length || decoded!.name !== expectedName) refuse('PBP fixture name/header mismatch')
  state.admittedSlots[request.id] = expectedName!
}
