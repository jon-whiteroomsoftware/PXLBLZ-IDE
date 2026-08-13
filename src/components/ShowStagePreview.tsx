import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, LoaderCircle, Map as MapIcon, Pause, Play } from 'lucide-react'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useMapStore, defaultPixelCountForDim, resolveMap, STOCK_MAPS } from '@/store/mapStore'
import { usePreviewStore } from '@/store/previewStore'
import { useCameraStore } from '@/store/cameraStore'
import { compileShowForPreview, resolveShowCompilationControllerZones } from '@/engine/showPreviewArtifact'
import {
  createFastReplayRuntime,
  type FastReplayResult,
  type FastReplayRuntime,
} from '@/engine/fastReplay'
import {
  createFastReplayCheckpointKey,
  FastReplayCheckpointStore,
  prewarmFastReplayCheckpoints,
  reconstructFastReplayWithCheckpoints,
} from '@/engine/fastReplayCheckpoints'
import { createRenderer } from '@/engine/renderer'
import { applyNormalizeMode, type MapPoint, type PixelMap } from '@/engine/maps'
import { advanceAutoOrbit } from '@/engine/camera'
import {
  applyShowStageMaskPacked,
  buildShowStageProjection,
  createShowStageMaskPlan,
  buildShowLogicalStageProjection,
  showLogicalAspectAdvisory,
  buildShowStripsLayout,
  type ShowStageProjection,
} from '@/engine/zonePreview'
import { OrbitControls } from '@/components/OrbitControls'
import { canAdvanceShowPlayback, resolveShowPlaybackStep, useShowTransportStore } from '@/store/showTransportStore'
import { showLoopDurationMs } from '@/engine/showModel'
import { useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import {
  installationPhysicalZones,
  validateInstallationCoverage,
} from '@/engine/showInstallationCoverage'
import type { ShowClipTransform, ShowRecord } from '@/engine/personalContentRecords'
import { PreviewViewportSection } from '@/components/PreviewDeck'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { buildShowStageClipDiagnosticPoints, buildShowStageDiagnosticRects } from '@/engine/showStageDiagnostics'
import { materializeShowGroupOccurrences } from '@/engine/showGroupModel'
import {
  createShowStagePerformanceProbe,
  type ShowStagePerformanceProbe,
} from '@/dev/showStagePerformance'

declare global {
  interface Window {
    __pxlblzShowStagePerformance?: ShowStagePerformanceProbe
  }
}

interface StageMapOption {
  id: string
  name: string
  dim: 2 | 3
  group: 'stock' | 'user'
  bakedCount?: number
}

interface StageLayout {
  kind: 'strips' | 'map'
  mapPoints: MapPoint[]
  sampleDimension?: 2 | 3
  draw:
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][] }
  projection: ShowStageProjection
  label: string
  note: string | null
}

const SHOW_REPLAY_STEP_MS = 1000 / 60
const SHOW_REPLAY_CHUNK_MS = 250
const SHOW_REPLAY_PREWARM_SETTLE_MS = 400
const SHOW_TEMPORAL_FEEDBACK_SEEK = 'clear-at-target' as const

function yieldForShowReplayPrewarm(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window.requestIdleCallback === 'function') {
      window.requestIdleCallback(() => resolve(), { timeout: 100 })
      return
    }
    window.setTimeout(resolve, 16)
  })
}

function cube3DCanvasPx(containerWidth: number): number {
  return Math.max(220, Math.floor(containerWidth))
}

function stableShowSeed(showId: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < showId.length; index += 1) {
    hash = Math.imul((hash ^ showId.charCodeAt(index)) >>> 0, 0x01000193)
  }
  return hash >>> 0
}

function focusedClipTransform(
  show: ShowRecord,
  focus: { sceneId: string; zoneId: string; placementId: string | null } | null,
): ShowClipTransform | undefined {
  if (!focus?.placementId) return undefined
  const cell = show.cells.find((candidate) => candidate.id === focus.placementId)
  if (cell) return cell.transform

  const composition = show.composition ? materializeShowGroupOccurrences(show.composition) : null
  const zone = composition?.scenes
    .find((scene) => scene.sceneId === focus.sceneId)?.zones
    .find((candidate) => candidate.zoneId === focus.zoneId)
  return zone?.main.find((placement) => placement.id === focus.placementId)?.transform
    ?? zone?.overlays.flatMap((layer) => layer.placements)
      .find((placement) => placement.id === focus.placementId)?.transform
}

function diagnosticPointList(points: [number, number][]): string {
  return points.map(([x, y]) => `${x.toFixed(4)},${y.toFixed(4)}`).join(' ')
}

