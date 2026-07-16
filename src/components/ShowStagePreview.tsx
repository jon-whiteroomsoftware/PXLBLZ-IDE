import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, LoaderCircle, Map as MapIcon, Pause, Play } from 'lucide-react'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useMapStore, defaultPixelCountForDim, resolveMap, STOCK_MAPS } from '@/store/mapStore'
import { usePreviewStore } from '@/store/previewStore'
import { useCameraStore } from '@/store/cameraStore'
import { compileShowForPreview } from '@/engine/showPreviewArtifact'
import { nativeDimension } from '@/engine/loadPattern'
import {
  advanceFastReplayCooperatively,
  createFastReplayRuntime,
  type FastReplayResult,
  type FastReplayRuntime,
} from '@/engine/fastReplay'
import { createRenderer } from '@/engine/renderer'
import { applyNormalizeMode, type MapPoint, type PixelMap } from '@/engine/maps'
import { advanceAutoOrbit } from '@/engine/camera'
import {
  applyShowStageMask,
  buildShowStageProjection,
  buildShowLogicalStageProjection,
  showLogicalAspectAdvisory,
  buildShowStripsLayout,
  buildShowStripControllerZones,
  type ShowStageProjection,
} from '@/engine/zonePreview'
import { OrbitControls } from '@/components/OrbitControls'
import { LIBRARIES } from '@/pixelblaze/libs'
import { canAdvanceShowPlayback, resolveShowPlaybackStep, useShowTransportStore } from '@/store/showTransportStore'
import { showLoopDurationMs } from '@/engine/showModel'
import { useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import {
  installationPhysicalZones,
  validateInstallationCoverage,
} from '@/engine/showInstallationCoverage'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { PreviewViewportSection } from '@/components/PreviewDeck'
import { useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { buildShowStageDiagnosticRects } from '@/engine/showStageDiagnostics'

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
  draw:
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][] }
  projection: ShowStageProjection
  label: string
  note: string | null
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

