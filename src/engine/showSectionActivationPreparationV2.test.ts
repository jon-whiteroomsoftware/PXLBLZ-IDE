import { expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import { compileShow } from './showCompiler'
import { emitFixedPoint } from './fxEmit'
import { parseEpe } from './epeImport'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowPropertyTrackV2,
  type ShowRecordV2,
} from './showCompositionV2'
import type {
  ShowLayerTransition,
  ShowMainPlacement,
  ShowPropertyAnimationTrack,
  ShowRecord,
} from './personalContentRecords'
import type { MapPoint } from './maps/types'

/**
 * Section-scoped Property-track activation beside a participant Transition
 * (#1038, specification §5/§6/§12 ACTIVATION, INSERT, GROUP-HOLD, PARITY).
 *
 * The oracle for every admitted case is an independently authored legacy record
 * whose Scene-scoped tracks express the same activation through the compiler
 * channel the recipe already had. No v2 candidate is judged against another v2
 * candidate, and no tolerance is widened: frames and exported state are exact.
 */
const VOICE = [
  'export var elapsed = 0',
  'export var gain = 0.2',
  'export var tilt = 0.5',
  'export function sliderGain(value) { gain = value }',
  'export function sliderTilt(value) { tilt = value }',
  'export function beforeRender(delta) { elapsed += delta }',
  'export function render2D(index, x, y) { rgb(gain, elapsed / 4000, tilt * x) }',
].join('\n')

const MAP: MapPoint[] = [
  { sample: [0.25, 0.5], pos: [0.25, 0.5] },
  { sample: [0.75, 0.5], pos: [0.75, 0.5] },
]

const SHOW_END_MS = 2000
const WINDOW_START_MS = 400
const WINDOW_END_MS = 600
const PROBES = [0, 1, 200, 399, 400, 401, 500, 599, 600, 601, 799, 800, 801, 1000, 1199,
  1200, 1201, 1599, 1600, 1601, 1800, 1999]

const view = { mirror: false, phase: 0, brightness: 1 } as const

function clipV2(id: string, instanceId: string, layerId: string, startMs: number, durationMs: number) {
  return {
    id, instanceId, zoneId: 'zone', layerId, startMs, durationMs,
    entryPolicy: 'continue' as const, zoneSampleMode: 'span' as const,
    appearance: { keys: [{ id: `${id}:key`, timeMs: startMs, value: { opacity: 1, effects: [], view: { ...view } } }] },
  }
}

/**
 * Two Clips joined by a positive participant Transition on an overlay Layer,
 * with a bed Clip spanning the whole Show underneath. Property activation is
 * supplied per case so each partition names exactly one difference.
 */
function fixture(propertyTracks: ShowPropertyTrackV2[]): ShowRecordV2 {
  const record: ShowRecordV2 = {
    version: 2, id: 'section-activation', name: 'Section activation',
    zones: [{ id: 'zone', name: 'Zone', nominalPixelCount: 8 }],
    zoneLayouts: [{ id: 'layout', name: 'Layout', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 8,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
    composition: {
      version: 2, executionModel: 'continuous', showEndMs: SHOW_END_MS, sampleRemap: { repeatScale: 1 },
      patternInstances: [
        { id: 'bed', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2, sliderTilt: 0.5 } },
        { id: 'out', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2, sliderTilt: 0.5 } },
        { id: 'in', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2, sliderTilt: 0.5 } },
      ],
      layers: [
        { id: 'main', zoneId: 'zone', name: 'Main', rank: 0 },
        { id: 'over', zoneId: 'zone', name: 'Over', rank: 1 },
      ],
      clips: [
        clipV2('bed-clip', 'bed', 'main', 0, SHOW_END_MS),
        clipV2('out-clip', 'out', 'over', 0, WINDOW_START_MS),
        clipV2('in-clip', 'in', 'over', WINDOW_END_MS, SHOW_END_MS - WINDOW_END_MS),
      ],
      transitions: [{
        id: 'boundary', kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: WINDOW_END_MS - WINDOW_START_MS,
        easing: { curve: 'sine', direction: 'in-out' },
        participants: [{ id: 'boundary:pair', zoneId: 'zone', layerId: 'over', fromClipId: 'out-clip', toClipId: 'in-clip' }],
        propertyRamps: [],
      }],
      layoutOccurrences: [{ id: 'first-layout', layoutId: 'layout', startMs: 0, durationMs: SHOW_END_MS, parameters: {} }],
      propertyTracks: structuredClone(propertyTracks),
      markers: [], groupDefinitions: [], groupOccurrences: [],
    },
    updatedAt: 1,
  }
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

