// Poster-first Gallery card preview (#888). Every card shows a still (its
// "poster"); a small pool of cards nearest the pointer animate live. The
// coordinator decides which cards are live, warm (one-frame poster render), or
// frozen; this component builds and tears down the fast-replay runtime per
// mode and keeps the poster up to date.
//
// State continuity: a card's first activation restores its stored keyframe
// (a scored fast-replay snapshot shipped with the catalogue) when the
// artifact's key matches this runtime; afterwards each freeze keeps an
// in-session snapshot that the next activation restores, so a card that goes
// live again continues exactly where it stopped. Without a matching keyframe
// the card opens at a per-card offset into its first seconds.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { advanceAutoOrbit, DEFAULT_ORBIT } from '@/engine/camera'
import { createRenderer, type Renderer } from '@/engine/renderer'
import {
  createFastReplayRuntime,
  prepareFastReplay,
  type FastReplayRuntime,
  type FastReplaySnapshot,
} from '@/engine/fastReplay'
import {
  GALLERY_KEYFRAME_RANDOM_SEED,
  galleryKeyframeKey,
  galleryKeyframeMatches,
  restoreGalleryKeyframe,
  type GalleryKeyframeArtifact,
} from '@/engine/galleryKeyframes'
import { resolveGalleryThumbnailLayout, galleryThumbnailSettings } from '@/engine/galleryThumbnailLayout'
import { LIBRARIES } from '@/pixelblaze/libs'
import { loadGalleryKeyframe } from '@/pixelblaze/stock/galleryKeyframes'
import { galleryCardWarmed, registerGalleryLiveCard, type GalleryLiveMode } from './galleryLiveCoordinator'

/** Without a stored keyframe, a card's first frame comes from a per-card
 * offset into the Pattern's opening seconds so the page does not open on a
 * wall of identical dark frame-zeros. Deterministic per card index. */
export const GALLERY_START_OFFSET_SPAN_MS = 2000
export function galleryStartOffsetMs(index: number): number {
  return (index * 7919) % GALLERY_START_OFFSET_SPAN_MS
}

