import { expect, it } from 'vitest'
import { continuingV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { LIBRARIES } from '../pixelblaze/libs'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from './showCompositionV2'

it('preserves repeat-scale held targets and a boundary-owned scalar ramp', () => {
  const source = continuingV1Show()
  source.composition!.durationMs = 1200
  const incoming = source.composition!.scenes[1].zones[0].main[0]
  incoming.id = 'incoming'
  delete incoming.logicalClipId
  source.scenes[1].sampleTargets = { repeatScale: 4 }
  source.transitions = [{ id: 'repeat-ramp', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyTransitions: { sample: { repeatScale: { from: 1, durationMs: 200, easing: { curve: 'linear' } } } } }]
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' && converted.issues)).toBe('converted')
  if (converted.status !== 'converted') return
  expect(source).toEqual(before)
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(converted.record))).toEqual({ status: 'opened', record: converted.record })
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(x,y,0)}' }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.samplePropertyRamps).toEqual({ repeatScale: { initial: 1, ramps: [{ atMs: 500, from: 1, to: 4, durationMs: 200, easing: { curve: 'linear' } }] } })
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it('preserves simultaneous split-position and repeat-scale scalar ramps', () => {
  const source = continuingV1Show()
  source.composition!.durationMs = 1200
  const incoming = source.composition!.scenes[1].zones[0].main[0]
  incoming.id = 'incoming'
  delete incoming.logicalClipId
  source.scenes[0].routingTargets = { splitPosition: 0.25 }
  source.scenes[1].routingTargets = { splitPosition: 0.75 }
  source.scenes[1].sampleTargets = { repeatScale: 4 }
  source.transitions = [{ id: 'scalar-ramps', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyTransitions: {
    routing: { splitPosition: { from: 0.25, durationMs: 180, easing: { curve: 'sine', direction: 'in-out' } } },
    sample: { repeatScale: { from: 1, durationMs: 200, easing: { curve: 'linear' } } },
  } }]
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' && converted.issues)).toBe('converted')
  if (converted.status !== 'converted') return
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y){rgb(x,y,0)}' }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.samplePropertyRamps).toEqual({ repeatScale: { initial: 1, ramps: [{ atMs: 500, from: 1, to: 4, durationMs: 200, easing: { curve: 'linear' } }] } })
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it.each(['duplicate', 'wrong-layout', 'participant'] as const)('rejects ambiguous scalar ownership: %s', change => {
  const source = continuingV1Show()
  source.composition!.durationMs = 1200
  const incoming = source.composition!.scenes[1].zones[0].main[0]
  incoming.id = 'incoming'
  delete incoming.logicalClipId
  source.scenes[0].routingTargets = { splitPosition: 0.25 }
  source.scenes[1].routingTargets = { splitPosition: 0.75 }
  source.transitions = [{ id: 'split-ramp', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, propertyTransitions: { routing: { splitPosition: { from: 0.25 } } } }]
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const ramps = converted.record.composition.transitions[0].propertyRamps
  if (change === 'duplicate') ramps.push(structuredClone(ramps[0]))
  if (change === 'wrong-layout') ramps[0].target = { kind: 'layout-occurrence-split-position', layoutOccurrenceId: converted.record.composition.layoutOccurrences[0].id }
  if (change === 'participant') ramps[0].participantId = 'unrelated'
  const before = structuredClone(converted.record)
  expect(prepareShowV2ForCompile(converted.record, { byCellId: {}, byPatternInstanceId: { instance: 'export function render(index){rgb(1,0,0)}' } }).status).toBe('refused')
  expect(converted.record).toEqual(before)
})

it.each(['repeat', 'split'] as const)('preserves changed %s targets across a visual boundary without an explicit ramp', property => {
  const source = continuingV1Show()
  source.composition!.durationMs = 1200
  const incoming = source.composition!.scenes[1].zones[0].main[0]
  incoming.id = 'incoming'
  delete incoming.logicalClipId
  source.zones.push({ id: 'other', name: 'Blank', nominalPixelCount: 16 })
  source.routingLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'other'] }
  for (const scene of source.composition!.scenes) scene.zones.push({ zoneId: 'other', main: [], overlays: [] })
  if (property === 'repeat') source.scenes[1].sampleTargets = { repeatScale: 4 }
  else {
    source.scenes[0].routingTargets = { splitPosition: 0.25 }
    source.scenes[1].routingTargets = { splitPosition: 0.75 }
  }
  source.transitions = [{ id: 'boundary', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' } }]
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y){rgb(x,y,0)}' }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  const expected = showRecordToCompileRecipe(source, lookup)
  expect(prepared.recipe.routingPropertyRamps).toEqual(expected.routingPropertyRamps)
  expect(prepared.recipe.samplePropertyRamps).toEqual(expected.samplePropertyRamps)
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(expected, LIBRARIES).code)
  const transition = converted.record.composition.transitions[0]
  const from = converted.record.composition.clips.find(clip => clip.id === transition.wholeOutput!.fromClipIds[0])!
  const toId = transition.wholeOutput!.toClipIds[0]
  delete transition.wholeOutput
  transition.participants = [{ id: 'participant', zoneId: from.zoneId, layerId: from.layerId, fromClipId: from.id, toClipId: toId }]
  expect(prepareShowV2ForCompile(converted.record, lookup).status).toBe('refused')
})
