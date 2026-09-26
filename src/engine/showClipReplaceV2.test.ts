import { describe, expect, it } from 'vitest'
import { editShowClipV2, type ShowClipEditIntentV2 } from './showClipsV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { parseEpe } from './epeImport'
import { convertibleV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'
import { buildDeliveredShowSourceInventory } from './showSourceInventory'
import { LIBRARIES } from '../pixelblaze/libs'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'

function fixture(shared = false): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(convertibleV1Show())
  if (result.status !== 'converted') throw new Error('Conversion failed')
  const record = result.record
  record.composition.executionModel = 'continuous'
  record.composition.showEndMs = 2000
  record.composition.layoutOccurrences[0].durationMs = 2000
  const clip = record.composition.clips[0]
  clip.durationMs = 2000
  record.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2, sliderLost: 0.4 }
  record.composition.propertyTracks = [
    { id: 'level', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 500,
      keyframes: [{ id: 'level:start', timeMs: 0, value: 0.2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level:end', timeMs: 500, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'lost', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' }, activeStartMs: 0, activeDurationMs: 500,
      keyframes: [{ id: 'lost:start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } }, { id: 'lost:end', timeMs: 500, value: 0.6, easing: { curve: 'linear' } }] },
    { id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'instance' }, activeStartMs: 0, activeDurationMs: 500,
      keyframes: [{ id: 'speed:start', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'speed:end', timeMs: 500, value: 1.5, easing: { curve: 'linear' } }] },
    { id: 'appearance', target: { kind: 'clip-opacity', clipId: 'clip' }, activeStartMs: 0, activeDurationMs: 500,
      keyframes: [{ id: 'appearance:start', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'appearance:end', timeMs: 500, value: 1, easing: { curve: 'linear' } }] },
  ]
  if (shared) record.composition.clips.push({ ...structuredClone(clip), id: 'other', layerId: record.composition.layers[1].id,
    appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'other:key', value: { ...structuredClone(clip.appearance.keys[0].value), opacity: 0 } }] } })
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function groupFixture(unused = false): ShowRecordV2 {
  const record = fixture()
  const instance = record.composition.patternInstances[0]
  const { zoneId: _zone, ...clip } = structuredClone(record.composition.clips[0])
  record.composition.groupDefinitions = [{ id: 'group', name: 'Linked',
    patternInstances: [{ ...structuredClone(instance), id: 'animator' }, ...(unused ? [{ ...structuredClone(instance), id: 'active' }] : [])],
    layers: [{ id: 'local', name: 'Local', rank: 0 }],
    clips: [{ ...clip, id: 'child', instanceId: unused ? 'active' : 'animator', layerId: 'local', durationMs: 400 }],
    transitions: [], propertyTracks: record.composition.propertyTracks.slice(0, 3).map(track => ({ ...structuredClone(track), id: `local:${track.id}`,
      target: { ...structuredClone(track.target), instanceId: 'animator' }, activeDurationMs: 400,
      keyframes: track.keyframes.map(key => ({ ...structuredClone(key), timeMs: key.timeMs === 0 ? 0 : 400 })),
    })),
  }]
  if (unused) {
    record.composition.patternInstances.push({ ...structuredClone(instance), id: 'other' })
    record.composition.clips[0].entryPolicy = 'restart'
  }
  record.composition.groupOccurrences = (unused ? [1200, 1600] : [1200]).map((startMs, index) => ({
    id: index === 0 ? 'use' : 'repeat', definitionId: 'group', zoneId: record.composition.clips[0].zoneId,
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id, startMs, translationX: 0, translationY: 0, holds: [],
    layerBindings: [{ definitionLayerId: 'local', layerId: record.composition.layers[1].id }],
    instanceBindings: unused ? { animator: index === 0 ? 'instance' : 'other', active: 'other' } : { animator: 'instance' } as Record<string, string>,
  }))
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

type ReplaceIntent = Omit<Extract<ShowClipEditIntentV2, { kind: 'replace-pattern' }>, 'independence' | 'replacement'> & {
  replacement: { patternReference: ShowRecordV2['composition']['patternInstances'][number]['pattern']; patternName: string; exportedSliders: Array<{ exportName: string; kind: 'slider'; label: string }> }
  independence?: { instanceId: string; identitiesBySourceTrackId: Record<string, { trackId: string; keyframeIdsBySourceId: Record<string, string> }> }
}
function intent(record: ShowRecordV2, shared = false): ReplaceIntent {
  return { kind: 'replace-pattern', clipId: 'clip', replacement: { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement',
    exportedSliders: [{ exportName: 'sliderLevel', kind: 'slider', label: 'Level' }] },
    ...(shared ? { independence: { instanceId: 'replacement', identitiesBySourceTrackId: Object.fromEntries(materializeShowGroupsV2(record).composition.propertyTracks
      .filter(track => 'instanceId' in track.target && track.target.instanceId === 'instance')
      .filter(track => track.target.kind !== 'instance-control' || track.target.exportName === 'sliderLevel')
      .map(track => [track.id, { trackId: `copy:${track.id}`, keyframeIdsBySourceId: Object.fromEntries(track.keyframes.map(key => [key.id, `copy:${key.id}`])) }])) } } : {}),
  }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Reopen failed')
  expect(opened.record).toEqual(record)
  return opened.record
}

const oldCode = 'export var level = 0.2; var lost = 0.4; export var elapsed = 0; export function sliderLevel(value) { level = value } export function sliderLost(value) { lost = value } export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(level, 0, 0) }'
const newCode = 'export var level = 0.9; export var elapsed = 0; export function sliderLevel(value) { level = value } export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(0, 0, level) }'
function prepared(record: ShowRecordV2) {
  return prepareShowV2ForCompile(reopen(record), { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, instance.pattern.id === 'Replacement' ? newCode : oldCode])),
  }, { libraries: LIBRARIES })
}
function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const result = prepared(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  if (result.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(result.recipe, LIBRARIES)
  const reopened = parseEpe(exportShowEpeV2ForTest(convertibleV2Record(), artifact.code, { id: 'replace-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  expect(reopened.stamp?.kind).toBe('show')
  const inventory = buildDeliveredShowSourceInventory(artifact.summary.sourceInventory, artifact.code, reopened.src)
  const bytes = new TextEncoder().encode(reopened.src)
  const memberSource = (id: string) => inventory.chunks.filter(chunk => chunk.ownerId === id && chunk.patternPart === 'compiled-pattern')
    .map(chunk => new TextDecoder().decode(bytes.slice(chunk.startByte, chunk.endByte))).join('')
  return { artifact, code: reopened.src, memberSource, replay: createFastReplayRuntime({ ...artifact, code: reopened.src, dimension: 2 }, {
    fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
  }) }
}

/** Only compiler-generated private names vary when the authored cast grows. */
function normalizedPrivateSymbols(source: string): string {
  const bijection = new Map<string, string>()
  return source.replace(/\b__pxlblz_[A-Za-z0-9_$]+\b/g, name => {
    if (!bijection.has(name)) bijection.set(name, `generated_${bijection.size}`)
    return bijection.get(name)!
  })
}

describe('ordinary Clip-scoped Pattern replacement', () => {
  function atomicRefusal(source: ShowRecordV2, value: ShowClipEditIntentV2, code = 'invalid-intent') {
    const before = structuredClone(source)
    const result = editShowClipV2(source, value)
    expect(result).toMatchObject({ status: 'refused', code, affectedClipIds: [], affectedInstanceIds: [], affectedTrackIds: [], affectedKeyframeIds: [], removedIds: [], discardedControlTargets: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  }

  it.each([
    ['missing metadata', undefined],
    ['foreign source kind', { patternReference: { kind: 'external', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [] }],
    ['blank source id', { patternReference: { kind: 'stock', id: ' ' }, patternName: 'Replacement', exportedSliders: [] }],
    ['guessed source text', { patternReference: { kind: 'stock', id: 'Replacement', code: newCode }, patternName: 'Replacement', exportedSliders: [] }],
    ['blank display name', { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: ' ', exportedSliders: [] }],
    ['non-slider descriptor', { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [{ kind: 'toggle', exportName: 'sliderLevel', label: 'Level' }] }],
    ['blank export', { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [{ kind: 'slider', exportName: ' ', label: 'Level' }] }],
    ['duplicate exports', { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [{ kind: 'slider', exportName: 'sliderLevel', label: 'Level' }, { kind: 'slider', exportName: 'sliderLevel', label: 'Again' }] }],
  ])('refuses %s without source parsing or partial replacement', (_name, replacement) => {
    const source = fixture()
    atomicRefusal(source, { ...intent(source), replacement } as ShowClipEditIntentV2)
  })

  it.each([
    ['missing plan', (value: ReturnType<typeof intent>) => { delete value.independence }],
    ['missing effective track', (value: ReturnType<typeof intent>) => { delete value.independence!.identitiesBySourceTrackId.level }],
    ['discarded track supplied', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.lost = { trackId: 'copy:lost', keyframeIdsBySourceId: { 'lost:start': 'copy:lost:start', 'lost:end': 'copy:lost:end' } } }],
    ['missing key', (value: ReturnType<typeof intent>) => { delete value.independence!.identitiesBySourceTrackId.level.keyframeIdsBySourceId['level:end'] }],
    ['extra key', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.level.keyframeIdsBySourceId.extra = 'copy:extra' }],
    ['blank runtime', (value: ReturnType<typeof intent>) => { value.independence!.instanceId = ' ' }],
    ['owned runtime', (value: ReturnType<typeof intent>) => { value.independence!.instanceId = 'instance' }],
    ['owned track', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.level.trackId = 'level' }],
    ['blank key', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.level.keyframeIdsBySourceId['level:start'] = ' ' }],
    ['owned key', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.level.keyframeIdsBySourceId['level:start'] = 'level:start' }],
    ['colliding copy tracks', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.speed.trackId = 'copy:level' }],
    ['colliding copy keys', (value: ReturnType<typeof intent>) => { value.independence!.identitiesBySourceTrackId.speed.keyframeIdsBySourceId['speed:start'] = 'copy:level:start' }],
  ])('refuses %s in the complete retained animation identity plan', (_name, mutate) => {
    const source = fixture(true)
    const value = intent(source, true)
    mutate(value)
    atomicRefusal(source, value)
  })

  it('refuses a fresh-runtime plan for a sole Clip rather than silently adding state', () => {
    const source = fixture()
    atomicRefusal(source, intent(source, true))
  })

  it.each([false, true])('preserves original identity on an all-compatible same-Pattern no-op (shared=%s)', shared => {
    const source = fixture(shared)
    const value = intent(source)
    value.replacement = { patternReference: structuredClone(source.composition.patternInstances[0].pattern), patternName: source.composition.patternInstances[0].patternName,
      exportedSliders: [{ exportName: 'sliderLevel', kind: 'slider', label: 'Level' }, { exportName: 'sliderLost', kind: 'slider', label: 'Lost' }] }
    const result = editShowClipV2(source, value)
    expect(result).toMatchObject({ status: 'unchanged', affectedClipIds: [], affectedInstanceIds: [], affectedTrackIds: [], affectedKeyframeIds: [], removedIds: [], discardedControlTargets: [] })
    expect(result.record).toBe(source)
  })

  it('rejects a malformed supplied plan even when the Pattern metadata is unchanged', () => {
    const source = fixture(true)
    const value = intent(source, true)
    value.replacement.patternReference = structuredClone(source.composition.patternInstances[0].pattern)
    value.replacement.patternName = source.composition.patternInstances[0].patternName
    value.replacement.exportedSliders = ['sliderLevel', 'sliderLost'].map(exportName => ({ exportName, kind: 'slider', label: exportName }))
    atomicRefusal(source, value)
  })

  it('validates a complete supplied no-op plan without creating its runtime or tracks', () => {
    const source = fixture(true)
    const value = intent(source, true)
    value.replacement.patternReference = structuredClone(source.composition.patternInstances[0].pattern)
    value.replacement.patternName = source.composition.patternInstances[0].patternName
    value.replacement.exportedSliders.push({ exportName: 'sliderLost', kind: 'slider', label: 'Lost' })
    value.independence!.identitiesBySourceTrackId.lost = { trackId: 'copy:lost', keyframeIdsBySourceId: { 'lost:start': 'copy:lost:start', 'lost:end': 'copy:lost:end' } }
    const before = structuredClone(source)
    const result = editShowClipV2(source, value)
    expect(result).toMatchObject({ status: 'unchanged', affectedClipIds: [], affectedInstanceIds: [], affectedTrackIds: [], affectedKeyframeIds: [], removedIds: [], discardedControlTargets: [] })
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('prunes stale metadata on the same source while preserving its current execution lifecycle', () => {
    const source = fixture()
    source.composition.executionModel = 'deterministic-loop'
    const value = intent(source)
    value.replacement.patternReference = structuredClone(source.composition.patternInstances[0].pattern)
    value.replacement.patternName = source.composition.patternInstances[0].patternName
    const result = editShowClipV2(source, value)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.executionModel).toBe('deterministic-loop')
    expect(result.record.composition.propertyTracks.map(track => track.id)).toEqual(['level', 'speed', 'appearance'])
    expect(result.record.composition.patternInstances[0].pattern).toEqual(source.composition.patternInstances[0].pattern)
  })

  it('rejects identities that collide with effective Group track and key owners', () => {
    const source = groupFixture()
    for (const collision of ['track', 'key']) {
      const value = intent(source, true)
      if (collision === 'track') value.independence!.identitiesBySourceTrackId.level.trackId = 'use:local:speed'
      else value.independence!.identitiesBySourceTrackId.level.keyframeIdsBySourceId['level:start'] = 'use:level:start'
      atomicRefusal(source, value)
    }
  })

  it.each([false, true])('retains only time-scale animation when the resolved Pattern exports no controls (shared=%s)', shared => {
    const source = fixture(shared)
    const value = intent(source, shared)
    value.replacement.exportedSliders = []
    if (value.independence) delete value.independence.identitiesBySourceTrackId.level
    const result = editShowClipV2(source, value)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances.find(instance => instance.id === (shared ? 'replacement' : 'instance'))!.controlTargets).toEqual({})
    expect(result.discardedControlTargets?.map(target => target.exportName)).toEqual(['sliderLevel', 'sliderLost'])
    expect(next.composition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === (shared ? 'replacement' : 'instance')).map(track => track.target.kind)).toEqual(['instance-time-scale'])
  })

  it('does not fill incoming defaults and reports a discarded static control without an animation owner', () => {
    const source = fixture()
    source.composition.patternInstances[0].controlTargets!.sliderStaticLost = 0.7
    const value = intent(source)
    value.replacement.exportedSliders.push({ exportName: 'sliderNew', kind: 'slider', label: 'New' })
    const result = editShowClipV2(source, value)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.patternInstances[0].controlTargets).toEqual({ sliderLevel: 0.2 })
    expect(result.discardedControlTargets?.map(target => target.exportName)).toEqual(['sliderLost', 'sliderStaticLost'])
  })

  it('refuses missing/materialized-only Clip targets and invalid preimages before any replacement', () => {
    const source = groupFixture()
    for (const clipId of ['missing', 'use:child']) atomicRefusal(source, { ...intent(source, true), clipId }, 'missing-clip')
    source.composition.clips[0].durationMs = -1
    atomicRefusal(source, intent(source), 'invalid-record')
  })

  it('preserves every compatible value and track for a trusted user Pattern, including absent static values', () => {
    const source = fixture()
    source.composition.patternInstances[0].controlTargets = undefined
    const value = intent(source)
    value.replacement.patternReference = { kind: 'user', id: 'resolved-user-pattern' }
    value.replacement.exportedSliders.push({ exportName: 'sliderLost', kind: 'slider', label: 'Lost' })
    const result = editShowClipV2(source, value)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances[0]).toEqual({ ...source.composition.patternInstances[0], pattern: value.replacement.patternReference, patternName: 'Replacement' })
    expect(next.composition.propertyTracks).toEqual(source.composition.propertyTracks)
    expect(result).toMatchObject({ affectedTrackIds: [], affectedKeyframeIds: [], removedIds: [], discardedControlTargets: [] })
  })

  it.each(['fast', 'fidelity'] as const)('preserves Restart entries and isolates only the selected new runtime in %s', fidelity => {
    const source = fixture(true)
    source.composition.propertyTracks = []
    source.composition.patternInstances[0].controlTargets = undefined
    source.composition.clips[0].entryPolicy = 'restart'
    source.composition.clips[1].startMs = 500
    source.composition.clips[1].durationMs = 1500
    source.composition.clips[1].appearance.keys[0].timeMs = 500
    source.composition.clips[1].entryPolicy = 'restart'
    const value = intent(source, true)
    value.replacement.exportedSliders = []
    const result = editShowClipV2(source, value)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(deriveShowRestartEventsV2(reopen(result.record))).toMatchObject({ status: 'derived', events: [
      { instanceId: 'replacement', atMs: 0, clipIds: ['clip'] }, { instanceId: 'instance', atMs: 500, clipIds: ['other'] },
    ] })
    const original = runtime(source, fidelity)
    const replaced = runtime(result.record, fidelity)
    const oldPrefix = original.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const retainedPrefix = replaced.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const newPrefix = replaced.artifact.summary.clips.find(member => member.id === 'replacement')!.prefix
    const a = original.replay.advanceTo(600, { stepMs: 1, forceFullIntermediateRender: true })
    const b = replaced.replay.advanceTo(600, { stepMs: 1, forceFullIntermediateRender: true })
    expect(b.exports[`${retainedPrefix}_elapsed`]).toEqual(a.exports[`${oldPrefix}_elapsed`])
    const scale = fidelity === 'fast' ? 1 : 65536
    expect(Math.abs(Number(b.exports[`${newPrefix}_elapsed`]) / scale - 600)).toBeLessThan(0.1)
    // Precise quantizes the event crossing; its independent preimage is the
    // exact state oracle above. Only the old shared member receives that reset.
    expect(Number(b.exports[`${retainedPrefix}_elapsed`])).toBeLessThan(Number(b.exports[`${newPrefix}_elapsed`]) / 2)
    expect(result.record.composition.clips.map(clip => clip.entryPolicy)).toEqual(['restart', 'restart'])
  })

  it('preserves attached Transition endpoint identities/settings through replacement and public preparation', () => {
    const source = fixture(true)
    source.composition.propertyTracks = []
    source.composition.clips[0].durationMs = 500
    const other = source.composition.clips[1]
    other.startMs = 800
    other.durationMs = 1200
    other.layerId = source.composition.clips[0].layerId
    other.appearance.keys[0].timeMs = 800
    other.appearance.keys[0].value.opacity = 1
    source.composition.transitions = [{ id: 'attached', kind: 'crossfade', durationMs: 300, easing: { curve: 'linear' }, crossfadePolicy: 'live-live', propertyRamps: [],
      participants: [{ id: 'participant', zoneId: other.zoneId, layerId: other.layerId, fromClipId: 'clip', toClipId: 'other' }] }]
    expect(prepared(source)).toMatchObject({ status: 'ready' })
    const result = editShowClipV2(source, intent(source, true))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.transitions).toEqual(source.composition.transitions)
    expect(prepared(result.record)).toMatchObject({ status: 'ready' })
  })

  it('refuses incompatible animation owned by a shared Group unused slot while preserving every owner', () => {
    const source = groupFixture(true)
    const before = structuredClone(source)
    expect(effectiveShowInstanceUseCountV2(source, 'instance')).toBe(1)
    expect(prepared(source)).toMatchObject({ status: 'ready' })
    const forced = structuredClone(source)
    forced.composition.patternInstances[0].pattern = { kind: 'stock', id: 'Replacement' }
    forced.composition.patternInstances[0].patternName = 'Replacement'
    forced.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2 }
    forced.composition.propertyTracks = forced.composition.propertyTracks.filter(track => track.id !== 'lost')
    expect(validateShowRecordV2(forced)).toEqual([])
    expect(prepared(forced)).toMatchObject({ status: 'refused', issues: [{ code: 'compiler-ineligible', message: 'This timing cannot be compiled yet.', detail: expect.stringContaining('sliderLost') }] })
    const result = editShowClipV2(source, intent(source))
    expect(result).toMatchObject({ status: 'refused', code: 'compiler-ineligible', affectedClipIds: [], affectedInstanceIds: [], affectedTrackIds: [], affectedKeyframeIds: [], removedIds: [], discardedControlTargets: [] })
    if (result.status !== 'refused') return
    for (const identity of ['sliderLost', 'instance', 'group', 'use', 'use:local:lost']) expect(result.message).toContain(`"${identity}"`)
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })
  it('replaces only the sole user, prunes incompatible values/tracks and preserves clock/appearance', () => {
    const source = fixture()
    source.composition.executionModel = 'deterministic-loop'
    source.composition.patternInstances[0].evaluationPolicy = 'rolling-refresh'
    source.composition.patternInstances[0].time = { timeScale: 0.75, timeOffsetMs: 150 }
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent(source))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances).toEqual([{ ...source.composition.patternInstances[0], pattern: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', controlTargets: { sliderLevel: 0.2 } }])
    expect(next.composition.propertyTracks).toEqual(source.composition.propertyTracks.filter(track => track.id !== 'lost'))
    expect(next.composition.clips).toEqual(source.composition.clips)
    expect(next.composition.executionModel).toBe('continuous')
    expect(result).toMatchObject({ affectedClipIds: ['clip'], affectedInstanceIds: ['instance'], affectedTrackIds: ['lost'], affectedKeyframeIds: ['lost:start', 'lost:end'], removedIds: ['lost', 'lost:start', 'lost:end'],
      discardedControlTargets: [{ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' }] })
    expect(source).toEqual(before)
    next.composition.patternInstances[0].controlTargets!.sliderLevel = 0
    expect(source).toEqual(before)
  })

  it('forks the selected shared ordinary Clip with the exact compatible animation plan and leaves the other user unchanged', () => {
    const source = fixture(true)
    source.composition.patternInstances[0].time = { timeScale: 0.75, timeOffsetMs: 150 }
    source.composition.patternInstances[0].evaluationPolicy = 'rolling-refresh'
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent(source, true))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.clips[0]).toEqual({ ...source.composition.clips[0], instanceId: 'replacement' })
    expect(next.composition.clips[1]).toEqual(source.composition.clips[1])
    expect(next.composition.patternInstances[0]).toEqual(source.composition.patternInstances[0])
    expect(next.composition.propertyTracks.slice(0, source.composition.propertyTracks.length)).toEqual(source.composition.propertyTracks)
    expect(next.composition.propertyTracks.slice(source.composition.propertyTracks.length).map(track => track.id)).toEqual(['copy:level', 'copy:speed'])
    expect(next.composition.patternInstances[1].controlTargets).toEqual({ sliderLevel: 0.2 })
    expect(next.composition.patternInstances[1]).toEqual({ ...source.composition.patternInstances[0], id: 'replacement', pattern: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', controlTargets: { sliderLevel: 0.2 } })
    expect(result).toMatchObject({ affectedInstanceIds: ['replacement'], affectedTrackIds: ['copy:level', 'copy:speed'], removedIds: [],
      discardedControlTargets: [{ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' }] })
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('reopens the resolved new Pattern and retained nonlinear animation in %s', fidelity => {
    const source = fixture(true)
    const result = editShowClipV2(source, intent(source, true))
    if (result.status !== 'changed') throw new Error('Replacement failed')
    const old = runtime(source, fidelity)
    const next = runtime(result.record, fidelity)
    expect(old.memberSource('instance').length).toBeGreaterThan(0)
    expect(normalizedPrivateSymbols(next.memberSource('instance'))).toEqual(normalizedPrivateSymbols(old.memberSource('instance')))
    const originalPrefix = old.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const retainedPrefix = next.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const replacedPrefix = next.artifact.summary.clips.find(member => member.id === 'replacement')!.prefix
    expect(next.artifact.summary.clips).toHaveLength(2)
    for (const atMs of [0, 250, 499, 500, 999]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = next.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(b.frame[0]).toBe(0)
      expect(b.frame[2]).toEqual(a.frame[0])
      for (const variable of ['level', 'elapsed']) expect(b.exports[`${retainedPrefix}_${variable}`]).toEqual(a.exports[`${originalPrefix}_${variable}`])
      expect(b.exports[`${replacedPrefix}_elapsed`]).toEqual(a.exports[`${originalPrefix}_elapsed`])
      if (atMs === 250) expect(Math.abs(b.frame[2] - 0.5)).toBeLessThan(fidelity === 'fast' ? 1e-8 : 0.02)
    }
  })

  it.each(['fast', 'fidelity'] as const)('copies compatible Group animation while retaining the other Group user and compiled member in %s', fidelity => {
    const source = groupFixture()
    // The selected ordinary Clip is inactive throughout this Group's window,
    // so its intentionally changed Pattern cannot mask the other user's output.
    source.composition.clips[0].durationMs = 1000
    const before = structuredClone(source)
    const result = editShowClipV2(source, intent(source, true))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupDefinitions).toEqual(source.composition.groupDefinitions)
    expect(next.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
    expect(next.composition.patternInstances[0]).toEqual(source.composition.patternInstances[0])
    expect(next.composition.propertyTracks.slice(0, source.composition.propertyTracks.length)).toEqual(source.composition.propertyTracks)
    expect(result.affectedTrackIds).toEqual(['copy:level', 'copy:speed', 'copy:use:local:level', 'copy:use:local:speed'])
    expect(result.discardedControlTargets).toEqual([
      { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' },
      { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' },
    ])
    const original = runtime(source, fidelity)
    const replaced = runtime(next, fidelity)
    expect(original.memberSource('instance').length).toBeGreaterThan(0)
    expect(normalizedPrivateSymbols(replaced.memberSource('instance'))).toEqual(normalizedPrivateSymbols(original.memberSource('instance')))
    const retainedPrefix = replaced.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const oldPrefix = original.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    for (const atMs of [1199, 1200, 1400, 1599, 1600]) {
      const a = original.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = replaced.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(b.exports[`${retainedPrefix}_level`]).toEqual(a.exports[`${oldPrefix}_level`])
      expect(Array.from(b.frame), `unchanged Group user at ${atMs}`).toEqual(Array.from(a.frame))
    }
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('reopens copied Group animation driving the selected replacement while the Group is invisible in %s', fidelity => {
    const source = groupFixture()
    source.composition.groupDefinitions[0].clips[0].appearance.keys[0].value.opacity = 0
    const result = editShowClipV2(source, intent(source, true))
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const original = runtime(source, fidelity)
    const replaced = runtime(reopen(result.record), fidelity)
    const oldPrefix = original.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const newPrefix = replaced.artifact.summary.clips.find(member => member.id === 'replacement')!.prefix
    for (const atMs of [1199, 1200, 1400, 1599, 1600]) {
      const a = original.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = replaced.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(b.exports[`${newPrefix}_level`]).toEqual(a.exports[`${oldPrefix}_level`])
      expect(b.frame[0]).toBe(0)
      expect(b.frame[2]).toEqual(a.frame[0])
      // Precise quantizes the global clock across preceding sections. Its
      // independently prepared preimage above is the exact replay oracle.
      if (atMs === 1400 && fidelity === 'fast') expect(Math.abs(b.frame[2] - 0.5)).toBeLessThan(1e-8)
    }
    const originalTrack = materializeShowGroupsV2(source).composition.propertyTracks.find(track => track.id === 'use:local:level')!
    const copiedTrack = result.record.composition.propertyTracks.find(track => track.id === 'copy:use:local:level')!
    expect(evaluateShowPropertyTrackV2(originalTrack, 1400)).toBeCloseTo(0.5, 10)
    expect(evaluateShowPropertyTrackV2(copiedTrack, 1400)).toEqual(evaluateShowPropertyTrackV2(originalTrack, 1400))
  })
})
