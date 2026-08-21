import { describe, expect, it } from 'vitest'
import type {
  ShowCompositionV1,
  ShowPatternInstance,
  ShowRecord,
} from './personalContentRecords'
import { createDefaultShow, updateShowZone } from './showModel'
import { insertShowLayerTransition, resizeShowLayerTransition } from './showLayerTransitionAuthoring'
import { duplicateShowLayoutInterval } from './showLayoutIntervals'
import { moveShowTimelineMarker } from './showTimelineAuthoring'
import { resizeShowClipAtGlobalTime, type ShowTimelineClipOwner } from './showTimelineClipAuthoring'
import { projectShowSummary, type ShowSummaryClip } from './showSummaryProjection'

const instances: ShowPatternInstance[] = [
  {
    id: 'instance-a',
    pattern: { kind: 'stock', id: 'Rings' },
    patternName: 'Rings',
    time: { timeScale: 1, timeOffsetMs: 0 },
  },
  {
    id: 'instance-b',
    pattern: { kind: 'stock', id: 'CometLoom' },
    patternName: 'CometLoom',
    time: { timeScale: 1, timeOffsetMs: 0 },
  },
]

/**
 * Two Scenes; Scene 1 carries two consecutive main clips (joined by a Layer
 * transition below), one overlay clip, and a brightness track; Scene 2's
 * main clip sits against the authored Scene-boundary crossfade; one marker.
 */
