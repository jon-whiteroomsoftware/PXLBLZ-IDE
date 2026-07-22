import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import type { ShowCompositionV1 } from './personalContentRecords'

describe('unified Show timeline projection (#580)', () => {
  it('projects internal Scene-local placements onto one global timeline', () => {
    const show = createDefaultShow('show-unified-projection', 'Unified projection', 1_000)
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [
        {
          id: 'instance-a',
          pattern: { kind: 'stock', id: 'Rings' },
          patternName: 'Rings',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
        {
          id: 'instance-b',
          pattern: { kind: 'stock', id: 'Pulse' },
          patternName: 'Pulse',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
      ],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [{
            id: `placement-${index}`,
            instanceId: index === 0 ? 'instance-a' : 'instance-b',
            startMs: index === 0 ? 1_000 : 500,
            durationMs: 2_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      })),
    }

    const projection = projectShowUnifiedTimeline(show, composition)

    expect(projection.durationMs).toBe(62_000)
    expect(projection.zones).toHaveLength(1)
    expect(projection.zones[0].layers).toHaveLength(1)
    expect(projection.zones[0].layers[0]).toMatchObject({ kind: 'main' })
    expect(projection.zones[0].layers[0].clips).toEqual([
      expect.objectContaining({
        id: 'placement-0',
        patternName: 'Rings',
        startMs: 1_000,
        endMs: 3_000,
        sceneId: show.scenes[0].id,
      }),
      expect.objectContaining({
        id: 'placement-1',
        patternName: 'Pulse',
        startMs: 32_500,
        endMs: 34_500,
        sceneId: show.scenes[1].id,
      }),
    ])
  })

  it('keeps overlay stack positions stable across internal Scene boundaries', () => {
    const show = createDefaultShow('show-layer-projection', 'Layer projection', 1_000)
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-overlay',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [],
          overlays: Array.from({ length: sceneIndex + 1 }, (_, layerIndex) => ({
            id: `owned-layer-${sceneIndex}-${layerIndex}`,
            name: `Internal layer ${layerIndex}`,
            placements: [{
              id: `overlay-${sceneIndex}-${layerIndex}`,
              instanceId: 'instance-overlay',
              startMs: layerIndex * 1_000,
              durationMs: 1_000,
              opacity: 0.75,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
          })),
        }],
      })),
    }

    const layers = projectShowUnifiedTimeline(show, composition).zones[0].layers

    expect(layers.map((layer) => layer.kind)).toEqual(['overlay', 'overlay', 'main'])
    expect(layers[0].clips.map((clip) => clip.id)).toEqual(['overlay-0-0', 'overlay-1-0'])
    expect(layers[1].clips).toEqual([
      expect.objectContaining({
        id: 'overlay-1-1',
        layerId: 'owned-layer-1-1',
        layerIndex: 1,
        startMs: 33_000,
        opacity: 0.75,
      }),
    ])
  })
})
