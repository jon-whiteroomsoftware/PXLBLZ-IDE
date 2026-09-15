import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } from './showCompositionV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { materializeShowGroupOccurrences } from './showGroupModel'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { evaluateShowPropertyTrackV2 } from './showPropertyAnimationV2'

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

it.each(['collision', 'binding', 'appearance', 'track', 'layout-crossing', 'runtime-conflict'] as const)('rejects invalid materialized Group state: %s', change => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const composition = converted.record.composition
  if (change === 'collision') composition.groupOccurrences[1].startMs = 250
  if (change === 'binding') composition.groupOccurrences[0].layerBindings[0].layerId = 'missing'
  if (change === 'appearance') composition.groupDefinitions[0].clips[0].appearance.keys[0].timeMs = 1
  if (change === 'track') composition.groupDefinitions[0].propertyTracks[0].target = { kind: 'clip-opacity', clipId: 'missing' }
  if (change === 'layout-crossing') composition.groupOccurrences[1].startMs = 950
  if (change === 'runtime-conflict') {
    composition.groupOccurrences[0].instanceBindings = { child: 'instance' }
    composition.groupDefinitions[0].patternInstances[0].time.timeScale = 2
  }
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

it('refuses an accidental default runtime collision with an ordinary instance', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  for (const occurrence of converted.record.composition.groupOccurrences) delete occurrence.instanceBindings
  converted.record.composition.patternInstances.push({ ...structuredClone(converted.record.composition.groupDefinitions[0].patternInstances[0]), id: 'group:["group","child"]' })
  expect(prepareShowV2ForCompile(converted.record, lookup).status).toBe('refused')
})

it('validates unused definitions before they can be instantiated', () => {
  const converted = convertShowRecordV1ToV2(groupShow())
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  converted.record.composition.groupOccurrences = []
  converted.record.composition.groupDefinitions[0].clips[0].appearance.keys[0].timeMs = 50
  expect(prepareShowV2ForCompile(converted.record, lookup).status).toBe('refused')
})
