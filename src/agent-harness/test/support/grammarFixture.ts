// Provenance: pxlblz-v3 test/support/grammarFixture.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Shared fixture for the grammar registry and session tests: a minimal
// portable-2d Show in the flat shape (two 30 s Scenes, one Zone, one stock
// clip per Scene). openShowDocument normalizes it to the composition shape,
// which is where every grammar operation runs. openGrammarFixture can add an
// overlay clip, because source-over opacity (the owner example's target) is
// owned by overlay placements only.
import type { ShowCompositionV1, ShowRecord } from '@/engine/personalContentRecords'
import { addShowOverlayClip, addShowOverlayLayer } from '@/engine/showCompositionModel'
import { openShowDocument, projectClipListing } from '../../grammar/openShow.js'
import type { ShowClipListing, ShowGrammarDocument } from '../../grammar/types.js'

export interface GrammarFixtureOptions {
  /** Leave Scene 2's main layer empty, so the timeline has free space. */
  emptySecondScene?: boolean
  /** Author a 1 s crossfade boundary Transition after Scene 1. */
  boundaryCrossfade?: boolean
}

export function grammarFixtureShow(options: GrammarFixtureOptions = {}): ShowRecord {
  return {
    id: 'grammar-fixture',
    name: 'Grammar fixture',
    updatedAt: 0,
    scenes: [
      { id: 's1', name: 'Opening', durationMs: 30_000 },
      { id: 's2', name: 'Closing', durationMs: 30_000 },
    ],
    zones: [{ id: 'z1', name: 'Main', nominalPixelCount: 64 }],
    cells: [
      {
        id: 'c1',
        zoneId: 'z1',
        sceneId: 's1',
        sceneSpan: 1,
        pattern: { kind: 'stock', id: 'CometLoom' },
        patternName: 'CometLoom',
        adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      },
      ...(options.emptySecondScene ? [] : [{
        id: 'c2',
        zoneId: 'z1',
        sceneId: 's2',
        sceneSpan: 1,
        pattern: { kind: 'stock', id: 'TestPattern1D' },
        patternName: 'TestPattern1D',
        adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 1 },
      }]),
    ],
    routingLayouts: [
      { id: 'l1', name: 'Full Stage', zones: [], logical: { kind: 'single', zoneIds: ['z1'] } },
    ],
    transitions: options.boundaryCrossfade
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
  } as unknown as ShowRecord
}

/**
 * Open the fixture for grammar editing. With { overlay: true }, Scene 1 gains
 * an overlay layer carrying one full-Scene stock clip ("ov-clip-1"), the
 * legal home of a placement-opacity track.
 */
export function openGrammarFixture(
  options: { overlay?: boolean } & GrammarFixtureOptions = {},
): { document: ShowGrammarDocument; listing: ShowClipListing } {
  const opened = openShowDocument(grammarFixtureShow(options))
  if (!opened.ok) throw new Error(`fixture failed to open: ${JSON.stringify(opened.issues)}`)
  if (!options.overlay) return { document: opened.document, listing: opened.listing }

  const { document } = opened
  const composition = document.show.composition as ShowCompositionV1
  const withLayer = addShowOverlayLayer(document.show, composition, {
    sceneId: 's1',
    zoneId: 'z1',
    layer: { id: 'ov-layer-1', name: 'Overlay 1', placements: [] },
  })
  const withClip = addShowOverlayClip(document.show, withLayer, {
    sceneId: 's1',
    zoneId: 'z1',
    layerId: 'ov-layer-1',
    instance: {
      id: 'ov-instance-1',
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
      time: { timeScale: 1, timeOffsetMs: 0 },
    },
    placement: {
      id: 'ov-clip-1',
      instanceId: 'ov-instance-1',
      startMs: 0,
      durationMs: 30_000,
      opacity: 1,
      view: { mirror: false, phase: 0, brightness: 1 },
    },
  })
  if (withClip === withLayer || withClip === composition) {
    throw new Error('fixture overlay clip was refused by the engine')
  }
  const augmented: ShowGrammarDocument = {
    ...document,
    show: { ...document.show, composition: withClip },
  }
  return { document: augmented, listing: projectClipListing(augmented) }
}
