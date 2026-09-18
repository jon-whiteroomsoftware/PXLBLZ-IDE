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

// `/api/me` is probed independently by the account control and by workspace
// startup, so the same capabilities arrive twice. An unchanged answer is not a
// change: the agent editor lifecycle keys one registered window on this value,
// and a fresh object for equal capabilities retired that live registration and
// registered a second window (#1065).
function settledCapabilities(
  current: AgentCapabilities | null,
  next: AgentCapabilities | null,
): AgentCapabilities | null {
  if (!current || !next) return next
  return JSON.stringify(current) === JSON.stringify(next) ? current : next
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...workspaceInitialState,
  setPersonalWorkspaceAuthenticated: (authenticated, agentCapabilities = null) =>
    set((state) => ({
      personalWorkspaceAuthenticated: authenticated,
      agentCapabilities: authenticated
        ? settledCapabilities(state.agentCapabilities, agentCapabilities)
        : null,
      personalWorkspaceResolved: true,
      personalWorkspaceUnavailable: false,
    })),
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
