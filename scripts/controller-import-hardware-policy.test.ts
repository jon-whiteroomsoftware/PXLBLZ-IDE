import { describe, expect, it, vi } from 'vitest'
import { encodePbp } from '../src/engine/pbpEncode'
import { stampArtifact } from '../src/engine/artifactStamp'
import { assertBenchMutation, parseBenchArgs, validateBenchSessions, type BenchAdmissionState, type BenchMutation } from './controller-import-hardware-policy'

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
  it.each(['setVars', 'setRendererPaused', 'setControls', 'setBrightness', 'setName', 'setPixelCount', 'setActiveProgram', 'deleteProgram', 'setPixelMap'] as const)('refuses %s', (method) => {
    const spy = vi.fn(); expect(() => delegate({ method }, state(), spy)).toThrow(); expect(spy).not.toHaveBeenCalled()
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
