import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, type ShowGroupEditResultV2 } from './showGroupEditsV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { parseEpe } from './epeImport'
import { emitFixedPoint } from './fxEmit'
import { createFastReplayRuntime } from './fastReplay'
import { deriveShowRestartEventsV2 } from './showPropertyAnimationV2'

const source = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level,elapsed/2000,x)}'

function fixture(): ShowRecordV2 {
  const legacy = convertibleV1Show()
  legacy.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(legacy)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .2 }
  const ordinary = record.composition.clips[0]
  record.composition.clips = []
  record.composition.executionModel = 'continuous'
  record.composition.groupDefinitions = [{ id: 'group', name: 'Group', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }], clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200,
      entryPolicy: 'restart', zoneSampleMode: 'span', appearance: { keys: [{ ...structuredClone(ordinary.appearance.keys[0]), id: 'local-key', timeMs: 0 }] } }],
    transitions: [], propertyTracks: [{ id: 'local-opacity', target: { kind: 'clip-opacity', clipId: 'child' }, activeStartMs: 0, activeDurationMs: 200,
      keyframes: [{ id: 'local-first', timeMs: 0, value: .25, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'local-last', timeMs: 200, value: .75, easing: { curve: 'linear' } }] }] }]
  record.composition.groupOccurrences = [{ id: 'use', definitionId: 'group', zoneId: 'zone', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    startMs: 200, translationX: .1, translationY: 0, holds: [{ id: 'beat', localTimeMs: 100, durationMs: 100 }], instanceBindings: { slot: 'instance' },
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: ordinary.layerId }] }]
  record.composition.propertyTracks = [{ id: 'level', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 100, activeDurationMs: 500,
    keyframes: [{ id: 'first', timeMs: 100, value: .2, easing: { curve: 'sine', direction: 'in-out' }, curveSegment: { baseValue: .2, deltaValue: .6, easing: { curve: 'sine', direction: 'in-out' }, sourceDurationMs: 500, elapsedOffsetMs: 0 } },
      { id: 'last', timeMs: 600, value: .8, easing: { curve: 'linear' } }] },
    { id: 'scale', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 100, activeDurationMs: 500,
      keyframes: [{ id: 'first', timeMs: 100, value: 1, easing: { curve: 'linear' } }, { id: 'last', timeMs: 600, value: 1.5, easing: { curve: 'linear' } }] }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function reopen(record: ShowRecordV2) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(opened.status).toBe('opened')
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function placement(record: ShowRecordV2, startMs = 300) {
  const occurrence = record.composition.groupOccurrences[0]
  return { startMs, zoneId: occurrence.zoneId, layoutOccurrenceId: occurrence.layoutOccurrenceId,
    layerBindings: structuredClone(occurrence.layerBindings), translationX: occurrence.translationX, translationY: occurrence.translationY }
}

function prepared(record: ShowRecordV2) {
  const opened = reopen(record)
  return prepareShowV2ForCompile(opened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(opened).composition.patternInstances.map(instance => [instance.id, source])) }, { libraries: {} })
}

function delivered(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const ready = prepared(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  if (ready.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(ready.recipe, {})
  const exported = buildShowEpeExportV2(record, artifact.code, { id: 'group-move-proof', stampedAt: '2026-09-16T00:00:00.000Z' })
  expect(exported.status).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  const opened = parseEpe(exported.text)
  expect(opened.src).toBe(exported.source)
  return createFastReplayRuntime({ ...artifact, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }] })
}

function compareDelivered(actual: ShowRecordV2, expected: ShowRecordV2) {
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const a = delivered(actual, fidelity)
    const b = delivered(expected, fidelity)
    for (const atMs of [0, 199, 200, 299, 300, 301, 399, 400, 401, 499, 500, 501, 599, 600, 601, 699, 700, 701, 999, 1001, 1301]) {
      const x = a.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const y = b.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(x.frame).toEqual(y.frame)
      expect(x.exports).toEqual(y.exports)
      expect(Object.keys(x.exports).length).toBeGreaterThan(0)
    }
  }
}

