import { describe, expect, it, vi } from 'vitest'
import { encodePbp } from '../src/engine/pbpEncode'
import { stampArtifact } from '../src/engine/artifactStamp'
import { BenchWorkerObservations, assertBenchMutation, assertBenchProfile, observeBenchImportRead, parseBenchArgs, validateBenchSessions, type BenchAdmissionState, type BenchMutation } from './controller-import-hardware-policy'
import type { ControllerProfile } from '../src/engine/controllerProfile'
import { defaultControllerProfile } from '../src/store/controllerProfileStore'

const id = 'pxb22222222222222'
const other = 'pxb33333333333333'
const drain = 'pxb44444444444444'
const name = 'Test pat I20-offline 1'
const args = ['--device', '192.168.8.196', '--url', 'http://localhost:5174/PXLBLZ-IDE/', '--session-a', 'a.json', '--session-b', 'b.json', '--out', '.wrsp/bench', '--run']
const session = (userId: string) => ({ user: { userId }, cookie: { name: 'session', value: 'private', domain: 'localhost', path: '/' }, cookies: [] })
const pbp = () => encodePbp({ id: 'account-pattern', name, sourceCode: stampArtifact('export function render(i) { rgb(1,0,0) }', { kind: 'pattern', id: 'different-account-pattern' }), byteCode: new Uint8Array([1, 2]) })
function state(): BenchAdmissionState {
  return { target: '192.168.8.196', scope: 'save', allowedNames: [name, 'Test pat I20-offline 2'], pendingSaveName: name,
    pendingImport: null, savedSlots: { [id]: name, [other]: 'Unrelated' }, admittedSlots: {}, priorActiveIds: ['active'], usedDrainIds: [], drainDigest: 'exact-drain', allowNewSaveSlot: true }
}
const save = (): BenchMutation => ({ method: 'saveProgram', id, pbp: pbp() })
function delegate(request: BenchMutation, s: BenchAdmissionState, spy: () => void) { assertBenchMutation(request, s); spy() }

describe('worker observation lifecycle', () => {
  it('forgets deliberately closed B and permits the later A Save', () => {
    const a = {}; const b = {}; const observations = new BenchWorkerObservations<object>()
    observations.add(a); observations.add(b)
    observations.counts.set(a, 3); observations.counts.set(b, 7)
    observations.beginClose([b]); observations.closed(b)
    expect([...observations.active]).toEqual([a])
    expect([...observations.counts]).toEqual([[a, 3]])
    expect(observations.closing.size).toBe(0)
    observations.failed(b); observations.closed(b)
    const spy = vi.fn()
    const writableSave = () => {
      if (observations.readOnly) throw new Error('Writes stopped for this run')
      delegate(save(), state(), spy)
    }
    expect(observations.readOnly).toBe(false)
    expect(writableSave).not.toThrow(); expect(spy).toHaveBeenCalledOnce()
  })

  it('unexpected close forgets A but permanently refuses later writes', () => {
    const a = {}; const b = {}; const observations = new BenchWorkerObservations<object>()
    observations.add(a); observations.counts.set(a, 3)
    observations.closed(a)
    expect(observations.active.size).toBe(0); expect(observations.counts.size).toBe(0)
    observations.add(b); observations.beginClose([b]); observations.closed(b); observations.closed(a)
    const spy = vi.fn()
    expect(() => {
      if (observations.readOnly) throw new Error('Writes stopped for this run')
      delegate(save(), state(), spy)
    }).toThrow('Writes stopped for this run')
    expect(spy).not.toHaveBeenCalled(); expect(observations.readOnly).toBe(true)
  })

  it('only active observation failures stop writes across overlapping closes', () => {
    const a = {}; const b = {}; const c = {}; const forgotten = {}
    const observations = new BenchWorkerObservations<object>()
    for (const worker of [a, b, c]) observations.add(worker)
    observations.counts.set(a, 2); observations.counts.set(b, 4); observations.counts.set(c, 6)
    observations.beginClose([b, c]); observations.beginClose([b])
    observations.failed(b); observations.failed(forgotten)
    observations.closed(b); observations.closed(b); observations.failed(b)
    expect(observations.readOnly).toBe(false)
    expect([...observations.active]).toEqual([a, c])
    expect([...observations.counts]).toEqual([[a, 2], [c, 6]])
    expect([...observations.closing]).toEqual([c])
    observations.failed(a)
    observations.closed(c); observations.add(b); observations.beginClose([a]); observations.closed(a)
    expect(observations.readOnly).toBe(true)
    expect([...observations.active]).toEqual([b]); expect(observations.counts.size).toBe(0)
    expect(observations.closing.size).toBe(0)
  })
})

