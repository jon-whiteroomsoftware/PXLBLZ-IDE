// Poster-first Gallery card preview (#888). Every card shows a still (its
// "poster"); a small pool of cards nearest the pointer animate live. The
// coordinator decides which cards are live, warm (one-frame poster render), or
// frozen; this component builds and tears down the runtime per mode and keeps
// the poster up to date. A frozen card remembers its virtual time and resumes
// from it, so a card that goes live again continues rather than restarting.
// Stored keyframe snapshots will later pre-populate the poster and resume time.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { bundle } from '@/engine/bundle'
import { advanceAutoOrbit, DEFAULT_ORBIT } from '@/engine/camera'
import { createRenderer, type Renderer } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createShim } from '@/engine/shim'
import { createVirtualClock } from '@/engine/virtualClock'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { selectRenderCompatibility } from '@/engine/renderCompatibility'
import { resolveLayout } from '@/engine/layout'
import { GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS, galleryThumbnailPixelCount } from '@/engine/previewPixelCount'
import { DEV_DEFAULTS } from '@/engine/settings'
import type { SurfaceId } from '@/engine/surfaces'
import { LIBRARIES } from '@/pixelblaze/libs'
import { recommendedSettingsFor } from '@/pixelblaze/stock/patterns'
import {
  DEFAULT_MAP_ID,
  DEFAULT_SHAPE_PIXEL_COUNT,
  defaultPixelCountForDim,
  layoutSource,
  resolveMap,
} from '@/store/mapStore'
import { galleryCardWarmed, registerGalleryLiveCard, type GalleryLiveMode } from './galleryLiveCoordinator'

/** Until stored keyframes exist, a card's first frame comes from a per-card
 * offset into the Pattern's opening seconds so the page does not open on a
 * wall of identical dark frame-zeros. Deterministic per card index. */
export const GALLERY_START_OFFSET_SPAN_MS = 2000
export function galleryStartOffsetMs(index: number): number {
  return (index * 7919) % GALLERY_START_OFFSET_SPAN_MS
}

/** Warm renders step forward this many times looking for a lit frame. */
const WARM_POSTER_ATTEMPTS = 4
const WARM_POSTER_STEP_MS = 250

function isBlank(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  if (width === 0 || height === 0) return true
  const data = ctx.getImageData(0, 0, width, height).data
  // Sample every 16th pixel; a poster with any lit sample counts as lit.
  for (let i = 0; i < data.length; i += 64) {
    if (data[i] > 8 || data[i + 1] > 8 || data[i + 2] > 8) return false
  }
  return true
}

function isBlankPoster(poster: HTMLCanvasElement | null): boolean {
  const ctx = poster?.getContext('2d')
  return !poster || !ctx || isBlank(ctx, poster.width, poster.height)
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(media.matches)
    onChange()
    media.addEventListener?.('change', onChange)
    return () => media.removeEventListener?.('change', onChange)
  }, [])

  return reduced
}

