import { describe, expect, it } from 'vitest'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import { writeShowInstancePropertiesV2 } from './showInstancePropertiesV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { updateShowClipInspector, type ShowClipInspectorOwner } from './showClipInspectorModel'
import { validateShowComposition } from './showCompositionModel'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

/**
 * The shared Pattern-instance value owner behind `update_clips.instance_properties`.
 *
 * Specification section 4 keeps controls, clock and evaluation policy on the
 * Pattern instance, so writing one is a shared edit: every Clip on that runtime
 * observes it, and the result reports them. The editor's admission wrapper calls
 * this same owner, so the route and the command cannot diverge.
 */
function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Edited record did not reopen')
  return opened.record
}

describe('v2 Pattern-instance value owner', () => {
  it('writes the authored clock values and reports every Clip on the runtime', () => {
    const record = fixture()
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, 'clip', { time_scale: 0.5, evaluation: 'freeze-at-entry' }, undefined)

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances[0].time.timeScale).toBe(0.5)
    expect(next.composition.patternInstances[0].evaluationPolicy).toBe('freeze-at-entry')
    expect(result.affectedInstanceIds).toEqual(['instance'])
    expect(result.affectedClipIds).toEqual(['clip'])
    expect(record).toEqual(before)
  })

  it('writes and clears the stepped clock through the same owner', () => {
    const stuttered = writeShowInstancePropertiesV2(fixture(), 'clip', { stepped_clock: { stepMs: 250 } }, undefined)
    expect(stuttered.status).toBe('changed')
    if (stuttered.status !== 'changed') return
    expect(reopen(stuttered.record).composition.patternInstances[0].time.steppedClock).toEqual({ stepMs: 250 })

    const cleared = writeShowInstancePropertiesV2(stuttered.record, 'clip', { stepped_clock: null }, undefined)
    expect(cleared.status).toBe('changed')
    if (cleared.status !== 'changed') return
    expect(reopen(cleared.record).composition.patternInstances[0].time.steppedClock).toBeUndefined()
    expect(reopen(cleared.record)).toEqual(reopen(fixture()))
  })

  it.each([
    { name: 'a zero step', properties: { stepped_clock: { stepMs: 0 } } },
    { name: 'an unsupported stepped-clock field', properties: { stepped_clock: { stepMs: 250, phase: 1 } } },
    { name: 'a missing Clip', properties: { time_scale: 1 }, clipId: 'missing' },
  ])('refuses $name without writing', ({ properties, clipId }) => {
    const record = fixture()
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, clipId ?? 'clip', properties, undefined)

    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
  })

  it('returns the original record identity when nothing changes', () => {
    const record = fixture()
    const result = writeShowInstancePropertiesV2(record, 'clip', {
      time_scale: record.composition.patternInstances[0].time.timeScale,
    }, undefined)

    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(record)
  })

  it('is the writer the update_clips command already uses', () => {
    const viaOwner = writeShowInstancePropertiesV2(fixture(), 'clip', { time_scale: 0.25 }, undefined)
    const viaCommand = applyShowCommandV2(fixture(), 'update_clips', {
      updates: [{ clip_id: 'clip', instance_properties: { time_scale: 0.25 } }],
    })

    expect(viaOwner.status).toBe('changed')
    expect(viaCommand.status).toBe('changed')
    if (viaOwner.status !== 'changed' || viaCommand.status !== 'changed') return
    expect(viaCommand.record).toEqual(viaOwner.record)
  })

  it('removes control targets and exactly their lanes, keeping other controls and lanes (#1069)', () => {
    const record = fixture()
    record.composition.patternInstances[0].controlTargets = { sliderSpeed: 0.5, sliderHue: 0.3, sliderGain: 0.9 }
    record.composition.propertyTracks = [
      { id: 'speed', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderSpeed' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'speed-k1', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'speed-k2', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] },
      { id: 'gain', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 500, keyframes: [{ id: 'gain-k1', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'gain-k2', timeMs: 500, value: 0.4, easing: { curve: 'linear' } }] },
      { id: 'hue', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderHue' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'hue-k1', timeMs: 0, value: 0.3, easing: { curve: 'linear' } }, { id: 'hue-k2', timeMs: 1000, value: 0.6, easing: { curve: 'linear' } }] },
    ]
    expect(validateShowRecordV2(record)).toEqual([])
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, 'clip', { remove_controls: ['sliderSpeed', 'sliderGain'] }, undefined)

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances[0].controlTargets).toEqual({ sliderHue: 0.3 })
    expect(next.composition.propertyTracks.map(track => track.id)).toEqual(['hue'])
    expect(result.affectedTrackIds).toEqual(['speed', 'gain'])
    expect(result.affectedInstanceIds).toEqual(['instance'])
    expect(result.affectedClipIds).toEqual(['clip'])
    expect(record).toEqual(before)
  })

  it('clears the last control target key, as the v1 untick does (#1069)', () => {
    const record = fixture()
    record.composition.patternInstances[0].controlTargets = { sliderSpeed: 0.5 }
    const result = writeShowInstancePropertiesV2(record, 'clip', { remove_controls: ['sliderSpeed'] }, undefined)

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.patternInstances[0]).not.toHaveProperty('controlTargets')
    expect(result.affectedTrackIds).toEqual([])
  })

  it('refuses a removal naming no authored control target (#1069)', () => {
    const record = fixture()
    record.composition.patternInstances[0].controlTargets = { sliderSpeed: 0.5 }
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, 'clip', { remove_controls: ['sliderMissing'] }, undefined)

    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('invalid-intent')
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
  })

  it('refuses a removal whose lane is owned by a Group occurrence (#1069)', () => {
    const record = propertyEditGroupRecord()
    record.composition.patternInstances[0].controlTargets = { sliderLost: 0.2 }
    record.composition.groupDefinitions[0].propertyTracks = [
      { id: 'local-lost', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLost' }, activeStartMs: 0, activeDurationMs: 400, keyframes: [{ id: 'local-a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'local-b', timeMs: 400, value: 0.3, easing: { curve: 'linear' } }] },
    ]
    expect(validateShowRecordV2(record)).toEqual([])
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, 'clip', { remove_controls: ['sliderLost'] }, undefined)

    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe('compiler-ineligible')
    expect(result.message).toMatch(/Group "definition", occurrence "occ-0", track "occ-0:local-lost"/)
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
  })

  it('matches the v1 untick target and track set by export name (#1069)', () => {
    const show = convertibleV1Show()
    show.composition!.patternInstances[0].controlTargets = { sliderSpeed: 0.5, sliderHue: 0.3 }
    show.composition!.scenes[0].propertyTracks = [
      { id: 'speed', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderSpeed' }, keyframes: [{ id: 'speed-k1', timeMs: 0, value: 0.5, easing: { curve: 'linear' } }, { id: 'speed-k2', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] },
      { id: 'hue', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderHue' }, keyframes: [{ id: 'hue-k1', timeMs: 0, value: 0.3, easing: { curve: 'linear' } }, { id: 'hue-k2', timeMs: 1000, value: 0.6, easing: { curve: 'linear' } }] },
    ]
    expect(validateShowComposition(show, show.composition!)).toEqual([])
    const owner: ShowClipInspectorOwner = { kind: 'scene-main', sceneId: 'scene-a', zoneId: 'zone', placementId: 'clip' }
    const names = new Set(['sliderSpeed', 'sliderHue'])
    const v1 = updateShowClipInspector(show, owner, { simulation: { controlTargets: { sliderHue: 0.3 } } }, names)
    expect(v1).not.toBe(show)

    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const v2 = writeShowInstancePropertiesV2(converted.record, 'clip', { remove_controls: ['sliderSpeed'] }, undefined)
    expect(v2.status).toBe('changed')
    if (v2.status !== 'changed') return
    const v1Targets = Object.keys(v1.composition!.patternInstances[0].controlTargets ?? {}).sort()
    const v2Targets = Object.keys(v2.record.composition.patternInstances[0].controlTargets ?? {}).sort()
    expect(v2Targets).toEqual(v1Targets)
    const v1Tracks = (v1.composition!.scenes[0].propertyTracks ?? [])
      .flatMap(track => track.target.kind === 'instance-control' ? [track.target.exportName] : []).sort()
    const v2Tracks = v2.record.composition.propertyTracks
      .flatMap(track => track.target.kind === 'instance-control' ? [track.target.exportName] : []).sort()
    expect(v2Tracks).toEqual(v1Tracks)
    expect(v1Targets).toEqual(['sliderHue'])
    expect(v1Tracks).toEqual(['sliderHue'])
  })
})
