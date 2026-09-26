import { describe, expect, it } from 'vitest'
import {
  createDefaultShow,
  extendShowCell,
} from './showModel'
import {
  normalizeShowComposition,
  projectFlatShowToCompositionV1WithCellOrigins,
  validateShowComposition,
} from './showCompositionModel'
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
  it('accepts omitted or normalized Main opacity and rejects values outside 0–1 (#882)', () => {
    const { show, composition } = fixture()
    expect(validateShowComposition(show, composition)).toEqual([])

    composition.scenes[0].zones[0].main[0].opacity = 0.6
    expect(validateShowComposition(show, composition)).toEqual([])

    composition.scenes[0].zones[0].main[0].opacity = 1.01
    expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
      path: 'scenes[0].zones[0].main[0].opacity',
      code: 'out-of-bounds',
    }))
  })

  it('rejects malformed logical Clip aliases before destructive coalescing (#63)', () => {
    const { show, composition } = fixture()
    composition.scenes[0].zones[0].main[1].logicalClipId = 'placement-a'
    composition.scenes[0].zones[0].main.push({
      id: 'placement-c',
      instanceId: 'instance-b',
      startMs: 9_000,
      durationMs: 1_000,
      view: { mirror: false, phase: 0, brightness: 1 },
    })

    expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
      path: 'scenes[0].zones[0].main[1].logicalClipId',
      code: 'invalid-logical-clip',
    }))
  })

  it('rejects hidden presentation differences between logical Clip segments (#63)', () => {
    const { show, composition } = fixture()
    const root = composition.scenes[0].zones[0].main[0]
    root.startMs = show.scenes[0].durationMs - 1_000
    root.durationMs = 1_000
    composition.scenes.push({
      sceneId: show.scenes[1].id,
      zones: [{
        zoneId: 'zone-1',
        main: [{
          ...structuredClone(root),
          id: `placement-a--span-${show.scenes[1].id}`,
          logicalClipId: 'placement-a',
          startMs: 0,
          durationMs: 2_000,
          view: { ...root.view, brightness: 0.25 },
        }],
        overlays: [],
      }],
    })

    expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
      path: `scenes[1].zones[0].main[0].logicalClipId`,
      code: 'invalid-logical-clip',
    }))
  })

  it('permits per-segment opacity, Transform and Aperture differences', () => {
    const { show, composition } = fixture()
    const root = composition.scenes[0].zones[0].main[0]
    root.startMs = show.scenes[0].durationMs - 1_000
    root.durationMs = 1_000
    composition.scenes.push({
      sceneId: show.scenes[1].id,
      zones: [{
        zoneId: 'zone-1',
        main: [{
          ...structuredClone(root),
          id: `placement-a--span-${show.scenes[1].id}`,
          logicalClipId: 'placement-a',
          startMs: 0,
          durationMs: 2_000,
          opacity: 0.4,
          transform: { positionX: 0.25, positionY: 0, rotation: 0.25, scaleX: 0.5, scaleY: 1 },
          viewport: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'ellipse' },
        }],
        overlays: [],
      }],
    })

    expect(validateShowComposition(show, composition)).toEqual([])
  })

  it('preserves each projected placement’s source flat cell identity', () => {
    const flat = extendShowCell(createDefaultShow('composition-origins', 'Origins', 1), 'cell-1', 2)
    const projected = projectFlatShowToCompositionV1WithCellOrigins(flat, lookup(flat))

    const placementIds = projected.composition.scenes.flatMap((scene) => (
      scene.zones.flatMap((zone) => zone.main.map((placement) => placement.id))
    ))
    expect(placementIds).toEqual([
      'placement-cell-1-scene-1',
      'placement-cell-1-scene-2',
    ])
    expect(projected.sourceCellIdByPlacementId).toEqual({
      'placement-cell-1-scene-1': 'cell-1',
      'placement-cell-1-scene-2': 'cell-1',
    })
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

  it('rejects Fade and Motion over a spanning Clip in another Zone (#630)', () => {
    const { show, composition } = fixture()
    show.zones.push({ id: 'zone-2', name: 'other', nominalPixelCount: 60 })
    composition.scenes[0].zones.push({
      zoneId: 'zone-2',
      main: [{
        ...composition.scenes[0].zones[0].main[0],
        id: 'other-zone-through-transition',
        startMs: 0,
        durationMs: 8_000,
      }],
      overlays: [],
    })

    for (const transition of [
      {
        id: 'fade-a-b',
        fromPlacementId: 'placement-a',
        toPlacementId: 'placement-b',
        kind: 'fade-color' as const,
        durationMs: 1_000,
        easing: { curve: 'linear' as const },
        color: '#000000',
      },
      {
        id: 'motion-a-b',
        fromPlacementId: 'placement-a',
        toPlacementId: 'placement-b',
        kind: 'motion' as const,
        motionVariant: 'cover' as const,
        durationMs: 1_000,
        easing: { curve: 'linear' as const },
      },
    ]) {
      composition.transitions = [transition]
      expect(validateShowComposition(show, composition)).toContainEqual(expect.objectContaining({
        path: 'transitions[0]',
        code: 'invalid-transition',
        message: 'Fade and Motion Layer transitions cannot pass over an unrelated Clip.',
      }))
    }
  })

  it('rejects a later Clip boundary in another Zone during a Layer Transition (#630)', () => {
    const { show, composition } = fixture()
    show.zones.push({ id: 'zone-2', name: 'other', nominalPixelCount: 60 })
    composition.scenes[0].zones.push({
      zoneId: 'zone-2',
      main: [{
        ...composition.scenes[0].zones[0].main[0],
        id: 'other-zone-before',
        startMs: 0,
        durationMs: 4_500,
      }, {
        ...composition.scenes[0].zones[0].main[1],
        id: 'other-zone-after',
        startMs: 4_500,
        durationMs: 3_500,
      }],
      overlays: [],
    })
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
      message: 'A Clip in another Zone cannot start or stop after a Layer Transition has begun.',
    }))
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
})
