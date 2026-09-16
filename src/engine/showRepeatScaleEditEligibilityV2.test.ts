import { LIBRARIES } from '../pixelblaze/libs'
import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2 } from './showCompositionV2'
import { insertShowTimeV2 } from './showTimelineV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { projectShowTransitionPropertyRampsV2, insertTimeInShowPropertyTracksV2 } from './showPropertyAnimationV2'
import { repeatScaleSourceIsInRangeV2 } from './showRepeatScaleEditEligibilityV2'

function fixture(from: number, to: number) {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.propertyTracks = [{ id: 'repeat', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 'first', timeMs: 0, value: from, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'last', timeMs: 1000, value: to, easing: { curve: 'linear' } },
  ] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}
it.each([[1, 8], [8, 1], [2, 4]])('holds admitted repeat source %s→%s without changing its decode domain', (from, to) => {
  const source = fixture(from, to)
  expect(prepareShowV2ForCompile(source, { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { hsv(x,1,1) }' }, stageDimension: 2 }, { libraries: LIBRARIES }).status).toBe('ready')
  const held = insertShowTimeV2(source, { atMs: 250, durationMs: 125 })
  expect(held.status).toBe('changed')
  expect(prepareShowV2ForCompile(held.record, { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { hsv(x,1,1) }' }, stageDimension: 2 }, { libraries: LIBRARIES }).status).toBe('ready')
})
it.each([[1 - 1e-8, 2], [2, 8 + 1e-8], [0.5, 1.5]])('refuses a hold into outside repeat source %s→%s atomically while preserving ready preimage', (from, to) => {
  const source = fixture(from, to)
  const prior = structuredClone(source)
  expect(prepareShowV2ForCompile(source, { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { hsv(x,1,1) }' }, stageDimension: 2 }, { libraries: LIBRARIES }).status).toBe('ready')
  const result = insertShowTimeV2(source, { atMs: 250, durationMs: 125 })
  expect(result.status).toBe('refused')
  expect(result.record).toBe(source)
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected')) expect(value).toEqual([])
  expect(source).toEqual(prior)
  // Shifting the complete source and inserting after activation do not cut it.
  expect(insertShowTimeV2(source, { atMs: 0, durationMs: 125 }).status).toBe('changed')
  expect(insertShowTimeV2(source, { atMs: 1000, durationMs: 125 }).status).toBe('changed')
})
it('refuses outside retained source even when all retained authored values are inside', () => {
  const source = fixture(2, 3)
  source.composition.propertyTracks[0].keyframes[0].curveSegment = { baseValue: 0.5, deltaValue: 2.5, sourceDurationMs: 2000, elapsedOffsetMs: 1000, easing: { curve: 'quadratic', direction: 'in' } }
  expect(validateShowRecordV2(source)).toEqual([])
  expect(insertShowTimeV2(source, { atMs: 250, durationMs: 125 }).status).toBe('refused')
})
it('uses exact Back/Bezier extrema rather than endpoint-only or sampled range checks', () => {
  expect(repeatScaleSourceIsInRangeV2(1, 8, { curve: 'back', direction: 'out', overshoot: 1.70158 })).toBe(false)
  expect(repeatScaleSourceIsInRangeV2(3, 4, { curve: 'back', direction: 'in-out', overshoot: 1.70158 })).toBe(true)
  expect(repeatScaleSourceIsInRangeV2(1, 8, { curve: 'cubic-bezier', x1: 0.2, y1: 2, x2: 0.8, y2: 2 })).toBe(false)
  expect(repeatScaleSourceIsInRangeV2(2, 3, { curve: 'cubic-bezier', x1: 0.2, y1: 2, x2: 0.8, y2: 0 })).toBe(true)
})
it.each([0.99999999, 8.00000001])('refuses projected repeat ramp endpoint %s with exact original record', outside => {
  const source = fixture(1, 8)
  source.composition.propertyTracks = []
  const clip = source.composition.clips[0]
  clip.durationMs = 400
  const right = structuredClone(clip)
  right.id = 'right'; right.startMs = 500; right.appearance.keys.forEach(key => { key.timeMs += 500 })
  source.composition.clips.push(right)
  source.composition.transitions = [{ id: 'fade', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, wholeOutput: { startMs: 400, fromClipIds: [clip.id], toClipIds: [right.id] }, participants: [], propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 2 }] }]
  expect(validateShowRecordV2(source)).toEqual([])
  const result = projectShowTransitionPropertyRampsV2(source, 'fade', [{ rampIndex: 0, trackId: 'projected', startKeyId: 'a', endKeyId: 'b', activeEndMs: 900, toValue: outside }])
  expect(result.status).toBe('refused');expect(result.record).toBe(source);expect(result.affectedTrackIds).toEqual([])
})

it.each([{ curve: 'back' as const, direction: 'out' as const, overshoot: 1.70158 }, { curve: 'cubic-bezier' as const, x1: 0.2, y1: 2, x2: 0.8, y2: 2 }])('refuses an overshooting %j hold through both edit consumers', easing => {
  const source = fixture(1, 8)
  source.composition.propertyTracks[0].keyframes[0].easing = easing
  expect(validateShowRecordV2(source)).toEqual([])
  const global = insertShowTimeV2(source, { atMs: 250, durationMs: 125 })
  expect(global.status).toBe('refused');expect(global.record).toBe(source);expect(global.affectedTrackIds).toEqual([])
  const property = insertTimeInShowPropertyTracksV2(source, 250, 125)
  expect(property.status).toBe('refused');expect(property.propertyTracks).toBe(source.composition.propertyTracks);expect(property.affectedTrackIds).toEqual([])
})

it.each(['fast', 'fidelity'] as const)('reopened admitted1→8 Insert Time holds exact curve and keeps runtime advancing in%s', async fidelity => {
  const { compileShow } = await import('./showCompiler')
  const { createFastReplayRuntime } = await import('./fastReplay')
  const { buildShowEpeExport } = await import('./showEpeExport')
  const { parseEpe } = await import('./epeImport')
  const { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } = await import('./showCompositionV2')
  const { evaluateShowPropertyTrackV2 } = await import('./showPropertyAnimationV2')
  const source = fixture(1, 8)
  const result = insertShowTimeV2(source, { atMs: 250, durationMs: 125 })
  expect(result.status).toBe('changed')
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))
  if (opened.status !== 'opened') throw new Error('Reopen refused')
  const held = opened.record.composition.propertyTracks[0]
  for (const [time, original] of [[249, 249], [250, 250], [374, 250], [375, 250]]) expect(evaluateShowPropertyTrackV2(held, time)).toBe(1 + 7 * (original / 1000) ** 2)
  const sourceCode = 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}'
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: sourceCode }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(opened.record, lookup, { libraries: LIBRARIES })
  const before = prepareShowV2ForCompile(source, lookup, { libraries: LIBRARIES })
  if (prepared.status !== 'ready' || before.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  expect(artifact.summary.clips.map(member => member.id)).toEqual(compileShow(before.recipe, LIBRARIES).summary.clips.map(member => member.id))
  const epe = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'range-insert', stampedAt: '2026-09-16T00:00:00Z' }).text)
  const runtime = createFastReplayRuntime({ ...artifact, code: epe.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.125, 0.25], pos: [0.125, 0.25] }] })
  for (const time of [125, 250, 375, 500, 625, 750, 875, 1000, 1125, 1250]) {
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    const local = time % 1125
    const original = local < 250 ? local : local < 375 ? 250 : local - 125
    const sample = 0.125 * (1 + 7 * (original / 1000) ** 2) % 1
    expect(Math.abs(frame.frame[0] - sample), `sample@${time}`).toBeLessThan(fidelity === 'fast' ? 1e-12 : 5 / 65536)
    expect(Math.floor(frame.frame[0] * 255), `display@${time}`).toBe(Math.floor(sample * 255))
    expect(frame.exports[`${artifact.summary.clips[0].prefix}_elapsed`], `clock@${time}`).toBe(time * (fidelity === 'fast' ? 1 : 65536))
  }
})