describe('explicit hardware opt-in and account boundary', () => {
  it('accepts the exact target and help without a run', () => {
    expect(parseBenchArgs(args).device).toBe('192.168.8.196')
    expect(parseBenchArgs(['--help']).help).toBe(true)
  })
  it.each([
    args.filter((x) => x !== '--run'), args.map((x) => x === '192.168.8.196' ? '192.168.8.197' : x),
    args.map((x) => x === 'http://localhost:5174/PXLBLZ-IDE/' ? 'http://example.com:5174/PXLBLZ-IDE/' : x),
    args.map((x) => x === 'http://localhost:5174/PXLBLZ-IDE/' ? 'http://localhost:5175/PXLBLZ-IDE/' : x),
    [...args, '--scenario', 'fake'], [...args, '--run-id', '../unsafe'],
  ].map((input) => [input]))('refuses unsafe CLI before work: %j', (input) => expect(() => parseBenchArgs(input)).toThrow())
  it('accepts distinct local synthetic identities', () => {
    expect(validateBenchSessions(session('github:local-dev'), session('github:local-agent-12')).a.user.userId).toBe('github:local-dev')
  })
  it.each(['github:local-dev', 'github:jon', 'google:local-agent-12', '', 'github:local-agent-x'])('refuses same or unsupported B: %s', (user) => {
    expect(() => validateBenchSessions(session('github:local-dev'), session(user))).toThrow()
  })
  it('refuses malformed sessions and non-localhost cookies', () => {
    expect(() => validateBenchSessions(null, {})).toThrow()
    const a = session('github:local-dev'); a.cookie.domain = 'Agent-Mini.local'
    expect(() => validateBenchSessions(a, session('github:local-agent-12'))).toThrow()
  })
})

describe('structured mutation admission before delegation', () => {
  it.each(['setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setPixelMap'] as const)('refuses %s in every scope', (method) => {
    for (const scope of ['idle', 'save', 'import', 'pattern'] as const) {
      const spy = vi.fn(); expect(() => delegate({ method }, { ...state(), scope }, spy)).toThrow(); expect(spy).not.toHaveBeenCalled()
    }
  })
  it('refuses idle and wrong target without delegating or changing state', () => {
    for (const s of [{ ...state(), scope: 'idle' as const }, { ...state(), target: 'other' }]) {
      const before = structuredClone(s); const spy = vi.fn()
      expect(() => delegate(save(), s, spy)).toThrow(); expect(spy).not.toHaveBeenCalled(); expect(s).toEqual(before)
    }
  })
  it('cannot overwrite an unrelated slot by forging a Test name', () => {
    const s = state(); const before = structuredClone(s); const spy = vi.fn()
    expect(() => delegate({ ...save(), id: other } as BenchMutation, s, spy)).toThrow()
    expect(spy).not.toHaveBeenCalled(); expect(s).toEqual(before)
  })
  it('accepts exact save and target despite a different account banner id', () => {
    const s = state(); const slots = { ...s.savedSlots }; const spy = vi.fn()
    delegate(save(), s, spy)
    delegate({ method: 'pushBytecode', id, name, digest: 'target' }, s, spy)
    expect(spy).toHaveBeenCalledTimes(2); expect(s.admittedSlots[id]).toBe(name); expect(s.savedSlots).toEqual(slots)
  })
  it('admits a newly minted slot only for the pending permitted A Save', () => {
    const s = state(); delegate({ method: 'saveProgram', id: drain, pbp: pbp() }, s, vi.fn())
    expect(s.admittedSlots[drain]).toBe(name)
    expect(() => assertBenchMutation({ method: 'saveProgram', id: 'invalid', pbp: pbp() }, state())).toThrow()
    expect(() => assertBenchMutation({ method: 'saveProgram', id: drain, pbp: pbp() }, { ...state(), allowNewSaveSlot: false })).toThrow()
  })
  it('cannot activate an unadmitted pair or substitute another Test slot on Import', () => {
    const s = state(); s.scope = 'import'; s.pendingImport = { id, name }; s.savedSlots[other] = name
    expect(() => assertBenchMutation({ method: 'pushBytecode', id, name, digest: 'target' }, s)).toThrow()
    expect(() => assertBenchMutation({ method: 'saveProgram', id: other, pbp: pbp() }, s)).toThrow()
    assertBenchMutation(save(), s)
    expect(() => assertBenchMutation({ method: 'pushBytecode', id: other, name, digest: 'target' }, s)).toThrow()
  })
  it.each(['wrong-bytecode', 'saved-id', 'prior-active', 'used-id'])('refuses unsafe nameless drain: %s', (kind) => {
    const s = state(); s.scope = 'import'; s.pendingImport = { id, name }
    if (kind === 'prior-active') s.priorActiveIds.push(drain)
    if (kind === 'used-id') s.usedDrainIds.push(drain)
    const spy = vi.fn()
    expect(() => delegate({ method: 'pushBytecode', id: kind === 'saved-id' ? id : drain, digest: kind === 'wrong-bytecode' ? 'wrong' : 'exact-drain' }, s, spy)).toThrow()
    expect(spy).not.toHaveBeenCalled()
  })
  it('accepts a fresh exact import drain then save/activation, preserving unrelated slots', () => {
    const s = state(); s.scope = 'import'; s.pendingImport = { id, name }; const slots = { ...s.savedSlots }
    assertBenchMutation({ method: 'pushBytecode', id: drain, digest: 'exact-drain' }, s)
    assertBenchMutation(save(), s)
    assertBenchMutation({ method: 'pushBytecode', id, name, digest: 'target' }, s)
    expect(s.usedDrainIds).toEqual([drain]); expect(s.savedSlots).toEqual(slots)
  })
  it.each(['header', 'source'])('refuses malformed PBP %s', (kind) => {
    const bytes = pbp()
    if (kind === 'header') bytes.fill(255, 4, 8)
    else { const view = new DataView(bytes.buffer); bytes.fill(255, view.getUint32(28, true)) }
    const spy = vi.fn(); expect(() => delegate({ method: 'saveProgram', id, pbp: bytes }, state(), spy)).toThrow(); expect(spy).not.toHaveBeenCalled()
  })
})

