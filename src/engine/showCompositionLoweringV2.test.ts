import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { fx } from './fixedpoint'
import { nativeDimension } from './loadPattern'
import { createFxShim, createShim } from './shim'
import { buildShowEpeExport } from './showEpeExport'
import { compileShow, type GeneratedShowArtifact } from './showCompiler'
import { createDefaultShow, showRecordToCompileRecipe, type ShowCompileRecipeSourceLookup } from './showModel'
import { lowerShowCompositionV2ForCompile, prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { emitShowPropertyTrackExpression, evaluateShowPropertyTrack } from './showPropertyAnimation'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { insertShowLayerTransition } from './showLayerTransitionAuthoring'
import { continuingV1Show, convertibleV1Show, flatV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { LIBRARIES } from '../pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { showAnimationCommandFixture } from '../test/showAnimationCommandFixture'
import type { MapPoint } from './maps/types'
import type { ShowRecord } from './personalContentRecords'

const SOURCE = 'export var calls = 0; export function beforeRender(delta) { calls = calls + 1 } export function render(index) { rgb(index / pixelCount, 0.25, 0.75) }'
const STATEFUL_SOURCE = 'export var saved = calls || 0; export var calls = 0; export var elapsed = 0; export function beforeRender(delta) { calls = calls + 1; elapsed = elapsed + delta / 1000 } export function render(index) { rgb(elapsed, calls / 100, saved) }'
const COORDINATE_SOURCE = 'export var calls = 0; export var elapsed = 0; export function beforeRender(delta) { calls = calls + 1; elapsed = elapsed + delta / 1000 } export function render2D(index, x, y) { rgb(x, elapsed, calls / 100) }'
const OUT_SOURCE = 'export var calls = 0; export function beforeRender(delta) { calls = calls + 1 } export function render2D(index, x, y) { rgb(1, x * 0.25, y * 0.25) }'
const IN_SOURCE = 'export var calls = 0; export function beforeRender(delta) { calls = calls + 1 } export function render2D(index, x, y) { rgb(x * 0.25, y * 0.25, 1) }'
const MAP: MapPoint[] = Array.from({ length: 8 }, (_, index) => ({
  sample: [index / 7, 0.5],
  pos: [index / 7, 0.5],
}))
const RESTART_SCHEDULER_MAP: MapPoint[] = [{ sample: [0.5], pos: [0.5, 0.5] }]
const RESTART_SCHEDULER_SOURCE = [
  'export var sample = 0',
  'export var level = 0',
  'export function sliderLevel(value) { level = value }',
  'export function beforeRender(delta) { if (delta > 0) sample = random(1) }',
  'export function render(index) { rgb(sample, level, 0) }',
].join('\n')

type RestartLoopPolicy = 'continuous' | 'deterministic-loop'

function restartSchedulerArtifact(
  policy: RestartLoopPolicy,
  restartEvents: number[],
  withHiddenGap = false,
  loopDurationMs = 200,
) {
  const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 0 }] }]
  const scenes = withHiddenGap
    ? [
        {
          holdMs: 50,
          placements: [{ zoneName: 'main', clipId: 'shared', controlTargets: { sliderLevel: 0.1 } }],
          transitionOut: { kind: 'cut' as const, durationMs: 0 },
        },
        {
          holdMs: 50,
          placements: [{ zoneName: 'main', clipId: 'gap' }],
          transitionOut: { kind: 'cut' as const, durationMs: 0 },
        },
        {
          holdMs: 100,
          placements: [{ zoneName: 'main', clipId: 'shared', controlTargets: { sliderLevel: 0.9 } }],
        },
      ]
    : [{ holdMs: loopDurationMs, placements: [{ zoneName: 'main', clipId: 'shared' }] }]
  return compileShow({
    clips: [
      { id: 'shared', source: RESTART_SCHEDULER_SOURCE, controlTargets: { sliderLevel: 0 } },
      ...(withHiddenGap
        ? [{ id: 'gap', source: 'export function render(index) { rgb(0, 0, 0) }' }]
        : []),
    ],
    zones,
    routingLayouts: [{ id: 'default', name: 'Default', zones }],
    routedSceneSequence: { scenes },
    restartEvents: restartEvents.map(atMs => ({ atMs, clipId: 'shared' })),
    loopDurationMs,
    ...(policy === 'deterministic-loop' ? { deterministicLoopReset: true } : {}),
  }, LIBRARIES, { patternSlotSharing: 'none' })
}

function reopenedRestartScheduler(
  policy: RestartLoopPolicy,
  fidelity: 'fast' | 'fidelity',
  restartEvents: number[],
  withHiddenGap = false,
) {
  const artifact = restartSchedulerArtifact(policy, restartEvents, withHiddenGap)
  const reopened = parseEpe(buildShowEpeExport(flatV1Show(false), artifact.code).text)
  const runtime = createFastReplayRuntime({
    code: reopened.src,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: RESTART_SCHEDULER_MAP, randomSeed: 1037, fidelity })
  return { artifact, runtime }
}

function seededRandomDraw(fidelity: 'fast' | 'fidelity', ordinal: number): number {
  const config = {
    mapPoints: RESTART_SCHEDULER_MAP,
    pixelCount: 1,
    dimensions: 1 as const,
    getVirtualTime: () => 0,
    randomSeed: 1037,
  }
  const shim = fidelity === 'fidelity' ? createFxShim(config) : createShim(config)
  const random = shim.builtins.random as (maximum?: number) => number
  let value = 0
  for (let draw = 0; draw < ordinal; draw += 1) value = random(shim.encodeScalar(1))
  return shim.decodeScalar(value)
}

function decodedScalar(value: unknown, fidelity: 'fast' | 'fidelity'): number {
  return Number(value) / (fidelity === 'fidelity' ? 65_536 : 1)
}

async function runGeneratedRestartProgress(
  source: string,
  sampleBinding: string,
  elapsedBinding: string,
  fidelity: 'fast' | 'fidelity' = 'fast',
  options: { deltaMs?: number; initialElapsedSeconds?: number; warmupDeltaMs?: number } = {},
): Promise<{
  elapsed: number
  randomCalls: number
  lastRandom: number
  sample: number
  pixel: number
}> {
  const workerSource = `
    const { parentPort, workerData } = require('node:worker_threads')
    const SCALE = 65536
    const fx = Object.fromEntries(workerData.fxMethods.map(([name, source]) => [
      name,
      eval('(' + source.replace(/^[^(]+/, 'function') + ')'),
    ]))
    const encode = workerData.fidelity === 'fidelity' ? fx.fromFloat : value => value
    const decode = workerData.fidelity === 'fidelity' ? fx.toFloat : value => value
    const wrap = fn => (...args) => encode(fn(...args.map(decode)))
    const pixelCount = encode(1)
    const floor = wrap(Math.floor)
    const ceil = wrap(Math.ceil)
    const round = wrap(Math.round)
    const trunc = wrap(Math.trunc)
    const abs = wrap(Math.abs)
    const min = wrap(Math.min)
    const max = wrap(Math.max)
    const sqrt = wrap(Math.sqrt)
    const pow = wrap(Math.pow)
    const sin = wrap(Math.sin)
    const cos = wrap(Math.cos)
    const atan2 = wrap(Math.atan2)
    const frac = wrap(value => value - Math.trunc(value))
    const mod = wrap((value, divisor) => value - Math.floor(value / divisor) * divisor)
    const clamp = wrap((value, low = 0, high = 1) => Math.min(high, Math.max(low, value)))
    const mix = wrap((left, right, amount) => left + (right - left) * amount)
    const wave = wrap(value => 0.5 + Math.sin(value * Math.PI * 2) * 0.5)
    const triangle = wrap(value => 1 - Math.abs((value % 1) * 2 - 1))
    const array = length => Array(Math.floor(decode(length))).fill(0)
    let randomState = workerData.randomSeed >>> 0
    let randomCalls = 0
    let lastRandom = 0
    function random(maximum = encode(1)) {
      randomState = (randomState + 0x6D2B79F5) >>> 0
      let value = randomState
      value = Math.imul(value ^ (value >>> 15), value | 1)
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
      randomCalls = randomCalls + 1
      lastRandom = encode((((value ^ (value >>> 14)) >>> 0) / 4294967296) * decode(maximum))
      return lastRandom
    }
    let captured = [0, 0, 0]
    function rgb(red, green, blue) { captured = [decode(red), decode(green), decode(blue)] }
    function hsv(hue, saturation, value) { rgb(value, value, value) }
    function time() { return 0 }
    eval(workerData.source.replace(/\\bexport\\s+/g, ''))
    if (workerData.warmupDeltaMs !== undefined) beforeRender(encode(workerData.warmupDeltaMs))
    if (workerData.initialElapsedSeconds !== undefined) {
      eval(workerData.elapsedBinding + ' = encode(workerData.initialElapsedSeconds)')
    }
    beforeRender(encode(workerData.deltaMs))
    render(encode(0))
    parentPort.postMessage({
      elapsed: eval(workerData.elapsedBinding),
      randomCalls,
      lastRandom,
      sample: eval(workerData.sampleBinding),
      pixel: captured[0],
    })
  `
  const worker = new Worker(workerSource, {
    eval: true,
    workerData: {
      source,
      sampleBinding,
      elapsedBinding,
      randomSeed: 1037,
      fidelity,
      deltaMs: options.deltaMs ?? 670,
      initialElapsedSeconds: options.initialElapsedSeconds,
      warmupDeltaMs: options.warmupDeltaMs,
      fxMethods: Object.entries(fx).map(([name, implementation]) => [name, implementation.toString()]),
    },
  })

  return await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      void worker.terminate()
      reject(new Error('Generated Restart artifact did not make progress within 2 seconds'))
    }, 2_000)
    worker.once('message', (result) => {
      clearTimeout(timeout)
      void worker.terminate()
      resolve(result)
    })
    worker.once('error', (error) => {
      clearTimeout(timeout)
      void worker.terminate()
      reject(error)
    })
  })
}

function replay(artifact: GeneratedShowArtifact, fidelity: 'fast' | 'fidelity', mapPoints = MAP) {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints, randomSeed: 1034, fidelity })
}

function freeze(result: ReturnType<ReturnType<typeof replay>['renderCurrentFrame']>) {
  return {
    elapsedMs: result.elapsedMs,
    frame: Array.from(result.frame),
    exports: { ...result.exports },
  }
}

function flatSamplingShow(repeatScale: number, splitPosition: number): ShowRecord {
  const show = flatV1Show(false)
  show.zones = [
    { id: 'left', name: 'Left', nominalPixelCount: 4 },
    { id: 'right', name: 'Right', nominalPixelCount: 4 },
  ]
  show.routingLayouts = [{
    id: 'split',
    name: 'Split',
    zones: [],
    logical: { kind: 'split', zoneIds: ['left', 'right'], axis: 'x' },
  }]
  show.scenes.forEach(scene => {
    scene.routingTargets = { splitPosition }
    scene.sampleTargets = { repeatScale }
  })
  show.cells = [
    {
      ...show.cells[0],
      id: 'cell-left',
      zoneId: 'left',
      sceneSpan: 2,
      pattern: { kind: 'stock', id: 'TestPattern1D' },
    },
    {
      ...show.cells[0],
      id: 'cell-right',
      zoneId: 'right',
      sceneSpan: 2,
      pattern: { kind: 'stock', id: 'CometLoom' },
    },
  ]
  return show
}

function routedSamplingShow(route: 'global-sections' | 'transition', repeatScale: number, splitPosition: number): ShowRecord {
  const show = route === 'transition' ? transitionV1Show('crossfade') : convertibleV1Show()
  show.zones = [
    { id: 'left', name: 'Left', nominalPixelCount: 4 },
    { id: 'right', name: 'Right', nominalPixelCount: 4 },
  ]
  show.routingLayouts = [{
    id: 'split',
    name: 'Split',
    zones: [],
    logical: { kind: 'split', zoneIds: ['left', 'right'], axis: 'x' },
  }]
  show.scenes.forEach(scene => {
    scene.routingTargets = { splitPosition }
    scene.sampleTargets = { repeatScale }
  })
  const composition = show.composition!
  if (route === 'global-sections') {
    composition.patternInstances = [
      { ...structuredClone(composition.patternInstances[0]), id: 'left-instance' },
      { ...structuredClone(composition.patternInstances[0]), id: 'right-instance' },
    ]
    composition.scenes[0].zones = [
      {
        zoneId: 'left', overlays: [],
        main: [{ id: 'left-clip', instanceId: 'left-instance', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } }],
      },
      {
        zoneId: 'right', overlays: [],
        main: [{ id: 'right-clip', instanceId: 'right-instance', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } }],
      },
    ]
  } else {
    composition.patternInstances.push({ ...structuredClone(composition.patternInstances[0]), id: 'right-instance' })
    composition.scenes[0].zones[0].zoneId = 'left'
    composition.scenes[0].zones.push({
      zoneId: 'right', overlays: [],
      main: [{ id: 'right-clip', instanceId: 'right-instance', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } }],
    })
  }
  return show
}

