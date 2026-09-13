// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { mountAgentEditorLifecycle } from './editorLifecycle'
import type { AgentBrowserSessionPort } from './channelPort'
import { useAgentDrawerStore } from './drawerStore'
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
