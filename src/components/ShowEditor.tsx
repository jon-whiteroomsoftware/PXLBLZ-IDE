import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown, Clapperboard, Code2, Copy, Download, Grid2X2, Lock, Magnet, Map as MapIcon, Maximize2, Pause, Play, Plus, Redo2, RotateCw, Route, Scissors, Settings2, SkipBack, Trash2, Undo2, Zap, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { ShowSceneSuperDetail, ShowSceneXray } from '@/components/ShowSceneReadOnlyBridge'
import { ShowSceneZoneEditor } from '@/components/ShowSceneZoneEditor'
import { ShowEffectPalette, ShowEffectStack } from '@/components/ShowEffectsAuthoring'
import { ShowTransitionPalette, ShowTransitionParameters } from '@/components/ShowTransitionAuthoring'
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
  showCellAtSlot,
  transitionCost,
} from '@/engine/showModel'
import { compileShowForArtifact, sourceForShowCell, type CompiledShowState } from '@/engine/showPreviewArtifact'
import { projectFlatShowComposition, type FlatShowCompositionProjection } from '@/engine/showCompositionProjection'
import {
  addShowMainClip,
  addShowOverlayClip,
  addShowOverlayLayer,
  deleteShowMainPlacement,
  deleteShowOverlayLayer,
  deleteShowOverlayPlacement,
  moveShowOverlayPlacement,
  projectFlatShowToCompositionV1,
  renameShowOverlayLayer,
  reorderShowOverlayLayer,
  replaceShowPatternInstance,
  restartShowMainPlacement,
  splitShowMainPlacement,
  trimShowMainPlacement,
  trimShowOverlayPlacement,
} from '@/engine/showCompositionModel'
import { projectSceneReadOnlyBridge } from '@/engine/showSceneReadOnlyProjection'
import {
  addShowPropertyKeyframe,
  addShowPropertyTrack,
  deleteShowPropertyKeyframe,
  deleteShowPropertyTrack,
  updateShowPropertyKeyframe,
} from '@/engine/showPropertyAnimation'
import { resolveShowSceneEditorScope, type ShowSceneEditorScope } from '@/engine/showSceneEditorScope'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { updateShowPhysicalZoneSelection } from '@/engine/showSpatialSelection'
import { createPortableShowOutputContract } from '@/engine/showOutputContract'
import { discoverAutomatablePatternControls, type AutomatablePatternControl } from '@/engine/showPatternControls'
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
import { buildShowEpeExport, type ShowEpeExport } from '@/engine/showEpeExport'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'
import { showKeyboardSeekStepMs } from '@/engine/showKeyboardSeek'
import { SHOW_EASING_OPTIONS, showEasingFromOptionId, showEasingOptionId } from '@/engine/showEasing'
import {
  showBoundaryTransitionParameterChanges,
  showBoundaryTransitionPresentationKey,
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
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import type {
  MapRecord,
  ShowBoundaryTransition,
  ShowCell,
  ShowClipEffect,
  ShowRecord,
  ShowPropertyAnimationTarget,
  ShowRoutingLayout,
  ShowScene,
  ShowAutomatableProperty,
} from '@/engine/personalContentRecords'

const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const clipBase =
  'relative z-10 flex min-h-[44px] flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border-0 border-l-[3px] px-2 py-1 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live'

function ShowEasingOptions() {
  return SHOW_EASING_OPTIONS.map((option) => (
    <option key={option.id} value={option.id}>{option.label}</option>
  ))
}

type ShowSelection =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'empty-slot'; zoneId: string; sceneId: string }
  | { kind: 'transition'; transitionId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'routing-switch'; afterSceneId: string }
  | { kind: 'show' }

function showSelectionKey(selection: ShowSelection): string {
  if (selection.kind === 'scene') return `scene:${selection.sceneId}`
  if (selection.kind === 'clip') return `clip:${selection.clipId}`
  if (selection.kind === 'empty-slot') return `empty:${selection.zoneId}:${selection.sceneId}`
  if (selection.kind === 'transition') return `transition:${selection.transitionId}`
  if (selection.kind === 'zone') return `zone:${selection.zoneId}`
  if (selection.kind === 'routing-switch') return `routing:${selection.afterSceneId}`
  return 'show'
}

function sameShowSelection(left: ShowSelection, right: ShowSelection): boolean {
  return showSelectionKey(left) === showSelectionKey(right)
}

function findShowSelectionAnchor(selection: ShowSelection): HTMLElement | null {
  const key = showSelectionKey(selection)
  return [...document.querySelectorAll<HTMLElement>('[data-show-selection-key]')]
    .find((element) => element.dataset.showSelectionKey === key) ?? null
}

type ShowPatternOption = {
  label: string
  ref: ShowCell['pattern']
  group: PatternComboboxOption['group']
}

