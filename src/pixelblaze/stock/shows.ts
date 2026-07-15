import type {
  ShowBoundaryTransition,
  ShowCell,
  ShowClipEffect,
  ShowRecord,
  ShowRoutingLayout,
  ShowScene,
  ShowZone,
} from '@/engine/personalContentRecords'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'

export type StockShowTrack = 'portable' | 'installation'

export interface StockShow {
  id: string
  name: string
  track: StockShowTrack
  lesson: string
  description: string
  show: ShowRecord
}

const UPDATED_AT = 363
const DEFAULT_ADAPTATIONS = { mirror: false, phase: 0, brightness: 1, timeScale: 1 }
const SCENES: Array<Pick<ShowScene, 'id' | 'name' | 'durationMs'>> = [
  { id: 'scene-1', name: 'Establish', durationMs: 6_000 },
  { id: 'scene-2', name: 'Develop', durationMs: 6_000 },
  { id: 'scene-3', name: 'Resolve', durationMs: 6_000 },
]

const PORTABLE_PATTERNS = ['KaleidoBloom', 'MoireCathedral', 'TopographicBloom'] as const
const INSTALLATION_PATTERNS = ['NeonCircuitBoard', 'StainedGlassWeather', 'ShapeShifter'] as const

export const STOCK_SHOWS: StockShow[] = [
  portableShow({
    id: 'stock-show-portable-split',
    name: 'Portable Split',
    lesson: 'One composition, two normalized halves',
    description: 'A moving left/right split introduces resolution-independent logical Zones.',
    mapId: 'plane',
    pixelCount: 1024,
    zoneNames: ['Left', 'Right'],
    logical: { kind: 'split', axis: 'x' },
  }),
  portableShow({
    id: 'stock-show-portable-stripes',
    name: 'Portable Stripes',
    lesson: 'Effects and Property animation across three bands',
    description: 'Three normalized bands add ordered Effects and eased brightness targets.',
    mapId: 'wide',
    pixelCount: 768,
    zoneNames: ['Upper', 'Middle', 'Lower'],
    logical: { kind: 'stripes', axis: 'y' },
    effects: true,
    propertyAnimation: true,
  }),
  portableShow({
    id: 'stock-show-portable-grid',
    name: 'Portable Grid',
    lesson: 'A complete 2x2 composition with a spatial Transition',
    description: 'Four logical quadrants combine a shape reveal, distortions, and visible renderer cost.',
    mapId: 'panel-winding',
    pixelCount: 1024,
    zoneNames: ['Northwest', 'Northeast', 'Southwest', 'Southeast'],
    logical: { kind: 'grid', columns: 2, rows: 2 },
    effects: true,
    spatialTransition: true,
  }),
  installationShow({
    id: 'stock-show-installation-bands',
    name: 'Installation Bands',
    lesson: 'Fixed output with complete physical coverage',
    description: 'Three named LED ranges demonstrate the Installation output contract and coverage rule.',
    zones: [
      ['Canopy', 0, 95],
      ['Core', 96, 175],
      ['Floor', 176, 255],
    ],
  }),
  installationShow({
    id: 'stock-show-installation-routing',
    name: 'Installation Routing Shift',
    lesson: 'Switch physical ownership at a Scene boundary',
    description: 'Two complete physical layouts exchange the Canopy and Floor ranges without changing the Stage map.',
    zones: [
      ['Canopy', 0, 95],
      ['Core', 96, 175],
      ['Floor', 176, 255],
    ],
    alternateLayout: true,
  }),
  installationShow({
    id: 'stock-show-installation-finale',
    name: 'Installation Finale',
    lesson: 'Effects, Property animation, and an expensive boundary',
    description: 'A production-density example combines fixed Zones, ordered Effects, animated targets, and a blended shape reveal.',
    zones: [
      ['Portal', 0, 63],
      ['Columns', 64, 191],
      ['Halo', 192, 255],
    ],
    effects: true,
    propertyAnimation: true,
    spatialTransition: true,
  }),
]

export function stockShowById(id: string | null | undefined): StockShow | undefined {
  return id ? STOCK_SHOWS.find((item) => item.id === id) : undefined
}

