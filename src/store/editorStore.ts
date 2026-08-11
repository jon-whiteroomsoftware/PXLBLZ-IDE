import { create } from 'zustand'
import type { PatternMetadata } from '@/engine/loadPattern'

export type CompileStatus = 'good' | 'broken'

// Which flavor of content the editor surface holds (#151). 'pattern' covers the
// existing pattern/demo flavors (Pixelblaze dialect, dialect-validated);
// 'map' is the custom-map authoring mode (plain JS, parse-only badge).
// 'mixin' is Pixelblaze-dialect source with a structured pass header.
// 'library' is Pixelblaze-dialect source with the library top-level content rule.
// The flavor selects the Monaco language and which validator feeds the badge.
export type EditorFlavor = 'pattern' | 'map' | 'mixin' | 'library'

// A draft whose navigation-time flush failed after its editor was already
// left (#810): the buffer is gone, so this holds the only copy for the Studio
// notice's Retry. recordUpdatedAt is the record timestamp when the write was
// attempted; Retry drops the draft instead of writing once the record has
// advanced past it.
export interface NavigationSaveDraft {
  flavor: EditorFlavor
  id: string
  name: string
  source: string
  recordUpdatedAt: number
}

interface EditorState {
  compileStatus: CompileStatus
  // True while the most recent autosave attempt for the open buffer failed
  // (offline, server error). Recorded by flushPendingAutosave (#810); read by
  // the save-status glyph and the beforeunload guard. Cleared by the first
  // successful save.
  autosaveFailed: boolean
  // Held navigation drafts, at most one per record; a later failed flush for
  // the same record supersedes its earlier draft. Empty while every
  // navigation flush has landed.
  navigationSaveFailures: NavigationSaveDraft[]
  editorFlavor: EditorFlavor
  source: string
  isReadOnly: boolean
  previewSource: string
  previewPatternName: string
  patternVars: string[]
  controls: PatternMetadata['controls']
  // The active pattern's native dimensionality (highest render fn) — drives the
  // read-only title-bar dimensionality indicator and the default layout on open.
  nativeDim: 1 | 2 | 3
  // The active map/sample dimension, independent of both Pattern capability and
  // viewport display dimension. Drives map predicates and renderer compatibility.
  mapDim: 1 | 2 | 3
  // The active LAYOUT's display dimensionality (the shape/map being drawn), which
  // can differ from `nativeDim` (a 1D pattern on a 3D shape displays as 3D). Gates
  // the viewport's camera control set (#129). This is a VIEWPORT concern
  // only — it is not the layout's coordinate dimension (that's `mapDim`), so a
  // 2D map wrapped onto a 3D cylinder has displayDim 3 but mapDim 2.
  displayDim: 1 | 2 | 3
  // The realized layout readout (e.g. "32×32", "8×8×8"), computed by Preview from
  // the actual arrangement, or null when there's no regular grid to show (a 1D
  // strip, or an irregular custom point cloud). Reflects the true geometry rather
  // than re-deriving it from the viewport dimension.
  layoutLabel: string | null
  // Whether the active embedding is solid-eligible: it supplies a
  // per-point normal, so the preview deck offers the solidity slider. Published
  // by Preview from the resolved layout (true exactly when a normal array is fed
  // to the renderer); the slider appears/disappears as a unit with it.
  solidEligible: boolean
  // Concise explanation when map and selected renderer dimensions differ.
  renderAdaptation: string | null
  setCompileStatus: (status: CompileStatus) => void
  setAutosaveFailed: (failed: boolean) => void
  setNavigationSaveFailures: (failures: NavigationSaveDraft[]) => void
  setEditorFlavor: (flavor: EditorFlavor) => void
  setSource: (source: string) => void
  setIsReadOnly: (value: boolean) => void
  setPreviewSource: (src: string) => void
  setPreviewPatternName: (name: string) => void
  setPatternVars: (vars: string[]) => void
  setControls: (controls: PatternMetadata['controls']) => void
  setNativeDim: (dim: 1 | 2 | 3) => void
  setMapDim: (dim: 1 | 2 | 3) => void
  setDisplayDim: (dim: 1 | 2 | 3) => void
  setLayoutLabel: (label: string | null) => void
  setSolidEligible: (value: boolean) => void
  setRenderAdaptation: (description: string | null) => void
}

export const editorInitialState = {
  compileStatus: 'good' as CompileStatus,
  autosaveFailed: false,
  navigationSaveFailures: [] as NavigationSaveDraft[],
  editorFlavor: 'pattern' as EditorFlavor,
  source: '',
  isReadOnly: true,
  previewSource: '',
  previewPatternName: '',
  patternVars: [] as string[],
  controls: [] as PatternMetadata['controls'],
  nativeDim: 2 as 1 | 2 | 3,
  mapDim: 2 as 1 | 2 | 3,
  displayDim: 2 as 1 | 2 | 3,
  layoutLabel: null as string | null,
  solidEligible: false,
  renderAdaptation: null as string | null,
}

export const useEditorStore = create<EditorState>()((set) => ({
  ...editorInitialState,
  setCompileStatus: (compileStatus) => set({ compileStatus }),
  setAutosaveFailed: (autosaveFailed) => set({ autosaveFailed }),
  setNavigationSaveFailures: (navigationSaveFailures) => set({ navigationSaveFailures }),
  setEditorFlavor: (editorFlavor) => set({ editorFlavor }),
  setSource: (source) => set({ source }),
  setIsReadOnly: (isReadOnly) => set({ isReadOnly }),
  setPreviewSource: (previewSource) => set({ previewSource }),
  setPreviewPatternName: (previewPatternName) => set({ previewPatternName }),
  setPatternVars: (patternVars) => set({ patternVars }),
  setControls: (controls) => set({ controls }),
  setNativeDim: (nativeDim) => set({ nativeDim }),
  setMapDim: (mapDim) => set({ mapDim }),
  setDisplayDim: (displayDim) => set({ displayDim }),
  setLayoutLabel: (layoutLabel) => set({ layoutLabel }),
  setSolidEligible: (solidEligible) => set({ solidEligible }),
  setRenderAdaptation: (renderAdaptation) => set({ renderAdaptation }),
}))
