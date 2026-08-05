import { useEffect, useMemo, useRef, useState } from 'react'
import { Box, GitBranch, Lock, Map as MapIcon, SlidersHorizontal } from 'lucide-react'
import {
  explicitPatternMapUsers,
  labelStyle,
  mapFacts,
  wireGeometry,
  wireOrderColors,
} from '@/engine/mapContext'
import {
  prepareMapDiagnosticGeometry,
  projectMapDiagnosticGeometry,
} from '@/engine/mapDiagnosticViewport'
import { paintMapDiagnosticCanvas } from '@/engine/mapDiagnosticRenderer'
import type { GridDims, MapPoint } from '@/engine/maps'
import type { MapImportMetadata } from '@/engine/personalContentRecords'
import { useCameraStore } from '@/store/cameraStore'
import {
  defaultPixelCountForDim,
  mapFromRecord,
  resolveMap,
  useMapStore,
} from '@/store/mapStore'
import { usePatternStore } from '@/store/patternStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
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
  countMode: 'fixed' | 'preview' | 'baked'
  importMetadata?: MapImportMetadata
}

function svgColor([red, green, blue]: [number, number, number]): string {
  return `rgb(${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)})`
}

function resolveOpenMapContext(
  editingMap: ReturnType<typeof useMapStore.getState>['editingMap'],
  userMaps: ReturnType<typeof useMapStore.getState>['userMaps'],
  activePixelCount: ReturnType<typeof useMapStore.getState>['activePixelCount'],
  mapEvalError: ReturnType<typeof useMapStore.getState>['mapEvalError'],
): OpenMapContext | null {
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
      countMode: map.fixedPixelCount !== undefined ? 'fixed' : 'preview',
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
      countMode: map.fixedPixelCount !== undefined ? 'fixed' : 'preview',
      importMetadata: record.importMetadata,
    }
  }
  const points = (record.points ?? []).map((coord) => ({
    sample: [...coord],
    ...(record.dim === 1 ? {} : { pos: [...coord] as MapPoint['pos'] }),
  }))
  return {
    id: record.id,
    name: record.name,
    dim: record.dim,
    points,
    gridDims: record.gridDims ?? null,
    evalError: mapEvalError,
    readOnly: false,
    countMode: 'baked',
    importMetadata: record.importMetadata,
  }
}

function formatImportDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function FactRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-zinc-900/80 py-1.5">
      <span className="text-zinc-500">{label}</span>
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

function MapCountStatus({ context }: { context: OpenMapContext }) {
  const count = context.points.length.toLocaleString()
  if (context.countMode === 'fixed') {
    const title = `This map always contains ${count} coordinates. Changing Preview pixel count cannot resize it.`
    return (
      <span
        aria-label={`Fixed size: ${count} pixels`}
        title={title}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-zinc-300"
      >
        <Lock size={10} aria-hidden />
        Fixed size · {count} px
      </span>
    )
  }
  if (context.countMode === 'baked') {
    const title = `This custom map uses its last ${count}-point bake. Edit its source to create a new bake.`
    return (
      <span
        aria-label={`Baked size: ${count} pixels`}
        title={title}
        className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-zinc-400"
      >
        <Box size={10} aria-hidden />
        Baked size · {count} px
      </span>
    )
  }
  const title = `This map generates one coordinate per Preview pixel. Change Pixel count in Preview to regenerate it.`
  return (
    <span
      aria-label={`Preview size: ${count} pixels`}
      title={title}
      className="inline-flex shrink-0 items-center gap-1 rounded border border-zinc-700/80 bg-zinc-900/80 px-1.5 py-0.5 text-[10px] text-zinc-400"
    >
      <SlidersHorizontal size={10} aria-hidden />
      Preview size · {count} px
    </span>
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
        <p className="mt-2 text-xs leading-5 text-zinc-500">Select a map from the rail.</p>
      </div>
    </div>
  )
}

