import { bundle } from './bundle'
import { loadPattern, nativeDimension, type PatternMetadata } from './loadPattern'
import type { MapPoint } from './maps/types'
import { createRenderLoop } from './renderLoop'
import { selectRenderCompatibility } from './renderCompatibility'
import { createFxShim, createShim, type ShimSnapshot } from './shim'
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

export interface FastReplaySnapshot {
  elapsedMs: number
  simulatedFrames: number
  frame: Float64Array<ArrayBufferLike>
  patternVars: Record<string, unknown>
  shim: ShimSnapshot
}

export interface FastReplayRuntime {
  getElapsedMs: () => number
  snapshot: () => FastReplaySnapshot
  restore: (snapshot: FastReplaySnapshot) => void
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

type RuntimeFunction = (...args: never[]) => unknown
type NamedFunctionRegistry = 'pattern' | 'builtin' | 'control'

interface SnapshotFunctionToken {
  __fastReplayFunction: {
    registry: NamedFunctionRegistry | 'fallback'
    name: string
    source?: string
  }
}

interface FunctionRegistry {
  byFunction: Map<RuntimeFunction, SnapshotFunctionToken>
  byToken: Map<string, RuntimeFunction>
}

interface SnapshotCloneContext {
  cloned: Map<object, unknown>
  functionTokens: Map<RuntimeFunction, SnapshotFunctionToken>
  namedFunctions: ReadonlyMap<RuntimeFunction, SnapshotFunctionToken>
  fallbackFunctions: Map<string, RuntimeFunction>
}

function functionTokenKey(registry: NamedFunctionRegistry, name: string): string {
  return `${registry}\0${name}`
}

function fallbackFunctionKey(fn: RuntimeFunction): string {
  return `${fn.name}\0${Function.prototype.toString.call(fn)}`
}

function registerFallbackFunction(functions: Map<string, RuntimeFunction>, fn: RuntimeFunction): string {
  const key = fallbackFunctionKey(fn)
  const existing = functions.get(key)
  if (existing && existing !== fn) {
    throw new Error(`Fast replay snapshot has an ambiguous fallback function identity for "${fn.name}".`)
  }
  functions.set(key, fn)
  return key
}

function createFunctionRegistry(
  patternFunctions: Record<string, RuntimeFunction>,
  builtins: Record<string, unknown>,
  controls: Record<string, (...args: number[]) => void>,
): FunctionRegistry {
  const byFunction = new Map<RuntimeFunction, SnapshotFunctionToken>()
  const byToken = new Map<string, RuntimeFunction>()
  const add = (registry: NamedFunctionRegistry, values: Record<string, unknown>): void => {
    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== 'function') continue
      const fn = value as RuntimeFunction
      const token: SnapshotFunctionToken = { __fastReplayFunction: { registry, name } }
      byToken.set(functionTokenKey(registry, name), fn)
      if (!byFunction.has(fn)) byFunction.set(fn, token)
    }
  }
  add('pattern', patternFunctions)
  add('builtin', builtins)
  add('control', controls)
  return { byFunction, byToken }
}

function isSnapshotFunctionToken(value: unknown): value is SnapshotFunctionToken {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const token = (value as Partial<SnapshotFunctionToken>).__fastReplayFunction
  return Boolean(token && typeof token.registry === 'string' && typeof token.name === 'string')
}

function clonePatternValue(value: unknown, context: SnapshotCloneContext): unknown {
  if (typeof value === 'function') {
    const fn = value as RuntimeFunction
    const existing = context.functionTokens.get(fn)
    if (existing) return existing
    const named = context.namedFunctions.get(fn)
    const token = named ?? {
      __fastReplayFunction: {
        registry: 'fallback' as const,
        name: fn.name,
        source: Function.prototype.toString.call(fn),
      },
    }
    if (!named) registerFallbackFunction(context.fallbackFunctions, fn)
    context.functionTokens.set(fn, token)
    return token
  }
  if (!value || typeof value !== 'object') return value
  const existing = context.cloned.get(value)
  if (existing !== undefined) return existing
  if (Array.isArray(value)) {
    const copy: unknown[] = []
    context.cloned.set(value, copy)
    for (const item of value) copy.push(clonePatternValue(item, context))
    return copy
  }
  if (value && typeof value === 'object') {
    const copy: Record<string, unknown> = {}
    context.cloned.set(value, copy)
    for (const [key, item] of Object.entries(value)) copy[key] = clonePatternValue(item, context)
    return copy
  }
  return value
}

function collectFallbackFunctions(
  value: unknown,
  namedFunctions: ReadonlyMap<RuntimeFunction, SnapshotFunctionToken>,
  functions: Map<string, RuntimeFunction>,
  seen: Set<object>,
): void {
  if (typeof value === 'function') {
    const fn = value as RuntimeFunction
    if (!namedFunctions.has(fn)) registerFallbackFunction(functions, fn)
    return
  }
  if (!value || typeof value !== 'object' || seen.has(value)) return
  seen.add(value)
  for (const item of Array.isArray(value) ? value : Object.values(value)) {
    collectFallbackFunctions(item, namedFunctions, functions, seen)
  }
}

