import { create } from 'zustand'
import type { AgentCapabilities } from '@/engine/authSession'

interface WorkspaceState {
  personalWorkspaceAuthenticated: boolean
  // False until the startup auth probe settles. The signed-out /studio →
  // /gallery redirect (#308) must wait for it, or signed-in users would be
  // bounced to the Gallery during the probe.
  personalWorkspaceResolved: boolean
  personalWorkspaceUnavailable: boolean
  personalWorkspaceProbeAttempt: number
  agentCapabilities: AgentCapabilities | null
  setPersonalWorkspaceAuthenticated: (authenticated: boolean, agentCapabilities?: AgentCapabilities | null) => void
  setPersonalWorkspaceUnavailable: () => void
  retryPersonalWorkspaceAccess: () => void
}

export const workspaceInitialState = {
  personalWorkspaceAuthenticated: false,
  personalWorkspaceResolved: false,
  personalWorkspaceUnavailable: false,
  personalWorkspaceProbeAttempt: 0,
  agentCapabilities: null,
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...workspaceInitialState,
  setPersonalWorkspaceAuthenticated: (authenticated, agentCapabilities = null) =>
    set({
      personalWorkspaceAuthenticated: authenticated,
      agentCapabilities: authenticated ? agentCapabilities : null,
      personalWorkspaceResolved: true,
      personalWorkspaceUnavailable: false,
    }),
  setPersonalWorkspaceUnavailable: () =>
    set({
      personalWorkspaceAuthenticated: false,
      agentCapabilities: null,
      personalWorkspaceResolved: false,
      personalWorkspaceUnavailable: true,
    }),
  retryPersonalWorkspaceAccess: () =>
    set((state) => ({
      personalWorkspaceResolved: false,
      personalWorkspaceUnavailable: false,
      personalWorkspaceProbeAttempt: state.personalWorkspaceProbeAttempt + 1,
    })),
}))
