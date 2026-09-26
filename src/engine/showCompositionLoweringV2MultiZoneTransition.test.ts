import { describe, expect, it } from 'vitest'
import type { MapPoint } from './maps/types'
import type { ShowOutputContract, ShowRecord } from './personalContentRecords'
import type { GeneratedShowArtifact } from './showCompiler'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { createShowV2WithOutputContract } from './showCreationV2'
import { editShowZoneV2 } from './showZonesV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import {
  addShowScene, addShowZone, createShowWithOutputContract, extendShowCell, placeShowClip,
  removeShowClip, showRecordToCompileRecipe, updateShowBoundaryTransition, updateShowCellPattern, updateShowRoutingLayout,
} from './showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from './showOutputContract'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { canLowerShowV2ToFlat } from './showFlatLoweringV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { planShowV2BoundaryTransitionChanges } from './showV2TransitionEditorModel'
import type { ShowTransitionChanges } from './showTransitionAuthoring'
import { frozenV1Output } from '../test/v1AuthoringOracles'

/**
 * Carrying a participant Transition on the continuous-flat route once a Show
 * has more than one Zone (#1063).
 *
 * `canLowerToFlat` used to admit a participant Transition only while the Show
 * had exactly one Zone, so a Show whose Clips sample `independent` refused to
 * prepare the moment it gained a second Zone - which is every fresh v2 Show and
 * every converted single-Zone v1 Show with a Transition. v1 compiles that Show.
 *
 * v1 is therefore the oracle here, and it is a byte oracle: each admitted case
 * below builds the same choreography as a v1 record through v1's own owners
 * (`addShowZone`, `placeShowClip`, `addShowScene`), compiles
 * it with the v1 compiler, and requires the v2 artifact to match its generated
 * source and Effects source exactly. The fresh-Show case additionally replays
 * the reopened `.epe` in Fast and Precise and compares frames and each member's
 * exported state before, inside and after the Transition window and across Show
 * End - where v1's two-Zone artifact begins wrapping the Show clock, exactly as
 * it does for any other two-Zone v1 Show.
 *
 * The admission stays as narrow as the proof: `wholeBoundary`'s surviving
 * clause admits a Transition only when every other Clip ends strictly before
 * the outgoing Clip or starts strictly after the incoming Clip. Because the
 * flat sections split at every Clip edge, such a Clip is absent from the
 * outgoing hold, the window and the incoming hold, so the Scene-boundary blend
 * sees only the two participants. A Clip that overlaps the window - or merely
 * touches either edge, where the blend would fade it in or out - keeps the
 * existing atomic refusal.
 */

const INSTALLATION_PIXELS = 60
const PORTABLE_PIXELS = 120
const INSTALLATION = createInstallationShowOutputContract({ outputMapId: null, pixelCount: INSTALLATION_PIXELS })
const PORTABLE = createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: PORTABLE_PIXELS })
const SOURCES: Record<string, string> = {
  'instance-1': DEMOS.TestPattern1D,
  'instance-2': DEMOS.CometLoom,
  'instance-3': DEMOS.RibbonLoom,
  'instance-4': DEMOS.TestPattern1D,
}
const SECOND_ZONE = { id: 'zone-2', name: 'zone-2', nominalPixelCount: 60, color: '#22d3ee' } as const
const THIRD_ZONE = { id: 'zone-3', name: 'zone-3', nominalPixelCount: 60, color: '#f59e0b' } as const
const WINDOW_START_MS = 30_000
const WINDOW_END_MS = 32_000
const SHOW_END_MS = 62_000
const STEP_MS = 16
/** Before, at each edge of, inside and after the Crossfade window, then across Show End. */
const TIMELINE_MS = [16_000, 29_984, 30_000, 30_496, 31_008, 31_984, 32_000, 45_008, 61_968, 62_016]
const UNSUPPORTED_SAMPLING = {
  code: 'unsupported-zone-sampling',
  path: 'composition.clips',
  message: 'This multi-Zone arrangement requires span Clip sampling before compilation.',
}

