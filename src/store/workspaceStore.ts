import { create } from 'zustand'

interface WorkspaceState {
  personalWorkspaceAuthenticated: boolean
  // False until the startup auth probe settles. The signed-out /studio →
  // /gallery redirect (#308) must wait for it, or signed-in users would be
  // bounced to the Gallery during the probe.
  personalWorkspaceResolved: boolean
  setPersonalWorkspaceAuthenticated: (authenticated: boolean) => void
}

export const workspaceInitialState = {
  personalWorkspaceAuthenticated: false,
  personalWorkspaceResolved: false,
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...workspaceInitialState,
  setPersonalWorkspaceAuthenticated: (authenticated) =>
    set({ personalWorkspaceAuthenticated: authenticated, personalWorkspaceResolved: true }),
}))