describe('lowerShowCompositionV2ForCompile', () => {
  it.each([
    { repeatScale: 1, splitPosition: 0.5, fidelity: 'fast' },
    { repeatScale: 1, splitPosition: 0.5, fidelity: 'fidelity' },
    { repeatScale: 2, splitPosition: 0.5, fidelity: 'fast' },
    { repeatScale: 2, splitPosition: 0.5, fidelity: 'fidelity' },
    { repeatScale: 1, splitPosition: 0.3, fidelity: 'fast' },
    { repeatScale: 1, splitPosition: 0.3, fidelity: 'fidelity' },
    { repeatScale: 2, splitPosition: 0.3, fidelity: 'fast' },
    { repeatScale: 2, splitPosition: 0.3, fidelity: 'fidelity' },
  ] as const)('prepares flat repeat $repeatScale and split $splitPosition through routed $fidelity replay', ({ repeatScale, splitPosition, fidelity }) => {
    const source = flatSamplingShow(repeatScale, splitPosition)
    const original = structuredClone(source)
    const flatLookup = { byCellId: { 'cell-left': COORDINATE_SOURCE, 'cell-right': COORDINATE_SOURCE }, stageDimension: 2 as const }
    const converted = convertShowRecordV1ToV2(source, flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const v2Lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, COORDINATE_SOURCE])),
      stageDimension: 2 as const,
    }
    const convertedBefore = structuredClone(converted.record)
    const lookupBefore = structuredClone(v2Lookup)
    const prepared = prepareShowV2ForCompile(converted.record, v2Lookup)
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') return
    const v1 = compileShow(showRecordToCompileRecipe(source, flatLookup), LIBRARIES)
    const v2 = compileShow(prepared.recipe, LIBRARIES)
    const points: MapPoint[] = [splitPosition - 0.01, splitPosition + 0.01]
      .map(x => ({ sample: [x, 0.25], pos: [x, 0.25] }))
    const leftRuntime = replay(v1, fidelity, points)
    const rightRuntime = replay(v2, fidelity, points)

    expect(source).toEqual(original)
    expect(converted.record).toEqual(convertedBefore)
    expect(v2Lookup).toEqual(lookupBefore)
    expect(prepared.provenance).toMatchObject({
      route: 'continuous-flat',
      layoutId: 'split',
      runtimeInstanceIdByClipId: Object.fromEntries(converted.record.composition.clips.map(clip => [clip.id, clip.instanceId])),
    })
    expect(prepared.provenance.derivedSceneIds).toEqual(['v2-flat-section:0', 'v2-flat-section:1'])
    expect(v2.summary.clips.map(member => member.id)).toEqual(converted.report.flatProjectionMappings.flatMap(mapping => mapping.placementIds.slice(0, 1)))
    expect(v2.summary.clips).toHaveLength(v1.summary.clips.length)
    for (const atMs of [0, 100, 499, 500, 501, 999]) {
      const options = { stepMs: 1, forceFullIntermediateRender: true }
      const left = freeze(atMs === 0 ? leftRuntime.renderCurrentFrame() : leftRuntime.advanceTo(atMs, options))
      const right = freeze(atMs === 0 ? rightRuntime.renderCurrentFrame() : rightRuntime.advanceTo(atMs, options))
      expect(right.frame).toEqual(left.frame)
      for (const mapping of converted.report.flatProjectionMappings) {
        const leftMember = v1.summary.clips.find(member => member.id === mapping.cellId)!
        const rightMember = v2.summary.clips.find(member => member.id === mapping.placementIds[0])!
        expect(rightMember).toBeTruthy()
        for (const state of ['calls', 'elapsed']) {
          expect(right.exports[`${rightMember.prefix}_${state}`]).toEqual(left.exports[`${leftMember.prefix}_${state}`])
        }
      }
    }
    if (fidelity === 'fast') {
      const atLandmarks = freeze(replay(v2, fidelity, points).advanceLive(100))
      expect(atLandmarks.frame[0]).toBeCloseTo((((splitPosition - 0.01) / splitPosition) * repeatScale) % 1)
      expect(atLandmarks.frame[3]).toBeCloseTo(((0.01 / (1 - splitPosition)) * repeatScale) % 1)
      expect(atLandmarks.frame[1]).toBeCloseTo(0.1)
      expect(atLandmarks.frame[4]).toBeCloseTo(0.1)
    }
  })

  it('selects the existing routed global-section representation for a flat Restart record', () => {
    const source = flatV1Show(true)
    const flatLookup = { byCellId: { 'cell-a': STATEFUL_SOURCE, 'cell-b': STATEFUL_SOURCE } }
    const converted = convertShowRecordV1ToV2(source, flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const [outgoing, incoming] = converted.record.composition.clips
    incoming.instanceId = outgoing.instanceId
    incoming.entryPolicy = 'restart'
    converted.record.composition.patternInstances = converted.record.composition.patternInstances
      .filter(instance => instance.id === outgoing.instanceId)
    const lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, STATEFUL_SOURCE])),
    }

    const prepared = prepareShowV2ForCompile(converted.record, lookup)
    expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
    if (prepared.status !== 'ready') return
    expect(prepared.provenance.route).toBe('global-sections')
    expect(prepared.recipe.restartEvents).toEqual([{ atMs: 500, clipId: 'cell-a' }])
    expect(() => compileShow(prepared.recipe, LIBRARIES)).not.toThrow()
  })

  it.each(['fast', 'fidelity'] as const)('lowers an occurrence-owned retained split-position curve through routed %s output', fidelity => {
    const flatLookup = { byCellId: { 'cell-left': COORDINATE_SOURCE, 'cell-right': COORDINATE_SOURCE }, stageDimension: 2 as const }
    const converted = convertShowRecordV1ToV2(flatSamplingShow(1, 0.25), flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const occurrence = converted.record.composition.layoutOccurrences[0]
    occurrence.parameters.splitPosition = 0.25
    const easing = { curve: 'quadratic', direction: 'in' } as const
    const sourceValue = (elapsedMs: number) => 0.2 + 0.6 * (elapsedMs / 2_000) ** 2
    converted.record.composition.propertyTracks.push({
      id: 'split-track',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: occurrence.id },
      activeStartMs: 0,
      activeDurationMs: 1_000,
      keyframes: [
        {
          id: 'split-start', timeMs: 0, value: sourceValue(500), easing,
          curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing, sourceDurationMs: 2_000, elapsedOffsetMs: 500 },
        },
        { id: 'split-end', timeMs: 1_000, value: sourceValue(1_500), easing: { curve: 'hold', at: 1 } },
      ],
    })
    const lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, COORDINATE_SOURCE])),
      stageDimension: 2 as const,
    }

    expect(() => lowerShowCompositionV2ForCompile(converted.record, lookup))
      .toThrow('Layout split-position animation requires prepareShowV2ForCompile')
    const prepared = prepareShowV2ForCompile(converted.record, lookup)

    expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
    if (prepared.status !== 'ready') return
    const artifact = compileShow(prepared.recipe, LIBRARIES)
    const pointX = 0.4
    const runtime = replay(artifact, fidelity, [{ sample: [pointX, 0.25], pos: [pointX, 0.25] }])
    let previousMs = 0
    const track = converted.record.composition.propertyTracks[0]
    for (const atMs of [1, 250, 500, 750, 999]) {
      const result = runtime.advanceLive(atMs - previousMs)
      const splitPosition = evaluateShowPropertyTrackV2(track, atMs)!
      const expectedX = pointX < splitPosition
        ? pointX / splitPosition
        : (pointX - splitPosition) / (1 - splitPosition)
      expect(result.frame[0]).toBeCloseTo(expectedX, fidelity === 'fast' ? 8 : 3)
      previousMs = atMs
    }
  })

  it.each([
    { route: 'global-sections', repeatScale: 1, splitPosition: 0.5 },
    { route: 'global-sections', repeatScale: 2, splitPosition: 0.3 },
    { route: 'transition', repeatScale: 1, splitPosition: 0.5 },
    { route: 'transition', repeatScale: 2, splitPosition: 0.3 },
  ] as const)('prepares $route default/combined routing semantics through both runtimes', ({ route, repeatScale, splitPosition }) => {
    const source = routedSamplingShow(route, repeatScale, splitPosition)
    const original = structuredClone(source)
    const ids = source.composition!.patternInstances.map(instance => instance.id)
    const lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(ids.map(id => [id, COORDINATE_SOURCE])),
      stageDimension: 2 as const,
    }
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const recordBefore = structuredClone(converted.record)
    const prepared = prepareShowV2ForCompile(converted.record, lookup)
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') return
    expect(prepared.provenance).toMatchObject({ route, layoutId: 'split' })
    expect(Object.keys(prepared.provenance.runtimeInstanceIdByClipId).sort()).toEqual(
      converted.record.composition.clips.map(clip => clip.id).sort(),
    )
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(prepared.recipe, LIBRARIES)
    expect(v2.summary.clips.map(member => member.id).sort()).toEqual(v1.summary.clips.map(member => member.id).sort())
    const points: MapPoint[] = [splitPosition - 0.01, splitPosition + 0.01]
      .map(x => ({ sample: [x, 0.25], pos: [x, 0.25] }))
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const leftRuntime = replay(v1, fidelity, points)
      const rightRuntime = replay(v2, fidelity, points)
      for (const atMs of [0, 100, 399, 400, 401, 500, 599, 600, 601, 999]) {
        const options = { stepMs: 1, forceFullIntermediateRender: true }
        const left = freeze(atMs === 0 ? leftRuntime.renderCurrentFrame() : leftRuntime.advanceTo(atMs, options))
        const right = freeze(atMs === 0 ? rightRuntime.renderCurrentFrame() : rightRuntime.advanceTo(atMs, options))
        expect(right.frame).toEqual(left.frame)
        for (const member of v1.summary.clips) {
          const rightMember = v2.summary.clips.find(candidate => candidate.id === member.id)!
          expect(rightMember).toBeTruthy()
          for (const state of ['calls', 'elapsed']) {
            expect(right.exports[`${rightMember.prefix}_${state}`]).toEqual(left.exports[`${member.prefix}_${state}`])
          }
        }
      }
    }
    expect(source).toEqual(original)
    expect(converted.record).toEqual(recordBefore)
  })

  it('returns typed missing-source refusal and admits section-spanning activation without mutation', () => {
    const record = convertedRecord()
    const before = structuredClone(record)
    expect(prepareShowV2ForCompile(record, { byCellId: {} })).toEqual({
      status: 'refused',
      issues: [{
        code: 'missing-pattern-source',
        path: 'composition.patternInstances[0]',
        message: 'requires exact Pattern source for instance "instance".',
      }],
    })
    expect(record).toEqual(before)

    record.composition.clips[0].appearance.keys.push({
      ...structuredClone(record.composition.clips[0].appearance.keys[0]),
      id: 'appearance-second',
      timeMs: 500,
    })
    record.composition.propertyTracks.push({
      id: 'full-track',
      target: { kind: 'instance-time-scale', instanceId: 'instance' },
      activeStartMs: 0,
      activeDurationMs: 1_000,
      keyframes: [
        { id: 'start', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'end', timeMs: 1_000, value: 2, easing: { curve: 'linear' } },
      ],
    })
    const activationBefore = structuredClone(record)
    expect(prepareShowV2ForCompile(record, {
      byCellId: {}, byPatternInstanceId: { instance: SOURCE },
    })).toMatchObject({ status: 'ready' })
    expect(record).toEqual(activationBefore)
  })

  it('derives the existing compiler recipe from global v2 entities without retaining a v1 source snapshot', () => {
    const source = convertibleV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }

    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1Recipe = showRecordToCompileRecipe(source, lookup)
    const v2Recipe = showRecordToCompileRecipe(lowered.show, lowered.lookup)
    const prepared = prepareShowV2ForCompile(converted.record, lookup)

    expect(v2Recipe).toEqual(v1Recipe)
    expect(prepared).toMatchObject({ status: 'ready', recipe: v1Recipe })
    expect(lowered.show.composition?.scenes[0].sceneId).toBe('v2-section:0')
    expect(Object.keys(lowered).sort()).toEqual(['lookup', 'show'])
    if (prepared.status !== 'ready') return
    const artifact = compileShow(prepared.recipe, LIBRARIES)
    const exported = buildShowEpeExport(source, artifact.code, {
      id: 'show-v2-tracer',
      stampedAt: '2026-09-14T00:00:00.000Z',
    })
    const reopened = parseEpe(exported.text)
    expect(reopened).toMatchObject({ name: source.name, stamp: { kind: 'show' } })
    expect(reopened.src).toContain(artifact.code)
  })

  it.each(['fast', 'fidelity'] as const)('reopens an .epe whose incoming Restart fully resets its one shared runtime in %s mode', (fidelity) => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const [outgoing, incoming] = converted.record.composition.clips
    incoming.instanceId = outgoing.instanceId
    incoming.entryPolicy = 'restart'
    converted.record.composition.patternInstances = converted.record.composition.patternInstances
      .filter(instance => instance.id === outgoing.instanceId)
    const lookup = { byCellId: {}, byPatternInstanceId: { [outgoing.instanceId]: STATEFUL_SOURCE }, stageDimension: 2 as const }

    const prepared = prepareShowV2ForCompile(converted.record, lookup)
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') return
    expect(() => lowerShowCompositionV2ForCompile(converted.record, lookup)).toThrow('requires prepareShowV2ForCompile')
    expect(prepared.recipe.restartEvents).toEqual([{ atMs: 400, clipId: outgoing.instanceId }])
    const artifact = compileShow(prepared.recipe, LIBRARIES, { patternSlotSharing: 'none' })
    expect(artifact.summary.clips).toHaveLength(1)
    const reopened = parseEpe(buildShowEpeExport(transitionV1Show('crossfade', 'live-live'), artifact.code).text)
    const preparedReplay = {
      code: reopened.src,
      fxCode: artifact.fxCode,
      metadata: artifact.metadata,
      dimension: nativeDimension(artifact.metadata.renderFns),
    }
    const runtime = createFastReplayRuntime(preparedReplay, { mapPoints: MAP, randomSeed: 1037, fidelity })
    const prefix = artifact.summary.clips[0].prefix
    const scalar = (value: unknown) => Number(value) / (fidelity === 'fidelity' ? 65_536 : 1)

    const before = runtime.advanceTo(390, { stepMs: 1 })
    const beforeCalls = scalar(before.exports[`${prefix}_calls`])
    const beforeElapsed = scalar(before.exports[`${prefix}_elapsed`])
    expect(beforeElapsed).toBeGreaterThan(0.35)
    const after = runtime.advanceTo(410, { stepMs: 1 })
    expect(scalar(after.exports[`${prefix}_calls`])).toBeLessThan(beforeCalls)
    expect(scalar(after.exports[`${prefix}_elapsed`])).toBeLessThan(0.03)
    expect(scalar(after.exports[`${prefix}_elapsed`])).toBeLessThan(beforeElapsed)
    expect(scalar(after.exports[`${prefix}_saved`])).toBe(0)
    const cold = createFastReplayRuntime(preparedReplay, { mapPoints: MAP, randomSeed: 1037, fidelity })
      .advanceTo(410, { stepMs: 1 })
    expect(cold.exports).toEqual(after.exports)
    expect(Array.from(cold.frame)).toEqual(Array.from(after.frame))
  })

  it.each((['fast', 'fidelity'] as const).flatMap(fidelity => (
    (['live', 'stepped'] as const).flatMap(clock => ([
      { fidelity, clock, transition: 'cut' as const },
      { fidelity, clock, transition: 'snapshot-live' as const },
    ]))
  )))(
    'reopens an .epe whose $clock restarted member matches an independently cold member through $transition in $fidelity mode',
    ({ fidelity, clock, transition }) => {
      const adaptation = clock === 'stepped' ? { steppedClock: { stepMs: 50 } } : undefined
      const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 7 }] }]
      const artifact = compileShow({
        clips: [
          { id: 'restarted', source: STATEFUL_SOURCE, adaptation },
          { id: 'cold', source: STATEFUL_SOURCE, adaptation },
        ],
        zones,
        routingLayouts: [{ id: 'default', name: 'Default', zones }],
        routedSceneSequence: { scenes: [
          {
            holdMs: 400,
            placements: [{ zoneName: 'main', clipId: 'restarted', stackOrder: 0 }],
            transitionOut: transition === 'cut'
              ? { kind: 'cut', durationMs: 0 }
              : { kind: 'crossfade', durationMs: 100, crossfadePolicy: 'snapshot-live' },
          },
          {
            holdMs: 100,
            placements: [
              { zoneName: 'main', clipId: 'restarted', stackOrder: 0 },
              { zoneName: 'main', clipId: 'cold', stackOrder: 1 },
            ],
          },
        ] },
        restartEvents: [{ atMs: 400, clipId: 'restarted' }],
        loopDurationMs: transition === 'cut' ? 500 : 600,
      }, LIBRARIES, { patternSlotSharing: 'none' })
      const reopened = parseEpe(buildShowEpeExport(flatV1Show(false), artifact.code).text)
      const result = createFastReplayRuntime({
        code: reopened.src,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }, { mapPoints: MAP, randomSeed: 1037, fidelity }).advanceTo(410, { stepMs: 1 })
      const scalar = (value: unknown) => Number(value) / (fidelity === 'fidelity' ? 65_536 : 1)
      const [restarted, cold] = artifact.summary.clips

      for (const binding of ['saved', 'calls', 'elapsed']) {
        expect(scalar(result.exports[`${restarted.prefix}_${binding}`])).toBeCloseTo(
          scalar(result.exports[`${cold.prefix}_${binding}`]),
        )
      }
    },
  )

  it.each(['fast', 'fidelity'] as const)(
    'reopens an .epe whose forward-dependent Restart baseline survives a deterministic loop in %s mode',
    fidelity => {
      const forwardSource = 'export var saved = calls || 0; export var calls = 0; export var elapsed = 0; export function beforeRender(delta) { if (delta > 0) { calls = calls + 1; elapsed = elapsed + delta / 1000 } } export function render(index) { rgb(elapsed, calls / 100, saved) }'
      const zones = [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 7 }] }]
      const artifact = compileShow({
        clips: [{ id: 'restarted', source: forwardSource }],
        zones,
        routingLayouts: [{ id: 'default', name: 'Default', zones }],
        routedSceneSequence: { scenes: [{
          holdMs: 200,
          placements: [{ zoneName: 'main', clipId: 'restarted' }],
        }] },
        restartEvents: [{ atMs: 150, clipId: 'restarted' }],
        loopDurationMs: 200,
        deterministicLoopReset: true,
      }, LIBRARIES, { patternSlotSharing: 'none' })
      const reopened = parseEpe(buildShowEpeExport(flatV1Show(false), artifact.code).text)
      const preparedReplay = {
        code: reopened.src,
        fxCode: artifact.fxCode,
        metadata: artifact.metadata,
        dimension: nativeDimension(artifact.metadata.renderFns),
      }
      const afterLoop = createFastReplayRuntime(preparedReplay, { mapPoints: MAP, randomSeed: 1037, fidelity })
        .advanceLive(210)
      const cold = createFastReplayRuntime(preparedReplay, { mapPoints: MAP, randomSeed: 1037, fidelity })
        .advanceLive(10)
      const prefix = artifact.summary.clips[0].prefix

      Array.from(afterLoop.frame).forEach((value, index) => {
        expect(value).toBeCloseTo(cold.frame[index], 3)
      })
      expect(afterLoop.exports[`${prefix}_saved`]).toEqual(cold.exports[`${prefix}_saved`])
      expect(afterLoop.exports[`${prefix}_saved`]).toBe(0)
      expect(afterLoop.exports[`${prefix}_calls`]).toEqual(cold.exports[`${prefix}_calls`])
      expect(Math.abs(
        Number(afterLoop.exports[`${prefix}_elapsed`]) - Number(cold.exports[`${prefix}_elapsed`]),
      )).toBeLessThanOrEqual(fidelity === 'fidelity' ? 1 : 1e-9)
    },
  )

  it.each((['fast', 'fidelity'] as const).flatMap(fidelity => ([
    { fidelity, policy: 'continuous' as const, expectedDraw: 3 },
    { fidelity, policy: 'deterministic-loop' as const, expectedDraw: 4 },
  ])))(
    'reopens an .epe whose hidden Restart gap follows $policy policy in $fidelity mode',
    ({ fidelity, policy, expectedDraw }) => {
      const { artifact, runtime } = reopenedRestartScheduler(policy, fidelity, [100], true)
      expect(artifact.summary.clips.map(member => member.id).sort()).toEqual(['gap', 'shared'])
      expect(artifact.summary.clips.filter(member => member.id === 'shared')).toHaveLength(1)
      const prefix = artifact.summary.clips.find(member => member.id === 'shared')!.prefix

      runtime.advanceLive(10)
      const result = runtime.advanceLive(110)
      const sample = decodedScalar(result.exports[`${prefix}_sample`], fidelity)
      const level = decodedScalar(result.exports[`${prefix}_level`], fidelity)

      expect(sample).toBe(seededRandomDraw(fidelity, expectedDraw))
      expect(result.pixels[0][0]).toBeCloseTo(sample, fidelity === 'fast' ? 12 : 4)
      expect(level).toBeCloseTo(0.9, fidelity === 'fast' ? 12 : 4)
      expect(result.pixels[0][1]).toBeCloseTo(level, fidelity === 'fast' ? 12 : 4)
    },
  )

  it('reopens an .epe and makes progress through 6.7 short Restart loops', { timeout: 5_000 }, async () => {
    const artifact = restartSchedulerArtifact('continuous', [50], false, 100)
    const reopened = parseEpe(buildShowEpeExport(flatV1Show(false), artifact.code).text)
    const prefix = artifact.summary.clips[0].prefix
    const sampleName = `${prefix}_sample`
    const elapsedName = '__pxlblz_show_elapsed_s'
    const result = await runGeneratedRestartProgress(
      reopened.src,
      artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
      artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
    )
    expect(result.elapsed).toBeCloseTo(0.07, 12)
    // One slice precedes the first event, each of the next six events crosses
    // a tail/head loop boundary, and the final 20 ms is one ordinary slice.
    expect(result.randomCalls).toBe(14)
    expect(result.lastRandom).toBe(seededRandomDraw('fast', 14))
    expect(result.sample).toBe(result.lastRandom)
    expect(result.pixel).toBeCloseTo(result.lastRandom, 12)
  })

  it('executes the generated Precise artifact through 6.7 short Restart loops', { timeout: 5_000 }, async () => {
    const artifact = restartSchedulerArtifact('continuous', [50], false, 100)
    const prefix = artifact.summary.clips[0].prefix
    const sampleName = `${prefix}_sample`
    const elapsedName = '__pxlblz_show_elapsed_s'
    const result = await runGeneratedRestartProgress(
      artifact.fxCode,
      artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
      artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
      'fidelity',
    )
    const deltaSeconds = fx.div(fx.fromFloat(670), fx.fromFloat(1000))
    const loopDuration = fx.fromFloat(0.1)
    const expectedElapsed = fx.sub(deltaSeconds, fx.mul(fx.fromFloat(6), loopDuration))
    // The 16.16 clock rounds 670 ms to 43,909 ticks and 100 ms to 6,554
    // ticks. Six complete loops therefore leave exactly 4,585 ticks.
    expect(deltaSeconds).toBe(43_909)
    expect(loopDuration).toBe(6_554)
    expect(expectedElapsed).toBe(4_585)
    expect(result.elapsed).toBe(expectedElapsed)
    expect(result.randomCalls).toBe(14)
    expect(result.lastRandom).toBe(fx.fromFloat(seededRandomDraw('fidelity', 14)))
    expect(result.sample).toBe(result.lastRandom)
    expect(result.pixel).toBe(fx.toFloat(result.lastRandom))
  })

  it.each(['fast', 'fidelity'] as const)(
    'executes the generated $fidelity artifact across the first wrap of an accepted long Show',
    { timeout: 5_000 },
    async (fidelity) => {
    const loopDurationMs = 16_384_000
    const initialElapsedSeconds = 16_383.99
    const deltaMs = 20
    const artifact = restartSchedulerArtifact('continuous', [8_192_000], false, loopDurationMs)
    const prefix = artifact.summary.clips[0].prefix
    const sampleName = `${prefix}_sample`
    const elapsedName = '__pxlblz_show_elapsed_s'
    const result = await runGeneratedRestartProgress(
      fidelity === 'fidelity' ? artifact.fxCode : artifact.code,
      artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
      artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
      fidelity,
      { deltaMs, initialElapsedSeconds },
    )
    const expectedElapsed = fidelity === 'fidelity'
      ? fx.mod(
          fx.add(
            fx.fromFloat(initialElapsedSeconds),
            fx.div(fx.fromFloat(deltaMs), fx.fromFloat(1_000)),
          ),
          fx.fromFloat(loopDurationMs / 1_000),
        )
      : (initialElapsedSeconds + deltaMs / 1_000) % (loopDurationMs / 1_000)
    expect(result.elapsed).toBe(expectedElapsed)
    expect(result.randomCalls).toBe(1)
    const expectedSample = seededRandomDraw(fidelity, 1)
    expect(result.lastRandom).toBe(fidelity === 'fidelity' ? fx.fromFloat(expectedSample) : expectedSample)
    expect(result.sample).toBe(result.lastRandom)
    expect(result.pixel).toBe(fidelity === 'fidelity' ? fx.toFloat(result.lastRandom) : result.lastRandom)
    },
  )

  it.each(([30_000, 60_000] as const).flatMap(loopDurationMs => (
    (['fast', 'fidelity'] as const).map(fidelity => ({ loopDurationMs, fidelity }))
  )))(
    'runs normal and boundary frames for a $loopDurationMs ms Show in $fidelity mode',
    { timeout: 5_000 },
    async ({ loopDurationMs, fidelity }) => {
      const durationSeconds = loopDurationMs / 1_000
      const initialElapsedSeconds = durationSeconds - 0.01
      const artifact = restartSchedulerArtifact('continuous', [loopDurationMs / 2], false, loopDurationMs)
      const prefix = artifact.summary.clips[0].prefix
      const sampleName = `${prefix}_sample`
      const elapsedName = '__pxlblz_show_elapsed_s'
      const result = await runGeneratedRestartProgress(
        fidelity === 'fidelity' ? artifact.fxCode : artifact.code,
        artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
        artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
        fidelity,
        { warmupDeltaMs: 16, deltaMs: 20, initialElapsedSeconds },
      )
      const expectedElapsed = fidelity === 'fidelity'
        ? fx.mod(
            fx.add(
              fx.fromFloat(initialElapsedSeconds),
              fx.div(fx.fromFloat(20), fx.fromFloat(1_000)),
            ),
            fx.fromFloat(durationSeconds),
          )
        : (initialElapsedSeconds + 0.02) % durationSeconds
      const expectedSample = seededRandomDraw(fidelity, 2)
      expect(result.elapsed).toBe(expectedElapsed)
      expect(result.randomCalls).toBe(2)
      expect(result.sample).toBe(fidelity === 'fidelity' ? fx.fromFloat(expectedSample) : expectedSample)
      expect(result.pixel).toBe(expectedSample)
    },
  )

  it.each((['fast', 'fidelity'] as const).flatMap(fidelity => ([
    { fidelity, policy: 'continuous' as const, expectedDraws: 4 },
    { fidelity, policy: 'deterministic-loop' as const, expectedDraws: 2 },
  ])))(
    'owns an exact loop boundary without a sentinel in $fidelity $policy mode',
    { timeout: 5_000 },
    async ({ fidelity, policy, expectedDraws }) => {
      const artifact = restartSchedulerArtifact(policy, [50], false, 125)
      const prefix = artifact.summary.clips[0].prefix
      const sampleName = `${prefix}_sample`
      const elapsedName = '__pxlblz_show_elapsed_s'
      const result = await runGeneratedRestartProgress(
        fidelity === 'fidelity' ? artifact.fxCode : artifact.code,
        artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
        artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
        fidelity,
        { deltaMs: 250 },
      )
      expect(result.elapsed).toBe(0)
      expect(result.randomCalls).toBe(expectedDraws)
      if (policy === 'continuous') {
        const expectedSample = seededRandomDraw(fidelity, expectedDraws)
        expect(result.sample).toBe(fidelity === 'fidelity' ? fx.fromFloat(expectedSample) : expectedSample)
        expect(result.pixel).toBe(expectedSample)
      } else {
        expect(result.sample).toBe(0)
        expect(result.pixel).toBe(0)
      }
    },
  )

  it.each([
    { policy: 'continuous' as const, expectedDraws: 20 },
    { policy: 'deterministic-loop' as const, expectedDraws: 1 },
  ])(
    'makes bounded Precise progress through the minimum 1 ms $policy loop',
    { timeout: 5_000 },
    async ({ policy, expectedDraws }) => {
      const artifact = restartSchedulerArtifact(policy, [0], false, 1)
      const prefix = artifact.summary.clips[0].prefix
      const sampleName = `${prefix}_sample`
      const elapsedName = '__pxlblz_show_elapsed_s'
      const result = await runGeneratedRestartProgress(
        artifact.fxCode,
        artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
        artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
        'fidelity',
        { deltaMs: 20 },
      )
      const deltaSeconds = fx.div(fx.fromFloat(20), fx.fromFloat(1_000))
      const duration = fx.fromFloat(0.001)
      expect(duration).toBe(66)
      expect(result.elapsed).toBe(fx.mod(deltaSeconds, duration))
      expect(result.randomCalls).toBe(expectedDraws)
      const expectedSample = seededRandomDraw('fidelity', expectedDraws)
      expect(result.sample).toBe(fx.fromFloat(expectedSample))
      expect(result.pixel).toBe(expectedSample)
    },
  )

  it.each([32_768_000, 40_000_000])(
    'terminates generated Precise Restart traversal for out-of-range %i ms clock input',
    { timeout: 5_000 },
    async (loopDurationMs) => {
      const artifact = restartSchedulerArtifact('continuous', [1], false, loopDurationMs)
      const prefix = artifact.summary.clips[0].prefix
      const sampleName = `${prefix}_sample`
      const elapsedName = '__pxlblz_show_elapsed_s'
      await expect(runGeneratedRestartProgress(
        artifact.fxCode,
        artifact.metadata.patternVarBindings?.[sampleName] ?? sampleName,
        artifact.metadata.patternVarBindings?.[elapsedName] ?? elapsedName,
        'fidelity',
        { deltaMs: 16 },
      )).resolves.toEqual(expect.objectContaining({ randomCalls: expect.any(Number) }))
    },
  )

  it.each((['fast', 'fidelity'] as const).flatMap(fidelity => ([
    { fidelity, policy: 'continuous' as const, expectedDraw: 4 },
    { fidelity, policy: 'deterministic-loop' as const, expectedDraw: 3 },
  ])))(
    'reopens an .epe and visits every Restart across multiple $policy loops in $fidelity mode',
    ({ fidelity, policy, expectedDraw }) => {
      const coarseFixture = reopenedRestartScheduler(policy, fidelity, [100])
      const steppedFixture = reopenedRestartScheduler(policy, fidelity, [100])
      const prefix = coarseFixture.artifact.summary.clips[0].prefix

      const coarse = coarseFixture.runtime.advanceLive(420)
      let stepped = steppedFixture.runtime.advanceLive(100)
      for (const deltaMs of [100, 100, 120]) stepped = steppedFixture.runtime.advanceLive(deltaMs)
      const expectedSample = seededRandomDraw(fidelity, expectedDraw)
      const steppedExpectedSample = seededRandomDraw(fidelity, fidelity === 'fast' ? expectedDraw : 5)

      expect(decodedScalar(coarse.exports[`${prefix}_sample`], fidelity)).toBe(expectedSample)
      // In Precise mode the established seconds clock retains one 16.16 tick
      // after two separately rounded 100 ms frames. Measure that existing
      // arithmetic result instead of adding an epsilon policy to Restart.
      expect(decodedScalar(stepped.exports[`${prefix}_sample`], fidelity)).toBe(steppedExpectedSample)
      expect(decodedScalar(coarse.exports.__pxlblz_show_elapsed_s, fidelity)).toBeCloseTo(0.02, 4)
      expect(decodedScalar(stepped.exports.__pxlblz_show_elapsed_s, fidelity)).toBeCloseTo(0.02, 3)
      expect(coarse.pixels[0][0]).toBeCloseTo(expectedSample, fidelity === 'fast' ? 12 : 4)
      expect(stepped.pixels[0][0]).toBeCloseTo(steppedExpectedSample, fidelity === 'fast' ? 12 : 4)
    },
  )

  it.each((['fast', 'fidelity'] as const).flatMap(fidelity => ([
    { fidelity, policy: 'continuous' as const, deltaMs: 120, expectedDraw: 2, expectedElapsedSeconds: 0.12 },
    { fidelity, policy: 'deterministic-loop' as const, deltaMs: 120, expectedDraw: 2, expectedElapsedSeconds: 0.12 },
    { fidelity, policy: 'continuous' as const, deltaMs: 220, expectedDraw: 2, expectedElapsedSeconds: 0.02 },
    { fidelity, policy: 'deterministic-loop' as const, deltaMs: 220, expectedDraw: 2, expectedElapsedSeconds: 0.02 },
  ])))(
    'reopens an .epe and visits zero/one-wrap Restart boundaries for $policy at $deltaMs ms in $fidelity mode',
    ({ fidelity, policy, deltaMs, expectedDraw, expectedElapsedSeconds }) => {
      const { artifact, runtime } = reopenedRestartScheduler(policy, fidelity, [100])
      const prefix = artifact.summary.clips[0].prefix
      const result = runtime.advanceLive(deltaMs)

      expect(decodedScalar(result.exports[`${prefix}_sample`], fidelity))
        .toBe(seededRandomDraw(fidelity, expectedDraw))
      expect(decodedScalar(result.exports.__pxlblz_show_elapsed_s, fidelity))
        .toBeCloseTo(expectedElapsedSeconds, fidelity === 'fast' ? 12 : 3)
    },
  )

  it.each((['fast', 'fidelity'] as const).flatMap(fidelity => ([
    { fidelity, policy: 'continuous' as const, expectedDraw: 5 },
    { fidelity, policy: 'deterministic-loop' as const, expectedDraw: 3 },
  ])))(
    'reopens an .epe and coalesces time-zero Restart across $policy loops in $fidelity mode',
    ({ fidelity, policy, expectedDraw }) => {
      const coarseFixture = reopenedRestartScheduler(policy, fidelity, [0, 100])
      const prefix = coarseFixture.artifact.summary.clips[0].prefix
      const coarse = coarseFixture.runtime.advanceLive(420)
      expect(decodedScalar(coarse.exports[`${prefix}_sample`], fidelity))
        .toBe(seededRandomDraw(fidelity, expectedDraw))

      const primingFixture = reopenedRestartScheduler(policy, fidelity, [0, 100])
      const primingPrefix = primingFixture.artifact.summary.clips[0].prefix
      expect(decodedScalar(primingFixture.runtime.advanceLive(0).exports[`${primingPrefix}_sample`], fidelity)).toBe(0)
      const mutated = primingFixture.runtime.advanceLive(10)
      const mutatedSample = decodedScalar(mutated.exports[`${primingPrefix}_sample`], fidelity)
      expect(mutatedSample).toBe(seededRandomDraw(fidelity, 1))
      expect(decodedScalar(primingFixture.runtime.advanceLive(0).exports[`${primingPrefix}_sample`], fidelity))
        .toBe(mutatedSample)
    },
  )

  it.each([
    ['implicit persistent state', 'export var frame = 0\nexport function beforeRender(delta) { hidden = frame }\nexport function render(i) { rgb(frame, 0, 0) }', 'implicit-persistent-binding'],
    ['runtime array state', 'export var state\nexport function beforeRender(delta) { state = array(2) }\nexport function render(i) { rgb(0, 0, 0) }', 'array-or-object-state'],
    ['persistent palette state', 'export var sample = 0\nexport function beforeRender(delta) { setPalette(frequencyData) }\nexport function render(i) { paint(sample) }', 'unsupported-runtime-facility'],
  ])('returns a typed Restart refusal for %s before v2 adoption', (_label, source, reason) => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const [outgoing, incoming] = converted.record.composition.clips
    incoming.instanceId = outgoing.instanceId
    incoming.entryPolicy = 'restart'
    converted.record.composition.patternInstances = converted.record.composition.patternInstances
      .filter(instance => instance.id === outgoing.instanceId)

    expect(prepareShowV2ForCompile(converted.record, {
      byCellId: {},
      byPatternInstanceId: { [outgoing.instanceId]: source },
      stageDimension: 2,
    })).toMatchObject({
      status: 'refused',
      issues: [{
        code: 'unsupported-restart',
        path: 'composition.clips[1]',
        message: expect.stringContaining(reason),
      }],
    })
  })

  it.each([
    {
      label: 'scalar Library state',
      library: 'var phase = 1\nfunction next() { phase = phase + 1; return phase }',
      expectedStatus: 'ready',
    },
    {
      label: 'array Library state',
      library: 'var state\nfunction next() { state = array(2); return state[0] }',
      expectedStatus: 'refused',
    },
  ])('plans Restart against bundled $label through the public preparation seam', ({ library, expectedStatus }) => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const [outgoing, incoming] = converted.record.composition.clips
    incoming.instanceId = outgoing.instanceId
    incoming.entryPolicy = 'restart'
    converted.record.composition.patternInstances = converted.record.composition.patternInstances
      .filter(instance => instance.id === outgoing.instanceId)
    const source = 'export var sample = 0\nexport function beforeRender(delta) { sample = Blz.next() }\nexport function render(i) { rgb(sample, 0, 0) }'
    const result = prepareShowV2ForCompile(converted.record, {
      byCellId: {}, byPatternInstanceId: { [outgoing.instanceId]: source }, stageDimension: 2,
    }, { libraries: { Blz: library } })

    expect(result.status).toBe(expectedStatus)
    if (result.status === 'ready') expect(() => compileShow(result.recipe, { Blz: library })).not.toThrow()
    else expect(result.issues).toEqual([expect.objectContaining({ code: 'unsupported-restart' })])
  })

  it.each(['fast', 'fidelity'] as const)(
    'uses a Group internal incoming Transition to reset shared state at first contribution in %s mode',
    fidelity => {
      const record = convertedRecord()
      record.composition.showEndMs = 2_400
      record.composition.layoutOccurrences[0].durationMs = 2_400
      const base = record.composition.clips[0]
      const instance = record.composition.patternInstances.find(candidate => candidate.id === base.instanceId)!
      const { zoneId: _zoneId, ...groupClip } = structuredClone(base)
      record.composition.groupDefinitions = [{
        id: 'definition', name: 'Restarting transition',
        patternInstances: [{ ...structuredClone(instance), id: 'group-instance' }],
        layers: [{ id: 'group-layer', name: 'Group layer', rank: 0 }],
        clips: [
          {
            ...groupClip, id: 'outgoing', instanceId: 'group-instance', layerId: 'group-layer',
            startMs: 0, durationMs: 400, entryPolicy: 'continue',
            appearance: { keys: [{ ...groupClip.appearance.keys[0], id: 'outgoing:key', timeMs: 0 }] },
          },
          {
            ...groupClip, id: 'incoming', instanceId: 'group-instance', layerId: 'group-layer',
            startMs: 600, durationMs: 400, entryPolicy: 'restart',
            appearance: { keys: [{ ...groupClip.appearance.keys[0], id: 'incoming:key', timeMs: 600 }] },
          },
        ],
        transitions: [{
          id: 'internal', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
          crossfadePolicy: 'live-live', fromPlacementId: 'outgoing', toPlacementId: 'incoming',
        }],
        propertyTracks: [],
      }]
      record.composition.groupOccurrences = [{
        id: 'occurrence', definitionId: 'definition', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
        zoneId: base.zoneId, startMs: 1_200, translationX: 0, translationY: 0,
        instanceBindings: { 'group-instance': base.instanceId },
        layerBindings: [{ definitionLayerId: 'group-layer', layerId: base.layerId }],
        holds: [],
      }]
      const lookup = { byCellId: {}, byPatternInstanceId: { [base.instanceId]: STATEFUL_SOURCE }, stageDimension: 2 as const }

      expect(() => lowerShowCompositionV2ForCompile(record, lookup))
        .toThrow('Restart requires prepareShowV2ForCompile')
      const prepared = prepareShowV2ForCompile(record, lookup)
      expect(prepared.status).toBe('ready')
      if (prepared.status !== 'ready') return
      expect(prepared.recipe.restartEvents).toEqual([{ atMs: 1_600, clipId: base.instanceId }])
      const artifact = compileShow(prepared.recipe, LIBRARIES, { patternSlotSharing: 'none' })
      const members = artifact.summary.clips.filter(member => member.id === base.instanceId)
      expect(members).toHaveLength(1)
      const runtime = replay(artifact, fidelity)
      const prefix = members[0].prefix
      const scalar = (value: unknown) => Number(value) / (fidelity === 'fidelity' ? 65_536 : 1)

      const before = runtime.advanceTo(1_500, { stepMs: 1 })
      const beforeElapsed = scalar(before.exports[`${prefix}_elapsed`])
      const beforeCalls = scalar(before.exports[`${prefix}_calls`])
      expect(beforeElapsed).toBeGreaterThan(1)
      const after = runtime.advanceTo(1_610, { stepMs: 1 })
      expect(scalar(after.exports[`${prefix}_elapsed`])).toBeLessThan(0.03)
      expect(scalar(after.exports[`${prefix}_elapsed`])).toBeLessThan(beforeElapsed)
      expect(scalar(after.exports[`${prefix}_calls`])).toBeLessThan(beforeCalls)
    },
  )

  it.each(['fast', 'fidelity'] as const)('preserves compiled output and advancing private state in %s mode', (fidelity) => {
    const source = convertibleV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.summary).toEqual(v1.summary)
    expect(v2.code).toBe(v1.code)

    const v1Runtime = replay(v1, fidelity)
    const v2Runtime = replay(v2, fidelity)
    const initialV1 = freeze(v1Runtime.renderCurrentFrame())
    const initialV2 = freeze(v2Runtime.renderCurrentFrame())
    expect(initialV2).toEqual(initialV1)
    const midpointV1 = freeze(v1Runtime.advanceTo(500, { stepMs: 16, forceFullIntermediateRender: true }))
    const midpointV2 = freeze(v2Runtime.advanceTo(500, { stepMs: 16, forceFullIntermediateRender: true }))
    expect(midpointV2).toEqual(midpointV1)
    const prefix = v1.summary.clips.find(clip => clip.id === 'instance')?.prefix
    expect(prefix).toBeTruthy()
    expect(Number(midpointV1.exports[`${prefix}_calls`])).toBeGreaterThan(Number(initialV1.exports[`${prefix}_calls`]))
    const interiorV1 = freeze(v1Runtime.advanceTo(999, { stepMs: 16, forceFullIntermediateRender: true }))
    const interiorV2 = freeze(v2Runtime.advanceTo(999, { stepMs: 16, forceFullIntermediateRender: true }))
    expect(interiorV2).toEqual(interiorV1)
  })

  it.each(['fast', 'fidelity'] as const)('preserves unstamped continuous lifecycle without adding loop reset in %s mode', (fidelity) => {
    const source = continuingV1Show()
    delete source.composition!.executionModel
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.executionModel).toBe('continuous')
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    expect(lowered.show.composition?.executionModel).toBeUndefined()
    const v1Recipe = showRecordToCompileRecipe(source, lookup)
    const v2Recipe = showRecordToCompileRecipe(lowered.show, lowered.lookup)
    expect(v2Recipe.deterministicLoopReset).toBeUndefined()
    const v1 = compileShow(v1Recipe, LIBRARIES)
    const v2 = compileShow(v2Recipe, LIBRARIES)
    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
    for (const atMs of [499, 500, 501, 999, 1_001, 1_250]) {
      const options = { stepMs: 16, forceFullIntermediateRender: true }
      expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
    }
  })

  it.each(([
    { name: 'shared Continue identity', restartSecond: false, expectedInstances: 1, fidelity: 'fast' },
    { name: 'shared Continue identity', restartSecond: false, expectedInstances: 1, fidelity: 'fidelity' },
    { name: 'fresh Restart identity', restartSecond: true, expectedInstances: 2, fidelity: 'fast' },
    { name: 'fresh Restart identity', restartSecond: true, expectedInstances: 2, fidelity: 'fidelity' },
  ] as const).flatMap(testCase => [2, 3].map(sceneCount => ({ ...testCase, sceneCount }))))('preserves flat $name with $sceneCount Scenes through projection, global lowering, and $fidelity runtime', ({ restartSecond, expectedInstances, fidelity, sceneCount }) => {
    const source = flatV1Show(restartSecond)
    if (sceneCount === 3) {
      source.scenes.push({ id: 'scene-c', name: 'Finale', durationMs: 500 })
      source.cells[source.cells.length - 1].sceneSpan = restartSecond ? 2 : 3
    }
    const original = structuredClone(source)
    const flatLookup: ShowCompileRecipeSourceLookup = {
      byCellId: restartSecond ? { 'cell-a': STATEFUL_SOURCE, 'cell-b': STATEFUL_SOURCE } : { 'cell-a': STATEFUL_SOURCE },
    }
    const converted = convertShowRecordV1ToV2(source, flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.patternInstances).toHaveLength(expectedInstances)
    const v2Lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, STATEFUL_SOURCE])),
    }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, v2Lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, flatLookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(source).toEqual(original)
    expect(v2.summary.clips.map(member => lowered.lookup.instanceIdByCellId?.[member.id] ?? member.id)).toEqual(v1.summary.clips.map(member => member.id))
    expect(v2.summary.clips).toHaveLength(expectedInstances)

    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
    for (const atMs of [499, 500, 501, 999, 1_000, 1_001, 1_499].filter(time => time < sceneCount * 500)) {
      const options = { stepMs: 16, forceFullIntermediateRender: true }
      const leftFrame = freeze(left.advanceTo(atMs, options))
      const rightFrame = freeze(right.advanceTo(atMs, options))
      expect(rightFrame.frame).toEqual(leftFrame.frame)
      for (const member of v1.summary.clips) {
        const rightMember = v2.summary.clips.find(candidate => (lowered.lookup.instanceIdByCellId?.[candidate.id] ?? candidate.id) === member.id)
        expect(rightMember).toBeTruthy()
        for (const name of ['calls', 'elapsed']) {
          expect(rightFrame.exports[`${rightMember!.prefix}_${name}`]).toEqual(leftFrame.exports[`${member.prefix}_${name}`])
        }
      }
    }
  })

  it.each([
    { name: 'Freeze presentation', patch: { presentation: { mode: 'freeze' as const } }, fidelity: 'fast' },
    { name: 'Freeze presentation', patch: { presentation: { mode: 'freeze' as const } }, fidelity: 'fidelity' },
    { name: 'Blink visibility', patch: { blink: { rateHz: 2, duty: 0.5, phase: 0 } }, fidelity: 'fast' },
    { name: 'Blink visibility', patch: { blink: { rateHz: 2, duty: 0.5, phase: 0 } }, fidelity: 'fidelity' },
  ] as const)('preserves flat time-varying $name frames and state in $fidelity runtime', ({ name, patch, fidelity }) => {
    const source = flatV1Show(false)
    source.scenes.push({ id: 'scene-c', name: 'Finale', durationMs: 500 })
    source.cells[0].sceneSpan = 3
    source.cells[0].viewport = { enabled: true, x: 0, y: 0, width: 1, height: 1, edge: 'hard' }
    Object.assign(source.cells[0], patch)
    const original = structuredClone(source)
    const flatLookup: ShowCompileRecipeSourceLookup = { byCellId: { 'cell-a': STATEFUL_SOURCE } }
    const converted = convertShowRecordV1ToV2(source, flatLookup)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const v2Lookup = {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(converted.record.composition.patternInstances.map(instance => [instance.id, STATEFUL_SOURCE])),
    }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, v2Lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, flatLookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(source).toEqual(original)
    expect(v2.summary.clips.map(member => member.id)).toEqual(['cell-a'])
    if (name === 'Freeze presentation') {
      expect(v1.summary.specializations.freezeAtEntry.selectedSceneCount).toBeGreaterThan(0)
      expect(v2.summary.specializations.freezeAtEntry.selectedSceneCount).toEqual(v1.summary.specializations.freezeAtEntry.selectedSceneCount)
    }

    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    const leftPrefix = v1.summary.clips[0].prefix
    const rightPrefix = v2.summary.clips[0].prefix
    const frames: number[][] = []
    for (const atMs of [0, 125, 250, 375, 499, 500, 501, 750, 999, 1_000, 1_001, 1_499]) {
      const options = { stepMs: 1, forceFullIntermediateRender: true }
      const leftFrame = freeze(atMs === 0 ? left.renderCurrentFrame() : left.advanceTo(atMs, options))
      const rightFrame = freeze(atMs === 0 ? right.renderCurrentFrame() : right.advanceTo(atMs, options))
      expect(rightFrame.frame).toEqual(leftFrame.frame)
      expect(rightFrame.exports[`${rightPrefix}_calls`]).toEqual(leftFrame.exports[`${leftPrefix}_calls`])
      expect(rightFrame.exports[`${rightPrefix}_elapsed`]).toEqual(leftFrame.exports[`${leftPrefix}_elapsed`])
      frames.push(leftFrame.frame)
    }
    expect(Number(freeze(left.renderCurrentFrame()).exports[`${leftPrefix}_calls`])).toBeGreaterThan(0)
    if (name === 'Freeze presentation') {
      expect(new Set(frames.map(frame => JSON.stringify(frame))).size).toBeGreaterThan(1)
    } else {
      expect(frames.some(frame => frame.every(value => value === 0))).toBe(true)
      expect(frames.some(frame => frame.some(value => value !== 0))).toBe(true)
    }
  })

  it.each(['fast', 'fidelity'] as const)('preserves mapped member state when global lowering changes compiler sections in %s mode', (fidelity) => {
    const source = continuingV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.code).not.toBe(v1.code)
    const v1Prefix = v1.summary.clips.find(clip => clip.id === 'instance')?.prefix
    const v2Prefix = v2.summary.clips.find(clip => clip.id === 'instance')?.prefix
    expect(v1Prefix).toBeTruthy()
    expect(v2Prefix).toBeTruthy()

    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    const initialLeft = freeze(left.renderCurrentFrame())
    const initialRight = freeze(right.renderCurrentFrame())
    expect(initialRight.frame).toEqual(initialLeft.frame)
    for (const atMs of [499, 500, 501, 750, 999]) {
      const options = { stepMs: 16, forceFullIntermediateRender: true }
      const leftFrame = freeze(left.advanceTo(atMs, options))
      const rightFrame = freeze(right.advanceTo(atMs, options))
      expect(rightFrame.frame).toEqual(leftFrame.frame)
      expect(rightFrame.exports[`${v2Prefix}_calls`]).toEqual(leftFrame.exports[`${v1Prefix}_calls`])
    }
  })

  it.each(['fast', 'fidelity'] as const)('preserves held opacity, Transform, and Aperture keys at boundaries and interiors in %s mode', (fidelity) => {
    for (const change of [
      (placement: ReturnType<typeof secondSegment>) => { placement.opacity = 0.25 },
      (placement: ReturnType<typeof secondSegment>) => {
        placement.transform = { positionX: 0.2, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 }
      },
      (placement: ReturnType<typeof secondSegment>) => {
        placement.viewport = { enabled: true, x: 0.2, y: 0, width: 0.6, height: 1 }
      },
    ]) {
      const source = divergentAppearanceShow()
      change(secondSegment(source))
      const before = JSON.stringify(source)
      const converted = convertShowRecordV1ToV2(source)
      expect(converted.status).toBe('converted')
      if (converted.status !== 'converted') continue
      const clip = converted.record.composition.clips[0]
      expect(converted.record.composition.clips).toHaveLength(1)
      expect(clip.appearance.keys.map(key => ({ id: key.id, timeMs: key.timeMs }))).toEqual([
        { id: 'clip:appearance:1', timeMs: 0 },
        { id: 'clip:appearance:2', timeMs: 500 },
      ])
      expect(JSON.parse(JSON.stringify(converted.record))).toEqual(converted.record)
      const lookup = { byCellId: {}, byPatternInstanceId: { instance: OUT_SOURCE }, stageDimension: 2 as const }
      const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
      const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
      const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
      const v1Prefix = v1.summary.clips.find(member => member.id === 'instance')!.prefix
      const v2Prefix = v2.summary.clips.find(member => member.id === 'instance')!.prefix
      const left = replay(v1, fidelity)
      const right = replay(v2, fidelity)
      expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
      for (const atMs of [249, 499, 500, 501, 750, 999]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        const leftResult = freeze(left.advanceTo(atMs, options))
        const rightResult = freeze(right.advanceTo(atMs, options))
        expect(rightResult.frame).toEqual(leftResult.frame)
        expect(rightResult.exports[`${v2Prefix}_calls`]).toEqual(leftResult.exports[`${v1Prefix}_calls`])
      }
      expect(JSON.stringify(source)).toBe(before)
    }
  })

  it.each(['fast', 'fidelity'] as const)('resets mapped member state across an actual deterministic loop in %s mode', (fidelity) => {
    const source = continuingV1Show()
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    const v1Prefix = v1.summary.clips.find(clip => clip.id === 'instance')!.prefix
    const v2Prefix = v2.summary.clips.find(clip => clip.id === 'instance')!.prefix

    const phase = (artifact: GeneratedShowArtifact, prefix: string) => {
      const runtime = replay(artifact, fidelity)
      runtime.renderCurrentFrame()
      const result = freeze(runtime.advanceLive(250))
      return { frame: result.frame, calls: result.exports[`${prefix}_calls`] }
    }
    const secondLoop = (artifact: GeneratedShowArtifact, prefix: string) => {
      const runtime = replay(artifact, fidelity)
      runtime.renderCurrentFrame()
      runtime.advanceLive(1_000)
      const result = freeze(runtime.advanceLive(250))
      return { frame: result.frame, calls: result.exports[`${prefix}_calls`] }
    }

    expect(secondLoop(v1, v1Prefix)).toEqual(phase(v1, v1Prefix))
    expect(secondLoop(v2, v2Prefix)).toEqual(phase(v2, v2Prefix))
    expect(secondLoop(v2, v2Prefix)).toEqual(secondLoop(v1, v1Prefix))
  })

  it('carries the selected Layout definition, split parameter, and Show repeat scale into derived compiler sections', () => {
    const converted = convertShowRecordV1ToV2(convertibleV1Show())
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    converted.record.zoneLayouts.unshift({
      id: 'unused-layout', name: 'Unused', zones: [], logical: { kind: 'single', zoneIds: ['zone'] },
    })
    converted.record.composition.layoutOccurrences[0].parameters.splitPosition = 0.3
    converted.record.composition.sampleRemap.repeatScale = 2

    const lowered = lowerShowCompositionV2ForCompile(converted.record, { byCellId: {}, byPatternInstanceId: { instance: SOURCE } })

    expect(lowered.show.routingLayouts[0].id).toBe('layout')
    expect(lowered.show.scenes[0]).toMatchObject({
      routingTargets: { splitPosition: 0.3 },
      sampleTargets: { repeatScale: 2 },
    })
  })

  it.each(['fast', 'fidelity'] as const)('keeps narrative Marker edits inert to generated behavior and state in %s mode', (fidelity) => {
    const baseline = convertedRecord()
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const artifactFor = (record: typeof baseline) => {
      const lowered = lowerShowCompositionV2ForCompile(record, lookup)
      return compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    }
    const baselineArtifact = artifactFor(baseline)
    const variants = [
      { ...structuredClone(baseline), composition: { ...structuredClone(baseline.composition), markers: [] } },
      {
        ...structuredClone(baseline),
        composition: {
          ...structuredClone(baseline.composition),
          markers: baseline.composition.markers.map(marker => ({ ...marker, timeMs: 333, name: 'Moved chapter' })),
        },
      },
      {
        ...structuredClone(baseline),
        composition: {
          ...structuredClone(baseline.composition),
          markers: [...structuredClone(baseline.composition.markers), { id: 'chapter-extra', timeMs: 667, name: 'Extra chapter' }],
        },
      },
    ]
    for (const variant of variants) {
      const artifact = artifactFor(variant)
      expect(artifact.code).toBe(baselineArtifact.code)
      expect(artifact.fxCode).toBe(baselineArtifact.fxCode)
      const left = replay(baselineArtifact, fidelity)
      const right = replay(artifact, fidelity)
      expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
      for (const atMs of [332, 333, 334, 666, 667, 668]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
      }
    }
  })

  it('preserves a property-only carrier through global-time conversion and actual replay', () => {
    const source = convertibleV1Show()
    source.composition!.scenes[0].propertyTracks = [{
      id: 'brightness',
      target: { kind: 'placement-view', placementId: 'clip', property: 'brightness' },
      keyframes: [
        { id: 'dim', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
        { id: 'bright', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.propertyTracks[0]).toMatchObject({
      target: { kind: 'clip-view', clipId: 'clip', property: 'brightness' },
      keyframes: [{ timeMs: 0 }, { timeMs: 1_000 }],
    })
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: SOURCE } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.code).toBe(v1.code)

    for (const fidelity of ['fast', 'fidelity'] as const) {
      const left = replay(v1, fidelity)
      const right = replay(v2, fidelity)
      freeze(left.renderCurrentFrame())
      freeze(right.renderCurrentFrame())
      for (const atMs of [250, 500, 750]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
      }
    }
  })

  it.each(['fast', 'fidelity'] as const)('activates a Cut-scoped Effect track only for its half-open source contribution in %s mode', (fidelity) => {
    const source = cutScopedEffectTrackShow()
    const before = JSON.stringify(source)
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    expect(converted.record.composition.propertyTracks).toEqual([
      expect.objectContaining({ id: 'gain-track', activeStartMs: 0, activeDurationMs: 500 }),
    ])
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render(index) { rgb(1, 1, 1) }' } }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    const left = replay(v1, fidelity)
    const right = replay(v2, fidelity)
    expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
    const expectations = [
      [250, 0.625], [499, 0.2515], [500, 1], [750, 1], [1_000, 0.5], [1_250, 0.5],
    ] as const
    let previousMs = 0
    for (const [atMs, expected] of expectations) {
      const leftResult = freeze(left.advanceLive(atMs - previousMs))
      const rightResult = freeze(right.advanceLive(atMs - previousMs))
      expect(rightResult).toEqual(leftResult)
      expect(leftResult.frame[0]).toBeCloseTo(expected, fidelity === 'fast' ? 8 : 4)
      previousMs = atMs
    }
    expect(JSON.stringify(source)).toBe(before)
  })

  it('refuses the proposed two-Zone coincident positive-Transition widening at the current compiler boundary', () => {
    const record = convertedRecord()
    record.zones.push({ id: 'zone-b', name: 'Second', nominalPixelCount: 16 })
    record.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'zone-b'], axis: 'x' }
    record.composition.layers.push({ id: 'layer:zone-b:main', zoneId: 'zone-b', name: 'Main', rank: 0 })
    record.composition.patternInstances.push(
      { ...record.composition.patternInstances[0], id: 'out-b' },
      { ...record.composition.patternInstances[0], id: 'in-b' },
    )
    record.composition.clips = [
      { ...record.composition.clips[0], id: 'out-a', durationMs: 400 },
      { ...record.composition.clips[0], id: 'in-a', instanceId: 'instance', startMs: 600, durationMs: 400, appearance: appearanceAt(record.composition.clips[0], 600) },
      { ...record.composition.clips[0], id: 'out-b-clip', instanceId: 'out-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', durationMs: 400 },
      { ...record.composition.clips[0], id: 'in-b-clip', instanceId: 'in-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', startMs: 600, durationMs: 400, appearance: appearanceAt(record.composition.clips[0], 600) },
    ]
    record.composition.transitions = [
      {
        id: 'transition-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live', propertyRamps: [],
        participants: [{ id: 'participant-a', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out-a', toClipId: 'in-a' }],
      },
      {
        id: 'transition-b', kind: 'wipe', durationMs: 200, easing: { curve: 'linear' }, wipeVariant: 'linear', propertyRamps: [],
        participants: [{ id: 'participant-b', zoneId: 'zone-b', layerId: 'layer:zone-b:main', fromClipId: 'out-b-clip', toClipId: 'in-b-clip' }],
      },
    ]

    expect(() => lowerShowCompositionV2ForCompile(record, {
      byCellId: {}, byPatternInstanceId: { instance: SOURCE, 'out-b': SOURCE, 'in-b': SOURCE },
    })).toThrow('independent render targets')
  })

  it.each(['fast', 'fidelity'] as const)('preserves divergent Clip appearance through a positive Transition in %s mode', (fidelity) => {
    const source = transitionV1Show('crossfade', 'snapshot-live')
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const outgoing = converted.record.composition.clips.find(clip => clip.id === 'out')!
    outgoing.appearance.keys.push({
      ...structuredClone(outgoing.appearance.keys[0]),
      id: 'out:appearance:2',
      timeMs: 200,
      value: { ...structuredClone(outgoing.appearance.keys[0].value), opacity: 0.25 },
    })
    const before = JSON.stringify(converted.record)
    const lookup = {
      byCellId: {},
      byPatternInstanceId: { 'out-instance': OUT_SOURCE, 'in-instance': IN_SOURCE },
      stageDimension: 2 as const,
    }
    const prepared = prepareShowV2ForCompile(converted.record, lookup)
    if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
    expect(prepared).toMatchObject({ status: 'ready' })

    const expected = structuredClone(source)
    const outgoingPlacements = expected.composition!.scenes[0].zones[0].main
    outgoingPlacements[0].durationMs = 200
    outgoingPlacements.splice(1, 0, {
      ...structuredClone(outgoingPlacements[0]),
      id: 'out--appearance-1',
      logicalClipId: 'out',
      startMs: 200,
      durationMs: 200,
      opacity: 0.25,
    })
    expected.composition!.transitions![0].fromPlacementId = 'out--appearance-1'
    const expectedLookup = {
      ...lookup,
      instanceIdByCellId: {},
    }
    const expectedArtifact = compileShow(showRecordToCompileRecipe(expected, expectedLookup), LIBRARIES)
    const actualArtifact = compileShow(prepared.recipe, LIBRARIES)
    const expectedRuntime = replay(expectedArtifact, fidelity)
    const actualRuntime = replay(actualArtifact, fidelity)
    for (const atMs of [0, 199, 200, 201, 399, 400, 500, 599, 600, 601]) {
      const options = { stepMs: 1, forceFullIntermediateRender: true }
      const left = freeze(atMs === 0 ? expectedRuntime.renderCurrentFrame() : expectedRuntime.advanceTo(atMs, options))
      const right = freeze(atMs === 0 ? actualRuntime.renderCurrentFrame() : actualRuntime.advanceTo(atMs, options))
      expect(right).toEqual(left)
    }
    expect(JSON.stringify(converted.record)).toBe(before)
  })

  it.each([
    ['Transition property ramps', (record: ReturnType<typeof convertedRecord>) => {
      record.composition.clips = [
        { ...record.composition.clips[0], id: 'from', durationMs: 400 },
        { ...record.composition.clips[0], id: 'to', startMs: 600, durationMs: 400, appearance: appearanceAt(record.composition.clips[0], 600) },
      ]
      record.composition.transitions = [{
        id: 'transition', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live',
        participants: [{ id: 'participant', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'from', toClipId: 'to' }],
        propertyRamps: [{ target: { kind: 'clip-opacity', clipId: 'to' }, from: 0 }],
      }]
    }, 'property-ramp'],
  ])('refuses unproved %s instead of dropping it', (_name, change, message) => {
    const record = convertedRecord()
    change(record)
    expect(() => lowerShowCompositionV2ForCompile(record, {
      byCellId: {}, byPatternInstanceId: { instance: SOURCE },
    })).toThrow(message)
  })

  it.each([
    ['crossfade snapshot/live', 'crossfade', 'snapshot-live'],
    ['crossfade live/live', 'crossfade', 'live-live'],
    ['fade through color', 'fade-color', undefined],
    ['wipe', 'wipe', undefined],
    ['dissolve', 'dither', undefined],
    ['portal', 'portal', undefined],
    ['motion', 'motion', undefined],
  ] as const)('preserves %s through converter, derived sections, compiler, Fast, and Precise', (_name, kind, policy) => {
    const source = transitionV1Show(kind, policy)
    const converted = convertShowRecordV1ToV2(source)
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const lookup = {
      byCellId: {},
      byPatternInstanceId: { 'out-instance': OUT_SOURCE, 'in-instance': IN_SOURCE },
      stageDimension: 2 as const,
    }
    const lowered = lowerShowCompositionV2ForCompile(converted.record, lookup)
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(showRecordToCompileRecipe(lowered.show, lowered.lookup), LIBRARIES)
    expect(v2.code).toBe(v1.code)
    expect(v2.summary).toEqual(v1.summary)

    for (const fidelity of ['fast', 'fidelity'] as const) {
      const left = replay(v1, fidelity)
      const right = replay(v2, fidelity)
      expect(freeze(right.renderCurrentFrame())).toEqual(freeze(left.renderCurrentFrame()))
      for (const atMs of [399, 400, 401, 500, 599, 600, 601]) {
        const options = { stepMs: 16, forceFullIntermediateRender: true }
        expect(freeze(right.advanceTo(atMs, options))).toEqual(freeze(left.advanceTo(atMs, options)))
      }
    }
  })
})

