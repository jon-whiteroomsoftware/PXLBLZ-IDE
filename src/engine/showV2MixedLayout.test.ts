import { expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { runtimeParity } from '../../scripts/show-v2-parity'

it.each([1, 2])('preserves %i Layout transfers starting with whole-output visual Transitions', count => {
  const source = transitionV1Show('crossfade', 'live-live')
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
  source.routingLayouts = [
    { id: 'layout', name: 'Vertical', zones: [], logical: { kind: 'split', axis: 'x', zoneIds: ['zone', 'other'] } },
    { id: 'second', name: 'Horizontal', zones: [], logical: { kind: 'split', axis: 'y', zoneIds: ['zone', 'other'] } },
  ]
  const composition = source.composition!
  const [out, incoming] = composition.scenes[0].zones[0].main
  source.scenes = [{ id: 'a', name: 'A', durationMs: 400 }, { id: 'b', name: 'B', durationMs: 400 }]
  composition.scenes = [
    { sceneId: 'a', zones: [{ zoneId: 'zone', main: [out], overlays: [] }, { zoneId: 'other', main: [], overlays: [] }] },
    { sceneId: 'b', zones: [{ zoneId: 'zone', main: [{ ...incoming, startMs: 0 }], overlays: [] }, { zoneId: 'other', main: [], overlays: [] }] },
  ]
  const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
  source.transitions = [{ ...settings, afterSceneId: 'a' }, { id: 'layout-transfer', afterSceneId: 'a', kind: 'routing', layoutId: 'second', durationMs: 120, easing: { curve: 'sine', direction: 'in-out' }, routingDirection: 'reverse' }]
  delete composition.transitions
  if (count === 2) {
    source.scenes.push({ id: 'c', name: 'C', durationMs: 400 })
    composition.durationMs = 1600
    composition.scenes.push({ sceneId: 'c', zones: [{ zoneId: 'zone', main: [{ ...structuredClone(out), id: 'return' }], overlays: [] }, { zoneId: 'other', main: [], overlays: [] }] })
    source.transitions.push({ ...settings, id: 'return-visual', afterSceneId: 'b' }, { id: 'return-layout', afterSceneId: 'b', kind: 'routing', layoutId: 'layout', durationMs: 0, easing: { curve: 'linear' } })
  }
  const before = structuredClone(source)
  const lookup = { byCellId: {}, byPatternInstanceId: {
    'out-instance': 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(1,x,y)}',
    'in-instance': 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(x,y,1)}',
  }, stageDimension: 2 as const }
  const v1Recipe = showRecordToCompileRecipe(source, lookup)
  expect(v1Recipe.routingSwitches).toEqual([{ atMs: 400, layoutId: 'second', durationMs: 120, easing: { curve: 'sine', direction: 'in-out' }, direction: 'reverse' }, ...(count === 2 ? [{ atMs: 1000, layoutId: 'layout', durationMs: 0, easing: { curve: 'linear' }, direction: 'forward' }] : [])])
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' && converted.issues)).toBe('converted')
  if (converted.status !== 'converted') return
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.routingSwitches).toEqual(v1Recipe.routingSwitches)
  const a = compileShow(v1Recipe, LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  expect(b.code).toBe(a.code)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(a, b, source, converted.record, fidelity, [])).toMatchObject({ matched: true, secondLoopMatched: true, coldSeekMatchedContinuous: true })
  const changed = structuredClone(converted.record)
  changed.composition.layoutOccurrences[0].durationMs = 450
  changed.composition.layoutOccurrences[1].startMs = 450
  changed.composition.layoutOccurrences[1].durationMs -= 50
  expect(prepareShowV2ForCompile(changed, lookup).status).toBe('refused')
})

it('preserves a Zone disappearing and returning with the same runtime instance', () => {
  const source = transitionV1Show('crossfade')
  const composition = source.composition!
  const out = composition.scenes[0].zones[0].main[0]
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
  source.routingLayouts.push({ id: 'absent', name: 'Other only', zones: [], logical: { kind: 'single', zoneIds: ['other'] } })
  source.scenes = ['a', 'b', 'c'].map(id => ({ id, name: id, durationMs: 400 }))
  composition.durationMs = 1200
  composition.patternInstances = [composition.patternInstances[0]]
  composition.scenes = source.scenes.map((scene, index) => ({ sceneId: scene.id, zones: [
    { zoneId: 'zone', main: index === 1 ? [] : [{ ...structuredClone(out), id: `clip-${index}` }], overlays: [] },
    { zoneId: 'other', main: [], overlays: [] },
  ] }))
  delete composition.transitions
  source.transitions = [
    { id: 'disappear', afterSceneId: 'a', kind: 'routing', layoutId: 'absent', durationMs: 0, easing: { curve: 'linear' } },
    { id: 'return', afterSceneId: 'b', kind: 'routing', layoutId: 'layout', durationMs: 0, easing: { curve: 'linear' } },
  ]
  const lookup = { byCellId: {}, byPatternInstanceId: { 'out-instance': 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(x,y,calls/100)}' }, stageDimension: 2 as const }
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  expect(converted.record.composition.patternInstances).toHaveLength(1)
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const a = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  expect(b.code).toBe(a.code)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(a, b, source, converted.record, fidelity, [])).toMatchObject({ matched: true, secondLoopMatched: true, coldSeekMatchedContinuous: true })
})
