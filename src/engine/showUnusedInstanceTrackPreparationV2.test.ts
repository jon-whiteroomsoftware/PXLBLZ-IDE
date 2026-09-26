import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { defaultGroupRuntimeIdV2, materializeShowGroupsV2 } from './showGroupsV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { convertibleV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'
import { parseEpe } from './epeImport'
import { createFastReplayRuntime } from './fastReplay'
import { LIBRARIES } from '../pixelblaze/libs'

const code = 'export var level = 0.2; export var elapsed = 0; export function sliderLevel(v) { level = v } export function beforeRender(delta) { elapsed += delta } export function render2D(index, x, y) { rgb(level, 0, 0) }'

function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.showEndMs = 2000
  record.composition.layoutOccurrences[0].durationMs = 2000
  record.composition.clips[0].durationMs = 2000
  record.composition.patternInstances[0].controlTargets = { sliderLevel: 0.2 }
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'unused' })
  record.composition.propertyTracks = [
    { id: 'unused-level', target: { kind: 'instance-control', instanceId: 'unused', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'level:start', timeMs: 0, value: 0.2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'level:end', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] },
    { id: 'unused-speed', target: { kind: 'instance-time-scale', instanceId: 'unused' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'speed:start', timeMs: 0, value: 2, easing: { curve: 'linear' } }, { id: 'speed:end', timeMs: 400, value: 2, easing: { curve: 'linear' } }] },
  ]
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function groupFixture(): ShowRecordV2 {
  const record = fixture()
  record.composition.patternInstances = record.composition.patternInstances.filter(instance => instance.id !== 'unused')
  record.composition.clips[0].durationMs = 1000
  const { zoneId: _zone, ...clip } = structuredClone(record.composition.clips[0])
  record.composition.groupDefinitions = [{ id: 'group', name: 'Linked',
    patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'old' }, { ...structuredClone(record.composition.patternInstances[0]), id: 'new' }],
    layers: [{ id: 'local', name: 'Local', rank: 0 }], clips: [{ ...clip, id: 'child', instanceId: 'new', layerId: 'local', durationMs: 400,
      appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'child:key' }] } }],
    transitions: [], propertyTracks: record.composition.propertyTracks.map(track => ({ ...structuredClone(track), target: { ...track.target, instanceId: 'old' } })),
  }]
  record.composition.propertyTracks = []
  record.composition.groupOccurrences = [1000, 1400].map((startMs, index) => ({ id: `use-${index}`, definitionId: 'group', startMs,
    layoutOccurrenceId: record.composition.layoutOccurrences[0].id, zoneId: record.composition.clips[0].zoneId,
    translationX: 0, translationY: 0, holds: [], layerBindings: [{ definitionLayerId: 'local', layerId: record.composition.clips[0].layerId }],
  }))
  record.composition.patternInstances.push({ ...structuredClone(record.composition.groupDefinitions[0].patternInstances[0]), id: defaultGroupRuntimeIdV2('group', 'old') })
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function prepare(record: ShowRecordV2, sources?: Record<string, string>) {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(opened.status).toBe('opened')
  if (opened.status !== 'opened') throw new Error('Reopen failed')
  expect(opened.record).toEqual(record)
  expect(validateShowRecordV2(opened.record)).toEqual([])
  return prepareShowV2ForCompile(opened.record, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: sources ?? Object.fromEntries(materializeShowGroupsV2(record).composition.patternInstances.map(instance => [instance.id, code])),
  }, { libraries: LIBRARIES })
}

function runtime(record: ShowRecordV2, fidelity: 'fast' | 'fidelity') {
  const result = prepare(record)
  expect(result.status, JSON.stringify(result)).toBe('ready')
  if (result.status !== 'ready') throw new Error('Preparation refused')
  const artifact = compileShow(result.recipe, LIBRARIES)
  const opened = parseEpe(exportShowEpeV2ForTest(convertibleV2Record(), artifact.code, { id: 'unused-track-proof', stampedAt: '2026-09-16T00:00:00Z' }).text)
  expect(opened.stamp?.kind).toBe('show')
  return { result, artifact, code: opened.src, replay: createFastReplayRuntime({ ...artifact, code: opened.src, dimension: 2 }, {
    fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }],
  }) }
}

