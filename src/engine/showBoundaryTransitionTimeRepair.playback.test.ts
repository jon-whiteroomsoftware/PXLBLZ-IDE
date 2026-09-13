import { describe, expect, it } from 'vitest'
import { createFastReplayRuntime } from './fastReplay'
import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { compileShow } from './showCompiler'
import { removeShowBoundaryTransitionPreservingTime } from './showBoundaryTransitionTimeRepair'
import { deleteShowClipInShow } from './showClipDeletion'
import { createDefaultShow, showRecordToCompileRecipe } from './showModel'

const STATEFUL_SOURCE = `
export var elapsed = 0
export function beforeRender(delta) { elapsed = elapsed + delta }
export function render(index) { rgb(elapsed / 100000, 0, 0) }
`

function playbackFixture(destinationStartMs: number, shared = false): ShowRecord {
  const show = createDefaultShow('playback-proof', 'Playback proof', 1)
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      {
        id: 'outgoing', pattern: { kind: 'user', id: 'outgoing' }, patternName: 'Outgoing',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      ...(!shared ? [{
        id: 'destination', pattern: { kind: 'user' as const, id: 'destination' }, patternName: 'Destination',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }] : []),
    ],
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{ zoneId: 'zone-1', main: [placement('outgoing-clip', 'outgoing', 0, 30_000)], overlays: [] }],
      },
      {
        sceneId: 'scene-2',
        propertyTracks: [{
          id: 'destination-speed',
          target: { kind: 'instance-time-scale', instanceId: shared ? 'outgoing' : 'destination' },
          keyframes: [
            { id: 'speed-start', timeMs: destinationStartMs, value: 0.5, easing: { curve: 'linear' } },
            { id: 'speed-end', timeMs: destinationStartMs + 1_000, value: 1.5, easing: { curve: 'linear' } },
          ],
        }],
        zones: [{
          zoneId: 'zone-1',
          main: [placement(
            'destination-clip',
            shared ? 'outgoing' : 'destination',
            destinationStartMs,
            30_000 - destinationStartMs,
          )],
          overlays: [],
        }],
      },
    ],
  }
  return { ...show, composition }
}

function placement(id: string, instanceId: string, startMs: number, durationMs: number) {
  return {
    id,
    instanceId,
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  }
}

function compileSample(show: ShowRecord, atMs: number): [number, number, number] {
  const byPatternInstanceId = Object.fromEntries(show.composition!.patternInstances
    .map((instance) => [instance.id, STATEFUL_SOURCE]))
  const artifact = compileShow(showRecordToCompileRecipe(show, {
    byCellId: {},
    byPatternInstanceId,
  }), {})
  const runtime = createFastReplayRuntime({
    code: artifact.code,
    metadata: artifact.metadata,
    dimension: 1,
  }, {
    mapPoints: [{ sample: [0] }],
    randomSeed: 1023,
  })
  return runtime.advanceTo(atMs, { stepMs: 100 }).pixels[0]
}

function expectPixelsClose(actual: [number, number, number], expected: [number, number, number]) {
  actual.forEach((channel, index) => expect(channel).toBeCloseTo(expected[index], 12))
}

/** Deliberately bypass the public primitive to prove why its dependency refusals exist. */
function forceUnsafeCoordinateConversion(show: ShowRecord): ShowRecord {
  const candidate = structuredClone(show)
  const transition = candidate.transitions.find((item) => item.id === 'transition-scene-1')!
  const durationMs = transition.durationMs
  candidate.scenes[1].durationMs += durationMs
  candidate.transitions[candidate.transitions.indexOf(transition)] = {
    id: transition.id,
    afterSceneId: transition.afterSceneId,
    kind: 'cut',
    durationMs: 0,
    easing: transition.easing,
  }
  const destination = candidate.composition!.scenes.find((scene) => scene.sceneId === 'scene-2')!
  for (const zone of destination.zones) {
    for (const placement of zone.main) placement.startMs += durationMs
    for (const layer of zone.overlays) {
      for (const placement of layer.placements) placement.startMs += durationMs
    }
  }
  for (const track of destination.propertyTracks ?? []) {
    for (const keyframe of track.keyframes) keyframe.timeMs += durationMs
  }
  return candidate
}

