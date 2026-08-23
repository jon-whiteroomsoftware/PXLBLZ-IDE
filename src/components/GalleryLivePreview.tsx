// Poster-first Gallery card preview (#888, #894). Every card shows a still (its
// "poster"); the cards nearest the pointer animate live within a pixel
// budget. The coordinator decides which cards are live, warm (one-frame
// poster render), or frozen; this component builds and tears down the
// fast-replay runtime per mode and keeps the poster up to date.
//
// A card's subject is a stock Pattern or a Gallery Show; both resolve through
// gallerySubject.ts to one set of runtime inputs. A Show card also drives a
// loop thermometer: a thin bar along the bottom edge tracking elapsed time
// through the Show's loop.
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
  type FastReplayRuntime,
  type FastReplaySnapshot,
} from '@/engine/fastReplay'
import {
  GALLERY_KEYFRAME_RANDOM_SEED,
  galleryKeyframeMatches,
  restoreGalleryKeyframe,
  type GalleryKeyframeArtifact,
} from '@/engine/galleryKeyframes'
import { gallerySubjectKey, resolveGallerySubject, type GallerySubject } from '@/engine/gallerySubject'
import { loadGalleryKeyframe } from '@/pixelblaze/stock/galleryKeyframes'
import { galleryCardWarmed, registerGalleryLiveCard, type GalleryLiveMode } from './galleryLiveCoordinator'

/** Without a stored keyframe, a card's first frame comes from a per-card
 * offset into the subject's opening seconds so the page does not open on a
 * wall of identical dark frame-zeros. Deterministic per card index. */
export const GALLERY_START_OFFSET_SPAN_MS = 2000
export function galleryStartOffsetMs(index: number): number {
  return (index * 7919) % GALLERY_START_OFFSET_SPAN_MS
}

/** Warm renders step forward this many times looking for a lit frame. */
const WARM_POSTER_ATTEMPTS = 4
const WARM_POSTER_STEP_MS = 250
/** Live frames never advance the subject by more than this per rAF tick. */
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

