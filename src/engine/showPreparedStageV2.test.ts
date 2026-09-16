import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { prepareShowStageV2, type ShowPreparedStageDependenciesV2 } from './showPreparedStageV2'
import { createCustomMap } from './maps'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { insertShowTimeV2 } from './showTimelineV2'

const code = 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}'
function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion refused')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'pattern' }
  return record
}
function dependencies(): ShowPreparedStageDependenciesV2 {
  return { patterns: [{ id: 'pattern', name: 'Synthetic', src: code, updatedAt: 1, controls: {} }], maps: [], libraries: [], profiles: [], stageMap: null }
}
it('captures exact prepared recipe/artifact and unaliased record under one identity', () => {
  const record = fixture();const assets = dependencies();const prior = structuredClone(record)
  const result = prepareShowStageV2(record, assets)
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw new Error('Preparation refused')
  const expected = prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: { instance: code }, stageDimension: 2 }, { libraries: LIBRARIES })
  if (expected.status !== 'ready') throw new Error('Public preparation refused')
  expect(result.bundle.recipe).toEqual(expected.recipe)
  expect(result.bundle.artifact).toEqual(compileShow(expected.recipe, LIBRARIES))
  expect(result.bundle.identity.record).toBe(record)
  expect(result.bundle.identity.dependencies).toBe(assets)
  expect(result.bundle.record).toEqual(prior)
  expect(result.bundle.record).not.toBe(record)
  record.composition.sampleRemap.repeatScale = 4
  expect(result.bundle.record).toEqual(prior)
})
it.each([2, 3] as const)('captures actual %sD map dimensions/pixel context and the Layout active at0', dim => {
  const record = fixture();const assets = dependencies()
  assets.patterns = [{ ...assets.patterns[0], src: dim === 3 ? 'export function render3D(i,x,y,z){rgb(x,y,z)}' : code }]
  assets.stageMap = createCustomMap(dim === 3 ? [[0, 0, 0], [1, 1, 1]] : [[0, 0], [1, 1]], { id: 'stage', name: 'Stage' })
  record.stageMapId = 'stage'
  if (record.outputContract.kind === 'portable-2d') record.outputContract.referencePixelCount = 2
  record.zoneLayouts.unshift({ ...structuredClone(record.zoneLayouts[0]), id: 'unused', name: 'Unused' })
  const result = prepareShowStageV2(record, assets)
  expect(result.status).toBe('ready')
  if (result.status !== 'ready') throw new Error('Preparation refused')
  expect(result.bundle.provenance.layoutId).toBe('layout')
  expect(result.bundle.presentation.stageDimension).toBe(dim)
  expect(result.bundle.presentation.layout.sampleDimension).toBe(dim)
  expect(result.bundle.presentation.layout.draw.kind).toBe(dim === 3 ? '3d' : '2d')
  expect(result.bundle.presentation.pixelCount).toBe(2)
})
it('admits valid empty content without artifact and refuses invalid or missing source separately', () => {
  const record = fixture();record.composition.clips = []
  expect(prepareShowStageV2(record, dependencies()).status).toBe('empty')
  record.composition.showEndMs = -1
  expect(prepareShowStageV2(record, dependencies()).status).toBe('refused')
  const nonempty = fixture();const assets = dependencies();assets.patterns = []
  expect(prepareShowStageV2(nonempty, assets)).toMatchObject({ status: 'refused', message: expect.stringContaining('exact Pattern source') })
})
it.each(['fast', 'fidelity'] as const)('prepared%s artifact preserves held original curve and advancing state', fidelity => {
  const record = fixture()
  record.composition.propertyTracks = [{ id: 'repeat', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 'a', timeMs: 0, value: 2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'b', timeMs: 1000, value: 4, easing: { curve: 'linear' } },
  ] }]
  const inserted = insertShowTimeV2(record, { atMs: 250, durationMs: 125 })
  expect(inserted.status).toBe('changed')
  const result = prepareShowStageV2(inserted.record, dependencies())
  if (result.status !== 'ready') throw new Error('Preparation refused')
  expect(validateShowRecordV2(result.bundle.record)).toEqual([])
  const runtime = createFastReplayRuntime({ ...result.bundle.artifact, code: parseEpe(JSON.stringify({ id: 'prepared-stage-proof', name: 'Prepared Stage', sources: { main: result.bundle.artifact.code }, preview: '' })).src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.125, 0.25], pos: [0.125, 0.25] }] })
  for (const time of [125, 250, 375, 500, 625]) {
    const original = time < 250 ? time : time < 375 ? 250 : time - 125
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    expect(frame.frame[0]).toBeCloseTo(0.125 * (2 + 2 * (original / 1000) ** 2), fidelity === 'fast' ? 12 : 4)
    expect(frame.exports[`${result.bundle.artifact.summary.clips[0].prefix}_elapsed`]).toBe(time * (fidelity === 'fast' ? 1 : 65536))
  }
})


it.each(['fast', 'fidelity'] as const)('reopened prepared%s artifact keeps shared runtime and full Restart state', fidelity => {
  const record = fixture()
  record.composition.clips[0].durationMs = 500
  record.composition.clips.push({ ...structuredClone(record.composition.clips[0]), id: 'restart', startMs: 500, durationMs: 500, entryPolicy: 'restart' })
  record.composition.clips[1].appearance.keys[0].timeMs = 500
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Codec reopen refused')
  const result = prepareShowStageV2(opened.record, dependencies())
  if (result.status !== 'ready') throw new Error(result.status === 'refused' ? result.message : 'Unexpected empty')
  expect(new Set(result.bundle.artifact.summary.clips.map(clip => clip.prefix)).size).toBe(1)
  const runtime = createFastReplayRuntime({ ...result.bundle.artifact, code: parseEpe(JSON.stringify({ id: 'prepared-stage-proof', name: 'Prepared Stage', sources: { main: result.bundle.artifact.code }, preview: '' })).src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.125, 0.25], pos: [0.125, 0.25] }] })
  const prefix = result.bundle.artifact.summary.clips[0].prefix
  for (const [time, elapsed] of [[375, 375], [500, 0], [625, 125], [750, 250]]) {
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    expect(frame.exports[`${prefix}_elapsed`]).toBe(elapsed * (fidelity === 'fast' ? 1 : 65536))
  }
})
