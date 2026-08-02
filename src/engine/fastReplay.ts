import { bundle } from './bundle'
import { loadPattern, nativeDimension, type PatternMetadata } from './loadPattern'
import type { MapPoint } from './maps/types'
import { createRenderLoop } from './renderLoop'
import { selectRenderCompatibility } from './renderCompatibility'
import { createFxShim, createShim } from './shim'
import { createVirtualClock } from './virtualClock'
import { emitFixedPoint } from './fxEmit'

export interface PreparedFastReplay {
  code: string
  fxCode?: string
  metadata: PatternMetadata
  dimension: 1 | 2 | 3
}

export interface FastReplayRuntimeOptions {
  mapPoints: MapPoint[]
  randomSeed: number
  fidelity?: 'fast' | 'fidelity'
}

export interface FastReplayAdvanceOptions {
  stepMs: number
  temporalFeedbackSeek?: 'exact' | 'clear-at-target'
  /** Cooperative replay keeps intermediate chunk boundaries headless. */
  presentTargetFrame?: boolean
}

export interface FastReplayResult {
  checksum: string
  elapsedMs: number
  simulatedFrames: number
  outerRendererCalls: number
  frame: Float64Array
  pixels: [number, number, number][]
  exports: Record<string, unknown>
}

export interface FastReplayRuntime {
  getElapsedMs: () => number
  renderCurrentFrame: () => FastReplayResult
  advanceLive: (deltaMs: number) => FastReplayResult
  advanceTo: (targetMs: number, advance: FastReplayAdvanceOptions) => FastReplayResult
}

export interface CooperativeFastReplayOptions extends FastReplayAdvanceOptions {
  chunkMs: number
  isCurrent: () => boolean
  yieldControl?: () => Promise<void>
}

function replayTargetEpsilonMs(stepMs: number): number {
  return Math.max(1e-9, stepMs * 1e-9)
}

function replayTargetReached(elapsedMs: number, targetMs: number, stepMs: number): boolean {
  return targetMs - elapsedMs <= replayTargetEpsilonMs(stepMs)
}

export function prepareFastReplay(
  source: string,
  libraries: Record<string, string>,
): PreparedFastReplay {
  const { code, fxCode, metadata } = bundle(source, libraries)
  return { code, fxCode, metadata, dimension: nativeDimension(metadata.renderFns) }
}

