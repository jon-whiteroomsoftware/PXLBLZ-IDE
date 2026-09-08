// @vitest-environment jsdom
import { createDefaultShow } from '@/engine/showModel'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { createAgentEditorAdmission } from './agentEditorAdmission'

const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, history: state().showHistories })
let stop = () => {}
let writes = vi.fn()
beforeEach(() => {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  const show = createDefaultShow('test', 'Original')
  writes = vi.fn(async () => {})
  setPersonalContentProvider({ updateShow: writes, listShows: async () => [show] } as unknown as PersonalContentProvider)
})
afterEach(() => { stop(); resetPersonalContentProvider(); vi.unstubAllGlobals() })
async function setup() {
  await state().loadShows()
  const api = createAgentEditorAdmission('test', () => ({ playheadMs: 0 }))
  stop = api.close
  return api
}
it.each(['', '?agent', '?agent=0', '?agent=true', '?agent=2'])('cannot register without exact opt-in %s', async query => {
  const api = await setup()
  window.history.replaceState(null, '', '/studio/shows/test' + query)
  expect(api.beginRequest('op', 'rename', [])).toBeUndefined()
})
it('registers before inference and refuses edit-undo ABA without another history/save', async () => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  await state().updateShow('test', { ...captured.show, name: 'Manual' })
  await state().undoShow('test')
  const before = snapshot()
  expect(api.applyShow({ ...captured.show, name: 'Agent' }, captured.request)).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  expect(writes).toHaveBeenCalledTimes(2)
})
it('adopts once, retains truthful settlement and rejects tokenless mutation', async () => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  const candidate = { ...captured.show, name: 'Agent' }
  expect(api.applyShow(candidate, captured.request)).toMatchObject({ status: 'applied', settlement: 'saving' })
  expect(api.applyShow(candidate, captured.request)).toMatchObject({ status: 'applied' })
  await vi.waitFor(() => expect(api.readOutcome(captured.request)).toMatchObject({ status: 'applied', settlement: 'saved' }))
  expect(state().showHistories.test.past).toHaveLength(1)
  expect(writes).toHaveBeenCalledTimes(1)
  expect(api.applyShow({ ...candidate, name: 'Bypass' }, undefined)).toMatchObject({ status: 'refused' })
  expect(state().shows[0].name).toBe('Agent')
})
it.each(['query ABA', 'navigation', 'close', 'source ABA'] as const)('retires or invalidates pending work on %s', async action => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  if (action === 'query ABA') {
    window.history.replaceState(null, '', '/studio/shows/test?agent=0')
    window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  } else if (action === 'navigation') {
    window.history.pushState(null, '', '/studio?agent=1')
    window.history.pushState(null, '', '/studio/shows/test?agent=1')
  } else if (action === 'close') api.close()
  else {
    const { usePatternStore } = await import('@/store/patternStore')
    const original = usePatternStore.getState().userPatterns
    usePatternStore.setState({ userPatterns: [...original] })
    usePatternStore.setState({ userPatterns: original })
  }
  const before = snapshot()
  expect(api.applyShow({ ...captured.show, name: 'Agent' }, captured.request).status).not.toBe('applied')
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})
it.each([null, {}, { scenes: [] }])('refuses malformed candidate %j before normalization', async candidate => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  const before = snapshot()
  expect(api.applyShow(candidate, captured.request)).toMatchObject({ status: 'refused' })
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})
it('completes noncandidate turns without authoring a noop and enforces the retained table cap', async () => {
  const api = await setup()
  for (let index = 0; index < 256; index++) {
    const captured = api.beginRequest(`op-${index}`, 'question', [])!
    expect(api.complete(captured.request, 'asked')).toMatchObject({ status: 'completed', completion: 'asked' })
    expect(api.applyShow({ ...captured.show, name: 'late' }, captured.request)).toMatchObject({ status: 'completed', completion: 'asked' })
  }
  expect(api.beginRequest('overflow', 'question', [])).toBeUndefined()
  expect(writes).not.toHaveBeenCalled()
  expect(state().showHistories.test).toBeUndefined()
})
it('binds completion, cancellation, reads and candidates to the original immutable envelope', async () => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  for (const request of [
    { ...captured.request, sessionId: 'other' },
    { ...captured.request, operationId: 'other' },
    { ...captured.request, payloadKey: 'other' },
  ]) {
    expect(api.complete(request, 'asked').status).toBe('refused')
    expect(api.cancel(request)).toBeUndefined()
    expect(api.readOutcome(request)).toBeUndefined()
    expect(api.applyShow({ ...captured.show, name: 'Agent' }, request).status).toBe('refused')
  }
  expect(api.readOutcome(captured.request)?.status).toBe('pending')
  expect(writes).not.toHaveBeenCalled()
})
it('does not suppress an adopted save when the overlay closes', async () => {
  const api = await setup()
  let settle!: () => void
  writes.mockImplementation(() => new Promise<void>(resolve => { settle = resolve }))
  const captured = api.beginRequest('op', 'rename', [])!
  api.applyShow({ ...captured.show, name: 'Agent' }, captured.request)
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1))
  api.close()
  settle()
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(state().shows[0].name).toBe('Agent')
  expect(state().showHistories.test.past).toHaveLength(1)
  expect(api.readOutcome(captured.request)).toBeUndefined()
})
it.each(['library', 'map'] as const)('rejects %s metadata change/restore without side effects', async kind => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  if (kind === 'library') {
    const { useLibraryStore } = await import('@/store/libraryStore')
    const original = useLibraryStore.getState().userLibraries
    useLibraryStore.setState({ userLibraries: [...original] })
    useLibraryStore.setState({ userLibraries: original })
  } else {
    const { useMapStore } = await import('@/store/mapStore')
    const original = useMapStore.getState().userMaps
    useMapStore.setState({ userMaps: [...original] })
    useMapStore.setState({ userMaps: original })
  }
  const before = snapshot()
  expect(api.applyShow({ ...captured.show, name: 'Agent' }, captured.request).status).toBe('refused')
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})
it('refuses newly missing Pattern references at final authoring validation', async () => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  const candidate = structuredClone(captured.show)
  candidate.cells[0].pattern = { kind: 'user', id: 'missing' }
  const before = snapshot()
  expect(api.applyShow(candidate, captured.request).status).toBe('refused')
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})
it.each(['rolled-back', 'superseded'] as const)('reports delayed failed save as %s', async expected => {
  const api = await setup()
  let reject!: (reason: Error) => void
  writes.mockImplementationOnce(() => new Promise<void>((_, fail) => { reject = fail }))
  const captured = api.beginRequest('op', 'rename', [])!
  expect(api.applyShow({ ...captured.show, name: 'Agent' }, captured.request)).toMatchObject({ status: 'applied', settlement: 'saving' })
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1))
  const later = expected === 'superseded' ? state().updateShow('test', { ...state().shows[0], name: 'Manual' }) : undefined
  reject(new Error('synthetic save failure'))
  await later
  await vi.waitFor(() => expect(api.readOutcome(captured.request)).toMatchObject({ status: 'applied', settlement: expected }))
  expect(state().shows[0].name).toBe(expected === 'superseded' ? 'Manual' : 'Original')
})
it('exports and reopens the adopted Show and Undo restores only its one candidate', async () => {
  const api = await setup()
  const captured = api.beginRequest('op', 'rename', [])!
  const candidate = { ...captured.show, name: 'Agent' }
  expect(api.applyShow(candidate, captured.request).status).toBe('applied')
  await vi.waitFor(() => expect(api.readOutcome(captured.request)?.settlement).toBe('saved'))
  vi.stubGlobal('Blob', (await import('node:buffer')).Blob)
  const { buildShowFileBundle, serializeShowFileBundle, parseShowFileBundle } = await import('@/engine/showFileBundle')
  const current = structuredClone(state().shows[0])
  const { bundle } = buildShowFileBundle(current, { patterns: [], maps: [] }, { appVersion: 'B2' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle), { preserveAuthoringPhysicalRanges: true })
  expect(reopened.show).toEqual(current)
  expect(state().showHistories.test.past).toHaveLength(1)
  await state().undoShow('test')
  expect(state().shows[0]).toEqual({ ...captured.show, updatedAt: state().shows[0].updatedAt })
})

