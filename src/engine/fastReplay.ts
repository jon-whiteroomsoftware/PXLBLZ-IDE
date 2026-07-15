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
}

export interface FastReplayResult {
  checksum: string
  elapsedMs: number
  simulatedFrames: number
  outerRendererCalls: number
  pixels: [number, number, number][]
  exports: Record<string, unknown>
}

export interface FastReplayRuntime {
  getElapsedMs: () => number
  renderCurrentFrame: () => FastReplayResult
  advanceTo: (targetMs: number, advance: FastReplayAdvanceOptions) => FastReplayResult
}

export interface CooperativeFastReplayOptions extends FastReplayAdvanceOptions {
  chunkMs: number
  isCurrent: () => boolean
  yieldControl?: () => Promise<void>
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
  let pixels: [number, number, number][] = []
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
    paint: (frame) => { pixels = frame },
  })

  const currentResult = (): FastReplayResult => ({
    checksum: checksumPixels(pixels),
    elapsedMs: clock.getTime(),
    simulatedFrames,
    outerRendererCalls: simulatedFrames * pixelCount,
    pixels,
    exports: handle.getExports(),
  })

  return {
    getElapsedMs: () => clock.getTime(),
    renderCurrentFrame(): FastReplayResult {
      loop.tick(0)
      simulatedFrames += 1
      return currentResult()
    },
    advanceTo(targetMs: number, advance: FastReplayAdvanceOptions): FastReplayResult {
      if (!Number.isFinite(targetMs) || targetMs < clock.getTime()) {
        throw new Error('Fast replay target must be finite and no earlier than the current runtime time.')
      }
      if (!Number.isFinite(advance.stepMs) || advance.stepMs <= 0) {
        throw new Error('Fast replay step must be a positive finite duration.')
      }
      const epsilonMs = Math.max(1e-9, advance.stepMs * 1e-9)
      while (targetMs - clock.getTime() > epsilonMs) {
        const remainingMs = targetMs - clock.getTime()
        const finalStep = remainingMs <= advance.stepMs + epsilonMs
        if (finalStep) loop.tick(remainingMs)
        else loop.tickHeadless(advance.stepMs)
        simulatedFrames += 1
      }
      return currentResult()
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

  while (runtime.getElapsedMs() < targetMs) {
    if (!options.isCurrent()) return null
    const chunkTargetMs = Math.min(targetMs, runtime.getElapsedMs() + options.chunkMs)
    result = runtime.advanceTo(chunkTargetMs, { stepMs: options.stepMs })
    if (runtime.getElapsedMs() < targetMs) {
      await yieldControl()
      if (!options.isCurrent()) return null
    }
  }

  return options.isCurrent() ? result : null
}

function checksumPixels(pixels: [number, number, number][]): string {
  let hash = 0x811c9dc5
  for (const pixel of pixels) {
    for (const channel of pixel) {
      const byte = Math.round(Math.min(1, Math.max(0, Number.isFinite(channel) ? channel : 0)) * 255)
      hash = Math.imul((hash ^ byte) >>> 0, 0x01000193)
    }
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
