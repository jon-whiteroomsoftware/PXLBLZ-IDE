import { expect, it } from 'vitest'
import { convertibleV1Show, continuingV1Show } from '../test/showV2TracerFixture'
import { LIBRARIES } from '../pixelblaze/libs'
import { buildShowEpeExportV2 } from './showEpeExportV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { emitFixedPoint } from './fxEmit'
import { parseEpe } from './epeImport'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { compileShow } from './showCompiler'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { createFastReplayRuntime, type FastReplayRuntimeOptions } from './fastReplay'
import { validateShowRecordV2, parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { createInstallationShowOutputContract } from './showOutputContract'
import type { MapRecord } from './personalContentRecords'

function groupFixture(held = false): ShowRecordV2 {
  const record = fixture()
  record.composition.patternInstances[0].controlTargets = { sliderLevel: .2 }
  record.composition.layers.push({ id: 'group-layer', zoneId: 'zone', name: 'Overlay', rank: 1 })
  const ordinary = record.composition.clips[0]
  record.composition.groupDefinitions = [{ id: 'group', name: 'Repeated',
    patternInstances: [{ ...structuredClone(record.composition.patternInstances[0]), id: 'slot', pattern: { kind: 'user', id: 'stale-template' }, patternName: 'Stale template' }],
    layers: [{ id: 'local-layer', name: 'Local', rank: 0 }],
    clips: [{ id: 'child', instanceId: 'slot', layerId: 'local-layer', startMs: 0, durationMs: 200, entryPolicy: 'restart', zoneSampleMode: ordinary.zoneSampleMode,
      appearance: { keys: [{ ...structuredClone(ordinary.appearance.keys[0]), id: 'child-key', timeMs: 0 }] } }],
    transitions: [], propertyTracks: [{ id: 'local-level', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLevel' }, activeStartMs: 0, activeDurationMs: 200,
      keyframes: [{ id: 'first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'last', timeMs: 200, value: .8, easing: { curve: 'linear' } }] }],
  }]
  record.composition.groupOccurrences = [200, 700].map((startMs, i) => ({ id: `use-${i}`, definitionId: 'group', layoutOccurrenceId: record.composition.layoutOccurrences[0].id,
    zoneId: 'zone', startMs, translationX: .1, translationY: .2,
    layerBindings: [{ definitionLayerId: 'local-layer', layerId: 'group-layer' }], instanceBindings: { slot: ordinary.instanceId },
    holds: held && i === 0 ? [{ id: 'pause', localTimeMs: 100, durationMs: 100 }] : [] }))
  return record
}

it.each(['fast', 'fidelity'] as const)('shared Group authority and Restart export preserve %s playback', fidelity => {
  const record = groupFixture()
  const { exported } = provePlayback(record, fidelity)
  expect(exported.source).toContain('[stock:TestPattern1D]')
  expect(exported.source).not.toContain('stale-template')
  expect(exported.source).toContain('0.2: TestPattern1D (200 ms) [use-0:child]')
})

it.each(['fast', 'fidelity'] as const)('held nonlinear Group/Restart export preserves %s playback', fidelity => {
  const record = groupFixture(true)
  const { exported } = provePlayback(record, fidelity)
  expect(exported.source).toContain('(300 ms) [use-0:child]')
})

it.each(['fast', 'fidelity'] as const)('default-bound Group source provenance and %s playback remain authoritative', fidelity => {
  const record = groupFixture()
  record.composition.groupDefinitions[0].patternInstances[0].pattern = { kind: 'user', id: 'local-pattern' }
  record.composition.groupDefinitions[0].patternInstances[0].patternName = 'Default voice'
  for (const occurrence of record.composition.groupOccurrences) delete occurrence.instanceBindings
  const before = structuredClone(record)
  const { exported } = provePlayback(record, fidelity)
  expect(exported.source).toContain('- Default voice [user:local-pattern]')
  expect(exported.source).toContain('0.2: Default voice (200 ms) [use-0:child]')
  expect(record).toEqual(before)
})

it.each(['fast', 'fidelity'] as const)('native split-position Layout animation export preserves %s playback', fidelity => {
  const record = fixture()
  record.zones.push({ id: 'right', name: 'Right', nominalPixelCount: 16 })
  record.zoneLayouts[0].name = 'Animated Split'
  record.zoneLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'right'] }
  record.composition.propertyTracks.push({ id: 'split-position', target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: record.composition.layoutOccurrences[0].id },
    activeStartMs: 0, activeDurationMs: 1000,
    keyframes: [{ id: 'split-first', timeMs: 0, value: .2, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'split-last', timeMs: 1000, value: .8, easing: { curve: 'linear' } }] })
  expect(provePlayback(record, fidelity).exported.source).toContain('Animated Split')
})

const customMap: MapRecord = { id: 'private-custom-map', name: 'Studio Grid', dim: 2, generator: 'custom', params: {}, points: [[0, 0], [1, 0], [0, 1], [1, 1]], updatedAt: 1 }

it.each(['stock', 'custom', 'none'] as const)('installation %s map stamp matches existing compatibility/fingerprint semantics', mapKind => {
  const record = fixture()
  record.stageMapId = mapKind === 'stock' ? 'plane' : mapKind === 'custom' ? customMap.id : null
  record.outputContract = createInstallationShowOutputContract({ pixelCount: 4, outputMapId: record.stageMapId ?? null })
  const exported = buildShowEpeExportV2(record, code, { ...options, userMaps: [customMap] })
  expect(exported.status, JSON.stringify(exported)).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  const stamp = parseEpe(exported.text).stamp!
  expect(stamp.compatibility).toEqual({
    portability: 'installation-bound',
    dimensions: mapKind === 'none' ? [] : [2],
    mapClasses: mapKind === 'stock' ? ['surface'] : mapKind === 'custom' ? ['custom'] : [],
    resolution: 'fixed',
    exactMap: true,
  })
  expect(stamp.preferredMap).toEqual(mapKind === 'stock'
    ? { kind: 'stock', id: 'plane', name: 'Square' }
    : mapKind === 'custom' ? { kind: 'custom', name: 'Studio Grid' } : undefined)
  expect(stamp.showOutputContract).toEqual(mapKind === 'stock'
    ? { version: 1, kind: 'installation', pixelCount: 4, outputMap: { kind: 'stock', id: 'plane', name: 'Square', fingerprint: '66df4495' } }
    : mapKind === 'custom'
      ? { version: 1, kind: 'installation', pixelCount: 4, outputMap: { kind: 'custom', name: 'Studio Grid', fingerprint: '66df4495' } }
      : { version: 1, kind: 'installation', pixelCount: 4 })
  expect(stamp.showOutputContract).toMatchObject({ kind: 'installation', pixelCount: 4 })
  if (mapKind === 'custom') {
    expect(exported.source).not.toContain(customMap.id)
    expect(stamp.showOutputContract).toMatchObject({ outputMap: { kind: 'custom', name: 'Studio Grid', fingerprint: expect.stringMatching(/^[a-f0-9]{8}$/) } })
  }
})

it('portable reference resolution, attribution and native labels preserve available metadata only', () => {
  const record = groupFixture()
  record.name = '  Lumière */\nShow  '
  record.stageMapId = 'plane'
  record.composition.markers.push({ id: 'guide', timeMs: 400, name: 'Not a chapter' })
  record.composition.patternInstances.push({ ...structuredClone(record.composition.patternInstances[0]), id: 'unused', pattern: { kind: 'user', id: 'unused-pattern' }, patternName: 'Unused' })
  const exported = buildShowEpeExportV2(record, code, { ...options, attribution: { by: ['Artist */\nName'], patterns: [{ kind: 'stock', id: 'TestPattern1D', name: 'Resolver alias', authors: ['Original Author'] }, { kind: 'user', id: 'unused-pattern', name: 'Unused', authors: ['Unused Author'] }] } })
  expect(exported.status, JSON.stringify(exported)).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  expect(exported.filename).toBe('lumiere-show.epe')
  expect(exported.source).toContain('By: Artist * / Name')
  expect(exported.source).toContain('TestPattern1D by Original Author')
  expect(exported.source).not.toContain('Unused Author')
  expect(exported.source).not.toContain('Resolver alias')
  expect(exported.source).not.toContain('Not a chapter')
  expect(parseEpe(exported.text).stamp?.showOutputContract).toMatchObject({ kind: 'portable-2d', resolution: 'variable' })
  expect(JSON.parse(exported.text)).toMatchObject({ id: options.id, preview: options.preview })
})

it('explicit empty export refusal preserves retained dormant owners without inventing a runtime', () => {
  const record = groupFixture()
  record.composition.clips = []
  record.composition.groupOccurrences = []
  const before = structuredClone(record)
  expect(validateShowRecordV2(record)).toEqual([])
  expect(buildShowEpeExportV2(record, code, options)).toMatchObject({ status: 'refused', code: 'empty-show' })
  expect(record).toEqual(before)
})

it.each(['unknown-field', 'missing-reference', 'conflicting-authority'] as const)('invalid %s record refuses before export with exact immutable input', partition => {
  const record = groupFixture()
  if (partition === 'unknown-field') Object.assign(record, { scenes: [] })
  if (partition === 'missing-reference') record.composition.clips[0].instanceId = 'missing'
  if (partition === 'conflicting-authority') {
    record.composition.groupOccurrences[0].instanceBindings = undefined
    record.composition.groupOccurrences[1].instanceBindings = undefined
    const other = structuredClone(record.composition.groupDefinitions[0])
    other.id = 'other'
    other.patternInstances[0].patternName = 'Conflict'
    record.composition.groupDefinitions.push(other)
    record.composition.groupOccurrences[1].definitionId = 'other'
    record.composition.groupOccurrences[0].instanceBindings = { slot: 'same-runtime' }
    record.composition.groupOccurrences[1].instanceBindings = { slot: 'same-runtime' }
  }
  const before = structuredClone(record)
  expect(buildShowEpeExportV2(record, code, options)).toMatchObject({ status: 'refused', code: 'invalid-record' })
  expect(record).toEqual(before)
})

const options = { id: 'native-export', preview: '/9j/native', stampedAt: '2026-09-16T00:00:00Z' }
const code = 'export var level=.2; export var elapsed=0; export function sliderLevel(v){level=v} export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(level,elapsed/2000,0)}'

function fixture(): ShowRecordV2 {
  const source = convertibleV1Show()
  source.composition!.scenes[0].zones[0].overlays = []
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  return converted.record
}

function artifact(record: ShowRecordV2, sourceCode = code) {
  const decoded = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(decoded.status).toBe('opened')
  if (decoded.status !== 'opened') throw new Error('Record reopening refused')
  const reopened = decoded.record
  expect(validateShowRecordV2(reopened)).toEqual([])
  const prepared = prepareShowV2ForCompile(reopened, { byCellId: {}, stageDimension: 2,
    byPatternInstanceId: Object.fromEntries(materializeShowGroupsV2(reopened).composition.patternInstances.map(instance => [instance.id, sourceCode])),
  }, { libraries: LIBRARIES })
  expect(prepared.status, JSON.stringify(prepared)).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('Preparation refused')
  return compileShow(prepared.recipe, LIBRARIES)
}

function provePlayback(record: ShowRecordV2, fidelity: 'fast' | 'fidelity', sourceCode = code) {
  const before = structuredClone(record)
  const compiled = artifact(record, sourceCode)
  const exported = buildShowEpeExportV2(record, compiled.code, options)
  expect(exported.status, JSON.stringify(exported)).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  expect(record).toEqual(before)
  expect(exported.source.endsWith(compiled.code)).toBe(true)
  const opened = parseEpe(exported.text)
  expect(opened.name).toBe(record.name)
  expect(opened.stamp?.id).toBe(record.id)
  expect(opened.stamp?.kind).toBe('show')
  const replayOptions: FastReplayRuntimeOptions = { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }] }
  const original = createFastReplayRuntime({ ...compiled, dimension: 2 }, replayOptions)
  const delivered = createFastReplayRuntime({ ...compiled, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 }, replayOptions)
  for (const atMs of [0, 1, 100, 199, 200, 201, 249, 250, 251, 299, 300, 301, 399, 400, 401, 499, 500, 501, 599, 600, 601, 699, 700, 701, 749, 750, 751, 899, 900, 901, 999, 1001, 1500]) {
    const a = original.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    const b = delivered.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true })
    expect(b.frame).toEqual(a.frame)
    expect(Object.keys(a.exports).length).toBeGreaterThan(0)
    expect(b.exports).toEqual(a.exports)
  }
  return { exported, opened, compiled }
}

