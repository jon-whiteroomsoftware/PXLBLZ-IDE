import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { AgentDrawerWorkspace } from './AgentDrawer'
import { useAgentDrawerStore, type AgentDrawerController } from '@/dev/agentDrawerController'
import { createAgentDrawerState, transitionAgentDrawer, type AgentDrawerEvent } from '@/engine/agentDrawerModel'
let controller: AgentDrawerController
beforeEach(() => {
  let state = createAgentDrawerState()
  controller = { dispatch: (event: AgentDrawerEvent) => { state = transitionAgentDrawer(state, event); useAgentDrawerStore.setState({ state }) }, retry: vi.fn(), submit: vi.fn(), disconnect: vi.fn(), restoreContact: vi.fn(), cancel: vi.fn() } as unknown as AgentDrawerController
  useAgentDrawerStore.setState({ controller, state, busy: false })
})
afterEach(() => useAgentDrawerStore.setState({ controller: null, state: createAgentDrawerState(), busy: false }))
it('keeps a mounted workspace and disables Send throughout applied/save-pending ownership', () => {
  controller.dispatch({ type: 'drawer', mode: 'open' }); controller.dispatch({ type: 'chooseBuiltin' })
  controller.dispatch({ type: 'draft', text: 'next edit' })
  const { rerender } = render(<AgentDrawerWorkspace narrow={false}><input aria-label="Manual field" /></AgentDrawerWorkspace>)
  const field = screen.getByRole('textbox', { name: 'Manual field' })
  act(() => { controller.dispatch({ type: 'beginEdit', id: 'a', intent: 'Resize' }); controller.dispatch({ type: 'outcome', id: 'a', outcome: 'applied' }); useAgentDrawerStore.setState({ busy: true }) })
  expect(screen.getByRole('button', { name: 'Send' })).toBeDisabled()
  act(() => { controller.dispatch({ type: 'outcome', id: 'a', outcome: 'saved' }); useAgentDrawerStore.setState({ busy: false }) })
  expect(screen.getByRole('button', { name: 'Send' })).toBeEnabled()
  fireEvent.click(screen.getByRole('button', { name: 'Unpin the Agent drawer' }))
  expect(screen.getByRole('button', { name: /Open the Agent drawer; agent;.*0 unread/ })).toBeVisible()
  rerender(<AgentDrawerWorkspace narrow={true}><input aria-label="Manual field" /></AgentDrawerWorkspace>)
  expect(screen.getByRole('textbox', { name: 'Manual field' })).toBe(field)
})
it('announces terminal outcomes without putting read/progress lines in a live region', () => {
  controller.dispatch({ type: 'drawer', mode: 'open' }); controller.dispatch({ type: 'agentBinds', name: 'Claude Code' })
  render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  act(() => controller.dispatch({ type: 'reading' }))
  expect(screen.getByRole('status')).toHaveTextContent('')
  act(() => { controller.dispatch({ type: 'beginEdit', id: 'a', intent: 'Resize' }); controller.dispatch({ type: 'outcome', id: 'a', outcome: 'rolled-back' }) })
  expect(screen.getByRole('status')).toHaveTextContent('Resize: rolled back')
  expect(screen.getByText('Ask your agent to try again from current state.')).toBeVisible()
  expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }))
  expect(screen.getByText('rolled back')).toBeVisible()
  expect(controller.retry).not.toHaveBeenCalled()
})

it('restores a deliberately pinned drawer after a narrow overlay without remounting the Show', () => {
  controller.dispatch({ type: 'pin', pinned: true })
  const { rerender } = render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  expect(screen.getByRole('button', { name: 'Unpin the Agent drawer' })).toBeVisible()
  rerender(<AgentDrawerWorkspace narrow={true}><main>Show</main></AgentDrawerWorkspace>)
  rerender(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  expect(screen.getByRole('button', { name: 'Unpin the Agent drawer' })).toBeVisible()
})

it('announces a later rollback even when a newer operation already has an outcome', () => {
  controller.dispatch({ type: 'drawer', mode: 'open' }); controller.dispatch({ type: 'chooseBuiltin' })
  render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  act(() => {
    controller.dispatch({ type: 'beginEdit', id: 'old', intent: 'First resize' })
    controller.dispatch({ type: 'outcome', id: 'old', outcome: 'applied' })
    controller.dispatch({ type: 'beginEdit', id: 'new', intent: 'Second resize' })
    controller.dispatch({ type: 'outcome', id: 'new', outcome: 'saved' })
    controller.dispatch({ type: 'outcome', id: 'old', outcome: 'rolled-back' })
  })
  expect(screen.getByRole('status')).toHaveTextContent('First resize: rolled back')
})

it('names connection loss on the tucked keyboard edge', () => {
  controller.dispatch({ type: 'chooseBuiltin' })
  render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  act(() => controller.dispatch({ type: 'drop' }))
  expect(screen.getByRole('button', { name: /Open the Agent drawer;.*contact lost.*0 unread/ })).toBeVisible()
})

it('keeps Retry unavailable while another applied operation still owns the save', () => {
  controller.dispatch({ type: 'drawer', mode: 'open' }); controller.dispatch({ type: 'chooseBuiltin' })
  controller.dispatch({ type: 'beginEdit', id: 'old', intent: 'First resize' })
  controller.dispatch({ type: 'outcome', id: 'old', outcome: 'not-applied', retryable: true })
  controller.dispatch({ type: 'beginEdit', id: 'new', intent: 'Second resize' })
  controller.dispatch({ type: 'outcome', id: 'new', outcome: 'applied' })
  useAgentDrawerStore.setState({ busy: true })
  render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  expect(screen.getByRole('button', { name: 'Retry' })).toBeDisabled()
})

it('returns keyboard focus from dismissed recovery controls to the preserved composer selection', async () => {
  controller.dispatch({ type: 'drawer', mode: 'open' }); controller.dispatch({ type: 'chooseBuiltin' })
  controller.dispatch({ type: 'draft', text: 'Keep this draft' })
  controller.dispatch({ type: 'beginEdit', id: 'old', intent: 'Resize' })
  controller.dispatch({ type: 'outcome', id: 'old', outcome: 'not-applied', retryable: true })
  render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  const composer = screen.getByRole('textbox', { name: 'Message the Pixelblaze agent' }) as HTMLInputElement
  composer.setSelectionRange(2, 5)
  const dismiss = screen.getByRole('button', { name: 'Dismiss' }); dismiss.focus()
  fireEvent.click(dismiss)
  await vi.waitFor(() => expect(composer).toHaveFocus())
  expect([composer.selectionStart, composer.selectionEnd]).toEqual([2, 5])
  expect(composer).toHaveValue('Keep this draft')
})

it.each(['not-applied', 'cancelled'] as const)('does not show private change descriptions for %s', outcome => {
  controller.dispatch({ type: 'drawer', mode: 'open' }); controller.dispatch({ type: 'chooseBuiltin' })
  controller.dispatch({ type: 'beginEdit', id: 'private', intent: 'Resize' })
  controller.dispatch({ type: 'outcome', id: 'private', outcome, changes: [{ targetId: 'clip', description: 'Clip now runs eight seconds.' }] })
  render(<AgentDrawerWorkspace narrow={false}><main>Show</main></AgentDrawerWorkspace>)
  expect(screen.queryByText('Clip now runs eight seconds.')).toBeNull()
})