describe('boundary Transition time-repair compiler/preview proof', () => {
  it('preserves surviving stateful playback through the complete Clip deletion owner', () => {
    const original = playbackFixture(1_000)
    original.composition!.patternInstances.push({
      id: 'deleted-incoming',
      pattern: { kind: 'user', id: 'deleted-incoming' },
      patternName: 'Deleted incoming',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    original.composition!.scenes[1].zones[0].main.unshift(
      placement('deleted-incoming-clip', 'deleted-incoming', 0, 1_000),
    )
    expect(validateShowComposition(original, original.composition!)).toEqual([])

    const outcome = deleteShowClipInShow(original, original.composition!, {
      kind: 'main',
      sceneId: 'scene-2',
      zoneId: 'zone-1',
      placementId: 'deleted-incoming-clip',
    })

    expect(outcome.status).toBe('applied')
    if (outcome.status !== 'applied') throw new Error(outcome.reason)
    expect(outcome.repairedTransitionIds).toEqual(['transition-scene-1'])
    expect(validateShowComposition(outcome.record, outcome.record.composition!)).toEqual([])
    for (const atMs of [33_100, 33_500, 40_000, 61_900]) {
      expectPixelsClose(compileSample(outcome.record, atMs), compileSample(original, atMs))
    }
  })

  it('preserves deterministic stateful playback after the removed interval when destination entry is empty', () => {
    const original = playbackFixture(1_000)
    const outcome = removeShowBoundaryTransitionPreservingTime(original, 'transition-scene-1')
    expect(outcome.status).toBe('applied')
    if (outcome.status !== 'applied') throw new Error(outcome.reason)
    expect(validateShowComposition(outcome.record, outcome.record.composition!)).toEqual([])

    for (const atMs of [33_100, 33_500, 40_000, 61_900]) {
      expectPixelsClose(compileSample(outcome.record, atMs), compileSample(original, atMs))
    }
  })

  it('refuses destination-entry state that the real compiler proves would diverge after the fade', () => {
    const original = playbackFixture(0)
    delete original.composition!.scenes[1].propertyTracks
    const outcome = removeShowBoundaryTransitionPreservingTime(original, 'transition-scene-1')
    expect(outcome).toMatchObject({
      status: 'refused',
      reason: 'destination-entry-content',
      details: ['destination-clip'],
    })

    const unsafe = forceUnsafeCoordinateConversion(original)
    expect(validateShowComposition(unsafe, unsafe.composition!)).toEqual([])
    expect(compileSample(original, 32_100)).toEqual([0.022, 0, 0])
    expect(compileSample(unsafe, 32_100)).toEqual([0.002, 0, 0])
  })

  it('refuses a shared Pattern instance whose private lifecycle would lose the removed interval', () => {
    const original = playbackFixture(1_000, true)
    delete original.composition!.scenes[1].propertyTracks
    const outcome = removeShowBoundaryTransitionPreservingTime(original, 'transition-scene-1')
    expect(outcome).toMatchObject({
      status: 'refused',
      reason: 'cross-boundary-shared-instance',
      details: ['outgoing'],
    })

    const unsafe = forceUnsafeCoordinateConversion(original)
    expect(validateShowComposition(unsafe, unsafe.composition!)).toEqual([])
    expect(compileSample(original, 33_100)).toEqual([0.321, 0, 0])
    expect(compileSample(unsafe, 33_100)).toEqual([0.301, 0, 0])
  })

  it('refuses output feedback whose pixel history would cross the removed interval', () => {
    const original = playbackFixture(1_000)
    delete original.composition!.scenes[1].propertyTracks
    original.outputEffects = [{ id: 'trails', kind: 'trails', retention: 0.8 }]

    const outcome = removeShowBoundaryTransitionPreservingTime(original, 'transition-scene-1')

    expect(outcome).toMatchObject({
      status: 'refused',
      reason: 'output-feedback-state',
      details: ['trails'],
    })
    const unsafe = forceUnsafeCoordinateConversion(original)
    expect(validateShowComposition(unsafe, unsafe.composition!)).toEqual([])
    expect(compileSample(original, 32_100)).toEqual([0, 0, 0])
    expect(compileSample(unsafe, 32_100)[0]).toBeCloseTo(0.0022062305912156645, 12)
  })

  it('keeps a concurrent routing switch at the preceding hold end', () => {
    const original = playbackFixture(1_000)
    original.routingLayouts.push({
      ...structuredClone(original.routingLayouts[0]),
      id: 'layout-2',
      name: 'Alternate',
    })
    original.transitions.push({
      id: 'routing-scene-1',
      afterSceneId: 'scene-1',
      kind: 'routing',
      durationMs: 0,
      easing: { curve: 'linear' },
      layoutId: 'layout-2',
    })
    const sources = Object.fromEntries(original.composition!.patternInstances
      .map((instance) => [instance.id, STATEFUL_SOURCE]))
    const before = showRecordToCompileRecipe(original, { byCellId: {}, byPatternInstanceId: sources })
    const outcome = removeShowBoundaryTransitionPreservingTime(original, 'transition-scene-1')
    expect(outcome.status).toBe('applied')
    if (outcome.status !== 'applied') throw new Error(outcome.reason)
    const after = showRecordToCompileRecipe(outcome.record, { byCellId: {}, byPatternInstanceId: sources })

    expect(before.routingSwitches).toEqual([expect.objectContaining({ atMs: 30_000, layoutId: 'layout-2' })])
    expect(after.routingSwitches).toEqual(before.routingSwitches)
  })
})