it.each((['fast', 'fidelity'] as const).flatMap(fidelity => [false, true].map(retained => ({ fidelity, retained }))))('in-range nonlinear repeat-scale EPE preserves independent samples/state ($fidelity, retained:$retained)', ({ fidelity, retained }) => {
  const record = fixture()
  record.composition.executionModel = 'continuous'
  record.composition.propertyTracks = [{ id: 'repeat-scale', target: { kind: 'show-repeat-scale' }, activeStartMs: 250, activeDurationMs: 500,
    keyframes: [{ id: 'repeat-first', timeMs: 250, value: retained ? 2.125 : 2, easing: { curve: 'quadratic', direction: 'in' },
      ...(retained ? { curveSegment: { baseValue: 2, deltaValue: 2, sourceDurationMs: 1000, elapsedOffsetMs: 250, easing: { curve: 'quadratic' as const, direction: 'in' as const } } } : {}) },
    { id: 'repeat-last', timeMs: 750, value: retained ? 3.125 : 4, easing: { curve: 'linear' } }] }]
  const sampleCode = 'export var elapsed=0; export function beforeRender(delta){elapsed+=delta} export function render2D(index,x,y){rgb(x,y,elapsed/1000)}'
  const { opened, compiled } = provePlayback(record, fidelity, sampleCode)
  const runtime = createFastReplayRuntime({ ...compiled, code: opened.src, fxCode: emitFixedPoint(opened.src), dimension: 2 },
    { fidelity, randomSeed: 1038, mapPoints: [{ sample: [.25, .5], pos: [.25, .5] }] })
  const member = compiled.summary.clips.find(clip => clip.id === record.composition.clips[0].instanceId)!
  for (const atMs of [125, 249, 250, 251, 375, 500, 625, 749, 750, 751, 875, 1000, 1001, 1250, 1500]) {
    const result = runtime.advanceTo(atMs, { stepMs: 125, forceFullIntermediateRender: true })
    const scoreMs = atMs % 1000
    const scale = scoreMs < 250 || scoreMs >= 750 ? 1 : 2 + 2 * (retained ? scoreMs / 1000 : (scoreMs - 250) / 500) ** 2
    expect(Math.abs(result.frame[0] - (.25 * scale % 1)), `sample@${atMs}`).toBeLessThan(fidelity === 'fast' ? 1e-12 : 5 / 65536)
    expect(result.exports[`${member.prefix}_elapsed`], `state@${atMs}`).toBe(atMs * (fidelity === 'fidelity' ? 65536 : 1))
  }
})

