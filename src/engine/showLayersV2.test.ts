import { describe, expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { LIBRARIES } from '../pixelblaze/libs'
import { createFastReplayRuntime } from './fastReplay'
import { compileShow } from './showCompiler'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowLayerV2, type ShowLayerReassignmentV2 } from './showLayersV2'

const RED = 'export function render2D(index, x, y) { rgb(1, 0, 0) }'
const BLUE = 'export function render2D(index, x, y) { rgb(0, 0, 1) }'

function baseRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

function transitionRecord(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

function addGroup(record: ShowRecordV2, destinationLayerId: string): void {
  const template = record.composition.clips[0]
  const { zoneId: _zoneId, ...groupTemplate } = template
  const definitionInstance = { ...structuredClone(record.composition.patternInstances[0]), id: 'group-instance' }
  record.composition.groupDefinitions.push({
    id: 'group-definition',
    name: 'Group',
    patternInstances: [definitionInstance],
    layers: [{ id: 'group-layer', name: 'Group Layer', rank: 0 }],
    clips: [{
      ...structuredClone(groupTemplate),
      id: 'group-child',
      instanceId: definitionInstance.id,
      layerId: 'group-layer',
      startMs: 0,
      durationMs: 300,
      appearance: {
        keys: [{
          ...structuredClone(template.appearance.keys[0]),
          id: 'group-child:appearance:1',
          timeMs: 0,
        }],
      },
    }],
    transitions: [],
    propertyTracks: [],
  })
  record.composition.groupOccurrences.push({
    id: 'group-use',
    definitionId: 'group-definition',
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    zoneId: record.zones[0].id,
    startMs: 100,
    translationX: 0,
    translationY: 0,
    layerBindings: [{ definitionLayerId: 'group-layer', layerId: destinationLayerId }],
    holds: [],
  })
  expect(validateShowRecordV2(record)).toEqual([])
}

function heldGroupRecord(targetClipStartMs: number): {
  record: ShowRecordV2
  sourceLayerId: string
  targetLayerId: string
  runtimeId: string
} {
  const record = baseRecord()
  addSourceLayer(record, 'held-source-layer')
  const targetLayerId = record.composition.layers.find(layer => layer.rank === 1)!.id
  const template = record.composition.clips[0]
  const { zoneId: _zoneId, ...groupTemplate } = template
  const definitionInstance = { ...structuredClone(record.composition.patternInstances[0]), id: 'held-instance' }
  record.composition.groupDefinitions.push({
    id: 'held-definition',
    name: 'Held Group',
    patternInstances: [definitionInstance],
    layers: [{ id: 'group-layer', name: 'Group Layer', rank: 0 }],
    clips: [{
      ...structuredClone(groupTemplate),
      id: 'child-clip',
      instanceId: definitionInstance.id,
      layerId: 'group-layer',
      startMs: 0,
      durationMs: 200,
      appearance: {
        keys: [{
          ...structuredClone(template.appearance.keys[0]),
          id: 'child-clip:appearance:1',
          timeMs: 0,
        }],
      },
    }],
    transitions: [],
    propertyTracks: [],
  })
  record.composition.groupOccurrences.push({
    id: 'held-use',
    definitionId: 'held-definition',
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    zoneId: record.zones[0].id,
    startMs: 200,
    translationX: 0,
    translationY: 0,
    layerBindings: [{ definitionLayerId: 'group-layer', layerId: 'held-source-layer' }],
    holds: [{ id: 'pause', localTimeMs: 100, durationMs: 100 }],
  })
  record.composition.clips.push({
    ...structuredClone(template),
    id: 'target-clip',
    layerId: targetLayerId,
    startMs: targetClipStartMs,
    durationMs: 100,
    appearance: {
      keys: [{
        ...structuredClone(template.appearance.keys[0]),
        id: 'target-clip:appearance:1',
        timeMs: targetClipStartMs,
      }],
    },
  })
  expect(validateShowRecordV2(record)).toEqual([])
  return {
    record,
    sourceLayerId: 'held-source-layer',
    targetLayerId,
    runtimeId: 'group:["held-definition","held-instance"]',
  }
}

function addSourceLayer(record: ShowRecordV2, id = 'layer-source'): void {
  record.composition.layers.push({
    id,
    zoneId: record.zones[0].id,
    name: 'Source',
    rank: Math.max(...record.composition.layers.map(layer => layer.rank)) + 1,
  })
}

function expectEmptyAffected(result: ReturnType<typeof editShowLayerV2>): void {
  expect(result).toMatchObject({
    affectedClipIds: [],
    affectedInstanceIds: [],
    affectedTransitionIds: [],
    affectedTrackIds: [],
    affectedLayoutDefinitionIds: [],
    affectedLayoutOccurrenceIds: [],
    affectedGroupDefinitionIds: [],
    affectedGroupOccurrenceIds: [],
    affectedLayerIds: [],
    affectedMarkerIds: [],
    removedIds: [],
    discardedControlTargets: [],
  })
}

describe('v2 Layer ownership (#1038)', () => {
  it('adds an empty named Layer, renames and reorders the complete Zone stack, then removes it immutably', () => {
    const source = baseRecord()
    const before = structuredClone(source)
    const zoneId = source.zones[0].id
    const added = editShowLayerV2(source, {
      kind: 'add',
      layer: { id: 'lighting', zoneId, name: 'Lighting', rank: 2 },
    })
    expect(added).toMatchObject({ status: 'changed', affectedLayerIds: ['lighting'] })
    if (added.status !== 'changed') return
    expect(source).toEqual(before)
    expect(added.record).not.toBe(source)
    expect(added.record.composition).not.toBe(source.composition)

    const renamed = editShowLayerV2(added.record, {
      kind: 'rename', zoneId, layerId: 'lighting', name: 'Key light',
    })
    expect(renamed).toMatchObject({ status: 'changed', affectedLayerIds: ['lighting'] })
    if (renamed.status !== 'changed') return

    const originalOrder = [...renamed.record.composition.layers]
      .filter(layer => layer.zoneId === zoneId)
      .sort((a, b) => a.rank - b.rank)
      .map(layer => layer.id)
    const reorderedIds = [originalOrder[2], originalOrder[0], originalOrder[1]]
    const reordered = editShowLayerV2(renamed.record, {
      kind: 'reorder', zoneId, layerIds: reorderedIds,
    })
    expect(reordered).toMatchObject({ status: 'changed', affectedLayerIds: reorderedIds.slice().sort() })
    if (reordered.status !== 'changed') return
    expect(reordered.record.composition.layers
      .filter(layer => layer.zoneId === zoneId)
      .sort((a, b) => a.rank - b.rank)
      .map(layer => ({ id: layer.id, rank: layer.rank })))
      .toEqual(reorderedIds.map((id, rank) => ({ id, rank })))
    expect(reordered.record.composition.clips).toEqual(source.composition.clips)
    expect(reordered.record.composition.patternInstances).toEqual(source.composition.patternInstances)

    const removed = editShowLayerV2(reordered.record, {
      kind: 'remove', zoneId, layerId: 'lighting', reassignments: [],
    })
    expect(removed).toMatchObject({
      status: 'changed', affectedLayerIds: ['lighting'], removedIds: ['lighting'],
    })
    if (removed.status !== 'changed') return
    expect(validateShowRecordV2(reopen(removed.record))).toEqual([])
    expect(removed.record.composition.clips).toEqual(source.composition.clips)
    expect(removed.record.composition.patternInstances).toEqual(source.composition.patternInstances)
  })

  it('refuses a referenced Group Layer without a complete plan, then rebinds and removes it without changing definition/runtime identity', () => {
    const initial = baseRecord()
    const zoneId = initial.zones[0].id
    const added = editShowLayerV2(initial, {
      kind: 'add', layer: { id: 'layer-source', zoneId, name: 'Group wash', rank: 2 },
    })
    expect(added.status).toBe('changed')
    if (added.status !== 'changed') return
    const priorOrder = added.record.composition.layers
      .filter(layer => layer.zoneId === zoneId)
      .sort((a, b) => a.rank - b.rank)
      .map(layer => layer.id)
    const reordered = editShowLayerV2(added.record, {
      kind: 'reorder', zoneId, layerIds: ['layer-source', ...priorOrder.filter(id => id !== 'layer-source')],
    })
    expect(reordered.status).toBe('changed')
    if (reordered.status !== 'changed') return
    const source = reordered.record
    addGroup(source, 'layer-source')
    const targetLayerId = source.composition.layers.find(layer => (
      layer.id !== 'layer-source' && !source.composition.clips.some(clip => clip.layerId === layer.id)
    ))!.id
    const template = source.composition.clips[0]
    source.composition.clips.push({
      ...structuredClone(template), id: 'adjacent-target', layerId: targetLayerId, durationMs: 100,
      appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), id: 'adjacent-target:appearance:1' }] },
    })
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)

    const refused = editShowLayerV2(source, {
      kind: 'remove', zoneId, layerId: 'layer-source', reassignments: [],
    })
    expect(refused).toMatchObject({ status: 'refused', code: 'incomplete-reassignment' })
    expectEmptyAffected(refused)
    expect(refused.record).toBe(source)
    expect(source).toEqual(before)

    const changed = editShowLayerV2(source, {
      kind: 'remove', zoneId, layerId: 'layer-source',
      reassignments: [{
        kind: 'group-layer-binding',
        groupOccurrenceId: 'group-use',
        definitionLayerId: 'group-layer',
        layerId: targetLayerId,
      }],
    })
    expect(changed).toMatchObject({
      status: 'changed',
      affectedGroupOccurrenceIds: ['group-use'],
      affectedLayerIds: [targetLayerId, 'layer-source'].sort(),
      removedIds: ['layer-source'],
    })
    if (changed.status !== 'changed') return
    expect(changed.record.composition.groupOccurrences[0].layerBindings[0].layerId).toBe(targetLayerId)
    expect(changed.record.composition.groupDefinitions).toEqual(before.composition.groupDefinitions)
    expect(changed.record.composition.patternInstances).toEqual(before.composition.patternInstances)
    expect(materializeShowGroupsV2(changed.record).composition.clips
      .find(clip => clip.id === 'group-use:group-child')).toMatchObject({ layerId: targetLayerId, instanceId: 'group:["group-definition","group-instance"]' })
    expect(validateShowRecordV2(reopen(changed.record))).toEqual([])
    expect(source).toEqual(before)
  })

  it('refuses complete ordinary and Group reassignment when effective occupants would collide', () => {
    const source = baseRecord()
    addSourceLayer(source)
    addGroup(source, 'layer-source')
    const targetLayerId = source.composition.layers.find(layer => layer.rank === 1)!.id
    const template = source.composition.clips[0]
    source.composition.clips.push({
      ...structuredClone(template),
      id: 'ordinary-target',
      layerId: targetLayerId,
      startMs: 100,
      durationMs: 300,
      appearance: { keys: [{ ...structuredClone(template.appearance.keys[0]), id: 'ordinary-target:appearance:1', timeMs: 100 }] },
    })
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)

    const result = editShowLayerV2(source, {
      kind: 'remove', zoneId: source.zones[0].id, layerId: 'layer-source',
      reassignments: [{
        kind: 'group-layer-binding', groupOccurrenceId: 'group-use', definitionLayerId: 'group-layer', layerId: targetLayerId,
      }],
    })
    expect(result).toMatchObject({ status: 'refused', code: 'invalid-result' })
    expectEmptyAffected(result)
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('uses the complete held Group interval for collision and half-open adjacency during reassignment', () => {
    const overlap = heldGroupRecord(499)
    const overlapBefore = structuredClone(overlap.record)
    const overlapChild = materializeShowGroupsV2(overlap.record).composition.clips
      .find(clip => clip.id === 'held-use:child-clip')!
    expect(overlapChild).toMatchObject({
      startMs: 200,
      durationMs: 300,
      layerId: overlap.sourceLayerId,
      instanceId: overlap.runtimeId,
    })
    expect(overlapChild.startMs + overlapChild.durationMs).toBe(500)

    const refused = editShowLayerV2(overlap.record, {
      kind: 'remove',
      zoneId: overlap.record.zones[0].id,
      layerId: overlap.sourceLayerId,
      reassignments: [{
        kind: 'group-layer-binding',
        groupOccurrenceId: 'held-use',
        definitionLayerId: 'group-layer',
        layerId: overlap.targetLayerId,
      }],
    })
    expect(refused).toMatchObject({ status: 'refused', code: 'invalid-result' })
    expectEmptyAffected(refused)
    expect(refused.record).toBe(overlap.record)
    expect(overlap.record).toEqual(overlapBefore)

    const adjacent = heldGroupRecord(500)
    const adjacentBefore = structuredClone(adjacent.record)
    const changed = editShowLayerV2(adjacent.record, {
      kind: 'remove',
      zoneId: adjacent.record.zones[0].id,
      layerId: adjacent.sourceLayerId,
      reassignments: [{
        kind: 'group-layer-binding',
        groupOccurrenceId: 'held-use',
        definitionLayerId: 'group-layer',
        layerId: adjacent.targetLayerId,
      }],
    })
    expect(changed).toMatchObject({
      status: 'changed',
      affectedGroupOccurrenceIds: ['held-use'],
      affectedLayerIds: [adjacent.sourceLayerId, adjacent.targetLayerId].sort(),
      removedIds: [adjacent.sourceLayerId],
    })
    if (changed.status !== 'changed') return
    const changedChild = materializeShowGroupsV2(changed.record).composition.clips
      .find(clip => clip.id === 'held-use:child-clip')!
    expect(changedChild).toMatchObject({
      startMs: 200,
      durationMs: 300,
      layerId: adjacent.targetLayerId,
      instanceId: adjacent.runtimeId,
    })
    expect(changedChild.startMs + changedChild.durationMs).toBe(500)
    expect(changed.record.composition.groupDefinitions).toEqual(adjacentBefore.composition.groupDefinitions)
    expect(changed.record.composition.groupOccurrences[0].holds).toEqual([{ id: 'pause', localTimeMs: 100, durationMs: 100 }])
    expect(validateShowRecordV2(reopen(changed.record))).toEqual([])
    expect(adjacent.record).toEqual(adjacentBefore)
  })

  it('requires and preserves every connected Transition participant while reassigning endpoint Clips', () => {
    const source = transitionRecord()
    const zoneId = source.zones[0].id
    const sourceLayerId = source.composition.clips[0].layerId
    const targetLayerId = source.composition.layers.find(layer => layer.id !== sourceLayerId)!.id
    addSourceLayer(source, 'alternate-layer')
    const participant = source.composition.transitions[0].participants[0]
    const clipEntries: ShowLayerReassignmentV2[] = source.composition.clips.map(clip => ({
      kind: 'clip', clipId: clip.id, layerId: targetLayerId,
    }))
    const before = structuredClone(source)

    const partial = editShowLayerV2(source, {
      kind: 'remove', zoneId, layerId: sourceLayerId, reassignments: clipEntries,
    })
    expect(partial).toMatchObject({ status: 'refused', code: 'incomplete-reassignment' })
    expectEmptyAffected(partial)

    const incompatible = editShowLayerV2(source, {
      kind: 'remove', zoneId, layerId: sourceLayerId,
      reassignments: [
        clipEntries[0],
        { ...clipEntries[1], layerId: 'alternate-layer' },
        {
          kind: 'transition-participant', transitionId: source.composition.transitions[0].id,
          participantId: participant.id, layerId: targetLayerId,
        },
      ],
    })
    expect(incompatible).toMatchObject({ status: 'refused', code: 'invalid-result' })
    expectEmptyAffected(incompatible)
    expect(incompatible.record).toBe(source)

    const changed = editShowLayerV2(source, {
      kind: 'remove', zoneId, layerId: sourceLayerId,
      reassignments: [...clipEntries, {
        kind: 'transition-participant',
        transitionId: source.composition.transitions[0].id,
        participantId: participant.id,
        layerId: targetLayerId,
      }],
    })
    expect(changed).toMatchObject({
      status: 'changed',
      affectedClipIds: source.composition.clips.map(clip => clip.id).sort(),
      affectedTransitionIds: [source.composition.transitions[0].id],
      removedIds: [sourceLayerId],
    })
    if (changed.status !== 'changed') return
    expect(changed.record.composition.transitions[0]).toEqual({
      ...before.composition.transitions[0],
      participants: [{ ...participant, layerId: targetLayerId }],
    })
    expect(changed.record.composition.clips.every(clip => clip.layerId === targetLayerId)).toBe(true)
    expect(validateShowRecordV2(reopen(changed.record))).toEqual([])
    expect(source).toEqual(before)
  })

  it('refuses foreign-Zone, duplicate, extraneous, and incompatible reassignment entries atomically', () => {
    const source = baseRecord()
    addSourceLayer(source)
    const sourceLayer = source.composition.layers[source.composition.layers.length - 1]
    const clip = source.composition.clips[0]
    clip.layerId = sourceLayer.id
    source.zones.push({ id: 'other-zone', name: 'Other', nominalPixelCount: 8 })
    source.zoneLayouts[0].logical = { kind: 'split', zoneIds: [source.zones[0].id, 'other-zone'], axis: 'x' }
    source.composition.layers.push({ id: 'other-layer', zoneId: 'other-zone', name: 'Other', rank: 0 })
    expect(validateShowRecordV2(source)).toEqual([])
    const before = structuredClone(source)
    const targetLayerId = source.composition.layers.find(layer => layer.zoneId === sourceLayer.zoneId && layer.id !== sourceLayer.id)!.id
    const valid: ShowLayerReassignmentV2 = { kind: 'clip', clipId: clip.id, layerId: targetLayerId }
    const cases: Array<readonly ShowLayerReassignmentV2[]> = [
      [{ ...valid, layerId: 'other-layer' }],
      [valid, valid],
      [valid, { kind: 'clip', clipId: 'absent', layerId: targetLayerId }],
      [{ kind: 'transition-participant', transitionId: 'absent', participantId: 'absent', layerId: targetLayerId }],
    ]
    for (const reassignments of cases) {
      const result = editShowLayerV2(source, {
        kind: 'remove', zoneId: sourceLayer.zoneId, layerId: sourceLayer.id, reassignments,
      })
      expect(result.status).toBe('refused')
      expectEmptyAffected(result)
      expect(result.record).toBe(source)
      expect(source).toEqual(before)
    }
  })

  it('refuses malformed add, rename, reorder, and missing targets before cloning', () => {
    const source = baseRecord()
    const zoneId = source.zones[0].id
    const orderedIds = source.composition.layers
      .filter(layer => layer.zoneId === zoneId)
      .sort((a, b) => a.rank - b.rank)
      .map(layer => layer.id)
    const intents = [
      { kind: 'add', layer: { id: '', zoneId, name: 'Blank id', rank: 2 } },
      { kind: 'add', layer: { id: 'bad-rank', zoneId, name: 'Bad', rank: -1 } },
      { kind: 'add', layer: { id: 'blank-name', zoneId, name: '   ', rank: 2 } },
      { kind: 'add', layer: { id: 'missing-zone', zoneId: 'absent', name: 'Missing', rank: 0 } },
      { kind: 'add', layer: { id: orderedIds[0], zoneId, name: 'Duplicate', rank: 99 } },
      { kind: 'add', layer: { id: 'duplicate-rank', zoneId, name: 'Duplicate rank', rank: source.composition.layers[0].rank } },
      { kind: 'rename', zoneId, layerId: orderedIds[0], name: '' },
      { kind: 'rename', zoneId: 'absent', layerId: orderedIds[0], name: 'Wrong Zone' },
      { kind: 'reorder', zoneId, layerIds: orderedIds.slice(1) },
      { kind: 'reorder', zoneId, layerIds: [orderedIds[0], orderedIds[0]] },
      { kind: 'reorder', zoneId, layerIds: [...orderedIds, 'absent'] },
      { kind: 'remove', zoneId, layerId: 'absent', reassignments: [] },
    ] as const
    const before = structuredClone(source)
    for (const intent of intents) {
      const result = editShowLayerV2(source, intent)
      expect(result.status).toBe('refused')
      expectEmptyAffected(result)
      expect(result.record).toBe(source)
      expect(source).toEqual(before)
    }
  })

  it('returns the original identity and empty affected collections for semantic no-ops', () => {
    const source = baseRecord()
    const zoneId = source.zones[0].id
    const ordered = source.composition.layers
      .filter(layer => layer.zoneId === zoneId)
      .sort((a, b) => a.rank - b.rank)
    ordered.forEach((layer, index) => { layer.rank = index * 2 })
    expect(validateShowRecordV2(source)).toEqual([])
    const results = [
      editShowLayerV2(source, { kind: 'rename', zoneId, layerId: ordered[0].id, name: ordered[0].name }),
      editShowLayerV2(source, { kind: 'reorder', zoneId, layerIds: ordered.map(layer => layer.id) }),
    ]
    for (const result of results) {
      expect(result.status).toBe('unchanged')
      expect(result.record).toBe(source)
      expectEmptyAffected(result)
    }

    const invalid = structuredClone(source)
    invalid.composition.layers[1].rank = invalid.composition.layers[0].rank
    const refused = editShowLayerV2(invalid, {
      kind: 'rename', zoneId, layerId: ordered[0].id, name: 'New name',
    })
    expect(refused).toMatchObject({ status: 'refused', code: 'invalid-record' })
    expect(refused.record).toBe(invalid)
    expectEmptyAffected(refused)
  })

  it('allows removal of the last empty Layer when the complete record validator accepts it', () => {
    const source = baseRecord()
    source.composition.clips = []
    source.composition.transitions = []
    source.composition.layers = [source.composition.layers.find(layer => layer.rank === 0)!]
    expect(validateShowRecordV2(source)).toEqual([])
    const layer = source.composition.layers[0]
    const changed = editShowLayerV2(source, {
      kind: 'remove', zoneId: layer.zoneId, layerId: layer.id, reassignments: [],
    })
    expect(changed).toMatchObject({ status: 'changed', removedIds: [layer.id] })
    if (changed.status !== 'changed') return
    expect(changed.record.composition.layers).toEqual([])
    expect(validateShowRecordV2(reopen(changed.record))).toEqual([])
  })

  it.each(['fast', 'fidelity'] as const)('changes only compiled stacking when the complete Layer order changes in %s replay', (fidelity) => {
    const source = baseRecord()
    const zoneId = source.zones[0].id
    const bottom = source.composition.layers.find(layer => layer.rank === 0)!
    const top = source.composition.layers.find(layer => layer.rank === 1)!
    source.composition.patternInstances[0].id = 'red-instance'
    source.composition.clips[0].instanceId = 'red-instance'
    source.composition.patternInstances.push({
      ...structuredClone(source.composition.patternInstances[0]), id: 'blue-instance', patternName: 'Blue',
    })
    source.composition.clips.push({
      ...structuredClone(source.composition.clips[0]),
      id: 'blue-clip',
      instanceId: 'blue-instance',
      layerId: top.id,
      appearance: { keys: [{ ...structuredClone(source.composition.clips[0].appearance.keys[0]), id: 'blue-clip:appearance:1' }] },
    })
    expect(validateShowRecordV2(source)).toEqual([])
    const moved = editShowLayerV2(source, {
      kind: 'reorder', zoneId, layerIds: [top.id, bottom.id],
    })
    expect(moved.status).toBe('changed')
    if (moved.status !== 'changed') return

    const frame = (record: ShowRecordV2) => {
      const prepared = prepareShowV2ForCompile(reopen(record), {
        byCellId: {},
        byPatternInstanceId: { 'red-instance': RED, 'blue-instance': BLUE },
        stageDimension: 2,
      })
      if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
      const artifact = compileShow(prepared.recipe, LIBRARIES)
      const runtime = createFastReplayRuntime({
        code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: 2,
      }, {
        randomSeed: 1038,
        fidelity,
        mapPoints: [{ sample: [0.5, 0.5], pos: [0.5, 0.5] }],
      })
      return Array.from(runtime.advanceTo(250, { stepMs: 10, forceFullIntermediateRender: true }).frame.slice(0, 3))
    }
    expect(frame(source)).toEqual([0, 0, 1])
    expect(frame(moved.record)).toEqual([1, 0, 0])
    expect(moved.record.composition.clips).toEqual(source.composition.clips)
    expect(moved.record.composition.patternInstances).toEqual(source.composition.patternInstances)
  })
})
