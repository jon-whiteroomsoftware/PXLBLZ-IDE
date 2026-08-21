// Shared fixture for the Show command registry tests: two 30 s Scenes with a
// 2 s boundary crossfade (so the global timeline runs 0–62 000 ms with the
// transition window at 30 000–32 000), two main clips and one overlay clip
// in Scene 1, free time in Scene 2, one marker. Instance sharing is arranged
// for the Pattern-instance commands: clip-a and clip-c share instance-a;
// clip-b has its own instance of the same Pattern; the overlay clip uses a
// different Pattern for incompatibility partitions.
import type { ShowCompositionV1, ShowRecord } from '../engine/personalContentRecords'
import { createDefaultShow } from '../engine/showModel'

export function showCommandFixture(): ShowRecord {
  const base = createDefaultShow('command-fixture', 'Command fixture', 1)
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
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
      {
        id: 'instance-ov',
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        time: { timeScale: 1, timeOffsetMs: 0 },
      },
    ],
    scenes: [
      {
        sceneId: 'scene-1',
        zones: [{
          zoneId: 'zone-1',
          main: [
            {
              id: 'clip-a',
              instanceId: 'instance-a',
              startMs: 0,
              durationMs: 10_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'clip-b',
              instanceId: 'instance-b',
              startMs: 12_000,
              durationMs: 8_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'clip-c',
              instanceId: 'instance-a',
              startMs: 22_000,
              durationMs: 6_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
          ],
          overlays: [{
            id: 'overlay-1',
            name: 'Overlay 1',
            placements: [{
              id: 'clip-ov',
              instanceId: 'instance-ov',
              startMs: 2_000,
              durationMs: 6_000,
              opacity: 1,
              view: { mirror: false, phase: 0, brightness: 1 },
            }],
          }],
        }],
      },
      {
        sceneId: 'scene-2',
        zones: [{ zoneId: 'zone-1', main: [], overlays: [] }],
      },
    ],
    markers: [{ id: 'marker-1', timeMs: 12_000, name: 'Drop' }],
  }
  return { ...base, composition }
}

/** The fixture with a brightness track on clip-b and a speed track on instance-a. */
export function trackedCommandFixture(): ShowRecord {
  const record = showCommandFixture()
  const composition = record.composition!
  return {
    ...record,
    composition: {
      ...composition,
      scenes: composition.scenes.map((scene) => scene.sceneId === 'scene-1'
        ? {
            ...scene,
            propertyTracks: [
              {
                id: 'track-b',
                target: { kind: 'placement-view', placementId: 'clip-b', property: 'brightness' },
                keyframes: [
                  { id: 'kf-1', timeMs: 12_000, value: 1, easing: { curve: 'linear' } },
                  { id: 'kf-2', timeMs: 19_000, value: 0.2, easing: { curve: 'linear' } },
                ],
              },
              {
                id: 'track-inst',
                target: { kind: 'instance-time-scale', instanceId: 'instance-a' },
                keyframes: [
                  { id: 'kf-3', timeMs: 22_500, value: 1, easing: { curve: 'linear' } },
                  { id: 'kf-4', timeMs: 27_000, value: 0.5, easing: { curve: 'linear' } },
                ],
              },
              {
                id: 'track-inst-b',
                target: { kind: 'instance-time-scale', instanceId: 'instance-b' },
                keyframes: [
                  { id: 'kf-5', timeMs: 12_000, value: 1, easing: { curve: 'linear' } },
                  { id: 'kf-6', timeMs: 19_000, value: 0.75, easing: { curve: 'linear' } },
                ],
              },
            ],
          }
        : scene),
    },
  }
}

/** The fixture stamped with the deterministic-loop proof, to observe its forfeit. */
export function stampedCommandFixture(): ShowRecord {
  const record = showCommandFixture()
  return {
    ...record,
    composition: { ...record.composition!, executionModel: 'deterministic-loop' },
  }
}

/**
 * Boundary-free tracked variant: no Scene-boundary transition and no clip-c,
 * so the tracked clip-b can grow across the Scene boundary.
 */
export function boundaryFreeTrackedFixture(): ShowRecord {
  const record = trackedCommandFixture()
  const composition = record.composition!
  return {
    ...record,
    transitions: [],
    composition: {
      ...composition,
      scenes: composition.scenes.map((scene) => ({
        ...scene,
        zones: scene.zones.map((zone) => ({
          ...zone,
          main: zone.main.filter((placement) => placement.id !== 'clip-c'),
        })),
      })),
    },
  }
}

/** Boundary-free with only instance tracks: a placement-tracked clip cannot cross a Scene boundary. */
export function boundaryFreeInstanceTrackedFixture(): ShowRecord {
  const record = boundaryFreeTrackedFixture()
  const composition = record.composition!
  return {
    ...record,
    composition: {
      ...composition,
      scenes: composition.scenes.map((scene) => ({
        ...scene,
        propertyTracks: scene.propertyTracks?.filter((track) => track.id !== 'track-b'),
      })),
    },
  }
}

/** A Show whose single clip makes remove_clip's last-clip refusal reachable. */
export function singleClipCommandFixture(): ShowRecord {
  const record = showCommandFixture()
  const composition = record.composition!
  return {
    ...record,
    composition: {
      ...composition,
      patternInstances: composition.patternInstances.filter((instance) => instance.id === 'instance-a'),
      scenes: composition.scenes.map((scene) => ({
        ...scene,
        zones: scene.zones.map((zone) => ({
          ...zone,
          main: zone.main.filter((placement) => placement.id === 'clip-a'),
          overlays: [],
        })),
      })),
    },
  }
}
