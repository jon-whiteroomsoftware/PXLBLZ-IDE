import { describe, expect, it } from 'vitest'
import type {
  ShowCompositionV1,
  ShowClipTransform,
  ShowClipViewport,
  ShowMainPlacement,
  ShowOverlayPlacement,
  ShowRecord,
} from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'
import { createDefaultShow } from './showModel'
import {
  duplicateShowClipAfter,
  moveShowClipAtGlobalTime,
  resizeShowClipAtGlobalTime,
  splitShowClipAtGlobalTime,
  type ShowTimelineClipOwner,
} from './showTimelineClipAuthoring'

type Placement = ShowMainPlacement | ShowOverlayPlacement
type OwnerKind = 'main' | 'overlay'
type StaticAppearance = { opacity: number; transform: ShowClipTransform; viewport: ShowClipViewport }

const firstAppearance = {
  opacity: 0.8,
  transform: { positionX: 0, positionY: 0.1, rotation: 0, scaleX: 1, scaleY: 1 },
  viewport: { enabled: true, x: 0, y: 0, width: 0.5, height: 1, aperture: 'rectangle' as const },
}

const secondAppearance = {
  opacity: 0.35,
  transform: { positionX: 0.5, positionY: 0.1, rotation: 0, scaleX: 0.5, scaleY: 1 },
  viewport: { enabled: true, x: 0.5, y: 0, width: 0.5, height: 1, aperture: 'ellipse' as const },
}

function placement(id: string, startMs: number, durationMs: number, appearance: StaticAppearance): Placement {
  return {
    id,
    instanceId: 'instance',
    startMs,
    durationMs,
    ...structuredClone(appearance),
    view: { mirror: true, phase: 0.2, brightness: 0.7 },
    effects: [{ id: 'invert', kind: 'invert', amount: 0.25 }],
  }
}

