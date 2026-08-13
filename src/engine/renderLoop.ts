import type { PatternHandle } from './loadPattern'
import type { ShimContext } from './shim'
import type { VirtualClock } from './virtualClock'
import type { MapPoint } from './maps'
import type { RenderCompatibility } from './renderCompatibility'

export interface RenderLoopConfig {
  handle: PatternHandle
  shim: ShimContext
  clock: VirtualClock
  // Resolved active-map points (the spatial source) and the modeled pixel count.
  // The loop iterates 0 .. pixelCount-1, reading each point's `sample`.
  mapPoints: MapPoint[]
  pixelCount: number
  // When present, dispatch through the firmware-compatible renderer policy.
  // Omitted only by legacy/unit callers, which retain sample-arity dispatch.
  renderCompatibility?: RenderCompatibility
  getSpeed: () => number
  getBrightness: () => number
  isDimmed: () => boolean
  paint: (pixels: [number, number, number][], brightness: number, dimmed: boolean) => void
  paintPacked?: (frame: Float64Array, brightness: number, dimmed: boolean) => void
  onError?: (err: Error) => void
  onFrame?: (delta: number, builtins: Record<string, unknown>, elapsedMs: number) => void
  /**
   * Reports a smoothed frames-per-second figure, averaged over a ~500ms window
   * so the readout it feeds doesn't flicker. Only fires while the rAF loop runs
   * (not for one-off preview frames).
   */
  onFps?: (fps: number) => void
}

// Minimum real-time span to average FPS over before reporting. Doubles as the
// max update cadence for the readout (~2 updates/sec), which keeps it legible.
const FPS_WINDOW_MS = 500

export interface RenderLoop {
  start(): void
  stop(): void
  tick(realDelta: number): void
  /** Advance all Pattern state and per-pixel render effects without allocating
   * or painting an RGB frame. Used by deterministic replay before its target. */
  tickHeadless(realDelta: number): void
  /** Advance the clock and beforeRender state without traversing pixels. Safe
   * only when the compiled artifact proves renderer state is target-local. */
  tickBeforeRenderOnly(realDelta: number): void
  /** Advance by realDelta and paint undimmed regardless of the dim policy.
   * Used by deterministic frame-sequence capture, which steps a stopped loop. */
  tickFrame(realDelta: number): void
  renderPreviewFrame(): void
}

