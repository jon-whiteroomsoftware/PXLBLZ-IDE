// Shared fixtures for the prepared v2 command tests. Test-only: nothing in the
// product imports this module.
import type { ShowRecordV2 } from '../showCompositionV2'
import type { ShowPatternRef } from '../personalContentRecords'
import type { ShowCommandV2Context } from './registry'

/**
 * A two-Zone, two-Layer Show with an exact Cut junction, a shared runtime, an
 * overlay Clip on its own runtime, two Layout intervals, one Marker and one
 * Clip-owned Property track.
 */
export function commandFixtureV2(): ShowRecordV2 {
  return {
    version: 2,
    id: 'command-show',
    name: 'Command fixture',
    zones: [
      { id: 'left', name: 'Left', nominalPixelCount: 8 },
      { id: 'right', name: 'Right', nominalPixelCount: 8 },
    ],
    zoneLayouts: [
      { id: 'both', name: 'Both', zones: [], logical: { kind: 'split', axis: 'x', zoneIds: ['left', 'right'] } },
      { id: 'left-only', name: 'Left only', zones: [], logical: { kind: 'single', zoneIds: ['left'] } },
    ],
    outputContract: {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 16,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    },
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs: 10_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: [
        { id: 'inst-a', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'inst-b', pattern: { kind: 'stock', id: 'TestPattern2D' }, patternName: 'TestPattern2D', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      layers: [
        { id: 'base', zoneId: 'left', name: 'Base', rank: 0 },
        { id: 'over', zoneId: 'left', name: 'Over', rank: 1 },
      ],
      clips: [
        clip('clip-a', 'inst-a', 'base', 0, 4_000),
        clip('clip-b', 'inst-a', 'base', 4_000, 4_000),
        clip('clip-c', 'inst-b', 'over', 1_000, 2_000),
      ],
      transitions: [],
      layoutOccurrences: [
        { id: 'interval-1', layoutId: 'both', startMs: 0, durationMs: 5_000, parameters: {} },
        { id: 'interval-2', layoutId: 'both', startMs: 5_000, durationMs: 5_000, parameters: {} },
      ],
      propertyTracks: [{
        id: 'track-a',
        target: { kind: 'clip-opacity', clipId: 'clip-a' },
        activeStartMs: 0,
        activeDurationMs: 4_000,
        keyframes: [
          { id: 'track-a-start', timeMs: 0, value: 0, easing: { curve: 'linear' } },
          { id: 'track-a-end', timeMs: 4_000, value: 1, easing: { curve: 'linear' } },
        ],
      }],
      markers: [{ id: 'marker-1', name: 'Chorus', timeMs: 2_000 }],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

function clip(id: string, instanceId: string, layerId: string, startMs: number, durationMs: number) {
  return {
    id,
    instanceId,
    zoneId: 'left',
    layerId,
    startMs,
    durationMs,
    entryPolicy: 'continue' as const,
    zoneSampleMode: 'span' as const,
    appearance: {
      keys: [{
        id: `${id}-appearance`,
        timeMs: startMs,
        value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
      }],
    },
  }
}

/** A trusted resolver over a fixed table of Pattern exports. */
export function fixtureContext(
  table: Record<string, { name: string; sliders: string[] }> = {
    TestPattern1D: { name: 'TestPattern1D', sliders: ['speed'] },
    TestPattern2D: { name: 'TestPattern2D', sliders: ['speed', 'depth'] },
  },
): ShowCommandV2Context {
  return {
    resolvePattern: (reference: ShowPatternRef) => {
      const entry = table[reference.id]
      if (!entry) return { status: 'refused', message: `The Pattern source "${reference.id}" is unavailable.` }
      return {
        status: 'ready',
        replacement: {
          patternReference: { ...reference },
          patternName: entry.name,
          exportedSliders: entry.sliders.map(exportName => ({
            kind: 'slider' as const,
            exportName,
            label: exportName,
          })),
        },
      }
    },
  }
}