describe('effective profiles are preserved', () => {
  const a = () => defaultControllerProfile()
  const b = () => ({ ...a(), inputs: [{ id: 'input0', name: 'Input 1', pin: 35, signal: 'analog' as const, smoothing: 0.2, fallback: 0.5, invert: false }],
    globalTransforms: [{ id: 'brightness', type: 'hardware-brightness' as const, enabled: true, mixinId: 'builtin:hardware-brightness', inputId: 'input0', mode: 'multiply-output' as const }, a().globalTransforms[1]] })
  it('accepts factory disabled defaults, empty transforms, and both B smoothing values unchanged', () => {
    const cases: [ControllerProfile, 'a' | 'b'][] = [[a(), 'a'], [{ ...a(), globalTransforms: [] }, 'a'], [b(), 'b'], [{ ...b(), inputs: [{ ...b().inputs[0], smoothing: 1 }] }, 'b']]
    for (const [profile, role] of cases) {
      const before = structuredClone(profile); assertBenchProfile(profile, role); expect(profile).toEqual(before)
    }
  })
  it.each(['pin', 'signal', 'reference', 'power', 'updates', 'bindings', 'electrical', 'board', 'smoothing', 'fallback', 'invert', 'extra-transform'] as const)('refuses incompatible %s without mutation', (kind) => {
    const profile: ControllerProfile = b()
    if (kind === 'pin') profile.inputs[0].pin = 34
    if (kind === 'signal') profile.inputs[0].signal = 'digital'
    if (kind === 'reference' && profile.globalTransforms[0].type === 'hardware-brightness') profile.globalTransforms[0].inputId = 'other'
    if (kind === 'power') profile.globalTransforms[1].enabled = true
    if (kind === 'updates') profile.keepPatternsUpToDate = true
    if (kind === 'bindings') profile.patternBindings = [{} as ControllerProfile['patternBindings'][number]]
    if (kind === 'electrical') profile.electricalProfile = {} as NonNullable<ControllerProfile['electricalProfile']>
    if (kind === 'board') profile.board.kind = 'other' as ControllerProfile['board']['kind']
    if (kind === 'smoothing') profile.inputs[0].smoothing = NaN
    if (kind === 'fallback') profile.inputs[0].fallback = 1
    if (kind === 'invert') profile.inputs[0].invert = true
    if (kind === 'extra-transform') profile.globalTransforms.push({ ...profile.globalTransforms[0] })
    const before = structuredClone(profile)
    expect(() => assertBenchProfile(profile, 'b')).toThrow('preserved without overwrite'); expect(profile).toEqual(before)
  })
})