function emptyAffected(result: ShowGroupEditResultV2) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'hoistedInstanceIds', 'discardedControlTargets'].includes(key)) expect(value).toEqual([])
}

it('moves sole-effective-user global instance animation once alongside held Group choreography and Restart', () => {
  const record = fixture()
  const preimage = prepared(record)
  expect(preimage.status, JSON.stringify(preimage)).toBe('ready')
  const before = structuredClone(record)
  const intent = { kind: 'move-occurrence' as const, occurrenceId: 'use', ...placement(record) }
  const beforeIntent = structuredClone(intent)
  const result = moveShowGroupOccurrenceV2(record, intent)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.groupOccurrences[0].startMs = 300
  for (const track of expected.composition.propertyTracks) {
    track.activeStartMs = 200
    track.keyframes[0].timeMs = 200
    track.keyframes[1].timeMs = 700
  }
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual(['level', 'scale'])
  expect(result.affectedPropertyKeyIds).toEqual(['first', 'last', 'first', 'last'])
  expect(result.affectedGroupOccurrenceIds).toEqual(['use'])
  expect(deriveShowRestartEventsV2(result.record)).toMatchObject({ status: 'derived', events: [{ instanceId: 'instance', atMs: 300 }] })
  expect(record).toEqual(before)
  expect(intent).toEqual(beforeIntent)
  compareDelivered(result.record, expected)
  result.record.composition.propertyTracks[0].keyframes[0].curveSegment!.baseValue = .9
  expect(record).toEqual(before)
})

it.each(['ordinary-before', 'ordinary-future', 'ordinary-invisible', 'linked-occurrence', 'two-selected-children'] as const)('keeps global instance animation fixed for shared preimage users (%s)', sharing => {
  const record = fixture()
  if (sharing === 'linked-occurrence') {
    record.composition.groupOccurrences.push({ ...structuredClone(record.composition.groupOccurrences[0]), id: 'second-use', startMs: 650 })
  } else if (sharing === 'two-selected-children') {
    const definition = record.composition.groupDefinitions[0]
    definition.clips[0].durationMs = 100
    definition.clips.push({ ...structuredClone(definition.clips[0]), id: 'second-child', startMs: 100, entryPolicy: 'continue',
      appearance: { keys: [{ ...structuredClone(definition.clips[0].appearance.keys[0]), id: 'second-appearance', timeMs: 100 }] } })
  } else {
    const child = record.composition.groupDefinitions[0].clips[0]
    const startMs = sharing === 'ordinary-before' ? 0 : 800
    const key = structuredClone(child.appearance.keys[0])
    key.id = 'outside-key'
    key.timeMs = startMs
    if (sharing === 'ordinary-invisible') key.value.opacity = 0
    record.composition.clips.push({ ...structuredClone(child), id: 'outside', instanceId: 'instance', zoneId: 'zone',
      layerId: record.composition.layers[0].id, startMs, durationMs: 100, entryPolicy: 'continue', appearance: { keys: [key] } })
  }
  expect(validateShowRecordV2(record)).toEqual([])
  const preimage = prepared(record)
  expect(preimage.status, JSON.stringify(preimage)).toBe('ready')
  const before = structuredClone(record)
  const result = moveShowGroupOccurrenceV2(record, { kind: 'move-occurrence', occurrenceId: 'use', ...placement(record) })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.groupOccurrences[0].startMs = 300
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(result.affectedPropertyKeyIds).toEqual([])
  expect(record).toEqual(before)
  compareDelivered(result.record, expected)
})

it('leaves unrelated and unused binding owners fixed while moving only a sole used runtime', () => {
  const record = fixture()
  const unused = { ...structuredClone(record.composition.patternInstances[0]), id: 'unused' }
  record.composition.patternInstances.push(unused)
  record.composition.groupDefinitions[0].patternInstances.push({ ...structuredClone(unused), id: 'unused-slot' })
  record.composition.groupOccurrences[0].instanceBindings!['unused-slot'] = 'unused'
  record.composition.propertyTracks.push({ ...structuredClone(record.composition.propertyTracks[0]), id: 'unused-level', target: { kind: 'instance-control', instanceId: 'unused', exportName: 'sliderLevel' } })
  expect(validateShowRecordV2(record)).toEqual([])
  const before = structuredClone(record)
  const result = moveShowGroupOccurrenceV2(record, { kind: 'move-occurrence', occurrenceId: 'use', ...placement(record) })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(result.record.composition.propertyTracks[2]).toEqual(before.composition.propertyTracks[2])
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(result.affectedTrackIds).toEqual(['level', 'scale'])
  expect(record).toEqual(before)
})

