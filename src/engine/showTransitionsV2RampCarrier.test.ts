import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

function convertedTransitionShow(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error(JSON.stringify(opened.issues))
  return opened.record
}

/** Whole-output boundary carrying one global scalar ramp; both contributors survive deletion. */
function globalScalarCarrierShow(): ShowRecordV2 {
  const record = convertedTransitionShow()
  record.composition.transitions = [{
    id: 'boundary', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
    crossfadePolicy: 'live-live', participants: [],
    wholeOutput: { startMs: 400, fromClipIds: ['out'], toClipIds: ['in'] },
    propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 2, easing: { curve: 'quadratic', direction: 'in' } }],
  }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

/** Participant boundary whose ramp targets the incoming Clip's own appearance. */
function participantCarrierShow(): ShowRecordV2 {
  const record = convertedTransitionShow()
  const transition = record.composition.transitions[0]
  transition.propertyRamps = [{
    participantId: transition.participants[0].id,
    target: { kind: 'clip-view', clipId: 'in', property: 'brightness' },
    from: 0.2,
    easing: { curve: 'quadratic', direction: 'in' },
  }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

describe('v2 Transition Property-ramp carriers survive Clip deletion', () => {
  it('projects a surviving global scalar ramp into an independently activated track', () => {
    const source = globalScalarCarrierShow()
    const before = structuredClone(source)

    const deleted = editShowTransitionV2(source, {
      kind: 'delete-clip',
      clipId: 'out',
      propertyRampProjections: [{
        transitionId: 'boundary',
        projections: [{
          rampIndex: 0, trackId: 'repeat-track', startKeyId: 'repeat-start', endKeyId: 'repeat-end',
          activeEndMs: 600, toValue: source.composition.sampleRemap.repeatScale,
        }],
      }],
    })

    expect(source).toEqual(before)
    expect(deleted).toMatchObject({
      status: 'changed',
      affectedClipIds: ['out'],
      affectedTransitionIds: ['boundary'],
      affectedTrackIds: ['repeat-track'],
      removedIds: ['boundary', 'out'],
    })
    if (deleted.status !== 'changed') return
    const reopened = reopen(deleted.record)
    expect(reopened.composition.transitions).toEqual([])
    expect(reopened.composition.clips.map(clip => clip.id)).toEqual(['in'])
    expect(reopened.composition.showEndMs).toBe(source.composition.showEndMs)
    expect(reopened.composition.propertyTracks).toEqual([{
      id: 'repeat-track',
      target: { kind: 'show-repeat-scale' },
      activeStartMs: 400,
      activeDurationMs: 200,
      keyframes: [
        { id: 'repeat-start', timeMs: 400, value: 2, easing: { curve: 'quadratic', direction: 'in' } },
        { id: 'repeat-end', timeMs: 600, value: 1, easing: { curve: 'linear' } },
      ],
    }])
    // Retained values and easing: quadratic-in at the interval midpoint.
    expect(evaluateShowPropertyTrackV2(reopened.composition.propertyTracks[0], 500)).toBeCloseTo(1.75)
    expect(evaluateShowPropertyTrackV2(reopened.composition.propertyTracks[0], 399)).toBeUndefined()
  })

  it('removes an incoming Clip value ramp with its Transition without projection', () => {
    const source = participantCarrierShow()
    const before = structuredClone(source)

    const deleted = editShowTransitionV2(source, { kind: 'delete-clip', clipId: 'in' })

    expect(source).toEqual(before)
    expect(deleted).toMatchObject({
      status: 'changed',
      affectedClipIds: ['in'],
      affectedTransitionIds: ['transition-crossfade'],
      affectedTrackIds: [],
      removedIds: ['in', 'transition-crossfade'],
    })
    if (deleted.status !== 'changed') return
    const reopened = reopen(deleted.record)
    expect(reopened.composition.propertyTracks).toEqual([])
    expect(reopened.composition.clips.map(clip => clip.id)).toEqual(['out'])
  })

  it('refuses atomically when a removed carrier has no projection plan', () => {
    const source = globalScalarCarrierShow()
    const before = structuredClone(source)

    const deleted = editShowTransitionV2(source, { kind: 'delete-clip', clipId: 'out' })

    expect(deleted).toMatchObject({
      status: 'refused',
      code: 'unsupported-property-carrier',
      affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [],
    })
    expect(deleted.record).toBe(source)
    expect(source).toEqual(before)
    expect(deleted.status === 'refused' && deleted.message).not.toContain('#1037')
  })

  it('refuses a plan naming a Transition that this deletion does not remove', () => {
    const source = globalScalarCarrierShow()
    const before = structuredClone(source)

    const deleted = editShowTransitionV2(source, {
      kind: 'delete-clip',
      clipId: 'out',
      propertyRampProjections: [
        { transitionId: 'boundary', projections: [{ rampIndex: 0, trackId: 'a', startKeyId: 'b', endKeyId: 'c', activeEndMs: 600, toValue: 1 }] },
        { transitionId: 'absent', projections: [] },
      ],
    })

    expect(deleted).toMatchObject({ status: 'refused', code: 'unsupported-property-carrier' })
    expect(deleted.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('refuses a projection the #1037 owner cannot represent and keeps the preimage', () => {
    const source = globalScalarCarrierShow()
    const before = structuredClone(source)

    const deleted = editShowTransitionV2(source, {
      kind: 'delete-clip',
      clipId: 'out',
      propertyRampProjections: [{
        transitionId: 'boundary',
        // Repeat-scale sources outside 1–8 refuse under the accepted bounded range policy.
        projections: [{ rampIndex: 0, trackId: 'repeat-track', startKeyId: 'repeat-start', endKeyId: 'repeat-end', activeEndMs: 600, toValue: 12 }],
      }],
    })

    expect(deleted).toMatchObject({ status: 'refused', code: 'unsupported-property-carrier' })
    expect(deleted.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('deletes an unrelated Clip without demanding a plan for a retained carrier', () => {
    const source = globalScalarCarrierShow()
    const incoming = source.composition.clips.find(clip => clip.id === 'in')!
    const overlayLayerId = source.composition.layers.find(layer => layer.rank === 1)!.id
    source.composition.clips.push({
      ...structuredClone(incoming), id: 'overlay', layerId: overlayLayerId, startMs: 700, durationMs: 100,
      appearance: { keys: [{ ...structuredClone(incoming.appearance.keys[0]), id: 'overlay:appearance:1', timeMs: 700 }] },
    })
    expect(validateShowRecordV2(source)).toEqual([])

    const deleted = editShowTransitionV2(source, { kind: 'delete-clip', clipId: 'overlay' })

    expect(deleted).toMatchObject({ status: 'changed', affectedTransitionIds: [], removedIds: ['overlay'] })
    if (deleted.status !== 'changed') return
    expect(deleted.record.composition.transitions).toEqual(source.composition.transitions)
  })
})