export function GalleryLivePreview({ name, src, index }: { name: string; src: string; index: number }) {
  const hostRef = useRef<HTMLDivElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const posterCanvasRef = useRef<HTMLCanvasElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const generationRef = useRef(0)
  const drawRef = useRef<
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }
    | null
  >(null)
  const widthRef = useRef(240)
  const resumeAtMsRef = useRef(galleryStartOffsetMs(index))
  const [mode, setMode] = useState<GalleryLiveMode>('frozen')
  const [error, setError] = useState<string | null>(null)
  const [painted, setPainted] = useState(false)
  const reducedMotion = usePrefersReducedMotion()

  const settings = useMemo(() => ({ ...DEV_DEFAULTS, ...recommendedSettingsFor(name) }), [name])
  const active = (mode === 'live' || mode === 'warm') && error === null

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    return registerGalleryLiveCard(name, host, setMode, true)
  }, [name])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const measure = () => {
      const rect = host.getBoundingClientRect()
      const nextWidth = Math.max(1, Math.round(rect.width || 240))
      if (nextWidth === widthRef.current) return
      widthRef.current = nextWidth

      const renderer = rendererRef.current
      const draw = drawRef.current
      if (!renderer || !draw) return

      if (draw.kind === '3d') {
        renderer.set3DPositions(draw.positions, {
          canvasPx: Math.round(nextWidth * 0.625),
          normals: draw.normals,
        })
      } else {
        renderer.resize2D({
          containerWidth: nextWidth,
          lightSize: settings.lightSize,
        })
      }
      loopRef.current?.renderPreviewFrame()
    }
    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [settings.lightSize])

  useLayoutEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas || !active) return
    const generation = generationRef.current + 1
    generationRef.current = generation
    canvas.style.opacity = '0'
    canvas.style.visibility = 'hidden'
    let paintedOnce = false
    queueMicrotask(() => {
      if (generationRef.current !== generation) return
      setPainted(false)
    })

    // Copy the GL canvas into the poster canvas. Valid only synchronously after
    // a paint in the same task: the drawing buffer is not preserved across
    // composites.
    const capturePoster = () => {
      const poster = posterCanvasRef.current
      if (!poster || !paintedOnce) return false
      const ctx = poster.getContext('2d')
      if (!ctx) return false
      const previousPoster =
        poster.dataset.hasPoster === 'true' && poster.width === canvas.width && poster.height === canvas.height
          ? ctx.getImageData(0, 0, poster.width, poster.height)
          : null
      if (previousPoster === null) delete poster.dataset.hasPoster
      if (poster.width !== canvas.width || poster.height !== canvas.height) {
        poster.width = canvas.width
        poster.height = canvas.height
      }
      ctx.clearRect(0, 0, poster.width, poster.height)
      ctx.drawImage(canvas, 0, 0)
      if (poster.dataset.hasPoster === 'true' && isBlank(ctx, poster.width, poster.height)) {
        // A momentarily dark frame must not replace a lit poster: restore it.
        ctx.putImageData(previousPoster!, 0, 0)
        return false
      }
      // DOM-direct so a freeze never waits on a React commit.
      poster.style.opacity = '1'
      poster.dataset.hasPoster = 'true'
      return true
    }

    try {
      const bundled = bundle(src, LIBRARIES)
      const nativeDim = nativeDimension(bundled.metadata.renderFns)
      const pixelCount = galleryThumbnailPixelCount(
        nativeDim,
        settings.pixelCount,
        defaultPixelCountForDim(nativeDim),
      )
      const source = layoutSource({ userMaps: [] })
      const layout = resolveLayout(
        {
          selection: {
            mapId: settings.mapId,
            shapeId: settings.shapeId,
            surfaceId: settings.surfaceId as SurfaceId,
          },
          nativeDim,
          source,
          persistedCount: pixelCount,
          normalizeMode: settings.normalize,
          poleCols: null,
          shapeDefaultCount: DEFAULT_SHAPE_PIXEL_COUNT,
          maxPixelCount: GALLERY_THUMBNAIL_PIXEL_COUNT_CAPS[nativeDim],
        },
        {
          resolveMap: (mapId) => resolveMap(mapId ?? DEFAULT_MAP_ID, []),
          defaultCountForDim: defaultPixelCountForDim,
        },
      )
      const clock = createVirtualClock()
      const renderCompatibility = selectRenderCompatibility(
        layout.mapDim,
        bundled.metadata.renderFns,
      )
      const shim = createShim({
        mapPoints: layout.mapPoints,
        pixelCount: layout.pixelCount,
        dimensions: layout.mapDim,
        getVirtualTime: () => clock.getTime(),
      })
      const handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)

      const currentWidth = Math.max(
        1,
        Math.round(hostRef.current?.getBoundingClientRect().width || widthRef.current),
      )
      widthRef.current = currentWidth
      const renderer = createRenderer(canvas, {
        containerWidth: currentWidth,
        lightSize: settings.lightSize,
      })
      rendererRef.current = renderer
      let camera = DEFAULT_ORBIT
      let lastCameraTs = performance.now()
      if (layout.draw.kind === '3d') {
        drawRef.current = {
          kind: '3d',
          positions: layout.draw.positions,
          normals: layout.draw.normals,
        }
        renderer.set3DPositions(layout.draw.positions, {
          canvasPx: Math.round(currentWidth * 0.625),
          normals: layout.draw.normals,
        })
        renderer.setCamera(camera)
        renderer.setSolidity(settings.solidity)
      } else {
        drawRef.current = { kind: '2d', positions: layout.draw.positions }
        renderer.set2DPositions(layout.draw.positions, {
          containerWidth: currentWidth,
          lightSize: settings.lightSize,
        })
      }
      renderer.setDiffusion(settings.diffusion)

      const loop = createRenderLoop({
        handle,
        shim,
        clock,
        mapPoints: layout.mapPoints,
        pixelCount: layout.pixelCount,
        renderCompatibility,
        getSpeed: () => settings.speed,
        getBrightness: () => settings.brightness,
        isDimmed: () => false,
        paint: (pixels, brightness, isPreviewDimmed) => {
          if (generationRef.current !== generation) return
          if (layout.draw.kind === '3d') {
            const now = performance.now()
            camera = advanceAutoOrbit(camera, now - lastCameraTs)
            lastCameraTs = now
            renderer.setCamera(camera)
          }
          renderer.paint(pixels, brightness, isPreviewDimmed)
          if (!paintedOnce) {
            paintedOnce = true
            canvas.style.visibility = 'visible'
            canvas.style.opacity = '1'
            setPainted(true)
          }
        },
        onError: (err) => {
          if (generationRef.current !== generation) return
          setError(err.message)
          galleryCardWarmed(name)
        },
      })
      loopRef.current = loop
      // Resume where this card left off (or at its opening offset).
      if (resumeAtMsRef.current > 0) loop.tickHeadless(resumeAtMsRef.current)
      loop.renderPreviewFrame()

      if (mode === 'warm') {
        // Some Patterns open dark; step forward a few frames for a lit poster.
        for (let attempt = 0; attempt < WARM_POSTER_ATTEMPTS; attempt++) {
          if (capturePoster() && !isBlankPoster(posterCanvasRef.current)) break
          loop.tickFrame(WARM_POSTER_STEP_MS)
        }
        galleryCardWarmed(name)
      } else if (!reducedMotion) {
        loop.start()
      }

      return () => {
        loop.stop()
        // Freeze: paint one last frame and keep it as the poster. This must run
        // before the generation bump, which makes the paint callback ignore
        // further paints.
        try {
          loop.renderPreviewFrame()
          if (capturePoster()) galleryCardWarmed(name)
        } catch {
          // A lost context leaves the previous poster in place.
        }
        generationRef.current += 1
        resumeAtMsRef.current = clock.getTime()
        canvas.style.opacity = '0'
        canvas.style.visibility = 'hidden'
        loopRef.current = null
        rendererRef.current = null
        drawRef.current = null
        setPainted(false)
        canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => {
        if (generationRef.current !== generation) return
        setError(message)
      })
      galleryCardWarmed(name)
    }
  }, [src, settings, active, mode, reducedMotion, name])

  return (
    <div ref={hostRef} className="absolute inset-0 bg-black" data-testid="gallery-live-preview" data-gallery-mode={mode}>
      <canvas
        ref={posterCanvasRef}
        aria-hidden
        data-testid="gallery-poster"
        className="absolute inset-0 h-full w-full bg-black opacity-0"
      />
      {active && (
        <canvas
          ref={glCanvasRef}
          aria-label={`${name} live preview`}
          className={`absolute inset-0 h-full w-full transition-opacity duration-75 ${painted ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
      {error && (
        <div className="absolute inset-x-2 bottom-2 rounded border border-red-400/30 bg-red-950/80 px-2 py-1 font-mono text-[10px] text-red-200">
          Preview unavailable
        </div>
      )}
    </div>
  )
}
