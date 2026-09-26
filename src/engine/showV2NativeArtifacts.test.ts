import { expect, it, vi } from 'vitest'
import * as showCompiler from './showCompiler'
import * as showLowering from './showCompositionLoweringV2'
import { qualifyShowV2PilotArtifacts } from './showV2Pilot'
import { parseShowFileBundle } from './showFileBundle'
import * as showFiles from './showFileBundle'
import { createCustomMap } from './maps'
import { createFastReplayRuntime } from './fastReplay'
import { insertShowTimeV2 } from './showTimelineV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from './showCompositionV2'
import { parseEpe } from './epeImport'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowStageV2, type ShowPreparedStageDependenciesV2 } from './showPreparedStageV2'

function fixture() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture conversion refused')
  const record = converted.record
  record.composition.executionModel = 'continuous'
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'pattern' }
  const dependencies: ShowPreparedStageDependenciesV2 = {
    patterns: [{ id: 'pattern', name: 'Synthetic', src: 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: { gain: 0.5 }, updatedAt: 1 }],
    maps: [], libraries: [{ id: 'unused-library', name: 'Unused', src: 'function value(){return 1}', updatedAt: 1 }], profiles: [], stageMap: null,
  }
  return { record, dependencies }
}

it('captures owned immutable nested semantic assets separately from dependency identity tokens', () => {
  const { record, dependencies } = fixture()
  const before = structuredClone({ patterns: dependencies.patterns, maps: dependencies.maps, libraries: dependencies.libraries, profiles: dependencies.profiles })
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status)
  expect(prepared.bundle.assets).toEqual(before)
  expect(prepared.bundle.assets.patterns).not.toBe(dependencies.patterns)
  expect(prepared.bundle.assets.patterns[0].controls).not.toBe(dependencies.patterns[0].controls)
  expect(prepared.bundle.identity.dependencies).toBe(dependencies)
  dependencies.patterns[0].controls.gain = 0.75
  dependencies.patterns[0].src = 'export function render(i){rgb(0,0,0)}'
  dependencies.libraries[0].src = 'function value(){return 9}'
  expect(prepared.bundle.assets).toEqual(before)
  expect(() => { prepared.bundle.assets.patterns[0].controls.gain = 1 }).toThrow(TypeError)
  expect(() => { prepared.bundle.assets.libraries[0].src = 'changed' }).toThrow(TypeError)
  expect(prepared.bundle.assets).toEqual(before)
})

it('qualifies the exact captured native artifact and authored bytes without lowering or recompiling', async () => {
  const { record, dependencies } = fixture()
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status)
  const compiler = vi.spyOn(showCompiler, 'compileShow')
  const lowerer = vi.spyOn(showLowering, 'lowerShowCompositionV2ForCompile')
  try {
    const result = await qualifyShowV2PilotArtifacts(prepared.bundle, { appVersion: 'native-test', exportedAt: '2026-09-16T00:00:00.000Z' })
    const file = await parseShowFileBundle(result.pxlshowBytes, { acceptV2: true })
    expect(file.show).toEqual(prepared.bundle.record)
    expect(file.patterns[0].src).toBe(dependencies.patterns[0].src)
    expect(parseEpe(result.epeText).src).toContain(prepared.bundle.artifact.code)
    expect(result.importedShow.composition.patternInstances[0].pattern).toEqual({ kind: 'user', id: 'pattern' })
    expect(result).not.toHaveProperty('previewShow')
    expect(compiler).not.toHaveBeenCalled()
    expect(lowerer).not.toHaveBeenCalled()
  } finally { compiler.mockRestore(); lowerer.mockRestore() }
})

it('keeps delivered assets and import planning on the same capture through delayed serialization', async () => {
  const { record, dependencies } = fixture()
  record.stageMapId = 'map'
  dependencies.maps = [{ id: 'map', name: 'Captured Map', dim: 2, generator: 'custom', params: {}, points: [[0, 0], [1, 1]], updatedAt: 1 }]
  dependencies.stageMap = createCustomMap(dependencies.maps[0].points!, { id: 'map', name: 'Captured Map' })
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status)
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const serialize = showFiles.serializeShowFileBundle
  const pending = vi.spyOn(showFiles, 'serializeShowFileBundle').mockImplementation(async bundle => { await gate; return serialize(bundle) })
  try {
    const options = { appVersion: 'captured-version', exportedAt: '2026-09-16T00:00:00.000Z' }
    const saving = qualifyShowV2PilotArtifacts(prepared.bundle, options)
    await vi.waitFor(() => expect(pending).toHaveBeenCalledOnce())
    record.name = 'New Record'
    record.updatedAt = 999
    dependencies.patterns[0].src = 'export function render(i){rgb(0,0,0)}'
    dependencies.patterns[0].controls.gain = 0.75
    dependencies.maps[0].name = 'New Map'
    dependencies.maps[0].points![0][0] = 0.75
    options.appVersion = 'new-version'
    options.exportedAt = '2026-09-17T00:00:00.000Z'
    release()
    const result = await saving
    pending.mockRestore()
    const file = await parseShowFileBundle(result.pxlshowBytes, { acceptV2: true })
    expect(file.show).toEqual(prepared.bundle.record)
    expect(file.patterns[0].src).toBe(prepared.bundle.assets.patterns[0].src)
    expect(file.patterns[0].controls).toEqual({ gain: 0.5 })
    expect(file.maps[0]).toEqual(prepared.bundle.assets.maps[0])
    expect(file.provenance).toMatchObject({ appVersion: 'captured-version', exportedAt: '2026-09-16T00:00:00.000Z' })
    expect(parseEpe(result.epeText).src).toContain('Captured Map')
    expect(parseEpe(result.epeText).src).not.toContain('New Map')
    expect(result.importedShow.composition.patternInstances[0].pattern).toEqual({ kind: 'user', id: 'pattern' })
    expect(result.importedShow.stageMapId).toBe('map')
  } finally { release(); pending.mockRestore() }
})

