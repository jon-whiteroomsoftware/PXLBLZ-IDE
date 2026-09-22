import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { hasSectionScopedTrackActivationV2, participantWindowBlockedV2, promoteConvertedBoundariesToWholeOutputV2, scalarRampScopeBlockedV2 } from './showBoundaryScopeV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { validateShowRecordV2, type ShowRecordV2, type ShowPropertyTrackV2 } from './showCompositionV2'
import { addShowZone, createDefaultShow } from './showModel'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { createShowGroupFromSelectionV2 } from './showGroupCreationV2'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'

function buildTwoSceneV1(withTrack: boolean) {
  const show = transitionV1Show('crossfade')
  const composition = show.composition!
  const [out, incoming] = composition.scenes[0].zones[0].main
  out.durationMs = 30000
  const inn = { ...incoming, startMs: 0, durationMs: 2000 }
  show.scenes = [
    { id: 'scene-a', name: 'Scene 1', durationMs: 30000 },
    { id: 'scene-b', name: 'Scene 2', durationMs: 2000 },
  ]
  composition.scenes = [
    { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [out], overlays: [] }] },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [inn], overlays: [] }] },
  ]
  const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
  show.transitions = [{ ...settings, durationMs: 2000, afterSceneId: 'scene-a' }]
  delete composition.transitions
  composition.durationMs = 34000
  if (withTrack) {
    composition.scenes[0].propertyTracks = [{
      id: 'brightness-1',
      target: { kind: 'placement-view', placementId: 'out', property: 'brightness' },
      keyframes: [
        { id: 'k0', timeMs: 0, value: 1, easing: { curve: 'linear' } },
        { id: 'k1', timeMs: 30000, value: 0.5, easing: { curve: 'linear' } },
      ],
    }]
  }
  return show
}

function converted(withTrack: boolean): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(buildTwoSceneV1(withTrack))
  if (result.status !== 'converted') throw new Error(`Fixture conversion refused: ${JSON.stringify(result.status === 'refused' ? result.issues : [])}`)
  return result.record
}

const boundaryLookup = { byCellId: {}, byPatternInstanceId: {
  'out-instance': 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(1,x,y) }',
  'in-instance': 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(x,y,1) }',
}, stageDimension: 2 as const }

function sectionTrack(clipId: string, activeStartMs = 0, activeDurationMs = 32000, endKeyTimeMs = 30000): ShowPropertyTrackV2 {
  return {
    id: 'section-track', target: { kind: 'clip-view', clipId, property: 'brightness' },
    activeStartMs, activeDurationMs,
    keyframes: [
      { id: 'section-k0', timeMs: activeStartMs, value: 1, easing: { curve: 'linear' } },
      { id: 'section-k1', timeMs: endKeyTimeMs, value: 0.5, easing: { curve: 'linear' } },
    ],
  }
}

const UNUSED_INSTANCE_ID = 'unused-instance'

function convertedDefaultShow(): ShowRecordV2 {
  const source = createDefaultShow('promotion-filter', 'Promotion filter', 1)
  const converted = convertShowRecordV1ToV2(source, { byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])) })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.status === 'refused' ? converted.issues : []))
  const record = converted.record
  expect(record.composition.clips.map(clip => [clip.startMs, clip.durationMs])).toEqual([[0, 30000], [32000, 30000]])
  expect(record.composition.showEndMs).toBe(62000)
  expect(record.composition.layoutOccurrences).toHaveLength(1)
  expect(record.composition.transitions).toHaveLength(1)
  expect(record.composition.transitions[0].origin).toBe('converted-boundary-transition')
  expect(record.composition.transitions[0].participants).toHaveLength(1)
  expect(record.composition.transitions[0].wholeOutput).toBeUndefined()
  return record
}

function stockLookup(record: ShowRecordV2) {
  return {
    byCellId: {},
    byPatternInstanceId: Object.fromEntries(record.composition.patternInstances.map(instance => [instance.id, DEMOS[resolveStockPatternId((instance.pattern as { id: string }).id)]])),
    stageDimension: 2 as const,
  }
}