function resolveSnapshotFunction(
  token: SnapshotFunctionToken,
  namedFunctions: ReadonlyMap<string, RuntimeFunction>,
  fallbackFunctions: ReadonlyMap<string, RuntimeFunction>,
): RuntimeFunction {
  const descriptor = token.__fastReplayFunction
  const fn = descriptor.registry === 'fallback'
    ? fallbackFunctions.get(`${descriptor.name}\0${descriptor.source ?? ''}`)
    : namedFunctions.get(functionTokenKey(descriptor.registry, descriptor.name))
  if (!fn) throw new Error(`Fast replay snapshot function "${descriptor.name}" is unavailable in this runtime.`)
  return fn
}

function restorePatternValue(
  value: unknown,
  namedFunctions: ReadonlyMap<string, RuntimeFunction>,
  fallbackFunctions: ReadonlyMap<string, RuntimeFunction>,
  restored: Map<object, unknown>,
  createArray: (length: number) => unknown[],
  target?: unknown,
): unknown {
  if (isSnapshotFunctionToken(value)) return resolveSnapshotFunction(value, namedFunctions, fallbackFunctions)
  if (!value || typeof value !== 'object') return value
  const existing = restored.get(value)
  if (existing !== undefined) return existing
  if (Array.isArray(value)) {
    const targetArray = Array.isArray(target) ? target : createArray(value.length)
    restored.set(value, targetArray)
    targetArray.length = value.length
    for (let index = 0; index < value.length; index += 1) {
      targetArray[index] = restorePatternValue(
        value[index], namedFunctions, fallbackFunctions, restored, createArray, targetArray[index],
      )
    }
    return targetArray
  }
  const targetObject = target && typeof target === 'object' && !Array.isArray(target)
    ? target as Record<string, unknown>
    : {}
  restored.set(value, targetObject)
  for (const key of Object.keys(targetObject)) {
    if (!(key in value)) delete targetObject[key]
  }
  for (const [key, item] of Object.entries(value)) {
    targetObject[key] = restorePatternValue(
      item, namedFunctions, fallbackFunctions, restored, createArray, targetObject[key],
    )
  }
  return targetObject
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
    snapshot(): FastReplaySnapshot {
      const functionRegistry = createFunctionRegistry(handle.getPatternFunctions(), shim.builtins, handle.controls)
      const cloneContext: SnapshotCloneContext = {
        cloned: new Map<object, unknown>(),
        functionTokens: new Map<RuntimeFunction, SnapshotFunctionToken>(),
        namedFunctions: functionRegistry.byFunction,
        fallbackFunctions: new Map<string, RuntimeFunction>(),
      }
      return {
        elapsedMs: clock.getTime(),
        simulatedFrames,
        frame: frame.slice(),
        patternVars: Object.fromEntries(
          Object.entries(handle.getExports()).map(([name, value]) => [name, clonePatternValue(value, cloneContext)]),
        ),
        shim: shim.snapshot((source) => clonePatternValue(source, cloneContext) as number[]),
      }
    },
    restore(snapshot: FastReplaySnapshot): void {
      if (snapshot.frame.length !== frame.length) {
        throw new Error('Fast replay snapshot frame size does not match this runtime.')
      }
      const currentPatternVars = handle.getExports()
      const functionRegistry = createFunctionRegistry(handle.getPatternFunctions(), shim.builtins, handle.controls)
      const fallbackFunctions = new Map<string, RuntimeFunction>()
      const seenFunctionContainers = new Set<object>()
      collectFallbackFunctions(currentPatternVars, functionRegistry.byFunction, fallbackFunctions, seenFunctionContainers)
      const restored = new Map<object, unknown>()
      const createArray = (length: number): unknown[] => {
        const arrayBuiltin = shim.getBuiltin('array') as (length: number) => unknown[]
        return arrayBuiltin(shim.encodeScalar(length))
      }
      for (const [name, snapshotValue] of Object.entries(snapshot.patternVars)) {
        const currentValue = currentPatternVars[name]
        if (snapshotValue === undefined && currentValue === undefined) continue
        const restoredValue = restorePatternValue(
          snapshotValue,
          functionRegistry.byToken,
          fallbackFunctions,
          restored,
          createArray,
          currentValue,
        )
        if (!handle.setPatternVar(name, restoredValue)) {
          throw new Error(`Fast replay snapshot variable "${name}" is unavailable in this runtime.`)
        }
      }
      shim.restore(
        snapshot.shim,
        (source, target) => restorePatternValue(
          source,
          functionRegistry.byToken,
          fallbackFunctions,
          restored,
          createArray,
          target,
        ) as number[],
      )
      clock.setTime(snapshot.elapsedMs)
      simulatedFrames = snapshot.simulatedFrames
      frame.set(snapshot.frame)
    },
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
