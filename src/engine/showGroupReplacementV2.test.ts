import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { defaultGroupRuntimeIdV2, groupRuntimeBindings, materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { buildShowEpeExport } from './showEpeExport'
import { parseEpe } from './epeImport'
import { LIBRARIES } from '../pixelblaze/libs'
import { buildDeliveredShowSourceInventory } from './showSourceInventory'
import { makeShowGroupUniqueV2 } from './showGroupEditsV2'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { replaceShowGroupDefinitionClipPatternV2, type ReplaceShowGroupDefinitionClipPatternIntentV2 } from './showGroupReplacementV2'

function fixture(sharedLocal = false): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.showEndMs = 2000
  record.composition.layoutOccurrences[0].durationMs = 2000
  record.composition.clips[0].durationMs = 2000
  record.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2, sliderLost: 0.4 }
  const { zoneId: _zone, ...child } = structuredClone(record.composition.clips[0])
  const first = { ...child, id: 'child', instanceId: 'slot', layerId: 'local', durationMs: sharedLocal ? 200 : 400,
    appearance: { keys: [{ ...structuredClone(child.appearance.keys[0]), id: 'child:key' }] } }
  record.composition.groupDefinitions = [{ id: 'group', name: 'Linked',
    patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot' }],
    layers: [{ id: 'local', name: 'Local', rank: 0 }],
    clips: [first, ...(sharedLocal ? [{ ...structuredClone(first), id: 'other-child', startMs: 200,
      appearance: { keys: [{ ...structuredClone(first.appearance.keys[0]), id: 'other-child:key', timeMs: 200 }] } }] : [])],
    transitions: [], propertyTracks: [
      { id: 'level', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 400,
        keyframes: [{ id: 'level:start', timeMs: 0, value: 0.2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level:end', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] },
      { id: 'lost', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLost' }, activeStartMs: 0, activeDurationMs: 400,
        keyframes: [{ id: 'lost:start', timeMs: 0, value: 0.4, easing: { curve: 'linear' } }, { id: 'lost:end', timeMs: 400, value: 0.6, easing: { curve: 'linear' } }] },
      { id: 'speed', target: { kind: 'instance-time-scale', instanceId: 'slot' }, activeStartMs: 0, activeDurationMs: 400,
        keyframes: [{ id: 'speed:start', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'speed:end', timeMs: 400, value: 1.5, easing: { curve: 'linear' } }] },
    ],
  }]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function dormantIntent(): Extract<ReplaceShowGroupDefinitionClipPatternIntentV2, { context: 'dormant-definition' }> {
  return { definitionId: 'group', clipId: 'child', context: 'dormant-definition', slot: { kind: 'retain' },
    replacement: { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement',
      exportedSliders: [{ kind: 'slider', exportName: 'sliderLevel', label: 'Level' }] } }
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  expect(validateShowRecordV2(record)).toEqual([])
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Reopen failed')
  expect(opened.record).toEqual(record)
  return opened.record
}

function dormantSplitIntent(): Extract<ReplaceShowGroupDefinitionClipPatternIntentV2, { context: 'dormant-definition' }> {
  return { ...dormantIntent(), slot: { kind: 'split', slotId: 'replacement-slot', localTrackIdentitiesBySourceTrackId: {
    level: { trackId: 'copy-level', keyframeIdsBySourceId: { 'level:start': 'copy-level:start', 'level:end': 'copy-level:end' } },
    speed: { trackId: 'copy-speed', keyframeIdsBySourceId: { 'speed:start': 'copy-speed:start', 'speed:end': 'copy-speed:end' } },
  } } }
}

function linkedFixture(starts = [1200], defaults = false): ShowRecordV2 {
  const source = fixture()
  source.composition.clips[0].durationMs = 1000
  source.composition.groupOccurrences = starts.map((startMs, index) => ({ id: `use-${index}`, definitionId: 'group', startMs,
    layoutOccurrenceId: source.composition.layoutOccurrences[0].id, zoneId: source.composition.clips[0].zoneId,
    translationX: 0, translationY: 0, holds: [], layerBindings: [{ definitionLayerId: 'local', layerId: source.composition.clips[0].layerId }],
    ...(defaults ? {} : { instanceBindings: { slot: 'instance' } }),
  }))
  expect(validateShowRecordV2(source)).toEqual([])
  return source
}
type LinkedIntent = Omit<Extract<ReplaceShowGroupDefinitionClipPatternIntentV2, { context: 'linked-occurrences' }>, 'runtimePlansBySourceRuntimeId'> & {
  runtimePlansBySourceRuntimeId: Record<string, { kind: 'retain' } | { kind: 'independent'; instanceId: string;
    identitiesBySourceTrackId: Record<string, { trackId: string; keyframeIdsBySourceId: Record<string, string> }> }>
}
function linkedIntent(source: ShowRecordV2, definitionId = 'group', clipId = 'child'): LinkedIntent {
  const expanded = materializeShowGroupsV2(source)
  const slotId = source.composition.groupDefinitions.find(definition => definition.id === definitionId)!.clips.find(clip => clip.id === clipId)!.instanceId
  const ids = [...new Set(groupRuntimeBindings(source).filter(binding => binding.definitionId === definitionId && binding.slotId === slotId).map(binding => binding.runtimeId))]
  return { ...dormantIntent(), definitionId, clipId, context: 'linked-occurrences', slot: { kind: 'split', slotId: 'replacement-slot' },
    runtimePlansBySourceRuntimeId: Object.fromEntries(ids.map((id, index) => [id, { kind: 'independent', instanceId: `new-${index}`,
      identitiesBySourceTrackId: Object.fromEntries(expanded.composition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === id
        && (track.target.kind !== 'instance-control' || track.target.exportName === 'sliderLevel')).map(track => [track.id, {
          trackId: `new-${index}:${track.id}`, keyframeIdsBySourceId: Object.fromEntries(track.keyframes.map(key => [key.id, `new-${index}:${key.id}`])),
        }])),
    }])) }
}
const oldCode = 'export var level = 0.2; var lost = 0.4; export var elapsed = 0; export function sliderLevel(v) { level = v } export function sliderLost(v) { lost = v } export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(level, 0, 0) }'
const newCode = 'export var level = 0.9; export var elapsed = 0; export function sliderLevel(v) { level = v } export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(0, 0, level) }'

it.each(['fast', 'fidelity'] as const)('keeps unrelated top-level animation when an incompatible Group-local track has the same scoped ID in %s', fidelity => {
  const source = linkedFixture([1200], true)
  source.composition.propertyTracks = [{
    id: 'lost', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' },
    activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'lost:start', timeMs: 0, value: .3, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'lost:end', timeMs: 1000, value: .7, easing: { curve: 'linear' } }],
  }]
  const other = structuredClone(source.composition.groupDefinitions[0])
  other.id = 'dormant-other'
  source.composition.groupDefinitions.push(other)
  const before = structuredClone(source)
  const old = runtime(source, fidelity)
  const intent = linkedIntent(source)
  intent.slot = { kind: 'retain' }
  intent.runtimePlansBySourceRuntimeId = { [defaultGroupRuntimeIdV2('group', 'slot')]: { kind: 'retain' } }
  const result = replaceShowGroupDefinitionClipPatternV2(source, intent)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(source).toEqual(before)
  expect(reopen(result.record).composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(result.record.composition.groupDefinitions[1]).toEqual(before.composition.groupDefinitions[1])
  expect(result.record.composition.groupDefinitions[0].propertyTracks.map(track => track.id)).toEqual(['level', 'speed'])
  const changed = runtime(result.record, fidelity)
  expect(normalizedPrivateSymbols(changed.memberSource('instance'))).toBe(normalizedPrivateSymbols(old.memberSource('instance')))
  const oldPrefix = old.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
  const prefix = changed.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
  for (const atMs of [101, 251, 501, 751, 999]) {
    const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(b.frame).toEqual(a.frame)
    for (const name of ['level', 'elapsed']) expect(b.exports[`${prefix}_${name}`]).toEqual(a.exports[`${oldPrefix}_${name}`])
  }
})

it.each(['fast', 'fidelity'] as const)('prunes an incompatible top-level owner while retaining a compatible same-ID local track and its scoped keys in %s', fidelity => {
  const source = linkedFixture([1200], true)
  const definition = source.composition.groupDefinitions[0]
  definition.propertyTracks.find(track => track.id === 'lost')!.id = 'incompatible'
  const compatibleLocal = definition.propertyTracks.find(track => track.id === 'level')!
  compatibleLocal.id = 'lost'
  const sourceId = defaultGroupRuntimeIdV2('group', 'slot')
  source.composition.patternInstances.push({ ...structuredClone(definition.patternInstances[0]), id: sourceId })
  source.composition.propertyTracks = [{
    id: 'lost', target: { kind: 'instance-control', instanceId: sourceId, exportName: 'sliderLost' },
    activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'level:start', timeMs: 0, value: .4, easing: { curve: 'linear' } }, { id: 'level:end', timeMs: 1000, value: .6, easing: { curve: 'linear' } }],
  }]
  const before = structuredClone(source)
  const old = runtime(source, fidelity)
  const intent = linkedIntent(source)
  intent.slot = { kind: 'retain' }
  intent.runtimePlansBySourceRuntimeId = { [sourceId]: { kind: 'retain' } }
  const result = replaceShowGroupDefinitionClipPatternV2(source, intent)
  expect(result.status, JSON.stringify(result)).toBe('changed')
  expect(source).toEqual(before)
  expect(result.record.composition.propertyTracks).toEqual([])
  expect(result.record.composition.groupDefinitions[0].propertyTracks.find(track => track.id === 'lost')).toEqual(compatibleLocal)
  expect(result.record.composition.groupDefinitions[0].propertyTracks.map(track => track.id)).toEqual(['lost', 'speed'])
  const changed = runtime(reopen(result.record), fidelity)
  const oldPrefix = old.artifact.summary.clips.find(member => member.id === sourceId)!.prefix
  const prefix = changed.artifact.summary.clips.find(member => member.id === sourceId)!.prefix
  for (const atMs of [1251, 1301, 1401, 1501]) {
    const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(b.frame[2]).toEqual(a.frame[0])
    expect(b.exports[`${prefix}_level`]).toEqual(a.exports[`${oldPrefix}_level`])
  }
})

