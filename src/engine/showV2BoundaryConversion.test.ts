import { describe, expect, it } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '../pixelblaze/libs'

function boundaryShow(kind: Parameters<typeof transitionV1Show>[0] = 'crossfade') {
  const show = transitionV1Show(kind)
  const composition = show.composition!
  const [out, incoming] = composition.scenes[0].zones[0].main
  show.scenes = [{ id: 'scene-a', name: 'Outgoing', durationMs: 400 }, { id: 'scene-b', name: 'Incoming', durationMs: 400 }]
  composition.scenes = [
    { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [out], overlays: [] }] },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [{ ...incoming, startMs: 0 }], overlays: [] }] },
  ]
  const { fromPlacementId: _from, toPlacementId: _to, ...settings } = composition.transitions![0]
  show.transitions = [{ ...settings, afterSceneId: 'scene-a' }]
  delete composition.transitions
  return show
}

const lookup = { byCellId: {}, byPatternInstanceId: {
  'out-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(1,x,y) }',
  'in-instance': 'export var calls=0; export var elapsed=0; export function beforeRender(delta) { calls++; elapsed+=delta/1000 } export function render2D(index,x,y) { rgb(x,y,1) }',
}, stageDimension: 2 as const }

describe('whole-boundary v2 conversion', () => {
  it.each(['crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion'] as const)('preserves a two-sided %s single-Zone boundary through public preparation', kind => {
    const source = boundaryShow(kind)
    const before = structuredClone(source)
    const result = convertShowRecordV1ToV2(source)
    expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
    if (result.status !== 'converted') return
    expect(source).toEqual(before)
    expect(result.report.unaccountedSourcePaths).toEqual([])
    const prepared = prepareShowV2ForCompile(result.record, lookup)
    expect(prepared.status).toBe('ready')
    if (prepared.status !== 'ready') return
    const oldArtifact = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
    const newArtifact = compileShow(prepared.recipe, LIBRARIES)
    expect(newArtifact.code).toBe(oldArtifact.code)
    for (const fidelity of ['fast', 'fidelity'] as const) {
      const runtime = (artifact: typeof newArtifact) => createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, { fidelity, randomSeed: 1034, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] })
      const left = runtime(oldArtifact)
      const right = runtime(newArtifact)
      for (const atMs of [0, 399, 400, 401, 500, 599, 600, 601, 999, 1000, 1001, 1400, 1500, 1601]) {
        const a = atMs ? left.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : left.renderCurrentFrame()
        const expected = { frame: Array.from(a.frame), exports: { ...a.exports } }
        const b = atMs ? right.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : right.renderCurrentFrame()
        expect({ frame: Array.from(b.frame), exports: { ...b.exports } }).toEqual(expected)
      }
    }
  })
})

it('preserves an opacity track active beyond the visible Clip without shortening its curve', () => {
  const source = boundaryShow()
  source.transitions = []
  source.scenes = [{ id: 'scene-a', name: 'Animation', durationMs: 1000 }]
  source.composition!.scenes = [{ sceneId: 'scene-a', zones: [{ zoneId: 'zone', overlays: [], main: [{ id: 'out', instanceId: 'out-instance', startMs: 200, durationMs: 600, view: { mirror: false, phase: 0, brightness: 1 } }] }], propertyTracks: [{ id: 'opacity', target: { kind: 'placement-opacity', placementId: 'out' }, keyframes: [{ id: 'start', timeMs: 0, value: 0, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'end', timeMs: 1000, value: 1, easing: { curve: 'linear' } }] }] }]
  source.composition!.patternInstances = source.composition!.patternInstances.slice(0, 1)
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  const a = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const b = compileShow(prepared.recipe, LIBRARIES)
  expect(b.code).toBe(a.code)
})

it('preserves full-Show animation during incoming Transition contribution', () => {
  const source = transitionV1Show('crossfade')
  source.composition!.scenes[0].propertyTracks = [{ id: 'opacity', target: { kind: 'placement-opacity', placementId: 'in' }, keyframes: [{ id: 'start', timeMs: 0, value: 0, easing: { curve: 'sine', direction: 'in-out' } }, { id: 'end', timeMs: 1000, value: 1, easing: { curve: 'linear' } }] }]
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it.each(['unrelated', 'carrier'] as const)('refuses unproved whole-boundary %s without mutating the source', scenario => {
  const source = boundaryShow()
  if (scenario === 'carrier') source.transitions[0].propertyTransitions = {}
  else {
    const original = source.composition!.scenes[0].zones[0].main[0]
    source.composition!.scenes[0].zones[0].overlays = [{ id: 'overlay', name: 'Overlay', placements: [{ ...structuredClone(original), id: 'overlay-out', opacity: 0.5 }] }]
  }
  const before = structuredClone(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status).toBe('refused')
  expect(source).toEqual(before)
  if (result.status === 'refused') expect(result.issues.some(issue => issue.code === 'unsupported-boundary-transition')).toBe(true)
})
