import type { ShowRecord } from '../engine/personalContentRecords'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
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

/** The v2 candidate that the former four-Layer command sequence produced. */
export function fourLayerShowEndV2Candidate(before: ShowRecordV2): ShowRecordV2 {
  const candidate = structuredClone(before)
  const corners = [[-0.25, -0.25], [0.25, -0.25], [0.25, 0.25], [-0.25, 0.25]] as const
  const zoneId = 'zone-1'
  const layers = Array.from({ length: 4 }, (_, index) => ({
    id: `layer:${zoneId}:overlay:${index + 1}`,
    zoneId,
    name: `Layer ${index + 2}`,
    rank: index + 1,
  }))
  candidate.composition.showEndMs = 30_000
  candidate.composition.layers = [
    { id: `layer:${zoneId}:main`, zoneId, name: 'Main', rank: 0 },
    ...layers,
  ]
  candidate.composition.transitions = []
  candidate.composition.layoutOccurrences = candidate.composition.layoutOccurrences.map(occurrence => ({
    ...occurrence, durationMs: 30_000,
  }))
  candidate.composition.markers = candidate.composition.markers.filter(marker => marker.timeMs < 30_000)
  candidate.composition.clips = corners.map(([x, y], index) => {
    const id = `four-layer-clip-${index + 1}`
    return {
      id,
      instanceId: `four-layer-instance-${index + 1}`,
      zoneId,
      layerId: layers[3 - index].id,
      startMs: 0,
      durationMs: 30_000,
      entryPolicy: 'continue' as const,
      zoneSampleMode: 'span' as const,
      appearance: { keys: [{
        id: `${id}:appearance:1`,
        timeMs: 0,
        value: {
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
          transform: { positionX: x, positionY: y, rotation: 0, scaleX: 0.5, scaleY: 0.5 },
          aperture: { enabled: true, x: x + 0.25, y: y + 0.25, width: 0.5, height: 0.5, edge: 'soft' as const, feather: 0.05 },
          effects: [],
        },
      }] },
    }
  }).sort((a, b) => a.id.localeCompare(b.id))
  candidate.composition.patternInstances = candidate.composition.clips.map(clip => ({
    id: clip.instanceId,
    pattern: { kind: 'stock' as const, id: 'CoronalMassEjection' },
    patternName: 'CoronalMassEjection',
    time: { timeScale: 1, timeOffsetMs: 0 },
  })).sort((a, b) => a.id.localeCompare(b.id))
  candidate.composition.propertyTracks = candidate.composition.clips.flatMap(clip => {
    const index = corners.findIndex(([x, y]) => (
      clip.appearance.keys[0].value.transform?.positionX === x
      && clip.appearance.keys[0].value.transform?.positionY === y
    ))
    const axis = index % 2
    const coordinate = axis === 0 ? 'x' : 'y'
    const start = corners[index][axis]
    const next = corners[(index + 1) % corners.length][axis]
    return (['transform', 'aperture'] as const).map(owner => {
      const property = owner === 'transform' ? (axis === 0 ? 'positionX' : 'positionY') : coordinate
      const kind = owner === 'transform' ? 'clip-transform' : 'clip-aperture'
      const offset = owner === 'aperture' ? 0.25 : 0
      return {
        id: `four-layer-track-${index + 1}-${owner}`,
        target: { kind, clipId: clip.id, property },
        keyframes: [start, next, start].map((value, keyIndex) => ({
          id: `four-layer-key-${index + 1}-${owner}-${keyIndex + 1}`,
          timeMs: keyIndex * 15_000,
          value: value + offset,
          easing: { curve: 'linear' as const },
        })),
        activeStartMs: 0,
        activeDurationMs: 30_000,
      }
    })
  }).sort((a, b) => a.id.localeCompare(b.id)) as ShowRecordV2['composition']['propertyTracks']
  return candidate
}
