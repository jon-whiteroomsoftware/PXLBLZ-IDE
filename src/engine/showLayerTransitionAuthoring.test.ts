import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  deleteShowClipWithLayerTransitions,
  insertShowLayerTransition,
  moveShowConnectedClipAtGlobalTime,
  planShowLayerTransitionInsertion,
  resizeShowConnectedClipAtGlobalTime,
  resizeShowLayerTransition,
  resetShowLayerTransitionToCut,
  showLayerTransitionConnectedClosure,
} from './showLayerTransitionAuthoring'
import type { ShowCompositionV1 } from './personalContentRecords'
import { splitShowClipAtGlobalTime } from './showTimelineClipAuthoring'

function fixture(): {
  show: ReturnType<typeof createDefaultShow>
  composition: ShowCompositionV1
} {
  const show = createDefaultShow('show-layer-transition', 'Layer transition', 1_000)
  const scene = show.scenes[0]
  const zoneId = show.zones[0].id
  const placement = (id: string, startMs: number, durationMs: number) => ({
    id,
    instanceId: 'instance-a',
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  })
  return {
    show,
    composition: {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      transitions: [{
        id: 'transition-b-c',
        fromPlacementId: 'clip-b',
        toPlacementId: 'clip-c',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
      scenes: [{
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [
            placement('clip-a', 0, 2_000),
            placement('clip-b', 2_000, 2_000),
            placement('clip-c', 5_000, 2_000),
            placement('obstruction', 9_000, 1_000),
          ],
          overlays: [],
        }],
      }],
    },
  }
}

