import { StrictMode, useLayoutEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { createDefaultShow } from '@/engine/showModel'
import { setPersonalContentProvider, resetPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { FieldActivityContext, createFieldActivityScope } from '@/components/ui/field-activity'
import { DraftTextField } from '@/components/ui/draft-text-field'
import { createAgentEditorAdmission } from './agentEditorAdmission'

const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().shows, history: state().showHistories })
let api: ReturnType<typeof createAgentEditorAdmission>
let writes = vi.fn()
beforeEach(async () => {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  const show = createDefaultShow('test', 'Original')
  writes = vi.fn(async () => {})
  setPersonalContentProvider({ updateShow: writes, listShows: async () => [show] } as unknown as PersonalContentProvider)
  await state().loadShows()
})
afterEach(() => { api?.close(); resetPersonalContentProvider(); vi.useRealTimers() })
function fields(scope: ReturnType<typeof createFieldActivityScope>) {
  return <FieldActivityContext.Provider value={scope}><DraftTextField ariaLabel="Name" value="Original" onApply={name => {
    void state().updateShow('test', { ...state().shows[0], name })
  }} /></FieldActivityContext.Provider>
}
const deliver = () => {
  const captured = api.beginRequest(crypto.randomUUID(), 'Rename', [])!
  const candidate = { ...captured.show, name: 'Agent' }
  return { captured, candidate, result: api.applyShow(candidate, captured.request) }
}
it.each(['cancel', 'commit'] as const)('preserves the whole record while dirty and orders %s before waiting adoption', async action => {
  const scope = createFieldActivityScope()
  render(fields(scope))
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  const input = screen.getByRole('textbox', { name: 'Name' })
  fireEvent.change(input, { target: { value: 'Manual' } })
  const before = snapshot()
  const { captured, candidate, result } = deliver()
  expect(result.status).toBe('waiting')
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
  fireEvent.keyDown(input, { key: action === 'cancel' ? 'Escape' : 'Enter' })
  if (action === 'cancel') expect(api.readOutcome(captured.request)?.status).toBe('applied')
  else expect(api.readOutcome(captured.request)).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1))
  const expected = action === 'cancel' ? candidate : { ...before.shows[0], name: 'Manual' }
  expect(state().shows[0]).toEqual({ ...expected, updatedAt: state().shows[0].updatedAt })
  expect(state().showHistories.test.past).toEqual([before.shows[0]])
})
it('rebinds an already dirty control before new-session delivery, without late old cleanup detaching it', () => {
  const scope = createFieldActivityScope()
  render(fields(scope))
  const input = screen.getByRole('textbox', { name: 'Name' })
  fireEvent.change(input, { target: { value: 'Manual' } })
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  expect(deliver().result.status).toBe('waiting')
  const old = api
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  old.close()
  const { result } = deliver()
  expect(result.status).toBe('waiting')
  expect(writes).not.toHaveBeenCalled()
})
it('retires before descendant cleanup under StrictMode and whole-editor unmount', () => {
  const scope = createFieldActivityScope()
  function Editor() {
    useLayoutEffect(() => {
      api = createAgentEditorAdmission('test', () => ({}), scope.bind)
      return api.close
    }, [])
    return fields(scope)
  }
  const mounted = render(<StrictMode><Editor /></StrictMode>)
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Manual' } })
  const before = snapshot()
  expect(deliver().result.status).toBe('waiting')
  mounted.unmount()
  expect(snapshot()).toEqual(before)
  expect(writes).not.toHaveBeenCalled()
})
it('times out a candidate without forgetting the still-dirty field', () => {
  vi.useFakeTimers()
  const scope = createFieldActivityScope()
  render(fields(scope))
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Manual' } })
  const { captured } = deliver()
  act(() => vi.advanceTimersByTime(5000))
  expect(api.readOutcome(captured.request)).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
  expect(deliver().result.status).toBe('waiting')
  expect(writes).not.toHaveBeenCalled()
})
it('retires capacity overflow before returning an untracked diagnostic capability', () => {
  const scope = createFieldActivityScope()
  render(<FieldActivityContext.Provider value={scope}>{Array.from({ length: 257 }, (_, i) => <DraftTextField key={i} ariaLabel={`Name ${i}`} value="Original" onApply={() => {}} />)}</FieldActivityContext.Provider>)
  for (const input of screen.getAllByRole('textbox')) fireEvent.change(input, { target: { value: 'Manual' } })
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  expect(api.available()).toBe(false)
  expect(api.beginRequest('op', 'Rename', [])).toBeUndefined()
  expect(writes).not.toHaveBeenCalled()
})

it('rebinds a surviving dirty draft after URL remove/restore without reviving old work', () => {
  const scope = createFieldActivityScope()
  render(fields(scope))
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Manual' } })
  const old = deliver()
  window.history.replaceState(null, '', '/studio/shows/test')
  expect(api.available()).toBe(false)
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  expect(api.applyShow(old.candidate, old.captured.request).status).toBe('retired')
  api = createAgentEditorAdmission('test', () => ({}), scope.bind)
  expect(deliver().result.status).toBe('waiting')
  expect(writes).not.toHaveBeenCalled()
})
