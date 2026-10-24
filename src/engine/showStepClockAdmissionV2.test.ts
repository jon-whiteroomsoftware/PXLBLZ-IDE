import { describe, expect, it } from 'vitest'
import { propertyEditRecord, propertyEditTrack, propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { validateShowRecordV2, serializeProvisionalShowRecordV2, parseProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { cloneValidShowRecordV2ForWorker } from '../cloudflare/showV2Codec'
import { buildShowFileBundle, serializeShowFileBundle, parseShowFileBundle } from './showFileBundle'
import { editShowPropertyV2 } from './showPropertyEditsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { projectShowTimelineV2 } from './showTimelineViewModelV2'
import { projectShowEditorTimelineV2, projectShowEditorPropertyLanesV2 } from './showEditorTimelinePresentation'
import { projectShowEditorInspectorPresentationV2 } from './showEditorInspectorPresentation'

function step(instanceId = propertyEditRecord().composition.patternInstances[0].id, durationMs = 1000) {
  const track = propertyEditTrack({ kind: 'instance-time-step-ms', instanceId })
  track.activeDurationMs = durationMs
  track.keyframes.forEach((key, i) => { key.timeMs = i * durationMs; key.value = i * 250; key.easing = { curve: 'hold', at: 1 } })
  return track
}
function held(track = step()) {
  track.keyframes[0].curveSegment = { baseValue: 0, deltaValue: 250, easing: { curve: 'hold', at: 1 }, sourceDurationMs: track.activeDurationMs + 100, elapsedOffsetMs: 100 }
  return track
}
function add(record: ShowRecordV2, track = step()) {
  const before = structuredClone(record)
  const result = editShowPropertyV2(record, { kind: 'show' }, { kind: 'add-track', track })
  expect(record).toEqual(before)
  if (result.status === 'changed') expect(validateShowRecordV2(result.record)).toEqual([])
  else expect(result.record).toBe(record)
  return result
}

describe('step-length persisted admission and interim boundaries', () => {
  it.each(['show', 'group'] as const)('reopens exact %s tracks through schema, Worker and .pxlshow', async scope => {
    const record = scope === 'show' ? propertyEditRecord() : propertyEditGroupRecord()
    const tracks = scope === 'show' ? record.composition.propertyTracks : record.composition.groupDefinitions[0].propertyTracks
    tracks.push(held(scope === 'show' ? step() : step('slot', 400)))
    const before = structuredClone(record)
    expect(validateShowRecordV2(record)).toEqual([])
    expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))).toMatchObject({ status: 'opened', record })
    const original = globalThis.Function
    try {
      globalThis.Function = function forbidden(): never { throw Error('Code generation disabled') } as unknown as FunctionConstructor
      expect(cloneValidShowRecordV2ForWorker(record)).toEqual(record)
    } finally { globalThis.Function = original }
    const built = buildShowFileBundle(record, { patterns: [], maps: [], libraries: [] }, { appVersion: '1211-test', exportedAt: '2026-10-23T00:00:00.000Z' })
    expect((await parseShowFileBundle(await serializeShowFileBundle(built.bundle), { acceptV2: true })).show).toEqual(record)
    Object.assign(tracks[0].target, { hidden: true })
    expect(() => cloneValidShowRecordV2ForWorker(record)).toThrow('Invalid Show v2 record at /: Property "composition" does not match schema.')
    expect(parseProvisionalShowRecordV2(JSON.stringify(record)).status).not.toBe('opened')
    delete (tracks[0].target as unknown as { hidden?: boolean }).hidden
    expect(record).toEqual(before)
  })

  it.each([0, 16, 31999, 32000, 32001, 40000, 60000])('accepts %s ms atomically', value => {
    const track = step(); track.keyframes.forEach(key => { key.value = value })
    expect(add(propertyEditRecord(), track).status).toBe('changed')
  })
  it.each([-1, 1, 15, 16.5, 60001])('refuses %s ms at either key', value => {
    for (const index of [0, 1]) {
      const record = propertyEditRecord(); const track = step(); track.keyframes[index].value = value
      record.composition.propertyTracks = [track]
      expect(validateShowRecordV2(record)).toContainEqual(expect.objectContaining({ path: `composition.propertyTracks[0].keyframes[${index}].value`, code: 'out-of-bounds' }))
      expect(add(propertyEditRecord(), track).status).toBe('refused')
    }
  })
  it.each([NaN, Infinity])('refuses nonfinite %s ms through schema admission at either key', value => {
    for (const index of [0, 1]) {
      const record = propertyEditRecord(); const track = step(); track.keyframes[index].value = value
      record.composition.propertyTracks = [track]
      expect(validateShowRecordV2(record)).toContainEqual(expect.objectContaining({ path: `/composition/propertyTracks/0/keyframes/${index}/value`, code: 'schema' }))
      expect(add(propertyEditRecord(), track).status).toBe('refused')
    }
  })
  it('checks references, outgoing Hold and retained descriptors at authored paths', () => {
    expect(add(propertyEditRecord(), step('missing')).status).toBe('refused')
    expect(add(propertyEditRecord(), held()).status).toBe('changed')
    for (const mode of ['linear', 'early', 'segment'] as const) {
      const record = propertyEditRecord(); const track = held()
      if (mode === 'linear') track.keyframes[0].easing = { curve: 'linear' }
      if (mode === 'early') track.keyframes[0].easing = { curve: 'hold', at: 0.5 }
      if (mode === 'segment') track.keyframes[0].curveSegment!.baseValue = 16
      record.composition.propertyTracks = [track]
      expect(validateShowRecordV2(record)).toContainEqual(expect.objectContaining({ path: `composition.propertyTracks[0].keyframes[0].${mode === 'segment' ? 'curveSegment' : 'easing'}`, code: 'out-of-bounds' }))
      expect(add(propertyEditRecord(), track).status).toBe('refused')
    }
  })
  it('owns only overlapping activations of the same instance and kind', () => {
    const record = propertyEditRecord(); record.composition.propertyTracks = [step(undefined, 400)]
    const second = step(undefined, 400); second.id = 'second'; second.keyframes.forEach(key => { key.id += '-second' })
    expect(add(record, second).status).toBe('refused')
    second.activeStartMs = 400; second.keyframes.forEach(key => { key.timeMs += 400 })
    expect(add(record, second).status).toBe('changed')
    second.activeStartMs = 0; second.keyframes.forEach(key => { key.timeMs -= 400 })
    const speed = structuredClone(second); speed.target = { kind: 'instance-time-scale', instanceId: record.composition.patternInstances[0].id }; speed.keyframes.forEach(key => { key.value = 1 })
    expect(add(record, speed).status).toBe('changed')
    const other = structuredClone(record.composition.patternInstances[0]); other.id = 'other'; record.composition.patternInstances.push(other)
    second.target = { kind: 'instance-time-step-ms', instanceId: other.id }
    expect(add(record, second).status).toBe('changed')
  })
  it.each(['used', 'unused', 'unplaced-group'] as const)('refuses compilation before pruning %s authored tracks', mode => {
    const record = mode === 'unplaced-group' ? propertyEditGroupRecord() : propertyEditRecord()
    let path = 'composition.propertyTracks[0].target'
    if (mode === 'unplaced-group') {
      record.composition.groupOccurrences = []
      record.composition.groupDefinitions[0].propertyTracks = [step('slot', 400)]
      path = 'composition.groupDefinitions[0].propertyTracks[0].target'
    } else {
      if (mode === 'unused') record.composition.clips = []
      record.composition.propertyTracks = [step()]
    }
    expect(validateShowRecordV2(record)).toEqual([])
    const before = structuredClone(record)
    expect(prepareShowV2ForCompile(record, { byCellId: {}, byPatternInstanceId: {} })).toMatchObject({ status: 'refused', issues: [{ code: 'unsupported-property-target', path, message: 'Step-length Property tracks cannot be compiled yet.' }] })
    expect(record).toEqual(before)
    const plain = prepareShowV2ForCompile(propertyEditRecord(), { byCellId: {}, byPatternInstanceId: {} })
    expect(plain.status).toBe('refused')
    if (plain.status === 'refused') expect(plain.issues.some(issue => issue.message.includes('Step-length'))).toBe(false)
  })
  it('refuses a Transition step ramp while preserving supported speed admission', () => {
    const record = propertyEditRecord(); const base = record.composition.clips[0]
    record.composition.clips = [{ ...structuredClone(base), id: 'out', durationMs: 400 }, { ...structuredClone(base), id: 'in', startMs: 600, durationMs: 400, appearance: { keys: [{ ...structuredClone(base.appearance.keys[0]), id: 'incoming-appearance', timeMs: 600 }] } }]
    record.composition.transitions = [{ id: 'xfade', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live', participants: [{ id: 'p', zoneId: base.zoneId, layerId: base.layerId, fromClipId: 'out', toClipId: 'in' }], propertyRamps: [{ target: { kind: 'instance-time-scale', instanceId: base.instanceId }, participantId: 'p', from: 1 }] }]
    expect(validateShowRecordV2(record)).toEqual([])
    record.composition.transitions[0].propertyRamps[0].target = { kind: 'instance-time-step-ms', instanceId: base.instanceId }
    expect(validateShowRecordV2(record)).toContainEqual({ path: 'composition.transitions[0].propertyRamps[0].target', code: 'invalid-property-target', message: 'Step-length tracks cannot be Transition property ramps.' })
  })
  it('materializes bound Group step targets without changing local authoring', () => {
    const record = propertyEditGroupRecord(); record.composition.groupDefinitions[0].propertyTracks = [step('slot', 400)]
    const before = structuredClone(record); const output = materializeShowGroupsV2(record)
    expect(validateShowRecordV2(output)).toEqual([])
    expect(output.composition.propertyTracks).toHaveLength(2)
    expect(output.composition.propertyTracks.map(track => track.target)).toEqual([0, 1].map(() => ({ kind: 'instance-time-step-ms', instanceId: record.composition.patternInstances[0].id })))
    expect(record).toEqual(before)
  })
  it.each(['show', 'group'] as const)('omits step tracks from all legacy %s projections', scope => {
    const record = scope === 'show' ? propertyEditRecord() : propertyEditGroupRecord()
    const tracks = scope === 'show' ? record.composition.propertyTracks : record.composition.groupDefinitions[0].propertyTracks
    const clock = scope === 'show' ? step() : step('slot', 400); clock.id = 'hidden-step'
    const brightness = propertyEditTrack({ kind: 'clip-view', clipId: scope === 'show' ? record.composition.clips[0].id : 'child', property: 'brightness' }); brightness.id = 'visible-brightness'
    clock.keyframes.forEach(key => { key.id = `${clock.id}-${key.id}` })
    brightness.keyframes.forEach(key => { key.id = `${brightness.id}-${key.id}` })
    if (scope === 'group') { brightness.activeDurationMs = 400; brightness.keyframes[1].timeMs = 400 }
    tracks.push(clock, brightness)
    expect(validateShowRecordV2(record)).toEqual([])
    const before = structuredClone(record)
    const views = [projectShowTimelineV2(record), projectShowEditorTimelineV2(record), projectShowEditorPropertyLanesV2(record), projectShowEditorInspectorPresentationV2(record, 0)]
    for (const view of views) expect(JSON.stringify(view)).not.toContain('hidden-step')
    expect(JSON.stringify(views[0])).toContain('visible-brightness')
    expect(JSON.stringify(views[3])).toContain('visible-brightness')
    expect(record).toEqual(before)
  })
})
