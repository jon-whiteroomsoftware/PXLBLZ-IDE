// PROTOTYPE (#894) — throwaway. A Show marquee band at the top of the Gallery
// grid on `?prototype=gallery-show-band&cols=4&px=2000&show=<id>`, dev only.
// The band runs a real compiled stock Show through the fast-replay runtime on
// its own stage map so proportions, pixel count, and cost can be judged
// against real Gallery cards (which use the landed live pool untouched).
import { useEffect, useMemo, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { DEFAULT_ORBIT, advanceAutoOrbit } from '@/engine/camera'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { GALLERY_PATTERNS, GALLERY_ALL_CATEGORY, type GalleryPattern } from '@/engine/galleryCatalog'
import { applyNormalizeMode, type MapPoint } from '@/engine/maps'
import { createRenderer } from '@/engine/renderer'
import { DEV_DEFAULTS } from '@/engine/settings'
import { showLoopDurationMs } from '@/engine/showModel'
import { compileShowForPreview, resolveShowCompilationControllerZones } from '@/engine/showPreviewArtifact'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { resolveMap } from '@/store/mapStore'
import { GalleryLivePreview } from './GalleryLivePreview'

const GALLERY_SHOWS: { id: string; byline: string; premise: string }[] = [
  {
    id: 'stock-show-remix-overture',
    byline: 'by PXLBLZ',
    premise: 'An opening movement across the whole stage: themes introduced one at a time, then played together.',
  },
  {
    id: 'stock-show-remix-quadrille',
    byline: 'by PXLBLZ, with Wavy Bands and Line Dancer 2D by ZRanger1',
    premise: 'Four mirrored quarters, rejoined for the finale. Two Pattern instances, one compiled Pattern.',
  },
  {
    id: 'stock-show-showcase-redline-installation',
    byline: 'by PXLBLZ, with Harmonograph',
    premise: 'One Harmonograph render drives five surfaces: a panel in the middle and four radial blooms around it.',
  },
  {
    id: 'stock-show-remix-coronal-mass-ejection',
    byline: 'by PXLBLZ, with Coronal Mass Ejection by ZRanger1',
    premise: 'A quiet corona, a building flare, and the ejection itself, timed as one arc.',
  },
]

const PX_OPTIONS = [500, 1000, 2000, 4000]
const SHOW_BAND_DIFFUSION = 0.8

function stableShowSeed(showId: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < showId.length; index += 1) {
    hash = Math.imul((hash ^ showId.charCodeAt(index)) >>> 0, 0x01000193)
  }
  return hash >>> 0
}

function readParam(name: string, fallback: string): string {
  return new URLSearchParams(window.location.search).get(name) ?? fallback
}

function writeParam(name: string, value: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(name, value)
  window.history.replaceState(window.history.state, '', url)
}

interface StageGeometry {
  mapId: string
  dim: number
  mapPoints: MapPoint[]
  /** Width over height of the stage's position bounds (1 for 3D). */
  aspect: number
}

/** The band's geometry is known before the runtime exists, so the box can take
 * the stage's natural shape and the renderer can fit it exactly. */
function resolveStageGeometry(showId: string, pixelCount: number): StageGeometry {
  const stock = stockShowById(showId)
  if (!stock) throw new Error(`No stock Show ${showId}`)
  const show = stock.show
  const map = resolveMap(show.stageMapId ?? 'plane', [])
  const resolved = applyNormalizeMode(map.resolve(Math.max(1, pixelCount)), 'contain')
  const mapPoints: MapPoint[] = resolved.map((point) => {
    const raw = point.pos ?? point.sample
    const pos = map.dim === 3
      ? ([raw[0] ?? 0.5, raw[1] ?? 0.5, raw[2] ?? 0.5] as [number, number, number])
      : ([raw[0] ?? 0.5, raw[1] ?? 0.5] as [number, number])
    return { sample: [...pos], pos } as MapPoint
  })
  let aspect = 1
  if (map.dim !== 3) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
    for (const point of mapPoints) {
      const [x, y] = point.pos as [number, number]
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    }
    aspect = maxY > minY && maxX > minX ? (maxX - minX) / (maxY - minY) : 1
  }
  return { mapId: map.id, dim: map.dim, mapPoints, aspect }
}

