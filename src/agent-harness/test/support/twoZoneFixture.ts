// The two-Zone referent fixtures, authored natively in the version-2
// vocabulary (#1039).
//
// The three referent suites (`junctionZoneReference`, `referenceArgumentOrder`,
// `referenceNearestRanking`) each built the same Scene-shaped two-Zone Show.
// v2 has no Scenes, so the shared shape is stated once here: two Zones, one
// Layer each, Clips laid out in global time, and one Layout occurrence covering
// the Show. A derived Cut junction appears wherever two Clips on one Layer
// touch exactly, which is what these suites resolve against.
import type { ShowPatternInstance } from '@/engine/personalContentRecords'
import type { ShowClipV2, ShowLayerV2, ShowRecordV2 } from '@/engine/showCompositionV2'

export const LEFT_LAYER_ID = 'layer-left'
export const RIGHT_LAYER_ID = 'layer-right'

function clip(
  id: string,
  instanceId: string,
  zoneId: string,
  layerId: string,
  startMs: number,
  durationMs: number,
): ShowClipV2 {
  return {
    id,
    instanceId,
    zoneId,
    layerId,
    startMs,
    durationMs,
    entryPolicy: 'continue',
    // `span` is the catalogue's own default for a created Clip, so the fixture
    // and anything a suite adds to it lower the same way.
    zoneSampleMode: 'span',
    appearance: {
      keys: [{
        id: `${id}-appearance`,
        timeMs: startMs,
        value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
      }],
    },
  }
}

function instance(id: string, patternId: string): ShowPatternInstance {
  return {
    id,
    pattern: { kind: 'stock', id: patternId },
    patternName: patternId,
    time: { timeScale: 1, timeOffsetMs: 0 },
  }
}

const LAYERS: ShowLayerV2[] = [
  { id: LEFT_LAYER_ID, zoneId: 'z1', name: 'Main', rank: 0 },
  { id: RIGHT_LAYER_ID, zoneId: 'z2', name: 'Main', rank: 0 },
]

function record(
  id: string,
  name: string,
  showEndMs: number,
  patternInstances: ShowPatternInstance[],
  clips: ShowClipV2[],
): ShowRecordV2 {
  return {
    version: 2,
    id,
    name,
    zones: [
      { id: 'z1', name: 'Left', nominalPixelCount: 32 },
      { id: 'z2', name: 'Right', nominalPixelCount: 32 },
    ],
    zoneLayouts: [
      { id: 'l1', name: 'Split', zones: [], logical: { kind: 'split', zoneIds: ['z1', 'z2'], axis: 'x' } },
    ],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 256,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs,
      sampleRemap: { repeatScale: 1 },
      patternInstances,
      layers: LAYERS,
      clips,
      transitions: [],
      layoutOccurrences: [{ id: 'interval-1', layoutId: 'l1', startMs: 0, durationMs: showEndMs, parameters: {} }],
      propertyTracks: [],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 0,
  }
}

/**
 * Two Zones, each carrying two exactly adjacent 30 s Clips. Every Layer already
 * holds a derived Cut at 30 s; the suites add one at 15 s where they need a
 * Zone to differ from its neighbour.
 */
export function twoZoneShowV2(): ShowRecordV2 {
  return record('two-zone-fixture', 'Two Zones', 60_000, [
    instance('inst-left-1', 'CometLoom'),
    instance('inst-left-2', 'TestPattern1D'),
    instance('inst-right-1', 'CometLoom'),
    instance('inst-right-2', 'TestPattern1D'),
  ], [
    clip('c1', 'inst-left-1', 'z1', LEFT_LAYER_ID, 0, 30_000),
    clip('c2', 'inst-left-2', 'z1', LEFT_LAYER_ID, 30_000, 30_000),
    clip('c3', 'inst-right-1', 'z2', RIGHT_LAYER_ID, 0, 30_000),
    clip('c4', 'inst-right-2', 'z2', RIGHT_LAYER_ID, 30_000, 30_000),
  ])
}

/**
 * Two Zones over a 120 s Show, each with one uncut Clip. The nearest-ranking
 * suite cuts the Left Zone into eleven Clips and leaves the Right Zone whole.
 */
export function longTwoZoneShowV2(): ShowRecordV2 {
  return record('late-junction-fixture', 'Late junction', 120_000, [
    instance('inst-left-1', 'CometLoom'),
    instance('inst-right-1', 'TestPattern1D'),
  ], [
    clip('c1', 'inst-left-1', 'z1', LEFT_LAYER_ID, 0, 120_000),
    clip('c2', 'inst-right-1', 'z2', RIGHT_LAYER_ID, 0, 120_000),
  ])
}
