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
  /** Run every intermediate renderer while retaining the capability's state
   * normalization contract. Used by full-versus-skipped verification. */
  forceFullIntermediateRender?: boolean
  /** Cooperative replay keeps intermediate chunk boundaries headless. */
  presentTargetFrame?: boolean
}

export interface FastReplayResult {
  checksum: string
  elapsedMs: number
  simulatedFrames: number
  /** Pixel renderer invocations since runtime creation or the latest restore. */
  outerRendererCalls: number
  frame: Float64Array
  pixels: [number, number, number][]
  exports: Record<string, unknown>
}

export interface FastReplaySnapshot {
  elapsedMs: number
  simulatedFrames: number
  frame: Float64Array<ArrayBufferLike>
  patternFunctionBindings: Record<string, unknown>
  runtimeState: Record<string, unknown>
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
  checkpointing?: CooperativeFastReplayCheckpointing
  /** Capture a scheduled checkpoint that falls exactly on the replay target. */
  captureTargetCheckpoint?: boolean
}

export interface CooperativeFastReplayCheckpointing {
  nextCaptureAt: (elapsedMs: number) => number | null
  capture: (runtime: FastReplayRuntime) => void
}

function replayTargetEpsilonMs(stepMs: number): number {
  return Math.max(1e-9, stepMs * 1e-9)
}

function replayTargetReached(elapsedMs: number, targetMs: number, stepMs: number): boolean {
  return targetMs - elapsedMs <= replayTargetEpsilonMs(stepMs)
}

function replayIntermediateTarget(
  elapsedMs: number,
  desiredTargetMs: number,
  stepMs: number,
  direction: 'at-or-before' | 'at-or-after',
): number {
  const stepCount = (desiredTargetMs - elapsedMs) / stepMs
  const epsilon = replayTargetEpsilonMs(stepMs) / stepMs
  const alignedSteps = direction === 'at-or-before'
    ? Math.max(1, Math.floor(stepCount + epsilon))
    : Math.max(1, Math.ceil(stepCount - epsilon))
  return elapsedMs + alignedSteps * stepMs
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
  patternByName: Map<string, RuntimeFunction>
}

interface SnapshotCloneContext {
  cloned: Map<object, unknown>
  functionTokens: Map<RuntimeFunction, SnapshotFunctionToken>
  namedFunctions: ReadonlyMap<RuntimeFunction, SnapshotFunctionToken>
  fallbackFunctions: Map<string, RuntimeFunction>
  isPatternArray: (value: unknown) => value is number[]
}

type SnapshotArrayKind = 'pattern' | 'plain'
const snapshotArrayKind = Symbol('fastReplayArrayKind')
type SnapshotArray = unknown[] & { [snapshotArrayKind]: SnapshotArrayKind }
const pinnedShimArrayBuiltins = ['frequencyData', 'accelerometer', 'analogInputs'] as const

function tagSnapshotArray(array: unknown[], kind: SnapshotArrayKind): SnapshotArray {
  Object.defineProperty(array, snapshotArrayKind, { value: kind })
  return array as SnapshotArray
}

function getSnapshotArrayKind(array: unknown[]): SnapshotArrayKind {
  return (array as Partial<SnapshotArray>)[snapshotArrayKind] ?? 'plain'
}

function functionTokenKey(registry: NamedFunctionRegistry, name: string): string {
  return `${registry}\0${name}`
}

function runtimeFunctionSource(fn: RuntimeFunction): string {
  return Function.prototype.toString.call(fn)
}

