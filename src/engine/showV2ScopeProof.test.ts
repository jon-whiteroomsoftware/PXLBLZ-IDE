import { expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { LIBRARIES } from '../pixelblaze/libs'
import { runtimeParity } from '../../scripts/show-v2-parity'

const lookup = { byCellId: {}, byPatternInstanceId: {
  'out-instance': 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(1,x,y)}',
  'in-instance': 'export var calls=0; export function beforeRender(delta){calls++} export function render2D(index,x,y){rgb(x,y,1)}',
}, stageDimension: 2 as const }

it.each((['crossfade', 'wipe', 'dither', 'portal', 'fade-color', 'motion'] as const).flatMap(kind => ['same', 'different'].map(zone => ({ kind, zone }))))('classifies $kind over continuing content in the $zone Zone', ({ kind, zone }) => {
  const source = transitionV1Show(kind, 'live-live')
  const continuing = { ...structuredClone(source.composition!.scenes[0].zones[0].main[0]), id: 'continuing', startMs: 0, durationMs: 1000, opacity: 0.4 }
  if (zone === 'same') source.composition!.scenes[0].zones[0].overlays = [{ id: 'overlay', name: 'Overlay', placements: [continuing] }]
  else {
    source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
    source.routingLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'other'] }
    source.composition!.scenes[0].zones.push({ zoneId: 'other', main: [continuing], overlays: [] })
  }
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(source).toEqual(before)
  if (kind === 'fade-color' || kind === 'motion') {
    expect(() => showRecordToCompileRecipe(source, lookup)).toThrow('Fade and Motion Layer transitions cannot pass over an unrelated Clip')
    expect(converted).toMatchObject({ status: 'refused', issues: expect.arrayContaining([expect.objectContaining({ code: 'invalid-v1' })]) })
    return
  }
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const a = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  expect(b.code).toBe(a.code)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(a, b, source, converted.record, fidelity, [])).toMatchObject({ matched: true, secondLoopMatched: true, coldSeekMatchedContinuous: true })
})

it.each((['start', 'end'] as const).flatMap(edge => [{ atMs: 399, accepted: true }, { atMs: 400, accepted: true }, { atMs: 401, accepted: false }, { atMs: 600, accepted: false }, { atMs: 601, accepted: true }].map(item => ({ ...item, edge }))))('classifies other-Zone contribution $edge at $atMs around [400,600)', ({ edge, atMs, accepted }) => {
  const source = transitionV1Show('crossfade')
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
  source.routingLayouts[0].logical = { kind: 'split', axis: 'x', zoneIds: ['zone', 'other'] }
  source.composition!.scenes[0].zones.push({ zoneId: 'other', main: [{ ...structuredClone(source.composition!.scenes[0].zones[0].main[0]), id: 'other-clip', startMs: edge === 'start' ? atMs : 0, durationMs: edge === 'start' ? 1000 - atMs : atMs }], overlays: [] })
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(source).toEqual(before)
  expect(converted.status).toBe(accepted ? 'converted' : 'refused')
  if (converted.status !== 'converted') {
    expect(() => showRecordToCompileRecipe(source, lookup)).toThrow('another Zone cannot start or stop after a Layer Transition has begun')
    return
  }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  const a = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  for (const fidelity of ['fast', 'fidelity'] as const) expect(runtimeParity(a, b, source, converted.record, fidelity, [])).toMatchObject({ matched: true, secondLoopMatched: true, coldSeekMatchedContinuous: true })
})
