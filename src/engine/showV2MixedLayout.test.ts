import { expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { validateShowRecordV2 } from './showCompositionV2'
import { LIBRARIES } from '../pixelblaze/libs'
import { runtimeParity } from '../../scripts/show-v2-parity'
import { editShowLayoutIntervalsV2 } from './showLayoutIntervalsV2'
import { createFastReplayRuntime, type FastReplayResult } from './fastReplay'
import { nativeDimension } from './loadPattern'

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
  for (const atMs of [399, 400, 401, 599, 600, 601]) {
    const edit = editShowLayoutIntervalsV2(converted.record, {
      kind: 'move',
      occurrenceId: converted.record.composition.layoutOccurrences[1].id,
      startMs: atMs,
    })
    expect(edit.status, edit.status === 'refused' ? edit.message : undefined).toBe(atMs === 400 ? 'unchanged' : 'changed')
    const changed = edit.record
    expect(validateShowRecordV2(changed)).toEqual([])
    const preimage = structuredClone(changed)
    const result = prepareShowV2ForCompile(changed, lookup)
    expect(changed).toEqual(preimage)
    {
      expect(result.status, `Layout edge ${atMs}`).toBe('ready')
      if (result.status === 'ready') {
        expect(result.recipe.routingSwitches).toEqual([{ ...v1Recipe.routingSwitches![0], atMs }, ...v1Recipe.routingSwitches!.slice(1)])
        expect(() => compileShow(result.recipe, LIBRARIES)).not.toThrow()
      }
    }
  }
})