it.each(['fast', 'fidelity'] as const)('native ordinary EPE reopens exact generated playback and state in %s', fidelity => {
  provePlayback(fixture(), fidelity)
})

it.each(['fast', 'fidelity'] as const)('native whole-output Transition metadata retains actual %s choreography', fidelity => {
  const record = fixture()
  const first = record.composition.clips[0]
  first.durationMs = 300
  const second = structuredClone(first)
  second.id = 'incoming'
  second.startMs = 500
  second.durationMs = 500
  second.entryPolicy = 'restart'
  second.appearance.keys[0] = { ...second.appearance.keys[0], id: 'incoming-key', timeMs: 500 }
  record.composition.clips.push(second)
  record.composition.transitions = [{ id: 'Native dissolve', kind: 'crossfade', durationMs: 200, easing: { curve: 'linear' },
    wholeOutput: { startMs: 300, fromClipIds: [first.id], toClipIds: [second.id] }, participants: [], propertyRamps: [] }]
  const { exported } = provePlayback(record, fidelity)
  expect(exported.source).toContain('0.3: Native dissolve: crossfade 0.2s')
})

it.each(['fast', 'fidelity'] as const)('materialized Group Transition metadata and %s artifact retain occurrence-qualified timing', fidelity => {
  const record = groupFixture(true)
  const definition = record.composition.groupDefinitions[0]
  definition.propertyTracks = []
  const outgoing = definition.clips[0]
  outgoing.durationMs = 50
  const incoming = structuredClone(outgoing)
  incoming.id = 'later'
  incoming.startMs = 100
  incoming.durationMs = 100
  incoming.appearance.keys[0] = { ...incoming.appearance.keys[0], id: 'later-key', timeMs: 100 }
  definition.clips.push(incoming)
  // Put the hold inside the later child, beyond the visual window.
  record.composition.groupOccurrences[0].holds[0].localTimeMs = 150
  definition.transitions = [{ id: 'local-dissolve', kind: 'crossfade', durationMs: 50, easing: { curve: 'linear' }, fromPlacementId: outgoing.id, toPlacementId: incoming.id }]
  const { exported } = provePlayback(record, fidelity)
  expect(exported.source).toContain('0.3: use-0:local-dissolve: crossfade 0.1s')
  expect(exported.source).toContain('0.8: use-1:local-dissolve: crossfade 0.1s')
  expect(exported.source).toContain('start 250 ms; duration 50 ms')
  expect(exported.source).toContain('start 750 ms; duration 50 ms')
  expect(exported.source).toContain('(200 ms) [use-0:later]')
})

