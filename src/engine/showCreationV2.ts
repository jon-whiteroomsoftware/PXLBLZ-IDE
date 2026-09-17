import type { ShowOutputContract } from './personalContentRecords'
import type { ShowRecordV2 } from './showCompositionV2'
import { cloneValidShowRecordV2 } from './showDocument'
import { createShowWithOutputContract } from './showModel'

/** What a fresh Show offers before it is authored: two Clips over one Crossfade. */
export const FRESH_SHOW_V2_CLIP_DURATION_MS = 30_000
export const FRESH_SHOW_V2_TRANSITION_DURATION_MS = 2_000

/** The stock Patterns a fresh Show opens with, in placement order. */
export const FRESH_SHOW_V2_PATTERN_IDS = ['TestPattern1D', 'CometLoom'] as const

/**
 * A native `ShowRecordV2` for a new Show (#1056 slice 6).
 *
 * It offers what `createShowWithOutputContract` offers today - two 30-second
 * Clips on one Layer of one Zone, joined by one two-sided 2-second Crossfade -
 * authored directly as v2 entities rather than converted from Scenes. The
 * Stage side (Zones, Zone Layouts, Stage Map and output contract) comes from
 * that same landed builder, so a fresh v2 Show and a fresh v1 Show route
 * output identically by construction and cannot drift apart.
 *
 * Two differences from converting a fresh v1 Show are deliberate: identities
 * are the v2 record's own, and there are no chapter Markers, because a native
 * Show has no Scene labels to project (specification section 8).
 *
 * Identity is record-local and fixed, exactly as the v1 builder's is. Nothing
 * here allocates a workspace identity; the caller supplies the Show's own id.
 */
export function createShowV2WithOutputContract(
  id: string,
  name: string,
  outputContract: ShowOutputContract,
  updatedAt = Date.now(),
): ShowRecordV2 {
  const stage = createShowWithOutputContract(id, name, outputContract, updatedAt)
  const zone = stage.zones[0]
  const layerId = `layer:${zone.id}:main`
  const secondStartMs = FRESH_SHOW_V2_CLIP_DURATION_MS + FRESH_SHOW_V2_TRANSITION_DURATION_MS
  const showEndMs = secondStartMs + FRESH_SHOW_V2_CLIP_DURATION_MS
  const clip = (index: 0 | 1) => {
    const startMs = index === 0 ? 0 : secondStartMs
    return {
      id: `clip-${index + 1}`,
      instanceId: `instance-${index + 1}`,
      zoneId: zone.id,
      layerId,
      startMs,
      durationMs: FRESH_SHOW_V2_CLIP_DURATION_MS,
      entryPolicy: 'continue' as const,
      zoneSampleMode: 'independent' as const,
      appearance: {
        keys: [{
          id: `clip-${index + 1}:appearance:1`,
          timeMs: startMs,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }],
      },
    }
  }
  return cloneValidShowRecordV2({
    version: 2,
    id: stage.id,
    name: stage.name,
    zones: stage.zones,
    zoneLayouts: stage.routingLayouts,
    stageMapId: stage.stageMapId,
    outputContract: stage.outputContract,
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs,
      sampleRemap: { repeatScale: 1 },
      patternInstances: FRESH_SHOW_V2_PATTERN_IDS.map((patternId, index) => ({
        id: `instance-${index + 1}`,
        pattern: { kind: 'stock' as const, id: patternId },
        patternName: patternId,
        time: { timeScale: 1, timeOffsetMs: 0 },
      })),
      layers: [{ id: layerId, zoneId: zone.id, name: 'Main', rank: 0 }],
      clips: [clip(0), clip(1)],
      transitions: [{
        id: 'transition-1',
        kind: 'crossfade',
        durationMs: FRESH_SHOW_V2_TRANSITION_DURATION_MS,
        easing: { curve: 'linear' },
        crossfadePolicy: 'snapshot-live',
        participants: [{
          id: 'transition-1:participant:1',
          zoneId: zone.id,
          layerId,
          fromClipId: 'clip-1',
          toClipId: 'clip-2',
        }],
        propertyRamps: [],
      }],
      layoutOccurrences: [{
        id: 'layout-occurrence-1',
        layoutId: stage.routingLayouts[0].id,
        startMs: 0,
        durationMs: showEndMs,
        parameters: {},
      }],
      propertyTracks: [],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: stage.updatedAt,
  })
}
