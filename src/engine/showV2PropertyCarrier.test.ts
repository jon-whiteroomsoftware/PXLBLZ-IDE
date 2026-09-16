import { expect, it } from 'vitest'
import { continuingV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow, type ShowRecipe } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import type { ShowRecordV2 } from './showCompositionV2'
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
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(x,y,0)}' }, stageDimension: 2 as const }
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
  const before = structuredClone(converted.record)
  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(converted.record))
  expect(reopened.status).toBe('opened')
  if (reopened.status !== 'opened') return
  const participant = prepareShowV2ForCompile(reopened.record, lookup)
  expect(converted.record).toEqual(before)
  expect(participant.status, participant.status === 'refused' ? JSON.stringify(participant.issues) : '').toBe('ready')
  if (participant.status !== 'ready') return
  // The accepted participant schedule is unchanged by independently supplied global scalar values.
  const neutral = structuredClone(reopened.record)
  if (property === 'split') for (const occurrence of neutral.composition.layoutOccurrences) occurrence.parameters.splitPosition = .5
  else neutral.composition.sampleRemap.repeatScale = 1
  neutral.composition.propertyTracks = neutral.composition.propertyTracks.filter(track => track.target.kind !== (property === 'split' ? 'layout-occurrence-split-position' : 'show-repeat-scale'))
  const neutralPrepared = prepareShowV2ForCompile(neutral, lookup)
  expect(neutralPrepared.status).toBe('ready')
  if (neutralPrepared.status !== 'ready') return
  if (property === 'split') expect(reopened.record.composition.layoutOccurrences[1].startMs).toBe(700)
  else expect(reopened.record.composition.propertyTracks.find(track => track.target.kind === 'show-repeat-scale')!.keyframes[1].timeMs).toBe(700)
  const intended = structuredClone(neutralPrepared.recipe)
  if (property === 'split') {
    intended.routingPropertyRamps = { splitPosition: { initial: .25, ramps: [{ atMs: 700, from: .25, to: .75, durationMs: 0, easing: { curve: 'linear' } }] } }
    expect(participant.recipe.routingPropertyRamps).toEqual(intended.routingPropertyRamps)
  } else {
    intended.samplePropertyRamps = { repeatScale: { initial: 1, ramps: [{ atMs: 700, from: 1, to: 4, durationMs: 0, easing: { curve: 'linear' } }] } }
    expect(participant.recipe.samplePropertyRamps).toEqual(intended.samplePropertyRamps)
  }
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const actual = scalarFrames(participant.recipe, fidelity, reopened.record)
    expect(actual).toEqual(scalarFrames(intended, fidelity))
    const neutralFrames = scalarFrames(neutralPrepared.recipe, fidelity)
    expect(actual.some((snapshot, index) => JSON.stringify(snapshot.frame) !== JSON.stringify(neutralFrames[index].frame))).toBe(true)
    expect(Object.keys(actual[0].state).length).toBeGreaterThan(0)
  }
})

function scalarFrames(recipe: ShowRecipe, fidelity: 'fast' | 'fidelity', record?: ShowRecordV2) {
  const artifact = compileShow(recipe, LIBRARIES)
  let code = artifact.code
  if (record) {
    const file = buildShowEpeExportV2(record, code, { stampedAt: '2026-09-16T00:00:00Z' })
    expect(file.status).toBe('exported')
    if (file.status === 'exported') code = parseEpe(file.text).src
  }
  const runtime = createFastReplayRuntime({ ...artifact, code, dimension: nativeDimension(artifact.metadata.renderFns) }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.4, .25], pos: [.4, .25] }, { sample: [.6, .75], pos: [.6, .75] }] })
  return [125, 375, 400, 425, 500, 575, 600, 625, 750, 875].map(time => {
    const frame = runtime.advanceTo(time, { stepMs: 25, forceFullIntermediateRender: true })
    const state = Object.fromEntries(Object.entries(frame.exports).filter(([name, value]) => /calls/.test(name) && typeof value === 'number'))
    // Export getters are live; copy at this frame before advancing again.
    return { frame: Array.from(frame.frame), state }
  })
}