export function ShowStagePreview({
  showId,
  showOverride,
}: {
  showId: string
  showOverride?: ShowRecord
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const replayRef = useRef<FastReplayRuntime | null>(null)
  const replayKeyRef = useRef<string | null>(null)
  const checkpointStoreRef = useRef<FastReplayCheckpointStore<string> | null>(null)
  if (checkpointStoreRef.current === null) {
    checkpointStoreRef.current = new FastReplayCheckpointStore<string>()
  }
  const playbackRafRef = useRef<number | null>(null)
  const playbackLastRef = useRef<number | null>(null)
  const fpsWindowStartRef = useRef<number | null>(null)
  const fpsFramesRef = useRef(0)
  const runtimeGenerationRef = useRef(0)
  const prewarmGenerationRef = useRef(0)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const performanceProbeRef = useRef<ShowStagePerformanceProbe | null>(null)
  const performanceOutputRef = useRef<HTMLOutputElement>(null)
  const performancePublishFrameRef = useRef(0)
  const liveSimulatedFramesRef = useRef(0)
  const savedShow = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const previewShow = useShowPreviewOverrideStore((state) => state.show?.id === showId ? state.show : null)
  const resolvedShow = previewShow ?? showOverride ?? savedShow
  const deferredShow = useDeferredValue(resolvedShow)
  const show = resolveShowStagePreviewInput(showId, resolvedShow, deferredShow)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const isRunning = usePreviewStore((state) => state.isRunning)
  const togglePlayback = usePreviewStore((state) => state.toggle)
  const brightness = usePreviewStore((state) => state.brightness)
  const lightSize = usePreviewStore((state) => state.lightSize)
  const diffusion = usePreviewStore((state) => state.diffusion)
  const fidelity = usePreviewStore((state) => state.fidelity)
  const diagnostics = useShowEditorSessionStore((state) => state.diagnostics)
  const setDiagnostic = useShowEditorSessionStore((state) => state.setDiagnostic)
  const diagnosticFocus = useShowEditorSessionStore((state) => state.diagnosticFocus?.showId === showId
    ? state.diagnosticFocus
    : null)
  const seekRequest = useShowTransportStore((state) => state.showId === showId ? state.seekRequest : null)
  const seekStatus = useShowTransportStore((state) => state.showId === showId ? state.seekStatus : 'idle')
  const [viewportWidth, setViewportWidth] = useState(1)
  const viewportWidthRef = useRef(viewportWidth)
  const lightSizeRef = useRef(lightSize)
  const diffusionRef = useRef(diffusion)
  const [soloZoneId, setSoloZoneId] = useState<string | null>(null)
  const effectiveSoloZoneIdRef = useRef<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [badgedSeekRequestId, setBadgedSeekRequestId] = useState<number | null>(null)
  const [runtimeRevision, setRuntimeRevision] = useState(0)

  useEffect(() => {
    viewportWidthRef.current = viewportWidth
    lightSizeRef.current = lightSize
    diffusionRef.current = diffusion
  }, [diffusion, lightSize, viewportWidth])

  useEffect(() => {
    const preview = usePreviewStore.getState()
    preview.setLightSize(preview.lightSizeSticky)
    preview.setDiffusion(preview.diffusionSticky)
  }, [showId])

  const targetProfile = show?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === show.targetControllerProfileId)
    : controllerProfiles[0]
  const installationCoverage = show ? validateInstallationCoverage(show) : null
  const savedPhysicalZones = useMemo(
    () => show ? installationPhysicalZones(show) : undefined,
    [show],
  )

  const stageMaps = useMemo((): StageMapOption[] => [
    ...STOCK_MAPS
      .filter((map): map is PixelMap & { dim: 2 | 3 } => map.dim === 2 || map.dim === 3)
      .map((map) => ({ id: map.id, name: map.name, dim: map.dim, group: 'stock' as const })),
    ...userMaps
      .filter((map) => (map.dim === 2 || map.dim === 3) && (map.generator !== 'custom' || (map.points?.length ?? 0) > 0))
      .map((map) => ({
        id: map.id,
        name: map.name,
        dim: map.dim as 2 | 3,
        group: 'user' as const,
        bakedCount: map.points?.length,
      })),
  ], [userMaps])

  const selectedStageMap = stageMaps.find((map) => map.id === show?.stageMapId)
  const danglingStageMap = Boolean(show?.stageMapId && !selectedStageMap)
  const stageIdentityRole = show?.outputContract?.kind === 'installation'
    ? 'Output map'
    : show?.outputContract?.kind === 'portable-2d'
      ? 'Reference map'
      : selectedStageMap
        ? 'Stage map'
        : 'Preview layout'

  const compilationControllerZones = useMemo(
    () => show
      ? resolveShowCompilationControllerZones(show, Boolean(selectedStageMap), targetProfile?.zones)
      : undefined,
    [selectedStageMap, show, targetProfile?.zones],
  )
  const compiled = useMemo(
    () =>
      show
        ? compileShowForPreview(show, userPatterns, compilationControllerZones, {}, {
            stageDimension: selectedStageMap?.dim,
          })
        : { artifact: null, error: null },
    [compilationControllerZones, selectedStageMap?.dim, show, userPatterns],
  )

  const layout = useMemo((): StageLayout | null => {
    if (!show) return null
    if (!selectedStageMap) {
      const strips = buildShowStripsLayout(show.zones, { controllerZones: targetProfile?.zones })
      return {
        kind: 'strips',
        mapPoints: strips.mapPoints,
        draw: { kind: '2d', positions: strips.positions },
        projection: strips.projection,
        label: 'Zone strips - generic',
        note: danglingStageMap ? 'The saved stage map is gone, so this show is previewing as generic strips.' : null,
      }
    }

    const map = resolveMap(selectedStageMap.id, userMaps)
    const zoneTotal = show.zones.reduce((sum, zone) => sum + Math.max(0, Math.floor(zone.nominalPixelCount)), 0)
    const preferredPixelCount =
      (show.outputContract?.kind === 'installation' ? show.outputContract.pixelCount : undefined) ??
      (show.outputContract?.kind === 'portable-2d' ? show.outputContract.referencePixelCount : undefined) ??
      map.bakedCount ??
      selectedStageMap.bakedCount ??
      targetProfile?.lastKnownPixelCount ??
      (zoneTotal > 0 ? zoneTotal : undefined) ??
      defaultPixelCountForDim(map.dim)
    const pixelCount = Math.max(1, preferredPixelCount)
    const resolved = applyNormalizeMode(map.resolve(pixelCount), 'contain')
    const mapPoints = resolved.map((point) => {
      const raw = point.pos ?? point.sample
      const pos = map.dim === 3
        ? [raw[0] ?? 0.5, raw[1] ?? 0.5, raw[2] ?? 0.5] as [number, number, number]
        : [raw[0] ?? 0.5, raw[1] ?? 0.5] as [number, number]
      return { sample: [...pos], pos }
    })
    const logical = show.outputContract?.kind === 'portable-2d'
      ? show.routingLayouts[0]?.logical
      : undefined
    const projection = logical
      ? buildShowLogicalStageProjection(show.zones, mapPoints, logical, {
          splitPosition: show.scenes[0]?.routingTargets?.splitPosition ?? 0.5,
        })
      : buildShowStageProjection(show.zones, mapPoints.length, {
          controllerZones: savedPhysicalZones ?? targetProfile?.zones,
        })

    if (map.dim === 3) {
      return {
        kind: 'map',
        mapPoints,
        sampleDimension: 3,
        draw: {
          kind: '3d',
          positions: mapPoints.map((point) => point.pos as [number, number, number]),
        },
        projection,
        label: map.name,
        note: logical ? showLogicalAspectAdvisory(mapPoints, logical) : null,
      }
    }

    return {
      kind: 'map',
      mapPoints,
      sampleDimension: 2,
      draw: {
        kind: '2d',
        positions: mapPoints.map((point) => point.pos as [number, number]),
      },
      projection,
      label: map.name,
      note: logical ? showLogicalAspectAdvisory(mapPoints, logical) : null,
    }
  }, [danglingStageMap, savedPhysicalZones, selectedStageMap, show, targetProfile?.lastKnownPixelCount, targetProfile?.zones, userMaps])
  const effectiveSoloZoneId =
    layout?.projection.zones.some((zone) => zone.id === soloZoneId) ? soloZoneId : null
  const diagnosticRects = useMemo(() => layout?.draw.kind === '2d'
    ? buildShowStageDiagnosticRects(layout.draw.positions, layout.projection)
    : [], [layout])
  const focusedDiagnosticRect = diagnosticFocus
    ? diagnosticRects.find((rect) => rect.zoneId === diagnosticFocus.zoneId)
    : undefined
  const focusedDiagnosticPoints = show && focusedDiagnosticRect
    ? buildShowStageClipDiagnosticPoints(
        focusedDiagnosticRect,
        focusedClipTransform(show, diagnosticFocus),
      )
    : null
  const durationMs = show ? showLoopDurationMs(show) : 0
  const stageMaskPlan = useMemo(
    () => layout ? createShowStageMaskPlan(layout.projection, layout.mapPoints.length) : null,
    [layout],
  )
  const replayRandomSeed = useMemo(() => stableShowSeed(showId), [showId])
  const replayCheckpointKey = useMemo(() => (
    compiled.artifact && layout
      ? createFastReplayCheckpointKey({
          artifactIdentity: compiled.artifact,
          mapPointsIdentity: layout.mapPoints,
          randomSeed: replayRandomSeed,
          fidelity,
          stepMs: SHOW_REPLAY_STEP_MS,
          temporalFeedbackSeek: SHOW_TEMPORAL_FEEDBACK_SEEK,
        })
      : null
  ), [compiled.artifact, fidelity, layout, replayRandomSeed])

  useEffect(() => {
    if (
      isRunning
      || seekStatus !== 'idle'
      || seekRequest
      || !compiled.artifact
      || !layout
      || !replayCheckpointKey
      || durationMs <= 0
    ) return

    const artifact = compiled.artifact
    const generation = ++prewarmGenerationRef.current
    let disposed = false
    let started = false
    let settled = false
    let cancellationRecorded = false
    let probe: ShowStagePerformanceProbe | null = null
    const isCurrent = () => (
      !disposed
      && prewarmGenerationRef.current === generation
      && !usePreviewStore.getState().isRunning
      && useShowTransportStore.getState().seekStatus === 'idle'
      && useShowTransportStore.getState().seekRequest === null
    )
    const timer = window.setTimeout(() => {
      void yieldForShowReplayPrewarm().then(() => {
        if (
          !isCurrent()
          || !replayRef.current
          || replayKeyRef.current !== replayCheckpointKey
        ) return
        started = true
        probe = performanceProbeRef.current
        probe?.recordCheckpointPrewarmStart()
        void prewarmFastReplayCheckpoints({
          key: replayCheckpointKey,
          store: checkpointStoreRef.current!,
          createRuntime: () => createFastReplayRuntime({
            code: artifact.code,
            fxCode: artifact.fxCode,
            metadata: artifact.metadata,
            dimension: layout.sampleDimension ?? (artifact.metadata.renderFns?.hasRender2D ? 2 : 1),
          }, {
            mapPoints: layout.mapPoints,
            randomSeed: replayRandomSeed,
            fidelity,
          }),
          durationMs,
          advance: {
            stepMs: SHOW_REPLAY_STEP_MS,
            chunkMs: SHOW_REPLAY_CHUNK_MS,
            temporalFeedbackSeek: SHOW_TEMPORAL_FEEDBACK_SEEK,
          },
          isCurrent,
          yieldControl: yieldForShowReplayPrewarm,
        }).then((result) => {
          if (!result || !isCurrent()) {
            if (!cancellationRecorded) {
              cancellationRecorded = true
              probe?.recordCheckpointPrewarmCancellation()
            }
            return
          }
          settled = true
          probe?.recordCheckpointPrewarmComplete()
        }).catch(() => {
          if (cancellationRecorded) return
          settled = true
          probe?.recordCheckpointPrewarmFailure()
        })
      })
    }, SHOW_REPLAY_PREWARM_SETTLE_MS)

    return () => {
      disposed = true
      prewarmGenerationRef.current += 1
      window.clearTimeout(timer)
      if (started && !settled && !cancellationRecorded) {
        cancellationRecorded = true
        probe?.recordCheckpointPrewarmCancellation()
      }
    }
  }, [
    compiled.artifact,
    durationMs,
    fidelity,
    isRunning,
    layout,
    replayCheckpointKey,
    replayRandomSeed,
    runtimeRevision,
    seekRequest,
    seekStatus,
  ])

  useEffect(() => {
    if (!import.meta.env.DEV || !layout) return
    const probe = createShowStagePerformanceProbe(layout.mapPoints.length)
    performanceProbeRef.current = probe
    performancePublishFrameRef.current = 0
    window.__pxlblzShowStagePerformance = probe
    return () => {
      if (window.__pxlblzShowStagePerformance === probe) delete window.__pxlblzShowStagePerformance
      performanceProbeRef.current = null
    }
  }, [layout])

  useEffect(() => {
    if (seekStatus !== 'rebuilding' || !seekRequest) return
    const requestId = seekRequest.id
    const timer = window.setTimeout(() => setBadgedSeekRequestId(requestId), 150)
    return () => window.clearTimeout(timer)
  }, [seekRequest, seekStatus])

  const paintFastFrame = useCallback((result: FastReplayResult) => {
    const renderer = rendererRef.current
    if (!renderer || !layout || !stageMaskPlan) return
    if (layout.draw.kind === '3d') {
      const view = useCameraStore.getState()
      renderer.setCamera(view.camera)
      renderer.setZoom(view.zoom)
    }
    const maskStarted = performance.now()
    const maskedFrame = applyShowStageMaskPacked(result.frame, stageMaskPlan, effectiveSoloZoneIdRef.current)
    const maskEnded = performance.now()
    renderer.paint(
      maskedFrame,
      usePreviewStore.getState().brightness,
      false,
    )
    const paintEnded = performance.now()
    return {
      stageMaskMs: maskEnded - maskStarted,
      webglPaintMs: paintEnded - maskEnded,
    }
  }, [layout, stageMaskPlan])

  useEffect(() => {
    effectiveSoloZoneIdRef.current = effectiveSoloZoneId
    const runtime = replayRef.current
    if (!runtime) return
    paintFastFrame(runtime.renderCurrentFrame())
  }, [effectiveSoloZoneId, paintFastFrame])

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setViewportWidth(Math.max(1, entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !layout || !compiled.artifact) return
    const artifact = compiled.artifact
    runtimeGenerationRef.current += 1
    if (playbackRafRef.current !== null) cancelAnimationFrame(playbackRafRef.current)
    playbackRafRef.current = null
    setRuntimeError(null)

    const currentViewportWidth = viewportWidthRef.current
    const renderer = createRenderer(canvas, {
      containerWidth: currentViewportWidth,
      lightSize: lightSizeRef.current,
    })
    rendererRef.current = renderer
    if (layout.draw.kind === '3d') {
      const px = cube3DCanvasPx(currentViewportWidth)
      renderer.set3DPositions(layout.draw.positions, { canvasPx: px })
      const view = useCameraStore.getState()
      renderer.setCamera(view.camera)
      renderer.setZoom(view.zoom)
    } else {
      renderer.set2DPositions(layout.draw.positions, {
        containerWidth: currentViewportWidth,
        lightSize: lightSizeRef.current,
      })
    }
    renderer.setDiffusion(diffusionRef.current)

    const generation = runtimeGenerationRef.current
    let disposed = false
    const isCurrent = () => !disposed && runtimeGenerationRef.current === generation
    const createRuntime = () => createFastReplayRuntime({
        code: artifact.code,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: layout.sampleDimension ?? (artifact.metadata.renderFns?.hasRender2D ? 2 : 1),
      }, {
        mapPoints: layout.mapPoints,
        randomSeed: replayRandomSeed,
        fidelity,
      })
    const acceptRuntime = (runtime: FastReplayRuntime, result: FastReplayResult) => {
      if (!isCurrent()) return
      replayRef.current = runtime
      replayKeyRef.current = replayCheckpointKey
      performanceProbeRef.current?.recordRuntimeInitialization()
      liveSimulatedFramesRef.current = result.simulatedFrames
      paintFastFrame(result)
    }

    try {
      const transport = useShowTransportStore.getState()
      transport.openShow(showId, durationMs)
      const positionMs = useShowTransportStore.getState().positionMs
      if (positionMs === 0) {
        const runtime = createRuntime()
        acceptRuntime(runtime, runtime.renderCurrentFrame())
      } else {
        const initialize = async () => {
          try {
            const reconstruction = await reconstructFastReplayWithCheckpoints({
              key: replayCheckpointKey!,
              store: checkpointStoreRef.current!,
              createRuntime,
              targetMs: positionMs,
              advance: {
                stepMs: SHOW_REPLAY_STEP_MS,
                chunkMs: SHOW_REPLAY_CHUNK_MS,
                temporalFeedbackSeek: SHOW_TEMPORAL_FEEDBACK_SEEK,
              },
              isCurrent,
            })
            if (!reconstruction || !isCurrent()) return
            acceptRuntime(reconstruction.runtime, reconstruction.result)
            setRuntimeRevision((revision) => revision + 1)
          } catch (error) {
            if (isCurrent()) {
              setRuntimeError(error instanceof Error ? error.message : 'Show preview failed')
            }
          }
        }
        void initialize()
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Show preview failed'
      queueMicrotask(() => setRuntimeError(message))
    }

    return () => {
      disposed = true
      runtimeGenerationRef.current += 1
      if (playbackRafRef.current !== null) cancelAnimationFrame(playbackRafRef.current)
      playbackRafRef.current = null
      replayRef.current = null
      replayKeyRef.current = null
    }
  }, [compiled.artifact, durationMs, fidelity, layout, paintFastFrame, replayCheckpointKey, replayRandomSeed, showId])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || !layout) return
    if (layout.draw.kind === '3d') {
      renderer.resize3D(cube3DCanvasPx(viewportWidth))
    } else {
      renderer.resize2D({ containerWidth: viewportWidth, lightSize })
    }
    performanceProbeRef.current?.recordResize()
  }, [layout, lightSize, viewportWidth])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setDiffusion(diffusion)
  }, [diffusion])

  useEffect(() => {
    const runtime = replayRef.current
    if (!runtime || usePreviewStore.getState().isRunning) return
    paintFastFrame(runtime.advanceTo(runtime.getElapsedMs(), { stepMs: 1000 / 60 }))
  }, [brightness, paintFastFrame])

  useEffect(() => {
    const preview = usePreviewStore.getState()
    preview.setFps(null)
    fpsWindowStartRef.current = null
    fpsFramesRef.current = 0
    if (!canAdvanceShowPlayback(isRunning, seekStatus) || !replayRef.current) return
    playbackLastRef.current = performance.now()
    const tick = (now: number) => {
      const runtime = replayRef.current
      const transport = useShowTransportStore.getState()
      if (!runtime || !canAdvanceShowPlayback(usePreviewStore.getState().isRunning, transport.seekStatus)) return
      const last = playbackLastRef.current ?? now
      playbackLastRef.current = now
      try {
        const frameStarted = performance.now()
        performanceProbeRef.current?.beginPresentedFrame(now)
        const deltaMs = Math.max(0, now - last) * usePreviewStore.getState().speed
        const step = resolveShowPlaybackStep(runtime.getElapsedMs(), deltaMs, transport.playbackWindow, durationMs)
        if (step.kind === 'rewind') {
          usePreviewStore.getState().setRunning(false)
          transport.setPosition(showId, step.targetMs)
          transport.requestSeek(showId, step.targetMs)
          playbackRafRef.current = null
          return
        }
        if (step.kind === 'loop') {
          transport.setPosition(showId, step.targetMs)
          transport.requestSeek(showId, step.targetMs)
          playbackRafRef.current = null
          return
        }
        const evaluationStarted = performance.now()
        const result = runtime.advanceLive(step.targetMs - runtime.getElapsedMs())
        const evaluationEnded = performance.now()
        const paintTiming = paintFastFrame(result)
        const frameEnded = performance.now()
        const simulatedTicks = result.simulatedFrames - liveSimulatedFramesRef.current
        liveSimulatedFramesRef.current = result.simulatedFrames
        if (paintTiming) {
          const probe = performanceProbeRef.current
          probe?.recordFrameWork({
            patternEvaluationMs: evaluationEnded - evaluationStarted,
            ...paintTiming,
            frameWorkMs: frameEnded - frameStarted,
            simulatedTicks,
          })
          performancePublishFrameRef.current += 1
          if (probe && performancePublishFrameRef.current % 30 === 0 && performanceOutputRef.current) {
            performanceOutputRef.current.value = JSON.stringify(probe.snapshot())
          }
        }
        const positionMs = durationMs > 0 ? result.elapsedMs % durationMs : 0
        useShowTransportStore.getState().setPosition(showId, positionMs)
        if (fpsWindowStartRef.current === null) {
          fpsWindowStartRef.current = now
        } else {
          fpsFramesRef.current += 1
          const windowMs = now - fpsWindowStartRef.current
          if (windowMs >= 500) {
            usePreviewStore.getState().setFps((fpsFramesRef.current * 1000) / windowMs)
            fpsWindowStartRef.current = now
            fpsFramesRef.current = 0
          }
        }
        playbackRafRef.current = requestAnimationFrame(tick)
      } catch (error) {
        setRuntimeError(error instanceof Error ? error.message : 'Show preview failed')
        playbackRafRef.current = null
      }
    }
    playbackRafRef.current = requestAnimationFrame(tick)
    return () => {
      if (playbackRafRef.current !== null) cancelAnimationFrame(playbackRafRef.current)
      playbackRafRef.current = null
      usePreviewStore.getState().setFps(null)
    }
  }, [durationMs, isRunning, paintFastFrame, runtimeRevision, seekStatus, showId])

  useEffect(() => {
    if (!seekRequest || !layout || !compiled.artifact || !replayCheckpointKey) return
    if (playbackRafRef.current !== null) cancelAnimationFrame(playbackRafRef.current)
    playbackRafRef.current = null
    const generation = ++runtimeGenerationRef.current
    let disposed = false
    const isCurrent = () => (
      !disposed
      && runtimeGenerationRef.current === generation
      && useShowTransportStore.getState().seekRequest?.id === seekRequest.id
    )

    const rebuild = async () => {
      try {
        const existingRuntime = replayKeyRef.current === replayCheckpointKey ? replayRef.current : null
        // Reconstruction restores into existingRuntime in place. Detach it for
        // the duration so no other effect (Zone solo, brightness) can tick a
        // partially restored runtime; a failed or superseded rebuild stays
        // detached and the next rebuild replaces it.
        if (existingRuntime) {
          replayRef.current = null
          replayKeyRef.current = null
        }
        const reconstruction = await reconstructFastReplayWithCheckpoints({
          key: replayCheckpointKey,
          store: checkpointStoreRef.current!,
          existingRuntime,
          createRuntime: () => createFastReplayRuntime({
          code: compiled.artifact!.code,
          fxCode: compiled.artifact!.fxCode,
          metadata: compiled.artifact!.metadata,
          dimension: layout.sampleDimension ?? (compiled.artifact!.metadata.renderFns?.hasRender2D ? 2 : 1),
          }, {
            mapPoints: layout.mapPoints,
            randomSeed: replayRandomSeed,
            fidelity,
          }),
          targetMs: seekRequest.targetMs,
          advance: {
            stepMs: SHOW_REPLAY_STEP_MS,
            chunkMs: SHOW_REPLAY_CHUNK_MS,
            temporalFeedbackSeek: SHOW_TEMPORAL_FEEDBACK_SEEK,
          },
          isCurrent,
        })
        if (!reconstruction || !isCurrent()) return
        replayRef.current = reconstruction.runtime
        replayKeyRef.current = replayCheckpointKey
        if (reconstruction.runtime !== existingRuntime) {
          performanceProbeRef.current?.recordRuntimeInitialization()
        }
        liveSimulatedFramesRef.current = reconstruction.result.simulatedFrames
        paintFastFrame(reconstruction.result)
        useShowTransportStore.getState().completeSeek(seekRequest.id, seekRequest.targetMs)
      } catch (error) {
        if (isCurrent()) {
          setRuntimeError(error instanceof Error ? error.message : 'Show seek failed')
          useShowTransportStore.getState().cancelSeek(seekRequest.id)
        }
      }
    }
    void rebuild()
    return () => {
      disposed = true
      runtimeGenerationRef.current += 1
    }
  }, [compiled.artifact, fidelity, layout, paintFastFrame, replayCheckpointKey, replayRandomSeed, seekRequest])

  useEffect(() => {
    if (!layout || layout.draw.kind !== '3d') return
    return useCameraStore.subscribe((state) => {
      const renderer = rendererRef.current
      if (!renderer) return
      renderer.setCamera(state.camera)
      renderer.setZoom(state.zoom)
      const runtime = replayRef.current
      if (!usePreviewStore.getState().isRunning && runtime) {
        paintFastFrame(runtime.advanceTo(runtime.getElapsedMs(), { stepMs: 1000 / 60 }))
      }
    })
  }, [layout, paintFastFrame])

  useEffect(() => {
    if (!layout || layout.draw.kind !== '3d') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const { autoOrbit, dragging, camera, setCamera } = useCameraStore.getState()
      if (autoOrbit && !dragging) setCamera(advanceAutoOrbit(camera, dt))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [layout])

  if (!show) {
    return (
      <div className="flex h-full items-center justify-center bg-zinc-950/40 font-mono text-xs text-zinc-500">
        Show not found
      </div>
    )
  }

  const error = compiled.error ?? runtimeError
  const rendererLabel = fidelity === 'fast' ? 'Fast' : 'Precise'
  const showZoneInventory = (layout?.projection.zones.length ?? 0) > 1 || installationCoverage?.valid === false

  return (
    // Reserve classic-scrollbar width before the square canvas changes height,
    // preventing its ResizeObserver from toggling the scrollbar on and off (#686).
    <div className="flex h-full min-h-0 flex-col overflow-x-hidden overflow-y-auto [scrollbar-gutter:stable] bg-zinc-950 font-mono text-xs text-zinc-400">
      {import.meta.env.DEV && (
        <output
          ref={performanceOutputRef}
          data-testid="show-stage-performance"
          className="hidden"
          aria-hidden="true"
        />
      )}
      <div ref={containerRef} className="relative shrink-0 bg-black/70">
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="rounded-sm" />
          {layout?.draw.kind === '2d' && diagnostics.zoneOutlines && diagnosticRects.length > 0 && (
            <svg
              data-testid="show-stage-zone-outlines"
              aria-label="Zone outlines"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
              {diagnosticRects.map((rect) => (
                <rect
                  key={rect.zoneId}
                  x={rect.x}
                  y={rect.y}
                  width={rect.width}
                  height={rect.height}
                  fill="none"
                  stroke={rect.color}
                  strokeWidth="0.004"
                  strokeDasharray="0.012 0.008"
                  opacity="0.7"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          )}
          {layout?.draw.kind === '2d' && diagnostics.clipOutlines && diagnosticFocus?.placementId && focusedDiagnosticPoints && (
            <svg
              data-testid="show-stage-clip-outline"
              aria-label="Selected Clip outline"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
              <polygon
                points={diagnosticPointList(focusedDiagnosticPoints)}
                fill="rgba(103,232,249,0.025)"
                stroke="#67e8f9"
                strokeWidth="0.007"
                opacity="0.9"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          )}
          {seekStatus === 'rebuilding' && seekRequest?.id === badgedSeekRequestId && (
            <div
              role="status"
              aria-label="Rebuilding Show preview"
              title="Rebuilding preview"
              className="pointer-events-none absolute right-2 top-2 z-20 grid size-7 place-items-center rounded-md border border-amber-300/20 bg-zinc-950/70 text-amber-300 shadow-lg shadow-black/20 backdrop-blur-sm"
            >
              <LoaderCircle size={14} aria-hidden className="animate-spin motion-reduce:animate-none" />
            </div>
          )}
          {layout?.draw.kind === '3d' && (
            <OrbitControls
              canvasRef={canvasRef}
              viewKey={`show:${showId}:${selectedStageMap?.id ?? 'strips'}`}
              showPoleControls={false}
            />
          )}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="max-w-[90%] rounded-md bg-zinc-950/90 px-3 py-2 text-amber-300">
                {error}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="shrink-0 border-t border-zinc-900 px-3 py-3">
        <div className="mb-3 flex min-h-7 items-center gap-2 text-zinc-500">
          <span className="min-w-0 flex-1">
            {seekStatus === 'rebuilding'
              ? `rebuilding accurate Show preview · ${rendererLabel}`
              : isRunning ? `previewing Show · ${rendererLabel}` : `show paused · ${rendererLabel}`}
          </span>
          <button
            type="button"
            aria-label={isRunning ? 'Pause Show preview' : 'Play Show preview'}
            title={isRunning ? 'Pause Show preview' : 'Play Show preview'}
            onClick={togglePlayback}
            className={`grid size-7 shrink-0 place-items-center rounded transition-colors hover:bg-zinc-800 ${
              isRunning
                ? 'text-green-400 hover:text-green-300'
                : 'text-red-400 hover:text-red-300'
            }`}
          >
            {isRunning ? <Pause size={20} aria-hidden /> : <Play size={20} aria-hidden />}
          </button>
        </div>
        <div aria-label="Show stage" className="text-[10px] text-zinc-500">
          <div className="flex h-5 items-center justify-between gap-2">
            <h3 className="font-semibold uppercase tracking-wider text-structural">Stage</h3>
            <div className="flex items-center gap-0.5" aria-label="Stage diagnostics">
              <StageDiagnosticToggle
                label="Zone outlines"
                active={diagnostics.zoneOutlines}
                onChange={(active) => setDiagnostic('zoneOutlines', active)}
              />
              <StageDiagnosticToggle
                label="Clip outline"
                active={diagnostics.clipOutlines}
                onChange={(active) => setDiagnostic('clipOutlines', active)}
              />
            </div>
          </div>
          <div className="mt-1.5 flex min-w-0 items-center gap-1.5 leading-5">
            <MapIcon size={12} aria-hidden className="shrink-0 text-zinc-600" />
            <span className="shrink-0 text-zinc-500">{stageIdentityRole}</span>
            <span aria-hidden className="text-zinc-700">·</span>
            <span className="truncate text-zinc-200">{selectedStageMap?.name ?? 'Zone strips - generic'}</span>
            <span aria-hidden className="text-zinc-700">·</span>
            <span className="shrink-0 tabular-nums text-zinc-400">{layout?.mapPoints.length ?? 0} px</span>
          </div>
        </div>
        {(layout?.note || (layout?.kind === 'map' && layout.projection.unstagedPixelCount > 0)) && (
          <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[10px] leading-4 text-zinc-500">
          {layout?.note && <div className="mt-1 text-amber-300">{layout.note}</div>}
          {layout?.kind === 'map' && layout.projection.unstagedPixelCount > 0 && (
            <div className="mt-1">{layout.projection.unstagedPixelCount} stage pixels are not covered by a show zone.</div>
          )}
          </div>
        )}
        <PreviewViewportSection profile="show" />

        {showZoneInventory && <section aria-label="Zones" className="mt-2.5">
          <div className="flex h-6 items-center justify-between gap-2">
            <h3 className="text-[11px] font-semibold uppercase tracking-wider text-structural">Zones - solo</h3>
            <button
              type="button"
              aria-label="Show all zones"
              disabled={!effectiveSoloZoneId}
              onClick={() => setSoloZoneId(null)}
              className="h-6 rounded px-2 text-[10px] uppercase tracking-wider text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 disabled:pointer-events-none disabled:invisible"
            >
              All
            </button>
          </div>
          {installationCoverage?.layouts[0] && (() => {
            const coverage = installationCoverage.layouts[0]
            const fullCoverage = `${coverage.assignedPixelCount} assigned · ${coverage.missingPixelCount} missing · ${coverage.overlappingPixelCount} overlapping · ${coverage.outOfRangePixelCount} out of range · ${installationCoverage.pixelCount} total`
            const compactCoverage = installationCoverage.valid
              ? `${coverage.assignedPixelCount}/${installationCoverage.pixelCount} assigned · complete coverage`
              : `${coverage.assignedPixelCount}/${installationCoverage.pixelCount} assigned · ${coverage.missingPixelCount} missing · ${coverage.overlappingPixelCount} overlap · ${coverage.outOfRangePixelCount} out of range`
            return (
              <div
                role="status"
                aria-label="Zone coverage"
                title={fullCoverage}
                className={`mt-1 flex h-6 min-w-0 items-center overflow-hidden rounded border px-2 text-[9px] leading-none whitespace-nowrap ${installationCoverage.valid
                  ? 'border-emerald-900/60 bg-emerald-950/15 text-emerald-500'
                  : 'border-amber-800/60 bg-amber-950/20 text-amber-300'}`}
              >
                <span className="truncate">{compactCoverage}</span>
              </div>
            )
          })()}
          <div className="mt-1.5 space-y-1">
          {layout?.projection.zones.map((zone) => {
            const active = zone.id === effectiveSoloZoneId
            return (
              <div key={zone.id} className="grid h-9 grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-zinc-800 bg-zinc-950/55 px-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-sm" style={{ backgroundColor: zone.color }} />
                  <span className="truncate text-zinc-200" title={zone.name}>{zone.name}</span>
                </div>
                <span className={zone.offStage && layout.kind === 'map' ? 'text-amber-300' : 'text-zinc-500'}>
                  {zone.offStage && layout.kind === 'map' ? (
                    <span className="inline-flex items-center gap-1">
                      <AlertTriangle size={12} aria-hidden />
                      off stage
                    </span>
                  ) : `${zone.pixelCount} px`}
                </span>
                <button
                  type="button"
                  aria-label={active ? `Unsolo zone ${zone.name}` : `Solo zone ${zone.name}`}
                  title={active ? `Unsolo ${zone.name}` : `Solo ${zone.name}`}
                  onClick={() => setSoloZoneId(active ? null : zone.id)}
                  className={`grid h-7 w-7 place-items-center rounded transition-colors ${
                    active
                      ? 'bg-live/10 text-live ring-1 ring-live/50'
                      : 'text-zinc-500 hover:bg-zinc-800 hover:text-zinc-100'
                  }`}
                >
                  {active ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            )
          })}
          </div>
        </section>}
      </div>
    </div>
  )
}

export function resolveShowStagePreviewInput(
  showId: string,
  resolvedShow: ShowRecord | undefined,
  deferredShow: ShowRecord | undefined,
): ShowRecord | undefined {
  return deferredShow?.id === showId
    && sameShowPatternSources(resolvedShow, deferredShow)
    ? deferredShow
    : resolvedShow
}

function sameShowPatternSources(
  left: ShowRecord | undefined,
  right: ShowRecord | undefined,
): boolean {
  if (!left || !right) return left === right
  if (left.cells.length !== right.cells.length) return false
  const rightCells = new Map(right.cells.map((cell) => [cell.id, cell.pattern]))
  if (left.cells.some((cell) => !samePatternRef(cell.pattern, rightCells.get(cell.id)))) return false

  const leftInstances = left.composition?.patternInstances ?? []
  const rightInstances = right.composition?.patternInstances ?? []
  if (leftInstances.length !== rightInstances.length) return false
  const rightInstancePatterns = new Map(rightInstances.map((instance) => [instance.id, instance.pattern]))
  return leftInstances.every((instance) => samePatternRef(
    instance.pattern,
    rightInstancePatterns.get(instance.id),
  ))
}

function samePatternRef(
  left: ShowRecord['cells'][number]['pattern'],
  right: ShowRecord['cells'][number]['pattern'] | undefined,
): boolean {
  return Boolean(right && left.kind === right.kind && left.id === right.id)
}

function StageDiagnosticToggle({ label, active, onChange }: {
  label: string
  active: boolean
  onChange: (active: boolean) => void
}) {
  return (
    <button
      type="button"
      aria-label={`${active ? 'Hide' : 'Show'} ${label}`}
      aria-pressed={active}
      onClick={() => onChange(!active)}
      className={`flex h-5 items-center gap-1 rounded px-1.5 text-[8px] transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-cyan-300 ${active
        ? 'bg-cyan-300/12 text-cyan-200 ring-1 ring-inset ring-cyan-300/30'
        : 'text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300'}`}
    >
      <i aria-hidden className={`size-1 rounded-full ${active ? 'bg-cyan-300' : 'bg-zinc-700'}`} />
      {label === 'Zone outlines' ? 'Zones' : 'Clip'}
    </button>
  )
}
