import { describe, expect, it } from 'vitest'
import {
  createDefaultShow,
  extendShowCell,
  splitShowAtTime,
  updateShowCellRestartOnEntry,
} from './showModel'
import {
  addShowOverlayLayer,
  addShowOverlayClip,
  addShowOverlayPlacement,
  addShowMainPlacement,
  addShowMainClip,
  deleteShowMainPlacement,
  deleteShowOverlayLayer,
  deleteShowOverlayPlacement,
  harvestEmptyShowOverlayLayers,
  moveShowMainPlacement,
  moveShowOverlayPlacement,
  normalizeShowComposition,
  projectFlatShowToCompositionV1,
  replaceShowPatternInstance,
  renameShowOverlayLayer,
  reorderShowOverlayLayer,
  resolveShowMainPlacementStart,
  restartShowMainPlacement,
  splitShowMainPlacement,
  splitShowOverlayPlacement,
  trimShowMainPlacement,
  trimShowOverlayPlacement,
  validateShowComposition,
} from './showCompositionModel'
import { materializeShowGroupOccurrences } from './showGroupModel'
import type { ShowCompositionV1, ShowLayerTransition, ShowRecord } from './personalContentRecords'

const SOURCE = 'export function render(index) { rgb(index / 60, 0.2, 0.4) }'

function lookup(show: ShowRecord) {
  return {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, SOURCE])),
    stageDimension: 2 as const,
  }
}

function fixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const show = createDefaultShow('composition-model', 'Composition model', 1)
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [
      {
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      {
        id: 'instance-b',
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        time: { timeScale: 0.5, timeOffsetMs: 25 },
      },
    ],
    scenes: [{
      sceneId: 'scene-1',
      zones: [{
        zoneId: 'zone-1',
        main: [
          {
            id: 'placement-a',
            instanceId: 'instance-a',
            startMs: 0,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          },
          {
            id: 'placement-b',
            instanceId: 'instance-b',
            startMs: 5_000,
            durationMs: 3_000,
            view: { mirror: true, phase: 0.25, brightness: 0.7 },
          },
        ],
        overlays: [],
      }],
    }],
  }
  return { show, composition }
}