function fallbackFunctionKey(fn: RuntimeFunction): string {
  return `${fn.name}\0${runtimeFunctionSource(fn)}`
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
  const patternByName = new Map<string, RuntimeFunction>()
  const add = (registry: NamedFunctionRegistry, values: Record<string, unknown>): void => {
    for (const [name, value] of Object.entries(values)) {
      if (typeof value !== 'function') continue
      const fn = value as RuntimeFunction
      const token: SnapshotFunctionToken = {
        __fastReplayFunction: {
          registry,
          name,
          ...(registry === 'pattern' ? { source: runtimeFunctionSource(fn) } : {}),
        },
      }
      byToken.set(functionTokenKey(registry, name), fn)
      if (registry === 'pattern') patternByName.set(name, fn)
      if (!byFunction.has(fn)) byFunction.set(fn, token)
    }
  }
  add('builtin', builtins)
  add('control', controls)
  add('pattern', patternFunctions)
  return { byFunction, byToken, patternByName }
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
        source: runtimeFunctionSource(fn),
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
    const copy = tagSnapshotArray([], context.isPatternArray(value) ? 'pattern' : 'plain')
    context.cloned.set(value, copy)
    copy.length = value.length
    const target = copy as unknown as Record<string, unknown>
    for (const [key, item] of Object.entries(value)) target[key] = clonePatternValue(item, context)
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
  // Snapshot cloning preserves every enumerable property, including non-index
  // array keys, so fallback collection must traverse the same surface.
  for (const item of Object.values(value)) {
    collectFallbackFunctions(item, namedFunctions, functions, seen)
  }
}

function resolveSnapshotFunction(
  token: SnapshotFunctionToken,
  functionRegistry: FunctionRegistry,
  fallbackFunctions: ReadonlyMap<string, RuntimeFunction>,
): RuntimeFunction {
  const descriptor = token.__fastReplayFunction
  if (descriptor.registry === 'fallback') {
    // Pixelblaze has no closures (#838), so fallback identity deliberately
    // covers only source-identical non-capturing functions re-created at runtime.
    const fallback = fallbackFunctions.get(`${descriptor.name}\0${descriptor.source ?? ''}`)
    if (fallback) return fallback
  } else if (descriptor.registry !== 'pattern') {
    const named = functionRegistry.byToken.get(functionTokenKey(descriptor.registry, descriptor.name))
    if (named) return named
  } else if (descriptor.source) {
    const named = functionRegistry.patternByName.get(descriptor.name)
    if (named && runtimeFunctionSource(named) === descriptor.source) return named

    const candidates = new Set<RuntimeFunction>()
    for (const candidate of functionRegistry.patternByName.values()) {
      if (runtimeFunctionSource(candidate) === descriptor.source) candidates.add(candidate)
    }
    for (const candidate of fallbackFunctions.values()) {
      if (runtimeFunctionSource(candidate) === descriptor.source) candidates.add(candidate)
    }
    if (candidates.size === 1) return candidates.values().next().value as RuntimeFunction
    if (candidates.size > 1) {
      throw new Error(`Fast replay snapshot has an ambiguous Pattern function identity for "${descriptor.name}".`)
    }
  }
  throw new Error(`Fast replay snapshot function "${descriptor.name}" is unavailable in this runtime.`)
}

function restorePatternValue(
  value: unknown,
  functionRegistry: FunctionRegistry,
  fallbackFunctions: ReadonlyMap<string, RuntimeFunction>,
  restored: Map<object, unknown>,
  createArray: (length: number) => unknown[],
): unknown {
  if (isSnapshotFunctionToken(value)) return resolveSnapshotFunction(value, functionRegistry, fallbackFunctions)
  if (!value || typeof value !== 'object') return value
  const existing = restored.get(value)
  if (existing !== undefined) return existing
  if (Array.isArray(value)) {
    const targetArray = getSnapshotArrayKind(value) === 'pattern'
      ? createArray(value.length)
      : new Array<unknown>(value.length)
    restored.set(value, targetArray)
    restoreSnapshotArrayInto(value, targetArray, functionRegistry, fallbackFunctions, restored, createArray)
    return targetArray
  }
  const targetObject: Record<string, unknown> = {}
  restored.set(value, targetObject)
  for (const [key, item] of Object.entries(value)) {
    targetObject[key] = restorePatternValue(
      item, functionRegistry, fallbackFunctions, restored, createArray,
    )
  }
  return targetObject
}

