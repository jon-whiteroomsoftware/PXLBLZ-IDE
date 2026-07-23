import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'
import type { ShowCompositionV1 } from './personalContentRecords'

describe('unified Show timeline projection (#580)', () => {
  it('projects every same-layer abutment as an explicit Cut junction (#583)', () => {
    const show = createDefaultShow('show-cut-projection', 'Cut projection', 1_000)
    const scene = show.scenes[0]
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [
            {
              id: 'clip-a',
              instanceId: 'instance-a',
              startMs: 1_000,
              durationMs: 2_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'clip-b',
              instanceId: 'instance-a',
              startMs: 3_000,
              durationMs: 1_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'clip-after-gap',
              instanceId: 'instance-a',
              startMs: 5_000,
              durationMs: 1_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
          ],
          overlays: [],
        }],
      }],
    }

    const main = projectShowUnifiedTimeline(show, composition).zones[0].layers[0]

    expect(main.junctions).toEqual([{
      id: 'cut:clip-a:clip-b',
      kind: 'cut',
      leftClipId: 'clip-a',
      rightClipId: 'clip-b',
      fromPlacementId: 'clip-a',
      toPlacementId: 'clip-b',
      startMs: 3_000,
      endMs: 3_000,
      durationMs: 0,
      transition: null,
    }])
  })

  it('projects a durable non-Cut transition into its literal gap between Clips (#583)', () => {
    const show = createDefaultShow('show-transition-projection', 'Transition projection', 1_000)
    const scene = show.scenes[0]
    const zoneId = show.zones[0].id
    const placement = (id: string, startMs: number, durationMs: number) => ({
      id,
      instanceId: 'instance-a',
      startMs,
      durationMs,
      view: { mirror: false, phase: 0, brightness: 1 },
    })
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      transitions: [{
        id: 'transition-a-b',
        fromPlacementId: 'clip-a',
        toPlacementId: 'clip-b',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'sine', direction: 'in-out' },
        crossfadePolicy: 'live-live',
      }],
      scenes: [{
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [placement('clip-a', 1_000, 2_000), placement('clip-b', 4_000, 2_000)],
          overlays: [],
        }],
      }],
    }

    expect(projectShowUnifiedTimeline(show, composition).zones[0].layers[0].junctions).toEqual([
      expect.objectContaining({
        id: 'transition-a-b',
        kind: 'crossfade',
        leftClipId: 'clip-a',
        rightClipId: 'clip-b',
        startMs: 3_000,
        endMs: 4_000,
        durationMs: 1_000,
        transition: composition.transitions![0],
      }),
    ])
  })

  it('projects a legacy visual boundary Transition between Scene-local Clips (#589)', () => {
    const show = createDefaultShow('show-legacy-transition-projection', 'Legacy transition projection', 1_000)
    const zoneId = show.zones[0].id
    const [leftScene, rightScene] = show.scenes
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [
        {
          sceneId: leftScene.id,
          zones: [{
            zoneId,
            main: [{
              id: 'clip-left',
              instanceId: 'instance-a',
              startMs: 0,
              durationMs: leftScene.durationMs,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
            overlays: [],
          }],
        },
        {
          sceneId: rightScene.id,
          zones: [{
            zoneId,
            main: [{
              id: 'clip-right',
              instanceId: 'instance-a',
              startMs: 0,
              durationMs: rightScene.durationMs,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
            overlays: [],
          }],
        },
      ],
    }

    expect(projectShowUnifiedTimeline(show, composition).zones[0].layers[0].junctions).toEqual([
      expect.objectContaining({
        id: 'transition-scene-1',
        kind: 'crossfade',
        leftClipId: 'clip-left',
        rightClipId: 'clip-right',
        startMs: 30_000,
        endMs: 32_000,
        durationMs: 2_000,
        transition: null,
        boundaryTransition: show.transitions[0],
      }),
    ])
  })

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

  it('does not infer a Scene-boundary transition across a same-Scene gap', () => {
    const show = createDefaultShow('show-same-scene-gap', 'Same Scene gap', 1_000)
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-a',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: sceneIndex === 0
            ? [
                {
                  id: 'same-scene-left',
                  instanceId: 'instance-a',
                  startMs: 0,
                  durationMs: 1_000,
                  view: { mirror: false, phase: 0, brightness: 1 },
                },
                {
                  id: 'same-scene-right',
                  instanceId: 'instance-a',
                  startMs: 3_000,
                  durationMs: 1_000,
                  view: { mirror: false, phase: 0, brightness: 1 },
                },
              ]
            : [],
          overlays: [],
        }],
      })),
    }

    expect(projectShowUnifiedTimeline(show, composition).zones[0].layers[0].junctions).toEqual([])
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

  it('projects Group shells and their materialized child Clips on the ordinary timeline (#587)', () => {
    const show = createDefaultShow('show-group-projection', 'Group projection', 1_000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    const composition: ShowCompositionV1 = {
      version: 1,
      patternInstances: [],
      scenes: [{ sceneId, zones: [{ zoneId, main: [], overlays: [] }] }],
      groupDefinitions: [{
        id: 'phrase',
        name: 'Pulse phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'stock', id: 'Rings' },
          patternName: 'Rings',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [
          {
            id: 'main-child', instanceId: 'inside-instance', layerOffset: 0,
            startMs: 0, durationMs: 1_000, opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          },
          {
            id: 'overlay-child', instanceId: 'inside-instance', layerOffset: 1,
            startMs: 500, durationMs: 1_000, opacity: 0.75,
            view: { mirror: false, phase: 0, brightness: 1 },
          },
        ],
      }],
      groupOccurrences: [{
        id: 'phrase-use', definitionId: 'phrase', sceneId, zoneId,
        startMs: 2_000, baseLayer: 0, translationX: 0, translationY: 0,
      }],
    }

    const projection = projectShowUnifiedTimeline(show, composition)

    expect(projection.zones[0].groups).toEqual([expect.objectContaining({
      id: 'phrase-use',
      definitionId: 'phrase',
      name: 'Pulse phrase',
      startMs: 2_000,
      endMs: 3_500,
      bottomLayerIndex: 1,
      topLayerIndex: 0,
    })])
    expect(projection.zones[0].layers.flatMap((layer) => layer.clips)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'phrase-use:main-child', groupOccurrenceId: 'phrase-use' }),
      expect.objectContaining({ id: 'phrase-use:overlay-child', groupOccurrenceId: 'phrase-use' }),
    ]))
  })
})
