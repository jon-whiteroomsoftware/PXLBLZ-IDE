import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent, type SetStateAction } from 'react'
import { createPortal } from 'react-dom'
import { Activity, BookOpen, Check, ChevronDown, ChevronRight, Clock3, Code2, Copy, Download, Eye, Flag, Grid2X2, Info, Layers3, Lightbulb, ListChecks, Lock, Magnet, Map as MapIcon, Maximize2, Pause, Play, Plus, Redo2, Repeat2, RotateCcw, RotateCw, Route, Scissors, Settings2, SkipBack, SlidersHorizontal, SplitSquareHorizontal, Trash2, Undo2, WandSparkles, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NumberField as UiNumberField, type NumberFieldProps as UiNumberFieldProps } from '@/components/ui/number-field'
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
import { ShowEffectPalette } from '@/components/ShowEffectsAuthoring'
import { ShowClipEntityDetail } from '@/components/ShowClipEntityDetail'
import { ShowPatternInstanceControls } from '@/components/ShowPatternInstanceControls'
import { ShowTransitionPalette, ShowTransitionParameters } from '@/components/ShowTransitionAuthoring'
import { ShowLayerTransitionPalette } from '@/components/ShowLayerTransitionPalette'
import { ShowLayerTransitionEditor } from '@/components/ShowLayerTransitionEditor'
import { ShowArtifactInventoryPopover } from '@/components/ShowArtifactInventoryPopover'
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import { PatternDeploymentActions } from '@/components/PatternDeploymentActions'
import { PatternCombobox, type PatternComboboxOption } from '@/components/PatternCombobox'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { PatternPushChoices } from '@/components/SendToController'
import { PushConfirmPopover } from '@/components/PushConfirmPopover'
import { describeSendToController, isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import { prepareShowControllerArtifact } from '@/engine/showControllerArtifact'
import { assessShowCompilePressure } from '@/engine/showCompilePressure'
import type { ArtifactMapClass } from '@/engine/artifactStamp'
import { trackEvent } from '@/analytics'
import {
  projectShowStrip,
  showSplitCapability,
  formatShowRoutingRanges,
  parseShowRoutingRanges,
  showLoopDurationMs,
  projectShowTimeline,
  showVisualTransitionAfter,
  transitionCost,
} from '@/engine/showModel'
import { compileShowForArtifact, sourceForShowCell, sourceForShowPatternRef, type CompiledShowState } from '@/engine/showPreviewArtifact'
import {
  deleteShowMainPlacement,
  deleteShowOverlayPlacement,
  projectFlatShowToCompositionV1,
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
  projectGlobalShowClipSummary,
  showClipInlineSummary,
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
  fitShowTimelineViewport,
  panShowTimelineViewport,
  rangeThumbCenterOffsetPx,
  resizeShowTimelineViewport,
  showTimelineThumb,
  snapShowTimelineTime,
  zoomShowTimelineViewport,
  type ShowTimelineViewport,
} from '@/engine/showTimelineViewport'
import {
  projectShowUnifiedTimeline,
  type ShowUnifiedTimelineClipProjection,
  type ShowUnifiedTimelineJunctionProjection,
} from '@/engine/showUnifiedTimelineProjection'
import {
  nextShowTimelineTraversalTarget,
  projectShowTimelineTraversalTargets,
  showTimelineTraversalTargetKey,
  type ShowTimelineTraversalTarget,
} from '@/engine/showTimelineKeyboard'
import { claimStudioPreviewSpace } from '@/engine/keyboardShortcuts'
import {
  addShowOverlayLayerAcrossTimeline,
  addShowMainClipAtGlobalTime,
  duplicateShowClipAfter,
  makeShowClipPatternIndependent,
  planShowMainClipAtGlobalTime,
  projectShowClipPatternInstanceOwnership,
  rejoinShowClipPatternInstance,
  splitShowClipAtGlobalTime,
  type ShowTimelineClipMoveTarget,
  type ShowTimelineClipOwner,
} from '@/engine/showTimelineClipAuthoring'
import {
  deleteShowClipWithLayerTransitions,
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
  planShowLayerTransitionInsertion,
  resizeShowLayerTransition,
  resizeShowConnectedClipAtGlobalTime,
  resetShowLayerTransitionToCut,
  showLayerTransitionsConnectedToClip,
} from '@/engine/showLayerTransitionAuthoring'
import {
  completeShowGroupSelection,
  createShowGroupFromSelection,
  deleteShowGroupOccurrence,
  duplicateShowGroupOccurrence,
  makeShowGroupOccurrenceUnique,
  projectShowGroupRuntimePatternInstances,
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
  updateShowTimelineMarker,
} from '@/engine/showTimelineAuthoring'
import { buildShowEpeExport, type ShowEpeExport } from '@/engine/showEpeExport'
import {
  buildDeliveredShowSourceInventory,
  buildShowArtifactInventoryModel,
  describeShowArtifactPatterns,
  type DeliveredShowSourceInventory,
  type ShowArtifactInventoryModel,
} from '@/engine/showSourceInventory'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'
import { showKeyboardSeekStepMs } from '@/engine/showKeyboardSeek'
import { SHOW_EASING_OPTIONS, showEasingFromOptionId, showEasingOptionId } from '@/engine/showEasing'
import { currentShowReferenceExample, type ShowReferenceGuide } from '@/engine/showReferenceShow'
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
import { usePreviewStore } from '@/store/previewStore'
import { useShowTransportStore } from '@/store/showTransportStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { docExternalHref } from '@/docs/catalog'
import type { StockShowNote } from '@/pixelblaze/stock/shows'
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
const EMPTY_ZONE_IDS: string[] = []
const clipBase =
  'show-timeline-clip relative z-10 flex min-h-[44px] flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border-0 border-l-[3px] px-2 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live'

function ShowEasingOptions() {
  return SHOW_EASING_OPTIONS.map((option) => (
    <option key={option.id} value={option.id}>{option.label}</option>
  ))
}

type ShowSelection =
  | { kind: 'clip'; clipId: string }
  | { kind: 'transition'; transitionId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'group'; occurrenceId: string }
  | { kind: 'group-clip'; occurrenceId: string; placementId: string }
  | { kind: 'multi'; groupSelection: ShowGroupSelection }
  | { kind: 'show' }

function showSelectionKey(selection: ShowSelection): string {
  if (selection.kind === 'clip') return `clip:${selection.clipId}`
  if (selection.kind === 'transition') return `transition:${selection.transitionId}`
  if (selection.kind === 'zone') return `zone:${selection.zoneId}`
  if (selection.kind === 'group') return `group:${selection.occurrenceId}`
  if (selection.kind === 'group-clip') return `group-clip:${selection.occurrenceId}:${selection.placementId}`
  if (selection.kind === 'multi') return 'multi'
  return 'show'
}

function sameShowSelection(left: ShowSelection, right: ShowSelection): boolean {
  return showSelectionKey(left) === showSelectionKey(right)
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
}

function ShowNoteTrigger({ note, open, onToggle }: {
  note: StockShowNote
  open: boolean
  onToggle: () => void
}) {
  const numberLabel = note.number ? `${note.number} ` : ''
  const actionLabel = open ? 'Collapse' : 'Open'
  return (
    <Button
      size="icon-xs"
      variant="ghost"
      aria-label={`${actionLabel} ${numberLabel}${note.title} guide`}
      aria-expanded={open}
      title={`${actionLabel} ${numberLabel}${note.title} guide`}
      className={`show-note-trigger ${open
        ? 'aria-expanded:!bg-zinc-800/70 aria-expanded:!text-zinc-300 hover:!bg-zinc-700/70 hover:!text-zinc-100'
        : 'aria-expanded:!bg-transparent aria-expanded:!text-zinc-500 hover:!bg-zinc-800 hover:!text-zinc-300'}`}
      onClick={onToggle}
    >
      <BookOpen size={12} aria-hidden />
    </Button>
  )
}

function ShowNoteDisclosure({
  note,
  show,
  reference,
  patternOptions,
  selectedPattern,
  onSelectPattern,
  onResetPattern,
  onCollapse,
}: {
  note: StockShowNote
  show: ShowRecord
  reference?: ShowReferenceGuide
  patternOptions: ShowPatternOption[]
  selectedPattern?: ShowCell['pattern']
  onSelectPattern: (pattern: ShowCell['pattern']) => void
  onResetPattern: () => void
  onCollapse: () => void
}) {
  const title = note.number ? `${note.number} ${note.title}` : note.title
  return (
    <section
      role="region"
      aria-label={`${title} guide`}
      className="shrink-0 select-none border-b border-cyan-200/20 bg-[#0d171b] text-[10px]"
    >
      <button
        type="button"
        aria-label={`Collapse ${note.number ? `${note.number} ` : ''}guide`}
        className="flex h-8 w-full items-center gap-2 px-3 text-left hover:bg-white/[0.025] focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-cyan-200"
        onClick={onCollapse}
      >
        <Info size={12} aria-hidden className="shrink-0 text-cyan-200/80" />
        <span className="shrink-0 font-semibold uppercase tracking-[0.1em] text-cyan-200/85">{note.label}</span>
        <strong className="truncate font-medium text-zinc-200">{note.number ? `${note.number} · ` : ''}{note.title}</strong>
        <span className="ml-1 hidden items-center gap-1 text-[9px] text-zinc-600 sm:flex">
          <RotateCcw size={10} aria-hidden />
          Built-in Show · edits last until reload
        </span>
        <ChevronDown size={12} aria-hidden className="ml-auto shrink-0 rotate-180 text-zinc-500" />
      </button>
      {reference && (
        <ShowReferenceInstrument
          show={show}
          reference={reference}
          patternOptions={patternOptions}
          selectedPattern={selectedPattern}
          onSelectPattern={onSelectPattern}
          onResetPattern={onResetPattern}
        />
      )}
      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(220px,1fr)] gap-4 border-t border-zinc-800/80 px-3 py-2.5 max-[720px]:grid-cols-1 max-[720px]:gap-2">
        <div>
          <p className="max-w-[72ch] leading-4 text-zinc-300">{note.purpose}</p>
          <p className="mt-1.5 flex items-start gap-1.5 leading-4 text-zinc-500">
            <Lightbulb size={11} aria-hidden className="mt-0.5 shrink-0 text-violet-300/70" />
            <span><b className="font-medium text-violet-200/75">Notice:</b> {note.notice}</span>
          </p>
        </div>
        <div className="border-l border-zinc-800 pl-3 max-[720px]:border-l-0 max-[720px]:border-t max-[720px]:pl-0 max-[720px]:pt-2">
          <span className="flex items-center gap-1 font-semibold uppercase tracking-[0.09em] text-zinc-400">
            <ListChecks size={10} aria-hidden className="text-cyan-200/75" /> Try this
          </span>
          <ul className="mt-1.5 space-y-1 text-zinc-400">
            {note.prompts.map((prompt) => (
              <li key={prompt} className="flex gap-1.5">
                <i aria-hidden className="mt-[5px] size-1 shrink-0 rounded-full bg-cyan-200/60" />
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
  patternOptions,
  selectedPattern,
  onSelectPattern,
  onResetPattern,
}: {
  show: ShowRecord
  reference: ShowReferenceGuide
  patternOptions: ShowPatternOption[]
  selectedPattern?: ShowCell['pattern']
  onSelectPattern: (pattern: ShowCell['pattern']) => void
  onResetPattern: () => void
}) {
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const current = currentShowReferenceExample(show, reference, positionMs)
  const currentIndex = current ? reference.examples.findIndex((example) => example.id === current.id) : -1
  const durationMs = showLoopDurationMs(show)
  const progress = durationMs > 0 ? Math.max(0, Math.min(1, positionMs / durationMs)) : 0
  const authoredPattern = reference.patternSlots
    ? show.cells.find((cell) => reference.patternSlots?.cellIds.includes(cell.id))?.pattern
      ?? show.composition?.patternInstances.find((instance) => reference.patternSlots?.instanceIds.includes(instance.id))?.pattern
    : undefined
  const activePattern = selectedPattern ?? authoredPattern
  const activeValue = activePattern ? `${activePattern.kind}:${activePattern.id}` : null
  const easingOption = current?.easing
    ? SHOW_EASING_OPTIONS.find((option) => option.id === showEasingOptionId(current.easing!))
    : undefined

  return (
    <div
      role="group"
      aria-label={`${show.name} reference controls`}
      className="border-t border-cyan-200/15 bg-cyan-200/[0.025] px-3 py-2"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(220px,320px)] items-start gap-4 max-[720px]:grid-cols-1 max-[720px]:gap-2">
        <div className="min-w-0">
          <span className="font-semibold uppercase tracking-[0.11em] text-cyan-200/70">Reference mode</span>
          <p className="mt-0.5 max-w-[80ch] leading-4 text-zinc-400">{reference.summary}</p>
        </div>
        {reference.patternSlots && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-1.5">
            <label className="min-w-0 font-semibold uppercase tracking-[0.09em] text-zinc-500">
              Try with Pattern
              <PatternCombobox
                ariaLabel="Try with Pattern"
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
                  if (option) onSelectPattern(option.ref)
                }}
              />
            </label>
            <Button
              size="xs"
              variant="ghost"
              aria-label="Reset Pattern"
              title="Reset to the authored reference Pattern"
              disabled={!selectedPattern}
              className="mb-0 h-6 bg-zinc-900/70 text-[9px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
              onClick={onResetPattern}
            >
              <RotateCw size={10} aria-hidden /> Reset
            </Button>
          </div>
        )}
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

export function ShowEditor({
  showId,
  showOverride,
  readOnly = false,
  builtInContext,
  headerGuideTarget = null,
  headerActionsTarget = null,
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
    reference?: ShowReferenceGuide
  }
  headerGuideTarget?: HTMLElement | null
  headerActionsTarget?: HTMLElement | null
  onOpenStagePreview?: (anchor: HTMLElement) => void
}) {
  const savedShow = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const hasStockDraft = useShowStore((state) => Boolean(state.stockShowDrafts[showId]))
  const resetStockShowDraft = useShowStore((state) => state.resetStockShowDraft)
  const updateShow = useShowStore((state) => state.updateShow)
  const updateBoundaryTransition = useShowStore((state) => state.updateBoundaryTransition)
  const removeBoundaryTransition = useShowStore((state) => state.removeBoundaryTransition)
  const removeClip = useShowStore((state) => state.removeClip)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellControlTarget = useShowStore((state) => state.updateCellControlTarget)
  const updateCellRestartOnEntry = useShowStore((state) => state.updateCellRestartOnEntry)
  const extendCell = useShowStore((state) => state.extendCell)
  const spanCellZones = useShowStore((state) => state.spanCellZones)
  const updateCellZoneMode = useShowStore((state) => state.updateCellZoneMode)
  const addZone = useShowStore((state) => state.addZone)
  const updateZone = useShowStore((state) => state.updateZone)
  const removeZone = useShowStore((state) => state.removeZone)
  const showNoteOpen = useShowEditorSessionStore((state) => (
    state.showNoteOpenById[showId] ?? builtInContext?.note?.defaultOpen ?? false
  ))
  const setShowNoteOpen = useShowEditorSessionStore((state) => state.setShowNoteOpen)
  const selectedReferencePattern = useShowEditorSessionStore((state) => state.referencePatternByShowId[showId])
  const setReferencePattern = useShowEditorSessionStore((state) => state.setReferencePattern)
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
  const lastSavedSource = useControllerStore((state) => state.lastSavedSource)
  const pushGeneratedArtifact = useControllerStore((state) => state.pushGeneratedArtifact)
  const clearPushResult = useControllerStore((state) => state.clearPushResult)
  const [selection, setSelection] = useState<ShowSelection>({ kind: 'show' })
  const [isolatedGroupOccurrenceId, setIsolatedGroupOccurrenceId] = useState<string | null>(null)
  const [generatedOpen, setGeneratedOpen] = useState(false)
  const [showSendMode, setShowSendMode] = useState<SendMode>('run')
  const [pendingSendMode, setPendingSendMode] = useState<SendMode | null>(null)
  const [preparingSave, setPreparingSave] = useState(false)
  const [compositionClipPendingDelete, setCompositionClipPendingDelete] = useState<ShowTimelineClipOwner | null>(null)
  const [spatialZoneSelection, setSpatialZoneSelection] = useState<{ zoneId: string; layoutId: string } | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailAnchor, setDetailAnchor] = useState<HTMLElement | null>(null)
  const [pinnedDetail, setPinnedDetail] = useState<{ selection: ShowSelection; anchor: HTMLElement } | null>(null)
  const [detailsSuppressed, setDetailsSuppressed] = useState(false)
  const [effectPaletteOwner, setEffectPaletteOwner] = useState<ShowClipInspectorOwner | null>(null)
  const [groupEffectPaletteOwner, setGroupEffectPaletteOwner] = useState<ShowGroupClipOwner | null>(null)
  const [transitionPaletteId, setTransitionPaletteId] = useState<string | null>(null)
  const [layerTransitionTarget, setLayerTransitionTarget] = useState<ShowLayerTransitionTarget | null>(null)
  const detailShowIdRef = useRef(showId)
  const timelineWorkspaceRef = useRef<HTMLElement>(null)
  const lastTimelineFocusRef = useRef<HTMLElement | null>(null)
  const closeDetailPanel = useCallback((restoreFocus = false) => {
    const previousAnchor = detailAnchor
    setEffectPaletteOwner(null)
    setGroupEffectPaletteOwner(null)
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
    setGeneratedOpen(false)
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
    setEffectPaletteOwner(null)
    setGroupEffectPaletteOwner(null)
    setTransitionPaletteId(null)
    setLayerTransitionTarget(null)
    setCompositionClipPendingDelete(null)
    setIsolatedGroupOccurrenceId(null)
  }, [showId])
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

  const activeShow = showOverride ?? savedShow ?? null
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

  const requestDeleteSelection = useCallback((targetSelection: ShowSelection): boolean => {
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
      if (!activeShow.cells.some((cell) => cell.id === targetSelection.clipId)) return false
      closeDetailPanel()
      closePinnedDetailForSelection(targetSelection)
      void removeClip(activeShow.id, targetSelection.clipId)
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
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' && event.key !== 'Backspace') return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return
      if (requestDeleteSelection(selection)) event.preventDefault()
    }
    document.addEventListener('keydown', handleDelete)
    return () => document.removeEventListener('keydown', handleDelete)
  }, [requestDeleteSelection, selection])
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || effectPaletteOwner !== null || groupEffectPaletteOwner !== null || transitionPaletteId !== null) return
      if (!detailPanelOpen && !pinnedDetail && !isolatedGroupOccurrenceId && selection.kind === 'show') return
      event.preventDefault()
      if (detailPanelOpen || pinnedDetail) {
        closeDetailPanel(true)
        setPinnedDetail(null)
        return
      }
      if (isolatedGroupOccurrenceId) {
        closeDetailPanel()
        setIsolatedGroupOccurrenceId(null)
        setSelection({ kind: 'group', occurrenceId: isolatedGroupOccurrenceId })
        window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
        return
      }
      setSelection({ kind: 'show' })
      window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [closeDetailPanel, detailPanelOpen, effectPaletteOwner, groupEffectPaletteOwner, isolatedGroupOccurrenceId, pinnedDetail, selection.kind, transitionPaletteId])
  useEffect(() => {
    if (!detailPanelOpen) return
    const handleOutsidePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('[role="dialog"], [role="alertdialog"]')) return
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
  const compiled = useMemo(
    () => activeShow
      ? compileShowForArtifact(activeShow, userPatterns, targetProfile?.zones, {}, {
          stageDimension,
          targetPixelCount: activeShow.outputContract?.kind === 'portable-2d'
            ? activeControllerProfile?.lastKnownPixelCount
            : undefined,
        })
      : { artifact: null, error: null },
    [activeControllerProfile?.lastKnownPixelCount, activeShow, stageDimension, userPatterns, targetProfile?.zones],
  )
  const compilePressure = useMemo(() => compiled.artifact
    ? assessShowCompilePressure({
        artifactBytes: compiled.artifact.summary.artifactBytes,
        budgetBytes: compiled.artifact.summary.measuredDeviceBudgetBytes,
        worstInstantRenderersPerPixel: compiled.artifact.summary.worstInstantRenderersPerPixel,
      })
    : null, [compiled.artifact])
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
  const patternControlsByInstanceId = useMemo(() => Object.fromEntries((activeShow?.composition
    ? [
        ...activeShow.composition.patternInstances,
        ...projectShowGroupRuntimePatternInstances(activeShow.composition),
      ]
    : []).map((instance) => {
    try {
      return [instance.id, discoverAutomatablePatternControls(sourceForShowPatternRef(instance.pattern, userPatterns), {})]
    } catch {
      return [instance.id, []]
    }
  })), [activeShow, userPatterns]) as Record<string, AutomatablePatternControl[]>
  const timelineComposition = useMemo<ShowCompositionV1 | null>(() => {
    if (!activeShow) return null
    if (activeShow.composition) return activeShow.composition
    try {
      return {
        ...projectFlatShowToCompositionV1(activeShow, {
          byCellId: Object.fromEntries(activeShow.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)])),
          stageDimension,
        }),
        executionModel: 'deterministic-loop',
      }
    } catch {
      return null
    }
  }, [activeShow, stageDimension, userPatterns])
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
  const inspectorShow = activeShow && timelineComposition && !activeShow.composition
    ? { ...activeShow, composition: timelineComposition }
    : activeShow
  const effectPaletteValue = inspectorShow && effectPaletteOwner
    ? projectShowClipInspector(inspectorShow, effectPaletteOwner)
    : null
  const groupEffectPaletteValue = inspectorShow && groupEffectPaletteOwner
    ? projectShowGroupClipInspector(inspectorShow, groupEffectPaletteOwner)
    : null
  const layerTransitionPlan = activeShow && timelineComposition && layerTransitionTarget
    ? planShowLayerTransitionInsertion(activeShow, timelineComposition, {
        fromPlacementId: layerTransitionTarget.junction.leftClipId,
        toPlacementId: layerTransitionTarget.junction.rightClipId,
      })
    : null
  const pendingConnectedTransitions = timelineComposition && compositionClipPendingDelete
    ? showLayerTransitionsConnectedToClip(timelineComposition, compositionClipPendingDelete.placementId)
    : []
  const commitClipInspectorPatch = (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow || !inspectorShow) return Promise.resolve()
    const next = updateShowClipInspector(inspectorShow, owner, patch)
    return next !== inspectorShow ? Promise.resolve(updateShow(activeShow.id, next)) : Promise.resolve()
  }
  const commitGroupClipInspectorPatch = (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => {
    if (!activeShow) return Promise.resolve()
    const next = updateShowGroupClipInspector(activeShow, owner, patch)
    if (next === activeShow || !next.composition || validateShowGroups(next, next.composition).length > 0) return Promise.resolve()
    return Promise.resolve(updateShow(activeShow.id, next))
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
      }),
    }
  }, [activeShow, compiled.artifact, inspectableShowExport])
  const activeControllerMapDim = activeController?.mapDim ?? null
  const activeControllerFirmware = activeController?.firmwareVersion
  const controllerCompatibilityContext = useMemo(() => {
    const pixelCount = activeControllerProfile?.lastKnownPixelCount
    const fingerprint = activeControllerProfile?.mapFingerprints?.find((record) => (
      pixelCount === undefined || record.devicePixelCount === pixelCount
    )) ?? activeControllerProfile?.mapFingerprints?.[0]
    const installedMap = fingerprint
      ? [...STOCK_MAPS, ...userMaps].find((map) => map.id === fingerprint.mapId)
      : undefined
    const mapClass = installedMap
      ? ('kind' in installedMap ? installedMap.kind : 'custom') as ArtifactMapClass
      : undefined
    return {
      ...(pixelCount !== undefined ? { pixelCount } : {}),
      ...(fingerprint
        ? {
            map: {
              id: fingerprint.mapId,
              name: fingerprint.mapName,
              fingerprint: fingerprint.hash,
              ...(mapClass ? { mapClass } : {}),
            },
          }
        : {}),
    }
  }, [activeControllerProfile, userMaps])
  const preparedControllerArtifact = useMemo(() => {
    if (compiled.artifactBlocker) {
      return { value: null, error: compiled.artifactBlocker }
    }
    if (compilePressure?.status === 'blocked') {
      return { value: null, error: compilePressure.blocks.join(' ') }
    }
    if (!showExport) return { value: null, error: null }
    try {
      return {
        value: prepareShowControllerArtifact(
          showExport.source,
          activeControllerMapDim,
          activeControllerFirmware,
          controllerCompatibilityContext,
        ),
        error: null,
      }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Could not prepare Show for Controller',
      }
    }
  }, [activeControllerFirmware, activeControllerMapDim, compilePressure, compiled.artifactBlocker, controllerCompatibilityContext, showExport])
  const compileBarPushResult = preparedControllerArtifact.error
    && preparedControllerArtifact.error !== compiled.artifactBlocker
    ? preparedControllerArtifact.error
    : controllerPushResult
      ? controllerPushResult.ok ? 'Sent to Controller' : controllerPushResult.message
      : null

  useEffect(() => {
    if (!controllerPushResult) return
    const timeout = window.setTimeout(clearPushResult, 3500)
    return () => window.clearTimeout(timeout)
  }, [clearPushResult, controllerPushResult])
  const buildDownloadExport = async (): Promise<ShowEpeExport | null> => {
    if (!activeShow || !compiled.artifact || compiled.artifactBlocker || compilePressure?.status === 'blocked') return null
    const preview = await buildPreviewJpeg(compiled.artifact)
    if (!preview) throw new Error('Could not render the EPE preview image')
    return buildShowEpeExport(activeShow, compiled.artifact.code, {
      id: makeProgramId(),
      preview: bytesToBase64(preview),
      stampedAt: new Date(activeShow.updatedAt),
      userMaps,
      attribution: compiled.artifact.attribution,
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

  if (generatedOpen && compiled.artifact && !compiled.artifactBlocker) {
    return (
      <div className="flex h-full min-h-0 flex-col bg-zinc-950">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b border-seam px-3 font-mono text-xs text-zinc-400">
          <Code2 size={14} aria-hidden />
          <span className="flex-1 truncate text-zinc-200">Generated pattern - {activeShow.name}</span>
          <ExportShowButton exported={showExport} buildExport={buildDownloadExport} />
          <Button
            size="xs"
            variant="ghost"
            className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300"
            onClick={() => setGeneratedOpen(false)}
          >
            Back to show
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <PixelblazeCodeEditor value={showExport?.source ?? compiled.artifact.code} readOnly />
        </div>
      </div>
    )
  }

  const showArtifactId = `show:${activeShow.id}`
  const activeShowName = activeShow.name
  const preparedSource = preparedControllerArtifact.value?.source ?? ''
  const alreadySent = (mode: SendMode) => isAlreadyPushed({
    mode,
    source: preparedSource,
    lastRunSource: activeIp ? lastPushedSource[activeIp]?.[showArtifactId] : undefined,
    lastSavedSource: activeIp ? lastSavedSource[activeIp]?.[showArtifactId] : undefined,
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

  async function sendShow(mode: SendMode) {
    const prepared = preparedControllerArtifact.value
    if (!prepared || !compiled.artifact) return
    setPendingSendMode(null)
    setShowSendMode(mode)
    setPreparingSave(mode === 'save')
    try {
      const previewImage = mode === 'save'
        ? (await buildPreviewJpeg(compiled.artifact).catch(() => null)) ?? undefined
        : undefined
      trackEvent('send_to_controller', {
        mode,
        pattern_key: showArtifactId,
        controller_phase: activeController?.phase ?? controllerStatus.kind,
      })
      await pushGeneratedArtifact({
        artifactId: showArtifactId,
        source: prepared.source,
        name: activeShowName,
        persist: mode === 'save',
        artifactStamp: prepared.artifactStamp,
        previewImage,
      })
    } finally {
      setPreparingSave(false)
    }
  }

  function requestShowSend(mode: SendMode) {
    setShowSendMode(mode)
    if ((preparedControllerArtifact.value?.warnings.length ?? 0) > 0) {
      setPendingSendMode(mode)
      return
    }
    void sendShow(mode)
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
          className="bg-zinc-900/60 text-[11px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300 disabled:opacity-40"
          disabled={!hasStockDraft && !selectedReferencePattern}
          onClick={() => {
            resetStockShowDraft(showId)
            setReferencePattern(showId, null)
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
        className="bg-zinc-800/70 text-[11px] text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
        disabled={!compiled.artifact || Boolean(compiled.artifactBlocker)}
        onClick={() => setGeneratedOpen(true)}
      >
        <Code2 size={13} aria-hidden />
        <span className="show-header-action-label">View code</span>
      </Button>
      <ExportShowButton exported={showExport} buildExport={buildDownloadExport} />
      <PushConfirmPopover
        open={pendingSendMode !== null}
        onCancel={() => setPendingSendMode(null)}
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
          warnings={preparedControllerArtifact.value?.warnings ?? []}
          blocked={preparedControllerArtifact.value?.blocked ?? true}
          remedy={null}
          onCancel={() => setPendingSendMode(null)}
          confirmWithMap={async () => {}}
          confirmOnly={async () => {
            if (pendingSendMode) await sendShow(pendingSendMode)
          }}
        />
      </PushConfirmPopover>
    </>
  )
  const pinnedDetailAnchor = pinnedDetail?.anchor ?? null

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950/75 font-mono text-xs text-zinc-400">
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
          patternOptions={referencePatternOptions}
          selectedPattern={selectedReferencePattern}
          onSelectPattern={(pattern) => setReferencePattern(showId, pattern)}
          onResetPattern={() => setReferencePattern(showId, null)}
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
            <ShowTimelineWorkspace
                key={activeShow.id}
                show={activeShow}
                timelineComposition={timelineComposition}
                readOnly={readOnly}
                transportActive
                patternControlsByCellId={patternControlsByCellId}
                selection={selection}
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
                onAddClipAtPlayhead={async ({ zoneId, globalTimeMs, pattern, patternName }) => {
                  if (!timelineComposition) return null
                  const instanceId = newPersonalContentId()
                  const placementId = newPersonalContentId()
                  const nextComposition = addShowMainClipAtGlobalTime(activeShow, timelineComposition, {
                    zoneId,
                    globalTimeMs,
                    instance: {
                      id: instanceId,
                      pattern,
                      patternName,
                      time: { timeScale: 1, timeOffsetMs: 0 },
                    },
                    placementId,
                  })
                  if (nextComposition === timelineComposition) return null
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  })
                  return placementId
                }}
                onMoveCompositionClip={async ({ owner, target }) => {
                  if (!timelineComposition) return false
                  const nextComposition = moveShowConnectedClipAtGlobalTime(activeShow, timelineComposition, { owner, target })
                  if (nextComposition === timelineComposition) return false
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: nextComposition,
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
                onResizeCompositionClip={async (owner, globalStartMs, durationMs) => {
                  if (!timelineComposition) return false
                  const nextComposition = resizeShowConnectedClipAtGlobalTime(activeShow, timelineComposition, {
                    owner,
                    globalStartMs,
                    durationMs,
                  })
                  if (nextComposition === timelineComposition) return false
                  await updateShow(activeShow.id, {
                    ...activeShow,
                    composition: nextComposition,
                    updatedAt: Date.now(),
                  })
                  return true
                }}
                onOpenLayerTransition={setLayerTransitionTarget}
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
                onAppendLayoutInterval={async (layoutId, durationMs) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
                  const next = appendShowLayoutInterval(basis, { layoutId, durationMs })
                  if (next === basis) return false
                  await updateShow(activeShow.id, next)
                  return true
                }}
                onInsertLayoutInterval={async (layoutId, durationMs, atMs) => {
                  if (!timelineComposition) return false
                  const basis = { ...activeShow, composition: timelineComposition }
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
            return (
            <ShowEntityDetailPanel
              key={detail.id}
              anchor={detail.anchor}
              ownerKey={showSelectionKey(detail.selection)}
              pinned={detail.pinned}
              avoidPinnedPanel={!detail.pinned}
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
              <div onChangeCapture={returnFocusAfterDiscreteCommit}>
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
                <fieldset
                  disabled={readOnly}
                  data-read-only={readOnly ? 'true' : undefined}
                  className={readOnly
                    ? 'contents [&_input:disabled]:cursor-default [&_input:disabled]:border-zinc-800 [&_input:disabled]:bg-zinc-950/35 [&_input:disabled]:text-zinc-300 [&_input:disabled]:opacity-100 [&_select:disabled]:cursor-default [&_select:disabled]:border-zinc-800 [&_select:disabled]:bg-zinc-950/35 [&_select:disabled]:text-zinc-300 [&_select:disabled]:opacity-100 [&_button:disabled]:cursor-not-allowed [&_button:disabled]:opacity-45'
                    : 'contents'}
                >
                  <ContextualInspector
              show={activeShow}
                  compositionShow={inspectorShow ?? activeShow}
                  selection={detail.selection}
                  selectedClip={detailSelectedClip}
                  selectedCompositionClipOwner={detailSelectedCompositionClipOwner}
                  selectedGroupClipOwner={detailSelectedGroupClipOwner}
                  transformEnabled={stageDimension === 2}
                  patternOptions={patternOptions}
                  patternControlsByCellId={patternControlsByCellId}
                  patternControlsByInstanceId={patternControlsByInstanceId}
                  compiledCost={compiled.artifact?.summary.cost}
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
                    void removeClip(activeShow.id, clip.id)
                  }}
                  onUpdateAdaptations={(cell, changes) => void updateCellAdaptations(activeShow.id, cell.id, changes)}
                  onUpdateClipInspector={commitClipInspectorPatch}
                  onUpdateGroupClipInspector={commitGroupClipInspectorPatch}
                  onOpenEffects={(cell) => setEffectPaletteOwner({ kind: 'global', cellId: cell.id })}
                  onOpenCompositionEffects={setEffectPaletteOwner}
                  onOpenGroupEffects={setGroupEffectPaletteOwner}
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
                    void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                  }}
                  onUpdateControlTarget={(cell, exportName, value) => void updateCellControlTarget(activeShow.id, cell.id, exportName, value)}
                  onUpdateRestartOnEntry={(cell, restartOnEntry) => void updateCellRestartOnEntry(activeShow.id, cell.id, restartOnEntry)}
                  onExtend={(cell, sceneSpan) => void extendCell(activeShow.id, cell.id, sceneSpan)}
                  onSpanZones={(cell, zoneSpan) => void spanCellZones(activeShow.id, cell.id, zoneSpan)}
                  onUpdateCellZoneMode={(cell, zoneMode) => void updateCellZoneMode(activeShow.id, cell.id, zoneMode)}
                  onUpdateBoundaryTransition={(transitionId, changes) => void updateBoundaryTransition(activeShow.id, transitionId, changes)}
                  onOpenTransitions={(transitionId) => setTransitionPaletteId(transitionId)}
                  onRemoveBoundaryTransition={(transitionId) => {
                    closeDetailPanel()
                    void removeBoundaryTransition(activeShow.id, transitionId)
                  }}
                  onAddZone={() => {
                    timelineWorkspaceRef.current?.focus()
                    void addZone(activeShow.id)
                  }}
                  onUpdateZone={(zoneId, changes) => void updateZone(activeShow.id, zoneId, changes)}
                  onRemoveZone={(zoneId) => {
                    closeDetailPanel()
                    void removeZone(activeShow.id, zoneId)
                  }}
                  onAddRoutingLayout={(sourceLayoutId) => void addRoutingLayout(activeShow.id, sourceLayoutId)}
                  onUpdateRoutingLayout={(layoutId, changes) => void updateRoutingLayout(activeShow.id, layoutId, changes)}
                  onRemoveRoutingLayout={(layoutId) => void removeRoutingLayout(activeShow.id, layoutId)}
                  />
                </fieldset>
              </div>
            </ShowEntityDetailPanel>
            )
          })}
          {effectPaletteOwner && effectPaletteValue && (
            <ShowEffectPalette
              clip={effectPaletteValue}
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              onApply={(application) => {
                if (application.target === 'placement-mirror') {
                  void commitClipInspectorPatch(effectPaletteOwner, { view: { mirror: application.mirror } })
                  return
                }
                const effect = application.effect
                void commitClipInspectorPatch(effectPaletteOwner, { effects: [...effectPaletteValue.effects, effect] }).then(() => {
                  window.setTimeout(() => document.querySelector<HTMLElement>(`[data-show-effect-id="${effect.id}"]`)?.focus(), 0)
                })
              }}
              onClose={() => setEffectPaletteOwner(null)}
            />
          )}
          {groupEffectPaletteOwner && groupEffectPaletteValue && (
            <ShowEffectPalette
              clip={groupEffectPaletteValue}
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              onApply={(application) => {
                if (application.target === 'placement-mirror') {
                  void commitGroupClipInspectorPatch(groupEffectPaletteOwner, { view: { mirror: application.mirror } })
                  return
                }
                const effect = application.effect
                void commitGroupClipInspectorPatch(groupEffectPaletteOwner, {
                  effects: [...groupEffectPaletteValue.effects, effect],
                }).then(() => {
                  window.setTimeout(() => document.querySelector<HTMLElement>(`[data-show-effect-id="${effect.id}"]`)?.focus(), 0)
                })
              }}
              onClose={() => setGroupEffectPaletteOwner(null)}
            />
          )}
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
                  fromPlacementId: layerTransitionTarget.junction.leftClipId,
                  toPlacementId: layerTransitionTarget.junction.rightClipId,
                  kind,
                  durationMs: Math.min(durationMs, layerTransitionPlan.maxDurationMs),
                  easing: changes.easing ?? { curve: 'linear' },
                  ...(kind === 'crossfade' ? { crossfadePolicy: 'live-live' } : {}),
                }
                const nextComposition = insertShowLayerTransition(activeShow, timelineComposition, transition)
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
          {layerTransitionTarget?.junction.transition && (
            <ShowLayerTransitionEditor
              transition={layerTransitionTarget.junction.transition}
              fromName={layerTransitionTarget.fromName}
              toName={layerTransitionTarget.toName}
              anchor={layerTransitionTarget.anchor}
              onDurationChange={(durationMs) => {
                if (!timelineComposition) return
                const nextComposition = resizeShowLayerTransition(
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
                const nextComposition = resetShowLayerTransitionToCut(
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
        targetPixels={activeShow.outputContract?.kind === 'portable-2d'
          ? activeShow.outputContract.referencePixelCount
          : targetProfile?.lastKnownPixelCount ?? zonePixelTotal(activeShow)}
        pushResult={compileBarPushResult}
      />
    </div>
  )
}

function ShowTransportControls({ show }: { show: ShowRecord }) {
  const durationMs = showLoopDurationMs(show)
  const isRunning = usePreviewStore((state) => state.isRunning)
  const toggle = usePreviewStore((state) => state.toggle)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)

  useEffect(() => {
    useShowTransportStore.getState().openShow(show.id, durationMs)
  }, [durationMs, show.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (showControlOwnsKeyboardEvent(event.target)) return
      if (claimStudioPreviewSpace(event)) {
        usePreviewStore.getState().toggle()
        return
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
    <div className="flex min-w-0 items-center gap-1.5" role="group" aria-label="Show transport controls">
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={isRunning ? 'Pause Show preview' : 'Play Show preview'}
        title={isRunning ? 'Pause Show preview (Space)' : 'Play Show preview (Space)'}
        className={`bg-zinc-900/70 hover:bg-amber-400/10 ${
          isRunning ? 'text-green-400 hover:text-green-300' : 'text-red-400 hover:text-red-300'
        }`}
        onClick={toggle}
      >
        {isRunning ? <Play size={20} aria-hidden className="size-[20px]" /> : <Pause size={20} aria-hidden className="size-[20px]" />}
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Go to Show start"
        title="Go to Show start (A)"
        className="bg-zinc-900/70 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        onPointerUp={(event) => event.currentTarget.blur()}
        onClick={() => requestShowSeek(show.id, 0)}
      >
        <SkipBack size={18} aria-hidden className="size-[18px]" />
      </Button>
      <output
        className="timeline-time-display flex min-w-[128px] items-baseline gap-1 whitespace-nowrap text-xs tabular-nums"
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

function ShowTimelineCommands({
  show,
  composition,
  readOnly,
  selection,
  onSelect,
  onCreateGroup,
  onSplitCompositionClip,
  onDuplicateCompositionClip,
  snapEnabled,
  onToggleSnap,
  onFit,
  fitDisabled = false,
  includeFit = true,
}: {
  show: ShowRecord
  composition: ShowCompositionV1 | null
  readOnly: boolean
  selection: ShowSelection
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  onCreateGroup: (selection: ShowGroupSelection) => Promise<string | null>
  onSplitCompositionClip: (owner: ShowTimelineClipOwner, globalTimeMs: number) => Promise<string | null>
  onDuplicateCompositionClip: (owner: ShowTimelineClipOwner) => Promise<string | null>
  snapEnabled: boolean
  onToggleSnap: () => void
  onFit: () => void
  fitDisabled?: boolean
  includeFit?: boolean
}) {
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const splitAtTime = useShowStore((state) => state.splitAtTime)
  const cloneClip = useShowStore((state) => state.cloneClip)
  const undoShow = useShowStore((state) => state.undoShow)
  const redoShow = useShowStore((state) => state.redoShow)
  const history = useShowStore((state) => state.showHistories[show.id])
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
  const splitCapability = compositionOwner
    ? compositionClip && positionMs > compositionClip.startMs && positionMs < compositionClip.endMs
      ? { enabled: true, code: 'ready' as const, reason: `Split ${compositionClip.patternName} at the playhead` }
      : { enabled: false, code: 'outside-clip' as const, reason: 'Place the playhead inside the selected Clip' }
    : legacySplitCapability
  const legacyCloneCapability = showCloneCapability(show, selection)
  const compositionLayer = compositionClip
    ? compositionTimeline?.zones.flatMap((zone) => zone.layers)
      .find((layer) => layer.clips.some((clip) => clip.id === compositionClip.id))
    : null
  const compositionSceneRange = compositionClip
    ? projectShowTimeline(show).scenes.find((scene) => scene.sceneId === compositionClip.sceneId)
    : null
  const duplicateEndMs = compositionClip ? compositionClip.endMs + compositionClip.durationMs : 0
  const duplicateObstructed = Boolean(compositionClip && compositionLayer?.clips.some((clip) => (
    clip.id !== compositionClip.id
    && clip.startMs < duplicateEndMs
    && clip.endMs > compositionClip.endMs
  )))
  const cloneCapability = compositionOwner
    ? compositionClip && compositionSceneRange && duplicateEndMs <= compositionSceneRange.endMs && !duplicateObstructed
      ? { enabled: true, reason: `Duplicate ${compositionClip.patternName} immediately after itself` }
      : { enabled: false, reason: 'The selected Clip needs empty time after it on this Layer' }
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

  return (
    <div className="flex shrink-0 items-center justify-end gap-1" role="group" aria-label="Timeline commands">
      <Button size="icon-xs" variant="ghost" aria-label="Undo Show edit" title="Undo Show edit (Command/Ctrl+Z)" disabled={readOnly || !history?.past.length} onClick={() => void undoShow(show.id)}>
        <Undo2 size={12} aria-hidden />
      </Button>
      <Button size="icon-xs" variant="ghost" aria-label="Redo Show edit" title="Redo Show edit (Command/Ctrl+Shift+Z)" disabled={readOnly || !history?.future.length} onClick={() => void redoShow(show.id)}>
        <Redo2 size={12} aria-hidden />
      </Button>
      <Button
        size="xs"
        variant="ghost"
        aria-label="Snap playhead"
        aria-pressed={snapEnabled}
        title="Snap to scene, clip, transition, and time-grid boundaries. Hold Alt to temporarily reverse."
        className={snapEnabled ? 'bg-zinc-800/80 text-zinc-200' : 'text-zinc-600'}
        onClick={onToggleSnap}
      >
        <Magnet size={12} aria-hidden /> <span className="timeline-command-label">Snap</span>
      </Button>
      {includeFit && <Button
        size="xs"
        variant="ghost"
        aria-label="Fit timeline to Show"
        title="Fit the complete Show"
        disabled={fitDisabled}
        onClick={onFit}
      >
        <Maximize2 size={12} aria-hidden /> <span className="timeline-command-label">Fit</span>
      </Button>}
      <span className="relative inline-flex">
        <Button
          size="xs"
          variant="ghost"
          aria-label="Split at playhead"
          disabled={readOnly}
          aria-disabled={splitCapability.enabled ? undefined : true}
          aria-describedby={!splitCapability.enabled && splitReasonOpen ? splitReasonId : undefined}
          title={splitCapability.reason}
          className={`bg-zinc-800/70 text-[10px] text-zinc-400 hover:bg-amber-400/15 hover:text-amber-200 ${
            splitCapability.enabled ? '' : 'cursor-not-allowed opacity-50'
          }`}
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
          <span className="timeline-command-label">Split</span>
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
              : splitCapability.code === 'nonlinear-property-animation'
                ? 'Add a keyframe here or make this segment Linear before splitting'
                : splitCapability.code === 'outside-clip'
                  ? 'Place the playhead inside the selected Clip'
                  : 'Split only works inside a Scene'}
          </span>
        )}
      </span>
      <Button
        size="xs"
        variant="ghost"
        aria-label="Clone selection"
        title={cloneCapability.reason}
        disabled={readOnly || !cloneCapability.enabled}
        className="bg-zinc-800/70 text-[10px] text-zinc-400"
        onClick={() => void cloneSelection()}
      >
        <Copy size={12} aria-hidden />
        <span className="timeline-command-label">Clone</span>
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
          className={`bg-zinc-800/70 text-[10px] text-zinc-400 ${groupPlan.enabled ? '' : 'cursor-not-allowed opacity-50'}`}
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
          <span className="timeline-command-label">Group</span>
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
  return { enabled: false, reason: 'Select one Scene or simple Clip to Clone' }
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
  return target.closest('input, select, textarea, button, a[href], summary, [contenteditable="true"], [role="textbox"], [role="slider"]') !== null
}

function formatShowTime(timeMs: number): string {
  const tenths = Math.max(0, Math.round((Number.isFinite(timeMs) ? timeMs : 0) / 100))
  const minutes = Math.floor(tenths / 600)
  const seconds = Math.floor((tenths % 600) / 10)
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${tenths % 10}`
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
      className="bg-zinc-800/70 text-[11px] text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
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
  selection,
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
}: {
  show: ShowRecord
  timelineComposition: ShowCompositionV1 | null
  readOnly: boolean
  transportActive: boolean
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  selection: ShowSelection
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
    pattern: ShowCell['pattern']
    patternName: string
  }) => Promise<string | null>
  onMoveCompositionClip: (input: {
    owner: ShowTimelineClipOwner
    target: ShowTimelineClipMoveTarget
  }) => Promise<boolean>
  onAddCompositionLayer: (zoneId: string) => Promise<boolean>
  onSplitCompositionClip: (owner: ShowTimelineClipOwner, globalTimeMs: number) => Promise<string | null>
  onDuplicateCompositionClip: (owner: ShowTimelineClipOwner) => Promise<string | null>
  onResizeCompositionClip: (
    owner: ShowTimelineClipOwner,
    globalStartMs: number,
    durationMs: number,
  ) => Promise<boolean>
  onOpenLayerTransition: (target: ShowLayerTransitionTarget) => void
  onInsertTime: (atMs: number, durationMs: number) => Promise<boolean>
  onAddMarker: (timeMs: number) => Promise<boolean>
  onMoveMarker: (markerId: string, timeMs: number) => Promise<boolean>
  onUpdateMarker: (markerId: string, patch: Partial<Omit<NonNullable<ShowCompositionV1['markers']>[number], 'id'>>) => Promise<boolean>
  onRemoveMarker: (markerId: string) => Promise<boolean>
  onSetShowEnd: (durationMs: number) => Promise<boolean>
  onAppendLayoutInterval: (layoutId: string, durationMs: number) => Promise<boolean>
  onInsertLayoutInterval: (layoutId: string, durationMs: number, atMs: number) => Promise<boolean>
  onDuplicateLayoutInterval: (intervalId: string, withContent: boolean) => Promise<boolean>
  onMakeLayoutIntervalUnique: (intervalId: string) => Promise<boolean>
  onAddZone: () => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
}) {
  const strip = projectShowStrip(show)
  const timeline = projectShowTimeline(show)
  const layoutIntervals = useMemo(() => projectShowLayoutIntervals(show), [show])
  const unifiedCompositionTimeline = useMemo(() => (
    timelineComposition
      ? projectShowUnifiedTimeline(show, timelineComposition)
      : null
  ), [show, timelineComposition])
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
  const markerSnapEnabled = useShowEditorSessionStore((state) => state.markerSnapEnabled)
  const setMarkersVisible = useShowEditorSessionStore((state) => state.setMarkersVisible)
  const setMarkerSnapEnabled = useShowEditorSessionStore((state) => state.setMarkerSnapEnabled)
  const zonesOpen = useShowEditorSessionStore((state) => state.zoneWorkspaceOpenByShowId[show.id] ?? false)
  const collapsedZoneIds = useShowEditorSessionStore((state) => state.collapsedZoneIdsByShowId[show.id]) ?? EMPTY_ZONE_IDS
  const focusedZoneId = useShowEditorSessionStore((state) => state.focusedZoneIdByShowId[show.id] ?? null)
  const setZoneWorkspaceOpen = useShowEditorSessionStore((state) => state.setZoneWorkspaceOpen)
  const setZoneCollapsed = useShowEditorSessionStore((state) => state.setZoneCollapsed)
  const setFocusedZone = useShowEditorSessionStore((state) => state.setFocusedZone)
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  const [draggingCompositionClip, setDraggingCompositionClip] = useState<{
    clipId: string
    owner: ShowTimelineClipOwner
    grabOffsetMs: number
  } | null>(null)
  const draggingCompositionClipRef = useRef(draggingCompositionClip)
  const [resizePreview, setResizePreview] = useState<{
    clipId: string
    startMs: number
    durationMs: number
  } | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ left: number; top: number; width: number; height: number } | null>(null)
  const [addClipOpen, setAddClipOpen] = useState(false)
  const [insertTimeOpen, setInsertTimeOpen] = useState(false)
  const [insertTimeSeconds, setInsertTimeSeconds] = useState(1)
  const [insertTimeAtMs, setInsertTimeAtMs] = useState(0)
  const [layoutActionsOpen, setLayoutActionsOpen] = useState(false)
  const [layoutActionTimeMs, setLayoutActionTimeMs] = useState(0)
  const [layoutActionLayoutId, setLayoutActionLayoutId] = useState(show.routingLayouts[0]?.id ?? '')
  const [layoutActionDurationSeconds, setLayoutActionDurationSeconds] = useState(5)
  const [layoutActionError, setLayoutActionError] = useState<string | null>(null)
  const [addClipTimeMs, setAddClipTimeMs] = useState(0)
  const [addClipPatternKey, setAddClipPatternKey] = useState<string | null>(() => {
    const first = patternOptions[0]
    return first ? `${first.ref.kind}:${first.ref.id}` : null
  })
  const selectedCompositionZoneId = selection.kind === 'zone'
    ? selection.zoneId
    : selection.kind === 'clip'
      ? unifiedCompositionTimeline?.zones.find((zone) => (
          zone.layers.some((layer) => layer.clips.some((clip) => clip.id === selection.clipId))
        ))?.id
      : null
  const preferredAuthoringZoneId = selectedCompositionZoneId ?? focusedZoneId
  const addClipZoneId = showLayoutZoneIdAtTime(show, addClipTimeMs, preferredAuthoringZoneId)
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
  const focusZone = (zoneId: string) => {
    show.zones.forEach((zone) => setZoneCollapsed(show.id, zone.id, zone.id !== zoneId))
    setFocusedZone(show.id, zoneId)
  }
  const addClipPlan = timelineComposition && addClipZoneId
    ? planShowMainClipAtGlobalTime(show, timelineComposition, {
        zoneId: addClipZoneId,
        globalTimeMs: addClipTimeMs,
      })
    : null
  const addClipPattern = patternOptions.find((option) => (
    `${option.ref.kind}:${option.ref.id}` === addClipPatternKey
  )) ?? patternOptions[0]
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
  const initialTransport = useShowTransportStore.getState()
  const positionMsRef = useRef(initialTransport.showId === show.id ? initialTransport.positionMs : 0)
  useEffect(() => {
    return useShowTransportStore.subscribe((state) => {
      if (state.showId === show.id) positionMsRef.current = state.positionMs
    })
  }, [show.id])
  const structuralTimesMs = [...new Set([
    0,
    timeline.durationMs,
    ...timeline.scenes.flatMap((scene) => [scene.startMs, scene.endMs]),
    ...timeline.transitions.flatMap((transition) => [transition.startMs, transition.endMs]),
    ...timeline.boundaryTransitions.flatMap((transition) => [transition.startMs, transition.endMs]),
    ...timeline.rows.flatMap((row) => row.cells.flatMap((cell) => [cell.startMs, cell.endMs])),
    ...(unifiedCompositionTimeline?.zones.flatMap((zone) => (
      zone.layers.flatMap((layer) => layer.clips.flatMap((clip) => [clip.startMs, clip.endMs]))
    )) ?? []),
    ...(markerSnapEnabled ? (timelineComposition?.markers ?? []).map((marker) => marker.timeMs) : []),
  ])]
  const propertyLanesByZone = useMemo(() => {
    const sceneAnimationLanes = projectGlobalShowScenePropertyLanes(show)
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
          ariaLabel: `Animation speed lane for ${zone.name}`,
          selectsTransition: true,
          color: '#a78bfa',
          formatValue: formatTimeScale,
          projection: projectGlobalShowPropertyLane(show, zone.id, { kind: 'timeScale' }),
        },
        {
          key: 'brightness',
          label: 'brightness',
          ariaLabel: `Brightness lane for ${zone.name}`,
          selectsTransition: true,
          color: '#fbbf24',
          formatValue: formatBrightness,
          projection: projectGlobalShowPropertyLane(show, zone.id, { kind: 'brightness' }),
        },
        ...([
          ['positionX', 'position x', '#67e8f9'],
          ['positionY', 'position y', '#67e8f9'],
          ['rotation', 'rotation', '#5eead4'],
          ['scaleX', 'scale x', '#2dd4bf'],
          ['scaleY', 'scale y', '#2dd4bf'],
        ] as const).map(([property, label, color]) => ({
          key: `transform:${property}`,
          label,
          ariaLabel: `${label} lane for ${zone.name}`,
          selectsTransition: true,
          color,
          formatValue: property === 'rotation'
            ? (value: number) => `${Number((value * 360).toFixed(1))} deg`
            : property === 'scaleX' || property === 'scaleY'
              ? (value: number) => `${Number(value.toFixed(2))}x`
              : (value: number) => Number(value.toFixed(2)).toString(),
          projection: projectGlobalShowPropertyLane(show, zone.id, { kind: 'transform', property }),
        })),
        ...controlLanes.map((control) => ({
          key: `control:${control.exportName}`,
          label: control.label,
          ariaLabel: `${control.label} control lane for ${zone.name}`,
          selectsTransition: true,
          color: '#22d3ee',
          formatValue: formatControlValue,
          projection: projectGlobalShowPropertyLane(show, zone.id, {
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
            ariaLabel: `${lane.label} animation for ${zone.name}`,
            selectsTransition: false,
            color: '#a78bfa',
            formatValue: lane.valueKind === 'percent'
              ? formatBrightness
              : lane.valueKind === 'multiplier'
                ? formatTimeScale
                : formatControlValue,
            projection: lane.projection,
          })),
      ]
      return [zone.id, candidates.filter((candidate) => candidate.projection.timeVarying)] as const
    }))
  }, [patternControlsByCellId, show])
  const movingSplitLayout = show.routingLayouts.find((layout) => (
    layout.logical?.kind === 'split' || layout.logical?.kind === 'soft-split'
  ))
  const hasSampleRemap = show.scenes.some((scene) => scene.sampleTargets?.repeatScale !== undefined)
    || Boolean(show.transitions?.some((transition) => transition.propertyTransitions?.sample?.repeatScale))
  const routingLaneRows = (movingSplitLayout ? 1 : 0) + (hasSampleRemap ? 1 : 0)
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
    zonesOpen ? '148px' : hasMultipleZones ? '32px' : '0px',
    ...show.scenes.flatMap((scene, index) => (
      index < show.scenes.length - 1
        ? [
            `minmax(0, ${Math.max(1, scene.durationMs)}fr)`,
            `minmax(0, ${Math.max(0.001, showVisualTransitionAfter(show, scene.id)?.durationMs ?? 0)}fr)`,
          ]
        : [`minmax(0, ${Math.max(1, scene.durationMs)}fr)`]
    )),
  ]
  const timeGridEndLine = columns.length + 1
  const rows = [
    '28px',
    ...(movingSplitLayout ? ['26px'] : []),
    ...(hasSampleRemap ? ['26px'] : []),
    ...strip.rows.flatMap((row) => collapsedZoneIdSet.has(row.zoneId) ? ['28px'] : [
      ...Array.from({
        length: unifiedCompositionTimeline
          ? unifiedCompositionTimeline.zones.find((zone) => zone.id === row.zoneId)?.layers.length ?? 1
          : 1,
      }, () => '40px'),
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

      if (event.key === 'Tab' && target.closest('[role="toolbar"]')) return

      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        updateViewport((current) => panShowTimelineViewport(
          current,
          current.startMs + direction * current.durationMs,
        ))
        return
      }
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
  }, [selection, traversalTargets, updateViewport])
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
    if (readOnly) return
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
      const boundaryMs = snapEnabled !== pointer.altKey
        ? snapShowTimelineTime(rawBoundaryMs, {
            visibleDurationMs: viewport.durationMs,
            visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
            structuralTimesMs,
            minTimeMs,
            maxTimeMs,
          }).timeMs
        : Math.max(minTimeMs, Math.min(maxTimeMs, rawBoundaryMs))
      const startMs = edge === 'start' ? boundaryMs : clip.startMs
      const durationMs = edge === 'start' ? clip.endMs - boundaryMs : boundaryMs - clip.startMs
      return { startMs: Math.round(startMs), durationMs: Math.max(1, Math.round(durationMs)) }
    }
    const move = (pointer: PointerEvent) => {
      const next = resolve(pointer)
      setResizePreview({ clipId: clip.id, ...next })
    }
    const finish = (pointer: PointerEvent) => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      const next = resolve(pointer)
      setResizePreview(null)
      onDirectManipulationChange(false)
      // Selection and any open Details remain intact while the panel is
      // temporarily suppressed during direct manipulation.
      void onResizeCompositionClip(owner, next.startMs, next.durationMs)
    }
    const cancel = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', cancel)
      setResizePreview(null)
      onDirectManipulationChange(false)
    }
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
        setAddClipOpen(false)
        setInsertTimeOpen(false)
        setLayoutActionsOpen(false)
      }}
    >
      <div
        data-testid="show-timeline-toolbar"
        data-studio-space-preview="true"
        className="show-timeline-toolbar scrollbar-hidden flex h-11 min-w-0 flex-nowrap items-center gap-2 overflow-x-auto border-b border-zinc-800/80 px-1"
        role="toolbar"
        aria-label="Show timeline controls"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="timeline-transport-cluster min-w-0 shrink-0">
          {transportActive && <ShowTransportControls show={show} />}
        </div>
        <div className="flex min-w-[128px] max-w-[292px] flex-[1_1_220px] shrink items-center gap-1 border-x border-zinc-800/80 px-2" role="group" aria-label="Timeline view controls">
            <TimelineNavigator viewport={viewport} onChange={updateViewport} compact />
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Fit timeline to Show"
              title="Fit the complete Show"
              disabled={timelineIsFitted}
              className="shrink-0 bg-transparent text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-100"
              onClick={() => updateViewport(fitShowTimelineViewport(timeline.durationMs))}
            >
              <Maximize2 size={12} aria-hidden />
            </Button>
        </div>
        <div className="timeline-command-cluster relative flex min-w-0 shrink-0 items-center gap-1" role="group" aria-label="Show authoring commands">
          {!readOnly && (
            <>
              <Button
                size="xs"
                variant="ghost"
                aria-label={zonesOpen ? 'Close Zones' : 'Open Zones'}
                aria-expanded={zonesOpen}
                title={zonesOpen ? 'Close Zone Map' : 'Open Zone Map'}
                className={zonesOpen
                  ? 'bg-live/10 px-1.5 text-[11px] text-live hover:bg-live/15'
                  : 'bg-transparent px-1.5 text-[11px] text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'}
                onClick={() => setZoneWorkspaceOpen(show.id, !zonesOpen)}
              >
                <MapIcon size={12} aria-hidden />
                <span className="timeline-command-label">Zones</span>
              </Button>
              <Button
                size="xs"
                variant="ghost"
                aria-label="Layout interval actions"
                aria-expanded={layoutActionsOpen}
                title="Append, insert, duplicate, or separate a Zone Layout interval"
                className={layoutActionsOpen
                  ? 'bg-live/10 px-1.5 text-[11px] text-live hover:bg-live/15'
                  : 'bg-transparent px-1.5 text-[11px] text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100'}
                onClick={() => {
                  const transport = useShowTransportStore.getState()
                  const timeMs = transport.showId === show.id ? transport.positionMs : 0
                  const interval = showLayoutIntervalAtTime(layoutIntervals, timeMs)
                  setLayoutActionTimeMs(timeMs)
                  setLayoutActionLayoutId(interval?.layoutId ?? show.routingLayouts[0]?.id ?? '')
                  setLayoutActionError(null)
                  setAddClipOpen(false)
                  setInsertTimeOpen(false)
                  setLayoutActionsOpen((open) => !open)
                }}
              >
                <Grid2X2 size={12} aria-hidden />
                <span className="timeline-command-label">Layout</span>
              </Button>
              <Button
                size="xs"
                variant="ghost"
                aria-label="Add Layer"
                title={`Add a Layer to ${layerTargetZoneName}`}
                disabled={!layerTargetZoneId}
                className="bg-transparent px-1.5 text-[11px] text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                onClick={() => {
                  const currentTransport = useShowTransportStore.getState()
                  const currentTimeMs = currentTransport.showId === show.id ? currentTransport.positionMs : 0
                  const currentZoneId = showLayoutZoneIdAtTime(show, currentTimeMs, preferredAuthoringZoneId)
                  if (!currentZoneId) return
                  void onAddCompositionLayer(currentZoneId)
                }}
              >
                <Layers3 size={12} aria-hidden />
                <span className="timeline-command-label">Layer</span>
              </Button>
              <Button
                size="xs"
                variant="ghost"
                aria-label="Insert Time"
                aria-expanded={insertTimeOpen}
                title="Insert blank time at the playhead"
                className="bg-transparent px-1.5 text-[11px] text-zinc-400 hover:bg-zinc-800/60 hover:text-zinc-100"
                onClick={() => {
                  const transport = useShowTransportStore.getState()
                  setInsertTimeAtMs(transport.showId === show.id ? transport.positionMs : 0)
                  setAddClipOpen(false)
                  setLayoutActionsOpen(false)
                  setInsertTimeOpen((open) => !open)
                }}
              >
                <Clock3 size={12} aria-hidden />
                <span className="timeline-command-label">Insert Time</span>
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label={markersVisible ? 'Hide Markers' : 'Show Markers'}
                aria-pressed={markersVisible}
                title={markersVisible ? 'Hide Marker guides' : 'Show Marker guides'}
                className={markersVisible ? 'text-amber-300' : 'text-zinc-600'}
                onClick={() => setMarkersVisible(!markersVisible)}
              >
                <Eye size={12} aria-hidden />
              </Button>
              <Button
                size="icon-xs"
                variant="ghost"
                aria-label="Snap to Markers"
                aria-pressed={markerSnapEnabled}
                title="Use Markers as snap targets"
                className={markerSnapEnabled ? 'text-amber-300' : 'text-zinc-600'}
                onClick={() => setMarkerSnapEnabled(!markerSnapEnabled)}
              >
                <Flag size={12} aria-hidden />
              </Button>
              <Button
                size="xs"
                variant="ghost"
                aria-label="Add Clip at playhead"
                title="Add a Pattern Clip at the playhead"
                aria-expanded={addClipOpen}
                className="bg-zinc-800/70 text-[11px] text-zinc-300 hover:bg-amber-400/15 hover:text-amber-200"
                onClick={() => {
                  const transport = useShowTransportStore.getState()
                  setAddClipTimeMs(transport.showId === show.id ? transport.positionMs : 0)
                  setInsertTimeOpen(false)
                  setLayoutActionsOpen(false)
                  setAddClipOpen((open) => !open)
                }}
              >
                <Plus size={12} aria-hidden />
                <span className="timeline-command-label">Clip</span>
              </Button>
              {addClipOpen && (
                <div
                  role="dialog"
                  aria-label="Add Clip at playhead"
                  className="absolute right-0 top-full z-50 mt-1 w-56 rounded border border-zinc-700 bg-zinc-950 p-2 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-zinc-500">
                    <span>New Clip</span>
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
                    onChange={setAddClipPatternKey}
                  />
                  {addClipPlan && !addClipPlan.enabled && (
                    <p className="mt-1.5 text-[9px] leading-3 text-amber-200/75">{addClipPlan.reason}</p>
                  )}
                  <div className="mt-2 flex justify-end gap-1">
                    <Button size="xs" variant="ghost" onClick={() => setAddClipOpen(false)}>Cancel</Button>
                    <Button
                      size="xs"
                      aria-label="Add Clip"
                      disabled={!addClipPattern || !addClipPlan?.enabled}
                      onClick={() => {
                        if (!addClipPattern || !addClipZoneId || !addClipPlan?.enabled) return
                        void onAddClipAtPlayhead({
                          zoneId: addClipZoneId,
                          globalTimeMs: addClipTimeMs,
                          pattern: addClipPattern.ref,
                          patternName: addClipPattern.label,
                        }).then((placementId) => {
                          if (!placementId) return
                          setAddClipOpen(false)
                          onSelect({ kind: 'clip', clipId: placementId })
                        })
                      }}
                    >
                      Add Clip
                    </Button>
                  </div>
                </div>
              )}
              {insertTimeOpen && (
                <div
                  role="dialog"
                  aria-label="Insert Time"
                  className="absolute right-0 top-full z-50 mt-1 w-60 rounded border border-zinc-700 bg-zinc-950 p-2 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-1.5 flex items-center justify-between text-[10px] uppercase tracking-[0.1em] text-zinc-500">
                    <span>Insert Time</span>
                    <span className="normal-case tabular-nums text-zinc-500">at {formatSecondsValue(insertTimeAtMs)}s</span>
                  </div>
                  <UiNumberField
                    label="Time to insert"
                    ariaLabel="Time to insert in seconds"
                    hideLabel
                    variant="editor"
                    value={insertTimeSeconds}
                    min={0.001}
                    step={0.001}
                    suffix="s"
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
                </div>
              )}
              {layoutActionsOpen && (
                <div
                  role="dialog"
                  aria-label="Layout interval actions"
                  className="absolute right-0 top-full z-50 mt-1 w-72 rounded border border-zinc-700 bg-zinc-950 p-2.5 text-[12px] text-zinc-300 shadow-2xl"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[11px] uppercase tracking-[0.1em] text-zinc-500">Current interval</div>
                      <div className="truncate text-[13px] font-medium text-zinc-100">{layoutActionInterval?.layoutName ?? 'No Layout'}</div>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">{formatShowTime(layoutActionTimeMs)}</span>
                  </div>
                  <label className="grid grid-cols-[72px_1fr] items-center gap-2 py-1">
                    <span className="text-zinc-500">Use Layout</span>
                    <select
                      aria-label="Layout definition"
                      className="h-7 min-w-0 rounded border border-zinc-700 bg-zinc-900 px-2 text-[12px] text-zinc-200 outline-none focus:border-live/70"
                      value={layoutActionLayoutId}
                      onChange={(event) => setLayoutActionLayoutId(event.target.value)}
                    >
                      {show.routingLayouts.map((layout) => <option key={layout.id} value={layout.id}>{layout.name}</option>)}
                    </select>
                  </label>
                  <div className="grid grid-cols-[72px_1fr] items-center gap-2 py-1">
                    <span className="text-zinc-500">Duration</span>
                    <UiNumberField
                      label="Layout interval duration"
                      ariaLabel="Layout interval duration in seconds"
                      hideLabel
                      variant="editor"
                      value={layoutActionDurationSeconds}
                      min={0.001}
                      step={0.001}
                      suffix="s"
                      onChange={setLayoutActionDurationSeconds}
                    />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!layoutActionDurationValid || !layoutActionLayoutId}
                      onClick={() => runLayoutAction(() => onAppendLayoutInterval(layoutActionLayoutId, layoutActionDurationMs))}
                    >Append</Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!layoutActionDurationValid || !layoutActionLayoutId}
                      onClick={() => runLayoutAction(() => onInsertLayoutInterval(layoutActionLayoutId, layoutActionDurationMs, layoutActionTimeMs))}
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
                </div>
              )}
              {zonesOpen && (
                <ZoneMapPopover
                  show={show}
                  collapsedZoneIds={collapsedZoneIdSet}
                  focusedZoneId={focusedZoneId}
                  readOnly={readOnly}
                  onAddZone={onAddZone}
                  onSelectZone={(zoneId, anchor) => onSelect({ kind: 'zone', zoneId }, anchor)}
                  onToggleZone={(zoneId) => setZoneCollapsed(show.id, zoneId, !collapsedZoneIdSet.has(zoneId))}
                  onFocusZone={focusZone}
                  onUpdateZone={onUpdateZone}
                />
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
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled(!snapEnabled)}
            onFit={() => updateViewport(fitShowTimelineViewport(timeline.durationMs))}
            fitDisabled={timelineIsFitted}
            includeFit={false}
          />
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
      <div
        ref={scrollRef}
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
          className="relative isolate grid gap-y-2"
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
        {(showFullZoneHeaders || showMicroZonePicker) && <div className="sticky left-0 z-30 self-end border-b border-zinc-800 bg-[#060608] px-1 pb-2 text-[9.5px] uppercase tracking-[0.12em] text-structural">
          {showMicroZonePicker ? <MapIcon size={12} aria-label="Zone picker" /> : 'Zones'}
        </div>}
        {(showFullZoneHeaders || showMicroZonePicker) && <div
          className="sticky left-0 z-30 flex items-center justify-center border-b border-zinc-900 bg-[#060608] px-1 text-[9px] uppercase tracking-[0.12em] text-zinc-600"
          style={{ gridColumn: 1, gridRow: rulerRow }}
        >
          {showMicroZonePicker ? <MapIcon size={12} aria-hidden /> : 'Show time'}
        </div>}
        <TimelineRuler
          show={show}
          gridColumn={`2 / ${timeGridEndLine}`}
          viewport={viewport}
          gridRow={rulerRow}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
          layoutIntervals={layoutIntervals}
          readOnly={readOnly}
          onCreateMarker={onAddMarker}
        />
        {timelineComposition && (
          <TimelineMarkers
            show={show}
            markers={markersVisible ? timelineComposition.markers ?? [] : []}
            gridColumn={`2 / ${timeGridEndLine}`}
            gridRow={rulerRow}
            rowSpan={timelineOverlayRowSpan}
            snapEnabled={snapEnabled}
            structuralTimesMs={structuralTimesMs}
            readOnly={readOnly}
            onMoveMarker={onMoveMarker}
            onUpdateMarker={onUpdateMarker}
            onRemoveMarker={onRemoveMarker}
            onSetShowEnd={onSetShowEnd}
          />
        )}
        <TimelinePlayhead
          show={show}
          gridColumn={`2 / ${timeGridEndLine}`}
          gridRow={rulerRow}
          rowSpan={timelineOverlayRowSpan}
          viewport={viewport}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        {movingSplitLayout?.logical && (() => {
          const logical = movingSplitLayout.logical
          if (logical.kind !== 'split' && logical.kind !== 'soft-split') return null
          const [firstZoneId, secondZoneId] = logical.zoneIds
          const firstColor = show.zones.find((zone) => zone.id === firstZoneId)?.color ?? '#38bdf8'
          const secondColor = show.zones.find((zone) => zone.id === secondZoneId)?.color ?? '#f97316'
          return (
            <div role="group" aria-label="Split position lane" className="contents">
              <div
                className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[9px] text-sky-300/80"
                style={{ gridColumn: 1, gridRow: contentStartRow }}
              >
                {showMicroZonePicker ? <SplitSquareHorizontal size={12} aria-hidden /> : <>↳ split {logical.axis.toUpperCase()}</>}
              </div>
              {show.scenes.map((scene, sceneIndex) => {
                const position = scene.routingTargets?.splitPosition ?? 0.5
                return (
                  <div
                    key={`split-${scene.id}`}
                    className="flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] text-zinc-100"
                    style={{
                      gridColumn: 2 + sceneIndex * 2,
                      gridRow: contentStartRow,
                      background: `linear-gradient(90deg, color-mix(in srgb, ${firstColor} 35%, #08080a) 0 ${position * 100}%, color-mix(in srgb, ${secondColor} 35%, #08080a) ${position * 100}% 100%)`,
                    }}
                  >
                    {Math.round(position * 100)}%
                  </div>
                )
              })}
              {show.scenes.slice(0, -1).map((scene, sceneIndex) => {
                const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
                const descriptor = transition?.propertyTransitions?.routing?.splitPosition
                const target = show.scenes[sceneIndex + 1]?.routingTargets?.splitPosition ?? 0.5
                return transition ? (
                  <button
                    key={`split-boundary-${scene.id}`}
                    type="button"
                    aria-label={`Edit split position transition from ${scene.name}`}
                    data-show-timeline-focus
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
              style={{ gridColumn: 1, gridRow: contentStartRow + (movingSplitLayout ? 1 : 0) }}
            >
              {showMicroZonePicker ? <Repeat2 size={12} aria-hidden /> : '↳ sample repeat'}
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const scale = scene.sampleTargets?.repeatScale ?? 1
              return (
                <div
                  key={`sample-repeat-${scene.id}`}
                  className="flex items-center justify-center border-t border-zinc-900/80 bg-[repeating-linear-gradient(135deg,rgba(34,211,238,0.12)_0_3px,transparent_3px_8px)] font-mono text-[9px] text-cyan-100"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: contentStartRow + (movingSplitLayout ? 1 : 0) }}
                >
                  {formatRepeatScale(scale)}×
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
                  aria-label={`Edit repeat scale transition from ${scene.name}`}
                  data-show-timeline-focus
                  className={descriptor ? 'border-t border-zinc-900/80 bg-cyan-400/10 font-mono text-[9px] text-cyan-200' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-cyan-300'}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: contentStartRow + (movingSplitLayout ? 1 : 0) }}
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
                'group sticky left-0 z-30 flex cursor-pointer items-stretch gap-2 rounded-[5px] border border-transparent bg-[#060608] pr-2 text-left font-mono transition-all focus-visible:border-live/60 focus-visible:outline-none',
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
                className="w-1 self-stretch rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              <button
                type="button"
                aria-label={`Select zone ${row.zoneName}`}
                title={`Open ${row.zoneName} properties`}
                data-show-timeline-focus
                data-show-selection-key={`zone:${row.zoneId}`}
                className="flex min-w-0 flex-1 items-center gap-1.5 text-left"
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ kind: 'zone', zoneId: row.zoneId }, event.currentTarget)
                }}
              >
                <span className="grid size-5 shrink-0 place-items-center rounded border border-current/20 text-zinc-500">
                  <ZoneGlyph icon={zone?.icon} size={11} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 py-1">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="truncate text-[12px] font-medium group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4">{row.zoneName}</span>
                </span>
                <span className="flex min-w-0 items-center text-[10px] text-structural transition-colors group-hover:text-zinc-400">
                  <span>{row.nominalPixelCount}px</span>
                  <Settings2 size={11} aria-hidden className="ml-auto shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
                </span>
              </span>
              </button>
              {hasMultipleZones && <button
                type="button"
                aria-label={`${collapsed ? 'Expand' : 'Collapse'} zone ${row.zoneName}`}
                title={`${collapsed ? 'Expand' : 'Collapse'} ${row.zoneName}`}
                className="grid size-7 shrink-0 place-items-center self-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                onClick={(event) => {
                  event.stopPropagation()
                  setZoneCollapsed(show.id, row.zoneId, !collapsed)
                }}
              >
                {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
              </button>}
            </div>}
            {showMicroZonePicker && <button
              type="button"
              aria-label={`Focus zone ${row.zoneName}`}
              aria-pressed={focusedZoneId === row.zoneId}
              title={row.zoneName}
              className={focusedZoneId === row.zoneId
                ? 'sticky left-0 z-30 grid place-items-center border-l-2 bg-live/10 text-live'
                : 'sticky left-0 z-30 grid place-items-center border-l-2 bg-[#060608] text-zinc-500 hover:bg-zinc-900 hover:text-zinc-100'}
              style={{
                borderLeftColor: row.color ?? '#38bdf8',
                gridColumn: 1,
                gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows,
              }}
              onClick={(event) => {
                event.stopPropagation()
                focusZone(row.zoneId)
              }}
            >
              <ZoneGlyph icon={zone?.icon} size={12} />
            </button>}
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
                  if (!draggingCompositionClipRef.current || readOnly) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
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
                  const maxTimeMs = Math.max(0, totalMs - (clip?.durationMs ?? 0))
                  const globalStartMs = snapEnabled !== event.altKey
                    ? snapShowTimelineTime(candidateMs, {
                        visibleDurationMs: viewport.durationMs,
                        visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
                        structuralTimesMs,
                        maxTimeMs,
                      }).timeMs
                    : Math.max(0, Math.min(maxTimeMs, candidateMs))
                  void onMoveCompositionClip({
                    owner: draggedClip.owner,
                    target: { kind: 'main', zoneId: row.zoneId, globalStartMs },
                  }).then((moved) => {
                    if (moved) onReanchorDetails({ kind: 'clip', clipId: draggedClip.clipId })
                  }).finally(() => {
                    draggingCompositionClipRef.current = null
                    setDraggingCompositionClip(null)
                    onDirectManipulationChange(false)
                  })
                  setDropTargetKey(null)
                }}
              >
                <div className="absolute inset-0 grid gap-px py-1" style={{ gridTemplateRows: `repeat(${unifiedZone.layers.length}, minmax(0, 1fr))` }}>
                  {unifiedZone.layers.map((layer) => <div key={layer.id} className="relative min-h-0 bg-white/[0.025]">
                    {layer.clips.map((clip) => <i
                      key={clip.id}
                      className="absolute inset-y-px min-w-px bg-current/70"
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
                  zoneName={row.zoneName}
                  durationMs={timeline.durationMs}
                  compact
                />
              </div>
            ) : unifiedZone.layers.map((layer, layerIndex) => (
              <div
                key={layer.id}
                className={[
                  'relative min-w-0 border-b border-zinc-900/80 bg-[#08080a] transition-colors',
                  dropTargetKey === `composition:${layer.id}` ? 'bg-live/[0.07] ring-1 ring-inset ring-live/40' : '',
                ].join(' ')}
                style={{
                  gridColumn: `2 / ${columns.length + 1}`,
                  gridRow: rowStart(rowIndex) + contentStartRow + routingLaneRows + layerIndex,
                }}
                data-show-layer-kind={layer.kind}
                data-show-layer-index={layer.layerIndex}
                data-drop-active={dropTargetKey === `composition:${layer.id}` ? 'true' : undefined}
                onDragEnter={(event) => {
                  if (!draggingCompositionClipRef.current || readOnly) return
                  event.preventDefault()
                  setDropTargetKey(`composition:${layer.id}`)
                }}
                onDragOver={(event) => {
                  if (!draggingCompositionClipRef.current || readOnly) return
                  event.preventDefault()
                  event.dataTransfer.dropEffect = 'move'
                  setDropTargetKey(`composition:${layer.id}`)
                }}
                onDragLeave={(event) => {
                  if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                  setDropTargetKey((current) => current === `composition:${layer.id}` ? null : current)
                }}
                onDrop={(event) => {
                  const draggedClip = draggingCompositionClipRef.current
                  const compositionTimeline = unifiedCompositionTimeline
                  if (!draggedClip || !compositionTimeline || readOnly) return
                  event.preventDefault()
                  const rect = event.currentTarget.getBoundingClientRect()
                  const totalMs = Math.max(1, compositionTimeline.durationMs)
                  const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left) / Math.max(1, rect.width)))
                  const candidateMs = fraction * totalMs - draggedClip.grabOffsetMs
                  const clip = compositionTimeline.zones
                    .flatMap((zone) => zone.layers.flatMap((candidate) => candidate.clips))
                    .find((candidate) => candidate.id === draggedClip.clipId)
                  const maxTimeMs = Math.max(0, totalMs - (clip?.durationMs ?? 0))
                  const globalStartMs = snapEnabled !== event.altKey
                    ? snapShowTimelineTime(candidateMs, {
                        visibleDurationMs: viewport.durationMs,
                        visibleWidthPx: Math.max(1, scrollRef.current?.clientWidth ?? rect.width),
                        structuralTimesMs,
                        maxTimeMs,
                      }).timeMs
                    : Math.max(0, Math.min(maxTimeMs, candidateMs))
                  const target: ShowTimelineClipMoveTarget = layer.kind === 'main'
                    ? { kind: 'main', zoneId: row.zoneId, globalStartMs }
                    : { kind: 'overlay', zoneId: row.zoneId, layerIndex: layer.layerIndex, globalStartMs }
                  void onMoveCompositionClip({ owner: draggedClip.owner, target }).then((moved) => {
                    if (moved) onReanchorDetails({ kind: 'clip', clipId: draggedClip.clipId })
                  }).finally(() => {
                    draggingCompositionClipRef.current = null
                    setDraggingCompositionClip(null)
                    onDirectManipulationChange(false)
                  })
                  setDropTargetKey(null)
                }}
              >
                <LayoutZoneIntervalOverlay
                  intervals={layoutIntervals}
                  zoneId={row.zoneId}
                  zoneName={row.zoneName}
                  durationMs={timeline.durationMs}
                />
                {layer.clips.map((clip) => {
                  const totalMs = Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs)
                  const preview = resizePreview?.clipId === clip.id ? resizePreview : clip
                  const left = preview.startMs / totalMs * 100
                  const width = preview.durationMs / totalMs * 100
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
                  return (
                    <button
                      key={clip.id}
                      type="button"
                      aria-label={insideIsolatedGroup ? `Select Group Clip ${clip.patternName}` : group ? `Select Group ${group.name}` : `Select ${clip.patternName}`}
                      aria-disabled={outsideIsolation || undefined}
                      data-show-timeline-focus
                      data-show-selection-key={insideIsolatedGroup && groupPlacementId
                        ? `group-clip:${group!.id}:${groupPlacementId}`
                        : group ? `group:${group.id}` : `clip:${clip.id}`}
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
                        }
                        draggingCompositionClipRef.current = dragState
                        setDraggingCompositionClip(dragState)
                        onDirectManipulationChange(true)
                        event.dataTransfer.effectAllowed = 'move'
                        event.dataTransfer.setData('application/x-pxlblz-show-placement', clip.id)
                      }}
                      onDragEnd={() => {
                        draggingCompositionClipRef.current = null
                        setDraggingCompositionClip(null)
                        setDropTargetKey(null)
                        onDirectManipulationChange(false)
                      }}
                      onClick={(event) => {
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
                        'group absolute inset-y-0 min-h-0 py-0.5',
                        outsideIsolation
                          ? 'pointer-events-none opacity-25 saturate-50'
                          : draggingCompositionClip?.clipId === clip.id
                          ? 'opacity-45'
                          : selected
                          ? 'text-zinc-100 shadow-[0_0_0_1.5px_var(--color-live),0_8px_18px_-10px_rgba(0,0,0,0.9)]'
                          : 'text-zinc-300 hover:text-zinc-100',
                      ].join(' ')}
                      style={{
                        '--zone-color': row.color ?? '#38bdf8',
                        left: `${left}%`,
                        width: `${width}%`,
                        minWidth: 2,
                        borderLeftColor: row.color ?? '#38bdf8',
                        background: `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, #101013), color-mix(in srgb, ${row.color ?? '#38bdf8'} 6%, #0c0c0e))`,
                      } as CSSProperties}
                    >
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Grid2X2 size={11} aria-hidden className="show-clip-pattern-icon shrink-0 text-zinc-500" />
                        <span className="show-clip-pattern-name truncate text-[12px] font-normal text-zinc-100 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">{clip.patternName}</span>
                      </span>
                      {clip.effectKinds.length > 0 && (
                        <span className="truncate text-[9px] text-amber-200/75 [text-shadow:0_1px_2px_rgba(0,0,0,0.95)]">
                          FX {clip.effectKinds.length}
                        </span>
                      )}
                      {!readOnly && !group && (
                        <>
                          <span
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize ${clip.patternName} start`}
                            className={[
                              'absolute inset-y-0 left-0 z-20 w-1 cursor-ew-resize bg-live/70 transition-opacity',
                              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
                            ].join(' ')}
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => beginCompositionResize(clip, 'start', event)}
                          />
                          <span
                            role="separator"
                            aria-orientation="vertical"
                            aria-label={`Resize ${clip.patternName} end`}
                            className={[
                              'absolute inset-y-0 right-0 z-20 w-1 cursor-ew-resize bg-live/70 transition-opacity',
                              selected ? 'opacity-100' : 'opacity-0 group-hover:opacity-70',
                            ].join(' ')}
                            onClick={(event) => event.stopPropagation()}
                            onPointerDown={(event) => beginCompositionResize(clip, 'end', event)}
                          />
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
                    onSelect(insideIsolatedGroup && internalGroupPlacementId
                      ? { kind: 'group-clip', occurrenceId: internalGroup.id, placementId: internalGroupPlacementId }
                      : { kind: 'group', occurrenceId: internalGroup.id }, anchor)
                    return true
                  }
                  const totalMs = Math.max(1, unifiedCompositionTimeline?.durationMs ?? timeline.durationMs)
                  if (junction.kind !== 'cut') {
                    const width = Math.max(junction.durationMs / totalMs * 100, 0.35)
                    return (
                      <button
                        key={junction.id}
                        type="button"
                        aria-label={`Edit ${junction.kind} Transition between ${leftClip.patternName} and ${rightClip.patternName}`}
                        title={`${junction.kind} - ${junction.durationMs / 1_000}s`}
                        data-show-timeline-focus
                        data-show-layer-junction={junction.id}
                        data-show-group-occurrence={internalGroup?.id}
                        aria-disabled={outsideIsolation || undefined}
                        className={`absolute inset-y-1 z-[15] min-w-4 overflow-hidden rounded-[3px] border border-amber-400/45 bg-amber-400/15 px-1 text-[10px] font-medium uppercase text-amber-200 outline-none hover:border-amber-300 hover:bg-amber-400/25 focus-visible:ring-1 focus-visible:ring-amber-300 ${outsideIsolation ? 'pointer-events-none opacity-25' : ''}`}
                        style={{
                          left: `${junction.startMs / totalMs * 100}%`,
                          width: `${width}%`,
                        }}
                        onClick={(event) => {
                          event.stopPropagation()
                          if (selectInternalGroup(event.currentTarget)) return
                          onDismiss()
                          onOpenLayerTransition({
                            junction,
                            fromName: leftClip.patternName,
                            toName: rightClip.patternName,
                            anchor: event.currentTarget,
                          })
                        }}
                      >
                        {junction.kind === 'crossfade' ? 'xf' : junction.kind.slice(0, 2)}
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
                      data-show-layer-junction={junction.id}
                      data-show-group-occurrence={internalGroup?.id}
                      aria-disabled={outsideIsolation || undefined}
                      className={`group/cut absolute inset-y-0 z-[15] w-4 -translate-x-1/2 bg-transparent outline-none ${outsideIsolation ? 'pointer-events-none opacity-25' : ''}`}
                      style={{ left: `${junction.startMs / totalMs * 100}%` }}
                      onClick={(event) => {
                        event.stopPropagation()
                        if (selectInternalGroup(event.currentTarget)) return
                        onDismiss()
                        onOpenLayerTransition({
                          junction,
                          fromName: leftClip.patternName,
                          toName: rightClip.patternName,
                          anchor: event.currentTarget,
                        })
                      }}
                    >
                      <span aria-hidden className="absolute inset-y-1 left-1/2 w-px -translate-x-1/2 bg-zinc-500/80 transition-colors group-hover/cut:bg-amber-300 group-focus-visible/cut:bg-amber-300" />
                      <span aria-hidden className="absolute left-1/2 top-1 size-2 -translate-x-1/2 rotate-45 rounded-[1px] border border-zinc-500 bg-[#0b0b0d] transition-colors group-hover/cut:border-amber-300 group-focus-visible/cut:border-amber-300" />
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
                  <div
                    className="sticky left-0 z-30 flex min-w-0 items-center border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[8.5px]"
                    style={{ gridColumn: 1, gridRow: laneRow, color: lane.color }}
                  >
                    <span className="truncate">↳ {lane.label}</span>
                  </div>
                  <div
                    className="min-w-0"
                    style={{ gridColumn: `2 / ${timeGridEndLine}`, gridRow: laneRow }}
                  >
                    <ShowPropertySparkline
                      ariaLabel={lane.ariaLabel}
                      projection={lane.projection}
                      color={lane.color}
                      selectedBeatId={selectedBeat}
                      formatValue={lane.formatValue}
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
  )
}

const ZONE_ICON_OPTIONS = [
  { id: 'grid', label: 'Grid' },
  { id: 'map', label: 'Map' },
  { id: 'layers', label: 'Layers' },
  { id: 'route', label: 'Route' },
  { id: 'pulse', label: 'Pulse' },
  { id: 'bolt', label: 'Bolt' },
] as const

function ZoneGlyph({ icon, size = 12 }: { icon?: string; size?: number }) {
  if (icon === 'map') return <MapIcon size={size} aria-hidden />
  if (icon === 'layers') return <Layers3 size={size} aria-hidden />
  if (icon === 'route') return <Route size={size} aria-hidden />
  if (icon === 'pulse') return <Activity size={size} aria-hidden />
  if (icon === 'bolt') return <Zap size={size} aria-hidden />
  return <Grid2X2 size={size} aria-hidden />
}

function ZoneMapPopover({
  show,
  collapsedZoneIds,
  focusedZoneId,
  readOnly,
  onAddZone,
  onSelectZone,
  onToggleZone,
  onFocusZone,
  onUpdateZone,
}: {
  show: ShowRecord
  collapsedZoneIds: Set<string>
  focusedZoneId: string | null
  readOnly: boolean
  onAddZone: () => void
  onSelectZone: (zoneId: string, anchor: HTMLElement) => void
  onToggleZone: (zoneId: string) => void
  onFocusZone: (zoneId: string) => void
  onUpdateZone: (zoneId: string, changes: Partial<ShowRecord['zones'][number]>) => void
}) {
  return (
    <aside
      role="dialog"
      aria-label="Zone Map"
      className="absolute right-0 top-full z-50 mt-1 w-[min(310px,calc(100vw-24px))] rounded border border-zinc-700 bg-[#0a0a0d]/[0.985] p-1.5 shadow-2xl backdrop-blur"
      onClick={(event) => event.stopPropagation()}
    >
      <header className="flex h-8 items-center gap-2 border-b border-zinc-800 px-1.5">
        <MapIcon size={13} aria-hidden className="text-live" />
        <strong className="text-[13px] font-medium text-zinc-100">Zone Map</strong>
        <span className="ml-auto text-[10px] tabular-nums text-zinc-500">{show.zones.length} Zone{show.zones.length === 1 ? '' : 's'}</span>
      </header>
      <div className="py-1">
        {show.zones.map((zone) => {
          const collapsed = collapsedZoneIds.has(zone.id)
          return (
            <div
              key={zone.id}
              className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-1 border-b border-zinc-900/80 px-1 py-1 last:border-b-0"
            >
              <button
                type="button"
                aria-label={`Select zone ${zone.name}`}
                title={`Open ${zone.name} properties`}
                className="flex min-w-0 items-center gap-2 rounded px-1.5 py-1 text-left text-zinc-300 hover:bg-zinc-800/70 hover:text-zinc-100"
                onClick={(event) => onSelectZone(zone.id, event.currentTarget)}
              >
                <span
                  className="grid size-6 shrink-0 place-items-center rounded border border-current/25 bg-black/30"
                  style={{ color: zone.color ?? '#38bdf8' }}
                >
                  <ZoneGlyph icon={zone.icon} />
                </span>
                <span className="min-w-0">
                  <strong className="block truncate text-[12px] font-medium">{zone.name}</strong>
                  <span className="block truncate text-[10px] text-zinc-500">{zone.nominalPixelCount} px</span>
                </span>
              </button>
              {!readOnly && (
                <select
                  aria-label={`Zone icon ${zone.name}`}
                  title={`Icon for ${zone.name}`}
                  value={zone.icon ?? 'grid'}
                  className="h-7 w-16 rounded border border-zinc-800 bg-zinc-950 px-1 text-[10px] text-zinc-400 outline-none focus:border-live/60"
                  onChange={(event) => onUpdateZone(zone.id, { icon: event.currentTarget.value })}
                >
                  {ZONE_ICON_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              )}
              {show.zones.length > 1 && (
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    aria-label={`${collapsed ? 'Expand' : 'Collapse'} zone ${zone.name}`}
                    title={`${collapsed ? 'Expand' : 'Collapse'} ${zone.name}`}
                    className="grid size-7 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                    onClick={() => onToggleZone(zone.id)}
                  >
                    {collapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  </button>
                  <button
                    type="button"
                    aria-label={`Focus zone ${zone.name}`}
                    aria-pressed={focusedZoneId === zone.id}
                    title={`Focus ${zone.name}`}
                    className={focusedZoneId === zone.id
                      ? 'grid size-7 place-items-center rounded bg-live/10 text-live'
                      : 'grid size-7 place-items-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100'}
                    onClick={() => onFocusZone(zone.id)}
                  >
                    <Eye size={13} />
                  </button>
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
    </aside>
  )
}

function TimelineNavigator({
  viewport,
  onChange,
  compact = false,
}: {
  viewport: ShowTimelineViewport
  onChange: (viewport: ShowTimelineViewport) => void
  compact?: boolean
}) {
  const overviewRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<{ mode: 'pan' | 'start' | 'end'; x: number; viewport: ShowTimelineViewport } | null>(null)
  const thumb = showTimelineThumb(viewport)
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
          className="absolute inset-y-1 z-10 w-1 cursor-ew-resize border-x border-amber-300/70"
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
          className="absolute inset-y-1 z-10 w-1 cursor-ew-resize border-x border-amber-300/70"
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
      </div>
      <div className="flex items-center justify-end px-1.5 text-[9px] tabular-nums text-zinc-600">{Math.round(viewport.totalMs / viewport.durationMs * 100)}%</div>
    </div>
  )
}

function LayoutZoneIntervalOverlay({
  intervals,
  zoneId,
  zoneName,
  durationMs,
  compact = false,
}: {
  intervals: ShowLayoutInterval[]
  zoneId: string
  zoneName: string
  durationMs: number
  compact?: boolean
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
      if (!compact) return null
      return <span
        key={interval.id}
        aria-hidden
        className={compact
          ? 'pointer-events-none absolute top-0 z-[21] max-w-full truncate px-1 text-[10px] leading-3 text-zinc-500'
          : 'pointer-events-none absolute top-0.5 z-[21] max-w-full truncate rounded-sm bg-black/45 px-1 text-[11px] leading-4 text-zinc-400 shadow-sm'}
        style={{ left: `calc(${left}% + 2px)`, maxWidth: `calc(${width}% - 4px)` }}
      >
        {interval.layoutName} · {zoneName}
      </span>
    })}
  </>
}

function TimelineRuler({
  show,
  gridColumn,
  gridRow,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
  layoutIntervals,
  readOnly,
  onCreateMarker,
}: {
  show: ShowRecord
  gridColumn: string
  gridRow: number
  viewport: ShowTimelineViewport
  snapEnabled: boolean
  structuralTimesMs: number[]
  getVisibleWidth: () => number
  layoutIntervals: ShowLayoutInterval[]
  readOnly: boolean
  onCreateMarker: (timeMs: number) => Promise<boolean>
}) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const pendingSeekRef = useRef<{ showId: string; targetMs: number } | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const keyboardHoldRef = useRef<{ key: 'ArrowLeft' | 'ArrowRight'; startedAt: number } | null>(null)
  const pointerScrubRef = useRef({ active: false, inverted: false })
  const markerDragRef = useRef<{ pointerId: number; startX: number } | null>(null)
  const suppressMarkerClickRef = useRef(false)
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
  const ticks = Array.from({ length: 7 }, (_, index) => ({
    position: index / 6,
    timeMs: durationMs * index / 6,
  }))
  return (
    <div
      className="group/timeline-ruler relative overflow-hidden border-b border-zinc-800 bg-zinc-950/70 ring-1 ring-inset ring-transparent transition-colors hover:bg-zinc-900/70 hover:ring-zinc-700/70 focus-within:bg-zinc-900/70 focus-within:ring-live/25"
      style={{
        gridColumn,
        gridRow,
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(113,113,122,.2) 0 1px, transparent 1px 20px)',
      }}
    >
      {!readOnly && (
        <button
          type="button"
          aria-label="Add Marker at playhead"
          title="Click to add at the playhead, or drag onto the ruler"
          className="absolute left-1 top-0.5 z-20 flex h-4 w-4 cursor-grab items-center justify-center rounded-sm text-amber-300/75 hover:bg-amber-300/10 hover:text-amber-200 focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300"
          onPointerDown={(event) => {
            event.stopPropagation()
            markerDragRef.current = { pointerId: event.pointerId, startX: event.clientX }
            event.currentTarget.setPointerCapture?.(event.pointerId)
          }}
          onPointerUp={(event) => {
            const drag = markerDragRef.current
            markerDragRef.current = null
            if (!drag || drag.pointerId !== event.pointerId || Math.abs(event.clientX - drag.startX) < 3) return
            const rect = event.currentTarget.parentElement?.getBoundingClientRect()
            if (!rect) return
            const rawTimeMs = (event.clientX - rect.left) / Math.max(1, rect.width) * durationMs
            const timeMs = snapEnabled !== event.altKey
              ? snapShowTimelineTime(rawTimeMs, {
                  visibleDurationMs: viewport.durationMs,
                  visibleWidthPx: getVisibleWidth(),
                  structuralTimesMs,
                  maxTimeMs: durationMs,
                }).timeMs
              : Math.max(0, Math.min(durationMs, rawTimeMs))
            suppressMarkerClickRef.current = true
            void onCreateMarker(Math.round(timeMs))
          }}
          onPointerCancel={() => { markerDragRef.current = null }}
          onClick={() => {
            if (suppressMarkerClickRef.current) {
              suppressMarkerClickRef.current = false
              return
            }
            void onCreateMarker(positionMs)
          }}
        >
          <Flag size={11} aria-hidden />
        </button>
      )}
      {layoutIntervals.map((interval, index) => {
        const { left, width } = showLayoutIntervalPercentBounds(interval, durationMs)
        const soleZone = interval.zoneIds.length === 1
          ? show.zones.find((zone) => zone.id === interval.zoneIds[0])
          : null
        const label = soleZone ? `${interval.layoutName} · ${soleZone.name}` : interval.layoutName
        return (
          <span
            key={interval.id}
            aria-hidden
            data-show-layout-interval={interval.id}
            className="pointer-events-none absolute bottom-0 z-[1] h-[13px] overflow-hidden border-l border-live/45 bg-live/[0.035] px-1 text-[11px] leading-[13px] text-zinc-400"
            style={{ left: `${left}%`, width: `${width}%` }}
          >
            {index > 0 && <span className="mr-1 text-live/70">◆</span>}{label}
          </span>
        )
      })}
      {ticks.map((tick) => (
        <span
          key={tick.position}
          aria-hidden
          className="absolute top-1 text-[8.5px] tabular-nums text-zinc-600 transition-colors group-hover/timeline-ruler:text-zinc-400"
          style={{ left: `${tick.position * 100}%`, transform: `translateX(${tick.position === 0 ? 0 : tick.position === 1 ? -100 : -50}%)` }}
        >
          {formatRulerTime(tick.timeMs)}
        </span>
      ))}
      <input
        type="range"
        aria-label="Show playhead"
        min={0}
        max={durationMs}
        step={1}
        value={Math.min(positionMs, durationMs)}
        onChange={(event) => previewScrub(
          Number(event.target.value),
          pointerScrubRef.current.active && snapEnabled !== pointerScrubRef.current.inverted,
        )}
        onPointerDown={(event) => {
          pointerScrubRef.current = { active: true, inverted: event.altKey }
        }}
        onPointerMove={(event) => {
          if (pointerScrubRef.current.active) pointerScrubRef.current.inverted = event.altKey
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
        }}
        onPointerCancel={() => {
          commitScrub()
          pointerScrubRef.current = { active: false, inverted: false }
        }}
        onKeyUp={(event) => {
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') keyboardHoldRef.current = null
          commitScrub()
        }}
        onBlur={() => {
          keyboardHoldRef.current = null
          commitScrub()
        }}
        className="show-playhead-range absolute inset-0 h-full w-full cursor-col-resize opacity-0 outline-none"
      />
    </div>
  )
}

function TimelineMarkers({
  show,
  markers,
  gridColumn,
  gridRow,
  rowSpan,
  snapEnabled,
  structuralTimesMs,
  readOnly,
  onMoveMarker,
  onUpdateMarker,
  onRemoveMarker,
  onSetShowEnd,
}: {
  show: ShowRecord
  markers: NonNullable<ShowCompositionV1['markers']>
  gridColumn: string
  gridRow: number
  rowSpan: number
  snapEnabled: boolean
  structuralTimesMs: number[]
  readOnly: boolean
  onMoveMarker: (markerId: string, timeMs: number) => Promise<boolean>
  onUpdateMarker: (markerId: string, patch: Partial<Omit<NonNullable<ShowCompositionV1['markers']>[number], 'id'>>) => Promise<boolean>
  onRemoveMarker: (markerId: string) => Promise<boolean>
  onSetShowEnd: (durationMs: number) => Promise<boolean>
}) {
  const durationMs = showLoopDurationMs(show)
  const [openMarkerId, setOpenMarkerId] = useState<string | null>(null)
  const [showEndOpen, setShowEndOpen] = useState(false)
  const markerPointerRef = useRef<{ markerId: string; pointerId: number; startX: number } | null>(null)
  const showEndPointerRef = useRef<{ pointerId: number; startX: number } | null>(null)
  const suppressMarkerHandleClickRef = useRef(false)
  const suppressShowEndClickRef = useRef(false)
  useEffect(() => {
    if (!openMarkerId && !showEndOpen) return
    const closeDetails = (event: PointerEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-show-timeline-marker-ui]')) return
      setOpenMarkerId(null)
      setShowEndOpen(false)
    }
    document.addEventListener('pointerdown', closeDetails)
    return () => document.removeEventListener('pointerdown', closeDetails)
  }, [openMarkerId, showEndOpen])
  const resolvePointerTime = (event: ReactPointerEvent<HTMLElement>, allowBeyondEnd = false) => {
    const rect = event.currentTarget
      .closest('[data-show-timeline-marker-surface]')
      ?.getBoundingClientRect()
    if (!rect) return 0
    const rawTimeMs = (event.clientX - rect.left) / Math.max(1, rect.width) * durationMs
    const maxTimeMs = allowBeyondEnd ? durationMs * 2 : durationMs
    return Math.round(snapEnabled !== event.altKey
      ? snapShowTimelineTime(rawTimeMs, {
          visibleDurationMs: durationMs,
          visibleWidthPx: rect.width,
          structuralTimesMs,
          minTimeMs: allowBeyondEnd ? 1 : 0,
          maxTimeMs,
        }).timeMs
      : Math.max(allowBeyondEnd ? 1 : 0, Math.min(maxTimeMs, rawTimeMs)))
  }
  return (
    <div
      aria-label="Timeline Markers and Show End"
      data-show-timeline-marker-surface
      className="pointer-events-none relative z-[35]"
      style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
    >
      {markers.filter((marker) => marker.timeMs <= durationMs).map((marker) => {
        const left = marker.timeMs / Math.max(1, durationMs) * 100
        return (
          <div key={marker.id} className="contents">
          <button
            type="button"
            data-show-timeline-marker-ui
            aria-label={`${marker.name ?? 'Marker'} at ${formatSecondsValue(marker.timeMs)} seconds`}
            title={`${marker.name ?? 'Marker'} · ${formatSecondsValue(marker.timeMs)}s`}
            disabled={readOnly}
            className="pointer-events-auto absolute inset-y-0 w-[5px] -translate-x-1/2 cursor-ew-resize touch-none disabled:cursor-default"
            style={{ left: `${left}%`, color: marker.color ?? '#f59e0b' }}
            onPointerDown={(event) => {
              event.stopPropagation()
              markerPointerRef.current = { markerId: marker.id, pointerId: event.pointerId, startX: event.clientX }
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerUp={(event) => {
              event.stopPropagation()
              const pointer = markerPointerRef.current
              markerPointerRef.current = null
              if (!pointer || pointer.markerId !== marker.id || pointer.pointerId !== event.pointerId || Math.abs(event.clientX - pointer.startX) < 3) return
              const timeMs = resolvePointerTime(event)
              event.currentTarget.releasePointerCapture?.(event.pointerId)
              suppressMarkerHandleClickRef.current = true
              void onMoveMarker(marker.id, timeMs)
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
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current opacity-45" />
            <span className="absolute -left-[3px] top-0 h-0 w-0 border-x-[3px] border-t-[5px] border-x-transparent border-t-current" />
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
                <button type="button" aria-label="Close Marker details" className="text-zinc-600 hover:text-zinc-200" onClick={() => setOpenMarkerId(null)}><X size={12} /></button>
              </div>
              <label className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Name</span>
                <input
                  aria-label="Marker name"
                  className="min-w-0 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-zinc-200"
                  defaultValue={marker.name ?? ''}
                  onBlur={(event) => void onUpdateMarker(marker.id, { name: event.target.value.trim() || undefined })}
                />
              </label>
              <label className="grid grid-cols-[44px_1fr] items-center gap-2 py-1">
                <span>Time</span>
                <span className="flex items-center gap-1">
                  <input
                    type="number"
                    aria-label="Marker time in seconds"
                    min={0}
                    step={0.001}
                    className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-right tabular-nums text-zinc-200"
                    defaultValue={formatSecondsValue(marker.timeMs)}
                    onBlur={(event) => {
                      const seconds = event.target.value.trim()
                      const parsed = Number(seconds)
                      if (!seconds || !Number.isFinite(parsed)) {
                        event.target.value = formatSecondsValue(marker.timeMs)
                        return
                      }
                      void onUpdateMarker(marker.id, { timeMs: parsed * 1000 })
                    }}
                  />
                  <span className="text-zinc-600">s</span>
                </span>
              </label>
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
              <button
                type="button"
                className="mt-2 flex items-center gap-1 text-red-400/80 hover:text-red-300"
                onClick={() => {
                  setOpenMarkerId(null)
                  void onRemoveMarker(marker.id)
                }}
              ><Trash2 size={11} aria-hidden /> Remove Marker</button>
            </div>
          )}
          </div>
        )
      })}
      <button
        type="button"
        data-show-timeline-marker-ui
        aria-label={`Show End at ${formatSecondsValue(durationMs)} seconds`}
        title={`Show End · ${formatSecondsValue(durationMs)}s`}
        disabled={readOnly}
        className="pointer-events-auto absolute inset-y-0 right-0 w-3 cursor-ew-resize touch-none text-red-400 disabled:cursor-default"
        onPointerDown={(event) => {
          event.stopPropagation()
          showEndPointerRef.current = { pointerId: event.pointerId, startX: event.clientX }
          event.currentTarget.setPointerCapture?.(event.pointerId)
        }}
        onPointerUp={(event) => {
          event.stopPropagation()
          const pointer = showEndPointerRef.current
          showEndPointerRef.current = null
          if (!pointer || pointer.pointerId !== event.pointerId || Math.abs(event.clientX - pointer.startX) < 3) return
          const timeMs = resolvePointerTime(event, true)
          event.currentTarget.releasePointerCapture?.(event.pointerId)
          suppressShowEndClickRef.current = true
          void onSetShowEnd(timeMs)
        }}
        onClick={(event) => {
          event.stopPropagation()
          if (suppressShowEndClickRef.current) {
            suppressShowEndClickRef.current = false
            return
          }
          setOpenMarkerId(null)
          setShowEndOpen((open) => !open)
        }}
      >
        <span className="absolute inset-y-0 right-0 w-px bg-current opacity-65" />
        <span
          data-testid="show-timeline-end-handle"
          className="absolute right-[2px] top-[2px] h-[6px] w-[6px] rotate-45 border border-current bg-[#060608]"
        />
      </button>
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
          <label className="flex items-center gap-1">
            <span className="w-10">Time</span>
            <input
              type="number"
              aria-label="Show End time in seconds"
              min={0.001}
              step={0.001}
              className="min-w-0 flex-1 rounded border border-zinc-800 bg-zinc-900 px-1.5 py-1 text-right tabular-nums text-zinc-200"
              defaultValue={formatSecondsValue(durationMs)}
              onBlur={(event) => {
                const seconds = event.target.value.trim()
                const parsed = Number(seconds)
                if (!seconds || !Number.isFinite(parsed)) {
                  event.target.value = formatSecondsValue(durationMs)
                  return
                }
                void onSetShowEnd(parsed * 1000)
              }}
            />
            <span className="text-zinc-600">s</span>
          </label>
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
  const left = durationMs > 0 ? Math.min(100, Math.max(0, positionMs / durationMs * 100)) : 0
  const visible = positionMs >= viewport.startMs && positionMs <= viewport.startMs + viewport.durationMs
  const thumbCenterOffsetPx = rangeThumbCenterOffsetPx(left, 16)
  const previewPointerPosition = (event: ReactPointerEvent<HTMLSpanElement>) => {
    const track = event.currentTarget.parentElement
    if (!track) return
    const rect = track.getBoundingClientRect()
    const thumbRadius = 8
    const usableWidth = Math.max(1, rect.width - thumbRadius * 2)
    const fraction = Math.min(1, Math.max(0, (event.clientX - rect.left - thumbRadius) / usableWidth))
    const targetMs = fraction * durationMs
    const resolvedTimeMs = snapEnabled !== event.altKey
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
  const commitPointerPosition = () => {
    const pending = pendingSeekRef.current
    pendingSeekRef.current = null
    activePointerRef.current = null
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
    <div
      aria-hidden
      data-testid="show-timeline-playhead-surface"
      className={`pointer-events-none relative z-30 ${visible ? '' : 'invisible'}`}
      style={{ gridColumn, gridRow: `${gridRow} / span ${rowSpan}` }}
    >
      <span
        data-testid="show-timeline-playhead-hit-target"
        className="pointer-events-auto absolute inset-y-0 w-[5px] -translate-x-1/2 cursor-col-resize touch-none"
        style={{ left: `calc(${left}% + ${thumbCenterOffsetPx}px)` }}
        onPointerDown={(event) => {
          event.stopPropagation()
          activePointerRef.current = event.pointerId
          event.currentTarget.setPointerCapture?.(event.pointerId)
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
          className={`pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 ${seekStatus === 'rebuilding' ? 'bg-amber-300' : 'bg-live'}`}
          style={{ boxShadow: '0 0 8px color-mix(in srgb, var(--color-live) 45%, transparent)' }}
        >
          <span className="absolute -left-[4px] top-0 h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent border-t-current" />
        </span>
      </span>
    </div>
  )
}

function formatRulerTime(timeMs: number): string {
  const seconds = Math.round(timeMs / 1000)
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

function formatSecondsValue(timeMs: number): string {
  return Number((Math.max(0, timeMs) / 1000).toFixed(3)).toString()
}

function InspectorPanel({
  family,
  title,
  heading,
  headingMeta,
  summary,
  icon,
  actions,
  children,
}: {
  family: 'Scene' | 'Clip' | 'Group' | 'Transition' | 'Zone' | 'Show'
  title: string
  heading?: string
  headingMeta?: string
  summary?: React.ReactNode
  icon: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const label = `${family} properties`
  const accent = {
    Scene: 'border-amber-400/35 bg-amber-400/10 text-amber-300',
    Clip: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300',
    Group: 'border-emerald-400/35 bg-emerald-400/10 text-emerald-300',
    Transition: 'border-violet-400/35 bg-violet-400/10 text-violet-300',
    Zone: 'border-sky-400/35 bg-sky-400/10 text-sky-300',
    Show: 'border-zinc-600 bg-zinc-800/80 text-amber-300',
  }[family]
  return (
    <section role="region" aria-label={label} data-entity-family={family.toLowerCase()} className="overflow-hidden bg-transparent">
      <header className={`flex shrink-0 items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/65 pl-2.5 pr-16 ${summary ? 'min-h-12 py-1.5' : 'h-10 py-1'}`}>
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
          {summary}
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  )
}

function ContextualInspector({
  show,
  compositionShow,
  selection,
  selectedClip,
  selectedCompositionClipOwner,
  selectedGroupClipOwner,
  transformEnabled,
  patternOptions,
  patternControlsByCellId,
  patternControlsByInstanceId,
  compiledCost,
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
  onUpdateGroupClipInspector,
  onOpenEffects,
  onOpenCompositionEffects,
  onOpenGroupEffects,
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
  onExtend,
  onSpanZones,
  onUpdateCellZoneMode,
  onUpdateBoundaryTransition,
  onOpenTransitions,
  onRemoveBoundaryTransition,
  onAddZone,
  onUpdateZone,
  onRemoveZone,
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
}: {
  show: ShowRecord
  compositionShow: ShowRecord
  selection: ShowSelection
  selectedClip: ShowCell | null
  selectedCompositionClipOwner: ShowClipInspectorOwner | null
  selectedGroupClipOwner: ShowGroupClipOwner | null
  transformEnabled: boolean
  patternOptions: ShowPatternOption[]
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  patternControlsByInstanceId: Record<string, AutomatablePatternControl[]>
  compiledCost?: import('@/engine/showVisualToolkit').ShowCompiledCostMetadata
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
  onUpdateClipInspector: (owner: ShowClipInspectorOwner, patch: ShowClipInspectorPatch) => void
  onUpdateGroupClipInspector: (owner: ShowGroupClipOwner, patch: ShowClipInspectorPatch) => void
  onOpenEffects: (cell: ShowCell) => void
  onOpenCompositionEffects: (owner: ShowClipInspectorOwner) => void
  onOpenGroupEffects: (owner: ShowGroupClipOwner) => void
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
  onExtend: (cell: ShowCell, sceneSpan: number) => void
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
  if (selection.kind === 'group-clip' && selectedGroupClipOwner) {
    const value = projectShowGroupClipInspector(compositionShow, selectedGroupClipOwner)
    if (value) {
      return (
        <CompositionClipInspector
          value={value}
          patternOptions={patternOptions}
          patternControls={value.instanceId
            ? patternControlsByInstanceId[`${selectedGroupClipOwner.occurrenceId}:${value.instanceId}`] ?? []
            : []}
          transformEnabled={transformEnabled}
          compiledCost={compiledCost}
          instanceOwnership={null}
          onPatch={(patch) => onUpdateGroupClipInspector(selectedGroupClipOwner, patch)}
          onPatternCommit={onPatternCommit}
          onOpenEffects={() => onOpenGroupEffects(selectedGroupClipOwner)}
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
    if (value) {
      return (
        <CompositionClipInspector
          value={value}
          patternOptions={patternOptions}
          patternControls={value.instanceId ? patternControlsByInstanceId[value.instanceId] ?? [] : []}
          transformEnabled={transformEnabled}
          compiledCost={compiledCost}
          instanceOwnership={instanceOwnership}
          onPatch={(patch) => onUpdateClipInspector(selectedCompositionClipOwner, patch)}
          onPatternCommit={onPatternCommit}
          onOpenEffects={() => onOpenCompositionEffects(selectedCompositionClipOwner)}
          onMakePatternIndependent={() => onMakeCompositionPatternIndependent(selectedCompositionClipOwner)}
          onRejoinPattern={(targetInstanceId) => onRejoinCompositionPattern(selectedCompositionClipOwner, targetInstanceId)}
          onRemove={() => onRemoveCompositionClip(selectedCompositionClipOwner)}
        />
      )
    }
  }

  if (selection.kind === 'clip' && selectedClip) {
    return (
      <ClipInspector
        key={selectedClip.id}
        show={show}
        clip={selectedClip}
        patternOptions={patternOptions}
        patternControls={patternControlsByCellId[selectedClip.id] ?? []}
        transformEnabled={transformEnabled}
        compiledCost={compiledCost}
        onUpdateClip={(patch) => onUpdateClipInspector({ kind: 'global', cellId: selectedClip.id }, patch)}
        onPatternCommit={onPatternCommit}
        onRemove={() => onRemoveClip(selectedClip)}
        onUpdateAdaptations={(changes) => onUpdateAdaptations(selectedClip, changes)}
        onOpenEffects={() => onOpenEffects(selectedClip)}
        onUpdateRestartOnEntry={(restartOnEntry) => onUpdateRestartOnEntry(selectedClip, restartOnEntry)}
        onExtend={(sceneSpan) => onExtend(selectedClip, sceneSpan)}
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
      onAddZone={onAddZone}
      onAddRoutingLayout={onAddRoutingLayout}
      onUpdateRoutingLayout={onUpdateRoutingLayout}
      onRemoveRoutingLayout={onRemoveRoutingLayout}
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
        <NumberField
          label="Start seconds"
          value={occurrence.startMs / 1_000}
          min={0}
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
  patternOptions,
  patternControls,
  transformEnabled,
  compiledCost,
  instanceOwnership,
  onPatch,
  onPatternCommit,
  onOpenEffects,
  onMakePatternIndependent,
  onRejoinPattern,
  onRemove,
}: {
  value: NonNullable<ReturnType<typeof projectShowClipInspector>>
  patternOptions: ShowPatternOption[]
  patternControls: AutomatablePatternControl[]
  transformEnabled: boolean
  compiledCost?: import('@/engine/showVisualToolkit').ShowCompiledCostMetadata
  instanceOwnership: ReturnType<typeof projectShowClipPatternInstanceOwnership>
  onPatch: (patch: ShowClipInspectorPatch) => void
  onPatternCommit: () => void
  onOpenEffects: () => void
  onMakePatternIndependent: () => void
  onRejoinPattern: (targetInstanceId: string) => void
  onRemove?: () => void
}) {
  return (
    <InspectorPanel
      family="Clip"
      heading={value.patternName}
      headingMeta={value.scope === 'scene-overlay' ? 'Overlay Layer' : 'Main Layer'}
      title="Pattern Clip"
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={onRemove ? (
        <Button
          size="icon-xs"
          variant="ghost"
          aria-label={`Delete clip ${value.patternName}`}
          title={`Delete ${value.patternName}`}
          className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300"
          onClick={onRemove}
        >
          <Trash2 size={12} aria-hidden />
        </Button>
      ) : undefined}
    >
      <ShowClipEntityDetail
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
        compiledCost={compiledCost}
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
        onPatternCommit={onPatternCommit}
        onOpenEffects={onOpenEffects}
      />
    </InspectorPanel>
  )
}

function ClipInspector({
  show,
  clip,
  patternOptions,
  patternControls,
  transformEnabled,
  compiledCost,
  onUpdateClip,
  onPatternCommit,
  onRemove,
  onUpdateAdaptations,
  onOpenEffects,
  onUpdateRestartOnEntry,
  onExtend,
  onSpanZones,
  onUpdateZoneMode,
}: {
  show: ShowRecord
  clip: ShowCell
  patternOptions: ShowPatternOption[]
  patternControls: AutomatablePatternControl[]
  transformEnabled: boolean
  compiledCost?: import('@/engine/showVisualToolkit').ShowCompiledCostMetadata
  onUpdateClip: (patch: ShowClipInspectorPatch) => void
  onPatternCommit: () => void
  onRemove: () => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
  onOpenEffects: () => void
  onUpdateRestartOnEntry: (restartOnEntry: boolean) => void
  onExtend: (sceneSpan: number) => void
  onSpanZones: (zoneSpan: number) => void
  onUpdateZoneMode: (zoneMode: NonNullable<ShowCell['zoneMode']>) => void
}) {
  const cell = clip
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === cell.sceneId)
  const maxSpan = Math.max(1, show.scenes.length - sceneIndex)
  const zoneIndex = show.zones.findIndex((zone) => zone.id === cell.zoneId)
  const maxZoneSpan = Math.max(1, show.zones.length - zoneIndex)
  const context = clipInspectorContext(show, cell, sceneIndex, zoneIndex)
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
      headingMeta="Pattern"
      title={context}
      summary={<ClipConfigurationSummary summary={summary} />}
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={(
        <Button size="icon-xs" variant="ghost" aria-label={`Delete clip ${cell.patternName}`} title={`Delete ${cell.patternName}`} className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={onRemove}>
          <Trash2 size={12} aria-hidden />
        </Button>
      )}
    >
      {inspectorValue && (
        <ShowClipEntityDetail
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
          compiledCost={compiledCost}
          embedded
          advancedDefaultOpen={hasAdvancedOverrides}
          onPatch={onUpdateClip}
          onPatternCommit={onPatternCommit}
          onOpenEffects={onOpenEffects}
        />
      )}
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
            <label className="text-[9px] uppercase tracking-[0.08em] text-zinc-600">
              Hold scenes
              <select
                aria-label="Hold scenes"
                value={cell.sceneSpan}
                onChange={(event) => onExtend(Number(event.target.value))}
                className={`${compactField} mt-1 w-full`}
              >
                {Array.from({ length: maxSpan }, (_, index) => index + 1).map((span) => (
                  <option key={span} value={span}>{span}</option>
                ))}
              </select>
            </label>
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
              <section className="mt-1 flex max-w-2xl min-w-0 items-center gap-2 border-t border-zinc-800/65 py-1">
                <label className="flex shrink-0 items-center gap-2 text-zinc-200">
                <input
                  type="checkbox"
                  aria-label="Restart Pattern on entry"
                  checked={Boolean(cell.restartOnEntry)}
                  onChange={(event) => onUpdateRestartOnEntry(event.target.checked)}
                />
                Restart Pattern on entry
                </label>
                <p className="min-w-0 flex-1 truncate text-[9px] text-zinc-500" title={cell.restartOnEntry
                  ? 'Starts a fresh Pattern instance and private time base at this scene boundary.'
                  : 'Continues the matching Pattern instance, private clock, and accumulated state across this boundary.'}>
                  {cell.restartOnEntry
                    ? 'Starts a fresh Pattern instance and private time base at this scene boundary.'
                    : 'Continues the matching Pattern instance, private clock, and accumulated state across this boundary.'}
                </p>
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
                  <NumberField compact label="Light on fraction" value={lightShutter.duty} min={0} max={1} step={0.01} onChange={(duty) => updateLightShutter({ duty })} />
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
    </InspectorPanel>
  )
}

function clipInspectorContext(show: ShowRecord, cell: ShowCell, sceneIndex: number, zoneIndex: number): string {
  const sceneNames = show.scenes
    .slice(sceneIndex, sceneIndex + Math.max(1, cell.sceneSpan))
    .map((scene) => scene.name)
  const zoneNames = show.zones
    .slice(zoneIndex, zoneIndex + Math.max(1, cell.zoneSpan ?? 1))
    .map((zone) => zone.name)
  return [
    ...(show.zones.length > 1 ? [compactInspectorNames(zoneNames)] : []),
    compactInspectorNames(sceneNames),
  ].filter(Boolean).join(' · ')
}

function compactInspectorNames(names: string[]): string {
  if (names.length <= 3) return names.join(', ')
  return `${names.slice(0, 3).join(', ')}, …`
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
  const rateLabel = formatCadenceRate(rateHz)
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
          <NumberField
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
          <div className="mt-1.5 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-t border-zinc-800/55 pt-1.5">
            <label className="grid min-w-0 grid-cols-[auto_minmax(5rem,1fr)] items-center gap-3 text-[9px] uppercase text-zinc-600">
              Jumps per second
              <input
                aria-label="Jumps per second"
                className="w-full accent-violet-400"
                type="range"
                min={0.25}
                max={30}
                step={0.25}
                value={rateHz}
                onChange={(event) => onChange(steppedClockStepMs(Number(event.target.value)))}
              />
            </label>
            <div className="text-right tabular-nums">
              <b className="text-[10px] font-medium text-zinc-200">{rateLabel}/s</b>
              <span className="ml-2 text-[8px] text-zinc-600">every {Math.round(stepMs)} ms</span>
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
  if (transition.kind === 'routing') {
    return (
      <InspectorPanel
        family="Transition"
        title={`${scene?.name ?? 'Scene'} → ${nextScene?.name ?? 'next'} · routing`}
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
              className={`${field} mt-1 w-full`}
            >
              {show.routingLayouts.map((layout) => (
                <option key={layout.id} value={layout.id}>{layout.name}</option>
              ))}
            </select>
          </label>
          <NumberField
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
              className={`${field} mt-1 w-full disabled:opacity-40`}
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
              className={`${field} mt-1 w-full disabled:opacity-40`}
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
          <output aria-label="Routing transfer cost" className="col-span-2 text-[10px] text-emerald-300/80">
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
      title={`${scene?.name ?? 'Scene'} → ${nextScene?.name ?? 'next'} · ${transition.kind}`}
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
          <div className="mt-1 text-zinc-300">{scene?.name} to {nextScene?.name}</div>
        </label>
        <button type="button" onClick={onOpenPalette} className="flex h-7 items-center gap-1.5 rounded border border-amber-400/25 bg-amber-400/[0.04] px-2 text-[9px] text-amber-200 hover:border-amber-400/55 hover:bg-amber-400/[0.08]">
          <Zap size={11} aria-hidden /> {transitionItem?.label ?? transition.kind} · Change
        </button>
      </div>
      {transitionItem && transition.kind !== 'cut' && (
        <ShowTransitionParameters
          transition={transition}
          item={transitionItem}
          onChange={(parameterId, value) => {
            const changes = showBoundaryTransitionParameterChanges(transition, transitionItem, parameterId, value)
            if (changes) onUpdate(transition.id, changes)
          }}
        />
      )}
      {transition.kind === 'crossfade' && (
        <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/55 p-2">
          <label className="text-[10px] uppercase text-zinc-600">
            Crossfade source
            <select
              aria-label="Crossfade source"
              value={transition.crossfadePolicy === 'snapshot-live' ? 'snapshot-live' : 'live-live'}
              onChange={(event) => onUpdate(transition.id, {
                crossfadePolicy: event.target.value === 'live-live' ? 'live-live' : 'snapshot-live',
              })}
              className={`${field} mt-1 w-full`}
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
          <output aria-label="Crossfade evaluation cost" className="mt-1 block text-[9px] text-emerald-300/80">
            {transition.crossfadePolicy === 'snapshot-live'
              ? 'Capture frame: two Pattern render paths · then one live Pattern renderer per pixel after capture'
              : 'Two live Pattern render paths per pixel throughout the transition'}
          </output>
        </div>
      )}
      <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/35">
        <summary className="cursor-pointer px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Advanced transition controls</summary>
        <div className="grid grid-cols-2 gap-2 border-t border-zinc-800 p-2">
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
          <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] text-zinc-500">
            Cost tier:{' '}
            <span className={cost === 'expensive' ? 'text-amber-300' : cost === 'cheap' ? 'text-emerald-300' : 'text-zinc-300'}>
              {cost}
            </span>
          </div>
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
    <section className="col-span-2 rounded border border-cyan-900/50 bg-cyan-950/10 p-2">
      <label className="flex items-center gap-2 text-[10px] uppercase text-cyan-300/80">
        <input
          type="checkbox"
          aria-label="Animate repeat scale"
          checked={Boolean(descriptor)}
          onChange={(event) => event.target.checked ? updateDescriptor({}) : removeDescriptor()}
          className="h-3.5 w-3.5 accent-cyan-400"
        />
        Repeat scale
        <span className="ml-auto font-mono text-zinc-500">{formatRepeatScale(fromTarget)}× → {formatRepeatScale(toTarget)}×</span>
      </label>
      {descriptor && (
        <div className="mt-2 grid grid-cols-3 gap-2">
          <NumberField
            label="Repeat scale start"
            value={descriptor.from}
            min={1}
            max={8}
            step={0.1}
            onChange={(from) => updateDescriptor({ from })}
          />
          <NumberField
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
              className={`${field} mt-1 w-full`}
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
  { property: 'rotation', label: 'Rotation', format: (value) => `${Number((value * 360).toFixed(1))} deg` },
  { property: 'scaleX', label: 'Scale X', format: (value) => `${Number(value.toFixed(2))}x` },
  { property: 'scaleY', label: 'Scale Y', format: (value) => `${Number(value.toFixed(2))}x` },
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
    <section aria-label="Transform transition" className="col-span-2 rounded border border-cyan-400/15 bg-cyan-400/[0.035] p-2">
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cyan-300/80">Transform</div>
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
                  className="size-3.5 accent-cyan-400"
                />
                <span>{label}</span>
                <span className="ml-auto font-mono text-zinc-600">{format(from)} to {format(to)}</span>
              </label>
              {descriptor && (
                <div className="mt-1.5 grid grid-cols-2 gap-2 pl-5">
                  <NumberField
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
                      className={`${field} mt-1 w-full`}
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
    <section className="col-span-2 rounded border border-sky-900/50 bg-sky-950/10 p-2">
      <label className="flex items-center gap-2 text-[10px] uppercase text-sky-300/80">
        <input
          type="checkbox"
          aria-label="Animate split position"
          checked={Boolean(descriptor)}
          onChange={(event) => event.target.checked ? updateDescriptor({}) : removeDescriptor()}
          className="h-3.5 w-3.5 accent-sky-400"
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
          <NumberField
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
              className={`${field} mt-1 w-full`}
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
      className={isTime
        ? 'col-span-2 rounded border border-violet-400/15 bg-violet-400/[0.035] p-2'
        : 'col-span-2 rounded border border-amber-400/15 bg-amber-400/[0.035] p-2'}
      aria-label={`${title} transition`}
    >
      <div className={isTime
        ? 'mb-2 text-[10px] uppercase tracking-[0.12em] text-violet-300/80'
        : 'mb-2 text-[10px] uppercase tracking-[0.12em] text-amber-300/80'}>{title}</div>
      {descriptor && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <NumberField
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
              className={`${field} mt-1 w-full`}
            >
              <ShowEasingOptions />
            </select>
          </label>
        </div>
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
            <div key={cell.id} className="rounded border border-zinc-800 bg-zinc-950/45 p-2">
              <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                <input
                  type="checkbox"
                  aria-label={`Animate ${isTime ? 'speed' : 'brightness'} for ${zone.name}`}
                  checked={enabled}
                  disabled={transition.kind === 'cut'}
                  onChange={(event) => updateFrom(event.target.checked ? outgoing?.adaptations[property] ?? 1 : undefined)}
                  className={isTime ? 'h-3.5 w-3.5 accent-violet-400' : 'h-3.5 w-3.5 accent-amber-400'}
                />
                {zone.name}
              </label>
              {enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberField
                    label={`${title} start ${zone.name}`}
                    value={from}
                    min={0}
                    max={max}
                    step={0.05}
                    onChange={updateFrom}
                  />
                  <NumberField
                    label={`${title} target ${zone.name}`}
                    value={cell.adaptations[property]}
                    min={0}
                    max={max}
                    step={0.05}
                    onChange={(value) => onUpdateCellAdaptations(cell, { [property]: value })}
                  />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-2 text-[10px] leading-4 text-zinc-500">
        The destination scene owns the target. This boundary owns this property's start, duration, and easing.
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
    <section className="col-span-2 rounded border border-cyan-400/15 bg-cyan-400/[0.035] p-2" aria-label={`${control.label} control transition`}>
      <div className="mb-1 text-[10px] uppercase tracking-[0.12em] text-cyan-300/80">{control.label} · Pattern control</div>
      <div className="mb-2 text-[9px] text-zinc-600">{control.exportName} · 0–1 · default {control.defaultValue}</div>
      {descriptor && (
        <div className="mb-2 grid grid-cols-2 gap-2">
          <NumberField
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
              className={`${field} mt-1 w-full`}
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
            <div key={cell.id} className="rounded border border-zinc-800 bg-zinc-950/45 p-2">
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
                  className="h-3.5 w-3.5 accent-cyan-400"
                />
                {zone.name}
              </label>
              {!bothTargets && <p className="mt-1 text-[9px] text-amber-300/70">Set this target on both adjacent clips first.</p>}
              {enabled && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <NumberField
                    label={`${control.label} start ${zone.name}`}
                    value={from}
                    min={0}
                    max={1}
                    step={0.01}
                    onChange={(value) => updateDescriptor({}, { ...(descriptor?.fromByCellId ?? {}), [cell.id]: value })}
                  />
                  <NumberField
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
  if (logical.kind === 'split') return `${names[0]} and ${names[1]} share a normalized Stage axis. Scene targets move the split continuously.`
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
  onAddZone,
  onAddRoutingLayout,
  onUpdateRoutingLayout,
  onRemoveRoutingLayout,
}: {
  show: ShowRecord
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdatePortableReference: (referenceMapId: string | null, referencePixelCount: number) => void
  onUpdateOutputEffects: (outputEffects: ShowOutputEffect[]) => void
  compiledOutputEffects?: import('@/engine/showCompiler').ShowCompileSummary['outputEffects']
  onAddZone: () => void
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
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
              <input
                key={portable.referencePixelCount}
                aria-label="Portable reference pixels"
                type="number"
                min={1}
                max={2000}
                defaultValue={portable.referencePixelCount}
                onBlur={(event) => onUpdatePortableReference(portable.referenceMapId, Number(event.currentTarget.value))}
                className={field}
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
      <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>{portable
          ? 'Portable routing uses normalized Stage positions at runtime.'
          : `Using ${targetProfile?.name ?? 'nominal zones'} for compile estimates.`}</span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={onAddZone}
          className="h-7 rounded border border-zinc-800 px-2 text-[10px] uppercase tracking-wider text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
        >
          Add zone
        </button>
      </div>
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
                className="accent-cyan-400"
              />
              Trails
            </label>
            {trails && (
              <label className="flex min-w-0 flex-1 items-center gap-2 text-[9px] uppercase tracking-[0.08em] text-zinc-600">
                Retention
                <input
                  aria-label="Trails retention"
                  type="range"
                  min={0}
                  max={1}
                  step={0.015625}
                  value={trails.retention}
                  onChange={(event) => onUpdateOutputEffects([{
                    ...trails,
                    retention: Number(event.currentTarget.value),
                  }])}
                  className="min-w-20 flex-1 accent-cyan-400"
                />
                <span className="w-10 text-right font-mono text-[10px] tabular-nums text-cyan-300">
                  {(trails.retention * 100).toFixed(1)}%
                </span>
              </label>
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
      <div className="mt-4 border-t border-zinc-800 pt-3">
        <div className="mb-2 flex items-center gap-2">
          <Route size={13} aria-hidden className="text-zinc-500" />
          <h4 className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">Routing layouts</h4>
          <span className="flex-1" />
          <button
            type="button"
            aria-label="Add routing layout"
            title="Add routing layout"
            onClick={() => onAddRoutingLayout()}
            className="flex h-7 w-7 items-center justify-center rounded border border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-zinc-100"
          >
            <Plus size={13} aria-hidden />
          </button>
        </div>
        <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
          {show.routingLayouts.map((layout) => (
            <div key={layout.id} className="py-3">
              <div className="flex items-center gap-2">
                <input
                  aria-label={`${layout.name} routing layout name`}
                  value={layout.name}
                  onChange={(event) => onUpdateRoutingLayout(layout.id, { name: event.target.value })}
                  className={`${field} min-w-0 flex-1`}
                />
                <button
                  type="button"
                  aria-label={`Duplicate routing layout ${layout.name}`}
                  title={`Duplicate ${layout.name}`}
                  onClick={() => onAddRoutingLayout(layout.id)}
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
                >
                  <Copy size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  aria-label={`Remove routing layout ${layout.name}`}
                  title={`Remove ${layout.name}`}
                  onClick={() => onRemoveRoutingLayout(layout.id)}
                  disabled={show.routingLayouts.length <= 1}
                  className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-red-950/30 hover:text-red-300 disabled:opacity-25 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
                >
                  <Trash2 size={13} aria-hidden />
                </button>
              </div>
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
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Columns
                    <input
                      key={layout.logical.columns}
                      aria-label="Checker columns"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={layout.logical.columns}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'checker', {
                          columns: Math.max(1, Math.round(Number(event.currentTarget.value) || 1)),
                        }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Rows
                    <input
                      key={layout.logical.rows}
                      aria-label="Checker rows"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={layout.logical.rows}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'checker', {
                          rows: Math.max(1, Math.round(Number(event.currentTarget.value) || 1)),
                        }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                </div>
              )}
              {layout.logical?.kind === 'rings' && (
                <div className="mt-2 max-w-[9.5rem]">
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Ring count
                    <input
                      key={layout.logical.rings}
                      aria-label="Ring count"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={layout.logical.rings}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'rings', {
                          rings: Math.max(1, Math.round(Number(event.currentTarget.value) || 1)),
                        }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                </div>
              )}
              {layout.logical?.kind === 'pinwheel' && (
                <div className="mt-2 grid max-w-xl grid-cols-3 gap-2">
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Arms
                    <input
                      key={layout.logical.arms ?? layout.logical.zoneIds.length}
                      aria-label="Pinwheel arms"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={layout.logical.arms ?? layout.logical.zoneIds.length}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                          arms: Math.max(1, Math.round(Number(event.currentTarget.value) || 1)),
                        }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Twist turns
                    <input
                      key={layout.logical.twist}
                      aria-label="Pinwheel twist turns"
                      type="number"
                      step={0.05}
                      defaultValue={Number((layout.logical.twist / (Math.PI * 2)).toFixed(3))}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                          twist: (Number(event.currentTarget.value) || 0) * Math.PI * 2,
                        }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Rotation °
                    <input
                      key={layout.logical.rotation ?? 0}
                      aria-label="Pinwheel rotation degrees"
                      type="number"
                      step={1}
                      defaultValue={Number((((layout.logical.rotation ?? 0) * 180) / Math.PI).toFixed(2))}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'pinwheel', {
                          rotation: (Number(event.currentTarget.value) || 0) * Math.PI / 180,
                        }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
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
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Bands
                    <input
                      key={layout.logical.bands}
                      aria-label="Wave band count"
                      type="number"
                      min={1}
                      step={1}
                      defaultValue={layout.logical.bands}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'wave', { bands: Math.max(1, Math.round(Number(event.currentTarget.value) || 1)) }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Amplitude
                    <input
                      key={layout.logical.amplitude}
                      aria-label="Wave amplitude"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      defaultValue={layout.logical.amplitude}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'wave', { amplitude: Math.max(0, Math.min(1, Number(event.currentTarget.value) || 0)) }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Frequency
                    <input
                      key={layout.logical.frequency}
                      aria-label="Wave frequency"
                      type="number"
                      min={0}
                      step={0.1}
                      defaultValue={layout.logical.frequency}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'wave', { frequency: Math.max(0, Number(event.currentTarget.value) || 0) }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Phase
                    <input
                      key={layout.logical.phase}
                      aria-label="Wave phase"
                      type="number"
                      step={0.05}
                      defaultValue={layout.logical.phase}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'wave', { phase: Number(event.currentTarget.value) || 0 }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
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
                  <label className="text-[9.5px] uppercase text-zinc-600">
                    Feather
                    <input
                      key={layout.logical.feather}
                      aria-label="Soft Split feather"
                      type="number"
                      min={0}
                      max={1}
                      step={0.05}
                      defaultValue={layout.logical.feather}
                      onBlur={(event) => onUpdateRoutingLayout(layout.id, {
                        logical: patchLogicalRouting(layout.logical!, 'soft-split', { feather: Math.max(0, Math.min(1, Number(event.currentTarget.value) || 0)) }),
                      })}
                      className={`${field} mt-1 w-full`}
                    />
                  </label>
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
                      <input
                        key={formatShowRoutingRanges(layoutZone?.ranges ?? [])}
                        aria-label={`${layout.name} ${zone.name} pixel ranges`}
                        defaultValue={formatShowRoutingRanges(layoutZone?.ranges ?? [])}
                        placeholder="0-63, 128-191"
                        onBlur={(event) => {
                          const ranges = parseShowRoutingRanges(event.currentTarget.value)
                          if (ranges === null) {
                            event.currentTarget.value = formatShowRoutingRanges(layoutZone?.ranges ?? [])
                            return
                          }
                          onUpdateRoutingLayout(layout.id, {
                            zones: layout.zones.map((candidate) => candidate.zoneId === zone.id
                              ? { ...candidate, ranges }
                              : candidate),
                          })
                        }}
                        className={`${field} mt-1 w-full font-mono`}
                      />
                    </label>
                  )
                })}
              </div>
              )}
            </div>
          ))}
        </div>
      </div>
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
          <input
            aria-label={`Zone name ${zone.name}`}
            value={zone.name}
            onChange={(event) => onUpdateZone({ name: event.target.value })}
            className={`${field} w-full`}
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
  targetPixels,
  pushResult,
}: {
  compiled: CompiledShowState
  artifactInventory: {
    inventory: DeliveredShowSourceInventory
    model: ShowArtifactInventoryModel
  } | null
  targetPixels: number
  pushResult: string | null
}) {
  if (compiled.error) {
    return (
      <div className="flex min-h-10 shrink-0 items-center gap-2 border-t border-seam bg-zinc-950 px-3 font-mono text-xs text-amber-300">
        <Zap size={14} aria-hidden />
        {compiled.error}
      </div>
    )
  }
  const summary = compiled.artifact?.summary
  const ratio = summary?.artifactBudgetRatio ?? 0
  const pressure = summary ? assessShowCompilePressure({
    artifactBytes: summary.artifactBytes,
    budgetBytes: summary.measuredDeviceBudgetBytes,
    worstInstantRenderersPerPixel: summary.worstInstantRenderersPerPixel,
  }) : null
  const estimate = estimateFps(ratio, summary?.renderPolicy)
  const worstInstant = summary?.transitionCost === 'renderer-window'
    ? 'crossfade'
    : summary?.transitionCost === 'bounded-renderer-window'
      ? 'portal blend (feather band only)'
    : summary?.transitionCost === 'parameter'
      ? 'adaptation ramp'
      : summary?.transitionCost === 'route'
        ? summary.routePolicy === 'feathered-wipe'
          ? 'feathered wipe'
          : summary.routePolicy === 'portal-dithered-feather'
            ? 'portal dither'
            : summary.routePolicy === 'portal-hard'
              ? 'portal'
              : 'route transition'
        : 'none'
  const clockPolicy = summary?.clockPolicy === 'exact-pause-ramp'
    ? 'exact pause ramp'
    : summary?.clockPolicy === 'exact-pause'
      ? 'exact pause'
      : summary?.clockPolicy === 'scaled-ramp'
        ? 'scaled ramp'
        : summary?.clockPolicy === 'scaled'
          ? 'scaled'
          : 'real time'
  const maskedClipFractions = summary?.clips
    .filter((clip) => clip.evaluationPolicy !== 'full')
    .map((clip) => `${Math.round(clip.expectedActiveFraction * 100)}%`) ?? []
  const evaluationLabel = summary?.evaluationPolicy === 'masked-shutter'
    ? `${Math.round((summary.expectedActiveFraction ?? 0) * 100)}% expected`
    : summary?.evaluationPolicy === 'mixed'
      ? `${maskedClipFractions.join(', ')} expected for masked clip`
      : null
  const steppedRates = summary?.clips
    .filter((clip) => clip.temporalPolicy === 'stepped-clock' && clip.stepMs !== null)
    .map((clip) => formatCadenceRate(steppedClockRateHz(clip.stepMs!))) ?? []
  const temporalLabel = summary?.temporalPolicy === 'stepped-clock'
    ? `${[...new Set(steppedRates)].join(', ')}/s stepped`
    : summary?.temporalPolicy === 'mixed'
      ? `${[...new Set(steppedRates)].join(', ')}/s stepped clip`
      : null
  const timeOffsets = summary?.clips
    .filter((clip) => clip.timeOffsetMs > 0)
    .map((clip) => `${Math.round(clip.timeOffsetMs)}ms`) ?? []
  const timeOffsetLabel = summary?.timeOffsetPolicy === 'per-clip'
    ? [...new Set(timeOffsets)].join(', ')
    : null
  const renderTargetRoleLabels = {
    'stage-rgb': 'RGB',
    'sample-xy': 'XY',
    'scalar-field': 'scalar',
    'previous-rgb': 'previous RGB',
  } as const
  const renderTargetBindings = summary?.renderTarget.roleBindings
    .map((binding) => `${renderTargetRoleLabels[binding.role]} ${Object.values(binding.channels).join('/')}`)
    .join(' · ')
  const rejectedRenderTargetCandidates = summary?.renderTargetPlan.decisions
    .filter((decision) => decision.status === 'rejected') ?? []
  const renderTargetAssignmentLabels = summary?.renderTargetPlan.assignments.map((assignment) => (
    `${assignment.role} planes ${assignment.planes.join('/')}`
    + ` · ${assignment.lifetime.kind}`
    + ` · invalidates ${assignment.invalidatedBy.join('/')}`
  )) ?? []
  const coverage = summary?.specializations.contentKeys
  const coverageEndpointCount = coverage
    ? coverage.zeroWeightLayersSkipped
      + coverage.zeroWeightRequiredCallsRetained
      + coverage.fullWeightBlendBypasses
      + coverage.trackedEndpointLayersEligible
      + coverage.trackedEndpointRequiredCallsRetained
    : 0
  return (
    <div data-testid="show-compile-bar" className="scrollbar-hidden min-h-8 shrink-0 overflow-x-auto border-t border-seam bg-zinc-950 px-3 font-mono text-[10px] text-zinc-500">
      <div className="flex min-h-8 min-w-max items-center gap-2 whitespace-nowrap">
      <span>Show source</span>
      <span
        className="h-2 w-28 overflow-hidden rounded-sm bg-zinc-800"
        aria-label={summary
          ? `Generated UTF-8 source size compared with a source-size proxy derived from the observed ${summary.measuredDeviceBudgetBytes.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling. This is not remaining Controller capacity.`
          : undefined}
        title={summary
          ? `Generated UTF-8 source size compared with a source-size proxy derived from the observed ${summary.measuredDeviceBudgetBytes.toLocaleString('en-US')}-byte compiled-bytecode activation ceiling. This is not remaining Controller capacity.`
          : undefined}
      >
        <span
          className={`block h-full ${pressure?.status === 'blocked' ? 'bg-red-500' : pressure?.status === 'warning' ? 'bg-amber-400' : 'bg-live'}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
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
            routing: summary.routingRepresentation,
            score: summary.specializations.showScore?.selected
              ? summary.specializations.showScore
              : null,
            motion: summary.specializations.motionTransitions?.selected
              ? summary.specializations.motionTransitions
              : null,
            generatedEffectKernelCount: summary.specializations.generatedEffectKernels.kernelCount,
          }}
        />
      ) : (
        <b className="text-zinc-300">-</b>
      )}
      <span>
        · generated UTF-8 source {summary ? formatBytes(summary.artifactBytes) : '-'}
        {' · '}source-size proxy against observed compiled-bytecode activation ceiling {summary ? `${summary.measuredDeviceBudgetBytes.toLocaleString('en-US')} B` : '-'}
      </span>
      {summary?.resources && (
        <span className={summary.resources.remainingWords < 0 ? 'text-red-300' : 'text-sky-200'}>
          VM {summary.resources.totalWords.toLocaleString('en-US')}/{summary.resources.vmWordBudget.toLocaleString('en-US')} words
          {' · '}arena {summary.resources.renderTargetWords.toLocaleString('en-US')}
          {' · '}{summary.resources.remainingWords.toLocaleString('en-US')} free
        </span>
      )}
      {summary?.renderTarget && (
        <span className="text-cyan-200">
          render target: {summary.renderTarget.planeCount} planes
          {' · '}{summary.renderTarget.activeRole ?? 'unassigned'}
          {' · '}{renderTargetBindings}
        </span>
      )}
      {summary?.renderTargetPlan && summary.renderTargetPlan.decisions.length > 0 && (
        <span className="text-violet-200">
          cache plan: {summary.renderTargetPlan.assignments.length} selected
          {' · '}{rejectedRenderTargetCandidates.length} rejected
          {' · '}peak {summary.renderTargetPlan.peakPlaneCount}/{summary.renderTargetPlan.planeCount} planes
          {' · '}est. {summary.renderTargetPlan.totalEstimatedSavedWork.toLocaleString('en-US')} work avoided
        </span>
      )}
      {renderTargetAssignmentLabels.map((label) => (
        <span key={label} className="text-violet-200">{label}</span>
      ))}
      {rejectedRenderTargetCandidates.map((decision) => (
        <span key={decision.candidateId} className="text-amber-300">
          cache rejected: {decision.candidateId} · {decision.reason} · {decision.detail}
        </span>
      ))}
      {summary && summary.specializations.freezeAtEntry.authoredClipCount > 0 && (
        <span className={summary.specializations.freezeAtEntry.selectedSceneCount > 0 ? 'text-emerald-300' : 'text-amber-300'}>
          freeze at entry: {summary.specializations.freezeAtEntry.selectedSceneCount} selected scene{summary.specializations.freezeAtEntry.selectedSceneCount === 1 ? '' : 's'}
          {' · '}{summary.specializations.freezeAtEntry.evaluationsAvoidedPerReplayFrame.toLocaleString('en-US')} Pattern evaluations/replay frame avoided
          {' · '}scene lifetime · RGB planes 0/1/2
          {' · '}capture once, private clock continues
          {' · '}invalidates on scene/clip exit, loop, seek, pre-capture changes, or arena ownership
        </span>
      )}
      {summary && (
        summary.specializations.patternOutputReuse.groups.length > 0
        || summary.specializations.patternOutputReuse.excluded.length > 0
      ) && (
        <span className={summary.specializations.patternOutputReuse.selectedGroupCount > 0 ? 'text-emerald-300' : 'text-amber-300'}>
          output reuse: {summary.specializations.patternOutputReuse.selectedGroupCount} selected group{summary.specializations.patternOutputReuse.selectedGroupCount === 1 ? '' : 's'}
          {' · '}{summary.specializations.patternOutputReuse.evaluationsAvoidedPerFrame.toLocaleString('en-US')} Pattern evaluations/frame avoided
          {' · '}+{summary.specializations.patternOutputReuse.additionalArrayWords} array words
          {' · '}{summary.specializations.patternOutputReuse.excluded.length} excluded consumer{summary.specializations.patternOutputReuse.excluded.length === 1 ? '' : 's'}
        </span>
      )}
      {coverage && (coverage.keyedClipCount > 0 || coverageEndpointCount > 0) && (
        <span className={coverage.selectedStackCount > 0 || coverage.zeroWeightLayersSkipped > 0 ? 'text-emerald-300' : 'text-amber-300'}>
          coverage: {coverage.keyedClipCount} keyed Pattern{coverage.keyedClipCount === 1 ? '' : 's'}
          {' · '}{coverage.selectedStackCount} conditional stack{coverage.selectedStackCount === 1 ? '' : 's'}
          {coverage.evaluationFormula && (
            <> · {coverage.evaluationFormula} render paths · best {coverage.bestCaseRenderersPerPixel}, worst {coverage.worstCaseRenderersPerPixel} renderers/px</>
          )}
          {coverage.zeroWeightLayersSkipped > 0 && ` · ${coverage.zeroWeightLayersSkipped} zero-weight evaluation${coverage.zeroWeightLayersSkipped === 1 ? '' : 's'} skipped`}
          {coverage.zeroWeightRequiredCallsRetained > 0 && ` · ${coverage.zeroWeightRequiredCallsRetained} zero-weight state call${coverage.zeroWeightRequiredCallsRetained === 1 ? '' : 's'} retained`}
          {coverage.fullWeightBlendBypasses > 0 && ` · ${coverage.fullWeightBlendBypasses} full-weight blend${coverage.fullWeightBlendBypasses === 1 ? '' : 's'} bypassed`}
          {coverage.trackedEndpointLayersEligible > 0 && ` · ${coverage.trackedEndpointLayersEligible} animated endpoint${coverage.trackedEndpointLayersEligible === 1 ? '' : 's'} eligible`}
          {coverage.trackedEndpointRequiredCallsRetained > 0 && ` · ${coverage.trackedEndpointRequiredCallsRetained} animated state call${coverage.trackedEndpointRequiredCallsRetained === 1 ? '' : 's'} retained`}
          {' · '}{coverage.rejectedStackCount} fallback stack{coverage.rejectedStackCount === 1 ? '' : 's'}
        </span>
      )}
      {summary?.renderPolicy === 'snapshot-outgoing-transition-live-incoming' && (
        <span className="text-emerald-300">
          crossfade: snapshot outgoing · capture frame 2 render paths/px · then 1 live render path/px
        </span>
      )}
      {compiled.artifactBlocker && <span className="text-red-300">Output blocked: {compiled.artifactBlocker}</span>}
      {pressure?.blocks.map((block) => <span key={block} className="text-red-300">Output blocked: {block}</span>)}
      {pressure?.warnings.map((warning) => <span key={warning} className="text-amber-300">{warning}</span>)}
      <span>-</span>
      <b className="text-zinc-300">est. {estimate} fps @ {targetPixels} px</b>
      <span>-</span>
      <span>steady state <span className={summary && summary.steadyStateRenderersPerPixel > 2 ? 'text-amber-300' : 'text-emerald-300'}><Check size={12} className="inline" aria-hidden /> {summary?.steadyStateRenderersPerPixel ?? 1} renderer{summary?.steadyStateRenderersPerPixel === 1 ? '' : 's'}/px</span></span>
      <span className={summary?.transitionCost === 'renderer-window' || summary?.transitionCost === 'bounded-renderer-window' ? 'text-amber-300' : 'text-emerald-300'}>
        worst instant: {worstInstant}{summary && summary.worstInstantRenderersPerPixel > 1 ? ` · ${summary.worstInstantRenderersPerPixel} renderers/px` : ''}
      </span>
      {summary?.routingRepresentation !== 'none' && (
        <span className="text-sky-300">
          routing: {summary?.routingRepresentation === 'packed-pixels'
            ? 'packed pixels'
            : summary?.routingRepresentation === 'generated-formula'
              ? 'generated formula'
            : summary?.routingRepresentation === 'coordinate-predicates'
              ? 'coordinate predicates'
              : 'range branches'}
          {summary?.routingEstimate && (
            <> · est. {formatBytes(summary.routingEstimate.estimatedBytecodeBytes)} bytecode
              {summary.routingEstimate.estimatedArrayBytes > 0
                ? ` + ${formatBytes(summary.routingEstimate.estimatedArrayBytes)} array`
                : ''}
            </>
          )}
        </span>
      )}
      {summary?.specializations.routing && (
        <span className="text-emerald-300">
          routing specialization: complete disjoint short-circuit
          {' · '}max {summary.specializations.routing.baselineMaxComparisonsPerPixel}
          {' -> '}{summary.specializations.routing.selectedMaxComparisonsPerPixel} comparisons/px
          {' · '}{summary.specializations.routing.maxComparisonsAvoidedPerPixel} avoided
        </span>
      )}
      {summary && summary.specializations.capture.length > 0 && (
        <span className="text-emerald-300">
          capture specialization: {summary.specializations.capture.filter((item) => item.samplePath === 'identity').length} identity sample
          {' · '}{summary.specializations.capture.filter((item) => item.clearPolicy === 'omitted-guaranteed-output').length} clear omitted
          {' · '}up to {Math.max(...summary.specializations.capture.map((item) => item.operationsAvoidedPerEvaluatedPixel))} ops/evaluation avoided
        </span>
      )}
      {summary && summary.specializations.frameInvariants.some((item) => item.selectedCount > 0) && (
        <span className="text-emerald-300">
          frame invariants: {summary.specializations.frameInvariants.reduce((sum, item) => sum + item.selectedCount, 0)} hoisted
          {' · '}{summary.specializations.frameInvariants.reduce((sum, item) => sum + item.operationsAvoidedPerEvaluatedPixel, 0)} ops/evaluation avoided
          {' · '}{summary.specializations.frameInvariants.flatMap((item) => item.bindings).join(', ')}
        </span>
      )}
      {summary?.specializations.renderKernels && (
        <span className={summary.specializations.renderKernels.selected ? 'text-emerald-300' : 'text-zinc-500'}>
          kernel specialization: {summary.specializations.renderKernels.selected
            ? 'selected'
            : summary.specializations.renderKernels.reason === 'hardware-profile'
              ? 'measured-neutral on pb32'
              : `declined (${summary.specializations.renderKernels.reason})`}
          {' · '}{summary.specializations.renderKernels.configurationPlanCount} plans / {summary.specializations.renderKernels.kernelCount} kernels
          {' · '}up to {summary.specializations.renderKernels.avoidedBranchesPerPixel} branches/px candidate
          {' · '}source dispatch {summary.specializations.renderKernels.sourceByteDelta > 0 ? '+' : ''}{summary.specializations.renderKernels.sourceByteDelta.toLocaleString('en-US')} B
          {!summary.specializations.renderKernels.selected && ' retained as baseline dispatch'}
        </span>
      )}
      {summary?.specializations.motionTransitions && (
        <span className={summary.specializations.motionTransitions.selected ? 'text-emerald-300' : 'text-zinc-500'}>
          motion sharing: {summary.specializations.motionTransitions.representation === 'exact-family-kernels'
            ? 'family kernels'
            : summary.specializations.motionTransitions.representation === 'exact-shared-environment'
              ? 'shared environment'
              : `unrolled (${summary.specializations.motionTransitions.reason})`}
          {' · '}{summary.specializations.motionTransitions.boundaryCount} boundaries / {summary.specializations.motionTransitions.kernelCount} kernels
          {' · '}{summary.specializations.motionTransitions.stackPlanCount} stack plans
          {' · '}{summary.specializations.motionTransitions.avoidedEmittedBytes.toLocaleString('en-US')} emitted B avoided
          {' · '}{summary.specializations.motionTransitions.parameterScalarGlobals} scalars
          {' · '}+{summary.specializations.motionTransitions.dynamicBranchesAddedPerPixel} branches/px
        </span>
      )}
      {summary?.specializations.showScore?.selected && (
        <span className="text-emerald-300">
          show score: table driven
          {' · '}{summary.specializations.showScore.boundaryCount} boundaries
          {' / '}{summary.specializations.showScore.stackPlanCount} stacks
          {' / '}{summary.specializations.showScore.kernelCount} {summary.specializations.showScore.kernelCount === 1 ? 'kernel' : 'kernels'}
          {' · '}{summary.specializations.showScore.scoreWords.toLocaleString('en-US')} words
          {' · '}init {summary.specializations.showScore.initializationAssignments.toLocaleString('en-US')} assignments
          {' + '}{summary.specializations.showScore.initializationOperations.toLocaleString('en-US')} ops
          {' · '}{summary.specializations.showScore.avoidedEmittedBytes.toLocaleString('en-US')} emitted B avoided
          {' · '}{summary.specializations.showScore.timing === 'regular-cadence' ? 'regular cadence' : 'explicit boundaries'}
          {' · '}{summary.specializations.showScore.qualification.boardType} bytecode
          {' '}{summary.specializations.showScore.qualification.controllerBytecodeDeltaPercent.worst}%
          {' to '}{summary.specializations.showScore.qualification.controllerBytecodeDeltaPercent.best}%
          {' · '}runtime {summary.specializations.showScore.qualification.runtimeDisposition}
        </span>
      )}
      {summary?.specializations.patternSlots?.selected && (
        <span className="text-emerald-300">
          pattern machines: {summary.specializations.patternSlots.logicalMemberCount} logical
          {' -> '}{summary.specializations.patternSlots.physicalSlotCount} physical
          {' · '}{summary.specializations.patternSlots.reclaimedMachineCount} reclaimed
          {' · '}{summary.specializations.patternSlots.steadyStateRenderOperationsAdded} steady-state render ops added
        </span>
      )}
      {summary?.routingParameterEstimate && (
        <span className="text-sky-200">
          moving split: 1 scalar · 1 route test/px · avoids {summary.routingParameterEstimate.equivalentEnumeratedArrayElements} table entries
        </span>
      )}
      {summary?.sampleRemappingEstimate && (
        <span className="text-cyan-200">
          sample repeat: 1 scalar · up to 2 multiply + 2 frac/px · +0 renderers
        </span>
      )}
      {summary && summary.clockPolicy !== 'real-time' && (
        <span className={summary.clockPolicy.includes('exact-pause') ? 'text-amber-300' : 'text-zinc-500'}>
          clock: {clockPolicy}
        </span>
      )}
      {evaluationLabel && (
        <span className="text-sky-300">
          Pattern eval: {evaluationLabel} - outer loop + LEDs unchanged
        </span>
      )}
      {temporalLabel && (
        <span className="text-violet-300">
          Motion cadence: {temporalLabel} - renderer cost unchanged
        </span>
      )}
      {timeOffsetLabel && (
        <span className="text-violet-300">
          Clock offset: {timeOffsetLabel} - renderer cost unchanged
        </span>
      )}
      {summary?.warnings.map((warning) => <span key={warning} className="text-amber-300">{warning}</span>)}
      {pushResult && <span className="text-zinc-300">{pushResult}</span>}
      </div>
    </div>
  )
}