export function createRenderLoop(config: RenderLoopConfig): RenderLoop {
  const {
    handle,
    shim,
    clock,
    mapPoints,
    pixelCount,
    renderCompatibility,
    getSpeed,
    getBrightness,
    isDimmed,
    paint,
  } = config
  let rafId: number | null = null
  let lastTs: number | null = null
  let fpsWindowStart: number | null = null
  let fpsFrames = 0
  const packedFrame = config.paintPacked ? new Float64Array(pixelCount * 3) : null
  const encodedIndexes = new Float64Array(pixelCount)
  for (let index = 0; index < pixelCount; index += 1) {
    encodedIndexes[index] = shim.encodeScalar(index)
  }
  const transformed = new Float64Array(3)
  const compatibleRenderer = renderCompatibility?.renderer ?? null
  const compatibleDimension = renderCompatibility?.rendererDim ?? null
  const sampleDimensions = new Uint8Array(pixelCount)
  const sampleCoordinates = new Float64Array(pixelCount * 3)
  for (let index = 0; index < pixelCount; index += 1) {
    const sample = mapPoints[index]?.sample ?? []
    const offset = index * 3
    sampleDimensions[index] = sample.length
    sampleCoordinates[offset] = sample[0] ?? (compatibleDimension ? 0.5 : 0)
    sampleCoordinates[offset + 1] = compatibleDimension && compatibleDimension >= 2
      ? sample[1] ?? 0.5
      : sample[1] ?? 0
    sampleCoordinates[offset + 2] = compatibleDimension && compatibleDimension >= 3
      ? sample[2] ?? 0.5
      : sample[2] ?? 0
  }

  function advanceBeforeRender(realDelta: number): number {
    const scaledDelta = realDelta * getSpeed()
    clock.advance(scaledDelta)
    // delta and index cross the engine→pattern boundary as scalars, so they
    // must be encoded to the active numeric domain (raw int32 in fidelity mode).
    handle.beforeRender(shim.encodeScalar(scaledDelta))
    return scaledDelta
  }

  function doTick(realDelta: number, dimmed: boolean, shouldPaint = true): void {
    const scaledDelta = advanceBeforeRender(realDelta)

    const pixels: [number, number, number][] | null = shouldPaint && !packedFrame ? [] : null

    // Iterate the modeled pixel count, reading each pixel's `sample` from the
    // active map. Production callers supply one firmware-compatible renderer plan;
    // legacy/unit callers may still use direct sample-arity dispatch. A true 1D
    // map carries `[x]`; a legacy/mapless point may still carry no sample.
    for (let index = 0; index < pixelCount; index++) {
      const coordinateOffset = index * 3
      const x = sampleCoordinates[coordinateOffset]
      const y = sampleCoordinates[coordinateOffset + 1]
      const z = sampleCoordinates[coordinateOffset + 2]
      // index crosses the engine->pattern boundary as a scalar, so it must be
      // encoded to the active numeric domain (raw int32 in fidelity mode).
      const encIndex = encodedIndexes[index]
      if (compatibleRenderer && compatibleDimension) {
        shim.transformPointInto(transformed, 0, x, y, z)
        if (compatibleRenderer === 'render3D') {
          handle.render3D(encIndex, transformed[0], transformed[1], transformed[2])
        } else if (compatibleRenderer === 'render2D') {
          handle.render2D(encIndex, transformed[0], transformed[1])
        } else {
          handle.render(encIndex, transformed[0])
        }
      } else if (sampleDimensions[index] >= 3) {
        // Apply the pattern's coordinate transform stack before render, so
        // translate/rotate/scale behave as on hardware.
        shim.transformPointInto(transformed, 0, x, y, z)
        handle.render3D(encIndex, transformed[0], transformed[1], transformed[2])
      } else if (sampleDimensions[index] === 2) {
        shim.transformPointInto(transformed, 0, x, y, 0)
        handle.render2D(encIndex, transformed[0], transformed[1])
      } else if (sampleDimensions[index] === 1) {
        shim.transformPointInto(transformed, 0, x, 0, 0)
        handle.render(encIndex, transformed[0])
      } else {
        handle.render(encIndex)
      }
      if (packedFrame) {
        if (shouldPaint) shim.writeCapturedPixel(packedFrame, index * 3)
        else shim.resetCapturedPixel()
      } else {
        const captured = shim.capturedPixel()
        if (pixels) pixels.push(captured)
      }
    }

    if (pixels) paint(pixels, getBrightness(), dimmed)
    else if (shouldPaint && packedFrame) config.paintPacked?.(packedFrame, getBrightness(), dimmed)
    config.onFrame?.(scaledDelta, shim.builtins, clock.getTime())
  }

  function tick(realDelta: number): void {
    doTick(realDelta, isDimmed())
  }

  function reportError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err))
    config.onError?.(error)
  }

  function loop(ts: number): void {
    const delta = lastTs === null ? 0 : ts - lastTs
    lastTs = ts
    try {
      tick(delta)
    } catch (err) {
      reportError(err)
      rafId = null
      return
    }
    // Windowed FPS: count the frames elapsed since the window opened and report
    // the average once it fills, smoothing per-frame jitter and capping updates
    // at ~2/sec. The opening frame marks t0 and isn't itself counted. Reported
    // unrounded; the readout formats to one decimal place.
    if (fpsWindowStart === null) {
      fpsWindowStart = ts
    } else {
      fpsFrames++
      const windowMs = ts - fpsWindowStart
      if (windowMs >= FPS_WINDOW_MS) {
        config.onFps?.((fpsFrames * 1000) / windowMs)
        fpsWindowStart = ts
        fpsFrames = 0
      }
    }
    rafId = requestAnimationFrame(loop)
  }

  return {
    start() {
      if (rafId !== null) return
      lastTs = null
      fpsWindowStart = null
      fpsFrames = 0
      rafId = requestAnimationFrame(loop)
    },
    stop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId)
        rafId = null
      }
    },
    tick,
    tickHeadless(realDelta: number) {
      doTick(realDelta, false, false)
    },
    tickBeforeRenderOnly(realDelta: number) {
      const scaledDelta = advanceBeforeRender(realDelta)
      config.onFrame?.(scaledDelta, shim.builtins, clock.getTime())
    },
    tickFrame(realDelta: number) {
      doTick(realDelta, false)
    },
    renderPreviewFrame() {
      try {
        doTick(0, false)
      } catch (err) {
        reportError(err)
      }
    },
  }
}
