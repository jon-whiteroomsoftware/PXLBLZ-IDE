import type {
  ShowCell,
  ShowRecord,
  ShowRoutingLayout,
  ShowRoutingLayoutZone,
  ShowScene,
  ShowZone,
} from './personalContentRecords'

const MATRIX_SIZE = 16
const PIXEL_COUNT = MATRIX_SIZE * MATRIX_SIZE
const ZONE_COLORS = ['#38bdf8', '#f59e0b', '#a78bfa', '#34d399']
const ZONE_NAMES = ['loom-a', 'loom-b', 'loom-c', 'loom-d']

export function createPatternPrismShow(): ShowRecord {
  const scenes: ShowScene[] = [
    { id: 'scene-1', name: 'Full panel', durationMs: 5000 },
    { id: 'scene-2', name: 'Four quadrants', durationMs: 5000 },
    { id: 'scene-3', name: 'Vertical strips', durationMs: 5000 },
    { id: 'scene-4', name: 'Pinwheel weave', durationMs: 5000 },
    { id: 'scene-5', name: 'Full panel return', durationMs: 5000 },
  ]
  const zones: ShowZone[] = ZONE_NAMES.map((name, index) => ({
    id: `zone-${index + 1}`,
    name,
    nominalPixelCount: 64,
    color: ZONE_COLORS[index],
  }))

  return {
    id: 'catalog-pattern-prism',
    name: 'Pattern Prism: One Pattern, Many Layouts',
    scenes,
    zones,
    cells: [ribbonCell(zones[0], scenes[0], scenes.length, zones.length)],
    routingLayouts: [
      fullPanelLayout(zones),
      predicateLayout('layout-quadrants', 'Four quadrants', zones, (x, y) => (
        (y < 8 ? 0 : 2) + (x < 8 ? 0 : 1)
      )),
      predicateLayout('layout-strips', 'Alternating vertical strips', zones, (x) => x % 4),
      predicateLayout('layout-pinwheel', 'Pinwheel interleave', zones, pinwheelArm),
    ],
    routingSwitches: [
      { afterSceneId: 'scene-1', layoutId: 'layout-quadrants' },
      { afterSceneId: 'scene-2', layoutId: 'layout-strips' },
      { afterSceneId: 'scene-3', layoutId: 'layout-pinwheel' },
      { afterSceneId: 'scene-4', layoutId: 'layout-full' },
    ],
    stageMapId: 'plane',
    updatedAt: Date.UTC(2026, 6, 10, 21, 0, 0),
  }
}

export function createAdaptivePatternPrismShow(): ShowRecord {
  const show = createPatternPrismShow()
  const zoneIds = show.zones.map((zone) => zone.id)
  return {
    ...show,
    id: 'catalog-pattern-prism-adaptive',
    name: 'Pattern Prism: Adaptive Layouts',
    routingLayouts: show.routingLayouts.map((layout) => ({
      ...layout,
      logical: layout.id === 'layout-full'
        ? { kind: 'single', zoneIds: [zoneIds[0]] }
        : layout.id === 'layout-quadrants'
          ? { kind: 'grid', zoneIds, columns: 2, rows: 2 }
          : layout.id === 'layout-strips'
            ? { kind: 'stripes', zoneIds, axis: 'x' }
            : { kind: 'pinwheel', zoneIds, twist: Math.PI * 1.35 },
    })),
  }
}

function ribbonCell(zone: ShowZone, scene: ShowScene, sceneSpan: number, zoneSpan: number): ShowCell {
  return {
    id: 'cell-ribbon',
    zoneId: zone.id,
    sceneId: scene.id,
    sceneSpan,
    zoneSpan,
    zoneMode: 'repeat',
    pattern: { kind: 'stock', id: 'RibbonLoom' },
    patternName: 'Ribbon Loom',
    adaptations: {
      mirror: false,
      phase: 0,
      brightness: 1,
      timeScale: 1,
      timeOffsetMs: 0,
    },
  }
}

function fullPanelLayout(zones: ShowZone[]): ShowRoutingLayout {
  return {
    id: 'layout-full',
    name: 'Full panel',
    zones: zones.map((zone, index) => ({
      zoneId: zone.id,
      ranges: index === 0 ? [{ start: 0, end: PIXEL_COUNT - 1 }] : [],
    })),
  }
}

function predicateLayout(
  id: string,
  name: string,
  zones: ShowZone[],
  owner: (x: number, y: number) => number,
): ShowRoutingLayout {
  return {
    id,
    name,
    zones: zones.map((zone, zoneIndex) => ({
      zoneId: zone.id,
      ranges: rangesForPixels(matrixPixels().filter(({ x, y }) => owner(x, y) === zoneIndex).map(({ index }) => index)),
    })),
  }
}

function pinwheelArm(x: number, y: number): number {
  const dx = x - (MATRIX_SIZE - 1) / 2
  const dy = y - (MATRIX_SIZE - 1) / 2
  const angle = Math.atan2(dy, dx)
  const radius = Math.hypot(dx, dy) / MATRIX_SIZE
  const turn = positiveModulo(angle + radius * Math.PI * 1.35, Math.PI * 2)
  return Math.floor(turn / (Math.PI / 2))
}

function matrixPixels(): Array<{ index: number; x: number; y: number }> {
  return Array.from({ length: PIXEL_COUNT }, (_, linear) => {
    const y = Math.floor(linear / MATRIX_SIZE)
    const x = linear % MATRIX_SIZE
    return { x, y, index: serpentineIndex(x, y) }
  })
}

function serpentineIndex(x: number, y: number): number {
  return y * MATRIX_SIZE + (y % 2 === 0 ? x : MATRIX_SIZE - 1 - x)
}

function rangesForPixels(pixels: number[]): ShowRoutingLayoutZone['ranges'] {
  const sorted = [...pixels].sort((a, b) => a - b)
  if (sorted.length === 0) return []
  const ranges: ShowRoutingLayoutZone['ranges'] = []
  let start = sorted[0]
  let end = start
  for (const pixel of sorted.slice(1)) {
    if (pixel === end + 1) {
      end = pixel
    } else {
      ranges.push({ start, end })
      start = pixel
      end = pixel
    }
  }
  ranges.push({ start, end })
  return ranges
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor
}
