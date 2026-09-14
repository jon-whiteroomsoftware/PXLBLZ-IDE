import { applyShowCommand } from '../engine/showCommands/registry'
import type { ShowRecord } from '../engine/personalContentRecords'
import { DEMOS } from '../pixelblaze/stock/patterns'
import { showCommandFixture } from './showCommandFixture'

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
