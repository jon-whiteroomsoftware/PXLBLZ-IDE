/** Synthetic square-map Shows for workspace sizing and visual proof (#977). */
export function squareWorkspaceShow(laneCount: number) {
  const colors = ['#38bdf8', '#f97316', '#8b5cf6', '#22c55e', '#ec4899', '#eab308']
  const zones = Array.from({ length: laneCount }, (_, index) => ({
    id: `zone-${index + 1}`,
    name: `Zone ${index + 1}`,
    nominalPixelCount: Math.floor((index + 1) * 1024 / laneCount) - Math.floor(index * 1024 / laneCount),
    color: colors[index % colors.length],
  }))
  return {
    id: `workspace-square-${laneCount}`,
    name: `Square workspace - ${laneCount} lanes`,
    scenes: [{ id: 'scene-1', name: 'Scene 1', durationMs: 30_000 }],
    zones,
    cells: zones.map((zone, index) => ({
      id: `cell-${index + 1}`,
      zoneId: zone.id,
      sceneId: 'scene-1',
      sceneSpan: 1,
      pattern: { kind: 'stock', id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      restartOnEntry: false,
    })),
    routingLayouts: [{
      id: 'layout-1', name: 'Default',
      zones: zones.map((zone, index) => ({
        zoneId: zone.id,
        ranges: [{ start: Math.floor(index * 1024 / laneCount), end: Math.floor((index + 1) * 1024 / laneCount) - 1 }],
      })),
    }],
    routingSwitches: [],
    transitions: [],
    stageMapId: 'plane',
    outputContract: { version: 1, kind: 'installation', outputMapId: 'plane', pixelCount: 1024, resolution: 'fixed' },
    updatedAt: 1_788_768_000_000,
  }
}
