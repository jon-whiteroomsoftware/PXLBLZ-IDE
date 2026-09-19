import { describe, expect, it } from 'vitest'
import { convertibleV1Show, transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { editShowClipTemporalV2 } from './showClipTemporalV2'
import { prepareShowV2ForCompile } from './showCompositionLoweringV2'
import { showRecordToCompileRecipe } from './showModel'
import { compileShow } from './showCompiler'
import { createFastReplayRuntime } from './fastReplay'
import { nativeDimension } from './loadPattern'
import { LIBRARIES } from '../pixelblaze/libs'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2 } from './showCompositionV2'

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

it('refuses unproved boundary property carriers without mutating the source', () => {
  const source = boundaryShow()
  source.transitions[0].propertyTransitions = {}
  const before = structuredClone(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status).toBe('refused')
  expect(source).toEqual(before)
  if (result.status === 'refused') expect(result.issues.some(issue => issue.code === 'unsupported-boundary-transition')).toBe(true)
})

it('accounts for an explicitly empty Layer-Transition collection independently of boundary Transitions', () => {
  const source = boundaryShow()
  const omitted = convertShowRecordV1ToV2(source)
  source.composition!.transitions = []
  const before = structuredClone(source)
  const explicit = convertShowRecordV1ToV2(source)
  expect(explicit.status).toBe('converted')
  if (explicit.status !== 'converted' || omitted.status !== 'converted') return
  expect(explicit.record).toEqual(omitted.record)
  expect(explicit.report.unaccountedSourcePaths).toEqual([])
  expect(explicit.report.accounting).toContainEqual(expect.objectContaining({ sourcePath: 'composition.transitions', outcome: 'mapped' }))
  expect(source).toEqual(before)
})

it('preserves complete incoming and outgoing animation curves through a whole boundary', () => {
  const source = boundaryShow()
  for (const [index, scene] of source.composition!.scenes.entries()) {
    scene.propertyTracks = [{ id: `opacity-${index}`, target: { kind: 'placement-opacity', placementId: index ? 'in' : 'out' }, keyframes: [
      { id: `start-${index}`, timeMs: 0, value: 0.2, easing: { curve: 'sine', direction: 'in-out' } },
      { id: `end-${index}`, timeMs: 400, value: 0.8, easing: { curve: 'linear' } },
    ] }]
  }
  const before = structuredClone(source)
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status, JSON.stringify(converted.status === 'refused' && converted.issues)).toBe('converted')
  if (converted.status !== 'converted') return
  expect(source).toEqual(before)
  expect(converted.report.unaccountedSourcePaths).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(converted.record))).toEqual({ status: 'opened', record: converted.record })
  expect(converted.record.composition.propertyTracks.map(track => [track.activeStartMs, track.activeDurationMs, track.keyframes.map(key => key.timeMs)])).toEqual([[0, 600, [0, 400]], [400, 600, [600, 1000]]])
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it('keeps consecutive legacy shared-instance owners adjacent across incoming pre-roll', () => {
  const source = boundaryShow()
  const composition = source.composition!
  const sharedId = composition.patternInstances[0].id
  composition.patternInstances = composition.patternInstances.slice(0, 1)
  composition.scenes[1].zones[0].main[0].instanceId = sharedId
  for (const [index, scene] of composition.scenes.entries()) {
    scene.propertyTracks = [{
      id: `speed-${index}`,
      target: { kind: 'instance-time-scale', instanceId: sharedId },
      keyframes: [
        { id: `speed-${index}:start`, timeMs: 0, value: index + 1, easing: { curve: 'linear' } },
        { id: `speed-${index}:end`, timeMs: 400, value: index + 2, easing: { curve: 'sine', direction: 'in-out' } },
      ],
    }]
  }
  const sharedLookup = { byCellId: {}, byPatternInstanceId: { [sharedId]: lookup.byPatternInstanceId['out-instance'] }, stageDimension: 2 as const }
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return

  expect(converted.record.composition.propertyTracks.map(track => [track.activeStartMs, track.activeDurationMs])).toEqual([
    [0, 600],
    [600, 400],
  ])
  const prepared = prepareShowV2ForCompile(converted.record, sharedLookup)
  expect(prepared.status).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(
    compileShow(showRecordToCompileRecipe(source, sharedLookup), LIBRARIES).code,
  )
})


it.each(['crossfade', 'fade-color', 'wipe', 'dither', 'portal', 'motion'] as const)('preserves whole-output %s compositing across unequal Layer contributor sets', kind => {
  const source = boundaryShow(kind)
  const original = source.composition!.scenes[0].zones[0].main[0]
  source.composition!.scenes[0].zones[0].overlays = [{ id: 'overlay', name: 'Overlay', placements: [{ ...structuredClone(original), id: 'overlay-out', opacity: 0.5 }] }]
  const converted = convertShowRecordV1ToV2(source)
  expect(converted.status).toBe('converted')
  if (converted.status !== 'converted') return
  const prepared = prepareShowV2ForCompile(converted.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' && prepared.issues)).toBe('ready')
  if (prepared.status !== 'ready') return
  expect(compileShow(prepared.recipe, LIBRARIES).code).toBe(compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES).code)
})