function convertedRecord() {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw new Error(result.issues.map(issue => issue.message).join('; '))
  return result.record
}

function appearanceAt(clip: ReturnType<typeof convertedRecord>['composition']['clips'][number], timeMs: number) {
  return { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: `${clip.id}:appearance:${timeMs}`, timeMs }] }
}

function divergentAppearanceShow() {
  const source = continuingV1Show()
  source.id = 'divergent-appearance'
  return source
}

function secondSegment(source: ReturnType<typeof divergentAppearanceShow>) {
  return source.composition!.scenes[1].zones[0].main[0]
}

function cutScopedEffectTrackShow() {
  const source = convertibleV1Show()
  source.id = 'cut-scoped-effect-track'
  source.scenes = [
    { id: 'scene-a', name: 'Tracked', durationMs: 500 },
    { id: 'scene-b', name: 'Absent', durationMs: 500 },
    { id: 'scene-c', name: 'Static re-add', durationMs: 500 },
  ]
  source.transitions = [
    { id: 'cut-a', afterSceneId: 'scene-a', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
    { id: 'cut-b', afterSceneId: 'scene-b', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
  ]
  source.composition!.durationMs = 1_500
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      propertyTracks: [{
        id: 'gain-track',
        target: { kind: 'placement-effect', placementId: 'clip-a', effectId: 'gain', effectKind: 'brightness', parameterId: 'brightness' },
        keyframes: [
          { id: 'gain-start', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'gain-end', timeMs: 500, value: 0.25, easing: { curve: 'linear' } },
        ],
      }],
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
        effects: [{ id: 'gain', kind: 'brightness', brightness: 1 }],
      }], overlays: [] }],
    },
    {
      sceneId: 'scene-b',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-b', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
      }], overlays: [] }],
    },
    {
      sceneId: 'scene-c',
      zones: [{ zoneId: 'zone', main: [{
        id: 'clip-c', instanceId: 'instance', startMs: 0, durationMs: 500,
        view: { mirror: false, phase: 0, brightness: 1 },
        effects: [{ id: 'gain', kind: 'brightness', brightness: 0.5 }],
      }], overlays: [] }],
    },
  ]
  return source
}