/** Warm renders step forward this many times looking for a lit frame. */
const WARM_POSTER_ATTEMPTS = 4
const WARM_POSTER_STEP_MS = 250
/** Live frames never advance the Pattern by more than this per rAF tick. */
const MAX_LIVE_DELTA_MS = 100

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
  const runtimeRef = useRef<FastReplayRuntime | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const repaintRef = useRef<(() => void) | null>(null)
  const generationRef = useRef(0)
  const drawRef = useRef<
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }
    | null
  >(null)
  const widthRef = useRef(240)
  /** In-session state from the last freeze; restored on the next activation. */
  const resumeSnapshotRef = useRef<FastReplaySnapshot | null>(null)
  /** Stored keyframe for this Pattern, or null once the lookup settled empty. */
  const keyframeRef = useRef<GalleryKeyframeArtifact | null>(null)
  /** The keyframe lookup runs on first activation, not on mount, so only cards
   * that actually render fetch their artifact. */
  const [keyframeSettled, setKeyframeSettled] = useState(false)
  const keyframeLookupStartedRef = useRef(false)
  // The 3D orbit persists across pool grants so a card resumes its view.
  const cameraRef = useRef(DEFAULT_ORBIT)
  const [mode, setMode] = useState<GalleryLiveMode>('frozen')
  const [error, setError] = useState<string | null>(null)
  const reducedMotion = usePrefersReducedMotion()

  const granted = (mode === 'live' || mode === 'warm') && error === null
  const active = granted && keyframeSettled

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    return registerGalleryLiveCard(name, host, setMode, true)
  }, [name])

  useEffect(() => {
    if (!granted || keyframeLookupStartedRef.current) return
    keyframeLookupStartedRef.current = true
    let unmounted = false
    loadGalleryKeyframe(name).then((artifact) => {
      if (unmounted) return
      keyframeRef.current = artifact
      setKeyframeSettled(true)
    })
    return () => {
      unmounted = true
    }
  }, [granted, name])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const lightSize = galleryThumbnailSettings(name).lightSize

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
        renderer.resize2D({ containerWidth: nextWidth, lightSize })
      }
      repaintRef.current?.()
    }
    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [name])

  useLayoutEffect(() => {
    const canvas = glCanvasRef.current
    if (!canvas || !active) return
    const generation = generationRef.current + 1
    generationRef.current = generation
    // Visibility is DOM-direct: the canvas reveals on its first paint.
    canvas.style.opacity = '0'
    canvas.style.visibility = 'hidden'
    let paintedOnce = false

    // Copy the GL canvas into the poster canvas. Valid only synchronously after
    // a paint in the same task: the drawing buffer is not preserved across
    // composites. A blank capture never replaces a lit poster.
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
      if (previousPoster && isBlank(ctx, poster.width, poster.height)) {
        ctx.putImageData(previousPoster, 0, 0)
        return false
      }
      // DOM-direct so a freeze never waits on a React commit.
      poster.style.opacity = '1'
      poster.dataset.hasPoster = 'true'
      return true
    }

    let rafId: number | null = null
    try {
      const prepared = prepareFastReplay(src, LIBRARIES)
      const { settings, layout } = resolveGalleryThumbnailLayout(name, prepared)
      const runtime = createFastReplayRuntime(prepared, {
        mapPoints: layout.mapPoints,
        randomSeed: GALLERY_KEYFRAME_RANDOM_SEED,
        fidelity: 'fast',
      })
      runtimeRef.current = runtime

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
      let camera = cameraRef.current
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

      let lastFrame: Float64Array | null = null
      const paintFrame = (frame: Float64Array, advanceCamera: boolean) => {
        if (generationRef.current !== generation) return
        if (layout.draw.kind === '3d') {
          const now = performance.now()
          if (advanceCamera) camera = advanceAutoOrbit(camera, now - lastCameraTs)
          lastCameraTs = now
          cameraRef.current = camera
          renderer.setCamera(camera)
        }
        lastFrame = frame
        renderer.paint(frame, settings.brightness, false)
        if (!paintedOnce) {
          paintedOnce = true
          canvas.style.visibility = 'visible'
          canvas.style.opacity = '1'
        }
      }
      repaintRef.current = () => {
        if (lastFrame) paintFrame(lastFrame, false)
      }

      // Establish the starting state: in-session resume, stored keyframe, or
      // the per-card opening offset.
      const resume = resumeSnapshotRef.current
      const keyframe = keyframeRef.current
      const key = galleryKeyframeKey({
        code: prepared.code,
        mapPoints: layout.mapPoints,
        randomSeed: GALLERY_KEYFRAME_RANDOM_SEED,
      })
      if (resume && resume.frame.length === layout.mapPoints.length * 3) {
        runtime.renderCurrentFrame()
        runtime.restore(resume)
        paintFrame(runtime.renderCurrentFrame().frame, false)
      } else if (galleryKeyframeMatches(keyframe, key) && keyframe.pixelCount === layout.mapPoints.length) {
        restoreGalleryKeyframe(runtime, keyframe)
        paintFrame(runtime.renderCurrentFrame().frame, false)
      } else {
        const offset = galleryStartOffsetMs(index)
        paintFrame(runtime.advanceLive(offset).frame, false)
      }

      if (mode === 'warm') {
        // Some Patterns open dark; step forward a few frames for a lit poster.
        for (let attempt = 0; attempt < WARM_POSTER_ATTEMPTS; attempt++) {
          if (capturePoster() && !isBlankPoster(posterCanvasRef.current)) break
          paintFrame(runtime.advanceLive(WARM_POSTER_STEP_MS).frame, false)
        }
        galleryCardWarmed(name)
      } else if (!reducedMotion) {
        let lastTs: number | null = null
        const tick = (ts: number) => {
          rafId = null
          if (generationRef.current !== generation) return
          const delta = lastTs === null ? 0 : Math.min(MAX_LIVE_DELTA_MS, ts - lastTs)
          lastTs = ts
          try {
            paintFrame(runtime.advanceLive(delta * settings.speed).frame, true)
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            galleryCardWarmed(name)
            return
          }
          rafId = requestAnimationFrame(tick)
        }
        rafId = requestAnimationFrame(tick)
      }

      return () => {
        if (rafId !== null) cancelAnimationFrame(rafId)
        // Freeze: keep the current frame as the poster and the runtime state
        // for the next activation. This must run before the generation bump,
        // which makes paintFrame ignore further paints.
        try {
          repaintRef.current?.()
          if (capturePoster()) galleryCardWarmed(name)
          resumeSnapshotRef.current = runtime.snapshot()
        } catch {
          // A lost context leaves the previous poster and state in place.
        }
        generationRef.current += 1
        canvas.style.opacity = '0'
        canvas.style.visibility = 'hidden'
        runtimeRef.current = null
        rendererRef.current = null
        repaintRef.current = null
        drawRef.current = null
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
  }, [src, active, mode, reducedMotion, name, index])

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
          className="absolute inset-0 h-full w-full transition-opacity duration-75"
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