describe('unused instance animation at v2 compile preparation', () => {
  it.each(['fast', 'fidelity'] as const)('retains an invisible future consumer and animation at its actual first contribution in %s', fidelity => {
    const source = fixture()
    const clip = structuredClone(source.composition.clips[0])
    source.composition.clips.push({ ...clip, id: 'future', instanceId: 'unused', startMs: 1000, durationMs: 400, layerId: source.composition.layers[1].id,
      appearance: { keys: [{ ...structuredClone(clip.appearance.keys[0]), id: 'future:key', timeMs: 1000,
        value: { ...structuredClone(clip.appearance.keys[0].value), opacity: 0 } }] } })
    for (const track of source.composition.propertyTracks) {
      track.activeStartMs = 1000
      for (const key of track.keyframes) key.timeMs += 1000
    }
    const before = structuredClone(source)
    const oracleRecord = structuredClone(source)
    oracleRecord.composition.clips[1].appearance.keys[0].value.opacity = 1
    const compiled = runtime(source, fidelity)
    const oracle = runtime(oracleRecord, fidelity)
    // Independent dc9d public-adapter baseline, with this same first-use
    // schedule. Intentional compiler changes can requalify these two digests.
    expect(createHash('sha256').update(JSON.stringify(compiled.result.recipe)).digest('hex')).toBe('3f5aa41117ec7aa4d35b18b7b2719f310bd412d536dc3af9e9b94da502f7073c')
    expect(createHash('sha256').update(compiled.code).digest('hex')).toBe('dedd8a73971233d3e9701e630de80e65ac818d3d8442643ce394b325a4e33d7f')
    expect(compiled.code).toContain(compiled.artifact.code)
    expect(Object.values(compiled.result.provenance.runtimeInstanceIdByClipId)).toEqual(['instance', 'unused'])
    expect(compiled.result.recipe.clips.filter(member => !member.compilerOwnedEmpty).map(member => member.id)).toEqual(['instance', 'unused'])
    const prefix = compiled.artifact.summary.clips.find(member => member.id === 'unused')!.prefix
    const oraclePrefix = oracle.artifact.summary.clips.find(member => member.id === 'unused')!.prefix
    for (const atMs of [200, 399, 400, 999, 1001, 1200, 1400]) {
      const a = compiled.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      const b = oracle.replay.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
      for (const name of ['level', 'elapsed']) expect(a.exports[`${prefix}_${name}`]).toEqual(b.exports[`${oraclePrefix}_${name}`])
    }
    expect(source).toEqual(before)
  })

  it('retains the existing exact-source dependency requirement for an unused authored instance', () => {
    const source = fixture()
    const result = prepare(source, { instance: code })
    expect(result).toMatchObject({ status: 'refused', issues: [{ code: 'missing-pattern-source' }] })
    if (result.status === 'refused') expect(result.issues[0].message).toContain('"unused"')
  })

  it.each(['dangling-target', 'overlap', 'negative-time'] as const)('refuses persisted %s before zero-use filtering can hide invalid authored evidence', fault => {
    const source = fixture()
    if (fault === 'dangling-target') source.composition.propertyTracks[0].target = { kind: 'instance-control', instanceId: 'gone', exportName: 'sliderLevel' }
    else if (fault === 'negative-time') source.composition.propertyTracks[0].activeStartMs = -1
    else source.composition.propertyTracks.push({ ...structuredClone(source.composition.propertyTracks[0]), id: 'overlap' })
    const before = structuredClone(source)
    const result = prepareShowV2ForCompile(source, { byCellId: {}, stageDimension: 2, byPatternInstanceId: { instance: code, unused: code } }, { libraries: LIBRARIES })
    expect(result).toMatchObject({ status: 'refused', issues: [{ code: 'invalid-record' }] })
    expect(source).toEqual(before)
  })

  it('refuses an overlapping unused Group projection before filtering, even when its two real children occupy different Layers', () => {
    const source = groupFixture()
    source.composition.groupOccurrences[0].startMs = 1200
    source.composition.groupOccurrences[1].layerBindings[0].layerId = source.composition.layers[1].id
    expect(validateShowRecordV2(source)[0].message).toContain('overlaps active owner')
    const before = structuredClone(source)
    const result = prepareShowV2ForCompile(source, { byCellId: {}, stageDimension: 2,
      byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(source).composition.patternInstances.map(instance => [instance.id, code])),
    }, { libraries: LIBRARIES })
    expect(result).toMatchObject({ status: 'refused', issues: [{ code: 'invalid-record' }] })
    if (result.status === 'refused') expect(result.issues[0].message).toContain('overlaps active owner')
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('reopens ordinary unused instance tracks without an executing phantom runtime in %s', fidelity => {
    const source = fixture()
    const before = structuredClone(source)
    const compiled = runtime(source, fidelity)
    const oracleRecord = structuredClone(source)
    oracleRecord.composition.propertyTracks = []
    const oracle = runtime(oracleRecord, fidelity)
    expect(Object.values(compiled.result.provenance.runtimeInstanceIdByClipId)).toEqual(['instance'])
    expect(compiled.artifact.summary.clips.map(member => member.id)).toEqual(['instance'])
    for (const atMs of [0, 200, 1000, 1999]) expect(compiled.replay.advanceTo(atMs, { stepMs: 1 }).frame).toEqual(oracle.replay.advanceTo(atMs, { stepMs: 1 }).frame)
    expect(source).toEqual(before)
  })

  it.each(['fast', 'fidelity'] as const)('preserves orphaned Group default payloads and local tracks while compiling only real selected uses in %s', fidelity => {
    const source = groupFixture()
    const before = structuredClone(source)
    const compiled = runtime(source, fidelity)
    const oracleRecord = structuredClone(source)
    oracleRecord.composition.groupDefinitions[0].propertyTracks = []
    const oracle = runtime(oracleRecord, fidelity)
    const newId = defaultGroupRuntimeIdV2('group', 'new')
    expect(Object.values(compiled.result.provenance.runtimeInstanceIdByClipId)).toEqual(['instance', newId, newId])
    expect(compiled.result.recipe.clips.filter(member => !member.compilerOwnedEmpty).map(member => member.id)).toEqual(['instance', newId])
    for (const atMs of [999, 1200, 1600, 1799]) expect(compiled.replay.advanceTo(atMs, { stepMs: 1 }).frame).toEqual(oracle.replay.advanceTo(atMs, { stepMs: 1 }).frame)
    expect(source).toEqual(before)
  })
})