function class2aRefusalRecord() {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade', 'live-live'))
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  return converted.record
}

function class2aRefusalLookup(record: ReturnType<typeof class2aRefusalRecord>) {
  return { byCellId: {}, byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, SOURCE])) }
}

function class2aWindow(record: ReturnType<typeof class2aRefusalRecord>) {
  const transition = record.composition.transitions.find(candidate => candidate.wholeOutput === undefined && candidate.participants.length === 1)!
  const from = record.composition.clips.find(clip => clip.id === transition.participants[0].fromClipId)!
  const incoming = record.composition.clips.find(clip => clip.id === transition.participants[0].toClipId)!
  return { transition, from, incoming, startMs: from.startMs + from.durationMs, endMs: incoming.startMs }
}

it('refuses an exact-window ramp on the outgoing Clip (#1080 class 2a)', () => {
  const record = class2aRefusalRecord()
  const { startMs, endMs, from } = class2aWindow(record)
  const base = [...from.appearance.keys].sort((left, right) => left.timeMs - right.timeMs)[0].value.view.brightness
  record.composition.propertyTracks.push({
    id: 'outgoing-brightness',
    target: { kind: 'clip-view', clipId: from.id, property: 'brightness' },
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: [
      { id: 'outgoing-brightness-k0', timeMs: startMs, value: 0.2, easing: { curve: 'linear' } },
      { id: 'outgoing-brightness-k1', timeMs: endMs, value: base, easing: { curve: 'linear' } },
    ],
  })
  expect(prepareShowV2ForCompile(record, class2aRefusalLookup(record)).status).toBe('refused')
})

