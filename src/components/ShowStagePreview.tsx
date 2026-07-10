import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Eye, EyeOff, Map as MapIcon, Play } from 'lucide-react'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { useMapStore, defaultPixelCountForDim, resolveMap, STOCK_MAPS } from '@/store/mapStore'
import { usePreviewStore } from '@/store/previewStore'
import { useCameraStore } from '@/store/cameraStore'
import { compileShowForPreview } from '@/engine/showPreviewArtifact'
import { createShim, createFxShim } from '@/engine/shim'
import { loadPattern } from '@/engine/loadPattern'
import { selectRenderCompatibility } from '@/engine/renderCompatibility'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createVirtualClock } from '@/engine/virtualClock'
import { createRenderer } from '@/engine/renderer'
import { applyNormalizeMode, type MapPoint, type PixelMap } from '@/engine/maps'
import { advanceAutoOrbit } from '@/engine/camera'
import {
  applyShowStageMask,
  buildShowStageProjection,
  buildShowStripsLayout,
  buildShowStripControllerZones,
  type ShowStageProjection,
} from '@/engine/zonePreview'
import { OrbitControls } from '@/components/OrbitControls'
import { LIBRARIES } from '@/pixelblaze/libs'

const field =
  'h-7 rounded border border-zinc-700 bg-zinc-900 px-2 text-xs text-zinc-200 outline-none focus:border-live/70'

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

