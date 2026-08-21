import { create } from 'zustand'

/**
 * The clip currently under the pointer in the Show editor timeline, or null.
 * A store of its own because hover changes at pointer frequency: nothing in
 * the editor's render path subscribes to it, so writes cost no re-renders
 * there, while non-component readers (tests, tooling, commands) can always
 * ask what the editor is pointing at. Cleared when the pointer leaves the
 * clip and when the editor switches Shows.
 */
export interface ShowClipHoverState {
  hoveredClipId: string | null
  setHoveredClip: (clipId: string) => void
  /** Clears only if the given clip is still the hovered one, so a stale leave never clobbers a newer enter. */
  clearHoveredClip: (clipId: string) => void
  resetHoveredClip: () => void
}

export const useShowClipHoverStore = create<ShowClipHoverState>()((set) => ({
  hoveredClipId: null,
  setHoveredClip: (clipId) => set({ hoveredClipId: clipId }),
  clearHoveredClip: (clipId) => set((state) => (
    state.hoveredClipId === clipId ? { hoveredClipId: null } : state
  )),
  resetHoveredClip: () => set({ hoveredClipId: null }),
}))