/** Always-live Show preview (no pool) with an FPS readout. */
function ShowBandPreview({
  showId,
  geometry,
  width,
  height,
  onStats,
}: {
  showId: string
  geometry: StageGeometry
  width: number
  height: number
  onStats: (stats: { fps: number; pixels: number; dim: number; compileMs: number; frameMax: number; frameMean: number }) => void
}) {
  const hostRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const host = hostRef.current
    if (!canvas || !host) return
    let rafId: number | null = null
    let disposed = false
    try {
      const stock = stockShowById(showId)
      if (!stock) throw new Error(`No stock Show ${showId}`)
      const show = stock.show
      const { mapPoints, dim } = geometry
      const map = { dim }
      const t0 = performance.now()
      const compiled = compileShowForPreview(show, [], resolveShowCompilationControllerZones(show), {}, {
        stageDimension: dim as 1 | 2 | 3,
      })
      const compileMs = performance.now() - t0
      if (!compiled.artifact) throw new Error(compiled.error ?? 'Show did not compile')
      const artifact = compiled.artifact
      const runtime = createFastReplayRuntime(
        {
          code: artifact.code,
          fxCode: artifact.fxCode,
          metadata: artifact.metadata,
          dimension: map.dim === 3 ? 3 : 2,
        },
        { mapPoints, randomSeed: stableShowSeed(showId), fidelity: 'fast' },
      )
      const params = new URLSearchParams(window.location.search)
      const lightSize = Number(params.get('ls') ?? DEV_DEFAULTS.lightSize)
      // Shows read best smoothed; default above the Pattern default of 0.5.
      const diffusion = Number(params.get('df') ?? SHOW_BAND_DIFFUSION)
      const brightness = Number(params.get('br') ?? 1)
      // StrictMode runs mount effects twice; losing the context in the first
      // cleanup would blank the second renderer. Prototype keeps the context.
      const loseOnCleanup = params.get('lose') === '1'
      const renderer = createRenderer(canvas, { containerWidth: width, containerHeight: height, lightSize })
      let camera = DEFAULT_ORBIT
      let lastCameraTs = performance.now()
      if (map.dim === 3) {
        renderer.set3DPositions(mapPoints.map((p) => p.pos as [number, number, number]), {
          canvasPx: Math.round(width * 0.625),
          normals: null,
        })
        renderer.setCamera(camera)
        renderer.setSolidity(DEV_DEFAULTS.solidity)
      } else {
        renderer.set2DPositions(mapPoints.map((p) => p.pos as [number, number]), {
          containerWidth: width,
          containerHeight: height,
          lightSize,
        })
      }
      renderer.setDiffusion(diffusion)

      let lastTs: number | null = null
      let windowStart: number | null = null
      let frames = 0
      const tick = (ts: number) => {
        rafId = null
        if (disposed) return
        const delta = lastTs === null ? 0 : Math.min(100, ts - lastTs)
        lastTs = ts
        if (map.dim === 3) {
          const now = performance.now()
          camera = advanceAutoOrbit(camera, now - lastCameraTs)
          lastCameraTs = now
          renderer.setCamera(camera)
        }
        let result
        try {
          result = runtime.advanceLive(delta)
          renderer.paint(result.frame, brightness, false)
        } catch (err) {
          setError(`tick: ${err instanceof Error ? err.message : String(err)}`)
          return
        }
        if (windowStart === null) windowStart = ts
        else {
          frames += 1
          if (ts - windowStart >= 500) {
            let max = 0
            let sum = 0
            for (let i = 0; i < result.frame.length; i += 1) {
              const v = result.frame[i]
              if (v > max) max = v
              sum += v
            }
            onStats({ fps: (frames * 1000) / (ts - windowStart), pixels: mapPoints.length, dim: map.dim, compileMs, frameMax: max, frameMean: sum / result.frame.length })
            windowStart = ts
            frames = 0
          }
        }
        rafId = requestAnimationFrame(tick)
      }
      rafId = requestAnimationFrame(tick)
      return () => {
        disposed = true
        if (rafId !== null) cancelAnimationFrame(rafId)
        if (loseOnCleanup) canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => setError(message))
    }
  }, [showId, geometry, width, height, onStats])

  return (
    <div ref={hostRef} className="absolute inset-0 bg-black">
      <canvas ref={canvasRef} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
      {error && (
        <div className="absolute inset-x-2 bottom-2 rounded border border-red-400/30 bg-red-950/80 px-2 py-1 font-mono text-[10px] text-red-200">
          {error}
        </div>
      )}
    </div>
  )
}

function Sections({ pattern }: { pattern: GalleryPattern }) {
  return (
    <span className="ml-auto flex min-w-0 shrink gap-[5px] text-[9.5px] tracking-wide text-structural">
      {(pattern.sections.length ? pattern.sections : [GALLERY_ALL_CATEGORY]).slice(0, 2).map((section, i) => (
        <span key={section} className="inline-flex gap-[5px]">
          {i > 0 && <span aria-hidden>·</span>}
          <span className="truncate">{section.toLowerCase()}</span>
        </span>
      ))}
    </span>
  )
}

