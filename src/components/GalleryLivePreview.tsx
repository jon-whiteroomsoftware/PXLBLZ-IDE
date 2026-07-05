import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { bundle } from '@/engine/bundle'
import { advanceAutoOrbit, DEFAULT_ORBIT } from '@/engine/camera'
import { createRenderer, type Renderer } from '@/engine/renderer'
import { createRenderLoop, type RenderLoop } from '@/engine/renderLoop'
import { createShim, type ShimContext } from '@/engine/shim'
import { createVirtualClock } from '@/engine/virtualClock'
import { loadPattern, nativeDimension } from '@/engine/loadPattern'
import { resolveLayout } from '@/engine/layout'
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

const MAX_ACTIVE_GALLERY_PREVIEWS = 6
let nextPreviewId = 1
const activePreviewSlots = new Set<number>()
const priorityPreviewSlots = new Set<number>()
const slotListeners = new Set<() => void>()

function notifySlotListeners(): void {
  for (const listener of slotListeners) listener()
}

function claimPreviewSlot(id: number, priority: boolean): boolean {
  if (activePreviewSlots.has(id)) {
    if (priority) priorityPreviewSlots.add(id)
    else priorityPreviewSlots.delete(id)
    return true
  }
  if (activePreviewSlots.size >= MAX_ACTIVE_GALLERY_PREVIEWS && priority) {
    const evicted = [...activePreviewSlots].find((slotId) => !priorityPreviewSlots.has(slotId))
    if (evicted === undefined) return false
    activePreviewSlots.delete(evicted)
    priorityPreviewSlots.delete(evicted)
  }
  if (activePreviewSlots.size >= MAX_ACTIVE_GALLERY_PREVIEWS) return false
  activePreviewSlots.add(id)
  if (priority) priorityPreviewSlots.add(id)
  notifySlotListeners()
  return true
}

function releasePreviewSlot(id: number): void {
  if (!activePreviewSlots.delete(id)) return
  priorityPreviewSlots.delete(id)
  notifySlotListeners()
}

function updatePreviewSlotPriority(id: number, priority: boolean): void {
  if (!activePreviewSlots.has(id)) return
  if (priority) priorityPreviewSlots.add(id)
  else priorityPreviewSlots.delete(id)
}

