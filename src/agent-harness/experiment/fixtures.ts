// Provenance: pxlblz-v3 src/experiment/fixtures.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Named starting Shows for the dictation corpus (#23). Deliberately the same
// shape the grammar test fixture uses: a minimal portable-2d Show, two 30 s
// Scenes, one Zone, stock patterns only. Variants add the structures cases
// need; anything richer is composed per case through setup operations.
import type { ShowRecord } from '@/engine/personalContentRecords'

export type FixtureName =
  | 'base'
  | 'empty-second-scene'
  | 'overlay'
  | 'boundary-crossfade'
  | 'four-clips'

export function dictationFixture(name: FixtureName): ShowRecord {
  // four-clips starts from the empty-second-scene shape; its four
  // consecutive 10 s clips are produced by fixtureSetup operations.
  const emptySecondScene = name === 'empty-second-scene' || name === 'four-clips'
  const cells = [
    {
      id: 'c1',
      zoneId: 'z1',
      sceneId: 's1',
      sceneSpan: 1,
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
    },
    ...(emptySecondScene
      ? []
      : [{
          id: 'c2',
          zoneId: 'z1',
          sceneId: 's2',
          sceneSpan: 1,
          pattern: { kind: 'stock', id: 'TestPattern1D' },
          patternName: 'TestPattern1D',
          adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
        }]),
  ]
  const record = {
    id: 'dictation-fixture',
    name: 'Dictation fixture',
    updatedAt: 0,
    scenes: [
      { id: 's1', name: 'Opening', durationMs: 30_000 },
      { id: 's2', name: 'Closing', durationMs: 30_000 },
    ],
    zones: [{ id: 'z1', name: 'Main', nominalPixelCount: 64 }],
    cells,
    routingLayouts: [
      { id: 'l1', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } },
    ],
    transitions: name === 'boundary-crossfade'
      ? [{
          id: 'transition-s1',
          afterSceneId: 's1',
          kind: 'crossfade',
          durationMs: 1_000,
          easing: { curve: 'linear' },
          crossfadePolicy: 'snapshot-live',
        }]
      : [],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 256,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
  }
  return record as unknown as ShowRecord
}

/** Setup operations shared by fixture variants that need composed structure. */
export function fixtureSetup(name: FixtureName): Array<{ operation: string; args: Record<string, unknown> }> {
  if (name === 'overlay') {
    return [
      { operation: 'add_overlay_layer', args: { zone_id: 'z1' } },
      {
        operation: 'add_clip',
        args: {
          zone_id: 'z1',
          start_ms: 0,
          duration_ms: 30_000,
          pattern_kind: 'stock',
          pattern_id: 'CometLoom',
          overlay_layer_index: 0,
        },
      },
    ]
  }
  if (name === 'four-clips') {
    return [
      { operation: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 10_000 } },
      ...[10_000, 20_000, 30_000].map((startMs) => ({
        operation: 'add_clip',
        args: {
          zone_id: 'z1',
          start_ms: startMs,
          duration_ms: 10_000,
          pattern_kind: 'stock',
          pattern_id: 'CometLoom',
        },
      })),
    ]
  }
  return []
}
