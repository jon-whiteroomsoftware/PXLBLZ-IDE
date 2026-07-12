import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { Check, Clapperboard, Code2, Copy, Download, Grid2X2, Map as MapIcon, Maximize2, Pause, Play, Plus, RotateCw, Route, Scissors, Settings2, SkipBack, Trash2, Zap, ZoomIn, ZoomOut } from 'lucide-react'
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
import { getControllerProvider } from '@/engine/controllerProviderRegistry'
import { makeProgramId } from '@/engine/bytecodePush'
import { PatternDeploymentActions } from '@/components/PatternDeploymentActions'
import { requestControllerEntryOpen } from '@/components/controllerEntryEvents'
import { PatternPushChoices } from '@/components/SendToController'
import { PushConfirmPopover } from '@/components/PushConfirmPopover'
import { describeSendToController, isAlreadyPushed, type SendMode } from '@/engine/sendToController'
import { prepareShowControllerArtifact } from '@/engine/showControllerArtifact'
import { trackEvent } from '@/analytics'
import {
  projectShowStrip,
  canSplitShowAtTime,
  formatShowRoutingRanges,
  parseShowRoutingRanges,
  showLoopDurationMs,
  projectShowTimeline,
  showCellAtSlot,
  transitionCost,
} from '@/engine/showModel'
import { compileShowForPreview, sourceForShowCell, type CompiledShowState } from '@/engine/showPreviewArtifact'
import { discoverAutomatablePatternControls, type AutomatablePatternControl } from '@/engine/showPatternControls'
import {
  fitShowTimelineViewport,
  panShowTimelineViewport,
  rangeThumbCenterOffsetPx,
  resizeShowTimelineViewport,
  showTimelineThumb,
  zoomShowTimelineViewport,
  type ShowTimelineViewport,
} from '@/engine/showTimelineViewport'
import { buildShowEpeExport, type ShowEpeExport } from '@/engine/showEpeExport'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { bytesToBase64 } from '@/engine/RelayWebSocket'
import { steppedClockRateHz, steppedClockStepMs } from '@/engine/steppedClock'
import {
  controllerZonePixelCount,
  findControllerZoneByName,
  type ControllerProfile,
  type ControllerZone,
} from '@/engine/controllerProfile'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { useControllerStore } from '@/store/controllerStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { STOCK_MAPS, useMapStore } from '@/store/mapStore'
import { usePreviewStore } from '@/store/previewStore'
import { useShowTransportStore } from '@/store/showTransportStore'
import { usePatternStore } from '@/store/patternStore'
import { useShowStore } from '@/store/showStore'
import type {
  MapRecord,
  ShowBoundaryTransition,
  ShowCell,
  ShowPortalSettings,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowAutomatableProperty,
} from '@/engine/personalContentRecords'

const card = 'rounded-md border border-zinc-800 bg-zinc-950/35'
const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'
const clipBase =
  'relative z-10 flex min-h-16 flex-col justify-center gap-0.5 overflow-hidden rounded-[5px] border-0 border-l-[3px] px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live'

type ShowSelection =
  | { kind: 'scene'; sceneId: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'empty-slot'; zoneId: string; sceneId: string }
  | { kind: 'transition'; transitionId: string }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'routing-switch'; afterSceneId: string }
  | { kind: 'show' }