describe('Show composition v1 Main schedule (#488)', () => {
  it('does not delete the final remaining Clip', () => {
    const { composition } = fixture()
    const oneClip = deleteShowMainPlacement(composition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-a',
    })

    const rejected = deleteShowMainPlacement(oneClip, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-b',
    })

    expect(rejected).toBe(oneClip)
  })

  it('magnetically resolves horizontal moves and quantizes illegal overlaps', () => {
    const placement = { id: 'moving', instanceId: 'instance-a', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } }
    const occupied = [
      { ...placement, id: 'left', startMs: 2_000, durationMs: 2_000 },
      { ...placement, id: 'right', startMs: 6_000, durationMs: 1_000 },
    ]

    expect(resolveShowMainPlacementStart(10_000, placement, occupied, 4_080, 100)).toBe(4_000)
    expect(resolveShowMainPlacementStart(10_000, placement, occupied, 5_500, 100)).toBe(5_000)
    expect(resolveShowMainPlacementStart(10_000, placement, occupied, 9_900, 100)).toBe(9_000)
  })

  it('adds the Pattern instance and Main placement atomically', () => {
    const { show, composition } = fixture()
    const instance = {
      id: 'instance-c',
      pattern: { kind: 'stock' as const, id: 'Caustics' },
      patternName: 'Caustics',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    const placement = {
      id: 'placement-c', instanceId: instance.id, startMs: 8_000, durationMs: 2_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    }

    const added = addShowMainClip(show, composition, { sceneId: 'scene-1', zoneId: 'zone-1', instance, placement })
    expect(added.patternInstances).toContainEqual(instance)
    expect(added.scenes[0].zones[0].main).toContainEqual(placement)

    const rejected = addShowMainClip(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', instance, placement: { ...placement, startMs: 3_000 },
    })
    expect(rejected).toBe(composition)
    expect(rejected.patternInstances).not.toContainEqual(instance)
  })

  it('projects flat Shows losslessly into explicit instances and full-duration Main placements', () => {
    const flat = extendShowCell(createDefaultShow('composition-legacy', 'Legacy', 1), 'cell-1', 2)
    const projected = projectFlatShowToCompositionV1(flat, lookup(flat))

    expect(projected.version).toBe(1)
    expect(projected.patternInstances).toHaveLength(1)
    expect(projected.scenes).toHaveLength(2)
    expect(projected.scenes[0].zones[0].main[0]).toMatchObject({
      startMs: 0,
      durationMs: flat.scenes[0].durationMs,
    })
    expect(projected.scenes[0].zones[0].main[0].instanceId)
      .toBe(projected.scenes[1].zones[0].main[0].instanceId)

    const split = splitShowAtTime(flat, 10_000)
    const splitProjected = projectFlatShowToCompositionV1(split, lookup(split))
    expect(new Set(splitProjected.scenes.flatMap((scene) => (
      scene.zones.flatMap((zone) => zone.main.map((placement) => placement.instanceId))
    ))).size).toBe(1)

    const right = split.cells.find((cell) => cell.sceneId === split.scenes[1].id)!
    const restarted = updateShowCellRestartOnEntry(split, right.id, true)
    const restartedProjection = projectFlatShowToCompositionV1(restarted, lookup(restarted))
    expect(new Set(restartedProjection.scenes.flatMap((scene) => (
      scene.zones.flatMap((zone) => zone.main.map((placement) => placement.instanceId))
    ))).size).toBe(2)
  })

  it('normalizes deterministically and idempotently without erasing explicit gaps', () => {
    const { show, composition } = fixture()
    const shuffled: ShowCompositionV1 = {
      ...composition,
      patternInstances: [...composition.patternInstances].reverse(),
      scenes: [{
        ...composition.scenes[0],
        zones: [{
          ...composition.scenes[0].zones[0],
          main: [...composition.scenes[0].zones[0].main].reverse(),
        }],
      }],
    }

    const once = normalizeShowComposition(show, shuffled)
    const twice = normalizeShowComposition(show, once)

    expect(twice).toEqual(once)
    expect(once.scenes[0].zones[0].main.map((placement) => placement.id))
      .toEqual(['placement-a', 'placement-b'])
    expect(once.scenes[0].zones[0].main[1].startMs).toBe(5_000)
  })

  it('preserves durable non-Cut Layer transitions in deterministic endpoint order (#583)', () => {
    const { show, composition } = fixture()
    const authored: ShowCompositionV1 = {
      ...composition,
      transitions: [
        {
          id: 'transition-z',
          fromPlacementId: 'placement-a',
          toPlacementId: 'placement-b',
          kind: 'wipe',
          durationMs: 1_000,
          easing: { curve: 'linear' },
          direction: 0.25,
        },
        {
          id: 'transition-a',
          fromPlacementId: 'placement-b',
          toPlacementId: 'placement-a',
          kind: 'crossfade',
          durationMs: 500,
          easing: { curve: 'sine', direction: 'in-out' },
          crossfadePolicy: 'live-live',
        },
      ],
    }

    const normalized = normalizeShowComposition(show, authored)

    expect(normalized.transitions?.map((transition) => transition.id)).toEqual([
      'transition-a',
      'transition-z',
    ])
    expect(normalizeShowComposition(show, normalized)).toEqual(normalized)
  })

  it('preserves, orders, and validates durable Group definitions and occurrences (#587)', () => {
    const { show, composition } = fixture()
    const grouped: ShowCompositionV1 = {
      ...composition,
      groupDefinitions: [
        {
          id: 'group-z',
          name: 'Z phrase',
          patternInstances: [structuredClone(composition.patternInstances[0])],
          placements: [{
            ...composition.scenes[0].zones[0].main[0],
            id: 'inside-z',
            instanceId: 'instance-a',
            layerOffset: 0,
            startMs: 0,
            opacity: 1,
          }],
        },
        {
          id: 'group-a',
          name: 'A phrase',
          patternInstances: [{ ...structuredClone(composition.patternInstances[1]), id: 'inside-instance' }],
          placements: [{
            ...composition.scenes[0].zones[0].main[0],
            id: 'inside-a',
            instanceId: 'inside-instance',
            layerOffset: 0,
            startMs: 0,
            opacity: 1,
          }],
        },
      ],
      groupOccurrences: [
        { id: 'use-z', definitionId: 'group-z', sceneId: 'scene-1', zoneId: 'zone-1', startMs: 8_000, baseLayer: 1, translationX: 0, translationY: 0 },
        { id: 'use-a', definitionId: 'group-a', sceneId: 'scene-1', zoneId: 'zone-1', startMs: 10_000, baseLayer: 1, translationX: 0, translationY: 0 },
      ],
    }

    const normalized = normalizeShowComposition(show, grouped)

    expect(normalized.groupDefinitions?.map((definition) => definition.id)).toEqual(['group-a', 'group-z'])
    expect(normalized.groupOccurrences?.map((occurrence) => occurrence.id)).toEqual(['use-a', 'use-z'])
    expect(normalizeShowComposition(show, normalized)).toEqual(normalized)

    normalized.groupOccurrences![0].definitionId = 'missing-definition'
    expect(validateShowComposition(show, normalized)).toContainEqual(expect.objectContaining({
      path: 'groupOccurrences[0].definitionId',
      code: 'missing-definition',
    }))
  })

  it('applies ordinary instance, placement, and Property-track validation inside Groups (#587)', () => {
    const { show, composition } = fixture()
    composition.groupDefinitions = [{
      id: 'invalid-group',
      name: 'Invalid Group',
      patternInstances: [{
        id: 'inside-instance',
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        patternName: 'Inside',
        time: { timeScale: Number.POSITIVE_INFINITY, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'inside-placement',
        instanceId: 'inside-instance',
        layerOffset: 0,
        startMs: 0,
        durationMs: 1_000,
        opacity: 2,
        view: { mirror: false, phase: 0, brightness: 1 },
      }],
      propertyTracks: ['a', 'b'].map((suffix) => ({
        id: `opacity-${suffix}`,
        target: { kind: 'placement-opacity' as const, placementId: 'inside-placement' },
        keyframes: [{
          id: `opacity-${suffix}-a`, timeMs: 0, value: 2,
          easing: { curve: 'bogus' } as never,
        }, {
          id: `opacity-${suffix}-b`, timeMs: 500, value: 0.5,
          easing: { curve: 'linear' as const },
        }],
      })),
    }]
    composition.groupOccurrences = [{
      id: 'invalid-use', definitionId: 'invalid-group', sceneId: 'scene-1', zoneId: 'zone-1',
      startMs: 0, baseLayer: 1, translationX: 0, translationY: 0,
    }]

    expect(validateShowComposition(show, composition)).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'not-finite' }),
      expect.objectContaining({ code: 'out-of-bounds' }),
      expect.objectContaining({ code: 'invalid-easing' }),
      expect.objectContaining({ code: 'duplicate-target' }),
    ]))
  })

  it('returns field-addressed validation issues for missing owners, bad bounds, and overlap', () => {
    const { show, composition } = fixture()
    const invalid: ShowCompositionV1 = {
      ...composition,
      scenes: [{
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [
            { ...composition.scenes[0].zones[0].main[0], durationMs: 6_000 },
            { ...composition.scenes[0].zones[0].main[1], startMs: 5_000, durationMs: 40_000, instanceId: 'missing' },
          ],
          overlays: [],
        }],
      }],
    }

    expect(validateShowComposition(show, invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'scenes[0].zones[0].main[1].instanceId', code: 'missing-instance' }),
      expect.objectContaining({ path: 'scenes[0].zones[0].main[1].durationMs', code: 'out-of-bounds' }),
      expect.objectContaining({ path: 'scenes[0].zones[0].main[1].startMs', code: 'overlap' }),
    ]))
  })

  it('rejects malformed or cross-Layer transition endpoints (#583)', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        ...composition.scenes[0].zones[0].main[1],
        id: 'overlay-placement',
        opacity: 1,
      }],
    }]
    const invalid = {
      ...composition,
      transitions: [
        {
          id: 'bad-duration',
          fromPlacementId: 'placement-a',
          toPlacementId: 'missing-placement',
          kind: 'crossfade',
          durationMs: 0,
          easing: { curve: 'linear' },
        },
        {
          id: 'cross-layer',
          fromPlacementId: 'placement-a',
          toPlacementId: 'overlay-placement',
          kind: 'wipe',
          durationMs: 1_000,
          easing: { curve: 'linear' },
        },
      ],
    } as ShowCompositionV1

    expect(validateShowComposition(show, invalid)).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'transitions[0].durationMs', code: 'out-of-bounds' }),
      expect.objectContaining({ path: 'transitions[0].toPlacementId', code: 'missing-placement' }),
      expect.objectContaining({ path: 'transitions[1]', code: 'cross-layer' }),
    ]))
  })

  it('rejects non-consecutive endpoints but permits an unrelated Clip that spans the complete transition', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].main.splice(1, 0, {
      ...composition.scenes[0].zones[0].main[0],
      id: 'placement-between',
      startMs: 4_250,
      durationMs: 250,
    })
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        ...composition.scenes[0].zones[0].main[0],
        id: 'overlay-through-transition',
        startMs: 3_500,
        durationMs: 2_000,
        opacity: 1,
      }],
    }]
    composition.transitions = [{
      id: 'transition-a-b',
      fromPlacementId: 'placement-a',
      toPlacementId: 'placement-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    expect(validateShowComposition(show, composition)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        path: 'transitions[0]',
        code: 'invalid-transition',
        message: 'A Layer transition must connect consecutive Clips.',
      }),
    ]))
  })

  it('rejects unrelated Clips that start or stop inside a Layer transition', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        ...composition.scenes[0].zones[0].main[0],
        id: 'overlay-partial-transition',
        startMs: 3_500,
        durationMs: 1_000,
        opacity: 1,
      }],
    }]
    composition.transitions = [{
      id: 'transition-a-b',
      fromPlacementId: 'placement-a',
      toPlacementId: 'placement-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
      path: 'transitions[0]',
      code: 'invalid-transition',
      message: 'An unrelated Clip cannot start or stop at or inside a Layer transition.',
    }))
  })

  it('rejects unrelated Clips whose boundary touches a Layer transition endpoint (#583)', () => {
    const { show, composition } = fixture()
    composition.transitions = [{
      id: 'transition-a-b',
      fromPlacementId: 'placement-a',
      toPlacementId: 'placement-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    for (const placement of [
      { id: 'overlay-ending-at-transition', startMs: 3_000, durationMs: 1_000 },
      { id: 'overlay-starting-after-transition', startMs: 5_000, durationMs: 1_000 },
    ]) {
      composition.scenes[0].zones[0].overlays = [{
        id: 'overlay-layer',
        name: 'Overlay',
        placements: [{
          ...composition.scenes[0].zones[0].main[0],
          ...placement,
          opacity: 1,
        }],
      }]
      expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
        path: 'transitions[0]',
        code: 'invalid-transition',
        message: 'An unrelated Clip cannot start or stop at or inside a Layer transition.',
      }))
    }
  })

  it('rejects Fade and Motion Layer transitions over an unrelated spanning Clip (#583)', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [{
        ...composition.scenes[0].zones[0].main[0],
        id: 'overlay-through-transition',
        startMs: 3_500,
        durationMs: 2_000,
        opacity: 1,
      }],
    }]
    const transitions: ShowLayerTransition[] = [
      {
        id: 'fade-a-b',
        fromPlacementId: 'placement-a',
        toPlacementId: 'placement-b',
        kind: 'fade-color',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        color: '#000000',
      },
      {
        id: 'motion-a-b',
        fromPlacementId: 'placement-a',
        toPlacementId: 'placement-b',
        kind: 'motion',
        motionVariant: 'cover',
        durationMs: 1_000,
        easing: { curve: 'linear' },
      },
    ]

    for (const transition of transitions) {
      composition.transitions = [transition]
      expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
        path: 'transitions[0]',
        code: 'invalid-transition',
        message: 'Fade and Motion Layer transitions cannot pass over an unrelated Clip.',
      }))
    }
  })

  it('removes connected transitions from every direct placement and Layer delete path', () => {
    const { composition } = fixture()
    composition.transitions = [{
      id: 'main-transition',
      fromPlacementId: 'placement-a',
      toPlacementId: 'placement-b',
      kind: 'crossfade',
      durationMs: 1_000,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    }]

    expect(deleteShowMainPlacement(composition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-a',
    }).transitions).toEqual([])

    const overlayComposition = structuredClone(composition)
    overlayComposition.transitions = [{
      ...composition.transitions[0],
      id: 'overlay-transition',
      fromPlacementId: 'overlay-a',
      toPlacementId: 'overlay-b',
    }]
    overlayComposition.scenes[0].zones[0].overlays = [{
      id: 'overlay-layer',
      name: 'Overlay',
      placements: [
        { ...composition.scenes[0].zones[0].main[0], id: 'overlay-a', opacity: 1 },
        { ...composition.scenes[0].zones[0].main[1], id: 'overlay-b', opacity: 1 },
      ],
    }]

    expect(deleteShowOverlayPlacement(overlayComposition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      layerId: 'overlay-layer',
      placementId: 'overlay-a',
    }).transitions).toEqual([])
    expect(deleteShowOverlayLayer(overlayComposition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      layerId: 'overlay-layer',
    }).transitions).toEqual([])
  })

  it('splits with Continue identity and can explicitly Restart with a fresh instance', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].main[0].transform = {
      positionX: 0.25,
      positionY: -0.5,
      rotation: -0.125,
      scaleX: 1.5,
      scaleY: 0.75,
    }
    composition.scenes[0].zones[0].main[0].viewport = {
      enabled: true,
      x: 0.1,
      y: 0.2,
      width: 0.6,
      height: 0.5,
    }
    const split = splitShowMainPlacement(show, composition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-a',
      atMs: 1_500,
      newPlacementId: 'placement-a-right',
    })
    const main = split.scenes[0].zones[0].main
    expect(main.slice(0, 2)).toMatchObject([
      {
        id: 'placement-a', instanceId: 'instance-a', startMs: 0, durationMs: 1_500,
        transform: { positionX: 0.25, positionY: -0.5, rotation: -0.125, scaleX: 1.5, scaleY: 0.75 },
        viewport: { enabled: true, x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
      },
      {
        id: 'placement-a-right', instanceId: 'instance-a', startMs: 1_500, durationMs: 2_500,
        transform: { positionX: 0.25, positionY: -0.5, rotation: -0.125, scaleX: 1.5, scaleY: 0.75 },
        viewport: { enabled: true, x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
      },
    ])
    expect(main[1].transform).not.toBe(main[0].transform)
    expect(main[1].viewport).not.toBe(main[0].viewport)

    const restarted = restartShowMainPlacement(split, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: 'placement-a-right',
      newInstanceId: 'instance-a-restart',
    })
    expect(restarted.patternInstances).toHaveLength(3)
    expect(restarted.scenes[0].zones[0].main[1].instanceId).toBe('instance-a-restart')
    expect(restarted.patternInstances.find((instance) => instance.id === 'instance-a-restart'))
      .toMatchObject({ patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } })
  })

  it('rebases placement and instance tracks across split, Restart, and delete edits (#490)', () => {
    const { show, composition } = fixture()
    composition.scenes[0].propertyTracks = [
      {
        id: 'brightness-track',
        target: { kind: 'placement-view', placementId: 'placement-a', property: 'brightness' },
        keyframes: [
          { id: 'brightness-a', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'brightness-b', timeMs: 2_000, value: 0.5, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'speed-track',
        target: { kind: 'instance-time-scale', instanceId: 'instance-a' },
        keyframes: [
          { id: 'speed-a', timeMs: 0, value: 1, easing: { curve: 'linear' } },
          { id: 'speed-b', timeMs: 2_000, value: 2, easing: { curve: 'linear' } },
        ],
      },
      {
        id: 'position-track',
        target: { kind: 'placement-transform', placementId: 'placement-a', property: 'positionX' },
        keyframes: [
          { id: 'position-a', timeMs: 0, value: 0, easing: { curve: 'linear' } },
          { id: 'position-b', timeMs: 2_000, value: 0.5, easing: { curve: 'linear' } },
        ],
      },
    ]

    const split = splitShowMainPlacement(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-a', atMs: 1_000, newPlacementId: 'placement-right',
    })
    expect(split.scenes[0].propertyTracks?.map((track) => track.target)).toEqual(expect.arrayContaining([
      { kind: 'placement-view', placementId: 'placement-a', property: 'brightness' },
      { kind: 'placement-view', placementId: 'placement-right', property: 'brightness' },
      { kind: 'placement-transform', placementId: 'placement-a', property: 'positionX' },
      { kind: 'placement-transform', placementId: 'placement-right', property: 'positionX' },
      { kind: 'instance-time-scale', instanceId: 'instance-a' },
    ]))

    const restarted = restartShowMainPlacement(split, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-right', newInstanceId: 'instance-right',
    })
    expect(restarted.scenes[0].propertyTracks?.map((track) => track.target)).toContainEqual({
      kind: 'instance-time-scale', instanceId: 'instance-right',
    })

    const deleted = deleteShowMainPlacement(restarted, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-right',
    })
    expect(deleted.scenes[0].propertyTracks?.some((track) => (
      'placementId' in track.target && track.target.placementId === 'placement-right'
    ))).toBe(false)
  })

  it('adds, moves, trims, deletes, and replaces Main content without accepting collisions', () => {
    const { show, composition } = fixture()
    const added = addShowMainPlacement(show, composition, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placement: {
        id: 'placement-c',
        instanceId: 'instance-a',
        startMs: 8_000,
        durationMs: 2_000,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    })
    expect(added.scenes[0].zones[0].main).toHaveLength(3)

    const rejectedMove = moveShowMainPlacement(show, added, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c', startMs: 3_000,
    })
    expect(rejectedMove).toEqual(added)

    const moved = moveShowMainPlacement(show, added, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c', startMs: 9_000,
    })
    expect(moved.scenes[0].zones[0].main.find((placement) => placement.id === 'placement-c')?.startMs).toBe(9_000)

    const trimmed = trimShowMainPlacement(show, moved, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c', startMs: 8_500, durationMs: 1_500,
    })
    expect(trimmed.scenes[0].zones[0].main.find((placement) => placement.id === 'placement-c'))
      .toMatchObject({ startMs: 8_500, durationMs: 1_500 })

    const replaced = replaceShowPatternInstance(trimmed, 'instance-a', {
      pattern: { kind: 'stock', id: 'ClockworkIris' }, patternName: 'ClockworkIris',
    })
    expect(replaced.patternInstances.find((instance) => instance.id === 'instance-a'))
      .toMatchObject({ patternName: 'ClockworkIris' })

    const deleted = deleteShowMainPlacement(replaced, {
      sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-c',
    })
    expect(deleted.scenes[0].zones[0].main.map((placement) => placement.id))
      .toEqual(['placement-a', 'placement-b'])
  })

  it('preserves manual overlay order while normalizing clips inside each layer', () => {
    const { show, composition } = fixture()
    const zone = composition.scenes[0].zones[0]
    const withOverlays: ShowCompositionV1 = {
      ...composition,
      scenes: [{
        ...composition.scenes[0],
        zones: [{
          ...zone,
          overlays: [
            {
              id: 'layer-front',
              name: 'Front light',
              placements: [
                { id: 'overlay-late', instanceId: 'instance-a', startMs: 4_000, durationMs: 1_000, opacity: 0.5, view: { mirror: false, phase: 0, brightness: 1 } },
                { id: 'overlay-early', instanceId: 'instance-b', startMs: 500, durationMs: 1_500, opacity: 0.8, view: { mirror: false, phase: 0, brightness: 1 } },
              ],
            },
            { id: 'layer-back', name: 'Back light', placements: [] },
          ],
        }],
      }],
    }

    const normalized = normalizeShowComposition(show, withOverlays)

    expect(normalized.scenes[0].zones[0].overlays.map((layer) => layer.id))
      .toEqual(['layer-front', 'layer-back'])
    expect(normalized.scenes[0].zones[0].overlays[0].placements.map((placement) => placement.id))
      .toEqual(['overlay-early', 'overlay-late'])
  })

  it('harvests an empty middle Layer only when it is empty across every Scene', () => {
    const show = createDefaultShow('show-harvest-layers', 'Harvest layers', 1)
    const composition = projectFlatShowToCompositionV1(show, lookup(show))
    const instanceId = composition.patternInstances[0].id
    const overlay = (id: string) => ({
      id,
      instanceId,
      startMs: 0,
      durationMs: 1_000,
      opacity: 1,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    composition.scenes.forEach((scene, sceneIndex) => {
      scene.zones[0].overlays = [
        { id: `front-${sceneIndex}`, name: 'Front', placements: sceneIndex === 0 ? [overlay('front-clip')] : [] },
        { id: `empty-${sceneIndex}`, name: 'Empty', placements: [] },
        { id: `middle-${sceneIndex}`, name: 'Middle', placements: sceneIndex === 1 ? [overlay('middle-clip')] : [] },
        { id: `back-${sceneIndex}`, name: 'Back', placements: sceneIndex === 0 ? [overlay('back-clip')] : [] },
      ]
    })

    const harvested = harvestEmptyShowOverlayLayers(show, composition)

    expect(harvested.scenes.map((scene) => (
      scene.zones[0].overlays.map((layer) => layer.name)
    ))).toEqual([
      ['Front', 'Middle', 'Back'],
      ['Front', 'Middle', 'Back'],
    ])
  })

  it('preserves a Layer occupied only by a Group occurrence', () => {
    const show = createDefaultShow('show-harvest-group-layer', 'Harvest Group layer', 1)
    const composition = projectFlatShowToCompositionV1(show, lookup(show))
    const instanceId = composition.patternInstances[0].id
    composition.scenes.forEach((scene, sceneIndex) => {
      scene.zones[0].main = []
      scene.zones[0].overlays = [
        {
          id: `upper-${sceneIndex}`,
          name: 'Upper',
          placements: sceneIndex === 0
            ? [{
                id: 'ordinary-upper',
                instanceId,
                startMs: 0,
                durationMs: 1_000,
                opacity: 1,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : [],
        },
        { id: `group-layer-${sceneIndex}`, name: 'Group layer', placements: [] },
      ]
    })
    composition.groupDefinitions = [{
      id: 'group-definition',
      name: 'Group',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [{
        id: 'group-child',
        instanceId: 'group-instance',
        startMs: 0,
        durationMs: 1_000,
        opacity: 1,
        view: { mirror: false, phase: 0, brightness: 1 },
        layerOffset: 0,
      }],
    }]
    composition.groupOccurrences = [{
      id: 'group-use',
      definitionId: 'group-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 0,
      baseLayer: 1,
      translationX: 0,
      translationY: 0,
    }]

    const harvested = harvestEmptyShowOverlayLayers(show, composition)
    const materialized = materializeShowGroupOccurrences(harvested)

    expect(harvested.scenes[0].zones[0].overlays).toHaveLength(2)
    expect(materialized.scenes[0].zones[0].overlays.map((layer) => (
      layer.placements.map((placement) => placement.id)
    ))).toEqual([
      ['ordinary-upper'],
      ['group-use:group-child'],
    ])
  })

  it('preserves empty Layers inside the structural span of a sparse Group', () => {
    const show = createDefaultShow('show-harvest-sparse-group', 'Harvest sparse Group', 1)
    const composition = projectFlatShowToCompositionV1(show, lookup(show))
    composition.scenes.forEach((scene, sceneIndex) => {
      scene.zones[0].main = []
      scene.zones[0].overlays = [
        { id: `layer-2-${sceneIndex}`, name: 'Layer 2', placements: [] },
        { id: `layer-1-${sceneIndex}`, name: 'Layer 1', placements: [] },
      ]
    })
    composition.groupDefinitions = [{
      id: 'sparse-definition',
      name: 'Sparse Group',
      patternInstances: [{
        id: 'group-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      placements: [
        {
          id: 'main-child',
          instanceId: 'group-instance',
          startMs: 0,
          durationMs: 1_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
          layerOffset: 0,
        },
        {
          id: 'layer-2-child',
          instanceId: 'group-instance',
          startMs: 0,
          durationMs: 1_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
          layerOffset: 2,
        },
      ],
    }]
    composition.groupOccurrences = [{
      id: 'sparse-use',
      definitionId: 'sparse-definition',
      sceneId: show.scenes[0].id,
      zoneId: show.zones[0].id,
      startMs: 0,
      baseLayer: 0,
      translationX: 0,
      translationY: 0,
    }]

    const harvested = harvestEmptyShowOverlayLayers(show, composition)

    expect(harvested.scenes[0].zones[0].overlays.map((layer) => layer.id)).toEqual([
      'layer-2-0',
      'layer-1-0',
    ])
  })

  it('rejects overlap inside one overlay layer but permits the same interval across layers', () => {
    const { show, composition } = fixture()
    const zone = composition.scenes[0].zones[0]
    const overlay = (id: string, startMs: number) => ({
      id,
      instanceId: 'instance-a',
      startMs,
      durationMs: 2_000,
      opacity: 0.75,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    zone.overlays = [
      { id: 'layer-front', name: 'Front', placements: [overlay('overlay-a', 1_000), overlay('overlay-b', 2_000)] },
      { id: 'layer-back', name: 'Back', placements: [overlay('overlay-c', 1_000)] },
    ]

    expect(validateShowComposition(show, composition)).toEqual([
      expect.objectContaining({
        path: 'scenes[0].zones[0].overlays[0].placements[1].startMs',
        code: 'overlap',
      }),
    ])
  })

  it('adds, renames, manually reorders, and deletes stable overlay layers', () => {
    const { show, composition } = fixture()
    const frontAdded = addShowOverlayLayer(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'layer-front', name: 'Front', placements: [] },
    })
    const backAdded = addShowOverlayLayer(show, frontAdded, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'layer-back', name: 'Back', placements: [] },
    })
    const renamed = renameShowOverlayLayer(backAdded, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-back', name: 'Atmosphere',
    })
    const reordered = reorderShowOverlayLayer(renamed, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-back', targetIndex: 0,
    })

    expect(reordered.scenes[0].zones[0].overlays).toMatchObject([
      { id: 'layer-back', name: 'Atmosphere' },
      { id: 'layer-front', name: 'Front' },
    ])

    const deleted = deleteShowOverlayLayer(reordered, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-front',
    })
    expect(deleted.scenes[0].zones[0].overlays.map((layer) => layer.id)).toEqual(['layer-back'])
  })

  it('edits overlay clips per layer while allowing one instance across overlapping layers', () => {
    const { show, composition } = fixture()
    const withFront = addShowOverlayLayer(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'layer-front', name: 'Front', placements: [] },
    })
    const withLayers = addShowOverlayLayer(show, withFront, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'layer-back', name: 'Back', placements: [] },
    })
    const instance = {
      id: 'instance-overlay',
      pattern: { kind: 'stock' as const, id: 'Caustics' },
      patternName: 'Caustics',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }
    const placement = {
      id: 'overlay-front', instanceId: instance.id, startMs: 1_000, durationMs: 2_000, opacity: 0.6,
      view: { mirror: false, phase: 0, brightness: 1 },
    }
    const withClip = addShowOverlayClip(show, withLayers, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-front', instance, placement,
    })
    const crossLayer = addShowOverlayPlacement(show, withClip, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-back',
      placement: { ...placement, id: 'overlay-back' },
    })
    expect(crossLayer.scenes[0].zones[0].overlays.map((layer) => layer.placements.length)).toEqual([1, 1])

    const rejectedSameLayer = moveShowOverlayPlacement(show, crossLayer, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-back', placementId: 'overlay-back',
      targetLayerId: 'layer-front', startMs: 1_000,
    })
    expect(rejectedSameLayer).toEqual(crossLayer)

    const moved = moveShowOverlayPlacement(show, crossLayer, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-back', placementId: 'overlay-back',
      targetLayerId: 'layer-front', startMs: 4_000,
    })
    const trimmed = trimShowOverlayPlacement(show, moved, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-front', placementId: 'overlay-back',
      startMs: 4_500, durationMs: 1_000, opacity: 0.35,
    })
    expect(trimmed.scenes[0].zones[0].overlays[0].placements[1]).toMatchObject({
      id: 'overlay-back', startMs: 4_500, durationMs: 1_000, opacity: 0.35,
    })

    const deleted = deleteShowOverlayPlacement(trimmed, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-front', placementId: 'overlay-back',
    })
    expect(deleted.scenes[0].zones[0].overlays[0].placements.map((item) => item.id)).toEqual(['overlay-front'])
  })

  it('splits an overlay clip at the local playhead while preserving Continue identity and animation tracks', () => {
    const { show, composition } = fixture()
    const withLayer = addShowOverlayLayer(show, composition, {
      sceneId: 'scene-1', zoneId: 'zone-1', layer: { id: 'layer-front', name: 'Front', placements: [] },
    })
    const withClip = addShowOverlayClip(show, withLayer, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-front',
      instance: {
        id: 'instance-overlay', pattern: { kind: 'stock', id: 'Caustics' }, patternName: 'Caustics',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      placement: {
        id: 'overlay-left', instanceId: 'instance-overlay', startMs: 1_000, durationMs: 4_000, opacity: 0.6,
        view: { mirror: false, phase: 0, brightness: 1 },
      },
    })
    withClip.scenes[0].propertyTracks = [{
      id: 'overlay-brightness',
      target: { kind: 'placement-view', placementId: 'overlay-left', property: 'brightness' },
      keyframes: [
        { id: 'brightness-a', timeMs: 1_000, value: 0.5, easing: { curve: 'linear' } },
        { id: 'brightness-b', timeMs: 4_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]

    const split = splitShowOverlayPlacement(show, withClip, {
      sceneId: 'scene-1', zoneId: 'zone-1', layerId: 'layer-front', placementId: 'overlay-left',
      atMs: 2_500, newPlacementId: 'overlay-right',
    })

    expect(split.scenes[0].zones[0].overlays[0].placements).toMatchObject([
      { id: 'overlay-left', instanceId: 'instance-overlay', startMs: 1_000, durationMs: 1_500, opacity: 0.6 },
      { id: 'overlay-right', instanceId: 'instance-overlay', startMs: 2_500, durationMs: 2_500, opacity: 0.6 },
    ])
    expect(split.scenes[0].propertyTracks?.map((track) => track.target)).toEqual(expect.arrayContaining([
      { kind: 'placement-view', placementId: 'overlay-left', property: 'brightness' },
      { kind: 'placement-view', placementId: 'overlay-right', property: 'brightness' },
    ]))
  })
})