function useGalleryPreviewSlot(wantsSlot: boolean, priority: boolean): boolean {
  const [id] = useState(() => nextPreviewId++)
  const priorityRef = useRef(priority)
  const [hasSlot, setHasSlot] = useState(false)

  useEffect(() => {
    priorityRef.current = priority
  }, [priority])

  useEffect(() => {
    if (!wantsSlot) {
      releasePreviewSlot(id)
      queueMicrotask(() => setHasSlot(false))
      return
    }

    const tryClaim = () => setHasSlot(claimPreviewSlot(id, priorityRef.current))
    tryClaim()
    slotListeners.add(tryClaim)
    return () => {
      slotListeners.delete(tryClaim)
      releasePreviewSlot(id)
    }
  }, [id, wantsSlot])

  useEffect(() => {
    if (!wantsSlot) return
    if (hasSlot) {
      updatePreviewSlotPriority(id, priority)
    } else if (priority) {
      queueMicrotask(() => setHasSlot(claimPreviewSlot(id, true)))
    }
  }, [hasSlot, id, priority, wantsSlot])

  return hasSlot
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

function thumbnailCount(dim: 1 | 2 | 3, recommended: number | null | undefined): number {
  const fallback = defaultPixelCountForDim(dim)
  const base = recommended ?? fallback
  if (dim === 1) return Math.min(base, 384)
  if (dim === 3) return Math.min(base, 1024)
  return Math.min(base, 1024)
}

export function GalleryLivePreview({
  name,
  src,
  dimmed,
  index,
  priority = false,
}: {
  name: string
  src: string
  dimmed: boolean
  index: number
  priority?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hostRef = useRef<HTMLDivElement>(null)
  const loopRef = useRef<RenderLoop | null>(null)
  const rendererRef = useRef<Renderer | null>(null)
  const shimRef = useRef<ShimContext | null>(null)
  const generationRef = useRef(0)
  const drawRef = useRef<
    | { kind: '2d'; positions: [number, number][] }
    | { kind: '3d'; positions: [number, number, number][]; normals: [number, number, number][] | null }
    | null
  >(null)
  const paintedRef = useRef(false)
  const widthRef = useRef(240)
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined')
  const [error, setError] = useState<string | null>(null)
  const [painted, setPainted] = useState(false)
  const [startDelay] = useState(() => (index % 10) * 70)
  const reducedMotion = usePrefersReducedMotion()
  const hasPreviewSlot = useGalleryPreviewSlot(visible || priority, priority)

  const settings = useMemo(() => ({ ...DEV_DEFAULTS, ...recommendedSettingsFor(name) }), [name])

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

  useEffect(() => {
    const host = hostRef.current
    if (!host || typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry.isIntersecting),
      { rootMargin: '120px 0px' },
    )
    observer.observe(host)
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (!hasPreviewSlot) return
    const generation = generationRef.current + 1
    generationRef.current = generation
    canvas.style.opacity = '0'
    canvas.style.visibility = 'hidden'
    paintedRef.current = false
    queueMicrotask(() => {
      if (generationRef.current !== generation) return
      setError(null)
      setPainted(false)
    })

    let handle: ReturnType<typeof loadPattern>
    let shim: ShimContext
    try {
      const bundled = bundle(src, LIBRARIES)
      const nativeDim = nativeDimension(bundled.metadata.renderFns)
      const pixelCount = thumbnailCount(nativeDim, settings.pixelCount)
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
        },
        {
          resolveMap: (mapId) => resolveMap(mapId ?? DEFAULT_MAP_ID, []),
          defaultCountForDim: defaultPixelCountForDim,
        },
      )
      const clock = createVirtualClock()
      shim = createShim({
        mapPoints: layout.mapPoints,
        pixelCount: layout.pixelCount,
        dimensions: nativeDim,
        getVirtualTime: () => clock.getTime(),
      })
      shimRef.current = shim
      handle = loadPattern(bundled.code, bundled.metadata, shim.builtins)

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
        getSpeed: () => settings.speed,
        getBrightness: () => settings.brightness,
        isDimmed: () => dimmed,
        paint: (pixels, brightness, isPreviewDimmed) => {
          if (generationRef.current !== generation) return
          if (layout.draw.kind === '3d') {
            const now = performance.now()
            camera = advanceAutoOrbit(camera, now - lastCameraTs)
            lastCameraTs = now
            renderer.setCamera(camera)
          }
          renderer.paint(pixels, brightness, isPreviewDimmed)
          if (!paintedRef.current) {
            paintedRef.current = true
            canvas.style.visibility = 'visible'
            canvas.style.opacity = '1'
            setPainted(true)
          }
        },
        onError: (err) => {
          if (generationRef.current !== generation) return
          setError(err.message)
        },
      })
      loopRef.current = loop
      loop.renderPreviewFrame()
      const startTimeout =
        reducedMotion || !visible
          ? null
          : window.setTimeout(() => {
              if (generationRef.current !== generation) return
              loop.start()
            }, startDelay)

      return () => {
        generationRef.current += 1
        if (startTimeout !== null) window.clearTimeout(startTimeout)
        canvas.style.opacity = '0'
        canvas.style.visibility = 'hidden'
        loop.stop()
        loopRef.current = null
        rendererRef.current = null
        drawRef.current = null
        paintedRef.current = false
        setPainted(false)
        canvas.getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      queueMicrotask(() => {
        if (generationRef.current !== generation) return
        setError(message)
      })
      const fallbackShim = createShim({
        mapPoints: [],
        pixelCount: 1,
        dimensions: 2,
        getVirtualTime: () => 0,
      })
      shimRef.current = fallbackShim
    }
  }, [src, settings, dimmed, hasPreviewSlot, reducedMotion, visible, startDelay])

  return (
    <div ref={hostRef} className="absolute inset-0 bg-black" data-testid="gallery-live-preview">
      {hasPreviewSlot && (
        <canvas
          ref={canvasRef}
          aria-label={`${name} live preview`}
          className={`h-full w-full bg-black transition-opacity duration-75 ${painted ? 'opacity-100' : 'opacity-0'}`}
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
