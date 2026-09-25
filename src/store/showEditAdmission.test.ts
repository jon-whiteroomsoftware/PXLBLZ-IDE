// @vitest-environment jsdom
import { createDefaultShow } from '@/engine/showModel'
import { setPersonalContentProvider, resetPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { showInitialState, useShowStore } from './showStore'

function providerFor(show: ShowRecord) {
  const records = new Map([[show.id, structuredClone(show)]])
  const updateShow = vi.fn(async (id: string, changes: Partial<ShowRecord>) => { records.set(id, { ...records.get(id)!, ...changes }) })
  const provider = {
    listShows: async () => [...records.values()], updateShow,
    deleteShow: async (id: string) => { records.delete(id) },
    createShow: async (record: ShowRecord) => { records.set(record.id, record) },
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider
  setPersonalContentProvider(provider)
  return { records, updateShow, provider }
}
const intent = (operationId = 'op') => ({ operationId, payloadKey: 'rename', referenceContext: 'original', targets: ['target'] })
const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, histories: state().showHistories, drafts: state().stockShowDrafts, failure: state().showSaveFailure })
const evaluate = (show: ShowRecord) => ({ ...show, name: 'Agent' })
const validate = () => true

beforeEach(() => { useShowStore.setState(showInitialState); resetPersonalContentProvider() })
afterEach(() => { resetPersonalContentProvider() })