function fixture(): { show: ShowRecord; composition: ShowCompositionV1 } {
  const base = createDefaultShow('show-summary', 'Summary fixture', 1)
  const composition: ShowCompositionV1 = {
    version: 1,
    patternInstances: instances,
    scenes: [
      {
        sceneId: 'scene-1',
        propertyTracks: [{
          id: 'track-1',
          target: { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' },
          keyframes: [
            { id: 'kf-1', timeMs: 0, value: 1, easing: { curve: 'linear' } },
            { id: 'kf-2', timeMs: 5_000, value: 0.2, easing: { curve: 'linear' } },
          ],
        }],
        zones: [{
          zoneId: 'zone-1',
          main: [
            {
              id: 'clip-a',
              instanceId: 'instance-a',
              startMs: 0,
              durationMs: 6_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'clip-b',
              instanceId: 'instance-b',
              startMs: 6_000,
              durationMs: 22_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
          ],
          overlays: [{
            id: 'overlay-1',
            name: 'Overlay 1',
            placements: [{
              id: 'clip-ov',
              instanceId: 'instance-a',
              startMs: 2_000,
              durationMs: 8_000,
              opacity: 0.8,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
          }],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [{
            id: 'clip-c',
            instanceId: 'instance-b',
            startMs: 0,
            durationMs: 6_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      },
    ],
    markers: [{ id: 'marker-1', timeMs: 12_000, name: 'Drop' }],
  }
  const withTransition = insertShowLayerTransition(base, composition, {
    id: 'lt-1',
    fromPlacementId: 'clip-a',
    toPlacementId: 'clip-b',
    kind: 'crossfade',
    durationMs: 2_000,
    easing: { curve: 'linear' },
    crossfadePolicy: 'snapshot-live',
  })
  expect(withTransition).not.toBe(composition)
  const show: ShowRecord = { ...base, composition: withTransition }
  return { show, composition: withTransition }
}

function clipOwner(clip: ShowSummaryClip): ShowTimelineClipOwner {
  return clip.kind === 'main'
    ? { kind: 'main', sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.clipId }
    : {
        kind: 'overlay',
        sceneId: clip.sceneId,
        zoneId: clip.zoneId,
        layerId: clip.layerId ?? '',
        placementId: clip.clipId,
      }
}

describe('projectShowSummary', () => {
  it('renders the golden summary of the fixture Show', () => {
    const { show, composition } = fixture()
    expect(projectShowSummary(show, composition)).toEqual({
      showId: 'show-summary',
      name: 'Summary fixture',
      durationMs: 62_000,
      scenes: [
        { sceneId: 'scene-1', name: 'Scene 1', startMs: 0, endMs: 30_000, durationMs: 30_000 },
        { sceneId: 'scene-2', name: 'Scene 2', startMs: 32_000, endMs: 62_000, durationMs: 30_000 },
      ],
      zones: [{
        zoneId: 'zone-1',
        name: 'main',
        color: '#38bdf8',
        layers: [
          {
            kind: 'overlay',
            layerIndex: 0,
            clips: [{
              clipId: 'clip-ov',
              patternName: 'Rings',
              instanceId: 'instance-a',
              kind: 'overlay',
              sceneId: 'scene-1',
              zoneId: 'zone-1',
              layerId: 'overlay-1',
              startMs: 2_000,
              endMs: 10_000,
              durationMs: 8_000,
              logicalClipId: 'clip-ov',
              effectKinds: [],
            }],
            junctions: [],
          },
          {
            kind: 'main',
            layerIndex: 1,
            clips: [
              {
                clipId: 'clip-a',
                patternName: 'Rings',
                instanceId: 'instance-a',
                kind: 'main',
                sceneId: 'scene-1',
                zoneId: 'zone-1',
                layerId: null,
                startMs: 0,
                endMs: 6_000,
                durationMs: 6_000,
                logicalClipId: 'clip-a',
                effectKinds: [],
              },
              {
                clipId: 'clip-b',
                patternName: 'CometLoom',
                instanceId: 'instance-b',
                kind: 'main',
                sceneId: 'scene-1',
                zoneId: 'zone-1',
                layerId: null,
                startMs: 8_000,
                endMs: 30_000,
                durationMs: 22_000,
                logicalClipId: 'clip-b',
                effectKinds: [],
              },
              {
                clipId: 'clip-c',
                patternName: 'CometLoom',
                instanceId: 'instance-b',
                kind: 'main',
                sceneId: 'scene-2',
                zoneId: 'zone-1',
                layerId: null,
                startMs: 32_000,
                endMs: 38_000,
                durationMs: 6_000,
                logicalClipId: 'clip-c',
                effectKinds: [],
              },
            ],
            junctions: [
              {
                junctionId: 'lt-1',
                kind: 'crossfade',
                afterClipId: 'clip-a',
                beforeClipId: 'clip-b',
                startMs: 6_000,
                endMs: 8_000,
                durationMs: 2_000,
                boundary: false,
                layerTransitionId: 'lt-1',
              },
              {
                junctionId: 'transition-scene-1',
                kind: 'crossfade',
                afterClipId: 'clip-b',
                beforeClipId: 'clip-c',
                startMs: 30_000,
                endMs: 32_000,
                durationMs: 2_000,
                boundary: true,
                layerTransitionId: null,
              },
            ],
          },
        ],
        groups: [],
      }],
      markers: [{ markerId: 'marker-1', timeMs: 12_000, name: 'Drop' }],
      layouts: [{ layoutId: 'layout-1', name: 'Default', zoneIds: ['zone-1'] }],
      layoutOccurrences: [{
        intervalId: 'layout-occurrence-scene-1',
        layoutId: 'layout-1',
        layoutName: 'Default',
        startMs: 0,
        endMs: 62_000,
      }],
      tracks: [{
        trackId: 'track-1',
        sceneId: 'scene-1',
        target: { kind: 'placement-view', placementId: 'clip-a', property: 'brightness' },
        keyframeCount: 2,
      }],
    })
  })

  it('round-trips every id family into the mutation layer', () => {
    const { show, composition } = fixture()
    const summary = projectShowSummary(show, composition)
    const mainLayer = summary.zones[0].layers.find((layer) => layer.kind === 'main')!
    const overlayLayer = summary.zones[0].layers.find((layer) => layer.kind === 'overlay')!

    // Clip ids resolve as owners in the clip authoring functions. clip-c is
    // the transition-free main clip; the transition-connected ones resize
    // through the connected-clip functions instead.
    const freeClip = mainLayer.clips.find((clip) => clip.clipId === 'clip-c')!
    const shrunk = resizeShowClipAtGlobalTime(show, composition, {
      owner: clipOwner(freeClip),
      globalStartMs: freeClip.startMs,
      durationMs: freeClip.durationMs - 1_000,
    })
    expect(shrunk).not.toBe(composition)

    const overlayShrunk = resizeShowClipAtGlobalTime(show, composition, {
      owner: clipOwner(overlayLayer.clips[0]),
      globalStartMs: overlayLayer.clips[0].startMs,
      durationMs: overlayLayer.clips[0].durationMs - 1_000,
    })
    expect(overlayShrunk).not.toBe(composition)

    // The junction's layer-transition id resolves in the transition authoring.
    const layerTransitionId = mainLayer.junctions[0].layerTransitionId
    expect(layerTransitionId).not.toBeNull()
    const resized = resizeShowLayerTransition(show, composition, layerTransitionId!, 1_000)
    expect(resized).not.toBe(composition)

    // Marker ids resolve in the timeline marker functions.
    const moved = moveShowTimelineMarker(show, summary.markers[0].markerId, 13_000)
    expect(moved).not.toBe(show)
    expect(moved.composition?.markers?.[0].timeMs).toBe(13_000)

    // Zone ids resolve in the Show model.
    const renamed = updateShowZone(show, summary.zones[0].zoneId, { name: 'Renamed' })
    expect(renamed.zones[0].name).toBe('Renamed')

    // Layout occurrence ids resolve in the Zone Layout interval functions.
    const duplicated = duplicateShowLayoutInterval(
      show,
      summary.layoutOccurrences[0].intervalId,
      { withContent: false },
    )
    expect(duplicated).not.toBe(show)
  })

  it('marker ids from the summary reject unknown ids the same way', () => {
    const { show } = fixture()
    expect(moveShowTimelineMarker(show, 'marker-nope', 1_000)).toBe(show)
  })
})
