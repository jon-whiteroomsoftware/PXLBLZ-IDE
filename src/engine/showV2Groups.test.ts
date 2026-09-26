import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2 } from './showCompositionV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { parseEpe } from './epeImport'
import { convertedV2Record, exportShowEpeV2ForTest } from '../test/showEpeV2TestSupport'
import { LIBRARIES } from '../pixelblaze/libs'
import { materializeShowGroupOccurrences } from './showGroupModel'
import { effectiveShowInstanceUseCountV2, materializeShowGroupsV2 } from './showGroupsV2'
import { deriveShowRestartEventsV2, evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'
import { validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'

function groupShow() {
  const source = convertibleV1Show()
  source.composition!.scenes[0].zones[0].overlays = []
  source.composition!.groupDefinitions = [{ id: 'group', name: 'Pulse', patternInstances: [{ ...structuredClone(source.composition!.patternInstances[0]), id: 'child' }], placements: [{ id: 'pulse', instanceId: 'child', layerOffset: 0, startMs: 0, durationMs: 200, opacity: 0.5, view: { mirror: false, phase: 0, brightness: 1 } }], propertyTracks: [{ id: 'opacity', target: { kind: 'placement-opacity', placementId: 'pulse' }, keyframes: [{ id: 'first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'last', timeMs: 200, value: 0.8, easing: { curve: 'linear' } }] }] }]
  source.composition!.groupOccurrences = [200, 600].map((startMs, index) => ({ id: `occ-${index}`, definitionId: 'group', sceneId: 'scene-a', zoneId: 'zone', startMs, baseLayer: 1, translationX: index * 0.2, translationY: 0 }))
  return source
}
const code = 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(x,y,0)}'
const lookup = { byCellId: {}, byPatternInstanceId: { instance: code, child: code, 'occ-0:child': code, 'occ-1:child': code }, stageDimension: 2 as const }

it('preserves linked Group authorship, translated animation and explicit legacy private instances', () => {
  const source = groupShow()
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' && converted.issues)).toBe('converted')
  if (converted.status !== 'converted') return
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  expect(converted.record.composition.groupDefinitions).toHaveLength(1)
  expect(converted.record.composition.groupOccurrences).toHaveLength(2)
  expect(converted.record.composition.clips).toHaveLength(1)
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(converted.record))).toEqual({ status: 'opened', record: converted.record })
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.clips.map(clip => clip.id).sort()).toEqual(['instance', 'occ-0:child', 'occ-1:child'])
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it('shares definition instances by default across linked occurrences', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  for (const occurrence of converted.record.composition.groupOccurrences) delete occurrence.instanceBindings
  const before = structuredClone(converted.record)
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.clips.map(clip => clip.id).sort()).toEqual(['group:["group","child"]', 'instance'])
  expect(Object.values(prepared.provenance.runtimeInstanceIdByClipId).filter(id => id === 'group:["group","child"]')).toHaveLength(2)
  expect(converted.record).toEqual(before)
  const expectedSource = groupShow()
  expectedSource.composition = materializeShowGroupOccurrences(expectedSource.composition!)
  const sharedId = 'group:["group","child"]'
  expectedSource.composition.patternInstances = expectedSource.composition.patternInstances.filter(instance => instance.id === 'instance' || instance.id === 'occ-0:child').map(instance => instance.id === 'instance' ? instance : { ...instance, id: sharedId })
  for (const scene of expectedSource.composition.scenes) for (const zone of scene.zones) for (const layer of zone.overlays) for (const clip of layer.placements) clip.instanceId = sharedId
  const expectedLookup = { ...lookup, byPatternInstanceId: { ...lookup.byPatternInstanceId, [sharedId]: code } }
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(expectedSource, expectedLookup), LIBRARIES).code)
})

it.each(['collision', 'hold-collision', 'binding', 'appearance', 'track', 'layout-crossing'] as const)('rejects invalid materialized Group state: %s', change => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const composition = converted.record.composition
  if (change === 'collision') composition.groupOccurrences[1].startMs = 250
  if (change === 'hold-collision') composition.groupOccurrences[0].holds = [{ id: 'overlap', localTimeMs: 100, durationMs: 300 }]
  if (change === 'binding') composition.groupOccurrences[0].layerBindings[0].layerId = 'missing'
  if (change === 'appearance') composition.groupDefinitions[0].clips[0].appearance.keys[0].timeMs = 1
  if (change === 'track') composition.groupDefinitions[0].propertyTracks[0].target = { kind: 'clip-opacity', clipId: 'missing' }
  if (change === 'layout-crossing') composition.groupOccurrences[1].startMs = 950
  const before = structuredClone(converted.record)
  expect(prepareShowV2ForCompile(converted.record, lookup).status).toBe('refused')
  expect(converted.record).toEqual(before)
})


it('preserves definition-local Transitions through occurrence materialization', () => {
  const source = groupShow()
  const definition = source.composition!.groupDefinitions![0]
  const first = definition.placements[0]
  first.durationMs = 100
  definition.placements.push({ ...structuredClone(first), id: 'answer', startMs: 200 })
  definition.propertyTracks = []
  definition.transitions = [{ id: 'local-crossfade', fromPlacementId: 'pulse', toPlacementId: 'answer', kind: 'crossfade', durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' }]
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' && converted.issues)).toBe('converted')
  if (converted.status !== 'converted') return
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it('translates Group Transform curves together with held appearance', () => {
  const source = groupShow()
  source.composition!.groupDefinitions![0].propertyTracks![0].target = { kind: 'placement-transform', placementId: 'pulse', property: 'positionX' }
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it('materializes ordered occurrence holds without stretching exact Property curves or changing shared identity', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const definition = converted.record.composition.groupDefinitions[0]
  const occurrence = converted.record.composition.groupOccurrences[0]
  converted.record.composition.groupOccurrences = [occurrence]
  const child = definition.clips[0]
  const authoredAppearanceId = `${child.id}:appearance:at-100`
  child.appearance.keys.push({
    ...structuredClone(child.appearance.keys[0]),
    id: authoredAppearanceId,
    timeMs: 100,
    value: { ...structuredClone(child.appearance.keys[0].value), opacity: 0.25 },
  })
  definition.propertyTracks[0].keyframes[0].easing = { curve: 'quadratic', direction: 'in' }
  occurrence.holds = [
    { id: 'first-hold', localTimeMs: 50, durationMs: 25 },
    { id: 'exact-key-hold', localTimeMs: 100, durationMs: 100 },
  ]
  const before = structuredClone(converted.record)

  const materialized = materializeShowGroupsV2(converted.record)
  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(materialized))
  expect(reopened.status, JSON.stringify(reopened.status === 'refused' && reopened.issues)).toBe('opened')
  if (reopened.status !== 'opened') return
  const materializedClip = reopened.record.composition.clips.find(candidate => candidate.id === 'occ-0:pulse')!
  const materializedTrack = reopened.record.composition.propertyTracks.find(candidate => candidate.id === 'occ-0:opacity')!

  expect(materializedClip).toMatchObject({ startMs: 200, durationMs: 325, instanceId: 'occ-0:child' })
  expect(materializedClip.appearance.keys.map(key => [key.id, key.timeMs, key.value.opacity])).toEqual([
    ['occ-0:pulse:appearance:1', 200, 0.5],
    ['occ-0:pulse:appearance:hold:first-hold', 250, 0.5],
    ['occ-0:pulse:appearance:hold:exact-key-hold', 325, 0.25],
    [`occ-0:${authoredAppearanceId}`, 425, 0.25],
  ])
  expect(evaluateShowPropertyTrackV2(materializedTrack, 260)).toBeCloseTo(0.2375)
  expect(evaluateShowPropertyTrackV2(materializedTrack, 350)).toBeCloseTo(0.35)
  expect(evaluateShowPropertyTrackV2(materializedTrack, 450)).toBeCloseTo(0.434375)
  expect(materializedTrack.keyframes.find(key => key.id === 'occ-0:first')?.timeMs).toBe(200)
  expect(materializedTrack.keyframes.find(key => key.id === 'occ-0:last')?.timeMs).toBe(525)
  expect(converted.record).toEqual(before)
  expect(materialized.composition.patternInstances.map(instance => instance.id)).toEqual(
    expect.arrayContaining(converted.record.composition.patternInstances.map(instance => instance.id)),
  )

  definition.clips[0].entryPolicy = 'restart'
  expect(deriveShowRestartEventsV2(converted.record)).toMatchObject({
    status: 'derived',
    events: [{ instanceId: 'occ-0:child', atMs: 200, clipIds: ['occ-0:pulse'] }],
  })
  expect(effectiveShowInstanceUseCountV2(converted.record, 'occ-0:child')).toBe(1)
})

it('materializes a safe-integer Property boundary without an unsafe intermediate', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  const definitionDurationMs = Number.MAX_SAFE_INTEGER - 2
  const definition = record.composition.groupDefinitions[0]
  const occurrence = record.composition.groupOccurrences[0]
  record.composition.showEndMs = Number.MAX_SAFE_INTEGER
  record.composition.clips = []
  record.composition.groupOccurrences = [occurrence]
  record.composition.layoutOccurrences = [{
    ...record.composition.layoutOccurrences[0], startMs: 0, durationMs: Number.MAX_SAFE_INTEGER,
  }]
  definition.clips[0].durationMs = definitionDurationMs
  definition.propertyTracks[0].activeDurationMs = definitionDurationMs
  definition.propertyTracks[0].keyframes = [
    { id: 'first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
    { id: 'last', timeMs: definitionDurationMs, value: 0.8, easing: { curve: 'linear' } },
  ]
  occurrence.startMs = 0
  delete occurrence.trackActivation
  occurrence.holds = [
    { id: 'first', localTimeMs: 1, durationMs: 1 },
    { id: 'second', localTimeMs: 3, durationMs: 1 },
  ]

  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  expect(reopened.status, JSON.stringify(reopened.status === 'refused' && reopened.issues)).toBe('opened')
  if (reopened.status !== 'opened') return
  const materialized = materializeShowGroupsV2(reopened.record)
  const materializedTrack = materialized.composition.propertyTracks.find(track => track.id === 'occ-0:opacity')!

  expect(materializedTrack.activeDurationMs).toBe(Number.MAX_SAFE_INTEGER)
  expect(materializedTrack.keyframes.find(key => key.id === 'occ-0:opacity:hold:4')).toMatchObject({
    timeMs: 4,
  })
  expect(materializedTrack.keyframes.some(key => key.id === 'occ-0:opacity:hold:3')).toBe(false)
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(materialized))).toEqual({
    status: 'opened', record: materialized,
  })
})

it('compiles and replays a held Group against an independently authored ordinary v2 record', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const held = converted.record
  const definition = held.composition.groupDefinitions[0]
  const occurrence = held.composition.groupOccurrences[0]
  held.composition.groupOccurrences = [occurrence]
  const first = definition.clips[0]
  first.durationMs = 100
  definition.clips.push({
    ...structuredClone(first), id: 'answer', startMs: 100,
    appearance: { keys: [{ ...structuredClone(first.appearance.keys[0]), id: 'answer:appearance', timeMs: 100 }] },
  })
  definition.propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: 'child' }
  definition.propertyTracks[0].keyframes[0].easing = { curve: 'quadratic', direction: 'in' }
  occurrence.holds = [{ id: 'gap-hold', localTimeMs: 100, durationMs: 100 }]

  const expected = structuredClone(held)
  expected.composition.groupDefinitions = []
  expected.composition.groupOccurrences = []
  expected.composition.patternInstances.push({ ...structuredClone(definition.patternInstances[0]), id: 'occ-0:child' })
  const layerId = occurrence.layerBindings[0].layerId
  const appearanceValue = {
    opacity: 0.5,
    view: { mirror: false, phase: 0, brightness: 1 },
    effects: [],
    transform: { positionX: 0, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
  }
  expected.composition.clips.push(
    {
      id: 'occ-0:pulse', instanceId: 'occ-0:child', zoneId: 'zone', layerId,
      startMs: 200, durationMs: 100, entryPolicy: 'continue', zoneSampleMode: 'span',
      appearance: { keys: [{ id: 'occ-0:pulse:appearance:1', timeMs: 200, value: structuredClone(appearanceValue) }] },
    },
    {
      id: 'occ-0:answer', instanceId: 'occ-0:child', zoneId: 'zone', layerId,
      startMs: 400, durationMs: 100, entryPolicy: 'continue', zoneSampleMode: 'span',
      appearance: { keys: [{ id: 'occ-0:answer:appearance', timeMs: 400, value: structuredClone(appearanceValue) }] },
    },
  )
  expected.composition.propertyTracks.push({
    id: 'occ-0:opacity', target: { kind: 'instance-time-scale', instanceId: 'occ-0:child' },
    activeStartMs: 200, activeDurationMs: 300,
    keyframes: [
      {
        id: 'occ-0:first', timeMs: 200, value: 0.2, easing: { curve: 'quadratic', direction: 'in' },
        curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 200, elapsedOffsetMs: 0 },
      },
      { id: 'occ-0:opacity:hold:100', timeMs: 300, value: 0.35, easing: { curve: 'linear' } },
      {
        id: 'occ-0:opacity:resume:200', timeMs: 400, value: 0.35, easing: { curve: 'quadratic', direction: 'in' },
        curveSegment: { baseValue: 0.2, deltaValue: 0.6, easing: { curve: 'quadratic', direction: 'in' }, sourceDurationMs: 200, elapsedOffsetMs: 100 },
      },
      { id: 'occ-0:last', timeMs: 500, value: 0.8, easing: { curve: 'linear' } },
    ],
  })
  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(held))
  const expectedReopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(expected))
  expect(reopened.status).toBe('opened')
  expect(expectedReopened.status).toBe('opened')
  if (reopened.status !== 'opened' || expectedReopened.status !== 'opened') return

  const preparedHeld = prepareShowV2ForCompile(reopened.record, lookup)
  const preparedExpected = prepareShowV2ForCompile(expectedReopened.record, lookup)
  expect(preparedHeld.status, JSON.stringify(preparedHeld.status === 'refused' && preparedHeld.issues)).toBe('ready')
  expect(preparedExpected.status, JSON.stringify(preparedExpected.status === 'refused' && preparedExpected.issues)).toBe('ready')
  if (preparedHeld.status !== 'ready' || preparedExpected.status !== 'ready') return
  const heldArtifact = compileShow(preparedHeld.recipe, LIBRARIES)
  const expectedArtifact = compileShow(preparedExpected.recipe, LIBRARIES)
  const reopenedArtifact = parseEpe(exportShowEpeV2ForTest(convertedV2Record(groupShow()), heldArtifact.code, {
    id: 'issue-1038-group-hold', stampedAt: '2026-09-15T00:00:00.000Z',
  }).text)
  expect(reopenedArtifact).toMatchObject({ stamp: { kind: 'show' } })
  expect(reopenedArtifact.src).toContain(heldArtifact.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const runtimeOptions = {
      randomSeed: 1038,
      fidelity,
      mapPoints: [0, 0.5, 1].map(x => ({ sample: [x, 0.5] as [number, number], pos: [x, 0.5] as [number, number] })),
    }
    const heldRuntime = createFastReplayRuntime({ ...heldArtifact, code: reopenedArtifact.src, dimension: 2 }, runtimeOptions)
    const expectedRuntime = createFastReplayRuntime({ ...expectedArtifact, dimension: 2 }, runtimeOptions)
    for (const [index, atMs] of [0, 199, 200, 299, 300, 399, 400, 499, 500, 999].entries()) {
      const options = { stepMs: 1, forceFullIntermediateRender: true }
      const actual = index === 0 ? heldRuntime.renderCurrentFrame() : heldRuntime.advanceTo(atMs, options)
      const oracle = index === 0 ? expectedRuntime.renderCurrentFrame() : expectedRuntime.advanceTo(atMs, options)
      expect(Array.from(actual.frame), `${fidelity} frame at ${atMs}`).toEqual(Array.from(oracle.frame))
      expect(Object.keys(actual.exports), `${fidelity} state keys at ${atMs}`).toEqual(Object.keys(oracle.exports))
      for (const [name, expectedValue] of Object.entries(oracle.exports)) {
        const actualValue = actual.exports[name]
        if (typeof actualValue === 'number' && typeof expectedValue === 'number') {
          expect(actualValue, `${fidelity} ${name} at ${atMs}`).toBeCloseTo(expectedValue, 12)
        } else {
          expect(actualValue, `${fidelity} ${name} at ${atMs}`).toEqual(expectedValue)
        }
      }
    }
  }
})