it('refuses an incoming ramp active past the Transition window (#1080 class 2a)', () => {
  const record = class2aRefusalRecord()
  const { startMs, endMs, incoming } = class2aWindow(record)
  const base = [...incoming.appearance.keys].sort((left, right) => left.timeMs - right.timeMs)[0].value.view.brightness
  record.composition.propertyTracks.push({
    id: 'shifted-brightness',
    target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
    activeStartMs: startMs + 1000,
    activeDurationMs: endMs - startMs + 1000,
    keyframes: [
      { id: 'shifted-brightness-k0', timeMs: startMs + 1000, value: 0.2, easing: { curve: 'linear' } },
      { id: 'shifted-brightness-k1', timeMs: endMs + 1000, value: base, easing: { curve: 'linear' } },
    ],
  })
  expect(prepareShowV2ForCompile(record, class2aRefusalLookup(record)).status).toBe('refused')
})

it('refuses an exact-window incoming ramp whose end value misses the base (#1080 class 2a)', () => {
  const record = class2aRefusalRecord()
  const { startMs, endMs, incoming } = class2aWindow(record)
  const base = record.composition.patternInstances.find(instance => instance.id === incoming.instanceId)!.time.timeScale
  record.composition.propertyTracks.push({
    id: 'off-base-timescale',
    target: { kind: 'instance-time-scale', instanceId: incoming.instanceId },
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: [
      { id: 'off-base-timescale-k0', timeMs: startMs, value: 0.5, easing: { curve: 'sine', direction: 'in-out' } },
      { id: 'off-base-timescale-k1', timeMs: endMs, value: base + 0.5, easing: { curve: 'linear' } },
    ],
  })
  expect(prepareShowV2ForCompile(record, class2aRefusalLookup(record)).status).toBe('refused')
})

