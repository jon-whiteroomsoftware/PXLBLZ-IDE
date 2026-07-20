import { describe, expect, it } from 'vitest'
import { projectFlatShowComposition } from './showCompositionProjection'
import { createDefaultShow, normalizeShowTransitionState } from './showModel'
import { addShowOverlayLayer, addShowOverlayPlacement, projectFlatShowToCompositionV1, splitShowMainPlacement } from './showCompositionModel'
import {
  projectShowSceneEditorScope,
  resolveShowSceneEditorScope,
  showRoutingLayoutForScene,
} from './showSceneEditorScope'

const source = 'export function render(index) { rgb(index / pixelCount, 0, 0) }'

function projectionFor(show: ReturnType<typeof createDefaultShow>) {
  return projectFlatShowComposition(show, {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
    stageDimension: 1,
  })
}

describe('Show Scene editor scope (#487)', () => {
  it('resolves an explicit Scene and Zone and rejects a missing Scene', () => {
    const show = createDefaultShow('show-scope', 'Scope test')

    expect(resolveShowSceneEditorScope(show, { sceneId: 'scene-2', zoneId: 'zone-1' })).toEqual({
      sceneId: 'scene-2',
      zoneId: 'zone-1',
    })
    expect(resolveShowSceneEditorScope(show, { sceneId: 'missing', zoneId: 'zone-1' })).toBeNull()
  })

  it('falls back to the first active Zone when the requested Zone is unavailable', () => {
    const show = createDefaultShow('show-zone-fallback', 'Zone fallback')

    expect(resolveShowSceneEditorScope(show, { sceneId: 'scene-1', zoneId: 'missing' })).toEqual({
      sceneId: 'scene-1',
      zoneId: 'zone-1',
    })
  })

  it('resolves the routing layout active at the selected Scene', () => {
    const base = createDefaultShow('show-layout', 'Layout test')
    const show = {
      ...base,
      routingLayouts: [
        base.routingLayouts[0],
        { ...base.routingLayouts[0], id: 'layout-2', name: 'Dramatic zones' },
      ],
      transitions: [
        ...base.transitions,
        {
          id: 'routing-scene-1',
          afterSceneId: 'scene-1',
          kind: 'routing' as const,
          durationMs: 0,
          easing: { curve: 'linear' as const },
          layoutId: 'layout-2',
        },
      ],
    }

    expect(showRoutingLayoutForScene(show, 'scene-1')?.name).toBe('Default')
    expect(showRoutingLayoutForScene(show, 'scene-2')?.name).toBe('Dramatic zones')
  })

  it('projects local and global time, boundary context, and the real Main placement', () => {
    const show = normalizeShowTransitionState(createDefaultShow('show-projection', 'Projection test'))
    const projection = projectShowSceneEditorScope(
      projectionFor(show),
      { sceneId: 'scene-2', zoneId: 'zone-1' },
    )

    expect(projection).toMatchObject({
      scene: { id: 'scene-2', name: 'Scene 2', durationMs: 30_000 },
      zone: { id: 'zone-1', name: 'main' },
      layout: { id: 'layout-1', name: 'Default' },
      globalStartMs: 32_000,
      globalEndMs: 62_000,
      incomingBoundary: { afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 2_000 },
      outgoingBoundary: null,
    })
    expect(projection?.mainPlacements).toHaveLength(1)
    expect(projection?.mainPlacements[0]).toMatchObject({
      sourceCellId: 'cell-2',
      patternName: 'CometLoom',
      startMs: 0,
      endMs: 30_000,
    })
  })

  it('projects authored local Main placements instead of the flat compatibility cell', () => {
    const show = normalizeShowTransitionState(createDefaultShow('show-local-projection', 'Local projection'))
    const lookup = {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1 as const,
    }
    const initial = projectFlatShowToCompositionV1(show, lookup)
    const firstPlacement = initial.scenes[0].zones[0].main[0]
    show.composition = splitShowMainPlacement(show, initial, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      placementId: firstPlacement.id,
      atMs: 12_000,
      newPlacementId: 'placement-right',
    })

    const projection = projectShowSceneEditorScope(
      projectFlatShowComposition(show, lookup),
      { sceneId: 'scene-1', zoneId: 'zone-1' },
    )

    expect(projection?.mainPlacements).toEqual([
      expect.objectContaining({ id: firstPlacement.id, startMs: 0, endMs: 12_000 }),
      expect.objectContaining({ id: 'placement-right', startMs: 12_000, endMs: 30_000 }),
    ])
  })

  it('projects ordered overlay layers and their editable placement opacity (#489)', () => {
    const show = normalizeShowTransitionState(createDefaultShow('show-overlay-projection', 'Overlay projection'))
    const lookup = {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, source])),
      stageDimension: 1 as const,
    }
    const initial = projectFlatShowToCompositionV1(show, lookup)
    const instanceId = initial.scenes[0].zones[0].main[0].instanceId
    const layered = addShowOverlayLayer(show, initial, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      layer: { id: 'overlay-1', name: 'Atmosphere', placements: [] },
    })
    show.composition = addShowOverlayPlacement(show, layered, {
      sceneId: 'scene-1',
      zoneId: 'zone-1',
      layerId: 'overlay-1',
      placement: {
        id: 'overlay-placement',
        instanceId,
        startMs: 500,
        durationMs: 1_500,
        opacity: 0.4,
        view: { mirror: false, phase: 0, brightness: 0.8 },
      },
    })

    const projection = projectShowSceneEditorScope(
      projectFlatShowComposition(show, lookup),
      { sceneId: 'scene-1', zoneId: 'zone-1' },
    )

    expect(projection?.overlayLayers).toEqual([{
      id: 'overlay-1',
      name: 'Atmosphere',
      placements: [expect.objectContaining({
        id: 'overlay-placement',
        startMs: 500,
        endMs: 2_000,
        opacity: 0.4,
      })],
    }])
  })
})
