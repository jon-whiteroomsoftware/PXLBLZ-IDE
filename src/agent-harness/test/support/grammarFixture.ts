// Provenance: pxlblz-v3 test/support/grammarFixture.ts at 9ecd481f, re-authored
// onto the version-2 record for #1039 (see src/agent-harness/PROVENANCE.md).
// Shared fixture for the grammar registry and session tests: a minimal
// portable-2d Show — one Zone, one Layer, two consecutive 30 s Clips on stock
// Patterns, one Layout occurrence covering the whole Show. It is authored
// natively in the v2 vocabulary: no Scenes, no cells, and no projection step on
// open.
import type {
  ShowClipV2,
  ShowLayerV2,
  ShowRecordV2,
  ShowTransitionV2,
} from '@/engine/showCompositionV2'
import { openShowDocument, projectClipListing } from '../../grammar/openShow.js'
import type { ShowClipListing, ShowGrammarDocument } from '../../grammar/types.js'

export const FIXTURE_MAIN_LAYER_ID = 'layer:z1:main'
export const FIXTURE_OVERLAY_LAYER_ID = 'layer:z1:over'
export const FIXTURE_FIRST_CLIP_ID = 'clip-1'
export const FIXTURE_SECOND_CLIP_ID = 'clip-2'
export const FIXTURE_OVERLAY_CLIP_ID = 'ov-clip-1'

export interface GrammarFixtureOptions {
  /** Leave the second half of the timeline empty, so it has free space. */
  emptyTail?: boolean
  /** Author a 1 s Crossfade between the two Clips on the Main Layer. */
  boundaryCrossfade?: boolean
  /** Add a second Layer above Main carrying one full-length Clip. */
  overlay?: boolean
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

export function grammarFixtureShow(options: GrammarFixtureOptions = {}): ShowRecordV2 {
  // A Transition's positive duration fills the interval from the outgoing
  // Clip's end to the incoming Clip's nominal start (specification section 5),
  // so the Crossfade variant shortens the outgoing Clip rather than overlapping.
  const firstDurationMs = options.boundaryCrossfade ? 29_000 : 30_000
  const layers: ShowLayerV2[] = [
    { id: FIXTURE_MAIN_LAYER_ID, zoneId: 'z1', name: 'Main', rank: 0 },
    ...(options.overlay ? [{ id: FIXTURE_OVERLAY_LAYER_ID, zoneId: 'z1', name: 'Over', rank: 1 }] : []),
  ]
  const clips: ShowClipV2[] = [
    clip(FIXTURE_FIRST_CLIP_ID, 'inst-1', FIXTURE_MAIN_LAYER_ID, 0, firstDurationMs),
    ...(options.emptyTail ? [] : [clip(FIXTURE_SECOND_CLIP_ID, 'inst-2', FIXTURE_MAIN_LAYER_ID, 30_000, 30_000)]),
    ...(options.overlay ? [clip(FIXTURE_OVERLAY_CLIP_ID, 'inst-3', FIXTURE_OVERLAY_LAYER_ID, 0, 30_000)] : []),
  ]
  const transitions: ShowTransitionV2[] = options.boundaryCrossfade && !options.emptyTail
    ? [{
        id: 'transition-1',
        kind: 'crossfade',
        durationMs: 1_000,
        easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live',
        participants: [{
          id: 'participant-1',
          zoneId: 'z1',
          layerId: FIXTURE_MAIN_LAYER_ID,
          fromClipId: FIXTURE_FIRST_CLIP_ID,
          toClipId: FIXTURE_SECOND_CLIP_ID,
        }],
        propertyRamps: [],
      }]
    : []
  return {
    version: 2,
    id: 'grammar-fixture',
    name: 'Grammar fixture',
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
      patternInstances: [
        { id: 'inst-1', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'inst-2', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } },
        ...(options.overlay
          ? [{ id: 'inst-3', pattern: { kind: 'stock' as const, id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } }]
          : []),
      ],
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

/** Open the fixture for grammar editing. */
export function openGrammarFixture(
  options: GrammarFixtureOptions = {},
): { document: ShowGrammarDocument; listing: ShowClipListing } {
  const opened = openShowDocument(grammarFixtureShow(options))
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  return { document: opened.document, listing: projectClipListing(opened.document) }
}