function withUnusedInstanceTrack(record: ShowRecordV2, activeStartMs = 31000): ShowRecordV2 {
  const template = record.composition.patternInstances[0]
  record.composition.patternInstances.push({ ...structuredClone(template), id: UNUSED_INSTANCE_ID })
  record.composition.propertyTracks.push({
    id: 'unused-control',
    target: { kind: 'instance-control', instanceId: UNUSED_INSTANCE_ID, exportName: 'sliderLevel' },
    activeStartMs,
    activeDurationMs: 1000,
    keyframes: [
      { id: 'unused-control-k0', timeMs: activeStartMs, value: 0.2, easing: { curve: 'linear' } },
      { id: 'unused-control-k1', timeMs: activeStartMs + 1000, value: 0.8, easing: { curve: 'linear' } },
    ],
  })
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

describe('showBoundaryScopeV2', () => {
  it('reports no section scope without tracks and returns the input untouched', () => {
    const record = converted(false)
    expect(hasSectionScopedTrackActivationV2(record)).toBe(false)
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.record).toBe(record)
    expect(promotion.promotedTransitionIds).toEqual([])
  })

  it('ignores a whole-Show track and returns the input untouched', () => {
    const record = converted(false)
    record.composition.propertyTracks.push({ ...sectionTrack(record.composition.clips[0].id), id: 'whole', activeStartMs: 0, activeDurationMs: record.composition.showEndMs })
    expect(hasSectionScopedTrackActivationV2(record)).toBe(false)
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.record).toBe(record)
    expect(promotion.promotedTransitionIds).toEqual([])
  })

  it('promotes a participant converted boundary without mutating the input', () => {
    const record = converted(false)
    const before = structuredClone(record)
    record.composition.propertyTracks.push(sectionTrack(record.composition.clips[0].id))
    expect(hasSectionScopedTrackActivationV2(record)).toBe(true)
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.record).not.toBe(record)
    expect(promotion.promotedTransitionIds).toEqual(['transition-crossfade'])
    expect(record).toEqual({ ...before, composition: { ...before.composition, propertyTracks: record.composition.propertyTracks } })
    const transition = promotion.record.composition.transitions[0]
    expect(transition.participants).toEqual([])
    expect(transition.wholeOutput).toEqual({ startMs: 30000, fromClipIds: ['out'], toClipIds: ['in'] })
  })

  it('never touches layer transitions, ramped transitions, whole-output transitions, or duration mismatches', () => {
    const record = converted(false)
    record.composition.propertyTracks.push(sectionTrack(record.composition.clips[0].id))
    const [boundary] = record.composition.transitions
    const layer = structuredClone(boundary)
    layer.id = 'layer-transition'
    layer.origin = 'converted-layer-transition'
    const ramped = structuredClone(boundary)
    ramped.id = 'ramped-transition'
    ramped.propertyRamps = [{ target: { kind: 'show-repeat-scale' }, from: 1 }]
    const mismatched = structuredClone(boundary)
    mismatched.id = 'mismatched-transition'
    mismatched.durationMs = 1999
    record.composition.transitions = [layer, ramped, mismatched]
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.record).toBe(record)
    expect(promotion.promotedTransitionIds).toEqual([])
    expect(record.composition.transitions).toEqual([layer, ramped, mismatched])
  })

  it('never demotes an already whole-output boundary', () => {
    const record = converted(true)
    expect(hasSectionScopedTrackActivationV2(record)).toBe(true)
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.record).toBe(record)
    expect(promotion.promotedTransitionIds).toEqual([])
    expect(record.composition.transitions[0].wholeOutput).toBeDefined()
  })

  it('P11 participantWindowBlockedV2 agrees with the lowering refusal', () => {
    const recordA = converted(false)
    const firstClipId = recordA.composition.clips[0].id
    const blocking = structuredClone(recordA)
    blocking.composition.propertyTracks.push({ ...sectionTrack(firstClipId), id: 'blocking-track' })
    expect(participantWindowBlockedV2(blocking)).toBe(true)
    const preparedBlocking = prepareShowV2ForCompile(blocking, boundaryLookup)
    expect(preparedBlocking.status).toBe('refused')
    if (preparedBlocking.status !== 'refused') return
    expect(preparedBlocking.issues[0].code).toBe('unsupported-transition-property-track')
    const avoiding = structuredClone(recordA)
    avoiding.composition.propertyTracks.push({ ...sectionTrack(firstClipId, 0, 15000, 15000), id: 'avoiding-track' })
    expect(participantWindowBlockedV2(avoiding)).toBe(false)
    const preparedAvoiding = prepareShowV2ForCompile(avoiding, boundaryLookup)
    expect(preparedAvoiding.status, JSON.stringify(preparedAvoiding.status === 'refused' ? preparedAvoiding.issues[0] : '')).toBe('ready')
    expect(participantWindowBlockedV2(converted(true))).toBe(false)
    const preparedWholeOutput = prepareShowV2ForCompile(converted(true), boundaryLookup)
    expect(preparedWholeOutput.status, JSON.stringify(preparedWholeOutput.status === 'refused' ? preparedWholeOutput.issues[0] : '')).toBe('ready')
    const transitionFree = structuredClone(recordA)
    transitionFree.composition.transitions = []
    transitionFree.composition.propertyTracks.push({ ...sectionTrack(firstClipId), id: 'blocking-track' })
    expect(participantWindowBlockedV2(transitionFree)).toBe(false)
    const preparedTransitionFree = prepareShowV2ForCompile(transitionFree, boundaryLookup)
    expect(preparedTransitionFree.status, JSON.stringify(preparedTransitionFree.status === 'refused' ? preparedTransitionFree.issues[0] : '')).toBe('ready')
  })

  it('does not promote a boundary a Group child touches (materialized record, #1068)', () => {
    const source = addShowZone(createDefaultShow('grouped-boundary', 'Grouped boundary', 1))
    const byCellId = Object.fromEntries(
      source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]),
    )
    const convertedResult = convertShowRecordV1ToV2(source, { byCellId })
    expect(convertedResult.status).toBe('converted')
    if (convertedResult.status !== 'converted') throw new Error(JSON.stringify(convertedResult.status === 'refused' ? convertedResult.issues : []))
    const record = convertedResult.record
    const zone2 = record.zones[1].id
    const layer2 = record.composition.layers.find(layer => layer.zoneId === zone2)!
    const base = record.composition.clips[0]
    record.composition.clips.push({ ...structuredClone(base), id: 'grouped-edge', zoneId: zone2, layerId: layer2.id, startMs: 25000, durationMs: 5000, appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'grouped-edge-key', timeMs: 25000 }] } })
    const grouped = createShowGroupFromSelectionV2(record, { kind: 'create-group', selectedClipIds: ['grouped-edge'], transitionIds: [], definitionId: 'edge-definition', occurrenceId: 'edge-occurrence', name: 'Edge', originMs: 25000, identities: { patternInstanceIds: { [base.instanceId]: 'slot' }, layerIds: { [layer2.id]: 'local-layer' }, clipIds: { 'grouped-edge': 'child' }, transitionIds: {}, propertyTrackIds: {}, appearanceKeyIdsByClipId: { 'grouped-edge': { 'grouped-edge-key': 'local-appearance' } }, propertyKeyIdsByTrackId: {} } })
    expect(grouped.status).toBe('changed')
    if (grouped.status !== 'changed') throw new Error(JSON.stringify({ code: grouped.code, message: grouped.message }))
    grouped.record.composition.propertyTracks.push({ id: 'outgoing-brightness', target: { kind: 'clip-view', clipId: base.id, property: 'brightness' }, activeStartMs: 0, activeDurationMs: 32000, keyframes: [{ id: 'ob-k0', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'ob-k1', timeMs: 30000, value: 0.4, easing: { curve: 'linear' } }] })
    expect(validateShowRecordV2(grouped.record)).toEqual([])
    const promotion = promoteConvertedBoundariesToWholeOutputV2(grouped.record)
    expect(promotion.promotedTransitionIds).toEqual([])
    expect(promotion.record).toBe(grouped.record)
  })

  it('ignores a retained unused-instance track when asking promotion (over-promotion, #1068)', () => {
    const record = withUnusedInstanceTrack(convertedDefaultShow())
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.promotedTransitionIds).toEqual([])
    expect(promotion.record).toBe(record)
    const before = prepareShowV2ForCompile(record, stockLookup(record))
    expect(before.status).toBe('ready')
    if (before.status !== 'ready') throw new Error(JSON.stringify(before.issues))
    expect(before.provenance.route).toBe('continuous-flat')
    const edited = editShowLayoutIntervalsV2(record, { kind: 'set-show-end', showEndMs: 64000 })
    expect(edited.status).toBe('changed')
    if (edited.status !== 'changed') throw new Error(JSON.stringify(edited))
    expect(edited.record.composition.transitions[0].wholeOutput).toBeUndefined()
    expect(edited.record.composition.transitions[0].participants).toHaveLength(1)
    const after = prepareShowV2ForCompile(edited.record, stockLookup(edited.record))
    expect(after.status, JSON.stringify(after.status === 'refused' ? after.issues : '')).toBe('ready')
    if (after.status !== 'ready') throw new Error(JSON.stringify(after.issues))
    expect(after.provenance.route).toBe(before.provenance.route)
  })

  it('promotes through a Layout duplicate when only an unused-instance track blocks flat eligibility (missed promotion, #1068)', () => {
    // The track sits outside the boundary window [30000, 32000), so the window
    // rule stays silent and only the multiple-occurrence rule can promote here.
    // It is the same unused instance-control construction as the over-promotion
    // test: on the default window a track at 31000 would promote through the
    // window rule instead, hiding the missed occurrence rule.
    const record = withUnusedInstanceTrack(convertedDefaultShow(), 40000)
    expect(promoteConvertedBoundariesToWholeOutputV2(record).promotedTransitionIds).toEqual([])
    const boundaryId = record.composition.transitions[0].id
    const occurrenceId = record.composition.layoutOccurrences[0].id
    const duplicated = editShowLayoutIntervalsV2(record, { kind: 'duplicate', occurrenceId, newOccurrenceId: 'dup-empty' })
    expect(duplicated.status).toBe('changed')
    if (duplicated.status !== 'changed') throw new Error(JSON.stringify(duplicated))
    expect(duplicated.record.composition.transitions[0].wholeOutput).toBeDefined()
    expect(duplicated.record.composition.transitions[0].participants).toEqual([])
    expect(duplicated.affectedTransitionIds).toContain(boundaryId)
    const prepared = prepareShowV2ForCompile(duplicated.record, stockLookup(duplicated.record))
    expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : '')).toBe('ready')
  })
})