it('keeps the captured authored record immutable alongside the asset payload', () => {
  const { record, dependencies } = fixture()
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status)
  const before = structuredClone(prepared.bundle.record)
  expect(() => { prepared.bundle.record.composition.clips[0].entryPolicy = 'restart' }).toThrow(TypeError)
  expect(prepared.bundle.record).toEqual(before)
  expect(record).toEqual(before)
})

function animatedFixture(kind: 'repeat-restart' | 'held-group' | 'layout-split') {
  const { record, dependencies } = fixture()
  if (kind === 'repeat-restart') {
    record.composition.clips[0].durationMs = 500
    const right = { ...structuredClone(record.composition.clips[0]), id: 'restart', startMs: 500, entryPolicy: 'restart' as const }
    right.appearance.keys[0].timeMs = 500
    record.composition.clips.push(right)
    record.composition.propertyTracks = [{ id: 'repeat', target: { kind: 'show-repeat-scale' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
      { id: 'a', timeMs: 0, value: 2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'b', timeMs: 1000, value: 4, easing: { curve: 'linear' } },
    ] }]
    const inserted = insertShowTimeV2(record, { atMs: 250, durationMs: 125 })
    if (inserted.status !== 'changed') throw new Error('Held fixture refused')
    return { record: inserted.record, dependencies }
  }
  if (kind === 'held-group') {
    const original = record.composition.clips[0]
    const { zoneId: _zone, ...child } = structuredClone(original)
    record.composition.clips = []
    record.composition.showEndMs = 2250
    record.composition.layoutOccurrences[0].durationMs = 2250
    record.composition.groupDefinitions = [{ id: 'group', name: 'Held', patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot', pattern: { kind: 'user', id: 'template' } }], layers: [{ id: 'local', name: 'Local', rank: 0 }], clips: [{ ...child, instanceId: 'slot', layerId: 'local', entryPolicy: 'restart' }], transitions: [], propertyTracks: [{ id: 'brightness', target: { kind: 'clip-view', clipId: child.id, property: 'brightness' }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [{ id: 'a', timeMs: 0, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } }, { id: 'b', timeMs: 1000, value: 0.8, easing: { curve: 'linear' } }] }] }]
    record.composition.groupOccurrences = [0, 1125].map((startMs, index) => ({ id: `held-${index}`, definitionId: 'group', zoneId: original.zoneId, layoutOccurrenceId: record.composition.layoutOccurrences[0].id, startMs, translationX: 0, translationY: 0, layerBindings: [{ definitionLayerId: 'local', layerId: original.layerId }], instanceBindings: { slot: record.composition.patternInstances[0].id }, holds: [{ id: 'pause', localTimeMs: 250, durationMs: 125 }] }))
    dependencies.patterns = [...dependencies.patterns, { ...structuredClone(dependencies.patterns[0]), id: 'template', src: 'export function render2D(i,x,y){rgb(0,0,0)}' }]
    return { record, dependencies }
  }
  record.zones.push({ ...structuredClone(record.zones[0]), id: 'right', name: 'Right' })
  record.composition.layers.push({ ...structuredClone(record.composition.layers[0]), id: 'right-layer', zoneId: 'right' })
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'right-instance' })
  record.composition.clips.push({ ...structuredClone(record.composition.clips[0]), id: 'right-clip', zoneId: 'right', layerId: 'right-layer', instanceId: 'right-instance' })
  record.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] }
  record.composition.layoutOccurrences[0].parameters.splitPosition = 0.25
  const easing = { curve: 'quadratic', direction: 'in' } as const
  const split = (time: number) => 0.2 + 0.6 * ((time + 500) / 2000) ** 2
  record.composition.propertyTracks = [{ id: 'split-track', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: record.composition.layoutOccurrences[0].id }, activeStartMs: 0, activeDurationMs: 1000, keyframes: [
    { id: 's', timeMs: 0, value: split(0), easing, curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing, sourceDurationMs: 2000, elapsedOffsetMs: 500 } }, { id: 'e', timeMs: 1000, value: split(1000), easing: { curve: 'linear' } },
  ] }]
  return { record, dependencies }
}