export function ShowEditor({
  showId,
  showOverride,
  readOnly = false,
  builtInContext,
  headerActionsTarget = null,
}: {
  showId: string
  showOverride?: ShowRecord
  readOnly?: boolean
  builtInContext?: { track: 'portable' | 'installation'; lesson: string; description: string }
  headerActionsTarget?: HTMLElement | null
}) {
  const savedShow = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const updateShow = useShowStore((state) => state.updateShow)
  const addScene = useShowStore((state) => state.addScene)
  const duplicateScene = useShowStore((state) => state.duplicateScene)
  const moveClip = useShowStore((state) => state.moveClip)
  const removeScene = useShowStore((state) => state.removeScene)
  const updateScene = useShowStore((state) => state.updateScene)
  const updateBoundaryTransition = useShowStore((state) => state.updateBoundaryTransition)
  const removeBoundaryTransition = useShowStore((state) => state.removeBoundaryTransition)
  const removeClip = useShowStore((state) => state.removeClip)
  const placeClip = useShowStore((state) => state.placeClip)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
  const updateCellEffects = useShowStore((state) => state.updateCellEffects)
  const updateCellPattern = useShowStore((state) => state.updateCellPattern)
  const updateCellControlTarget = useShowStore((state) => state.updateCellControlTarget)
  const updateCellRestartOnEntry = useShowStore((state) => state.updateCellRestartOnEntry)
  const extendCell = useShowStore((state) => state.extendCell)
  const spanCellZones = useShowStore((state) => state.spanCellZones)
  const updateCellZoneMode = useShowStore((state) => state.updateCellZoneMode)
  const addZone = useShowStore((state) => state.addZone)
  const updateZone = useShowStore((state) => state.updateZone)
  const removeZone = useShowStore((state) => state.removeZone)
  const addRoutingLayout = useShowStore((state) => state.addRoutingLayout)
  const updateRoutingLayout = useShowStore((state) => state.updateRoutingLayout)
  const removeRoutingLayout = useShowStore((state) => state.removeRoutingLayout)
  const updateRoutingSwitch = useShowStore((state) => state.updateRoutingSwitch)
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
  const [generatedOpen, setGeneratedOpen] = useState(false)
  const [showSendMode, setShowSendMode] = useState<SendMode>('run')
  const [pendingSendMode, setPendingSendMode] = useState<SendMode | null>(null)
  const [preparingSave, setPreparingSave] = useState(false)
  const [scenePendingDelete, setScenePendingDelete] = useState<ShowScene | null>(null)
  const [spatialZoneSelection, setSpatialZoneSelection] = useState<{ zoneId: string; layoutId: string } | null>(null)
  const [detailPanelOpen, setDetailPanelOpen] = useState(false)
  const [detailAnchor, setDetailAnchor] = useState<HTMLElement | null>(null)
  const [effectPaletteClipId, setEffectPaletteClipId] = useState<string | null>(null)
  const [transitionPaletteId, setTransitionPaletteId] = useState<string | null>(null)
  const [sceneEditorScope, setSceneEditorScope] = useState<ShowSceneEditorScope | null>(null)
  const detailShowIdRef = useRef(showId)
  const timelineWorkspaceRef = useRef<HTMLElement>(null)
  const lastTimelineFocusRef = useRef<HTMLElement | null>(null)
  const closeDetailPanel = useCallback((restoreFocus = false) => {
    const previousAnchor = detailAnchor
    setEffectPaletteClipId(null)
    setTransitionPaletteId(null)
    setDetailPanelOpen(false)
    setDetailAnchor(null)
    if (restoreFocus) {
      window.setTimeout(() => {
        if (previousAnchor?.isConnected) previousAnchor.focus()
        else timelineWorkspaceRef.current?.focus()
      }, 0)
    }
  }, [detailAnchor])
  const selectTimeline = useCallback((next: ShowSelection, anchor?: HTMLElement | null) => {
    if (detailPanelOpen && sameShowSelection(selection, next)) {
      closeDetailPanel()
      return
    }
    if (next.kind === 'show') lastTimelineFocusRef.current = timelineWorkspaceRef.current
    setSelection(next)
    setDetailPanelOpen(true)
    setDetailAnchor(anchor ?? null)
    if (!anchor) {
      window.setTimeout(() => setDetailAnchor(findShowSelectionAnchor(next)), 0)
    }
  }, [closeDetailPanel, detailPanelOpen, selection])
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
    setEffectPaletteClipId(null)
    setTransitionPaletteId(null)
    setSceneEditorScope(null)
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
  const resolvedSceneEditorScope = activeShow && sceneEditorScope
    ? resolveShowSceneEditorScope(activeShow, sceneEditorScope)
    : null
  const selectedClip = selection.kind === 'clip'
    ? activeShow?.cells.find((clip) => clip.id === selection.clipId) ?? null
    : null
  const targetProfile = activeShow?.outputContract?.kind === 'portable-2d'
    ? undefined
    : activeShow?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === activeShow.targetControllerProfileId)
    : controllerProfiles[0]

  const requestDeleteSelection = useCallback((targetSelection: ShowSelection): boolean => {
    if (!activeShow || readOnly) return false
    if (targetSelection.kind === 'scene') {
      const scene = activeShow.scenes.find((candidate) => candidate.id === targetSelection.sceneId)
      if (!scene || activeShow.scenes.length <= 1) return false
      setScenePendingDelete(scene)
      return true
    }
    if (targetSelection.kind === 'transition') {
      const transition = activeShow.transitions?.find((candidate) => candidate.id === targetSelection.transitionId)
      if (!transition || transition.kind === 'cut') return false
      closeDetailPanel()
      void removeBoundaryTransition(activeShow.id, transition.id)
      return true
    }
    if (targetSelection.kind === 'clip') {
      if (!activeShow.cells.some((cell) => cell.id === targetSelection.clipId)) return false
      closeDetailPanel()
      void removeClip(activeShow.id, targetSelection.clipId)
      return true
    }
    if (targetSelection.kind === 'zone') {
      if (activeShow.zones.length <= 1 || !activeShow.zones.some((zone) => zone.id === targetSelection.zoneId)) return false
      closeDetailPanel()
      void removeZone(activeShow.id, targetSelection.zoneId)
      return true
    }
    return false
  }, [activeShow, closeDetailPanel, readOnly, removeBoundaryTransition, removeClip, removeZone])

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
      if (event.key !== 'Escape' || effectPaletteClipId !== null || transitionPaletteId !== null) return
      if (!detailPanelOpen && !sceneEditorScope) return
      event.preventDefault()
      if (detailPanelOpen) {
        closeDetailPanel(true)
        return
      }
      setSceneEditorScope(null)
      window.setTimeout(() => timelineWorkspaceRef.current?.focus(), 0)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [closeDetailPanel, detailPanelOpen, effectPaletteClipId, sceneEditorScope, transitionPaletteId])
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
      ? compileShowForArtifact(activeShow, userPatterns, targetProfile?.zones, {}, { stageDimension })
      : { artifact: null, error: null },
    [activeShow, stageDimension, userPatterns, targetProfile?.zones],
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
  const compositionProjection = useMemo<FlatShowCompositionProjection | null>(() => {
    if (!activeShow) return null
    try {
      return projectFlatShowComposition(activeShow, {
        byCellId: Object.fromEntries(activeShow.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)])),
        stageDimension,
      })
    } catch {
      return null
    }
  }, [activeShow, stageDimension, userPatterns])
  const showExport = useMemo(
    () => activeShow && compiled.artifact && compilePressure?.status !== 'blocked'
      ? buildShowEpeExport(activeShow, compiled.artifact.code, {
          stampedAt: new Date(activeShow.updatedAt),
          userMaps,
        })
      : null,
    [activeShow, compilePressure?.status, compiled.artifact, userMaps],
  )
  const activeControllerMapDim = activeController?.mapDim ?? null
  const activeControllerFirmware = activeController?.firmwareVersion
  const activeControllerProfile = controllerProfiles.find((profile) => (
    activeController?.deviceId
      ? profile.deviceId === activeController.deviceId
      : Boolean(activeIp && profile.lastSeenIp === activeIp)
  )) ?? targetProfile
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
  }, [activeControllerFirmware, activeControllerMapDim, compilePressure, controllerCompatibilityContext, showExport])

  useEffect(() => {
    if (!controllerPushResult) return
    const timeout = window.setTimeout(clearPushResult, 3500)
    return () => window.clearTimeout(timeout)
  }, [clearPushResult, controllerPushResult])
  const buildDownloadExport = async (): Promise<ShowEpeExport | null> => {
    if (!activeShow || !compiled.artifact || compilePressure?.status === 'blocked') return null
    const preview = await buildPreviewJpeg(compiled.artifact)
    if (!preview) throw new Error('Could not render the EPE preview image')
    return buildShowEpeExport(activeShow, compiled.artifact.code, {
      id: makeProgramId(),
      preview: bytesToBase64(preview),
      stampedAt: new Date(activeShow.updatedAt),
      userMaps,
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

  if (generatedOpen && compiled.artifact) {
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

  const headerActions = (
    <>
      <Button
        size="xs"
        variant="ghost"
        aria-label="Show properties"
        title="Show properties"
        aria-pressed={detailPanelOpen && selection.kind === 'show'}
        data-show-selection-key="show"
        className={detailPanelOpen && selection.kind === 'show'
          ? 'bg-zinc-800/70 text-xs text-zinc-300 hover:bg-zinc-700/70 hover:text-zinc-200'
          : 'bg-zinc-900/60 text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300'}
        onClick={(event) => openShowProperties(event.currentTarget)}
      >
        <Settings2 size={13} aria-hidden />
        Properties
      </Button>
      <Button
        size="xs"
        variant="ghost"
        aria-label="View code"
        title="View final generated code"
        className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
        disabled={!compiled.artifact}
        onClick={() => setGeneratedOpen(true)}
      >
        <Code2 size={13} aria-hidden />
        View code
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950/75 font-mono text-xs text-zinc-400">
      {headerActionsTarget
        ? createPortal(headerActions, headerActionsTarget)
        : <div className="mb-2 flex shrink-0 items-center justify-end gap-1.5 px-3 pt-3">{headerActions}</div>}
      {readOnly && (
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
            className="outline-none"
            onFocusCapture={rememberTimelineFocus}
          >
            <div hidden={Boolean(resolvedSceneEditorScope)} aria-hidden={resolvedSceneEditorScope ? true : undefined}>
              <SceneStrip
                key={activeShow.id}
                show={activeShow}
                readOnly={readOnly}
                transportActive={!resolvedSceneEditorScope}
                compositionProjection={compositionProjection}
                patternControlsByCellId={patternControlsByCellId}
                selection={selection}
                onSelect={selectTimeline}
                onDismiss={closeDetailPanel}
                onOpenScene={(sceneId) => {
                  const scope = resolveShowSceneEditorScope(activeShow, {
                    sceneId,
                    zoneId: activeShow.zones[0]?.id ?? '',
                  })
                  if (!scope) return
                  closeDetailPanel()
                  setSceneEditorScope(scope)
                }}
                onAddScene={() => {
                  void addScene(activeShow.id).then(() => {
                    window.setTimeout(() => {
                      const inputs = document.querySelectorAll<HTMLInputElement>('[data-show-scene-name]')
                      inputs[inputs.length - 1]?.focus()
                    }, 0)
                  })
                }}
                onAddZone={() => {
                  timelineWorkspaceRef.current?.focus()
                  void addZone(activeShow.id)
                }}
                onRequestRemoveScene={setScenePendingDelete}
                onUpdateScene={(sceneId, changes) => void updateScene(activeShow.id, sceneId, changes)}
                onMoveClip={(cellId, zoneId, sceneId) => {
                  void moveClip(activeShow.id, cellId, zoneId, sceneId).then((moved) => {
                    if (moved) selectTimeline({ kind: 'clip', clipId: cellId })
                  })
                }}
              />
            </div>
            {resolvedSceneEditorScope && compositionProjection && (
              <ShowSceneZoneEditor
                show={activeShow}
                compositionProjection={compositionProjection}
                scope={resolvedSceneEditorScope}
                readOnly={readOnly}
                selectedClipId={selection.kind === 'clip' ? selection.clipId : null}
                transport={<ShowTransportControls show={activeShow} />}
                onBack={() => {
                  closeDetailPanel()
                  setSceneEditorScope(null)
                }}
                onZoneChange={(zoneId) => setSceneEditorScope({ ...resolvedSceneEditorScope, zoneId })}
                onSelectClip={(clipId, anchor) => selectTimeline({ kind: 'clip', clipId }, anchor)}
                onSeek={(globalTimeMs) => requestShowSeek(activeShow.id, globalTimeMs)}
                patternOptions={patternOptions}
                onEnableComposition={() => {
                  const composition = projectFlatShowToCompositionV1(activeShow, {
                    byCellId: Object.fromEntries(activeShow.cells.map((cell) => [cell.id, sourceForShowCell(cell, userPatterns)])),
                    stageDimension,
                  })
                  void updateShow(activeShow.id, { ...activeShow, composition, updatedAt: Date.now() })
                }}
                onAddMain={({ pattern, patternName, startMs, durationMs }) => {
                  const composition = activeShow.composition
                  if (!composition) return
                  const instanceId = newPersonalContentId()
                  const instance = {
                      id: instanceId,
                      pattern,
                      patternName,
                      time: { timeScale: 1, timeOffsetMs: 0 },
                  }
                  const next = addShowMainClip(activeShow, composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    instance,
                    placement: {
                      id: newPersonalContentId(),
                      instanceId,
                      startMs,
                      durationMs,
                      view: { mirror: false, phase: 0, brightness: 1 },
                    },
                  })
                  if (next === composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onUpdateMain={(placementId, changes) => {
                  if (!activeShow.composition) return
                  const next = trimShowMainPlacement(activeShow, activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    placementId,
                    ...changes,
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onSplitMain={(placementId, atMs) => {
                  if (!activeShow.composition) return
                  const next = splitShowMainPlacement(activeShow, activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    placementId,
                    atMs,
                    newPlacementId: newPersonalContentId(),
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onRestartMain={(placementId) => {
                  if (!activeShow.composition) return
                  const next = restartShowMainPlacement(activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    placementId,
                    newInstanceId: newPersonalContentId(),
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onReplaceMainPattern={(placementId, pattern, patternName) => {
                  if (!activeShow.composition) return
                  const placement = activeShow.composition.scenes
                    .find((scene) => scene.sceneId === resolvedSceneEditorScope.sceneId)?.zones
                    .find((zone) => zone.zoneId === resolvedSceneEditorScope.zoneId)?.main
                    .find((candidate) => candidate.id === placementId)
                  if (!placement) return
                  const next = replaceShowPatternInstance(activeShow.composition, placement.instanceId, { pattern, patternName })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onDeleteMain={(placementId) => {
                  if (!activeShow.composition) return
                  const next = deleteShowMainPlacement(activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    placementId,
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onAddOverlayLayer={() => {
                  if (!activeShow.composition) return
                  const zone = activeShow.composition.scenes
                    .find((scene) => scene.sceneId === resolvedSceneEditorScope.sceneId)?.zones
                    .find((candidate) => candidate.zoneId === resolvedSceneEditorScope.zoneId)
                  const next = addShowOverlayLayer(activeShow, activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layer: {
                      id: newPersonalContentId(),
                      name: `Overlay ${(zone?.overlays.length ?? 0) + 1}`,
                      placements: [],
                    },
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onRenameOverlayLayer={(layerId, name) => {
                  if (!activeShow.composition) return
                  const next = renameShowOverlayLayer(activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layerId,
                    name,
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onReorderOverlayLayer={(layerId, targetIndex) => {
                  if (!activeShow.composition) return
                  const next = reorderShowOverlayLayer(activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layerId,
                    targetIndex,
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onDeleteOverlayLayer={(layerId) => {
                  if (!activeShow.composition) return
                  const next = deleteShowOverlayLayer(activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layerId,
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onAddOverlay={(layerId, { pattern, patternName, startMs, durationMs }) => {
                  if (!activeShow.composition) return
                  const instanceId = newPersonalContentId()
                  const next = addShowOverlayClip(activeShow, activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layerId,
                    instance: {
                      id: instanceId,
                      pattern,
                      patternName,
                      time: { timeScale: 1, timeOffsetMs: 0 },
                    },
                    placement: {
                      id: newPersonalContentId(),
                      instanceId,
                      startMs,
                      durationMs,
                      opacity: 1,
                      view: { mirror: false, phase: 0, brightness: 1 },
                    },
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onUpdateOverlay={(layerId, placementId, changes) => {
                  if (!activeShow.composition) return
                  let next = trimShowOverlayPlacement(activeShow, activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layerId,
                    placementId,
                    startMs: changes.startMs,
                    durationMs: changes.durationMs,
                    opacity: changes.opacity,
                  })
                  if (changes.targetLayerId && changes.targetLayerId !== layerId) {
                    next = moveShowOverlayPlacement(activeShow, next, {
                      sceneId: resolvedSceneEditorScope.sceneId,
                      zoneId: resolvedSceneEditorScope.zoneId,
                      layerId,
                      placementId,
                      startMs: changes.startMs,
                      targetLayerId: changes.targetLayerId,
                    })
                  }
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onDeleteOverlay={(layerId, placementId) => {
                  if (!activeShow.composition) return
                  const next = deleteShowOverlayPlacement(activeShow.composition, {
                    sceneId: resolvedSceneEditorScope.sceneId,
                    zoneId: resolvedSceneEditorScope.zoneId,
                    layerId,
                    placementId,
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onAddPropertyTrack={({ target, initialValue, atMs }: { target: ShowPropertyAnimationTarget; initialValue: number; atMs: number }) => {
                  if (!activeShow.composition) return
                  const scene = activeShow.scenes.find((candidate) => candidate.id === resolvedSceneEditorScope.sceneId)
                  if (!scene) return
                  const secondTimeMs = atMs > 0 ? Math.min(scene.durationMs, atMs) : scene.durationMs
                  if (secondTimeMs <= 0) return
                  const next = addShowPropertyTrack(activeShow, activeShow.composition, resolvedSceneEditorScope.sceneId, {
                    id: newPersonalContentId(),
                    target,
                    keyframes: [
                      { id: newPersonalContentId(), timeMs: 0, value: initialValue, easing: { curve: 'linear' } },
                      { id: newPersonalContentId(), timeMs: secondTimeMs, value: initialValue, easing: { curve: 'linear' } },
                    ],
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onDeletePropertyTrack={(trackId) => {
                  if (!activeShow.composition) return
                  const next = deleteShowPropertyTrack(activeShow.composition, resolvedSceneEditorScope.sceneId, trackId)
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onAddPropertyKeyframe={(trackId, keyframe) => {
                  if (!activeShow.composition) return
                  const next = addShowPropertyKeyframe(activeShow, activeShow.composition, resolvedSceneEditorScope.sceneId, trackId, {
                    ...keyframe,
                    id: newPersonalContentId(),
                  })
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onUpdatePropertyKeyframe={(trackId, keyframeId, changes) => {
                  if (!activeShow.composition) return
                  const next = updateShowPropertyKeyframe(
                    activeShow,
                    activeShow.composition,
                    resolvedSceneEditorScope.sceneId,
                    trackId,
                    keyframeId,
                    changes,
                  )
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
                onDeletePropertyKeyframe={(trackId, keyframeId) => {
                  if (!activeShow.composition) return
                  const next = deleteShowPropertyKeyframe(activeShow.composition, resolvedSceneEditorScope.sceneId, trackId, keyframeId)
                  if (next === activeShow.composition) return
                  void updateShow(activeShow.id, { ...activeShow, composition: next, updatedAt: Date.now() })
                }}
              />
            )}
          </section>

          {detailPanelOpen && detailAnchor && (
            <ShowEntityDetailPanel
              anchor={detailAnchor}
              ownerKey={showSelectionKey(selection)}
              onClose={() => closeDetailPanel(true)}
            >
              <div onChangeCapture={returnFocusAfterDiscreteCommit}>
                {readOnly && (
                  <div
                    role="note"
                    className="flex min-h-8 items-center gap-2 border-b border-amber-300/15 bg-amber-300/[0.04] px-2.5 pr-10 text-[9px] leading-4"
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
                  selection={selection}
                  selectedClip={selectedClip}
                  patternOptions={patternOptions}
                  patternControlsByCellId={patternControlsByCellId}
                  compiledCost={compiled.artifact?.summary.cost}
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
                  onUpdatePattern={(cell, patch) => void updateCellPattern(activeShow.id, cell.id, patch)}
                  onPatternCommit={returnFocusToTimelineSelection}
                  onPlaceClip={(zoneId, sceneId, patch) => {
                    void placeClip(activeShow.id, zoneId, sceneId, patch).then((clip) => {
                      if (clip) selectTimeline({ kind: 'clip', clipId: clip.id })
                    })
                  }}
                  onRemoveClip={(clip) => {
                    closeDetailPanel()
                    void removeClip(activeShow.id, clip.id)
                  }}
                  onUpdateScene={(scene, changes) => void updateScene(activeShow.id, scene.id, changes)}
                  onDuplicateScene={(scene) => void duplicateScene(activeShow.id, scene.id)}
                  onRequestRemoveScene={setScenePendingDelete}
                  onUpdateAdaptations={(cell, changes) => void updateCellAdaptations(activeShow.id, cell.id, changes)}
                  onUpdateEffects={(cell, effects) => void updateCellEffects(activeShow.id, cell.id, effects)}
                  onOpenEffects={(cell) => setEffectPaletteClipId(cell.id)}
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
                  onUpdateRoutingSwitch={(afterSceneId, layoutId) => void updateRoutingSwitch(activeShow.id, afterSceneId, layoutId)}
                  />
                </fieldset>
              </div>
            </ShowEntityDetailPanel>
          )}
          {effectPaletteClipId && activeShow.cells.find((cell) => cell.id === effectPaletteClipId) && (
            <ShowEffectPalette
              clip={activeShow.cells.find((cell) => cell.id === effectPaletteClipId)!}
              stageDimensions={(stageDimension ?? 2) as 1 | 2 | 3}
              onApply={(effect) => {
                const clip = activeShow.cells.find((cell) => cell.id === effectPaletteClipId)
                if (!clip) return
                void updateCellEffects(activeShow.id, clip.id, [...(clip.effects ?? []), effect]).then(() => {
                  window.setTimeout(() => document.querySelector<HTMLElement>(`[data-show-effect-id="${effect.id}"]`)?.focus(), 0)
                })
              }}
              onClose={() => setEffectPaletteClipId(null)}
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
          <AlertDialogRoot open={scenePendingDelete !== null} onOpenChange={(open) => { if (!open) setScenePendingDelete(null) }}>
            <AlertDialogContent>
              <AlertDialogTitle>Remove scene?</AlertDialogTitle>
              <AlertDialogDescription>
                {scenePendingDelete
                  ? `"${scenePendingDelete.name}" will be removed from this show. Clips anchored in it will be removed or shortened.`
                  : 'This scene will be removed from the show.'}
              </AlertDialogDescription>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    if (scenePendingDelete) {
                      closeDetailPanel()
                      void removeScene(activeShow.id, scenePendingDelete.id)
                    }
                    setScenePendingDelete(null)
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialogRoot>
        </div>
      </div>
      <CompileBar
        compiled={compiled}
        targetPixels={activeShow.outputContract?.kind === 'portable-2d'
          ? activeShow.outputContract.referencePixelCount
          : targetProfile?.lastKnownPixelCount ?? zonePixelTotal(activeShow)}
        pushResult={preparedControllerArtifact.error ?? (
          controllerPushResult
            ? controllerPushResult.ok ? 'Sent to Controller' : controllerPushResult.message
            : null
        )}
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
      if (event.defaultPrevented) return
      if (showControlOwnsKeyboardEvent(event.target)) return
      if (event.code === 'Space') {
        event.preventDefault()
        usePreviewStore.getState().toggle()
        return
      }
      const transport = useShowTransportStore.getState()
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        const deltaMs = event.key === 'ArrowLeft' ? -1_000 : 1_000
        requestShowSeek(show.id, transport.positionMs + deltaMs)
      } else if (event.key === 'Home') {
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
        {isRunning ? <Play size={13} aria-hidden /> : <Pause size={13} aria-hidden />}
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Go to Show start"
        title="Go to Show start (Home)"
        className="bg-zinc-900/70 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => requestShowSeek(show.id, 0)}
      >
        <SkipBack size={13} aria-hidden />
      </Button>
      <output
        className="timeline-time-display flex min-w-[112px] items-baseline gap-1 whitespace-nowrap text-[10px] tabular-nums"
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
  readOnly,
  selection,
  onSelect,
  snapEnabled,
  onToggleSnap,
  onFit,
}: {
  show: ShowRecord
  readOnly: boolean
  selection: ShowSelection
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  snapEnabled: boolean
  onToggleSnap: () => void
  onFit: () => void
}) {
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const splitAtTime = useShowStore((state) => state.splitAtTime)
  const duplicateScene = useShowStore((state) => state.duplicateScene)
  const cloneClip = useShowStore((state) => state.cloneClip)
  const undoShow = useShowStore((state) => state.undoShow)
  const redoShow = useShowStore((state) => state.redoShow)
  const history = useShowStore((state) => state.showHistories[show.id])
  const splitCapability = showSplitCapability(show, positionMs)
  const splitReasonId = `show-split-reason-${show.id}`
  const [splitReasonOpen, setSplitReasonOpen] = useState(false)
  const cloneCapability = showCloneCapability(show, selection)

  const cloneSelection = async () => {
    if (!cloneCapability.enabled) return
    if (selection.kind === 'scene') {
      const previousIds = new Set(show.scenes.map((scene) => scene.id))
      await duplicateScene(show.id, selection.sceneId)
      const next = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      const copy = next?.scenes.find((scene) => !previousIds.has(scene.id))
      if (copy) onSelect({ kind: 'scene', sceneId: copy.id })
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
      <Button
        size="xs"
        variant="ghost"
        aria-label="Fit timeline to Show"
        title="Fit the complete Show"
        onClick={onFit}
      >
        <Maximize2 size={12} aria-hidden /> <span className="timeline-command-label">Fit</span>
      </Button>
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
            void splitAtTime(show.id, positionMs)
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
    </div>
  )
}

function showCloneCapability(show: ShowRecord, selection: ShowSelection): { enabled: boolean; reason: string } {
  if (selection.kind === 'scene') {
    const scene = show.scenes.find((candidate) => candidate.id === selection.sceneId)
    return scene
      ? { enabled: true, reason: `Clone ${scene.name} after itself` }
      : { enabled: false, reason: 'The selected Scene no longer exists' }
  }
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
      className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
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
      {exporting ? 'Preparing' : error ? 'Export failed' : '.epe'}
    </Button>
  )
}

function SceneStrip({
  show,
  readOnly,
  transportActive,
  compositionProjection,
  patternControlsByCellId,
  selection,
  onSelect,
  onDismiss,
  onOpenScene,
  onAddScene,
  onAddZone,
  onRequestRemoveScene,
  onUpdateScene,
  onMoveClip,
}: {
  show: ShowRecord
  readOnly: boolean
  transportActive: boolean
  compositionProjection: FlatShowCompositionProjection | null
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  selection: ShowSelection
  onSelect: (selection: ShowSelection, anchor?: HTMLElement | null) => void
  onDismiss: () => void
  onOpenScene: (sceneId: string) => void
  onAddScene: () => void
  onAddZone: () => void
  onRequestRemoveScene: (scene: ShowScene) => void
  onUpdateScene: (sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => void
  onMoveClip: (cellId: string, zoneId: string, sceneId: string) => void
}) {
  const strip = projectShowStrip(show)
  const timeline = projectShowTimeline(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const fittedViewport = fitShowTimelineViewport(timeline.durationMs)
  const [storedViewport, setViewport] = useState<ShowTimelineViewport>(fittedViewport)
  const snapEnabled = useShowEditorSessionStore((state) => state.snapEnabled)
  const setSnapEnabled = useShowEditorSessionStore((state) => state.setSnapEnabled)
  const [draggingCellId, setDraggingCellId] = useState<string | null>(null)
  const [dropTargetKey, setDropTargetKey] = useState<string | null>(null)
  const [xraySceneId, setXraySceneId] = useState<string | null>(compositionProjection ? show.scenes[0]?.id ?? null : null)
  const [superDetailSceneId, setSuperDetailSceneId] = useState<string | null>(null)
  let viewport = storedViewport
  if (viewport.totalMs !== fittedViewport.totalMs) {
    const zoom = viewport.totalMs / viewport.durationMs
    const transport = useShowTransportStore.getState()
    const anchorMs = transport.showId === show.id ? transport.positionMs : 0
    viewport = zoomShowTimelineViewport(fittedViewport, zoom, Math.min(anchorMs, fittedViewport.totalMs))
    setViewport(viewport)
  }
  const scrollRef = useRef<HTMLDivElement>(null)
  const positionMsRef = useRef(positionMs)
  useEffect(() => {
    positionMsRef.current = positionMs
  }, [positionMs])
  const structuralTimesMs = [...new Set([
    0,
    timeline.durationMs,
    ...timeline.scenes.flatMap((scene) => [scene.startMs, scene.endMs]),
    ...timeline.transitions.flatMap((transition) => [transition.startMs, transition.endMs]),
    ...timeline.boundaryTransitions.flatMap((transition) => [transition.startMs, transition.endMs]),
    ...timeline.rows.flatMap((row) => row.cells.flatMap((cell) => [cell.startMs, cell.endMs])),
  ])]
  const automatedControlNames = [...new Set([
    ...show.cells.flatMap((cell) => Object.keys(cell.controlTargets ?? {})),
    ...(show.transitions ?? []).flatMap((transition) => Object.keys(transition.propertyTransitions?.controls ?? {})),
  ])]
  const controlLanes = automatedControlNames.map((exportName) => ({
    exportName,
    label: Object.values(patternControlsByCellId).flat().find((control) => control.exportName === exportName)?.label
      ?? exportName.replace(/^slider/, '').replace(/([A-Z])/g, ' $1').trim(),
  }))
  const movingSplitLayout = show.routingLayouts.find((layout) => layout.logical?.kind === 'split')
  const hasSampleRemap = show.scenes.some((scene) => scene.sampleTargets?.repeatScale !== undefined)
    || Boolean(show.transitions?.some((transition) => transition.propertyTransitions?.sample?.repeatScale))
  const routingLaneRows = (movingSplitLayout ? 1 : 0) + (hasSampleRemap ? 1 : 0)
  const rowStride = 3 + controlLanes.length
  const xrayDetail = useMemo(() => {
    if (!compositionProjection || !xraySceneId) return null
    try {
      return projectSceneReadOnlyBridge(compositionProjection, xraySceneId)
    } catch {
      return null
    }
  }, [compositionProjection, xraySceneId])
  const superDetail = useMemo(() => {
    if (!compositionProjection || !superDetailSceneId) return null
    try {
      return projectSceneReadOnlyBridge(compositionProjection, superDetailSceneId)
    } catch {
      return null
    }
  }, [compositionProjection, superDetailSceneId])
  const xrayOpen = xrayDetail !== null
  const rulerRow = xrayOpen ? 3 : 2
  const transitionRow = rulerRow + 1
  const contentStartRow = transitionRow + 1
  const toggleXray = (sceneId: string) => {
    if (xraySceneId === sceneId) {
      setXraySceneId(null)
      if (superDetailSceneId === sceneId) setSuperDetailSceneId(null)
      return
    }
    setXraySceneId(sceneId)
    if (superDetailSceneId !== null) setSuperDetailSceneId(sceneId)
  }
  const columns = [
    '148px',
    ...show.scenes.flatMap((scene, index) => (
      index < show.scenes.length - 1
        ? [
            `minmax(0, ${Math.max(1, scene.durationMs)}fr)`,
            `minmax(0, ${Math.max(0.001, scene.transitionOut?.durationMs ?? 0)}fr)`,
          ]
        : [`minmax(0, ${Math.max(1, scene.durationMs)}fr)`]
    )),
    '64px',
  ]
  const rows = [
    'auto',
    ...(xrayOpen ? ['36px'] : []),
    '28px',
    '34px',
    ...(movingSplitLayout ? ['26px'] : []),
    ...(hasSampleRemap ? ['26px'] : []),
    ...strip.rows.flatMap(() => ['44px', '26px', '26px', ...controlLanes.map(() => '26px')]),
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
  const zoomAroundPlayhead = useCallback((factor: number) => setViewport((current) => {
    const visibleEnd = current.startMs + current.durationMs
    const playheadMs = positionMsRef.current
    const anchor = playheadMs >= current.startMs && playheadMs <= visibleEnd
      ? playheadMs
      : current.startMs + current.durationMs / 2
    return zoomShowTimelineViewport(current, factor, anchor)
  }), [setViewport])
  const zoomLevel = viewport.totalMs / viewport.durationMs
  const setZoomLevel = (target: number) => setViewport((current) => {
    const currentZoom = current.totalMs / current.durationMs
    const visibleEnd = current.startMs + current.durationMs
    const anchor = positionMs >= current.startMs && positionMs <= visibleEnd
      ? positionMs
      : current.startMs + current.durationMs / 2
    return zoomShowTimelineViewport(current, target / currentZoom, anchor)
  })
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
  return (
    <div
      className="border-b border-seam bg-[#060608] p-4 shadow-[inset_0_6px_14px_-8px_rgba(0,0,0,0.9),inset_0_-6px_14px_-10px_rgba(0,0,0,0.9)]"
      onClick={onDismiss}
    >
      <div
        data-testid="show-timeline-toolbar"
        className="show-timeline-toolbar mb-2 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 border-b border-zinc-900 pb-2"
        role="toolbar"
        aria-label="Show timeline controls"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="min-w-0 justify-self-start">
          {transportActive && <ShowTransportControls show={show} />}
        </div>
        <div className="flex min-w-0 items-center justify-center gap-1" role="group" aria-label="Timeline zoom controls">
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Zoom timeline out"
            title="Zoom timeline out"
            className="rounded-none bg-transparent text-zinc-500 hover:bg-transparent hover:text-amber-300"
            onClick={() => zoomAroundPlayhead(0.8)}
          >
            <ZoomOut size={14} aria-hidden />
          </Button>
          <input
            type="range"
            min={1}
            max={12}
            step={0.1}
            value={Number(zoomLevel.toFixed(1))}
            aria-label="Timeline zoom"
            className="timeline-zoom-slider h-4 w-[clamp(64px,12vw,148px)] min-w-0 accent-amber-300"
            onChange={(event) => setZoomLevel(Number(event.target.value))}
          />
          <Button
            size="icon-xs"
            variant="ghost"
            aria-label="Zoom timeline in"
            title="Zoom timeline in"
            className="rounded-none bg-transparent text-zinc-500 hover:bg-transparent hover:text-amber-300"
            onClick={() => zoomAroundPlayhead(1.25)}
          >
            <ZoomIn size={14} aria-hidden />
          </Button>
          <output className="w-9 text-right text-[10px] tabular-nums text-zinc-400" aria-live="off" aria-label="Timeline zoom level">
            {zoomLevel.toFixed(1)}x
          </output>
        </div>
        <div className="min-w-0 justify-self-end">
          <ShowTimelineCommands
            show={show}
            readOnly={readOnly}
            selection={selection}
            onSelect={onSelect}
            snapEnabled={snapEnabled}
            onToggleSnap={() => setSnapEnabled(!snapEnabled)}
            onFit={() => setViewport(fitShowTimelineViewport(timeline.durationMs))}
          />
        </div>
      </div>
      <div
        ref={scrollRef}
        data-testid="show-timeline-scroll-region"
        className="overflow-x-auto"
        onScroll={(event) => {
          const element = event.currentTarget
          const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
          const maxStart = viewport.totalMs - viewport.durationMs
          if (maxScroll > 0 && maxStart > 0) {
            setViewport((current) => panShowTimelineViewport(current, element.scrollLeft / maxScroll * maxStart))
          }
        }}
      >
        <div
          data-testid="show-timeline-grid"
          className="relative grid gap-y-2"
          style={{
            width: timelineWidth,
            minWidth: 692,
            gridTemplateColumns: columns.join(' '),
            gridTemplateRows: rows.join(' '),
          }}
        >
        <div className="sticky left-0 z-30 self-end border-b border-zinc-800 bg-[#060608] px-1 pb-2 text-[9.5px] uppercase tracking-[0.12em] text-structural">
          zones ↓
        </div>
        {show.scenes.map((scene) => (
          <SceneColumnHeader
            key={scene.id}
            scene={scene}
            selected={selection.kind === 'scene' && selection.sceneId === scene.id}
            canRemove={show.scenes.length > 1}
            readOnly={readOnly}
            selectionKey={`scene:${scene.id}`}
            xrayOpen={xraySceneId === scene.id}
            onToggleXray={() => toggleXray(scene.id)}
            onSelect={(anchor) => onSelect({ kind: 'scene', sceneId: scene.id }, anchor)}
            onRemove={() => onRequestRemoveScene(scene)}
            onUpdate={(changes) => onUpdateScene(scene.id, changes)}
          />
        )).flatMap((node, index) => index < show.scenes.length - 1
          ? [node, <div key={`boundary-header-${show.scenes[index].id}`} className="border-b border-zinc-900" />]
          : [node])}
        {xrayDetail && (
          <>
            <div
              className="sticky left-0 z-30 flex items-center border-b border-zinc-900 bg-[#060608] px-1 text-[8.5px] uppercase tracking-[0.1em] text-amber-200/70"
              style={{ gridColumn: 1, gridRow: 2 }}
            >
              X-ray · read only
            </div>
            <div className="border-b border-zinc-900 bg-[#090a0c]" style={{ gridColumn: `2 / ${columns.length}`, gridRow: 2 }} />
            <div className="relative z-10 min-w-0" style={{ gridColumn: 2 + show.scenes.findIndex((scene) => scene.id === xrayDetail.sceneId) * 2, gridRow: 2 }}>
              <ShowSceneXray detail={xrayDetail} onInspect={() => setSuperDetailSceneId(xrayDetail.sceneId)} />
            </div>
          </>
        )}
        <div
          className="sticky left-0 z-30 flex items-center border-b border-zinc-900 bg-[#060608] px-1 text-[9px] uppercase tracking-[0.12em] text-zinc-600"
          style={{ gridColumn: 1, gridRow: rulerRow }}
        >
          Show time
        </div>
        <TimelineRuler
          show={show}
          gridColumn={`2 / ${columns.length}`}
          viewport={viewport}
          gridRow={rulerRow}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        <TimelinePlayhead
          show={show}
          gridColumn={`2 / ${columns.length}`}
          rowSpan={strip.rows.length * rowStride + routingLaneRows + (xrayOpen ? 4 : 3)}
          viewport={viewport}
          snapEnabled={snapEnabled}
          structuralTimesMs={structuralTimesMs}
          getVisibleWidth={() => Math.max(1, (scrollRef.current?.clientWidth ?? 812) - 212)}
        />
        <div role="group" aria-label="Transition lane" className="contents">
          <div
            className="sticky left-0 z-30 flex items-center gap-2 border-b border-zinc-900 bg-[#060608] px-1 text-[9.5px] uppercase tracking-[0.12em] text-structural"
            style={{ gridColumn: 1, gridRow: transitionRow }}
          >
            <Zap size={12} aria-hidden />
            transitions
          </div>
          {show.scenes.slice(0, -1).map((scene, index) => {
            const transitions = strip.boundaryTransitions.filter((transition) => transition.afterSceneId === scene.id)
            const hasRouting = transitions.some((transition) => transition.kind === 'routing')
            return (
              <div
                key={`boundary-${scene.id}`}
                className="flex min-w-0 items-center justify-center gap-1 border-b border-zinc-900 px-0.5"
                style={{ gridColumn: 3 + index * 2, gridRow: transitionRow }}
              >
                {transitions.map((transition) => (
                  <BoundaryTransitionChip
                    key={transition.id}
                    show={show}
                    transition={transition}
                    selected={selection.kind === 'transition' && selection.transitionId === transition.id}
                    selectionKey={`transition:${transition.id}`}
                    onSelect={(anchor) => onSelect({ kind: 'transition', transitionId: transition.id }, anchor)}
                  />
                ))}
                {!hasRouting && (
                  <button
                    type="button"
                    aria-label={`Set routing layout after ${scene.name}`}
                    data-show-timeline-focus
                    data-show-selection-key={`routing:${scene.id}`}
                    title={`Add routing transition after ${scene.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'routing-switch', afterSceneId: scene.id }, event.currentTarget)
                    }}
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-dashed border-zinc-800 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300"
                  >
                    <Plus size={11} aria-hidden />
                  </button>
                )}
              </div>
            )
          })}
        </div>
        {movingSplitLayout?.logical?.kind === 'split' && (() => {
          const [firstZoneId, secondZoneId] = movingSplitLayout.logical.zoneIds
          const firstColor = show.zones.find((zone) => zone.id === firstZoneId)?.color ?? '#38bdf8'
          const secondColor = show.zones.find((zone) => zone.id === secondZoneId)?.color ?? '#f97316'
          return (
            <div role="group" aria-label="Split position lane" className="contents">
              <div
                className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 font-mono text-[9px] text-sky-300/80"
                style={{ gridColumn: 1, gridRow: contentStartRow }}
              >
                ↳ split {movingSplitLayout.logical.axis.toUpperCase()}
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
              ↳ sample repeat
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
        {strip.rows.map((row, rowIndex) => (
          <div key={row.zoneId} className="contents">
            <button
              type="button"
              aria-label={`Select zone ${row.zoneName}`}
              title={`Open ${row.zoneName} properties`}
              data-show-timeline-focus
              data-show-selection-key={`zone:${row.zoneId}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ kind: 'zone', zoneId: row.zoneId }, event.currentTarget)
              }}
              className={[
                'group sticky left-0 z-30 flex cursor-pointer items-center gap-2 rounded-[5px] border border-transparent bg-[#060608] pr-2 text-left font-mono transition-all focus-visible:border-live/60 focus-visible:outline-none',
                selection.kind === 'zone' && selection.zoneId === row.zoneId
                  ? 'border-live/25 bg-live/10 text-zinc-100'
                  : 'text-zinc-300 hover:border-zinc-800 hover:bg-zinc-900/65 hover:text-zinc-100',
              ].join(' ')}
              style={{ gridColumn: 1, gridRow: rowIndex * rowStride + contentStartRow + routingLaneRows }}
            >
              <span
                aria-hidden
                className="w-1 self-stretch rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              <MapIcon size={11} aria-hidden className="shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" />
              <span className="truncate text-[12px] font-medium group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4">{row.zoneName}</span>
              <span className="ml-auto text-[10px] text-structural transition-colors group-hover:text-zinc-400">{row.nominalPixelCount}px</span>
              <Settings2 size={11} aria-hidden className="shrink-0 text-zinc-400 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" />
            </button>
            {row.cells.map((cell) => (
              <button
                key={cell.id}
                type="button"
                aria-label={`Select ${cell.patternName}`}
                data-show-timeline-focus
                data-show-selection-key={`clip:${cell.id}`}
                draggable={!readOnly && Math.max(1, cell.sceneSpan) === 1 && Math.max(1, cell.zoneSpan ?? 1) === 1}
                onDragStart={(event) => {
                  if (readOnly) return
                  setDraggingCellId(cell.id)
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('application/x-pxlblz-show-cell', cell.id)
                }}
                onDragEnd={() => {
                  setDraggingCellId(null)
                  setDropTargetKey(null)
                }}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ kind: 'clip', clipId: cell.id }, event.currentTarget)
                }}
                className={[
                  clipBase,
                  selection.kind === 'clip' && selection.clipId === cell.id
                    ? 'text-zinc-100 shadow-[0_0_0_1.5px_var(--color-live),0_8px_18px_-10px_rgba(0,0,0,0.9)]'
                    : 'text-zinc-300 hover:text-zinc-100',
                ].join(' ')}
                style={{
                  '--zone-color': row.color ?? '#38bdf8',
                  borderLeftColor: row.color ?? '#38bdf8',
                  background: `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, #101013), color-mix(in srgb, ${row.color ?? '#38bdf8'} 6%, #0c0c0e))`,
                  gridColumn: `${cell.columnStart} / span ${cell.columnSpan}`,
                  gridRow: `${rowIndex * rowStride + contentStartRow + routingLaneRows} / span ${Math.max(1, cell.rowSpan * rowStride - (rowStride - 1))}`,
                } as CSSProperties}
                onMouseEnter={(event) => {
                  event.currentTarget.style.background = `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 14%, #131316), color-mix(in srgb, ${row.color ?? '#38bdf8'} 10%, #0e0e10))`
                }}
                onMouseLeave={(event) => {
                  event.currentTarget.style.background = `linear-gradient(color-mix(in srgb, ${row.color ?? '#38bdf8'} 9%, #101013), color-mix(in srgb, ${row.color ?? '#38bdf8'} 6%, #0c0c0e))`
                }}
              >
                {cell.sceneSpan > 1 && (
                  <span className="absolute right-2 top-1.5 text-[9px] uppercase tracking-wider text-structural">hold</span>
                )}
                <span className="flex min-w-0 items-center gap-1.5">
                  <Grid2X2 size={11} aria-hidden className="shrink-0 text-zinc-500" />
                  <span className="truncate text-[13px] font-semibold text-zinc-100">{cell.patternName}</span>
                </span>
                <span className="block truncate text-[10px] text-zinc-500">
                  {adaptationSummary(cell)}
                  {(cell.zoneSpan ?? 1) > 1 ? cell.zoneMode === 'repeat' ? ' - repeat zones' : ' - span zones' : ''}
                </span>
              </button>
            ))}
            {show.scenes.map((scene, sceneIndex) => (
              showCellAtSlot(show, row.zoneId, scene.id) ? null : (
                <button
                  key={`empty-${row.zoneId}-${scene.id}`}
                  type="button"
                  aria-label={`Add clip to ${row.zoneName} in ${scene.name}`}
                  data-show-timeline-focus
                  data-show-selection-key={`empty:${row.zoneId}:${scene.id}`}
                  data-drop-active={dropTargetKey === `${row.zoneId}:${scene.id}` ? 'true' : undefined}
                  onDragEnter={(event) => {
                    if (!isLegalClipMove(show, draggingCellId, row.zoneId, scene.id)) return
                    event.preventDefault()
                    setDropTargetKey(`${row.zoneId}:${scene.id}`)
                  }}
                  onDragOver={(event) => {
                    if (!isLegalClipMove(show, draggingCellId, row.zoneId, scene.id)) return
                    event.preventDefault()
                    event.dataTransfer.dropEffect = 'move'
                    setDropTargetKey(`${row.zoneId}:${scene.id}`)
                  }}
                  onDragLeave={() => setDropTargetKey((current) => current === `${row.zoneId}:${scene.id}` ? null : current)}
                  onDrop={(event) => {
                    if (readOnly) return
                    if (!isLegalClipMove(show, draggingCellId, row.zoneId, scene.id) || !draggingCellId) return
                    event.preventDefault()
                    onMoveClip(draggingCellId, row.zoneId, scene.id)
                    setDraggingCellId(null)
                    setDropTargetKey(null)
                  }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'empty-slot', zoneId: row.zoneId, sceneId: scene.id }, event.currentTarget)
                  }}
                  className={[
                    'relative z-10 flex min-h-[44px] items-center justify-center rounded-[5px] border border-dashed text-[10px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live',
                    selection.kind === 'empty-slot'
                      && selection.zoneId === row.zoneId
                      && selection.sceneId === scene.id
                      ? 'border-live/70 bg-live/10 text-zinc-200'
                      : 'border-zinc-800 bg-zinc-950/20 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300',
                  ].join(' ')}
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + routingLaneRows }}
                >
                  <span className="flex items-center gap-1">
                    <Plus size={11} aria-hidden />
                    {dropTargetKey === `${row.zoneId}:${scene.id}` ? 'Move here' : 'clip'}
                  </span>
                </button>
              )
            ))}
            <div
              role="group"
              aria-label={`Animation speed lane for ${row.zoneName}`}
              className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 text-[9px] text-violet-300/80"
              style={{ gridColumn: 1, gridRow: rowIndex * rowStride + contentStartRow + 1 + routingLaneRows }}
            >
              <span className="font-mono">↳ animation speed</span>
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const cell = cellCoveringScene(show, row.zoneId, sceneIndex)
              return cell ? (
                <div
                  key={`time-${row.zoneId}-${scene.id}`}
                  className="flex items-center border-t border-zinc-900/80 px-2 font-mono text-[9px] text-zinc-500"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + 1 + routingLaneRows }}
                >
                  {formatTimeScale(cell.adaptations.timeScale)}×
                </div>
              ) : null
            })}
            {show.scenes.slice(0, -1).map((scene, sceneIndex) => {
              const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
              const destination = cellCoveringScene(show, row.zoneId, sceneIndex + 1)
              const from = destination && transition?.propertyTransitions?.timeScale?.fromByCellId[destination.id]
              return transition && destination ? (
                <button
                  key={`time-boundary-${row.zoneId}-${scene.id}`}
                  type="button"
                  aria-label={`Edit animation speed transition from ${scene.name} for ${row.zoneName}`}
                  data-show-timeline-focus
                  className={[
                    'flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] transition-colors',
                    from === undefined ? 'text-zinc-700 hover:text-violet-300' : 'bg-violet-400/10 text-violet-200',
                  ].join(' ')}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + 1 + routingLaneRows }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                  }}
                >
                  {from === undefined ? '—' : `${formatTimeScale(from)}→${formatTimeScale(destination.adaptations.timeScale)}`}
                </button>
              ) : null
            })}
            <div
              role="group"
              aria-label={`Brightness lane for ${row.zoneName}`}
              className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 text-[9px] text-amber-300/80"
              style={{ gridColumn: 1, gridRow: rowIndex * rowStride + contentStartRow + 2 + routingLaneRows }}
            >
              <span className="font-mono">↳ bright</span>
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const cell = cellCoveringScene(show, row.zoneId, sceneIndex)
              return cell ? (
                <div
                  key={`brightness-${row.zoneId}-${scene.id}`}
                  className="flex items-center border-t border-zinc-900/80 px-2 font-mono text-[9px] text-zinc-500"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + 2 + routingLaneRows }}
                >
                  {formatBrightness(cell.adaptations.brightness)}
                </div>
              ) : null
            })}
            {show.scenes.slice(0, -1).map((scene, sceneIndex) => {
              const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
              const destination = cellCoveringScene(show, row.zoneId, sceneIndex + 1)
              const from = destination && transition?.propertyTransitions?.brightness?.fromByCellId[destination.id]
              return transition && destination ? (
                <button
                  key={`brightness-boundary-${row.zoneId}-${scene.id}`}
                  type="button"
                  aria-label={`Edit brightness transition from ${scene.name} for ${row.zoneName}`}
                  data-show-timeline-focus
                  className={[
                    'flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] transition-colors',
                    from === undefined ? 'text-zinc-700 hover:text-amber-300' : 'bg-amber-400/10 text-amber-200',
                  ].join(' ')}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + 2 + routingLaneRows }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                  }}
                >
                  {from === undefined ? '—' : `${formatBrightness(from)}→${formatBrightness(destination.adaptations.brightness)}`}
                </button>
              ) : null
            })}
            {controlLanes.map((control, controlIndex) => (
              <div key={`control-lane-${row.zoneId}-${control.exportName}`} className="contents">
                <div
                  role="group"
                  aria-label={`${control.label} control lane for ${row.zoneName}`}
                  className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 text-[9px] text-cyan-300/80"
                  style={{ gridColumn: 1, gridRow: rowIndex * rowStride + contentStartRow + 3 + controlIndex + routingLaneRows }}
                >
                  <span className="truncate font-mono">↳ {control.label}</span>
                </div>
                {show.scenes.map((scene, sceneIndex) => {
                  const cell = cellCoveringScene(show, row.zoneId, sceneIndex)
                  const target = cell?.controlTargets?.[control.exportName]
                  return (
                    <div
                      key={`control-${row.zoneId}-${control.exportName}-${scene.id}`}
                      className="flex min-w-0 items-center justify-center overflow-hidden border-t border-zinc-900/80 px-1 font-mono text-[9px] text-zinc-500"
                      style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + 3 + controlIndex + routingLaneRows }}
                    >
                      {target === undefined
                        ? (
                            <span title={`${control.label} unset in ${scene.name}`}>
                              <span aria-hidden>—</span>
                              <span className="sr-only">unset</span>
                            </span>
                          )
                        : formatControlValue(target)}
                    </div>
                  )
                })}
                {show.scenes.slice(0, -1).map((scene, sceneIndex) => {
                  const transition = show.transitions?.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
                  const destination = cellCoveringScene(show, row.zoneId, sceneIndex + 1)
                  const from = destination && transition?.propertyTransitions?.controls?.[control.exportName]?.fromByCellId[destination.id]
                  const target = destination?.controlTargets?.[control.exportName]
                  return transition && destination ? (
                    <button
                      key={`control-boundary-${row.zoneId}-${control.exportName}-${scene.id}`}
                      type="button"
                      aria-label={`Edit ${control.label} transition from ${scene.name} for ${row.zoneName}`}
                      data-show-timeline-focus
                      className={[
                        'flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] transition-colors',
                        from === undefined ? 'text-zinc-700 hover:text-cyan-300' : 'bg-cyan-400/10 text-cyan-200',
                      ].join(' ')}
                      style={{ gridColumn: 3 + sceneIndex * 2, gridRow: rowIndex * rowStride + contentStartRow + 3 + controlIndex + routingLaneRows }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect({ kind: 'transition', transitionId: transition.id }, event.currentTarget)
                      }}
                    >
                      {from === undefined || target === undefined ? '—' : `${formatControlValue(from)}→${formatControlValue(target)}`}
                    </button>
                  ) : null
                })}
              </div>
            ))}
          </div>
        ))}
        {!readOnly && <button
          type="button"
          aria-label="Add zone"
          onClick={(event) => {
            event.stopPropagation()
            onAddZone()
          }}
          className="sticky left-0 z-30 flex items-center justify-center rounded-[5px] border border-dashed border-zinc-800 bg-[#060608] text-[10px] uppercase tracking-wider text-structural hover:border-zinc-600 hover:text-zinc-200"
          style={{ gridColumn: 1, gridRow: strip.rows.length * rowStride + contentStartRow + routingLaneRows }}
        >
          + zone
        </button>}
        {!readOnly && <button
          type="button"
          aria-label="Add scene"
          onClick={(event) => {
            event.stopPropagation()
            onAddScene()
          }}
          className="sticky right-0 z-30 flex items-center justify-center rounded-[5px] border border-dashed border-zinc-800 bg-[#060608] text-[10px] uppercase tracking-wider text-structural [writing-mode:vertical-rl] hover:border-zinc-600 hover:text-zinc-200"
          style={{ gridColumn: columns.length, gridRow: `${contentStartRow + routingLaneRows} / span ${strip.rows.length * rowStride}` }}
        >
          + scene
        </button>}
        </div>
      </div>
      <TimelineNavigator viewport={viewport} onChange={setViewport} />
      {superDetail && (
        <ShowSceneSuperDetail
          detail={superDetail}
          onClose={() => setSuperDetailSceneId(null)}
          onOpenScene={onOpenScene}
        />
      )}
    </div>
  )
}

function isLegalClipMove(show: ShowRecord, cellId: string | null, zoneId: string, sceneId: string): boolean {
  if (!cellId) return false
  const cell = show.cells.find((candidate) => candidate.id === cellId)
  return Boolean(
    cell
    && cell.zoneId === zoneId
    && cell.sceneId !== sceneId
    && Math.max(1, cell.sceneSpan) === 1
    && Math.max(1, cell.zoneSpan ?? 1) === 1
    && !showCellAtSlot(show, zoneId, sceneId),
  )
}

function TimelineNavigator({
  viewport,
  onChange,
}: {
  viewport: ShowTimelineViewport
  onChange: (viewport: ShowTimelineViewport) => void
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
    <div className="mt-2 grid h-9 grid-cols-[148px_minmax(0,1fr)_64px] border-t border-zinc-800 bg-zinc-950/65" role="group" aria-label="Show navigator">
      <div className="flex items-center px-2 text-[9px] uppercase tracking-[0.12em] text-zinc-600">Show navigator</div>
      <div ref={overviewRef} className="relative my-2 overflow-hidden rounded-sm bg-zinc-900/80">
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
      <div className="flex items-center justify-end px-2 text-[9px] tabular-nums text-zinc-600">{Math.round(viewport.totalMs / viewport.durationMs * 100)}%</div>
    </div>
  )
}

function TimelineRuler({
  show,
  gridColumn,
  gridRow,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
}: {
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

function TimelinePlayhead({
  show,
  gridColumn,
  rowSpan,
  viewport,
  snapEnabled,
  structuralTimesMs,
  getVisibleWidth,
}: {
  show: ShowRecord
  gridColumn: string
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
      className="pointer-events-none relative z-20"
      style={{ gridColumn, gridRow: `2 / span ${rowSpan}` }}
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

function SceneColumnHeader({
  scene,
  selected,
  canRemove,
  readOnly,
  selectionKey,
  xrayOpen,
  onToggleXray,
  onSelect,
  onRemove,
  onUpdate,
}: {
  scene: ShowScene
  selected: boolean
  canRemove: boolean
  readOnly: boolean
  selectionKey: string
  xrayOpen: boolean
  onToggleXray: () => void
  onSelect: (anchor: HTMLElement) => void
  onRemove: () => void
  onUpdate: (changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  return (
    <div
      role="group"
      aria-label={`Scene ${scene.name}`}
      title={`Open ${scene.name} properties`}
      tabIndex={-1}
      data-show-timeline-focus
      data-show-selection-key={selectionKey}
      onClick={(event) => {
        event.stopPropagation()
        event.currentTarget.focus()
        onSelect(event.currentTarget)
      }}
      className={`group flex min-w-0 cursor-pointer items-center gap-1.5 overflow-hidden border-b px-2 py-1.5 transition-colors ${selected ? 'border-live bg-live/[0.045]' : 'border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/55'}`}
    >
      <Clapperboard size={11} aria-hidden className="shrink-0 text-zinc-600 transition-colors group-hover:text-zinc-300" />
      <input
        aria-label={`${scene.name} scene name`}
        title={scene.name}
        data-show-scene-name
        value={scene.name}
        readOnly={readOnly}
        onChange={(event) => onUpdate({ name: event.target.value })}
        className="min-w-0 flex-1 cursor-pointer truncate bg-transparent text-[12px] font-semibold text-zinc-100 outline-none group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4 focus:cursor-text focus:underline focus:decoration-live focus:underline-offset-4"
      />
      <label className="flex shrink-0 items-baseline gap-0.5 text-[9.5px] text-structural" title={`${scene.name} duration`}>
        <input
          aria-label={`${scene.name} duration seconds`}
          type="number"
          min={0.1}
          step={0.1}
          value={Number((scene.durationMs / 1000).toFixed(1))}
          readOnly={readOnly}
          onChange={(event) => onUpdate({ durationMs: Number(event.target.value) * 1000 })}
          className="h-5 w-10 rounded border border-transparent bg-transparent px-0.5 text-right text-[9.5px] text-structural outline-none hover:border-zinc-700 hover:bg-zinc-900 focus:border-live/70 focus:bg-zinc-900"
        />
        s
      </label>
      <button
        type="button"
        aria-label={`${xrayOpen ? 'Hide' : 'Show'} ${scene.name} Scene X-ray`}
        aria-pressed={xrayOpen}
        title={`${xrayOpen ? 'Hide' : 'Show'} ${scene.name} Scene X-ray`}
        onClick={(event) => {
          event.stopPropagation()
          onToggleXray()
        }}
        className={`grid h-5 w-5 shrink-0 place-items-center rounded transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-amber-300 ${xrayOpen ? 'bg-amber-300/10 text-amber-200' : 'text-zinc-600 opacity-0 hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100 focus:opacity-100'}`}
      >
        <ChevronDown size={11} aria-hidden className={xrayOpen ? '' : '-rotate-90'} />
      </button>
      <button
        type="button"
        aria-label={`Open ${scene.name} properties`}
        title={`${scene.name} properties`}
        onClick={(event) => {
          event.stopPropagation()
          const anchor = event.currentTarget.closest<HTMLElement>('[data-show-selection-key]')
          if (anchor) onSelect(anchor)
        }}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity hover:bg-zinc-800 hover:text-zinc-200 group-hover:opacity-100 focus:opacity-100"
      >
        <Settings2 size={11} aria-hidden />
      </button>
      {canRemove && !readOnly && (
        <button
          type="button"
          aria-label={`Remove scene ${scene.name}`}
          title={`Remove ${scene.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity hover:bg-red-950/30 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
        >
          <Trash2 size={11} aria-hidden />
        </button>
      )}
    </div>
  )
}

function BoundaryTransitionChip({
  show,
  transition,
  selected,
  selectionKey,
  onSelect,
}: {
  show: ShowRecord
  transition: ReturnType<typeof projectShowStrip>['boundaryTransitions'][number]
  selected: boolean
  selectionKey: string
  onSelect: (anchor: HTMLElement) => void
}) {
  const glyph = transition.kind === 'routing'
    ? 'rt'
    : transition.kind === 'crossfade'
    ? 'xf'
    : transition.kind === 'wipe'
      ? 'wp'
      : transition.kind === 'dither'
        ? 'dt'
        : transition.kind === 'portal'
          ? 'pt'
          : 'cut'
  const afterIndex = show.scenes.findIndex((scene) => scene.id === transition.afterSceneId)
  const from = show.scenes[afterIndex]?.name ?? 'Scene'
  const to = show.scenes[afterIndex + 1]?.name ?? 'next scene'
  return (
    <button
      type="button"
      aria-label={`Select ${from} to ${to} transition (${transition.kind})`}
      data-show-timeline-focus
      data-show-selection-key={selectionKey}
      title={transition.kind === 'routing'
        ? `Routing to ${transition.layoutName ?? 'layout'} · ${transition.durationMs === 0 ? 'cut' : `${transition.durationMs / 1000}s directional transfer`}`
        : `${transition.kind} · ${transition.durationMs === 0 ? 'marker' : `${transition.durationMs / 1000}s`}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect(event.currentTarget)
      }}
      className={[
        'flex h-6 min-w-6 items-center justify-center rounded border px-1 text-[9px] font-semibold uppercase transition-colors',
        selected
          ? 'border-live/70 bg-live/10 text-live'
          : transition.kind === 'routing'
            ? 'border-emerald-800/70 bg-emerald-950/25 text-emerald-300 hover:border-emerald-600'
            : transition.cost === 'expensive'
              ? 'border-amber-800/60 bg-amber-950/20 text-amber-300 hover:border-amber-600'
              : 'border-zinc-700 bg-zinc-900/70 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200',
      ].join(' ')}
    >
      {transition.kind === 'routing' ? <Route size={11} aria-hidden /> : glyph}
    </button>
  )
}

function InspectorPanel({
  family,
  title,
  icon,
  actions,
  children,
}: {
  family: 'Scene' | 'Clip' | 'Transition' | 'Zone' | 'Show'
  title: string
  icon: React.ReactNode
  actions?: React.ReactNode
  children: React.ReactNode
}) {
  const label = `${family} properties`
  const accent = {
    Scene: 'border-amber-400/35 bg-amber-400/10 text-amber-300',
    Clip: 'border-cyan-400/35 bg-cyan-400/10 text-cyan-300',
    Transition: 'border-violet-400/35 bg-violet-400/10 text-violet-300',
    Zone: 'border-sky-400/35 bg-sky-400/10 text-sky-300',
    Show: 'border-zinc-600 bg-zinc-800/80 text-amber-300',
  }[family]
  return (
    <section role="region" aria-label={label} data-entity-family={family.toLowerCase()} className="overflow-hidden bg-transparent">
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/65 py-1 pl-2.5 pr-10">
        <span className={`grid size-6 shrink-0 place-items-center rounded border ${accent}`}>{icon}</span>
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{label}</h3>
          <p className="truncate text-[9px] text-zinc-600">{title}</p>
        </div>
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      <div className="p-2.5">{children}</div>
    </section>
  )
}

function ContextualInspector({
  show,
  selection,
  selectedClip,
  patternOptions,
  patternControlsByCellId,
  compiledCost,
  controllerProfiles,
  targetProfile,
  userMaps,
  spatialSelectionUnavailableReason,
  onOpenSpatialSelection,
  onUpdateTargetProfile,
  onUpdatePortableReference,
  onUpdatePattern,
  onPatternCommit,
  onPlaceClip,
  onRemoveClip,
  onUpdateScene,
  onDuplicateScene,
  onRequestRemoveScene,
  onUpdateAdaptations,
  onUpdateEffects,
  onOpenEffects,
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
  onUpdateRoutingSwitch,
}: {
  show: ShowRecord
  selection: ShowSelection
  selectedClip: ShowCell | null
  patternOptions: ShowPatternOption[]
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  compiledCost?: import('@/engine/showVisualToolkit').ShowCompiledCostMetadata
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  spatialSelectionUnavailableReason: string | null
  onOpenSpatialSelection: (zoneId: string) => void
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdatePortableReference: (referenceMapId: string | null, referencePixelCount: number) => void
  onUpdatePattern: (cell: ShowCell, patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onPatternCommit: () => void
  onPlaceClip: (zoneId: string, sceneId: string, patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onRemoveClip: (clip: ShowCell) => void
  onUpdateScene: (scene: ShowScene, changes: Partial<Omit<ShowScene, 'id'>>) => void
  onDuplicateScene: (scene: ShowScene) => void
  onRequestRemoveScene: (scene: ShowScene) => void
  onUpdateAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  onUpdateEffects: (cell: ShowCell, effects: ShowClipEffect[]) => void
  onOpenEffects: (cell: ShowCell) => void
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
  onUpdateRoutingSwitch: (afterSceneId: string, layoutId: string | null) => void
}) {
  if (selection.kind === 'empty-slot') {
    const zone = show.zones.find((candidate) => candidate.id === selection.zoneId)
    const scene = show.scenes.find((candidate) => candidate.id === selection.sceneId)
    if (zone && scene) {
      return (
        <EmptyClipInspector
          zone={zone}
          scene={scene}
          patternOptions={patternOptions}
          onPlace={(patch) => onPlaceClip(zone.id, scene.id, patch)}
        />
      )
    }
  }

  if (selection.kind === 'scene') {
    const scene = show.scenes.find((candidate) => candidate.id === selection.sceneId)
    if (scene) {
      return (
        <SceneInspector
          scene={scene}
          hasMovingSplit={show.routingLayouts.some((layout) => layout.logical?.kind === 'split')}
          canRemove={show.scenes.length > 1}
          onUpdate={(changes) => onUpdateScene(scene, changes)}
          onDuplicate={() => onDuplicateScene(scene)}
          onRemove={() => onRequestRemoveScene(scene)}
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
        compiledCost={compiledCost}
        onUpdatePattern={(patch) => onUpdatePattern(selectedClip, patch)}
        onPatternCommit={onPatternCommit}
        onRemove={() => onRemoveClip(selectedClip)}
        onUpdateAdaptations={(changes) => onUpdateAdaptations(selectedClip, changes)}
        onUpdateEffects={(effects) => onUpdateEffects(selectedClip, effects)}
        onOpenEffects={() => onOpenEffects(selectedClip)}
        onUpdateControlTarget={(exportName, value) => onUpdateControlTarget(selectedClip, exportName, value)}
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

  if (selection.kind === 'routing-switch') {
    return (
      <RoutingSwitchInspector
        show={show}
        afterSceneId={selection.afterSceneId}
        onUpdate={(layoutId) => onUpdateRoutingSwitch(selection.afterSceneId, layoutId)}
      />
    )
  }

  return (
    <ShowSetupInspector
      show={show}
      controllerProfiles={controllerProfiles}
      targetProfile={targetProfile}
      userMaps={userMaps}
      onUpdateTargetProfile={onUpdateTargetProfile}
      onUpdatePortableReference={onUpdatePortableReference}
      onAddZone={onAddZone}
      onAddRoutingLayout={onAddRoutingLayout}
      onUpdateRoutingLayout={onUpdateRoutingLayout}
      onRemoveRoutingLayout={onRemoveRoutingLayout}
    />
  )
}

function EmptyClipInspector({
  zone,
  scene,
  patternOptions,
  onPlace,
}: {
  zone: ShowRecord['zones'][number]
  scene: ShowScene
  patternOptions: ShowPatternOption[]
  onPlace: (patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
}) {
  return (
    <InspectorPanel
      family="Clip"
      title={`${zone.name} · ${scene.name}`}
      icon={<Grid2X2 size={13} aria-hidden />}
    >
      <label className="block max-w-md text-[9px] uppercase tracking-[0.1em] text-zinc-600">
        Pattern
        <PatternCombobox
          ariaLabel="Pattern for new clip"
          value={null}
          options={patternOptions.map((option) => ({
            value: `${option.ref.kind}:${option.ref.id}`,
            label: option.label,
            group: option.group,
          }))}
          onChange={(value) => {
            const option = patternOptions.find((item) => `${item.ref.kind}:${item.ref.id}` === value)
            if (option) onPlace({ pattern: option.ref, patternName: option.label })
          }}
        />
      </label>
    </InspectorPanel>
  )
}

function SceneInspector({
  scene,
  hasMovingSplit,
  canRemove,
  onUpdate,
  onDuplicate,
  onRemove,
}: {
  scene: ShowScene
  hasMovingSplit: boolean
  canRemove: boolean
  onUpdate: (changes: Partial<Omit<ShowScene, 'id'>>) => void
  onDuplicate: () => void
  onRemove: () => void
}) {
  return (
    <InspectorPanel
      family="Scene"
      title={scene.name}
      icon={<Clapperboard size={13} aria-hidden />}
      actions={(
        <>
          <Button size="icon-xs" variant="ghost" aria-label={`Duplicate scene ${scene.name}`} title={`Duplicate ${scene.name}`} className="text-zinc-500 hover:text-zinc-200" onClick={onDuplicate}>
            <Copy size={12} aria-hidden />
          </Button>
          {canRemove && (
            <Button size="icon-xs" variant="ghost" aria-label={`Delete scene ${scene.name}`} title={`Delete ${scene.name}`} className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={onRemove}>
              <Trash2 size={12} aria-hidden />
            </Button>
          )}
        </>
      )}
    >
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(12rem,1fr)_8rem]">
        <label className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">
          Name
          <input
            aria-label="Scene name"
            value={scene.name}
            onChange={(event) => onUpdate({ name: event.target.value })}
            className={`${field} mt-1 w-full`}
          />
        </label>
        <label className="text-[9px] uppercase tracking-[0.1em] text-zinc-600">
          Duration
          <span className="mt-1 flex items-center gap-1">
            <input
              aria-label="Scene duration seconds"
              type="number"
              min={0.1}
              step={0.1}
              value={Number((scene.durationMs / 1000).toFixed(1))}
              onChange={(event) => onUpdate({ durationMs: Number(event.target.value) * 1000 })}
              className={`${field} w-20 text-right tabular-nums`}
            />
            <span className="text-[10px] text-zinc-500">s</span>
          </span>
        </label>
        {hasMovingSplit && (
          <NumberField
            label="Split position"
            value={scene.routingTargets?.splitPosition ?? 0.5}
            min={0}
            max={1}
            step={0.01}
            onChange={(splitPosition) => onUpdate({ routingTargets: { splitPosition } })}
          />
        )}
        <NumberField
          label="Repeat scale"
          value={scene.sampleTargets?.repeatScale ?? 1}
          min={1}
          max={8}
          step={0.1}
          onChange={(repeatScale) => onUpdate({ sampleTargets: { repeatScale } })}
        />
      </div>
    </InspectorPanel>
  )
}

function ClipInspector({
  show,
  clip,
  patternOptions,
  patternControls,
  compiledCost,
  onUpdatePattern,
  onPatternCommit,
  onRemove,
  onUpdateAdaptations,
  onUpdateEffects,
  onOpenEffects,
  onUpdateControlTarget,
  onUpdateRestartOnEntry,
  onExtend,
  onSpanZones,
  onUpdateZoneMode,
}: {
  show: ShowRecord
  clip: ShowCell
  patternOptions: ShowPatternOption[]
  patternControls: AutomatablePatternControl[]
  compiledCost?: import('@/engine/showVisualToolkit').ShowCompiledCostMetadata
  onUpdatePattern: (patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onPatternCommit: () => void
  onRemove: () => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
  onUpdateEffects: (effects: ShowClipEffect[]) => void
  onOpenEffects: () => void
  onUpdateControlTarget: (exportName: string, value: number | undefined) => void
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
  const zone = show.zones[zoneIndex]
  const scene = show.scenes[sceneIndex]
  const lightShutter = cell.adaptations.lightShutter
  const hasAuthoredPatternControls = Object.values(cell.controlTargets ?? {}).some((value) => value !== undefined)
  const hasAdvancedOverrides = cell.adaptations.mirror
    || cell.sceneSpan > 1
    || (cell.zoneSpan ?? 1) > 1
    || cell.zoneMode === 'repeat'
    || cell.adaptations.phase !== 0
    || Boolean(cell.restartOnEntry)
    || cell.adaptations.steppedClock !== undefined
    || (cell.adaptations.timeOffsetMs ?? 0) !== 0
    || lightShutter !== undefined
  const [patternControlsOpen, setPatternControlsOpen] = useState(hasAuthoredPatternControls)
  const [advancedControlsOpen, setAdvancedControlsOpen] = useState(hasAdvancedOverrides)
  const updateLightShutter = (changes: Partial<NonNullable<ShowCell['adaptations']['lightShutter']>>) => {
    if (!lightShutter) return
    onUpdateAdaptations({ lightShutter: { ...lightShutter, ...changes } })
  }
  return (
    <InspectorPanel
      family="Clip"
      title={`${cell.patternName} · ${zone?.name ?? 'zone'} · ${scene?.name ?? 'scene'}`}
      icon={<Grid2X2 size={13} aria-hidden />}
      actions={(
        <Button size="icon-xs" variant="ghost" aria-label={`Delete clip ${cell.patternName}`} title={`Delete ${cell.patternName}`} className="text-zinc-500 hover:bg-red-950/30 hover:text-red-300" onClick={onRemove}>
          <Trash2 size={12} aria-hidden />
        </Button>
      )}
    >
      <div data-testid="clip-primary-fields" className="grid min-w-0 items-end gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,7rem)_minmax(0,7rem)]">
        <label className="block text-[9px] uppercase tracking-[0.1em] text-zinc-600">
          Source pattern
          <PatternCombobox
            key={`${cell.id}:${cell.pattern.kind}:${cell.pattern.id}`}
            ariaLabel="Source pattern"
            value={`${cell.pattern.kind}:${cell.pattern.id}`}
            options={patternOptions.map((option) => ({
              value: `${option.ref.kind}:${option.ref.id}`,
              label: option.label,
              group: option.group,
            }))}
            onChange={(value) => {
              const option = patternOptions.find((item) => `${item.ref.kind}:${item.ref.id}` === value)
              if (option) onUpdatePattern({ pattern: option.ref, patternName: option.label })
            }}
            onCommit={onPatternCommit}
          />
        </label>
        <NumberField
          label="Animation speed"
          value={cell.adaptations.timeScale}
          min={0}
          max={4}
          step={0.1}
          suffix="×"
          help="How quickly Pattern animation advances. Does not change Clip duration or frame rate."
          onChange={(timeScale) => onUpdateAdaptations({ timeScale })}
        />
        <NumberField label="Brightness" value={cell.adaptations.brightness} min={0} max={1} step={0.01} onChange={(brightness) => onUpdateAdaptations({ brightness })} />
      </div>
      <ShowEffectStack effects={cell.effects ?? []} compiledCost={compiledCost} onChange={onUpdateEffects} onAdd={onOpenEffects} />
      <div data-testid="clip-control-trays" className="mt-2 grid items-start gap-2 lg:grid-cols-2">
        {patternControls.length > 0 && (
          <details
            className="min-w-0 rounded border border-cyan-400/15 bg-cyan-400/[0.035]"
            aria-label="Pattern automation targets"
            open={patternControlsOpen}
            onToggle={(event) => setPatternControlsOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-cyan-300/80">Add or edit pattern controls</summary>
            <div className="grid gap-1.5 border-t border-cyan-400/10 p-2 sm:grid-cols-2">
              {patternControls.map((control) => {
                const target = cell.controlTargets?.[control.exportName]
                const enabled = target !== undefined
                return (
                  <div key={control.exportName} className="min-w-0 rounded border border-zinc-800 bg-zinc-950/45 p-1.5">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <label className="flex shrink-0 items-center gap-1.5 text-[10px] text-zinc-300">
                        <input
                          type="checkbox"
                          aria-label={`Set ${control.label} target`}
                          checked={enabled}
                          onChange={(event) => onUpdateControlTarget(control.exportName, event.target.checked ? control.defaultValue : undefined)}
                          className="h-3.5 w-3.5 accent-cyan-400"
                        />
                        {control.label}
                      </label>
                      <span className="truncate text-right text-[8px] text-zinc-600" title={`${control.exportName} · ${control.min}–${control.max} · Studio default ${control.defaultValue}`}>
                        {control.exportName} · {control.min}–{control.max} · Studio default {control.defaultValue}
                      </span>
                    </div>
                    {enabled && (
                      <div className="mt-1.5">
                        <NumberField
                          label={`${control.label} target`}
                          hideLabel
                          value={target}
                          min={control.min}
                          max={control.max}
                          step={0.01}
                          onChange={(value) => onUpdateControlTarget(control.exportName, value)}
                        />
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </details>
        )}
        <details
          className={`min-w-0 rounded border border-zinc-800 bg-zinc-950/35 ${patternControls.length === 0 ? 'lg:col-span-2' : ''}`}
          aria-label="Advanced Clip controls"
          open={advancedControlsOpen}
          onToggle={(event) => setAdvancedControlsOpen(event.currentTarget.open)}
        >
          <summary className="cursor-pointer px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Advanced clip controls</summary>
          <div className="border-t border-zinc-800 p-2 text-[10px]">
            <div className="grid grid-cols-2 items-end gap-x-2 gap-y-1.5 xl:grid-cols-4">
            <label className="flex h-7 items-center gap-2 text-zinc-300">
              <input
                type="checkbox"
                checked={cell.adaptations.mirror}
                onChange={(event) => onUpdateAdaptations({ mirror: event.target.checked })}
              />
              Mirror clip
            </label>
            <label className="text-[10px] uppercase text-zinc-600">
              Hold scenes
              <select
                aria-label="Hold scenes"
                value={cell.sceneSpan}
                onChange={(event) => onExtend(Number(event.target.value))}
                className={`${field} mt-1 w-full`}
              >
                {Array.from({ length: maxSpan }, (_, index) => index + 1).map((span) => (
                  <option key={span} value={span}>{span}</option>
                ))}
              </select>
            </label>
            {(cell.zoneSpan ?? 1) > 1 && (
              <label className="text-[10px] uppercase text-zinc-600">
                Zone domain
                <select
                  aria-label="Zone domain"
                  value={cell.zoneMode === 'repeat' ? 'repeat' : 'span'}
                  onChange={(event) => onUpdateZoneMode(event.target.value === 'repeat' ? 'repeat' : 'span')}
                  className={`${field} mt-1 w-full`}
                >
                  <option value="span">one canvas</option>
                  <option value="repeat">repeat per zone</option>
                </select>
              </label>
            )}
            <label className="text-[10px] uppercase text-zinc-600">
              Span zones
              <select
                aria-label="Span zones"
                value={cell.zoneSpan ?? 1}
                onChange={(event) => onSpanZones(Number(event.target.value))}
                className={`${field} mt-1 w-full`}
              >
                {Array.from({ length: maxZoneSpan }, (_, index) => index + 1).map((span) => (
                  <option key={span} value={span}>{span}</option>
                ))}
              </select>
            </label>
            <NumberField label="Phase" value={cell.adaptations.phase} min={0} max={1} step={0.01} onChange={(phase) => onUpdateAdaptations({ phase })} />
            </div>
            {sceneIndex > 0 && (
              <section className="mt-2 flex min-w-0 items-center gap-3 rounded border border-sky-400/20 bg-sky-400/[0.04] px-2 py-1.5">
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
            <div className="mt-2 border-t border-zinc-800 pt-2">
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
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <NumberField label="Shutter rate (Hz)" value={lightShutter.rateHz} min={0.01} max={60} step={0.1} onChange={(rateHz) => updateLightShutter({ rateHz })} />
                  <NumberField label="Light on fraction" value={lightShutter.duty} min={0} max={1} step={0.01} onChange={(duty) => updateLightShutter({ duty })} />
                  <NumberField label="Shutter phase" value={lightShutter.phase} min={0} max={1} step={0.01} onChange={(phase) => updateLightShutter({ phase })} />
                  <label className="text-[10px] uppercase text-zinc-600">
                    Clock while dark
                    <select
                      aria-label="Clock while dark"
                      value={lightShutter.clockBehavior}
                      onChange={(event) => updateLightShutter({ clockBehavior: event.target.value === 'freeze' ? 'freeze' : 'continue' })}
                      className={`${field} mt-1 w-full`}
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
    <section className="mt-2 rounded border border-violet-400/25 bg-violet-400/[0.04] p-2">
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_auto_8rem]">
        <div className="min-w-0 self-center">
          <div className="text-[10px] uppercase tracking-[0.12em] text-violet-300">Motion cadence</div>
          <div className="truncate text-[9px] text-zinc-500" title="Shift this clip's private Pattern clock for rounds across zones.">
            <span aria-hidden>Private Pattern clock</span>
            <span className="sr-only">Shift this clip&apos;s private Pattern clock for rounds across zones.</span>
          </div>
        </div>
        <div className="flex rounded border border-zinc-700 bg-zinc-950 p-0.5 text-[10px]">
          <button
            type="button"
            aria-label="Smooth motion"
            aria-pressed={!stepped}
            className={stepped ? 'rounded px-2 py-1 text-zinc-500 hover:text-zinc-300' : 'rounded bg-zinc-700 px-2 py-1 text-zinc-100'}
            onClick={() => onChange(null)}
          >
            smooth
          </button>
          <button
            type="button"
            aria-label="Stepped motion"
            aria-pressed={stepped}
            className={stepped ? 'rounded bg-violet-400/20 px-2 py-1 text-violet-200' : 'rounded px-2 py-1 text-zinc-500 hover:text-zinc-300'}
            onClick={() => onChange(stepMs ?? 125)}
          >
            stepped
          </button>
        </div>
        <NumberField
          label="Start offset (ms)"
          value={timeOffsetMs}
          min={0}
          max={60000}
          step={50}
          onChange={onOffsetChange}
        />
      </div>
      {stepped && (
        <>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 border-t border-violet-400/10 pt-2">
            <label className="text-[10px] uppercase text-zinc-600">
              Jumps per second
              <input
                aria-label="Jumps per second"
                className="mt-2 w-full accent-violet-400"
                type="range"
                min={0.25}
                max={30}
                step={0.25}
                value={rateHz}
                onChange={(event) => onChange(steppedClockStepMs(Number(event.target.value)))}
              />
            </label>
            <div className="rounded border border-zinc-700 bg-zinc-900 px-3 py-1.5 text-right">
              <b className="block text-sm text-zinc-100">{rateLabel} / sec</b>
              <span className="text-[9px] text-zinc-500">every {Math.round(stepMs)} ms</span>
            </div>
          </div>
          <div className="mt-1.5 flex gap-1" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className={index % 3 === 0 ? 'h-2 flex-1 bg-violet-300/70' : 'h-2 flex-1 bg-zinc-800'} />
            ))}
          </div>
          <p className="mt-1.5 text-[9px] text-zinc-500">
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
          {show.routingLayouts.some((layout) => layout.logical?.kind === 'split') && nextScene && (
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

function RoutingSwitchInspector({
  show,
  afterSceneId,
  onUpdate,
}: {
  show: ShowRecord
  afterSceneId: string
  onUpdate: (layoutId: string | null) => void
}) {
  const sceneIndex = show.scenes.findIndex((scene) => scene.id === afterSceneId)
  const from = show.scenes[sceneIndex]?.name ?? 'Scene'
  const to = show.scenes[sceneIndex + 1]?.name ?? 'next scene'
  const routingSwitch = show.routingSwitches.find((candidate) => candidate.afterSceneId === afterSceneId)
  return (
    <InspectorPanel family="Transition" title={`${from} → ${to} · routing layout`} icon={<Route size={13} aria-hidden />}>
      <div className="grid max-w-xl gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Destination routing layout
          <select
            aria-label="Destination routing layout"
            value={routingSwitch?.layoutId ?? ''}
            onChange={(event) => onUpdate(event.target.value || null)}
            className={`${field} mt-1 w-full`}
          >
            <option value="">no switch</option>
            {show.routingLayouts.map((layout) => (
              <option key={layout.id} value={layout.id}>{layout.name}</option>
            ))}
          </select>
        </label>
        <p className="text-[10px] leading-4 text-zinc-500">
          The destination layout takes effect at this scene boundary. Running Pattern clocks and state continue uninterrupted.
        </p>
      </div>
    </InspectorPanel>
  )
}

function routingModeValue(layout: ShowRoutingLayout): string {
  const logical = layout.logical
  if (!logical) return 'physical'
  if (logical.kind === 'single') return 'single'
  if (logical.kind === 'grid' && logical.columns === 2 && logical.rows === 2) return 'grid-2x2'
  if (logical.kind === 'stripes') return `stripes-${logical.axis}`
  if (logical.kind === 'split') return `split-${logical.axis}`
  return 'physical'
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
  if (mode === 'split-x' || mode === 'split-y') {
    return { kind: 'split', zoneIds: [zoneIds[0], zoneIds[1]], axis: mode === 'split-y' ? 'y' : 'x' }
  }
  return undefined
}

function logicalRoutingDescription(layout: ShowRoutingLayout, show: ShowRecord): string {
  const logical = layout.logical
  if (!logical) return ''
  const names = logical.zoneIds.map((zoneId) => show.zones.find((zone) => zone.id === zoneId)?.name ?? zoneId)
  if (logical.kind === 'single') return `${names[0]} receives the complete normalized Stage.`
  if (logical.kind === 'grid') return `${names.join(', ')} fill a ${logical.columns} x ${logical.rows} normalized grid.`
  if (logical.kind === 'stripes') return `${names.join(', ')} divide the normalized ${logical.axis.toUpperCase()} axis into equal position-based stripes.`
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
                  <option value="split-x">moving split X</option>
                  <option value="split-y">moving split Y</option>
                </select>
              </label>
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
          <input
            aria-label={`Nominal pixels ${zone.name}`}
            type="number"
            min={1}
            value={zone.nominalPixelCount}
            onChange={(event) => onUpdateZone({ nominalPixelCount: Number(event.target.value) })}
            className={field}
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
  targetPixels,
  pushResult,
}: {
  compiled: CompiledShowState
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
  return (
    <div className="flex min-h-10 shrink-0 items-center gap-2 overflow-x-auto whitespace-nowrap border-t border-seam bg-zinc-950 px-3 font-mono text-xs text-zinc-500">
      <span>compiled artifact</span>
      <span className="h-2 w-28 overflow-hidden rounded-sm bg-zinc-800">
        <span
          className={`block h-full ${pressure?.status === 'blocked' ? 'bg-red-500' : pressure?.status === 'warning' ? 'bg-amber-400' : 'bg-live'}`}
          style={{ width: `${Math.min(100, ratio * 100)}%` }}
        />
      </span>
      <b className="text-zinc-300">{summary ? formatBytes(summary.artifactBytes) : '-'} / ~{summary ? formatBytes(summary.measuredDeviceBudgetBytes) : '-'}</b>
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
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  suffix,
  help,
  hideLabel = false,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  suffix?: string
  help?: string
  hideLabel?: boolean
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(() => String(value))
  const focusedRef = useRef(false)
  const normalized = min === 0 && max === 1

  useEffect(() => {
    if (!focusedRef.current) setDraft(String(value))
  }, [value])

  const commit = (raw = draft) => {
    focusedRef.current = false
    const parsed = Number(raw)
    if (raw.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(value))
      return
    }
    const bounded = Math.max(min, Math.min(max, parsed))
    setDraft(String(bounded))
    if (bounded !== value) onChange(bounded)
  }

  return (
    <label className="min-w-0 text-[10px] uppercase text-zinc-600" title={help}>
      <span className={hideLabel ? 'sr-only' : 'flex items-center justify-between gap-2'}>
        <span>{label}</span>
        {normalized && <span className="font-mono text-[8px] tracking-normal text-zinc-700" title="Normalized value from zero to one">0–1</span>}
      </span>
      <span className={`${hideLabel ? '' : 'mt-1'} flex min-w-0 items-center gap-1`}>
        <input
          aria-label={label}
          title={help}
          type="number"
          min={min}
          max={max}
          step={step}
          value={draft}
          onFocus={() => { focusedRef.current = true }}
          onChange={(event) => {
            const nextDraft = event.target.value
            setDraft(nextDraft)
          }}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              event.currentTarget.value = String(value)
              setDraft(String(value))
              event.currentTarget.blur()
            }
          }}
          className={`${field} min-w-0 w-full flex-1`}
        />
        {suffix && <span className="text-[10px] text-zinc-500">{suffix}</span>}
      </span>
    </label>
  )
}

function adaptationSummary(cell: ShowCell): string {
  const parts = []
  if (cell.adaptations.mirror) parts.push('mirror')
  if (cell.adaptations.phase !== 0) parts.push(`phase ${cell.adaptations.phase.toFixed(2)}`)
  if (cell.adaptations.brightness !== 1) parts.push(`dim ${cell.adaptations.brightness.toFixed(2)}`)
  if (cell.adaptations.timeScale !== 1) parts.push(`animation speed ${cell.adaptations.timeScale.toFixed(1)}×`)
  if (cell.adaptations.lightShutter) parts.push(`shutter ${Math.round(cell.adaptations.lightShutter.duty * 100)}%`)
  if (cell.adaptations.steppedClock) parts.push(`step ${formatCadenceRate(steppedClockRateHz(cell.adaptations.steppedClock.stepMs))}/s`)
  if ((cell.adaptations.timeOffsetMs ?? 0) > 0) parts.push(`offset ${Math.round(cell.adaptations.timeOffsetMs!)}ms`)
  return parts.length ? parts.join(' - ') : 'no adaptations'
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