it.each(['stock', 'custom', 'none'] as const)('portable %s map metadata never fixes the reference resolution', mapKind => {
  const record = fixture()
  record.stageMapId = mapKind === 'stock' ? 'wide' : mapKind === 'custom' ? customMap.id : null
  const exported = buildShowEpeExportV2(record, code, { ...options, userMaps: [customMap] })
  expect(exported.status).toBe('exported')
  if (exported.status !== 'exported') throw new Error(exported.message)
  const stamp = parseEpe(exported.text).stamp!
  expect(stamp.compatibility).toEqual({ portability: 'adaptive', dimensions: [2], mapClasses: ['surface'], resolution: 'adaptive', exactMap: false })
  expect(stamp.showOutputContract).toEqual({ version: 1, kind: 'portable-2d', dimensions: [2], mapClasses: ['surface'], resolution: 'variable' })
  if (mapKind === 'custom') expect(exported.source).not.toContain(customMap.id)
  if (mapKind === 'none') expect(exported.source).toContain('Preferred map: none recorded.')
})

it.each(['fast', 'fidelity'] as const)('converted timed Layout transfer preserves native metadata and %s playback', fidelity => {
  const source = continuingV1Show()
  source.routingLayouts.push({ ...structuredClone(source.routingLayouts[0]), id: 'evening', name: 'Evening' })
  source.transitions = [{ id: 'routing', afterSceneId: 'scene-a', kind: 'routing', durationMs: 100, layoutId: 'evening', routingDirection: 'reverse', easing: { curve: 'quadratic', direction: 'in-out' } }]
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const { exported } = provePlayback(converted.record, fidelity)
  expect(exported.source).toContain('0.5: Evening (500 ms); transfer reverse 100 ms')
  expect(exported.source).toContain('ease ease-in-out')
  expect(parseEpe(exported.text).stamp?.transforms).toContain('routing-layouts')
})
