import { Fragment, createContext, useCallback, useContext, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Activity, BookOpen, ChevronDown, ChevronRight, Clock3, Code2, Copy, Download, Eye, Flag, Grid2X2, Info, Layers3, Lightbulb, ListChecks, Lock, Magnet, Map as MapIcon, Maximize2, Move, PanelLeft, Pause, Play, Plus, Redo2, Repeat2, RotateCcw, RotateCw, Route, Scissors, Settings2, SkipBack, SlidersHorizontal, Square, Sun, Trash2, Undo2, WandSparkles, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberField as UiNumberField, type NumberFieldProps as UiNumberFieldProps } from '@/components/ui/number-field'
import { DraftTextField } from '@/components/ui/draft-text-field'
import { TimeField as UiTimeField, type TimeFieldProps as UiTimeFieldProps } from '@/components/ui/time-field'
import { PercentageField as UiPercentageField, type PercentageFieldProps as UiPercentageFieldProps } from '@/components/ui/percentage-field'
import { DomainNumberField as UiDomainNumberField, type DomainNumberFieldProps as UiDomainNumberFieldProps } from '@/components/ui/domain-number-field'
import { BoundedNumberField } from '@/components/ui/bounded-number-field'
import { formatDomainNumber } from '@/engine/domainNumberPresentation'
import { resolveLinearNumberPresentation } from '@/engine/linearNumberPresentation'
import { formatPercentageValue } from '@/engine/percentageValue'
import { formatShowTime, showBoundaryClipIdentity } from '@/engine/showClipIdentity'
import { presentShowDiagnostic } from '@/engine/showDiagnosticPresentation'
import { SHOW_ESCAPE_LAYER_RANK, registerShowEscapeLayer } from '@/engine/showEscapeLayers'
import {
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogRoot,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { PixelblazeCodeEditor } from '@/components/PixelblazeCodeEditor'
import { ShowZoneSpatialSelector } from '@/components/ShowZoneSpatialSelector'
import { ShowEntityDetailPanel } from '@/components/ShowEntityDetailPanel'
import { ShowPropertySparkline } from '@/components/ShowPropertySparkline'
import { describePropertyLaneHover, resolvePropertyLaneDisplayLabels } from '@/engine/showPropertyLaneLabels'
import { propertyLaneFamilyColor, type ShowPropertyLaneFamily } from '@/engine/showPropertyLaneFamilies'
import { ShowPropertyLaneFamilyGlyph } from '@/components/ShowPropertyLaneFamilyGlyph'
import { ShowClipEntityDetail, type ShowClipEntityDetailHandle } from '@/components/ShowClipEntityDetail'
import { formatAngleValue } from '@/engine/anglePresentation'
import { ShowPropertyAnimationProvider } from '@/components/ShowPropertyAnimationEditor'
import { ShowPatternInstanceControls } from '@/components/ShowPatternInstanceControls'
import { ShowTransitionPalette, ShowTransitionParameters } from '@/components/ShowTransitionAuthoring'
import { ShowLayerTransitionPalette } from '@/components/ShowLayerTransitionPalette'
import { ShowLayerTransitionEditor } from '@/components/ShowLayerTransitionEditor'
import { ShowTransitionXrayPictogram } from '@/components/ShowTransitionXrayPictogram'
import { ShowArtifactInventoryPopover } from '@/components/ShowArtifactInventoryPopover'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import { PatternDeploymentActions } from '@/components/PatternDeploymentActions'
import { PatternCombobox, type PatternComboboxOption } from '@/components/PatternCombobox'
import { InlineEntityTitle } from '@/components/InlineEntityTitle'
import { showRecordClipCount } from '@/engine/showClipInvariant'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { PatternPushChoices } from '@/components/SendToController'
import { PushConfirmPopover } from '@/components/PushConfirmPopover'
import { describeSendToController, isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { prepareShowControllerArtifact } from '@/engine/showControllerArtifact'
import { controllerProfileArtifactSignature } from '@/engine/controllerProfilePassRecipe'
import { assessShowCompilePressure } from '@/engine/showCompilePressure'
import type { ArtifactMapClass } from '@/engine/artifactStamp'
import { trackEvent } from '@/analytics'
import {
  addShowRoutingLayout,
  projectShowStrip,
  showSplitCapability,
  formatShowRoutingRanges,
  parseShowRoutingRanges,
  showLoopDurationMs,
  projectShowTimeline,
  showRoutingTransitionAfter,
  showVisualTransitionAfter,
  transitionCost,
  updateShowBoundaryTransition,
  ZONE_COLORS,
  showRoutingLayoutKindLabel,
} from '@/engine/showModel'
import {
  compileShowForArtifact,
  resolveShowCompilationControllerZones,
  sourceForShowCell,
  sourceForShowPatternRef,
  type CompiledShowState,
} from '@/engine/showPreviewArtifact'
import {
  deleteShowMainPlacement,
  deleteShowOverlayPlacement,
  projectFlatShowToCompositionV1WithCellOrigins,
} from '@/engine/showCompositionModel'
import {
  projectGlobalShowPropertyLane,
  projectGlobalShowScenePropertyLanes,
} from '@/engine/showPropertyLaneProjection'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { updateShowPhysicalZoneSelection } from '@/engine/showSpatialSelection'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { discoverAutomatablePatternControls, type AutomatablePatternControl } from '@/engine/showPatternControls'
import {
  projectCompositionShowClipSummary,
  projectGlobalShowClipSummary,
  projectShowClipTimelineSummary,
  showClipSummaryDestination,
  showClipInlineSummary,
  type ShowClipSummaryDestination,
  type ShowClipSummaryItem,
  type ShowClipSummaryKind,
  type ShowClipSummarySection,
} from '@/engine/showClipSummary'
import {
  projectShowClipInspector,
  updateShowClipInspector,
  type ShowClipInspectorOwner,
  type ShowClipInspectorPatch,
} from '@/engine/showClipInspectorModel'
import {
  addShowPropertyKeyframe,
  addShowPropertyTrack,
  deleteShowPropertyKeyframe,
  deleteShowPropertyTrack,
  updateShowPropertyKeyframe,
} from '@/engine/showPropertyAnimation'
import {
  applyShowGroupPropertyAnimationChange,
  buildShowPropertyAnimationOptions,
  projectShowPropertyAnimationEditorContext,
  type ShowPropertyAnimationChange,
  type ShowPropertyAnimationEditorContext,
  type ShowPropertyAnimationStorageOwner,
} from '@/engine/showPropertyAnimationEditorModel'
import {
  beginFineAdjust,
  moveFineAdjust,
  type FineAdjustDrag,
} from '@/engine/fineAdjust'
import {
  fitShowTimelineViewport,
  panShowTimelineViewport,
  resizeShowTimelineViewport,
  showTimelineQuantizeStepMs,
  showTimelineRulerTicks,
  showTimelineThumb,
  snapShowTimelineTime,
  zoomShowTimelineViewport,
  type ShowTimelineViewport,
} from '@/engine/showTimelineViewport'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
  type ShowUnifiedTimelineJunctionProjection,
  type ShowUnifiedTimelineLayerProjection,
} from '@/engine/showUnifiedTimelineProjection'
import {
  nextShowTimelineTraversalTarget,
  projectShowTimelineTraversalTargets,
  showTimelineTraversalTargetKey,
  type ShowTimelineTraversalTarget,
} from '@/engine/showTimelineKeyboard'
import { claimStudioPreviewSpace } from '@/engine/keyboardShortcuts'
import {
  addShowClipAtGlobalTimeExtendingShow,
  addShowOverlayLayerAcrossTimeline,
  duplicateShowClipAfter,
  duplicateShowClipAtGlobalTime,
  makeShowClipPatternIndependent,
  planShowClipAtGlobalTime,
  planShowClipAtTopmostAvailableLayer,
  planShowClipDuplicateAfter,
  planShowClipSplitAtGlobalTime,
  projectShowClipPatternInstanceOwnership,
  rejoinShowClipPatternInstance,
  splitShowClipAtGlobalTime,
  type ShowTimelineClipMoveTarget,
  type ShowTimelineClipOwner,
  type ShowClipAddTarget,
} from '@/engine/showTimelineClipAuthoring'
import {
  deleteShowClipWithLayerTransitions,
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
  moveShowConnectedClipInShowAtGlobalTime,
  planShowGroupLayerTransitionInsertion,
  planShowLayerTransitionInsertion,
  planShowLayerTransitionInsertionForClip,
  resizeShowLayerTransition,
  resizeShowConnectedClipAtGlobalTime,
  resizeShowConnectedClipInShowAtGlobalTime,
  resetShowLayerTransitionToCut,
  showLayerTransitionsConnectedToClip,
} from '@/engine/showLayerTransitionAuthoring'
import {
  completeShowGroupSelection,
  createShowGroupFromSelection,
  deleteShowGroupOccurrence,
  duplicateShowGroupOccurrence,
  insertShowGroupLayerTransition,
  makeShowGroupOccurrenceUnique,
  projectShowGroupRuntimePatternInstances,
  resizeShowGroupLayerTransition,
  translateShowGroupOccurrence,
  ungroupShowGroupOccurrence,
  updateShowGroupOccurrencePlacement,
  validateShowGroups,
  validateShowGroupSelection,
  type ShowGroupSelection,
} from '@/engine/showGroupModel'
import {
  projectShowGroupClipInspector,
  updateShowGroupClipInspector,
  type ShowGroupClipOwner,
} from '@/engine/showGroupClipInspectorModel'
import {
  addShowTimelineMarker,
  insertShowTime,
  moveShowTimelineMarker,
  planShowTimeInsertion,
  removeShowTimelineMarker,
  setShowEndMs,
  showTimelineContentEndMs,
  updateShowTimelineMarker,
} from '@/engine/showTimelineAuthoring'
import { buildShowEpeExport, type ShowEpeExport } from '@/engine/showEpeExport'
import {
  buildDeliveredShowSourceInventory,
  buildShowArtifactInventoryModel,
  deliveredShowSourceBytes,
  describeShowArtifactPatterns,
  type DeliveredShowSourceInventory,
  type ShowArtifactInventoryModel,
} from '@/engine/showSourceInventory'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'
import { showKeyboardSeekStepMs } from '@/engine/showKeyboardSeek'
import { SHOW_EASING_OPTIONS, showEasingFromOptionId, showEasingOptionId } from '@/engine/showEasing'
import {
  applyShowPatternSlotSelections,
  currentShowReferenceExample,
  restoreShowReferencePatternSlots,
  type ShowPatternSlotGroup,
  type ShowReferenceGuide,
} from '@/engine/showReferenceShow'
import { exportedDims } from '@/engine/exportedDims'
import {
  showBoundaryTransitionParameterChanges,
  showBoundaryTransitionPresentationKey,
  showTransitionChangesForPresentation,
} from '@/engine/showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue } from '@/engine/showVisualToolkitPresentation'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  type ControllerProfile,
  type ControllerZone,
} from '@/engine/controllerProfile'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { resolveMap, STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { applyNormalizeMode } from '@/engine/maps'
import { buildStudioMapFingerprintCandidates } from '@/engine/mapFingerprint'
import {
  resolveInstalledMapIdentity,
  type InstalledMapSnapshot,
  type LiveInstalledMapState,
} from '@/engine/installedMapObservation'
import { usePreviewStore } from '@/store/previewStore'
import {
  canAdvanceShowPlayback,
  resolveShowPlaybackStep,
  useShowTransportStore,
} from '@/store/showTransportStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import { useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { docExternalHref } from '@/docs/catalog'
import { stockShowById, type StockShowNote } from '@/pixelblaze/stock/shows'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type {
  MapRecord,
  ShowBoundaryTransition,
  ShowCell,
  ShowClipTransform,
  ShowCompositionV1,
  ShowGroupDefinition,
  ShowGroupOccurrence,
  ShowLayerTransition,
  ShowRecord,
  ShowOutputEffect,
  ShowRoutingLayout,
  ShowAutomatableProperty,
} from '@/engine/personalContentRecords'
import { DEFAULT_SHOW_TRAILS_RETENTION, normalizeShowOutputEffects } from '@/engine/showPreviousRgbFeedback'
import { normalizeShowClipTransform } from '@/engine/showClipTransform'
import { validateShowLogicalRouting, type ShowLogicalRouting } from '@/engine/showLogicalRouting'
import {
  appendShowLayoutInterval,
  duplicateShowLayoutInterval,
  insertShowLayoutInterval,
  makeShowLayoutIntervalUnique,
  projectShowLayoutIntervals,
  showLayoutIntervalAtTime,
  showLayoutIntervalPercentBounds,
  showLayoutZoneIdAtTime,
  type ShowLayoutInterval,
} from '@/engine/showLayoutIntervals'

const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const compactField =
  'h-6 rounded border border-zinc-700 bg-zinc-950 px-1.5 text-[9.5px] text-zinc-200 outline-none focus:border-live/70'
const transitionRuleUnderField =
  'h-7 border-0 border-b border-zinc-700 bg-transparent px-1 text-xs text-zinc-200 outline-none focus:border-live/70'
const EMPTY_ZONE_IDS: string[] = []
const JUMPS_PER_SECOND_PRESENTATION = resolveLinearNumberPresentation({
  kindLabel: 'rate',
  suffix: '/s',
  min: 0.25,
  max: 30,
  step: 0.25,
  sliderMin: 0.25,
  sliderMax: 30,
  sliderStep: 0.25,
  detentStep: 1,
  detentMagnet: 0.12,
  labelStep: 5,
})
const clipBase =
  'show-timeline-clip z-10 flex flex-col justify-center gap-px overflow-hidden rounded-none border-0 border-l-2 px-2 py-0.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live'

function showTimelineToolbarControlClass(input: {
  enabled: boolean
  active?: boolean
}): string {
  if (!input.enabled) {
    return 'bg-transparent hover:bg-transparent cursor-not-allowed text-zinc-700 opacity-100 hover:text-zinc-700 disabled:pointer-events-auto disabled:opacity-100'
  }
  if (input.active) {
    return 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/15 hover:text-amber-200 active:bg-amber-400/20 active:text-amber-100 aria-expanded:bg-amber-400/10 aria-expanded:text-amber-300'
  }
  return 'bg-transparent text-zinc-400 hover:bg-amber-400/10 hover:text-amber-200 active:bg-amber-400/20 active:text-amber-100 aria-expanded:bg-amber-400/10 aria-expanded:text-amber-300'
}

function ShowEasingOptions() {
  return SHOW_EASING_OPTIONS.map((option) => (
    <option key={option.id} value={option.id}>{option.label}</option>
  ))
}

/**
 * Zone rail widths for the timeline's sticky first column. The open rail holds a
 * disclosure control, the Zone name with its nominal pixel count, and a
 * properties control; the micro rail holds only the Zone glyph picker.
 */

const ZONE_RAIL_OPEN_PX = 108
const ZONE_RAIL_MICRO_PX = 32

type ShowSelection =
  | { kind: 'clip'; clipId: string }
  | { kind: 'transition'; transitionId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'zone-layout'; layoutId: string }
  | { kind: 'group'; occurrenceId: string }
  | { kind: 'group-clip'; occurrenceId: string; placementId: string }
  | { kind: 'multi'; groupSelection: ShowGroupSelection }
  | { kind: 'show' }

type BlockedDeleteFeedback = {
  selectionKey: string
  token: number
}

function showSelectionKey(selection: ShowSelection): string {
  if (selection.kind === 'clip') return `clip:${selection.clipId}`
  if (selection.kind === 'transition') return `transition:${selection.transitionId}`
  if (selection.kind === 'zone') return `zone:${selection.zoneId}`
  if (selection.kind === 'zone-layout') return `zone-layout:${selection.layoutId}`
  if (selection.kind === 'group') return `group:${selection.occurrenceId}`
  if (selection.kind === 'group-clip') return `group-clip:${selection.occurrenceId}:${selection.placementId}`
  if (selection.kind === 'multi') return 'multi'
  return 'show'
}

function sameShowSelection(left: ShowSelection, right: ShowSelection): boolean {
  return showSelectionKey(left) === showSelectionKey(right)
}

function showGroupOccurrenceExists(
  show: ShowRecord,
  composition: ShowCompositionV1 | null | undefined,
  occurrenceId: string,
): boolean {
  const occurrence = composition?.groupOccurrences?.find((candidate) => candidate.id === occurrenceId)
  if (!occurrence) return false
  return show.scenes.some((scene) => scene.id === occurrence.sceneId)
    && show.zones.some((zone) => zone.id === occurrence.zoneId)
    && Boolean(composition?.scenes.some((scene) => (
      scene.sceneId === occurrence.sceneId
      && scene.zones.some((zone) => zone.zoneId === occurrence.zoneId)
    )))
}

function showSelectionExists(
  show: ShowRecord,
  composition: ShowCompositionV1 | null | undefined,
  selection: ShowSelection,
): boolean {
  if (selection.kind === 'show') return true
  if (selection.kind === 'clip') {
    return show.cells.some((cell) => cell.id === selection.clipId)
      || Boolean(findTimelineClipOwner(composition, selection.clipId))
  }
  if (selection.kind === 'transition') {
    return show.transitions.some((transition) => transition.id === selection.transitionId)
  }
  if (selection.kind === 'zone') return show.zones.some((zone) => zone.id === selection.zoneId)
  if (selection.kind === 'zone-layout') {
    return show.routingLayouts.some((layout) => layout.id === selection.layoutId)
  }
  if (selection.kind === 'group') {
    return showGroupOccurrenceExists(show, composition, selection.occurrenceId)
  }
  if (selection.kind === 'group-clip') {
    if (!showGroupOccurrenceExists(show, composition, selection.occurrenceId)) return false
    const occurrence = composition?.groupOccurrences?.find((candidate) => candidate.id === selection.occurrenceId)
    const definition = composition?.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
    return Boolean(definition?.placements.some((placement) => placement.id === selection.placementId))
  }
  return selection.groupSelection.placementIds.every((placementId) => (
    Boolean(findTimelineClipOwner(composition, placementId))
  ))
}

function showSelectionTraversalTarget(selection: ShowSelection): ShowTimelineTraversalTarget | null {
  if (selection.kind === 'clip') return { kind: 'clip', clipId: selection.clipId }
  if (selection.kind === 'group') return { kind: 'group', occurrenceId: selection.occurrenceId }
  if (selection.kind === 'group-clip') {
    return { kind: 'group-clip', occurrenceId: selection.occurrenceId, placementId: selection.placementId }
  }
  return null
}

function traversalTargetShowSelection(target: ShowTimelineTraversalTarget): ShowSelection {
  if (target.kind === 'clip') return { kind: 'clip', clipId: target.clipId }
  if (target.kind === 'group') return { kind: 'group', occurrenceId: target.occurrenceId }
  return { kind: 'group-clip', occurrenceId: target.occurrenceId, placementId: target.placementId }
}

function findShowSelectionAnchor(selection: ShowSelection): HTMLElement | null {
  const key = showSelectionKey(selection)
  return [...document.querySelectorAll<HTMLElement>('[data-show-selection-key]')]
    .find((element) => element.dataset.showSelectionKey === key) ?? null
}

function findCompositionClipOwner(
  composition: ShowCompositionV1 | null | undefined,
  placementId: string,
): ShowClipInspectorOwner | null {
  if (!composition) return null
  for (const scene of composition.scenes) {
    for (const zone of scene.zones) {
      if (zone.main.some((placement) => placement.id === placementId)) {
        return { kind: 'scene-main', sceneId: scene.sceneId, zoneId: zone.zoneId, placementId }
      }
      for (const layer of zone.overlays) {
        if (layer.placements.some((placement) => placement.id === placementId)) {
          return {
            kind: 'scene-overlay',
            sceneId: scene.sceneId,
            zoneId: zone.zoneId,
            layerId: layer.id,
            placementId,
          }
        }
      }
    }
  }
  return null
}

function findTimelineClipOwner(
  composition: ShowCompositionV1 | null | undefined,
  placementId: string,
): ShowTimelineClipOwner | null {
  const owner = findCompositionClipOwner(composition, placementId)
  if (!owner) return null
  if (owner.kind === 'global') return null
  return owner.kind === 'scene-main'
    ? {
        kind: 'main',
        sceneId: owner.sceneId,
        zoneId: owner.zoneId,
        placementId: owner.placementId,
      }
    : {
        kind: 'overlay',
        sceneId: owner.sceneId,
        zoneId: owner.zoneId,
        layerId: owner.layerId,
        placementId: owner.placementId,
      }
}

type ShowPatternOption = {
  label: string
  ref: ShowCell['pattern']
  group: PatternComboboxOption['group']
}

type ShowLayerTransitionTarget = {
  junction: ShowUnifiedTimelineJunctionProjection
  fromName: string
  toName: string
  anchor: HTMLElement
  groupOccurrenceId?: string
}

type TimelineMarkerFeedback =
  | { kind: 'drag'; timeMs: number }
  | { kind: 'confirmation'; timeMs: number }

type ShowClipMovePreview = {
  clipId: string
  mode: 'move' | 'duplicate'
  targetKey: string
  startMs: number
  durationMs: number
  /**
   * True only for a boundary-magnetized landing. Grid-quantized landings are
   * not sticky — the grid exists everywhere, so there is no detent to defend
   * against a last-moment pointer shake (#667).
   */
  snapped: boolean
}

type ShowClipMovePlan = {
  preview: ShowClipMovePreview
  sourceComposition: ShowCompositionV1
  composition: ShowCompositionV1
  owner: ShowTimelineClipOwner
  target: ShowTimelineClipMoveTarget
  mode: 'move' | 'duplicate'
}

type ShowClipResizePreview = {
  clipId: string
  startMs: number
  durationMs: number
}

type ShowClipResizePlan = {
  preview: ShowClipResizePreview
  sourceComposition: ShowCompositionV1
  composition: ShowCompositionV1
  owner: ShowTimelineClipOwner
}

// Width at or below which the lesson note folds its two columns behind the
// Details disclosure. The note is the teaching surface, so it keeps its full
// layout well past the point the timeline itself starts to crowd (#363).
export const SHOW_NOTE_COMPACT_WIDTH_PX = 560

function ShowNoteTrigger({ note, open, onToggle }: {
  note: StockShowNote
  open: boolean
  onToggle: () => void
}) {
  const numberLabel = note.number ? `${note.number} ` : ''
  const actionLabel = open ? 'Collapse' : 'Open'
  return (
    <button
      type="button"
      aria-label={`${actionLabel} ${numberLabel}${note.title} guide`}
      aria-expanded={open}
      title={`${actionLabel} ${numberLabel}${note.title} guide`}
      className={`show-note-trigger inline-flex h-5 shrink-0 items-center gap-1 rounded border px-1.5 text-[10px] uppercase tracking-wide focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-200 ${open
        ? 'border-cyan-200/50 bg-cyan-400/15 text-cyan-100 hover:bg-cyan-400/25'
        : 'border-cyan-200/30 bg-cyan-400/[0.07] text-cyan-100/80 hover:border-cyan-200/50 hover:bg-cyan-400/15 hover:text-cyan-100'}`}
      onClick={onToggle}
    >
      <BookOpen size={11} aria-hidden />
      {note.number ? 'Lesson' : 'Guide'}
    </button>
  )
}

// The Try with Pattern row: one narrow picker per slot group in timeline
// order plus one Reset, identical for lessons and reference Showcases (#63).
// A single group keeps the classic "Try with Pattern" label; multiple groups
// read "Pattern 1..n" and the picked names mirror the Clips on the timeline.
function ShowPatternSlotPicker({
  show,
  slotGroups,
  patternOptions,
  selections,
  onSelectPattern,
}: {
  show: ShowRecord
  slotGroups: readonly ShowPatternSlotGroup[]
  patternOptions: ShowPatternOption[]
  selections?: Readonly<Record<number, ShowCell['pattern']>>
  onSelectPattern: (slotIndex: number, pattern: ShowCell['pattern']) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      {slotGroups.map((group, index) => {
        const authoredPattern = show.cells.find((cell) => group.cellIds.includes(cell.id))?.pattern
          ?? show.composition?.patternInstances.find((instance) => group.instanceIds.includes(instance.id))?.pattern
        const activePattern = selections?.[index] ?? authoredPattern
        const activeValue = activePattern ? `${activePattern.kind}:${activePattern.id}` : null
        const label = slotGroups.length === 1 ? 'Try with Pattern' : `Pattern ${index + 1}`
        return (
          <label
            key={group.instanceIds.join(':') || index}
            className="w-44 min-w-0 font-semibold uppercase tracking-[0.09em] text-zinc-500"
          >
            {label}
            <PatternCombobox
              ariaLabel={label}
              value={activeValue}
              options={patternOptions.map((option) => ({
                value: `${option.ref.kind}:${option.ref.id}`,
                label: option.label,
                group: option.group,
              }))}
              compact
              className="mt-1"
              onChange={(value) => {
                const option = patternOptions.find((candidate) => `${candidate.ref.kind}:${candidate.ref.id}` === value)
                if (option) onSelectPattern(index, option.ref)
              }}
            />
          </label>
        )
      })}
    </div>
  )
}

function ShowNoteDisclosure({
  note,
  show,
  reference,
  patternSlots,
  patternOptions,
  selections,
  onSelectPattern,
  onCollapse,
}: {
  note: StockShowNote
  show: ShowRecord
  reference?: ShowReferenceGuide
  patternSlots?: readonly ShowPatternSlotGroup[]
  patternOptions: ShowPatternOption[]
  selections?: Readonly<Record<number, ShowCell['pattern']>>
  onSelectPattern: (slotIndex: number, pattern: ShowCell['pattern']) => void
  onCollapse: () => void
}) {
  const title = note.number ? `${note.number} ${note.title}` : note.title
  const sectionRef = useRef<HTMLElement>(null)
  const [compactMode, setCompactMode] = useState(false)
  const [compactExpanded, setCompactExpanded] = useState(false)
  useEffect(() => {
    const section = sectionRef.current
    if (!section) return
    const update = () => {
      const width = section.getBoundingClientRect().width
      setCompactMode(width > 0 && width <= SHOW_NOTE_COMPACT_WIDTH_PX)
    }
    update()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(update)
    observer.observe(section)
    return () => observer.disconnect()
  }, [])
  const compactContentHidden = compactMode && !compactExpanded
  return (
    <section
      ref={sectionRef}
      role="region"
      aria-label={`${title} guide`}
      data-compact-expanded={compactExpanded}
      className="shrink-0 select-none border-b border-cyan-200/20 bg-[#0d171b] text-[10px]"
    >
      <div className="flex h-8 items-center">
        <button
          type="button"
          aria-label={`Collapse ${note.number ? `${note.number} ` : ''}guide`}
          className="flex h-8 min-w-0 flex-1 items-center gap-2 px-3 text-left hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-cyan-200"
          onClick={onCollapse}
        >
          <Info size={12} aria-hidden className="shrink-0 text-cyan-200/80" />
          <span className="shrink-0 font-semibold uppercase tracking-[0.1em] text-cyan-200/85">{note.label}</span>
          <strong className="truncate font-medium text-zinc-200">{note.number ? `${note.number} · ` : ''}{note.title}</strong>
          <ChevronDown size={12} aria-hidden className="ml-auto shrink-0 rotate-180 text-zinc-500" />
        </button>
        <button
          type="button"
          aria-label="Show guide details"
          aria-expanded={compactExpanded}
          className="show-note-compact-toggle h-6 shrink-0 items-center gap-1 border-l border-zinc-800 px-2 text-[10px] text-cyan-100/70 hover:bg-white/[0.035] hover:text-cyan-100"
          onClick={() => setCompactExpanded((expanded) => !expanded)}
        >
          Details
          <ChevronDown size={10} aria-hidden className={compactExpanded ? 'rotate-180' : ''} />
        </button>
      </div>
      {patternSlots && (
        <div
          role="group"
          aria-label={`${title} Pattern slots`}
          className="show-note-expanded-content border-t border-cyan-200/15 bg-cyan-200/[0.025] px-3 py-2"
          aria-hidden={compactContentHidden || undefined}
          inert={compactContentHidden || undefined}
        >
          <ShowPatternSlotPicker
            show={show}
            slotGroups={patternSlots}
            patternOptions={patternOptions}
            selections={selections}
            onSelectPattern={onSelectPattern}
          />
        </div>
      )}
      {reference && (
        <div
          className="show-note-expanded-content"
          aria-hidden={compactContentHidden || undefined}
          inert={compactContentHidden || undefined}
        >
          <ShowReferenceInstrument
            show={show}
            reference={reference}
          />
        </div>
      )}
      <div
        className="show-note-expanded-content grid grid-cols-[minmax(0,1.45fr)_minmax(220px,1fr)] gap-4 border-t border-zinc-800/80 px-3 py-2.5 max-[720px]:grid-cols-1 max-[720px]:gap-2"
        aria-hidden={compactContentHidden || undefined}
        inert={compactContentHidden || undefined}
      >
        <div>
          {(() => {
            // A purpose with newlines renders as a lead sentence plus terse
            // bullets (#63); single-paragraph purposes render as before.
            const [lead, ...items] = note.purpose.split('\n').filter((line) => line.trim() !== '')
            return (
              <>
                <p className="max-w-[72ch] leading-4 text-zinc-300">{lead}</p>
                {items.length > 0 && (
                  <ul className="mt-1 max-w-[72ch] space-y-0.5 text-zinc-300">
                    {items.map((line) => (
                      <li key={line} className="flex gap-1.5">
                        <i aria-hidden className="mt-[5px] size-1 shrink-0 rounded-full bg-zinc-500" />
                        <span className="leading-4">{line}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )
          })()}
          <p className="mt-1.5 flex items-start gap-1.5 leading-4 text-zinc-500">
            <Lightbulb size={11} aria-hidden className="mt-0.5 shrink-0 text-zinc-500" />
            <span><b className="font-medium text-zinc-400">Notice:</b> {note.notice}</span>
          </p>
        </div>
        <div className="border-l border-zinc-800 pl-3 max-[720px]:border-l-0 max-[720px]:border-t max-[720px]:pl-0 max-[720px]:pt-2">
          <span className="flex items-center gap-1 font-semibold uppercase tracking-[0.09em] text-zinc-400">
            <ListChecks size={10} aria-hidden className="text-zinc-500" /> Try this
          </span>
          <ul className="mt-1.5 space-y-1 text-zinc-400">
            {note.prompts.map((prompt) => (
              <li key={prompt} className="flex gap-1.5">
                <i aria-hidden className="mt-[5px] size-1 shrink-0 rounded-full bg-zinc-600" />
                <span>{prompt}</span>
              </li>
            ))}
          </ul>
          <a
            href={`${docExternalHref(note.guide.documentId)}#${note.guide.heading}`}
            className="mt-2 inline-flex h-7 items-center gap-1.5 border border-zinc-700 bg-zinc-900/65 px-2 text-zinc-300 hover:border-zinc-500 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-cyan-200"
          >
            <BookOpen size={10} aria-hidden />
            {note.guide.label}
            <ChevronRight size={10} aria-hidden />
          </a>
        </div>
      </div>
    </section>
  )
}

function ShowReferenceInstrument({
  show,
  reference,
}: {
  show: ShowRecord
  reference: ShowReferenceGuide
}) {
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const current = currentShowReferenceExample(show, reference, positionMs)
  const currentIndex = current ? reference.examples.findIndex((example) => example.id === current.id) : -1
  const durationMs = showLoopDurationMs(show)
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const easingOption = current?.easing
    ? SHOW_EASING_OPTIONS.find((option) => option.id === showEasingOptionId(current.easing!))
    : undefined

  return (
    <div
      role="group"
      aria-label={`${show.name} reference controls`}
      className="border-t border-cyan-200/15 bg-cyan-200/[0.025] px-3 py-2"
    >
      <div className="min-w-0">
        <span className="font-semibold uppercase tracking-[0.11em] text-cyan-200/70">Reference mode</span>
        <p className="mt-0.5 max-w-[80ch] leading-4 text-zinc-400">{reference.summary}</p>
      </div>
      <div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-1 border-l-2 border-cyan-200/45 bg-zinc-950/45 px-2 py-1.5">
        <span className="font-semibold uppercase tracking-[0.1em] text-cyan-200/65">Live example</span>
        <span className="min-w-0 truncate">
          <strong className="font-medium text-zinc-100">{current?.label ?? 'Reference frame'}</strong>
          <span className="ml-2 text-zinc-500">{current?.detail ?? 'The fixed comparison source before the first example.'}</span>
        </span>
        <span className="tabular-nums text-zinc-600">
          {currentIndex >= 0 ? `${currentIndex + 1}/${reference.examples.length}` : `0/${reference.examples.length}`}
        </span>
        <span aria-hidden className="col-span-2 col-start-1 h-px overflow-hidden bg-zinc-800">
          <i className="block h-full bg-cyan-200/70" style={{ width: `${progress * 100}%` }} />
        </span>
        {easingOption && (
          <svg
            role="img"
            aria-label={`${easingOption.label} easing curve`}
            viewBox="0 0 48 20"
            className="row-span-2 h-5 w-12 text-cyan-200/80"
          >
            <polyline
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              points={easingOption.samples.map((sample) => `${sample.progress * 48},${18 - sample.value * 16}`).join(' ')}
            />
          </svg>
        )}
      </div>
    </div>
  )
}

interface ShowDeliverySnapshot {
  show: ShowRecord
  controllerIp: string | null
  artifact: NonNullable<CompiledShowState['artifact']>
  prepared: ReturnType<typeof prepareShowControllerArtifact>
}

interface ShowCompilationSnapshot {
  show: ShowRecord
  userMaps: MapRecord[]
  artifact: NonNullable<CompiledShowState['artifact']>
  canonicalExport: ShowEpeExport
}

function buildControllerCompatibilityContext(
  profile: ControllerProfile | undefined,
  maps: MapRecord[],
  observation: InstalledMapSnapshot | LiveInstalledMapState | undefined,
) {
  const pixelCount = profile?.lastKnownPixelCount
  const identity = observation?.status === 'present'
    ? resolveInstalledMapIdentity({
        observation,
        profile,
        candidates: buildStudioMapFingerprintCandidates({
          userMaps: maps,
          pixelCount: observation.pointCount,
        }),
      })
    : null
  const installedMap = identity && identity.kind !== 'historical'
    ? [...STOCK_MAPS, ...maps].find((map) => map.id === identity.id)
    : undefined
  const mapClass = installedMap
    ? ('kind' in installedMap ? installedMap.kind : 'custom') as ArtifactMapClass
    : undefined
  return {
    ...(pixelCount !== undefined ? { pixelCount } : {}),
    ...(observation?.status === 'present'
      ? {
          map: {
            ...(identity?.id ? { id: identity.id } : {}),
            ...(identity?.name ? { name: identity.name } : {}),
            fingerprint: observation.fingerprint,
            ...(mapClass ? { mapClass } : {}),
          },
        }
      : {}),
  }
}

export function ShowEditor({
  showId,
  showOverride,
  readOnly = false,
  builtInContext,
  headerGuideTarget = null,
  headerActionsTarget = null,
  transportClockActive = false,
  onOpenStagePreview,
}: {
  showId: string
  showOverride?: ShowRecord
  readOnly?: boolean
  builtInContext?: {
    track: 'portable' | 'installation'
    lesson: string
    description: string
    note?: StockShowNote
    patternSlots?: readonly ShowPatternSlotGroup[]
    reference?: ShowReferenceGuide
  }
  headerGuideTarget?: HTMLElement | null
  headerActionsTarget?: HTMLElement | null
  transportClockActive?: boolean
  onOpenStagePreview?: (anchor: HTMLElement) => void
}) {
  useLayoutEffect(() => {
    usePreviewStore.getState().setRunning(false)
  }, [showId])

  const savedShow = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const stockShowDraft = useShowStore((state) => state.stockShowDrafts[showId])
  const hasStockDraft = stockShowDraft !== undefined
  const resetStockShowDraft = useShowStore((state) => state.resetStockShowDraft)
  const persistShow = useShowStore((state) => state.updateShow)
  const updateBoundaryTransition = useShowStore((state) => state.updateBoundaryTransition)
  const removeBoundaryTransition = useShowStore((state) => state.removeBoundaryTransition)
  const removeClip = useShowStore((state) => state.removeClip)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellControlTarget = useShowStore((state) => state.updateCellControlTarget)
  const updateCellRestartOnEntry = useShowStore((state) => state.updateCellRestartOnEntry)
  const spanCellZones = useShowStore((state) => state.spanCellZones)
  const updateCellZoneMode = useShowStore((state) => state.updateCellZoneMode)
  const addZone = useShowStore((state) => state.addZone)
  const updateZone = useShowStore((state) => state.updateZone)
  const removeZone = useShowStore((state) => state.removeZone)
  const showNoteOpen = useShowEditorSessionStore((state) => (
    state.showNoteOpenById[showId] ?? builtInContext?.note?.defaultOpen ?? false
  ))
  const setShowNoteOpen = useShowEditorSessionStore((state) => state.setShowNoteOpen)
  const selectedReferencePatterns = useShowEditorSessionStore((state) => state.referencePatternsByShowId[showId])
  const setReferencePattern = useShowEditorSessionStore((state) => state.setReferencePattern)
  const clearReferencePatterns = useShowEditorSessionStore((state) => state.clearReferencePatterns)
  const addRoutingLayout = useShowStore((state) => state.addRoutingLayout)
  const updateRoutingLayout = useShowStore((state) => state.updateRoutingLayout)
  const removeRoutingLayout = useShowStore((state) => state.removeRoutingLayout)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const activeIp = useControllerStore((state) => state.activeIp)
  const activeController = useControllerStore((state) => (state.activeIp ? state.controllers[state.activeIp] : undefined))
  const controllerPushing = useControllerStore((state) => state.pushing)
  const controllerPushResult = useControllerStore((state) => state.pushResult)
  const lastPushedSource = useControllerStore((state) => state.lastPushedSource)
  const lastRunProgramId = useControllerStore((state) => state.lastRunProgramId)
  const lastSavedSource = useControllerStore((state) => state.lastSavedSource)
  const lastPushedProfileSignature = useControllerStore((state) => state.lastPushedProfileSignature)
  const lastSavedProfileSignature = useControllerStore((state) => state.lastSavedProfileSignature)
  const activeProgramId = useControllerPanelStore((state) => state.activeProgramId)
  const pushGeneratedArtifact = useControllerStore((state) => state.pushGeneratedArtifact)
  const clearPushResult = useControllerStore((state) => state.clearPushResult)
  const [selection, setSelection] = useState<ShowSelection>({ kind: 'show' })
  const [isolatedGroupOccurrenceId, setIsolatedGroupOccurrenceId] = useState<string | null>(null)
  const [generatedSnapshot, setGeneratedSnapshot] = useState<ShowCompilationSnapshot | null>(null)
  const [showSendMode, setShowSendMode] = useState<SendMode>('run')
  const [pendingSendMode, setPendingSendMode] = useState<SendMode | null>(null)
  const pendingDeliveryRef = useRef<ShowDeliverySnapshot | null>(null)
  const [preparingSave, setPreparingSave] = useState(false)
  const [compositionClipPendingDelete, setCompositionClipPendingDelete] = useState<ShowTimelineClipOwner | null>(null)
  const [blockedDeleteFeedback, setBlockedDeleteFeedback] = useState<BlockedDeleteFeedback | null>(null)
  const blockedDeleteFeedbackSequenceRef = useRef(0)
  const [spatialZoneSelection, setSpatialZoneSelection] = useState<{ zoneId: string; layoutId: string } | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailAnchor, setDetailAnchor] = useState<HTMLElement | null>(null)
  const [pinnedDetail, setPinnedDetail] = useState<{ selection: ShowSelection; anchor: HTMLElement } | null>(null)
  const [detailsSuppressed, setDetailsSuppressed] = useState(false)
  const [transitionPaletteId, setTransitionPaletteId] = useState<string | null>(null)
  const [layerTransitionTarget, setLayerTransitionTarget] = useState<ShowLayerTransitionTarget | null>(null)
  // A refused insertion used to return silently, so choosing a Transition did
  // nothing at all: no change, no error, no closed panel (#363).
  const [layerTransitionApplyError, setLayerTransitionApplyError] = useState<string | null>(null)
  const detailShowIdRef = useRef(showId)
  const timelineWorkspaceRef = useRef<HTMLElement>(null)
  const lastTimelineFocusRef = useRef<HTMLElement | null>(null)
  const closeDetailPanel = useCallback((restoreFocus = false) => {
    const previousAnchor = detailAnchor
    setTransitionPaletteId(null)
    setLayerTransitionTarget(null)
    setDetailPanelOpen(false)
    setDetailAnchor(null)
    if (restoreFocus) {
      window.setTimeout(() => {
        if (previousAnchor?.isConnected) previousAnchor.focus()
        else timelineWorkspaceRef.current?.focus()
      }, 0)
    }
  }, [detailAnchor])
  const closePinnedDetailForSelection = useCallback((target: ShowSelection) => {
    setPinnedDetail((current) => current && sameShowSelection(current.selection, target) ? null : current)
  }, [])
  const selectTimeline = useCallback((next: ShowSelection, anchor?: HTMLElement | null) => {
    if (detailPanelOpen && sameShowSelection(selection, next)) {
      closeDetailPanel()
      return
    }
    if (!detailPanelOpen && pinnedDetail && sameShowSelection(pinnedDetail.selection, next)) {
      setSelection(next)
      return
    }
    if (next.kind === 'show') lastTimelineFocusRef.current = timelineWorkspaceRef.current
    setSelection(next)
    setDetailPanelOpen(true)
    setDetailAnchor(anchor ?? null)
    if (!anchor) {
      window.setTimeout(() => setDetailAnchor(findShowSelectionAnchor(next)), 0)
    }
  }, [closeDetailPanel, detailPanelOpen, pinnedDetail, selection])
  const selectGroupCandidates = useCallback((groupSelection: ShowGroupSelection) => {
    closeDetailPanel()
    setSelection({ kind: 'multi', groupSelection })
  }, [closeDetailPanel])
  const reanchorOpenDetails = useCallback((target: ShowSelection) => {
    window.setTimeout(() => {
      const anchor = findShowSelectionAnchor(target)
      if (!anchor) return
      if (detailPanelOpen && sameShowSelection(selection, target)) setDetailAnchor(anchor)
      setPinnedDetail((current) => current && sameShowSelection(current.selection, target)
        ? { ...current, anchor }
        : current)
    }, 0)
  }, [detailPanelOpen, selection])
  const openShowProperties = useCallback((anchor: HTMLElement) => {
    setGeneratedSnapshot(null)
    selectTimeline({ kind: 'show' }, anchor)
  }, [selectTimeline])
  useEffect(() => {
    if (detailShowIdRef.current === showId) return
    detailShowIdRef.current = showId
    setSelection({ kind: 'show' })
    setDetailPanelOpen(false)
    setDetailAnchor(null)
    setPinnedDetail(null)
    setDetailsSuppressed(false)
    setTransitionPaletteId(null)
    setLayerTransitionTarget(null)
    setCompositionClipPendingDelete(null)
    setBlockedDeleteFeedback(null)
    setIsolatedGroupOccurrenceId(null)
    pendingDeliveryRef.current = null
    setPendingSendMode(null)
    setGeneratedSnapshot(null)
  }, [showId])
  useEffect(() => {
    const pendingDelivery = pendingDeliveryRef.current
    if (!pendingDelivery || pendingDelivery.controllerIp === activeIp) return
    pendingDeliveryRef.current = null
    setPendingSendMode(null)
  }, [activeIp])
  useEffect(() => {
    const handleHistoryShortcut = (event: KeyboardEvent) => {
      if (readOnly) return
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'z') return
      if (showControlOwnsKeyboardEvent(event.target)) return
      event.preventDefault()
      const store = useShowStore.getState()
      if (event.shiftKey) void store.redoShow(showId)
      else void store.undoShow(showId)
    }
    document.addEventListener('keydown', handleHistoryShortcut)
    return () => document.removeEventListener('keydown', handleHistoryShortcut)
  }, [readOnly, showId])
  const controllerProvider = getControllerProvider()
  const controllerStatus = useSyncExternalStore(
    (onChange) => controllerProvider.subscribe(onChange),
    () => controllerProvider.getStatus(),
  )

  const canonicalStockShow = builtInContext ? stockShowById(showId)?.show : undefined
  const editableShow = stockShowDraft ?? savedShow ?? canonicalStockShow ?? showOverride ?? null
  // Lessons and reference Showcases declare ordered groups on the catalogue
  // entry. The legacy single reference slot remains a compatibility fallback.
  const builtInSlotGroups = useMemo<readonly ShowPatternSlotGroup[] | undefined>(() => (
    builtInContext?.patternSlots
      ?? (builtInContext?.reference?.patternSlots ? [builtInContext.reference.patternSlots] : undefined)
  ), [builtInContext?.reference?.patternSlots, builtInContext?.patternSlots])
  const slotPatternNameFor = useCallback((ref: ShowCell['pattern']) => (
    ref.kind === 'stock' ? ref.id : userPatterns.find((pattern) => pattern.id === ref.id)?.name
  ), [userPatterns])
  const activeShow = useMemo(() => (
    editableShow && builtInSlotGroups && selectedReferencePatterns
      ? applyShowPatternSlotSelections(editableShow, builtInSlotGroups, selectedReferencePatterns, slotPatternNameFor)
      : editableShow
  ), [editableShow, builtInSlotGroups, selectedReferencePatterns, slotPatternNameFor])
  const updateShow = useCallback((id: string, next: ShowRecord) => {
    let persisted = next
    if (editableShow && builtInSlotGroups && selectedReferencePatterns) {
      // A deliberate Pattern reassignment in Clip Detail supersedes the slot
      // picker: that slot's transient selection clears and the edit persists
      // as authored. Slots the edit left alone stay transient - restore
      // strips them back to the authored Pattern before the draft saves.
      // Restore reads only slot ids, so the kept groups merge into one
      // projection.
      const patternAt = (show: ShowRecord | null, instanceId: string) => (
        show?.composition?.patternInstances.find((instance) => instance.id === instanceId)?.pattern
      )
      const cellPatternAt = (show: ShowRecord | null, cellId: string) => (
        show?.cells.find((cell) => cell.id === cellId)?.pattern
      )
      const patternEquals = (a?: ShowCell['pattern'], b?: ShowCell['pattern']) => (
        Boolean(a && b && a.kind === b.kind && a.id === b.id)
      )
      // In a superseded group only the deliberately reassigned member keeps
      // the edit; sibling members are still transient and must strip back to
      // the authored Pattern like any kept slot (#63 review P2).
      const restoreCellIds: string[] = []
      const restoreInstanceIds: string[] = []
      let restorePattern: ShowCell['pattern'] | undefined
      builtInSlotGroups.forEach((group, index) => {
        const selection = selectedReferencePatterns[index]
        if (!selection) return
        const reassigned = group.instanceIds.some((instanceId) => {
          const before = patternAt(activeShow, instanceId)
          const after = patternAt(next, instanceId)
          return before && after && !patternEquals(before, after)
        })
        if (reassigned) setReferencePattern(showId, index, null)
        const untouched = (current: ShowCell['pattern'] | undefined) => (
          !reassigned || patternEquals(current, selection)
        )
        const cellIds = group.cellIds.filter((cellId) => untouched(cellPatternAt(next, cellId)))
        const instanceIds = group.instanceIds.filter((instanceId) => untouched(patternAt(next, instanceId)))
        if (cellIds.length > 0 || instanceIds.length > 0) {
          restorePattern ??= selection
          restoreCellIds.push(...cellIds)
          restoreInstanceIds.push(...instanceIds)
        }
      })
      if (restorePattern) {
        persisted = restoreShowReferencePatternSlots(next, editableShow, {
          pattern: restorePattern,
          patternName: slotPatternNameFor(restorePattern) ?? '',
          cellIds: restoreCellIds,
          instanceIds: restoreInstanceIds,
        })
      }
    }
    return persistShow(id, persisted)
  }, [editableShow, persistShow, builtInSlotGroups, selectedReferencePatterns, activeShow, setReferencePattern, showId, slotPatternNameFor])
  useShowTransportClock(activeShow, transportClockActive)
  const targetProfile = activeShow?.outputContract?.kind === 'portable-2d'
    ? undefined
    : activeShow?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === activeShow.targetControllerProfileId)
    : controllerProfiles[0]
  const activeControllerProfile = controllerProfiles.find((profile) => (
    activeController?.deviceId
      ? profile.deviceId === activeController.deviceId
      : Boolean(activeIp && profile.lastSeenIp === activeIp)
  )) ?? targetProfile

  const requestDeleteSelection = useCallback((
    targetSelection: ShowSelection,
    visibleComposition?: ShowCompositionV1 | null,
    visibleSourceCellIdByPlacementId?: Record<string, string>,
  ): boolean => {
    if (!activeShow || readOnly) return false
    if (targetSelection.kind === 'transition') {
      const transition = activeShow.transitions?.find((candidate) => candidate.id === targetSelection.transitionId)
      if (!transition || transition.kind === 'cut') return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      void removeBoundaryTransition(activeShow.id, transition.id)
      return true
    }
    if (targetSelection.kind === 'clip') {
      const compositionOwner = findTimelineClipOwner(activeShow.composition, targetSelection.clipId)
      const visibleCompositionOwner = findTimelineClipOwner(visibleComposition, targetSelection.clipId)
      const legacyClipId = activeShow.cells.some((cell) => cell.id === targetSelection.clipId)
        ? targetSelection.clipId
        : visibleSourceCellIdByPlacementId?.[targetSelection.clipId]
      const legacyClipExists = Boolean(
        legacyClipId && activeShow.cells.some((cell) => cell.id === legacyClipId),
      )
      if (!compositionOwner && !visibleCompositionOwner && !legacyClipExists) return false
      if (showRecordClipCount(activeShow) <= 1) {
        blockedDeleteFeedbackSequenceRef.current += 1
        setBlockedDeleteFeedback({
          selectionKey: showSelectionKey(targetSelection),
          token: blockedDeleteFeedbackSequenceRef.current,
        })
        return true
      }
      if (compositionOwner && activeShow.composition) {
        if (showLayerTransitionsConnectedToClip(activeShow.composition, targetSelection.clipId).length > 0) {
          setCompositionClipPendingDelete(compositionOwner)
          return true
        }
        const composition = compositionOwner.kind === 'main'
          ? deleteShowMainPlacement(activeShow.composition, compositionOwner)
          : deleteShowOverlayPlacement(activeShow.composition, compositionOwner)
        if (composition === activeShow.composition) return false
        closeDetailPanel()
        closePinnedDetailForSelection(targetSelection)
        void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
        return true
      }
      if (!legacyClipExists) return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      void removeClip(activeShow.id, legacyClipId!)
      return true
    }
    if (targetSelection.kind === 'group') {
      if (!activeShow.composition?.groupOccurrences?.some((occurrence) => occurrence.id === targetSelection.occurrenceId)) return false
      const composition = deleteShowGroupOccurrence(activeShow.composition, targetSelection.occurrenceId)
      if (composition === activeShow.composition) return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      setSelection({ kind: 'show' })
      void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
      return true
    }
    if (targetSelection.kind === 'zone') {
      if (activeShow.zones.length <= 1 || !activeShow.zones.some((zone) => zone.id === targetSelection.zoneId)) return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      void removeZone(activeShow.id, targetSelection.zoneId)
      return true
    }
    return false
  }, [activeShow, closeDetailPanel, closePinnedDetailForSelection, readOnly, removeBoundaryTransition, removeClip, removeZone, updateShow])
  useEffect(() => {
    if (!blockedDeleteFeedback) return
    const timeout = window.setTimeout(() => setBlockedDeleteFeedback(null), 1100)
    return () => window.clearTimeout(timeout)
  }, [blockedDeleteFeedback])

  useEffect(() => registerShowEscapeLayer({
    rank: SHOW_ESCAPE_LAYER_RANK.editorSurfaces,
    onEscape: () => {
      if (transitionPaletteId !== null) return false
      if (!detailPanelOpen && !pinnedDetail && !isolatedGroupOccurrenceId && selection.kind === 'show') return false
      // Exiting Group isolation is one surface, not two peels: an open Detail
      // panel belongs to the isolated context and cannot outlive it, so one
      // press tears both down together (#587, preserved by #672).
      if (isolatedGroupOccurrenceId) {
        closeDetailPanel(true)
        setPinnedDetail(null)
        setIsolatedGroupOccurrenceId(null)
        setSelection({ kind: 'group', occurrenceId: isolatedGroupOccurrenceId })
        window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
        return true
      }
      if (detailPanelOpen || pinnedDetail) {
        closeDetailPanel(true)
        setPinnedDetail(null)
        return true
      }
      setSelection({ kind: 'show' })
      window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
      return true
    },
  }), [closeDetailPanel, detailPanelOpen, isolatedGroupOccurrenceId, pinnedDetail, selection.kind, transitionPaletteId])
  useEffect(() => {
    if (!detailPanelOpen) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[role="dialog"], [role="alertdialog"], [data-show-detail-owned-portal="true"]')) return
      if (target.closest(`[data-show-selection-key="${showSelectionKey(selection)}"]`)) return
      closeDetailPanel()
    }
    document.addEventListener('pointerdown', handleOutsidePointerDown, true)
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown, true)
  }, [closeDetailPanel, detailPanelOpen, selection])
  const stageDimension = activeShow?.stageMapId
    ? [...STOCK_MAPS, ...userMaps].find((map) => map.id === activeShow.stageMapId)?.dim
    : undefined
  const savedStageMap = activeShow?.stageMapId
    ? [...STOCK_MAPS, ...userMaps].find((map) => map.id === activeShow.stageMapId)
    : undefined
  const savedStageFixedCount = savedStageMap
    ? 'generator' in savedStageMap
      ? savedStageMap.generator === 'custom' ? savedStageMap.points?.length : undefined
      : savedStageMap.bakedCount
    : undefined
  const spatialRoutingLayout = activeShow?.routingLayouts.find((candidate) => !candidate.logical)
  const spatialSelectionUnavailableReason = activeShow?.outputContract?.kind === 'installation'
    ? !spatialRoutingLayout
      ? 'Spatial selection needs a physical routing layout.'
      : !savedStageMap
      ? 'Spatial selection needs a saved output map.'
      : savedStageMap.dim !== 2
        ? `Spatial selection is unavailable for ${savedStageMap.dim}D maps.`
        : savedStageFixedCount !== undefined && savedStageFixedCount !== activeShow.outputContract.pixelCount
          ? `Spatial selection needs the map's ${savedStageFixedCount} points to match the ${activeShow.outputContract.pixelCount}-pixel output.`
          : null
    : null
  const compilationControllerZones = useMemo(
    () => activeShow
      ? resolveShowCompilationControllerZones(activeShow, Boolean(savedStageMap), targetProfile?.zones)
      : undefined,
    [activeShow, savedStageMap, targetProfile?.zones],
  )
  const artifactCompilationInput = useMemo(() => activeShow ? {
    show: activeShow,
    userPatterns,
    controllerZones: compilationControllerZones,
    stageDimension,
    targetPixelCount: activeShow.outputContract?.kind === 'portable-2d'
      ? activeControllerProfile?.lastKnownPixelCount
      : undefined,
  } : null, [
    activeControllerProfile?.lastKnownPixelCount,
    activeShow,
    compilationControllerZones,
    stageDimension,
    userPatterns,
  ])
  const deferredArtifactCompilationInput = useDeferredValue(artifactCompilationInput)
  const effectiveArtifactCompilationInput =
    deferredArtifactCompilationInput?.show.id === showId
      ? deferredArtifactCompilationInput
      : artifactCompilationInput
  const compiled = useMemo(
    () => effectiveArtifactCompilationInput
      ? compileShowForArtifact(
          effectiveArtifactCompilationInput.show,
          effectiveArtifactCompilationInput.userPatterns,
          effectiveArtifactCompilationInput.controllerZones,
          {},
          {
            stageDimension: effectiveArtifactCompilationInput.stageDimension,
            targetPixelCount: effectiveArtifactCompilationInput.targetPixelCount,
          },
        )
      : { artifact: null, error: null },
    [effectiveArtifactCompilationInput],
  )
  const patternControlsByCellId = useMemo(() => Object.fromEntries((activeShow?.cells ?? []).map((cell) => {
    const saved = cell.pattern.kind === 'user'
      ? userPatterns.find((pattern) => pattern.id === cell.pattern.id)?.controls ?? {}
      : {}
    try {
      return [cell.id, discoverAutomatablePatternControls(sourceForShowCell(cell, userPatterns), saved)]
    } catch {
      return [cell.id, []]
    }
  })), [activeShow, userPatterns]) as Record<string, AutomatablePatternControl[]>
  const timelineProjection = useMemo<{
    composition: ShowCompositionV1
    sourceCellIdByPlacementId: Record<string, string>
  } | null>(() => {
    if (!activeShow) return null
    if (activeShow.composition) {
      return {
        composition: activeShow.composition,
        sourceCellIdByPlacementId: {},
      }
    }
    try {
      const projection = projectFlatShowToCompositionV1WithCellOrigins(activeShow, {
        byCellId: Object.fromEntries(activeShow.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)])),
        stageDimension,
      })
      return {
        ...projection,
        composition: {
          ...projection.composition,
          executionModel: 'deterministic-loop',
        },
      }
    } catch {
      return null
    }
  }, [activeShow, stageDimension, userPatterns])
  const timelineComposition = timelineProjection?.composition ?? null
  const patternControlsByInstanceId = useMemo(() => Object.fromEntries((timelineComposition
    ? [
        ...timelineComposition.patternInstances,
        ...projectShowGroupRuntimePatternInstances(timelineComposition),
      ]
    : []).map((instance) => {
    try {
      return [instance.id, discoverAutomatablePatternControls(sourceForShowPatternRef(instance.pattern, userPatterns), {})]
    } catch {
      return [instance.id, []]
    }
  })), [timelineComposition, userPatterns]) as Record<string, AutomatablePatternControl[]>
  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (requestDeleteSelection(
        selection,
        timelineComposition,
        timelineProjection?.sourceCellIdByPlacementId,
      )) event.preventDefault()
    }
    document.addEventListener('keydown', handleDelete)
    return () => document.removeEventListener('keydown', handleDelete)
  }, [requestDeleteSelection, selection, timelineComposition, timelineProjection?.sourceCellIdByPlacementId])
  useEffect(() => {
    if (!isolatedGroupOccurrenceId) return
    const occurrence = timelineComposition?.groupOccurrences
      ?.find((candidate) => candidate.id === isolatedGroupOccurrenceId)
    const definition = timelineComposition?.groupDefinitions
      ?.find((candidate) => candidate.id === occurrence?.definitionId)
    if (occurrence && definition) return
    const timeout = window.setTimeout(() => {
      closeDetailPanel()
      setIsolatedGroupOccurrenceId(null)
      setSelection({ kind: 'show' })
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [closeDetailPanel, isolatedGroupOccurrenceId, timelineComposition])
  useEffect(() => {
    if (!activeShow) return
    const pinnedSelectionMissing = Boolean(
      pinnedDetail && !showSelectionExists(activeShow, timelineComposition, pinnedDetail.selection),
    )
    const transientSelectionMissing = detailPanelOpen
      && !showSelectionExists(activeShow, timelineComposition, selection)
    if (!pinnedSelectionMissing && !transientSelectionMissing) return
    const timeout = window.setTimeout(() => {
      if (pinnedSelectionMissing) setPinnedDetail(null)
      if (transientSelectionMissing) {
        closeDetailPanel()
        setSelection({ kind: 'show' })
      }
    }, 0)
    return () => window.clearTimeout(timeout)
  }, [activeShow, closeDetailPanel, detailPanelOpen, pinnedDetail, selection, timelineComposition])
  const inspectorShow = activeShow && timelineComposition && !activeShow.composition
    ? { ...activeShow, composition: timelineComposition }
    : activeShow
  const layerTransitionPlan = activeShow && timelineComposition && layerTransitionTarget
    ? layerTransitionTarget.groupOccurrenceId
      ? planShowGroupLayerTransitionInsertion(activeShow, timelineComposition, {
          occurrenceId: layerTransitionTarget.groupOccurrenceId,
          fromPlacementId: layerTransitionTarget.junction.fromPlacementId,
          toPlacementId: layerTransitionTarget.junction.toPlacementId,
        })
      : planShowLayerTransitionInsertion(activeShow, timelineComposition, {
          fromPlacementId: layerTransitionTarget.junction.fromPlacementId,
          toPlacementId: layerTransitionTarget.junction.toPlacementId,
        })
    : null
  const pendingConnectedTransitions = timelineComposition && compositionClipPendingDelete
    ? showLayerTransitionsConnectedToClip(timelineComposition, compositionClipPendingDelete.placementId)
    : []
  const commitClipInspectorPatch = (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow || !inspectorShow) return false
    const next = updateShowClipInspector(inspectorShow, owner, patch)
    return next !== inspectorShow ? Promise.resolve(updateShow(activeShow.id, next)) : false
  }
  const commitGroupClipInspectorPatch = (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow) return false
    const next = updateShowGroupClipInspector(activeShow, owner, patch)
    if (next === activeShow || !next.composition || validateShowGroups(next, next.composition).length > 0) return false
    return Promise.resolve(updateShow(activeShow.id, next))
  }
  const previewClipInspectorPatch = (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => {
    if (!inspectorShow) return
    const next = updateShowClipInspector(inspectorShow, owner, patch)
    if (next !== inspectorShow) useShowPreviewOverrideStore.getState().preview(next)
  }
  const previewGroupClipInspectorPatch = (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow) return
    const next = updateShowGroupClipInspector(activeShow, owner, patch)
    if (next !== activeShow && next.composition && validateShowGroups(next, next.composition).length === 0) {
      useShowPreviewOverrideStore.getState().preview(next)
    }
  }
  const endInspectorPreview = () => {
    if (activeShow) useShowPreviewOverrideStore.getState().clear(activeShow.id)
  }
  const inspectableShowExport = useMemo(
    () => activeShow && compiled.artifact
      ? buildShowEpeExport(activeShow, compiled.artifact.code, {
          stampedAt: new Date(activeShow.updatedAt),
          userMaps,
          attribution: compiled.artifact.attribution,
        })
      : null,
    [activeShow, compiled.artifact, userMaps],
  )
  // The pressure numerator is the delivered total (generated source plus
  // delivery header) — the same bytes the gauge and inventory report (#63).
  const compilePressure = useMemo(() => compiled.artifact
    ? assessShowCompilePressure({
        deliveredSourceBytes: inspectableShowExport
          ? deliveredShowSourceBytes(inspectableShowExport.source)
          : compiled.artifact.summary.artifactBytes,
        budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
        worstInstantRenderersPerPixel: compiled.artifact.summary.worstInstantRenderersPerPixel,
      })
    : null, [compiled.artifact, inspectableShowExport])
  const showExport = !compiled.artifactBlocker && compilePressure?.status !== 'blocked'
    ? inspectableShowExport
    : null
  const artifactInventory = useMemo(() => {
    if (!activeShow || !compiled.artifact || !inspectableShowExport) return null
    const inventory = buildDeliveredShowSourceInventory(
      compiled.artifact.summary.sourceInventory,
      compiled.artifact.code,
      inspectableShowExport.source,
    )
    return {
      inventory,
      model: buildShowArtifactInventoryModel(inventory, {
        patterns: describeShowArtifactPatterns(activeShow, inventory),
        budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
        zoneLayoutCount: compiled.artifact.summary.routedZoneLayoutCount,
      }),
    }
  }, [activeShow, compiled.artifact, inspectableShowExport])
  const activeControllerMapDim = activeController?.mapDim ?? null
  const activeControllerFirmware = activeController?.firmwareVersion
  const activeInstalledMap = activeController?.phase === 'live'
    ? activeController.installedMap
    : activeControllerProfile?.lastKnownInstalledMap
  const controllerCompatibilityContext = useMemo(
    () => buildControllerCompatibilityContext(activeControllerProfile, userMaps, activeInstalledMap),
    [activeControllerProfile, activeInstalledMap, userMaps],
  )
  const preparedControllerArtifact = useMemo(() => {
    if (compiled.artifactBlocker) {
      return { value: null, error: compiled.artifactBlocker }
    }
    if (compilePressure?.status === 'blocked') {
      return { value: null, error: compilePressure.blocks.join(' ') }
    }
    if (!showExport) return { value: null, error: null }
    try {
      const prepared = prepareShowControllerArtifact(
        showExport.source,
        activeControllerMapDim,
        activeControllerFirmware,
        controllerCompatibilityContext,
      )
      // Preparation can append a renderer adapter, so re-measure the source
      // the Controller actually receives (#63 review follow-up). Bytes only:
      // renderer pressure was already assessed in compilePressure above.
      const preparedPressure = compiled.artifact
        ? assessShowCompilePressure({
            deliveredSourceBytes: deliveredShowSourceBytes(prepared.source),
            budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
            worstInstantRenderersPerPixel: 0,
          })
        : null
      if (preparedPressure?.status === 'blocked') {
        return { value: null, error: preparedPressure.blocks.join(' ') }
      }
      return { value: prepared, error: null }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Could not prepare Show for Controller',
      }
    }
  }, [activeControllerFirmware, activeControllerMapDim, compilePressure, compiled.artifact, compiled.artifactBlocker, controllerCompatibilityContext, showExport])
  const compileBarPushResult = preparedControllerArtifact.error
    && preparedControllerArtifact.error !== compiled.artifactBlocker
    ? preparedControllerArtifact.error
    : controllerPushResult
      ? controllerPushResult.ok ? 'Sent to Controller' : controllerPushResult.message
      : null

  const buildCurrentCompilationSnapshot = (): ShowCompilationSnapshot | null => {
    const showState = useShowStore.getState()
    const resolvedShow = showState.resolveEditableShow(showId)
    const currentPatterns = usePatternStore.getState().userPatterns
    let currentShow = resolvedShow ?? activeShow
    const referencePatterns = useShowEditorSessionStore.getState().referencePatternsByShowId[showId]
    if (currentShow && referencePatterns && builtInSlotGroups) {
      currentShow = applyShowPatternSlotSelections(currentShow, builtInSlotGroups, referencePatterns, (ref) => (
        ref.kind === 'stock' ? ref.id : currentPatterns.find((pattern) => pattern.id === ref.id)?.name
      ))
    }
    if (!currentShow) return null

    const currentMaps = useMapStore.getState().userMaps
    const currentProfiles = useControllerProfileStore.getState().profiles
    const controllerState = useControllerStore.getState()
    const currentActiveIp = controllerState.activeIp
    const currentController = currentActiveIp ? controllerState.controllers[currentActiveIp] : undefined
    const currentTargetProfile = currentShow.outputContract?.kind === 'portable-2d'
      ? undefined
      : currentShow.targetControllerProfileId
        ? currentProfiles.find((profile) => profile.id === currentShow.targetControllerProfileId)
        : currentProfiles[0]
    const currentActiveProfile = currentProfiles.find((profile) => (
      currentController?.deviceId
        ? profile.deviceId === currentController.deviceId
        : Boolean(currentActiveIp && profile.lastSeenIp === currentActiveIp)
    )) ?? currentTargetProfile
    const currentStageMap = currentShow.stageMapId
      ? [...STOCK_MAPS, ...currentMaps].find((map) => map.id === currentShow.stageMapId)
      : undefined
    const currentCompiled = compileShowForArtifact(
      currentShow,
      currentPatterns,
      resolveShowCompilationControllerZones(
        currentShow,
        Boolean(currentStageMap),
        currentTargetProfile?.zones,
      ),
      {},
      {
        stageDimension: currentStageMap?.dim,
        targetPixelCount: currentShow.outputContract?.kind === 'portable-2d'
          ? currentActiveProfile?.lastKnownPixelCount
          : undefined,
      },
    )
    if (!currentCompiled.artifact || currentCompiled.artifactBlocker) return null
    const canonicalExport = buildShowEpeExport(currentShow, currentCompiled.artifact.code, {
      stampedAt: new Date(currentShow.updatedAt),
      userMaps: currentMaps,
      attribution: currentCompiled.artifact.attribution,
    })
    // No pressure gate here: blocked output must stay previewable and
    // inspectable (View code). Export and delivery paths gate themselves.
    return {
      show: currentShow,
      userMaps: currentMaps,
      artifact: currentCompiled.artifact,
      canonicalExport,
    }
  }

  const buildCurrentDeliverySnapshot = (): ShowDeliverySnapshot | null => {
    const compilation = buildCurrentCompilationSnapshot()
    if (!compilation) return null
    const currentProfiles = useControllerProfileStore.getState().profiles
    const controllerState = useControllerStore.getState()
    const currentActiveIp = controllerState.activeIp
    const currentController = currentActiveIp ? controllerState.controllers[currentActiveIp] : undefined
    const currentTargetProfile = compilation.show.outputContract?.kind === 'portable-2d'
      ? undefined
      : compilation.show.targetControllerProfileId
        ? currentProfiles.find((profile) => profile.id === compilation.show.targetControllerProfileId)
        : currentProfiles[0]
    const currentActiveProfile = currentProfiles.find((profile) => (
      currentController?.deviceId
        ? profile.deviceId === currentController.deviceId
        : Boolean(currentActiveIp && profile.lastSeenIp === currentActiveIp)
    )) ?? currentTargetProfile
    const currentExport = compilation.canonicalExport
    try {
      const prepared = prepareShowControllerArtifact(
        currentExport.source,
        currentController?.mapDim ?? null,
        currentController?.firmwareVersion,
        buildControllerCompatibilityContext(
          currentActiveProfile,
          compilation.userMaps,
          currentController?.phase === 'live'
            ? currentController.installedMap
            : currentActiveProfile?.lastKnownInstalledMap,
        ),
      )
      // Gate delivery on what the Controller actually receives: preparation
      // can append a renderer adapter, so the prepared source is measured,
      // not the canonical export (#63 review follow-up).
      const pressure = assessShowCompilePressure({
        deliveredSourceBytes: deliveredShowSourceBytes(prepared.source),
        budgetBytes: compilation.artifact.summary.measuredDeviceBudgetBytes,
        worstInstantRenderersPerPixel: compilation.artifact.summary.worstInstantRenderersPerPixel,
      })
      if (pressure.status === 'blocked') return null
      return {
        show: compilation.show,
        controllerIp: currentActiveIp,
        artifact: compilation.artifact,
        prepared,
      }
    } catch {
      return null
    }
  }

  useEffect(() => {
    if (!controllerPushResult) return
    const timeout = window.setTimeout(clearPushResult, 3500)
    return () => window.clearTimeout(timeout)
  }, [clearPushResult, controllerPushResult])
  const buildDownloadExport = async (): Promise<ShowEpeExport | null> => {
    const compilation = buildCurrentCompilationSnapshot()
    if (!compilation) return null
    const preview = await buildPreviewJpeg(compilation.artifact)
    if (!preview) throw new Error('Could not render the EPE preview image')
    return buildShowEpeExport(compilation.show, compilation.artifact.code, {
      id: makeProgramId(),
      preview: bytesToBase64(preview),
      stampedAt: new Date(compilation.show.updatedAt),
      userMaps: compilation.userMaps,
      attribution: compilation.artifact.attribution,
    })
  }

  if (!activeShow) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950/40 font-mono text-xs text-zinc-500">
        Show not found
      </div>
    )
  }

  if (spatialZoneSelection && activeShow.outputContract?.kind === 'installation' && savedStageMap?.dim === 2) {
    const zone = activeShow.zones.find((candidate) => candidate.id === spatialZoneSelection.zoneId)
    const map = resolveMap(savedStageMap.id, userMaps)
    const resolved = applyNormalizeMode(map.resolve(activeShow.outputContract.pixelCount), 'contain')
    if (zone && resolved.length === activeShow.outputContract.pixelCount) {
      const points = resolved.map((point) => {
        const raw = point.pos ?? point.sample
        return { x: raw[0] ?? 0.5, y: raw[1] ?? 0.5 }
      })
      return (
        <ShowZoneSpatialSelector
          show={activeShow}
          zone={zone}
          layoutId={spatialZoneSelection.layoutId}
          mapName={savedStageMap.name}
          points={points}
          onCancel={() => setSpatialZoneSelection(null)}
          onCommit={(indexes) => {
            const next = updateShowPhysicalZoneSelection(
              activeShow,
              spatialZoneSelection.layoutId,
              zone.id,
              indexes,
            )
            setSpatialZoneSelection(null)
            void updateShow(activeShow.id, next)
          }}
        />
      )
    }
  }

  if (generatedSnapshot?.show.id === showId) {
    const generatedExport = generatedSnapshot.canonicalExport
    // The generated-code view exists so a blocked Show stays inspectable; its
    // export affordance stays gated by the same delivered-pressure rule as
    // the editor-level Export button (#63 review follow-up).
    const generatedPressure = assessShowCompilePressure({
      deliveredSourceBytes: deliveredShowSourceBytes(generatedExport.source),
      budgetBytes: generatedSnapshot.artifact.summary.measuredDeviceBudgetBytes,
      worstInstantRenderersPerPixel: generatedSnapshot.artifact.summary.worstInstantRenderersPerPixel,
    })
    const buildGeneratedDownloadExport = async (): Promise<ShowEpeExport> => {
      const preview = await buildPreviewJpeg(generatedSnapshot.artifact)
      if (!preview) throw new Error('Could not render the EPE preview image')
      return buildShowEpeExport(generatedSnapshot.show, generatedSnapshot.artifact.code, {
        id: makeProgramId(),
        preview: bytesToBase64(preview),
        stampedAt: new Date(generatedSnapshot.show.updatedAt),
        userMaps: generatedSnapshot.userMaps,
        attribution: generatedSnapshot.artifact.attribution,
      })
    }
    return (
      <div className="flex h-full min-h-0 flex-col bg-zinc-950">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-seam px-3 font-mono text-xs text-zinc-400">
          <Code2 size={14} aria-hidden />
          <span className="flex-1 truncate text-zinc-200">Generated pattern - {generatedSnapshot.show.name}</span>
          <ExportShowButton exported={generatedPressure.status === 'blocked' ? null : generatedExport} buildExport={buildGeneratedDownloadExport} />
          <Button
            size="xs"
            variant="ghost"
            className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300"
            onClick={() => setGeneratedSnapshot(null)}
          >
            Back to show
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <PixelblazeCodeEditor value={generatedExport.source} readOnly />
        </div>
      </div>
    )
  }

  const showArtifactId = `show:${activeShow.id}`
  const pendingDelivery = (
    pendingDeliveryRef.current?.show.id === showId
    && pendingDeliveryRef.current.controllerIp === activeIp
  )
    ? pendingDeliveryRef.current
    : null
  const preparedSource = preparedControllerArtifact.value?.source ?? ''
  const preparedProfileSignature = controllerProfileArtifactSignature(
    activeControllerProfile,
    showArtifactId,
    { mapDim: activeControllerMapDim },
  )
  const alreadySent = (mode: SendMode) => isAlreadyPushed({
    mode,
    source: preparedSource,
    lastRunSource: activeIp ? lastPushedSource[activeIp]?.[showArtifactId] : undefined,
    lastSavedSource: activeIp ? lastSavedSource[activeIp]?.[showArtifactId] : undefined,
    profileSignature: preparedProfileSignature,
    lastRunProfileSignature: activeIp
      ? lastPushedProfileSignature[activeIp]?.[showArtifactId]
      : undefined,
    lastSavedProfileSignature: activeIp
      ? lastSavedProfileSignature[activeIp]?.[showArtifactId]
      : undefined,
    lastRunProgramId: activeIp ? lastRunProgramId[activeIp]?.[showArtifactId] : undefined,
    activeProgramId,
  })
  const runGate = describeSendToController({
    status: controllerStatus,
    compileStatus: preparedControllerArtifact.value ? 'good' : 'broken',
    alreadyPushed: alreadySent('run'),
  })
  const saveGate = describeSendToController({
    status: controllerStatus,
    compileStatus: preparedControllerArtifact.value ? 'good' : 'broken',
    alreadyPushed: alreadySent('save'),
  })
  const controllerName = activeController ? activeController.nickname || activeIp : null

  async function sendShow(mode: SendMode, requestedDelivery?: ShowDeliverySnapshot | null) {
    const delivery = requestedDelivery ?? buildCurrentDeliverySnapshot()
    if (
      !delivery
      || delivery.show.id !== showId
      || delivery.controllerIp !== useControllerStore.getState().activeIp
    ) {
      pendingDeliveryRef.current = null
      setPendingSendMode(null)
      return
    }
    const prepared = delivery.prepared
    const deliveryArtifactId = `show:${delivery.show.id}`
    setPendingSendMode(null)
    pendingDeliveryRef.current = null
    setShowSendMode(mode)
    setPreparingSave(mode === 'save')
    try {
      const previewImage = mode === 'save'
        ? (await buildPreviewJpeg(delivery.artifact).catch(() => null)) ?? undefined
        : undefined
      if (delivery.controllerIp !== useControllerStore.getState().activeIp) return
      trackEvent('send_to_controller', {
        mode,
        pattern_key: deliveryArtifactId,
        controller_phase: activeController?.phase ?? controllerStatus.kind,
      })
      await pushGeneratedArtifact({
        artifactId: deliveryArtifactId,
        source: prepared.source,
        name: delivery.show.name,
        persist: mode === 'save',
        compilePressure: {
          budgetBytes: delivery.artifact.summary.measuredDeviceBudgetBytes,
          worstInstantRenderersPerPixel: delivery.artifact.summary.worstInstantRenderersPerPixel,
        },
        artifactStamp: prepared.artifactStamp,
        previewImage,
      })
    } finally {
      setPreparingSave(false)
    }
  }

  function requestShowSend(mode: SendMode) {
    const delivery = buildCurrentDeliverySnapshot()
    if (!delivery) return
    setShowSendMode(mode)
    if (delivery.prepared.warnings.length > 0) {
      pendingDeliveryRef.current = delivery
      setPendingSendMode(mode)
      return
    }
    void sendShow(mode, delivery)
  }

  const patternOptions = [
    ...userPatterns.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'user' as const, id: pattern.id },
      group: 'Personal' as const,
    })),
    ...GALLERY_PATTERNS.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'stock' as const, id: pattern.name },
      group: 'Built-in' as const,
    })),
  ]
  const referencePatternOptions = patternOptions.filter((option) => {
    const source = option.ref.kind === 'user'
      ? userPatterns.find((pattern) => pattern.id === option.ref.id)?.src
      : GALLERY_PATTERNS.find((pattern) => pattern.name === option.ref.id)?.src
    return source ? exportedDims(source).some((dimension) => dimension === 1 || dimension === 2) : false
  })

  function rememberTimelineFocus(event: React.FocusEvent<HTMLElement>) {
    const target = event.target
    if (!(target instanceof HTMLElement)) return
    const focusTarget = target.closest<HTMLElement>('[data-show-timeline-focus], button')
    if (focusTarget) lastTimelineFocusRef.current = focusTarget
  }

  function returnFocusAfterDiscreteCommit(event: React.FormEvent<HTMLDivElement>) {
    if (!(event.target instanceof HTMLSelectElement)) return
    returnFocusToTimelineSelection()
  }

  function returnFocusToTimelineSelection() {
    window.setTimeout(() => {
      const previous = lastTimelineFocusRef.current
      if (previous?.isConnected) previous.focus()
      else timelineWorkspaceRef.current?.focus()
    }, 0)
  }

  const showNoteTrigger = builtInContext?.note ? (
    <ShowNoteTrigger
      note={builtInContext.note}
      open={showNoteOpen}
      onToggle={() => setShowNoteOpen(showId, !showNoteOpen)}
    />
  ) : null

  const headerActions = (
    <>
      {onOpenStagePreview && (
        <Button
          size="xs"
          variant="ghost"
          aria-label="Preview Stage"
          title="Open Stage preview"
          className="hidden bg-zinc-900/60 text-xs text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200 max-[980px]:inline-flex"
          onClick={(event) => onOpenStagePreview(event.currentTarget)}
        >
          <Maximize2 size={13} aria-hidden />
          <span className="show-header-action-label">Preview</span>
        </Button>
      )}
      {builtInContext && (
        <Button
          size="xs"
          variant="ghost"
          aria-label="Reset built-in Show"
          title="Discard session edits and restore the built-in definition"
          // Enabled means there are session edits to discard: the amber lift
          // replaces the old "edits last until reload" header disclaimer (#63).
          className={hasStockDraft || selectedReferencePatterns
            ? 'border-amber-300/45 bg-amber-400/10 text-[11px] text-amber-200 hover:bg-amber-400/20 hover:text-amber-100'
            : 'bg-zinc-900/60 text-[11px] text-zinc-500 disabled:opacity-40'}
          disabled={!hasStockDraft && !selectedReferencePatterns}
          onClick={() => {
            resetStockShowDraft(showId)
            clearReferencePatterns(showId)
          }}
        >
          <RotateCcw size={13} aria-hidden />
          <span className="show-header-action-label">Reset</span>
        </Button>
      )}
      <Button
        size="xs"
        variant="ghost"
        aria-label="Show properties"
        title="Show properties"
        aria-pressed={detailPanelOpen && selection.kind === 'show'}
        data-show-selection-key="show"
        className={detailPanelOpen && selection.kind === 'show'
          ? 'bg-zinc-800/70 text-[11px] text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-200'
          : 'bg-zinc-900/60 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}
        onClick={(event) => openShowProperties(event.currentTarget)}
      >
        <Settings2 size={13} aria-hidden />
        <span className="show-header-action-label">Properties</span>
      </Button>
      <Button
        size="xs"
        variant="ghost"
        aria-label="View code"
        title="View final generated code"
        className="bg-zinc-900/60 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
        disabled={!compiled.artifact || Boolean(compiled.artifactBlocker)}
        onClick={() => {
          const snapshot = buildCurrentCompilationSnapshot()
          if (snapshot) setGeneratedSnapshot(snapshot)
        }}
      >
        <Code2 size={13} aria-hidden />
        <span className="show-header-action-label">View code</span>
      </Button>
      <ExportShowButton exported={showExport} buildExport={buildDownloadExport} />
      <PushConfirmPopover
        open={pendingSendMode !== null && pendingDelivery !== null}
        onCancel={() => {
          pendingDeliveryRef.current = null
          setPendingSendMode(null)
        }}
        title="Send Show"
        testId="show-preflight-dialog"
        anchor={(
          <PatternDeploymentActions
            connected={controllerStatus.kind === 'connected'}
            controllerName={controllerName}
            runGate={runGate}
            saveGate={saveGate}
            activeMode={showSendMode}
            pushing={controllerPushing || preparingSave}
            pushResult={controllerPushResult}
            density="compact"
            onConnect={requestControllerEntryOpen}
            onRun={() => requestShowSend('run')}
            onSave={() => requestShowSend('save')}
          />
        )}
      >
        <PatternPushChoices
          warnings={pendingDelivery?.prepared.warnings ?? preparedControllerArtifact.value?.warnings ?? []}
          blocked={pendingDelivery?.prepared.blocked ?? preparedControllerArtifact.value?.blocked ?? true}
          remedy={null}
          onCancel={() => {
            pendingDeliveryRef.current = null
            setPendingSendMode(null)
          }}
          confirmWithMap={async () => {}}
          confirmOnly={async () => {
            if (pendingSendMode) await sendShow(pendingSendMode, pendingDelivery)
          }}
        />
      </PushConfirmPopover>
    </>
  )
  const pinnedDetailAnchor = pinnedDetail?.anchor ?? null

  return (
    <div className="show-editor-pane flex h-full min-h-0 flex-col bg-zinc-950/75 font-mono text-xs text-zinc-400">
      {headerGuideTarget && showNoteTrigger
        ? createPortal(showNoteTrigger, headerGuideTarget)
        : null}
      {headerActionsTarget
        ? createPortal(headerActions, headerActionsTarget)
        : <div className="mb-2 flex shrink-0 items-center justify-end gap-1.5 px-3 pt-3">{!headerGuideTarget && showNoteTrigger}{headerActions}</div>}
      {builtInContext?.note && showNoteOpen && (
        <ShowNoteDisclosure
          note={builtInContext.note}
          show={activeShow}
          reference={builtInContext.reference}
          patternSlots={builtInSlotGroups}
          patternOptions={referencePatternOptions}
          selections={selectedReferencePatterns}
          onSelectPattern={(slotIndex, pattern) => setReferencePattern(showId, slotIndex, pattern)}
          onCollapse={() => setShowNoteOpen(showId, false)}
        />
      )}
      {readOnly && !builtInContext?.note && (
        <div className="flex shrink-0 items-start gap-2 border-b border-amber-300/15 bg-amber-300/[0.035] px-3 py-1.5 text-[10px] text-zinc-500">
          <Lock size={12} aria-hidden className="text-amber-300/70" />
          <span className="shrink-0 font-semibold uppercase tracking-[0.12em] text-amber-200/75">Built-in Show</span>
          {builtInContext ? (
            <span className="min-w-0">
              <span className="mr-1.5 rounded border border-zinc-700/80 px-1 py-0.5 text-[8px] uppercase tracking-wider text-zinc-500">
                {builtInContext.track}
              </span>
              <strong className="font-medium text-zinc-300">{builtInContext.lesson}</strong>
              <span className="ml-1.5 text-zinc-500">{builtInContext.description}</span>
            </span>
          ) : (
            <span>Read only - inspect, preview, export, or send this example.</span>
          )}
        </div>
      )}
      <div data-testid="show-editor-scroll" className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="min-w-0 p-3">
          <section
            ref={timelineWorkspaceRef}
            aria-label="Show timeline"
            tabIndex={-1}
            data-show-timeline-focus
            className="select-none outline-none [&_input]:select-text [&_textarea]:select-text"
            onFocusCapture={rememberTimelineFocus}
          >
            {blockedDeleteFeedback && (
              <span
                key={blockedDeleteFeedback.token}
                role="status"
                aria-label="Clip deletion unavailable"
                aria-live="polite"
                className="sr-only"
              >
                A Show must contain at least one Clip.
              </span>
            )}
            <ShowTimelineWorkspace
                key={activeShow.id}
                show={activeShow}
                timelineComposition={timelineComposition}
                readOnly={readOnly}
                transportActive
                patternControlsByCellId={patternControlsByCellId}
                patternControlsByInstanceId={patternControlsByInstanceId}
                selection={selection}
                blockedDeleteFeedback={blockedDeleteFeedback}
                isolatedGroupOccurrenceId={isolatedGroupOccurrenceId}
                onSelect={selectTimeline}
                onEnterGroupIsolation={(occurrenceId, placementId, anchor) => {
                  closeDetailPanel()
                  setIsolatedGroupOccurrenceId(occurrenceId)
                  selectTimeline({ kind: 'group-clip', occurrenceId, placementId }, anchor)
                }}
                onExitGroupIsolation={() => {
                  closeDetailPanel()
                  if (isolatedGroupOccurrenceId) setSelection({ kind: 'group', occurrenceId: isolatedGroupOccurrenceId })
                  setIsolatedGroupOccurrenceId(null)
                }}
                onSelectGroupCandidates={selectGroupCandidates}
                onCreateGroup={async (groupSelection) => {
                  if (!timelineComposition) return null
                  const definitionId = newPersonalContentId()
                  const occurrenceId = newPersonalContentId()
                  const composition = createShowGroupFromSelection(timelineComposition, {
                    selection: groupSelection,
                    definitionId,
                    occurrenceId,
                    name: 'Group',
                  })
                  if (composition === timelineComposition || validateShowGroups(activeShow, composition).length > 0) return null
                  await updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  selectTimeline({ kind: 'group', occurrenceId })
                  return occurrenceId
                }}
                onDismiss={closeDetailPanel}
                onDirectManipulationChange={setDetailsSuppressed}
                onReanchorDetails={reanchorOpenDetails}
                patternOptions={patternOptions}
                onAddClipAtPlayhead={async ({ zoneId, globalTimeMs, target, pattern, patternName }) => {
                  if (!timelineComposition) return null
                  const instanceId = newPersonalContentId()
                  const placementId = newPersonalContentId()
                  const nextShow = addShowClipAtGlobalTimeExtendingShow(
                    { ...activeShow, composition: timelineComposition },
                    timelineComposition,
                    {
                    zoneId,
                    globalTimeMs,
                    target,
                    instance: {
                      id: instanceId,
                      pattern,
                      patternName,
                      time: { timeScale: 1, timeOffsetMs: 0 },
                    },
                    placementId,
                    },
                  )
                  if (nextShow.composition === timelineComposition) return null
                  await updateShow(activeShow.id, nextShow)
                  return placementId
                }}
                onMoveCompositionClip={async ({ owner, target, sourceComposition, plannedComposition }) => {
                  if (!timelineComposition) return false
                  if (sourceComposition && sourceComposition !== timelineComposition) return false
                  const nextShow = moveShowConnectedClipInShowAtGlobalTime(
                    activeShow,
                    timelineComposition,
                    { owner, target, plannedComposition },
                  )
                  if (nextShow === activeShow) return false
                  await updateShow(activeShow.id, { ...nextShow, updatedAt: Date.now() })
                  return true
                }}
                onDuplicateCompositionClipAtTarget={async ({ sourceComposition, plannedComposition }) => {
                  if (!timelineComposition || sourceComposition !== timelineComposition) return false
                  if (plannedComposition === timelineComposition) return false
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: plannedComposition,
                    updatedAt: Date.now(),
                  })
                  return true
                }}
                onAddCompositionLayer={async (zoneId) => {
                  if (!timelineComposition) return false
                  const nextComposition = addShowOverlayLayerAcrossTimeline(activeShow, timelineComposition, {
                    zoneId,
                    layers: timelineComposition.scenes.map((scene) => ({
                      sceneId: scene.sceneId,
                      layerId: newPersonalContentId(),
                    })),
                  })
                  if (nextComposition === timelineComposition) return false
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  })
                  return true
                }}
                onSplitCompositionClip={async (owner, globalTimeMs) => {
                  if (!timelineComposition) return null
                  const placementId = newPersonalContentId()
                  const nextComposition = splitShowClipAtGlobalTime(activeShow, timelineComposition, {
                    owner,
                    globalTimeMs,
                    newPlacementId: placementId,
                  })
                  if (nextComposition === timelineComposition) return null
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  })
                  return placementId
                }}
                onDuplicateCompositionClip={async (owner) => {
                  if (!timelineComposition) return null
                  const placementId = newPersonalContentId()
                  const nextComposition = duplicateShowClipAfter(activeShow, timelineComposition, {
                    owner,
                    newPlacementId: placementId,
                    newInstanceId: newPersonalContentId(),
                  })
                  if (nextComposition === timelineComposition) return null
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  })
                  return placementId
                }}
                onResizeCompositionClip={async ({
                  owner,
                  globalStartMs,
                  durationMs,
                  sourceComposition,
                  plannedComposition,
                }) => {
                  if (!timelineComposition) return false
                  if (sourceComposition && sourceComposition !== timelineComposition) return false
                  const nextShow = resizeShowConnectedClipInShowAtGlobalTime(
                    activeShow,
                    timelineComposition,
                    {
                      owner,
                      globalStartMs,
                      durationMs,
                      plannedComposition,
                    },
                  )
                  if (nextShow === activeShow) return false
                  await updateShow(activeShow.id, {
                    ...nextShow,
                    updatedAt: Date.now(),
                  })
                  return true
                }}
                onOpenLayerTransition={(target) => {
                  // A refusal belongs to the junction that produced it; carrying
                  // it forward would also mask the next junction's own reason.
                  setLayerTransitionApplyError(null)
                  setLayerTransitionTarget(target)
                }}
                onInsertTime={async (atMs, durationMs) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const plan = planShowTimeInsertion(basis, atMs, durationMs)
                  if (!plan.enabled) return false
                  const next = insertShowTime(basis, {
                    atMs,
                    durationMs,
                    newPlacementIdBySourceId: Object.fromEntries(
                      plan.crossingPlacementIds.map((placementId) => [placementId, newPersonalContentId()]),
                    ),
                  })
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onAddMarker={async (timeMs) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const markerNumber = (timelineComposition.markers?.length ?? 0) + 1
                  const next = addShowTimelineMarker(basis, {
                    id: newPersonalContentId(),
                    timeMs,
                    name: `Marker ${markerNumber}`,
                    color: '#f59e0b',
                  })
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onMoveMarker={async (markerId, timeMs) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = moveShowTimelineMarker(basis, markerId, timeMs)
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onUpdateMarker={async (markerId, patch) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = updateShowTimelineMarker(basis, markerId, patch)
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onRemoveMarker={async (markerId) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = removeShowTimelineMarker(basis, markerId)
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onSetShowEnd={async (durationMs) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = setShowEndMs(basis, durationMs)
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onAppendLayoutInterval={async (sourceLayoutId, durationMs) => {
                  if (!timelineComposition) return false
                  // Copy the layout and place its interval as one Show edit:
                  // a rejected placement persists nothing, and one Undo
                  // removes both the interval and the definition (#694
                  // review P2).
                  const current = useShowStore.getState().resolveEditableShow(activeShow.id) ?? activeShow
                  const withLayout = addShowRoutingLayout(current, undefined, sourceLayoutId)
                  const layoutId = withLayout.routingLayouts[withLayout.routingLayouts.length - 1].id
                  const basis = { ...withLayout, composition: timelineComposition }
                  const next = appendShowLayoutInterval(basis, { layoutId, durationMs })
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onInsertLayoutInterval={async (sourceLayoutId, durationMs, atMs) => {
                  if (!timelineComposition) return false
                  const current = useShowStore.getState().resolveEditableShow(activeShow.id) ?? activeShow
                  const withLayout = addShowRoutingLayout(current, undefined, sourceLayoutId)
                  const layoutId = withLayout.routingLayouts[withLayout.routingLayouts.length - 1].id
                  const basis = { ...withLayout, composition: timelineComposition }
                  const next = insertShowLayoutInterval(basis, { layoutId, durationMs, atMs })
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onDuplicateLayoutInterval={async (intervalId, withContent) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = duplicateShowLayoutInterval(basis, intervalId, { withContent })
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onMakeLayoutIntervalUnique={async (intervalId) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = makeShowLayoutIntervalUnique(basis, intervalId)
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onAddZone={() => {
                  timelineWorkspaceRef.current?.focus()
                  void addZone(activeShow.id)
                }}
                onUpdateZone={(zoneId, changes) => void updateZone(activeShow.id, zoneId, changes)}
                onRemoveZone={(zoneId) => {
                  closeDetailPanel()
                  closePinnedDetailForSelection({ kind: 'zone', zoneId })
                  void removeZone(activeShow.id, zoneId)
                }}
              />
          </section>

          {!detailsSuppressed && [
            ...(pinnedDetail && pinnedDetailAnchor
              ? [{ id: 'pinned', selection: pinnedDetail.selection, anchor: pinnedDetailAnchor, pinned: true }]
              : []),
            ...(detailPanelOpen && detailAnchor
              ? [{ id: 'transient', selection, anchor: detailAnchor, pinned: false }]
              : []),
          ].map((detail) => {
            const detailClipId = detail.selection.kind === 'clip' ? detail.selection.clipId : null
            const detailSelectedClip = detailClipId
              ? activeShow.cells.find((clip) => clip.id === detailClipId) ?? null
              : null
            const detailSelectedCompositionClipOwner = detailClipId && !detailSelectedClip
              ? findCompositionClipOwner(timelineComposition, detailClipId)
              : null
            const detailSelectedGroupClipOwner: ShowGroupClipOwner | null = detail.selection.kind === 'group-clip'
              ? { occurrenceId: detail.selection.occurrenceId, placementId: detail.selection.placementId }
              : null
            const detailIsClip = Boolean(
              detailSelectedClip || detailSelectedCompositionClipOwner || detailSelectedGroupClipOwner,
            )
            return (
            <ShowEntityDetailPanel
              key={detail.id}
              anchor={detail.anchor}
              ownerKey={showSelectionKey(detail.selection)}
              pinned={detail.pinned}
              avoidPinnedPanel={!detail.pinned}
              bodyOwnsOverflow={detailIsClip}
              bodyHeightOffset={detailIsClip && readOnly ? 32 : 0}
              onPinnedChange={() => {
                if (detail.pinned) {
                  setPinnedDetail(null)
                  return
                }
                setPinnedDetail({ selection: detail.selection, anchor: detail.anchor })
                closeDetailPanel()
              }}
              onClose={() => detail.pinned ? setPinnedDetail(null) : closeDetailPanel(true)}
            >
              <div
                className={detailIsClip ? 'flex h-full min-h-0 flex-col' : undefined}
                onChangeCapture={returnFocusAfterDiscreteCommit}
              >
                {readOnly && (
                  <div
                    role="note"
                    className="flex min-h-8 items-center gap-2 border-b border-amber-300/15 bg-amber-300/[0.04] px-2.5 pr-16 text-[9px] leading-4"
                  >
                    <Lock size={11} aria-hidden className="shrink-0 text-amber-300/75" />
                    <strong className="shrink-0 font-semibold uppercase tracking-[0.1em] text-amber-200/80">Built-in values</strong>
                    <span className="truncate text-zinc-400">Inspect here; create your own Show to edit.</span>
                  </div>
                )}
                <InspectorReadOnlyContext.Provider value={readOnly}>
                  <ContextualInspector
              show={activeShow}
                  compositionShow={inspectorShow ?? activeShow}
                  panelKey={detail.id}
                  selection={detail.selection}
                  selectedClip={detailSelectedClip}
                  selectedCompositionClipOwner={detailSelectedCompositionClipOwner}
                  selectedGroupClipOwner={detailSelectedGroupClipOwner}
                  transformEnabled={stageDimension === 2}
                  stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
                  patternOptions={patternOptions}
                  patternControlsByCellId={patternControlsByCellId}
                  patternControlsByInstanceId={patternControlsByInstanceId}
                  compiledOutputEffects={compiled.artifact?.summary.outputEffects}
                  controllerProfiles={controllerProfiles}
                  targetProfile={targetProfile}
                  userMaps={userMaps}
                  spatialSelectionUnavailableReason={spatialSelectionUnavailableReason}
                  onOpenSpatialSelection={(zoneId) => {
                    if (spatialRoutingLayout && !spatialSelectionUnavailableReason) {
                      setSpatialZoneSelection({ zoneId, layoutId: spatialRoutingLayout.id })
                    }
                  }}
                  onUpdateTargetProfile={(targetControllerProfileId) => void updateShow(activeShow.id, {
                    ...activeShow,
                    targetControllerProfileId: targetControllerProfileId || undefined,
                    updatedAt: Date.now(),
                  })}
                  onUpdatePortableReference={(referenceMapId, referencePixelCount) => void updateShow(activeShow.id, {
                    ...activeShow,
                    stageMapId: referenceMapId,
                    outputContract: createPortableShowOutputContract({ referenceMapId, referencePixelCount }),
                    updatedAt: Date.now(),
                  })}
                  onUpdateOutputEffects={(outputEffects) => void updateShow(activeShow.id, {
                    ...activeShow,
                    outputEffects: normalizeShowOutputEffects(outputEffects),
                    updatedAt: Date.now(),
                  })}
                  onPatternCommit={returnFocusToTimelineSelection}
                  onRemoveClip={(clip) => {
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'clip', clipId: clip.id })
                    void removeClip(activeShow.id, clip.id)
                  }}
                  onUpdateAdaptations={(cell, changes) => void updateCellAdaptations(activeShow.id, cell.id, changes)}
                  onUpdateClipInspector={commitClipInspectorPatch}
                  onPropertyAnimationChange={(owner, change) => {
                    if (!inspectorShow?.composition) return false
                    const composition = inspectorShow.composition
                    let next: ShowCompositionV1
                    if (owner.kind === 'group') {
                      next = applyShowGroupPropertyAnimationChange(
                        activeShow,
                        composition,
                        owner,
                        change,
                        newPersonalContentId,
                      )
                    } else {
                      const scene = inspectorShow.scenes.find((candidate) => candidate.id === owner.sceneId)
                      if (!scene) return false
                      next = change.kind === 'add-track'
                        ? addShowPropertyTrack(activeShow, composition, owner.sceneId, {
                            id: newPersonalContentId(),
                            target: change.target,
                            keyframes: (change.keyframes ?? [
                              { timeMs: 0, value: change.initialValue, easing: { curve: 'linear' as const } },
                              { timeMs: scene.durationMs, value: change.initialValue, easing: { curve: 'linear' as const } },
                            ]).map((keyframe) => ({ ...keyframe, id: newPersonalContentId() })),
                          })
                        : change.kind === 'update-keyframe'
                          ? updateShowPropertyKeyframe(activeShow, composition, owner.sceneId, change.trackId, change.keyframeId, change.changes)
                          : change.kind === 'add-keyframe'
                            ? addShowPropertyKeyframe(activeShow, composition, owner.sceneId, change.trackId, {
                                ...change.keyframe,
                                id: newPersonalContentId(),
                              })
                            : change.kind === 'delete-keyframe'
                              ? deleteShowPropertyKeyframe(composition, owner.sceneId, change.trackId, change.keyframeId)
                              : deleteShowPropertyTrack(composition, owner.sceneId, change.trackId)
                    }
                    if (next === composition) return false
                    void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                    return true
                  }}
                  onUpdateGroupClipInspector={commitGroupClipInspectorPatch}
                  onPreviewClipInspector={previewClipInspectorPatch}
                  onPreviewGroupClipInspector={previewGroupClipInspectorPatch}
                  onPreviewEnd={endInspectorPreview}
                  onMakeCompositionPatternIndependent={(owner) => {
                    if (!timelineComposition) return
                    const timelineOwner = showTimelineOwnerForInspector(owner)
                    if (!timelineOwner) return
                    const composition = makeShowClipPatternIndependent(timelineComposition, {
                      owner: timelineOwner,
                      newInstanceId: newPersonalContentId(),
                    })
                    if (composition === timelineComposition) return
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onRejoinCompositionPattern={(owner, targetInstanceId) => {
                    if (!timelineComposition) return
                    const timelineOwner = showTimelineOwnerForInspector(owner)
                    if (!timelineOwner) return
                    const composition = rejoinShowClipPatternInstance(timelineComposition, {
                      owner: timelineOwner,
                      targetInstanceId,
                    })
                    if (composition === timelineComposition) return
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onRemoveCompositionClip={(owner) => {
                    if (!timelineComposition) return
                    const timelineOwner: ShowTimelineClipOwner | null = owner.kind === 'scene-main'
                      ? {
                          kind: 'main',
                          sceneId: owner.sceneId,
                          zoneId: owner.zoneId,
                          placementId: owner.placementId,
                        }
                      : owner.kind === 'scene-overlay'
                        ? {
                            kind: 'overlay',
                            sceneId: owner.sceneId,
                            zoneId: owner.zoneId,
                            layerId: owner.layerId,
                            placementId: owner.placementId,
                          }
                        : null
                    if (timelineOwner && showLayerTransitionsConnectedToClip(timelineComposition, timelineOwner.placementId).length > 0) {
                      setCompositionClipPendingDelete(timelineOwner)
                      return
                    }
                    const composition = owner.kind === 'scene-main'
                      ? deleteShowMainPlacement(timelineComposition, owner)
                      : owner.kind === 'scene-overlay'
                        ? deleteShowOverlayPlacement(timelineComposition, owner)
                        : timelineComposition
                    if (composition === timelineComposition) return
                    closeDetailPanel()
                    if (timelineOwner) {
                      closePinnedDetailForSelection({ kind: 'clip', clipId: timelineOwner.placementId })
                    }
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onDuplicateGroup={(occurrenceId) => {
                    if (!activeShow.composition) return
                    const occurrence = activeShow.composition.groupOccurrences?.find((candidate) => candidate.id === occurrenceId)
                    const definition = activeShow.composition.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
                    if (!occurrence || !definition) return
                    const durationMs = Math.max(0, ...definition.placements.map((placement) => placement.startMs + placement.durationMs))
                    const newOccurrenceId = newPersonalContentId()
                    const composition = duplicateShowGroupOccurrence(activeShow.composition, {
                      occurrenceId,
                      newOccurrenceId,
                      startMs: occurrence.startMs + durationMs,
                    })
                    if (validateShowGroups(activeShow, composition).length > 0) return
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                      .then(() => selectTimeline({ kind: 'group', occurrenceId: newOccurrenceId }))
                  }}
                  onMakeGroupUnique={(occurrenceId) => {
                    if (!activeShow.composition) return
                    const composition = makeShowGroupOccurrenceUnique(activeShow.composition, {
                      occurrenceId,
                      newDefinitionId: newPersonalContentId(),
                    })
                    if (composition === activeShow.composition) return
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onTranslateGroup={(occurrenceId, translationX, translationY) => {
                    if (!activeShow.composition) return
                    const composition = translateShowGroupOccurrence(activeShow.composition, { occurrenceId, translationX, translationY })
                    if (composition === activeShow.composition) return
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onUpdateGroupPlacement={(occurrenceId, patch) => {
                    if (!activeShow.composition) return
                    const composition = updateShowGroupOccurrencePlacement(activeShow.composition, { occurrenceId, ...patch })
                    if (composition === activeShow.composition || validateShowGroups(activeShow, composition).length > 0) return
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onDeleteGroup={(occurrenceId) => {
                    requestDeleteSelection({ kind: 'group', occurrenceId })
                  }}
                  onUngroup={(occurrenceId) => {
                    if (!activeShow.composition) return
                    const composition = ungroupShowGroupOccurrence(activeShow.composition, occurrenceId)
                    if (composition === activeShow.composition) return
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'group', occurrenceId })
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onUpdateControlTarget={(cell, exportName, value) => void updateCellControlTarget(activeShow.id, cell.id, exportName, value)}
                  onUpdateRestartOnEntry={(cell, restartOnEntry) => void updateCellRestartOnEntry(activeShow.id, cell.id, restartOnEntry)}
                  onSpanZones={(cell, zoneSpan) => void spanCellZones(activeShow.id, cell.id, zoneSpan)}
                  onUpdateCellZoneMode={(cell, zoneMode) => void updateCellZoneMode(activeShow.id, cell.id, zoneMode)}
                  onUpdateBoundaryTransition={(transitionId, changes) => void updateBoundaryTransition(activeShow.id, transitionId, changes)}
                  onOpenTransitions={(transitionId) => setTransitionPaletteId(transitionId)}
                  onRemoveBoundaryTransition={(transitionId) => {
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'transition', transitionId })
                    void removeBoundaryTransition(activeShow.id, transitionId)
                  }}
                  onAddZone={() => {
                    timelineWorkspaceRef.current?.focus()
                    void addZone(activeShow.id)
                  }}
                  onUpdateZone={(zoneId, changes) => void updateZone(activeShow.id, zoneId, changes)}
                  onRemoveZone={(zoneId) => {
                    closeDetailPanel()
                    closePinnedDetailForSelection({ kind: 'zone', zoneId })
                    void removeZone(activeShow.id, zoneId)
                  }}
                  onAddRoutingLayout={(sourceLayoutId) => void addRoutingLayout(activeShow.id, sourceLayoutId)}
                  onUpdateRoutingLayout={(layoutId, changes) => void updateRoutingLayout(activeShow.id, layoutId, changes)}
                  onRemoveRoutingLayout={(layoutId) => void removeRoutingLayout(activeShow.id, layoutId)}
                  />
                </InspectorReadOnlyContext.Provider>
              </div>
            </ShowEntityDetailPanel>
            )
          })}
          {transitionPaletteId && activeShow.transitions?.some((transition) => transition.id === transitionPaletteId && transition.kind !== 'routing') && (
            <ShowTransitionPalette
              show={activeShow}
              transitionId={transitionPaletteId}
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              onApply={(transition) => {
                const { id, afterSceneId: _afterSceneId, ...changes } = transition
                void updateBoundaryTransition(activeShow.id, id, changes)
              }}
              onClose={() => setTransitionPaletteId(null)}
            />
          )}
          {layerTransitionTarget?.junction.kind === 'cut' && layerTransitionPlan && (
            <ShowLayerTransitionPalette
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              maxDurationMs={layerTransitionPlan.maxDurationMs}
              disabledReason={layerTransitionPlan.enabled ? undefined : layerTransitionPlan.reason}
              applyError={layerTransitionApplyError}
              fromName={layerTransitionTarget.fromName}
              toName={layerTransitionTarget.toName}
              onApply={(item, durationMs) => {
                if (!timelineComposition || !layerTransitionPlan.enabled) return
                const changes = showTransitionChangesForPresentation(item)
                const { kind, durationMs: _catalogueDuration, ...parameters } = changes
                if (!kind || kind === 'cut' || kind === 'routing') return
                const transition: ShowLayerTransition = {
                  ...parameters,
                  id: newPersonalContentId(),
                  fromPlacementId: layerTransitionTarget.junction.fromPlacementId,
                  toPlacementId: layerTransitionTarget.junction.toPlacementId,
                  kind,
                  durationMs: Math.min(durationMs, layerTransitionPlan.maxDurationMs),
                  easing: changes.easing ?? { curve: 'linear' },
                  ...(kind === 'crossfade' ? { crossfadePolicy: 'live-live' } : {}),
                }
                const nextComposition = layerTransitionTarget.groupOccurrenceId
                  ? insertShowGroupLayerTransition(activeShow, timelineComposition, {
                      occurrenceId: layerTransitionTarget.groupOccurrenceId,
                      transition,
                    })
                  : insertShowLayerTransition(activeShow, timelineComposition, transition)
                if (nextComposition === timelineComposition) {
                  setLayerTransitionApplyError(
                    `${item.label} could not be inserted because the available time at this junction changed. Reopen the Transition panel and try again.`,
                  )
                  return
                }
                setLayerTransitionApplyError(null)
                setLayerTransitionTarget(null)
                void updateShow(activeShow.id, {
                  ...activeShow,
                  composition: nextComposition,
                  updatedAt: Date.now(),
                })
              }}
              onClose={() => {
                setLayerTransitionApplyError(null)
                setLayerTransitionTarget(null)
              }}
            />
          )}
          {layerTransitionTarget?.junction.transition && (
            <ShowLayerTransitionEditor
              transition={layerTransitionTarget.junction.transition}
              fromName={layerTransitionTarget.fromName}
              toName={layerTransitionTarget.toName}
              anchor={layerTransitionTarget.anchor}
              onDurationChange={(durationMs) => {
                if (!timelineComposition) return
                const nextComposition = layerTransitionTarget.groupOccurrenceId
                  ? resizeShowGroupLayerTransition(activeShow, timelineComposition, {
                      occurrenceId: layerTransitionTarget.groupOccurrenceId,
                      transitionId: layerTransitionTarget.junction.id,
                      durationMs,
                    })
                  : resizeShowLayerTransition(
                      activeShow,
                      timelineComposition,
                      layerTransitionTarget.junction.id,
                      durationMs,
                    )
                if (nextComposition === timelineComposition) return
                setLayerTransitionTarget(null)
                void updateShow(activeShow.id, {
                  ...activeShow,
                  composition: nextComposition,
                  updatedAt: Date.now(),
                })
              }}
              onResetToCut={() => {
                if (!timelineComposition) return
                const nextComposition = layerTransitionTarget.groupOccurrenceId
                  ? resizeShowGroupLayerTransition(activeShow, timelineComposition, {
                      occurrenceId: layerTransitionTarget.groupOccurrenceId,
                      transitionId: layerTransitionTarget.junction.id,
                      durationMs: 0,
                    })
                  : resetShowLayerTransitionToCut(
                      activeShow,
                      timelineComposition,
                      layerTransitionTarget.junction.id,
                    )
                if (nextComposition === timelineComposition) return
                setLayerTransitionTarget(null)
                void updateShow(activeShow.id, {
                  ...activeShow,
                  composition: nextComposition,
                  updatedAt: Date.now(),
                })
              }}
              onClose={() => setLayerTransitionTarget(null)}
            />
          )}
          <AlertDialogRoot open={compositionClipPendingDelete !== null} onOpenChange={(open) => { if (!open) setCompositionClipPendingDelete(null) }}>
            <AlertDialogContent>
              <AlertDialogTitle>Remove connected Clip?</AlertDialogTitle>
              <AlertDialogDescription>
                Removing this Clip also removes {pendingConnectedTransitions.length === 1
                  ? 'its connected Transition'
                  : `${pendingConnectedTransitions.length} connected Transitions`}. Other Clip durations and positions stay unchanged.
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (compositionClipPendingDelete && timelineComposition) {
                      const nextComposition = deleteShowClipWithLayerTransitions(
                        activeShow,
                        timelineComposition,
                        compositionClipPendingDelete,
                      )
                      if (nextComposition !== timelineComposition) {
                        closeDetailPanel()
                        closePinnedDetailForSelection({ kind: 'clip', clipId: compositionClipPendingDelete.placementId })
                        void updateShow(activeShow.id, {
                          ...activeShow,
                          composition: nextComposition,
                          updatedAt: Date.now(),
                        })
                      }
                    }
                    setCompositionClipPendingDelete(null)
                  }}
                >
                  Remove Clip and Transition
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogRoot>
        </div>
      </div>
      <CompileBar
        compiled={compiled}
        artifactInventory={artifactInventory}
        pushResult={compileBarPushResult}
      />
    </div>
  )
}

const SHOW_PLAYBACK_RATE_BY_KEY: Readonly<Record<string, number | undefined>> = {
  '1': 1,
  '2': 2,
  '3': 3,
}

function ShowTransportControls({
  show,
}: {
  show: ShowRecord
}) {
  const isRunning = usePreviewStore((state) => state.isRunning)
  const toggle = usePreviewStore((state) => state.toggle)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || showControlOwnsKeyboardEvent(event.target)) return
      if (claimStudioPreviewSpace(event)) {
        usePreviewStore.getState().toggle()
        return
      }
      if (
        !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey
        && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      ) {
        if (event.target instanceof HTMLElement && event.target.closest('[role="treeitem"][aria-expanded]')) return
        const transport = useShowTransportStore.getState()
        if (transport.showId !== show.id) return
        event.preventDefault()
        if (event.repeat) return
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        requestShowSeek(show.id, transport.positionMs + direction * 5_000)
        return
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey) {
        const playbackRate = SHOW_PLAYBACK_RATE_BY_KEY[event.key]
        if (playbackRate !== undefined) {
          event.preventDefault()
          usePreviewStore.getState().setSpeed(playbackRate)
          return
        }
      }
      if (!event.metaKey && !event.ctrlKey && !event.altKey && event.key.toLowerCase() === 'a') {
        event.preventDefault()
        requestShowSeek(show.id, 0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [show.id])

  return (
    <div className="flex min-w-0 items-center gap-1" role="group" aria-label="Show transport controls">
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={isRunning ? 'Pause Show preview' : 'Play Show preview'}
        title={isRunning ? 'Pause Show preview (Space)' : 'Play Show preview (Space)'}
        className={isRunning
          ? 'bg-amber-400/10 text-amber-300 hover:bg-amber-400/15 hover:text-amber-200'
          : 'bg-transparent text-zinc-400 hover:bg-amber-400/10 hover:text-amber-200'}
        onClick={toggle}
      >
        {isRunning ? <Play size={20} aria-hidden className="size-[20px]" /> : <Pause size={20} aria-hidden className="size-[20px]" />}
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Go to Show start"
        title="Go to Show start (A)"
        className="bg-transparent text-zinc-500 hover:bg-amber-400/10 hover:text-amber-200"
        onPointerUp={(event) => event.currentTarget.blur()}
        onClick={() => requestShowSeek(show.id, 0)}
      >
        <SkipBack size={18} aria-hidden className="size-[18px]" />
      </Button>
    </div>
  )
}

function ShowTimeDisplay({ show }: { show: ShowRecord }) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  return (
    <div className="timeline-time-cluster flex shrink-0 items-center border-l border-zinc-800/80 px-2" role="group" aria-label="Timeline position">
      <output
        className="timeline-time-display flex min-w-[118px] items-baseline gap-0.5 whitespace-nowrap text-xs tabular-nums"
        aria-live="off"
        aria-label="Show time"
      >
        <span className="text-zinc-100">{formatShowTime(positionMs)}</span>
        <span className="timeline-time-separator text-zinc-600" aria-hidden>/</span>
        <span className="text-zinc-500">{formatShowTime(durationMs)}</span>
      </output>
    </div>
  )
}

function useShowTransportClock(show: ShowRecord | null, clockActive: boolean): void {
  const showId = show?.id ?? null
  const durationMs = show ? showLoopDurationMs(show) : 0
  const isRunning = usePreviewStore((state) => state.isRunning)
  const seekStatus = useShowTransportStore((state) => (
    showId && state.showId === showId ? state.seekStatus : 'idle'
  ))
  const seekRequest = useShowTransportStore((state) => (
    showId && state.showId === showId ? state.seekRequest : null
  ))

  useEffect(() => {
    if (!showId) return
    useShowTransportStore.getState().openShow(showId, durationMs)
  }, [durationMs, showId])

  useEffect(() => {
    if (!clockActive || seekStatus !== 'rebuilding' || !seekRequest) return
    useShowTransportStore.getState().completeSeek(seekRequest.id, seekRequest.targetMs)
  }, [clockActive, seekRequest, seekStatus])

  useEffect(() => {
    if (!showId || !clockActive || !canAdvanceShowPlayback(isRunning, seekStatus)) return
    let frameId: number | null = null
    let lastFrameAt: number | null = null
    const tick = (now: number) => {
      const transport = useShowTransportStore.getState()
      if (!canAdvanceShowPlayback(usePreviewStore.getState().isRunning, transport.seekStatus)) return
      const last = lastFrameAt ?? now
      lastFrameAt = now
      const deltaMs = Math.max(0, now - last) * usePreviewStore.getState().speed
      const step = resolveShowPlaybackStep(
        transport.positionMs,
        deltaMs,
        transport.playbackWindow,
        durationMs,
      )
      if (step.kind === 'rewind') {
        usePreviewStore.getState().setRunning(false)
        transport.setPosition(showId, step.targetMs)
        frameId = null
        return
      }
      transport.setPosition(showId, step.targetMs)
      frameId = requestAnimationFrame(tick)
    }
    frameId = requestAnimationFrame(tick)
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId)
    }
  }, [clockActive, durationMs, isRunning, seekStatus, showId])
}

function ShowTimelineHistoryCommands({
  show,
  readOnly,
}: {
  show: ShowRecord
  readOnly: boolean
}) {
  const undoShow = useShowStore((state) => state.undoShow)
  const redoShow = useShowStore((state) => state.redoShow)
  const history = useShowStore((state) => state.showHistories[show.id])
  const undoEnabled = !readOnly && Boolean(history?.past.length)
  const redoEnabled = !readOnly && Boolean(history?.future.length)
  return <>
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Undo Show edit"
      title="Undo Show edit (Command/Ctrl+Z)"
      disabled={!undoEnabled}
      className={showTimelineToolbarControlClass({ enabled: undoEnabled })}
      onClick={() => void undoShow(show.id)}
    >
      <Undo2 size={12} aria-hidden />
    </Button>
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label="Redo Show edit"
      title="Redo Show edit (Command/Ctrl+Shift+Z)"
      disabled={!redoEnabled}
      className={showTimelineToolbarControlClass({ enabled: redoEnabled })}
      onClick={() => void redoShow(show.id)}
    >
      <Redo2 size={12} aria-hidden />
    </Button>
  </>
}

function ShowTimelineCommands({
  show,
  composition,
  readOnly,
  selection,
  onSelect,
  onCreateGroup,
  onSplitCompositionClip,
  onDuplicateCompositionClip,
}: {
  show: ShowRecord
  composition: ShowCompositionV1 | null
  readOnly: boolean
  selection: ShowSelection
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  onCreateGroup: (selection: ShowGroupSelection) => Promise<string | null>
  onSplitCompositionClip: (owner: ShowTimelineClipOwner, globalTimeMs: number) => Promise<string | null>
  onDuplicateCompositionClip: (owner: ShowTimelineClipOwner) => Promise<string | null>
}) {
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const splitAtTime = useShowStore((state) => state.splitAtTime)
  const cloneClip = useShowStore((state) => state.cloneClip)
  const legacySplitCapability = showSplitCapability(show, positionMs)
  const groupPlan = composition && selection.kind === 'multi'
    ? validateShowGroupSelection(composition, selection.groupSelection)
    : { enabled: false as const, code: 'empty' as const, reason: 'Select two or more Clips to make a Group.' }
  const splitReasonId = `show-split-reason-${show.id}`
  const [splitReasonOpen, setSplitReasonOpen] = useState(false)
  const groupReasonId = `show-group-reason-${show.id}`
  const [groupReasonOpen, setGroupReasonOpen] = useState(false)
  const compositionOwner = selection.kind === 'clip'
    ? findTimelineClipOwner(composition, selection.clipId)
    : null
  const compositionTimeline = useMemo(() => (
    composition ? projectShowUnifiedTimeline(show, composition) : null
  ), [composition, show])
  const compositionClip = compositionOwner
    ? compositionTimeline?.zones.flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
      .find((clip) => clip.id === compositionOwner.placementId)
    : null
  const splitCapability = compositionOwner && composition
    ? planShowClipSplitAtGlobalTime(show, composition, {
        owner: compositionOwner,
        globalTimeMs: positionMs,
      })
    : legacySplitCapability
  const legacyCloneCapability = showCloneCapability(show, selection)
  const compositionClonePlan = compositionOwner && composition
    ? planShowClipDuplicateAfter(show, composition, {
        owner: compositionOwner,
        independent: true,
      })
    : null
  const cloneCapability = compositionOwner
    ? compositionClip
      && compositionClonePlan?.enabled
      ? { enabled: true, reason: `Duplicate ${compositionClip.patternName} immediately after itself` }
      : {
          enabled: false,
          reason: compositionClonePlan && !compositionClonePlan.enabled
            ? compositionClonePlan.reason
            : 'The selected Clip needs empty time after it on this Layer',
        }
    : legacyCloneCapability

  const cloneSelection = async () => {
    if (!cloneCapability.enabled) return
    if (compositionOwner) {
      const copyId = await onDuplicateCompositionClip(compositionOwner)
      if (copyId) onSelect({ kind: 'clip', clipId: copyId })
      return
    }
    if (selection.kind === 'clip') {
      const copy = await cloneClip(show.id, selection.clipId)
      if (copy) onSelect({ kind: 'clip', clipId: copy.id })
    }
  }
  const splitEnabled = !readOnly && splitCapability.enabled
  const cloneEnabled = !readOnly && cloneCapability.enabled
  const groupEnabled = !readOnly && groupPlan.enabled

  return (
    <div className="flex shrink-0 items-center justify-end gap-[1.5px]" role="group" aria-label="Timeline commands">
      <span className="relative inline-flex">
        <Button
          size="xs"
          variant="ghost"
          aria-label="Split at playhead"
          disabled={readOnly}
          aria-disabled={splitCapability.enabled ? undefined : true}
          aria-describedby={!splitCapability.enabled && splitReasonOpen ? splitReasonId : undefined}
          title={splitCapability.reason}
          className={`px-1.5 text-[10px] ${showTimelineToolbarControlClass({
            enabled: splitEnabled,
          })}`}
          onFocus={() => {
            if (!splitCapability.enabled) setSplitReasonOpen(true)
          }}
          onBlur={() => setSplitReasonOpen(false)}
          onClick={() => {
            if (!splitCapability.enabled) {
              setSplitReasonOpen(true)
              return
            }
            if (usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
            if (compositionOwner) {
              void onSplitCompositionClip(compositionOwner, positionMs).then((placementId) => {
                if (placementId) onSelect({ kind: 'clip', clipId: placementId })
              })
            } else {
              void splitAtTime(show.id, positionMs)
            }
          }}
        >
          <Scissors size={12} aria-hidden />
          <span className="timeline-command-label timeline-command-label-secondary">Split</span>
        </Button>
        {!splitCapability.enabled && splitReasonOpen && (
          <span
            id={splitReasonId}
            role="status"
            aria-label="Split unavailable"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+5px)] z-40 w-44 rounded border border-amber-400/30 bg-zinc-950 px-2 py-1.5 text-left text-[9px] leading-3 text-amber-200 shadow-lg"
          >
            {splitCapability.code === 'scene-edge-margin'
              ? 'Split needs 1.0 s on both sides'
              : splitCapability.code === 'logical-clip'
                ? 'This multi-part Clip cannot be split here'
              : splitCapability.code === 'transition-gap'
                ? 'A Clip cannot be split inside a Transition'
              : splitCapability.code === 'nonlinear-property-animation'
                ? 'Add a keyframe here or make this segment Linear before splitting'
                : splitCapability.code === 'outside-clip'
                  ? 'Place the playhead inside the selected Clip'
                  : 'Move the playhead inside the selected Clip'}
          </span>
        )}
      </span>
      <Button
        size="xs"
        variant="ghost"
        aria-label="Clone selection"
        title={cloneCapability.reason}
        disabled={readOnly || !cloneCapability.enabled}
        className={`px-1.5 text-[10px] ${showTimelineToolbarControlClass({
          enabled: cloneEnabled,
        })}`}
        onClick={() => void cloneSelection()}
      >
        <Copy size={12} aria-hidden />
        <span className="timeline-command-label timeline-command-label-secondary">Clone</span>
      </Button>
      <span className="relative inline-flex">
        <Button
          size="xs"
          variant="ghost"
          aria-label="Make Group from selection"
          title={groupPlan.enabled ? 'Keep the selected choreography together and make it reusable' : groupPlan.reason}
          disabled={readOnly}
          aria-disabled={!groupPlan.enabled || undefined}
          aria-describedby={!groupPlan.enabled && groupReasonOpen ? groupReasonId : undefined}
          className={`px-1.5 text-[10px] ${showTimelineToolbarControlClass({
            enabled: groupEnabled,
          })}`}
          onFocus={() => {
            if (!groupPlan.enabled) setGroupReasonOpen(true)
          }}
          onBlur={() => setGroupReasonOpen(false)}
          onClick={() => {
            if (groupPlan.enabled) void onCreateGroup(groupPlan)
            else setGroupReasonOpen(true)
          }}
        >
          <Layers3 size={12} aria-hidden />
          <span className="timeline-command-label timeline-command-label-tertiary">Group</span>
        </Button>
        {!groupPlan.enabled && groupReasonOpen && (
          <span
            id={groupReasonId}
            role="status"
            aria-label="Group unavailable"
            aria-live="polite"
            className="absolute right-0 top-[calc(100%+5px)] z-40 w-48 rounded border border-amber-400/30 bg-zinc-950 px-2 py-1.5 text-left text-[9px] leading-3 text-amber-200 shadow-lg"
          >
            {groupPlan.reason}
          </span>
        )}
      </span>
    </div>
  )
}

function showCloneCapability(show: ShowRecord, selection: ShowSelection): { enabled: boolean; reason: string } {
  if (selection.kind === 'clip') {
    const cell = show.cells.find((candidate) => candidate.id === selection.clipId)
    if (!cell) return { enabled: false, reason: 'The selected Clip no longer exists' }
    if (Math.max(1, cell.sceneSpan) !== 1 || Math.max(1, cell.zoneSpan ?? 1) !== 1) {
      return { enabled: false, reason: 'Held and multi-zone Clips cannot be cloned yet' }
    }
    return { enabled: true, reason: `Clone ${cell.patternName} immediately after itself` }
  }
  return { enabled: false, reason: 'Select one simple Clip to Clone' }
}

function requestShowSeek(showId: string, targetMs: number): void {
  const preview = usePreviewStore.getState()
  const shouldResume = preview.isRunning
  if (shouldResume) preview.toggle()
  const transport = useShowTransportStore.getState()
  transport.setPosition(showId, targetMs)
  transport.requestSeek(showId, targetMs)
  if (shouldResume && !usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
}

function showControlOwnsKeyboardEvent(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.closest('[data-show-timeline-focus]') && target.matches('[data-show-timeline-focus]')) return false
  if (target.closest('[data-studio-space-preview="true"]')) return false
  // role="tab" is listed because the Clip detail tabs cannot be <button>: a
  // read-only Show wraps the panel in <fieldset disabled>, which would disable
  // them. Without it, Show shortcuts fire while a tab has focus (#642).
  return target.closest('input, select, textarea, button, a[href], summary, [contenteditable="true"], [role="textbox"], [role="slider"], [role="tab"]') !== null
}

function ExportShowButton({
  exported,
  buildExport,
}: {
  exported: ShowEpeExport | null
  buildExport: () => Promise<ShowEpeExport | null>
}) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return (
    <Button
      size="xs"
      variant="ghost"
      aria-label="Export Show as .epe"
      title={error ?? 'Export Show as .epe'}
      disabled={!exported || exporting}
      className="bg-zinc-900/60 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
      onClick={() => {
        setExporting(true)
        setError(null)
        void buildExport().then((ready) => {
          if (!ready) return
          const url = URL.createObjectURL(new Blob([ready.text], { type: 'application/json' }))
          const anchor = document.createElement('a')
          anchor.href = url
          anchor.download = ready.filename
          anchor.style.display = 'none'
          document.body.appendChild(anchor)
          anchor.click()
          window.setTimeout(() => {
            anchor.remove()
            URL.revokeObjectURL(url)
          }, 0)
        }).catch((cause) => {
          setError(cause instanceof Error ? cause.message : 'Export failed')
        }).finally(() => setExporting(false))
      }}
    >
      {exporting ? <RotateCw size={13} className="animate-spin" aria-hidden /> : <Download size={13} aria-hidden />}
      <span className="show-header-action-label">
        {exporting ? 'Preparing' : error ? 'Export failed' : '.epe'}
      </span>
    </Button>
  )
}

function ShowTimelineWorkspace({
  show,
  timelineComposition,
  readOnly,
  transportActive,
  patternControlsByCellId,
  patternControlsByInstanceId,
  selection,
  blockedDeleteFeedback,
  isolatedGroupOccurrenceId,
  onSelect,
  onEnterGroupIsolation,
  onExitGroupIsolation,
  onSelectGroupCandidates,
  onCreateGroup,
  onDismiss,
  onDirectManipulationChange,
  onReanchorDetails,
  patternOptions,
  onAddClipAtPlayhead,
  onMoveCompositionClip,
  onDuplicateCompositionClipAtTarget,
  onAddCompositionLayer,
  onSplitCompositionClip,
  onDuplicateCompositionClip,
  onResizeCompositionClip,
  onOpenLayerTransition,
  onInsertTime,
  onAddMarker,
  onMoveMarker,
  onUpdateMarker,
  onRemoveMarker,
  onSetShowEnd,
  onAppendLayoutInterval,
  onInsertLayoutInterval,
  onDuplicateLayoutInterval,
  onMakeLayoutIntervalUnique,
  onAddZone,
  onUpdateZone,
  onRemoveZone,
}: {
  show: ShowRecord
  timelineComposition: ShowCompositionV1 | null
  readOnly: boolean
  transportActive: boolean
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  patternControlsByInstanceId: Record<string, AutomatablePatternControl[]>
  selection: ShowSelection
  blockedDeleteFeedback: BlockedDeleteFeedback | null
  isolatedGroupOccurrenceId: string | null
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  onEnterGroupIsolation: (occurrenceId: string, placementId: string, anchor: HTMLElement) => void
  onExitGroupIsolation: () => void
  onSelectGroupCandidates: (selection: ShowGroupSelection) => void
  onCreateGroup: (selection: ShowGroupSelection) => Promise<string | null>
  onDismiss: () => void
  onDirectManipulationChange: (active: boolean) => void
  onReanchorDetails: (selection: ShowSelection) => void
  patternOptions: ShowPatternOption[]
  onAddClipAtPlayhead: (input: {
    zoneId: string
    globalTimeMs: number
    target: ShowClipAddTarget
    pattern: ShowCell['pattern']
    patternName: string
  }) => Promise<string | null>
  onMoveCompositionClip: (input: {
    owner: ShowTimelineClipOwner
    target: ShowTimelineClipMoveTarget
    sourceComposition?: ShowCompositionV1
    plannedComposition?: ShowCompositionV1
  }) => Promise<boolean>
  onDuplicateCompositionClipAtTarget: (input: {
    sourceComposition: ShowCompositionV1
    plannedComposition: ShowCompositionV1
  }) => Promise<boolean>
  onAddCompositionLayer: (zoneId: string) => Promise<boolean>
  onSplitCompositionClip: (owner: ShowTimelineClipOwner, globalTimeMs: number) => Promise<string | null>
  onDuplicateCompositionClip: (owner: ShowTimelineClipOwner) => Promise<string | null>
  onResizeCompositionClip: (input: {
    owner: ShowTimelineClipOwner,
    globalStartMs: number,
    durationMs: number,
    sourceComposition?: ShowCompositionV1
    plannedComposition?: ShowCompositionV1
  }) => Promise<boolean>
  onOpenLayerTransition: (target: ShowLayerTransitionTarget) => void
  onInsertTime: (atMs: number, durationMs: number) => Promise<boolean>
  onAddMarker: (timeMs: number) => Promise<boolean>
  onMoveMarker: (markerId: string, timeMs: number) => Promise<boolean>
  onUpdateMarker: (markerId: string, patch: Partial<Omit<NonNullable<ShowCompositionV1['markers']>[number], 'id'>>) => Promise<boolean>
  onRemoveMarker: (markerId: string) => Promise<boolean>
  onSetShowEnd: (durationMs: number) => Promise<boolean>
  onAppendLayoutInterval: (sourceLayoutId: string | undefined, durationMs: number) => Promise<boolean>
  onInsertLayoutInterval: (sourceLayoutId: string | undefined, durationMs: number, atMs: number) => Promise<boolean>
  onDuplicateLayoutInterval: (intervalId: string, withContent: boolean) => Promise<boolean>
  onMakeLayoutIntervalUnique: (intervalId: string) => Promise<boolean>
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
}) {
  const [showEndPreviewMs, setShowEndPreviewMs] = useState<number | null>(null)
  const [markerFeedback, setMarkerFeedback] = useState<TimelineMarkerFeedback | null>(null)
  const displayShow = useMemo(() => {
    if (showEndPreviewMs === null || !timelineComposition) return show
    return setShowEndMs({ ...show, composition: timelineComposition }, showEndPreviewMs)
  }, [show, showEndPreviewMs, timelineComposition])
  const strip = projectShowStrip(displayShow)
  const timeline = projectShowTimeline(displayShow)
  const layoutIntervals = useMemo(() => projectShowLayoutIntervals(displayShow), [displayShow])
  const unifiedCompositionTimeline = useMemo(() => (
    timelineComposition
      ? projectShowUnifiedTimeline(displayShow, timelineComposition)
      : null
  ), [displayShow, timelineComposition])
  const traversalTargets = useMemo(() => (
    unifiedCompositionTimeline
      ? projectShowTimelineTraversalTargets(unifiedCompositionTimeline, isolatedGroupOccurrenceId)
      : []
  ), [isolatedGroupOccurrenceId, unifiedCompositionTimeline])
  const isolatedGroupOccurrence = timelineComposition?.groupOccurrences
    ?.find((occurrence) => occurrence.id === isolatedGroupOccurrenceId) ?? null
  const isolatedGroupDefinition = timelineComposition?.groupDefinitions
    ?.find((definition) => definition.id === isolatedGroupOccurrence?.definitionId) ?? null
  const fittedViewport = fitShowTimelineViewport(timeline.durationMs)
  const [storedViewport, setViewport] = useState<ShowTimelineViewport>(fittedViewport)
  const snapEnabled = useShowEditorSessionStore((state) => state.snapEnabled)
  const setSnapEnabled = useShowEditorSessionStore((state) => state.setSnapEnabled)
  const markersVisible = useShowEditorSessionStore((state) => state.markersVisible)
  const setMarkersVisible = useShowEditorSessionStore((state) => state.setMarkersVisible)
  const setMarkerSnapEnabled = useShowEditorSessionStore((state) => state.setMarkerSnapEnabled)
  const zonesOpen = useShowEditorSessionStore((state) => (
    state.zoneWorkspaceOpenByShowId[show.id] ?? stockShowById(show.id)?.zonesOpenByDefault ?? false
  ))
  const collapsedZoneIds = useShowEditorSessionStore((state) => state.collapsedZoneIdsByShowId[show.id]) ?? EMPTY_ZONE_IDS
  const focusedZoneId = useShowEditorSessionStore((state) => state.focusedZoneIdByShowId[show.id] ?? null)
  const setZoneWorkspaceOpen = useShowEditorSessionStore((state) => state.setZoneWorkspaceOpen)
  const setZoneCollapsed = useShowEditorSessionStore((state) => state.setZoneCollapsed)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  const [draggingCompositionClip, setDraggingCompositionClip] = useState<{
    clipId: string
    owner: ShowTimelineClipOwner
    grabOffsetMs: number
    mode: 'move' | 'duplicate'
    duplicatePlacementId: string | null
    duplicateInstanceId: string | null
  } | null>(null)
  const draggingCompositionClipRef = useRef(draggingCompositionClip)
  const [resizePreview, setResizePreview] = useState<ShowClipResizePreview | null>(null)
  const resizePlanRef = useRef<ShowClipResizePlan | null>(null)
  const suppressResizeClipClickRef = useRef<string | null>(null)
  const [movePreview, setMovePreview] = useState<ShowClipMovePreview | null>(null)
  const movePlanRef = useRef<ShowClipMovePlan | null>(null)
  const activeMoveLayerRef = useRef<{
    element: HTMLElement
    layer: ShowUnifiedTimelineLayerProjection
    zoneId: string
    targetKey: string
  } | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addPopoverAnchor, setAddPopoverAnchor] = useState<HTMLButtonElement | null>(null)
  const [addClipOpen, setAddClipOpen] = useState(false)
  const [addClipPointerContext, setAddClipPointerContext] = useState<{
    anchor: HTMLElement
    point: { clientX: number; clientY: number }
    zoneId: string
    target: ShowClipAddTarget
  } | null>(null)
  const [addClipSubmitting, setAddClipSubmitting] = useState(false)
  const [insertTimeOpen, setInsertTimeOpen] = useState(false)
  const [insertTimeSeconds, setInsertTimeSeconds] = useState(1)
  const [insertTimeAtMs, setInsertTimeAtMs] = useState(0)
  const [layoutActionsOpen, setLayoutActionsOpen] = useState(false)
  const [zoneMapOpen, setZoneMapOpen] = useState(false)
  const [zoneMapAnchor, setZoneMapAnchor] = useState<HTMLButtonElement | null>(null)
  const [layoutActionTimeMs, setLayoutActionTimeMs] = useState(0)
  const [layoutActionDurationSeconds, setLayoutActionDurationSeconds] = useState(5)
  const [layoutActionError, setLayoutActionError] = useState<string | null>(null)
  const [addClipTimeMs, setAddClipTimeMs] = useState(0)
  const [addClipPatternKey, setAddClipPatternKey] = useState<string | null>(null)
  const selectedCompositionZoneId = selection.kind === 'zone'
    ? selection.zoneId
    : selection.kind === 'clip'
      ? unifiedCompositionTimeline?.zones.find((zone) => (
          zone.layers.some((layer) => layer.clips.some((clip) => clip.id === selection.clipId))
        ))?.id
      : null
  const preferredAuthoringZoneId = selectedCompositionZoneId ?? focusedZoneId
  const addClipZoneId = addClipPointerContext?.zoneId
    ?? showLayoutZoneIdAtTime(show, addClipTimeMs, preferredAuthoringZoneId)
  const exactAddClipPlan = timelineComposition && addClipPointerContext
    ? planShowClipAtGlobalTime(show, timelineComposition, {
        zoneId: addClipPointerContext.zoneId,
        globalTimeMs: addClipTimeMs,
        target: addClipPointerContext.target,
      })
    : null
  const addClipDestination = addClipPointerContext
    ? exactAddClipPlan?.enabled
      ? { target: addClipPointerContext.target, plan: exactAddClipPlan }
      : null
    : timelineComposition && addClipZoneId
      ? planShowClipAtTopmostAvailableLayer(show, timelineComposition, {
          zoneId: addClipZoneId,
          globalTimeMs: addClipTimeMs,
        })
      : null
  const transport = useShowTransportStore.getState()
  const layerTargetTimeMs = transport.showId === show.id ? transport.positionMs : 0
  const layerTargetZoneId = showLayoutZoneIdAtTime(show, layerTargetTimeMs, preferredAuthoringZoneId)
  const layerTargetZoneName = show.zones.find((zone) => zone.id === layerTargetZoneId)?.name ?? 'Zone'
  const insertTimeDurationMs = Math.round(insertTimeSeconds * 1000)
  const insertTimePlan = planShowTimeInsertion(
    timelineComposition ? { ...show, composition: timelineComposition } : show,
    insertTimeAtMs,
    insertTimeDurationMs,
  )
  const selectedTransitionClipId = selection.kind === 'clip'
    ? selection.clipId
    : selection.kind === 'group-clip'
      ? `${selection.occurrenceId}:${selection.placementId}`
      : null
  const addTransitionPlan = useMemo(() => timelineComposition
    ? planShowLayerTransitionInsertionForClip(show, timelineComposition, selectedTransitionClipId)
    : { enabled: false as const, maxDurationMs: 0 as const, reason: 'Select a Clip first.', target: null }, [show, selectedTransitionClipId, timelineComposition])
  const addTransitionLabel = addTransitionPlan.target
    ? `Transition ${addTransitionPlan.target.side === 'after' ? 'to' : 'from'} ${addTransitionPlan.target.side === 'after'
      ? addTransitionPlan.target.toName
      : addTransitionPlan.target.fromName}`
    : 'Transition'

  const beginGroupMarquee = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (readOnly || !timelineComposition || isolatedGroupOccurrenceId || event.button !== 0) return
    const target = event.target
    if (target instanceof Element && target.closest('button, input, select, textarea, [role="slider"], [data-show-layer-junction]')) return
    const grid = event.currentTarget
    const gridRect = grid.getBoundingClientRect()
    const startX = Math.max(0, Math.min(gridRect.width, event.clientX - gridRect.left))
    const startY = Math.max(0, Math.min(gridRect.height, event.clientY - gridRect.top))
    let currentX = startX
    let currentY = startY
    onDirectManipulationChange(true)
    const render = () => setMarquee({
      left: Math.min(startX, currentX),
      top: Math.min(startY, currentY),
      width: Math.abs(currentX - startX),
      height: Math.abs(currentY - startY),
    })
    const move = (pointer: PointerEvent) => {
      currentX = Math.max(0, Math.min(gridRect.width, pointer.clientX - gridRect.left))
      currentY = Math.max(0, Math.min(gridRect.height, pointer.clientY - gridRect.top))
      render()
    }
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      const selectionRect = {
        left: gridRect.left + Math.min(startX, currentX),
        right: gridRect.left + Math.max(startX, currentX),
        top: gridRect.top + Math.min(startY, currentY),
        bottom: gridRect.top + Math.max(startY, currentY),
      }
      const placementIds = [...grid.querySelectorAll<HTMLElement>('[data-show-composition-clip="true"]:not([data-show-group-occurrence])')]
        .filter((element) => {
          const rect = element.getBoundingClientRect()
          return rect.right >= selectionRect.left
            && rect.left <= selectionRect.right
            && rect.bottom >= selectionRect.top
            && rect.top <= selectionRect.bottom
        })
        .map((element) => element.dataset.showSelectionKey?.replace(/^clip:/, ''))
        .filter((id): id is string => Boolean(id))
      setMarquee(null)
      onDirectManipulationChange(false)
      if (placementIds.length > 0) {
        onSelectGroupCandidates(completeShowGroupSelection(timelineComposition, placementIds))
      }
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      setMarquee(null)
      onDirectManipulationChange(false)
    }
    render()
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }
  const hasMultipleZones = show.zones.length > 1
  const showFullZoneHeaders = zonesOpen
  const showMicroZonePicker = hasMultipleZones && !zonesOpen
  const collapsedZoneIdSet = new Set(hasMultipleZones ? collapsedZoneIds : [])
  const addClipPattern = patternOptions.find((option) => (
    `${option.ref.kind}:${option.ref.id}` === addClipPatternKey
  )) ?? null
  const chooseAddClipPattern = (patternKey: string) => {
    if (addClipSubmitting || !addClipZoneId || !addClipDestination) return
    const pattern = patternOptions.find((option) => (
      `${option.ref.kind}:${option.ref.id}` === patternKey
    ))
    if (!pattern) return
    setAddClipPatternKey(patternKey)
    setAddClipSubmitting(true)
    void onAddClipAtPlayhead({
      zoneId: addClipZoneId,
      globalTimeMs: addClipTimeMs,
      target: addClipDestination.target,
      pattern: pattern.ref,
      patternName: pattern.label,
    }).then((placementId) => {
      if (!placementId) return
      setAddClipOpen(false)
      setAddClipPointerContext(null)
      onSelect({ kind: 'clip', clipId: placementId })
    }).finally(() => setAddClipSubmitting(false))
  }
  const layoutActionInterval = showLayoutIntervalAtTime(layoutIntervals, layoutActionTimeMs)
  const layoutActionDurationMs = Math.round(layoutActionDurationSeconds * 1000)
  const layoutActionDurationValid = Number.isFinite(layoutActionDurationMs) && layoutActionDurationMs >= 1
  const layoutActionUseCount = layoutActionInterval
    ? layoutIntervals.filter((interval) => interval.layoutId === layoutActionInterval.layoutId).length
    : 0
  const runLayoutAction = (action: () => Promise<boolean>) => {
    setLayoutActionError(null)
    void action().then((changed) => {
      if (changed) setLayoutActionsOpen(false)
      else setLayoutActionError('That operation is not available at this time. Move the playhead outside a Transition and leave enough room to split occupied Clips.')
    })
  }
  let viewport = storedViewport
  if (viewport.totalMs !== fittedViewport.totalMs) {
    const zoom = viewport.totalMs / viewport.durationMs
    const transport = useShowTransportStore.getState()
    const anchorMs = transport.showId === show.id ? transport.positionMs : 0
    viewport = zoomShowTimelineViewport(fittedViewport, zoom, Math.min(anchorMs, fittedViewport.totalMs))
    setViewport(viewport)
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const timelineRulerRef = useRef<HTMLDivElement>(null)
  const initialTransport = useShowTransportStore.getState()
  const positionMsRef = useRef(initialTransport.showId === show.id ? initialTransport.positionMs : 0)
  useEffect(() => {
    return useShowTransportStore.subscribe((state) => {
      if (state.showId === show.id) positionMsRef.current = state.positionMs
    })
  }, [show.id])
  const markerTimesMs = markersVisible
    ? (timelineComposition?.markers ?? []).map((marker) => marker.timeMs)
    : []
  const structuralTimesWithoutMarkersMs = [...new Set([
    0,
    timeline.durationMs,
    ...timeline.scenes.flatMap((scene) => [scene.startMs, scene.endMs]),
    ...timeline.transitions.flatMap((transition) => [transition.startMs, transition.endMs]),
    ...timeline.boundaryTransitions.flatMap((transition) => [transition.startMs, transition.endMs]),
    ...timeline.rows.flatMap((row) => row.cells.flatMap((cell) => [cell.startMs, cell.endMs])),
    ...(unifiedCompositionTimeline?.zones.flatMap((zone) => (
      zone.layers.flatMap((layer) => layer.clips.flatMap((clip) => [clip.startMs, clip.endMs]))
    )) ?? []),
  ])]
  const structuralTimesMs = [...new Set([
    ...structuralTimesWithoutMarkersMs,
    ...markerTimesMs,
  ])]
  const clipMarkerSnapEnabled = markersVisible
  // Timeline drops are quantized by default: whole seconds, or tenths while
  // Shift is held (#667). Boundary magnetism (Clip edges, Markers, the
  // playhead) still wins within its pixel threshold; the Magnet toggle
  // governs that magnetism only. Alt is the per-gesture escape to raw
  // milliseconds — it no longer inverts the Magnet toggle.
  const snapClipBoundary = (
    candidateMs: number,
    options: {
      altKey: boolean
      shiftKey: boolean
      visibleWidthPx: number
      minTimeMs?: number
      maxTimeMs: number
    },
  ) => {
    const minTimeMs = options.minTimeMs ?? 0
    if (options.altKey) {
      return snapShowTimelineTime(candidateMs, {
        visibleDurationMs: viewport.durationMs,
        visibleWidthPx: options.visibleWidthPx,
        structuralTimesMs: [],
        gridEnabled: false,
        minTimeMs,
        maxTimeMs: options.maxTimeMs,
      })
    }
    const activeStructuralTimesMs = [
      positionMsRef.current,
      ...(snapEnabled ? structuralTimesWithoutMarkersMs : []),
      ...(clipMarkerSnapEnabled ? markerTimesMs : []),
    ]
      .filter((timeMs) => timeMs >= minTimeMs && timeMs <= options.maxTimeMs)
    return snapShowTimelineTime(candidateMs, {
      visibleDurationMs: viewport.durationMs,
      visibleWidthPx: options.visibleWidthPx,
      structuralTimesMs: activeStructuralTimesMs,
      quantizeStepMs: showTimelineQuantizeStepMs(options.shiftKey, viewport.durationMs, options.visibleWidthPx),
      minTimeMs,
      maxTimeMs: options.maxTimeMs,
    })
  }
  const resolveClipMoveStart = (
    candidateStartMs: number,
    durationMs: number,
    options: {
      altKey: boolean
      shiftKey: boolean
      visibleWidthPx: number
      totalMs: number
    },
  ) => {
    const maxStartMs = Math.max(0, options.totalMs - durationMs)
    const rawStartMs = Math.max(0, Math.min(maxStartMs, candidateStartMs))
    const startSnap = snapClipBoundary(rawStartMs, {
      altKey: options.altKey,
      shiftKey: options.shiftKey,
      visibleWidthPx: options.visibleWidthPx,
      maxTimeMs: maxStartMs,
    })
    const rawEndMs = rawStartMs + durationMs
    const endSnap = snapClipBoundary(rawEndMs, {
      altKey: options.altKey,
      shiftKey: options.shiftKey,
      visibleWidthPx: options.visibleWidthPx,
      minTimeMs: durationMs,
      maxTimeMs: options.totalMs,
    })
    // A magnetized boundary on either edge beats the drop grid on the other:
    // butting against a neighbour is the more deliberate act (#667).
    const edgeRank = (kind: 'boundary' | 'grid' | undefined, deltaMs: number) =>
      kind === undefined ? [2, Number.POSITIVE_INFINITY] as const
        : kind === 'grid' ? [1, Math.abs(deltaMs)] as const
          : [0, Math.abs(deltaMs)] as const
    const startDeltaMs = startSnap.timeMs - rawStartMs
    const endDeltaMs = endSnap.timeMs - rawEndMs
    const startRank = edgeRank(startSnap.kind, startDeltaMs)
    const endRank = edgeRank(endSnap.kind, endDeltaMs)
    if (startSnap.kind === undefined && endSnap.kind === undefined) {
      return { startMs: rawStartMs, snapped: false }
    }
    const startWins = startRank[0] < endRank[0]
      || (startRank[0] === endRank[0] && startRank[1] <= endRank[1])
    const resolvedStartMs = startWins ? startSnap.timeMs : endSnap.timeMs - durationMs
    return {
      startMs: Math.max(0, Math.min(maxStartMs, resolvedStartMs)),
      snapped: (startWins ? startSnap.kind : endSnap.kind) === 'boundary',
    }
  }
  const updateCompositionClipMovePreview = (input: {
    clientX: number
    shiftKey: boolean
    element: HTMLElement
    layer: ShowUnifiedTimelineLayerProjection
    zoneId: string
    targetKey: string
    dataTransfer?: DataTransfer | null
  }) => {
    const draggedClip = draggingCompositionClipRef.current
    const compositionTimeline = unifiedCompositionTimeline
    if (!draggedClip || !compositionTimeline || readOnly) return
    if (input.dataTransfer) input.dataTransfer.dropEffect = draggedClip.mode === 'duplicate' ? 'copy' : 'move'
    setDropTargetKey(input.targetKey)
    const rect = input.element.getBoundingClientRect()
    const totalMs = Math.max(1, compositionTimeline.durationMs)
    const fraction = (input.clientX - rect.left) / Math.max(1, rect.width)
    const clip = compositionTimeline.zones
      .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.clips))
      .find((candidate) => candidate.id === draggedClip.clipId)
    if (!clip) return
    const candidateMs = fraction * totalMs - draggedClip.grabOffsetMs
    const visibleWidthPx = Math.max(1, scrollRef.current?.clientWidth ?? rect.width)
    const maxStartMs = Math.max(0, totalMs - clip.durationMs)
    const rawStartMs = Math.max(0, Math.min(maxStartMs, candidateMs))
    const previousPreview = movePlanRef.current?.preview
    const releaseThresholdMs = viewport.durationMs / visibleWidthPx * 16
    const freshResolved = resolveClipMoveStart(candidateMs, clip.durationMs, {
      altKey: false,
      shiftKey: input.shiftKey,
      visibleWidthPx,
      totalMs,
    })
    const retainPreviousSnap = previousPreview?.clipId === clip.id
      && previousPreview.targetKey === input.targetKey
      && previousPreview.snapped
      && !freshResolved.snapped
      && Math.abs(rawStartMs - previousPreview.startMs) <= releaseThresholdMs
    const resolved = retainPreviousSnap
      ? { startMs: previousPreview.startMs, snapped: true }
      : freshResolved
    const target: ShowTimelineClipMoveTarget = input.layer.kind === 'main'
      ? { kind: 'main', zoneId: input.zoneId, globalStartMs: resolved.startMs }
      : {
          kind: 'overlay',
          zoneId: input.zoneId,
          layerIndex: input.layer.layerIndex,
          globalStartMs: resolved.startMs,
        }
    const plannedComposition = timelineComposition
      ? draggedClip.mode === 'duplicate'
        ? duplicateShowClipAtGlobalTime(show, timelineComposition, {
            owner: draggedClip.owner,
            target,
            newPlacementId: draggedClip.duplicatePlacementId!,
            newInstanceId: draggedClip.duplicateInstanceId,
          })
        : moveShowConnectedClipAtGlobalTime(show, timelineComposition, {
            owner: draggedClip.owner,
            target,
          })
      : null
    if (!timelineComposition || !plannedComposition || plannedComposition === timelineComposition) {
      if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
      movePlanRef.current = null
      setMovePreview(null)
      return
    }
    const plannedClip = projectShowUnifiedTimeline(show, plannedComposition).zones
      .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.clips))
      .find((candidate) => candidate.id === (
        draggedClip.mode === 'duplicate' ? draggedClip.duplicatePlacementId : clip.id
      ))
    if (!plannedClip) {
      if (input.dataTransfer) input.dataTransfer.dropEffect = 'none'
      movePlanRef.current = null
      setMovePreview(null)
      return
    }
    const nextPreview: ShowClipMovePreview = {
      clipId: clip.id,
      mode: draggedClip.mode,
      targetKey: input.targetKey,
      startMs: plannedClip.startMs,
      durationMs: plannedClip.durationMs,
      snapped: resolved.snapped,
    }
    movePlanRef.current = {
      preview: nextPreview,
      sourceComposition: timelineComposition,
      composition: plannedComposition,
      owner: draggedClip.owner,
      target,
      mode: draggedClip.mode,
    }
    setMovePreview(nextPreview)
  }
  const propertyLanesByZone = useMemo(() => {
    const sceneAnimationLanes = projectGlobalShowScenePropertyLanes(displayShow)
    const availableControls = Object.values(patternControlsByCellId).flat()
    const automatedControlNames = [...new Set([
      ...show.cells.flatMap((cell) => Object.keys(cell.controlTargets ?? {})),
      ...(show.transitions ?? []).flatMap((transition) => Object.keys(transition.propertyTransitions?.controls ?? {})),
    ])]
    const controlLanes = automatedControlNames.map((exportName) => ({
      exportName,
      label: availableControls.find((control) => control.exportName === exportName)?.label
        ?? exportName.replace(/^slider/, '').replace(/([A-Z])/g, ' $1').trim(),
      defaultValue: availableControls.find((control) => control.exportName === exportName)?.defaultValue
        ?? 0.5,
    }))
    return new Map(show.zones.map((zone) => {
      const candidates = [
        {
          key: 'timeScale',
          label: 'animation speed',
          propertyLabel: 'speed',
          family: 'time' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `Animation speed lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('time'),
          formatValue: formatTimeScale,
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, { kind: 'timeScale' }),
        },
        {
          key: 'brightness',
          label: 'brightness',
          propertyLabel: 'brightness',
          family: 'appearance' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `Brightness lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('appearance'),
          formatValue: formatBrightness,
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, { kind: 'brightness' }),
        },
        ...([
          ['positionX', 'position x'],
          ['positionY', 'position y'],
          ['rotation', 'rotation'],
          ['scaleX', 'scale x'],
          ['scaleY', 'scale y'],
        ] as const).map(([property, label]) => ({
          key: `transform:${property}`,
          label,
          propertyLabel: label as string,
          family: 'transform' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `${label} lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('transform'),
          formatValue: property === 'rotation'
            ? (value: number) => formatAngleValue('rotation', value)
            : property === 'scaleX' || property === 'scaleY'
              ? (value: number) => formatDomainNumber('multiplier', value, 0.01)
              : (value: number) => Number(value.toFixed(2)).toString(),
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, { kind: 'transform', property }),
        })),
        ...controlLanes.map((control) => ({
          key: `control:${control.exportName}`,
          label: control.label,
          propertyLabel: control.label,
          family: 'control' as ShowPropertyLaneFamily,
          ownerName: undefined as string | undefined,
          ariaLabel: `${control.label} control lane for ${zone.name}`,
          selectsTransition: true,
          color: propertyLaneFamilyColor('control'),
          formatValue: formatControlValue,
          projection: projectGlobalShowPropertyLane(displayShow, zone.id, {
            kind: 'control' as const,
            exportName: control.exportName,
            defaultValue: control.defaultValue,
          }),
        })),
        ...sceneAnimationLanes
          .filter((lane) => lane.zoneId === zone.id)
          .map((lane) => ({
            key: `scene:${lane.id}`,
            label: lane.label,
            propertyLabel: lane.propertyLabel,
            family: lane.family,
            ownerName: lane.patternName as string | undefined,
            ariaLabel: `${lane.label} animation for ${zone.name}`,
            selectsTransition: false,
            color: propertyLaneFamilyColor(lane.family),
            formatValue: lane.valueKind === 'percent'
              ? formatBrightness
              : lane.valueKind === 'multiplier'
                ? formatTimeScale
                : formatControlValue,
            projection: lane.projection,
          })),
      ]
      // The lane itself is named by property alone; the owning Clip returns,
      // abbreviated, only where a property would otherwise repeat (#631).
      const visible = candidates.filter((candidate) => candidate.projection.timeVarying)
      const displayLabels = resolvePropertyLaneDisplayLabels(visible.map((candidate) => ({
        propertyLabel: candidate.propertyLabel,
        family: candidate.family,
        ownerName: candidate.ownerName,
      })))
      return [zone.id, visible.map((candidate, index) => ({
        ...candidate,
        displayLabel: displayLabels[index],
        hoverText: describePropertyLaneHover({
          ownerName: candidate.ownerName,
          family: candidate.family,
          propertyLabel: candidate.propertyLabel,
          projection: candidate.projection,
        }),
      }))] as const
    }))
  }, [displayShow, patternControlsByCellId, show])
  const movingSplitLayout = show.routingLayouts.find((layout) => (
    layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
  ))
  const hasSampleRemap = show.scenes.some((scene) => scene.sampleTargets?.repeatScale !== undefined)
    || Boolean(show.transitions?.some((transition) => transition.propertyTransitions?.sample?.repeatScale))
  const hasNonTrivialLayout = show.routingLayouts.some((layout) => (
    layout.logical ? layout.logical.kind !== 'single' : layout.zones.length > 1
  ))
  const layoutLaneVisible = hasNonTrivialLayout || layoutIntervals.length > 1
  const routingLaneRows = (layoutLaneVisible ? 1 : 0) + (hasSampleRemap ? 1 : 0)
  const layoutKindLabel = (layoutId: string) => {
    const layout = show.routingLayouts.find((candidate) => candidate.id === layoutId)
    return layout ? showRoutingLayoutKindLabel(layout) : 'Zone Layout'
  }
  const rowStrides = strip.rows.map((row) => {
    if (collapsedZoneIdSet.has(row.zoneId)) return 1
    const clipLayerCount = unifiedCompositionTimeline
      ? unifiedCompositionTimeline.zones.find((zone) => zone.id === row.zoneId)?.layers.length ?? 1
      : 1
    return clipLayerCount + (propertyLanesByZone.get(row.zoneId)?.length ?? 0)
  })
  const rowOffsets = rowStrides.reduce<number[]>((offsets, stride) => (
    [...offsets, offsets[offsets.length - 1] + stride]
  ), [0])
  const totalContentRows = rowOffsets[rowOffsets.length - 1] ?? 0
  const rowStart = (rowIndex: number) => rowOffsets[rowIndex]
  const rulerRow = 1
  const contentStartRow = 2
  const timelineOverlayRowSpan = totalContentRows + routingLaneRows + 2
  const columns = [
    zonesOpen ? `${ZONE_RAIL_OPEN_PX}px` : hasMultipleZones ? `${ZONE_RAIL_MICRO_PX}px` : '0px',
    ...displayShow.scenes.flatMap((scene, index) => (
      index < displayShow.scenes.length - 1
        ? [
            `minmax(0, ${Math.max(1, scene.durationMs)}fr)`,
            `minmax(0, ${Math.max(0.001, showVisualTransitionAfter(displayShow, scene.id)?.durationMs ?? 0)}fr)`,
          ]
        : [`minmax(0, ${Math.max(1, scene.durationMs)}fr)`]
    )),
  ]
  const timeGridEndLine = columns.length + 1
  const rows = [
    '28px',
    ...(layoutLaneVisible ? ['26px'] : []),
    ...(hasSampleRemap ? ['26px'] : []),
    ...strip.rows.flatMap((row) => collapsedZoneIdSet.has(row.zoneId) ? ['28px'] : [
      ...Array.from({
        length: unifiedCompositionTimeline
          ? unifiedCompositionTimeline.zones.find((zone) => zone.id === row.zoneId)?.layers.length ?? 1
          : 1,
      }, () => '44px'),
      ...(propertyLanesByZone.get(row.zoneId) ?? []).map(() => '18px'),
    ]),
    '34px',
  ]
  const timelineScale = viewport.totalMs / viewport.durationMs
  const timelineWidth = `calc(${timelineScale * 100}% + ${212 * (1 - timelineScale)}px)`
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
    const maxStart = viewport.totalMs - viewport.durationMs
    const next = maxStart > 0 ? viewport.startMs / maxStart * maxScroll : 0
    if (Math.abs(element.scrollLeft - next) > 1) element.scrollLeft = next
  }, [timelineScale, viewport])
  const updateViewport = useCallback((next: SetStateAction<ShowTimelineViewport>) => {
    setViewport(next)
  }, [setViewport])
  const timelineIsFitted = viewport.startMs === fittedViewport.startMs
    && viewport.durationMs === fittedViewport.durationMs
    && viewport.totalMs === fittedViewport.totalMs
  useEffect(() => {
    const handleTimelineKeyboard = (event: KeyboardEvent) => {
      if (event.defaultPrevented || showControlOwnsKeyboardEvent(event.target)) return
      const target = event.target
      if (!(target instanceof HTMLElement) || !target.closest('[aria-label="Show timeline"]')) return

      // Chrome that yields Show shortcuts keeps native Tab as well. The marker
      // means "this control owns no Show binding", not "this control joins Clip
      // traversal", and teleporting focus out of the rail or the toolbar would
      // strand its own controls (#632).
      if (event.key === 'Tab' && target.closest('[role="toolbar"], [data-studio-space-preview="true"]')) return

      if (event.key !== 'Tab' || event.metaKey || event.ctrlKey || event.altKey) return

      event.preventDefault()
      const focusedKey = target.closest<HTMLElement>('[data-show-selection-key]')?.dataset.showSelectionKey
      const current = traversalTargets.find((candidate) => (
        showTimelineTraversalTargetKey(candidate) === focusedKey
      )) ?? showSelectionTraversalTarget(selection)
      const next = nextShowTimelineTraversalTarget(traversalTargets, current, event.shiftKey ? -1 : 1)
      if (!next) return
      const nextSelection = traversalTargetShowSelection(next)
      const anchor = findShowSelectionAnchor(nextSelection)
      anchor?.focus()
      onSelectRef.current(nextSelection, anchor)
    }
    document.addEventListener('keydown', handleTimelineKeyboard)
    return () => document.removeEventListener('keydown', handleTimelineKeyboard)
  }, [selection, show.id, traversalTargets, updateViewport])
  const zoomAroundPlayhead = useCallback((factor: number) => updateViewport((current) => {
    const visibleEnd = current.startMs + current.durationMs
    const playheadMs = positionMsRef.current
    const anchor = playheadMs >= current.startMs && playheadMs <= visibleEnd
      ? playheadMs
      : current.startMs + current.durationMs / 2
    return zoomShowTimelineViewport(current, factor, anchor)
  }), [updateViewport])
  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const handleWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
        event.preventDefault()
        zoomAroundPlayhead(event.deltaY < 0 ? 1.25 : 0.8)
        return
      }
      if (!event.shiftKey) return

      const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
      if (maxScroll <= 0) return

      const wheelDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY
      if (wheelDelta === 0) return

      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? 40
        : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
          ? element.clientWidth
          : 1
      const nextScroll = Math.max(0, Math.min(maxScroll, element.scrollLeft + wheelDelta * deltaScale))
      if (nextScroll === element.scrollLeft) return

      event.preventDefault()
      element.scrollLeft = nextScroll
    }

    element.addEventListener('wheel', handleWheel, { passive: false })
    return () => element.removeEventListener('wheel', handleWheel)
  }, [zoomAroundPlayhead])
  const beginCompositionResize = (
    clip: ShowUnifiedTimelineClipProjection,
    edge: 'start' | 'end',
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (readOnly || !timelineComposition) return
    event.preventDefault()
    event.stopPropagation()
    const lane = event.currentTarget.closest<HTMLElement>('[data-show-layer-kind]')
    if (!lane) return
    const rect = lane.getBoundingClientRect()
    onDirectManipulationChange(true)
    const startClientX = event.clientX
    const totalMs = Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs)
    const owner: ShowTimelineClipOwner = clip.kind === 'main'
      ? {
          kind: 'main',
          sceneId: clip.sceneId,
          zoneId: clip.zoneId,
          placementId: clip.id,
        }
      : {
          kind: 'overlay',
          sceneId: clip.sceneId,
          zoneId: clip.zoneId,
          layerId: clip.layerId!,
          placementId: clip.id,
        }
    const resolve = (pointer: PointerEvent) => {
      const deltaMs = (pointer.clientX - startClientX) / Math.max(1, rect.width) * totalMs
      const rawBoundaryMs = edge === 'start' ? clip.startMs + deltaMs : clip.endMs + deltaMs
      const minTimeMs = edge === 'start' ? 0 : clip.startMs + 1
      const maxTimeMs = edge === 'start' ? clip.endMs - 1 : totalMs
      const boundaryMs = snapClipBoundary(rawBoundaryMs, {
        altKey: pointer.altKey,
        shiftKey: pointer.shiftKey,
        visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
        minTimeMs,
        maxTimeMs,
      }).timeMs
      const startMs = edge === 'start' ? boundaryMs : clip.startMs
      const durationMs = edge === 'start' ? clip.endMs - boundaryMs : boundaryMs - clip.startMs
      return { startMs: Math.round(startMs), durationMs: Math.max(1, Math.round(durationMs)) }
    }
    const plan = (pointer: PointerEvent): ShowClipResizePlan | null => {
      const next = resolve(pointer)
      const composition = resizeShowConnectedClipAtGlobalTime(show, timelineComposition, {
        owner,
        globalStartMs: next.startMs,
        durationMs: next.durationMs,
      })
      if (composition === timelineComposition) return null
      const plannedClip = projectShowUnifiedTimeline(show, composition).zones
        .flatMap((zone) => zone.layers.flatMap((layer) => layer.clips))
        .find((candidate) => candidate.id === clip.id)
      if (!plannedClip) return null
      return {
        preview: {
          clipId: clip.id,
          startMs: plannedClip.startMs,
          durationMs: plannedClip.durationMs,
        },
        sourceComposition: timelineComposition,
        composition,
        owner,
      }
    }
    const move = (pointer: PointerEvent) => {
      const nextPlan = plan(pointer)
      resizePlanRef.current = nextPlan
      setResizePreview(nextPlan?.preview ?? null)
    }
    const finish = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      const activePlan = resizePlanRef.current ?? plan(pointer)
      suppressResizeClipClickRef.current = clip.id
      window.setTimeout(() => {
        if (suppressResizeClipClickRef.current === clip.id) suppressResizeClipClickRef.current = null
      }, 0)
      if (!activePlan) {
        resizePlanRef.current = null
        setResizePreview(null)
        onDirectManipulationChange(false)
        return
      }
      resizePlanRef.current = activePlan
      setResizePreview(activePlan.preview)
      // Selection and any open Details remain suppressed until the exact
      // painted resize plan has committed.
      void onResizeCompositionClip({
        owner: activePlan.owner,
        globalStartMs: activePlan.preview.startMs,
        durationMs: activePlan.preview.durationMs,
        sourceComposition: activePlan.sourceComposition,
        plannedComposition: activePlan.composition,
      }).finally(() => {
        resizePlanRef.current = null
        setResizePreview(null)
        onDirectManipulationChange(false)
      })
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      resizePlanRef.current = null
      setResizePreview(null)
      onDirectManipulationChange(false)
    }
    resizePlanRef.current = null
    setResizePreview({ clipId: clip.id, startMs: clip.startMs, durationMs: clip.durationMs })
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', cancel)
  }
  return (
    <div
      className="select-none border-b border-seam bg-[#060608] px-2 py-2.5 shadow-[inset_0_6px_14px_-8px_rgba(0,0,0,0.9),inset_0_-6px_14px_-10px_rgba(0,0,0,0.9)] [&_input]:select-text [&_textarea]:select-text"
      onClick={() => {
        onDismiss()
        setAddMenuOpen(false)
        setAddClipOpen(false)
        setInsertTimeOpen(false)
        setLayoutActionsOpen(false)
      }}
    >
      <div
        data-testid="show-timeline-toolbar"
        data-studio-space-preview="true"
        className="show-timeline-toolbar scrollbar-hidden ml-[-3px] flex h-11 min-w-0 flex-nowrap items-center gap-1 overflow-x-auto border-b border-zinc-800/80 pl-0 pr-0"
        role="toolbar"
        aria-label="Show timeline controls"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="timeline-transport-cluster min-w-0 shrink-0 px-1">
          {transportActive && <ShowTransportControls show={show} />}
        </div>
        {transportActive && <ShowTimeDisplay show={show} />}
        <div className="timeline-command-cluster relative ml-auto flex min-w-0 shrink-0 items-center justify-end gap-[1.5px] border-l border-zinc-800/80 px-1" role="group" aria-label="Show authoring commands">
          {!readOnly && (
            <>
              <Button
                ref={setAddPopoverAnchor}
                size="xs"
                variant="ghost"
                aria-label="Add to Show"
                aria-haspopup="menu"
                aria-expanded={addMenuOpen || addClipOpen || insertTimeOpen || layoutActionsOpen}
                title="Add a Clip, Layer, Transition, Time, or Zone Layout"
                className={`px-1.5 text-[11px] ${showTimelineToolbarControlClass({
                  enabled: true,
                  active: addMenuOpen || addClipOpen || insertTimeOpen || layoutActionsOpen,
                })}`}
                onClick={() => {
                  const transport = useShowTransportStore.getState()
                  setAddClipTimeMs(transport.showId === show.id ? transport.positionMs : 0)
                  setAddClipPatternKey(null)
                  setAddClipSubmitting(false)
                  setAddClipPointerContext(null)
                  setAddClipOpen(false)
                  setInsertTimeOpen(false)
                  setLayoutActionsOpen(false)
                  setAddMenuOpen((open) => !open)
                }}
              >
                <Plus size={12} aria-hidden />
                <span className="timeline-command-label timeline-command-label-primary">Add</span>
                <ChevronDown size={9} aria-hidden />
              </Button>
              {addMenuOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addPopoverAnchor}
                  widthPx={288}
                  role="menu"
                  ariaLabel="Add to Show"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-1.5 text-[11px] text-zinc-300 shadow-2xl"
                  onDismiss={() => setAddMenuOpen(false)}
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={addClipDestination ? 'Clip' : 'Clip unavailable: no empty Layer'}
                    disabled={!addClipDestination}
                    title={addClipDestination ? 'Add a Pattern Clip at the playhead' : undefined}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => {
                      if (!addClipDestination) return
                      setAddMenuOpen(false)
                      setAddClipOpen(true)
                    }}
                  >
                    <Plus size={12} aria-hidden className="text-amber-300/80" />
                    <span>Clip</span>
                    {!addClipDestination && (
                      <span className="ml-auto text-[10px] text-zinc-600">No empty Layer</span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={layerTargetZoneId
                      ? (hasMultipleZones ? `Layer in ${layerTargetZoneName}` : 'Layer')
                      : 'Layer unavailable: no active Zone'}
                    disabled={!layerTargetZoneId}
                    title={layerTargetZoneId ? `Add a Layer to ${layerTargetZoneName}` : undefined}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={() => {
                      if (!layerTargetZoneId) return
                      setAddMenuOpen(false)
                      void onAddCompositionLayer(layerTargetZoneId)
                    }}
                  >
                    <Layers3 size={12} aria-hidden className="text-cyan-300/75" />
                    {/* Name the destination in the label, not just the tooltip: with
                        several Zones the resolved Zone is the one thing an author
                        cannot infer from the command (#363). */}
                    <span>{layerTargetZoneId && hasMultipleZones ? `Layer in ${layerTargetZoneName}` : 'Layer'}</span>
                    {!layerTargetZoneId && (
                      <span className="ml-auto text-[10px] text-zinc-600">No active Zone</span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    aria-label={addTransitionPlan.enabled
                      ? addTransitionLabel
                      : `Transition unavailable: ${addTransitionPlan.reason}`}
                    disabled={!addTransitionPlan.enabled}
                    title={addTransitionPlan.enabled
                      ? `Add a Transition from ${addTransitionPlan.target.fromName} to ${addTransitionPlan.target.toName}`
                      : undefined}
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100 disabled:cursor-not-allowed disabled:opacity-45"
                    onClick={(event) => {
                      if (!addTransitionPlan.enabled) return
                      setAddMenuOpen(false)
                      onOpenLayerTransition({
                        junction: addTransitionPlan.target.junction,
                        fromName: addTransitionPlan.target.fromName,
                        toName: addTransitionPlan.target.toName,
                        anchor: addPopoverAnchor ?? event.currentTarget,
                        ...(addTransitionPlan.target.groupOccurrenceId
                          ? { groupOccurrenceId: addTransitionPlan.target.groupOccurrenceId }
                          : {}),
                      })
                    }}
                  >
                    <Zap size={12} aria-hidden className="text-violet-300/80" />
                    <span className="min-w-0 truncate">{addTransitionLabel}</span>
                    {!addTransitionPlan.enabled && (
                      <span
                        className="ml-auto min-w-0 max-w-36 truncate text-[10px] text-zinc-600"
                        title={addTransitionPlan.reason}
                      >
                        {addTransitionPlan.reason}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => {
                      const transport = useShowTransportStore.getState()
                      setInsertTimeAtMs(transport.showId === show.id ? transport.positionMs : 0)
                      setAddMenuOpen(false)
                      setInsertTimeOpen(true)
                    }}
                  >
                    <Clock3 size={12} aria-hidden className="text-zinc-500" />
                    <span>Time</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="flex h-8 w-full items-center gap-2 rounded px-2 text-left hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => {
                      const transport = useShowTransportStore.getState()
                      const timeMs = transport.showId === show.id ? transport.positionMs : 0
                      setLayoutActionTimeMs(timeMs)
                      setLayoutActionError(null)
                      setAddMenuOpen(false)
                      setLayoutActionsOpen(true)
                    }}
                  >
                    <Grid2X2 size={12} aria-hidden className="text-violet-300/75" />
                    <span>Zone Layout</span>
                  </button>
                </ShowTimelineToolbarPopover>
              )}
              {addClipOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addClipPointerContext?.anchor ?? addPopoverAnchor}
                  point={addClipPointerContext?.point}
                  widthPx={288}
                  ariaLabel="Add Clip at playhead"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-2.5 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                    <span>Add Clip</span>
                    <span className="normal-case tabular-nums text-zinc-600">{formatShowTime(addClipTimeMs)}</span>
                  </div>
                  <PatternCombobox
                    ariaLabel="Pattern for new Clip"
                    value={addClipPattern ? `${addClipPattern.ref.kind}:${addClipPattern.ref.id}` : null}
                    options={patternOptions.map((option) => ({
                      value: `${option.ref.kind}:${option.ref.id}`,
                      label: option.label,
                      group: option.group,
                    }))}
                    compact
                    disabled={addClipSubmitting || !addClipDestination}
                    onChange={chooseAddClipPattern}
                  />
                  <div className="mt-2 flex justify-end">
                    <Button size="xs" variant="ghost" onClick={() => {
                      setAddClipOpen(false)
                      setAddClipPointerContext(null)
                    }} disabled={addClipSubmitting}>Cancel</Button>
                  </div>
                </ShowTimelineToolbarPopover>
              )}
              {insertTimeOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addPopoverAnchor}
                  widthPx={288}
                  ariaLabel="Insert Time"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-2.5 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <span>Insert Time</span>
                    <span className="normal-case tabular-nums text-zinc-500">at {formatSecondsValue(insertTimeAtMs)}s</span>
                  </div>
                  <UiTimeField
                    label="Time to insert"
                    ariaLabel="Time to insert in seconds"
                    hideLabel
                    variant="editor"
                    value={insertTimeSeconds}
                    min={0.001}
                    max={Number.MAX_SAFE_INTEGER}
                    step={0.001}
                    onPreview={setInsertTimeSeconds}
                    onChange={setInsertTimeSeconds}
                  />
                  {!insertTimePlan.enabled && (
                    <p className="mt-1.5 text-[10px] leading-4 text-amber-200/80">{insertTimePlan.reason}</p>
                  )}
                  <div className="mt-2 flex justify-end gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setInsertTimeOpen(false)}>Cancel</Button>
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={!insertTimePlan.enabled}
                      onClick={() => {
                        if (!insertTimePlan.enabled) return
                        void onInsertTime(insertTimeAtMs, insertTimeDurationMs).then((changed) => {
                          if (changed) setInsertTimeOpen(false)
                        })
                      }}
                    >Insert</Button>
                  </div>
                </ShowTimelineToolbarPopover>
              )}
              {layoutActionsOpen && (
                <ShowTimelineToolbarPopover
                  anchor={addPopoverAnchor}
                  widthPx={288}
                  ariaLabel="Zone Layout at playhead"
                  className="w-[288px] rounded border border-zinc-700 bg-zinc-950 p-2.5 text-[12px] text-zinc-300 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Current interval</div>
                      <div className="truncate text-[13px] font-medium text-zinc-100">{layoutActionInterval ? layoutKindLabel(layoutActionInterval.layoutId) : 'No Layout'}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">{formatShowTime(layoutActionTimeMs)}</span>
                  </div>
                  {layoutActionInterval && (
                    <button
                      type="button"
                      aria-label="Open this interval's Zone Layout"
                      className="mt-0.5 text-left text-[11px] text-zinc-500 underline decoration-dotted underline-offset-4 hover:text-zinc-200"
                      onClick={() => {
                        // Anchor to the toolbar button, not to this link: closing
                        // the popover unmounts the link in the same commit, and a
                        // detached anchor leaves the panel hidden (#629).
                        setLayoutActionsOpen(false)
                        onSelect({ kind: 'zone-layout', layoutId: layoutActionInterval.layoutId }, addPopoverAnchor)
                      }}
                    >
                      Edit {layoutKindLabel(layoutActionInterval.layoutId)}
                    </button>
                  )}
                  <div className="grid grid-cols-[72px_1fr] items-center gap-2 py-1">
                    <span className="text-zinc-500">Duration</span>
                    <UiTimeField
                      label="Layout interval duration"
                      ariaLabel="Layout interval duration in seconds"
                      hideLabel
                      variant="editor"
                      value={layoutActionDurationSeconds}
                      min={0.001}
                      max={Number.MAX_SAFE_INTEGER}
                      step={0.001}
                      onPreview={setLayoutActionDurationSeconds}
                      onChange={setLayoutActionDurationSeconds}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!layoutActionDurationValid}
                      onClick={() => runLayoutAction(() => (
                        // A new interval starts as a copy of the layout under
                        // the playhead - per-interval ownership, no registry
                        // picking (#694).
                        onAppendLayoutInterval(layoutActionInterval?.layoutId, layoutActionDurationMs)
                      ))}
                    >Append</Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!layoutActionDurationValid}
                      onClick={() => runLayoutAction(() => (
                        onInsertLayoutInterval(layoutActionInterval?.layoutId, layoutActionDurationMs, layoutActionTimeMs)
                      ))}
                    >Insert here</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!layoutActionInterval}
                      onClick={() => layoutActionInterval && runLayoutAction(() => onDuplicateLayoutInterval(layoutActionInterval.id, false))}
                    >Duplicate Layout</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!layoutActionInterval}
                      onClick={() => layoutActionInterval && runLayoutAction(() => onDuplicateLayoutInterval(layoutActionInterval.id, true))}
                    >Duplicate + Clips</Button>
                  </div>
                  {layoutActionInterval && layoutActionUseCount > 1 && (
                    <button
                      type="button"
                      className="mt-2 w-full rounded border border-zinc-800 px-2 py-1.5 text-left text-[11px] text-zinc-400 hover:border-zinc-700 hover:bg-zinc-900 hover:text-zinc-100"
                      onClick={() => runLayoutAction(() => onMakeLayoutIntervalUnique(layoutActionInterval.id))}
                    >
                      <strong className="font-medium text-zinc-200">Make this Layout unique</strong>
                      <span className="mt-0.5 block text-zinc-600">Separate this occurrence from {layoutActionUseCount - 1} other {layoutActionUseCount === 2 ? 'use' : 'uses'}.</span>
                    </button>
                  )}
                  {layoutActionError && <p role="alert" className="mt-2 text-[11px] leading-4 text-amber-200/80">{layoutActionError}</p>}
                </ShowTimelineToolbarPopover>
              )}
            </>
          )}
          <ShowTimelineCommands
            show={show}
            composition={timelineComposition}
            readOnly={readOnly}
            selection={selection}
            onSelect={onSelect}
            onCreateGroup={onCreateGroup}
            onSplitCompositionClip={onSplitCompositionClip}
            onDuplicateCompositionClip={onDuplicateCompositionClip}
          />
          <ShowTimelineHistoryCommands show={show} readOnly={readOnly} />
          {!readOnly && (
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label={zonesOpen ? 'Close Zones' : 'Open Zones'}
              aria-expanded={zonesOpen}
              title={zonesOpen ? 'Hide the Zone rail' : 'Show the Zone rail'}
              className={showTimelineToolbarControlClass({ enabled: true, active: zonesOpen })}
              onClick={() => {
                setZoneMapOpen(false)
                setZoneWorkspaceOpen(show.id, !zonesOpen)
              }}
            >
              <PanelLeft size={12} aria-hidden />
            </Button>
          )}
          <div className="ml-1 flex shrink-0 items-center gap-[1.5px] border-l border-zinc-800/80 pl-1" role="group" aria-label="Marker controls">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Snap playhead"
              aria-pressed={snapEnabled}
              title="Magnetize drags to nearby Clip, Transition, Marker, Show-end, and playhead boundaries. Drops always land on the time grid: whole seconds, finer as you zoom in · Shift for tenths · Alt for free placement."
              className={showTimelineToolbarControlClass({ enabled: true, active: snapEnabled })}
              onClick={() => setSnapEnabled(!snapEnabled)}
            >
              <Magnet size={12} aria-hidden />
            </Button>
            {!readOnly && (
              <TimelineMarkerSource
                show={displayShow}
                viewport={viewport}
                snapEnabled={snapEnabled}
                structuralTimesMs={structuralTimesMs}
                getVisibleWidth={() => Math.max(1, scrollRef.current?.clientWidth ?? 812)}
                getRulerBounds={() => timelineRulerRef.current?.getBoundingClientRect() ?? null}
                onCreateMarker={onAddMarker}
                onMarkerFeedback={setMarkerFeedback}
              />
            )}
            {!readOnly && (
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={markersVisible ? 'Hide Markers' : 'Show Markers'}
                aria-pressed={markersVisible}
                title={markersVisible
                  ? 'Hide Markers and stop snapping to them'
                  : 'Show Markers and use them as snap targets'}
                className={showTimelineToolbarControlClass({ enabled: true, active: markersVisible })}
                onClick={() => {
                  const enabled = !markersVisible
                  setMarkersVisible(enabled)
                  setMarkerSnapEnabled(enabled)
                }}
              >
                <Flag size={12} aria-hidden />
              </Button>
            )}
          </div>
        </div>
        <div className="timeline-view-cluster flex min-w-[120px] max-w-[210px] flex-[0_1_180px] shrink items-center gap-1 border-l border-zinc-800/80 px-1" role="group" aria-label="Timeline view controls">
          <TimelineNavigator showId={show.id} viewport={viewport} onChange={updateViewport} compact />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Fit timeline to Show"
            title="Fit the complete Show"
            disabled={timelineIsFitted}
            className="shrink-0 bg-transparent text-zinc-500 hover:bg-amber-400/10 hover:text-amber-200"
            onClick={() => updateViewport(fitShowTimelineViewport(timeline.durationMs))}
          >
            <Maximize2 size={12} aria-hidden />
          </Button>
        </div>
      </div>
      {isolatedGroupOccurrence && isolatedGroupDefinition && (
        <div
          role="status"
          aria-label={`Group isolation: ${isolatedGroupDefinition.name}`}
          data-show-group-isolation={isolatedGroupOccurrence.id}
          className="flex h-7 items-center gap-2 border-x border-b border-cyan-400/20 bg-cyan-400/[0.055] px-2 text-[10px] text-cyan-100/85"
        >
          <Layers3 size={12} aria-hidden className="text-cyan-300/80" />
          <span>Editing <strong className="font-medium text-cyan-100">{isolatedGroupDefinition.name}</strong></span>
          <span className="text-zinc-600">Linked definition · outside content is protected</span>
          <button
            type="button"
            className="ml-auto rounded px-1.5 py-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
            onClick={onExitGroupIsolation}
          >
            Exit <kbd className="ml-1 text-[8px] text-zinc-600">Esc</kbd>
          </button>
        </div>
      )}
      <div className="relative">
        <div
          ref={scrollRef}
          data-show-timeline-scroll-viewport
          data-testid="show-timeline-scroll-region"
          className="scrollbar-hidden overflow-x-auto"
          onScroll={(event) => {
            const element = event.currentTarget
            const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
            const maxStart = viewport.totalMs - viewport.durationMs
            if (maxScroll > 0 && maxStart > 0) {
              updateViewport((current) => panShowTimelineViewport(current, element.scrollLeft / maxScroll * maxStart))
            }
          }}
        >
        <div
          data-testid="show-timeline-grid"
          className={`relative isolate grid gap-y-1.5 ${!zonesOpen && !hasMultipleZones ? 'px-1' : ''}`}
          onPointerDownCapture={(event) => {
            if (!isolatedGroupOccurrenceId) return
            const target = event.target
            const groupId = target instanceof Element
              ? target.closest<HTMLElement>('[data-show-group-occurrence]')?.dataset.showGroupOccurrence
              : undefined
            if (groupId === isolatedGroupOccurrenceId) return
            event.preventDefault()
            event.stopPropagation()
          }}
          onPointerDown={beginGroupMarquee}
          onClickCapture={(event) => {
            if (!isolatedGroupOccurrenceId) return
            const target = event.target
            const groupId = target instanceof Element
              ? target.closest<HTMLElement>('[data-show-group-occurrence]')?.dataset.showGroupOccurrence
              : undefined
            if (groupId === isolatedGroupOccurrenceId) return
            event.preventDefault()
            event.stopPropagation()
          }}
          onDoubleClickCapture={(event) => {
            if (!isolatedGroupOccurrenceId) return
            const target = event.target
            const groupId = target instanceof Element
              ? target.closest<HTMLElement>('[data-show-group-occurrence]')?.dataset.showGroupOccurrence
              : undefined
            if (groupId === isolatedGroupOccurrenceId) return
            event.preventDefault()
            event.stopPropagation()
            onExitGroupIsolation()
          }}
          style={{
            width: timelineWidth,
            minWidth: 0,
            gridTemplateColumns: columns.join(' '),
            gridTemplateRows: rows.join(' '),
          }}
        >
        {/*
          Timeline stacking contract inside this isolated canvas:
          z-10 Clips, z-15 per-layer junctions, z-20 layout masks,
          z-30 playhead/sticky chrome, z-35 Markers and Show End, z-50 marquee.
          Entity Detail panels are portalled above the canvas at z-80.
        */}
        {marquee && (
          <div
            aria-hidden
            data-show-timeline-marquee
            className="pointer-events-none absolute z-50 border border-live/80 bg-live/10 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]"
            style={marquee}
          />
        )}
        {(showFullZoneHeaders || showMicroZonePicker) && <div
          className="sticky left-0 z-30 flex items-center border-b border-zinc-900 bg-[#060608] px-1"
          style={{ gridColumn: 1, gridRow: rulerRow }}
        >
          <button
            ref={setZoneMapAnchor}
            type="button"
            data-studio-space-preview="true"
            aria-label={zoneMapOpen ? 'Close Zone Map' : 'Open Zone Map'}
            aria-expanded={zoneMapOpen}
            title={zoneMapOpen ? 'Close the Zone Map' : 'Open the Zone Map: Zones and Zone Layouts'}
            className={[
              'flex h-6 min-w-0 flex-1 items-center gap-1 rounded px-1 text-[9px] uppercase tracking-[0.12em] transition-colors',
              showMicroZonePicker ? 'justify-center' : '',
              zoneMapOpen ? 'bg-live/10 text-live' : 'text-structural hover:bg-zinc-900 hover:text-zinc-200',
            ].join(' ')}
            onClick={() => setZoneMapOpen(!zoneMapOpen)}
          >
            <MapIcon size={12} aria-hidden className="shrink-0" />
            {!showMicroZonePicker && <span className="truncate">Zones</span>}
          </button>
        </div>}
        <TimelineRuler
          rulerRef={timelineRulerRef}
          show={displayShow}
          gridColumn={`2 / ${timeGridEndLine}`}
          viewport={viewport}
          gridRow={rulerRow}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        {timelineComposition && (
          <TimelineMarkers
            show={displayShow}
            minimumShowEndMs={showTimelineContentEndMs({ ...show, composition: timelineComposition })}
            onPreviewShowEnd={setShowEndPreviewMs}
            markers={markersVisible ? timelineComposition.markers ?? [] : []}
            markerFeedback={markerFeedback}
            gridColumn={`2 / ${timeGridEndLine}`}
            gridRow={rulerRow}
            rowSpan={timelineOverlayRowSpan}
            layoutScale={timelineScale}
            snapEnabled={snapEnabled}
            structuralTimesMs={structuralTimesMs}
            readOnly={readOnly}
            onMoveMarker={onMoveMarker}
            onUpdateMarker={onUpdateMarker}
            onRemoveMarker={onRemoveMarker}
            onSetShowEnd={onSetShowEnd}
          />
        )}
        <TimelineLayoutBoundaries
          show={show}
          intervals={layoutIntervals}
          durationMs={timeline.durationMs}
          gridColumn={`2 / ${timeGridEndLine}`}
          gridRow={rulerRow}
          rowSpan={timelineOverlayRowSpan}
          selection={selection}
        />
        <TimelinePlayhead
          show={displayShow}
          gridColumn={`2 / ${timeGridEndLine}`}
          gridRow={rulerRow}
          rowSpan={timelineOverlayRowSpan}
          viewport={viewport}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        {layoutLaneVisible && (() => {
          const splitLogical = movingSplitLayout?.logical
          const splitColors = splitLogical && (splitLogical.kind === 'split' || splitLogical.kind === 'soft-split')
            ? [
                show.zones.find((zone) => zone.id === splitLogical.zoneIds[0])?.color ?? '#38bdf8',
                show.zones.find((zone) => zone.id === splitLogical.zoneIds[1])?.color ?? '#f97316',
              ]
            : null
          return (
            <div role="group" aria-label="Zone Layouts lane" className="contents">
              <div
                className="sticky left-0 z-30 flex h-[18px] items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[9px] uppercase tracking-[0.1em] text-sky-300/80"
                style={{ gridColumn: 1, gridRow: contentStartRow }}
              >
                {showMicroZonePicker ? <Route size={12} aria-hidden /> : 'Layouts'}
              </div>
              {show.scenes.map((scene, sceneIndex) => {
                const interval = layoutIntervals.find((candidate) => candidate.sceneIds.includes(scene.id))
                const isFirstSceneOfInterval = interval?.sceneIds[0] === scene.id
                const isSplitCell = Boolean(interval && movingSplitLayout && splitColors
                  && interval.layoutId === movingSplitLayout.id)
                const position = scene.routingTargets?.splitPosition ?? 0.5
                const soleZone = interval && interval.zoneIds.length === 1
                  ? show.zones.find((zone) => zone.id === interval.zoneIds[0])
                  : null
                const label = interval
                  ? soleZone
                    ? `${layoutKindLabel(interval.layoutId)} · ${soleZone.name}`
                    : layoutKindLabel(interval.layoutId)
                  : 'Zone Layout'
                return (
                  <button
                    key={`layout-lane-${scene.id}`}
                    type="button"
                    aria-label={`Edit ${label} Zone Layout`}
                    title="Edit this interval's Zone Layout"
                    data-show-timeline-focus
                    {...(interval && isFirstSceneOfInterval && layoutIntervals.length > 1
                      ? { 'data-show-layout-interval': interval.id }
                      : {})}
                    {...(interval ? { 'data-show-selection-key': `zone-layout:${interval.layoutId}` } : {})}
                    className="flex h-[18px] min-w-0 items-center justify-between gap-1 border-t border-zinc-900/80 px-1.5 font-mono text-[9px] text-sky-100/90 outline-none hover:brightness-125 hover:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.5)] focus-visible:shadow-[inset_0_0_0_1px_rgba(56,189,248,0.8)]"
                    style={{
                      gridColumn: 2 + sceneIndex * 2,
                      gridRow: contentStartRow,
                      background: isSplitCell && splitColors
                        ? `linear-gradient(90deg, color-mix(in srgb, ${splitColors[0]} 35%, #08080a) 0 ${position * 100}%, color-mix(in srgb, ${splitColors[1]} 35%, #08080a) ${position * 100}% 100%)`
                        : 'rgba(9,9,11,0.4)',
                    }}
                    onClick={(event) => {
                      event.stopPropagation()
                      if (interval) onSelect({ kind: 'zone-layout', layoutId: interval.layoutId }, event.currentTarget)
                    }}
                  >
                    <span className="truncate">{isFirstSceneOfInterval ? label : ''}</span>
                    {isSplitCell && <span className="shrink-0 text-zinc-100">{Math.round(position * 100)}%</span>}
                  </button>
                )
              })}
              <div
                aria-hidden={false}
                className="pointer-events-none relative"
                style={{ gridColumn: `2 / ${timeGridEndLine}`, gridRow: contentStartRow }}
              >
                {layoutIntervals.slice(1).map((interval, index) => {
                  // The Layout switch lives in the lane with everything else
                  // Layout-shaped (#694 review). It anchors at the boundary
                  // position as an overlay, so a zero-duration switch stays
                  // clickable even though its grid column has no width.
                  const precedingInterval = layoutIntervals[index]
                  const precedingSceneId = precedingInterval.sceneIds[precedingInterval.sceneIds.length - 1]
                  const routingSwitch = showRoutingTransitionAfter(show, precedingSceneId)
                  if (!routingSwitch) return null
                  const { left } = showLayoutIntervalPercentBounds(interval, timeline.durationMs)
                  const selected = selection.kind === 'transition' && selection.transitionId === routingSwitch.id
                  return (
                    <button
                      key={`layout-switch-${interval.id}`}
                      type="button"
                      aria-label={`Select ${layoutKindLabel(interval.layoutId)} routing interval ${index + 1}`}
                      aria-pressed={selected}
                      title="Edit the Zone Layout switch"
                      data-show-timeline-focus
                      data-show-selection-key={`transition:${routingSwitch.id}`}
                      className={selected
                        ? 'pointer-events-auto absolute inset-y-0 z-[2] grid w-4 -translate-x-1/2 place-items-center rounded-sm bg-sky-400/35 text-sky-100 outline-none ring-1 ring-sky-300/80'
                        : 'pointer-events-auto absolute inset-y-0 z-[2] grid w-4 -translate-x-1/2 place-items-center rounded-sm bg-sky-400/20 text-sky-200/90 outline-none hover:bg-sky-400/40 focus-visible:bg-sky-400/40'}
                      style={{ left: `${left}%` }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect({ kind: 'transition', transitionId: routingSwitch.id }, event.currentTarget)
                      }}
                    >
                      <Route size={10} aria-hidden />
                    </button>
                  )
                })}
              </div>
              {movingSplitLayout && show.scenes.slice(0, -1).map((scene, sceneIndex) => {
                const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
                const descriptor = transition?.propertyTransitions?.routing?.splitPosition
                const target = show.scenes[sceneIndex + 1]?.routingTargets?.splitPosition ?? 0.5
                return transition ? (
                  <button
                    key={`split-boundary-${scene.id}`}
                    type="button"
                    aria-label={`Edit split position at ${showBoundaryClipIdentity(show, scene.id)}`}
                    data-show-timeline-focus
                    data-show-selection-key={`transition:${transition.id}`}
                    className={descriptor ? 'border-t border-zinc-900/80 bg-sky-400/10 font-mono text-[9px] text-sky-200' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-sky-300'}
                    style={{ gridColumn: 3 + sceneIndex * 2, gridRow: contentStartRow }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                    }}
                  >
                    {descriptor ? `${Math.round(descriptor.from * 100)}→${Math.round(target * 100)}` : '—'}
                  </button>
                ) : null
              })}
            </div>
          )
        })()}
        {hasSampleRemap && (
          <div role="group" aria-label="Sample repeat lane" className="contents">
            <div
              className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[9px] text-cyan-300/80"
              style={{ gridColumn: 1, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
            >
              {showMicroZonePicker ? <Repeat2 size={12} aria-hidden /> : '↳ sample repeat'}
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const scale = scene.sampleTargets?.repeatScale ?? 1
              return (
                <div
                  key={`sample-repeat-${scene.id}`}
                  className="flex items-center justify-center border-t border-zinc-900/80 bg-[repeating-linear-gradient(135deg,rgba(34,211,238,0.12)_0_3px,transparent_3px_8px)] font-mono text-[9px] text-cyan-100"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
                >
                  {formatRepeatScale(scale)}
                </div>
              )
            })}
            {show.scenes.slice(0, -1).map((scene, sceneIndex) => {
              const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
              const descriptor = transition?.propertyTransitions?.sample?.repeatScale
              const target = show.scenes[sceneIndex + 1]?.sampleTargets?.repeatScale ?? 1
              return transition ? (
                <button
                  key={`sample-repeat-boundary-${scene.id}`}
                  type="button"
                  aria-label={`Edit repeat scale at ${showBoundaryClipIdentity(show, scene.id)}`}
                  data-show-timeline-focus
                  data-show-selection-key={`transition:${transition.id}`}
                  className={descriptor ? 'border-t border-zinc-900/80 bg-cyan-400/10 font-mono text-[9px] text-cyan-200' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-cyan-300'}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: contentStartRow + (layoutLaneVisible ? 1 : 0) }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                  }}
                >
                  {descriptor ? `${formatRepeatScale(descriptor.from)}→${formatRepeatScale(target)}` : '—'}
                </button>
              ) : null
            })}
          </div>
        )}
        {strip.rows.map((row, rowIndex) => {
          const unifiedZone = unifiedCompositionTimeline?.zones.find((zone) => zone.id === row.zoneId)
          const zone = show.zones.find((candidate) => candidate.id === row.zoneId)
          const collapsed = collapsedZoneIdSet.has(row.zoneId)
          const clipLayerCount = collapsed ? 1 : unifiedZone?.layers.length ?? 1
          return (
          <div key={row.zoneId} className="contents">
            {showFullZoneHeaders && <div
              className={[
                'group sticky left-0 z-30 flex items-stretch gap-0.5 overflow-hidden rounded-[5px] border border-transparent bg-[#060608] pr-0.5 text-left font-mono transition-all',
                selection.kind === 'zone' && selection.zoneId === row.zoneId
                  ? 'border-live/25 bg-live/10 text-zinc-100'
                  : 'text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/65 hover:text-zinc-100',
              ].join(' ')}
              style={{
                gridColumn: 1,
                gridRow: clipLayerCount > 1
                  ? `${rowStart(rowIndex) + contentStartRow + routingLaneRows} / span ${clipLayerCount}`
                  : rowStart(rowIndex) + contentStartRow + routingLaneRows,
              }}
            >
              <span
                aria-hidden
                className="mr-0.5 w-[3px] self-stretch rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              {hasMultipleZones ? (
                <button
                  type="button"
                  data-studio-space-preview="true"
                  aria-label={`${collapsed ? 'Expand' : 'Collapse'} zone ${row.zoneName}`}
                  aria-expanded={!collapsed}
                  title={`${collapsed ? 'Expand' : 'Collapse'} ${row.zoneName}`}
                  className="grid size-5 shrink-0 place-items-center self-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                  onClick={(event) => {
                    event.stopPropagation()
                    setZoneCollapsed(show.id, row.zoneId, !collapsed)
                  }}
                >
                  {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                </button>
              ) : (
                <span aria-hidden className="grid size-5 shrink-0 place-items-center self-center text-zinc-600">
                  <ZoneGlyph icon={zone?.icon} size={11} />
                </span>
              )}
              <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 overflow-hidden py-1">
                <span className="truncate text-[12px] font-medium leading-4">{row.zoneName}</span>
                {/* A collapsed Zone owns one 28px row; a second line would overflow
                    it and paint across its neighbours (#632). */}
                {!collapsed && show.outputContract?.kind === 'installation'
                  && <span className="truncate text-[10px] leading-3 text-structural transition-colors group-hover:text-zinc-400">{row.nominalPixelCount}px</span>}
              </span>
              <button
                type="button"
                aria-label={`Open zone ${row.zoneName} properties`}
                title={`Open ${row.zoneName} properties`}
                data-show-timeline-focus
                data-studio-space-preview="true"
                data-show-selection-key={`zone:${row.zoneId}`}
                className="grid size-5 shrink-0 place-items-center self-center rounded text-zinc-600 transition-colors hover:bg-zinc-800 hover:text-zinc-100 group-hover:text-zinc-400 focus-visible:text-zinc-100 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/60"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ kind: 'zone', zoneId: row.zoneId }, event.currentTarget)
                }}
              >
                <Settings2 size={12} aria-hidden />
              </button>
            </div>}
            {showMicroZonePicker && <button
              type="button"
              data-studio-space-preview="true"
              aria-label={`${collapsed ? 'Expand' : 'Collapse'} zone ${row.zoneName}`}
              aria-expanded={!collapsed}
              title={`${collapsed ? 'Expand' : 'Collapse'} ${row.zoneName}`}
              className={!collapsed && focusedZoneId === row.zoneId
                ? 'sticky left-0 z-30 grid place-items-center border-l-2 bg-live/10 text-live'
                : collapsed
                  ? 'sticky left-0 z-30 grid place-items-center border-l-2 bg-[#060608] text-zinc-300 hover:bg-zinc-900 hover:text-white'
                  : 'sticky left-0 z-30 grid place-items-center border-l-2 bg-[#060608] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100'}
              style={{
                borderLeftColor: row.color ?? '#38bdf8',
                gridColumn: 1,
                gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows,
              }}
              onClick={(event) => {
                event.stopPropagation()
                setZoneCollapsed(show.id, row.zoneId, !collapsed)
              }}
            >
              <span className="relative grid size-5 place-items-center">
                <ZoneGlyph icon={zone?.icon} size={12} />
                {collapsed && <ChevronRight size={8} aria-hidden className="absolute -right-0.5 bottom-0 text-current" />}
              </span>
            </button>}
            {unifiedZone && collapsed && !showFullZoneHeaders && (
              <CollapsedZoneNameOverlay
                intervals={layoutIntervals}
                zoneId={row.zoneId}
                zoneName={row.zoneName}
                durationMs={timeline.durationMs}
                stickyLeftPx={hasMultipleZones ? ZONE_RAIL_MICRO_PX : 0}
                gridColumn={`2 / ${columns.length + 1}`}
                gridRow={rowStart(rowIndex) + contentStartRow + routingLaneRows}
              />
            )}
            {unifiedZone && (collapsed ? (
              <div
                role="img"
                aria-label={`Collapsed zone ${row.zoneName} timeline`}
                data-collapsed-zone={row.zoneId}
                className={[
                  'relative min-w-0 overflow-hidden border-y border-zinc-900 bg-[#08080a]',
                  dropTargetKey === `composition-zone:${row.zoneId}` ? 'ring-1 ring-inset ring-live/50' : '',
                ].join(' ')}
                style={{
                  gridColumn: `2 / ${columns.length + 1}`,
                  gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows,
                }}
                onDragOver={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  if (!draggedClip || readOnly) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = draggedClip.mode === 'duplicate' ? 'copy' : 'move'
                  setDropTargetKey(`composition-zone:${row.zoneId}`)
                }}
                onDragLeave={() => setDropTargetKey((current) => current === `composition-zone:${row.zoneId}` ? null : current)}
                onDrop={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  const compositionTimeline = unifiedCompositionTimeline
                  if (!draggedClip || !compositionTimeline || readOnly) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  const totalMs = Math.max(1, compositionTimeline.durationMs)
                  const clip = compositionTimeline.zones
                    .flatMap((candidate) => candidate.layers.flatMap((layer) => layer.clips))
                    .find((candidate) => candidate.id === draggedClip.clipId)
                  const candidateMs = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width))) * totalMs - draggedClip.grabOffsetMs
                  const clipDurationMs = clip?.durationMs ?? 0
                  const globalStartMs = resolveClipMoveStart(candidateMs, clipDurationMs, {
                    altKey: false,
                    shiftKey: event.shiftKey,
                    visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
                    totalMs,
                  }).startMs
                  const target = { kind: 'main' as const, zoneId: row.zoneId, globalStartMs }
                  const plannedComposition = draggedClip.mode === 'duplicate' && timelineComposition
                    ? duplicateShowClipAtGlobalTime(show, timelineComposition, {
                        owner: draggedClip.owner,
                        target,
                        newPlacementId: draggedClip.duplicatePlacementId!,
                        newInstanceId: draggedClip.duplicateInstanceId,
                      })
                    : null
                  const commit = draggedClip.mode === 'duplicate' && timelineComposition && plannedComposition
                    ? onDuplicateCompositionClipAtTarget({
                        sourceComposition: timelineComposition,
                        plannedComposition,
                      })
                    : onMoveCompositionClip({ owner: draggedClip.owner, target })
                  void commit.then((changed) => {
                    if (!changed) return
                    const clipId = draggedClip.mode === 'duplicate'
                      ? draggedClip.duplicatePlacementId!
                      : draggedClip.clipId
                    if (draggedClip.mode === 'duplicate') onSelect({ kind: 'clip', clipId })
                    onReanchorDetails({ kind: 'clip', clipId })
                  }).finally(() => {
                    activeMoveLayerRef.current = null
                    draggingCompositionClipRef.current = null
                    setDraggingCompositionClip(null)
                    movePlanRef.current = null
                    setMovePreview(null)
                    onDirectManipulationChange(false)
                  })
                  setDropTargetKey(null)
                }}
              >
                <div
                  data-testid="collapsed-zone-density-rail"
                  className="absolute inset-x-0 bottom-1 grid h-1.5 gap-px"
                  style={{ gridTemplateRows: `repeat(${unifiedZone.layers.length}, minmax(0, 1fr))` }}
                >
                  {unifiedZone.layers.map((layer) => <div key={layer.id} className="relative min-h-0 rounded-sm bg-white/[0.035]">
                    {layer.clips.map((clip) => <i
                      key={clip.id}
                      className="absolute inset-y-0 min-w-px rounded-sm bg-current/45"
                      style={{
                        color: row.color ?? '#38bdf8',
                        left: `${clip.startMs / Math.max(1, timeline.durationMs) * 100}%`,
                        width: `${clip.durationMs / Math.max(1, timeline.durationMs) * 100}%`,
                      }}
                      title={`${clip.patternName}, ${formatShowTime(clip.startMs)} to ${formatShowTime(clip.endMs)}`}
                    />)}
                  </div>)}
                </div>
                {(propertyLanesByZone.get(row.zoneId) ?? []).flatMap((lane) => lane.projection.beats).map((beat) => <i
                  key={beat.id}
                  aria-hidden
                  className="absolute inset-y-0 w-px bg-violet-300/70"
                  style={{ left: `${beat.displayX * 100}%` }}
                />)}
                <LayoutZoneIntervalOverlay
                  intervals={layoutIntervals}
                  zoneId={row.zoneId}
                  durationMs={timeline.durationMs}
                />
              </div>
            ) : unifiedZone.layers.map((layer, layerIndex) => (
              <div
                key={layer.id}
                className={[
                  'relative min-w-0 border-b border-zinc-900/80 bg-transparent transition-colors',
                  dropTargetKey === `composition:${layer.id}` ? 'bg-live/[0.07] ring-1 ring-inset ring-live/40' : '',
                ].join(' ')}
                style={{
                  gridColumn: `2 / ${columns.length + 1}`,
                  gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows + layerIndex,
                }}
                data-show-layer-kind={layer.kind}
                data-show-layer-index={layer.layerIndex}
                data-drop-active={dropTargetKey === `composition:${layer.id}` ? 'true' : undefined}
                onDoubleClick={(event) => {
                  if (readOnly || !timelineComposition || isolatedGroupOccurrenceId) return
                  const targetElement = event.target
                  if (targetElement instanceof Element && targetElement.closest(
                    '[data-show-composition-clip="true"], [data-show-layer-junction], button, input, select, textarea, [role="slider"]',
                  )) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
                  const totalMs = Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs)
                  const rawGlobalTimeMs = fraction * totalMs
                  const snappedGlobalTimeMs = snapClipBoundary(rawGlobalTimeMs, {
                    altKey: event.altKey,
                    shiftKey: event.shiftKey,
                    visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
                    maxTimeMs: totalMs,
                  }).timeMs
                  const target: ShowClipAddTarget = layer.kind === 'main'
                    ? { kind: 'main' }
                    : { kind: 'overlay', layerIndex: layer.layerIndex }
                  let globalTimeMs = snappedGlobalTimeMs
                  let plan = planShowClipAtGlobalTime(show, timelineComposition, {
                    zoneId: row.zoneId,
                    globalTimeMs,
                    target,
                  })
                  if (!plan.enabled && snappedGlobalTimeMs !== rawGlobalTimeMs) {
                    const rawPlan = planShowClipAtGlobalTime(show, timelineComposition, {
                      zoneId: row.zoneId,
                      globalTimeMs: rawGlobalTimeMs,
                      target,
                    })
                    if (rawPlan.enabled) {
                      globalTimeMs = rawGlobalTimeMs
                      plan = rawPlan
                    }
                  }
                  if (!plan.enabled) return
                  event.preventDefault()
                  event.stopPropagation()
                  setAddMenuOpen(false)
                  setInsertTimeOpen(false)
                  setLayoutActionsOpen(false)
                  setAddClipTimeMs(globalTimeMs)
                  setAddClipPatternKey(null)
                  setAddClipSubmitting(false)
                  setAddClipPointerContext({
                    anchor: event.currentTarget,
                    point: { clientX: event.clientX, clientY: event.clientY },
                    zoneId: row.zoneId,
                    target,
                  })
                  setAddClipOpen(true)
                }}
                onDragEnter={(event) => {
                  if (!draggingCompositionClipRef.current || readOnly) return
                  event.preventDefault()
                  setDropTargetKey(`composition:${layer.id}`)
                }}
                onDragOver={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  const compositionTimeline = unifiedCompositionTimeline
                  if (!draggedClip || !compositionTimeline || readOnly) return
                  event.preventDefault()
                  const targetKey = `composition:${layer.id}`
                  activeMoveLayerRef.current = {
                    element: event.currentTarget,
                    layer,
                    zoneId: row.zoneId,
                    targetKey,
                  }
                  updateCompositionClipMovePreview({
                    clientX: event.clientX,
                    shiftKey: event.shiftKey,
                    element: event.currentTarget,
                    layer,
                    zoneId: row.zoneId,
                    targetKey,
                    dataTransfer: event.dataTransfer,
                  })
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                  const rect = event.currentTarget.getBoundingClientRect()
                  const visibleLeft = Math.max(
                    rect.left,
                    scrollRef.current?.getBoundingClientRect().left ?? rect.left,
                  )
                  if (event.clientX < visibleLeft) return
                  setDropTargetKey((current) => current === `composition:${layer.id}` ? null : current)
                  if (activeMoveLayerRef.current?.targetKey === `composition:${layer.id}`) {
                    activeMoveLayerRef.current = null
                  }
                  if (movePlanRef.current?.preview.targetKey === `composition:${layer.id}`) {
                    movePlanRef.current = null
                    setMovePreview(null)
                  }
                }}
                onDrop={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  if (!draggedClip || readOnly) return
                  event.preventDefault()
                  const activePlan = movePlanRef.current
                  const targetKey = `composition:${layer.id}`
                  if (activePlan?.preview.clipId !== draggedClip.clipId || activePlan.preview.targetKey !== targetKey) {
                    activeMoveLayerRef.current = null
                    draggingCompositionClipRef.current = null
                    setDraggingCompositionClip(null)
                    movePlanRef.current = null
                    setMovePreview(null)
                    setDropTargetKey(null)
                    onDirectManipulationChange(false)
                    return
                  }
                  const commit = activePlan.mode === 'duplicate'
                    ? onDuplicateCompositionClipAtTarget({
                        sourceComposition: activePlan.sourceComposition,
                        plannedComposition: activePlan.composition,
                      })
                    : onMoveCompositionClip({
                        owner: activePlan.owner,
                        target: activePlan.target,
                        sourceComposition: activePlan.sourceComposition,
                        plannedComposition: activePlan.composition,
                      })
                  void commit.then((changed) => {
                    if (!changed) return
                    const clipId = activePlan.mode === 'duplicate'
                      ? draggedClip.duplicatePlacementId!
                      : draggedClip.clipId
                    if (activePlan.mode === 'duplicate') onSelect({ kind: 'clip', clipId })
                    onReanchorDetails({ kind: 'clip', clipId })
                  }).finally(() => {
                    activeMoveLayerRef.current = null
                    draggingCompositionClipRef.current = null
                    setDraggingCompositionClip(null)
                    movePlanRef.current = null
                    setMovePreview(null)
                    onDirectManipulationChange(false)
                  })
                  setDropTargetKey(null)
                }}
              >
                <LayoutZoneIntervalOverlay
                  intervals={layoutIntervals}
                  zoneId={row.zoneId}
                  durationMs={timeline.durationMs}
                />
                {movePreview?.targetKey === `composition:${layer.id}` && (
                  <i
                    aria-hidden
                    data-testid="show-clip-move-preview"
                    data-drag-mode={movePreview.mode}
                    className={`pointer-events-none absolute inset-y-1 z-[9] rounded-[5px] border ${
                      movePreview.mode === 'duplicate'
                        ? 'border-dashed border-sky-300/90 bg-sky-300/10 shadow-[3px_3px_0_-1px_rgba(125,211,252,0.28)]'
                        : 'border-amber-300/80 bg-amber-300/10 shadow-[0_0_0_1px_rgba(251,191,36,0.12)]'
                    }`}
                    style={{
                      left: `${movePreview.startMs / Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs) * 100}%`,
                      width: `${movePreview.durationMs / Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs) * 100}%`,
                    }}
                  >
                    <span
                      data-testid="show-clip-move-preview-time"
                      className="absolute -top-0.5 left-1 whitespace-nowrap font-mono text-[9px] not-italic leading-none text-amber-200/90"
                    >
                      {formatSecondsValue(movePreview.startMs)}s
                    </span>
                  </i>
                )}
                {resizePreview !== null && layer.clips.some((clip) => clip.id === resizePreview.clipId) && (
                  <span
                    aria-hidden
                    data-testid="show-clip-resize-time"
                    className="pointer-events-none absolute top-0 z-[40] whitespace-nowrap rounded-sm bg-zinc-950/90 px-1 font-mono text-[9px] leading-3 text-amber-200/90"
                    style={{ left: `${resizePreview.startMs / Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs) * 100}%` }}
                  >
                    {formatSecondsValue(resizePreview.startMs)}–{formatSecondsValue(resizePreview.startMs + resizePreview.durationMs)}s
                  </span>
                )}
                {layer.clips.map((clip, clipIndex) => {
                  const totalMs = Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs)
                  const preview = resizePreview?.clipId === clip.id ? resizePreview : clip
                  const left = preview.startMs / totalMs * 100
                  const width = preview.durationMs / totalMs * 100
                  const previousClip = layer.clips[clipIndex - 1]
                  const projectTimelineSummary = (
                    target: ShowUnifiedTimelineClipProjection,
                  ): ShowClipSummarySection[] => {
                    const compatibilityCell = !show.composition
                      ? compatibilityCellForTimelineClip(show, target)
                      : null
                    const patternControls = compatibilityCell
                      ? patternControlsByCellId[compatibilityCell.id] ?? []
                      : patternControlsByInstanceId[target.instanceId] ?? []
                    const controlLabels = Object.fromEntries(
                      patternControls.map((control) => [control.exportName, control.label]),
                    )
                    if (compatibilityCell) {
                      return projectGlobalShowClipSummary(show, compatibilityCell.id, controlLabels)
                    }
                    return timelineComposition
                      ? projectCompositionShowClipSummary(timelineComposition, target, controlLabels)
                      : []
                  }
                  const summary = projectTimelineSummary(clip)
                  const connectedToPrevious = Boolean(previousClip && layer.junctions.some((junction) => (
                    junction.leftClipId === previousClip.id && junction.rightClipId === clip.id
                  )))
                  const previousSummary = timelineComposition
                    && previousClip
                    && connectedToPrevious
                    ? projectTimelineSummary(previousClip)
                    : null
                  const group = clip.groupOccurrenceId
                    ? unifiedZone.groups.find((candidate) => candidate.id === clip.groupOccurrenceId)
                    : null
                  const groupPlacementId = group && clip.id.startsWith(`${group.id}:`)
                    ? clip.id.slice(group.id.length + 1)
                    : null
                  const insideIsolatedGroup = Boolean(group && group.id === isolatedGroupOccurrenceId)
                  const outsideIsolation = Boolean(isolatedGroupOccurrenceId && !insideIsolatedGroup)
                  const selected = group
                    ? selection.kind === 'group' && selection.occurrenceId === group.id
                      || selection.kind === 'group-clip'
                        && selection.occurrenceId === group.id
                        && selection.placementId === groupPlacementId
                    : selection.kind === 'clip' && selection.clipId === clip.id
                      || selection.kind === 'multi' && selection.groupSelection.placementIds.includes(clip.id)
                  const clipSelectionKey = insideIsolatedGroup && groupPlacementId
                    ? `group-clip:${group!.id}:${groupPlacementId}`
                    : group ? `group:${group.id}` : `clip:${clip.id}`
                  const deleteBlocked = blockedDeleteFeedback?.selectionKey === clipSelectionKey
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      aria-label={insideIsolatedGroup ? `Select Group Clip ${clip.patternName}` : group ? `Select Group ${group.name}` : `Select ${clip.patternName}`}
                      aria-pressed={selected}
                      aria-disabled={outsideIsolation || undefined}
                      data-show-timeline-focus
                      data-show-selection-key={clipSelectionKey}
                      data-show-composition-clip="true"
                      data-show-group-occurrence={group?.id}
                      draggable={!readOnly && !group}
                      onDragStart={(event) => {
                        if (readOnly || group) return
                        event.stopPropagation()
                        const rect = event.currentTarget.getBoundingClientRect()
                        const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
                        const owner: ShowTimelineClipOwner = clip.kind === 'main'
                          ? {
                              kind: 'main',
                              sceneId: clip.sceneId,
                              zoneId: clip.zoneId,
                              placementId: clip.id,
                            }
                          : {
                              kind: 'overlay',
                              sceneId: clip.sceneId,
                              zoneId: clip.zoneId,
                              layerId: clip.layerId!,
                              placementId: clip.id,
                            }
                        const dragState = {
                          clipId: clip.id,
                          owner,
                          grabOffsetMs: fraction * clip.durationMs,
                          mode: event.altKey ? 'duplicate' as const : 'move' as const,
                          duplicatePlacementId: event.altKey ? newPersonalContentId() : null,
                          duplicateInstanceId: event.altKey ? newPersonalContentId() : null,
                        }
                        activeMoveLayerRef.current = null
                        draggingCompositionClipRef.current = dragState
                        setDraggingCompositionClip(dragState)
                        onDirectManipulationChange(true)
                        event.dataTransfer.effectAllowed = dragState.mode === 'duplicate' ? 'copy' : 'move'
                        event.dataTransfer.setData('application/x-pxlblz-show-placement', clip.id)
                      }}
                      onDrag={(event) => {
                        const activeLayer = activeMoveLayerRef.current
                        if (!activeLayer || !draggingCompositionClipRef.current) return
                        if (event.clientX === 0 && event.clientY === 0) return
                        updateCompositionClipMovePreview({
                          clientX: event.clientX,
                          shiftKey: event.shiftKey,
                          element: activeLayer.element,
                          layer: activeLayer.layer,
                          zoneId: activeLayer.zoneId,
                          targetKey: activeLayer.targetKey,
                          dataTransfer: event.dataTransfer,
                        })
                      }}
                      onDragEnd={() => {
                        activeMoveLayerRef.current = null
                        draggingCompositionClipRef.current = null
                        setDraggingCompositionClip(null)
                        movePlanRef.current = null
                        setMovePreview(null)
                        setDropTargetKey(null)
                        onDirectManipulationChange(false)
                      }}
                      onClick={(event) => {
                        if (suppressResizeClipClickRef.current === clip.id) {
                          suppressResizeClipClickRef.current = null
                          event.preventDefault()
                          event.stopPropagation()
                          return
                        }
                        event.stopPropagation()
                        if (group && groupPlacementId && event.detail >= 2 && !readOnly) {
                          onEnterGroupIsolation(group.id, groupPlacementId, event.currentTarget)
                          return
                        }
                        if (!group && event.shiftKey && timelineComposition) {
                          if (selection.kind === 'multi') {
                            const placementIds = new Set(selection.groupSelection.placementIds)
                            if (placementIds.has(clip.id)) placementIds.delete(clip.id)
                            else placementIds.add(clip.id)
                            onSelectGroupCandidates({
                              placementIds: [...placementIds].sort((leftId, rightId) => leftId.localeCompare(rightId)),
                              transitionIds: selection.groupSelection.transitionIds,
                            })
                            return
                          }
                          const seeds = selection.kind === 'clip'
                            ? [selection.clipId, clip.id]
                            : [clip.id]
                          onSelectGroupCandidates(completeShowGroupSelection(timelineComposition, seeds))
                          return
                        }
                        onSelect(group
                          ? insideIsolatedGroup && groupPlacementId
                            ? { kind: 'group-clip', occurrenceId: group.id, placementId: groupPlacementId }
                            : { kind: 'group', occurrenceId: group.id }
                          : { kind: 'clip', clipId: clip.id }, event.currentTarget)
                      }}
                      onDoubleClick={(event) => {
                        if (!group || !groupPlacementId || readOnly) return
                        event.stopPropagation()
                        onEnterGroupIsolation(group.id, groupPlacementId, event.currentTarget)
                      }}
                      className={[
                        clipBase,
                        'group absolute inset-y-1 min-h-0',
                        outsideIsolation
                          ? 'pointer-events-none opacity-25 saturate-50'
                          : draggingCompositionClip?.clipId === clip.id
                          ? 'opacity-45'
                          : selected
                          ? 'text-zinc-100'
                          : 'text-zinc-300 hover:text-zinc-100',
                      ].join(' ')}
                      style={{
                        '--zone-color': row.color ?? '#38bdf8',
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: 2,
                        borderLeftColor: selected ? 'var(--color-live)' : row.color ?? '#38bdf8',
                        background: `color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, transparent)`,
                        boxShadow: 'none',
                      } as CSSProperties}
                    >
                      {deleteBlocked && (
                        <span
                          key={blockedDeleteFeedback.token}
                          aria-hidden
                          data-testid="show-clip-delete-blocked"
                          className="show-clip-delete-blocked pointer-events-none absolute -inset-[2px] z-30 flex items-center justify-center rounded-[7px]"
                        >
                          <span className="show-clip-delete-blocked-label rounded border border-red-300/70 bg-red-950/95 px-1.5 py-0.5 text-[9px] font-semibold uppercase leading-none tracking-[0.08em] text-red-100 shadow-sm">
                            Keep one Clip
                          </span>
                        </span>
                      )}
                      <span className="relative z-10 flex min-w-0 items-center gap-1.5">
                        <span className={`show-clip-pattern-name truncate text-[12px] font-normal [text-shadow:0_1px_2px_rgba(0,0,0,0.95)] ${selected ? 'text-live' : 'text-zinc-100'}`}>{clip.patternName}</span>
                      </span>
                      <ClipSummaryInline summary={summary} previousSummary={previousSummary} />
                      {!readOnly && !group && (
                        <>
                          {/* A junction draws a 16px band centred on the boundary, so
                              it covers 8px inside each neighbouring Clip. The grab
                              zone therefore starts past that band on a joined edge and
                              widens to stay easy to hit, leaving the Cut or Transition
                              cleanly clickable in its own territory. A free edge keeps
                              its zone at the very edge. Capped at a third of the Clip
                              so a short Clip keeps a draggable body. The zone draws nothing:
                              the resize cursor is the affordance, and a visible mark
                              read as a selection artifact (#363). */}
                          {(['start', 'end'] as const).map((edge) => {
                            const joined = edge === 'start'
                              ? layer.junctions.some((junction) => junction.rightClipId === clip.id)
                              : layer.junctions.some((junction) => junction.leftClipId === clip.id)
                            return (
                              <span
                                key={edge}
                                role="separator"
                                aria-orientation="vertical"
                                aria-label={`Resize ${clip.patternName} ${edge}`}
                                data-resize-joined={joined ? 'true' : undefined}
                                className={[
                                  'absolute inset-y-0 z-20 max-w-[33%] cursor-ew-resize',
                                  joined ? 'w-3.5' : 'w-2.5',
                                  edge === 'start'
                                    ? (joined ? 'left-2' : 'left-0')
                                    : (joined ? 'right-2' : 'right-0'),
                                ].join(' ')}
                                onClick={(event) => event.stopPropagation()}
                                onPointerDown={(event) => beginCompositionResize(clip, edge, event)}
                              />
                            )
                          })}
                        </>
                      )}
                    </button>
                  )
                })}
                {layer.junctions.map((junction) => {
                  const leftClip = layer.clips.find((clip) => clip.id === junction.leftClipId)
                  const rightClip = layer.clips.find((clip) => clip.id === junction.rightClipId)
                  if (!leftClip || !rightClip) return null
                  const internalGroupId = leftClip.groupOccurrenceId
                    && leftClip.groupOccurrenceId === rightClip.groupOccurrenceId
                    ? leftClip.groupOccurrenceId
                    : null
                  const internalGroup = internalGroupId
                    ? unifiedZone.groups.find((candidate) => candidate.id === internalGroupId)
                    : null
                  const internalGroupPlacementId = internalGroup
                    && leftClip.id.startsWith(`${internalGroup.id}:`)
                    ? leftClip.id.slice(internalGroup.id.length + 1)
                    : null
                  const insideIsolatedGroup = Boolean(internalGroup && internalGroup.id === isolatedGroupOccurrenceId)
                  const outsideIsolation = Boolean(isolatedGroupOccurrenceId && !insideIsolatedGroup)
                  const selectInternalGroup = (anchor: HTMLElement) => {
                    if (!internalGroup) return false
                    if (insideIsolatedGroup) return false
                    onSelect(insideIsolatedGroup && internalGroupPlacementId
                      ? { kind: 'group-clip', occurrenceId: internalGroup.id, placementId: internalGroupPlacementId }
                      : { kind: 'group', occurrenceId: internalGroup.id }, anchor)
                    return true
                  }
                  const openJunctionEditor = (anchor: HTMLElement) => {
                    onDismiss()
                    if (junction.boundaryTransition) {
                      onSelect({ kind: 'transition', transitionId: junction.boundaryTransition.id }, anchor)
                      return
                    }
                    onOpenLayerTransition({
                      junction,
                      fromName: leftClip.patternName,
                      toName: rightClip.patternName,
                      anchor,
                      ...(internalGroup ? { groupOccurrenceId: internalGroup.id } : {}),
                    })
                  }
                  const transitionPictogram = junction.boundaryTransition
                    ?? (junction.transition ? {
                      ...junction.transition,
                      afterSceneId: leftClip.sceneId,
                    } : null)
                  const totalMs = Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs)
                  // A Transition belongs to its pair of Clips, so during a
                  // move drag it follows the dragged Clip's previewed position
                  // instead of waiting for the drop (#63). Duplicate drags
                  // leave the original pair in place.
                  const dragPreview = movePreview && movePreview.mode === 'move'
                    && movePreview.targetKey === `composition:${layer.id}`
                    ? movePreview
                    : null
                  const junctionStartMs = dragPreview && junction.rightClipId === dragPreview.clipId
                    ? dragPreview.startMs - junction.durationMs
                    : dragPreview && junction.leftClipId === dragPreview.clipId
                      ? dragPreview.startMs + dragPreview.durationMs
                      : junction.startMs
                  if (junction.kind !== 'cut') {
                    const width = Math.max(junction.durationMs / totalMs * 100, 0.35)
                    return (
                      <button
                        key={junction.id}
                        type="button"
                        aria-label={`Edit ${junction.kind} Transition between ${leftClip.patternName} and ${rightClip.patternName}`}
                        title={`${junction.kind} - ${junction.durationMs / 1_000}s`}
                        data-show-timeline-focus
                        data-show-selection-key={junction.boundaryTransition
                          ? `transition:${junction.boundaryTransition.id}`
                          : undefined}
                        data-show-layer-junction={junction.id}
                        data-show-group-occurrence={internalGroup?.id}
                        aria-disabled={outsideIsolation || undefined}
                        className={`absolute inset-y-0 z-[15] min-w-4 overflow-hidden bg-transparent outline-none transition-[filter,box-shadow] hover:brightness-125 hover:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.65)] focus-visible:brightness-125 focus-visible:shadow-[inset_0_0_0_1px_rgba(252,211,77,0.85)] ${outsideIsolation ? 'pointer-events-none opacity-25' : ''}`}
                        style={{
                          left: `${junctionStartMs / totalMs * 100}%`,
                          width: `${width}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (selectInternalGroup(event.currentTarget)) return
                          openJunctionEditor(event.currentTarget)
                        }}
                      >
                        {transitionPictogram && <ShowTransitionXrayPictogram transition={transitionPictogram} />}
                      </button>
                    )
                  }
                  return (
                    <button
                      key={junction.id}
                      type="button"
                      aria-label={`Edit Cut between ${leftClip.patternName} and ${rightClip.patternName}`}
                      title="Cut - click to choose a Transition"
                      data-show-timeline-focus
                      data-show-selection-key={junction.boundaryTransition
                        ? `transition:${junction.boundaryTransition.id}`
                        : undefined}
                      data-show-layer-junction={junction.id}
                      data-show-group-occurrence={internalGroup?.id}
                      aria-disabled={outsideIsolation || undefined}
                      className={`group/cut absolute inset-y-0 z-[15] w-4 -translate-x-1/2 bg-transparent outline-none ${outsideIsolation ? 'pointer-events-none opacity-25' : ''}`}
                      style={{ left: `${junctionStartMs / totalMs * 100}%` }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (selectInternalGroup(event.currentTarget)) return
                        openJunctionEditor(event.currentTarget)
                      }}
                    >
                      <span aria-hidden className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-zinc-500/80 transition-colors group-hover/cut:bg-amber-300 group-focus-visible/cut:bg-amber-300" />
                      <span aria-hidden className="absolute left-1/2 top-1 size-2 -translate-x-1/2 rotate-45 rounded-[1px] border border-zinc-500 bg-[#0b0b0d] opacity-0 transition-[border-color,opacity] group-hover/cut:border-amber-300 group-hover/cut:opacity-100 group-focus-visible/cut:border-amber-300 group-focus-visible/cut:opacity-100" />
                    </button>
                  )
                })}
              </div>
            )))}
            {!collapsed && (propertyLanesByZone.get(row.zoneId) ?? []).map((lane, laneIndex) => {
              const laneRow = rowStart(rowIndex) + contentStartRow + routingLaneRows + laneIndex + clipLayerCount
              const selectedBeat = selection.kind === 'transition'
                ? lane.projection.beats.find((beat) => beat.ownerId === selection.transitionId)?.id ?? null
                : null
              return (
                <div key={`${row.zoneId}:${lane.key}`} className="contents">
                  {(zonesOpen || showMicroZonePicker) && <div
                    data-testid="show-property-lane-label"
                    data-compact={showMicroZonePicker ? 'true' : 'false'}
                    title={showMicroZonePicker ? lane.label : undefined}
                    className={`sticky left-0 z-30 flex min-w-0 items-center border-t border-zinc-900/80 bg-[#060608] font-mono text-[8.5px] ${showMicroZonePicker ? 'justify-center px-0' : 'px-2'}`}
                    style={{ gridColumn: 1, gridRow: laneRow, color: lane.color }}
                  >
                    {showMicroZonePicker ? (
                      <>
                        <span data-testid="show-property-lane-compact-mark" className="shrink-0">
                          <ShowPropertyLaneFamilyGlyph family={lane.family} size={10} />
                        </span>
                        <span className="sr-only">{lane.label}</span>
                      </>
                    ) : (
                      <>
                        <ShowPropertyLaneFamilyGlyph family={lane.family} size={9} className="mr-1 shrink-0" />
                        <span className="truncate">{lane.displayLabel}</span>
                      </>
                    )}
                  </div>}
                  <div
                    className="min-w-0"
                    style={{ gridColumn: `2 / ${timeGridEndLine}`, gridRow: laneRow }}
                  >
                    <ShowPropertySparkline
                      ariaLabel={lane.ariaLabel}
                      label={zonesOpen ? undefined : lane.displayLabel}
                      family={lane.family}
                      hoverText={lane.hoverText}
                      showId={show.id}
                      stickyLeftPx={zonesOpen ? ZONE_RAIL_OPEN_PX : hasMultipleZones ? ZONE_RAIL_MICRO_PX : 0}
                      showFamilyGlyph={!zonesOpen && !showMicroZonePicker}
                      projection={lane.projection}
                      color={lane.color}
                      selectedBeatId={selectedBeat}
                      formatValue={lane.formatValue}
                      getBeatSelectionKey={lane.selectsTransition
                        ? (beat) => beat.ownerId ? `transition:${beat.ownerId}` : undefined
                        : undefined}
                      onSelectBeat={lane.selectsTransition
                        ? (beat, anchor) => {
                            if (!beat.ownerId) return
                            onSelect({ kind: 'transition', transitionId: beat.ownerId }, anchor)
                          }
                        : undefined}
                      className="size-full border-t border-zinc-900/80 bg-[#080a0d]"
                    />
                  </div>
                </div>
              )
            })}
          </div>
          )
        })}
        </div>
      </div>
      </div>
      {/* Outside the grid subtree: the grid owns marquee and group-isolation
          pointer handlers, and React bubbles portalled popover events through
          their JSX ancestors (#629). */}
      {zoneMapOpen && (showFullZoneHeaders || showMicroZonePicker) && (
        <ZoneMapPopover
          anchor={zoneMapAnchor}
          show={show}
          readOnly={readOnly}
          onAddZone={onAddZone}
          onDismiss={() => setZoneMapOpen(false)}
          onUpdateZone={onUpdateZone}
          onRemoveZone={onRemoveZone}
        />
      )}
    </div>
  )
}


function ZoneGlyph({ icon, size = 12 }: { icon?: string; size?: number }) {
  if (icon === 'map') return <MapIcon size={size} aria-hidden />
  if (icon === 'layers') return <Layers3 size={size} aria-hidden />
  if (icon === 'route') return <Route size={size} aria-hidden />
  if (icon === 'pulse') return <Activity size={size} aria-hidden />
  if (icon === 'bolt') return <Zap size={size} aria-hidden />
  return <Grid2X2 size={size} aria-hidden />
}

function ZoneColorSwatch({
  zoneName,
  color,
  readOnly,
  onPickColor,
}: {
  zoneName: string
  color: string
  readOnly: boolean
  onPickColor: (color: string) => void
}) {
  const [open, setOpen] = useState(false)
  if (readOnly) {
    return (
      <span className="grid size-6 shrink-0 place-items-center rounded border border-current/30 bg-black/30" style={{ color }}>
        <Grid2X2 size={12} aria-hidden />
      </span>
    )
  }
  return (
    <span className="relative shrink-0">
      <button
        type="button"
        aria-label={`Zone color ${zoneName}`}
        aria-expanded={open}
        title={`Color for ${zoneName}`}
        className="grid size-6 place-items-center rounded border border-current/30 bg-black/30 hover:border-current/70"
        style={{ color }}
        onClick={() => setOpen((current) => !current)}
      >
        <Grid2X2 size={12} aria-hidden />
      </button>
      {open && (
        <span className="absolute left-0 top-full z-50 mt-1 flex gap-1 rounded border border-zinc-700 bg-zinc-950 p-1 shadow-xl">
          {ZONE_COLORS.map((option) => (
            <button
              key={option}
              type="button"
              aria-label={`${zoneName} color ${option}`}
              title={option}
              aria-pressed={color.toLowerCase() === option.toLowerCase()}
              className={`size-5 rounded border ${color.toLowerCase() === option.toLowerCase()
                ? 'border-white/90'
                : 'border-white/15 hover:border-white/60'}`}
              style={{ backgroundColor: option }}
              onClick={() => {
                onPickColor(option)
                setOpen(false)
              }}
            />
          ))}
        </span>
      )}
    </span>
  )
}

function ZoneMapPopover({
  anchor,
  show,
  readOnly,
  onAddZone,
  onDismiss,
  onUpdateZone,
  onRemoveZone,
}: {
  anchor: HTMLElement | null
  show: ShowRecord
  readOnly: boolean
  onAddZone: () => void
  onDismiss: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
}) {
  // Deleting a Zone deletes its Clips with it; a single stray click must
  // not be enough. The trash arms a red confirm that disarms on its own.
  const [pendingDeleteZoneId, setPendingDeleteZoneId] = useState<string | null>(null)
  useEffect(() => {
    if (!pendingDeleteZoneId) return
    const timeout = window.setTimeout(() => setPendingDeleteZoneId(null), 2_600)
    return () => window.clearTimeout(timeout)
  }, [pendingDeleteZoneId])
  return (
    <ShowTimelineToolbarPopover
      anchor={anchor}
      widthPx={310}
      align="start"
      ariaLabel="Zone Map"
      className="w-[min(310px,calc(100vw-24px))] rounded border border-zinc-700 bg-[#0a0a0d]/[0.985] p-1.5 shadow-2xl backdrop-blur"
      onDismiss={onDismiss}
      // Selections made inside the map must not reach the editor's document
      // click handling, which would close the Entity Detail panel they open.
      // Dismissal listens on pointerdown, so it still sees outside presses.
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex h-8 items-center gap-2 border-b border-zinc-800 px-1.5">
        <MapIcon size={13} aria-hidden className="text-live" />
        <strong className="text-[13px] font-medium text-zinc-100">Zone Map</strong>
      </header>
      <h3 className="mt-1 px-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
        Zones
        <span className="ml-1 normal-case tracking-normal text-zinc-600">the whole output, divided</span>
      </h3>
      <div className="py-1">
        {show.zones.map((zone) => {
          return (
            <div
              key={zone.id}
              className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-1 border-b border-zinc-900/80 px-1 py-1 last:border-b-0"
            >
              <div className="flex min-w-0 items-center gap-2 px-0.5 py-1">
                <ZoneColorSwatch
                  zoneName={zone.name}
                  color={zone.color ?? '#38bdf8'}
                  readOnly={readOnly}
                  onPickColor={(color) => onUpdateZone(zone.id, { color })}
                />
                <span className="min-w-0 flex-1 text-[11px] font-medium">
                  {/* Rename in place; the Zone rail still opens full properties
                      (pixel share, Installation ranges) when needed (#63). */}
                  <InlineEntityTitle
                    name={zone.name}
                    noun="zone"
                    onRename={readOnly ? undefined : (name) => onUpdateZone(zone.id, { name })}
                    takenNames={show.zones.filter((candidate) => candidate.id !== zone.id).map((candidate) => candidate.name)}
                  />
                  {show.outputContract?.kind === 'installation' && (
                    <span className="block truncate text-[9px] font-normal text-zinc-500">{zone.nominalPixelCount} px</span>
                  )}
                </span>
              </div>
              {show.zones.length > 1 && (
                <div className="flex items-center gap-0.5">
                  {!readOnly && (
                    pendingDeleteZoneId === zone.id ? (
                      <button
                        type="button"
                        aria-label={`Confirm delete zone ${zone.name}`}
                        title={`Delete ${zone.name} and its Clips`}
                        className="flex h-7 items-center gap-1 rounded border border-red-400/50 bg-red-500/15 px-1.5 text-[9px] font-semibold uppercase tracking-wide text-red-200 hover:bg-red-500/25"
                        onClick={() => {
                          setPendingDeleteZoneId(null)
                          onRemoveZone(zone.id)
                        }}
                      >
                        <Trash2 size={11} aria-hidden /> Delete?
                      </button>
                    ) : (
                      <button
                        type="button"
                        aria-label={`Delete zone ${zone.name}`}
                        title={`Delete ${zone.name}...`}
                        className="grid size-7 place-items-center rounded text-zinc-600 hover:bg-zinc-800 hover:text-red-300"
                        onClick={() => setPendingDeleteZoneId(zone.id)}
                      >
                        <Trash2 size={12} aria-hidden />
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {!readOnly && (
        <button
          type="button"
          aria-label="Add Zone"
          className="flex h-8 w-full items-center justify-center gap-1 rounded border border-dashed border-zinc-800 text-[11px] text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
          onClick={onAddZone}
        >
          <Plus size={12} aria-hidden />
          Add Zone
        </button>
      )}
    </ShowTimelineToolbarPopover>
  )
}

function TimelineNavigator({
  showId,
  viewport,
  onChange,
  compact = false,
}: {
  showId: string
  viewport: ShowTimelineViewport
  onChange: (viewport: ShowTimelineViewport) => void
  compact?: boolean
}) {
  const overviewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'pan' | 'start' | 'end'; x: number; viewport: ShowTimelineViewport } | null>(null)
  const thumb = showTimelineThumb(viewport)
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const playheadPercent = viewport.totalMs > 0
    ? Math.min(100, Math.max(0, positionMs / viewport.totalMs * 100))
    : 0
  const beginDrag = (mode: 'pan' | 'start' | 'end', event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    event.currentTarget.focus()
    dragRef.current = { mode, x: event.clientX, viewport }
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    const width = overviewRef.current?.clientWidth ?? 0
    if (!drag || width <= 0) return
    const deltaMs = (event.clientX - drag.x) / width * drag.viewport.totalMs
    if (drag.mode === 'pan') onChange(panShowTimelineViewport(drag.viewport, drag.viewport.startMs + deltaMs))
    if (drag.mode === 'start') onChange(resizeShowTimelineViewport(drag.viewport, 'start', drag.viewport.startMs + deltaMs))
    if (drag.mode === 'end') onChange(resizeShowTimelineViewport(drag.viewport, 'end', drag.viewport.startMs + drag.viewport.durationMs + deltaMs))
  }
  const endDrag = () => { dragRef.current = null }
  const keyboardStep = viewport.durationMs * 0.05
  const togglePlaybackOnSpace = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.code !== 'Space') return false
    event.preventDefault()
    usePreviewStore.getState().toggle()
    return true
  }
  return (
    <div
      className={compact
        ? 'timeline-zoom-cluster grid h-6 min-w-[96px] max-w-[260px] flex-1 grid-cols-[minmax(0,1fr)_30px] bg-zinc-950/45'
        : 'mt-2 grid h-9 grid-cols-[148px_minmax(0,1fr)_64px] border-t border-zinc-800 bg-zinc-950/65'}
      role="group"
      aria-label="Show navigator"
    >
      {!compact && <div className="flex items-center px-2 text-[9px] uppercase tracking-[0.12em] text-zinc-600">Show navigator</div>}
      <div ref={overviewRef} className={compact ? 'relative my-1 overflow-hidden rounded-sm bg-zinc-900/80' : 'relative my-2 overflow-hidden rounded-sm bg-zinc-900/80'}>
        <div className="absolute inset-y-0 left-0 right-0 opacity-40" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(161,161,170,.35) 0 1px, transparent 1px 8%)' }} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Pan visible timeline range"
          aria-valuemin={0}
          aria-valuemax={Math.round(viewport.totalMs - viewport.durationMs)}
          aria-valuenow={Math.round(viewport.startMs)}
          className="absolute inset-y-[-3px] cursor-grab rounded border border-amber-400 bg-amber-400/[0.07] outline-none focus:ring-1 focus:ring-amber-300"
          style={{ left: `${thumb.leftPercent}%`, width: `${thumb.widthPercent}%` }}
          onPointerDown={(event) => beginDrag('pan', event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (togglePlaybackOnSpace(event)) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            onChange(panShowTimelineViewport(viewport, viewport.startMs + (event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep)))
          }}
        />
        <button
          type="button"
          aria-label="Resize visible range start"
          className="absolute inset-y-1 z-10 w-1 cursor-ew-resize border-x border-zinc-500/70 outline-none transition-colors hover:border-amber-300 focus-visible:border-amber-300"
          style={{ left: `calc(${thumb.leftPercent}% + 4px)` }}
          onPointerDown={(event) => beginDrag('start', event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (togglePlaybackOnSpace(event)) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            onChange(resizeShowTimelineViewport(viewport, 'start', viewport.startMs + (event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep)))
          }}
        />
        <button
          type="button"
          aria-label="Resize visible range end"
          className="absolute inset-y-1 z-10 w-1 cursor-ew-resize border-x border-zinc-500/70 outline-none transition-colors hover:border-amber-300 focus-visible:border-amber-300"
          style={{ left: `calc(${thumb.leftPercent + thumb.widthPercent}% - 8px)` }}
          onPointerDown={(event) => beginDrag('end', event)}
          onPointerMove={moveDrag}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={(event) => {
            if (togglePlaybackOnSpace(event)) return
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            const end = viewport.startMs + viewport.durationMs + (event.key === 'ArrowLeft' ? -keyboardStep : keyboardStep)
            onChange(resizeShowTimelineViewport(viewport, 'end', end))
          }}
        />
        <span
          aria-hidden
          data-testid="show-timeline-navigator-playhead"
          className="pointer-events-none absolute inset-y-0 z-20 w-px bg-live/60 shadow-[0_0_3px_color-mix(in_srgb,var(--color-live)_25%,transparent)]"
          style={{ left: `${playheadPercent}%` }}
        />
        <span
          aria-hidden
          data-testid="show-timeline-navigator-playhead-cap"
          className="pointer-events-none absolute top-0 z-20 h-1 w-1.5 bg-live/70"
          style={timelinePlayheadCapStyle(playheadPercent)}
        />
      </div>
      <div className="flex items-center justify-end px-1.5 text-[9px] tabular-nums text-zinc-600">{Math.round(viewport.totalMs / viewport.durationMs * 100)}%</div>
    </div>
  )
}

/**
 * Names a collapsed Zone once per owned span, and follows a scrolled timeline.
 *
 * This renders as its own grid cell rather than inside the collapsed lane: the
 * lane clips its content, and an `overflow: hidden` box becomes the scrollport
 * that `position: sticky` resolves against, so a stamp nested in the lane would
 * never move. Only a closed rail asks for it - an open rail's header already
 * carries the name (#632).
 */
function CollapsedZoneNameOverlay({
  intervals,
  zoneId,
  zoneName,
  durationMs,
  stickyLeftPx,
  gridColumn,
  gridRow,
}: {
  intervals: ShowLayoutInterval[]
  zoneId: string
  zoneName: string
  durationMs: number
  stickyLeftPx: number
  gridColumn: string
  gridRow: number
}) {
  const totalMs = Math.max(1, durationMs)
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-[21] min-w-0"
      style={{ gridColumn, gridRow }}
    >
      {intervals.filter((interval) => interval.zoneIds.includes(zoneId)).map((interval) => (
        <span
          key={interval.id}
          className="absolute inset-y-0 flex items-start"
          style={{
            left: `${interval.startMs / totalMs * 100}%`,
            width: `${interval.durationMs / totalMs * 100}%`,
          }}
        >
          <span
            data-testid="collapsed-zone-layout-label"
            className="sticky mt-0.5 max-w-[calc(100%-8px)] truncate rounded-sm bg-black/75 px-1.5 text-[10px] font-medium leading-4 text-zinc-100 shadow-[0_1px_2px_rgba(0,0,0,0.8)]"
            style={{ left: stickyLeftPx + 4 }}
          >
            {zoneName}
          </span>
        </span>
      ))}
    </div>
  )
}

/** Masks the spans where a Zone is unowned by the Layout in force. */
function LayoutZoneIntervalOverlay({
  intervals,
  zoneId,
  durationMs,
}: {
  intervals: ShowLayoutInterval[]
  zoneId: string
  durationMs: number
}) {
  const totalMs = Math.max(1, durationMs)
  return <>
    {intervals.map((interval) => {
      const left = interval.startMs / totalMs * 100
      const width = interval.durationMs / totalMs * 100
      const active = interval.zoneIds.includes(zoneId)
      if (!active) {
        return <i
          key={interval.id}
          aria-hidden
          data-inactive-layout-zone={`${interval.id}:${zoneId}`}
          className="pointer-events-none absolute inset-y-0 z-20 border-x border-zinc-900/90 bg-[#050507]/95"
          style={{ left: `${left}%`, width: `${width}%` }}
        />
      }
      return null
    })}
  </>
}

function TimelineLayoutBoundaries({
  show,
  intervals,
  durationMs,
  gridColumn,
  gridRow,
  rowSpan,
  selection,
}: {
  show: ShowRecord
  intervals: ShowLayoutInterval[]
  durationMs: number
  gridColumn: string
  gridRow: number
  rowSpan: number
  selection: ShowSelection
}) {
  if (intervals.length <= 1) return null
  return (
    <div
      aria-label="Zone Layout routing intervals"
      className="pointer-events-none relative z-[25]"
      style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
    >
      {intervals.slice(1).map((interval, index) => {
        const precedingInterval = intervals[index]
        const precedingSceneId = precedingInterval.sceneIds[precedingInterval.sceneIds.length - 1]
        const transition = showRoutingTransitionAfter(show, precedingSceneId)
        if (!transition) return null
        const { left } = showLayoutIntervalPercentBounds(interval, durationMs)
        const selected = selection.kind === 'transition' && selection.transitionId === transition.id
        return <Fragment key={interval.id}>
          <span
            aria-hidden
            data-show-layout-boundary={interval.id}
            className={selected
              ? 'pointer-events-none absolute inset-y-0 z-0 w-[2px] -translate-x-1/2 bg-sky-400/80'
              : 'pointer-events-none absolute inset-y-0 z-0 w-[2px] -translate-x-1/2 bg-sky-400/40'}
            style={{ left: `${left}%` }}
          />
        </Fragment>
      })}
    </div>
  )
}

function TimelineMarkerSource({
  show,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
  getRulerBounds,
  onCreateMarker,
  onMarkerFeedback,
}: {
  show: ShowRecord
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
  getRulerBounds: () => DOMRect | null
  onCreateMarker: (timeMs: number) => Promise<boolean>
  onMarkerFeedback: (feedback: TimelineMarkerFeedback | null) => void
}) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const markerDragRef = useRef<{ pointerId: number; startX: number } | null>(null)
  const suppressMarkerClickRef = useRef(false)
  const confirmationTimerRef = useRef<number | null>(null)
  useEffect(() => () => {
    if (confirmationTimerRef.current !== null) window.clearTimeout(confirmationTimerRef.current)
  }, [])
  const clearConfirmation = () => {
    if (confirmationTimerRef.current !== null) {
      window.clearTimeout(confirmationTimerRef.current)
      confirmationTimerRef.current = null
    }
  }
  // A dragged-out Marker lands on the drop grid — whole seconds, tenths with
  // Shift — so it no longer needs a post-hoc edit to sit on a clean time
  // (#667). Alt drops it on raw milliseconds.
  const resolveDragTime = (
    clientX: number,
    modifiers: { altKey: boolean; shiftKey: boolean },
  ): number | null => {
    const rect = getRulerBounds()
    if (!rect || clientX < rect.left || clientX > rect.right) return null
    const rawTimeMs = (clientX - rect.left) / Math.max(1, rect.width) * durationMs
    if (modifiers.altKey) return Math.round(Math.max(0, Math.min(durationMs, rawTimeMs)))
    const visibleWidthPx = getVisibleWidth()
    return Math.round(snapShowTimelineTime(rawTimeMs, {
      visibleDurationMs: viewport.durationMs,
      visibleWidthPx,
      structuralTimesMs: snapEnabled ? structuralTimesMs : [],
      quantizeStepMs: showTimelineQuantizeStepMs(modifiers.shiftKey, viewport.durationMs, visibleWidthPx),
      maxTimeMs: durationMs,
    }).timeMs)
  }
  return (
    <div
      data-show-marker-source-gutter
      className="pointer-events-none flex h-6 w-5 shrink-0 items-center justify-center"
    >
      <button
        type="button"
        aria-label="Add Marker at playhead"
        title="Click to add at the playhead, or drag onto the ruler · lands on the time grid, Shift for tenths, Alt for free placement"
        className="pointer-events-auto flex h-6 w-5 cursor-ew-resize items-center justify-center rounded-sm text-zinc-500 hover:bg-amber-300/10 hover:text-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
        onPointerDown={(event) => {
          event.stopPropagation()
          clearConfirmation()
          onMarkerFeedback(null)
          markerDragRef.current = { pointerId: event.pointerId, startX: event.clientX }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerMove={(event) => {
          const drag = markerDragRef.current
          if (!drag || drag.pointerId !== event.pointerId || Math.abs(event.clientX - drag.startX) < 3) return
          const timeMs = resolveDragTime(event.clientX, event)
          onMarkerFeedback(timeMs === null ? null : { kind: 'drag', timeMs })
        }}
        onPointerUp={(event) => {
          const drag = markerDragRef.current
          markerDragRef.current = null
          if (!drag || drag.pointerId !== event.pointerId || Math.abs(event.clientX - drag.startX) < 3) return
          suppressMarkerClickRef.current = true
          onMarkerFeedback(null)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
          const timeMs = resolveDragTime(event.clientX, event)
          if (timeMs !== null) void onCreateMarker(timeMs)
        }}
        onPointerCancel={(event) => {
          if (markerDragRef.current?.pointerId !== event.pointerId) return
          markerDragRef.current = null
          onMarkerFeedback(null)
        }}
        onClick={() => {
          if (suppressMarkerClickRef.current) {
            suppressMarkerClickRef.current = false
            return
          }
          void onCreateMarker(positionMs).then((created) => {
            if (!created) return
            clearConfirmation()
            onMarkerFeedback({ kind: 'confirmation', timeMs: positionMs })
            confirmationTimerRef.current = window.setTimeout(() => {
              confirmationTimerRef.current = null
              onMarkerFeedback(null)
            }, 1_100)
          })
        }}
      >
        <Flag size={11} aria-hidden />
      </button>
    </div>
  )
}

function TimelineRuler({
  rulerRef,
  show,
  gridColumn,
  gridRow,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
}: {
  rulerRef: { current: HTMLDivElement | null }
  show: ShowRecord
  gridColumn: string
  gridRow: number
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
}) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const pendingSeekRef = useRef<{ showId: string; targetMs: number } | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const keyboardHoldRef = useRef<{ key: 'ArrowLeft' | 'ArrowRight'; startedAt: number } | null>(null)
  const pointerScrubRef = useRef({ active: false, inverted: false })
  // Shift-fine scrubbing (#667): while Shift is held the captured pointer
  // drives the playhead at a tenth of the gain through an incremental
  // session. Once Shift has engaged, the whole remaining gesture stays
  // incremental — coarse deltas at full gain — because handing back to the
  // native absolute range mapping would jump the playhead to the pointer's
  // coarse position (#667 review).
  const scrubDragRef = useRef<FineAdjustDrag | null>(null)
  const scrubWidthPxRef = useRef(1)
  const scrubFineEngagedRef = useRef(false)
  const previewScrub = (targetMs: number, snap = false) => {
    const resolvedTimeMs = snap
      ? snapShowTimelineTime(targetMs, {
          visibleDurationMs: viewport.durationMs,
          visibleWidthPx: getVisibleWidth(),
          structuralTimesMs,
          maxTimeMs: durationMs,
        }).timeMs
      : targetMs
    const preview = usePreviewStore.getState()
    if (!pendingSeekRef.current) resumeAfterSeekRef.current = preview.isRunning
    if (preview.isRunning) preview.toggle()
    useShowTransportStore.getState().setPosition(show.id, resolvedTimeMs)
    pendingSeekRef.current = { showId: show.id, targetMs: resolvedTimeMs }
  }
  const commitScrub = () => {
    const pending = pendingSeekRef.current
    if (!pending || pending.showId !== show.id) {
      pendingSeekRef.current = null
      resumeAfterSeekRef.current = false
      return
    }
    const shouldResume = resumeAfterSeekRef.current
    pendingSeekRef.current = null
    resumeAfterSeekRef.current = false
    useShowTransportStore.getState().requestSeek(show.id, pending.targetMs)
    if (shouldResume && !usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
  }
  const getVisibleWidthRef = useRef(getVisibleWidth)
  useEffect(() => {
    getVisibleWidthRef.current = getVisibleWidth
  })
  const [visibleWidthPx, setVisibleWidthPx] = useState(() => getVisibleWidth())
  useEffect(() => {
    const ruler = rulerRef.current
    if (!ruler) return
    const update = () => setVisibleWidthPx(getVisibleWidthRef.current())
    update()
    if (typeof ResizeObserver === 'undefined') return
    // The ruler cell resizes whenever the scroll viewport does (its width is a
    // function of the viewport width and zoom scale), so observing it keeps
    // the tick grid in step with the width snapping reads at event time.
    const observer = new ResizeObserver(update)
    observer.observe(ruler)
    return () => observer.disconnect()
  }, [rulerRef])
  const { ticks } = showTimelineRulerTicks({
    rulerDurationMs: durationMs,
    viewport,
    visibleWidthPx,
  })
  return (
    <div
      ref={rulerRef}
      data-testid="show-timeline-ruler"
      className="group/timeline-ruler relative overflow-hidden border-b border-zinc-800 bg-zinc-950/70 ring-1 ring-inset ring-transparent transition-colors hover:bg-zinc-900/70 hover:ring-zinc-700/70 focus-within:bg-zinc-900/70 focus-within:ring-live/25"
      style={{ gridColumn, gridRow }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.timeMs}
          aria-hidden
          data-show-ruler-tick={tick.kind}
          className="pointer-events-none absolute inset-y-0 w-px"
          style={{
            left: `${tick.fraction * 100}%`,
            transform: tick.fraction === 1 ? 'translateX(-100%)' : undefined,
            backgroundColor: tick.kind === 'major' ? 'rgba(113,113,122,.35)' : 'rgba(113,113,122,.18)',
          }}
        />
      ))}
      {ticks.filter((tick) => tick.kind === 'major').map((tick) => (
        <span
          key={tick.timeMs}
          aria-hidden
          className="pointer-events-none absolute top-1 text-[8.5px] tabular-nums text-zinc-600 transition-colors group-hover/timeline-ruler:text-zinc-400"
          style={{ left: `${tick.fraction * 100}%`, transform: `translateX(${tick.fraction === 0 ? 0 : tick.fraction === 1 ? -100 : -50}%)` }}
        >
          {tick.label}
        </span>
      ))}
      <input
        type="range"
        aria-label="Show playhead"
        min={0}
        max={durationMs}
        step={1}
        value={Math.min(positionMs, durationMs)}
        onChange={(event) => {
          if (pointerScrubRef.current.active && scrubFineEngagedRef.current) return
          previewScrub(
            Number(event.target.value),
            pointerScrubRef.current.active && snapEnabled !== pointerScrubRef.current.inverted,
          )
        }}
        onPointerDown={(event) => {
          pointerScrubRef.current = { active: true, inverted: event.altKey }
          scrubFineEngagedRef.current = event.shiftKey
          // The input extends 8px past the ruler on both sides; the usable
          // track is the ruler span itself.
          const trackWidthPx = event.currentTarget.getBoundingClientRect().width - 16
          scrubWidthPxRef.current = Math.max(1, trackWidthPx)
          scrubDragRef.current = trackWidthPx >= 1
            ? beginFineAdjust(event.clientX, Math.min(positionMs, durationMs))
            : null
        }}
        onPointerMove={(event) => {
          if (!pointerScrubRef.current.active) return
          pointerScrubRef.current.inverted = event.altKey
          if (event.shiftKey) scrubFineEngagedRef.current = true
          const drag = scrubDragRef.current
          if (drag === null) return
          if (!scrubFineEngagedRef.current) {
            scrubDragRef.current = beginFineAdjust(
              event.clientX,
              Math.min(useShowTransportStore.getState().positionMs, durationMs),
            )
            return
          }
          scrubDragRef.current = moveFineAdjust(drag, event.clientX, {
            fine: event.shiftKey,
            scale: durationMs / scrubWidthPxRef.current,
          })
          previewScrub(Math.max(0, Math.min(durationMs, scrubDragRef.current.position)))
        }}
        onKeyDown={(event) => {
          if (event.code === 'Space') {
            event.preventDefault()
            usePreviewStore.getState().toggle()
            return
          }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          const key = event.key
          const current = keyboardHoldRef.current
          if (!event.repeat || !current || current.key !== key) {
            keyboardHoldRef.current = { key, startedAt: event.timeStamp }
          }
          const heldForMs = event.timeStamp - (keyboardHoldRef.current?.startedAt ?? event.timeStamp)
          const direction = key === 'ArrowLeft' ? -1 : 1
          previewScrub(positionMs + direction * showKeyboardSeekStepMs(heldForMs))
        }}
        onPointerUp={() => {
          commitScrub()
          pointerScrubRef.current = { active: false, inverted: false }
          scrubDragRef.current = null
          scrubFineEngagedRef.current = false
        }}
        onPointerCancel={() => {
          commitScrub()
          pointerScrubRef.current = { active: false, inverted: false }
          scrubDragRef.current = null
          scrubFineEngagedRef.current = false
        }}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') keyboardHoldRef.current = null
          commitScrub()
        }}
        onBlur={() => {
          keyboardHoldRef.current = null
          commitScrub()
        }}
        className="show-playhead-range absolute -inset-x-2 inset-y-0 w-[calc(100%+16px)] cursor-col-resize opacity-0 outline-none"
      />
    </div>
  )
}

function ShowTimelineToolbarPopover({
  anchor,
  point,
  widthPx,
  align = 'end',
  role = 'dialog',
  ariaLabel,
  className,
  children,
  onDismiss,
  onClick,
}: {
  anchor: HTMLElement | null
  point?: { clientX: number; clientY: number }
  widthPx: number
  /** Toolbar popovers hang from their anchor's right edge; rail popovers from its left. */
  align?: 'start' | 'end'
  role?: 'dialog' | 'menu'
  ariaLabel: string
  className: string
  children: ReactNode
  onDismiss?: () => void
  onClick?: (event: ReactMouseEvent<HTMLDivElement>) => void
}) {
  const [position, setPosition] = useState({ left: 8, top: 8 })
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!anchor) return
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      const popoverHeight = popoverRef.current?.getBoundingClientRect().height ?? 0
      const desiredTop = point
        ? point.clientY + popoverHeight + 4 <= window.innerHeight - 8
          ? point.clientY + 4
          : point.clientY - popoverHeight - 4
        : rect.bottom + 4
      setPosition({
        left: Math.max(8, Math.min(
          point?.clientX ?? (align === 'start' ? rect.left : rect.right - widthPx),
          window.innerWidth - widthPx - 8,
        )),
        top: Math.max(8, Math.min(desiredTop, window.innerHeight - popoverHeight - 8)),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [align, anchor, point, widthPx])

  useLayoutEffect(() => {
    if (role !== 'menu') return
    popoverRef.current
      ?.querySelector<HTMLElement>('[role="menuitem"]:not(:disabled)')
      ?.focus()
  }, [role])

  useEffect(() => {
    if (!onDismiss) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (popoverRef.current?.contains(event.target) || anchor?.contains(event.target)) return
      onDismiss()
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [anchor, onDismiss])

  // Escape goes through the shared layer registry (#672). Registration happens
  // once per mount through refs: onDismiss is usually an inline lambda, and
  // re-registering per render would make same-rank ordering depend on render
  // timing again.
  const dismissRef = useRef({ anchor, onDismiss })
  useEffect(() => {
    dismissRef.current = { anchor, onDismiss }
  })
  const dismissible = Boolean(onDismiss)
  useEffect(() => {
    if (!dismissible) return
    return registerShowEscapeLayer({
      rank: SHOW_ESCAPE_LAYER_RANK.toolbarPopover,
      onEscape: () => {
        const { anchor: currentAnchor, onDismiss: currentOnDismiss } = dismissRef.current
        if (!currentOnDismiss) return false
        currentOnDismiss()
        currentAnchor?.focus()
        return true
      },
    })
  }, [dismissible])

  if (!anchor || typeof document === 'undefined') return null
  return createPortal(
    <div
      ref={popoverRef}
      role={role}
      aria-label={ariaLabel}
      className={`fixed z-[80] ${className}`}
      style={{ left: position.left, top: position.top }}
      onKeyDown={(event) => {
        if (role !== 'menu' || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return
        const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]:not(:disabled)')]
        if (items.length === 0) return
        event.preventDefault()
        const currentIndex = items.indexOf(document.activeElement as HTMLElement)
        const nextIndex = event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : event.key === 'ArrowDown'
              ? (currentIndex + 1 + items.length) % items.length
              : (currentIndex - 1 + items.length) % items.length
        items[nextIndex]?.focus()
      }}
      onClick={onClick}
    >
      {children}
    </div>,
    document.body,
  )
}

function TimelineEndHandlePortal({
  anchor,
  durationMs,
  layoutScale,
  dragging,
  blocked,
  readOnly,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  onClick,
}: {
  anchor: HTMLElement | null
  durationMs: number
  layoutScale: number
  dragging: boolean
  blocked: boolean
  readOnly: boolean
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onLostPointerCapture: (event: ReactPointerEvent<HTMLButtonElement>) => void
  onClick: (event: ReactMouseEvent<HTMLButtonElement>) => void
}) {
  const [position, setPosition] = useState({ left: -100, top: -100, visible: false })

  useLayoutEffect(() => {
    if (!anchor) return
    const viewport = anchor.closest<HTMLElement>('[data-show-timeline-scroll-viewport]')
    const updatePosition = () => {
      const rect = anchor.getBoundingClientRect()
      const center = rect.left + rect.width / 2
      const viewportRect = viewport?.getBoundingClientRect()
      setPosition({
        left: center,
        top: rect.top,
        visible: !viewportRect || (center >= viewportRect.left && center <= viewportRect.right),
      })
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    const resizeObserver = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(updatePosition)
    if (viewport) resizeObserver?.observe(viewport)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      resizeObserver?.disconnect()
    }
  }, [anchor, durationMs, layoutScale])

  if (!anchor || typeof document === 'undefined') return null
  return createPortal(
    <button
      type="button"
      data-show-timeline-marker-ui
      data-show-end-dragging={dragging ? 'true' : undefined}
      data-show-end-drag-blocked={dragging && blocked ? 'true' : undefined}
      aria-label={`Show End at ${formatSecondsValue(durationMs)} seconds`}
      title={`Show End · ${formatSecondsValue(durationMs)}s`}
      disabled={readOnly}
      className={`fixed z-[45] h-4 w-4 -translate-x-1/2 -translate-y-1/2 touch-none text-red-400 disabled:cursor-default ${dragging && blocked ? 'cursor-not-allowed' : 'cursor-ew-resize'}`}
      style={{
        left: position.left,
        top: position.top,
        visibility: position.visible || dragging ? undefined : 'hidden',
        pointerEvents: position.visible || dragging ? undefined : 'none',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onLostPointerCapture={onLostPointerCapture}
      onClick={onClick}
    >
      <span
        data-testid="show-timeline-end-handle"
        className="absolute left-1/2 top-1/2 h-[5px] w-[5px] -translate-x-1/2 -translate-y-1/2 rotate-45 bg-current"
      />
      {dragging && (
        <span
          data-testid="show-end-drag-time"
          className="absolute left-1/2 top-4 -translate-x-1/2 whitespace-nowrap rounded border border-red-300/25 bg-zinc-950/95 px-1.5 py-0.5 text-[9px] font-medium tabular-nums text-red-200 shadow-lg"
        >
          {formatSecondsValue(durationMs)}s
        </span>
      )}
    </button>,
    document.body,
  )
}

function TimelineMarkers({
  show,
  minimumShowEndMs,
  markers,
  markerFeedback,
  gridColumn,
  gridRow,
  rowSpan,
  layoutScale,
  snapEnabled,
  structuralTimesMs,
  readOnly,
  onMoveMarker,
  onUpdateMarker,
  onRemoveMarker,
  onPreviewShowEnd,
  onSetShowEnd,
}: {
  show: ShowRecord
  minimumShowEndMs: number
  markers: NonNullable<ShowCompositionV1['markers']>
  markerFeedback: TimelineMarkerFeedback | null
  gridColumn: string
  gridRow: number
  rowSpan: number
  layoutScale: number
  snapEnabled: boolean
  structuralTimesMs: number[]
  readOnly: boolean
  onMoveMarker: (markerId: string, timeMs: number) => Promise<boolean>
  onUpdateMarker: (markerId: string, patch: Partial<Omit<NonNullable<ShowCompositionV1['markers']>[number], 'id'>>) => Promise<boolean>
  onRemoveMarker: (markerId: string) => Promise<boolean>
  onPreviewShowEnd: (durationMs: number | null) => void
  onSetShowEnd: (durationMs: number) => Promise<boolean>
}) {
  const durationMs = showLoopDurationMs(show)
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null)
  const [showEndOpen, setShowEndOpen] = useState(false)
  const [showEndDragging, setShowEndDragging] = useState(false)
  const [showEndDragBlocked, setShowEndDragBlocked] = useState(false)
  const [showEndAnchor, setShowEndAnchor] = useState<HTMLSpanElement | null>(null)
  const markerSurfaceRef = useRef<HTMLDivElement>(null)
  const markerPointerRef = useRef<{ markerId: string; pointerId: number; startX: number } | null>(null)
  // A Marker follows the pointer while it is dragged (#667): the handle and
  // stem render at the resolved (quantized/magnetized) time continuously
  // instead of jumping only on release.
  const [markerMovePreview, setMarkerMovePreview] = useState<{ markerId: string; timeMs: number } | null>(null)
  const showEndPointerRef = useRef<{
    pointerId: number
    startX: number
    startDurationMs: number
    surfaceWidthPx: number
  } | null>(null)
  const suppressMarkerHandleClickRef = useRef(false)
  const suppressShowEndClickRef = useRef(false)
  useEffect(() => {
    if (!openMarkerId && !showEndOpen) return
    const closeDetails = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-show-timeline-marker-ui], [data-bounded-number-slider-ui]')) return
      setOpenMarkerId(null)
      setShowEndOpen(false)
    }
    document.addEventListener('pointerdown', closeDetails)
    return () => document.removeEventListener('pointerdown', closeDetails)
  }, [openMarkerId, showEndOpen])
  // A dragged Marker must not magnetize to its own current time — that would
  // make any move shorter than the magnet threshold spring back to where the
  // Marker already is (#667).
  const resolvePointerTime = (event: ReactPointerEvent<HTMLElement>, excludeTimeMs?: number) => {
    const rect = event.currentTarget
      .closest('[data-show-timeline-marker-surface]')
      ?.getBoundingClientRect()
    if (!rect) return 0
    const rawTimeMs = (event.clientX - rect.left) / Math.max(1, rect.width) * durationMs
    if (event.altKey) return Math.round(Math.max(0, Math.min(durationMs, rawTimeMs)))
    return Math.round(snapShowTimelineTime(rawTimeMs, {
      visibleDurationMs: durationMs,
      visibleWidthPx: rect.width,
      structuralTimesMs: snapEnabled
        ? structuralTimesMs.filter((timeMs) => timeMs !== excludeTimeMs)
        : [],
      quantizeStepMs: showTimelineQuantizeStepMs(event.shiftKey, durationMs, rect.width),
      maxTimeMs: durationMs,
    }).timeMs)
  }
  const resolveShowEndDrag = (
    event: ReactPointerEvent<HTMLElement>,
    pointer: NonNullable<typeof showEndPointerRef.current>,
  ) => {
    const rawTimeMs = pointer.startDurationMs
      + (event.clientX - pointer.startX) / Math.max(1, pointer.surfaceWidthPx) * pointer.startDurationMs
    const maxTimeMs = Math.max(pointer.startDurationMs * 16, rawTimeMs, minimumShowEndMs)
    // The Show End must not magnetize to itself: its drag-start time and the
    // live previewed end both re-enter the structural set through the
    // previewed timeline, and either would pin the handle within the magnet
    // threshold of wherever it already is (#667).
    const timeMs = event.altKey
      ? Math.round(Math.max(minimumShowEndMs, rawTimeMs))
      : Math.round(snapShowTimelineTime(rawTimeMs, {
          visibleDurationMs: pointer.startDurationMs,
          visibleWidthPx: pointer.surfaceWidthPx,
          structuralTimesMs: snapEnabled
            ? structuralTimesMs.filter((candidateMs) => (
                candidateMs !== pointer.startDurationMs && candidateMs !== durationMs
              ))
            : [],
          quantizeStepMs: showTimelineQuantizeStepMs(
            event.shiftKey,
            pointer.startDurationMs,
            pointer.surfaceWidthPx,
          ),
          minTimeMs: minimumShowEndMs,
          maxTimeMs,
        }).timeMs)
    return { timeMs, blocked: rawTimeMs < minimumShowEndMs }
  }
  const beginShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    const rect = markerSurfaceRef.current?.getBoundingClientRect()
    showEndPointerRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startDurationMs: durationMs,
      surfaceWidthPx: rect?.width ?? 1,
    }
    setShowEndDragging(true)
    setShowEndDragBlocked(false)
    onPreviewShowEnd(durationMs)
    event.currentTarget.setPointerCapture?.(event.pointerId)
  }
  const previewShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    const pointer = showEndPointerRef.current
    if (!pointer || pointer.pointerId !== event.pointerId) return
    event.stopPropagation()
    const resolved = resolveShowEndDrag(event, pointer)
    setShowEndDragBlocked(resolved.blocked)
    onPreviewShowEnd(resolved.timeMs)
  }
  const finishShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    event.stopPropagation()
    const pointer = showEndPointerRef.current
    showEndPointerRef.current = null
    event.currentTarget.releasePointerCapture?.(event.pointerId)
    if (!pointer || pointer.pointerId !== event.pointerId || Math.abs(event.clientX - pointer.startX) < 3) {
      setShowEndDragging(false)
      setShowEndDragBlocked(false)
      onPreviewShowEnd(null)
      return
    }
    const { timeMs } = resolveShowEndDrag(event, pointer)
    setShowEndDragBlocked(false)
    suppressShowEndClickRef.current = true
    onPreviewShowEnd(timeMs)
    void onSetShowEnd(timeMs).finally(() => {
      setShowEndDragging(false)
      setShowEndDragBlocked(false)
      onPreviewShowEnd(null)
    })
  }
  const cancelShowEndDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (showEndPointerRef.current?.pointerId !== event.pointerId) return
    showEndPointerRef.current = null
    setShowEndDragging(false)
    setShowEndDragBlocked(false)
    onPreviewShowEnd(null)
  }
  const toggleShowEndDetails = (event: ReactMouseEvent<HTMLElement>) => {
    event.stopPropagation()
    if (suppressShowEndClickRef.current) {
      suppressShowEndClickRef.current = false
      return
    }
    setOpenMarkerId(null)
    setShowEndOpen((open) => !open)
  }
  return (
    <div
      ref={markerSurfaceRef}
      aria-label="Timeline Markers and Show End"
      data-show-timeline-marker-surface
      className="pointer-events-none relative z-[35]"
      style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
    >
      {markerFeedback?.kind === 'drag' && (
        <div
          aria-hidden
          data-testid="show-timeline-marker-preview"
          className="pointer-events-none absolute inset-y-0 z-20 w-[5px] -translate-x-1/2 text-amber-200/80"
          style={{ left: `${markerFeedback.timeMs / Math.max(1, durationMs) * 100}%` }}
        >
          <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-current opacity-55" />
          <span className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-t-[5px] border-x-transparent border-t-current" />
        </div>
      )}
      {/* Landing-time readout: a drag is only precise if you can see the
          value you are about to land on (#667). */}
      {(markerFeedback?.kind === 'drag' || markerMovePreview !== null) && (() => {
        const timeMs = markerFeedback?.kind === 'drag' ? markerFeedback.timeMs : markerMovePreview!.timeMs
        const left = timeMs / Math.max(1, durationMs) * 100
        return (
          <div
            aria-hidden
            className="pointer-events-none absolute top-0 z-30 text-amber-200"
            style={{ left: `${left}%` }}
          >
            <span
              data-testid="show-timeline-drag-time"
              className={`absolute top-1 whitespace-nowrap rounded border border-amber-300/25 bg-zinc-950/95 px-1.5 py-0.5 text-[9px] font-medium tabular-nums shadow-lg ${left > 82 ? 'right-2' : 'left-2'}`}
            >
              {formatSecondsValue(timeMs)}s
            </span>
          </div>
        )
      })()}
      {markerFeedback?.kind === 'confirmation' && (() => {
        const left = markerFeedback.timeMs / Math.max(1, durationMs) * 100
        return (
          <div
            role="status"
            aria-label="Marker added at playhead"
            className="pointer-events-none absolute top-0 z-30 text-amber-200"
            style={{ left: `${left}%` }}
          >
            <span className="absolute left-0 top-0 h-3 w-3 -translate-x-1/2 -translate-y-1 rounded-full border border-amber-200/80 bg-amber-300/20 shadow-[0_0_8px_rgba(251,191,36,0.65)]" />
            <span className={`absolute top-1 whitespace-nowrap rounded border border-amber-300/25 bg-zinc-950/95 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-[0.08em] shadow-lg ${left > 82 ? 'right-2' : 'left-2'}`}>
              Marker added
            </span>
          </div>
        )
      })()}
      {markers.filter((marker) => marker.timeMs <= durationMs).map((marker) => {
        const displayTimeMs = markerMovePreview?.markerId === marker.id
          ? markerMovePreview.timeMs
          : marker.timeMs
        const left = displayTimeMs / Math.max(1, durationMs) * 100
        return (
          <div key={marker.id} className="contents">
          <span
            aria-hidden
            data-show-timeline-marker-stem
            className="pointer-events-none absolute inset-y-0 left-1/2 -translate-x-1/2 border-l border-dashed border-current opacity-45"
            style={{ left: `${left}%`, color: marker.color ?? '#f59e0b' }}
          />
          <button
            type="button"
            data-show-timeline-marker-ui
            aria-label={`${marker.name ?? 'Marker'} at ${formatSecondsValue(marker.timeMs)} seconds`}
            title={`${marker.name ?? 'Marker'} · ${formatSecondsValue(marker.timeMs)}s`}
            disabled={readOnly}
            className="pointer-events-auto absolute top-0 h-7 w-[5px] -translate-x-1/2 cursor-ew-resize touch-none disabled:cursor-default"
            style={{ left: `${left}%`, color: marker.color ?? '#f59e0b' }}
            onPointerDown={(event) => {
              event.stopPropagation()
              markerPointerRef.current = { markerId: marker.id, pointerId: event.pointerId, startX: event.clientX }
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerMove={(event) => {
              const pointer = markerPointerRef.current
              if (!pointer || pointer.markerId !== marker.id || pointer.pointerId !== event.pointerId) return
              if (Math.abs(event.clientX - pointer.startX) < 3 && markerMovePreview === null) return
              setMarkerMovePreview({ markerId: marker.id, timeMs: resolvePointerTime(event, marker.timeMs) })
            }}
            onPointerUp={(event) => {
              event.stopPropagation()
              const pointer = markerPointerRef.current
              markerPointerRef.current = null
              setMarkerMovePreview(null)
              if (!pointer || pointer.markerId !== marker.id || pointer.pointerId !== event.pointerId || Math.abs(event.clientX - pointer.startX) < 3) return
              const timeMs = resolvePointerTime(event, marker.timeMs)
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              suppressMarkerHandleClickRef.current = true
              void onMoveMarker(marker.id, timeMs)
            }}
            onPointerCancel={() => {
              markerPointerRef.current = null
              setMarkerMovePreview(null)
            }}
            onClick={(event) => {
              event.stopPropagation()
              if (suppressMarkerHandleClickRef.current) {
                suppressMarkerHandleClickRef.current = false
                return
              }
              setShowEndOpen(false)
              setOpenMarkerId((current) => current === marker.id ? null : marker.id)
            }}
          >
            <span
              data-show-timeline-marker-head
              className="absolute left-1/2 top-0 h-0 w-0 -translate-x-1/2 border-x-[3px] border-t-[5px] border-x-transparent border-t-current"
            />
          </button>
          {openMarkerId === marker.id && (
            <div
              role="dialog"
              data-show-timeline-marker-ui
              aria-label={`${marker.name ?? 'Marker'} details`}
              className="pointer-events-auto absolute top-2 z-50 w-52 rounded border border-amber-300/25 bg-zinc-950 p-2 text-left text-[11px] text-zinc-400 shadow-2xl"
              style={{ left: `${left}%`, transform: left > 72 ? 'translateX(-100%)' : 'translateX(4px)' }}
              onClick={(event) => event.stopPropagation()}
            >
              <div className="mb-2 flex items-center justify-between">
                <strong className="font-medium text-zinc-200">Marker</strong>
                <span className="flex items-center gap-0.5">
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label={`Delete ${marker.name ?? 'Marker'}`}
                    title={`Delete ${marker.name ?? 'Marker'}`}
                    className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300"
                    onClick={() => {
                      setOpenMarkerId(null)
                      void onRemoveMarker(marker.id)
                    }}
                  >
                    <Trash2 size={12} aria-hidden />
                  </Button>
                  <Button
                    size="icon-xs"
                    variant="ghost"
                    aria-label="Close Marker details"
                    title="Close Marker details"
                    className="text-zinc-600 hover:text-zinc-200"
                    onClick={() => setOpenMarkerId(null)}
                  >
                    <X size={12} aria-hidden />
                  </Button>
                </span>
              </div>
              <label className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Name</span>
                <DraftTextField
                  ariaLabel="Marker name"
                  value={marker.name ?? ''}
                  formatApplied={(_, draft) => draft.trim()}
                  onApply={(name) => { void onUpdateMarker(marker.id, { name: name.trim() || undefined }) }}
                  inputClassName="min-w-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-zinc-200"
                />
              </label>
              <div className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Time</span>
                <UiTimeField
                  label="Marker time"
                  ariaLabel="Marker time in seconds"
                  hideLabel
                  compact
                  variant="editor"
                  value={marker.timeMs / 1_000}
                  min={0}
                  max={Number.MAX_SAFE_INTEGER}
                  step={0.001}
                  onChange={(seconds) => void onUpdateMarker(marker.id, { timeMs: Math.round(seconds * 1_000) })}
                />
              </div>
              <label className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Color</span>
                <input
                  type="color"
                  aria-label="Marker color"
                  className="h-6 w-8 rounded border border-zinc-800 bg-transparent"
                  value={marker.color ?? '#f59e0b'}
                  onChange={(event) => void onUpdateMarker(marker.id, { color: event.target.value })}
                />
              </label>
            </div>
          )}
          </div>
        )
      })}
      <span
        ref={setShowEndAnchor}
        aria-hidden
        data-testid="show-timeline-end-anchor"
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-px bg-red-400 opacity-65"
      />
      <TimelineEndHandlePortal
        anchor={showEndAnchor}
        durationMs={durationMs}
        layoutScale={layoutScale}
        dragging={showEndDragging}
        blocked={showEndDragBlocked}
        readOnly={readOnly}
        onPointerDown={beginShowEndDrag}
        onPointerMove={previewShowEndDrag}
        onPointerUp={finishShowEndDrag}
        onPointerCancel={cancelShowEndDrag}
        onLostPointerCapture={cancelShowEndDrag}
        onClick={toggleShowEndDetails}
      />
      {showEndOpen && (
        <div
          role="dialog"
          data-show-timeline-marker-ui
          aria-label="Show End details"
          className="pointer-events-auto absolute right-1 top-2 z-50 w-44 rounded border border-red-400/25 bg-zinc-950 p-2 text-[11px] text-zinc-400 shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-2 flex items-center justify-between">
            <strong className="font-medium text-zinc-200">Show End</strong>
            <button type="button" aria-label="Close Show End details" className="text-zinc-600 hover:text-zinc-200" onClick={() => setShowEndOpen(false)}><X size={12} /></button>
          </div>
          <div className="grid grid-cols-[40px_1fr] items-center gap-1">
            <span className="w-10">Time</span>
            <UiTimeField
              label="Show End time"
              ariaLabel="Show End time in seconds"
              hideLabel
              compact
              variant="editor"
              value={durationMs / 1_000}
              min={0.001}
              max={Number.MAX_SAFE_INTEGER}
              step={0.001}
              onChange={(seconds) => void onSetShowEnd(Math.round(seconds * 1_000))}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function TimelinePlayhead({
  show,
  gridColumn,
  gridRow,
  rowSpan,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
}: {
  show: ShowRecord
  gridColumn: string
  gridRow: number
  rowSpan: number
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
}) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const seekStatus = useShowTransportStore((state) => state.showId === show.id ? state.seekStatus : 'idle')
  const pendingSeekRef = useRef<{ showId: string; targetMs: number } | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const activePointerRef = useRef<number | null>(null)
  const directDragRef = useRef<FineAdjustDrag | null>(null)
  const directFineEngagedRef = useRef(false)
  const left = durationMs > 0 ? Math.min(100, Math.max(0, positionMs / durationMs * 100)) : 0
  const visible = positionMs >= viewport.startMs && positionMs <= viewport.startMs + viewport.durationMs
  const previewPointerPosition = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const track = event.currentTarget.parentElement
    if (!track) return
    const rect = track.getBoundingClientRect()
    // Shift drags the playhead at a tenth of the gain from wherever it is,
    // unsnapped — precision is the point. Once Shift has engaged, the whole
    // remaining gesture stays incremental (coarse deltas at full gain):
    // returning to the absolute pointer mapping would jump the playhead to
    // the pointer's coarse position (#667 review).
    if (event.shiftKey) directFineEngagedRef.current = true
    const drag = directDragRef.current
    if (directFineEngagedRef.current && drag !== null) {
      directDragRef.current = moveFineAdjust(drag, event.clientX, {
        fine: event.shiftKey,
        scale: durationMs / Math.max(1, rect.width),
      })
      applyPreviewPosition(Math.max(0, Math.min(durationMs, directDragRef.current.position)))
      return
    }
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
    const targetMs = fraction * durationMs
    const resolvedTimeMs = snapEnabled !== event.altKey
      ? snapShowTimelineTime(targetMs, {
          visibleDurationMs: viewport.durationMs,
          visibleWidthPx: getVisibleWidth(),
          structuralTimesMs,
          maxTimeMs: durationMs,
        }).timeMs
      : targetMs
    directDragRef.current = beginFineAdjust(event.clientX, resolvedTimeMs)
    applyPreviewPosition(resolvedTimeMs)
  }
  const applyPreviewPosition = (resolvedTimeMs: number) => {
    const preview = usePreviewStore.getState()
    if (!pendingSeekRef.current) resumeAfterSeekRef.current = preview.isRunning
    if (preview.isRunning) preview.toggle()
    useShowTransportStore.getState().setPosition(show.id, resolvedTimeMs)
    pendingSeekRef.current = { showId: show.id, targetMs: resolvedTimeMs }
  }
  const commitPointerPosition = () => {
    const pending = pendingSeekRef.current
    pendingSeekRef.current = null
    activePointerRef.current = null
    directDragRef.current = null
    directFineEngagedRef.current = false
    if (!pending || pending.showId !== show.id) {
      resumeAfterSeekRef.current = false
      return
    }
    useShowTransportStore.getState().requestSeek(show.id, pending.targetMs)
    if (resumeAfterSeekRef.current && !usePreviewStore.getState().isRunning) {
      usePreviewStore.getState().toggle()
    }
    resumeAfterSeekRef.current = false
  }
  return (
    <>
      <div
        aria-hidden
        data-testid="show-timeline-playhead-surface"
        className={`pointer-events-none relative z-30 ${visible ? '' : 'invisible'}`}
        style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
      >
        <span
          data-testid="show-timeline-playhead-hit-target"
          className="pointer-events-auto absolute inset-y-0 w-[5px] -translate-x-1/2 cursor-col-resize touch-none"
          style={{ left: `${left}%` }}
          onPointerDown={(event) => {
            event.stopPropagation()
            activePointerRef.current = event.pointerId
            event.currentTarget.setPointerCapture?.(event.pointerId)
            // Grabbing with Shift already held starts fine mode from the
            // playhead's current time — no jump to the pointer, no snap.
            directFineEngagedRef.current = event.shiftKey
            if (event.shiftKey) {
              directDragRef.current = beginFineAdjust(event.clientX, Math.min(positionMs, durationMs))
              return
            }
            previewPointerPosition(event)
          }}
          onPointerMove={(event) => {
            if (activePointerRef.current !== event.pointerId) return
            previewPointerPosition(event)
          }}
          onPointerUp={(event) => {
            if (activePointerRef.current !== event.pointerId) return
            previewPointerPosition(event)
            event.currentTarget.releasePointerCapture?.(event.pointerId)
            commitPointerPosition()
          }}
          onPointerCancel={commitPointerPosition}
        >
          <span
            data-testid="show-timeline-playhead"
            className={`pointer-events-none absolute inset-y-0 left-1/2 w-px ${seekStatus === 'rebuilding' ? 'bg-amber-300' : 'bg-live'}`}
            style={{
              transform: left <= 0 ? 'translateX(0)' : left >= 100 ? 'translateX(-100%)' : 'translateX(-50%)',
              boxShadow: left <= 0 || left >= 100
                ? 'none'
                : '0 0 8px color-mix(in srgb, var(--color-live) 45%, transparent)',
            }}
          />
        </span>
      </div>
      <div
        data-testid="show-timeline-playhead-cap-surface"
        aria-hidden
        className={`pointer-events-none relative z-[45] ${visible ? '' : 'invisible'}`}
        style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
      >
        <span
          data-testid="show-timeline-playhead-cap"
          className={`pointer-events-none absolute top-0 z-[45] h-0 w-0 -translate-x-1/2 border-x-[4px] border-t-[6px] border-x-transparent ${seekStatus === 'rebuilding' ? 'border-t-amber-300' : 'border-t-live'}`}
          style={{ left: `${left}%` }}
        />
      </div>
    </>
  )
}

function timelinePlayheadCapStyle(positionPercent: number): CSSProperties {
  if (positionPercent <= 0) {
    return {
      left: '0%',
      transform: 'translateX(0)',
      clipPath: 'polygon(0 100%, 0 0, 100% 0)',
    }
  }
  if (positionPercent >= 100) {
    return {
      left: '100%',
      transform: 'translateX(-100%)',
      clipPath: 'polygon(0 0, 100% 0, 100% 100%)',
    }
  }
  return {
    left: `${positionPercent}%`,
    transform: 'translateX(-50%)',
    clipPath: 'polygon(0 0, 100% 0, 50% 100%)',
  }
}

function formatSecondsValue(timeMs: number): string {
  return Number((Math.max(0, timeMs) / 1000).toFixed(3)).toString()
}

// Exported for the Clip detail matrix suite, which qualifies the production
// read-only composition: entity detail children receive readOnly={false} and
// the disabling comes from InspectorPanel's context-controlled fieldset.
export const InspectorReadOnlyContext = createContext(false)
const READ_ONLY_INSPECTOR_CLASS = 'contents [&_input:disabled]:cursor-default [&_input:disabled]:border-zinc-800 [&_input:disabled]:bg-zinc-950/35 [&_input:disabled]:text-zinc-300 [&_input:disabled]:opacity-100 [&_select:disabled]:cursor-default [&_select:disabled]:border-zinc-800 [&_select:disabled]:bg-zinc-950/35 [&_select:disabled]:text-zinc-300 [&_select:disabled]:opacity-100 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-45'

export function InspectorPanel({
  family,
  title,
  heading,
  headingMeta,
  summary,
  icon,
  actions,
  children,
}: {
  family: 'Clip' | 'Group' | 'Transition' | 'Zone' | 'Zone Layout' | 'Show'
  title?: string
  heading?: string
  headingMeta?: string
  summary?: React.ReactNode
  icon: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const readOnly = useContext(InspectorReadOnlyContext)
  const label = `${family} properties`
  const accent = {
    Clip: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300',
    Group: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
    Transition: 'border-violet-400/35 bg-violet-400/10 text-violet-300',
    Zone: 'border-sky-400/35 bg-sky-400/10 text-sky-300',
    'Zone Layout': 'border-sky-400/25 bg-sky-400/[0.07] text-sky-200',
    Show: 'border-zinc-600 bg-zinc-800/80 text-amber-300',
  }[family]
  return (
    <section role="region" aria-label={label} data-entity-family={family.toLowerCase().replace(' ', '-')} className={`${family === 'Clip' ? 'flex min-h-0 flex-1 flex-col' : ''} overflow-hidden bg-transparent`}>
      {/* Two rows when a summary is present: the actions sit beside the title,
          and the summary then spans the full header width. Sharing one row with
          the action column truncated long Effect descriptions (#363). */}
      <header className={`flex shrink-0 flex-col border-b border-zinc-800/90 bg-zinc-950/65 ${summary ? 'min-h-12 gap-1 py-1.5' : 'h-10 justify-center py-1'}`}>
        <div className="flex min-w-0 items-center gap-2 pl-2.5 pr-16">
          <span className={`grid size-6 shrink-0 place-items-center rounded border ${accent}`}>{icon}</span>
          <div className="min-w-0 flex-1">
            {heading ? (
              <div className="flex min-w-0 items-baseline gap-1.5">
                <h3 className="shrink-0 text-[11px] font-semibold text-zinc-200">{heading}</h3>
                {headingMeta && <span className="shrink-0 text-[8px] uppercase tracking-[0.1em] text-zinc-600">{headingMeta}</span>}
                {title && <><span aria-hidden className="text-zinc-700">·</span><p className="truncate text-[9px] text-zinc-500">{title}</p></>}
              </div>
            ) : (
              <>
                <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{label}</h3>
                <p className="truncate text-[9px] text-zinc-600">{title}</p>
              </>
            )}
          </div>
          {actions && (
            <fieldset disabled={readOnly} className="contents">
              <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>
            </fieldset>
          )}
        </div>
        {summary && <div className="min-w-0 px-2.5">{summary}</div>}
      </header>
      <fieldset
        disabled={readOnly}
        data-read-only={readOnly ? 'true' : undefined}
        className={readOnly ? READ_ONLY_INSPECTOR_CLASS : 'contents'}
      >
        <div className={family === 'Clip' ? 'flex min-h-0 flex-1 flex-col p-2.5' : 'p-2.5'}>{children}</div>
      </fieldset>
    </section>
  )
}

function ContextualInspector({
  show,
  compositionShow,
  panelKey,
  selection,
  selectedClip,
  selectedCompositionClipOwner,
  selectedGroupClipOwner,
  transformEnabled,
  stageDimensions,
  patternOptions,
  patternControlsByCellId,
  patternControlsByInstanceId,
  compiledOutputEffects,
  controllerProfiles,
  targetProfile,
  userMaps,
  spatialSelectionUnavailableReason,
  onOpenSpatialSelection,
  onUpdateTargetProfile,
  onUpdatePortableReference,
  onUpdateOutputEffects,
  onPatternCommit,
  onRemoveClip,
  onUpdateAdaptations,
  onUpdateClipInspector,
  onPropertyAnimationChange,
  onUpdateGroupClipInspector,
  onPreviewClipInspector,
  onPreviewGroupClipInspector,
  onPreviewEnd,
  onMakeCompositionPatternIndependent,
  onRejoinCompositionPattern,
  onRemoveCompositionClip,
  onDuplicateGroup,
  onMakeGroupUnique,
  onTranslateGroup,
  onUpdateGroupPlacement,
  onDeleteGroup,
  onUngroup,
  onUpdateControlTarget,
  onUpdateRestartOnEntry,
  onSpanZones,
  onUpdateCellZoneMode,
  onUpdateBoundaryTransition,
  onOpenTransitions,
  onRemoveBoundaryTransition,
  onUpdateZone,
  onRemoveZone,
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
}: {
  show: ShowRecord
  compositionShow: ShowRecord
  panelKey: string
  selection: ShowSelection
  selectedClip: ShowCell | null
  selectedCompositionClipOwner: ShowClipInspectorOwner | null
  selectedGroupClipOwner: ShowGroupClipOwner | null
  transformEnabled: boolean
  stageDimensions: 1 | 2 | 3
  patternOptions: ShowPatternOption[]
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  patternControlsByInstanceId: Record<string, AutomatablePatternControl[]>
  compiledOutputEffects?: import('@/engine/showCompiler').ShowCompileSummary['outputEffects']
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  spatialSelectionUnavailableReason: string | null
  onOpenSpatialSelection: (zoneId: string) => void
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdatePortableReference: (referenceMapId: string | null, referencePixelCount: number) => void
  onUpdateOutputEffects: (outputEffects: ShowOutputEffect[]) => void
  onPatternCommit: () => void
  onRemoveClip: (clip: ShowCell) => void
  onUpdateAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  onUpdateClipInspector: (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onPropertyAnimationChange: (owner: ShowPropertyAnimationStorageOwner, change: ShowPropertyAnimationChange) => boolean | void
  onUpdateGroupClipInspector: (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onPreviewClipInspector: (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => void
  onPreviewGroupClipInspector: (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => void
  onPreviewEnd: () => void
  onMakeCompositionPatternIndependent: (owner: ShowClipInspectorOwner) => void
  onRejoinCompositionPattern: (owner: ShowClipInspectorOwner, targetInstanceId: string) => void
  onRemoveCompositionClip: (owner: ShowClipInspectorOwner) => void
  onDuplicateGroup: (occurrenceId: string) => void
  onMakeGroupUnique: (occurrenceId: string) => void
  onTranslateGroup: (occurrenceId: string, translationX: number, translationY: number) => void
  onUpdateGroupPlacement: (occurrenceId: string, patch: { startMs?: number; baseLayer?: number }) => void
  onDeleteGroup: (occurrenceId: string) => void
  onUngroup: (occurrenceId: string) => void
  onUpdateControlTarget: (cell: ShowCell, exportName: string, value: number | undefined) => void
  onUpdateRestartOnEntry: (cell: ShowCell, restartOnEntry: boolean) => void
  onSpanZones: (cell: ShowCell, zoneSpan: number) => void
  onUpdateCellZoneMode: (cell: ShowCell, zoneMode: NonNullable<ShowCell['zoneMode']>) => void
  onUpdateBoundaryTransition: (
    transitionId: string,
    changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
  ) => void
  onOpenTransitions: (transitionId: string) => void
  onRemoveBoundaryTransition: (transitionId: string) => void
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: (zoneId: string) => void
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
}) {
  const canRemoveClip = showRecordClipCount(show) > 1
  const compositionTimelineClips = compositionShow.composition
    ? projectShowUnifiedTimeline(compositionShow, compositionShow.composition).zones.flatMap((zone) => (
        zone.layers.flatMap((layer) => layer.clips)
      ))
    : []
  const compositionClipSummary = (
    clipId: string,
    patternControls: AutomatablePatternControl[],
  ): ShowClipSummarySection[] => {
    const clip = compositionTimelineClips.find((candidate) => candidate.id === clipId)
    if (!compositionShow.composition || !clip) return []
    if (!show.composition) {
      const compatibilityCell = compatibilityCellForTimelineClip(show, clip)
      if (!compatibilityCell) return []
      const compatibilityControls = patternControlsByCellId[compatibilityCell.id] ?? []
      return projectGlobalShowClipSummary(
        show,
        compatibilityCell.id,
        Object.fromEntries(compatibilityControls.map((control) => [control.exportName, control.label])),
      )
    }
    return projectCompositionShowClipSummary(
      compositionShow.composition,
      clip,
      Object.fromEntries(patternControls.map((control) => [control.exportName, control.label])),
    )
  }
  if (selection.kind === 'group-clip' && selectedGroupClipOwner) {
    const value = projectShowGroupClipInspector(compositionShow, selectedGroupClipOwner)
    if (value) {
      const propertyAnimationContext = projectShowPropertyAnimationEditorContext(
        compositionShow,
        value,
        selectedGroupClipOwner,
      )
      const patternControls = value.instanceId
        ? patternControlsByInstanceId[`${selectedGroupClipOwner.occurrenceId}:${value.instanceId}`] ?? []
        : []
      return (
        <CompositionClipInspector
          key={`group-clip:${selectedGroupClipOwner.occurrenceId}:${selectedGroupClipOwner.placementId}`}
          value={value}
          panelKey={panelKey}
          patternOptions={patternOptions}
          patternControls={patternControls}
          summary={compositionClipSummary(
            `${selectedGroupClipOwner.occurrenceId}:${selectedGroupClipOwner.placementId}`,
            patternControls,
          )}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          instanceOwnership={null}
          propertyAnimationContext={propertyAnimationContext}
          onPropertyAnimationChange={propertyAnimationContext
            ? (change) => onPropertyAnimationChange(propertyAnimationContext.storageOwner, change)
            : undefined}
          onPatch={(patch) => onUpdateGroupClipInspector(selectedGroupClipOwner, patch)}
          onPreviewPatch={(patch) => onPreviewGroupClipInspector(selectedGroupClipOwner, patch)}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
          onMakePatternIndependent={() => {}}
          onRejoinPattern={() => {}}
        />
      )
    }
  }

  if (selection.kind === 'group') {
    const occurrence = show.composition?.groupOccurrences?.find((candidate) => candidate.id === selection.occurrenceId)
    const definition = show.composition?.groupDefinitions?.find((candidate) => candidate.id === occurrence?.definitionId)
    if (occurrence && definition) {
      const linkedOccurrenceCount = show.composition?.groupOccurrences
        ?.filter((candidate) => candidate.definitionId === definition.id).length ?? 1
      return (
        <GroupInspector
          definition={definition}
          occurrence={occurrence}
          linkedOccurrenceCount={linkedOccurrenceCount}
          onDuplicate={() => onDuplicateGroup(occurrence.id)}
          onMakeUnique={() => onMakeGroupUnique(occurrence.id)}
          onTranslate={(translationX, translationY) => onTranslateGroup(occurrence.id, translationX, translationY)}
          onPlace={(patch) => onUpdateGroupPlacement(occurrence.id, patch)}
          onDelete={() => onDeleteGroup(occurrence.id)}
          onUngroup={() => onUngroup(occurrence.id)}
        />
      )
    }
  }

  if (selection.kind === 'clip' && selectedCompositionClipOwner) {
    const value = projectShowClipInspector(compositionShow, selectedCompositionClipOwner)
    const timelineOwner = showTimelineOwnerForInspector(selectedCompositionClipOwner)
    const instanceOwnership = compositionShow.composition && timelineOwner
      ? projectShowClipPatternInstanceOwnership(compositionShow.composition, timelineOwner)
      : null
    if (value && selectedCompositionClipOwner.kind !== 'global') {
      const propertyAnimationContext = projectShowPropertyAnimationEditorContext(compositionShow, value)
      const patternControls = value.instanceId ? patternControlsByInstanceId[value.instanceId] ?? [] : []
      return (
        <CompositionClipInspector
          key={`clip:${selection.clipId}`}
          value={value}
          panelKey={panelKey}
          patternOptions={patternOptions}
          patternControls={patternControls}
          summary={compositionClipSummary(selection.clipId, patternControls)}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          instanceOwnership={instanceOwnership}
          propertyAnimationContext={propertyAnimationContext}
          onPatch={(patch) => onUpdateClipInspector(selectedCompositionClipOwner, patch)}
          onPropertyAnimationChange={propertyAnimationContext
            ? (change) => onPropertyAnimationChange(propertyAnimationContext.storageOwner, change)
            : undefined}
          onPreviewPatch={(patch) => onPreviewClipInspector(selectedCompositionClipOwner, patch)}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
          onMakePatternIndependent={() => onMakeCompositionPatternIndependent(selectedCompositionClipOwner)}
          onRejoinPattern={(targetInstanceId) => onRejoinCompositionPattern(selectedCompositionClipOwner, targetInstanceId)}
          canRemove={canRemoveClip}
          onRemove={() => onRemoveCompositionClip(selectedCompositionClipOwner)}
        />
      )
    }
  }

  if (selection.kind === 'clip' && selectedClip) {
    return (
      <ClipInspector
        panelKey={panelKey}
        key={selectedClip.id}
        show={show}
        clip={selectedClip}
        patternOptions={patternOptions}
        patternControls={patternControlsByCellId[selectedClip.id] ?? []}
        transformEnabled={transformEnabled}
        stageDimensions={stageDimensions}
        canRemove={canRemoveClip}
        onUpdateClip={(patch) => onUpdateClipInspector({ kind: 'global', cellId: selectedClip.id }, patch)}
        onPreviewClip={(patch) => onPreviewClipInspector({ kind: 'global', cellId: selectedClip.id }, patch)}
        onPreviewEnd={onPreviewEnd}
        onPatternCommit={onPatternCommit}
        onRemove={() => onRemoveClip(selectedClip)}
        onUpdateAdaptations={(changes) => onUpdateAdaptations(selectedClip, changes)}
        onUpdateRestartOnEntry={(restartOnEntry) => onUpdateRestartOnEntry(selectedClip, restartOnEntry)}
        onSpanZones={(zoneSpan) => onSpanZones(selectedClip, zoneSpan)}
        onUpdateZoneMode={(zoneMode) => onUpdateCellZoneMode(selectedClip, zoneMode)}
      />
    )
  }

  if (selection.kind === 'transition') {
    return (
      <TransitionInspector
        show={show}
        transitionId={selection.transitionId}
        onUpdate={onUpdateBoundaryTransition}
        onOpenPalette={() => onOpenTransitions(selection.transitionId)}
        onRemove={onRemoveBoundaryTransition}
        onUpdateCellAdaptations={onUpdateAdaptations}
        patternControlsByCellId={patternControlsByCellId}
        onUpdateControlTarget={onUpdateControlTarget}
      />
    )
  }

  if (selection.kind === 'zone') {
    const zone = show.zones.find((candidate) => candidate.id === selection.zoneId)
    if (zone) {
      return (
        <ZoneInspector
          show={show}
          zone={zone}
          targetName={targetProfile?.name}
          targetZones={targetProfile?.zones ?? []}
          spatialSelectionUnavailableReason={spatialSelectionUnavailableReason}
          onOpenSpatialSelection={() => onOpenSpatialSelection(zone.id)}
          onUpdateZone={(changes) => onUpdateZone(zone.id, changes)}
          onRemoveZone={() => onRemoveZone(zone.id)}
        />
      )
    }
  }

  if (selection.kind === 'zone-layout') {
    const layout = show.routingLayouts.find((candidate) => candidate.id === selection.layoutId)
    if (layout) {
      return (
        <ZoneLayoutInspector
          show={show}
          layout={layout}
          intervals={projectShowLayoutIntervals(show)}
          onAddRoutingLayout={onAddRoutingLayout}
          onUpdateRoutingLayout={onUpdateRoutingLayout}
          onRemoveRoutingLayout={onRemoveRoutingLayout}
        />
      )
    }
  }

  return (
    <ShowSetupInspector
      show={show}
      controllerProfiles={controllerProfiles}
      targetProfile={targetProfile}
      userMaps={userMaps}
      onUpdateTargetProfile={onUpdateTargetProfile}
      onUpdatePortableReference={onUpdatePortableReference}
      onUpdateOutputEffects={onUpdateOutputEffects}
      compiledOutputEffects={compiledOutputEffects}
    />
  )
}

function showTimelineOwnerForInspector(owner: ShowClipInspectorOwner): ShowTimelineClipOwner | null {
  if (owner.kind === 'scene-main') {
    return {
      kind: 'main',
      sceneId: owner.sceneId,
      zoneId: owner.zoneId,
      placementId: owner.placementId,
    }
  }
  if (owner.kind === 'scene-overlay') {
    return {
      kind: 'overlay',
      sceneId: owner.sceneId,
      zoneId: owner.zoneId,
      layerId: owner.layerId,
      placementId: owner.placementId,
    }
  }
  return null
}

function availableClipSummaryDestination(
  section: ShowClipSummarySection,
  item: ShowClipSummaryItem,
  {
    transformEnabled,
    patternControls,
    stutterAvailable,
    opacityAvailable,
  }: {
    transformEnabled: boolean
    patternControls: AutomatablePatternControl[]
    stutterAvailable: boolean
    opacityAvailable: boolean
  },
): ShowClipSummaryDestination | null {
  const destination = showClipSummaryDestination(section.kind, item.id)
  if (!destination) return null
  if (destination.location === 'place' && !transformEnabled) return null
  if (destination.targetKey === 'opacity' && !opacityAvailable) return null
  if (destination.targetKey === 'stutter' && !stutterAvailable) return null
  if (destination.targetKey.startsWith('control:')) {
    const exportName = destination.targetKey.slice('control:'.length)
    if (!patternControls.some((control) => control.exportName === exportName)) return null
  }
  return destination
}

function GroupInspector({
  definition,
  occurrence,
  linkedOccurrenceCount,
  onDuplicate,
  onMakeUnique,
  onTranslate,
  onPlace,
  onDelete,
  onUngroup,
}: {
  definition: ShowGroupDefinition
  occurrence: ShowGroupOccurrence
  linkedOccurrenceCount: number
  onDuplicate: () => void
  onMakeUnique: () => void
  onTranslate: (translationX: number, translationY: number) => void
  onPlace: (patch: { startMs?: number; baseLayer?: number }) => void
  onDelete: () => void
  onUngroup: () => void
}) {
  return (
    <InspectorPanel
      family="Group"
      heading={definition.name}
      headingMeta={linkedOccurrenceCount > 1 ? `${linkedOccurrenceCount} linked occurrences` : 'One occurrence'}
      title={`${definition.placements.length} Clips across ${new Set(definition.placements.map((placement) => placement.layerOffset)).size} Layers`}
      icon={<Layers3 size={13} aria-hidden />}
      actions={(
        <Button size="icon-xs" variant="ghost" aria-label={`Delete Group ${definition.name}`} className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={onDelete}>
          <Trash2 size={12} aria-hidden />
        </Button>
      )}
    >
      <div className="grid gap-2 sm:grid-cols-4">
        <TimeField
          label="Start seconds"
          value={occurrence.startMs / 1_000}
          min={0}
          max={Number.MAX_SAFE_INTEGER}
          step={0.001}
          onChange={(startSeconds) => onPlace({ startMs: Math.round(startSeconds * 1_000) })}
        />
        <NumberField
          label="Base Layer"
          value={occurrence.baseLayer}
          min={0}
          step={1}
          onChange={(baseLayer) => onPlace({ baseLayer: Math.round(baseLayer) })}
        />
        <NumberField
          label="X offset"
          value={occurrence.translationX}
          step={0.01}
          onChange={(translationX) => onTranslate(translationX, occurrence.translationY)}
        />
        <NumberField
          label="Y offset"
          value={occurrence.translationY}
          step={0.01}
          onChange={(translationY) => onTranslate(occurrence.translationX, translationY)}
        />
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-zinc-800/80 pt-2">
        <Button size="xs" variant="ghost" aria-label="Duplicate Group occurrence" onClick={onDuplicate}>
          <Copy size={12} aria-hidden /> Duplicate
        </Button>
        <Button size="xs" variant="ghost" aria-label="Make Group unique" disabled={linkedOccurrenceCount < 2} onClick={onMakeUnique}>
          <WandSparkles size={12} aria-hidden /> Make Unique
        </Button>
        <Button size="xs" variant="ghost" aria-label="Ungroup occurrence" onClick={onUngroup}>
          <Layers3 size={12} aria-hidden /> Ungroup
        </Button>
      </div>
    </InspectorPanel>
  )
}

function CompositionClipInspector({
  value,
  panelKey,
  patternOptions,
  patternControls,
  summary,
  transformEnabled,
  stageDimensions,
  instanceOwnership,
  onPatch,
  propertyAnimationContext,
  onPropertyAnimationChange,
  onPreviewPatch,
  onPreviewEnd,
  onPatternCommit,
  onMakePatternIndependent,
  onRejoinPattern,
  canRemove = true,
  onRemove,
}: {
  value: NonNullable<ReturnType<typeof projectShowClipInspector>>
  panelKey: string
  patternOptions: ShowPatternOption[]
  patternControls: AutomatablePatternControl[]
  summary: ShowClipSummarySection[]
  transformEnabled: boolean
  stageDimensions: 1 | 2 | 3
  instanceOwnership: ReturnType<typeof projectShowClipPatternInstanceOwnership>
  onPatch: (patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  propertyAnimationContext?: ShowPropertyAnimationEditorContext | null
  onPropertyAnimationChange?: (change: ShowPropertyAnimationChange) => boolean | void
  onPreviewPatch?: (patch: ShowClipInspectorPatch) => void
  onPreviewEnd?: () => void
  onPatternCommit: () => void
  onMakePatternIndependent: () => void
  onRejoinPattern: (targetInstanceId: string) => void
  canRemove?: boolean
  onRemove?: () => void
}) {
  const [animationOverviewOpen, setAnimationOverviewOpen] = useState(false)
  const animationSummaryRef = useRef<HTMLButtonElement>(null)
  const clipDetailRef = useRef<ShowClipEntityDetailHandle>(null)
  const animationCount = propertyAnimationContext?.tracks.length ?? 0
  const closeAnimationOverview = (restoreSummaryFocus: boolean) => {
    setAnimationOverviewOpen(false)
    if (restoreSummaryFocus) {
      window.setTimeout(() => animationSummaryRef.current?.focus(), 0)
    }
  }
  const inspector = (
    <InspectorPanel
      family="Clip"
      heading={value.patternName}
      summary={(
        <ClipConfigurationSummary
          summary={summary}
          animationCount={animationCount}
          animationButtonRef={animationSummaryRef}
          onAnimationsClick={() => setAnimationOverviewOpen(true)}
          destinationForItem={(section, item) => availableClipSummaryDestination(section, item, {
            transformEnabled,
            patternControls,
            stutterAvailable: instanceOwnership !== null,
            opacityAvailable: value.local?.opacity !== undefined,
          })}
          onNavigate={(destination) => clipDetailRef.current?.navigateToSummaryDestination(destination)}
        />
      )}
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={onRemove ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete clip ${value.patternName}`}
          title={canRemove ? `Delete ${value.patternName}` : 'A Show must contain at least one Clip.'}
          disabled={!canRemove}
          className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300"
          onClick={onRemove}
        >
          <Trash2 size={12} aria-hidden />
        </Button>
      ) : undefined}
    >
      <ShowClipEntityDetail
        ref={clipDetailRef}
        value={value}
        title={value.patternName}
        readOnly={false}
        patternOptions={patternOptions.map((option) => ({
          value: `${option.ref.kind}:${option.ref.id}`,
          label: option.label,
          group: option.group,
        }))}
        patternControls={patternControls}
        transformEnabled={transformEnabled}
        stageDimensions={stageDimensions}
        panelKey={panelKey}
        structuralControls={instanceOwnership ? (
          <ShowPatternInstanceControls
            ownership={instanceOwnership}
            steppedClock={value.simulation.steppedClock}
            onMakeIndependent={onMakePatternIndependent}
            onRejoin={onRejoinPattern}
            onSteppedClockChange={(steppedClock) => onPatch({ simulation: { steppedClock } })}
          />
        ) : undefined}
        embedded
        onPatch={onPatch}
        onPreviewPatch={onPreviewPatch}
        onPreviewEnd={onPreviewEnd}
        onPatternCommit={onPatternCommit}
        animationOverviewOpen={animationOverviewOpen}
        onAnimationOverviewClose={closeAnimationOverview}
      />
    </InspectorPanel>
  )
  if (!onPropertyAnimationChange || !propertyAnimationContext) return inspector
  const changePropertyAnimation = (change: ShowPropertyAnimationChange) => {
    const accepted = onPropertyAnimationChange(change)
    if (accepted !== false && change.kind === 'delete-track' && animationCount === 1) {
      setAnimationOverviewOpen(false)
    }
    return accepted
  }
  return (
    <ShowPropertyAnimationProvider
      options={buildShowPropertyAnimationOptions(value)}
      tracks={propertyAnimationContext.tracks}
      trackIssues={propertyAnimationContext.trackIssues}
      storageDurationMs={propertyAnimationContext.storageDurationMs}
      showTimeOffsetMs={propertyAnimationContext.showTimeOffsetMs}
      instanceUseCount={propertyAnimationContext.instanceUseCount}
      onOpenOverview={() => setAnimationOverviewOpen(true)}
      onChange={changePropertyAnimation}
    >
      {inspector}
    </ShowPropertyAnimationProvider>
  )
}

function ClipInspector({
  show,
  panelKey,
  clip,
  patternOptions,
  patternControls,
  transformEnabled,
  stageDimensions,
  canRemove,
  onUpdateClip,
  onPreviewClip,
  onPreviewEnd,
  onPatternCommit,
  onRemove,
  onUpdateAdaptations,
  onUpdateRestartOnEntry,
  onSpanZones,
  onUpdateZoneMode,
}: {
  show: ShowRecord
  panelKey: string
  clip: ShowCell
  patternOptions: ShowPatternOption[]
  patternControls: AutomatablePatternControl[]
  transformEnabled: boolean
  stageDimensions: 1 | 2 | 3
  canRemove: boolean
  onUpdateClip: (patch: ShowClipInspectorPatch) => boolean | void | Promise<void>
  onPreviewClip?: (patch: ShowClipInspectorPatch) => void
  onPreviewEnd?: () => void
  onPatternCommit: () => void
  onRemove: () => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
  onUpdateRestartOnEntry: (restartOnEntry: boolean) => void
  onSpanZones: (zoneSpan: number) => void
  onUpdateZoneMode: (zoneMode: NonNullable<ShowCell['zoneMode']>) => void
}) {
  const cell = clip
  const clipDetailRef = useRef<ShowClipEntityDetailHandle>(null)
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
  const zoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
  const maxZoneSpan = Math.max(1, show.zones.length - zoneIndex)
  const lightShutter = cell.adaptations.lightShutter
  const hasAdvancedOverrides = cell.adaptations.mirror
    || cell.sceneSpan > 1
    || (cell.zoneSpan ?? 1) > 1
    || cell.zoneMode === 'repeat'
    || cell.adaptations.phase !== 0
    || Boolean(cell.restartOnEntry)
    || cell.adaptations.steppedClock !== undefined
    || (cell.adaptations.timeOffsetMs ?? 0) !== 0
    || lightShutter !== undefined
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(hasAdvancedOverrides)
  const inspectorValue = projectShowClipInspector(show, { kind: 'global', cellId: cell.id })
  const summary = projectGlobalShowClipSummary(
    show,
    cell.id,
    Object.fromEntries(patternControls.map((control) => [control.exportName, control.label])),
  )
  const updateLightShutter = (changes: Partial<NonNullable<ShowCell['adaptations']['lightShutter']>>) => {
    if (!lightShutter) return
    onUpdateAdaptations({ lightShutter: { ...lightShutter, ...changes } })
  }
  return (
    <InspectorPanel
      family="Clip"
      heading={cell.patternName}
      summary={(
        <ClipConfigurationSummary
          summary={summary}
          destinationForItem={(section, item) => availableClipSummaryDestination(section, item, {
            transformEnabled,
            patternControls,
            stutterAvailable: false,
            opacityAvailable: false,
          })}
          onNavigate={(destination) => clipDetailRef.current?.navigateToSummaryDestination(destination)}
        />
      )}
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={(
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete clip ${cell.patternName}`}
          title={canRemove ? `Delete ${cell.patternName}` : 'A Show must contain at least one Clip.'}
          disabled={!canRemove}
          className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300"
          onClick={onRemove}
        >
          <Trash2 size={12} aria-hidden />
        </Button>
      )}
    >
      {inspectorValue && (
        <ShowClipEntityDetail
          ref={clipDetailRef}
          value={inspectorValue}
          title={cell.patternName}
          readOnly={false}
          patternOptions={patternOptions.map((option) => ({
            value: `${option.ref.kind}:${option.ref.id}`,
            label: option.label,
            group: option.group,
          }))}
          patternControls={patternControls}
          transformEnabled={transformEnabled}
          stageDimensions={stageDimensions}
          panelKey={panelKey}
          embedded
          onPatch={onUpdateClip}
          onPreviewPatch={onPreviewClip}
          onPreviewEnd={onPreviewEnd}
          onPatternCommit={onPatternCommit}
        >
          <div data-testid="global-clip-control-tray" className="mt-2">
        <details
          className="min-w-0 border-t border-zinc-800/80"
          aria-label="Global placement and clock controls"
          open={advancedControlsOpen}
          onToggle={(event) => setAdvancedControlsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer py-1 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Global placement and clock controls</summary>
          <div className="border-t border-zinc-800/70 py-1 text-[9px]">
            <div className="grid max-w-[30rem] grid-cols-2 items-end gap-1.5 sm:grid-cols-3">
            {(cell.zoneSpan ?? 1) > 1 && (
              <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                Zone domain
                <select
                  aria-label="Zone domain"
                  value={cell.zoneMode === 'repeat' ? 'repeat' : 'span'}
                  onChange={(event) => onUpdateZoneMode(event.target.value === 'repeat' ? 'repeat' : 'span')}
                  className={`${compactField} mt-1 w-full`}
                >
                  <option value="span">one canvas</option>
                  <option value="repeat">repeat per zone</option>
                </select>
              </label>
            )}
            <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
              Span zones
              <select
                aria-label="Span zones"
                value={cell.zoneSpan ?? 1}
                onChange={(event) => onSpanZones(Number(event.target.value))}
                className={`${compactField} mt-1 w-full`}
              >
                {Array.from({ length: maxZoneSpan }, (_, index) => index + 1).map((span) => (
                  <option key={span} value={span}>{span}</option>
                ))}
              </select>
            </label>
            </div>
            {sceneIndex > 0 && (
              <section className="mt-1 max-w-2xl border-t border-zinc-800/65 py-1">
                <label className="flex shrink-0 items-center gap-2 text-zinc-200">
                <input
                  type="checkbox"
                  aria-label="Restart Pattern on entry"
                  checked={Boolean(cell.restartOnEntry)}
                  onChange={(event) => onUpdateRestartOnEntry(event.target.checked)}
                />
                Restart Pattern on entry
                </label>
              </section>
            )}
            <MotionCadenceControl
              stepMs={cell.adaptations.steppedClock?.stepMs}
              timeOffsetMs={cell.adaptations.timeOffsetMs ?? 0}
              onChange={(stepMs) => onUpdateAdaptations({
                steppedClock: stepMs === null ? undefined : { stepMs },
              })}
              onOffsetChange={(timeOffsetMs) => onUpdateAdaptations({ timeOffsetMs })}
            />
            <div className="mt-1 max-w-2xl border-t border-zinc-800/65 pt-1">
              <label className="flex items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={Boolean(lightShutter)}
                onChange={(event) => onUpdateAdaptations({
                  lightShutter: event.target.checked
                    ? { rateHz: 8, duty: 0.5, phase: 0, clockBehavior: 'continue' }
                    : undefined,
                })}
              />
              Light shutter
              </label>
              {lightShutter && (
                <>
                  <div className="mt-1.5 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  <NumberField compact label="Shutter rate (Hz)" value={lightShutter.rateHz} min={0.01} max={60} step={0.1} onChange={(rateHz) => updateLightShutter({ rateHz })} />
                  <PercentageField compact label="Light on fraction" value={lightShutter.duty} min={0} max={1} step={0.01} onChange={(duty) => updateLightShutter({ duty })} />
                  <NumberField compact label="Shutter phase" value={lightShutter.phase} min={0} max={1} step={0.01} onChange={(phase) => updateLightShutter({ phase })} />
                  <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                    Clock while dark
                    <select
                      aria-label="Clock while dark"
                      value={lightShutter.clockBehavior}
                      onChange={(event) => updateLightShutter({ clockBehavior: event.target.value === 'freeze' ? 'freeze' : 'continue' })}
                      className={`${compactField} mt-1 w-full`}
                    >
                      <option value="continue">continue</option>
                      <option value="freeze">freeze</option>
                    </select>
                  </label>
                  </div>
                  <p className="mt-1.5 text-[9px] leading-4 text-zinc-500">
                    Closed frames emit black and skip Pattern rendering. Continue advances motion; freeze pauses Pattern time.
                  </p>
                </>
              )}
            </div>
          </div>
        </details>
          </div>
        </ShowClipEntityDetail>
      )}
    </InspectorPanel>
  )
}

function MotionCadenceControl({
  stepMs,
  timeOffsetMs,
  onChange,
  onOffsetChange,
}: {
  stepMs: number | undefined
  timeOffsetMs: number
  onChange: (stepMs: number | null) => void
  onOffsetChange: (timeOffsetMs: number) => void
}) {
  const stepped = stepMs !== undefined
  const rateHz = steppedClockRateHz(stepMs ?? 125)
  return (
    <section className="mt-1 max-w-2xl border-t border-zinc-800/65 pt-1">
      <div
        role="group"
        aria-label="Motion cadence controls"
        className="grid items-center gap-x-1.5 gap-y-0.5 sm:grid-cols-[minmax(8rem,10rem)_auto_7rem] sm:grid-rows-[auto_1.5rem]"
      >
        <div className="text-[9px] uppercase tracking-[0.12em] text-violet-300/85 sm:col-start-1 sm:row-start-1">
          Motion cadence
        </div>
        <div className="text-[9px] uppercase tracking-[0.12em] text-zinc-600 sm:col-start-3 sm:row-start-1">
          Start offset (s)
        </div>
        <div
          className="min-w-0 truncate text-[8px] text-zinc-600 sm:col-start-1 sm:row-start-2"
          title="Shift this clip's private Pattern clock for rounds across zones."
        >
          <span aria-hidden>Private Pattern clock</span>
          <span className="sr-only">Shift this clip&apos;s private Pattern clock for rounds across zones.</span>
        </div>
        <div className="flex h-6 rounded border border-zinc-700 bg-zinc-950 p-0.5 text-[9px] sm:col-start-2 sm:row-start-2">
          <button
            type="button"
            aria-label="Smooth motion"
            aria-pressed={!stepped}
            className={stepped ? 'rounded px-1.5 text-zinc-500 hover:text-zinc-300' : 'rounded bg-zinc-700 px-1.5 text-zinc-100'}
            onClick={() => onChange(null)}
          >
            smooth
          </button>
          <button
            type="button"
            aria-label="Stepped motion"
            aria-pressed={stepped}
            className={stepped ? 'rounded bg-violet-400/20 px-1.5 text-violet-200' : 'rounded px-1.5 text-zinc-500 hover:text-zinc-300'}
            onClick={() => onChange(stepMs ?? 125)}
          >
            stepped
          </button>
        </div>
        <div className="sm:col-start-3 sm:row-start-2">
          <TimeField
            compact
            hideLabel
            label="Start offset (s)"
            value={timeOffsetMs / 1_000}
            min={0}
            max={60}
            step={0.1}
            onChange={(seconds) => onOffsetChange(Math.round(seconds * 1_000))}
          />
        </div>
      </div>
      {stepped && (
        <>
          <div className="mt-1.5 grid grid-cols-[minmax(7rem,10rem)_1fr] items-end gap-3 border-t border-zinc-800/55 pt-1.5">
            <BoundedNumberField
              compact
              label="Jumps per second"
              value={rateHz}
              presentation={JUMPS_PER_SECOND_PRESENTATION}
              variant="editor"
              onChange={(next) => onChange(steppedClockStepMs(next))}
            />
            <div className="pb-0.5 text-[8px] tabular-nums text-zinc-600">
              every {Math.round(stepMs)} ms
            </div>
          </div>
          <p className="mt-1 text-[8px] text-zinc-600">
            Motion freezes and jumps; unlike Light shutter, pixels do not blink off and the renderer keeps running.
          </p>
        </>
      )}
    </section>
  )
}

function TransitionInspector({
  show,
  transitionId,
  onUpdate,
  onOpenPalette,
  onRemove,
  onUpdateCellAdaptations,
  patternControlsByCellId,
  onUpdateControlTarget,
}: {
  show: ShowRecord
  transitionId: string
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
  onOpenPalette: () => void
  onRemove: (transitionId: string) => void
  onUpdateCellAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  onUpdateControlTarget: (cell: ShowCell, exportName: string, value: number | undefined) => void
}) {
  const transition = show.transitions?.find((candidate) => candidate.id === transitionId)
  if (!transition) return null
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === transition.afterSceneId)
  const scene = show.scenes[sceneIndex] ?? show.scenes[0]
  const nextScene = show.scenes[sceneIndex + 1]
  const boundaryIdentity = showBoundaryClipIdentity(show, transition.afterSceneId)
  if (transition.kind === 'routing') {
    return (
      <InspectorPanel
        family="Transition"
        title={`${boundaryIdentity} · routing`}
        icon={<Route size={13} aria-hidden />}
        actions={(
          <Button size="icon-xs" variant="ghost" aria-label="Remove routing marker" title="Remove routing marker" className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={() => onRemove(transition.id)}>
            <Trash2 size={12} aria-hidden />
          </Button>
        )}
      >
        <div className="grid max-w-xl grid-cols-2 gap-3">
          <label className="text-[10px] uppercase text-zinc-600">
            Destination routing layout
            <select
              aria-label="Destination routing layout"
              value={transition.layoutId ?? ''}
              onChange={(event) => onUpdate(transition.id, { layoutId: event.target.value || undefined })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              {show.routingLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name}</option>
              ))}
            </select>
          </label>
          <TimeField
            label="Routing transfer duration seconds"
            value={transition.durationMs / 1000}
            min={0}
            max={Math.max(0, (nextScene?.durationMs ?? 0) / 1000)}
            step={0.1}
            onChange={(seconds) => onUpdate(transition.id, {
              durationMs: seconds * 1000,
              ...(seconds > 0 && !transition.routingDirection ? { routingDirection: 'forward' } : {}),
            })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Routing transfer easing
            <select
              aria-label="Routing transfer easing"
              value={showEasingOptionId(transition.easing)}
              disabled={transition.durationMs === 0}
              onChange={(event) => onUpdate(transition.id, {
                easing: showEasingFromOptionId(event.target.value),
              })}
              className={`${transitionRuleUnderField} mt-1 w-full disabled:opacity-40`}
            >
              <ShowEasingOptions />
            </select>
          </label>
          <label className="text-[10px] uppercase text-zinc-600">
            Routing transfer direction
            <select
              aria-label="Routing transfer direction"
              value={transition.routingDirection ?? 'forward'}
              disabled={transition.durationMs === 0}
              onChange={(event) => onUpdate(transition.id, {
                routingDirection: event.target.value === 'reverse' ? 'reverse' : 'forward',
              })}
              className={`${transitionRuleUnderField} mt-1 w-full disabled:opacity-40`}
            >
              <option value="forward">forward</option>
              <option value="reverse">reverse</option>
            </select>
          </label>
          <p className="col-span-2 text-[10px] leading-4 text-zinc-500">
            {transition.durationMs === 0
              ? 'Cut: the destination layout takes effect at this boundary.'
              : 'Directional transfer: a stable spatial threshold moves pixel ownership to the destination layout.'}
            {' '}Each pixel invokes one Pattern renderer, and all Pattern clocks continue.
          </p>
          <output aria-label="Routing transfer cost" className="col-span-2 text-[10px] text-zinc-500">
            Cost tier: {transition.durationMs > 0 ? 'cheap' : 'free'} · one renderer per physical pixel
          </output>
        </div>
      </InspectorPanel>
    )
  }
  const cost = transitionCost(transition.kind)
  const transitionItem = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    .find((item) => item.key === showBoundaryTransitionPresentationKey(transition))
  const destinationCells = nextScene
    ? show.zones.flatMap((zone) => {
        const cell = cellCoveringScene(show, zone.id, sceneIndex + 1)
        return cell ? [{ zone, cell }] : []
      }).filter((entry, index, entries) => entries.findIndex((candidate) => candidate.cell.id === entry.cell.id) === index)
    : []
  const boundaryControls = destinationCells.flatMap(({ zone, cell }) => {
    const outgoing = cellCoveringScene(show, zone.id, sceneIndex)
    if (!outgoing || outgoing.pattern.kind !== cell.pattern.kind || outgoing.pattern.id !== cell.pattern.id) return []
    const outgoingNames = new Set((patternControlsByCellId[outgoing.id] ?? []).map((control) => control.exportName))
    return (patternControlsByCellId[cell.id] ?? []).filter((control) => (
      outgoingNames.has(control.exportName)
      && (
        outgoing.controlTargets?.[control.exportName] !== undefined
        || cell.controlTargets?.[control.exportName] !== undefined
        || transition.propertyTransitions?.controls?.[control.exportName] !== undefined
      )
    ))
  }).filter((control, index, controls) => controls.findIndex((candidate) => candidate.exportName === control.exportName) === index)
  return (
    <InspectorPanel
      family="Transition"
      title={`${boundaryIdentity} · ${transition.kind}`}
      icon={<Zap size={13} aria-hidden />}
      actions={transition.kind !== 'cut' ? (
        <Button size="icon-xs" variant="ghost" aria-label="Reset transition to cut" title="Reset to cut" className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={() => onRemove(transition.id)}>
          <Trash2 size={12} aria-hidden />
        </Button>
      ) : null}
    >
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Boundary
          <div className="mt-1 text-zinc-300">{boundaryIdentity}</div>
        </label>
        <button type="button" onClick={onOpenPalette} className="flex h-7 items-center gap-1.5 rounded border border-amber-400/25 bg-amber-400/[0.04] px-2 text-[9px] text-amber-200 hover:border-amber-400/55 hover:bg-amber-400/[0.08]">
          <Zap size={11} aria-hidden /> {transitionItem?.label ?? transition.kind} · Change
        </button>
      </div>
      {transitionItem && transition.kind !== 'cut' && (
        <ShowTransitionParameters
          transition={transition}
          item={transitionItem}
          onPreview={(parameterId, value) => {
            const changes = showBoundaryTransitionParameterChanges(transition, transitionItem, parameterId, value)
            if (changes) {
              useShowPreviewOverrideStore.getState().preview(
                updateShowBoundaryTransition(show, transition.id, changes),
              )
            }
          }}
          onPreviewEnd={() => useShowPreviewOverrideStore.getState().clear(show.id)}
          onChange={(parameterId, value) => {
            const changes = showBoundaryTransitionParameterChanges(transition, transitionItem, parameterId, value)
            if (changes) onUpdate(transition.id, changes)
          }}
        />
      )}
      {transition.kind === 'crossfade' && (
        <div data-crossfade-source className="mt-2 border-t border-zinc-800/80 bg-transparent py-2">
          <label className="text-[10px] uppercase text-zinc-600">
            Crossfade source
            <select
              aria-label="Crossfade source"
              value={transition.crossfadePolicy === 'snapshot-live' ? 'snapshot-live' : 'live-live'}
              onChange={(event) => onUpdate(transition.id, {
                crossfadePolicy: event.target.value === 'live-live' ? 'live-live' : 'snapshot-live',
              })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <option value="snapshot-live">Snapshot outgoing (recommended)</option>
              <option value="live-live">Keep both Patterns live</option>
            </select>
          </label>
          <p className="mt-1.5 text-[9px] leading-4 text-zinc-500">
            {transition.crossfadePolicy === 'snapshot-live'
              ? 'Freezes the fully composited outgoing Stage at the boundary; incoming motion stays live.'
              : 'Keeps outgoing and incoming visuals live for the whole blend.'}
          </p>
          <output aria-label="Crossfade evaluation cost" className="mt-1 block text-[9px] text-zinc-500">
            {transition.crossfadePolicy === 'snapshot-live'
              ? 'Capture frame: two Pattern render paths · then one live Pattern renderer per pixel after capture'
              : 'Two live Pattern render paths per pixel throughout the transition'}
          </output>
        </div>
      )}
      <details className="mt-2 border-t border-zinc-800 bg-transparent">
        <summary className="flex cursor-pointer items-center py-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">
          <span>Advanced transition controls</span>
          <span data-testid="transition-cost-tag" className={`ml-auto font-mono normal-case tracking-normal ${cost === 'expensive' ? 'text-amber-300' : 'text-zinc-500'}`}>
            cost · {cost}
          </span>
        </summary>
        <div className="grid grid-cols-2 gap-0 border-t border-zinc-800">
          {(['timeScale', 'brightness'] as const).map((property) => (
            <PropertyTransitionEditor
              key={property}
              property={property}
              show={show}
              transition={transition}
              sceneIndex={sceneIndex}
              destinationCells={destinationCells}
              onUpdate={onUpdate}
              onUpdateCellAdaptations={onUpdateCellAdaptations}
            />
          ))}
          <TransformTransitionEditor
            transition={transition}
            sceneIndex={sceneIndex}
            destinationCells={destinationCells}
            show={show}
            onUpdate={onUpdate}
          />
          {show.routingLayouts.some((layout) => (
            layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
          )) && nextScene && (
            <RoutingSplitTransitionEditor
              transition={transition}
              fromTarget={scene?.routingTargets?.splitPosition ?? 0.5}
              toTarget={nextScene.routingTargets?.splitPosition ?? 0.5}
              onUpdate={onUpdate}
            />
          )}
          {nextScene && (
            <SampleRepeatTransitionEditor
              transition={transition}
              fromTarget={scene?.sampleTargets?.repeatScale ?? 1}
              toTarget={nextScene.sampleTargets?.repeatScale ?? 1}
              onUpdate={onUpdate}
            />
          )}
          {boundaryControls.map((control) => (
            <PatternControlTransitionEditor
              key={control.exportName}
              control={control}
              show={show}
              transition={transition}
              sceneIndex={sceneIndex}
              destinationCells={destinationCells}
              onUpdate={onUpdate}
              onUpdateControlTarget={onUpdateControlTarget}
            />
          ))}
        </div>
      </details>
    </InspectorPanel>
  )
}

function SampleRepeatTransitionEditor({
  transition,
  fromTarget,
  toTarget,
  onUpdate,
}: {
  transition: ShowBoundaryTransition
  fromTarget: number
  toTarget: number
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
}) {
  const descriptor = transition.propertyTransitions?.sample?.repeatScale
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>) => {
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        sample: {
          ...(transition.propertyTransitions?.sample ?? {}),
          repeatScale: {
            from: changes.from ?? descriptor?.from ?? fromTarget,
            durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
            easing: changes.easing ?? descriptor?.easing ?? transition.easing,
          },
        },
      },
    })
  }
  const removeDescriptor = () => {
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    const sample = { ...(propertyTransitions.sample ?? {}) }
    delete sample.repeatScale
    if (Object.keys(sample).length > 0) propertyTransitions.sample = sample
    else delete propertyTransitions.sample
    onUpdate(transition.id, {
      propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined,
    })
  }
  return (
    <section className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2">
      <label className="flex items-center gap-2 text-[10px] uppercase text-zinc-400">
        <input
          type="checkbox"
          aria-label="Animate repeat scale"
          checked={Boolean(descriptor)}
          onChange={(event) => event.target.checked ? updateDescriptor({}) : removeDescriptor()}
          className="h-3.5 w-3.5 accent-live"
        />
        Repeat scale
        <span className="ml-auto font-mono text-zinc-500">{formatRepeatScale(fromTarget)} → {formatRepeatScale(toTarget)}</span>
      </label>
      {descriptor && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <DomainNumberField
            label="Repeat scale start"
            value={descriptor.from}
            presentation="multiplier"
            min={1}
            max={8}
            step={0.1}
            onChange={(from) => updateDescriptor({ from })}
          />
          <TimeField
            label="Repeat scale duration seconds"
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0}
            max={Math.max(0, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Repeat scale easing
            <select
              aria-label="Repeat scale easing"
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
      )}
    </section>
  )
}

const SHOW_TRANSFORM_PROPERTY_PRESENTATION: Array<{
  property: keyof ShowClipTransform
  label: string
  format: (value: number) => string
}> = [
  { property: 'positionX', label: 'Position X', format: (value) => Number(value.toFixed(2)).toString() },
  { property: 'positionY', label: 'Position Y', format: (value) => Number(value.toFixed(2)).toString() },
  { property: 'rotation', label: 'Rotation', format: (value) => formatAngleValue('rotation', value) },
  { property: 'scaleX', label: 'Scale X', format: (value) => formatDomainNumber('multiplier', value, 0.01) },
  { property: 'scaleY', label: 'Scale Y', format: (value) => formatDomainNumber('multiplier', value, 0.01) },
]

function TransformTransitionEditor({
  transition,
  sceneIndex,
  destinationCells,
  show,
  onUpdate,
}: {
  transition: ShowBoundaryTransition
  sceneIndex: number
  destinationCells: Array<{ zone: ShowRecord['zones'][number]; cell: ShowCell }>
  show: ShowRecord
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
}) {
  const compatible = destinationCells.flatMap(({ zone, cell }) => {
    const outgoing = cellCoveringScene(show, zone.id, sceneIndex)
    return outgoing && outgoing.pattern.kind === cell.pattern.kind && outgoing.pattern.id === cell.pattern.id
      ? [{ zone, cell, outgoing }]
      : []
  })
  if (compatible.length === 0) return null

  const updateProperty = (
    property: keyof ShowClipTransform,
    enabled: boolean,
    changes: { durationMs?: number; easing?: ShowBoundaryTransition['easing'] } = {},
  ) => {
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    const transform = { ...(propertyTransitions.transform ?? {}) }
    const current = transform[property]
    if (!enabled) {
      delete transform[property]
    } else {
      transform[property] = {
        fromByCellId: current?.fromByCellId ?? Object.fromEntries(compatible.map(({ cell, outgoing }) => (
          [cell.id, normalizeShowClipTransform(outgoing.transform)[property]]
        ))),
        durationMs: changes.durationMs ?? current?.durationMs ?? transition.durationMs,
        easing: changes.easing ?? current?.easing ?? transition.easing,
      }
    }
    if (Object.keys(transform).length > 0) propertyTransitions.transform = transform
    else delete propertyTransitions.transform
    onUpdate(transition.id, {
      propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined,
    })
  }

  return (
    <section aria-label="Transform transition" className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400">Transform</div>
      <p className="mb-2 text-[9px] text-zinc-600">Canonical placement pose. Additional Transform Effects still run afterward.</p>
      <div className="divide-y divide-zinc-900">
        {SHOW_TRANSFORM_PROPERTY_PRESENTATION.map(({ property, label, format }) => {
          const descriptor = transition.propertyTransitions?.transform?.[property]
          const first = compatible[0]
          const from = descriptor?.fromByCellId[first.cell.id]
            ?? normalizeShowClipTransform(first.outgoing.transform)[property]
          const to = normalizeShowClipTransform(first.cell.transform)[property]
          return (
            <div key={property} className="py-1.5">
              <label className="flex items-center gap-2 text-[9px] text-zinc-400">
                <input
                  type="checkbox"
                  aria-label={`Animate ${label} transform`}
                  checked={Boolean(descriptor)}
                  onChange={(event) => updateProperty(property, event.target.checked)}
                  className="size-3.5 accent-live"
                />
                <span>{label}</span>
                <span className="ml-auto font-mono text-zinc-600">{format(from)} to {format(to)}</span>
              </label>
              {descriptor && (
                <div className="mt-1.5 grid grid-cols-2 gap-2 pl-5">
                  <TimeField
                    label={`${label} transform duration seconds`}
                    value={(descriptor.durationMs ?? transition.durationMs) / 1_000}
                    min={0}
                    max={Math.max(0, transition.durationMs / 1_000)}
                    step={0.1}
                    onChange={(seconds) => updateProperty(property, true, { durationMs: seconds * 1_000 })}
                  />
                  <label className="text-[9px] uppercase text-zinc-600">
                    {label} transform easing
                    <select
                      aria-label={`${label} transform easing`}
                      value={showEasingOptionId(descriptor.easing ?? transition.easing)}
                      onChange={(event) => updateProperty(property, true, { easing: showEasingFromOptionId(event.target.value) })}
                      className={`${transitionRuleUnderField} mt-1 w-full`}
                    >
                      <ShowEasingOptions />
                    </select>
                  </label>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function RoutingSplitTransitionEditor({
  transition,
  fromTarget,
  toTarget,
  onUpdate,
}: {
  transition: ShowBoundaryTransition
  fromTarget: number
  toTarget: number
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
}) {
  const descriptor = transition.propertyTransitions?.routing?.splitPosition
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>) => {
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        routing: {
          ...(transition.propertyTransitions?.routing ?? {}),
          splitPosition: {
            from: changes.from ?? descriptor?.from ?? fromTarget,
            durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
            easing: changes.easing ?? descriptor?.easing ?? transition.easing,
          },
        },
      },
    })
  }
  const removeDescriptor = () => {
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    const routing = { ...(propertyTransitions.routing ?? {}) }
    delete routing.splitPosition
    if (Object.keys(routing).length > 0) propertyTransitions.routing = routing
    else delete propertyTransitions.routing
    onUpdate(transition.id, {
      propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined,
    })
  }
  return (
    <section className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2">
      <label className="flex items-center gap-2 text-[10px] uppercase text-zinc-400">
        <input
          type="checkbox"
          aria-label="Animate split position"
          checked={Boolean(descriptor)}
          onChange={(event) => event.target.checked ? updateDescriptor({}) : removeDescriptor()}
          className="h-3.5 w-3.5 accent-live"
        />
        Split position
        <span className="ml-auto font-mono text-zinc-500">{Math.round(fromTarget * 100)}% → {Math.round(toTarget * 100)}%</span>
      </label>
      {descriptor && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumberField
            label="Split position start"
            value={descriptor.from}
            min={0}
            max={1}
            step={0.01}
            onChange={(from) => updateDescriptor({ from })}
          />
          <TimeField
            label="Split position duration seconds"
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0}
            max={Math.max(0, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Split position easing
            <select
              aria-label="Split position easing"
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
      )}
    </section>
  )
}

function PropertyTransitionEditor({
  property,
  show,
  transition,
  sceneIndex,
  destinationCells,
  onUpdate,
  onUpdateCellAdaptations,
}: {
  property: ShowAutomatableProperty
  show: ShowRecord
  transition: ShowBoundaryTransition
  sceneIndex: number
  destinationCells: Array<{ zone: ShowRecord['zones'][number]; cell: ShowCell }>
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
  onUpdateCellAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
}) {
  const isTime = property === 'timeScale'
  const descriptor = transition.propertyTransitions?.[property]
  const title = isTime ? 'Animation speed' : 'Brightness'
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>, fromByCellId = descriptor?.fromByCellId ?? {}) => {
    const nextDescriptor = {
      fromByCellId,
      durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
      easing: changes.easing ?? descriptor?.easing ?? transition.easing,
    }
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        [property]: nextDescriptor,
      },
    })
  }
  const removeCell = (cellId: string) => {
    const fromByCellId = { ...(descriptor?.fromByCellId ?? {}) }
    delete fromByCellId[cellId]
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    if (Object.keys(fromByCellId).length > 0) propertyTransitions[property] = { ...descriptor, fromByCellId }
    else delete propertyTransitions[property]
    onUpdate(transition.id, { propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined })
  }
  return (
    <section
      className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2"
      aria-label={`${title} transition`}
    >
      <div className="mb-2 text-[10px] uppercase tracking-[0.12em] text-zinc-400">{title}</div>
      {descriptor && (
        <>
        <div data-testid="advanced-property-columns" className="mb-1 grid grid-cols-4 gap-2 font-mono text-[8px] uppercase tracking-[0.1em] text-zinc-600">
          <span>From</span><span>To</span><span>Duration</span><span>Easing</span>
        </div>
        <div className="mb-2 grid grid-cols-2 gap-2">
          <TimeField
            label={`${title} duration seconds`}
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0.1}
            max={Math.max(0.1, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            {title} easing
            <select
              aria-label={`${title} easing`}
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
        </>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {destinationCells.map(({ zone, cell }) => {
          const from = descriptor?.fromByCellId[cell.id]
          const outgoing = cellCoveringScene(show, zone.id, sceneIndex)
          const enabled = from !== undefined
          const updateFrom = (value: number | undefined) => {
            if (value === undefined) return removeCell(cell.id)
            updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [cell.id]: value })
          }
          const max = isTime ? 4 : 1
          return (
            <div key={cell.id} className="border-t border-zinc-900 bg-transparent py-2">
              <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                <input
                  type="checkbox"
                  aria-label={`Animate ${isTime ? 'speed' : 'brightness'} for ${zone.name}`}
                  checked={enabled}
                  disabled={transition.kind === 'cut'}
                  onChange={(event) => updateFrom(event.target.checked ? outgoing?.adaptations[property] ?? 1 : undefined)}
                  className="h-3.5 w-3.5 accent-live"
                />
                {zone.name}
              </label>
              {enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {isTime ? (
                    <DomainNumberField
                      label={`${title} start ${zone.name}`}
                      value={from}
                      presentation="multiplier"
                      min={0}
                      max={max}
                      step={0.05}
                      onChange={updateFrom}
                    />
                  ) : (
                    <PercentageField
                      label={`${title} start ${zone.name}`}
                      value={from}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={updateFrom}
                    />
                  )}
                  {isTime ? (
                    <DomainNumberField
                      label={`${title} target ${zone.name}`}
                      value={cell.adaptations[property]}
                      presentation="multiplier"
                      min={0}
                      max={max}
                      step={0.05}
                      onChange={(value) => onUpdateCellAdaptations(cell, { [property]: value })}
                    />
                  ) : (
                    <PercentageField
                      label={`${title} target ${zone.name}`}
                      value={cell.adaptations[property]}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(value) => onUpdateCellAdaptations(cell, { [property]: value })}
                    />
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-500">
        The value moves from its outgoing setting to its incoming setting across this boundary.
        {isTime ? ' A target of 0 pauses without resetting Pattern state.' : ''}
      </p>
    </section>
  )
}

function PatternControlTransitionEditor({
  control,
  show,
  transition,
  sceneIndex,
  destinationCells,
  onUpdate,
  onUpdateControlTarget,
}: {
  control: AutomatablePatternControl
  show: ShowRecord
  transition: ShowBoundaryTransition
  sceneIndex: number
  destinationCells: Array<{ zone: ShowRecord['zones'][number]; cell: ShowCell }>
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
  onUpdateControlTarget: (cell: ShowCell, exportName: string, value: number | undefined) => void
}) {
  const descriptor = transition.propertyTransitions?.controls?.[control.exportName]
  const updateDescriptor = (changes: Partial<NonNullable<typeof descriptor>>, fromByCellId = descriptor?.fromByCellId ?? {}) => {
    onUpdate(transition.id, {
      propertyTransitions: {
        ...(transition.propertyTransitions ?? {}),
        controls: {
          ...(transition.propertyTransitions?.controls ?? {}),
          [control.exportName]: {
            fromByCellId,
            durationMs: changes.durationMs ?? descriptor?.durationMs ?? transition.durationMs,
            easing: changes.easing ?? descriptor?.easing ?? transition.easing,
          },
        },
      },
    })
  }
  const removeCell = (cellId: string) => {
    const fromByCellId = { ...(descriptor?.fromByCellId ?? {}) }
    delete fromByCellId[cellId]
    const controls = { ...(transition.propertyTransitions?.controls ?? {}) }
    if (Object.keys(fromByCellId).length > 0) controls[control.exportName] = { ...descriptor, fromByCellId }
    else delete controls[control.exportName]
    const propertyTransitions = { ...(transition.propertyTransitions ?? {}) }
    if (Object.keys(controls).length > 0) propertyTransitions.controls = controls
    else delete propertyTransitions.controls
    onUpdate(transition.id, { propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined })
  }
  return (
    <section className="col-span-2 border-t border-zinc-800/70 bg-transparent py-2" aria-label={`${control.label} control transition`}>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-zinc-400">{control.label} · Pattern control</div>
      <div className="mb-2 text-[9px] text-zinc-600">{control.exportName} · 0–100% · default {formatPercentageValue(control.defaultValue)}</div>
      {descriptor && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <TimeField
            label={`${control.label} duration seconds`}
            value={(descriptor.durationMs ?? transition.durationMs) / 1000}
            min={0.1}
            max={Math.max(0.1, transition.durationMs / 1000)}
            step={0.1}
            onChange={(seconds) => updateDescriptor({ durationMs: seconds * 1000 })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            {control.label} easing
            <select
              aria-label={`${control.label} easing`}
              value={showEasingOptionId(descriptor.easing ?? transition.easing)}
              onChange={(event) => updateDescriptor({ easing: showEasingFromOptionId(event.target.value) })}
              className={`${transitionRuleUnderField} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-2">
        {destinationCells.map(({ zone, cell }) => {
          const outgoing = cellCoveringScene(show, zone.id, sceneIndex)
          const from = descriptor?.fromByCellId[cell.id]
          const enabled = from !== undefined
          const bothTargets = outgoing?.controlTargets?.[control.exportName] !== undefined && cell.controlTargets?.[control.exportName] !== undefined
          return (
            <div key={cell.id} className="border-t border-zinc-900 bg-transparent py-2">
              <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                <input
                  type="checkbox"
                  aria-label={`Animate ${control.label} for ${zone.name}`}
                  checked={enabled}
                  disabled={transition.kind === 'cut' || !bothTargets}
                  title={bothTargets ? undefined : 'Set targets on both adjacent clips first'}
                  onChange={(event) => {
                    if (!event.target.checked) return removeCell(cell.id)
                    updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [cell.id]: outgoing?.controlTargets?.[control.exportName] ?? control.defaultValue })
                  }}
                  className="h-3.5 w-3.5 accent-live"
                />
                {zone.name}
              </label>
              {!bothTargets && <p className="mt-1 text-[9px] text-amber-300/70">Set this target on both adjacent clips first.</p>}
              {enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <PercentageField
                    label={`${control.label} start ${zone.name}`}
                    value={from}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [cell.id]: value })}
                  />
                  <PercentageField
                    label={`${control.label} target ${zone.name}`}
                    value={cell.controlTargets?.[control.exportName] ?? control.defaultValue}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => onUpdateControlTarget(cell, control.exportName, value)}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

const ROUTING_MODE_LABELS: Record<string, string> = {
  physical: 'physical pixel ranges',
  single: 'full surface',
  'stripes-x': 'left / right stripes',
  'stripes-y': 'top / bottom stripes',
  'grid-2x2': '2 x 2 grid',
  checker: 'checker',
  rings: 'rings',
  pinwheel: 'pinwheel',
  wave: 'wave',
  'soft-split': 'soft split',
  'split-x': 'moving split X',
  'split-y': 'moving split Y',
}

function routingModeLabel(layout: ShowRoutingLayout): string {
  return ROUTING_MODE_LABELS[routingModeValue(layout)] ?? routingModeValue(layout)
}

function routingModeValue(layout: ShowRoutingLayout): string {
  const logical = layout.logical
  if (!logical) return 'physical'
  if (logical.kind === 'single') return 'single'
  if (logical.kind === 'grid' && logical.columns === 2 && logical.rows === 2) return 'grid-2x2'
  if (logical.kind === 'stripes') return `stripes-${logical.axis}`
  if (logical.kind === 'checker') return 'checker'
  if (logical.kind === 'rings') return 'rings'
  if (logical.kind === 'pinwheel') return 'pinwheel'
  if (logical.kind === 'wave') return 'wave'
  if (logical.kind === 'soft-split') return 'soft-split'
  if (logical.kind === 'split') return `split-${logical.axis}`
  return 'physical'
}

function patchLogicalRouting<K extends ShowLogicalRouting['kind']>(
  logical: ShowLogicalRouting,
  kind: K,
  changes: Partial<Omit<Extract<ShowLogicalRouting, { kind: K }>, 'kind' | 'zoneIds'>>,
): ShowLogicalRouting {
  if (logical.kind !== kind) return logical
  return { ...logical, ...changes } as ShowLogicalRouting
}

function logicalRoutingForMode(
  mode: string,
  zoneIds: string[],
): ShowRoutingLayout['logical'] | undefined {
  if (mode === 'single') return { kind: 'single', zoneIds: [zoneIds[0]] }
  if (mode === 'grid-2x2') return { kind: 'grid', zoneIds: zoneIds.slice(0, 4), columns: 2, rows: 2 }
  if (mode === 'stripes-x' || mode === 'stripes-y') {
    return { kind: 'stripes', zoneIds: [...zoneIds], axis: mode === 'stripes-y' ? 'y' : 'x' }
  }
  if (mode === 'checker') {
    return { kind: 'checker', zoneIds: [zoneIds[0], zoneIds[1]], columns: 4, rows: 4 }
  }
  if (mode === 'rings') return { kind: 'rings', zoneIds: [...zoneIds], rings: 5 }
  if (mode === 'pinwheel') {
    return { kind: 'pinwheel', zoneIds: [...zoneIds], arms: 6, twist: Math.PI * 2 * 1.35, rotation: 0 }
  }
  if (mode === 'wave') {
    return { kind: 'wave', zoneIds: [...zoneIds], axis: 'x', bands: 4, amplitude: 0.3, frequency: 2.5, phase: 0 }
  }
  if (mode === 'soft-split') {
    return { kind: 'soft-split', zoneIds: [zoneIds[0], zoneIds[1]], axis: 'x', feather: 0.2 }
  }
  if (mode === 'split-x' || mode === 'split-y') {
    return { kind: 'split', zoneIds: [zoneIds[0], zoneIds[1]], axis: mode === 'split-y' ? 'y' : 'x' }
  }
  return undefined
}

function logicalRoutingDescription(layout: ShowRoutingLayout, show: ShowRecord): string {
  const logical = layout.logical
  if (!logical) return ''
  const issue = validateShowLogicalRouting(logical)[0]
  if (issue) return `Cannot compile this routing layout: ${issue}`
  const names = logical.zoneIds.map((zoneId) => show.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId)
  if (logical.kind === 'single') return `${names[0]} receives the complete normalized Stage.`
  if (logical.kind === 'grid') return `${names.join(', ')} fill a ${logical.columns} x ${logical.rows} normalized grid.`
  if (logical.kind === 'stripes') return `${names.join(', ')} divide the normalized ${logical.axis.toUpperCase()} axis into equal position-based stripes.`
  if (logical.kind === 'checker') return `${names[0]} and ${names[1]} alternate across a ${logical.columns} x ${logical.rows} checker.`
  if (logical.kind === 'rings') return `${names.join(', ')} cycle through ${logical.rings} concentric rings.`
  if (logical.kind === 'pinwheel') {
    const twistTurns = Number((logical.twist / (Math.PI * 2)).toFixed(2))
    const rotationDegrees = Number((((logical.rotation ?? 0) * 180) / Math.PI).toFixed(1))
    return `${names.join(', ')} cycle through ${logical.arms ?? names.length} arms with ${twistTurns} turns of twist and ${rotationDegrees}° rotation.`
  }
  if (logical.kind === 'wave') return `${names.join(', ')} cycle through ${logical.bands} displaced bands along the normalized ${logical.axis.toUpperCase()} axis.`
  if (logical.kind === 'soft-split') return `${names[0]} and ${names[1]} blend across a movable ${logical.axis.toUpperCase()} boundary. Inside the feather, both Patterns render; outside it, only one renders.`
  if (logical.kind === 'split') return `${names[0]} and ${names[1]} share a normalized Stage axis. Boundary values move the split continuously.`
  return `${names.join(', ')} route by normalized Stage position.`
}

function ShowSetupInspector({
  show,
  controllerProfiles,
  targetProfile,
  userMaps,
  onUpdateTargetProfile,
  onUpdatePortableReference,
  onUpdateOutputEffects,
  compiledOutputEffects,
}: {
  show: ShowRecord
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdatePortableReference: (referenceMapId: string | null, referencePixelCount: number) => void
  onUpdateOutputEffects: (outputEffects: ShowOutputEffect[]) => void
  compiledOutputEffects?: import('@/engine/showCompiler').ShowCompileSummary['outputEffects']
}) {
  const zonePixels = show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)
  const contract = show.outputContract
  const outputMapId = contract?.kind === 'portable-2d'
    ? contract.referenceMapId
    : contract?.kind === 'installation'
      ? contract.outputMapId
      : show.stageMapId ?? null
  const outputMapName = [...STOCK_MAPS, ...userMaps].find((map) => map.id === outputMapId)?.name
  const installationCoverage = validateInstallationCoverage(show)
  const coverageLayout = installationCoverage?.layouts[0]
  const portable = contract?.kind === 'portable-2d' ? contract : null
  const portableMaps = [...STOCK_MAPS, ...userMaps].filter((map) => map.dim === 2)
  const trails = normalizeShowOutputEffects(show.outputEffects).find((effect) => effect.kind === 'trails')
  const compiledTrails = compiledOutputEffects?.find((effect) => effect.kind === 'trails')
  return (
    <InspectorPanel family="Show" title={show.name} icon={<Settings2 size={13} aria-hidden />}>
      <div className="grid gap-3 md:grid-cols-2">
        {!portable && (
          <label className="text-[10px] uppercase text-zinc-600">
            Target controller
            <select
              aria-label="Target controller"
              value={show.targetControllerProfileId ?? ''}
              onChange={(event) => onUpdateTargetProfile(event.target.value)}
              className={`${field} mt-1 w-full`}
            >
              <option value="">automatic</option>
              {controllerProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
        )}
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Output contract
          {contract ? (
            <>
              <div className="mt-1 text-xs normal-case text-zinc-200">
                {contract.kind === 'portable-2d'
                  ? 'Portable · Resolution-independent 2D'
                  : 'Installation · Exact physical output'}
              </div>
              <div className="mt-1 normal-case text-zinc-500">
                <span>
                  {contract.kind === 'portable-2d'
                    ? `${contract.referencePixelCount} px reference`
                    : `${contract.pixelCount} px fixed`}
                </span>
                <span>{' · '}</span>
                <span>{outputMapName ?? (outputMapId ? 'Missing map' : 'No map')}</span>
              </div>
            </>
          ) : (
            <div className="mt-1 text-xs normal-case text-amber-300">Legacy · Not classified</div>
          )}
        </div>
        {portable && (
          <div className="rounded border border-sky-900/50 bg-sky-950/15 p-2 text-[10px] uppercase text-sky-500">
            Artifact promise
            <div className="mt-1 text-xs normal-case text-zinc-200">
              Compatible 2D mapped surfaces at variable resolution.
            </div>
            <div className="mt-1 normal-case text-zinc-500">No exact LED identity, physical ranges, or 3D portability.</div>
          </div>
        )}
        {portable && (
          <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600 md:col-span-2">
            Reference preview
            <div className="mt-1 grid gap-1.5 sm:grid-cols-[minmax(8rem,1fr)_7rem]">
              <select
                aria-label="Portable reference map"
                value={portable.referenceMapId ?? ''}
                onChange={(event) => onUpdatePortableReference(event.target.value || null, portable.referencePixelCount)}
                className={`${field} w-full normal-case`}
              >
                <option value="">Choose 2D map</option>
                {portableMaps.map((map) => <option key={map.id} value={map.id}>{map.name}</option>)}
              </select>
              <NumberField
                label="Portable reference pixels"
                hideLabel
                min={1}
                max={2000}
                step={1}
                value={portable.referencePixelCount}
                onChange={(referencePixelCount) => onUpdatePortableReference(portable.referenceMapId, referencePixelCount)}
              />
            </div>
            <div className="mt-1 normal-case text-zinc-500">Preview only; changing it does not rewrite choreography.</div>
          </div>
        )}
        {coverageLayout && (
          <div className={`rounded border p-2 text-[10px] uppercase ${coverageLayout.valid
            ? 'border-emerald-900/60 bg-emerald-950/15 text-emerald-500'
            : 'border-amber-800/60 bg-amber-950/20 text-amber-300'}`}
          >
            Physical coverage
            <div className="mt-1 text-xs normal-case text-zinc-300">
              {coverageLayout.layoutName} assigns {coverageLayout.assignedPixelCount} of {coverageLayout.totalPixelCount} pixels
              {coverageLayout.valid
                ? ' exactly once.'
                : ` (${[
                    coverageLayout.missingPixelCount ? `${coverageLayout.missingPixelCount} missing` : null,
                    coverageLayout.overlappingPixelCount ? `${coverageLayout.overlappingPixelCount} overlapping` : null,
                    coverageLayout.outOfRangePixelCount ? `${coverageLayout.outOfRangePixelCount} out of range` : null,
                  ].filter(Boolean).join(', ')}).`}
            </div>
          </div>
        )}
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Loop
          <div className="mt-1 text-xs text-zinc-300">{formatDuration(showLoopDurationMs(show))}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Zones
          <div className="mt-1 text-xs text-zinc-300">
            {show.zones.length} zone{show.zones.length === 1 ? '' : 's'}{portable ? ' · logical' : ` - ${zonePixels} px`}
          </div>
        </div>
      </div>
      <p className="mt-3 text-[10px] text-zinc-500">
        {portable
          ? 'Portable routing uses normalized Stage positions at runtime.'
          : `Using ${targetProfile?.name ?? 'nominal zones'} for compile estimates.`}
        {' '}Zones are authored in the Zone Map on the Timeline; each Layout interval owns its Zone Layout there.
      </p>
      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <WandSparkles size={13} aria-hidden className="text-cyan-400/75" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Show output</h4>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2.5">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-[10px] font-medium text-zinc-300">
              <input
                aria-label="Enable Trails"
                type="checkbox"
                checked={Boolean(trails)}
                onChange={(event) => onUpdateOutputEffects(event.target.checked
                  ? [{ id: 'trails', kind: 'trails', retention: DEFAULT_SHOW_TRAILS_RETENTION }]
                  : [])}
                className="accent-live"
              />
              Trails
            </label>
            {trails && (
              <div className="w-32 min-w-0">
                <PercentageField
                  compact
                  label="Retention"
                  ariaLabel="Trails retention"
                  min={0}
                  max={1}
                  step={0.015625}
                  value={trails.retention}
                  onChange={(retention) => onUpdateOutputEffects([{
                    ...trails,
                    retention,
                  }])}
                />
              </div>
            )}
          </div>
          <p className="mt-1.5 text-[9px] leading-4 text-zinc-500">
            Retains brighter linear-RGB pixels from the previous frame. Scrubbing clears trail history at the destination; normal playback and Controller output remain continuous.
          </p>
          {compiledTrails?.status === 'rejected' && (
            <p role="status" className="mt-1 text-[9px] leading-4 text-amber-300/85">
              Trails are unavailable for this Show because another required cache owns the frame arena ({compiledTrails.reason}).
            </p>
          )}
        </div>
      </div>
    </InspectorPanel>
  )
}

function ZoneLayoutInspector({
  show,
  layout,
  intervals,
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
}: {
  show: ShowRecord
  layout: ShowRoutingLayout
  intervals: ShowLayoutInterval[]
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
}) {
  const portable = show.outputContract?.kind === 'portable-2d' ? show.outputContract : null
  const uses = intervals.filter((interval) => interval.layoutId === layout.id)
  return (
    <InspectorPanel family="Zone Layout" title={routingModeLabel(layout)} icon={<Route size={13} aria-hidden />}>
      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          aria-label={`Duplicate Zone Layout ${layout.name}`}
          title={`Duplicate ${layout.name}`}
          onClick={() => onAddRoutingLayout(layout.id)}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        >
          <Copy size={13} aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Remove Zone Layout ${layout.name}`}
          title={`Remove ${layout.name}`}
          onClick={() => onRemoveRoutingLayout(layout.id)}
          disabled={show.routingLayouts.length <= 1}
          className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
        >
          <Trash2 size={13} aria-hidden />
        </button>
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-500">
        {uses.length === 0
          ? 'Not on the timeline.'
          : `On the timeline ${formatShowTime(uses[0].startMs)}-${formatShowTime(uses[uses.length - 1].endMs)}${uses.length > 1 ? ` across ${uses.length} intervals` : ''}.`}
      </p>
      <label className="mt-2 block text-[9.5px] uppercase text-zinc-600">
        Routing mode
        <select
          aria-label={`${layout.name} routing mode`}
          value={routingModeValue(layout)}
          onChange={(event) => {
            const value = event.target.value
            onUpdateRoutingLayout(layout.id, {
              logical: logicalRoutingForMode(value, show.zones.map((zone) => zone.id)),
            })
          }}
          className={`${field} mt-1 w-full max-w-xs`}
        >
          {!portable && <option value="physical">physical pixel ranges</option>}
          {portable && <option value="single">full surface</option>}
          <option value="stripes-x">left / right stripes</option>
          <option value="stripes-y">top / bottom stripes</option>
          <option value="grid-2x2" disabled={show.zones.length < 4}>2 x 2 grid</option>
          <option value="checker" disabled={show.zones.length < 2}>checker</option>
          <option value="rings">rings</option>
          <option value="pinwheel">pinwheel</option>
          <option value="wave">wave</option>
          <option value="soft-split" disabled={show.zones.length < 2}>soft split</option>
          <option value="split-x">moving split X</option>
          <option value="split-y">moving split Y</option>
        </select>
      </label>
      {layout.logical?.kind === 'checker' && (
        <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
          <NumberField
            label="Columns"
            ariaLabel="Checker columns"
            min={1}
            step={1}
            value={layout.logical.columns}
            onChange={(columns) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'checker', {
                columns: Math.max(1, Math.round(columns)),
              }),
            })}
          />
          <NumberField
            label="Rows"
            ariaLabel="Checker rows"
            min={1}
            step={1}
            value={layout.logical.rows}
            onChange={(rows) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'checker', {
                rows: Math.max(1, Math.round(rows)),
              }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'rings' && (
        <div className="mt-2 max-w-[9.5rem]">
          <NumberField
            label="Ring count"
            min={1}
            step={1}
            value={layout.logical.rings}
            onChange={(rings) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'rings', {
                rings: Math.max(1, Math.round(rings)),
              }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'pinwheel' && (
        <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
          <NumberField
            label="Arms"
            ariaLabel="Pinwheel arms"
            min={1}
            step={1}
            value={layout.logical.arms ?? layout.logical.zoneIds.length}
            onChange={(arms) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                arms: Math.max(1, Math.round(arms)),
              }),
            })}
          />
          <NumberField
            label="Twist turns"
            ariaLabel="Pinwheel twist turns"
            step={0.05}
            value={Number((layout.logical.twist / (Math.PI * 2)).toFixed(3))}
            onChange={(twistTurns) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                twist: twistTurns * Math.PI * 2,
              }),
            })}
          />
          <NumberField
            label="Rotation °"
            ariaLabel="Pinwheel rotation degrees"
            step={1}
            value={Number((((layout.logical.rotation ?? 0) * 180) / Math.PI).toFixed(2))}
            onChange={(rotationDegrees) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                rotation: rotationDegrees * Math.PI / 180,
              }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'wave' && (
        <div className="mt-2 grid max-w-2xl grid-cols-2 gap-2 sm:grid-cols-5">
          <label className="text-[9.5px] uppercase text-zinc-600">
            Axis
            <select
              aria-label="Wave axis"
              value={layout.logical.axis}
              onChange={(event) => onUpdateRoutingLayout(layout.id, {
                logical: patchLogicalRouting(layout.logical!, 'wave', { axis: event.target.value === 'y' ? 'y' : 'x' }),
              })}
              className={`${field} mt-1 w-full`}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
            </select>
          </label>
          <NumberField
            label="Bands"
            ariaLabel="Wave band count"
            min={1}
            step={1}
            value={layout.logical.bands}
            onChange={(bands) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { bands: Math.max(1, Math.round(bands)) }),
            })}
          />
          <PercentageField
            key={layout.logical.amplitude}
            label="Wave amplitude"
            value={layout.logical.amplitude}
            min={0}
            max={1}
            step={0.05}
            onChange={(amplitude) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { amplitude }),
            })}
          />
          <NumberField
            label="Frequency"
            ariaLabel="Wave frequency"
            min={0}
            step={0.1}
            value={layout.logical.frequency}
            onChange={(frequency) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { frequency: Math.max(0, frequency) }),
            })}
          />
          <NumberField
            label="Phase"
            ariaLabel="Wave phase"
            step={0.05}
            value={layout.logical.phase}
            onChange={(phase) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'wave', { phase }),
            })}
          />
        </div>
      )}
      {layout.logical?.kind === 'soft-split' && (
        <div className="mt-2 grid max-w-xs grid-cols-2 gap-2">
          <label className="text-[9.5px] uppercase text-zinc-600">
            Axis
            <select
              aria-label="Soft Split axis"
              value={layout.logical.axis}
              onChange={(event) => onUpdateRoutingLayout(layout.id, {
                logical: patchLogicalRouting(layout.logical!, 'soft-split', { axis: event.target.value === 'y' ? 'y' : 'x' }),
              })}
              className={`${field} mt-1 w-full`}
            >
              <option value="x">X</option>
              <option value="y">Y</option>
            </select>
          </label>
          <PercentageField
            key={layout.logical.feather}
            label="Soft Split feather"
            value={layout.logical.feather}
            min={0}
            max={1}
            step={0.05}
            onChange={(feather) => onUpdateRoutingLayout(layout.id, {
              logical: patchLogicalRouting(layout.logical!, 'soft-split', { feather }),
            })}
          />
        </div>
      )}
      {layout.logical ? (
        <p className="mt-2 rounded border border-sky-900/40 bg-sky-950/10 px-2 py-1.5 text-[10px] leading-4 text-zinc-500">
          {logicalRoutingDescription(layout, show)}
        </p>
      ) : (
      <div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {show.zones.map((zone) => {
          const layoutZone = layout.zones.find((candidate) => candidate.zoneId === zone.id)
          return (
            <label key={zone.id} className="text-[9.5px] uppercase text-zinc-600">
              {zone.name} ranges
              <DraftTextField
                ariaLabel={`${layout.name} ${zone.name} pixel ranges`}
                value={formatShowRoutingRanges(layoutZone?.ranges ?? [])}
                parse={parseShowRoutingRanges}
                onApply={(ranges) => {
                  onUpdateRoutingLayout(layout.id, {
                    zones: layout.zones.map((candidate) => candidate.zoneId === zone.id
                      ? { ...candidate, ranges }
                      : candidate),
                  })
                }}
                className="mt-1 w-full"
                inputClassName={`${field} w-full font-mono`}
                inputProps={{ placeholder: '0-63, 128-191' }}
              />
            </label>
          )
        })}
      </div>
      )}
    </InspectorPanel>
  )
}

function ZoneInspector({
  show,
  zone,
  targetName,
  targetZones,
  spatialSelectionUnavailableReason,
  onOpenSpatialSelection,
  onUpdateZone,
  onRemoveZone,
}: {
  show: ShowRecord
  zone: ShowRecord['zones'][number]
  targetName?: string
  targetZones: ControllerZone[]
  spatialSelectionUnavailableReason: string | null
  onOpenSpatialSelection: () => void
  onUpdateZone: (changes: Partial<ShowRecord['zones'][number]>) => void
  onRemoveZone: () => void
}) {
  return (
    <InspectorPanel family="Zone" title={`${zone.name}${targetName ? ` · ${targetName}` : ''}`} icon={<MapIcon size={13} aria-hidden />}>
      <div className="grid gap-2 rounded border border-zinc-800 bg-zinc-950/55 p-2 md:grid-cols-[minmax(140px,1fr)_96px_36px]">
        <label className="flex min-w-0 items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: zone.color ?? '#38bdf8' }} />
          <DraftTextField
            ariaLabel={`Zone name ${zone.name}`}
            value={zone.name}
            formatApplied={(_, draft) => draft.trim() || zone.name}
            onApply={(name) => onUpdateZone({ name: name.trim() || zone.name })}
            className="min-w-0 flex-1"
            inputClassName={`${field} w-full`}
          />
        </label>
        {show.outputContract?.kind !== 'portable-2d' && (
          <NumberField
            hideLabel
            label={`Nominal pixels ${zone.name}`}
            value={zone.nominalPixelCount}
            min={1}
            step={1}
            onChange={(nominalPixelCount) => onUpdateZone({ nominalPixelCount })}
          />
        )}
        <button
          type="button"
          aria-label={`Remove zone ${zone.name}`}
          title={`Remove ${zone.name}`}
          onClick={onRemoveZone}
          disabled={show.zones.length <= 1}
          className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-500 hover:border-red-900/70 hover:text-red-300 disabled:opacity-30 disabled:hover:border-zinc-800 disabled:hover:text-zinc-500"
        >
          <Trash2 size={13} />
        </button>
        <div className="text-[10px] uppercase tracking-wider md:col-span-3">
          {show.outputContract?.kind === 'portable-2d'
            ? <span className="text-sky-400">logical - normalized position membership</span>
            : <ZoneBindingStatus zone={zone} targetZones={targetZones} />}
        </div>
        {show.outputContract?.kind === 'installation' && (
          <div className="flex flex-wrap items-center gap-2 md:col-span-3">
            <button
              type="button"
              aria-label={`Select ${zone.name} LEDs on output map`}
              disabled={spatialSelectionUnavailableReason !== null}
              onClick={onOpenSpatialSelection}
              className="h-7 rounded border border-amber-500/30 bg-amber-500/10 px-2.5 text-[10px] font-semibold text-amber-200 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:border-zinc-800 disabled:bg-zinc-900 disabled:text-zinc-600"
            >
              Select LEDs on map
            </button>
            {spatialSelectionUnavailableReason && <span className="text-[10px] normal-case tracking-normal text-zinc-600">{spatialSelectionUnavailableReason}</span>}
          </div>
        )}
      </div>
    </InspectorPanel>
  )
}

function ZoneBindingStatus({
  zone,
  targetZones,
}: {
  zone: ShowRecord['zones'][number]
  targetZones: ControllerZone[]
}) {
  const bound = findControllerZoneByName(targetZones, zone.name)
  if (!targetZones.length) {
    return <span className="text-zinc-500">nominal - {zone.nominalPixelCount} px</span>
  }
  if (!bound) {
    return <span className="text-amber-300">unbound - nominal {zone.nominalPixelCount} px</span>
  }
  return <span className="text-green-400">bound - {controllerZonePixelCount(bound)} px</span>
}

function CompileBar({
  compiled,
  artifactInventory,
  pushResult,
}: {
  compiled: CompiledShowState
  artifactInventory: {
    inventory: DeliveredShowSourceInventory
    model: ShowArtifactInventoryModel
  } | null
  pushResult: string | null
}) {
  if (compiled.error) {
    return (
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-seam bg-zinc-950 px-3 font-mono text-xs text-amber-300">
        <Zap size={14} aria-hidden />
        {presentShowDiagnostic(compiled.error)}
      </div>
    )
  }
  const summary = compiled.artifact?.summary
  // Gauge, strips, and gating all share one numerator: delivered bytes
  // (generated source plus the stamped delivery header) — what actually
  // ships — against the same source budget (#63).
  const deliveredBytes = artifactInventory?.inventory.totalBytes ?? summary?.artifactBytes ?? 0
  const deliveredRatio = summary ? deliveredBytes / summary.measuredDeviceBudgetBytes : 0
  const pressure = summary ? assessShowCompilePressure({
    deliveredSourceBytes: deliveredBytes,
    budgetBytes: summary.measuredDeviceBudgetBytes,
    worstInstantRenderersPerPixel: summary.worstInstantRenderersPerPixel,
  }) : null
  // Renderer pressure must not tint the byte gauge, so its color comes from a
  // bytes-only assessment of the same delivered numerator.
  const sourcePressure = summary ? assessShowCompilePressure({
    deliveredSourceBytes: deliveredBytes,
    budgetBytes: summary.measuredDeviceBudgetBytes,
    worstInstantRenderersPerPixel: 0,
  }) : null
  return (
    <div data-testid="show-compile-bar" className="scrollbar-hidden min-h-8 shrink-0 overflow-x-auto border-t border-seam bg-zinc-950 px-3 font-mono text-[10px] text-zinc-500">
      <div className="flex min-h-8 min-w-max items-center gap-2 whitespace-nowrap">
      <span>Show source</span>
      <span
        className="h-2 w-28 overflow-hidden rounded-sm bg-zinc-800"
        aria-label={summary
          ? `Show source ${formatBytes(deliveredBytes)} of the ${formatBytes(summary.measuredDeviceBudgetBytes)} source budget. The budget is a source-size proxy, not remaining Controller capacity.`
          : undefined}
        title={summary
          ? `Show source ${formatBytes(deliveredBytes)} of the ${formatBytes(summary.measuredDeviceBudgetBytes)} source budget. The budget is a source-size proxy, not remaining Controller capacity.`
          : undefined}
      >
        <span
          className={`block h-full ${sourcePressure?.status === 'blocked' ? 'bg-red-500' : sourcePressure?.status === 'warning' ? 'bg-amber-400' : 'bg-live'}`}
          style={{ width: `${Math.min(100, deliveredRatio * 100)}%` }}
        />
      </span>
      {summary && artifactInventory ? (
        <ShowArtifactInventoryPopover
          inventory={artifactInventory.inventory}
          model={artifactInventory.model}
          vmWords={{
            used: summary.resources.totalWords,
            budget: summary.resources.vmWordBudget,
            remaining: summary.resources.remainingWords,
          }}
          renderers={{
            steady: summary.steadyStateRenderersPerPixel,
            worst: summary.worstInstantRenderersPerPixel,
          }}
          structure={{
            transitionCount: summary.transitionCount,
          }}
        />
      ) : (
        <b className="text-zinc-300">-</b>
      )}
      {summary?.resources && (
        <span className={summary.resources.remainingWords < 0 ? 'text-red-300' : 'text-sky-200'}>
          VM {summary.resources.totalWords.toLocaleString('en-US')}/{summary.resources.vmWordBudget.toLocaleString('en-US')} words
        </span>
      )}
      {compiled.artifactBlocker && <span className="text-red-300">Output blocked: {compiled.artifactBlocker}</span>}
      {pressure?.blocks.map((block) => <span key={block} className="text-red-300">Output blocked: {block}</span>)}
      {pressure?.warnings.map((warning) => <span key={warning} className="text-amber-300">{warning}</span>)}
      {summary?.warnings.map((warning) => <span key={warning} className="text-amber-300">{presentShowDiagnostic(warning)}</span>)}
      {pushResult && <span className="text-zinc-300">{pushResult}</span>}
      </div>
    </div>
  )
}

// Shared draft-buffered numeric field (#577) in the editor-panel style.
function NumberField(props: Omit<UiNumberFieldProps, 'variant' | 'align' | 'disabled'>) {
  return <UiNumberField variant="editor" {...props} />
}

function TimeField(props: Omit<UiTimeFieldProps, 'variant' | 'align' | 'ariaLabel' | 'disabled'>) {
  return <UiTimeField variant="editor" {...props} />
}

function PercentageField(props: Omit<UiPercentageFieldProps, 'variant' | 'align' | 'disabled'>) {
  return <UiPercentageField variant="editor" {...props} />
}

function DomainNumberField(props: Omit<UiDomainNumberFieldProps, 'variant' | 'align' | 'ariaLabel' | 'disabled'>) {
  return <UiDomainNumberField variant="editor" {...props} />
}

function ClipSummaryInline({
  summary,
  previousSummary,
}: {
  summary: ShowClipSummarySection[]
  previousSummary: ShowClipSummarySection[] | null
}) {
  const timelineSummary = projectShowClipTimelineSummary(summary, previousSummary)
  const values = timelineSummary.flatMap((section) => (
    section.items.filter((item) => item.showValue && item.displayValue)
  ))
  return (
    <span
      aria-hidden
      title={showClipInlineSummary(summary)}
      className="show-clip-summary-inline relative z-10 flex min-w-0 items-center gap-0.5 overflow-hidden whitespace-nowrap text-[10px] text-zinc-500 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]"
    >
      {values.length === 0 && <span className="show-clip-summary-copy shrink-0">defaults</span>}
      {values.map((item, index) => (
        <span key={`${item.id}:${index}`} className="show-clip-summary-value inline-flex items-center gap-1 font-mono text-zinc-400">
          {index > 0 && <span className="text-zinc-700">·</span>}
          <span>{item.displayValue}</span>
        </span>
      ))}
    </span>
  )
}

function compatibilityCellForTimelineClip(
  show: ShowRecord,
  clip: Pick<ShowUnifiedTimelineClipProjection, 'id' | 'segmentIds' | 'sceneId' | 'zoneId'>,
): ShowCell | null {
  const segmentIds = new Set(clip.segmentIds ?? [clip.id])
  return show.cells.find((cell) => {
    const baseId = `placement-${cell.id}-${clip.sceneId}`
    return segmentIds.has(baseId) || segmentIds.has(`${baseId}-${clip.zoneId}`)
  }) ?? null
}

function ClipConfigurationSummary({
  summary,
  animationCount,
  animationButtonRef,
  onAnimationsClick,
  destinationForItem,
  onNavigate,
}: {
  summary: ShowClipSummarySection[]
  animationCount?: number
  animationButtonRef?: RefObject<HTMLButtonElement | null>
  onAnimationsClick?: () => void
  destinationForItem?: (
    section: ShowClipSummarySection,
    item: ShowClipSummaryItem,
  ) => ShowClipSummaryDestination | null
  onNavigate?: (destination: ShowClipSummaryDestination) => void
}) {
  const visibleSummary = animationCount === undefined || animationCount === 0
    ? summary
    : summary.filter((section) => section.kind !== 'animation')
  return (
    <section
      role="region"
      aria-label="Clip summary"
      title={showClipInlineSummary(visibleSummary)}
      className="mt-0.5 flex max-h-7 min-h-3 flex-wrap items-center gap-x-3 gap-y-0.5 overflow-hidden font-mono text-[9px]"
    >
      {visibleSummary.length === 0 && !animationCount && <span className="text-zinc-600">Defaults</span>}
      {visibleSummary.map((section) => (
        <span
          key={section.kind}
          role="group"
          aria-label={`${section.label} summary`}
          className="inline-flex min-w-0 items-center gap-1.5"
        >
          <span
            title={section.label}
            aria-label={section.label}
            className={clipSummaryTone(section.kind)}
          >
            <ClipSummaryIcon kind={section.kind} size={11} />
          </span>
          {section.items.map((item, index) => {
            const destination = destinationForItem?.(section, item) ?? null
            const icon = clipSummaryItemIcon(section.kind, item.id)
            const content = (
              <>
                {index > 0 && <span aria-hidden className="mr-1.5 text-zinc-700">·</span>}
                {icon && (
                  <span aria-hidden className="mr-1 inline-flex translate-y-px text-zinc-500">
                    <ClipSummaryItemIcon icon={icon} size={11} />
                  </span>
                )}
                <span className="text-zinc-400">{item.label}</span>
                {item.value && (
                  <strong className={`ml-1 font-medium ${item.animated ? 'text-violet-300' : 'text-zinc-100'}`}>
                    {item.value}
                  </strong>
                )}
              </>
            )
            return destination ? (
              <button
                key={item.id}
                type="button"
                aria-label={`${item.label}${item.value ? ` ${item.value}` : ''}; go to ${destination.destinationLabel}`}
                onClick={() => onNavigate?.(destination)}
                className="inline-flex items-baseline whitespace-nowrap rounded border-0 bg-transparent p-0 text-left hover:bg-zinc-800/70 focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300"
              >
                {content}
              </button>
            ) : (
              <span key={item.id} className="inline-flex items-baseline whitespace-nowrap">
                {content}
              </span>
            )
          })}
        </span>
      ))}
      {animationCount !== undefined && animationCount > 0 && (
        <button
          ref={animationButtonRef}
          type="button"
          aria-label={`Animations — ${animationCount}`}
          onClick={onAnimationsClick}
          className="inline-flex h-5 items-center gap-1 rounded px-1 text-violet-300/90 hover:bg-violet-300/10 hover:text-violet-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-violet-200"
        >
          <Activity size={11} aria-hidden />
          <span>Animations — {animationCount}</span>
        </button>
      )}
    </section>
  )
}

function ClipSummaryIcon({ kind, size }: { kind: ShowClipSummaryKind; size: number }) {
  if (kind === 'playback') return <Clock3 size={size} aria-hidden />
  if (kind === 'controls') return <SlidersHorizontal size={size} aria-hidden />
  if (kind === 'view') return <Eye size={size} aria-hidden />
  if (kind === 'effects') return <WandSparkles size={size} aria-hidden />
  return <Activity size={size} aria-hidden />
}

type ClipSummaryItemIconKind = 'brightness' | 'transform' | 'rotation' | 'viewport'

/**
 * Distinct glyphs inside the View family (#666): Sun for Brightness, Move for
 * position/scale Transform facts, a circular arrow for Rotation, an empty
 * rectangle for Viewport. The Eye stays for opacity, mirror, and phase,
 * whether the fact is set or animated.
 */
function clipSummaryItemIcon(kind: ShowClipSummaryKind, itemId: string): ClipSummaryItemIconKind | null {
  if (kind !== 'view') return null
  if (itemId === 'brightness') return 'brightness'
  if (itemId === 'transform-rotation') return 'rotation'
  if (itemId.startsWith('transform-')) return 'transform'
  if (itemId === 'viewport' || itemId.startsWith('viewport-')) return 'viewport'
  return null
}

function ClipSummaryItemIcon({ icon, size }: { icon: ClipSummaryItemIconKind; size: number }) {
  if (icon === 'brightness') return <Sun size={size} aria-hidden />
  if (icon === 'transform') return <Move size={size} aria-hidden />
  if (icon === 'rotation') return <RotateCw size={size} aria-hidden />
  return <Square size={size} aria-hidden />
}

function clipSummaryTone(kind: ShowClipSummaryKind): string {
  if (kind === 'controls') return 'text-cyan-300/80'
  if (kind === 'view') return 'text-amber-200/75'
  if (kind === 'effects') return 'text-emerald-300/75'
  if (kind === 'animation') return 'text-violet-300/85'
  return 'text-zinc-400'
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return rest === 0 ? `${minutes}m` : `${minutes}m ${rest}s`
}

function cellCoveringScene(show: ShowRecord, zoneId: string, targetSceneIndex: number): ShowCell | undefined {
  return show.cells.find((cell) => {
    const cellZoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
    const targetZoneIndex = show.zones.findIndex((zone) => zone.id === zoneId)
    if (cellZoneIndex < 0 || targetZoneIndex < cellZoneIndex || targetZoneIndex >= cellZoneIndex + (cell.zoneSpan ?? 1)) return false
    const start = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
    return start >= 0 && targetSceneIndex >= start && targetSceneIndex < start + cell.sceneSpan
  })
}

function formatTimeScale(value: number): string {
  return formatDomainNumber('multiplier', value, 0.01)
}

function formatRepeatScale(value: number): string {
  return formatDomainNumber('multiplier', value, 0.01)
}

function formatBrightness(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatControlValue(value: number): string {
  return Number(value.toFixed(2)).toString()
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function targetZonePixelTotal(zones: ControllerZone[] | undefined): number {
  return zones?.reduce((sum, zone) => sum + controllerZonePixelCount(zone), 0) ?? 0
}
