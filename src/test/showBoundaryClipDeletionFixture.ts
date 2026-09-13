import { createDefaultShow } from '../engine/showModel'
import type { ShowCompositionV1, ShowRecord } from '../engine/personalContentRecords'
import type { ShowTimelineClipOwner } from '../engine/showTimelineClipAuthoring'

export function boundaryDeletionPlacement(
  id: string,
  startMs: number,
  durationMs: number,
  instanceId = `instance-${id}`,
) {
  return {
    id,
    instanceId,
    startMs,
    durationMs,
    view: { mirror: false, phase: 0, brightness: 1 },
  }
}

export function boundaryClipDeletionFixture(id = 'boundary-deletion'): ShowRecord {
  const show = createDefaultShow(id, 'Boundary deletion', 1)
  const instanceIds = ['starter-a', 'starter-b', 'overlay-a', 'overlay-b', 'overlay-c', 'overlay-d']
  const composition: ShowCompositionV1 = {
    version: 1,
    durationMs: 62_000,
    markers: [
      { id: 'before-boundary', timeMs: 29_000 },
      { id: 'inside-removed-effect', timeMs: 31_000 },
      { id: 'after-boundary', timeMs: 40_000 },
      { id: 'dormant', timeMs: 70_000 },
    ],
    patternInstances: instanceIds.map((instanceId) => ({
      id: `instance-${instanceId}`,
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: instanceId,
      time: { timeScale: 1, timeOffsetMs: 0 },
    })),
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [boundaryDeletionPlacement('starter-a', 0, 30_000)],
          overlays: ['a', 'b', 'c', 'd'].map((suffix) => ({
            id: `layer-${suffix}-scene-1`,
            name: `Layer ${suffix.toUpperCase()}`,
            placements: [{ ...boundaryDeletionPlacement(`overlay-${suffix}`, 0, 30_000), opacity: 1 }],
          })),
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{
          zoneId: 'zone-1',
          main: [boundaryDeletionPlacement('starter-b', 0, 30_000)],
          overlays: ['a', 'b', 'c', 'd'].map((suffix) => ({
            id: `layer-${suffix}-scene-2`,
            name: `Layer ${suffix.toUpperCase()}`,
            placements: [],
          })),
        }],
      },
    ],
  }
  return { ...show, composition }
}

export const boundaryStarterAOwner: ShowTimelineClipOwner = {
  kind: 'main', sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'starter-a',
}

export const boundaryStarterBOwner: ShowTimelineClipOwner = {
  kind: 'main', sceneId: 'scene-2', zoneId: 'zone-1', placementId: 'starter-b',
}