function restoreSnapshotArrayInto(
  source: unknown[],
  targetArray: unknown[],
  functionRegistry: FunctionRegistry,
  fallbackFunctions: ReadonlyMap<string, RuntimeFunction>,
  restored: Map<object, unknown>,
  createArray: (length: number) => unknown[],
): void {
  targetArray.length = source.length
  const target = targetArray as unknown as Record<string, unknown>
  for (const key of Object.keys(targetArray)) {
    if (!(key in source)) delete target[key]
  }
  for (const [key, item] of Object.entries(source)) {
    target[key] = restorePatternValue(
      item, functionRegistry, fallbackFunctions, restored, createArray,
    )
  }
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
  const functionRegistry = createFunctionRegistry(handle.getPatternFunctions(), shim.builtins, handle.controls)
  const renderCompatibility = selectRenderCompatibility(prepared.dimension, prepared.metadata.renderFns)
  let frame: Float64Array<ArrayBufferLike> = new Float64Array(pixelCount * 3)
  let simulatedFrames = 0
  let outerRendererCalls = 0
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
      outerRendererCalls,
      frame: resultFrame,
      get pixels() { return unpackFrame(resultFrame) },
      get exports() { return handle.getExports() },
    }
  }

  const normalizeDeterministicReplayState = () => {
    for (const binding of prepared.metadata.deterministicReplay?.normalizedBindings ?? []) {
      if (!handle.setRuntimeVar(binding, 0)) {
        throw new Error(`Fast replay normalization variable "${binding}" is unavailable.`)
      }
    }
  }

  return {
    getElapsedMs: () => clock.getTime(),
    snapshot(): FastReplaySnapshot {
      const cloneContext: SnapshotCloneContext = {
        cloned: new Map<object, unknown>(),
        functionTokens: new Map<RuntimeFunction, SnapshotFunctionToken>(),
        namedFunctions: functionRegistry.byFunction,
        fallbackFunctions: new Map<string, RuntimeFunction>(),
        isPatternArray: shim.isPatternArray,
      }
      return {
        elapsedMs: clock.getTime(),
        simulatedFrames,
        frame: frame.slice(),
        patternFunctionBindings: Object.fromEntries(
          Object.entries(handle.getPatternFunctions())
            .map(([name, value]) => [name, clonePatternValue(value, cloneContext)]),
        ),
        runtimeState: Object.fromEntries(
          Object.entries(handle.getRuntimeState())
            .map(([name, value]) => [name, clonePatternValue(value, cloneContext)]),
        ),
        shim: shim.snapshot((source) => clonePatternValue(source, cloneContext) as number[]),
      }
    },
    restore(snapshot: FastReplaySnapshot): void {
      if (snapshot.frame.length !== frame.length) {
        throw new Error('Fast replay snapshot frame size does not match this runtime.')
      }
      const currentRuntimeState = handle.getRuntimeState()
      const fallbackFunctions = new Map<string, RuntimeFunction>()
      const seenFunctionContainers = new Set<object>()
      collectFallbackFunctions(
        currentRuntimeState,
        functionRegistry.byFunction,
        fallbackFunctions,
        seenFunctionContainers,
      )
      collectFallbackFunctions(
        handle.getPatternFunctions(),
        functionRegistry.byFunction,
        fallbackFunctions,
        seenFunctionContainers,
      )
      const restored = new Map<object, unknown>()
      const createArray = (length: number): unknown[] => {
        const arrayBuiltin = shim.getBuiltin('array') as (length: number) => unknown[]
        return arrayBuiltin(shim.encodeScalar(length))
      }
      const pinnedArrays = pinnedShimArrayBuiltins.map((name) => {
        const source = snapshot.shim[name]
        const target = shim.getBuiltin(name)
        if (!Array.isArray(target)) {
          throw new Error(`Fast replay shim array "${name}" is unavailable in this runtime.`)
        }
        restored.set(source, target)
        return { source, target }
      })
      for (const { source, target } of pinnedArrays) {
        restoreSnapshotArrayInto(
          source,
          target,
          functionRegistry,
          fallbackFunctions,
          restored,
          createArray,
        )
      }
      for (const [name, snapshotValue] of Object.entries(snapshot.patternFunctionBindings)) {
        const restoredValue = restorePatternValue(
          snapshotValue,
          functionRegistry,
          fallbackFunctions,
          restored,
          createArray,
        )
        if (typeof restoredValue !== 'function' || !handle.setPatternFunction(name, restoredValue as RuntimeFunction)) {
          throw new Error(`Fast replay snapshot Pattern function "${name}" is unavailable in this runtime.`)
        }
      }
      for (const [name, snapshotValue] of Object.entries(snapshot.runtimeState)) {
        if (snapshotValue === undefined && currentRuntimeState[name] === undefined) continue
        const restoredValue = restorePatternValue(
          snapshotValue,
          functionRegistry,
          fallbackFunctions,
          restored,
          createArray,
        )
        if (!handle.setRuntimeVar(name, restoredValue)) {
          throw new Error(`Fast replay snapshot variable "${name}" is unavailable in this runtime.`)
        }
      }
      shim.restore(
        snapshot.shim,
        (source) => restorePatternValue(
          source,
          functionRegistry,
          fallbackFunctions,
          restored,
          createArray,
        ) as number[],
      )
      clock.setTime(snapshot.elapsedMs)
      simulatedFrames = snapshot.simulatedFrames
      outerRendererCalls = 0
      frame.set(snapshot.frame)
    },
    renderCurrentFrame(): FastReplayResult {
      loop.tick(0)
      simulatedFrames += 1
      outerRendererCalls += pixelCount
      return currentResult(true)
    },
    advanceLive(deltaMs: number): FastReplayResult {
      if (!Number.isFinite(deltaMs) || deltaMs < 0) {
        throw new Error('Fast replay live delta must be a non-negative finite duration.')
      }
      loop.tick(deltaMs)
      simulatedFrames += 1
      outerRendererCalls += pixelCount
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
      const skipsIntermediateRender = prepared.metadata.deterministicReplay?.intermediateRender === 'state-pure'
        && !prepared.metadata.temporalFeedback
        && !advance.forceFullIntermediateRender
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
          outerRendererCalls += pixelCount
        } else if (skipsIntermediateRender) {
          loop.tickBeforeRenderOnly(Math.min(remainingMs, advance.stepMs))
        } else {
          loop.tickHeadless(Math.min(remainingMs, advance.stepMs))
          outerRendererCalls += pixelCount
        }
        normalizeDeterministicReplayState()
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
  let nextCheckpointMs = options.checkpointing?.nextCaptureAt(runtime.getElapsedMs()) ?? null
  const targetEpsilonMs = replayTargetEpsilonMs(options.stepMs)

  while (
    runtime.getElapsedMs() < targetMs
    && (result === null || !replayTargetReached(runtime.getElapsedMs(), targetMs, options.stepMs))
  ) {
    if (!options.isCurrent()) return null
    const checkpointFallsBeforeTarget = nextCheckpointMs !== null
      && nextCheckpointMs < targetMs - targetEpsilonMs
    const checkpointFallsOnTarget = nextCheckpointMs !== null
      && Math.abs(nextCheckpointMs - targetMs) <= targetEpsilonMs
    const checkpointTargetMs = nextCheckpointMs !== null
      && (checkpointFallsBeforeTarget || (options.captureTargetCheckpoint && checkpointFallsOnTarget))
      ? replayIntermediateTarget(
          runtime.getElapsedMs(),
          nextCheckpointMs,
          options.stepMs,
          'at-or-after',
        )
      : Number.POSITIVE_INFINITY
    if (checkpointTargetMs <= runtime.getElapsedMs()) {
      throw new Error('Fast replay checkpoint target must be later than the current runtime time.')
    }
    const chunkTargetMs = Math.min(
      targetMs,
      replayIntermediateTarget(
        runtime.getElapsedMs(),
        runtime.getElapsedMs() + options.chunkMs,
        options.stepMs,
        'at-or-before',
      ),
      checkpointTargetMs,
    )
    result = runtime.advanceTo(chunkTargetMs, {
      stepMs: options.stepMs,
      temporalFeedbackSeek: options.temporalFeedbackSeek,
      forceFullIntermediateRender: options.forceFullIntermediateRender,
      presentTargetFrame: options.presentTargetFrame !== false
        && replayTargetReached(chunkTargetMs, targetMs, options.stepMs),
    })
    if (checkpointTargetMs !== Number.POSITIVE_INFINITY
      && replayTargetReached(runtime.getElapsedMs(), checkpointTargetMs, options.stepMs)) {
      options.checkpointing!.capture(runtime)
      nextCheckpointMs = options.checkpointing!.nextCaptureAt(runtime.getElapsedMs())
    }
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

// ---------------------------------------------------------------------------
// JSON codec (#888). A snapshot carries typed-array frames, Symbol-tagged
// Pattern arrays, and non-finite numbers, none of which survive JSON.stringify.
// The encoded form is plain JSON so stored keyframes can ship as assets.

export interface FastReplaySnapshotJson {
  elapsedMs: number
  simulatedFrames: number
  /** RGB triplets, rounded to four decimals. */
  frame: number[]
  patternFunctionBindings: Record<string, unknown>
  runtimeState: Record<string, unknown>
  shim: unknown
}

const FRAME_DECIMALS = 4

function encodeSnapshotValue(value: unknown): unknown {
  if (typeof value === 'number') {
    if (Number.isNaN(value)) return { $num: 'NaN' }
    if (value === Infinity) return { $num: 'Infinity' }
    if (value === -Infinity) return { $num: '-Infinity' }
    return value
  }
  if (value === undefined) return { $undefined: true }
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) {
    const items: unknown[] = []
    for (let index = 0; index < value.length; index += 1) {
      items.push(index in value ? encodeSnapshotValue(value[index]) : { $hole: true })
    }
    return { $array: getSnapshotArrayKind(value), items }
  }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) out[key] = encodeSnapshotValue(item)
  return out
}