it('refuses holds that enter or detach an internal Transition window and accepts a complete shifted window', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  const definition = record.composition.groupDefinitions[0]
  const first = definition.clips[0]
  first.durationMs = 100
  definition.clips.push({
    ...structuredClone(first), id: 'answer', startMs: 200, durationMs: 100,
    appearance: { keys: [{ ...structuredClone(first.appearance.keys[0]), id: 'answer:appearance', timeMs: 200 }] },
  })
  definition.propertyTracks = []
  definition.transitions = [{
    id: 'local-crossfade', fromPlacementId: 'pulse', toPlacementId: 'answer', kind: 'crossfade',
    durationMs: 100, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
  }]
  record.composition.groupOccurrences = [record.composition.groupOccurrences[0]]
  const occurrence = record.composition.groupOccurrences[0]
  const before = structuredClone(record)

  occurrence.holds = [{ id: 'before-window', localTimeMs: 50, durationMs: 25 }]
  expect(validateShowRecordV2(record)).toEqual([])
  const shifted = materializeShowGroupsV2(record)
  expect(shifted.composition.transitions).toHaveLength(1)
  expect(shifted.composition.clips.filter(clip => clip.id.startsWith('occ-0:')).map(clip => (
    [clip.id, clip.startMs, clip.durationMs]
  ))).toEqual([
    ['occ-0:pulse', 200, 125],
    ['occ-0:answer', 425, 100],
  ])

  for (const localTimeMs of [100, 150, 200]) {
    occurrence.holds = [{ id: `blocked-${localTimeMs}`, localTimeMs, durationMs: 25 }]
    const beforeRefusal = structuredClone(record)
    expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: expect.stringContaining('materialized.composition.transitions') }),
    ]))
    expect(record).toEqual(beforeRefusal)
  }
  expect(before.composition.groupDefinitions).toEqual(record.composition.groupDefinitions)
})

