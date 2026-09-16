import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { LIBRARIES } from '../pixelblaze/libs'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { deleteShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, type DeleteShowGroupOccurrenceIntentV2, type ShowGroupEditResultV2, type ShowGroupUniqueIdentityPlanV2 } from './showGroupEditsV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2 } from './showPropertyAnimationV2'
import { isValidatedEmptyShowV2 } from './showMarkerRouteModel'
import { buildShowEpeExport } from './showEpeExport'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'

function fixture(): ShowRecordV2 {
  const source = convertibleV1Show()
  source.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.showEndMs = 2000
  record.composition.layoutOccurrences = [{ ...record.composition.layoutOccurrences[0], startMs: 0, durationMs: 2000 }]
  record.composition.clips[0].durationMs = 2000
  record.composition.clips[0].entryPolicy = 'continue'
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .2 }
  record.composition.markers.push({ id: 'dormant-guide', timeMs: 3000, name: 'Later' })
  const layer = { id: 'group-layer', zoneId: record.zones[0].id, name: 'Group', rank: 1 }
  record.composition.layers.push(layer)
  record.composition.groupDefinitions = [{
    id: 'group', name: 'Pulse',
    patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }],
    clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer',
      startMs: 0, durationMs: 200, entryPolicy: 'restart', zoneSampleMode: record.composition.clips[0].zoneSampleMode,
      appearance: { keys: [{ ...structuredClone(record.composition.clips[0].appearance.keys[0]), id: 'child-appearance', timeMs: 0 }] } }],
    transitions: [], propertyTracks: [],
  }]
  record.composition.groupOccurrences = [200, 800].map((startMs, index) => ({
    id: `use-${index}`, definitionId: 'group', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    zoneId: record.zones[0].id, startMs, translationX: 0, translationY: 0,
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: layer.id }],
    instanceBindings: { slot: record.composition.patternInstances[0].id },
    holds: index === 0 ? [{ id: 'hold', localTimeMs: 100, durationMs: 100 }] : [],
  }))
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(result.status).toBe('opened')
  if (result.status !== 'opened') throw new Error(JSON.stringify(result.issues))
  return result.record
}

const code = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level,elapsed/2000,0)}'

function prepare(source: ShowRecordV2) {
  const record = reopen(source)
  return prepareShowV2ForCompile(record, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, code])),
  }, { libraries: LIBRARIES })
}

function delivered(source: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const prepared = prepare(source)
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const exported = buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'group-delete', stampedAt: '2026-09-16T00:00:00Z' })
  const reopened = parseEpe(exported.text)
  expect(reopened.stamp?.kind).toBe('show')
  return { artifact, replay: createFastReplayRuntime({ ...artifact, code: reopened.src, dimension: 2 }, { fidelity, randomSeed: 1038,
    mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }],
  }) }
}

function emptyAffected(result: ShowGroupEditResultV2) {
  for (const [key, value] of Object.entries(result)) if (key.startsWith('affected') || ['removedIds', 'hoistedInstanceIds', 'discardedControlTargets'].includes(key)) expect(value).toEqual([])
}