export function ShowStagePreview({ showId }: { showId: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<ReturnType<typeof createRenderer> | null>(null)
  const show = useShowStore((state) => state.shows.find((item) => item.id === showId))
  const updateStageMap = useShowStore((state) => state.updateStageMap)
  const userPatterns = usePatternStore((state) => state.userPatterns)
  const userMaps = useMapStore((state) => state.userMaps)
  const controllerProfiles = useControllerProfileStore((state) => state.profiles)
  const isRunning = usePreviewStore((state) => state.isRunning)
  const brightness = usePreviewStore((state) => state.brightness)
  const lightSize = usePreviewStore((state) => state.lightSize)
  const diffusion = usePreviewStore((state) => state.diffusion)
  const fidelity = usePreviewStore((state) => state.fidelity)
  const [viewportWidth, setViewportWidth] = useState(1)
  const [soloZoneId, setSoloZoneId] = useState<string | null>(null)
  const [runtimeError, setRuntimeError] = useState<string | null>(null)

  const targetProfile = show?.targetControllerProfileId
    ? controllerProfiles.find((profile) => profile.id === show.targetControllerProfileId)
    : controllerProfiles[0]

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

  const stripControllerZones = useMemo(
    () => show ? buildShowStripControllerZones(show.zones, targetProfile?.zones) : [],
    [show, targetProfile?.zones],
  )
  const spatialControllerZones = selectedStageMap ? targetProfile?.zones : stripControllerZones
  const compiled = useMemo(
    () =>
      show
        ? compileShowForPreview(show, userPatterns, spatialControllerZones, LIBRARIES)
        : { artifact: null, error: null },
    [show, userPatterns, spatialControllerZones],
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
      map.bakedCount ??
      selectedStageMap.bakedCount ??
      targetProfile?.lastKnownPixelCount ??
      (zoneTotal > 0 ? zoneTotal : undefined) ??
      defaultPixelCountForDim(map.dim)
    const pixelCount = Math.max(1, preferredPixelCount)
    const resolved = applyNormalizeMode(map.resolve(pixelCount), 'contain')
    const mapPoints = resolved.map((point) => ({ sample: [], pos: point.pos }))
    const projection = buildShowStageProjection(show.zones, mapPoints.length, {
      controllerZones: targetProfile?.zones,
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
        note: null,
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
      note: null,
    }
  }, [danglingStageMap, selectedStageMap, show, targetProfile?.lastKnownPixelCount, targetProfile?.zones, userMaps])
  const effectiveSoloZoneId =
    layout?.projection.zones.some((zone) => zone.id === soloZoneId) ? soloZoneId : null

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

    const clock = createVirtualClock()
    const renderCompatibility = selectRenderCompatibility(1, compiled.artifact.metadata.renderFns)
    const shimConfig = {
      mapPoints: layout.mapPoints,
      pixelCount: layout.mapPoints.length,
      dimensions: 1 as const,
      getVirtualTime: () => clock.getTime(),
    }
    const shim = fidelity === 'fast' ? createShim(shimConfig) : createFxShim(shimConfig)

    let handle: ReturnType<typeof loadPattern>
    try {
      handle = loadPattern(
        fidelity === 'fast' ? compiled.artifact.code : compiled.artifact.fxCode,
        compiled.artifact.metadata,
        shim.builtins,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Show preview failed'
      queueMicrotask(() => setRuntimeError(message))
      return
    }

    const paint = (pixels: [number, number, number][], currentBrightness: number, dimmed: boolean) => {
      if (layout.draw.kind === '3d') renderer.setCamera(useCameraStore.getState().camera)
      renderer.paint(
        applyShowStageMask(pixels, layout.projection, effectiveSoloZoneId),
        currentBrightness,
        dimmed,
      )
    }

    const loop = createRenderLoop({
      handle,
      shim,
      clock,
      mapPoints: layout.mapPoints,
      pixelCount: layout.mapPoints.length,
      renderCompatibility,
      getSpeed: () => usePreviewStore.getState().speed,
      getBrightness: () => usePreviewStore.getState().brightness,
      isDimmed: () => !usePreviewStore.getState().isRunning,
      paint,
      onError: (error) => setRuntimeError(error.message),
    })
    loopRef.current = loop
    loop.renderPreviewFrame()
    if (usePreviewStore.getState().isRunning) loop.start()
    return () => loop.stop()
  }, [compiled.artifact, diffusion, effectiveSoloZoneId, fidelity, layout, lightSize, viewportWidth])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer) return
    renderer.setDiffusion(diffusion)
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [diffusion])

  useEffect(() => {
    if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
  }, [brightness])

  useEffect(() => {
    const loop = loopRef.current
    if (!loop) return
    if (isRunning) loop.start()
    else loop.stop()
  }, [isRunning])

  useEffect(() => {
    if (!layout || layout.draw.kind !== '3d') return
    return useCameraStore.subscribe((state) => {
      const renderer = rendererRef.current
      if (!renderer) return
      renderer.setCamera(state.camera)
      if (!usePreviewStore.getState().isRunning) loopRef.current?.renderPreviewFrame()
    })
  }, [layout])

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

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 font-mono text-xs text-zinc-400">
      <div ref={containerRef} className="relative shrink-0 bg-black/70">
        <div className="relative inline-block">
          <canvas ref={canvasRef} className="rounded-sm" />
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
          <Play size={13} aria-hidden className={isRunning ? 'text-green-400' : 'text-red-400'} />
          <span>{isRunning ? 'previewing show' : 'show paused'}</span>
          <span className="ml-auto">{layout?.mapPoints.length ?? 0} px</span>
        </div>
        <label className="block text-[10px] uppercase tracking-wider text-zinc-600">
          Stage
          <select
            aria-label="Show stage"
            value={selectedStageMap?.id ?? ''}
            onChange={(event) => void updateStageMap(show.id, event.target.value || null)}
            className={`${field} mt-1 w-full`}
          >
            <option value="">Zone strips - generic</option>
            <optgroup label="Stock maps">
              {stageMaps.filter((map) => map.group === 'stock').map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </optgroup>
            <optgroup label="Your maps">
              {stageMaps.filter((map) => map.group === 'user').map((map) => (
                <option key={map.id} value={map.id}>{map.name}</option>
              ))}
            </optgroup>
          </select>
        </label>
        <div className="mt-2 rounded border border-zinc-800 bg-zinc-950/60 p-2 text-[10px] leading-4 text-zinc-500">
          <span className="inline-flex items-center gap-1 text-zinc-300">
            <MapIcon size={12} aria-hidden />
            {layout?.label ?? 'Stage'}
          </span>
          {layout?.note && <div className="mt-1 text-amber-300">{layout.note}</div>}
          {layout?.kind === 'map' && layout.projection.unstagedPixelCount > 0 && (
            <div className="mt-1">{layout.projection.unstagedPixelCount} stage pixels are not covered by a show zone.</div>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-structural">Zones - solo</h3>
          {effectiveSoloZoneId && (
            <button
              type="button"
              onClick={() => setSoloZoneId(null)}
              className="h-6 rounded px-2 text-[10px] uppercase tracking-wider text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
            >
              All
            </button>
          )}
        </div>
        <div className="mt-2 space-y-1.5">
          {layout?.projection.zones.map((zone) => {
            const active = zone.id === effectiveSoloZoneId
            return (
              <div key={zone.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-zinc-800 bg-zinc-950/55 px-2 py-1.5">
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
      </div>
    </div>
  )
}