it('refuses an exact-window ramp on a whole-output Transition (#1080 class 2a)', () => {
  const record = class2aRefusalRecord()
  const { transition, startMs, endMs, incoming } = class2aWindow(record)
  const from = record.composition.clips.find(clip => clip.startMs + clip.durationMs === startMs)!
  const to = record.composition.clips.find(clip => clip.startMs === endMs)!
  transition.participants = []
  transition.wholeOutput = { startMs, fromClipIds: [from.id], toClipIds: [to.id] }
  const base = [...incoming.appearance.keys].sort((left, right) => left.timeMs - right.timeMs)[0].value.view.brightness
  record.composition.propertyTracks.push({
    id: 'whole-output-brightness',
    target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: [
      { id: 'whole-output-brightness-k0', timeMs: startMs, value: 0.2, easing: { curve: 'linear' } },
      { id: 'whole-output-brightness-k1', timeMs: endMs, value: base, easing: { curve: 'linear' } },
    ],
  })
  expect(prepareShowV2ForCompile(record, class2aRefusalLookup(record)).status).toBe('refused')
})



it('refuses an exact-window incoming ramp on the participant Transition of a mixed record (#1080 class 2a repair)', () => {
  // Mixed whole-output/participant v1 construction after mixedBoundaryLayerShow
  // in showV2LayoutConversion.test.ts (#1080 class 3).
  const source = convertibleV1Show()
  source.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 6000 },
    { id: 'scene-b', name: 'Incoming', durationMs: 6000 },
  ]
  source.composition!.durationMs = 14000
  source.composition!.scenes = [
    {
      sceneId: 'scene-a',
      zones: [{ zoneId: 'zone', main: [
        {
          id: 'clip-a', instanceId: 'instance', startMs: 0, durationMs: 2000,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          id: 'clip-b', instanceId: 'instance', startMs: 2000, durationMs: 2000,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ], overlays: [] }],
    },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [], overlays: [] }] },
  ]
  source.transitions = [{
    id: 'boundary', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 2000,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  const withLayer = insertShowLayerTransition(source, source.composition!, {
    id: 'layer-t', fromPlacementId: 'clip-a', toPlacementId: 'clip-b',
    kind: 'crossfade', durationMs: 1000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  })
  if (withLayer === source.composition) throw new Error('Synthetic layer transition refused')
  source.composition = withLayer
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const record = converted.record
  expect(record.composition.transitions.some(transition => transition.wholeOutput !== undefined)).toBe(true)
  const layer = record.composition.transitions.find(transition => transition.wholeOutput === undefined && transition.participants.length === 1)!
  const from = record.composition.clips.find(clip => clip.id === layer.participants[0].fromClipId)!
  const incoming = record.composition.clips.find(clip => clip.id === layer.participants[0].toClipId)!
  const startMs = from.startMs + from.durationMs
  const endMs = incoming.startMs
  const base = [...incoming.appearance.keys].sort((left, right) => left.timeMs - right.timeMs)[0].value.view.brightness
  record.composition.propertyTracks.push({
    id: 'mixed-participant-brightness',
    target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: [
      { id: 'mixed-participant-brightness-k0', timeMs: startMs, value: 0.2, easing: { curve: 'linear' } },
      { id: 'mixed-participant-brightness-k1', timeMs: endMs, value: base, easing: { curve: 'linear' } },
    ],
  })
  expect(prepareShowV2ForCompile(record, class2aRefusalLookup(record)).status).toBe('refused')
})