/**
 * The independently authored legacy oracle: explicit Scene-local placements and
 * Scene-scoped tracks written by hand for the named boundaries, not derived
 * from the candidate.
 */
function legacyOracle(
  boundaries: number[],
  tracksBySectionIndex: Record<number, ShowPropertyAnimationTrack[]>,
): ShowRecord {
  const sections = boundaries.slice(0, -1).map((startMs, index) => ({ startMs, endMs: boundaries[index + 1], index }))
  const placement = (id: string, instanceId: string, startMs: number, durationMs: number, logicalClipId?: string): ShowMainPlacement => ({
    id, instanceId, startMs, durationMs, view: { ...view },
    ...(logicalClipId ? { logicalClipId } : {}),
  })
  const span = (clipId: string, instanceId: string, clipStartMs: number, clipEndMs: number, section: { startMs: number; endMs: number; index: number }) => {
    const startMs = Math.max(clipStartMs, section.startMs)
    const endMs = Math.min(clipEndMs, section.endMs)
    if (endMs <= startMs) return []
    const first = startMs === clipStartMs
    return [placement(first ? clipId : `${clipId}--span-legacy-${section.index}`, instanceId,
      startMs - section.startMs, endMs - startMs, first ? undefined : clipId)]
  }
  return {
    id: 'legacy-oracle', name: 'Legacy oracle',
    scenes: sections.map(section => ({ id: `legacy-${section.index}`, name: `Legacy ${section.index}`, durationMs: section.endMs - section.startMs })),
    zones: [{ id: 'zone', name: 'Zone', nominalPixelCount: 8 }],
    cells: [],
    routingLayouts: [{ id: 'layout', name: 'Layout', zones: [], logical: { kind: 'single', zoneIds: ['zone'] } }],
    transitions: [],
    outputContract: { version: 1, kind: 'portable-2d', referenceMapId: 'plane', referencePixelCount: 8,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' } },
    composition: {
      version: 1, durationMs: SHOW_END_MS,
      patternInstances: [
        { id: 'bed', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2, sliderTilt: 0.5 } },
        { id: 'out', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2, sliderTilt: 0.5 } },
        { id: 'in', pattern: { kind: 'user', id: 'voice' }, patternName: 'Voice', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: { sliderGain: 0.2, sliderTilt: 0.5 } },
      ],
      scenes: sections.map(section => ({
        sceneId: `legacy-${section.index}`,
        zones: [{
          zoneId: 'zone',
          main: span('bed-clip', 'bed', 0, SHOW_END_MS, section),
          overlays: [{ id: `over@${section.index}`, name: 'Over', placements: [
            ...span('out-clip', 'out', 0, WINDOW_START_MS, section),
            ...span('in-clip', 'in', WINDOW_END_MS, SHOW_END_MS, section),
          ].map(main => ({ ...main, opacity: 1 })) }],
        }],
        ...(tracksBySectionIndex[section.index] ? { propertyTracks: structuredClone(tracksBySectionIndex[section.index]) } : {}),
      })),
      transitions: sections.some(section => section.startMs <= WINDOW_START_MS && section.endMs > WINDOW_END_MS)
        ? [{
            id: 'boundary', fromPlacementId: 'out-clip', toPlacementId: 'in-clip',
            kind: 'crossfade', crossfadePolicy: 'live-live', durationMs: WINDOW_END_MS - WINDOW_START_MS,
            easing: { curve: 'sine', direction: 'in-out' },
          } satisfies ShowLayerTransition]
        : [],
    },
    updatedAt: 1,
  }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  expect(opened.record).toEqual(record)
  return opened.record
}