// Shared draft-buffered numeric field (#577) in the editor-panel style.
function NumberField(props: Omit<UiNumberFieldProps, 'variant' | 'align' | 'ariaLabel' | 'disabled'>) {
  return <UiNumberField variant="editor" {...props} />
}

function ClipConfigurationSummary({ summary }: { summary: ShowClipSummarySection[] }) {
  return (
    <section
      role="region"
      aria-label="Clip summary"
      title={showClipInlineSummary(summary)}
      className="mt-0.5 flex max-h-7 min-h-3 flex-wrap items-center gap-x-3 gap-y-0.5 overflow-hidden font-mono text-[9px]"
    >
      {summary.length === 0 && <span className="text-zinc-600">Defaults</span>}
      {summary.map((section) => (
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
          {section.items.map((item, index) => (
            <span key={item.id} className="inline-flex items-baseline whitespace-nowrap">
              {index > 0 && <span aria-hidden className="mr-1.5 text-zinc-700">·</span>}
              <span className="text-zinc-400">{item.label}</span>
              {item.value && <strong className="ml-1 font-medium text-zinc-100">{item.value}</strong>}
            </span>
          ))}
        </span>
      ))}
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

function clipSummaryTone(kind: ShowClipSummaryKind): string {
  if (kind === 'controls') return 'text-cyan-300/80'
  if (kind === 'view') return 'text-amber-200/75'
  if (kind === 'effects') return 'text-emerald-300/75'
  if (kind === 'animation') return 'text-violet-300/85'
  return 'text-zinc-400'
}

function formatCadenceRate(rateHz: number): string {
  return Number.isInteger(rateHz) ? rateHz.toFixed(0) : rateHz.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
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
  return Number(value.toFixed(2)).toString()
}

function formatRepeatScale(value: number): string {
  return Number(value.toFixed(2)).toString()
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

function estimateFps(ratio: number, policy: string | undefined): number {
  const base = policy === 'steady-active-transition-both' ? 62 : 70
  return Math.max(20, Math.round(base - ratio * 12))
}

function zonePixelTotal(show: ShowRecord): number {
  return show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)
}

export function targetZonePixelTotal(zones: ControllerZone[] | undefined): number {
  return zones?.reduce((sum, zone) => sum + controllerZonePixelCount(zone), 0) ?? 0
}
