import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile, lowerShowCompositionV2ForCompile } from './showCompositionLoweringV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { compileShow } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { buildShowEpeExport } from './showEpeExport'
import { lowerShowScalarPropertyTracksV2 } from './showScalarPropertyTrackLoweringV2'

const code = 'export var elapsed = 0; export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(x, y, elapsed / 1000) }'
function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  return record
}
function track(start = 250, duration = 500): ShowPropertyTrackV2 {
  return { id: 'repeat', target: { kind: 'show-repeat-scale' }, activeStartMs: start, activeDurationMs: duration, keyframes: [
    { id: 'first', timeMs: start, value: 2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'last', timeMs: start + duration, value: 4, easing: { curve: 'linear' } },
  ] }
}
function prepare(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Reopen failed')
  return prepareShowV2ForCompile(opened.record, { byCellId: {}, byPatternInstanceId: { instance: code }, stageDimension: 2 }, { libraries: LIBRARIES })
}
it.each(([{ fidelity: 'fast', retained: false }, { fidelity: 'fidelity', retained: false }, { fidelity: 'fast', retained: true }, { fidelity: 'fidelity', retained: true }] as const).flatMap(partition => [[2, 4], [1, 8], [8, 1]].map(([from, to]) => ({ ...partition, from, to }))))('reopened nonlinear repeat activation drives independent sample arithmetic/state ($fidelity, retained:$retained, $from→$to)', ({ fidelity, retained, from, to }) => {
  const record = fixture()
  record.composition.propertyTracks = [track()]
  record.composition.propertyTracks[0].keyframes[0].value = from
  record.composition.propertyTracks[0].keyframes[1].value = to
  if (retained) {
    const keys = record.composition.propertyTracks[0].keyframes
    keys[0].value = from + (to - from) * 0.25 ** 2
    keys[0].curveSegment = { baseValue: from, deltaValue: to - from, sourceDurationMs: 1000, elapsedOffsetMs: 250, easing: { curve: 'quadratic', direction: 'in' } }
    keys[1].value = from + (to - from) * 0.75 ** 2
  }
  const prior = structuredClone(record)
  const prepared = prepare(record)
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') return
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const epe = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'repeat-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  const sampleX = from === 2 ? 0.3 : 0.125
  const runtime = createFastReplayRuntime({ ...artifact, code: epe.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [sampleX, 0.25], pos: [sampleX, 0.25] }] })
  for (const time of [125, 250, 375, 500, 625, 750, 875]) {
    const result = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    const scale = time < 250 || time >= 750 ? 1 : retained ? from + (to - from) * (time / 1000) ** 2 : from + (to - from) * ((time - 250) / 500) ** 2
    const expected = sampleX * scale % 1
    const tolerance = fidelity === 'fast' ? 1e-12 : 5 / 65536
    expect(Math.abs(result.frame[0] - expected), `sample@${time}`).toBeLessThan(tolerance)
    expect(Math.floor(result.frame[0] * 255), `display sample@${time}`).toBe(Math.floor(expected * 255))
    const member = artifact.summary.clips.find(clip => clip.id === 'instance')!
    expect(result.exports[`${member.prefix}_elapsed`], `state@${time}`).toBe(time * (fidelity === 'fidelity' ? 65536 : 1))
  }
  expect(record).toEqual(prior)
  expect(() => lowerShowCompositionV2ForCompile(record, { byCellId: {}, byPatternInstanceId: { instance: code }, stageDimension: 2 })).toThrow(/prepareShowV2ForCompile/)
})
it('retains full-Show held scale source bytes through the existing direct lowering path', () => {
  const record = fixture()
  record.composition.propertyTracks = [{ ...track(0, 1000), keyframes: [{ id: 'first', timeMs: 0, value: 2, easing: { curve: 'hold', at: 1 } }, { id: 'last', timeMs: 500, value: 3, easing: { curve: 'hold', at: 1 } }] }]
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: code }, stageDimension: 2 as const }
  const prepared = prepare(record)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
  const direct = lowerShowCompositionV2ForCompile(record, lookup)
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(direct.show, direct.lookup), LIBRARIES).code)
})
it.each([0, -1])('refuses nonpositive authored repeat values (%s)', value => {
  const record = fixture()
  record.composition.propertyTracks = [track()]
  record.composition.propertyTracks[0].keyframes[0].value = value
  expect(prepare(record)).toMatchObject({ status: 'refused', issues: [expect.objectContaining({ code: 'unsupported-property-target' })] })
})
it('refuses overlapping scalar owners but accepts exact half-open adjacency', () => {
  const record = fixture()
  record.composition.propertyTracks = [track(100, 400), { ...track(499, 400), id: 'other' }]
  expect(validateShowRecordV2(record)).toEqual([])
  expect(prepare(record).status).toBe('refused')
  record.composition.propertyTracks[1] = { ...track(500, 400), id: 'other' }
  expect(prepare(record).status).toBe('ready')
})

it.each(['fast', 'fidelity'] as const)('restores independent baseline changes after activation, with held endpoints and prior/future cuts in %s', fidelity => {
  const source = { initial: 1, ramps: [
    { atMs: 125, from: 1, to: 2, durationMs: 0, easing: { curve: 'linear' as const } },
    { atMs: 375, from: 2, to: 3, durationMs: 0, easing: { curve: 'linear' as const } },
    { atMs: 875, from: 3, to: 4, durationMs: 0, easing: { curve: 'linear' as const } },
  ] }
  const authored = track(250, 500)
  authored.keyframes = [{ id: 'held', timeMs: 375, value: 4, easing: { curve: 'linear' } }, { id: 'end', timeMs: 625, value: 6, easing: { curve: 'linear' } }]
  const prior = structuredClone({ source, authored })
  const lowered = lowerShowScalarPropertyTracksV2([authored], 1000, source)
  if (lowered.status !== 'ready') throw new Error(lowered.message)
  const artifact = compileShow({
    clips: ['first', 'second'].map(id => ({ id, source: 'export function render2D(i,x,y){rgb(x,y,0)}' })),
    sceneSequence: { scenes: [{ clipId: 'first', holdMs: 500, transitionOut: { kind: 'cut', durationMs: 0 } }, { clipId: 'second', holdMs: 500 }] },
    samplePropertyRamps: { repeatScale: lowered.value },
  }, LIBRARIES)
  const epe = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'baseline', stampedAt: '2026-09-16T00:00:00Z' }).text)
  const runtime = createFastReplayRuntime({ ...artifact, code: epe.src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.125, 0.25], pos: [0.125, 0.25] }] })
  for (const [time, scale] of [[125, 2], [250, 4], [375, 4], [500, 5], [625, 6], [750, 3], [875, 4]]) {
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true }).frame
    expect(frame[0], `baseline@${time}`).toBe(0.125 * scale)
  }
  expect({ source, authored }).toEqual(prior)
})
it('refuses only positive baseline-carrier overlap and admits its exact activation adjacency', () => {
  const source = { initial: 1, ramps: [{ atMs: 750, from: 1, to: 2, durationMs: 125, easing: { curve: 'linear' as const } }] }
  expect(lowerShowScalarPropertyTracksV2([track()], 1000, source).status).toBe('ready')
  const shifted = { ...source, ramps: [{ ...source.ramps[0], atMs: 749 }] }
  expect(lowerShowScalarPropertyTracksV2([track()], 1000, shifted)).toMatchObject({ status: 'refused' })
})