it.each(['fast', 'fidelity'] as const)('delivers native advanced artifacts with exact %s playback/state and original nonlinear values', async fidelity => {
  for (const kind of ['repeat-restart', 'held-group', 'layout-split'] as const) {
    const { record, dependencies } = animatedFixture(kind)
    record.composition.markers.push({ id: 'dormant', name: 'Future guide', timeMs: 30000 })
    const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
    if (opened.status !== 'opened') throw new Error('Authored reopen refused')
    const prepared = prepareShowStageV2(opened.record, dependencies)
    if (prepared.status !== 'ready') throw new Error(prepared.status === 'refused' ? prepared.message : prepared.status)
    const before = structuredClone(prepared.bundle.record)
    const result = await qualifyShowV2PilotArtifacts(prepared.bundle)
    const file = await parseShowFileBundle(result.pxlshowBytes, { acceptV2: true })
    expect(file.show).toEqual(before)
    expect(prepared.bundle.record).toEqual(before)
    const x = kind === 'layout-split' ? 0.4 : 0.125
    const mapPoints = [{ sample: [x, 0.25], pos: [x, 0.25] as [number, number] }]
    const source = createFastReplayRuntime({ ...prepared.bundle.artifact, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints })
    const delivered = createFastReplayRuntime({ ...prepared.bundle.artifact, code: parseEpe(result.epeText).src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints })
    const members = prepared.bundle.artifact.summary.clips
    if (kind !== 'layout-split') expect(new Set(members.map(member => member.prefix)).size).toBe(1)
    const times = kind === 'layout-split' ? [125, 250, 375, 500, 625, 750, 1000, 1125] : [125, 250, 375, 500, 625, 750, 1000, 1125, 1250]
    for (const time of times) {
      const a = source.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
      const b = delivered.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
      expect(b.frame, `${kind}@${time}`).toEqual(a.frame)
      expect(b.exports, `${kind} state@${time}`).toEqual(a.exports)
      const position = time % record.composition.showEndMs
      const held = (value: number) => value < 250 ? value : value < 375 ? 250 : value - 125
      let expected: number
      if (kind === 'repeat-restart') expected = x * (2 + 2 * (held(position) / 1000) ** 2)
      else if (kind === 'held-group') expected = x * (0.2 + 0.6 * (held(position % 1125) / 1000) ** 2)
      else {
        const split = 0.2 + 0.6 * ((position + 500) / 2000) ** 2
        expected = x < split ? x / split : (x - split) / (1 - split)
      }
      expect(b.frame[0], `${kind} independent curve@${time}`).toBeCloseTo(expected, fidelity === 'fast' ? 12 : kind === 'layout-split' ? 3 : 4)
      if (kind !== 'layout-split') {
        const elapsed = kind === 'held-group' ? time % 1125 : time < 625 ? time : time - 625
        expect(b.exports[`${members[0].prefix}_elapsed`], `${kind} elapsed@${time}`).toBe(elapsed * (fidelity === 'fast' ? 1 : 65536))
      }
    }
  }
})


it.each(['fast', 'fidelity'] as const)('preserves captured trusted Library state and full Restart in %s delivered source', async fidelity => {
  const { record, dependencies } = animatedFixture('repeat-restart')
  dependencies.patterns[0].src = 'export var sample=0; export function beforeRender(delta){sample=Blz.next()} export function render2D(i,x,y){rgb(sample/100,0,0)}'
  dependencies.libraries = [{ id: 'state-library', name: 'Blz', src: 'var phase=1; function next(){phase=phase+1; return phase}', updatedAt: 1 }]
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status === 'refused' ? prepared.message : prepared.status)
  const result = await qualifyShowV2PilotArtifacts(prepared.bundle)
  const file = await parseShowFileBundle(result.pxlshowBytes, { acceptV2: true })
  if (file.version !== 2) throw new Error('Native file version lost')
  expect(file.libraries).toEqual(dependencies.libraries)
  const runtime = createFastReplayRuntime({ ...prepared.bundle.artifact, code: parseEpe(result.epeText).src, dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.125, 0.25], pos: [0.125, 0.25] }] })
  const prefix = prepared.bundle.artifact.summary.clips[0].prefix
  // Entry resets phase to 1, then the existing zero-delta beforeRender invokes next once.
  for (const [time, sample] of [[125, 2], [250, 3], [500, 5], [625, 2], [750, 3]] as const) {
    const observed = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    expect(observed.exports[`${prefix}_sample`]).toBe(sample * (fidelity === 'fast' ? 1 : 65536))
    expect(observed.frame[0]).toBeCloseTo(sample / 100, fidelity === 'fast' ? 12 : 4)
  }
})

it('keeps missing portable custom-map dependencies refused after a ready strips preview', async () => {
  const { record, dependencies } = fixture()
  record.stageMapId = 'missing-custom-map'
  const prepared = prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw new Error(prepared.status)
  await expect(qualifyShowV2PilotArtifacts(prepared.bundle)).rejects.toThrow(/custom Map.*missing-custom-map.*not in the library/)
})
