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
  /** The Show whose editor currently owns this view state. */
  ownerShowId: string | null
  selection: ShowSelection
  /** With ownerShowId given, the write lands only while that Show still owns the view (stale async continuations from an earlier Show are dropped). */
  setSelection: (selection: ShowSelection, ownerShowId?: string) => void
  /** The visible time range; null means fitted to the whole Show. */
  viewport: ShowTimelineViewport | null
  setViewport: (viewport: ShowTimelineViewport | null, ownerShowId?: string) => void
  /** Return to the neutral view for the given Show: Show-level selection, fitted viewport. */
  resetShowEditorView: (ownerShowId: string) => void
}

export const showEditorViewInitialState = {
  ownerShowId: null as string | null,
  selection: { kind: 'show' } as ShowSelection,
  viewport: null as ShowTimelineViewport | null,
}

export const useShowEditorViewStore = create<ShowEditorViewState>()((set) => ({
  ...showEditorViewInitialState,
  setSelection: (selection, ownerShowId) => set((state) => (
    ownerShowId === undefined || state.ownerShowId === ownerShowId ? { selection } : state
  )),
  setViewport: (viewport, ownerShowId) => set((state) => (
    ownerShowId === undefined || state.ownerShowId === ownerShowId ? { viewport } : state
  )),
  resetShowEditorView: (ownerShowId) => set({ ...showEditorViewInitialState, ownerShowId }),
}))
