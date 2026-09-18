// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { mountAgentEditorLifecycle, useAgentEditorLifecycle } from './editorLifecycle'
import type { AgentBrowserSessionPort } from './channelPort'
import { useAgentDrawerStore } from './drawerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'
import type { AgentCapabilities } from '@/engine/authSession'
it('creates one enabled session on an ordinary Show URL and retires only when the route changes', () => {
  window.history.replaceState(null, '', '/studio/shows/test')
  const admissions: Array<{ available(): boolean; sessionId: string }> = []
  const closed = vi.fn()
  const createChannel = vi.fn(({ admission }) => {
    admissions.push(admission)
    return { ready: Promise.resolve(undefined), getWindow: () => undefined, getConnection: () => ({ kind: 'idle' }), subscribe: () => () => {}, close: closed } as unknown as AgentBrowserSessionPort
  })
  const close = mountAgentEditorLifecycle({ showId: 'test', readOnly: false, enabled: true, getContext: () => ({}), createChannel })
  try {
    expect(createChannel).toHaveBeenCalledOnce()
    expect(useAgentDrawerStore.getState().controller?.showId).toBe('test')
    window.history.replaceState(null, '', '/studio/shows/test?agent=1')
    expect(closed).not.toHaveBeenCalled()
    expect(admissions[0].available()).toBe(true)
    window.history.replaceState(null, '', '/studio/shows/other')
    expect(closed).toHaveBeenCalledOnce()
    expect(admissions[0].available()).toBe(false)
    expect(useAgentDrawerStore.getState().controller).toBeNull()
  } finally { close() }
  expect(closed).toHaveBeenCalledOnce()
})

it('does not expose a session while capabilities are unknown or unavailable', () => {
  const createChannel = vi.fn()
  const close = mountAgentEditorLifecycle({ showId: 'test', readOnly: false, enabled: false, getContext: () => ({}), createChannel })
  expect(createChannel).not.toHaveBeenCalled()
  expect(useAgentDrawerStore.getState().controller).toBeNull()
  close()
})

it('keeps observing an unavailable DEV diagnostic until its exact legacy URL appears', () => {
  window.history.replaceState(null, '', '/studio/shows/test')
  let legacyEnabled = false
  const closed = vi.fn()
  const createChannel = vi.fn(() => ({ ready: Promise.resolve(undefined), getWindow: () => undefined, getConnection: () => ({ kind: 'idle' }), subscribe: () => () => {}, close: closed }) as unknown as AgentBrowserSessionPort)
  const close = mountAgentEditorLifecycle({ showId: 'test', readOnly: false, enabled: false, legacyDiagnosticEnabled: () => legacyEnabled, getContext: () => ({}), createChannel })
  try {
    expect(createChannel).not.toHaveBeenCalled()
    legacyEnabled = true
    window.history.replaceState(null, '', '/studio/shows/test?agent=1')
    expect(createChannel).toHaveBeenCalledOnce()
    legacyEnabled = false
    window.history.replaceState(null, '', '/studio/shows/test')
    expect(closed).toHaveBeenCalledOnce()
  } finally { close() }
})

// One editor open registers one agent window. The Studio answers `/api/me`
// from two independent startup probes, so the workspace publishes the same
// capabilities twice; keying the session on that object retired a live
// registration and registered a second window, which is what exhausted the
// account's eight-registration capacity under test (#1065).
it('registers one window when the workspace repeats an equal capability answer', () => {
  window.history.replaceState(null, '', '/studio/shows/test')
  useWorkspaceStore.setState({ ...workspaceInitialState })
  const closed = vi.fn()
  const createChannel = vi.fn(() => ({ ready: Promise.resolve(undefined), getWindow: () => undefined, getConnection: () => ({ kind: 'idle' }), subscribe: () => () => {}, close: closed }) as unknown as AgentBrowserSessionPort)
  const answer = (): AgentCapabilities => ({ external: false, builtin: true, allowance: { code: 'available', limit: 40, remaining: 40, resetAt: 1_700_000_000_000, revision: 3 } })
  const getContext = () => ({})
  const Editor = () => {
    const capabilities = useWorkspaceStore(state => state.agentCapabilities)
    useAgentEditorLifecycle({
      showId: 'test',
      readOnly: false,
      enabled: Boolean(capabilities?.external || capabilities?.builtin),
      allowance: capabilities?.allowance,
      getContext,
      createChannel,
    })
    return null
  }
  const view = render(<Editor />)
  try {
    act(() => { useWorkspaceStore.getState().setPersonalWorkspaceAuthenticated(true, answer()) })
    expect(createChannel).toHaveBeenCalledOnce()
    act(() => { useWorkspaceStore.getState().setPersonalWorkspaceAuthenticated(true, answer()) })
    expect(createChannel).toHaveBeenCalledOnce()
    expect(closed).not.toHaveBeenCalled()
  } finally { view.unmount() }
  expect(closed).toHaveBeenCalledOnce()
})