function PatternCard({ pattern, index }: { pattern: GalleryPattern; index: number }) {
  const strip = pattern.dim === 1
  return (
    <button
      type="button"
      className={[
        'group relative min-w-0 overflow-hidden rounded-[4px] bg-black text-left transition-shadow hover:ring-1 hover:ring-live/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-live/70',
        strip ? 'min-h-[96px] md:col-span-2' : 'aspect-square',
      ].join(' ')}
    >
      <GalleryLivePreview name={pattern.name} src={pattern.src} index={index} />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent px-[9px] pb-[7px] pt-7 font-mono">
        <div className="flex min-w-0 items-baseline gap-[6px]">
          <span className="min-w-0 truncate text-[11.5px] text-zinc-100">{pattern.name}</span>
          <span className="shrink-0 text-[9.5px] uppercase tracking-[0.08em] text-zinc-400">{pattern.dim}D</span>
          <Sections pattern={pattern} />
        </div>
      </div>
    </button>
  )
}

const GRID_BY_COLS: Record<number, string> = {
  2: 'md:grid-cols-2 gap-x-6 gap-y-[30px]',
  3: 'md:grid-cols-3 gap-x-[18px] gap-y-6',
  4: 'md:grid-cols-4 gap-x-[18px] gap-y-[18px]',
}

function ShowBand({
  cols,
  entry,
  pixelCount,
  gridWidth,
  onStats,
}: {
  cols: number
  entry: (typeof GALLERY_SHOWS)[number]
  pixelCount: number
  gridWidth: number
  onStats: Parameters<typeof ShowBandPreview>[0]['onStats']
}) {
  const stock = stockShowById(entry.id)
  const show = stock?.show
  const durationS = show ? Math.round(showLoopDurationMs(show) / 1000) : 0
  const geometry = useMemo(() => resolveStageGeometry(entry.id, pixelCount), [entry.id, pixelCount])
  // Capped by height: every band is the same height (set so the wide
  // installation stages fill ~70% of the grid width), and the width follows
  // each stage's natural aspect. Square stages come out narrower.
  const params = new URLSearchParams(window.location.search)
  const heightRatio = Number(params.get('hr') ?? 0.4)
  const bandHeight = Math.round(gridWidth * heightRatio)
  const width = Math.round(Math.min(bandHeight * geometry.aspect, gridWidth * 0.7))
  const height = Math.round(width / geometry.aspect)
  return (
    <div className={`col-span-full flex min-w-0 items-center ${cols === 2 ? 'gap-6' : 'gap-[18px]'}`}>
      <a
        href="#"
        onClick={(e) => e.preventDefault()}
        style={{ width, height }}
        className="group relative shrink-0 overflow-hidden rounded-[4px] bg-black transition-shadow hover:ring-1 hover:ring-live/60"
      >
        <ShowBandPreview showId={entry.id} geometry={geometry} width={width} height={height} onStats={onStats} />
        <span className="pointer-events-none absolute left-[9px] top-[8px] rounded border border-live/35 bg-zinc-950/75 px-[6px] py-[2px] font-mono text-[9.5px] uppercase tracking-[0.08em] text-live">
          Show
        </span>
      </a>
      {/* Caption width: no wider than ~62% of the preview it describes. */}
      <div className="flex min-w-0 flex-col justify-center gap-2 px-1 font-mono" style={{ maxWidth: Math.round(width * 0.62) }}>
        <div className="text-[15px] text-zinc-100">
          <em>{stock?.name ?? entry.id}</em>
          <span className="text-[11.5px] text-zinc-400"> {entry.byline}</span>
        </div>
        <p className="text-[12.5px] leading-relaxed text-zinc-300">{entry.premise}</p>
        <div className="flex flex-wrap gap-3 text-[10px] uppercase tracking-[0.08em] text-structural">
          <span>{durationS}s loop</span>
          <span>{show?.scenes.length ?? 0} scenes</span>
          <span>{show?.zones.length ?? 0} zones</span>
          <span>{stock?.track}</span>
        </div>
      </div>
    </div>
  )
}