export function createFastReplayRuntime(
  prepared: PreparedFastReplay,
  options: FastReplayRuntimeOptions,
): FastReplayRuntime {
  const clock = createVirtualClock()
  const pixelCount = options.mapPoints.length
  const precise = options.fidelity === 'fidelity'
  const shimConfig = {
    mapPoints: options.mapPoints,
    pixelCount,
    dimensions: prepared.dimension,
    getVirtualTime: () => clock.getTime(),
    randomSeed: options.randomSeed,
  }
  const shim = precise ? createFxShim(shimConfig) : createShim(shimConfig)
  const handle = loadPattern(
    precise ? prepared.fxCode ?? emitFixedPoint(prepared.code) : prepared.code,
    prepared.metadata,
    shim.builtins,
  )
  const renderCompatibility = selectRenderCompatibility(prepared.dimension, prepared.metadata.renderFns)
  let frame: Float64Array<ArrayBufferLike> = new Float64Array(pixelCount * 3)
  let simulatedFrames = 0
  const loop = createRenderLoop({
    handle,
    shim,
    clock,
    mapPoints: options.mapPoints,
    pixelCount,
    renderCompatibility,
    getSpeed: () => 1,
    getBrightness: () => 1,
    isDimmed: () => false,
    paint: () => undefined,
    paintPacked: (nextFrame) => { frame = nextFrame },
  })

  const currentResult = (snapshotFrame: boolean): FastReplayResult => {
    // Live presentation owns one mutable frame for the lifetime of the runtime.
    // Deterministic reconstruction, by contrast, returns a durable result that
    // callers may compare after advancing the same runtime again.
    const resultFrame = snapshotFrame ? frame.slice() : frame
    return {
      get checksum() { return checksumFrame(resultFrame) },
      elapsedMs: clock.getTime(),
      simulatedFrames,
      outerRendererCalls: simulatedFrames * pixelCount,
      frame: resultFrame,
      get pixels() { return unpackFrame(resultFrame) },
      get exports() { return handle.getExports() },
    }
  }

  return {
    getElapsedMs: () => clock.getTime(),
    renderCurrentFrame(): FastReplayResult {
      loop.tick(0)
      simulatedFrames += 1
      return currentResult(true)
    },
    advanceLive(deltaMs: number): FastReplayResult {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new Error('Fast replay live delta must be a non-negative finite duration.')
      }
      loop.tick(deltaMs)
      simulatedFrames += 1
      return currentResult(false)
    },
    advanceTo(targetMs: number, advance: FastReplayAdvanceOptions): FastReplayResult {
      if (!Number.isFinite(targetMs) || targetMs < clock.getTime()) {
        throw new Error('Fast replay target must be finite and no earlier than the current runtime time.')
      }
      if (!Number.isFinite(advance.stepMs) || advance.stepMs <= 0) {
        throw new Error('Fast replay step must be a positive finite duration.')
      }
      const previewSeekModeVar = prepared.metadata.temporalFeedback?.previewSeekModeVar
      const clearsTemporalFeedback = advance.temporalFeedbackSeek === 'clear-at-target' && Boolean(previewSeekModeVar)
      const presentsTargetFrame = advance.presentTargetFrame !== false
      if (clearsTemporalFeedback && !handle.setPatternVar(previewSeekModeVar!, 1)) {
        throw new Error(`Fast replay temporal seek variable "${previewSeekModeVar}" is unavailable.`)
      }
      const epsilonMs = replayTargetEpsilonMs(advance.stepMs)
      while (!replayTargetReached(clock.getTime(), targetMs, advance.stepMs)) {
        const remainingMs = targetMs - clock.getTime()
        const finalStep = remainingMs <= advance.stepMs + epsilonMs
        if (finalStep && presentsTargetFrame) {
          if (clearsTemporalFeedback) handle.setPatternVar(previewSeekModeVar!, 0)
          loop.tick(remainingMs)
        } else {
          loop.tickHeadless(Math.min(remainingMs, advance.stepMs))
        }
        simulatedFrames += 1
      }
      if (clearsTemporalFeedback && presentsTargetFrame) handle.setPatternVar(previewSeekModeVar!, 0)
      return currentResult(true)
    },
  }
}

export async function advanceFastReplayCooperatively(
  runtime: FastReplayRuntime,
  targetMs: number,
  options: CooperativeFastReplayOptions,
): Promise<FastReplayResult | null> {
  if (!Number.isFinite(options.chunkMs) || options.chunkMs <= 0) {
    throw new Error('Fast replay chunk must be a positive finite duration.')
  }
  const yieldControl = options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)))
  let result: FastReplayResult | null = null

  while (
    runtime.getElapsedMs() < targetMs
    && (result === null || !replayTargetReached(runtime.getElapsedMs(), targetMs, options.stepMs))
  ) {
    if (!options.isCurrent()) return null
    const chunkTargetMs = Math.min(targetMs, runtime.getElapsedMs() + options.chunkMs)
    result = runtime.advanceTo(chunkTargetMs, {
      stepMs: options.stepMs,
      temporalFeedbackSeek: options.temporalFeedbackSeek,
      presentTargetFrame: replayTargetReached(chunkTargetMs, targetMs, options.stepMs),
    })
    if (!replayTargetReached(runtime.getElapsedMs(), targetMs, options.stepMs)) {
      await yieldControl()
      if (!options.isCurrent()) return null
    }
  }

  return options.isCurrent() ? result : null
}

function checksumFrame(frame: Float64Array): string {
  let hash = 0x811c9dc5
  for (const channel of frame) {
    const byte = Math.round(Math.min(1, Math.max(0, Number.isFinite(channel) ? channel : 0)) * 255)
    hash = Math.imul((hash ^ byte) >>> 0, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

function unpackFrame(frame: Float64Array): [number, number, number][] {
  const pixels = new Array<[number, number, number]>(frame.length / 3)
  for (let offset = 0; offset < frame.length; offset += 3) {
    pixels[offset / 3] = [frame[offset], frame[offset + 1], frame[offset + 2]]
  }
  return pixels
}
