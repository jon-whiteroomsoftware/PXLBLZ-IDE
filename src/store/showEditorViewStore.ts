import { create } from 'zustand'
import type { ShowGroupSelection } from '../engine/showGroupModel'
import type { ShowTimelineViewport } from '../engine/showTimelineViewport'

/**
 * What the Show editor is looking at: the current timeline selection and the
 * visible time range. Session-only view state — never persisted, reset when
 * the editor switches Shows. The pure selection and viewport algebra stays
 * in the engine; components write these slices on events and read them for
 * rendering, so non-component code (tests, tooling, commands) can read the
 * editor's focus without a component handle. Clip hover is deliberately a
 * separate store (showClipHoverStore) so its high-frequency writes never
 * re-render selection or viewport subscribers.
 */
export type ShowSelection =
  | { kind: 'clip'; clipId: string }
  | { kind: 'transition'; transitionId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'zone-layout'; layoutId: string; intervalId?: string }
  | { kind: 'group'; occurrenceId: string }
  | { kind: 'group-clip'; occurrenceId: string; placementId: string }
  | { kind: 'multi'; groupSelection: ShowGroupSelection }
  | { kind: 'show' }

export interface ShowEditorViewState {
  /** The Show whose editor currently owns this view state (for readers). */
  ownerShowId: string | null
  /**
   * Ownership generation: bumped on every reset. Show ids repeat when the
   * user revisits a Show, so writers tag writes with the epoch their closure
   * was created under, never the Show id.
   */
  viewEpoch: number
  selection: ShowSelection
  /**
   * With epoch given, the write lands only while that epoch still owns the
   * view; returns whether it landed so callers can abort the rest of their
   * transaction (opening panels, anchoring) on a stale write.
   */
  setSelection: (selection: ShowSelection, epoch?: number) => boolean
  /** The visible time range; null means fitted to the whole Show. */
  viewport: ShowTimelineViewport | null
  setViewport: (viewport: ShowTimelineViewport | null, epoch?: number) => boolean
  /** Return to the neutral view for the given Show: Show-level selection, fitted viewport, new epoch. */
  resetShowEditorView: (ownerShowId: string) => void
}

export const showEditorViewInitialState = {
  ownerShowId: null as string | null,
  viewEpoch: 0,
  selection: { kind: 'show' } as ShowSelection,
  viewport: null as ShowTimelineViewport | null,
}

export const useShowEditorViewStore = create<ShowEditorViewState>()((set) => ({
  ...showEditorViewInitialState,
  setSelection: (selection, epoch) => {
    let landed = false
    set((state) => {
      if (epoch !== undefined && state.viewEpoch !== epoch) return state
      landed = true
      return { selection }
    })
    return landed
  },
  setViewport: (viewport, epoch) => {
    let landed = false
    set((state) => {
      if (epoch !== undefined && state.viewEpoch !== epoch) return state
      landed = true
      return { viewport }
    })
    return landed
  },
  resetShowEditorView: (ownerShowId) => set((state) => ({
    ...showEditorViewInitialState,
    ownerShowId,
    viewEpoch: state.viewEpoch + 1,
  })),
}))
