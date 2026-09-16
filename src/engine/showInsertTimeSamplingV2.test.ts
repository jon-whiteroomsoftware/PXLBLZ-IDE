import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2, type ShowClipAppearanceValueV2 } from './showCompositionV2'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { effectiveShowInstanceUseCountV2 } from './showGroupsV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { buildShowEpeExport } from './showEpeExport'
import { insertShowTimeV2 } from './showTimelineV2'

function record(shared = true): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const source = converted.record
  source.composition.executionModel = 'continuous'
  source.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 })
  source.zoneLayouts[0].logical = { kind: 'split', zoneIds: ['zone', 'right'], axis: 'x' }
  source.composition.layers = [source.composition.layers[0], { id: 'right-main', zoneId: 'right', name: 'Main', rank: 0 }]
  const left = source.composition.clips[0]
  left.zoneSampleMode = 'independent'
  if (!shared) source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'right-instance' })
  source.composition.clips.push({ ...structuredClone(left), id: 'right-clip', instanceId: shared ? 'instance' : 'right-instance', zoneId: 'right', layerId: 'right-main', appearance: { keys: [{ ...structuredClone(left.appearance.keys[0]), id: 'right-first' }] } })
  return source
}
function reopen(source: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(source)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(source))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  expect(opened.record).toEqual(source)
  return opened.record
}
const code = 'export var elapsed=0; export var calls=0; export function beforeRender(delta){elapsed+=delta;calls++} export function render2D(index,x,y){rgb(x,(elapsed%1000)/1000,calls/1000)}'
const lookup = { byCellId: {}, byPatternInstanceId: { instance: code, 'right-instance': code }, stageDimension: 2 as const }
function consumer(source: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepareShowV2ForCompile(reopen(source), lookup, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const opened = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'sampling-corrective', stampedAt: '2026-09-16T00:00:00Z' }).text)
  const replay = createFastReplayRuntime({ ...artifact, code: opened.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [0.1, 0.4, 0.6, 0.9].map(x => ({ sample: [x, 0.5], pos: [x, 0.5] })) })
  return { prepared, artifact, replay }
}

it.each(['single', 'distinct'] as const)('keeps admitted multi-Zone independent held sampling and runtime identity (%s)', kind => {
  const shared = kind === 'single'
  const source = record(shared)
  if (shared) source.composition.clips.splice(1)
  const before = structuredClone(source)
  expect(consumer(source, 'fast').prepared.provenance.route).toBe('continuous-flat')
  const inserted = insertShowTimeV2(source, { atMs: 500, durationMs: 100 })
  if (inserted.status !== 'changed') throw new Error(inserted.message)
  const actual = reopen(inserted.record)
  expect(actual.composition.clips.every(clip => clip.appearance.keys.length === 2)).toBe(true)
  expect(actual.composition.patternInstances).toEqual(source.composition.patternInstances)
  expect(effectiveShowInstanceUseCountV2(actual, 'instance')).toBe(1)
  const expected = structuredClone(source)
  expected.composition.showEndMs = 1100
  expected.composition.layoutOccurrences[0].durationMs = 1100
  expected.composition.clips.forEach(clip => { clip.durationMs = 1100 })
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const left = consumer(actual, fidelity)
    const right = consumer(expected, fidelity)
    expect(left.prepared.provenance.route).toBe('continuous-flat')
    expect(left.artifact.code).toBe(right.artifact.code)
    expect(left.artifact.summary.clips).toHaveLength(shared ? 1 : 2)
    const prefix = left.artifact.summary.clips.find(member => member.id === 'clip')?.prefix ?? left.artifact.summary.clips[0].prefix
    let heldStart: Record<string, unknown> | undefined
    for (const atMs of [0, 125, 499, 500, 550, 599, 600, 601, 1000, 1100, 1125]) {
      const a = left.replay.advanceTo(atMs, { stepMs: 125 })
      const b = right.replay.advanceTo(atMs, { stepMs: 125 })
      expect(Array.from(a.frame), `${fidelity} frame ${atMs}`).toEqual(Array.from(b.frame))
      expect(a.exports, `${fidelity} state ${atMs}`).toEqual(b.exports)
      if (atMs === 500) heldStart = structuredClone(a.exports)
      if (atMs === 600) expect(((a.exports[`${prefix}_elapsed`] as number) - (heldStart![`${prefix}_elapsed`] as number)) / (fidelity === 'fidelity' ? 65536 : 1)).toBe(100)
    }
  }
  expect(source).toEqual(before)
  expect(inserted.record).toEqual(actual)
})

it.each([
  { opacity: 0.5 },
  { view: { mirror: false, phase: 0, brightness: 1 - Number.EPSILON } },
  { presentation: { mode: 'freeze' } },
  { blink: { rateHz: 2, duty: 0.5, phase: 0 } },
  { transform: { positionX: 0.1, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 } },
  { aperture: { enabled: true, x: 0, y: 0, width: 0.5, height: 1 } },
  { effects: [{ id: 'effect', kind: 'brightness', brightness: 0.5 }] },
] satisfies Array<Partial<ShowClipAppearanceValueV2>>)('keeps actual independent-sampling appearance divergence refused for %j', difference => {
  const source = record()
  const first = source.composition.clips[0].appearance.keys[0]
  source.composition.clips[0].appearance.keys.push({ id: 'different', timeMs: 500, value: { ...structuredClone(first.value), ...difference } })
  const before = structuredClone(source)
  expect(prepareShowV2ForCompile(reopen(source), lookup, { libraries: LIBRARIES })).toMatchObject({ status: 'refused', issues: [{ code: 'unsupported-zone-sampling' }] })
  expect(source).toEqual(before)
})


it('retains the pre-existing simultaneous shared-runtime flat refusal for both preimage and insertion', () => {
  const source = record(true)
  const before = structuredClone(source)
  const inserted = insertShowTimeV2(source, { atMs: 500, durationMs: 100 })
  if (inserted.status !== 'changed') throw new Error(inserted.message)
  for (const value of [source, inserted.record]) {
    expect(prepareShowV2ForCompile(reopen(value), lookup, { libraries: LIBRARIES })).toMatchObject({ status: 'refused', issues: [{ code: 'unsupported-runtime-sharing' }] })
    expect(effectiveShowInstanceUseCountV2(value, 'instance')).toBe(2)
  }
  expect(source).toEqual(before)
})