export function ShowStagePreview({ showId, showOverride }: { showId: string; showOverride?: ShowRecord }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const replayRef = useRef<FastReplayRuntime | null>(null)
  const playbackRafRef = useRef<number | null>(null)
  const playbackLastRef = useRef<number | null>(null)
  const fpsWindowStartRef = useRef<number | null>(null)
  const fpsFramesRef = useRef(0)
  const runtimeGenerationRef = useRef(0)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const savedShow = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const previewShow = useShowPreviewOverrideStore((state) => state.show?.id === showId ? state.show : null)
  const show = previewShow ?? showOverride ?? savedShow
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const isRunning = usePreviewStore((state) => state.isRunning)
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
  const [soloZoneId, setSoloZoneId] = useState<string | null>(null)
  const effectiveSoloZoneIdRef = useRef<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)
  const [badgedSeekRequestId, setBadgedSeekRequestId] = useState<number | null>(null)

  useEffect(() => {
    const preview = usePreviewStore.getState()
    preview.setRunning(false)
    preview.setLightSize(preview.lightSizeSticky)
    preview.setDiffusion(preview.diffusionSticky)
  }, [showId])

  const targetProfile = show?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === show.targetControllerProfileId)
    : controllerProfiles[0]
  const installationCoverage = show ? validateInstallationCoverage(show) : null
  const savedPhysicalZones = show ? installationPhysicalZones(show) : undefined

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

  const stripControllerZones = useMemo(
    () => show ? buildShowStripControllerZones(show.zones, targetProfile?.zones) : [],
    [show, targetProfile?.zones],
  )
  const portable = show?.outputContract?.kind === 'portable-2d'
  const spatialControllerZones = savedPhysicalZones
    ?? (portable ? undefined : selectedStageMap ? targetProfile?.zones : stripControllerZones)
  const compiled = useMemo(
    () =>
      show
        ? compileShowForPreview(show, userPatterns, spatialControllerZones, LIBRARIES, {
            stageDimension: selectedStageMap?.dim,
          })
        : { artifact: null, error: null },
    [selectedStageMap?.dim, show, spatialControllerZones, userPatterns],
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
  const durationMs = show ? showLoopDurationMs(show) : 0

  useEffect(() => {
    if (seekStatus !== 'rebuilding' || !seekRequest) return
    const requestId = seekRequest.id
    const timer = window.setTimeout(() => setBadgedSeekRequestId(requestId), 150)
    return () => window.clearTimeout(timer)
  }, [seekRequest, seekStatus])

  const paintFastFrame = useCallback((result: FastReplayResult) => {
    const renderer = rendererRef.current
    if (!renderer || !layout) return
    if (layout.draw.kind === '3d') renderer.setCamera(useCameraStore.getState().camera)
    renderer.paint(
      applyShowStageMask(result.pixels, layout.projection, effectiveSoloZoneIdRef.current),
      usePreviewStore.getState().brightness,
      !usePreviewStore.getState().isRunning,
    )
  }, [layout])

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
    runtimeGenerationRef.current += 1
    if (playbackRafRef.current !== null) cancelAnimationFrame(playbackRafRef.current)
    playbackRafRef.current = null
    setRuntimeError(null)

    const renderer = createRenderer(canvas, { containerWidth: viewportWidth, lightSize })
    rendererRef.current = renderer
    if (layout.draw.kind === '3d') {
      const px = cube3DCanvasPx(viewportWidth)
      renderer.set3DPositions(layout.draw.positions, { canvasPx: px })
      renderer.setCamera(useCameraStore.getState().camera)
    } else {
      renderer.set2DPositions(layout.draw.positions, { containerWidth: viewportWidth, lightSize })
    }
    renderer.setDiffusion(diffusion)

    try {
      const transport = useShowTransportStore.getState()
      transport.openShow(showId, durationMs)
      const runtime = createFastReplayRuntime({
        code: compiled.artifact.code,
        fxCode: compiled.artifact.fxCode,
        metadata: compiled.artifact.metadata,
        dimension: nativeDimension(compiled.artifact.metadata.renderFns),
      }, {
        mapPoints: layout.mapPoints,
        randomSeed: stableShowSeed(showId),
        fidelity,
      })
      let result = runtime.renderCurrentFrame()
      const positionMs = useShowTransportStore.getState().positionMs
      if (positionMs > 0) result = runtime.advanceTo(positionMs, { stepMs: 1000 / 60 })
      replayRef.current = runtime
      paintFastFrame(result)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Show preview failed'
      queueMicrotask(() => setRuntimeError(message))
    }

    return () => {
      runtimeGenerationRef.current += 1
      if (playbackRafRef.current !== null) cancelAnimationFrame(playbackRafRef.current)
      playbackRafRef.current = null
      replayRef.current = null
    }
  }, [compiled.artifact, diffusion, durationMs, fidelity, layout, lightSize, paintFastFrame, showId, viewportWidth])

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
        const result = runtime.advanceTo(step.targetMs, { stepMs: 1000 / 60 })
        paintFastFrame(result)
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
  }, [durationMs, isRunning, paintFastFrame, seekStatus, showId])

  useEffect(() => {
    if (!seekRequest || !layout || !compiled.artifact) return
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
        const runtime = createFastReplayRuntime({
          code: compiled.artifact!.code,
          fxCode: compiled.artifact!.fxCode,
          metadata: compiled.artifact!.metadata,
          dimension: nativeDimension(compiled.artifact!.metadata.renderFns),
        }, {
          mapPoints: layout.mapPoints,
          randomSeed: stableShowSeed(showId),
          fidelity,
        })
        let result: FastReplayResult | null = runtime.renderCurrentFrame()
        if (seekRequest.targetMs > 0) {
          result = await advanceFastReplayCooperatively(runtime, seekRequest.targetMs, {
            stepMs: 1000 / 60,
            chunkMs: 250,
            isCurrent,
          })
        }
        if (!result || !isCurrent()) return
        replayRef.current = runtime
        paintFastFrame(result)
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
  }, [compiled.artifact, fidelity, layout, paintFastFrame, seekRequest, showId])

  useEffect(() => {
    if (!layout || layout.draw.kind !== '3d') return
    return useCameraStore.subscribe((state) => {
      const renderer = rendererRef.current
      if (!renderer) return
      renderer.setCamera(state.camera)
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
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 font-mono text-xs text-zinc-400">
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
          {layout?.draw.kind === '2d' && diagnostics.clipOutlines && diagnosticFocus?.placementId && focusedDiagnosticRect && (
            <svg
              data-testid="show-stage-clip-outline"
              aria-label="Selected Clip outline"
              viewBox="0 0 1 1"
              preserveAspectRatio="none"
              className="pointer-events-none absolute inset-0 size-full overflow-visible"
            >
              <rect
                x={focusedDiagnosticRect.x}
                y={focusedDiagnosticRect.y}
                width={focusedDiagnosticRect.width}
                height={focusedDiagnosticRect.height}
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
          {layout?.draw.kind === '3d' && <OrbitControls canvasRef={canvasRef} showPoleControls={false} />}
          {error && (
            <div className="absolute inset-0 flex items-center justify-center p-4 pointer-events-none">
              <div className="max-w-[90%] rounded-md bg-zinc-950/90 px-3 py-2 text-amber-300">
                {error}
              </div>
            </div>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto border-t border-zinc-900 px-3 py-3">
        <div className="mb-3 flex items-center gap-2 text-zinc-500">
          {isRunning
            ? <Play size={13} aria-hidden className="text-green-400" />
            : <Pause size={13} aria-hidden className="text-red-400" />}
          <span>
            {seekStatus === 'rebuilding'
              ? `rebuilding accurate Show preview · ${rendererLabel}`
              : isRunning ? `previewing Show · ${rendererLabel}` : `show paused · ${rendererLabel}`}
          </span>
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
                      ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-400/50'
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
