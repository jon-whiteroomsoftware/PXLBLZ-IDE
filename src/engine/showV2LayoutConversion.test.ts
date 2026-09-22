import { expect, it } from 'vitest'
import { continuingV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { validateShowRecordV2 } from './showCompositionV2'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'

function layoutSource() {
  const source = continuingV1Show()
  source.routingLayouts.push({ ...structuredClone(source.routingLayouts[0]), id: 'second', name: 'Second' })
  source.transitions = [{ id: 'transfer', afterSceneId: 'scene-a', kind: 'routing', layoutId: 'second', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, routingDirection: 'reverse' }]
  return source
}

it('preserves Layout transfer easing and shared identity through conversion and compilation', () => {
  const source = layoutSource()
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  expect(converted.record.composition.patternInstances).toHaveLength(1)
  expect(converted.record.composition.layoutOccurrences[1]).toMatchObject({ startMs: 500, incomingTransfer: { id: 'transfer', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, direction: 'reverse' } })
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { rgb(x,y,0) }' }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(prepared.recipe.routingSwitches).toEqual([{ atMs: 500, layoutId: 'second', durationMs: 200, easing: { curve: 'sine', direction: 'in-out' }, direction: 'reverse' }])
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})


it('lowers Layout occurrences by authored time rather than array order', () => {
  const converted = convertShowRecordV1ToV2(layoutSource())
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const lookup = { byCellId: {}, byPatternInstanceId: { instance: 'export function render2D(index,x,y) { rgb(x,y,0) }' }, stageDimension: 2 as const }
  const ordered = prepareShowV2ForCompile(converted.record, lookup)
  converted.record.composition.layoutOccurrences.reverse()
  expect(prepareShowV2ForCompile(converted.record, lookup)).toEqual(ordered)
})

it('rejects a transfer that references its own occurrence', () => {
  const converted = convertShowRecordV1ToV2(layoutSource())
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const target = converted.record.composition.layoutOccurrences[1]
  target.incomingTransfer!.fromOccurrenceId = target.id
  expect(validateShowRecordV2(converted.record)).not.toEqual([])
})

it('preserves a two-Zone spatial transfer in Fast and Precise through the second loop', async () => {
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  const source = layoutSource()
  source.zones = [{ id: 'left', name: 'Left', nominalPixelCount: 8 }, { id: 'right', name: 'Right', nominalPixelCount: 8 }]
  source.routingLayouts = [
    { id: 'layout', name: 'Vertical', zones: [], logical: { kind: 'split', zoneIds: ['left', 'right'], axis: 'x' } },
    { id: 'second', name: 'Horizontal', zones: [], logical: { kind: 'split', zoneIds: ['left', 'right'], axis: 'y' } },
  ]
  source.composition!.patternInstances.push({ ...structuredClone(source.composition!.patternInstances[0]), id: 'right-instance' })
  source.composition!.scenes.forEach((scene, index) => {
    const left = scene.zones[0]
    left.zoneId = 'left'
    const right = structuredClone(left)
    right.zoneId = 'right'
    right.main[0].id = index === 0 ? 'right-clip' : 'right-clip--span-scene-b'
    if (index > 0) right.main[0].logicalClipId = 'right-clip'
    right.main[0].instanceId = 'right-instance'
    scene.zones.push(right)
  })
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const lookup = { byCellId: {}, byPatternInstanceId: {
    instance: 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(1,0,0) }',
    'right-instance': 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(0,0,1) }',
  }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const before = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(before, after, source, converted.record, fidelity, []).matched).toBe(true)
})

it('keeps a split gapped Clip byte-identical through compile and replay in Fast and Precise (#1080)', async () => {
  const { runtimeParity } = await import('../../scripts/show-v2-parity')
  const source = continuingV1Show()
  source.composition!.durationMs = 1200
  source.transitions = [{
    id: 'fade', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 200,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' ? converted.issues : [])).toBe('converted')
  if (converted.status !== 'converted') throw new Error('fixture conversion failed')
  const lookup = { byCellId: {}, byPatternInstanceId: {
    instance: 'export var calls=0; export function beforeRender(delta) { calls++ } export function render2D(index,x,y) { rgb(1,0,0) }',
  }, stageDimension: 2 as const }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') throw new Error('preparation refused')
  const before = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const after = compileShow(prepared.recipe, LIBRARIES)
  expect(after.code).toBe(before.code)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(before, after, source, converted.record, fidelity, []).matched).toBe(true)
})
