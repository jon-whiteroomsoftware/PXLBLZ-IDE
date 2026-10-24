import { describe, expect, it } from 'vitest'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from '../showCompositionV2'
import { copyShowInstancePropertyTracksV2 } from '../showPropertyAnimationV2'
import { applyShowCommandV2, runShowCommandV2Transaction } from './registry'
import { commandFixtureV2, fixtureContext } from './fixtures'

const hold = { curve: 'hold', at: 1 } as const
const target = { kind: 'step-ms', instance_id: 'inst-b' }
const spec = (value = 250) => ({ target, initial_value: value })
function reopen(record: ShowRecordV2) {
  expect(validateShowRecordV2(record)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw Error(JSON.stringify(opened.issues))
  expect(validateShowRecordV2(opened.record)).toEqual([])
  expect(opened.record).toEqual(record)
  return opened.record
}
// Every operation checks the whole preimage. Property-only operations also
// compare the whole unrelated payload, rather than selected fixture fields.
function command(record: ShowRecordV2, name: string, input: Record<string, unknown>, propertyOnly = true) {
  const before = structuredClone(record)
  const result = applyShowCommandV2(record, name, input, fixtureContext())
  expect(record).toEqual(before)
  if (result.status === 'changed') {
    reopen(result.record)
    if (propertyOnly) {
      expect({ ...result.record, updatedAt: before.updatedAt, composition: { ...result.record.composition, propertyTracks: before.composition.propertyTracks } }).toEqual(before)
      const removed = name === 'remove_property_tracks' ? input.track_ids as string[] : []
      const unrelated = before.composition.propertyTracks.filter(t => t.id !== input.track_id && !removed.includes(t.id))
      expect(result.record.composition.propertyTracks.filter(t => unrelated.some(u => u.id === t.id))).toEqual(unrelated)
    }
  } else expect(result.record).toBe(record)
  return result
}
function changed(record: ShowRecordV2, name: string, input: Record<string, unknown>, propertyOnly = true) {
  const result = command(record, name, input, propertyOnly)
  if (result.status !== 'changed') throw Error(JSON.stringify(result))
  return reopen(result.record)
}
function added(record = commandFixtureV2(), value = 250) {
  return changed(record, 'add_property_tracks', { tracks: [spec(value)] })
}
function last(record: ShowRecordV2) { return record.composition.propertyTracks[record.composition.propertyTracks.length - 1] }
function refused(record: ShowRecordV2, name: string, input: Record<string, unknown>) {
  const result = command(record, name, input)
  expect(result.status).toBe('refused')
  if (result.status !== 'refused') throw Error('Expected refusal')
  expect(result.issues.length).toBeGreaterThan(0)
  expect(result.issues[0]).toHaveProperty('code')
  return result
}

describe('step-length Property command contract', () => {
  it('defaults every new explicit/synthesized step key to Hold, leaving other targets linear', () => {
    const record = changed(commandFixtureV2(), 'add_property_tracks', { tracks: [{ target, keyframes: [0, 250, 500].map((value, i) => ({ at_ms: 1000 + i * 1000, value })) }] })
    expect(last(record)).toMatchObject({ target: { kind: 'instance-time-step-ms', instanceId: 'inst-b' }, activeStartMs: 1000, activeDurationMs: 2000 })
    expect(last(record).keyframes.map(k => [k.timeMs, k.value, k.easing])).toEqual([[1000, 0, hold], [2000, 250, hold], [3000, 500, hold]])
    for (const value of [0, 60000]) expect(last(added(undefined, value)).keyframes.map(k => [k.value, k.easing])).toEqual([[value, hold], [value, hold]])
    for (const ordinary of [{ kind: 'time-scale', instance_id: 'inst-b' }, { kind: 'control', instance_id: 'inst-b', control: 'speed' }]) {
      const output = changed(commandFixtureV2(), 'add_property_tracks', { tracks: [{ target: ordinary, initial_value: 1 }] })
      expect(last(output).keyframes.map(k => k.easing)).toEqual([{ curve: 'linear' }, { curve: 'linear' }])
    }
  })

  it('uses the effective Clip union and requires both explicit activation fields for an unused instance', () => {
    const union = changed(commandFixtureV2(), 'add_property_tracks', { tracks: [{ target: { kind: 'step-ms', instance_id: 'inst-a' }, initial_value: 250 }] })
    expect(last(union)).toMatchObject({ activeStartMs: 0, activeDurationMs: 8000 })
    const record = commandFixtureV2()
    record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[1]), id: 'unused' })
    const unused = { target: { kind: 'step-ms', instance_id: 'unused' }, initial_value: 250 }
    for (const activation of [{}, { active_start_ms: 0 }, { active_duration_ms: 1000 }]) {
      const result = refused(record, 'add_property_tracks', { tracks: [{ ...unused, ...activation }] })
      expect(result.issues[0].message).toContain('no Clip users')
    }
    expect(last(changed(record, 'add_property_tracks', { tracks: [{ ...unused, active_start_ms: 0, active_duration_ms: 1000 }] }))).toMatchObject({ activeStartMs: 0, activeDurationMs: 1000 })
    for (const instance_id of [undefined, 'missing']) {
      const result = refused(record, 'add_property_tracks', { tracks: [{ target: { kind: 'step-ms', ...(instance_id ? { instance_id } : {}) }, initial_value: 250 }] })
      expect(result.issues[0].message).toContain(instance_id ? 'no Pattern instance has id "missing"' : 'needs instance_id')
    }
  })

  it('keeps identities across create/reopen/add/update/no-op/remove/reopen', () => {
    let record = added()
    const track = structuredClone(last(record))
    record = changed(record, 'edit_property_keyframes', { track_id: track.id, edits: { add: [{ at_ms: 2000, value: 500 }] } })
    const middle = last(record).keyframes[1]
    expect(middle.easing).toEqual(hold)
    expect(last(record).keyframes.filter(k => k.id !== middle.id)).toEqual(track.keyframes)
    record = changed(record, 'edit_property_keyframes', { track_id: track.id, edits: { update: [{ keyframe_id: middle.id, value: 600 }] } })
    expect(last(record).keyframes[1]).toEqual({ ...middle, value: 600 })
    expect(command(record, 'edit_property_keyframes', { track_id: track.id, edits: { update: [{ keyframe_id: middle.id, value: 600 }] } }).status).toBe('unchanged')
    expect(command(record, 'update_property_track', { track_id: track.id, active_start_ms: 1000, active_duration_ms: 2000 }).status).toBe('unchanged')
    for (const edits of [
      { update: [{ keyframe_id: middle.id, value: 700 }, { keyframe_id: 'missing', value: 250 }] },
      { remove: [middle.id, 'missing'] },
    ]) refused(record, 'edit_property_keyframes', { track_id: track.id, edits })
    record = changed(record, 'edit_property_keyframes', { track_id: track.id, edits: { remove: [middle.id] } })
    expect(last(record)).toEqual(track)
    record = changed(record, 'remove_property_tracks', { track_ids: [track.id] })
    expect(record.composition.propertyTracks).toEqual(commandFixtureV2().composition.propertyTracks)
  })

  it.each([1, 15, 16.5, 60001])('refuses invalid value %s atomically', value => {
    const record = commandFixtureV2()
    refused(record, 'add_property_tracks', { tracks: [spec(value)] })
    refused(record, 'add_property_tracks', { tracks: [spec(250), { ...spec(value), target: { kind: 'step-ms', instance_id: 'inst-a' } }] })
  })
  it.each([0, 16, 31999, 32000, 32001, 40000, 60000])('accepts legal value %s without clamping', value => {
    expect(last(added(undefined, value)).keyframes.map(k => k.value)).toEqual([value, value])
  })
  it.each([{ curve: 'linear' }, { curve: 'hold', at: 0.5 }])('refuses nonconstant outgoing %j but allows constant segments', easing => {
    const record = commandFixtureV2()
    const keys = (end: number) => [{ at_ms: 1000, value: 250, easing }, { at_ms: 3000, value: end }]
    refused(record, 'add_property_tracks', { tracks: [{ target, keyframes: keys(500) }] })
    expect(last(changed(record, 'add_property_tracks', { tracks: [{ target, keyframes: keys(250) }] })).keyframes[0].easing).toEqual(easing)
    const existing = added()
    const track = last(existing)
    refused(existing, 'edit_property_keyframes', { track_id: track.id, edits: { update: [{ keyframe_id: track.keyframes[0].id, value: 500, easing }] } })
  })

  it('refuses same-target overlap, admits adjacent activation and separate time-scale ownership', () => {
    const record = added()
    refused(record, 'add_property_tracks', { tracks: [spec()] })
    const adjacent = changed(record, 'add_property_tracks', { tracks: [{ target, active_start_ms: 3000, active_duration_ms: 1000, keyframes: [{ at_ms: 3000, value: 500 }, { at_ms: 4000, value: 250 }] }] })
    expect(last(adjacent)).toMatchObject({ activeStartMs: 3000, activeDurationMs: 1000 })
    expect(last(changed(adjacent, 'add_property_tracks', { tracks: [{ target: { kind: 'time-scale', instance_id: 'inst-b' }, initial_value: 1 }] })).target.kind).toBe('instance-time-scale')
  })

  it('transactions publish one complete candidate or the original at the failing index', () => {
    const record = commandFixtureV2()
    const before = structuredClone(record)
    const create = { name: 'add_property_tracks', input: { tracks: [spec()] } }
    const edit = { name: 'edit_property_keyframes', input: { track_id: 'track-step-ms', edits: { update: [{ keyframe_id: 'track-step-ms-key-2', value: 500 }] } } }
    const result = runShowCommandV2Transaction(record, [create, edit, edit], fixtureContext())
    expect(record).toEqual(before)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') throw Error(JSON.stringify(result))
    reopen(result.record)
    expect({ ...result.record, updatedAt: before.updatedAt, composition: { ...result.record.composition, propertyTracks: before.composition.propertyTracks } }).toEqual(before)
    expect(result.record.composition.propertyTracks[0]).toEqual(before.composition.propertyTracks[0])
    expect(last(result.record).keyframes.map(k => k.value)).toEqual([250, 500])
    expect(result.changes).toHaveLength(2)
    const accepted = structuredClone(result.record)
    const rejected = runShowCommandV2Transaction(result.record, [
      { name: 'edit_property_keyframes', input: { track_id: 'track-step-ms', edits: { update: [{ keyframe_id: 'track-step-ms-key-2', value: 600 }] } } },
      { name: 'edit_property_keyframes', input: { track_id: 'track-step-ms', edits: { update: [{ keyframe_id: 'track-step-ms-key-2', value: 15 }] } } },
    ], fixtureContext())
    expect(rejected).toMatchObject({ status: 'refused', step: 1 })
    expect(rejected.record).toBe(result.record)
    expect(result.record).toEqual(accepted)
    expect(last(result.record).keyframes.map(k => k.value)).toEqual([250, 500])
    expect(record).toEqual(before)
  })

  it('copies step and time-scale tracks with exact fresh identities and filters incompatible controls', () => {
    let record = added()
    record = changed(record, 'add_property_tracks', { tracks: [
      { target: { kind: 'time-scale', instance_id: 'inst-b' }, initial_value: 1 },
      { target: { kind: 'control', instance_id: 'inst-b', control: 'speed' }, initial_value: 0.5 },
    ] })
    const sources = record.composition.propertyTracks.slice(1, 3)
    // A constant retained segment exercises descriptor copying as well as keys.
    sources[0].keyframes[0].curveSegment = { baseValue: 250, deltaValue: 0, easing: { curve: 'linear' }, sourceDurationMs: 2000, elapsedOffsetMs: 0 }
    reopen(record)
    const before = structuredClone(record)
    const identitiesBySourceTrackId = Object.fromEntries(sources.map(t => [t.id, { trackId: `${t.id}-copy`, keyframeIdsBySourceId: Object.fromEntries(t.keyframes.map(k => [k.id, `${k.id}-copy`])) }]))
    const result = copyShowInstancePropertyTracksV2(record, { fromInstanceId: 'inst-b', toInstanceId: 'inst-a', placementDeltaMs: 200, compatibleControlExports: [], identitiesBySourceTrackId })
    expect(record).toEqual(before)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') throw Error(JSON.stringify(result))
    expect(result.discardedTargets).toEqual([{ kind: 'instance-control', instanceId: 'inst-b', exportName: 'speed' }])
    expect(result.copiedTrackIds).toEqual(sources.map(t => `${t.id}-copy`))
    expect(result.propertyTracks.slice(-2)).toEqual(sources.map(t => ({ ...t, id: `${t.id}-copy`, target: { ...t.target, instanceId: 'inst-a' }, activeStartMs: t.activeStartMs + 200, keyframes: t.keyframes.map(k => ({ ...k, id: `${k.id}-copy`, timeMs: k.timeMs + 200 })) })))
    reopen({ ...record, composition: { ...record.composition, propertyTracks: result.propertyTracks } })
  })

  it('independence copies step tracks and rejoin removes only the vacated instance and its tracks', () => {
    let record = changed(commandFixtureV2(), 'add_property_tracks', { tracks: [{ target: { kind: 'step-ms', instance_id: 'inst-a' }, initial_value: 250 }] })
    const source = structuredClone(last(record))
    record = changed(record, 'make_clip_pattern_independent', { clip_id: 'clip-b' }, false)
    const independentId = record.composition.clips.find(c => c.id === 'clip-b')!.instanceId
    expect(independentId).not.toBe('inst-a')
    const copy = record.composition.propertyTracks.find(t => 'instanceId' in t.target && t.target.instanceId === independentId)!
    expect(copy.target).toEqual({ kind: 'instance-time-step-ms', instanceId: independentId })
    expect(copy.id).not.toBe(source.id)
    expect(copy.keyframes.every(k => !source.keyframes.some(s => s.id === k.id))).toBe(true)
    expect({ ...copy, id: source.id, target: source.target, keyframes: copy.keyframes.map((k, i) => ({ ...k, id: source.keyframes[i].id })) }).toEqual(source)
    record = changed(record, 'edit_property_keyframes', { track_id: copy.id, edits: { update: [{ keyframe_id: copy.keyframes[copy.keyframes.length - 1].id, value: 500 }] } })
    expect(record.composition.propertyTracks.find(t => t.id === source.id)).toEqual(source)
    record = changed(record, 'rejoin_clip_pattern_instance', { clip_id: 'clip-b', instance_id: 'inst-a' }, false)
    expect(record.composition.patternInstances.some(i => i.id === independentId)).toBe(false)
    expect(record.composition.propertyTracks.some(t => 'instanceId' in t.target && t.target.instanceId === independentId)).toBe(false)
    expect(record.composition.propertyTracks.find(t => t.id === source.id)).toEqual(source)
    expect(record.composition.clips.filter(c => c.instanceId === 'inst-a').map(c => c.id)).toEqual(['clip-a', 'clip-b'])
  })
})