it('uses extended occurrence duration for Show End and every intersected Layout availability interval', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.composition.clips = []
  record.composition.groupOccurrences = [record.composition.groupOccurrences[0]]
  record.composition.groupOccurrences[0].holds = [{ id: 'extension', localTimeMs: 100, durationMs: 100 }]
  record.zones.push({ id: 'elsewhere', name: 'Elsewhere', nominalPixelCount: 16 })
  record.zoneLayouts.push({ id: 'elsewhere-layout', name: 'Elsewhere', zones: [], logical: { kind: 'single', zoneIds: ['elsewhere'] } })
  record.composition.layoutOccurrences = [
    { ...record.composition.layoutOccurrences[0], durationMs: 450 },
    { id: 'elsewhere-use', layoutId: 'elsewhere-layout', startMs: 450, durationMs: 550, parameters: {} },
  ]

  expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'composition.groupOccurrences[0]', message: expect.stringContaining('unavailable') }),
  ]))
  expect(validateShowLayoutAvailabilityV2(record)).toEqual(expect.arrayContaining([
    expect.objectContaining({ entityKind: 'group-occurrence', entityId: 'occ-0', layoutOccurrenceId: 'elsewhere-use' }),
  ]))
  record.composition.layoutOccurrences[0].durationMs = 500
  record.composition.layoutOccurrences[1].startMs = 500
  record.composition.layoutOccurrences[1].durationMs = 500
  expect(validateShowRecordV2(record)).toEqual([])
  expect(validateShowLayoutAvailabilityV2(record)).toEqual([])

  record.composition.groupOccurrences[0].holds[0].durationMs = 701
  expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
    expect.objectContaining({ path: 'composition.groupOccurrences[0]', message: expect.stringContaining('Show End') }),
  ]))
})