export function GalleryShowBandPrototype() {
  const [cols, setColsState] = useState(() => Number(readParam('cols', '4')) || 4)
  const [pixelCount, setPxState] = useState(() => Number(readParam('px', '2000')) || 2000)
  /** Pattern cards placed before the band: 0 = the band is the hero. */
  const [heroAfter, setHeroAfterState] = useState(() => Number(readParam('hero', '0')) || 0)
  const setHeroAfter = (n: number) => { writeParam('hero', String(n)); setHeroAfterState(n) }
  const [showIndex, setShowIndexState] = useState(() => {
    const id = readParam('show', GALLERY_SHOWS[0].id)
    return Math.max(0, GALLERY_SHOWS.findIndex((s) => s.id === id))
  })
  const [stats, setStats] = useState<{ fps: number; pixels: number; dim: number; compileMs: number; frameMax: number; frameMean: number } | null>(null)
  const setCols = (n: number) => { writeParam('cols', String(n)); setColsState(n) }
  const setPx = (n: number) => { writeParam('px', String(n)); setPxState(n) }
  const setShowIndex = (i: number) => {
    const next = (i + GALLERY_SHOWS.length) % GALLERY_SHOWS.length
    writeParam('show', GALLERY_SHOWS[next].id)
    setShowIndexState(next)
  }
  const entry = GALLERY_SHOWS[showIndex]
  const patterns = GALLERY_PATTERNS.slice(0, 16)
  const gridRef = useRef<HTMLDivElement>(null)
  const [gridWidth, setGridWidth] = useState(1100)
  useEffect(() => {
    const grid = gridRef.current
    if (!grid) return
    const measure = () => {
      const style = getComputedStyle(grid)
      const inner = grid.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight)
      setGridWidth(inner)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(grid)
    return () => ro.disconnect()
  }, [cols])

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="overflow-auto" data-gallery-scrollport>
        <div className="mx-auto flex max-w-[1180px] items-baseline gap-3 px-4 pt-5 font-mono sm:px-[22px]">
          <span className="text-[19px] font-semibold text-zinc-100">Gallery</span>
          <span className="text-[10.5px] text-structural">show band prototype · #894</span>
        </div>
        <div ref={gridRef} className={`mx-auto grid max-w-[1180px] grid-flow-dense grid-cols-1 px-4 pb-[26px] pt-4 sm:px-[22px] ${GRID_BY_COLS[cols] ?? GRID_BY_COLS[4]}`}>
          {patterns.slice(0, heroAfter).map((pattern, index) => (
            <PatternCard key={pattern.name} pattern={pattern} index={index} />
          ))}
          <ShowBand cols={cols} entry={entry} pixelCount={pixelCount} gridWidth={gridWidth} onStats={setStats} />
          {patterns.slice(heroAfter).map((pattern, index) => (
            <PatternCard key={pattern.name} pattern={pattern} index={heroAfter + index} />
          ))}
        </div>
      </main>
      <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-amber-400/50 bg-zinc-950/95 px-3 py-1 font-mono text-[11px] text-amber-200 shadow-[0_4px_24px_rgba(0,0,0,0.6)]">
        <button type="button" onClick={() => setShowIndex(showIndex - 1)} className="rounded-full p-1 hover:bg-zinc-800" aria-label="Previous Show"><ChevronLeft size={14} /></button>
        <span>{stockShowById(entry.id)?.name}</span>
        <button type="button" onClick={() => setShowIndex(showIndex + 1)} className="rounded-full p-1 hover:bg-zinc-800" aria-label="Next Show"><ChevronRight size={14} /></button>
        <span className="flex items-center gap-1 border-l border-amber-400/30 pl-2">
          cols
          {[2, 3, 4].map((n) => (
            <button key={n} type="button" aria-pressed={cols === n} onClick={() => setCols(n)} className={`rounded px-[6px] py-[1px] ${cols === n ? 'bg-amber-400/25 text-amber-100' : 'hover:bg-zinc-800'}`}>{n}</button>
          ))}
        </span>
        <span className="flex items-center gap-1 border-l border-amber-400/30 pl-2">
          hero
          {[0, 1, 2].map((rows) => (
            <button key={rows} type="button" aria-pressed={heroAfter === rows * cols} onClick={() => setHeroAfter(rows * cols)} className={`rounded px-[6px] py-[1px] ${heroAfter === rows * cols ? 'bg-amber-400/25 text-amber-100' : 'hover:bg-zinc-800'}`}>{rows === 0 ? 'first' : `after ${rows}`}</button>
          ))}
        </span>
        <span className="flex items-center gap-1 border-l border-amber-400/30 pl-2">
          px
          {PX_OPTIONS.map((n) => (
            <button key={n} type="button" aria-pressed={pixelCount === n} onClick={() => setPx(n)} className={`rounded px-[6px] py-[1px] ${pixelCount === n ? 'bg-amber-400/25 text-amber-100' : 'hover:bg-zinc-800'}`}>{n}</button>
          ))}
        </span>
        <span className="border-l border-amber-400/30 pl-2 text-zinc-400">
          {stats ? `${stats.pixels}px ${stats.dim}D · ${stats.fps.toFixed(0)} fps · compile ${stats.compileMs.toFixed(0)}ms · frame max ${stats.frameMax.toFixed(2)} mean ${stats.frameMean.toFixed(3)}` : 'starting…'}
        </span>
      </div>
    </div>
  )
}