it('dormant local pruning preserves a same-ID top-level owner and keys in their separate scope', () => {
  const source = fixture()
  source.composition.propertyTracks = [{
    id: 'lost', target: { kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'lost:start', timeMs: 0, value: .3, easing: { curve: 'linear' } }, { id: 'lost:end', timeMs: 1000, value: .7, easing: { curve: 'linear' } }],
  }]
  const before = structuredClone(source)
  const result = replaceShowGroupDefinitionClipPatternV2(source, dormantIntent())
  expect(result.status).toBe('changed')
  expect(reopen(result.record).composition.propertyTracks).toEqual(before.composition.propertyTracks)
  expect(result.record.composition.groupDefinitions[0].propertyTracks.map(track => track.id)).toEqual(['level', 'speed'])
  expect(source).toEqual(before)
})

function runtime(source: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const record = reopen(source)
  const prepared = prepareShowV2ForCompile(record, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, instance.pattern.id === 'Replacement' ? newCode : oldCode])),
  }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(prepared.recipe, LIBRARIES)
  const opened = parseEpe(buildShowEpeExport(convertibleV1Show(), artifact.code, { id: 'group-replace', stampedAt: '2026-09-16T00:00:00Z' }).text)
  expect(opened.stamp?.kind).toBe('show')
  const inventory = buildDeliveredShowSourceInventory(artifact.summary.sourceInventory, artifact.code, opened.src)
  const bytes = new TextEncoder().encode(opened.src)
  const memberSource = (id: string) => inventory.chunks.filter(chunk => chunk.ownerId === id && chunk.patternPart === 'compiled-pattern')
    .map(chunk => new TextDecoder().decode(bytes.slice(chunk.startByte, chunk.endByte))).join('')
  return { artifact, memberSource, replay: createFastReplayRuntime({ ...artifact, code: opened.src, dimension: 2 }, { fidelity, randomSeed: 1038,
    mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
  }) }
}

