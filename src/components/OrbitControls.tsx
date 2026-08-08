import { useEffect, RefObject } from 'react'
import { CircleDashed, Play, Pause, RotateCcw, ZoomIn } from 'lucide-react'
import { useCameraStore } from '@/store/cameraStore'
import { useMapStore, DEFAULT_SHAPE_PIXEL_COUNT } from '@/store/mapStore'
import {
  applyOrbitDrag,
  clampPixelCount,
  MAX_VIEW_ZOOM,
  MIN_VIEW_ZOOM,
} from '@/engine/camera'
import { poleMaxCols, defaultPoleCols, clampPoleCols } from '@/engine/shapes'

// 3D-display-only orbit viewport controls (#129). The component is a thin UI
// shell over the 3D viewport: all camera math is the pure `@/engine/camera`
// helpers, and the ephemeral angle/zoom/auto-orbit state lives in `cameraStore`.
//
// These control the VIEWPORT animation (the orbiting model), distinct from the
// header play/pause which runs the pattern itself.
//
// Interaction:
//   • drag         → orbit: horizontal yaws azimuth, vertical tilts pitch, both
//                    axes at once. Elevation is clamped to a stable horizon, so
//                    horizontal always reads as left/right (no view-axis roll).
//   • grabbing the model holds the spin still; it resumes on release. Only the
//     play/pause control toggles the persistent spinning/stopped state.
//   • zoom         → magnifies the fitted 3D presentation around its centre
//   • reset        → returns to the default angle and 1x, then re-arms auto-orbit
export function OrbitControls({
  canvasRef,
  viewKey,
  showPoleControls = true,
}: {
  canvasRef: RefObject<HTMLCanvasElement | null>
  viewKey: string
  showPoleControls?: boolean
}) {
  const autoOrbit = useCameraStore((s) => s.autoOrbit)
  const setAutoOrbit = useCameraStore((s) => s.setAutoOrbit)
  const resetView = useCameraStore((s) => s.resetView)
  const zoom = useCameraStore((s) => s.zoom)
  const setZoom = useCameraStore((s) => s.setZoom)
  const resetZoom = useCameraStore((s) => s.resetZoom)
  const zoomLabel = `${Number.isInteger(zoom) ? zoom.toFixed(0) : zoom.toFixed(2).replace(/0$/, '')}×`

  // Pole wrap-density slider (#146): only the Pole shape exposes it. The slider
  // sets pixels-per-wrap; the pole's diameter and length follow (square cells),
  // trading fat-and-short (more cols) for thin-and-tall (fewer). Range is clamped
  // to the taller-than-wide regime for the current pixel count.
  const poleCols = useCameraStore((s) => s.poleCols)
  const setPoleCols = useCameraStore((s) => s.setPoleCols)
  const activeShapeId = useMapStore((s) => s.activeShapeId)
  const activePixelCount = useMapStore((s) => s.activePixelCount)
  const isPole = showPoleControls && activeShapeId === 'pole'
  const poleCount = clampPixelCount(activePixelCount ?? DEFAULT_SHAPE_PIXEL_COUNT)
  const poleMax = poleMaxCols(poleCount)
  const poleValue = clampPoleCols(poleCount, poleCols ?? defaultPoleCols(poleCount))

  // Framing is geometry-specific. Preserve the shared orbit orientation, but
  // return to automatic fit when a different Map, embedding, or Stage opens.
  useEffect(() => {
    resetZoom()
  }, [resetZoom, viewKey])

  // Pointer drag → orbit. Listeners read/write the camera via getState so a drag
  // never churns React; only the play/pause flag (above) is reactive.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let dragging = false
    let lastX = 0
    let lastY = 0

    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
      // Grabbing the model holds the auto-orbit spin still; it resumes on release.
      // The persistent armed state is only changed by the play/pause control.
      useCameraStore.getState().setDragging(true)
      canvas.setPointerCapture(e.pointerId)
    }
    const onMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - lastX
      const dy = e.clientY - lastY
      lastX = e.clientX
      lastY = e.clientY
      const cam = useCameraStore.getState().camera
      // Drag-down tilts the model's top toward the viewer (dy as-is).
      useCameraStore.getState().setCamera(applyOrbitDrag(cam, dx, dy))
    }
    const onUp = (e: PointerEvent) => {
      dragging = false
      // Release resumes the spin (if it was armed); the persistent state is untouched.
      useCameraStore.getState().setDragging(false)
      if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
    }

    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.style.cursor = 'grab'
    return () => {
      canvas.removeEventListener('pointerdown', onDown)
      canvas.removeEventListener('pointermove', onMove)
      canvas.removeEventListener('pointerup', onUp)
      canvas.style.cursor = ''
    }
  }, [canvasRef])

  return (
    <div
      data-testid="3d-viewport-controls"
      className="absolute right-2 top-2 flex flex-col items-center gap-1"
    >
      <button
        aria-label={autoOrbit ? 'Pause auto-orbit' : 'Resume auto-orbit'}
        title={autoOrbit ? 'Pause auto-orbit' : 'Resume auto-orbit'}
        onClick={() => setAutoOrbit(!autoOrbit)}
        className="flex items-center justify-center h-7 w-7 rounded bg-zinc-900/70 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
      >
        {/* Current-state semantics (matches the header pattern play/pause): the icon
            shows what's happening now — Play while orbiting, Pause when stopped. */}
        {autoOrbit ? <Play size={14} /> : <Pause size={14} />}
      </button>
      <button
        aria-label="Reset view"
        title="Reset view"
        onClick={resetView}
        className="flex items-center justify-center h-7 w-7 rounded bg-zinc-900/70 text-zinc-300 hover:text-amber-400 hover:bg-zinc-800/80 transition-colors"
      >
        <RotateCcw size={14} />
      </button>
      <label
        data-testid="3d-view-zoom-control"
        title={`Zoom: ${zoomLabel}`}
        className="relative flex w-7 flex-col items-center gap-1 rounded bg-zinc-900/70 py-1.5 text-zinc-500"
      >
        <ZoomIn size={11} aria-hidden />
        <span className="relative flex h-16 w-5 items-center justify-center">
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-1/4 left-1/2 h-px w-3 -translate-x-1/2 bg-zinc-500/80"
          />
          <input
            type="range"
            aria-label="3D view zoom"
            aria-orientation="vertical"
            aria-valuetext={zoomLabel}
            min={MIN_VIEW_ZOOM}
            max={MAX_VIEW_ZOOM}
            step={0.05}
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            className="h-16 w-4 cursor-pointer accent-amber-400"
          />
        </span>
      </label>
      {isPole && (
        <label
          data-testid="pole-wrap-density-control"
          title={`Pole wrap density: ${poleValue} pixels per wrap`}
          className="flex w-7 flex-col items-center gap-1 rounded bg-zinc-900/70 py-1.5 text-zinc-500"
        >
          <CircleDashed size={11} aria-hidden />
          <input
            type="range"
            aria-label="Pole wrap density"
            aria-orientation="vertical"
            aria-valuetext={`${poleValue} pixels per wrap`}
            min={2}
            max={poleMax}
            step={1}
            value={poleValue}
            onChange={(e) => setPoleCols(Number(e.target.value))}
            style={{ writingMode: 'vertical-lr', direction: 'rtl' }}
            className="h-16 w-4 cursor-pointer accent-amber-400"
          />
        </label>
      )}
    </div>
  )
}