function decodeSnapshotValue(value: unknown): unknown {
  if (!value || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map(decodeSnapshotValue)
  const record = value as Record<string, unknown>
  if (typeof record.$num === 'string') {
    return record.$num === 'NaN' ? NaN : record.$num === 'Infinity' ? Infinity : -Infinity
  }
  if (record.$undefined === true) return undefined
  if (record.$hole === true) return undefined
  if (typeof record.$array === 'string' && Array.isArray(record.items)) {
    const kind = record.$array === 'pattern' ? 'pattern' : 'plain'
    const array = tagSnapshotArray([], kind)
    array.length = record.items.length
    record.items.forEach((item, index) => {
      const entry = item as Record<string, unknown> | null
      if (entry && typeof entry === 'object' && entry.$hole === true) return
      array[index] = decodeSnapshotValue(item)
    })
    return array
  }
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(record)) out[key] = decodeSnapshotValue(item)
  return out
}

export function encodeFastReplaySnapshot(snapshot: FastReplaySnapshot): FastReplaySnapshotJson {
  const scale = 10 ** FRAME_DECIMALS
  return {
    elapsedMs: snapshot.elapsedMs,
    simulatedFrames: snapshot.simulatedFrames,
    frame: Array.from(snapshot.frame, (value) => Math.round(value * scale) / scale),
    patternFunctionBindings: encodeSnapshotValue(snapshot.patternFunctionBindings) as Record<string, unknown>,
    runtimeState: encodeSnapshotValue(snapshot.runtimeState) as Record<string, unknown>,
    shim: encodeSnapshotValue(snapshot.shim),
  }
}

export function decodeFastReplaySnapshot(json: FastReplaySnapshotJson): FastReplaySnapshot {
  return {
    elapsedMs: json.elapsedMs,
    simulatedFrames: json.simulatedFrames,
    frame: Float64Array.from(json.frame),
    patternFunctionBindings: decodeSnapshotValue(json.patternFunctionBindings) as Record<string, unknown>,
    runtimeState: decodeSnapshotValue(json.runtimeState) as Record<string, unknown>,
    shim: decodeSnapshotValue(json.shim) as ShimSnapshot,
  }
}