function portableShow(input: {
  id: string
  name: string
  lesson: string
  description: string
  mapId: string
  pixelCount: number
  zoneNames: string[]
  logical:
    | { kind: 'split'; axis: 'x' | 'y' }
    | { kind: 'stripes'; axis: 'x' | 'y' }
    | { kind: 'grid'; columns: number; rows: number }
  effects?: boolean
  propertyAnimation?: boolean
  spatialTransition?: boolean
}): StockShow {
  const zones = buildZones(input.zoneNames, input.pixelCount)
  const cells = buildCells(input.id, zones, PORTABLE_PATTERNS, {
    effects: input.effects,
    propertyAnimation: input.propertyAnimation,
  })
  const transitions = buildTransitions(cells, { spatial: input.spatialTransition, propertyAnimation: input.propertyAnimation })
  const scenes = buildScenes(transitions)
  const logical = input.logical.kind === 'split'
    ? { ...input.logical, zoneIds: zones.slice(0, 2).map((zone) => zone.id) as [string, string] }
    : input.logical.kind === 'grid'
      ? { ...input.logical, zoneIds: zones.map((zone) => zone.id) }
      : { ...input.logical, zoneIds: zones.map((zone) => zone.id) }
  const show: ShowRecord = {
    id: input.id,
    name: input.name,
    scenes,
    zones,
    cells,
    routingLayouts: [{ id: 'layout-1', name: 'Normalized layout', zones: [], logical }],
    routingSwitches: [],
    transitions,
    stageMapId: input.mapId,
    outputContract: createPortableShowOutputContract({
      referenceMapId: input.mapId,
      referencePixelCount: input.pixelCount,
    }),
    updatedAt: UPDATED_AT,
  }
  return { id: input.id, name: input.name, track: 'portable', lesson: input.lesson, description: input.description, show }
}

function installationShow(input: {
  id: string
  name: string
  lesson: string
  description: string
  zones: Array<[name: string, start: number, end: number]>
  alternateLayout?: boolean
  effects?: boolean
  propertyAnimation?: boolean
  spatialTransition?: boolean
}): StockShow {
  const zones: ShowZone[] = input.zones.map(([name, start, end], index) => ({
    id: `zone-${index + 1}`,
    name,
    nominalPixelCount: end - start + 1,
    color: zoneColor(index),
  }))
  const cells = buildCells(input.id, zones, INSTALLATION_PATTERNS, {
    effects: input.effects,
    propertyAnimation: input.propertyAnimation,
  })
  const transitions = buildTransitions(cells, { spatial: input.spatialTransition, propertyAnimation: input.propertyAnimation })
  const scenes = buildScenes(transitions)
  const primary = physicalLayout('layout-1', 'Physical groups', zones, input.zones)
  const alternate = input.alternateLayout
    ? physicalLayout('layout-2', 'Swapped groups', zones, [input.zones[2], input.zones[1], input.zones[0]])
    : null
  if (alternate) {
    transitions.push({
      id: 'routing-scene-2',
      afterSceneId: 'scene-2',
      kind: 'routing',
      durationMs: 0,
      easing: { curve: 'linear' },
      layoutId: alternate.id,
    })
  }
  const show: ShowRecord = {
    id: input.id,
    name: input.name,
    scenes,
    zones,
    cells,
    routingLayouts: alternate ? [primary, alternate] : [primary],
    routingSwitches: alternate ? [{ afterSceneId: 'scene-2', layoutId: alternate.id }] : [],
    transitions,
    stageMapId: 'plane',
    outputContract: createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 256 }),
    updatedAt: UPDATED_AT,
  }
  return { id: input.id, name: input.name, track: 'installation', lesson: input.lesson, description: input.description, show }
}

function buildZones(names: string[], totalPixels: number): ShowZone[] {
  const base = Math.floor(totalPixels / names.length)
  return names.map((name, index) => ({
    id: `zone-${index + 1}`,
    name,
    nominalPixelCount: index === names.length - 1 ? totalPixels - base * index : base,
    color: zoneColor(index),
  }))
}

