// @vitest-environment jsdom
import { expect, it, vi } from 'vitest'
import { mountAgentEditorLifecycle } from './editorLifecycle'
import type { AgentBrowserSessionPort } from './channelPort'
import { useAgentDrawerStore } from './drawerStore'
it('creates one session, retires synchronously on opt-out, and creates a fresh session on restore', () => {
  window.history.replaceState(null, '', '/studio/shows/test?agent=1')
  const admissions: Array<{ available(): boolean; sessionId: string }> = []
  const closed = vi.fn()
  const createChannel = vi.fn(({ admission }) => {
    admissions.push(admission)
    return { ready: Promise.resolve(undefined), getWindow: () => undefined, getConnection: () => ({ kind: 'idle' }), subscribe: () => () => {}, close: closed } as unknown as AgentBrowserSessionPort
  })
  const close = mountAgentEditorLifecycle({ showId: 'test', readOnly: false, getContext: () => ({}), createChannel })
  try {
    expect(createChannel).toHaveBeenCalledOnce()
    expect(useAgentDrawerStore.getState().controller?.showId).toBe('test')
    window.history.replaceState(null, '', '/studio/shows/test')
    expect(closed).toHaveBeenCalledOnce()
    expect(admissions[0].available()).toBe(false)
    expect(useAgentDrawerStore.getState().controller).toBeNull()
    window.history.replaceState(null, '', '/studio/shows/test?agent=1')
    expect(createChannel).toHaveBeenCalledTimes(2)
    expect(admissions[1].sessionId).not.toBe(admissions[0].sessionId)
  } finally { close() }
  expect(closed).toHaveBeenCalledTimes(2)
})
