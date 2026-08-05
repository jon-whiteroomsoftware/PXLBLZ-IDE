// A fixed four-Zone Installation composition used by compiler regression tests.
//
// This shape used to be borrowed from the stock Learn catalogue, which meant
// recasting a lesson silently changed what the compiler tests measured (#363).
// The fixture now lives here so Pattern casting stays a curriculum decision and
// slot sharing, prologue hoisting, and option forwarding keep a stable subject:
// twelve logical members over four Zones, two of which are exact duplicates and
// therefore reclaimable.
import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowStructuredEasing,
  ShowZone,
} from './personalContentRecords'
import { createInstallationShowOutputContract } from './showOutputContract'

const SINE_IN_OUT: ShowStructuredEasing = { curve: 'sine', direction: 'in-out' }
const CUBIC_IN_OUT: ShowStructuredEasing = { curve: 'cubic', direction: 'in-out' }

const COLORS = ['#38bdf8', '#f97316', '#a78bfa', '#22c55e']

type FixtureClip = {
  zoneId: string
  pattern: string
  timeScale: number
  brightness: number
  effects?: ShowCell['effects']
}

type FixtureScene = {
  id: string
  name: string
  seconds: number
  clips: FixtureClip[]
}

const ZONE_NAMES = ['Top pair', 'Upper middle', 'Lower middle', 'Bottom pair']
const ZONE_RANGES: Array<Array<[number, number]>> = [
  [[0, 19], [80, 99]],
  [[20, 39], [100, 119]],
  [[40, 59], [120, 139]],
  [[60, 79], [140, 159]],
]

const SCENES: FixtureScene[] = [
  {
    id: 'wake', name: 'Wake', seconds: 10,
    clips: [
      { zoneId: 'zone-1', pattern: 'EasedSweep', timeScale: 0.35, brightness: 0.72 },
      { zoneId: 'zone-2', pattern: 'Caustics', timeScale: 0.35, brightness: 0.72 },
      { zoneId: 'zone-3', pattern: 'Caustics', timeScale: 0.35, brightness: 0.72 },
      { zoneId: 'zone-4', pattern: 'EasedSweep', timeScale: 0.35, brightness: 0.72 },
    ],
  },
  {
    id: 'answer', name: 'Answer', seconds: 10,
    clips: [
      { zoneId: 'zone-1', pattern: 'CompassRose', timeScale: 0.3, brightness: 1 },
      { zoneId: 'zone-2', pattern: 'ClockworkIris', timeScale: 0.3, brightness: 1, effects: [{ id: 'hue-plus', kind: 'hue', turns: 0.08 }] },
      { zoneId: 'zone-3', pattern: 'ClockworkIris', timeScale: 0.3, brightness: 1, effects: [{ id: 'hue-minus', kind: 'hue', turns: -0.08 }] },
      { zoneId: 'zone-4', pattern: 'CompassRose', timeScale: 0.3, brightness: 1 },
    ],
  },
  {
    id: 'settle', name: 'Settle', seconds: 10,
    clips: [
      { zoneId: 'zone-1', pattern: 'TopographicBloom', timeScale: 0.26, brightness: 0.78, effects: [{ id: 'scale-top', kind: 'scale', x: 0.86, y: 0.86 }] },
      { zoneId: 'zone-2', pattern: 'Caustics', timeScale: 0.26, brightness: 0.78 },
      { zoneId: 'zone-3', pattern: 'Caustics', timeScale: 0.26, brightness: 0.78 },
      { zoneId: 'zone-4', pattern: 'TopographicBloom', timeScale: 0.26, brightness: 0.78, effects: [{ id: 'scale-bottom', kind: 'scale', x: 0.86, y: 0.86 }] },
    ],
  },
]

// Two boundaries carrying brightness ramps. They are not incidental: they are
// most of what puts this fixture just under the device activation ceiling,
// which is the condition the emission-diet assertions actually measure.
function brightnessBoundary(
  afterSceneId: string,
  kind: 'wipe' | 'crossfade',
  durationMs: number,
  easing: ShowStructuredEasing,
  destination: FixtureScene,
  from: number,
  extra: Partial<ShowBoundaryTransition> = {},
): ShowBoundaryTransition {
  return {
    id: `transition-${afterSceneId}`, afterSceneId, kind, durationMs, easing,
    ...extra,
    propertyTransitions: {
      ...extra.propertyTransitions,
      brightness: {
        fromByCellId: Object.fromEntries(
          destination.clips.map((item) => [`cell-${destination.id}-${item.zoneId}`, from]),
        ),
        durationMs, easing,
      },
    },
  }
}

export function createInstallationCompositionFixture(): ShowRecord {
  const zones: ShowZone[] = ZONE_NAMES.map((name, index) => ({
    id: `zone-${index + 1}`, name, nominalPixelCount: 40, color: COLORS[index % COLORS.length],
  }))
  const scenes: ShowScene[] = SCENES.map((item) => ({
    id: item.id, name: item.name, durationMs: item.seconds * 1_000,
  }))
  const cells: ShowCell[] = SCENES.flatMap((item) => item.clips.map((source) => ({
    id: `cell-${item.id}-${source.zoneId}`,
    zoneId: source.zoneId,
    sceneId: item.id,
    sceneSpan: 1,
    pattern: { kind: 'stock' as const, id: source.pattern },
    patternName: source.pattern,
    adaptations: { mirror: false, phase: 0, brightness: source.brightness, timeScale: source.timeScale },
    restartOnEntry: false,
    ...(source.effects ? { effects: source.effects } : {}),
  })))
  const layout: ShowRoutingLayout = {
    id: 'layout-row-pairs',
    name: 'Row pairs',
    zones: zones.map((zone, index) => ({
      zoneId: zone.id,
      ranges: ZONE_RANGES[index].map(([start, end]) => ({ start, end })),
    })),
  }
  return {
    id: 'fixture-installation-composition',
    name: 'Installation Composition Fixture',
    scenes,
    zones,
    cells,
    routingLayouts: [layout],
    transitions: [
      brightnessBoundary('wake', 'wipe', 1_500, CUBIC_IN_OUT, SCENES[1], 0.72, {
        direction: 0.75, feather: 0.08, edgePolicy: 'dither',
      }),
      brightnessBoundary('answer', 'crossfade', 2_000, SINE_IN_OUT, SCENES[2], 1),
    ],
    stageMapId: 'proscenium-stage-2d',
    outputContract: createInstallationShowOutputContract({ outputMapId: 'proscenium-stage-2d', pixelCount: 160 }),
    updatedAt: 363,
  }
}
