import { describe, expect, it } from 'vitest'
import type { ShowUnifiedTimelineProjection } from './showUnifiedTimelineProjection'
import {
  nextShowTimelineTraversalTarget,
  projectShowTimelineTraversalTargets,
} from './showTimelineKeyboard'

const timeline: ShowUnifiedTimelineProjection = {
  durationMs: 10_000,
  zones: [
    {
      id: 'zone-a',
      name: 'A',
      color: '#fff',
      groups: [{
        id: 'group-1',
        definitionId: 'definition-1',
        name: 'Pulse',
        sceneId: 'scene-1',
        zoneId: 'zone-a',
        startMs: 1_000,
        endMs: 4_000,
        durationMs: 3_000,
        topLayerIndex: 0,
        bottomLayerIndex: 1,
        linkedOccurrenceCount: 2,
      }],
      layers: [
        {
          id: 'overlay-a',
          kind: 'overlay',
          layerIndex: 0,
          junctions: [],
          clips: [clip('group-1:child-b', 'zone-a', 0, 2_000, 'group-1')],
        },
        {
          id: 'main-a',
          kind: 'main',
          layerIndex: 1,
          junctions: [],
          clips: [
            clip('clip-late', 'zone-a', 1, 5_000),
            clip('group-1:child-a', 'zone-a', 1, 1_000, 'group-1'),
          ],
        },
      ],
    },
    {
      id: 'zone-b',
      name: 'B',
      color: '#fff',
      groups: [],
      layers: [{
        id: 'main-b',
        kind: 'main',
        layerIndex: 0,
        junctions: [],
        clips: [clip('clip-zone-b', 'zone-b', 0, 1_000)],
      }],
    },
  ],
}

describe('Show timeline keyboard traversal (#588)', () => {
  it('orders visible Clips by time, Zone, and Layer while treating a Group as one target', () => {
    expect(projectShowTimelineTraversalTargets(timeline)).toEqual([
      { kind: 'group', occurrenceId: 'group-1' },
      { kind: 'clip', clipId: 'clip-zone-b' },
      { kind: 'clip', clipId: 'clip-late' },
    ])
  })

  it('traverses only the isolated Group children and wraps in both directions', () => {
    const targets = projectShowTimelineTraversalTargets(timeline, 'group-1')
    expect(targets).toEqual([
      { kind: 'group-clip', occurrenceId: 'group-1', placementId: 'child-a' },
      { kind: 'group-clip', occurrenceId: 'group-1', placementId: 'child-b' },
    ])
    expect(nextShowTimelineTraversalTarget(targets, targets[1], 1)).toEqual(targets[0])
    expect(nextShowTimelineTraversalTarget(targets, targets[0], -1)).toEqual(targets[1])
  })
})

function clip(
  id: string,
  zoneId: string,
  layerIndex: number,
  startMs: number,
  groupOccurrenceId?: string,
) {
  return {
    id,
    startPlacementId: id,
    endPlacementId: id,
    instanceId: `${id}-instance`,
    patternName: id,
    compiled: true,
    sceneId: 'scene-1',
    zoneId,
    layerId: layerIndex === 0 ? 'overlay' : null,
    layerIndex,
    kind: layerIndex === 0 ? 'overlay' as const : 'main' as const,
    localStartMs: startMs,
    startMs,
    endMs: startMs + 1_000,
    durationMs: 1_000,
    opacity: 1,
    effectKinds: [],
    ...(groupOccurrenceId ? { groupOccurrenceId } : {}),
    diagnostics: [],
  }
}
