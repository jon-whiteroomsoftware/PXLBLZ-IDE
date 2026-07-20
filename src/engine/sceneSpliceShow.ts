import type { ShowCell, ShowRecord, ShowScene } from './personalContentRecords'
import { createInstallationShowOutputContract } from './showOutputContract'

const DEFAULT_ADAPTATIONS = {
  mirror: false,
  phase: 0,
  brightness: 1,
  timeScale: 1,
  timeOffsetMs: 0,
} as const

export function createSceneSpliceShow(): ShowRecord {
  const scenes: ShowScene[] = [
    {
      id: 'scene-1',
      name: 'Heat shimmer',
      durationMs: 3500,
    },
    {
      id: 'scene-2',
      name: 'Neon circuitry',
      durationMs: 3500,
    },
    { id: 'scene-3', name: 'Heat shimmer return', durationMs: 3500 },
  ]

  return {
    id: 'catalog-scene-splice-showcase',
    name: 'Scene Splice Showcase',
    scenes,
    zones: [{ id: 'zone-1', name: 'main', nominalPixelCount: 256, color: '#38bdf8' }],
    cells: [
      patternCell('cell-heat-a', scenes[0], 'HeatShimmerTiles', 'Heat Shimmer Tiles'),
      patternCell('cell-neon', scenes[1], 'NeonCircuitBoard', 'Neon Circuit Board'),
      patternCell('cell-heat-b', scenes[2], 'HeatShimmerTiles', 'Heat Shimmer Tiles'),
    ],
    routingLayouts: [],
    transitions: [
      {
        id: 'transition-scene-1',
        afterSceneId: 'scene-1',
        kind: 'portal',
        durationMs: 3000,
        easing: { curve: 'linear' },
        centerX: 0.5,
        centerY: 0.5,
        feather: 0.14,
        revealMode: 'grow-incoming',
        featherPolicy: 'blend',
      },
      {
        id: 'transition-scene-2',
        afterSceneId: 'scene-2',
        kind: 'portal',
        durationMs: 2600,
        easing: { curve: 'linear' },
        centerX: 0.28,
        centerY: 0.68,
        feather: 0.08,
        revealMode: 'shrink-outgoing',
        featherPolicy: 'dither',
      },
    ],
    stageMapId: 'plane',
    outputContract: createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }),
    updatedAt: Date.UTC(2026, 6, 10, 22, 0, 0),
  }
}

function patternCell(
  id: string,
  scene: ShowScene,
  patternId: string,
  patternName: string,
): ShowCell {
  return {
    id,
    zoneId: 'zone-1',
    sceneId: scene.id,
    sceneSpan: 1,
    pattern: { kind: 'stock', id: patternId },
    patternName,
    adaptations: { ...DEFAULT_ADAPTATIONS },
  }
}
