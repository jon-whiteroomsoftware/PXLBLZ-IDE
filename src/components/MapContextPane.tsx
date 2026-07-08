import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, GitBranch, Map as MapIcon } from 'lucide-react'
import { createRenderer, type Renderer } from '@/engine/renderer'
import {
  explicitPatternMapUsers,
  labelStyle,
  mapFacts,
  wireGeometry,
  wireLabelIndices,
  wireLabels2D,
  wireLabels3D,
  wireOrderColors,
  type WireLabel,
} from '@/engine/mapContext'
import type { GridDims, MapPoint } from '@/engine/maps'
import { useCameraStore } from '@/store/cameraStore'
import {
  defaultPixelCountForDim,
  mapFromRecord,
  resolveMap,
  useMapStore,
} from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { usePreviewStore } from '@/store/previewStore'
import { OrbitControls } from '@/components/OrbitControls'
import { advanceAutoOrbit } from '@/engine/camera'

interface OpenMapContext {
  id: string
  name: string
  dim: 1 | 2 | 3
  points: MapPoint[]
  gridDims: GridDims | null
  evalError: string | null
  readOnly: boolean
}

function canvasSizeFor3D(width: number): number {
  return Math.max(200, Math.floor(width))
}

function resolveOpenMapContext(): OpenMapContext | null {
  const { editingMap, userMaps, activePixelCount, mapEvalError } = useMapStore.getState()
  if (editingMap?.kind === 'stock') {
    const map = resolveMap(editingMap.id, userMaps)
    const count = activePixelCount ?? defaultPixelCountForDim(map.dim)
    const points = map.resolve(count)
    return {
      id: map.id,
      name: map.name,
      dim: map.dim,
      points,
      gridDims: map.gridDims(points.length),
      evalError: null,
      readOnly: true,
    }
  }
  if (editingMap?.kind !== 'existing') return null
  const record = userMaps.find((map) => map.id === editingMap.id)
  if (!record) return null
  if (record.generator !== 'custom') {
    const map = mapFromRecord(record)
    const count = activePixelCount ?? defaultPixelCountForDim(map.dim)
    const points = map.resolve(count)
    return {
      id: record.id,
      name: record.name,
      dim: map.dim,
      points,
      gridDims: map.gridDims(points.length),
      evalError: mapEvalError,
      readOnly: false,
    }
  }
  const points = (record.points ?? []).map((coord) => ({
    sample: [...coord],
    pos: [...coord] as MapPoint['pos'],
  }))
  return {
    id: record.id,
    name: record.name,
    dim: record.dim,
    points,
    gridDims: record.gridDims ?? null,
    evalError: mapEvalError,
    readOnly: false,
  }
}

function FactRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-900/80 py-1.5">
      <span className="text-zinc-600">{label}</span>
      <b className="min-w-0 truncate text-right font-mono text-[11px] font-semibold text-zinc-300">{value}</b>
    </div>
  )
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <h3 className="mt-4 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-structural first:mt-0">
      {icon}
      {children}
    </h3>
  )
}

function EmptyMapPane() {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-950/40 px-6 font-mono">
      <div className="max-w-sm text-center">
        <div className="mx-auto mb-3 grid size-10 place-items-center rounded-md border border-zinc-800 bg-panel text-zinc-500">
          <MapIcon size={18} aria-hidden />
        </div>
        <h2 className="text-sm font-semibold text-zinc-300">No map selected</h2>
        <p className="mt-2 text-xs leading-5 text-zinc-600">Create or select a map from the rail.</p>
      </div>
    </div>
  )
}