function addZone(record: ShowRecordV2, zone: typeof SECOND_ZONE | typeof THIRD_ZONE): ShowRecordV2 {
  const outcome = editShowZoneV2(record, { kind: 'add', zone: { ...zone } })
  if (outcome.status !== 'changed') throw new Error(`Add Zone refused: ${JSON.stringify(outcome)}`)
  return outcome.record
}

function prepared(record: ShowRecordV2) {
  return prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: SOURCES, stageDimension: 2 })
}

function compiledV2(record: ShowRecordV2) {
  const preparation = prepared(record)
  if (preparation.status !== 'ready') throw new Error(`Preparation refused: ${JSON.stringify(preparation.issues)}`)
  return { route: preparation.provenance.route, artifact: compileShow(preparation.recipe, LIBRARIES) }
}

/** The same choreography compiled from a v1 record built through v1's own owners. */
function compiledV1(show: ShowRecord) {
  const byCellId = Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[cell.pattern.id as keyof typeof DEMOS]]))
  return compileShow(showRecordToCompileRecipe(show, { byCellId, byPatternInstanceId: {}, stageDimension: 2 }), LIBRARIES)
}

function freshV1(contract: ShowOutputContract): ShowRecord {
  return createShowWithOutputContract('fresh', 'Fresh Show', contract, 1)
}

function freshV2(contract: ShowOutputContract): ShowRecordV2 {
  return createShowV2WithOutputContract('fresh', 'Fresh Show', contract, 1)
}

function secondZoneLayer(record: ShowRecordV2): ShowRecordV2 {
  const next = structuredClone(record)
  next.composition.layers.push({ id: 'layer:zone-2:main', zoneId: 'zone-2', name: 'Main', rank: 0 })
  return next
}