export function MapContextPane() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerWidth, setContainerWidth] = useState(320)
  const editingMap = useMapStore((s) => s.editingMap)
  const userMaps = useMapStore((s) => s.userMaps)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const mapEvalError = useMapStore((s) => s.mapEvalError)
  const camera = useCameraStore((s) => s.camera)
  const userPatterns = usePatternStore((s) => s.userPatterns)
  const controllerProfiles = useControllerProfileStore((s) => s.profiles)
  const context = useMemo(
    () => resolveOpenMapContext(editingMap, userMaps, activePixelCount, mapEvalError),
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
  const diagnosticGeometry = useMemo(() => {
    if (!geometry) return null
    return prepareMapDiagnosticGeometry({
      positions: geometry.positions,
      displayDimension: geometry.displayDim,
    })
  }, [geometry])
  const diagnosticViewport = useMemo(() => {
    if (!diagnosticGeometry || containerWidth <= 0) return null
    return projectMapDiagnosticGeometry({
      geometry: diagnosticGeometry,
      containerWidth,
      camera,
    })
  }, [camera, containerWidth, diagnosticGeometry])
  const wireColors = useMemo(
    () => (geometry ? wireOrderColors(geometry.positions.length) : []),
    [geometry],
  )
  const labels = diagnosticViewport?.labels ?? []

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
    if (!canvas || !geometry || geometry.kind !== '3d' || !diagnosticViewport) return
    paintMapDiagnosticCanvas(
      canvas,
      diagnosticViewport,
      wireColors,
      context?.evalError !== null,
    )
  }, [context?.evalError, diagnosticViewport, geometry, wireColors])

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
  const labelBox = diagnosticViewport ?? { width: 1, height: 1 }
  const overlapSummary = diagnosticViewport?.coordinateSummary

  return (
    <div className="flex h-full min-h-0 flex-col bg-zinc-950 font-mono text-xs text-zinc-500">
      <div className="flex h-9 shrink-0 items-center gap-3 border-b border-seam bg-panel/40 px-3">
        <h2 className="min-w-0 flex-1 truncate text-[11px] font-semibold text-zinc-300" title={context.name}>
          {context.name}
        </h2>
        <MapCountStatus context={context} />
      </div>
      <div
        ref={containerRef}
        data-testid="map-wiring-viewport"
        className="relative w-full shrink-0 overflow-hidden border-b border-seam bg-black"
        style={diagnosticViewport
          ? { aspectRatio: `${diagnosticViewport.width} / ${diagnosticViewport.height}` }
          : undefined}
      >
        {hasGeometry && diagnosticViewport ? (
          geometry?.kind === '2d' ? (
            <>
              <svg
                data-testid="map-wiring-geometry"
                aria-label={`Physical map geometry: ${context.points.length.toLocaleString()} LEDs`}
                className="block size-full"
                viewBox={`0 0 ${diagnosticViewport.width} ${diagnosticViewport.height}`}
                preserveAspectRatio="xMidYMid meet"
              >
                <title>{`Physical map geometry: ${context.points.length.toLocaleString()} LEDs`}</title>
                {diagnosticViewport.points.map((point, index) => (
                  <circle
                    key={index}
                    cx={point.x}
                    cy={point.y}
                    r={diagnosticViewport.pointDiameterPx / 2}
                    fill={svgColor(wireColors[index])}
                    opacity="0.95"
                  />
                ))}
              </svg>
              <div className="pointer-events-none absolute inset-0">
                {labels.map((label) => (
                  <span
                    key={label.index}
                    style={labelStyle(label, labelBox.width, labelBox.height)}
                    className="absolute -translate-x-1/2 -translate-y-1/2 rounded bg-black/75 px-1 py-0.5 text-[9px] font-semibold leading-none text-zinc-200 ring-1 ring-zinc-700/60"
                  >
                    {label.label}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="relative size-full">
              <canvas ref={canvasRef} data-testid="map-wiring-canvas" className="block size-full rounded-sm" />
              <OrbitControls canvasRef={canvasRef} showPoleControls={false} />
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
          )
        ) : (
          <div className="flex aspect-[2/1] w-full items-center justify-center px-6 text-center text-[11px] leading-5 text-zinc-500">
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
        <span className="ml-1 text-zinc-500">gradient follows wire order</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        <SectionTitle icon={<MapIcon size={12} aria-hidden />}>Map</SectionTitle>
        {facts && (
          <div className="mt-1">
            <FactRow label="pixels" value={facts.pixels} />
            <FactRow label="unique positions" value={overlapSummary?.uniquePointCount ?? facts.pixels} />
            <FactRow
              label="overlaps"
              value={overlapSummary && overlapSummary.overlappingPointCount > 0
                ? `${overlapSummary.overlappingPointCount} at ${overlapSummary.overlapLocationCount} ${overlapSummary.overlapLocationCount === 1 ? 'position' : 'positions'}`
                : 'none'}
            />
            <FactRow label="arity" value={facts.arity} />
            <FactRow label="bounds" value={facts.bounds} />
            <FactRow
              label="source"
              value={context.importMetadata ? 'controller import' : context.readOnly ? 'stock' : 'custom'}
            />
          </div>
        )}

        {context.importMetadata && (
          <>
            <SectionTitle icon={<MapIcon size={12} aria-hidden />}>Imported</SectionTitle>
            <div className="mt-1">
              <FactRow label="device" value={context.importMetadata.controllerName} />
              {context.importMetadata.ip && <FactRow label="last IP" value={context.importMetadata.ip} />}
              {context.importMetadata.deviceId && <FactRow label="device ID" value={context.importMetadata.deviceId} />}
              <FactRow label="imported" value={formatImportDate(context.importMetadata.importedAt)} />
              <FactRow label="normalization" value="device fill" />
            </div>
          </>
        )}

        <SectionTitle icon={<GitBranch size={12} aria-hidden />}>Used by</SectionTitle>
        <div className="mt-1 space-y-1.5">
          {controllerProfiles.length === 0 ? (
            <div className="rounded border border-zinc-900 bg-zinc-950/50 px-2 py-2 text-[11px] text-zinc-500">
              No controller profiles yet.
            </div>
          ) : (
            <div className="rounded border border-zinc-900 bg-zinc-950/50 px-2 py-2 text-[11px] text-zinc-500">
              Controller profiles do not record map identity yet.
            </div>
          )}
          {patternUsers.length === 0 ? (
            <div className="rounded border border-zinc-900 bg-zinc-950/50 px-2 py-2 text-[11px] text-zinc-500">
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
                <div className="px-2 text-[10px] text-zinc-500">+{patternUsers.length - 5} more patterns</div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