function localAnimation(record: ShowRecordV2) {
  record.composition.groupDefinitions[0].propertyTracks = [{
    id: 'level', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 200,
    keyframes: [{ id: 'level-start', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level-end', timeMs: 200, value: .8, easing: { curve: 'linear' } }],
  }]
}

it('deletes only the exact held occurrence shell and retains every authored definition/runtime owner', () => {
  const record = fixture()
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(record).toEqual(before)
  expect(result.record.composition.groupOccurrences).toEqual([before.composition.groupOccurrences[1]])
  const expected = structuredClone(before)
  expected.composition.groupOccurrences = [expected.composition.groupOccurrences[1]]
  expect(reopen(result.record)).toEqual(expected)
  expect(result.affectedGroupOccurrenceIds).toEqual(['use-0'])
  expect(result.removedIds).toEqual(['use-0'])
  for (const [key, ids] of Object.entries(result)) if (key.startsWith('affected') && key !== 'affectedGroupOccurrenceIds') expect(ids).toEqual([])
  expect(result.hoistedInstanceIds).toEqual([])
  expect(result.discardedControlTargets).toEqual([])
  expect(materializeShowGroupsV2(result.record).composition.clips.map(clip => clip.id)).not.toContain('use-0:child')
  result.record.composition.groupDefinitions[0].name = 'Edited later'
  result.record.composition.patternInstances[0].controlTargets!.sliderLevel = .9
  expect(record).toEqual(before)
})

it.each([
  { kind: 'delete-occurrence', occurrenceId: 'use-0', destination: 'guess' },
  { kind: 'ungroup-occurrence', occurrenceId: 'use-0' },
  { kind: 'delete-occurrence', occurrenceId: '' },
  { kind: 'delete-occurrence', occurrenceId: 0 },
  { kind: 'delete-occurrence' },
  null,
])('refuses malformed deletion intent %j without exposing a partial edit', intent => {
  const record = fixture()
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, intent as DeleteShowGroupOccurrenceIntentV2)
  expect(result.status).toBe('refused')
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it('refuses a missing or already deleted occurrence rather than deleting a neighbor', () => {
  const record = fixture()
  for (const occurrenceId of ['use', 'missing']) {
    const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId })
    expect(result).toMatchObject({ status: 'refused', code: 'missing-occurrence' })
    expect(result.record).toBe(record)
    emptyAffected(result)
  }
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  const repeated = deleteShowGroupOccurrenceV2(result.record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(repeated.status).toBe('refused')
  expect(repeated.record).toBe(result.record)
  emptyAffected(repeated)
})

it.each(['unknown local binding', 'invalid hold', 'effective overlap'])('refuses invalid preimage %s without normalizing or collecting its owners', fault => {
  const record = fixture()
  if (fault === 'unknown local binding') record.composition.groupOccurrences[0].instanceBindings = { missingSlot: record.composition.patternInstances[0].id }
  if (fault === 'invalid hold') record.composition.groupOccurrences[0].holds[0].durationMs = 0
  if (fault === 'effective overlap') { localAnimation(record); record.composition.groupOccurrences[1].startMs = 200 }
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result).toMatchObject({ status: 'refused', code: 'invalid-record' })
  expect(result.record).toBe(record)
  expect(record).toEqual(before)
  emptyAffected(result)
})

it('preserves definition-authoritative explicit runtime bindings without manufacturing top-level authority', () => {
  const record = fixture()
  for (const occurrence of record.composition.groupOccurrences) occurrence.instanceBindings = { slot: 'definition-runtime' }
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(result.record.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(result.record.composition.groupOccurrences[0].instanceBindings).toEqual({ slot: 'definition-runtime' })
  expect(materializeShowGroupsV2(reopen(result.record)).composition.clips.find(clip => clip.id === 'use-1:child')!.instanceId).toBe('definition-runtime')
  expect(prepare(result.record).status).toBe('ready')
  expect(record).toEqual(before)
})

it('selects one exact occurrence ID without removing another ID with the same prefix', () => {
  const record = fixture()
  record.composition.groupOccurrences[1].id = 'use-0:later'
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(reopen(result.record).composition.groupOccurrences).toEqual([before.composition.groupOccurrences[1]])
  expect(result.removedIds).toEqual(['use-0'])
  expect(record).toEqual(before)
})

it('deletes an admitted nonempty whitespace occurrence identity exactly rather than normalizing it', () => {
  const record = fixture()
  record.composition.groupOccurrences[0].id = ' '
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: ' ' })
  expect(result.status).toBe('changed')
  expect(result.removedIds).toEqual([' '])
  expect(reopen(result.record).composition.groupOccurrences).toEqual([before.composition.groupOccurrences[1]])
  expect(record).toEqual(before)
})

it.each(['fast', 'fidelity'] as const)('removes shared runtime animation/Restart contribution and matches an independently authored surviving schedule in %s', fidelity => {
  const record = fixture()
  localAnimation(record)
  const old = delivered(record, fidelity)
  const expected = fixture()
  localAnimation(expected)
  expected.composition.groupOccurrences = [expected.composition.groupOccurrences[1]]
  const oracle = delivered(expected, fidelity)
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(record).toEqual(before)
  const restarts = deriveShowRestartEventsV2(result.record)
  expect(restarts.status).toBe('derived')
  expect(restarts.events.map(event => event.atMs)).toEqual([800])
  const actual = delivered(result.record, fidelity)
  expect(actual.artifact.summary.clips).toEqual(oracle.artifact.summary.clips)
  for (const atMs of [0, 100, 250, 450, 550, 801, 901, 1200, 2001]) {
    const a = actual.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = oracle.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(a.frame).toEqual(b.frame)
    expect(a.exports).toEqual(b.exports)
  }
  const oldAt550 = old.replay.advanceTo(550, { stepMs: 1, forceFullIntermediateRender: true })
  const actualAt550 = delivered(result.record, fidelity).replay.advanceTo(550, { stepMs: 1, forceFullIntermediateRender: true })
  expect(oldAt550.exports).not.toEqual(actualAt550.exports)
})

it.each(['fast', 'fidelity'] as const)('preserves independent surviving runtime output exactly in %s', fidelity => {
  const record = fixture()
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'independent' })
  record.composition.groupOccurrences[0].instanceBindings = { slot: 'independent' }
  const old = delivered(record, fidelity)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(result.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  const actual = delivered(result.record, fidelity)
  for (const atMs of [100, 550, 801, 901, 1200, 2001]) {
    expect(actual.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }).frame)
      .toEqual(old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }).frame)
  }
})