it.each([
  { route: 'continuous-flat', visibleOpacity: 1 },
  { route: 'global-sections', visibleOpacity: 0.75 },
] as const)('retires an unrouted silent runtime interval without filling an earlier true gap through $route lowering', ({ route, visibleOpacity }) => {
  const source = transitionV1Show('crossfade')
  const composition = source.composition!
  delete composition.executionModel
  const out = composition.scenes[0].zones[0].main[0]
  source.zones.push({ id: 'other', name: 'Other', nominalPixelCount: 16 })
  source.routingLayouts = [
    { id: 'absent', name: 'Other only', zones: [], logical: { kind: 'single', zoneIds: ['other'] } },
    source.routingLayouts[0],
  ]
  source.scenes = ['true-gap', 'silent-use', 'visible-use', 'disconnected-gap', 'visible-return']
    .map(id => ({ id, name: id, durationMs: 400 }))
  composition.durationMs = 2_000
  composition.patternInstances = [composition.patternInstances[0]]
  composition.scenes = source.scenes.map((scene, index) => ({ sceneId: scene.id, zones: [
    { zoneId: 'zone', main: index === 1
      ? [{ ...structuredClone(out), id: 'clip-silent' }]
      : index === 2
        ? [{ ...structuredClone(out), id: 'clip-silent--span-visible-use', logicalClipId: 'clip-silent', opacity: visibleOpacity }]
        : index === 4
          ? [{ ...structuredClone(out), id: 'clip-return' }]
          : [], overlays: [] },
    { zoneId: 'other', main: [], overlays: [] },
  ] }))
  delete composition.transitions
  source.transitions = [{ id: 'return', afterSceneId: 'silent-use', kind: 'routing', layoutId: 'layout', durationMs: 0, easing: { curve: 'linear' } }]
  const lookup = { byCellId: {}, byPatternInstanceId: {
    'out-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta){calls++;elapsed+=delta/1000} export function render2D(index,x,y){rgb(elapsed,calls/100,0)}',
  }, stageDimension: 2 as const }
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  expect(converted.report.retiredSilentRuntimeUses).toEqual([{
    sourcePlacementId: 'clip-silent',
    sourcePath: 'composition.scenes.1.zones.0.main.0',
    instanceId: 'out-instance',
    zoneId: 'zone',
    startMs: 400,
    durationMs: 400,
    outcome: 'retired-silent-runtime-use',
  }])
  expect(converted.report.accounting.filter(entry => entry.sourcePath.startsWith('composition.scenes.1.zones.0.main.0')))
    .toEqual(expect.arrayContaining([expect.objectContaining({ outcome: 'retired-silent-runtime-use' })]))
  expect(converted.record.composition.patternInstances).toHaveLength(1)
  expect(converted.record.composition.clips.map(clip => ({ id: clip.id, startMs: clip.startMs, durationMs: clip.durationMs }))).toEqual([
    { id: 'clip-silent--layout-1', startMs: 800, durationMs: 400 },
    { id: 'clip-return', startMs: 1_600, durationMs: 400 },
  ])
  if (route === 'continuous-flat') {
    converted.record.composition.clips.forEach(clip => { clip.zoneSampleMode = 'independent' })
  }
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared.issues))
  expect(prepared.provenance.route).toBe(route)
  expect(prepared.recipe.clips.every(clip => !clip.id.startsWith('runtime-carrier:'))).toBe(true)
  const a = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    expect(runtimeParity(a, b, source, converted.record, fidelity, [])).toMatchObject({ matched: false, firstMismatchMs: 400 })
    const left = replayArtifact(a, fidelity)
    const right = replayArtifact(b, fidelity)
    expect(left.renderCurrentFrame().frame).toEqual(right.renderCurrentFrame().frame)
    const beforeSilentLeft = left.advanceTo(399, { stepMs: 1, forceFullIntermediateRender: true })
    const beforeSilentRight = right.advanceTo(399, { stepMs: 1, forceFullIntermediateRender: true })
    expect(beforeSilentLeft.frame).toEqual(beforeSilentRight.frame)
    expect(exportedState(beforeSilentRight.exports)).toEqual({ calls: 0, elapsed: 0 })
    const afterSilentLeft = left.advanceTo(799, { stepMs: 1, forceFullIntermediateRender: true })
    const afterSilentRight = right.advanceTo(799, { stepMs: 1, forceFullIntermediateRender: true })
    expect(exportedState(afterSilentLeft.exports).calls).toBeGreaterThan(exportedState(afterSilentRight.exports).calls)
    expect(exportedState(afterSilentLeft.exports).elapsed).toBeGreaterThan(exportedState(afterSilentRight.exports).elapsed)
    const visibleLeft = left.advanceTo(1_000, { stepMs: 1, forceFullIntermediateRender: true })
    const visibleRight = right.advanceTo(1_000, { stepMs: 1, forceFullIntermediateRender: true })
    expect(visibleRight.frame).not.toEqual(visibleLeft.frame)
    const gapStartLeft = left.advanceTo(1_200, { stepMs: 1, forceFullIntermediateRender: true })
    const gapStartRight = right.advanceTo(1_200, { stepMs: 1, forceFullIntermediateRender: true })
    const gapEndLeft = left.advanceTo(1_599, { stepMs: 1, forceFullIntermediateRender: true })
    const gapEndRight = right.advanceTo(1_599, { stepMs: 1, forceFullIntermediateRender: true })
    expect(exportedState(gapEndLeft.exports)).toEqual(exportedState(gapStartLeft.exports))
    expect(exportedState(gapEndRight.exports)).toEqual(exportedState(gapStartRight.exports))
  }
})

function replayArtifact(artifact: ReturnType<typeof compileShow>, fidelity: 'fast' | 'fidelity') {
  return createFastReplayRuntime({
    code: artifact.code,
    fxCode: artifact.fxCode,
    metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: [{ sample: [0.75, 0.5], pos: [0.75, 0.5] }], randomSeed: 1034, fidelity })
}

function exportedState(exports: FastReplayResult['exports']) {
  const values = Object.entries(exports)
  return {
    calls: Math.max(...values.filter(([key]) => key.endsWith('_calls')).map(([, value]) => Number(value))),
    elapsed: Math.max(...values.filter(([key]) => key.endsWith('_elapsed')).map(([, value]) => Number(value))),
  }
}
