import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { hasSectionScopedTrackActivationV2, participantWindowBlockedV2, promoteConvertedBoundariesToWholeOutputV2 } from './showBoundaryScopeV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import type { ShowRecordV2, ShowPropertyTrackV2 } from './showCompositionV2'

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
})