function normalizedPrivateSymbols(source: string): string {
  const bijection = new Map<string, string>()
  return source.replace(/\b__pxlblz_[A-Za-z0-9_$]+\b/g, name => {
    if (!bijection.has(name)) bijection.set(name, `generated_${bijection.size}`)
    return bijection.get(name)!
  })
}

describe('definition-local Group Clip Pattern replacement', () => {
  function atomicRefusal(source: ShowRecordV2, value: ReplaceShowGroupDefinitionClipPatternIntentV2) {
    const before = structuredClone(source)
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status).toBe('refused')
    expect(result.record).toBe(source)
    for (const [key, collection] of Object.entries(result)) if (key.startsWith('affected') || key === 'hoistedInstanceIds' || key === 'removedIds' || key === 'discardedControlTargets') expect(collection, key).toEqual([])
    expect(source).toEqual(before)
  }

  it.each([
    ['missing slot plan', (value: ReturnType<typeof dormantSplitIntent>) => { value.slot = { kind: 'retain' } }],
    ['owned slot', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.slotId = 'slot' }],
    ['blank slot', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.slotId = ' ' }],
    ['missing retained track', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') delete value.slot.localTrackIdentitiesBySourceTrackId.speed }],
    ['discarded track supplied', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.lost = { trackId: 'copy-lost', keyframeIdsBySourceId: {} } }],
    ['owned track', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.level.trackId = 'speed' }],
    ['missing key', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') delete value.slot.localTrackIdentitiesBySourceTrackId.level.keyframeIdsBySourceId['level:end'] }],
    ['extra key', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.level.keyframeIdsBySourceId.extra = 'copy-extra' }],
    ['owned key', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.level.keyframeIdsBySourceId['level:start'] = 'level:start' }],
    ['blank key', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.level.keyframeIdsBySourceId['level:start'] = ' ' }],
    ['colliding planned track', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.speed.trackId = 'copy-level' }],
    ['colliding planned key', (value: ReturnType<typeof dormantSplitIntent>) => { if (value.slot.kind === 'split') value.slot.localTrackIdentitiesBySourceTrackId.speed.keyframeIdsBySourceId['speed:start'] = 'copy-level:start' }],
  ] as const)('refuses dormant %s atomically', (_name, mutate) => {
    const source = fixture(true)
    const value = dormantSplitIntent()
    mutate(value)
    atomicRefusal(source, value)
  })

  it.each([
    ['missing runtime', (value: ReturnType<typeof linkedIntent>) => { delete value.runtimePlansBySourceRuntimeId.instance }],
    ['extra runtime', (value: ReturnType<typeof linkedIntent>) => { value.runtimePlansBySourceRuntimeId.extra = { kind: 'retain' } }],
    ['implicit shared retention', (value: ReturnType<typeof linkedIntent>) => { value.runtimePlansBySourceRuntimeId.instance = { kind: 'retain' } }],
    ['missing split', (value: ReturnType<typeof linkedIntent>) => { value.slot = { kind: 'retain' } }],
    ['blank destination', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') plan.instanceId = ' ' }],
    ['owned destination', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') plan.instanceId = 'instance' }],
    ['local instead of effective source identity', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') { plan.identitiesBySourceTrackId.level = plan.identitiesBySourceTrackId['use-0:level']; delete plan.identitiesBySourceTrackId['use-0:level'] } }],
    ['missing effective track', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') delete plan.identitiesBySourceTrackId['use-0:speed'] }],
    ['discarded effective track supplied', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') plan.identitiesBySourceTrackId['use-0:lost'] = { trackId: 'copy-lost', keyframeIdsBySourceId: {} } }],
    ['extra effective key', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') plan.identitiesBySourceTrackId['use-0:level'].keyframeIdsBySourceId.extra = 'extra' }],
    ['owned raw key', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') plan.identitiesBySourceTrackId['use-0:level'].keyframeIdsBySourceId['use-0:level:start'] = 'level:start' }],
    ['blank track', (value: ReturnType<typeof linkedIntent>) => { const plan = value.runtimePlansBySourceRuntimeId.instance; if (plan.kind === 'independent') plan.identitiesBySourceTrackId['use-0:level'].trackId = ' ' }],
  ] as const)('refuses linked %s atomically', (_name, mutate) => {
    const source = linkedFixture()
    const value = linkedIntent(source)
    mutate(value)
    atomicRefusal(source, value)
  })

  it('validates dormant no-op identity and rejects contradictory target/context or an unnecessary split', () => {
    const source = fixture()
    const value = dormantIntent()
    value.replacement = { patternReference: structuredClone(source.composition.groupDefinitions[0].patternInstances[0].pattern), patternName: source.composition.groupDefinitions[0].patternInstances[0].patternName,
      exportedSliders: [{ kind: 'slider', exportName: 'sliderLevel', label: 'Level' }, { kind: 'slider', exportName: 'sliderLost', label: 'Lost' }] }
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(source)
    expect(result.affectedInstanceIds).toEqual([])
    atomicRefusal(source, { ...value, definitionId: 'missing' })
    atomicRefusal(source, { ...value, clipId: 'use-0:child' })
    atomicRefusal(source, dormantSplitIntent())
    atomicRefusal(linkedFixture(), value)
  })

  it('validates a complete shared linked no-op plan before returning original identity with no affected owners', () => {
    const source = linkedFixture()
    const value = linkedIntent(source)
    value.replacement = { patternReference: structuredClone(source.composition.patternInstances[0].pattern), patternName: source.composition.patternInstances[0].patternName,
      exportedSliders: [{ kind: 'slider', exportName: 'sliderLevel', label: 'Level' }, { kind: 'slider', exportName: 'sliderLost', label: 'Lost' }] }
    const plan = value.runtimePlansBySourceRuntimeId.instance
    if (plan.kind !== 'independent') throw new Error('Bad test plan')
    plan.identitiesBySourceTrackId['use-0:lost'] = { trackId: 'copy-lost', keyframeIdsBySourceId: { 'use-0:lost:start': 'copy-lost:start', 'use-0:lost:end': 'copy-lost:end' } }
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(source)
    expect(result.affectedInstanceIds).toEqual([])
    delete plan.identitiesBySourceTrackId['use-0:lost']
    atomicRefusal(source, value)
  })

  it('prunes an incompatible stale local-template static value even when the authoritative linked runtime already has the incoming Pattern', () => {
    const source = linkedFixture()
    source.composition.groupDefinitions[0].propertyTracks = []
    for (const instance of [source.composition.patternInstances[0], source.composition.groupDefinitions[0].patternInstances[0]]) {
      instance.pattern = { kind: 'stock', id: 'Replacement' }
      instance.patternName = 'Replacement'
    }
    source.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2 }
    runtime(source, 'fast')
    const value = linkedIntent(source)
    value.slot = { kind: 'retain' }
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.groupDefinitions[0].patternInstances[0].controlTargets).toEqual({ sliderLevel: 0.2 })
    expect(result.record.composition.patternInstances[0]).toEqual(source.composition.patternInstances[0])
    expect(result.discardedControlTargets).toEqual([{ kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLost' }])
  })

  it.each(['fast', 'fidelity'] as const)('keeps two distinct shared source classes separate and copies each authoritative payload once in %s', fidelity => {
    const source = linkedFixture([1000, 1400])
    const other = { ...structuredClone(source.composition.patternInstances[0]), id: 'other-runtime', time: { timeScale: 1.5, timeOffsetMs: 250 }, controlTargets: { sliderLevel: 0.6, sliderLost: 0.3 } }
    source.composition.patternInstances.push(other)
    const clip = structuredClone(source.composition.clips[0])
    source.composition.clips.push({ ...clip, id: 'other-ordinary', instanceId: other.id, layerId: source.composition.layers[1].id,
      appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'other-ordinary:key', value: { ...structuredClone(clip.appearance.keys[0].value), opacity: 0 } }] } })
    source.composition.groupOccurrences[1].instanceBindings = { slot: other.id }
    const before = structuredClone(source)
    const old = runtime(source, fidelity)
    const value = linkedIntent(source)
    const collision = structuredClone(value)
    const second = collision.runtimePlansBySourceRuntimeId[other.id]
    if (second.kind !== 'independent') throw new Error('Bad test plan')
    second.instanceId = 'new-0'
    atomicRefusal(source, collision)
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances.slice(0, 2)).toEqual(source.composition.patternInstances)
    expect(next.composition.groupOccurrences.map(occurrence => occurrence.instanceBindings?.['replacement-slot'])).toEqual(['new-0', 'new-1'])
    expect(next.composition.patternInstances.find(instance => instance.id === 'new-1')).toEqual({ ...other, id: 'new-1', pattern: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', controlTargets: { sliderLevel: 0.6 } })
    const changed = runtime(next, fidelity)
    for (const id of ['instance', other.id]) {
      expect(old.memberSource(id).length).toBeGreaterThan(0)
      expect(normalizedPrivateSymbols(changed.memberSource(id))).toEqual(normalizedPrivateSymbols(old.memberSource(id)))
    }
    // The shared ordinary users contribute at500; the selected Group uses
    // contribute in the later samples. Precise can cross a nominal1000 edge
    // before advanceTo(999), so that sample cannot isolate the ordinary user.
    for (const atMs of [500, 1001, 1201, 1601]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      if (atMs < 1000) {
        expect(a.frame).toEqual(b.frame)
        for (const id of ['instance', other.id]) {
          const oldPrefix = old.artifact.summary.clips.find(member => member.id === id)!.prefix
          const newPrefix = changed.artifact.summary.clips.find(member => member.id === id)!.prefix
          for (const name of ['level', 'elapsed']) expect(b.exports[`${newPrefix}_${name}`]).toEqual(a.exports[`${oldPrefix}_${name}`])
        }
      } else expect(b.frame[2]).toEqual(a.frame[0])
    }
    expect(source).toEqual(before)
    result.record.composition.patternInstances[0].time.timeScale = 99
    result.record.composition.groupDefinitions[0].clips[0].appearance.keys[0].value.opacity = 0
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('splits only the selected local Clip from a shared slot and preserves the other child contribution in %s', fidelity => {
    const source = linkedFixture()
    source.composition.groupDefinitions = fixture(true).composition.groupDefinitions
    const before = structuredClone(source)
    const old = runtime(source, fidelity)
    const result = replaceShowGroupDefinitionClipPatternV2(source, linkedIntent(source))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupDefinitions[0].clips[1]).toEqual(source.composition.groupDefinitions[0].clips[1])
    expect(next.composition.groupDefinitions[0].propertyTracks).toEqual(source.composition.groupDefinitions[0].propertyTracks)
    const changed = runtime(next, fidelity)
    for (const atMs of [1300, 1500, 1599]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      if (atMs < 1400) expect(b.frame[2]).toEqual(a.frame[0])
      else expect(b.frame).toEqual(a.frame)
    }
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('preserves held nonlinear global animation and repeated Restart sharing in %s', fidelity => {
    const source = linkedFixture([1000, 1500], true)
    source.composition.groupDefinitions[0].clips[0].entryPolicy = 'restart'
    for (const occurrence of source.composition.groupOccurrences) occurrence.holds = [{ id: 'pause', localTimeMs: 100, durationMs: 100 }]
    const before = structuredClone(source)
    const old = runtime(source, fidelity)
    const result = replaceShowGroupDefinitionClipPatternV2(source, linkedIntent(source))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupOccurrences.map(occurrence => occurrence.holds)).toEqual(source.composition.groupOccurrences.map(occurrence => occurrence.holds))
    expect(next.composition.groupDefinitions[0].clips[0].entryPolicy).toBe('restart')
    expect(next.composition.groupDefinitions[0].propertyTracks).toEqual(source.composition.groupDefinitions[0].propertyTracks)
    const changed = runtime(next, fidelity)
    const oldId = defaultGroupRuntimeIdV2('group', 'slot')
    const oldPrefix = old.artifact.summary.clips.find(member => member.id === oldId)!.prefix
    const prefix = changed.artifact.summary.clips.find(member => member.id === 'new-0')!.prefix
    // At the Score-loop boundary both artifacts return to the unchanged
    // ordinary user. Nominal1999 can already wrap in Precise; use the explicit
    // post-loop sample to keep contributor attribution unambiguous.
    for (const atMs of [1101, 1150, 1300, 1499, 1501, 1601, 1800, 2001]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      if (atMs === 2001) expect(b.frame).toEqual(a.frame)
      else expect(b.frame[2], `${fidelity} held output at ${atMs}; before ${Array.from(a.frame)} after ${Array.from(b.frame)}`).toEqual(a.frame[0])
      for (const name of ['level', 'elapsed']) expect(b.exports[`${prefix}_${name}`], `${fidelity} held ${name} at ${atMs}`).toEqual(a.exports[`${oldPrefix}_${name}`])
    }
    expect(source).toEqual(before)
  })

  it('replaces a sole default-bound runtime by hoisting updated authority under the same stable ID', () => {
    const source = linkedFixture([1000], true)
    const sourceId = defaultGroupRuntimeIdV2('group', 'slot')
    const value = linkedIntent(source)
    value.slot = { kind: 'retain' }
    value.runtimePlansBySourceRuntimeId = { [sourceId]: { kind: 'retain' } }
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances.map(instance => instance.id)).toEqual(['instance', sourceId])
    expect(next.composition.patternInstances[1]).toEqual({ ...source.composition.groupDefinitions[0].patternInstances[0], id: sourceId,
      pattern: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', controlTargets: { sliderLevel: 0.2 } })
    expect(result.hoistedInstanceIds).toEqual([sourceId])
    expect(materializeShowGroupsV2(next).composition.clips.find(clip => clip.id === 'use-0:child')?.instanceId).toBe(sourceId)
    expect(runtime(next, 'fast').artifact.summary.clips.some(member => member.id === sourceId)).toBe(true)
  })

  it('replaces a structurally unique definition while preserving its originally linked occurrence and runtime member', () => {
    const source = linkedFixture([1000, 1400], true)
    const definition = source.composition.groupDefinitions[0]
    const unique = makeShowGroupUniqueV2(source, { kind: 'make-unique', occurrenceId: 'use-1', identities: {
      definitionId: 'unique-group', patternInstanceIds: { slot: 'unique-slot' }, layerIds: { local: 'unique-layer' }, clipIds: { child: 'unique-child' }, transitionIds: {},
      propertyTrackIds: { level: 'unique-level', lost: 'unique-lost', speed: 'unique-speed' },
      appearanceKeyIdsByClipId: { child: { 'child:key': 'unique-child:key' } },
      propertyKeyIdsByTrackId: Object.fromEntries(definition.propertyTracks.map(track => [track.id, Object.fromEntries(track.keyframes.map(key => [key.id, `unique:${key.id}`]))])),
    } })
    expect(unique.status).toBe('changed')
    if (unique.status !== 'changed') return
    const before = structuredClone(unique.record)
    const old = runtime(unique.record, 'fast')
    const result = replaceShowGroupDefinitionClipPatternV2(unique.record, linkedIntent(unique.record, 'unique-group', 'unique-child'))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupDefinitions[0]).toEqual(before.composition.groupDefinitions[0])
    expect(next.composition.groupOccurrences[0]).toEqual(before.composition.groupOccurrences[0])
    expect(next.composition.patternInstances.slice(0, before.composition.patternInstances.length)).toEqual(before.composition.patternInstances)
    expect(result.affectedGroupDefinitionIds).toEqual(['unique-group'])
    expect(result.affectedGroupOccurrenceIds).toEqual(['use-1'])
    const changed = runtime(next, 'fast')
    const originalId = defaultGroupRuntimeIdV2('group', 'slot')
    expect(normalizedPrivateSymbols(changed.memberSource(originalId))).toEqual(normalizedPrivateSymbols(old.memberSource(originalId)))
    for (const atMs of [1200, 1600]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      if (atMs === 1200) expect(b.frame).toEqual(a.frame)
      else expect(b.frame[2]).toEqual(a.frame[0])
    }
    expect(unique.record).toEqual(before)
  })

  it('preserves an attached Group Crossfade endpoint and admitted preparation after selected local-slot replacement', () => {
    const source = linkedFixture()
    const definition = source.composition.groupDefinitions[0]
    definition.propertyTracks = []
    definition.clips[0].durationMs = 100
    definition.clips.push({ ...structuredClone(definition.clips[0]), id: 'incoming', startMs: 400,
      appearance: { keys: [{ ...structuredClone(definition.clips[0].appearance.keys[0]), id: 'incoming:key', timeMs: 400 }] } })
    definition.transitions = [{ id: 'fade', fromPlacementId: 'child', toPlacementId: 'incoming', kind: 'crossfade', durationMs: 300,
      easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
    const old = runtime(source, 'fast')
    const before = structuredClone(source)
    const result = replaceShowGroupDefinitionClipPatternV2(source, linkedIntent(source))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupDefinitions[0].transitions).toEqual(definition.transitions)
    expect(materializeShowGroupsV2(next).composition.transitions).toEqual(materializeShowGroupsV2(source).composition.transitions)
    const changed = runtime(next, 'fast')
    for (const atMs of [500, 1250, 1650]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      if (atMs === 1250) expect(b.frame[2]).toEqual(a.frame[0])
      else expect(b.frame).toEqual(a.frame)
    }
    expect(source).toEqual(before)
  })

  it('rejects a dormant split whose derived default runtime already has top-level authority', () => {
    const source = fixture(true)
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: defaultGroupRuntimeIdV2('group', 'replacement-slot') })
    atomicRefusal(source, dormantSplitIntent())
  })

  it.each([
    undefined,
    { patternReference: { kind: 'external', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [] },
    { patternReference: { kind: 'stock', id: ' ' }, patternName: 'Replacement', exportedSliders: [] },
    { patternReference: { kind: 'stock', id: 'Replacement', code: newCode }, patternName: 'Replacement', exportedSliders: [] },
    { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: ' ', exportedSliders: [] },
    { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [{ kind: 'toggle', exportName: 'sliderLevel', label: 'Level' }] },
    { patternReference: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', exportedSliders: [{ kind: 'slider', exportName: 'sliderLevel', label: 'One' }, { kind: 'slider', exportName: 'sliderLevel', label: 'Two' }] },
  ])('refuses unresolved or malformed replacement metadata %j without parsing source', replacement => {
    const source = fixture()
    atomicRefusal(source, { ...dormantIntent(), replacement } as unknown as ReplaceShowGroupDefinitionClipPatternIntentV2)
  })

  it('compares the existing unused ordinary-instance animation boundary without discarding persisted animation', () => {
    const source = fixture()
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'unused' })
    source.composition.propertyTracks.push({ ...structuredClone(source.composition.groupDefinitions[0].propertyTracks[0]),
      id: 'unused-level', target: { kind: 'instance-control', instanceId: 'unused', exportName: 'sliderLevel' } })
    const before = structuredClone(source)
    const result = runtime(source, 'fast')
    expect(result.artifact.summary.clips.map(instance => instance.id)).toEqual(['instance'])
    expect(source).toEqual(before)
  })

  it('retains distinct sole source identities and authoritative clocks while pruning only selected compatible local owners', () => {
    const source = linkedFixture([1000, 1400])
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'sole-a', time: { timeScale: 0.75, timeOffsetMs: 100 } },
      { ...structuredClone(source.composition.patternInstances[0]), id: 'sole-b', time: { timeScale: 1.5, timeOffsetMs: 200 } })
    source.composition.groupOccurrences[0].instanceBindings = { slot: 'sole-a' }
    source.composition.groupOccurrences[1].instanceBindings = { slot: 'sole-b' }
    const old = runtime(source, 'fast')
    const value = linkedIntent(source)
    value.slot = { kind: 'retain' }
    value.runtimePlansBySourceRuntimeId = { 'sole-a': { kind: 'retain' }, 'sole-b': { kind: 'retain' } }
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupOccurrences).toEqual(source.composition.groupOccurrences)
    expect(next.composition.patternInstances.map(instance => instance.id)).toEqual(['instance', 'sole-a', 'sole-b'])
    for (const id of ['sole-a', 'sole-b']) expect(next.composition.patternInstances.find(instance => instance.id === id)).toEqual({
      ...source.composition.patternInstances.find(instance => instance.id === id), pattern: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', controlTargets: { sliderLevel: 0.2 },
    })
    expect(next.composition.groupDefinitions[0].propertyTracks).toEqual(source.composition.groupDefinitions[0].propertyTracks.filter(track => track.id !== 'lost'))
    expect(result.hoistedInstanceIds).toEqual([])
    expect(result.removedIds).toEqual(['lost', 'lost:start', 'lost:end'])
    const changed = runtime(next, 'fast')
    for (const atMs of [1200, 1600]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(b.frame[2]).toEqual(a.frame[0])
    }
  })

  it('atomically refuses an admitted mixed sole/shared incompatible local track rather than changing an unrelated source user', () => {
    const source = linkedFixture([1000, 1400])
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'sole' })
    source.composition.groupOccurrences[0].instanceBindings = { slot: 'sole' }
    runtime(source, 'fast')
    const before = structuredClone(source)
    const value = linkedIntent(source)
    value.runtimePlansBySourceRuntimeId.sole = { kind: 'retain' }
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result).toMatchObject({ status: 'refused', code: 'invalid-result', affectedInstanceIds: [], affectedGroupOccurrenceIds: [], removedIds: [], discardedControlTargets: [] })
    if (result.status !== 'refused') return
    expect(result.message).toContain('Group "group"')
    expect(result.message).toContain('"lost"')
    expect(result.record).toBe(source)
    expect(source).toEqual(before)
  })

  it('refuses pruning an incompatible foreign Group owner that also animates an unrelated runtime in another repeat', () => {
    const source = linkedFixture([1000])
    source.composition.patternInstances.push({ ...structuredClone(source.composition.patternInstances[0]), id: 'main-runtime' })
    source.composition.clips[0].instanceId = 'main-runtime'
    const foreign = structuredClone(source.composition.groupDefinitions[0])
    foreign.id = 'foreign'
    foreign.patternInstances.push({ ...structuredClone(foreign.patternInstances[0]), id: 'visible' })
    foreign.clips[0].instanceId = 'visible'
    foreign.propertyTracks = foreign.propertyTracks.filter(track => track.target.kind === 'instance-control' && track.target.exportName === 'sliderLost')
    source.composition.groupDefinitions.push(foreign)
    source.composition.groupOccurrences.push(...[0, 400].map((startMs, index) => ({ ...structuredClone(source.composition.groupOccurrences[0]),
      id: `foreign-${index}`, definitionId: 'foreign', startMs, layerBindings: [{ definitionLayerId: 'local', layerId: source.composition.layers[1].id }],
      instanceBindings: { slot: index === 0 ? 'instance' : 'main-runtime', visible: 'main-runtime' },
    })))
    runtime(source, 'fast')
    const value = linkedIntent(source)
    value.slot = { kind: 'retain' }
    value.runtimePlansBySourceRuntimeId = { instance: { kind: 'retain' } }
    const before = structuredClone(source)
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    atomicRefusal(source, value)
    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.message).toContain('foreign-0:lost')
    expect(result.message).toContain('sliderLost')
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('replaces the linked selected use while retaining the ordinary user and exact compatible Group animation in %s', fidelity => {
    const source = linkedFixture()
    source.composition.patternInstances[0].time = { timeScale: 0.75, timeOffsetMs: 150 }
    source.composition.groupDefinitions[0].patternInstances[0].time = { timeScale: 2, timeOffsetMs: 500 }
    const before = structuredClone(source)
    const old = runtime(source, fidelity)
    const result = replaceShowGroupDefinitionClipPatternV2(source, linkedIntent(source))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances[0]).toEqual(source.composition.patternInstances[0])
    expect(next.composition.clips).toEqual(source.composition.clips)
    expect(next.composition.groupDefinitions[0].propertyTracks).toEqual(source.composition.groupDefinitions[0].propertyTracks)
    expect(next.composition.patternInstances.find(instance => instance.id === 'new-0')?.time).toEqual(source.composition.patternInstances[0].time)
    expect(next.composition.groupOccurrences[0].instanceBindings).toEqual({ slot: 'instance', 'replacement-slot': 'new-0' })
    const replaced = runtime(next, fidelity)
    const oldPrefix = old.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const retainedPrefix = replaced.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const newPrefix = replaced.artifact.summary.clips.find(member => member.id === 'new-0')!.prefix
    for (const atMs of [0, 500, 999, 1200, 1201, 1400, 1599]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = replaced.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      if (atMs < 1000) {
        for (const name of ['level', 'elapsed']) expect(b.exports[`${retainedPrefix}_${name}`], `${fidelity} retained ${name} at ${atMs}`).toEqual(a.exports[`${oldPrefix}_${name}`])
        expect(b.frame).toEqual(a.frame)
      }
      else {
        expect(b.frame[0]).toBe(0)
        expect(b.frame[2]).toEqual(a.frame[0])
        // advanceTo exposes the pre-enter export snapshot at an exact Fast
        // boundary; the rendered contribution is still compared at that edge.
        if (atMs > 1200) expect(b.exports[`${newPrefix}_level`], `${fidelity} replacement level at ${atMs}`).toEqual(a.exports[`${oldPrefix}_level`])
      }
    }
    expect(source).toEqual(before)
  })

  it('keeps repeated default-bound selected uses together in one explicit destination and preserves the original default authority and tracks', () => {
    const source = linkedFixture([1000, 1400], true)
    const old = defaultGroupRuntimeIdV2('group', 'slot')
    const result = replaceShowGroupDefinitionClipPatternV2(source, linkedIntent(source))
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.groupOccurrences.map(occurrence => occurrence.instanceBindings?.['replacement-slot'])).toEqual(['new-0', 'new-0'])
    expect(next.composition.patternInstances.find(instance => instance.id === old)).toEqual({ ...source.composition.groupDefinitions[0].patternInstances[0], id: old })
    expect(next.composition.groupDefinitions[0].propertyTracks).toEqual(source.composition.groupDefinitions[0].propertyTracks)
    expect(result.hoistedInstanceIds).toEqual([old])
    expect(next.composition.propertyTracks.map(track => track.id)).toEqual(['new-0:use-0:level', 'new-0:use-0:speed', 'new-0:use-1:level', 'new-0:use-1:speed'])
    expect(runtime(next, 'fast').artifact.summary.clips.filter(member => member.id === 'new-0')).toHaveLength(1)
  })

  it('splits a shared dormant slot using exact local identities while preserving the original template and every original track', () => {
    const source = fixture(true)
    const before = structuredClone(source)
    expect(replaceShowGroupDefinitionClipPatternV2(source, dormantIntent()).status).toBe('refused')
    const result = replaceShowGroupDefinitionClipPatternV2(source, dormantSplitIntent())
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    const old = source.composition.groupDefinitions[0]
    const definition = next.composition.groupDefinitions[0]
    expect(definition.patternInstances[0]).toEqual(old.patternInstances[0])
    expect(definition.clips[0]).toEqual({ ...old.clips[0], instanceId: 'replacement-slot' })
    expect(definition.clips[1]).toEqual(old.clips[1])
    expect(definition.propertyTracks.slice(0, 3)).toEqual(old.propertyTracks)
    expect(definition.propertyTracks.slice(3)).toEqual(old.propertyTracks.filter(track => track.id !== 'lost').map(track => ({
      ...track, id: `copy-${track.id}`, target: { ...track.target, instanceId: 'replacement-slot' },
      keyframes: track.keyframes.map(key => ({ ...key, id: `copy-${key.id}` })),
    })))
    expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(result.removedIds).toEqual([])
    expect(result.affectedTrackIds).toEqual(['copy-level', 'copy-speed'])
    expect(source).toEqual(before)
  })

  it('protects dormant hoisted authority and resolves the new local template when a default-bound occurrence is later added', () => {
    const source = fixture()
    const authority = { ...structuredClone(source.composition.patternInstances[0]), id: defaultGroupRuntimeIdV2('group', 'slot') }
    source.composition.patternInstances.push(authority)
    expect(replaceShowGroupDefinitionClipPatternV2(source, dormantIntent()).status).toBe('refused')
    const result = replaceShowGroupDefinitionClipPatternV2(source, dormantSplitIntent())
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    next.composition.clips[0].durationMs = 500
    next.composition.groupOccurrences.push({ id: 'later', definitionId: 'group', startMs: 1000, layoutOccurrenceId: next.composition.layoutOccurrences[0].id,
      zoneId: next.composition.clips[0].zoneId, translationX: 0, translationY: 0, holds: [], layerBindings: [{ definitionLayerId: 'local', layerId: next.composition.clips[0].layerId }] })
    const expanded = materializeShowGroupsV2(reopen(next))
    expect(expanded.composition.patternInstances.find(instance => instance.id === authority.id)).toEqual(authority)
    expect(expanded.composition.clips.find(clip => clip.id === 'later:child')?.instanceId).toBe(defaultGroupRuntimeIdV2('group', 'replacement-slot'))
    expect(expanded.composition.patternInstances.find(instance => instance.id === defaultGroupRuntimeIdV2('group', 'replacement-slot'))?.pattern).toEqual({ kind: 'stock', id: 'Replacement' })
  })

  it('replaces a dormant sole local template and eligible local tracks without minting or changing a runtime', () => {
    const source = fixture()
    const before = structuredClone(source)
    const result = replaceShowGroupDefinitionClipPatternV2(source, dormantIntent())
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances).toEqual(source.composition.patternInstances)
    expect(materializeShowGroupsV2(next).composition.patternInstances).toEqual(materializeShowGroupsV2(source).composition.patternInstances)
    const definition = next.composition.groupDefinitions[0]
    expect(definition.patternInstances[0]).toEqual({ ...source.composition.groupDefinitions[0].patternInstances[0], pattern: { kind: 'stock', id: 'Replacement' }, patternName: 'Replacement', controlTargets: { sliderLevel: 0.2 } })
    expect(definition.propertyTracks).toEqual(source.composition.groupDefinitions[0].propertyTracks.filter(track => track.id !== 'lost'))
    expect(definition.clips).toEqual(source.composition.groupDefinitions[0].clips)
    expect(result).toMatchObject({ affectedGroupDefinitionIds: ['group'], affectedClipIds: ['child'], affectedInstanceIds: ['slot'], affectedTrackIds: ['lost'], affectedPropertyKeyIds: ['lost:start', 'lost:end'],
      affectedGroupOccurrenceIds: [], hoistedInstanceIds: [], removedIds: ['lost', 'lost:start', 'lost:end'], discardedControlTargets: [{ kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLost' }] })
    expect(source).toEqual(before)
    next.composition.groupDefinitions[0].patternInstances[0].controlTargets!.sliderLevel = 0
    expect(source).toEqual(before)
  })

  it('refuses a linked split that no other local Clip or original Group track requires', () => {
    const source = linkedFixture([1000], true)
    source.composition.groupDefinitions[0].propertyTracks = []
    const value = linkedIntent(source)
    value.runtimePlansBySourceRuntimeId = { [defaultGroupRuntimeIdV2('group', 'slot')]: { kind: 'retain' } }
    atomicRefusal(source, value)
    value.slot = { kind: 'retain' }
    expect(replaceShowGroupDefinitionClipPatternV2(source, value).status).toBe('changed')
  })

  it('keeps an ordinary sharing user, its attached Transition and its compiled member exact while the selected linked use forks', () => {
    // The Group definition keeps its local instance animation, so the ordinary
    // positive Transition coexists with materialized section-scoped activation.
    const source = linkedFixture()
    source.composition.propertyTracks = []
    source.composition.clips[0].durationMs = 400
    source.composition.clips.push({ ...structuredClone(source.composition.clips[0]), id: 'second', startMs: 600,
      appearance: { keys: [{ ...structuredClone(source.composition.clips[0].appearance.keys[0]), id: 'second:key', timeMs: 600 }] } })
    source.composition.transitions = [{ id: 'ordinary-fade', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      participants: [{ id: 'ordinary-fade:participant', zoneId: source.composition.clips[0].zoneId, layerId: source.composition.clips[0].layerId, fromClipId: 'clip', toClipId: 'second' }], propertyRamps: [] }]
    const before = structuredClone(source)
    const old = runtime(source, 'fast')
    const value = linkedIntent(source)
    const result = replaceShowGroupDefinitionClipPatternV2(source, value)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.transitions).toEqual(before.composition.transitions)
    expect(next.composition.clips).toEqual(before.composition.clips)
    expect(next.composition.patternInstances[0]).toEqual(before.composition.patternInstances[0])
    const changed = runtime(next, 'fast')
    expect(normalizedPrivateSymbols(changed.memberSource('instance'))).toEqual(normalizedPrivateSymbols(old.memberSource('instance')))
    const oldPrefix = old.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    const prefix = changed.artifact.summary.clips.find(member => member.id === 'instance')!.prefix
    for (const atMs of [200, 501, 700, 999]) {
      const a = old.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = changed.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      expect(b.frame, `ordinary frame at ${atMs}`).toEqual(a.frame)
      for (const name of ['level', 'elapsed']) expect(b.exports[`${prefix}_${name}`], `ordinary ${name} at ${atMs}`).toEqual(a.exports[`${oldPrefix}_${name}`])
    }
    expect(source).toEqual(before)
  })
})