function buildCells(
  showId: string,
  zones: ShowZone[],
  patterns: readonly string[],
  options: { effects?: boolean; propertyAnimation?: boolean },
): ShowCell[] {
  return zones.flatMap((zone, zoneIndex) => SCENES.map((scene, sceneIndex) => {
    const id = `${showId}-cell-${zoneIndex + 1}-${sceneIndex + 1}`
    const patternName = patterns[(zoneIndex + sceneIndex) % patterns.length]
    const effects: ShowClipEffect[] | undefined = options.effects
      ? [
          { id: `${id}-color`, kind: 'hue', turns: (zoneIndex + sceneIndex) * 0.08 },
          ...(sceneIndex === 1 ? [{ id: `${id}-scale`, kind: 'scale' as const, x: 0.82, y: 0.82 }] : []),
        ]
      : undefined
    return {
      id,
      zoneId: zone.id,
      sceneId: scene.id,
      sceneSpan: 1,
      pattern: { kind: 'stock', id: patternName },
      patternName,
      adaptations: {
        ...DEFAULT_ADAPTATIONS,
        brightness: options.propertyAnimation ? [0.62, 1, 0.78][sceneIndex] : 1,
        timeScale: options.propertyAnimation ? [0.7, 1.35, 0.9][sceneIndex] : 1,
      },
      restartOnEntry: false,
      ...(effects ? { effects } : {}),
    }
  }))
}

function buildTransitions(
  cells: ShowCell[],
  options: { spatial?: boolean; propertyAnimation?: boolean },
): ShowBoundaryTransition[] {
  const first: ShowBoundaryTransition = options.spatial
    ? {
        id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'portal', durationMs: 1_200,
        easing: { curve: 'sine', direction: 'in-out' }, shape: 'circle', centerX: 0.5, centerY: 0.5,
        scale: 1, feather: 0.1, edgePolicy: 'blend', featherPolicy: 'blend',
      }
    : {
        id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'crossfade', durationMs: 900,
        easing: { curve: 'sine', direction: 'in-out' },
      }
  const second: ShowBoundaryTransition = {
    id: 'transition-scene-2', afterSceneId: 'scene-2', kind: 'wipe', durationMs: 900,
    easing: { curve: 'cubic', direction: 'in-out' }, direction: 0, feather: 0.08, edgePolicy: 'dither',
  }
  if (options.propertyAnimation) {
    for (const transition of [first, second]) {
      const destinationSceneId = transition.afterSceneId === 'scene-1' ? 'scene-2' : 'scene-3'
      const destinationCells = cells.filter((cell) => cell.sceneId === destinationSceneId)
      transition.propertyTransitions = {
        brightness: {
          fromByCellId: Object.fromEntries(destinationCells.map((cell) => [cell.id, transition.afterSceneId === 'scene-1' ? 0.62 : 1])),
          durationMs: transition.durationMs,
          easing: transition.easing,
        },
        timeScale: {
          fromByCellId: Object.fromEntries(destinationCells.map((cell) => [cell.id, transition.afterSceneId === 'scene-1' ? 0.7 : 1.35])),
          durationMs: transition.durationMs,
          easing: transition.easing,
        },
      }
    }
  }
  return [first, second]
}

function buildScenes(transitions: ShowBoundaryTransition[]): ShowScene[] {
  return SCENES.map((scene) => {
    const transition = transitions.find((candidate) => candidate.afterSceneId === scene.id && candidate.kind !== 'routing')
    return {
      ...scene,
      ...(transition
        ? {
            transitionOut: {
              kind: transition.kind as NonNullable<ShowScene['transitionOut']>['kind'],
              durationMs: transition.durationMs,
              color: transition.color,
              direction: transition.direction,
              feather: transition.feather,
              centerX: transition.centerX,
              centerY: transition.centerY,
              featherPolicy: transition.featherPolicy,
              shape: transition.shape,
              scale: transition.scale,
              edgePolicy: transition.edgePolicy,
            },
          }
        : {}),
    }
  })
}

function physicalLayout(
  id: string,
  name: string,
  zones: ShowZone[],
  ranges: Array<[name: string, start: number, end: number]>,
): ShowRoutingLayout {
  return {
    id,
    name,
    zones: zones.map((zone, index) => ({
      zoneId: zone.id,
      ranges: [{ start: ranges[index][1], end: ranges[index][2] }],
    })),
  }
}

function zoneColor(index: number): string {
  return ['#38bdf8', '#f97316', '#a78bfa', '#22c55e'][index % 4]
}