it('refuses a sub-100 ms exact-window incoming ramp v1 would lengthen (#1080 class 2 A)', () => {
  const record = class2aRefusalRecord()
  const { startMs, endMs, incoming } = class2aWindow(record)
  const base = [...incoming.appearance.keys].sort((left, right) => left.timeMs - right.timeMs)[0].value.view.brightness
  record.composition.propertyTracks.push({
    id: 'short-brightness',
    target: { kind: 'clip-view', clipId: incoming.id, property: 'brightness' },
    activeStartMs: startMs,
    activeDurationMs: endMs - startMs,
    keyframes: [
      { id: 'short-brightness-k0', timeMs: startMs, value: 0.2, easing: { curve: 'linear' } },
      { id: 'short-brightness-k1', timeMs: startMs + 50, value: base, easing: { curve: 'linear' } },
    ],
  })
  const prepared = prepareShowV2ForCompile(record, class2aRefusalLookup(record))
  expect(prepared.status).toBe('refused')
  if (prepared.status !== 'refused') return
  expect(prepared.issues).toContainEqual(expect.objectContaining({ code: 'unsupported-transition-property-track' }))
})

describe('Transition speed and brightness ramps (#1091 B1)', () => {
  function rampProbeV1() {
    const show = createDefaultShow('ramp-probe', 'Ramp probe', 1)
    show.scenes = [
      { id: 'scene-1', name: 'Scene 1', durationMs: 4000 },
      { id: 'scene-2', name: 'Scene 2', durationMs: 4000 },
      { id: 'scene-3', name: 'Scene 3', durationMs: 4000 },
    ]
    const zoneId = show.zones[0].id
    const patterns = ['TestPattern1D', 'CometLoom', 'CellularAutomata1D']
    const adaptations = [
      { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      { mirror: false, phase: 0, brightness: 0.5, timeScale: 2 },
      { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
    ]
    show.cells = show.scenes.map((scene, index) => ({
      id: `cell-${index + 1}`,
      zoneId,
      sceneId: scene.id,
      sceneSpan: 1,
      pattern: { kind: 'stock' as const, id: patterns[index] },
      patternName: patterns[index],
      adaptations: adaptations[index],
      restartOnEntry: false,
    }))
    show.transitions = [
      {
        id: 'xfade',
        afterSceneId: 'scene-1',
        kind: 'crossfade',
        durationMs: 1000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
        propertyTransitions: {
          timeScale: { fromByCellId: { 'cell-2': 1 }, durationMs: 400, easing: { curve: 'sine', direction: 'in-out' } },
          brightness: { fromByCellId: { 'cell-2': 0.2 } },
        },
      },
      { id: 'cut', afterSceneId: 'scene-2', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } },
    ]
    return show
  }

  function probeLookup(show: ReturnType<typeof rampProbeV1>) {
    return { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[cell.pattern.id]])) }
  }

  function stockV2Lookup(record: { composition: { patternInstances: Array<{ id: string; pattern: { id: string } }> } }) {
    return {
      byCellId: {},
      byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])),
      stageDimension: 2 as const,
    }
  }

  it('lowers a converted probe on the flat route with v1 normalized descriptors', () => {
    const source = rampProbeV1()
    const converted = convertShowRecordV1ToV2(source, probeLookup(source))
    expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
    if (converted.status !== 'converted') return
    expect(validateShowRecordV2(converted.record)).toEqual([])
    const v2Lookup = stockV2Lookup(converted.record)
    const prepared = prepareShowV2ForCompile(converted.record, v2Lookup, { libraries: LIBRARIES })
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
    if (prepared.status !== 'ready') return
    expect(prepared.provenance.route).toBe('continuous-flat')
    const lowered = lowerShowCompositionV2ForCompile(converted.record, stockV2Lookup(converted.record))
    const boundary = lowered.show.transitions.find(transition => transition.id === 'xfade')!
    const incomingId = Object.keys(boundary.propertyTransitions!.timeScale!.fromByCellId)[0]
    expect(boundary.propertyTransitions).toEqual({
      timeScale: { fromByCellId: { [incomingId]: 1 }, durationMs: 400, easing: { curve: 'sine', direction: 'in-out' } },
      brightness: { fromByCellId: { [incomingId]: 0.2 }, durationMs: 1000, easing: { curve: 'linear' } },
    })
  })

  it('refuses a Transition ramp off the flat route', () => {
    const source = rampProbeV1()
    const converted = convertShowRecordV1ToV2(source, probeLookup(source))
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const record = structuredClone(converted.record)
    record.composition.executionModel = 'deterministic-loop'
    const prepared = prepareShowV2ForCompile(record, stockV2Lookup(record), { libraries: LIBRARIES })
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') return
    expect(prepared.issues).toContainEqual(expect.objectContaining({
      code: 'unsupported-transition-property-ramp',
      message: 'A Transition speed or brightness ramp compiles only on the flat route.',
    }))
  })

  it('refuses a multi-participant Layer Transition with no ramps (#1091 B1 P1)', () => {
    const source = rampProbeV1()
    const converted = convertShowRecordV1ToV2(source, probeLookup(source))
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const record = structuredClone(converted.record)
    const transition = record.composition.transitions.find(candidate => candidate.id === 'xfade')!
    transition.participants.push({ ...structuredClone(transition.participants[0]), id: 'participant-2' })
    transition.propertyRamps = []
    expect(validateShowRecordV2(record)).toEqual([])
    const prepared = prepareShowV2ForCompile(record, stockV2Lookup(record), { libraries: LIBRARIES })
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') return
    expect(prepared.issues).toContainEqual(expect.objectContaining({
      code: 'unsupported-transition-participants',
      message: 'lowering requires one participant per Transition until shared-scope parity is proved.',
    }))
  })

  it('refuses a multi-participant Layer Transition with speed ramps on both participants (#1091 B1 P1)', () => {
    const source = rampProbeV1()
    const converted = convertShowRecordV1ToV2(source, probeLookup(source))
    expect(converted.status).toBe('converted')
    if (converted.status !== 'converted') return
    const record = structuredClone(converted.record)
    const transition = record.composition.transitions.find(candidate => candidate.id === 'xfade')!
    const participant = transition.participants[0]
    transition.participants.push({ ...structuredClone(participant), id: 'participant-2' })
    const incoming = record.composition.clips.find(clip => clip.id === participant.toClipId)!
    transition.propertyRamps = [
      { participantId: participant.id, target: { kind: 'instance-time-scale', instanceId: incoming.instanceId }, from: 1, durationMs: 150 },
      { participantId: 'participant-2', target: { kind: 'instance-time-scale', instanceId: incoming.instanceId }, from: 1.5, durationMs: 150 },
    ]
    expect(validateShowRecordV2(record)).toEqual([])
    const prepared = prepareShowV2ForCompile(record, stockV2Lookup(record), { libraries: LIBRARIES })
    expect(prepared.status).toBe('refused')
    if (prepared.status !== 'refused') return
    expect(prepared.issues).toContainEqual(expect.objectContaining({
      code: 'unsupported-transition-participants',
      message: 'lowering requires one participant per Transition until shared-scope parity is proved.',
    }))
  })

  it('holds parity for a converted boundary speed and brightness ramp', async () => {
    const source = rampProbeV1()
    const lookup = probeLookup(source)
    const converted = convertShowRecordV1ToV2(source, lookup)
    expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
    if (converted.status !== 'converted') return
    const v2Lookup = stockV2Lookup(converted.record)
    const prepared = prepareShowV2ForCompile(converted.record, v2Lookup, { libraries: LIBRARIES })
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
    if (prepared.status !== 'ready') return
    const v1 = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const v2 = compileShow(prepared.recipe, LIBRARIES)
    const { flatMemberIdentityMappings, runtimeParity } = await import('../../scripts/show-v2-parity')
    const mappings = flatMemberIdentityMappings(converted.report, v1, v2)
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const parity = runtimeParity(v1, v2, source, converted.record, fidelity, mappings)
      expect(parity.matched, JSON.stringify({ fidelity, firstMismatchMs: parity.firstMismatchMs, diff: parity.firstMismatchStateDifferences })).toBe(true)
    }
  })
})

