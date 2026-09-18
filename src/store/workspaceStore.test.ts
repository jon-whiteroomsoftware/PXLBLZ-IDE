import { beforeEach, describe, expect, it } from 'vitest'
import { useWorkspaceStore, workspaceInitialState } from './workspaceStore'
import type { AgentCapabilities } from '@/engine/authSession'

const capabilities = (): AgentCapabilities => ({
  external: false,
  builtin: true,
  allowance: { code: 'available', limit: 40, remaining: 40, resetAt: 1_700_000_000_000, revision: 3 },
})

describe('workspace agent capabilities identity', () => {
  beforeEach(() => { useWorkspaceStore.setState({ ...workspaceInitialState }) })

  // Two startup probes answer `/api/me` independently (AuthStatus and the
  // Pattern list). An unchanged answer must not look like a change: the agent
  // editor lifecycle keys one registered window on this value, so a fresh
  // object for the same capabilities retired a live window and registered a
  // second one (#1065).
  it('keeps the same capabilities object when a repeated answer is equal', () => {
    const { setPersonalWorkspaceAuthenticated } = useWorkspaceStore.getState()
    setPersonalWorkspaceAuthenticated(true, capabilities())
    const first = useWorkspaceStore.getState().agentCapabilities
    setPersonalWorkspaceAuthenticated(true, capabilities())
    expect(useWorkspaceStore.getState().agentCapabilities).toBe(first)
  })

  it('replaces the capabilities object when the answer changes', () => {
    const { setPersonalWorkspaceAuthenticated } = useWorkspaceStore.getState()
    setPersonalWorkspaceAuthenticated(true, capabilities())
    const first = useWorkspaceStore.getState().agentCapabilities
    const changed: AgentCapabilities = { ...capabilities(), builtin: false }
    setPersonalWorkspaceAuthenticated(true, changed)
    const next = useWorkspaceStore.getState().agentCapabilities
    expect(next).not.toBe(first)
    expect(next).toEqual(changed)
  })

  it('drops the capabilities when the repeated answer is unauthenticated', () => {
    const { setPersonalWorkspaceAuthenticated } = useWorkspaceStore.getState()
    setPersonalWorkspaceAuthenticated(true, capabilities())
    setPersonalWorkspaceAuthenticated(false)
    expect(useWorkspaceStore.getState().agentCapabilities).toBeNull()
    expect(useWorkspaceStore.getState().personalWorkspaceAuthenticated).toBe(false)
  })

  it('restores an equal capabilities answer after a signed-out gap', () => {
    const { setPersonalWorkspaceAuthenticated } = useWorkspaceStore.getState()
    setPersonalWorkspaceAuthenticated(true, capabilities())
    setPersonalWorkspaceAuthenticated(false)
    setPersonalWorkspaceAuthenticated(true, capabilities())
    expect(useWorkspaceStore.getState().agentCapabilities).toEqual(capabilities())
  })
})
