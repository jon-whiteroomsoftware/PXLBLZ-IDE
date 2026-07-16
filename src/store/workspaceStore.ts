import { create } from 'zustand'

interface WorkspaceState {
  personalWorkspaceAuthenticated: boolean
  // False until the startup auth probe settles. The signed-out /studio →
  // /gallery redirect (#308) must wait for it, or signed-in users would be
  // bounced to the Gallery during the probe.
  personalWorkspaceResolved: boolean
  personalWorkspaceUnavailable: boolean
  personalWorkspaceProbeAttempt: number
  setPersonalWorkspaceAuthenticated: (authenticated: boolean) => void
  setPersonalWorkspaceUnavailable: () => void
  retryPersonalWorkspaceAccess: () => void
}

export const workspaceInitialState = {
  personalWorkspaceAuthenticated: false,
  personalWorkspaceResolved: false,
  personalWorkspaceUnavailable: false,
  personalWorkspaceProbeAttempt: 0,
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...workspaceInitialState,
  setPersonalWorkspaceAuthenticated: (authenticated) =>
    set({
      personalWorkspaceAuthenticated: authenticated,
      personalWorkspaceResolved: true,
      personalWorkspaceUnavailable: false,
    }),
  setPersonalWorkspaceUnavailable: () =>
    set({
      personalWorkspaceAuthenticated: false,
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