it('refuses a newly unavailable Stage Map reference', async () => {
  const api = await setup()
  const captured = api.beginRequest('op', 'change map', [])!
  expect(api.applyShow({ ...captured.show, stageMapId: 'missing' }, captured.request).status).toBe('refused')
  expect(writes).not.toHaveBeenCalled()
})

it.each(['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused', 'service-failed'] as const)('retains %s completion after manual edit, Undo ABA and hydration', async completion => {
  const api = await setup()
  for (const action of ['manual', 'aba', 'hydrate'] as const) {
    const captured = api.beginRequest(action, 'question', [])!
    if (action === 'hydrate') await state().loadShows()
    else {
      await state().updateShow('test', { ...captured.show, name: 'Manual ' + action })
      if (action === 'aba') await state().undoShow('test')
    }
    expect(state().showRevisions.test).toBeGreaterThan(captured.request.baseRevision)
    const before = snapshot()
    const count = writes.mock.calls.length
    const result = api.complete(captured.request, completion)
    expect(result).toEqual({ request: captured.request, status: 'completed', completion })
    expect(api.readOutcome(captured.request)).toEqual(result)
    expect(api.complete(captured.request, 'asked')).toBe(result)
    expect(api.applyShow({ ...captured.show, name: 'Late candidate' }, captured.request)).toBe(result)
    expect(state().beginShowEdit(api.sessionId, { ...captured.request, operationId: 'retry-' + action, retryOf: action })).toMatchObject({ status: 'refused', reason: 'invalid-retry' })
    expect(snapshot()).toEqual(before)
    expect(writes).toHaveBeenCalledTimes(count)
  }
})