/** One Clip on the second Zone, with its own Pattern instance. */
function secondZoneClip(record: ShowRecordV2, startMs: number, durationMs: number): ShowRecordV2 {
  const next = secondZoneLayer(record)
  next.composition.patternInstances.push({
    id: 'instance-4', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })
  next.composition.clips.push({
    id: 'clip-4', instanceId: 'instance-4', zoneId: 'zone-2', layerId: 'layer:zone-2:main',
    startMs, durationMs, entryPolicy: 'continue', zoneSampleMode: 'independent',
    appearance: { keys: [{ id: 'clip-4:appearance:1', timeMs: startMs, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
  })
  return next
}

/** One map point per routed Stage pixel: both Zones nominally own sixty. */
function stage(pixelCount: number): MapPoint[] {
  return Array.from({ length: pixelCount }, (_, index) => {
    const x = index / (pixelCount - 1)
    return { sample: [x], pos: [x, 0.5] as [number, number] }
  })
}

/** The oracle surface is the exported artifact reopened through its own importer. */
function reopened(record: ShowRecordV2, artifact: GeneratedShowArtifact): string {
  const exported = buildShowEpeExportV2(record, artifact.code)
  if (exported.status !== 'exported') throw new Error(exported.message)
  return parseEpe(exported.text).src
}

function replay(source: string, artifact: GeneratedShowArtifact, points: MapPoint[], fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: source, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: points, randomSeed: 1063, fidelity })
}

/** Each compiled member's own exported scalars, keyed by its authored identity. */
function memberState(result: { exports: Record<string, unknown> }, artifact: GeneratedShowArtifact) {
  const normalized = new Set(artifact.metadata.deterministicReplay?.normalizedBindings ?? [])
  return artifact.summary.clips.map(member => Object.fromEntries(Object.entries(result.exports)
    .filter(([key, value]) => key.startsWith(`${member.prefix}_`) && !normalized.has(key) && (typeof value === 'number' || typeof value === 'boolean'))
    .map(([key, value]) => [key.slice(member.prefix.length + 1), value])))
}

describe('a fresh Show that gains a second Zone', () => {
  it.each([
    ['installation', INSTALLATION],
    ['portable', PORTABLE],
  ] as const)('prepares a %s Show on the continuous-flat route and compiles the v1 bytes', (_name, contract) => {
    const record = addZone(freshV2(contract), SECOND_ZONE)
    const built = compiledV2(record)
    const legacy = compiledV1(addShowZone(freshV1(contract)))

    expect(built.route).toBe('continuous-flat')
    expect(built.artifact.code).toBe(legacy.code)
    expect(built.artifact.fxCode).toBe(legacy.fxCode)
    expect(built.artifact.summary.clips.map(member => member.prefix))
      .toEqual(legacy.summary.clips.map(member => member.prefix))
  })

  it('refused to prepare at all before the second Zone was admitted on the flat route', () => {
    // The fresh one-Zone Show keeps its existing representation: the second
    // Zone is the only thing this candidate changes.
    const one = compiledV2(freshV2(INSTALLATION))
    expect(one.route).toBe('continuous-flat')
    expect(one.artifact.code).toBe(compiledV1(freshV1(INSTALLATION)).code)
  })

  it('adds a third Zone and still compiles the v1 bytes', () => {
    const record = addZone(addZone(freshV2(INSTALLATION), SECOND_ZONE), THIRD_ZONE)
    const legacy = addShowZone(addShowZone(freshV1(INSTALLATION)))
    expect(compiledV2(record).artifact.code).toBe(compiledV1(legacy).code)
  })

  it.each(['fast', 'fidelity'] as const)(
    'renders v1\'s frames and member state through the reopened .epe in %s',
    fidelity => {
      const record = addZone(freshV2(INSTALLATION), SECOND_ZONE)
      const built = compiledV2(record)
      const legacy = compiledV1(addShowZone(freshV1(INSTALLATION)))
      const points = stage(2 * INSTALLATION_PIXELS)
      const left = replay(reopened(record, built.artifact), built.artifact, points, fidelity)
      const right = replay(legacy.code, legacy, points, fidelity)

      const first = [left.renderCurrentFrame(), right.renderCurrentFrame()] as const
      expect(Array.from(first[0].frame)).toEqual(Array.from(first[1].frame))
      expect(memberState(first[0], built.artifact)).toEqual(memberState(first[1], legacy))
      for (const timeMs of TIMELINE_MS) {
        const advance = { stepMs: STEP_MS, forceFullIntermediateRender: true }
        const v2Result = left.advanceTo(timeMs, advance)
        const v1Result = right.advanceTo(timeMs, advance)
        expect(Array.from(v2Result.frame), `frame@${timeMs}`).toEqual(Array.from(v1Result.frame))
        expect(memberState(v2Result, built.artifact), `state@${timeMs}`).toEqual(memberState(v1Result, legacy))
      }
    },
  )

  it('wraps the Show clock at Show End exactly as the two-Zone v1 Show does', () => {
    // Accepted v1 behavior arriving with the second Zone, not a new choice: the
    // one-Zone fresh Show holds its last Clip, and both compilers stop doing so
    // the moment a Zone is added.
    const two = compiledV2(addZone(freshV2(INSTALLATION), SECOND_ZONE)).artifact.code
    const clock = (source: string) => source.slice(source.indexOf('export function beforeRender')).split('\n')[1]
    expect(clock(two)).toContain(`% ${SHOW_END_MS / 1_000}`)
    expect(clock(compiledV1(addShowZone(freshV1(INSTALLATION))).code)).toBe(clock(two))
    expect(clock(compiledV2(freshV2(INSTALLATION)).artifact.code)).not.toContain('%')
  })
})

describe('a second Zone with its own Clip', () => {
  it('admits a Clip that ends before the outgoing Clip and compiles the v1 bytes', () => {
    // v1's equivalent: split the first Scene at 20s so the Zone-2 Clip owns
    // only the first part, keeping one continuous Clip on Zone 1.
    let legacy = frozenV1Output<ShowRecord>('showCompositionLoweringV2MultiZoneTransition.test.ts::second Zone split::1')
    legacy = removeShowClip(legacy, 'cell-3')
    legacy = extendShowCell(legacy, 'cell-1', 2)
    legacy = placeShowClip(legacy, 'zone-2', 'scene-1', { pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D' })

    const record = secondZoneClip(addZone(freshV2(INSTALLATION), SECOND_ZONE), 0, 20_000)
    const built = compiledV2(record)
    expect(built.route).toBe('continuous-flat')
    expect(built.artifact.code).toBe(compiledV1(legacy).code)
    expect(built.artifact.fxCode).toBe(compiledV1(legacy).fxCode)
  })

  it.each([
    ['ends exactly at the window start', 0, WINDOW_START_MS],
    ['starts exactly at the window end', WINDOW_END_MS, 30_000],
    ['overlaps the window', 20_000, 20_000],
    ['starts strictly inside the window', 31_000, 20_000],
    ['spans the whole Show', 0, SHOW_END_MS],
  ])('refuses a Clip that %s, with the existing diagnostic', (_name, startMs, durationMs) => {
    const record = secondZoneClip(addZone(freshV2(INSTALLATION), SECOND_ZONE), startMs, durationMs)
    const preimage = structuredClone(record)
    const preparation = prepared(record)

    expect(preparation).toEqual({ status: 'refused', issues: [UNSUPPORTED_SAMPLING] })
    expect(record).toEqual(preimage)
  })

  it('admits a Clip on each side of the window at once', () => {
    // Neither Clip reaches the outgoing hold, the window or the incoming hold.
    const record = structuredClone(secondZoneClip(addZone(freshV2(INSTALLATION), SECOND_ZONE), 0, 20_000))
    record.composition.patternInstances.push({
      id: 'instance-3', pattern: { kind: 'stock', id: 'RibbonLoom' }, patternName: 'RibbonLoom',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    record.composition.clips.push({
      id: 'clip-5', instanceId: 'instance-3', zoneId: 'zone-2', layerId: 'layer:zone-2:main',
      startMs: 40_000, durationMs: 20_000, entryPolicy: 'continue', zoneSampleMode: 'independent',
      appearance: { keys: [{ id: 'clip-5:appearance:1', timeMs: 40_000, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
    })
    expect(compiledV2(record).route).toBe('continuous-flat')
  })
})

describe('more than one Transition', () => {
  it('carries both participant Transitions and compiles the v1 bytes', () => {
    const legacy = addShowZone(updateShowCellPattern(
      addShowScene(freshV1(INSTALLATION)),
      'cell-3',
      { pattern: { kind: 'stock', id: 'RibbonLoom' }, patternName: 'RibbonLoom' },
    ))

    const record = structuredClone(addZone(freshV2(INSTALLATION), SECOND_ZONE))
    record.composition.showEndMs = 94_000
    record.composition.layoutOccurrences[0].durationMs = 94_000
    record.composition.patternInstances.push({
      id: 'instance-3', pattern: { kind: 'stock', id: 'RibbonLoom' }, patternName: 'RibbonLoom',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    record.composition.clips.push({
      id: 'clip-3', instanceId: 'instance-3', zoneId: 'zone-1', layerId: 'layer:zone-1:main',
      startMs: 64_000, durationMs: 30_000, entryPolicy: 'continue', zoneSampleMode: 'independent',
      appearance: { keys: [{ id: 'clip-3:appearance:1', timeMs: 64_000, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
    })
    record.composition.transitions.push({
      id: 'transition-2', kind: 'crossfade', durationMs: 2_000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
      participants: [{ id: 'transition-2:participant:1', zoneId: 'zone-1', layerId: 'layer:zone-1:main', fromClipId: 'clip-2', toClipId: 'clip-3' }],
      propertyRamps: [],
    })

    const built = compiledV2(record)
    expect(built.route).toBe('continuous-flat')
    expect(built.artifact.code).toBe(compiledV1(legacy).code)
  })
})

describe('what the widened admission still refuses', () => {
  it('keeps the multi-Layout refusal for an independent participant Transition', () => {
    const record = structuredClone(addZone(freshV2(INSTALLATION), SECOND_ZONE))
    const [occurrence] = record.composition.layoutOccurrences
    record.zoneLayouts.push({
      ...structuredClone(record.zoneLayouts[0]), id: 'layout-2', name: 'Second',
    })
    record.composition.layoutOccurrences = [
      { ...occurrence, durationMs: 40_000 },
      { id: 'layout-occurrence-2', layoutId: 'layout-2', startMs: 40_000, durationMs: SHOW_END_MS - 40_000, parameters: {} },
    ]
    expect(prepared(record)).toEqual({
      status: 'refused',
      issues: [{
        code: 'unsupported-layout-occurrences',
        path: 'composition.layoutOccurrences',
        message: 'Independent Clip sampling with Layer Transitions and multiple Layout occurrences requires lossless routing preparation proof.',
      }],
    })
  })

  it('keeps span-sampled Clips on the routed Transition route', () => {
    const record = structuredClone(addZone(freshV2(INSTALLATION), SECOND_ZONE))
    for (const clip of record.composition.clips) clip.zoneSampleMode = 'span'
    expect(compiledV2(record).route).toBe('transition')
  })
})

describe('a converted single-Zone v1 Show that gains a Zone', () => {
  it('compiles what v1 compiles for the same edit', () => {
    const source = freshV1(INSTALLATION)
    const conversion = convertShowRecordV1ToV2(source, {
      byCellId: { 'cell-1': DEMOS.TestPattern1D, 'cell-2': DEMOS.CometLoom },
      byPatternInstanceId: {},
      stageDimension: 2,
    })
    if (conversion.status !== 'converted') throw new Error(`Conversion refused: ${JSON.stringify(conversion)}`)
    const sources = Object.fromEntries(conversion.record.composition.patternInstances.map(instance => [
      instance.id, instance.patternName === 'CometLoom' ? DEMOS.CometLoom : DEMOS.TestPattern1D,
    ]))

    const record = addZone(conversion.record, SECOND_ZONE)
    const preparation = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: sources, stageDimension: 2 })
    if (preparation.status !== 'ready') throw new Error(`Preparation refused: ${JSON.stringify(preparation.issues)}`)

    expect(preparation.provenance.route).toBe('continuous-flat')
    expect(compileShow(preparation.recipe, LIBRARIES).code).toBe(compiledV1(addShowZone(source)).code)
    expect(record.composition.clips.every(clip => clip.zoneSampleMode === 'independent')).toBe(true)
  })
})

describe('whole-output boundary on the flat route (#1082)', () => {
  function splitRampedV1(): ShowRecord {
    let show = createShowWithOutputContract('fresh-id', 'Fresh Show', createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }))
    show = addShowZone(show)
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id] as [string, string], axis: 'x' },
    })
    return updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: { routing: { splitPosition: { from: 0.5, durationMs: 2000, easing: { curve: 'linear' } } } },
    })
  }

  function repeatRampedV1(): ShowRecord {
    let show = createShowWithOutputContract('fresh-id', 'Fresh Show', createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }))
    show = addShowZone(show)
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id] as [string, string], axis: 'x' },
    })
    return updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: { sample: { repeatScale: { from: 1, durationMs: 2000, easing: { curve: 'linear' } } } },
    })
  }

  function convertV1(show: ShowRecord): ShowRecordV2 {
    const converted = convertShowRecordV1ToV2(show, {
      byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
    })
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.status === 'refused' ? converted.issues : []))
    return converted.record
  }

  function sourcesFor(record: ShowRecordV2): Record<string, string> {
    return Object.fromEntries(record.composition.patternInstances.map(instance => [
      instance.id,
      DEMOS[resolveStockPatternId(instance.pattern.kind === 'stock' ? instance.pattern.id : instance.patternName)],
    ]))
  }

  function compiledV1For(show: ShowRecord) {
    const byCellId = Object.fromEntries(show.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]))
    return compileShow(showRecordToCompileRecipe(show, { byCellId, byPatternInstanceId: {}, stageDimension: 2 }), LIBRARIES)
  }

  function preparedV2(record: ShowRecordV2) {
    return prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: sourcesFor(record), stageDimension: 2 })
  }

  function expectByteOracle(v1: ShowRecord, record: ShowRecordV2) {
    expect(validateShowRecordV2(record)).toEqual([])
    expect(record.composition.transitions).toHaveLength(1)
    expect(record.composition.transitions[0].wholeOutput).toBeDefined()
    const preparation = preparedV2(record)
    if (preparation.status !== 'ready') throw new Error(`Preparation refused: ${JSON.stringify(preparation.issues)}`)
    expect(preparation.provenance.route).toBe('continuous-flat')
    const v1Artifact = compiledV1For(v1)
    const v2Artifact = compileShow(preparation.recipe, LIBRARIES)
    expect(v2Artifact.code).toBe(v1Artifact.code)
    expect(v2Artifact.fxCode).toBe(v1Artifact.fxCode)
    return { v1Artifact, v2Artifact, preparation }
  }

  it('split position byte oracle: v2 prepare+compile equals v1 compile on the flat route', () => {
    const v1 = splitRampedV1()
    expectByteOracle(v1, convertV1(v1))
  })

  it('repeat scale byte oracle: v2 prepare+compile equals v1 compile on the flat route', () => {
    const v1 = repeatRampedV1()
    expectByteOracle(v1, convertV1(v1))
  })

  it('editor path: planner plus editShowTransitionV2 reaches the same flat bytes', () => {
    let base = createShowWithOutputContract('fresh-id', 'Fresh Show', createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }))
    base = addShowZone(base)
    base = updateShowRoutingLayout(base, base.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [base.zones[0].id, base.zones[1].id] as [string, string], axis: 'x' },
    })
    const changes = {
      propertyTransitions: { routing: { splitPosition: { from: 0.5, durationMs: 2000, easing: { curve: 'linear' as const } } } },
    } as ShowTransitionChanges
    const expected = convertV1(updateShowBoundaryTransition(base, 'transition-scene-1', changes))
    const before = convertV1(base)
    expect(before.composition.transitions).toHaveLength(1)
    expect(before.composition.transitions[0].wholeOutput).toBeUndefined()
    const boundaryId = before.composition.transitions[0].id
    const plan = planShowV2BoundaryTransitionChanges(before, boundaryId, changes)
    expect(plan.status, JSON.stringify(plan)).toBe('ready')
    if (plan.status !== 'ready') return
    const result = editShowTransitionV2(before, plan.intent)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.transitions).toEqual(expected.composition.transitions)
    expect(result.record.composition.propertyTracks).toEqual(expected.composition.propertyTracks)
    const v1 = updateShowBoundaryTransition(base, 'transition-scene-1', changes)
    expectByteOracle(v1, result.record)
  })

  it('span guard: a span-sampled whole-output boundary keeps global-sections', () => {
    const record = structuredClone(convertV1(splitRampedV1()))
    for (const clip of record.composition.clips) clip.zoneSampleMode = 'span'
    expect(canLowerShowV2ToFlat(record, false, true)).toBe(false)
    const preparation = preparedV2(record)
    if (preparation.status !== 'ready') throw new Error(`Span preparation refused: ${JSON.stringify(preparation.issues)}`)
    expect(preparation.provenance.route).toBe('global-sections')
    const v1Artifact = compiledV1For(splitRampedV1())
    const v2Artifact = compileShow(preparation.recipe, LIBRARIES)
    expect(typeof v2Artifact.code).toBe('string')
    expect(v2Artifact.code.length).toBeGreaterThan(0)
    expect(v1Artifact.code.length).toBeGreaterThan(0)
  })

  it('touching-Clip refusal: an unrelated Clip touching the window never reaches the flat route', () => {
    const record = structuredClone(convertV1(splitRampedV1()))
    const zone2Main = record.composition.layers.find(layer => layer.zoneId === record.zones[1].id && layer.rank === 0)!
    const template = record.composition.patternInstances[0]
    record.composition.patternInstances.push({ ...structuredClone(template), id: 'unrelated-instance' })
    record.composition.clips.push({
      id: 'unrelated-clip',
      instanceId: 'unrelated-instance',
      zoneId: record.zones[1].id,
      layerId: zone2Main.id,
      startMs: 0,
      durationMs: 30000,
      entryPolicy: 'continue',
      zoneSampleMode: 'independent',
      appearance: { keys: [{ id: 'unrelated-clip:appearance:1', timeMs: 0, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
    })
    expect(canLowerShowV2ToFlat(record, false, true)).toBe(false)
    const preimage = structuredClone(record)
    const preparation = preparedV2(record)
    expect(preparation.status).toBe('refused')
    expect(record).toEqual(preimage)
  })
})