function prepare(record: ShowRecordV2) {
  return prepareShowV2ForCompile(reopen(record), {
    byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, VOICE])),
  }, { libraries: {} })
}

/** Reopen the delivered `.epe` so every candidate probe reads the exported artifact. */
function deliveredCandidate(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(record, artifact.code, { id: 'section-activation-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  if (exported.status !== 'exported') throw new Error(exported.message)
  const opened = parseEpe(exported.text)
  expect(opened.src).toBe(exported.source)
  return {
    provenance: ready.provenance,
    prefixFor: (instanceId: string) => artifact.summary.clips.find(member => member.id === instanceId)!.prefix,
    runtime: createFastReplayRuntime({ ...artifact, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 },
      { fidelity, randomSeed: 1038, mapPoints: MAP }),
  }
}

function deliveredLegacy(show: ShowRecord, fidelity: 'fast' | 'fidelity') {
  const artifact = compileShow(showRecordToCompileRecipe(show, {
    byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(show.composition!.patternInstances.map(instance => [instance.id, VOICE])),
  }), {})
  return {
    prefixFor: (instanceId: string) => artifact.summary.clips.find(member => member.id === instanceId)!.prefix,
    runtime: createFastReplayRuntime({ ...artifact, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: MAP }),
  }
}

function compareAgainstLegacy(record: ShowRecordV2, oracle: ShowRecord, probes: number[] = PROBES) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const candidate = deliveredCandidate(record, fidelity)
    const legacy = deliveredLegacy(oracle, fidelity)
    for (const atMs of probes) {
      const left = candidate.runtime.advanceTo(atMs, { stepMs: 25, forceFullIntermediateRender: true })
      const right = legacy.runtime.advanceTo(atMs, { stepMs: 25, forceFullIntermediateRender: true })
      expect(left.frame, `frame ${fidelity} @${atMs}`).toEqual(right.frame)
      for (const instanceId of ['bed', 'out', 'in']) {
        for (const name of ['gain', 'tilt', 'elapsed']) {
          expect(left.exports[`${candidate.prefixFor(instanceId)}_${name}`], `${instanceId}.${name} ${fidelity} @${atMs}`)
            .toEqual(right.exports[`${legacy.prefixFor(instanceId)}_${name}`])
        }
      }
    }
  }
}

const linear = { curve: 'linear' } as const

function gainTrack(activeStartMs: number, activeDurationMs: number): ShowPropertyTrackV2 {
  return {
    id: 'bed-gain', target: { kind: 'instance-control', instanceId: 'bed', exportName: 'sliderGain' },
    activeStartMs, activeDurationMs,
    keyframes: [
      // Binary-exact endpoints and midpoint: the hand-authored legacy boundary
      // literal and the candidate's computed boundary agree bit for bit, so the
      // comparison stays exact instead of acquiring a tolerance.
      { id: 'gain:start', timeMs: activeStartMs, value: 0.25, easing: linear },
      { id: 'gain:end', timeMs: activeStartMs + activeDurationMs, value: 0.75, easing: linear },
    ],
  }
}

function legacyGainTrack(sectionIndex: number, fromValue: number, toValue: number, durationMs: number): ShowPropertyAnimationTrack {
  return {
    id: `legacy-gain-${sectionIndex}`, target: { kind: 'instance-control', instanceId: 'bed', exportName: 'sliderGain' },
    keyframes: [
      { id: `legacy-gain-${sectionIndex}:start`, timeMs: 0, value: fromValue, easing: linear },
      { id: `legacy-gain-${sectionIndex}:end`, timeMs: durationMs, value: toValue, easing: linear },
    ],
  }
}

it('retains the existing single-section representation when every track covers the whole Show', () => {
  const record = fixture([gainTrack(0, SHOW_END_MS)])
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') return
  expect(ready.provenance.route).toBe('transition')
  expect(ready.provenance.derivedSceneIds).toEqual(['v2-section:0'])
})

