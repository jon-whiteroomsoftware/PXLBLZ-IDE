import { create } from 'zustand'

interface WorkspaceState {
  personalWorkspaceAuthenticated: boolean
  setPersonalWorkspaceAuthenticated: (authenticated: boolean) => void
}

export const workspaceInitialState = {
  personalWorkspaceAuthenticated: false,
}

export const useWorkspaceStore = create<WorkspaceState>()((set) => ({
  ...workspaceInitialState,
  setPersonalWorkspaceAuthenticated: (authenticated) =>
    set({ personalWorkspaceAuthenticated: authenticated }),
}))