it.each([
  { name: 'earlier untouched outside kernel', at: 750, keys: [[0, 0.5], [250, 2], [1000, 3]] },
  { name: 'later whole-shifted outside kernel', at: 125, keys: [[0, 2], [250, 3], [1000, 8.5]] },
  { name: 'before first key', at: 125, keys: [[250, 2], [1000, 8.5]] },
  { name: 'after last key', at: 750, keys: [[0, 0.5], [250, 2]] },
  { name: 'exact key before outside shifted kernel', at: 250, keys: [[0, 2], [250, 3], [1000, 8.5]] },
])('preserves admitted $name while holding only its selected in-range source', ({ at, keys }) => {
  const source = fixture(2, 3)
  source.composition.propertyTracks[0].keyframes = keys.map(([timeMs, value], index) => ({ id: `key:${index}`, timeMs, value, easing: { curve: 'quadratic', direction: 'in' } }))
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(i,x,y){rgb(x,y,0)}' }, stageDimension: 2 as const }
  expect(prepareShowV2ForCompile(source, lookup, { libraries: LIBRARIES }).status).toBe('ready')
  const next = insertShowTimeV2(source, { atMs: at, durationMs: 125 })
  expect(next.status).toBe('changed')
  expect(prepareShowV2ForCompile(next.record, lookup, { libraries: LIBRARIES }).status).toBe('ready')
  expect(insertTimeInShowPropertyTracksV2(source, at, 125).status).toBe('changed')
  for (const key of source.composition.propertyTracks[0].keyframes) {
    const mapped = next.record.composition.propertyTracks[0].keyframes.find(candidate => candidate.id === key.id)!
    expect(mapped.value).toBe(key.value)
    expect(mapped.timeMs).toBe(key.timeMs < at ? key.timeMs : key.timeMs + 125)
  }
})