it('lowers a partially active instance-control track into sections beside a participant Transition', () => {
  const record = fixture([gainTrack(800, 800)])
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') return
  expect(ready.provenance.route).toBe('transition')
  // Boundaries 0, 800, 1600, 2000: the Transition window stays inside one section.
  expect(ready.provenance.derivedSceneIds).toEqual(['v2-section:0', 'v2-section:1', 'v2-section:2'])
  compareAgainstLegacy(record, legacyOracle([0, 800, 1600, SHOW_END_MS], { 1: [legacyGainTrack(1, 0.25, 0.75, 800)] }))
})

it('lowers a partially active Clip-targeted track into sections beside a participant Transition', () => {
  const record = fixture([{
    id: 'bed-brightness', target: { kind: 'clip-view', clipId: 'bed-clip', property: 'brightness' },
    activeStartMs: 800, activeDurationMs: 800,
    keyframes: [
      { id: 'bright:start', timeMs: 800, value: 1, easing: linear },
      { id: 'bright:end', timeMs: 1600, value: 0.25, easing: linear },
    ],
  }])
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') return
  compareAgainstLegacy(record, legacyOracle([0, 800, 1600, SHOW_END_MS], {
    1: [{
      id: 'legacy-brightness', target: { kind: 'placement-view', placementId: 'bed-clip--span-legacy-1', property: 'brightness' },
      keyframes: [
        { id: 'legacy-bright:start', timeMs: 0, value: 1, easing: linear },
        { id: 'legacy-bright:end', timeMs: 800, value: 0.25, easing: linear },
      ],
    }],
  }))
})

it('clips one activation across a section boundary introduced by another track', () => {
  const record = fixture([
    // Authored keys at 800, 1200 and 1600: the boundary the tilt track adds at
    // 1200 falls on an authored key, so each section keeps exact authored
    // endpoints and the legacy comparison stays bit-exact.
    {
      ...gainTrack(800, 800),
      keyframes: [
        { id: 'gain:start', timeMs: 800, value: 0.25, easing: linear },
        { id: 'gain:mid', timeMs: 1200, value: 0.5, easing: linear },
        { id: 'gain:end', timeMs: 1600, value: 0.75, easing: linear },
      ],
    },
    {
      id: 'bed-tilt', target: { kind: 'instance-control', instanceId: 'bed', exportName: 'sliderTilt' },
      activeStartMs: 1200, activeDurationMs: 400,
      keyframes: [
        { id: 'tilt:start', timeMs: 1200, value: 0.5, easing: linear },
        { id: 'tilt:end', timeMs: 1600, value: 1, easing: linear },
      ],
    },
  ])
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') return
  expect(ready.provenance.derivedSceneIds).toEqual(['v2-section:0', 'v2-section:1', 'v2-section:2', 'v2-section:3'])
  // Section [800,1200) carries the first half of the gain ramp; [1200,1600)
  // carries its exact remainder plus the whole tilt ramp.
  compareAgainstLegacy(record, legacyOracle([0, 800, 1200, 1600, SHOW_END_MS], {
    1: [legacyGainTrack(1, 0.25, 0.5, 400)],
    2: [
      legacyGainTrack(2, 0.5, 0.75, 400),
      { id: 'legacy-tilt', target: { kind: 'instance-control', instanceId: 'bed', exportName: 'sliderTilt' },
        keyframes: [
          { id: 'legacy-tilt:start', timeMs: 0, value: 0.5, easing: linear },
          { id: 'legacy-tilt:end', timeMs: 400, value: 1, easing: linear },
        ] },
    ],
  }))
})