describe('captured import row observations', () => {
  const targets = [{ id, name }, { id: other, name: 'Test pat I20-offline 2' }]
  it('advances after an ordinary failure before target activation, preserving slots', () => {
    const s = state(); s.scope = 'import'; s.savedSlots[other] = targets[1].name
    const slots = structuredClone(s.savedSlots)
    expect(observeBenchImportRead(s, targets, id)).toBe(true)
    expect(observeBenchImportRead(s, targets, id)).toBe(false)
    assertBenchMutation({ method: 'pushBytecode', id: drain, digest: 'exact-drain' }, s); assertBenchMutation(save(), s)
    // Provider rejection does not transition admission. A later row's read does.
    expect(observeBenchImportRead(s, targets, other)).toBe(true)
    expect(observeBenchImportRead(s, targets, id)).toBe(false)
    expect(observeBenchImportRead(s, targets, 'unselected')).toBe(false)
    expect(s.pendingImport).toEqual(targets[1])
    expect(() => assertBenchMutation(save(), s)).toThrow()
    assertBenchMutation({ method: 'pushBytecode', id: 'pxb55555555555555', digest: 'exact-drain' }, s)
    assertBenchMutation({ method: 'saveProgram', id: other, pbp: encodePbp({ id: other, name: targets[1].name, sourceCode: stampArtifact('export function render(i) { rgb(1,0,0) }', { kind: 'pattern', id: other }), byteCode: new Uint8Array([1]) }) }, s)
    assertBenchMutation({ method: 'pushBytecode', id: other, name: targets[1].name, digest: 'target' }, s)
    expect(s.savedSlots).toEqual(slots)
  })
  it('allows the first observed later row after UI precheck rejection, but never a forged pair', () => {
    const s = state(); s.scope = 'import'; s.savedSlots[other] = targets[1].name
    expect(observeBenchImportRead(s, targets, other)).toBe(true)
    const before = structuredClone(s)
    expect(observeBenchImportRead(s, targets, id)).toBe(false)
    expect(observeBenchImportRead(s, [{ id, name: 'forged' }], id)).toBe(false)
    expect(s).toEqual(before)
    s.scope = 'idle'; expect(observeBenchImportRead(s, targets, id)).toBe(false)
  })
})

describe('explicit existing Pattern authority', () => {
  const pattern = { id: 'LineDancer2D', name: 'Line Dancer' }
  const patternState = (): BenchAdmissionState => ({ ...state(), scope: 'pattern', pendingPattern: pattern, savedSlots: { ...state().savedSlots, [pattern.id]: pattern.name } })
  const patternSave = (): BenchMutation => ({ method: 'saveProgram', id: pattern.id, pbp: encodePbp({ ...pattern, sourceCode: 'export function render(i) { rgb(1,0,0) }', byteCode: new Uint8Array([1]) }) })
  it('admits exact transient play, delete and unstamped save then target without changing captured slots', () => {
    const s = patternState(); const slots = structuredClone(s.savedSlots); const spy = vi.fn()
    delegate({ method: 'setActiveProgram', id: pattern.id, save: false }, s, spy)
    delegate({ method: 'deleteProgram', id: pattern.id }, s, spy)
    expect(() => assertBenchMutation({ method: 'pushBytecode', ...pattern, digest: 'target' }, s)).toThrow()
    delegate(patternSave(), s, spy); delegate({ method: 'pushBytecode', ...pattern, digest: 'target' }, s, spy)
    expect(spy).toHaveBeenCalledTimes(4); expect(s.savedSlots).toEqual(slots)
  })
  it.each(['other-slot', 'forged-name', 'wrong-target', 'idle', 'missing-pending', 'save-activation', 'drain', 'wrong-save-name', 'malformed-save'] as const)('refuses %s before delegation', (kind) => {
    const s = patternState(); let request: BenchMutation = { method: 'setActiveProgram', id: pattern.id, save: false }
    if (kind === 'other-slot') request.id = id
    if (kind === 'forged-name') s.pendingPattern = { ...pattern, name: 'forged' }
    if (kind === 'wrong-target') s.target = 'other'
    if (kind === 'idle') s.scope = 'idle'
    if (kind === 'missing-pending') s.pendingPattern = null
    if (kind === 'save-activation') request.save = true
    if (kind === 'drain') request = { method: 'pushBytecode', id: drain, digest: 'exact-drain' }
    if (kind === 'wrong-save-name') request = { method: 'saveProgram', id: pattern.id, pbp: pbp() }
    if (kind === 'malformed-save') request = { method: 'saveProgram', id: pattern.id, pbp: new Uint8Array() }
    const before = structuredClone(s); const spy = vi.fn()
    expect(() => delegate(request, s, spy)).toThrow(); expect(spy).not.toHaveBeenCalled(); expect(s).toEqual(before)
  })
  it('keeps activation and deletion forbidden in fixture scopes', () => {
    for (const scope of ['save', 'import'] as const) for (const request of [{ method: 'setActiveProgram', id, save: false }, { method: 'deleteProgram', id }] as const) {
      const s = { ...state(), scope, pendingImport: { id, name } }; const spy = vi.fn()
      expect(() => delegate(request, s, spy)).toThrow(); expect(spy).not.toHaveBeenCalled()
    }
  })
})