it('refuses a held Group instance track that overlaps an ordinary effective owner', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.composition.groupOccurrences = [record.composition.groupOccurrences[0]]
  const occurrence = record.composition.groupOccurrences[0]
  occurrence.instanceBindings = { child: 'instance' }
  occurrence.holds = [{ id: 'hold', localTimeMs: 100, durationMs: 100 }]
  record.composition.groupDefinitions[0].propertyTracks[0].target = { kind: 'instance-time-scale', instanceId: 'child' }
  record.composition.propertyTracks = [{
    id: 'ordinary-owner', target: { kind: 'instance-time-scale', instanceId: 'instance' },
    activeStartMs: 250, activeDurationMs: 100,
    keyframes: [
      { id: 'ordinary-start', timeMs: 250, value: 1, easing: { curve: 'linear' } },
      { id: 'ordinary-end', timeMs: 350, value: 1, easing: { curve: 'linear' } },
    ],
  }]
  const before = structuredClone(record)

  expect(validateShowRecordV2(record)).toEqual(expect.arrayContaining([
    expect.objectContaining({
      path: expect.stringContaining('materialized.composition.propertyTracks'),
      message: expect.stringContaining('overlaps active owner'),
    }),
  ]))
  expect(record).toEqual(before)
})

it.each([
  [{ kind: 'clip-transform', clipId: 'pulse', property: 'positionX' }, 'translationX'],
  [{ kind: 'clip-transform', clipId: 'pulse', property: 'positionY' }, 'translationY'],
  [{ kind: 'clip-aperture', clipId: 'pulse', property: 'x' }, 'translationX'],
  [{ kind: 'clip-aperture', clipId: 'pulse', property: 'y' }, 'translationY'],
] as const)('translates retained Group curve coefficients for $0', (target, translation) => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const occurrence = converted.record.composition.groupOccurrences[1]
  occurrence.translationX = 0
  occurrence.translationY = 0
  occurrence[translation] = 0.2
  const track = converted.record.composition.groupDefinitions[0].propertyTracks[0]
  track.target = target
  track.keyframes = [
    {
      id: 'retained-start', timeMs: 0, value: 0.05, easing: { curve: 'linear' },
      curveSegment: {
        baseValue: 0.05, deltaValue: 0.8, easing: { curve: 'quadratic', direction: 'in' },
        sourceDurationMs: 200, elapsedOffsetMs: 0,
      },
    },
    { id: 'retained-end', timeMs: 200, value: 0.85, easing: { curve: 'linear' } },
  ]
  const before = structuredClone(converted.record)

  const materialized = materializeShowGroupsV2(converted.record)
  const reopened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(materialized))
  expect(reopened.status).toBe('opened')
  if (reopened.status !== 'opened') return
  const translated = reopened.record.composition.propertyTracks.find(candidate => candidate.id === 'occ-1:opacity')!

  expect(translated.keyframes[0].curveSegment?.baseValue).toBeCloseTo(0.25)
  expect(evaluateShowPropertyTrackV2(translated, 700)).toBeCloseTo(0.45)
  expect(converted.record).toEqual(before)
})

it('uses a top-level Pattern instance as authority for a previously unbound default runtime', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  for (const occurrence of converted.record.composition.groupOccurrences) delete occurrence.instanceBindings
  const runtimeId = 'group:["group","child"]'
  converted.record.composition.patternInstances.push({
    ...structuredClone(converted.record.composition.groupDefinitions[0].patternInstances[0]),
    id: runtimeId,
    time: { timeScale: 0.5, timeOffsetMs: 0 },
  })
  converted.record.composition.groupDefinitions[0].patternInstances[0].time.timeScale = 2
  const materialized = materializeShowGroupsV2(converted.record)
  expect(materialized.composition.patternInstances.find(instance => instance.id === runtimeId)?.time.timeScale).toBe(0.5)
  expect(prepareShowV2ForCompile(converted.record, { ...lookup, byPatternInstanceId: { ...lookup.byPatternInstanceId, [runtimeId]: code } }).status).toBe('ready')
})

it('validates unused definitions before they can be instantiated', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  converted.record.composition.groupOccurrences = []
  converted.record.composition.groupDefinitions[0].clips[0].appearance.keys[0].timeMs = 50
  expect(prepareShowV2ForCompile(converted.record, lookup).status).toBe('refused')
})
