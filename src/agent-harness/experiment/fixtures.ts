// Provenance: pxlblz-v3 src/experiment/fixtures.ts at 9ecd481f, re-authored onto
// the version-2 record for #1039 (see src/agent-harness/PROVENANCE.md).
// Named starting Shows for the dictation corpus. Deliberately the same shape the
// grammar test fixture uses: a minimal portable-2d Show, one Zone, one Main
// Layer, stock Patterns only, one Layout occurrence covering the whole Show.
// Variants add the structures cases need.
//
// Every fixture is authored natively in the v2 vocabulary. There are no Scenes:
// the former `empty-second-scene` variant is `empty-tail`, which leaves the
// second half of the timeline free, and the former overlay index is a second
// Zone-owned Layer with its own name and rank.
import type { ShowPatternInstance } from '@/engine/personalContentRecords'
import type { ShowClipV2, ShowLayerV2, ShowRecordV2, ShowTransitionV2 } from '@/engine/showCompositionV2'
import type { FixtureName } from './corpus.js'

export const MAIN_LAYER_ID = 'layer-main'
export const OVERLAY_LAYER_ID = 'layer-over'

function stockInstance(id: string, patternId: string): ShowPatternInstance {
  return {
    id,
    pattern: { kind: 'stock', id: patternId },
    patternName: patternId,
    time: { timeScale: 1, timeOffsetMs: 0 },
  }
}

function clip(
  id: string,
  instanceId: string,
  layerId: string,
  startMs: number,
  durationMs: number,
): ShowClipV2 {
  return {
    id,
    instanceId,
    zoneId: 'z1',
    layerId,
    startMs,
    durationMs,
    entryPolicy: 'continue',
    zoneSampleMode: 'independent',
    appearance: {
      keys: [{
        id: `${id}:appearance:1`,
        timeMs: startMs,
        value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
      }],
    },
  }
}

export function dictationFixture(name: FixtureName): ShowRecordV2 {
  const overlay = name === 'overlay'
  const crossfade = name === 'boundary-crossfade'
  const layers: ShowLayerV2[] = [
    { id: MAIN_LAYER_ID, zoneId: 'z1', name: 'Main', rank: 0 },
    ...(overlay ? [{ id: OVERLAY_LAYER_ID, zoneId: 'z1', name: 'Over', rank: 1 }] : []),
  ]

  let instances: ShowPatternInstance[]
  let clips: ShowClipV2[]
  if (name === 'four-clips') {
    // Four consecutive 10 s Clips, each on its own runtime, so a case can move,
    // resize or delete one without changing what another renders.
    instances = [0, 1, 2, 3].map((index) => stockInstance(`inst-${index + 1}`, 'CometLoom'))
    clips = [0, 1, 2, 3].map((index) =>
      clip(`clip-${index + 1}`, `inst-${index + 1}`, MAIN_LAYER_ID, index * 10_000, 10_000))
  } else if (name === 'empty-tail') {
    instances = [stockInstance('inst-1', 'CometLoom')]
    clips = [clip('clip-1', 'inst-1', MAIN_LAYER_ID, 0, 30_000)]
  } else {
    // A Transition's positive duration fills the interval from the outgoing
    // Clip's end to the incoming Clip's nominal start (specification section 5).
    const firstDurationMs = crossfade ? 29_000 : 30_000
    instances = [
      stockInstance('inst-1', 'CometLoom'),
      stockInstance('inst-2', 'TestPattern1D'),
      ...(overlay ? [stockInstance('inst-3', 'CometLoom')] : []),
    ]
    clips = [
      clip('clip-1', 'inst-1', MAIN_LAYER_ID, 0, firstDurationMs),
      clip('clip-2', 'inst-2', MAIN_LAYER_ID, 30_000, 30_000),
      ...(overlay ? [clip('ov-clip-1', 'inst-3', OVERLAY_LAYER_ID, 0, 30_000)] : []),
    ]
  }

  const transitions: ShowTransitionV2[] = crossfade
    ? [{
        id: 'transition-1',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live',
        participants: [{
          id: 'participant-1',
          zoneId: 'z1',
          layerId: MAIN_LAYER_ID,
          fromClipId: 'clip-1',
          toClipId: 'clip-2',
        }],
        propertyRamps: [],
      }]
    : []

  return {
    version: 2,
    id: 'dictation-fixture',
    name: 'Dictation fixture',
    zones: [{ id: 'z1', name: 'Main', nominalPixelCount: 64 }],
    zoneLayouts: [
      { id: 'l1', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } },
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
      showEndMs: 60_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: instances,
      layers,
      clips,
      transitions,
      layoutOccurrences: [
        { id: 'layout-1', layoutId: 'l1', startMs: 0, durationMs: 60_000, parameters: {} },
      ],
      propertyTracks: [],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 0,
  }
}

/**
 * Setup operations shared by fixture variants that need composed structure.
 *
 * Every v2 fixture above is authored complete, so none is needed. The hook stays
 * because a case may still declare its own `setup` steps, which run through the
 * same catalogue as its script.
 */
export function fixtureSetup(_name: FixtureName): Array<{ operation: string; args: Record<string, unknown> }> {
  return []
}