describe('literal per-Layer Transition authoring (#583)', () => {
  it('inserts duration between Clips and shifts the complete connected downstream chain', () => {
    const { show, composition } = fixture()

    const changed = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'sine', direction: 'in-out' },
      direction: 0,
    })

    expect(changed).not.toBe(composition)
    expect(changed.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 3_000, 2_000],
      ['clip-c', 6_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
    expect(changed.transitions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'transition-a-b', durationMs: 1_000, kind: 'wipe' }),
      expect.objectContaining({ id: 'transition-b-c', durationMs: 1_000 }),
    ]))
  })

  it('refuses growth when the connected chain would collide with unrelated content', () => {
    const { show, composition } = fixture()

    expect(insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 2_001,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })).toBe(composition)
  })

  it('bounds insertion by the endpoint Scene instead of later Show intervals', () => {
    const { show, composition } = fixture()
    show.scenes[0].durationMs = 5_000
    show.scenes.push({ ...show.scenes[0], id: 'later-scene', name: 'Later', durationMs: 30_000 })
    show.transitions = [{
      id: 'scene-boundary-transition',
      afterSceneId: show.scenes[0].id,
      kind: 'crossfade',
      durationMs: 2_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]
    composition.transitions = []
    composition.scenes[0].zones[0].main = composition.scenes[0].zones[0].main.slice(0, 2)
    composition.scenes.push({
      sceneId: 'later-scene',
      zones: [{
        zoneId: show.zones[0].id,
        main: [{
          id: 'later-clip', instanceId: 'instance-a', startMs: 0, durationMs: 1_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [],
      }],
    })

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
    })).toEqual({ enabled: true, maxDurationMs: 1_000 })
  })

  it('refuses a chain shift that would move content into another Layer transition window', () => {
    const { show, composition } = fixture()
    composition.transitions = [{
      id: 'overlay-transition',
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'linear' },
    }]
    composition.scenes[0].zones[0].main = [
      { ...composition.scenes[0].zones[0].main[0], id: 'clip-a', startMs: 0, durationMs: 2_000 },
      { ...composition.scenes[0].zones[0].main[1], id: 'clip-b', startMs: 2_000, durationMs: 4_000 },
    ]
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [
        {
          id: 'overlay-a', instanceId: 'instance-a', startMs: 5_000, durationMs: 2_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          id: 'overlay-b', instanceId: 'instance-a', startMs: 8_000, durationMs: 1_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ],
    }]

    expect(insertShowLayerTransition(show, composition, {
      id: 'main-transition',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_500,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })).toBe(composition)
  })

  it('refuses a simultaneous transition on another Layer until independent render targets land', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [
        {
          id: 'overlay-a',
          instanceId: 'instance-a',
          startMs: 0,
          durationMs: 4_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
        {
          id: 'overlay-b',
          instanceId: 'instance-a',
          startMs: 4_000,
          durationMs: 2_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        },
      ],
    }]

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
    })).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Another Layer is already transitioning at this time.',
    })
    expect(insertShowLayerTransition(show, composition, {
      id: 'overlapping-transition',
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
      kind: 'wipe',
      durationMs: 1_000,
      easing: { curve: 'linear' },
    })).toBe(composition)
  })

  it('limits authoring to an isolated active stack until per-Layer render targets land', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        id: 'overlay-through-cut',
        instanceId: 'instance-a',
        startMs: 1_000,
        durationMs: 4_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
    }]

    expect(planShowLayerTransitionInsertion(show, composition, {
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
    })).toEqual({
      enabled: false,
      maxDurationMs: 0,
      reason: 'Per-Layer Transitions over other active content need compiler render-target support.',
    })
  })

  it('resets a Transition to Cut by removing its duration and preserving Clip durations', () => {
    const { show, composition } = fixture()
    const inserted = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const reset = resetShowLayerTransitionToCut(show, inserted, 'transition-a-b')

    expect(reset.transitions?.some((transition) => transition.id === 'transition-a-b')).toBe(false)
    expect(reset.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 2_000],
      ['clip-c', 5_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })

  it('resizes Transition duration by moving its downstream chain, not either Clip edge', () => {
    const { show, composition } = fixture()

    const resized = resizeShowLayerTransition(show, composition, 'transition-b-c', 1_500)

    expect(resized.transitions?.find((transition) => transition.id === 'transition-b-c')?.durationMs).toBe(1_500)
    expect(resized.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 2_000],
      ['clip-c', 5_500, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })

  it('moves an entire transition-connected sequence when any member Clip moves', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const moved = moveShowConnectedClipAtGlobalTime(show, connected, {
      owner: { kind: 'main', sceneId: show.scenes[0].id, zoneId: show.zones[0].id, placementId: 'clip-b' },
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 4_000 },
    })

    expect(moved.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs])).toEqual([
      ['clip-a', 1_000],
      ['clip-b', 4_000],
      ['clip-c', 7_000],
      ['obstruction', 9_000],
    ])
  })

  it('expands a partial selection to the complete transition-connected sequence', () => {
    const { composition } = fixture()
    composition.transitions!.push({
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    expect(showLayerTransitionConnectedClosure(composition, ['clip-b'])).toEqual([
      'clip-a', 'clip-b', 'clip-c',
    ])
  })

  it('deletes a Clip and every Transition directly connected to it', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const deleted = deleteShowClipWithLayerTransitions(show, connected, {
      kind: 'main',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      placementId: 'clip-b',
    })

    expect(deleted.scenes[0].zones[0].main.map((clip) => clip.id)).toEqual([
      'clip-a', 'clip-c', 'obstruction',
    ])
    expect(deleted.transitions).toEqual([])
  })

  it('keeps an outgoing Transition attached to the outer half when its Clip is split', () => {
    const { show, composition } = fixture()

    const split = splitShowClipAtGlobalTime(show, composition, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-b',
      },
      globalTimeMs: 3_000,
      newPlacementId: 'clip-b-right',
    })

    expect(split.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_000],
      ['clip-b', 2_000, 1_000],
      ['clip-b-right', 3_000, 1_000],
      ['clip-c', 5_000, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
    expect(split.transitions?.[0]).toMatchObject({
      fromPlacementId: 'clip-b-right',
      toPlacementId: 'clip-c',
    })
  })

  it('grows a connected Clip edge by shifting its Transition and downstream chain', () => {
    const { show, composition } = fixture()
    const connected = insertShowLayerTransition(show, composition, {
      id: 'transition-a-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })

    const resized = resizeShowConnectedClipAtGlobalTime(show, connected, {
      owner: {
        kind: 'main',
        sceneId: show.scenes[0].id,
        zoneId: show.zones[0].id,
        placementId: 'clip-a',
      },
      globalStartMs: 0,
      durationMs: 2_500,
    })

    expect(resized.transitions?.map((transition) => transition.durationMs)).toEqual([1_000, 1_000])
    expect(resized.scenes[0].zones[0].main.map((clip) => [clip.id, clip.startMs, clip.durationMs])).toEqual([
      ['clip-a', 0, 2_500],
      ['clip-b', 3_500, 2_000],
      ['clip-c', 6_500, 2_000],
      ['obstruction', 9_000, 1_000],
    ])
  })
})