export function GalleryLivePreview({
  subject,
  index,
  cost,
  loopMs = null,
  label,
}: {
  subject: GallerySubject
  index: number
  /** Estimated pixel cost for live-pool admission. */
  cost: number
  /** Loop length for the thermometer; null hides it. */
  loopMs?: number | null
  /** Accessible name for the live canvas. */
  label: string
}) {
  const key = gallerySubjectKey(subject)
  // The runtime effect keys on the subject's identity string, never on the
  // subject object: a parent re-render must not rebuild a live runtime (and
  // lose its WebGL context under a still-mounted canvas).
  const subjectRef = useRef(subject)
  useEffect(() => {
    subjectRef.current = subject
  }, [subject])
  const hostRef = useRef<HTMLDivElement>(null)
  const glCanvasRef = useRef<HTMLCanvasElement>(null)
  const posterCanvasRef = useRef<HTMLCanvasElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const runtimeRef = useRef<FastReplayRuntime | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const repaintRef = useRef<(() => void) | null>(null)
  const generationRef = useRef(0)
  const drawRef = useRef<
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }
    | null
  >(null)
  const lightSizeRef = useRef(1)
  const widthRef = useRef(240)
  /** In-session state from the last freeze; restored on the next activation. */
  const resumeSnapshotRef = useRef<FastReplaySnapshot | null>(null)
  /** Stored keyframe for this subject, or null once the lookup settled empty. */
  const keyframeRef = useRef<GalleryKeyframeArtifact | null>(null)
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
    return registerGalleryLiveCard(key, host, setMode, true, cost)
  }, [key, cost])

  // The lookup is never cancelled: a grant that lapses while the fetch is in
  // flight must still settle, or the card could never activate again.
  useEffect(() => {
    if (!granted || keyframeLookupStartedRef.current) return
    keyframeLookupStartedRef.current = true
    loadGalleryKeyframe(key).then((artifact) => {
      keyframeRef.current = artifact
      setKeyframeSettled(true)
    })
  }, [granted, key])

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
          containerHeight: Math.max(1, Math.round(rect.height || nextWidth)),
          lightSize: lightSizeRef.current,
        })
      }
      repaintRef.current?.()
    }
    measure()

    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [key])

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
      const resolved = resolveGallerySubject(subjectRef.current)
      const { prepared, mapPoints, draw, look } = resolved
      lightSizeRef.current = look.lightSize
      const runtime = createFastReplayRuntime(prepared, {
        mapPoints,
        randomSeed: GALLERY_KEYFRAME_RANDOM_SEED,
        fidelity: 'fast',
      })
      runtimeRef.current = runtime

      const hostRect = hostRef.current?.getBoundingClientRect()
      const currentWidth = Math.max(1, Math.round(hostRect?.width || widthRef.current))
      const currentHeight = Math.max(1, Math.round(hostRect?.height || currentWidth))
      widthRef.current = currentWidth
      const renderer = createRenderer(canvas, {
        containerWidth: currentWidth,
        containerHeight: currentHeight,
        lightSize: look.lightSize,
      })
      rendererRef.current = renderer
      let camera = cameraRef.current
      let lastCameraTs = performance.now()
      if (draw.kind === '3d') {
        drawRef.current = draw
        renderer.set3DPositions(draw.positions, {
          canvasPx: Math.round(currentWidth * 0.625),
          normals: draw.normals,
        })
        renderer.setCamera(camera)
        renderer.setSolidity(look.solidity)
      } else {
        drawRef.current = draw
        renderer.set2DPositions(draw.positions, {
          containerWidth: currentWidth,
          containerHeight: currentHeight,
          lightSize: look.lightSize,
        })
      }
      renderer.setDiffusion(look.diffusion)

      const progress = progressRef.current
      const updateProgress = () => {
        if (!progress || loopMs === null || loopMs <= 0) return
        const fraction = (runtime.getElapsedMs() % loopMs) / loopMs
        progress.style.transform = `scaleX(${fraction.toFixed(4)})`
      }

      let lastFrame: Float64Array | null = null
      const paintFrame = (frame: Float64Array, advanceCamera: boolean) => {
        if (generationRef.current !== generation) return
        if (draw.kind === '3d') {
          const now = performance.now()
          if (advanceCamera) camera = advanceAutoOrbit(camera, now - lastCameraTs)
          lastCameraTs = now
          cameraRef.current = camera
          renderer.setCamera(camera)
        }
        lastFrame = frame
        renderer.paint(frame, look.brightness, false)
        updateProgress()
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
      // the per-card opening offset. A restored snapshot is presented from its
      // own frame: ticking the runtime to render would advance state (render
      // can consume random()) and the first shown frame would no longer be
      // the snapshot's.
      const resume = resumeSnapshotRef.current
      const keyframe = keyframeRef.current
      if (resume && resume.frame.length === mapPoints.length * 3) {
        runtime.renderCurrentFrame()
        runtime.restore(resume)
        paintFrame(resume.frame, false)
      } else if (galleryKeyframeMatches(keyframe, resolved.keyframeKey) && keyframe.pixelCount === mapPoints.length) {
        paintFrame(restoreGalleryKeyframe(runtime, keyframe).frame, false)
      } else {
        const offset = galleryStartOffsetMs(index)
        paintFrame(runtime.advanceLive(offset).frame, false)
      }

      if (mode === 'warm') {
        // Some subjects open dark; step forward a few frames for a lit poster.
        for (let attempt = 0; attempt < WARM_POSTER_ATTEMPTS; attempt++) {
          if (capturePoster() && !isBlankPoster(posterCanvasRef.current)) break
          paintFrame(runtime.advanceLive(WARM_POSTER_STEP_MS).frame, false)
        }
        galleryCardWarmed(key)
      } else if (!reducedMotion) {
        let lastTs: number | null = null
        const tick = (ts: number) => {
          rafId = null
          if (generationRef.current !== generation) return
          const delta = lastTs === null ? 0 : Math.min(MAX_LIVE_DELTA_MS, ts - lastTs)
          lastTs = ts
          try {
            paintFrame(runtime.advanceLive(delta * look.speed).frame, true)
          } catch (err) {
            setError(err instanceof Error ? err.message : String(err))
            galleryCardWarmed(key)
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
          if (capturePoster()) galleryCardWarmed(key)
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
        // Free the context only once the canvas has left the DOM. If the
        // effect is merely re-running on the same mounted canvas, the next
        // renderer reuses the context instead of inheriting a lost one.
        queueMicrotask(() => {
          if (!canvas.isConnected) canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
        })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => {
        if (generationRef.current !== generation) return
        setError(message)
      })
      galleryCardWarmed(key)
    }
  }, [active, mode, reducedMotion, key, index, loopMs])

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
          aria-label={`${label} live preview`}
          className="absolute inset-0 h-full w-full transition-opacity duration-75"
        />
      )}
      {loopMs !== null && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-[2px] bg-zinc-800/60">
          <div
            ref={progressRef}
            data-testid="gallery-loop-progress"
            className="h-full w-full origin-left bg-live/70"
            style={{ transform: 'scaleX(0)' }}
          />
        </div>
      )}
      {error && (
        <div className="absolute inset-x-2 bottom-2 rounded border border-red-400/30 bg-red-950/80 px-2 py-1 font-mono text-[10px] text-red-200">
          Preview unavailable
        </div>
      )}
    </div>
  )
}