describe('section restriction beside a whole-output Transition (#1103)', () => {
  const source = 'export var speed = 0.5; export function sliderSpeed(value) { speed = value } export function render2D(index, x, y) { rgb(x, y, speed) }'
  const lookupFor = (record: ShowRecordV2) => ({
    byCellId: {},
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, source])),
    stageDimension: 2 as const,
  })
  const animationRecord = () => {
    const converted = convertShowRecordV1ToV2(showAnimationCommandFixture())
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    return converted.record
  }
  const sceneTracks = (record: ShowRecordV2) => Object.fromEntries(
    lowerShowCompositionV2ForCompile(record, lookupFor(record)).show.composition!.scenes.map(scene => [
      scene.sceneId,
      Object.fromEntries((scene.propertyTracks ?? []).map(track => [track.id, track.keyframes.map(key => key.timeMs)])),
    ]),
  )
  const generatedHash = (record: ShowRecordV2) => {
    const prepared = prepareShowV2ForCompile(record, lookupFor(record), { libraries: LIBRARIES })
    if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
    return createHash('sha256').update(compileShow(prepared.recipe, LIBRARIES).code).digest('hex')
  }
  // The value a lowered derived Scene's piece of a track takes at Show time
  // atMs, on that Scene's own clock: local time is atMs minus the section
  // start, so the outgoing Scene reads past its end through the following
  // window and the incoming Scene reads before 0 through the preceding one.
  // The v1 evaluator (showPropertyAnimation.ts:66) and the expression the
  // compiler emits into generated code (showPropertyAnimation.ts:88) must agree.
  const loweredTrackValue = (record: ShowRecordV2, sectionId: string, sectionStartMs: number, trackId: string) => {
    const lowered = lowerShowCompositionV2ForCompile(record, lookupFor(record)).show
    const scene = lowered.composition!.scenes.find(candidate => candidate.sceneId === sectionId)!
    const track = scene.propertyTracks!.find(candidate => candidate.id === trackId)!
    const emitted = new Function('localMs', `return ${emitShowPropertyTrackExpression(track, 'localMs')}`) as (localMs: number) => number
    return {
      durationMs: lowered.scenes.find(candidate => candidate.id === sectionId)!.durationMs,
      at: (atMs: number) => {
        const localMs = atMs - sectionStartMs
        const value = evaluateShowPropertyTrack(track, localMs)
        expect(emitted(localMs), `${trackId}@${atMs}`).toBeCloseTo(value, 12)
        return value
      },
    }
  }
  const windowTimes = [30000, 31000, 31999]

  it('holds a Clip-targeted track cut before the outgoing whole-output Transition at its section end', () => {
    const record = animationRecord()
    // Only the Clip-targeted track-b remains; instance tracks keep their refusal.
    record.composition.propertyTracks = record.composition.propertyTracks.filter(track => 'clipId' in track.target)
    // Ramp back up through the window so a hold differs from the source there.
    const trackB = record.composition.propertyTracks.find(track => track.id === 'track-b')!
    trackB.keyframes.push({ id: 'track-b-window', timeMs: 32000, value: 1, easing: { curve: 'linear' } })
    expect(validateShowRecordV2(record)).toEqual([])
    const added = applyShowCommandV2(record, 'add_property_tracks', {
      tracks: [{ target: { kind: 'view-phase', clip_id: 'clip-a' }, initial_value: 0.3 }],
    })
    expect(added.status).toBe('changed')
    const prepared = prepareShowV2ForCompile(added.record, lookupFor(added.record), { libraries: LIBRARIES })
    expect(prepared.status === 'refused' ? prepared.issues : prepared.status).toBe('ready')
    const tracks = sceneTracks(added.record)
    // v2-section:1 is [10000, 30000); the Transition window [30000, 32000) holds.
    expect(tracks['v2-section:1']).toEqual({ 'track-b@v2-section:1': [0, 2000, 9000, 20000] })
    // Pieces that already fit keep today's contribution restriction.
    expect(tracks['v2-section:0']).toEqual({ 'track-view-phase': [0, 10000] })
    const piece =loweredTrackValue(added.record, 'v2-section:1', 10000, 'track-b@v2-section:1')
    expect(piece.durationMs).toBe(20000)
    const sourceAt = (atMs: number) => evaluateShowPropertyTrackV2(trackB, atMs)!
    const held = sourceAt(30000)
    // Authored values inside the section are unchanged.
    for (const atMs of [10000, 15000, 25000, 29999]) expect(piece.at(atMs), `${atMs}`).toBeCloseTo(sourceAt(atMs), 12)
    // Through the window the outgoing Scene holds the section-end value,
    // where the source keeps ramping toward 1.
    for (const atMs of windowTimes) expect(piece.at(atMs), `${atMs}`).toBeCloseTo(held, 12)
    expect(sourceAt(31000)).toBeGreaterThan(held)
  })

  it('holds a Clip-targeted track ramping across the incoming whole-output Transition at its section start', () => {
    const record = animationRecord()
    const clipB = record.composition.clips.find(clip => clip.id === 'clip-b')!
    record.composition.clips.push({
      ...structuredClone(clipB), id: 'clip-d', startMs: 50000, durationMs: 10000,
      appearance: { keys: clipB.appearance.keys.map(key => ({ ...structuredClone(key), id: `clip-d:${key.id}`, timeMs: 50000 })) },
    })
    record.composition.propertyTracks.push({
      id: 'track-d', target: { kind: 'clip-view', clipId: 'clip-d', property: 'brightness' }, activeStartMs: 0, activeDurationMs: 62000,
      keyframes: [
        { id: 'track-d-first', timeMs: 0, value: 0, easing: { curve: 'linear' } },
        { id: 'track-d-last', timeMs: 62000, value: 1, easing: { curve: 'linear' } },
      ],
    })
    expect(validateShowRecordV2(record)).toEqual([])
    const prepared = prepareShowV2ForCompile(record, lookupFor(record), { libraries: LIBRARIES })
    expect(prepared.status === 'refused' ? prepared.issues : prepared.status).toBe('ready')
    // v2-section:2 is [32000, 62000), after the Transition window [30000, 32000).
    expect(sceneTracks(record)['v2-section:2']).toEqual({ 'track-d@v2-section:2': [0, 30000] })
    const piece =loweredTrackValue(record, 'v2-section:2', 32000, 'track-d@v2-section:2')
    expect(piece.durationMs).toBe(30000)
    const trackD = record.composition.propertyTracks.find(track => track.id === 'track-d')!
    const sourceAt = (atMs: number) => evaluateShowPropertyTrackV2(trackD, atMs)!
    const held = sourceAt(32000)
    // Authored values inside the section are unchanged.
    for (const atMs of [32000, 32001, 40000, 61999]) expect(piece.at(atMs), `${atMs}`).toBeCloseTo(sourceAt(atMs), 12)
    // Through the window the incoming Scene holds the section-start value,
    // where the source is still ramping up to it.
    for (const atMs of windowTimes) expect(piece.at(atMs), `${atMs}`).toBeCloseTo(held, 12)
    expect(sourceAt(31000)).toBeLessThan(held)
  })

  // instance-a runs clip-a and clip-c before the window [30000, 32000); the
  // shared variant also runs clip-d after it. The compiler applies both
  // Scenes' assignments to the one runtime during the window, so every
  // instance track keeps the refusal it had before #1103.
  type Tracks = ShowRecordV2['composition']['propertyTracks']
  const linear = { curve: 'linear' as const }
  const control = { kind: 'instance-control' as const, instanceId: 'instance-a', exportName: 'sliderSpeed' }
  const controlTrack = (keyframes: Tracks[number]['keyframes']): Tracks => [{ id: 'track-control', target: control, activeStartMs: 0, activeDurationMs: 62000, keyframes }]
  const instanceRecord = (shared: boolean, tracks: Tracks) => {
    const record = animationRecord()
    const clipA = record.composition.clips.find(clip => clip.id === 'clip-a')!
    if (shared) {
      record.composition.clips.push({
        ...structuredClone(clipA), id: 'clip-d', startMs: 50000, durationMs: 10000,
        appearance: { keys: clipA.appearance.keys.map(key => ({ ...structuredClone(key), id: `clip-d:${key.id}`, timeMs: 50000 })) },
      })
    }
    record.composition.propertyTracks.push(...tracks)
    expect(validateShowRecordV2(record)).toEqual([])
    return record
  }
  const ramp = controlTrack([
    { id: 'track-control-first', timeMs: 0, value: 0.2, easing: linear },
    { id: 'track-control-last', timeMs: 62000, value: 0.8, easing: linear },
  ])

  it.each([
    ['a one-sided ramp', false, ramp, 1],
    ['a shared ramp', true, ramp, 1],
    // Equal values at 30000 and 32000, but the curve segment from 30000 dips between them.
    ['a curve segment between equal window ends', true, controlTrack([
      { id: 'track-control-first', timeMs: 0, value: 0.5, easing: linear },
      { id: 'track-control-curve', timeMs: 30000, value: 0.5, easing: linear, curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing: linear, sourceDurationMs: 4000, elapsedOffsetMs: 0 } },
      { id: 'track-control-last', timeMs: 34000, value: 0.5, easing: linear },
    ]), 2],
    ['a constant track', true, controlTrack([
      { id: 'track-control-first', timeMs: 0, value: 0.2, easing: linear },
      { id: 'track-control-settled', timeMs: 20000, value: 0.8, easing: linear },
    ]), 2],
    // Two tracks on one shared control hand off at the window's end.
    ['a two-track handoff', true, [
      { id: 'track-control', target: control, activeStartMs: 0, activeDurationMs: 32000, keyframes: [
        { id: 'track-control-first', timeMs: 0, value: 0.2, easing: linear },
        { id: 'track-control-last', timeMs: 32000, value: 0.2, easing: linear },
      ] },
      { id: 'track-control-after', target: control, activeStartMs: 32000, activeDurationMs: 30000, keyframes: [
        { id: 'track-control-after-first', timeMs: 32000, value: 0.8, easing: linear },
        { id: 'track-control-after-last', timeMs: 62000, value: 0.8, easing: linear },
      ] },
    ] as Tracks, 1],
  ] as const)('still refuses an instance track with %s, as before the hold', (_name, shared, tracks, keyIndex) => {
    const record = instanceRecord(shared, structuredClone(tracks) as Tracks)
    // Recorded on the lowering before #1103.
    expect(prepareShowV2ForCompile(record, lookupFor(record), { libraries: LIBRARIES })).toEqual({ status: 'refused', issues: [{
      code: 'compiler-ineligible',
      path: `compileRecipe.composition.scenes[0].propertyTracks[3].keyframes[${keyIndex}].timeMs`,
      message: 'Keyframe time must stay inside its Scene.',
    }] })
  })

  it('keeps the generated source of a record whose pieces already fit', () => {
    // Pinned on the code before #1103; the retained-exact path keeps these bytes.
    expect(generatedHash(animationRecord())).toBe('d9e47d72dfbf825418f1185135204992b56de22b0a8d401a30da0a77bbb8949d')
  })
})