// V1-ONLY (#1042): v2 pilot opening does not use openShow selection; deleted with openShow.
it('retires an editor session on explicit departure while a same-id reopen cannot revive it', async () => {
  const show = createDefaultShow('departure', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  await state().openShow(show.id)
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  await state().openShow(null)
  await state().openShow(show.id)
  const before = snapshot()
  expect(state().admitShowEdit(pending.request, evaluate, validate).status).toBe('retired')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

// V1-ONLY (#1042): this matrix includes a caller-supplied async final validator absent from v2; deleted with admitShowEdit.
it.each(['cancel', 'retire', 'remount', 'wrong-session', 'wrong-show', 'payload', 'unknown', 'capacity', 'invalid', 'async-validation', 'no-candidate'] as const)('preserves full state/history and produces no write for %s', async (mode) => {
  const show = createDefaultShow(`refuse-${mode}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id, 1)
  let request = state().beginShowEdit(session, intent()).request
  if (mode === 'cancel') state().cancelShowEdit(session, 'op')
  if (mode === 'retire') state().retireShowEditSession(session)
  if (mode === 'remount') state().beginShowEditSession(show.id)
  if (mode === 'wrong-session') request = { ...request, sessionId: 'other' }
  if (mode === 'wrong-show') request = { ...request, showId: 'other' }
  if (mode === 'payload') request = { ...request, payloadKey: 'other' }
  if (mode === 'unknown') request = { ...request, operationId: 'unknown' }
  if (mode === 'capacity') {
    const refused = state().beginShowEdit(session, intent('overflow'))
    expect(refused.reason).toBe('capacity')
    request = refused.request
  }
  const before = snapshot()
  const finalValidate = mode === 'async-validation' ? (() => Promise.resolve(true)) as unknown as typeof validate : () => mode !== 'invalid'
  const result = state().admitShowEdit(request, mode === 'no-candidate' ? () => null : evaluate, finalValidate)
  expect(['refused', 'cancelled', 'retired']).toContain(result.status)
  expect(snapshot()).toEqual(before)
  await Promise.resolve()
  expect(provider.updateShow).not.toHaveBeenCalled()
  expect([...provider.records.values()]).toEqual([show])
})

// V1-ONLY (#1042): v2 delivery has no synchronous evaluate callback; deleted with admitShowEdit.
it('rechecks revision after synchronous policy execution and preserves a reentrant manual edit', async () => {
  const show = createDefaultShow('reentrant', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const request = state().beginShowEdit(session, intent()).request
  let manual!: Promise<void>
  let before!: ReturnType<typeof snapshot>
  const result = state().admitShowEdit(request, (current) => {
    manual = state().updateShow(show.id, { ...current, name: 'Manual during policy' })
    before = snapshot()
    return evaluate(current)
  }, validate)
  expect(result.reason).toBe('revision-conflict')
  expect(snapshot()).toEqual(before)
  await manual
  expect(provider.updateShow).toHaveBeenCalledTimes(1)
  expect(provider.records.get(show.id)?.name).toBe('Manual during policy')
})

// V1-ONLY (#1042): v2 delivery has no caller-supplied final validator; deleted with admitShowEdit.
it('retains a rich final-validator refusal without changing Show, history, or provider', async () => {
  const show = createDefaultShow('rich-final-refusal', 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, evaluate, (() => ({
    valid: false,
    diagnostic: { stage: 'normalized', issues: [{ code: 'invalid-scene-duration', path: '["scene","scene-2","durationMs"]' }] },
  })) as never)
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: { stage: 'normalized', issues: [{ code: 'invalid-scene-duration' }] },
  })
  expect(state().readShowEdit(session, 'op')).toBe(result)
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

// V1-ONLY (#1042): v2 delivery has no caller-supplied evaluator or validator; deleted with admitShowEdit.
it.each([
  ['validator', () => evaluate, () => (() => { throw new Error('credential=validator-secret') })],
  ['admission', () => (() => { throw new Error('credential=evaluation-secret') }), () => validate],
] as const)('uses a controlled nonspecific diagnostic for unexpected %s failure', async (kind, makeEvaluate, makeValidate) => {
  const show = createDefaultShow(`unexpected-${kind}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, makeEvaluate(), makeValidate())
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: {
      stage: kind === 'validator' ? 'unexpected-validator-failure' : 'unexpected-admission-failure',
      issues: [{ code: kind === 'validator' ? 'validation-unavailable' : 'admission-unavailable' }],
    },
  })
  expect(JSON.stringify(result)).not.toContain('credential=')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

// V1-ONLY (#1042): v2 delivery has no caller-supplied validator result; deleted with admitShowEdit.
it.each([
  Promise.resolve(true),
  1,
  { valid: true, diagnostic: { stage: 'normalized', issues: [{ code: 'structure-invalid' }] } },
  { valid: true, extra: true },
  { valid: false, diagnostic: { stage: 'normalized', issues: [{ code: 'invented', message: 'secret' }] } },
])('fails closed for an unsupported validator result without exposing it: %j', async value => {
  const show = createDefaultShow(`unsupported-result-${Math.random()}`, 'Original')
  const provider = providerFor(show)
  await state().loadShows()
  const session = state().beginShowEditSession(show.id)
  const pending = state().beginShowEdit(session, intent())
  const before = snapshot()
  const result = state().admitShowEdit(pending.request, evaluate, (() => value) as never)
  expect(result).toMatchObject({
    status: 'refused', reason: 'invalid-candidate',
    diagnostic: { stage: 'unexpected-admission-failure', issues: [{ code: 'admission-unavailable' }] },
  })
  expect(JSON.stringify(result)).not.toContain('secret')
  expect(snapshot()).toEqual(before)
  expect(provider.updateShow).not.toHaveBeenCalled()
})

describe('clearActiveShowSelection (#1039)', () => {
  // V1-ONLY (#1042): v2 rows do not use activeShowId selection; deleted with clearActiveShowSelection.
  it('drops another row\'s v1 selection while the routed Show\'s session stays live', () => {
    const v1Row = createDefaultShow('v1-row', 'Still v1')
    const routed = createDefaultShow('routed-v2', 'Routed v2')
    providerFor(v1Row)
    useShowStore.setState({ shows: [v1Row, routed], showsLoaded: true, activeShowId: v1Row.id })
    const session = state().beginShowEditSession(routed.id)

    state().clearActiveShowSelection()

    expect(state().activeShowId).toBeNull()
    expect(state().beginShowEdit(session, intent()).status).toBe('pending')
  })

  // V1-ONLY (#1042): v2 rows do not use activeShowId selection; deleted with clearActiveShowSelection.
  it('retires the deselected row\'s own session', () => {
    const v1Row = createDefaultShow('v1-row', 'Still v1')
    providerFor(v1Row)
    useShowStore.setState({ shows: [v1Row], showsLoaded: true, activeShowId: v1Row.id })
    const session = state().beginShowEditSession(v1Row.id)

    state().clearActiveShowSelection()

    expect(state().activeShowId).toBeNull()
    expect(state().beginShowEdit(session, intent()).status).toBe('retired')
  })

  // V1-ONLY (#1042): v2 rows do not use activeShowId selection; deleted with clearActiveShowSelection.
  it('is a no-op without a selection', () => {
    const routed = createDefaultShow('routed-v2', 'Routed v2')
    useShowStore.setState({ shows: [routed], showsLoaded: true, activeShowId: null })
    const session = state().beginShowEditSession(routed.id)
    state().clearActiveShowSelection()
    expect(state().beginShowEdit(session, intent()).status).toBe('pending')
  })
})