it('deletes final effective content into a validated reopenable empty Show without collecting dormant slots or creating a placeholder', () => {
  const record = fixture()
  record.composition.clips = []
  record.composition.groupOccurrences = [record.composition.groupOccurrences[0]]
  localAnimation(record)
  record.composition.propertyTracks = [{ ...structuredClone(record.composition.groupDefinitions[0].propertyTracks[0]),
    id: 'authored-unused', target: { kind: 'instance-time-scale', instanceId: record.composition.patternInstances[0].id },
    activeStartMs: 1200, activeDurationMs: 200,
    keyframes: [{ id: 'unused-start', timeMs: 1200, value: 1, easing: { curve: 'linear' } }, { id: 'unused-end', timeMs: 1400, value: 1, easing: { curve: 'linear' } }],
  }]
  expect(prepare(record).status).toBe('ready')
  const before = structuredClone(record)
  const result = deleteShowGroupOccurrenceV2(record, { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(record).toEqual(before)
  const empty = reopen(result.record)
  expect(validateShowRecordV2(empty)).toEqual([])
  expect(materializeShowGroupsV2(empty).composition.clips).toEqual([])
  expect(empty.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
  expect(empty.composition.patternInstances).toEqual(before.composition.patternInstances)
  expect(empty.composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(empty.composition.showEndMs).toBe(2000)
  expect(empty.composition.layoutOccurrences).toEqual(before.composition.layoutOccurrences)
  const expectedEmpty = structuredClone(before)
  expectedEmpty.composition.groupOccurrences = []
  expect(empty).toEqual(expectedEmpty)
  expect(isValidatedEmptyShowV2(empty)).toBe(true)
  expect(isValidatedEmptyShowV2(record)).toBe(false)
  // Preview/export availability is the explicit route capability boundary,
  // not a required compiler refusal. The pure record stays valid and empty.
  // Definition reuse is ordinary authoring, not a hidden deletion cascade.
  empty.composition.groupOccurrences.push(structuredClone(before.composition.groupOccurrences[0]))
  expect(prepare(reopen(empty)).status).toBe('ready')
  expect(isValidatedEmptyShowV2(empty)).toBe(false)
})

it('linked duplicate then delete leaves original runtime identities and complete held choreography', () => {
  const record = fixture()
  const source = record.composition.groupOccurrences[0]
  const duplicated = duplicateShowGroupOccurrenceV2(record, { kind: 'duplicate-occurrence', occurrenceId: source.id,
    newOccurrenceId: 'copy', startMs: 1200, layoutOccurrenceId: source.layoutOccurrenceId, zoneId: source.zoneId,
    layerBindings: structuredClone(source.layerBindings), translationX: source.translationX, translationY: source.translationY,
  })
  expect(duplicated.status).toBe('changed')
  const deleted = deleteShowGroupOccurrenceV2(reopen(duplicated.record), { kind: 'delete-occurrence', occurrenceId: 'copy' })
  expect(deleted.status).toBe('changed')
  expect(reopen(deleted.record)).toEqual(record)
})

it('Make Unique then delete retains its unused definition and hoisted same-ID authority', () => {
  const record = fixture()
  for (const occurrence of record.composition.groupOccurrences) delete occurrence.instanceBindings
  const definition = record.composition.groupDefinitions[0]
  const identities: ShowGroupUniqueIdentityPlanV2 = {
    definitionId: 'unique', patternInstanceIds: { slot: 'unique-slot' }, layerIds: { 'local-layer': 'unique-layer' },
    clipIds: { child: 'unique-child' }, transitionIds: {}, propertyTrackIds: {},
    appearanceKeyIdsByClipId: { child: { 'child-appearance': 'unique-appearance' } }, propertyKeyIdsByTrackId: {},
  }
  const unique = makeShowGroupUniqueV2(record, { kind: 'make-unique', occurrenceId: 'use-0', identities })
  expect(unique.status).toBe('changed')
  expect(unique.record.composition.groupDefinitions[0]).toEqual(definition)
  const result = deleteShowGroupOccurrenceV2(reopen(unique.record), { kind: 'delete-occurrence', occurrenceId: 'use-0' })
  expect(result.status).toBe('changed')
  expect(result.record.composition.groupDefinitions).toEqual(unique.record.composition.groupDefinitions)
  expect(result.record.composition.patternInstances).toEqual(unique.record.composition.patternInstances)
  expect(result.removedIds).toEqual(['use-0'])
  expect(prepare(reopen(result.record)).status).toBe('ready')
})