function fixture(kind: OwnerKind, fullScenes = false): {
  show: ShowRecord
  composition: ShowCompositionV1
  owner: ShowTimelineClipOwner
} {
  const show = createDefaultShow('appearance-repartition', 'Appearance repartition', 1)
  show.scenes = Array.from({ length: 4 }, (_, index) => ({
    id: `scene-${index + 1}`,
    name: `Scene ${index + 1}`,
    durationMs: 10_000,
  }))
  show.transitions = show.scenes.slice(0, -1).map((scene, index) => ({
    id: `cut-${index + 1}`,
    afterSceneId: scene.id,
    kind: 'cut' as const,
    durationMs: 0,
    easing: { curve: 'linear' as const },
  }))
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: [{
      id: 'instance',
      pattern: { kind: 'stock', id: 'Rings' },
      patternName: 'Rings',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: show.scenes.map((scene, index) => ({
      sceneId: scene.id,
      zones: [{
        zoneId: show.zones[0].id,
        main: [],
        overlays: kind === 'overlay'
          ? [{ id: `layer-${index + 1}`, name: 'Overlay', placements: [] }]
          : [],
      }],
    })),
  }
  const root = placement('clip', fullScenes ? 0 : 8_000, fullScenes ? 10_000 : 2_000, firstAppearance)
  const continuation = {
    ...placement('clip--span-scene-2', 0, fullScenes ? 10_000 : 2_000, secondAppearance),
    logicalClipId: 'clip',
  }
  if (kind === 'main') {
    composition.scenes[0].zones[0].main.push(root)
    composition.scenes[1].zones[0].main.push(continuation)
  } else {
    composition.scenes[0].zones[0].overlays[0].placements.push(root as ShowOverlayPlacement)
    composition.scenes[1].zones[0].overlays[0].placements.push(continuation as ShowOverlayPlacement)
  }
  const owner: ShowTimelineClipOwner = kind === 'main'
    ? { kind, sceneId: 'scene-1', zoneId: show.zones[0].id, placementId: 'clip' }
    : { kind, sceneId: 'scene-1', zoneId: show.zones[0].id, layerId: 'layer-1', placementId: 'clip' }
  expect(validateShowComposition(show, composition)).toEqual([])
  return { show, composition, owner }
}

function directPlacements(composition: ShowCompositionV1): Placement[] {
  return composition.scenes.flatMap(scene => scene.zones.flatMap(zone => [
    ...zone.main,
    ...zone.overlays.flatMap(layer => layer.placements),
  ]))
}

function authoredAppearance(value: Placement) {
  return {
    opacity: value.opacity,
    transform: value.transform,
    viewport: value.viewport,
    view: value.view,
    effects: value.effects,
  }
}

describe('logical Clip static appearance repartition (#1011, #1017)', () => {
  it.each<OwnerKind>(['main', 'overlay'])('moves an aligned divergent %s profile without flattening either Scene segment', kind => {
    const { show, composition, owner } = fixture(kind)
    const before = structuredClone(composition)
    const result = moveShowClipAtGlobalTime(show, composition, {
      owner,
      target: kind === 'main'
        ? { kind, zoneId: show.zones[0].id, globalStartMs: 18_000 }
        : { kind, zoneId: show.zones[0].id, layerIndex: 0, globalStartMs: 18_000 },
    })

    expect(result).not.toBe(composition)
    expect(composition).toEqual(before)
    expect(directPlacements(result).map(authoredAppearance)).toEqual(
      directPlacements(before).map(authoredAppearance),
    )
    expect(directPlacements(result).map(item => [item.id, item.startMs, item.durationMs])).toEqual([
      ['clip', 8_000, 2_000],
      ['clip--span-scene-3', 0, 2_000],
    ])
    expect(validateShowComposition(show, result)).toEqual([])
  })

  it('preserves an unrelated tracked Clip record while repartitioning divergent static appearance', () => {
    const { show, composition, owner } = fixture('main')
    composition.patternInstances.push({
      id: 'unrelated-instance',
      pattern: { kind: 'stock', id: 'Rings' },
      patternName: 'Rings',
      time: { timeScale: 1, timeOffsetMs: 0 },
    })
    composition.scenes[3].zones[0].main.push({
      id: 'unrelated',
      instanceId: 'unrelated-instance',
      startMs: 5_000,
      durationMs: 1_000,
      view: { mirror: false, phase: 0.4, brightness: 0.5 },
      effects: [{ id: 'unrelated-effect', kind: 'posterize', levels: 4, amount: 1 }],
    })
    composition.scenes[3].propertyTracks = [{
      id: 'unrelated-track',
      target: { kind: 'placement-view', placementId: 'unrelated', property: 'brightness' },
      keyframes: [
        { id: 'unrelated-start', timeMs: 5_000, value: 0.5, easing: { curve: 'linear' } },
        { id: 'unrelated-end', timeMs: 6_000, value: 1, easing: { curve: 'linear' } },
      ],
    }]
    expect(validateShowComposition(show, composition)).toEqual([])
    const unrelatedBefore = structuredClone(composition.scenes[3])

    const result = moveShowClipAtGlobalTime(show, composition, {
      owner,
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 18_000 },
    })

    expect(result).not.toBe(composition)
    expect(result.scenes[3]).toEqual(unrelatedBefore)
    expect(validateShowComposition(show, result)).toEqual([])
  })

  it.each<OwnerKind>(['main', 'overlay'])('refuses a divergent %s move whose appearance boundary would land inside one Scene', kind => {
    const { show, composition, owner } = fixture(kind)
    const before = structuredClone(composition)
    const result = moveShowClipAtGlobalTime(show, composition, {
      owner,
      target: kind === 'main'
        ? { kind, zoneId: show.zones[0].id, globalStartMs: 17_000 }
        : { kind, zoneId: show.zones[0].id, layerIndex: 0, globalStartMs: 17_000 },
    })

    expect(result).toBe(composition)
    expect(composition).toEqual(before)
  })

  it.each(['view', 'effects', 'ownership'] as const)('does not repair invalid logical Clip %s while repartitioning', invalid => {
    const { show, composition, owner } = fixture('main')
    const tail = composition.scenes[1].zones[0].main[0]
    if (invalid === 'view') tail.view.brightness = 0.2
    else if (invalid === 'effects') tail.effects = [{ id: 'different', kind: 'invert', amount: 1 }]
    else {
      composition.patternInstances.push({
        id: 'different-instance',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      })
      tail.instanceId = 'different-instance'
    }
    expect(validateShowComposition(show, composition)).not.toEqual([])
    const before = structuredClone(composition)

    expect(moveShowClipAtGlobalTime(show, composition, {
      owner,
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 18_000 },
    })).toBe(composition)
    expect(resizeShowClipAtGlobalTime(show, composition, {
      owner,
      globalStartMs: 8_000,
      durationMs: 5_000,
    })).toBe(composition)
    expect(composition).toEqual(before)
  })

  it('refuses a move when a destination Transition gap would discard one divergent source appearance', () => {
    const { show, composition, owner } = fixture('main')
    show.scenes.push(
      { id: 'scene-5', name: 'Scene 5', durationMs: 10_000 },
      { id: 'scene-6', name: 'Scene 6', durationMs: 10_000 },
    )
    show.transitions = show.scenes.slice(0, -1).map((scene, index) => ({
      id: `boundary-${index + 1}`,
      afterSceneId: scene.id,
      kind: index === 3 ? 'crossfade' as const : 'cut' as const,
      durationMs: index === 3 ? 10_000 : 0,
      easing: { curve: 'linear' as const },
      ...(index === 3 ? { crossfadePolicy: 'live-live' as const } : {}),
    }))
    composition.scenes.push(...show.scenes.slice(4).map(scene => ({
      sceneId: scene.id,
      zones: [{ zoneId: show.zones[0].id, main: [], overlays: [] }],
    })))
    composition.scenes[1].zones[0].main[0].durationMs = 10_000
    composition.scenes[2].zones[0].main.push({
      ...placement('clip--span-scene-3', 0, 2_000, {
        opacity: 0.1,
        transform: { positionX: -0.25, positionY: 0.1, rotation: 0.25, scaleX: 1, scaleY: 0.75 },
        viewport: { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5, aperture: 'diamond' },
      }),
      logicalClipId: 'clip',
    })
    expect(validateShowComposition(show, composition)).toEqual([])
    const before = structuredClone(composition)

    expect(moveShowClipAtGlobalTime(show, composition, {
      owner,
      target: { kind: 'main', zoneId: show.zones[0].id, globalStartMs: 38_000 },
    })).toBe(composition)
    expect(composition).toEqual(before)
  })

  it('keeps source-global appearance on both sides of a split inside the later segment', () => {
    const { show, composition, owner } = fixture('main')
    const before = structuredClone(composition)
    const result = splitShowClipAtGlobalTime(show, composition, {
      owner,
      globalTimeMs: 11_000,
      newPlacementId: 'right',
    })

    expect(result).not.toBe(composition)
    expect(composition).toEqual(before)
    expect(directPlacements(result).map(item => [item.id, item.startMs, item.durationMs, authoredAppearance(item)])).toEqual([
      ['clip', 8_000, 2_000, authoredAppearance(before.scenes[0].zones[0].main[0])],
      ['clip--span-scene-2', 0, 1_000, authoredAppearance(before.scenes[1].zones[0].main[0])],
      ['right', 1_000, 1_000, authoredAppearance(before.scenes[1].zones[0].main[0])],
    ])
    expect(validateShowComposition(show, result)).toEqual([])
  })

  it('retains each surviving Scene record while trimming and extending within its existing tail Scene', () => {
    const { show, composition, owner } = fixture('overlay')
    const before = structuredClone(composition)
    const extended = resizeShowClipAtGlobalTime(show, composition, {
      owner,
      globalStartMs: 8_000,
      durationMs: 5_000,
    })
    expect(extended).not.toBe(composition)
    expect(directPlacements(extended).map(authoredAppearance)).toEqual([
      authoredAppearance(before.scenes[0].zones[0].overlays[0].placements[0]),
      authoredAppearance(before.scenes[1].zones[0].overlays[0].placements[0]),
    ])
    expect(directPlacements(extended).map(item => [item.id, item.startMs, item.durationMs])).toEqual([
      ['clip', 8_000, 2_000],
      ['clip--span-scene-2', 0, 3_000],
    ])

    const trimmed = resizeShowClipAtGlobalTime(show, extended, {
      owner,
      globalStartMs: 10_000,
      durationMs: 2_000,
    })
    expect(directPlacements(trimmed)).toHaveLength(1)
    expect(directPlacements(trimmed)[0]).toMatchObject({ id: 'clip', startMs: 0, durationMs: 2_000 })
    expect(authoredAppearance(directPlacements(trimmed)[0])).toEqual(
      authoredAppearance(before.scenes[1].zones[0].overlays[0].placements[0]),
    )
    expect(validateShowComposition(show, trimmed)).toEqual([])
    expect(composition).toEqual(before)
  })

  it('refuses divergent resize growth into a Scene with no established appearance owner', () => {
    const { show, composition, owner } = fixture('main')
    const before = structuredClone(composition)
    expect(resizeShowClipAtGlobalTime(show, composition, {
      owner,
      globalStartMs: 8_000,
      durationMs: 15_000,
    })).toBe(composition)
    expect(composition).toEqual(before)
  })

  it('duplicates an aligned divergent profile and refuses a copy that would merge its pieces', () => {
    const aligned = fixture('main', true)
    const copied = duplicateShowClipAfter(aligned.show, aligned.composition, {
      owner: aligned.owner,
      newPlacementId: 'copy',
      newInstanceId: 'copy-instance',
    })
    expect(copied).not.toBe(aligned.composition)
    expect(directPlacements(copied).slice(2).map(item => [item.id, authoredAppearance(item)])).toEqual([
      ['copy', authoredAppearance(aligned.composition.scenes[0].zones[0].main[0])],
      ['copy--span-scene-4', authoredAppearance(aligned.composition.scenes[1].zones[0].main[0])],
    ])
    expect(validateShowComposition(aligned.show, copied)).toEqual([])

    const merged = fixture('main')
    const before = structuredClone(merged.composition)
    expect(duplicateShowClipAfter(merged.show, merged.composition, {
      owner: merged.owner,
      newPlacementId: 'copy',
      newInstanceId: 'copy-instance',
    })).toBe(merged.composition)
    expect(merged.composition).toEqual(before)
  })
})
