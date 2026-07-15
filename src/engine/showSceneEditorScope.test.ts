import { describe, expect, it } from 'vitest'
import { projectFlatShowComposition } from './showCompositionProjection'
import { createDefaultShow, normalizeShowTransitionState } from './showModel'
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
      routingSwitches: [{ afterSceneId: 'scene-1', layoutId: 'layout-2' }],
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
})