export function MapContextPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const [containerWidth, setContainerWidth] = useState(0)
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 })
  const [labels, setLabels] = useState<WireLabel[]>([])
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const mapEvalError = useMapStore((s) => s.mapEvalError)
  const lightSize = usePreviewStore((s) => s.lightSize)
  const diffusion = usePreviewStore((s) => s.diffusion)
  const camera = useCameraStore((s) => s.camera)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const context = useMemo(
    () => resolveOpenMapContext(),
    [editingMap, userMaps, activePixelCount, mapEvalError],
  )
  const geometry = useMemo(
    () => (context ? wireGeometry(context.points, context.dim) : null),
    [context],
  )
  const facts = useMemo(
    () => (context ? mapFacts(context.points, context.dim, context.gridDims) : null),
    [context],
  )
  const patternUsers = useMemo(
    () => (context ? explicitPatternMapUsers(userPatterns, context.id) : []),
    [context, userPatterns],
  )

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const measure = (width: number) => {
      setContainerWidth(Math.max(1, width || el.clientWidth || 320))
    }
    measure(el.getBoundingClientRect().width)
    const ro = new ResizeObserver(([entry]) => {
      measure(entry.contentRect.width)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !geometry || containerWidth <= 0) return
    const renderer = createRenderer(canvas, { containerWidth, lightSize })
    renderer.setDiffusion(diffusion)
    rendererRef.current = renderer

    if (geometry.kind === '3d') {
      const px = canvasSizeFor3D(containerWidth)
      renderer.set3DPositions(geometry.positions, { canvasPx: px })
      renderer.setCamera(useCameraStore.getState().camera)
      setCanvasSize({ width: px, height: px })
    } else {
      renderer.set2DPositions(geometry.positions, { containerWidth, lightSize })
      setCanvasSize({ width: canvas.width, height: canvas.height })
    }
    renderer.paint(wireOrderColors(geometry.positions.length), 1, context?.evalError !== null)
    return () => {
      rendererRef.current = null
    }
  }, [containerWidth, context?.evalError, diffusion, geometry, lightSize])

  useEffect(() => {
    const renderer = rendererRef.current
    if (!renderer || !geometry) return
    if (geometry.kind === '3d') renderer.setCamera(camera)
    renderer.setDiffusion(diffusion)
    renderer.paint(wireOrderColors(geometry.positions.length), 1, context?.evalError !== null)
    if (geometry.kind === '3d') {
      setLabels(wireLabels3D(geometry.positions, canvasSize.width, camera, wireLabelIndices(geometry.positions.length)))
    } else {
      setLabels(wireLabels2D(
        geometry.positions,
        canvasSize.width,
        canvasSize.height,
        wireLabelIndices(geometry.positions.length),
      ))
    }
  }, [camera, canvasSize.height, canvasSize.width, context?.evalError, diffusion, geometry])

  useEffect(() => {
    if (!geometry || geometry.kind !== '3d') return
    let raf = 0
    let last = performance.now()
    const tick = (now: number) => {
      const dt = now - last
      last = now
      const { autoOrbit, dragging, camera: current, setCamera } = useCameraStore.getState()
      if (autoOrbit && !dragging) setCamera(advanceAutoOrbit(current, dt))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [geometry])

  if (!context) return <EmptyMapPane />

  const hasGeometry = geometry !== null && geometry.positions.length > 0
  const labelBox = canvasSize

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 font-mono text-xs text-zinc-500">
      <div ref={containerRef} className="relative shrink-0 border-b border-seam bg-black">
        {hasGeometry ? (
          <div className="relative inline-block max-w-full">
            <canvas ref={canvasRef} data-testid="map-wiring-canvas" className="block max-w-full rounded-sm" />
            {geometry?.kind === '3d' && <OrbitControls canvasRef={canvasRef} showPoleControls={false} />}
            <div className="pointer-events-none absolute inset-0">
              {labels.map((label) => (
                <span
                  key={label.index}
                  style={labelStyle(label, labelBox.width, labelBox.height)}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/70 px-1 py-0.5 text-[9px] font-semibold leading-none text-zinc-200 ring-1 ring-zinc-700/60"
                >
                  {label.label}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex aspect-square w-full items-center justify-center px-6 text-center text-[11px] leading-5 text-zinc-600">
            This map has no successful bake yet.
          </div>
        )}
        {context.evalError && (
          <div className="absolute inset-x-2 bottom-2 rounded border border-red-950/80 bg-red-950/70 px-2 py-1 text-[10px] leading-4 text-red-200">
            Holding last good bake: {context.evalError}
          </div>
        )}
      </div>
      <div className="wire-legend flex shrink-0 items-center gap-2 border-b border-seam px-3 py-2 text-[10px] text-zinc-500">
        <span>1</span>
        <span className="h-1.5 flex-1 rounded-full bg-gradient-to-r from-[#2a2a30] to-[#fbbf24]" />
        <span>{Math.max(1, context.points.length)}</span>
        <span className="ml-1 text-zinc-600">gradient follows wire order</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <SectionTitle icon={<MapIcon size={12} aria-hidden />}>Map</SectionTitle>
        {facts && (
          <div className="mt-1">
            <FactRow label="pixels" value={facts.pixels} />
            <FactRow label="arity" value={facts.arity} />
            <FactRow label="bounds" value={facts.bounds} />
            <FactRow label="source" value={context.readOnly ? 'stock' : 'custom'} />
          </div>
        )}

        <SectionTitle icon={<GitBranch size={12} aria-hidden />}>Used by</SectionTitle>
        <div className="mt-1 space-y-1.5">
          {controllerProfiles.length === 0 ? (
            <div className="rounded border border-zinc-900 bg-zinc-950/50 px-2 py-2 text-[11px] text-zinc-600">
              No controller profiles yet.
            </div>
          ) : (
            <div className="rounded border border-zinc-900 bg-zinc-950/50 px-2 py-2 text-[11px] text-zinc-600">
              Controller profiles do not record map identity yet.
            </div>
          )}
          {patternUsers.length === 0 ? (
            <div className="rounded border border-zinc-900 bg-zinc-950/50 px-2 py-2 text-[11px] text-zinc-600">
              No saved patterns explicitly select this map.
            </div>
          ) : (
            <div className="space-y-1">
              {patternUsers.slice(0, 5).map((pattern) => (
                <div key={pattern.name} className="flex items-center gap-2 rounded border border-zinc-900 bg-zinc-950/50 px-2 py-1.5">
                  <Box size={11} aria-hidden className="text-zinc-600" />
                  <span className="min-w-0 flex-1 truncate text-zinc-400">{pattern.name}</span>
                  <span className="text-[10px] text-structural">pattern</span>
                </div>
              ))}
              {patternUsers.length > 5 && (
                <div className="px-2 text-[10px] text-zinc-600">+{patternUsers.length - 5} more patterns</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