describe('scalar-ramp scope promotion (#1066 L2411)', () => {
  it('reports the scalar-ramp scope block only at participant scope', () => {
    const record = convertedDefaultShow()
    record.composition.transitions[0].propertyRamps = [{ target: { kind: 'show-repeat-scale' }, from: 1 }]
    expect(scalarRampScopeBlockedV2(record)).toBe(true)
    const removed = structuredClone(record)
    removed.composition.transitions[0].propertyRamps = []
    expect(scalarRampScopeBlockedV2(removed)).toBe(false)
    const widened = structuredClone(record)
    const boundary = widened.composition.transitions[0]
    const startMs = widened.composition.clips.find(clip => clip.id === boundary.participants[0].fromClipId)!.startMs
      + widened.composition.clips.find(clip => clip.id === boundary.participants[0].fromClipId)!.durationMs
    const endMs = widened.composition.clips.find(clip => clip.id === boundary.participants[0].toClipId)!.startMs
    boundary.participants = []
    boundary.wholeOutput = {
      startMs,
      fromClipIds: widened.composition.clips.filter(clip => clip.startMs + clip.durationMs === startMs).map(clip => clip.id),
      toClipIds: widened.composition.clips.filter(clip => clip.startMs === endMs).map(clip => clip.id),
    }
    expect(scalarRampScopeBlockedV2(widened)).toBe(false)
  })

  it('promotes a converted boundary carrying only a Show-scalar ramp, keeping the ramp', () => {
    const record = convertedDefaultShow()
    const ramp = { target: { kind: 'show-repeat-scale' as const }, from: 1 }
    record.composition.transitions[0].propertyRamps = [ramp]
    expect(scalarRampScopeBlockedV2(record)).toBe(true)
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.promotedTransitionIds).toEqual([record.composition.transitions[0].id])
    const transition = promotion.record.composition.transitions[0]
    expect(transition.participants).toEqual([])
    expect(transition.wholeOutput).toBeDefined()
    expect(transition.propertyRamps).toEqual([ramp])
  })

  it('does not promote a converted boundary carrying a non-scalar ramp', () => {
    const record = convertedDefaultShow()
    const boundary = record.composition.transitions[0]
    record.composition.propertyTracks.push(sectionTrack(record.composition.clips[0].id))
    boundary.propertyRamps = [{
      participantId: boundary.participants[0].id,
      target: { kind: 'clip-opacity', clipId: record.composition.clips[0].id },
      from: 0,
    }]
    expect(scalarRampScopeBlockedV2(record)).toBe(false)
    const promotion = promoteConvertedBoundariesToWholeOutputV2(record)
    expect(promotion.promotedTransitionIds).toEqual([])
    expect(promotion.record).toBe(record)
  })
})