it.each(['fast', 'fidelity'] as const)('reopened%s playback preserves untouched outside kernels before and after an exact-key hold', async fidelity => {
  const { compileShow } = await import('./showCompiler')
  const { createFastReplayRuntime } = await import('./fastReplay')
  const { buildShowEpeExport } = await import('./showEpeExport')
  const { parseEpe } = await import('./epeImport')
  const { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } = await import('./showCompositionV2')
  for (const partition of [
    { at: 750, values: [0.5, 2, 3], expected: (t: number) => t < 250 ? 1 + (t / 250) ** 2 : 2 + ((t - 250) / 750) ** 2 },
    { at: 250, values: [2, 3, 8.5], expected: (t: number) => t < 250 ? 2 + (t / 250) ** 2 : 3 + 5 * ((t - 250) / 750) ** 2 },
  ]) {
    const source = fixture(2, 3)
    source.composition.propertyTracks[0].keyframes = [0, 250, 1000].map((timeMs, index) => ({ id: `key:${index}`, timeMs, value: partition.values[index], easing: { curve: 'quadratic', direction: 'in' } }))
    const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(i,x,y){rgb(x,y,0)}' }, stageDimension: 2 as const }
    const before = prepareShowV2ForCompile(source, lookup, { libraries: LIBRARIES })
    const next = insertShowTimeV2(source, { atMs: partition.at, durationMs: 125 })
    expect(next.status).toBe('changed')
    const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(next.record))
    if (opened.status !== 'opened') throw new Error('Reopen refused')
    const after = prepareShowV2ForCompile(opened.record, lookup, { libraries: LIBRARIES })
    if (before.status !== 'ready' || after.status !== 'ready') throw new Error('Preparation refused')
    for (const [recipe, held] of [[before.recipe, false], [after.recipe, true]] as const) {
      const artifact = compileShow(recipe, LIBRARIES)
      const epe = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'local-range', stampedAt: '2026-09-16T00:00:00Z' }).text)
      const runtime = createFastReplayRuntime({ ...artifact, code: epe.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.125, 0.25], pos: [0.125, 0.25] }] })
      for (const time of [125, 250, 375, 500, 625, 750, 875]) {
        const original = !held || time < partition.at ? time : time < partition.at + 125 ? partition.at : time - 125
        // Existing playback clamps original endpoints; unaffected kernels keep that behavior.
        const expected = 0.125 * partition.expected(original) % 1
        const actual = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true }).frame[0]
        expect(Math.abs(actual - expected), `${partition.at}/${held}@${time}`).toBeLessThan(fidelity === 'fast' ? 1e-12 : 5 / 65536)
        expect(Math.floor(actual * 255), `${partition.at}/${held} display@${time}`).toBe(Math.floor(expected * 255))
      }
    }
  }
})