export function ShowEditor({ showId }: { showId: string }) {
  const show = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const updateShow = useShowStore((state) => state.updateShow)
  const updateStageMap = useShowStore((state) => state.updateStageMap)
  const addScene = useShowStore((state) => state.addScene)
  const duplicateScene = useShowStore((state) => state.duplicateScene)
  const removeScene = useShowStore((state) => state.removeScene)
  const updateScene = useShowStore((state) => state.updateScene)
  const updateBoundaryTransition = useShowStore((state) => state.updateBoundaryTransition)
  const removeBoundaryTransition = useShowStore((state) => state.removeBoundaryTransition)
  const removeClip = useShowStore((state) => state.removeClip)
  const placeClip = useShowStore((state) => state.placeClip)
  const updateCellAdaptations = useShowStore((state) => state.updateCellAdaptations)
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
  const controllerProvider = getControllerProvider()
  const controllerStatus = useSyncExternalStore(
    (onChange) => controllerProvider.subscribe(onChange),
    () => controllerProvider.getStatus(),
  )

  const activeShow = show ?? null
  const selectedClip = selection.kind === 'clip'
    ? activeShow?.cells.find((clip) => clip.id === selection.clipId) ?? null
    : null
  const targetProfile = activeShow?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === activeShow.targetControllerProfileId)
    : controllerProfiles[0]

  useEffect(() => {
    const handleDelete = (event: KeyboardEvent) => {
      if (event.key !== 'Delete' || !activeShow) return
      const target = event.target
      if (target instanceof Element && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) return

      if (selection.kind === 'scene') {
        const scene = activeShow.scenes.find((candidate) => candidate.id === selection.sceneId)
        if (!scene || activeShow.scenes.length <= 1) return
        event.preventDefault()
        setScenePendingDelete(scene)
        return
      }

      if (selection.kind === 'transition') {
        const transition = activeShow.transitions?.find((candidate) => candidate.id === selection.transitionId)
        if (!transition || transition.kind === 'cut') return
        event.preventDefault()
        void removeBoundaryTransition(activeShow.id, transition.id)
        return
      }

      if (selection.kind === 'clip') {
        event.preventDefault()
        setSelection({ kind: 'show' })
        void removeClip(activeShow.id, selection.clipId)
      }
    }
    document.addEventListener('keydown', handleDelete)
    return () => document.removeEventListener('keydown', handleDelete)
  }, [activeShow, removeBoundaryTransition, removeClip, selection])
  const stageDimension = activeShow?.stageMapId
    ? [...STOCK_MAPS, ...userMaps].find((map) => map.id === activeShow.stageMapId)?.dim
    : undefined
  const compiled = useMemo(
    () => activeShow
      ? compileShowForPreview(activeShow, userPatterns, targetProfile?.zones, {}, { stageDimension })
      : { artifact: null, error: null },
    [activeShow, stageDimension, userPatterns, targetProfile?.zones],
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
  const showExport = useMemo(
    () => activeShow && compiled.artifact
      ? buildShowEpeExport(activeShow, compiled.artifact.code, {
          stampedAt: new Date(activeShow.updatedAt),
          userMaps,
        })
      : null,
    [activeShow, compiled.artifact, userMaps],
  )
  const activeControllerMapDim = activeController?.mapDim ?? null
  const activeControllerFirmware = activeController?.firmwareVersion
  const preparedControllerArtifact = useMemo(() => {
    if (!showExport) return { value: null, error: null }
    try {
      return {
        value: prepareShowControllerArtifact(
          showExport.source,
          activeControllerMapDim,
          activeControllerFirmware,
        ),
        error: null,
      }
    } catch (error) {
      return {
        value: null,
        error: error instanceof Error ? error.message : 'Could not prepare Show for Controller',
      }
    }
  }, [activeControllerFirmware, activeControllerMapDim, showExport])

  useEffect(() => {
    if (!controllerPushResult) return
    const timeout = window.setTimeout(clearPushResult, 3500)
    return () => window.clearTimeout(timeout)
  }, [clearPushResult, controllerPushResult])
  const buildDownloadExport = async (): Promise<ShowEpeExport | null> => {
    if (!activeShow || !compiled.artifact) return null
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
    })),
    ...GALLERY_PATTERNS.map((pattern) => ({
      label: pattern.name,
      ref: { kind: 'stock' as const, id: pattern.name },
    })),
  ]

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950/75 font-mono text-xs text-zinc-400">
      <div data-testid="show-editor-scroll" className="scrollbar-hidden flex min-h-0 flex-1 flex-col overflow-auto">
        <div className="min-w-0 p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="min-w-0 flex-1 basis-[22rem]">
              <ShowTransportControls show={activeShow} />
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button
              size="xs"
              variant="ghost"
              className="bg-zinc-800/70 text-xs text-zinc-400 hover:bg-zinc-700/70 hover:text-zinc-300 disabled:opacity-40"
              disabled={!compiled.artifact}
              onClick={() => setGeneratedOpen(true)}
              >
                View generated pattern
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
            </div>
          </div>

          <section aria-label="Show timeline">
            <SceneStrip
              key={activeShow.id}
              show={activeShow}
              patternControlsByCellId={patternControlsByCellId}
              selection={selection}
              onSelect={setSelection}
              onAddScene={() => {
                void addScene(activeShow.id).then(() => {
                  window.setTimeout(() => {
                    const inputs = document.querySelectorAll<HTMLInputElement>('[data-show-scene-name]')
                    inputs[inputs.length - 1]?.focus()
                  }, 0)
                })
              }}
              onAddZone={() => void addZone(activeShow.id)}
              onRequestRemoveScene={setScenePendingDelete}
              onUpdateScene={(sceneId, changes) => void updateScene(activeShow.id, sceneId, changes)}
            />
          </section>

          <ContextualInspector
            show={activeShow}
            selection={selection}
            selectedClip={selectedClip}
            patternOptions={patternOptions}
            patternControlsByCellId={patternControlsByCellId}
            controllerProfiles={controllerProfiles}
            targetProfile={targetProfile}
            userMaps={userMaps}
            onUpdateTargetProfile={(targetControllerProfileId) => void updateShow(activeShow.id, {
              ...activeShow,
              targetControllerProfileId: targetControllerProfileId || undefined,
              updatedAt: Date.now(),
            })}
            onUpdateStageMap={(stageMapId) => void updateStageMap(activeShow.id, stageMapId)}
            onUpdatePattern={(cell, patch) => void updateCellPattern(activeShow.id, cell.id, patch)}
            onPlaceClip={(zoneId, sceneId, patch) => {
              void placeClip(activeShow.id, zoneId, sceneId, patch).then((clip) => {
                if (clip) setSelection({ kind: 'clip', clipId: clip.id })
              })
            }}
            onRemoveClip={(clip) => {
              setSelection({ kind: 'show' })
              void removeClip(activeShow.id, clip.id)
            }}
            onUpdateScene={(scene, changes) => void updateScene(activeShow.id, scene.id, changes)}
            onDuplicateScene={(scene) => void duplicateScene(activeShow.id, scene.id)}
            onRequestRemoveScene={setScenePendingDelete}
            onUpdateAdaptations={(cell, changes) => void updateCellAdaptations(activeShow.id, cell.id, changes)}
            onUpdateControlTarget={(cell, exportName, value) => void updateCellControlTarget(activeShow.id, cell.id, exportName, value)}
            onUpdateRestartOnEntry={(cell, restartOnEntry) => void updateCellRestartOnEntry(activeShow.id, cell.id, restartOnEntry)}
            onExtend={(cell, sceneSpan) => void extendCell(activeShow.id, cell.id, sceneSpan)}
            onSpanZones={(cell, zoneSpan) => void spanCellZones(activeShow.id, cell.id, zoneSpan)}
            onUpdateCellZoneMode={(cell, zoneMode) => void updateCellZoneMode(activeShow.id, cell.id, zoneMode)}
            onUpdateBoundaryTransition={(transitionId, changes) => void updateBoundaryTransition(activeShow.id, transitionId, changes)}
            onRemoveBoundaryTransition={(transitionId) => void removeBoundaryTransition(activeShow.id, transitionId)}
            onAddZone={() => void addZone(activeShow.id)}
            onUpdateZone={(zoneId, changes) => void updateZone(activeShow.id, zoneId, changes)}
            onRemoveZone={(zoneId) => void removeZone(activeShow.id, zoneId)}
            onAddRoutingLayout={(sourceLayoutId) => void addRoutingLayout(activeShow.id, sourceLayoutId)}
            onUpdateRoutingLayout={(layoutId, changes) => void updateRoutingLayout(activeShow.id, layoutId, changes)}
            onRemoveRoutingLayout={(layoutId) => void removeRoutingLayout(activeShow.id, layoutId)}
            onUpdateRoutingSwitch={(afterSceneId, layoutId) => void updateRoutingSwitch(activeShow.id, afterSceneId, layoutId)}
          />
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
                    if (scenePendingDelete) void removeScene(activeShow.id, scenePendingDelete.id)
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
        targetPixels={targetProfile?.lastKnownPixelCount ?? zonePixelTotal(activeShow)}
        onViewGenerated={() => setGeneratedOpen(true)}
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
  const seekStatus = useShowTransportStore((state) => state.showId === show.id ? state.seekStatus : 'idle')
  const splitAtTime = useShowStore((state) => state.splitAtTime)
  const canSplit = canSplitShowAtTime(show, positionMs)

  useEffect(() => {
    useShowTransportStore.getState().openShow(show.id, durationMs)
  }, [durationMs, show.id])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const editing = target instanceof HTMLElement && (
        target.closest('input:not([type="range"]), select, textarea, [contenteditable="true"], [role="textbox"]') !== null
      )
      if (!editing && event.code === 'Space') {
        event.preventDefault()
        usePreviewStore.getState().toggle()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label="Go to Show start"
        title="Go to Show start"
        className="bg-zinc-900/70 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100"
        onClick={() => requestShowSeek(show.id, 0)}
      >
        <SkipBack size={13} aria-hidden />
      </Button>
      <Button
        size="icon-xs"
        variant="ghost"
        aria-label={isRunning ? 'Pause Show preview' : 'Play Show preview'}
        title={isRunning ? 'Pause Show preview (Space)' : 'Play Show preview (Space)'}
        className="bg-zinc-900/70 text-zinc-300 hover:bg-zinc-800 hover:text-zinc-50"
        onClick={toggle}
      >
        {isRunning ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
      </Button>
      <output className="w-[142px] text-[10px] tabular-nums text-zinc-300" aria-live="off">
        {formatShowTime(positionMs)} / {formatShowTime(durationMs)}
      </output>
      <Button
        size="xs"
        variant="ghost"
        aria-label="Split at playhead"
        title={canSplit ? 'Split scene at playhead' : 'Place the playhead inside a scene to split'}
        disabled={!canSplit}
        className="border border-zinc-800 bg-zinc-900/60 text-[10px] text-zinc-400 hover:border-amber-400/40 hover:bg-amber-400/10 hover:text-amber-200"
        onClick={() => {
          if (usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
          void splitAtTime(show.id, positionMs)
        }}
      >
        <Scissors size={12} aria-hidden />
        Split
      </Button>
      {seekStatus === 'rebuilding' && (
        <span className="whitespace-nowrap text-[9px] uppercase tracking-wider text-amber-300">
          rebuilding
        </span>
      )}
    </div>
  )
}

function requestShowSeek(showId: string, targetMs: number): void {
  if (usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
  const transport = useShowTransportStore.getState()
  transport.setPosition(showId, targetMs)
  transport.requestSeek(showId, targetMs)
}

function formatShowTime(timeMs: number): string {
  const safeMs = Math.max(0, Math.round(Number.isFinite(timeMs) ? timeMs : 0))
  const minutes = Math.floor(safeMs / 60_000)
  const seconds = Math.floor((safeMs % 60_000) / 1000)
  const milliseconds = safeMs % 1000
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
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
      {exporting ? 'Preparing' : error ? 'Export failed' : 'Export .epe'}
    </Button>
  )
}

function SceneStrip({
  show,
  patternControlsByCellId,
  selection,
  onSelect,
  onAddScene,
  onAddZone,
  onRequestRemoveScene,
  onUpdateScene,
}: {
  show: ShowRecord
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  selection: ShowSelection
  onSelect: (selection: ShowSelection) => void
  onAddScene: () => void
  onAddZone: () => void
  onRequestRemoveScene: (scene: ShowScene) => void
  onUpdateScene: (sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  const strip = projectShowStrip(show)
  const timeline = projectShowTimeline(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const fittedViewport = fitShowTimelineViewport(timeline.durationMs)
  const [storedViewport, setViewport] = useState<ShowTimelineViewport>(fittedViewport)
  let viewport = storedViewport
  if (viewport.totalMs !== fittedViewport.totalMs) {
    const zoom = viewport.totalMs / viewport.durationMs
    const transport = useShowTransportStore.getState()
    const anchorMs = transport.showId === show.id ? transport.positionMs : 0
    viewport = zoomShowTimelineViewport(fittedViewport, zoom, Math.min(anchorMs, fittedViewport.totalMs))
    setViewport(viewport)
  }
  const scrollRef = useRef<HTMLDivElement>(null)
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
  const routingLaneRows = movingSplitLayout ? 1 : 0
  const rowStride = 3 + controlLanes.length
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
    '28px',
    '34px',
    ...(movingSplitLayout ? ['26px'] : []),
    ...strip.rows.flatMap(() => ['64px', '26px', '26px', ...controlLanes.map(() => '26px')]),
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
  const zoomAroundPlayhead = (factor: number) => setViewport((current) => {
    const visibleEnd = current.startMs + current.durationMs
    const anchor = positionMs >= current.startMs && positionMs <= visibleEnd
      ? positionMs
      : current.startMs + current.durationMs / 2
    return zoomShowTimelineViewport(current, factor, anchor)
  })
  return (
    <div
      className="border-b border-seam bg-[#060608] p-4 shadow-[inset_0_6px_14px_-8px_rgba(0,0,0,0.9),inset_0_-6px_14px_-10px_rgba(0,0,0,0.9)]"
      onClick={() => onSelect({ kind: 'show' })}
    >
      <div className="mb-2 flex items-center justify-end gap-1" role="group" aria-label="Timeline zoom controls">
        <Button size="icon-xs" variant="ghost" aria-label="Zoom timeline out" onClick={(event) => { event.stopPropagation(); zoomAroundPlayhead(0.8) }}>
          <ZoomOut size={12} aria-hidden />
        </Button>
        <Button size="xs" variant="ghost" aria-label="Fit timeline to Show" onClick={(event) => { event.stopPropagation(); setViewport(fitShowTimelineViewport(timeline.durationMs)) }}>
          <Maximize2 size={12} aria-hidden /> Fit
        </Button>
        <Button size="icon-xs" variant="ghost" aria-label="Zoom timeline in" onClick={(event) => { event.stopPropagation(); zoomAroundPlayhead(1.25) }}>
          <ZoomIn size={12} aria-hidden />
        </Button>
        <span className="ml-1 text-[9px] text-zinc-600" title="Ctrl/⌘ + wheel zooms around the playhead">Ctrl/⌘ + wheel</span>
      </div>
      <div
        ref={scrollRef}
        className="overflow-x-auto"
        onScroll={(event) => {
          const element = event.currentTarget
          const maxScroll = Math.max(0, element.scrollWidth - element.clientWidth)
          const maxStart = viewport.totalMs - viewport.durationMs
          if (maxScroll > 0 && maxStart > 0) {
            setViewport((current) => panShowTimelineViewport(current, element.scrollLeft / maxScroll * maxStart))
          }
        }}
        onWheel={(event) => {
          if (!event.ctrlKey && !event.metaKey) return
          event.preventDefault()
          zoomAroundPlayhead(event.deltaY < 0 ? 1.25 : 0.8)
        }}
      >
        <div
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
            onSelect={() => onSelect({ kind: 'scene', sceneId: scene.id })}
            onRemove={() => onRequestRemoveScene(scene)}
            onUpdate={(changes) => onUpdateScene(scene.id, changes)}
          />
        )).flatMap((node, index) => index < show.scenes.length - 1
          ? [node, <div key={`boundary-header-${show.scenes[index].id}`} className="border-b border-zinc-900" />]
          : [node])}
        <div
          className="sticky left-0 z-30 flex items-center border-b border-zinc-900 bg-[#060608] px-1 text-[9px] uppercase tracking-[0.12em] text-zinc-600"
          style={{ gridColumn: 1, gridRow: 2 }}
        >
          Show time
        </div>
        <TimelineRuler show={show} gridColumn={`2 / ${columns.length}`} />
        <TimelinePlayhead show={show} gridColumn={`2 / ${columns.length}`} rowSpan={strip.rows.length * rowStride + routingLaneRows + 3} />
        <div role="group" aria-label="Transition lane" className="contents">
          <div
            className="sticky left-0 z-30 flex items-center gap-2 border-b border-zinc-900 bg-[#060608] px-1 text-[9.5px] uppercase tracking-[0.12em] text-structural"
            style={{ gridColumn: 1, gridRow: 3 }}
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
                style={{ gridColumn: 3 + index * 2, gridRow: 3 }}
              >
                {transitions.map((transition) => (
                  <BoundaryTransitionChip
                    key={transition.id}
                    show={show}
                    transition={transition}
                    selected={selection.kind === 'transition' && selection.transitionId === transition.id}
                    onSelect={() => onSelect({ kind: 'transition', transitionId: transition.id })}
                  />
                ))}
                {!hasRouting && (
                  <button
                    type="button"
                    aria-label={`Set routing layout after ${scene.name}`}
                    title={`Add routing transition after ${scene.name}`}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'routing-switch', afterSceneId: scene.id })
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
                style={{ gridColumn: 1, gridRow: 4 }}
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
                      gridRow: 4,
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
                    className={descriptor ? 'border-t border-zinc-900/80 bg-sky-400/10 font-mono text-[9px] text-sky-200' : 'border-t border-zinc-900/80 font-mono text-[9px] text-zinc-700 hover:text-sky-300'}
                    style={{ gridColumn: 3 + sceneIndex * 2, gridRow: 4 }}
                    onClick={(event) => {
                      event.stopPropagation()
                      onSelect({ kind: 'transition', transitionId: transition.id })
                    }}
                  >
                    {descriptor ? `${Math.round(descriptor.from * 100)}→${Math.round(target * 100)}` : '—'}
                  </button>
                ) : null
              })}
            </div>
          )
        })()}
        {strip.rows.map((row, rowIndex) => (
          <div key={row.zoneId} className="contents">
            <button
              type="button"
              aria-label={`Select zone ${row.zoneName}`}
              onClick={(event) => {
                event.stopPropagation()
                onSelect({ kind: 'zone', zoneId: row.zoneId })
              }}
              className={[
                'sticky left-0 z-30 flex items-center gap-2 rounded-[5px] border-0 bg-[#060608] pr-2 text-left font-mono transition-colors',
                selection.kind === 'zone' && selection.zoneId === row.zoneId
                  ? 'bg-live/10 text-zinc-100'
                  : 'text-zinc-300 hover:text-zinc-100',
              ].join(' ')}
              style={{ gridColumn: 1, gridRow: `${rowIndex * rowStride + 4 + routingLaneRows} / span ${rowStride}` }}
            >
              <span
                aria-hidden
                className="w-1 self-stretch rounded-sm"
                style={{ backgroundColor: row.color ?? '#38bdf8' }}
              />
              <MapIcon size={11} aria-hidden className="shrink-0 text-zinc-600" />
              <span className="truncate text-[12px] font-medium">{row.zoneName}</span>
              <span className="ml-auto text-[10px] text-structural">{row.nominalPixelCount}px</span>
            </button>
            {row.cells.map((cell) => (
              <button
                key={cell.id}
                type="button"
                aria-label={`Select ${cell.patternName}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect({ kind: 'clip', clipId: cell.id })
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
                  gridRow: `${rowIndex * rowStride + 4 + routingLaneRows} / span ${Math.max(1, cell.rowSpan * rowStride - (rowStride - 1))}`,
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
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'empty-slot', zoneId: row.zoneId, sceneId: scene.id })
                  }}
                  className={[
                    'relative z-10 flex min-h-16 items-center justify-center rounded-[5px] border border-dashed text-[10px] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live',
                    selection.kind === 'empty-slot'
                      && selection.zoneId === row.zoneId
                      && selection.sceneId === scene.id
                      ? 'border-live/70 bg-live/10 text-zinc-200'
                      : 'border-zinc-800 bg-zinc-950/20 text-zinc-600 hover:border-zinc-600 hover:text-zinc-300',
                  ].join(' ')}
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + 4 + routingLaneRows }}
                >
                  <span className="flex items-center gap-1"><Plus size={11} aria-hidden /> clip</span>
                </button>
              )
            ))}
            <div
              role="group"
              aria-label={`Time lane for ${row.zoneName}`}
              className="sticky left-0 z-30 flex items-center gap-1 border-t border-zinc-900/80 bg-[#060608] px-2 text-[9px] text-violet-300/80"
              style={{ gridColumn: 1, gridRow: rowIndex * rowStride + 5 + routingLaneRows }}
            >
              <span className="font-mono">↳ time ×</span>
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const cell = cellCoveringScene(show, row.zoneId, sceneIndex)
              return cell ? (
                <div
                  key={`time-${row.zoneId}-${scene.id}`}
                  className="flex items-center border-t border-zinc-900/80 px-2 font-mono text-[9px] text-zinc-500"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + 5 + routingLaneRows }}
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
                  aria-label={`Edit time transition from ${scene.name} for ${row.zoneName}`}
                  className={[
                    'flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] transition-colors',
                    from === undefined ? 'text-zinc-700 hover:text-violet-300' : 'bg-violet-400/10 text-violet-200',
                  ].join(' ')}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: rowIndex * rowStride + 5 + routingLaneRows }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: transition.id })
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
              style={{ gridColumn: 1, gridRow: rowIndex * rowStride + 6 + routingLaneRows }}
            >
              <span className="font-mono">↳ bright</span>
            </div>
            {show.scenes.map((scene, sceneIndex) => {
              const cell = cellCoveringScene(show, row.zoneId, sceneIndex)
              return cell ? (
                <div
                  key={`brightness-${row.zoneId}-${scene.id}`}
                  className="flex items-center border-t border-zinc-900/80 px-2 font-mono text-[9px] text-zinc-500"
                  style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + 6 + routingLaneRows }}
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
                  className={[
                    'flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] transition-colors',
                    from === undefined ? 'text-zinc-700 hover:text-amber-300' : 'bg-amber-400/10 text-amber-200',
                  ].join(' ')}
                  style={{ gridColumn: 3 + sceneIndex * 2, gridRow: rowIndex * rowStride + 6 + routingLaneRows }}
                  onClick={(event) => {
                    event.stopPropagation()
                    onSelect({ kind: 'transition', transitionId: transition.id })
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
                  style={{ gridColumn: 1, gridRow: rowIndex * rowStride + 7 + controlIndex + routingLaneRows }}
                >
                  <span className="truncate font-mono">↳ {control.label}</span>
                </div>
                {show.scenes.map((scene, sceneIndex) => {
                  const cell = cellCoveringScene(show, row.zoneId, sceneIndex)
                  const target = cell?.controlTargets?.[control.exportName]
                  return (
                    <div
                      key={`control-${row.zoneId}-${control.exportName}-${scene.id}`}
                      className="flex items-center border-t border-zinc-900/80 px-2 font-mono text-[9px] text-zinc-500"
                      style={{ gridColumn: 2 + sceneIndex * 2, gridRow: rowIndex * rowStride + 7 + controlIndex + routingLaneRows }}
                    >
                      {target === undefined ? 'unset' : formatControlValue(target)}
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
                      className={[
                        'flex items-center justify-center border-t border-zinc-900/80 font-mono text-[9px] transition-colors',
                        from === undefined ? 'text-zinc-700 hover:text-cyan-300' : 'bg-cyan-400/10 text-cyan-200',
                      ].join(' ')}
                      style={{ gridColumn: 3 + sceneIndex * 2, gridRow: rowIndex * rowStride + 7 + controlIndex + routingLaneRows }}
                      onClick={(event) => {
                        event.stopPropagation()
                        onSelect({ kind: 'transition', transitionId: transition.id })
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
        <button
          type="button"
          aria-label="Add zone"
          onClick={(event) => {
            event.stopPropagation()
            onAddZone()
          }}
          className="sticky left-0 z-30 flex items-center justify-center rounded-[5px] border border-dashed border-zinc-800 bg-[#060608] text-[10px] uppercase tracking-wider text-structural hover:border-zinc-600 hover:text-zinc-200"
          style={{ gridColumn: 1, gridRow: strip.rows.length * rowStride + 4 + routingLaneRows }}
        >
          + zone
        </button>
        <button
          type="button"
          aria-label="Add scene"
          onClick={(event) => {
            event.stopPropagation()
            onAddScene()
          }}
          className="sticky right-0 z-30 flex items-center justify-center rounded-[5px] border border-dashed border-zinc-800 bg-[#060608] text-[10px] uppercase tracking-wider text-structural [writing-mode:vertical-rl] hover:border-zinc-600 hover:text-zinc-200"
          style={{ gridColumn: columns.length, gridRow: `${4 + routingLaneRows} / span ${strip.rows.length * rowStride}` }}
        >
          + scene
        </button>
        </div>
      </div>
      <TimelineNavigator viewport={viewport} onChange={setViewport} />
    </div>
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
    dragRef.current = { mode, x: event.clientX, viewport }
    event.currentTarget.setPointerCapture(event.pointerId)
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

function TimelineRuler({ show, gridColumn }: { show: ShowRecord; gridColumn: string }) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const pendingSeekRef = useRef<{ showId: string; targetMs: number } | null>(null)
  const resumeAfterSeekRef = useRef(false)
  const previewScrub = (targetMs: number) => {
    const preview = usePreviewStore.getState()
    if (!pendingSeekRef.current) resumeAfterSeekRef.current = preview.isRunning
    if (preview.isRunning) preview.toggle()
    useShowTransportStore.getState().setPosition(show.id, targetMs)
    pendingSeekRef.current = { showId: show.id, targetMs }
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
      className="relative overflow-hidden border-b border-zinc-800 bg-zinc-950/70"
      style={{
        gridColumn,
        gridRow: 2,
        backgroundImage: 'repeating-linear-gradient(90deg, rgba(113,113,122,.2) 0 1px, transparent 1px 20px)',
      }}
    >
      {ticks.map((tick) => (
        <span
          key={tick.position}
          aria-hidden
          className="absolute top-1 text-[8.5px] tabular-nums text-zinc-600"
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
        onChange={(event) => previewScrub(Number(event.target.value))}
        onPointerUp={commitScrub}
        onPointerCancel={commitScrub}
        onKeyUp={commitScrub}
        onBlur={commitScrub}
        className="show-playhead-range absolute inset-0 h-full w-full cursor-col-resize opacity-[0.01] focus:opacity-100"
      />
    </div>
  )
}

function TimelinePlayhead({
  show,
  gridColumn,
  rowSpan,
}: {
  show: ShowRecord
  gridColumn: string
  rowSpan: number
}) {
  const durationMs = showLoopDurationMs(show)
  const positionMs = useShowTransportStore((state) => state.showId === show.id ? state.positionMs : 0)
  const seekStatus = useShowTransportStore((state) => state.showId === show.id ? state.seekStatus : 'idle')
  const left = durationMs > 0 ? Math.min(100, Math.max(0, positionMs / durationMs * 100)) : 0
  const thumbCenterOffsetPx = rangeThumbCenterOffsetPx(left, 16)
  return (
    <div
      aria-hidden
      className="pointer-events-none relative z-20"
      style={{ gridColumn, gridRow: `2 / span ${rowSpan}` }}
    >
      <span
        data-testid="show-timeline-playhead"
        className={`absolute inset-y-0 w-px ${seekStatus === 'rebuilding' ? 'bg-amber-300' : 'bg-live'}`}
        style={{ left: `calc(${left}% + ${thumbCenterOffsetPx}px)`, boxShadow: '0 0 8px color-mix(in srgb, var(--color-live) 45%, transparent)' }}
      >
        <span className="absolute -left-[4px] top-0 h-0 w-0 border-x-[4px] border-t-[6px] border-x-transparent border-t-current" />
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
  onSelect,
  onRemove,
  onUpdate,
}: {
  scene: ShowScene
  selected: boolean
  canRemove: boolean
  onSelect: () => void
  onRemove: () => void
  onUpdate: (changes: Partial<Omit<ShowScene, 'id'>>) => void
}) {
  return (
    <div
      role="group"
      aria-label={`Scene ${scene.name}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
      }}
      onFocusCapture={onSelect}
      className={`group relative flex min-w-0 flex-col justify-end gap-0.5 overflow-hidden border-b px-2 pb-1.5 pt-1 ${selected ? 'border-live bg-live/[0.045]' : 'border-zinc-800'}`}
    >
      <div className="flex min-w-0 items-center gap-1.5 pr-6">
        <Clapperboard size={11} aria-hidden className="shrink-0 text-zinc-600" />
        <input
          aria-label={`${scene.name} scene name`}
          title={scene.name}
          data-show-scene-name
          value={scene.name}
          onChange={(event) => onUpdate({ name: event.target.value })}
          className="w-full min-w-0 truncate bg-transparent text-[12px] font-semibold text-zinc-100 outline-none group-hover:underline group-hover:decoration-dotted group-hover:underline-offset-4 focus:underline focus:decoration-live focus:underline-offset-4"
        />
      </div>
      <label className="flex w-fit items-baseline gap-0.5 text-[9.5px] text-structural">
        <input
          aria-label={`${scene.name} duration seconds`}
          type="number"
          min={1}
          value={Math.round(scene.durationMs / 1000)}
          onChange={(event) => onUpdate({ durationMs: Number(event.target.value) * 1000 })}
          className="h-4 w-9 rounded border border-transparent bg-transparent px-0.5 text-right text-[9.5px] text-structural outline-none hover:border-zinc-700 hover:bg-zinc-900 focus:border-live/70 focus:bg-zinc-900"
        />
        s
      </label>
      {canRemove && (
        <button
          type="button"
          aria-label={`Remove scene ${scene.name}`}
          title={`Remove ${scene.name}`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded text-zinc-600 opacity-0 transition-opacity hover:bg-red-950/30 hover:text-red-300 group-hover:opacity-100 focus:opacity-100"
        >
          ×
        </button>
      )}
    </div>
  )
}

function BoundaryTransitionChip({
  show,
  transition,
  selected,
  onSelect,
}: {
  show: ShowRecord
  transition: ReturnType<typeof projectShowStrip>['boundaryTransitions'][number]
  selected: boolean
  onSelect: () => void
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
      title={transition.kind === 'routing'
        ? `Routing to ${transition.layoutName ?? 'layout'} · ${transition.durationMs === 0 ? 'cut' : `${transition.durationMs / 1000}s directional transfer`}`
        : `${transition.kind} · ${transition.durationMs === 0 ? 'marker' : `${transition.durationMs / 1000}s`}`}
      onClick={(event) => {
        event.stopPropagation()
        onSelect()
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
  return (
    <section role="region" aria-label={label} className={`${card} mt-2 flex max-h-[220px] min-h-0 flex-col overflow-hidden`}>
      <header className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-800/90 bg-zinc-950/65 px-2.5">
        <span className="grid size-6 shrink-0 place-items-center rounded border border-zinc-800 bg-zinc-900/80 text-live">{icon}</span>
        <div className="min-w-0">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-zinc-300">{label}</h3>
          <p className="truncate text-[9px] text-zinc-600">{title}</p>
        </div>
        {actions && <div className="ml-auto flex items-center gap-1">{actions}</div>}
      </header>
      <div className="min-h-0 overflow-auto p-2.5">{children}</div>
    </section>
  )
}

function ContextualInspector({
  show,
  selection,
  selectedClip,
  patternOptions,
  patternControlsByCellId,
  controllerProfiles,
  targetProfile,
  userMaps,
  onUpdateTargetProfile,
  onUpdateStageMap,
  onUpdatePattern,
  onPlaceClip,
  onRemoveClip,
  onUpdateScene,
  onDuplicateScene,
  onRequestRemoveScene,
  onUpdateAdaptations,
  onUpdateControlTarget,
  onUpdateRestartOnEntry,
  onExtend,
  onSpanZones,
  onUpdateCellZoneMode,
  onUpdateBoundaryTransition,
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
  patternOptions: Array<{ label: string; ref: ShowCell['pattern'] }>
  patternControlsByCellId: Record<string, AutomatablePatternControl[]>
  controllerProfiles: ControllerProfile[]
  targetProfile?: ControllerProfile
  userMaps: MapRecord[]
  onUpdateTargetProfile: (targetControllerProfileId: string) => void
  onUpdateStageMap: (stageMapId: string | null) => void
  onUpdatePattern: (cell: ShowCell, patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onPlaceClip: (zoneId: string, sceneId: string, patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onRemoveClip: (clip: ShowCell) => void
  onUpdateScene: (scene: ShowScene, changes: Partial<Omit<ShowScene, 'id'>>) => void
  onDuplicateScene: (scene: ShowScene) => void
  onRequestRemoveScene: (scene: ShowScene) => void
  onUpdateAdaptations: (cell: ShowCell, changes: Partial<ShowCell['adaptations']>) => void
  onUpdateControlTarget: (cell: ShowCell, exportName: string, value: number | undefined) => void
  onUpdateRestartOnEntry: (cell: ShowCell, restartOnEntry: boolean) => void
  onExtend: (cell: ShowCell, sceneSpan: number) => void
  onSpanZones: (cell: ShowCell, zoneSpan: number) => void
  onUpdateCellZoneMode: (cell: ShowCell, zoneMode: NonNullable<ShowCell['zoneMode']>) => void
  onUpdateBoundaryTransition: (
    transitionId: string,
    changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
  ) => void
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
        show={show}
        clip={selectedClip}
        patternOptions={patternOptions}
        patternControls={patternControlsByCellId[selectedClip.id] ?? []}
        onUpdatePattern={(patch) => onUpdatePattern(selectedClip, patch)}
        onRemove={() => onRemoveClip(selectedClip)}
        onUpdateAdaptations={(changes) => onUpdateAdaptations(selectedClip, changes)}
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
      onUpdateStageMap={onUpdateStageMap}
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
  patternOptions: Array<{ label: string; ref: ShowCell['pattern'] }>
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
        <select
          aria-label="Pattern for new clip"
          defaultValue=""
          onChange={(event) => {
            const option = patternOptions.find((item) => `${item.ref.kind}:${item.ref.id}` === event.target.value)
            if (option) onPlace({ pattern: option.ref, patternName: option.label })
          }}
          className={`${field} mt-1 w-full`}
        >
          <option value="" disabled>Choose a Pattern...</option>
          {patternOptions.map((option) => (
            <option key={`${option.ref.kind}:${option.ref.id}`} value={`${option.ref.kind}:${option.ref.id}`}>
              {option.label}
            </option>
          ))}
        </select>
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
              min={1}
              step={1}
              value={Math.round(scene.durationMs / 1000)}
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
      </div>
    </InspectorPanel>
  )
}

function ClipInspector({
  show,
  clip,
  patternOptions,
  patternControls,
  onUpdatePattern,
  onRemove,
  onUpdateAdaptations,
  onUpdateControlTarget,
  onUpdateRestartOnEntry,
  onExtend,
  onSpanZones,
  onUpdateZoneMode,
}: {
  show: ShowRecord
  clip: ShowCell
  patternOptions: Array<{ label: string; ref: ShowCell['pattern'] }>
  patternControls: AutomatablePatternControl[]
  onUpdatePattern: (patch: Pick<ShowCell, 'pattern' | 'patternName'>) => void
  onRemove: () => void
  onUpdateAdaptations: (changes: Partial<ShowCell['adaptations']>) => void
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
      <div className="grid items-end gap-2 sm:grid-cols-[minmax(14rem,1fr)_7rem_7rem]">
        <label className="block text-[9px] uppercase tracking-[0.1em] text-zinc-600">
          Source pattern
          <select
            aria-label="Source pattern"
            value={`${cell.pattern.kind}:${cell.pattern.id}`}
            onChange={(event) => {
              const option = patternOptions.find((item) => `${item.ref.kind}:${item.ref.id}` === event.target.value)
              if (option) onUpdatePattern({ pattern: option.ref, patternName: option.label })
            }}
            className={`${field} mt-1 w-full`}
          >
            {patternOptions.map((option) => (
              <option key={`${option.ref.kind}:${option.ref.id}`} value={`${option.ref.kind}:${option.ref.id}`}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <NumberField label="Time x" value={cell.adaptations.timeScale} min={0} max={4} step={0.1} onChange={(timeScale) => onUpdateAdaptations({ timeScale })} />
        <NumberField label="Brightness" value={cell.adaptations.brightness} min={0} max={1} step={0.01} onChange={(brightness) => onUpdateAdaptations({ brightness })} />
      </div>
      {patternControls.length > 0 && (
        <details className="mt-2 rounded border border-cyan-400/15 bg-cyan-400/[0.035]" aria-label="Pattern automation targets">
          <summary className="cursor-pointer px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-cyan-300/80">Add or edit pattern controls</summary>
          <div className="grid gap-2 border-t border-cyan-400/10 p-2 sm:grid-cols-2">
            {patternControls.map((control) => {
              const target = cell.controlTargets?.[control.exportName]
              const enabled = target !== undefined
              return (
                <div key={control.exportName} className="rounded border border-zinc-800 bg-zinc-950/45 p-2">
                  <label className="flex items-center gap-2 text-[10px] text-zinc-300">
                    <input
                      type="checkbox"
                      aria-label={`Set ${control.label} target`}
                      checked={enabled}
                      onChange={(event) => onUpdateControlTarget(control.exportName, event.target.checked ? control.defaultValue : undefined)}
                      className="h-3.5 w-3.5 accent-cyan-400"
                    />
                    {control.label}
                  </label>
                  <div className="mt-1 text-[9px] text-zinc-600">
                    {control.exportName} · 0–1 · Studio default {control.defaultValue}
                  </div>
                  {enabled && (
                    <div className="mt-2">
                      <NumberField
                        label={`${control.label} target`}
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
      <details className="mt-2 rounded border border-zinc-800 bg-zinc-950/35">
        <summary className="cursor-pointer px-2 py-1.5 text-[9px] uppercase tracking-[0.12em] text-zinc-500">Advanced clip controls</summary>
        <div className="border-t border-zinc-800 p-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="flex items-center gap-2 text-zinc-300">
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
            <section className="mt-3 rounded-md border border-sky-400/20 bg-sky-400/[0.04] p-3">
              <label className="flex items-center gap-2 text-zinc-200">
                <input
                  type="checkbox"
                  aria-label="Restart Pattern on entry"
                  checked={Boolean(cell.restartOnEntry)}
                  onChange={(event) => onUpdateRestartOnEntry(event.target.checked)}
                />
                Restart Pattern on entry
              </label>
              <p className="mt-1.5 text-[10px] leading-relaxed text-zinc-500">
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
          <div className="mt-3 border-t border-zinc-800 pt-3">
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
                <div className="mt-2 grid grid-cols-2 gap-2 xl:grid-cols-4">
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
                <p className="mt-2 text-[10px] leading-relaxed text-zinc-500">
                  Closed frames emit black and skip Pattern rendering. Continue advances motion behind darkness; freeze pauses Pattern time while dark.
                </p>
              </>
            )}
          </div>
        </div>
      </details>
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
    <section className="mt-3 rounded-md border border-violet-400/25 bg-violet-400/[0.04] p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-[0.12em] text-violet-300">Motion cadence</div>
          <div className="mt-0.5 text-[10px] text-zinc-500">How often Pattern time is released</div>
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
      </div>
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_10rem] items-end gap-3 border-t border-violet-400/10 pt-3">
        <p className="text-[10px] leading-relaxed text-zinc-500">
          Shift this clip&apos;s private Pattern clock for rounds across zones.
        </p>
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
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
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
          <div className="mt-2 flex gap-1" aria-hidden>
            {Array.from({ length: 12 }, (_, index) => (
              <span key={index} className={index % 3 === 0 ? 'h-2 flex-1 bg-violet-300/70' : 'h-2 flex-1 bg-zinc-800'} />
            ))}
          </div>
          <p className="mt-2 text-[10px] text-zinc-500">
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
  onRemove,
  onUpdateCellAdaptations,
  patternControlsByCellId,
  onUpdateControlTarget,
}: {
  show: ShowRecord
  transitionId: string
  onUpdate: (transitionId: string, changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>) => void
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
            step={1}
            onChange={(seconds) => onUpdate(transition.id, {
              durationMs: seconds * 1000,
              ...(seconds > 0 && !transition.routingDirection ? { routingDirection: 'forward' } : {}),
            })}
          />
          <label className="text-[10px] uppercase text-zinc-600">
            Routing transfer easing
            <select
              aria-label="Routing transfer easing"
              value={transition.easing}
              disabled={transition.durationMs === 0}
              onChange={(event) => onUpdate(transition.id, {
                easing: event.target.value as ShowBoundaryTransition['easing'],
              })}
              className={`${field} mt-1 w-full disabled:opacity-40`}
            >
              <option value="linear">linear</option>
              <option value="ease-in">ease in</option>
              <option value="ease-out">ease out</option>
              <option value="ease-in-out">ease in/out</option>
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
  const portalSettings: ShowPortalSettings = {
    centerX: transition.centerX ?? 0.5,
    centerY: transition.centerY ?? 0.5,
    invert: transition.invert ?? false,
    featherPolicy: transition.featherPolicy === 'blend' ? 'blend' : 'dither',
    shape: transition.shape ?? 'circle',
    scale: transition.scale ?? 1,
    rotation: transition.rotation ?? 0,
    spin: transition.spin ?? 0,
    ringWidth: transition.ringWidth ?? 0.12,
  }
  const updatePortal = (changes: Partial<ShowPortalSettings>, feather = transition.feather ?? 0.12) => {
    onUpdate(transition.id, { kind: 'portal', durationMs: transition.durationMs || 2000, feather, ...changes })
  }
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
      <div className="grid grid-cols-2 gap-2">
        <label className="text-[10px] uppercase text-zinc-600">
          Boundary
          <div className="mt-1 text-zinc-300">{scene?.name} to {nextScene?.name}</div>
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Kind
          <select
            aria-label="Transition kind"
            value={transition.kind}
            onChange={(event) => {
              const kind = event.target.value as Exclude<ShowBoundaryTransition['kind'], 'routing'>
              onUpdate(transition.id, {
                kind,
                durationMs: kind === 'cut' ? 0 : transition.durationMs || 2000,
                ...(kind === 'portal' ? { feather: transition.feather ?? 0.12, ...portalSettings } : {}),
              })
            }}
            className={`${field} mt-1 w-full`}
          >
            <option value="cut">cut</option>
            <option value="crossfade">crossfade</option>
            <option value="wipe">wipe</option>
            <option value="dither">dither</option>
            <option value="portal">portal (2D)</option>
          </select>
        </label>
        <label className="text-[10px] uppercase text-zinc-600">
          Easing
          <select
            aria-label="Transition easing"
            value={transition.easing}
            disabled={transition.kind === 'cut'}
            onChange={(event) => onUpdate(transition.id, {
              easing: event.target.value as ShowBoundaryTransition['easing'],
            })}
            className={`${field} mt-1 w-full disabled:opacity-40`}
          >
            <option value="linear">linear</option>
            <option value="ease-in">ease in</option>
            <option value="ease-out">ease out</option>
            <option value="ease-in-out">ease in/out</option>
          </select>
        </label>
        <NumberField
          label="Duration seconds"
          value={Math.round(transition.durationMs / 1000)}
          min={0}
          max={30}
          step={1}
          onChange={(seconds) => onUpdate(transition.id, { durationMs: seconds * 1000 })}
        />
      </div>
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
          {transition.kind === 'wipe' && (
            <>
              <NumberField
                label="Feather width"
                value={transition.feather ?? 0}
                min={0}
                max={1}
                step={0.05}
                onChange={(feather) => onUpdate(transition.id, { feather })}
              />
              <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] leading-4 text-zinc-500">
                Feather uses a stable spatial threshold across the 1D route edge and still calls one Pattern renderer per pixel.
              </div>
            </>
          )}
          {transition.kind === 'portal' && (
            <>
            <label className="text-[10px] uppercase text-zinc-600">
              Spatial shape
              <select
                aria-label="Spatial shape"
                value={portalSettings.shape}
                onChange={(event) => updatePortal({
                  shape: event.target.value === 'diamond' ? 'diamond' : event.target.value === 'ring' ? 'ring' : 'circle',
                })}
                className={`${field} mt-1 w-full`}
              >
                <option value="circle">circle / portal</option>
                <option value="diamond">diamond iris</option>
                <option value="ring">ring / shockwave</option>
              </select>
            </label>
            <NumberField
              label="Spatial scale"
              value={portalSettings.scale ?? 1}
              min={0.25}
              max={2}
              step={0.05}
              onChange={(scale) => updatePortal({ scale })}
            />
            <NumberField
              label="Center X"
              value={portalSettings.centerX}
              min={0}
              max={1}
              step={0.05}
              onChange={(centerX) => updatePortal({ centerX })}
            />
            <NumberField
              label="Center Y"
              value={portalSettings.centerY}
              min={0}
              max={1}
              step={0.05}
              onChange={(centerY) => updatePortal({ centerY })}
            />
            {portalSettings.shape === 'diamond' && (
              <>
                <NumberField
                  label="Rotation turns"
                  value={portalSettings.rotation ?? 0}
                  min={-1}
                  max={1}
                  step={0.025}
                  onChange={(rotation) => updatePortal({ rotation })}
                />
                <NumberField
                  label="Spin turns"
                  value={portalSettings.spin ?? 0}
                  min={-4}
                  max={4}
                  step={0.25}
                  onChange={(spin) => updatePortal({ spin })}
                />
              </>
            )}
            {portalSettings.shape === 'ring' && (
              <NumberField
                label="Ring width"
                value={portalSettings.ringWidth ?? 0.12}
                min={0.02}
                max={1}
                step={0.02}
                onChange={(ringWidth) => updatePortal({ ringWidth })}
              />
            )}
            <NumberField
              label="Feather width"
              value={transition.feather ?? 0.12}
              min={0}
              max={1}
              step={0.02}
              onChange={(feather) => updatePortal({}, feather)}
            />
            <label className="text-[10px] uppercase text-zinc-600">
              Feather behavior
              <select
                aria-label="Feather behavior"
                value={portalSettings.featherPolicy}
                onChange={(event) => updatePortal({ featherPolicy: event.target.value === 'blend' ? 'blend' : 'dither' })}
                className={`${field} mt-1 w-full`}
              >
                <option value="dither">stable dither</option>
                <option value="blend">true blend</option>
              </select>
            </label>
            <label className="flex min-h-8 items-center gap-2 self-end text-[10px] uppercase text-zinc-500">
              <input
                type="checkbox"
                aria-label="Outside in"
                checked={portalSettings.invert}
                onChange={(event) => updatePortal({ invert: event.target.checked })}
                className="h-3.5 w-3.5 accent-sky-400"
              />
              Outside in
            </label>
            <div className="border-l-2 border-sky-500/50 pl-2 text-[10px] leading-4 text-zinc-500">
              {portalSettings.featherPolicy === 'blend'
                ? `Two Pattern renderers run only inside the ${portalSettings.shape} feather band.`
                : `A stable ${portalSettings.shape} threshold keeps this transition to one Pattern renderer per pixel.`}
            </div>
            </>
          )}
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
              value={descriptor.easing ?? transition.easing}
              onChange={(event) => updateDescriptor({ easing: event.target.value as ShowBoundaryTransition['easing'] })}
              className={`${field} mt-1 w-full`}
            >
              <option value="linear">linear</option>
              <option value="ease-in">ease in</option>
              <option value="ease-out">ease out</option>
              <option value="ease-in-out">ease in/out</option>
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
  const title = isTime ? 'Time scale' : 'Brightness'
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
              value={descriptor.easing ?? transition.easing}
              onChange={(event) => updateDescriptor({ easing: event.target.value as ShowBoundaryTransition['easing'] })}
              className={`${field} mt-1 w-full`}
            >
              <option value="linear">linear</option>
              <option value="ease-in">ease in</option>
              <option value="ease-out">ease out</option>
              <option value="ease-in-out">ease in/out</option>
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
                  aria-label={`Animate ${isTime ? 'time' : 'brightness'} for ${zone.name}`}
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
              value={descriptor.easing ?? transition.easing}
              onChange={(event) => updateDescriptor({ easing: event.target.value as ShowBoundaryTransition['easing'] })}
              className={`${field} mt-1 w-full`}
            >
              <option value="linear">linear</option>
              <option value="ease-in">ease in</option>
              <option value="ease-out">ease out</option>
              <option value="ease-in-out">ease in/out</option>
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

function ShowSetupInspector({
  show,
  controllerProfiles,
  targetProfile,
  userMaps,
  onUpdateTargetProfile,
  onUpdateStageMap,
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
  onUpdateStageMap: (stageMapId: string | null) => void
  onAddZone: () => void
  onAddRoutingLayout: (sourceLayoutId?: string) => void
  onUpdateRoutingLayout: (layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => void
  onRemoveRoutingLayout: (layoutId: string) => void
}) {
  const zonePixels = show.zones.reduce((sum, zone) => sum + zone.nominalPixelCount, 0)
  return (
    <InspectorPanel family="Show" title={show.name} icon={<Settings2 size={13} aria-hidden />}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
        <label className="text-[10px] uppercase text-zinc-600">
          Stage map
          <select
            aria-label="Stage map"
            value={show.stageMapId ?? ''}
            onChange={(event) => onUpdateStageMap(event.target.value || null)}
            className={`${field} mt-1 w-full`}
          >
            <option value="">none</option>
            <optgroup label="Stock maps">
              {STOCK_MAPS.map((map) => (
                <option key={map.id} value={map.id}>{map.name} ({map.dim}D)</option>
              ))}
            </optgroup>
            {userMaps.length > 0 && (
              <optgroup label="Your maps">
                {userMaps.map((map) => (
                  <option key={map.id} value={map.id}>{map.name} ({map.dim}D)</option>
                ))}
              </optgroup>
            )}
          </select>
        </label>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Loop
          <div className="mt-1 text-xs text-zinc-300">{formatDuration(showLoopDurationMs(show))}</div>
        </div>
        <div className="rounded border border-zinc-800 bg-zinc-950/55 p-2 text-[10px] uppercase text-zinc-600">
          Zones
          <div className="mt-1 text-xs text-zinc-300">
            {show.zones.length} zone{show.zones.length === 1 ? '' : 's'} - {zonePixels} px
          </div>
        </div>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
        <span>Using {targetProfile?.name ?? 'nominal zones'} for compile estimates.</span>
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
                  value={layout.logical?.kind === 'split' ? `split-${layout.logical.axis}` : 'physical'}
                  disabled={show.zones.length < 2}
                  onChange={(event) => {
                    const value = event.target.value
                    onUpdateRoutingLayout(layout.id, {
                      logical: value === 'split-x' || value === 'split-y'
                        ? {
                            kind: 'split',
                            zoneIds: [show.zones[0].id, show.zones[1].id],
                            axis: value === 'split-y' ? 'y' : 'x',
                          }
                        : undefined,
                    })
                  }}
                  className={`${field} mt-1 w-full max-w-xs`}
                >
                  <option value="physical">physical pixel ranges</option>
                  <option value="split-x">moving split X</option>
                  <option value="split-y">moving split Y</option>
                </select>
              </label>
              {layout.logical?.kind === 'split' ? (
                <p className="mt-2 rounded border border-sky-900/40 bg-sky-950/10 px-2 py-1.5 text-[10px] leading-4 text-zinc-500">
                  {show.zones.find((zone) => zone.id === layout.logical?.zoneIds[0])?.name ?? 'First zone'} and{' '}
                  {show.zones.find((zone) => zone.id === layout.logical?.zoneIds[1])?.name ?? 'second zone'} share a normalized Stage axis. Scene targets move the split continuously.
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
  onUpdateZone,
  onRemoveZone,
}: {
  show: ShowRecord
  zone: ShowRecord['zones'][number]
  targetName?: string
  targetZones: ControllerZone[]
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
        <input
          aria-label={`Nominal pixels ${zone.name}`}
          type="number"
          min={1}
          value={zone.nominalPixelCount}
          onChange={(event) => onUpdateZone({ nominalPixelCount: Number(event.target.value) })}
          className={field}
        />
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
          <ZoneBindingStatus zone={zone} targetZones={targetZones} />
        </div>
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
  onViewGenerated,
  pushResult,
}: {
  compiled: CompiledShowState
  targetPixels: number
  onViewGenerated: () => void
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
        <span className="block h-full bg-live" style={{ width: `${Math.min(100, ratio * 100)}%` }} />
      </span>
      <b className="text-zinc-300">{summary ? formatBytes(summary.artifactBytes) : '-'} / ~{summary ? formatBytes(summary.measuredDeviceBudgetBytes) : '-'}</b>
      <span>-</span>
      <b className="text-zinc-300">est. {estimate} fps @ {targetPixels} px</b>
      <span>-</span>
      <span>steady state <span className="text-emerald-300"><Check size={12} className="inline" aria-hidden /> 1 renderer/px</span></span>
      <span className={summary?.transitionCost === 'renderer-window' || summary?.transitionCost === 'bounded-renderer-window' ? 'text-amber-300' : 'text-emerald-300'}>
        worst instant: {worstInstant}
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
      <span className="flex-1" />
      <button type="button" className="text-zinc-400 hover:text-zinc-200" onClick={onViewGenerated}>
        View generated pattern
      </button>
    </div>
  )
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}) {
  return (
    <label className="text-[10px] uppercase text-zinc-600">
      {label}
      <input
        aria-label={label}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className={`${field} mt-1 w-full`}
      />
    </label>
  )
}

function adaptationSummary(cell: ShowCell): string {
  const parts = []
  if (cell.adaptations.mirror) parts.push('mirror')
  if (cell.adaptations.phase !== 0) parts.push(`phase ${cell.adaptations.phase.toFixed(2)}`)
  if (cell.adaptations.brightness !== 1) parts.push(`dim ${cell.adaptations.brightness.toFixed(2)}`)
  if (cell.adaptations.timeScale !== 1) parts.push(`time x${cell.adaptations.timeScale.toFixed(1)}`)
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
