// Shared fixture for the Show command registry tests: two 30 s Scenes with a
// 2 s boundary crossfade (so the global timeline runs 0–62 000 ms with the
// transition window at 30 000–32 000), two main clips and one overlay clip
// in Scene 1, free time in Scene 2, one marker. Instance sharing is arranged
// for the Pattern-instance commands: clip-a and clip-c share instance-a;
// clip-b has its own instance of the same Pattern; the overlay clip uses a
// different Pattern for incompatibility partitions.
import type { ShowCompositionV1, ShowRecord } from '../engine/personalContentRecords'
import { createDefaultShow } from '../engine/showModel'
import { applyShowCommand } from '../engine/showCommands/registry'
import { DEMOS } from '../pixelblaze/stock/patterns'

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

/**
 * The pre-edit record used by #1029's real four-Layer Show End command proof.
 * Scene 2 is occupied so the public command sequence must remove its last Clip
 * before shortening across the Cut.
 */
export function fourLayerShowEndBaseFixture(): ShowRecord {
  const show = showCommandFixture()
  for (const instance of show.composition!.patternInstances) {
    instance.pattern = { kind: 'stock', id: 'CometLoom' }
    instance.patternName = 'Comet Loom'
  }
  show.composition!.scenes[0].zones[0].main = show.composition!.scenes[0].zones[0].main
    .filter(placement => placement.id === 'clip-a')
  show.composition!.scenes[1].zones[0].main = [{
    id: 'clip-scene-2',
    instanceId: 'instance-b',
    startMs: 0,
    durationMs: 30_000,
    view: { mirror: false, phase: 0, brightness: 1 },
  }]
  show.composition!.scenes[1].zones[0].overlays = [{
    id: 'overlay-2', name: 'Overlay 1', placements: [],
  }]
  return show
}

/** The exact public-command sequence used by #1029's admission and compiler proofs. */
export function applyFourLayerShowEndCommandSequence(current: ShowRecord): ShowRecord {
  let candidate = current
  const apply = (command: string, input: Record<string, unknown>) => {
    const outcome = applyShowCommand(candidate, command, input, {
      source: ref => DEMOS[ref.id],
      libraries: {},
    })
    if (!outcome.ok) throw new Error(JSON.stringify(outcome.issues))
    candidate = outcome.record
    return outcome
  }
  const corners = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]] as const
  const created = apply('create_layers', {
    schema_version: 1,
    layers: corners.map(([x, y]) => ({
      zone_id: 'zone-1',
      clips: [{
        start_ms: 0,
        duration_ms: 30_000,
        pattern: { kind: 'stock', id: 'CoronalMassEjection' },
        properties: {
          transform: { position_x: x, position_y: y, scale_x: 0.5, scale_y: 0.5 },
          aperture: { enabled: true, x: x + 0.25, y: y + 0.25, width: 0.5, height: 0.5, edge: 'soft', feather: 0.05 },
        },
      }],
    })),
  })
  const layerResults = created.changes[0].details?.layers as Array<{
    clipResults: Array<{ clipId: string }>
  }>
  const clipIds = layerResults.map(layer => layer.clipResults[0].clipId)
  const originalClipIds = [...new Set(current.composition!.scenes.flatMap(scene => (
    scene.zones.flatMap(zone => [
      ...zone.main,
      ...zone.overlays.flatMap(layer => layer.placements),
    ])
  )).map(placement => placement.logicalClipId ?? placement.id))]
  for (const clip_id of originalClipIds) apply('remove_clip', { clip_id })
  apply('remove_overlay_layer', { zone_id: 'zone-1', layer_index: 4 })
  apply('set_show_end', { end_ms: 30_000 })
  for (let index = 0; index < clipIds.length; index += 1) {
    const axis = index % 2
    const next = corners[(index + 1) % corners.length][axis]
    for (const owner of ['transform', 'viewport'] as const) {
      const offset = owner === 'viewport' ? 0.25 : 0
      const coordinate = axis === 0 ? 'x' : 'y'
      const target = owner === 'viewport'
        ? `viewport-${coordinate}`
        : `transform-position-${coordinate}`
      apply('add_property_track', {
        clip_id: clipIds[index],
        target,
        keyframes: [
          { time_ms: 0, value: corners[index][axis] + offset, easing: 'linear' },
          { time_ms: 15_000, value: next + offset, easing: 'linear' },
          { time_ms: 30_000, value: corners[index][axis] + offset, easing: 'linear' },
        ],
      })
    }
  }
  return candidate
}

/** Empty trailing Scene behind an explicit Cut, eligible for exact Show End pruning. */
export function emptyCutSuffixCommandFixture(): ShowRecord {
  const record = showCommandFixture()
  return {
    ...record,
    transitions: [{
      id: 'transition-scene-1',
      afterSceneId: 'scene-1',
      kind: 'cut',
      durationMs: 0,
      easing: { curve: 'linear' },
    }],
  }
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

/** #954 family specimen: existing tracked Show with current exportable stock references. */
export function showOutputLayoutFixture(): ShowRecord {
  const show = trackedCommandFixture()
  show.routingLayouts = [{ id: 'layout-1', name: 'Default', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] } }]
  for (const instance of show.composition!.patternInstances) {
    instance.pattern = { kind: 'stock', id: 'CometLoom' }
    instance.patternName = 'Comet Loom'
  }
  return show
}