it.each(['missing-contributor', 'unknown-contributor', 'wrong-endpoint', 'mixed-scope'] as const)('rejects invalid whole-output ownership: %s', change => {
  const source = boundaryShow()
  const original = source.composition!.scenes[0].zones[0].main[0]
  source.composition!.scenes[0].zones[0].overlays = [{ id: 'overlay', name: 'Overlay', placements: [{ ...structuredClone(original), id: 'overlay-out', opacity: 0.5 }] }]
  const converted = convertShowRecordV1ToV2(source)
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const transition = converted.record.composition.transitions[0]
  if (change === 'missing-contributor') transition.wholeOutput!.fromClipIds.pop()
  if (change === 'unknown-contributor') transition.wholeOutput!.fromClipIds[0] = 'missing'
  if (change === 'wrong-endpoint') transition.wholeOutput!.startMs++
  if (change === 'mixed-scope') transition.participants.push({ id: 'mixed', zoneId: 'zone', layerId: converted.record.composition.clips[0].layerId, fromClipId: 'out', toClipId: 'in' })
  const before = structuredClone(converted.record)
  expect(prepareShowV2ForCompile(converted.record, lookup).status).toBe('refused')
  expect(converted.record).toEqual(before)
})

function oneSidedBoundaryShow(variant: 'fade-out' | 'fade-in' | 'empty-both') {
  const show = convertibleV1Show()
  show.stageMapId = 'plane'
  show.composition!.durationMs = 11000
  show.scenes = [
    { id: 'scene-a', name: 'Outgoing', durationMs: 5000 },
    { id: 'scene-b', name: 'Incoming', durationMs: 5000 },
  ]
  show.composition!.patternInstances = [
    { id: 'out-instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'Outgoing', time: { timeScale: 1, timeOffsetMs: 0 } },
    { id: 'in-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming', time: { timeScale: 1, timeOffsetMs: 0 } },
  ]
  const outgoing = variant === 'fade-in' ? [] : [{
    id: 'out', instanceId: 'out-instance', startMs: 0, durationMs: variant === 'empty-both' ? 1000 : 5000,
    view: { mirror: false, phase: 0, brightness: 1 },
  }]
  const incoming = variant === 'fade-out' || variant === 'empty-both' ? [] : [{
    id: 'in', instanceId: 'in-instance', startMs: 0, durationMs: 5000,
    view: { mirror: false, phase: 0, brightness: 1 },
  }]
  show.composition!.scenes = [
    { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: outgoing, overlays: [] }] },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: incoming, overlays: [] }] },
  ]
  show.transitions = [{
    id: 't1', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 1000,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  return show
}

function expectOneSidedBoundaryParity(variant: 'fade-out' | 'fade-in' | 'empty-both') {
  const source = oneSidedBoundaryShow(variant)
  const before = structuredClone(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(source).toEqual(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  const again = convertShowRecordV1ToV2(structuredClone(source))
  if (again.status !== 'converted') throw new Error(JSON.stringify(again.status === 'refused' ? again.issues : []))
  expect(again.record).toEqual(result.record)
  const prepared = prepareShowV2ForCompile(result.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') return
  const oldArtifact = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const newArtifact = compileShow(prepared.recipe, LIBRARIES)
  expect(newArtifact.code).toBe(oldArtifact.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const runtime = (artifact: typeof newArtifact) => createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, { fidelity, randomSeed: 1034, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] })
    const left = runtime(oldArtifact)
    const right = runtime(newArtifact)
    for (const atMs of [0, 1, 999, 1000, 1001, 4999, 5000, 5001, 5500, 5999, 6000, 6001, 8000, 10999, 11001]) {
      const a = atMs ? left.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : left.renderCurrentFrame()
      const expected = { frame: Array.from(a.frame), exports: { ...a.exports } }
      const b = atMs ? right.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : right.renderCurrentFrame()
      expect({ frame: Array.from(b.frame), exports: { ...b.exports } }).toEqual(expected)
    }
  }
}

it('converts a boundary crossfade whose incoming Scene contributes no Clip', () => {
  expectOneSidedBoundaryParity('fade-out')
})

it('converts a boundary crossfade whose outgoing Scene contributes no Clip', () => {
  expectOneSidedBoundaryParity('fade-in')
})

it('converts a boundary crossfade where neither Scene contributes a boundary Clip', () => {
  expectOneSidedBoundaryParity('empty-both')
})

it('names the empty side of a one-sided boundary Transition explicitly', () => {
  const expectations = {
    'fade-out': { fromClipIds: ['out'], toClipIds: [] as string[] },
    'fade-in': { fromClipIds: [] as string[], toClipIds: ['in'] },
    'empty-both': { fromClipIds: [] as string[], toClipIds: [] as string[] },
  } as const
  for (const variant of ['fade-out', 'fade-in', 'empty-both'] as const) {
    const result = convertShowRecordV1ToV2(oneSidedBoundaryShow(variant))
    expect(result.status, variant).toBe('converted')
    if (result.status !== 'converted') continue
    expect(result.record.composition.transitions).toEqual([expect.objectContaining({
      id: 't1',
      origin: 'converted-boundary-transition',
      participants: [],
      wholeOutput: { startMs: 5000, ...expectations[variant] },
    })])
  }
})

it('leaves an empty/empty boundary window anchored when an unrelated Clip moves', () => {
  const result = convertShowRecordV1ToV2(oneSidedBoundaryShow('empty-both'))
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  const moved = editShowClipTemporalV2(result.record, { kind: 'move', clipId: 'out', startMs: 100 })
  expect(moved.status).toBe('changed')
  if (moved.status !== 'changed') return
  expect(moved.record.composition.transitions).toEqual([expect.objectContaining({
    id: 't1',
    wholeOutput: { startMs: 5000, fromClipIds: [], toClipIds: [] },
  })])
  expect(validateShowRecordV2(moved.record)).toEqual([])
  expect(moved.affectedTransitionIds).not.toContain('t1')
})

it.each(['layoutId', 'routingDirection'] as const)('still refuses a one-sided boundary carrying %s', (carrier) => {
  const source = oneSidedBoundaryShow('fade-out')
  Object.assign(source.transitions[0], carrier === 'layoutId' ? { layoutId: 'layout' } : { routingDirection: 'reverse' })
  const before = structuredClone(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status).toBe('refused')
  expect(source).toEqual(before)
  if (result.status === 'refused') expect(result.issues.some(issue => issue.code === 'unsupported-boundary-transition')).toBe(true)
})

function timeZeroBoundaryShow() {
  const show = convertibleV1Show()
  show.stageMapId = 'plane'
  show.composition!.durationMs = 6000
  show.scenes = [
    { id: 'scene-a', name: 'Opening', durationMs: 0 },
    { id: 'scene-b', name: 'Incoming', durationMs: 5000 },
  ]
  show.composition!.patternInstances = [
    { id: 'in-instance', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'Incoming', time: { timeScale: 1, timeOffsetMs: 0 } },
  ]
  show.composition!.scenes = [
    { sceneId: 'scene-a', zones: [{ zoneId: 'zone', main: [], overlays: [] }] },
    { sceneId: 'scene-b', zones: [{ zoneId: 'zone', main: [{
      id: 'in', instanceId: 'in-instance', startMs: 0, durationMs: 5000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }], overlays: [] }] },
  ]
  show.transitions = [{
    id: 't1', afterSceneId: 'scene-a', kind: 'crossfade', durationMs: 1000,
    easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  }]
  return show
}

it('lowers a boundary crossfade at time zero from the compiler-owned Empty', () => {
  const source = timeZeroBoundaryShow()
  const before = structuredClone(source)
  const result = convertShowRecordV1ToV2(source)
  expect(result.status, JSON.stringify(result.status === 'refused' ? result.issues : [])).toBe('converted')
  if (result.status !== 'converted') return
  expect(source).toEqual(before)
  expect(result.report.unaccountedSourcePaths).toEqual([])
  expect(result.record.composition.transitions).toEqual([expect.objectContaining({
    id: 't1',
    origin: 'converted-boundary-transition',
    participants: [],
    wholeOutput: { startMs: 0, fromClipIds: [], toClipIds: ['in'] },
  })])
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(result.record))).toEqual({ status: 'opened', record: result.record })
  const prepared = prepareShowV2ForCompile(result.record, lookup)
  expect(prepared.status, JSON.stringify(prepared.status === 'refused' ? prepared.issues : [])).toBe('ready')
  if (prepared.status !== 'ready') return
  const oldArtifact = compileShow(showRecordToCompileRecipe(source, lookup), LIBRARIES)
  const newArtifact = compileShow(prepared.recipe, LIBRARIES)
  expect(newArtifact.code).toBe(oldArtifact.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const runtime = (artifact: typeof newArtifact) => createFastReplayRuntime({ code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension: nativeDimension(artifact.metadata.renderFns) }, { fidelity, randomSeed: 1034, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] })
    const left = runtime(oldArtifact)
    const right = runtime(newArtifact)
    for (const atMs of [0, 1, 999, 1000, 1001, 2500, 4999, 5000, 5001, 5999, 6000, 6001]) {
      const a = atMs ? left.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : left.renderCurrentFrame()
      const expected = { frame: Array.from(a.frame), exports: { ...a.exports } }
      const b = atMs ? right.advanceTo(atMs, { stepMs: 1, forceFullIntermediateRender: true }) : right.renderCurrentFrame()
      expect({ frame: Array.from(b.frame), exports: { ...b.exports } }).toEqual(expected)
    }
  }
})
