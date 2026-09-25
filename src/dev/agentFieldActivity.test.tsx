import { StrictMode, useLayoutEffect } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'
import { agentV2Record, openAgentV2Show, type AgentV2Writes } from '@/test/agentAdmissionV2Harness'
import { showInitialState, useShowStore } from '@/store/showStore'
import { FieldActivityContext, createFieldActivityScope } from '@/components/ui/field-activity'
import { DraftTextField } from '@/components/ui/draft-text-field'
import { createAgentEditorAdmission } from './agentEditorAdmission'

const state = () => useShowStore.getState()
const snapshot = () => structuredClone({ shows: state().showV2Pilots, history: state().showV2Histories })
let api: ReturnType<typeof createAgentEditorAdmission>
let writes: AgentV2Writes
let binding: Awaited<ReturnType<typeof openAgentV2Show>>['binding']
const admit = (bind: ReturnType<typeof createFieldActivityScope>['bind']) => createAgentEditorAdmission('test', () => ({}), bind, undefined, binding)
beforeEach(async () => {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  useShowStore.setState(showInitialState)
  ;({ writes, binding } = await openAgentV2Show(agentV2Record()))
})
afterEach(() => { api?.close(); binding.stop(); resetPersonalContentProvider(); vi.useRealTimers() })
function fields(scope: ReturnType<typeof createFieldActivityScope>) {
  return <FieldActivityContext.Provider value={scope}><DraftTextField ariaLabel="Name" value="Original" onApply={name => {
    void state().updateShowV2Pilot('test', { ...state().showV2Pilots.test, name })
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
  api = admit(scope.bind)
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
  const expected = action === 'cancel' ? candidate : { ...before.shows.test, name: 'Manual' }
  expect(state().showV2Pilots.test).toEqual({ ...expected, updatedAt: state().showV2Pilots.test.updatedAt })
  expect(state().showV2Histories.test.past).toEqual([before.shows.test])
})
it('rebinds an already dirty control before new-session delivery, without late old cleanup detaching it', () => {
  const scope = createFieldActivityScope()
  render(fields(scope))
  const input = screen.getByRole('textbox', { name: 'Name' })
  fireEvent.change(input, { target: { value: 'Manual' } })
  api = admit(scope.bind)
  expect(deliver().result.status).toBe('waiting')
  const old = api
  api = admit(scope.bind)
  old.close()
  const { result } = deliver()
  expect(result.status).toBe('waiting')
  expect(writes).not.toHaveBeenCalled()
})
it('retires before descendant cleanup under StrictMode and whole-editor unmount', () => {
  const scope = createFieldActivityScope()
  function Editor() {
    useLayoutEffect(() => {
      api = admit(scope.bind)
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
  api = admit(scope.bind)
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
  api = admit(scope.bind)
  expect(api.available()).toBe(false)
  expect(api.beginRequest('op', 'Rename', [])).toBeUndefined()
  expect(writes).not.toHaveBeenCalled()
})

it('rebinds a surviving dirty draft after capability revoke/restore without reviving old work', () => {
  const scope = createFieldActivityScope()
  render(fields(scope))
  api = admit(scope.bind)
  fireEvent.change(screen.getByRole('textbox', { name: 'Name' }), { target: { value: 'Manual' } })
  const old = deliver()
  // The lifecycle closes its admission when the server capability disappears.
  // Query removal no longer means revocation: ordinary Show URLs are enabled.
  api.close()
  expect(api.available()).toBe(false)
  expect(api.applyShow(old.candidate, old.captured.request).status).toBe('retired')
  api = admit(scope.bind)
  expect(deliver().result.status).toBe('waiting')
  expect(writes).not.toHaveBeenCalled()
})