it('retains an exact curveSegment kernel when activation crosses a section boundary', () => {
  const easing = { curve: 'quadratic', direction: 'in' } as const
  // One authored quadratic source from 800 to 1600, sampled at 1200 by the
  // second track's boundary. The retained descriptor must reproduce the source
  // kernel, not a re-normalized two-point curve.
  const track: ShowPropertyTrackV2 = {
    id: 'bed-gain', target: { kind: 'instance-control', instanceId: 'bed', exportName: 'sliderGain' },
    activeStartMs: 800, activeDurationMs: 800,
    keyframes: [
      { id: 'gain:start', timeMs: 800, value: 0.2, easing },
      { id: 'gain:end', timeMs: 1600, value: 0.8, easing: linear },
    ],
  }
  const record = fixture([track, {
    id: 'bed-tilt', target: { kind: 'instance-control', instanceId: 'bed', exportName: 'sliderTilt' },
    activeStartMs: 1200, activeDurationMs: 400,
    keyframes: [
      { id: 'tilt:start', timeMs: 1200, value: 0.5, easing: linear },
      { id: 'tilt:end', timeMs: 1600, value: 1, easing: linear },
    ],
  }])
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') return
  const candidate = deliveredCandidate(record, 'fast')
  const prefix = candidate.prefixFor('bed')
  let previous = 0
  for (const atMs of [800, 900, 1199, 1200, 1201, 1400, 1599]) {
    const frame = candidate.runtime.advanceTo(atMs, { stepMs: atMs - previous, forceFullIntermediateRender: true })
    previous = atMs
    expect(Number(frame.exports[`${prefix}_gain`]), `retained kernel @${atMs}`)
      .toBeCloseTo(evaluateShowPropertyTrackV2(track, atMs)!, 6)
  }
  // A re-normalized two-point restatement of the surviving interval would read
  // 0.4625 at 1400; the retained kernel reads 0.5375. The gap is the fault the
  // §6 "no normalization by endpoint-value difference" rule protects.
  const renormalized = evaluateShowPropertyTrackV2({
    ...track, activeStartMs: 1200, activeDurationMs: 400,
    keyframes: [
      { id: 'renormalized:start', timeMs: 1200, value: evaluateShowPropertyTrackV2(track, 1200)!, easing },
      { id: 'renormalized:end', timeMs: 1600, value: 0.8, easing: linear },
    ],
  }, 1400)!
  expect(evaluateShowPropertyTrackV2(track, 1400)).toBeCloseTo(0.5375, 12)
  expect(renormalized).toBeCloseTo(0.4625, 12)
})

it('maps a shared instance track once per section for two Clips on different sections', () => {
  const record = fixture([gainTrack(800, 800)])
  // The bed runtime is consumed by a second Clip that only exists after the
  // section boundary; the shared track must map once per section, not per Clip.
  record.composition.clips[0].durationMs = 1200
  record.composition.clips.push({ ...clipV2('bed-late', 'bed', 'main', 1200, SHOW_END_MS - 1200) })
  expect(validateShowRecordV2(record)).toEqual([])
  const ready = prepare(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') return
  const oracle = legacyOracle([0, 800, 1600, SHOW_END_MS], { 1: [legacyGainTrack(1, 0.25, 0.75, 800)] })
  for (const scene of oracle.composition!.scenes) {
    scene.zones[0].main = scene.zones[0].main.flatMap(main => {
      if (!main.id.startsWith('bed-clip')) return [main]
      const sceneIndex = oracle.composition!.scenes.indexOf(scene)
      if (sceneIndex === 0) return [main]
      if (sceneIndex === 1) return [
        { ...main, id: 'bed-clip--span-legacy-1', logicalClipId: 'bed-clip', startMs: 0, durationMs: 400 },
        { ...main, id: 'bed-late', logicalClipId: undefined, startMs: 400, durationMs: 400 },
      ]
      return [{ ...main, id: 'bed-late--span-legacy-2', logicalClipId: 'bed-late' }]
    })
  }
  compareAgainstLegacy(record, oracle)
})

it('refuses an activation edge strictly inside a participant Transition window', () => {
  const record = fixture([gainTrack(500, 1000)])
  const before = structuredClone(record)
  expect(prepare(record)).toMatchObject({
    status: 'refused',
    issues: [{ code: 'unsupported-transition-property-track', path: 'composition.propertyTracks' }],
  })
  expect(record).toEqual(before)
})

it('refuses an activation edge exactly at a participant Transition window boundary', () => {
  for (const activeStartMs of [WINDOW_START_MS, WINDOW_END_MS]) {
    const record = fixture([gainTrack(activeStartMs, SHOW_END_MS - activeStartMs)])
    expect(prepare(record), `edge ${activeStartMs}`).toMatchObject({
      status: 'refused',
      issues: [{ code: 'unsupported-transition-property-track' }],
    })
  }
})