it.each([0, 700])('refuses a movement that makes sole-user global activation invalid (start %s)', startMs => {
  const record = fixture()
  const before = structuredClone(record)
  const intent = { kind: 'move-occurrence' as const, occurrenceId: 'use', ...placement(record, startMs) }
  const beforeIntent = structuredClone(intent)
  const result = moveShowGroupOccurrenceV2(record, intent)
  expect(result.status, JSON.stringify(result)).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  expect(intent).toEqual(beforeIntent)
  emptyAffected(result)
})

it('refuses sole-user movement into another Group-owned animation window, preserving half-open preimage ownership', () => {
  const record = fixture()
  const other = { ...structuredClone(record.composition.patternInstances[0]), id: 'other' }
  record.composition.patternInstances.push(other)
  const definition = structuredClone(record.composition.groupDefinitions[0])
  definition.id = 'other-group'
  definition.patternInstances.push({ ...structuredClone(other), id: 'other-slot' })
  definition.clips[0].instanceId = 'other-slot'
  definition.clips[0].entryPolicy = 'continue'
  definition.propertyTracks = [{ id: 'other-level', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 200,
    keyframes: [{ id: 'first', timeMs: 0, value: .8, easing: { curve: 'linear' } }, { id: 'last', timeMs: 200, value: .4, easing: { curve: 'linear' } }] }]
  record.composition.groupDefinitions.push(definition)
  record.composition.groupOccurrences.push({ ...structuredClone(record.composition.groupOccurrences[0]), id: 'other-use', definitionId: 'other-group', startMs: 600,
    holds: [], instanceBindings: { slot: 'instance', 'other-slot': 'other' } })
  expect(validateShowRecordV2(record)).toEqual([])
  const ready = prepared(record)
  expect(ready.status, JSON.stringify(ready)).toBe('ready')
  const before = structuredClone(record)
  const result = moveShowGroupOccurrenceV2(record, { kind: 'move-occurrence', occurrenceId: 'use', ...placement(record) })
  expect(result.status, JSON.stringify(result)).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it('preserves global owners on spatial-only movement and exact placement no-op', () => {
  const record = fixture()
  const before = structuredClone(record)
  const noOp = moveShowGroupOccurrenceV2(record, { kind: 'move-occurrence', occurrenceId: 'use', ...placement(record, 200) })
  expect(noOp.status).toBe('unchanged')
  expect(noOp.record).toBe(record)
  emptyAffected(noOp)
  const result = moveShowGroupOccurrenceV2(record, { kind: 'move-occurrence', occurrenceId: 'use', ...placement(record, 200), translationX: .3 })
  expect(result.status).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.groupOccurrences[0].translationX = .3
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(result.affectedPropertyKeyIds).toEqual([])
  compareDelivered(result.record, expected)
  expect(record).toEqual(before)
})

it('linked duplication preserves the one existing global animation owner without copying or shifting it', () => {
  const record = fixture()
  const before = structuredClone(record)
  const result = duplicateShowGroupOccurrenceV2(record, { kind: 'duplicate-occurrence', occurrenceId: 'use', newOccurrenceId: 'copy', ...placement(record, 650) })
  expect(result.status, JSON.stringify(result)).toBe('changed')
  const expected = structuredClone(before)
  expected.composition.groupOccurrences.push({ ...structuredClone(before.composition.groupOccurrences[0]), id: 'copy', startMs: 650 })
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedTrackIds).toEqual([])
  expect(result.affectedPropertyKeyIds).toEqual([])
  compareDelivered(result.record, expected)
  expect(record).toEqual(before)
})
