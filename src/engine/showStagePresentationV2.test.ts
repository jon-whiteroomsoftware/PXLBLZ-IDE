import { describe, expect, it } from 'vitest'
import { createCustomMap } from './maps'
import type { MapPoint } from './maps'
import { applyShowStageMaskPacked, createShowStageMaskPlan, type ShowStageProjection } from './zonePreview'
import type { ShowRecordV2 } from './showCompositionV2'
import { validateShowRecordV2 } from './showCompositionV2'
import {
  buildShowStageOccurrenceProjectionV2,
  buildShowStagePresentationWindowsV2,
  showStagePresentationWindowAtV2,
  type ShowStagePresentationWindowV2,
} from './showStagePresentationV2'

/** Four Stage pixels, two Zones, and two physical Layouts that swap their halves. */
function swappingRecord(): ShowRecordV2 {
  return {
    version: 2,
    id: 'stage-presentation',
    name: 'Stage presentation fixture',
    zones: [
      { id: 'main', name: 'Main', nominalPixelCount: 2 },
      { id: 'accent', name: 'Accent', nominalPixelCount: 2 },
    ],
    zoneLayouts: [
      {
        id: 'early',
        name: 'Early',
        zones: [
          { zoneId: 'main', ranges: [{ start: 0, end: 1 }] },
          { zoneId: 'accent', ranges: [{ start: 2, end: 3 }] },
        ],
      },
      {
        id: 'late',
        name: 'Late',
        zones: [
          { zoneId: 'main', ranges: [{ start: 2, end: 3 }] },
          { zoneId: 'accent', ranges: [{ start: 0, end: 1 }] },
        ],
      },
    ],
    stageMapId: 'stage',
    outputContract: {
      version: 1,
      kind: 'installation',
      outputMapId: 'stage',
      pixelCount: 4,
      resolution: 'fixed',
    },
    composition: {
      version: 2,
      executionModel: 'continuous',
      showEndMs: 1_000,
      sampleRemap: { repeatScale: 1 },
      patternInstances: [{
        id: 'instance', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      layers: [
        { id: 'main-layer', zoneId: 'main', name: 'Main', rank: 0 },
        { id: 'accent-layer', zoneId: 'accent', name: 'Accent', rank: 0 },
      ],
      clips: [{
        id: 'main-clip', instanceId: 'instance', zoneId: 'main', layerId: 'main-layer',
        startMs: 0, durationMs: 1_000, entryPolicy: 'continue', zoneSampleMode: 'span',
        appearance: { keys: [{
          id: 'main-appearance', timeMs: 0,
          value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] },
        }] },
      }],
      transitions: [],
      layoutOccurrences: [
        { id: 'first', layoutId: 'early', startMs: 0, durationMs: 400, parameters: {} },
        { id: 'second', layoutId: 'late', startMs: 400, durationMs: 600, parameters: {} },
      ],
      propertyTracks: [],
      markers: [],
      groupDefinitions: [],
      groupOccurrences: [],
    },
    updatedAt: 1,
  }
}

const STAGE_POSITIONS: [number, number][] = [[0, 0], [0.25, 0], [0.75, 1], [1, 1]]

function stageMapPoints(): MapPoint[] {
  return STAGE_POSITIONS.map(pos => ({ sample: [...pos], pos: [...pos] as [number, number] }))
}

function mappedLayoutInput(record: ShowRecordV2) {
  return {
    kind: 'map' as const,
    mapPoints: stageMapPoints(),
    projection: buildShowStageOccurrenceProjectionV2(record, record.zoneLayouts[0].id, {
      mapPoints: stageMapPoints(),
      splitPosition: 0.5,
    }),
    draw: { kind: '2d' as const, positions: STAGE_POSITIONS },
  }
}

/** Presented pixels are the consumer oracle: the mask plan output an actual paint uses. */
function presentedPixels(
  window: ShowStagePresentationWindowV2,
  soloZoneId: string | null,
  frame = Float64Array.from([1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1]),
): number[][] {
  const plan = createShowStageMaskPlan(window.projection, 4)
  const masked = applyShowStageMaskPacked(frame, plan, soloZoneId)
  return Array.from({ length: 4 }, (_, index) => [masked[index * 3], masked[index * 3 + 1], masked[index * 3 + 2]])
}

const UNSTAGED = [0.055, 0.055, 0.06]
const OFF = [0, 0, 0]
const RED = [1, 0, 0]
const BLUE = [0, 0, 1]

describe('native Stage presentation windows', () => {
  it('covers the Show once in occurrence order with the active Layout projection', () => {
    const record = swappingRecord()
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))

    expect(windows.map(window => [window.layoutOccurrenceId, window.startMs, window.endMs])).toEqual([
      ['first', 0, 400],
      ['second', 400, 1_000],
    ])
    expect(windows[0].projection.pixelZoneIds).toEqual(['main', 'main', 'accent', 'accent'])
    expect(windows[1].projection.pixelZoneIds).toEqual(['accent', 'accent', 'main', 'main'])
    expect(windows.every(window => window.projection.unstagedPixelCount === 0)).toBe(true)
  })

  it('keeps the derivation presentation-only and leaves the record untouched', () => {
    const record = swappingRecord()
    const preimage = structuredClone(record)
    buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))
    expect(record).toEqual(preimage)
    expect(validateShowRecordV2(record)).toEqual([])
  })

  it('resolves half-open occurrence ownership before, at and after a switch', () => {
    const record = swappingRecord()
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))
    const at = (timeMs: number) => showStagePresentationWindowAtV2(windows, 1_000, timeMs)?.layoutOccurrenceId

    expect(at(0)).toBe('first')
    expect(at(399)).toBe('first')
    expect(at(399.9)).toBe('first')
    expect(at(400)).toBe('second')
    expect(at(400.1)).toBe('second')
    expect(at(999)).toBe('second')
  })

  it('wraps playback time at Show End like the transport position', () => {
    const record = swappingRecord()
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))
    const at = (timeMs: number) => showStagePresentationWindowAtV2(windows, 1_000, timeMs)?.layoutOccurrenceId

    expect(at(1_000)).toBe('first')
    expect(at(1_399)).toBe('first')
    expect(at(1_400)).toBe('second')
    expect(at(2_400)).toBe('second')
  })

  it('isolates a soloed Zone against the pixels the active Layout gives it', () => {
    const record = swappingRecord()
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))

    expect(presentedPixels(windows[0], null)).toEqual([RED, RED, BLUE, BLUE])
    expect(presentedPixels(windows[0], 'main')).toEqual([RED, RED, OFF, OFF])
    expect(presentedPixels(windows[1], 'main')).toEqual([OFF, OFF, BLUE, BLUE])
    expect(presentedPixels(windows[1], 'accent')).toEqual([RED, RED, OFF, OFF])
  })

  it('dims only pixels the active Layout leaves unstaged', () => {
    const record = swappingRecord()
    record.zoneLayouts[1].zones = [{ zoneId: 'main', ranges: [{ start: 2, end: 3 }] }]
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))

    expect(windows[1].projection.unstagedPixelCount).toBe(2)
    expect(presentedPixels(windows[1], null)).toEqual([UNSTAGED, UNSTAGED, BLUE, BLUE])
    expect(windows[1].projection.zones.find(zone => zone.id === 'accent')?.offStage).toBe(true)
    // The earlier occurrence keeps its own complete coverage.
    expect(presentedPixels(windows[0], null)).toEqual([RED, RED, BLUE, BLUE])
  })

  it('unions source and destination Layouts across a timed transfer so blended output stays visible', () => {
    const record = swappingRecord()
    record.zoneLayouts[1].zones = [{ zoneId: 'main', ranges: [{ start: 2, end: 3 }] }]
    record.composition.layoutOccurrences[1].incomingTransfer = {
      id: 'transfer', fromOccurrenceId: 'first', durationMs: 100, direction: 'forward',
    }
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))

    expect(windows.map(window => [window.layoutOccurrenceId, window.kind, window.startMs, window.endMs])).toEqual([
      ['first', 'occurrence', 0, 400],
      ['second', 'transfer', 400, 500],
      ['second', 'occurrence', 500, 1_000],
    ])
    // The outgoing Layout still owns pixels 0-1 while the transfer blends.
    expect(windows[1].projection.pixelZoneIds).toEqual(['main', 'main', 'main', 'main'])
    expect(presentedPixels(windows[1], null)).toEqual([RED, RED, BLUE, BLUE])
    expect(presentedPixels(windows[1], 'main')).toEqual([RED, RED, BLUE, BLUE])
    expect(presentedPixels(windows[2], null)).toEqual([UNSTAGED, UNSTAGED, BLUE, BLUE])
    expect(showStagePresentationWindowAtV2(windows, 1_000, 499)?.kind).toBe('transfer')
    expect(showStagePresentationWindowAtV2(windows, 1_000, 500)?.kind).toBe('occurrence')
  })

  it('builds authored Zone guides from the active occurrence and none for a 3D draw', () => {
    const record = swappingRecord()
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))

    expect(windows[0].guideRects.map(rect => [rect.zoneId, rect.x, rect.width])).toEqual([
      ['main', 0, 0.25],
      ['accent', 0.75, 0.25],
    ])
    expect(windows[1].guideRects.map(rect => [rect.zoneId, rect.x, rect.width])).toEqual([
      ['main', 0.75, 0.25],
      ['accent', 0, 0.25],
    ])
    expect(windows[0].guideRects.every(rect => rect.color === windows[1].guideRects.find(other => other.zoneId === rect.zoneId)?.color)).toBe(true)

    const cube = buildShowStagePresentationWindowsV2(record, {
      ...mappedLayoutInput(record),
      draw: { kind: '3d', positions: STAGE_POSITIONS.map(([x, y]) => [x, y, 0.5] as [number, number, number]) },
    })
    expect(cube.every(window => window.guideRects.length === 0)).toBe(true)
  })

  it('shares one projection across repeated Layout occurrences', () => {
    const record = swappingRecord()
    record.composition.layoutOccurrences = [
      { id: 'first', layoutId: 'early', startMs: 0, durationMs: 400, parameters: {} },
      { id: 'second', layoutId: 'late', startMs: 400, durationMs: 300, parameters: {} },
      { id: 'third', layoutId: 'early', startMs: 700, durationMs: 300, parameters: {} },
    ]
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))

    expect(windows.map(window => window.layoutOccurrenceId)).toEqual(['first', 'second', 'third'])
    expect(windows[2].projection).toBe(windows[0].projection)
    expect(windows[2].guideRects).toBe(windows[0].guideRects)
    expect(windows[1].projection).not.toBe(windows[0].projection)
  })

  it('reprojects a logical portable Layout through each occurrence split position', () => {
    const record = swappingRecord()
    record.stageMapId = 'plane'
    record.outputContract = {
      version: 1,
      kind: 'portable-2d',
      referenceMapId: 'plane',
      referencePixelCount: 4,
      compatibility: { dimensions: [2], mapClass: 'continuous-surface', resolution: 'variable' },
    }
    record.zoneLayouts = [
      { id: 'early', name: 'Early', zones: [], logical: { kind: 'split', axis: 'x', zoneIds: ['main', 'accent'] } },
      { id: 'late', name: 'Late', zones: [], logical: { kind: 'single', zoneIds: ['accent'] } },
    ]
    record.composition.layoutOccurrences[0].parameters = { splitPosition: 0.5 }
    record.composition.layoutOccurrences[1].parameters = { splitPosition: 0.9 }
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record), { initialSplitPosition: 0.2 })

    // The initial occurrence keeps the compiled initial split; the later one uses its own.
    expect(windows[0].projection.pixelZoneIds).toEqual(['main', 'accent', 'accent', 'accent'])
    expect(windows[1].projection.pixelZoneIds).toEqual(['accent', 'accent', 'accent', 'accent'])
  })

  it('keeps the generic strips projection for every occurrence of an unmapped Stage', () => {
    const record = swappingRecord()
    const strips: ShowStageProjection = {
      zones: [
        { id: 'main', name: 'Main', color: '#38bdf8', pixelCount: 2, offStage: false },
        { id: 'accent', name: 'Accent', color: '#f97316', pixelCount: 2, offStage: false },
      ],
      pixelZoneIds: ['main', 'main', 'accent', 'accent'],
      unstagedPixelCount: 0,
    }
    const windows = buildShowStagePresentationWindowsV2(record, {
      kind: 'strips',
      mapPoints: stageMapPoints(),
      projection: strips,
      draw: { kind: '2d', positions: STAGE_POSITIONS },
    })

    expect(windows).toHaveLength(2)
    expect(windows.every(window => window.projection === strips)).toBe(true)
  })

  it('publishes the occurrence-at-zero projection preparation already uses', () => {
    const record = swappingRecord()
    const map = createCustomMap(STAGE_POSITIONS.map(([x, y]) => [x, y]), { id: 'stage', name: 'Stage' })
    expect(map.dim).toBe(2)
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))
    expect(windows[0].projection).toEqual(buildShowStageOccurrenceProjectionV2(record, 'early', {
      mapPoints: stageMapPoints(),
      splitPosition: 0.5,
    }))
  })

  it('returns no window for an empty derivation and never throws on out-of-range time', () => {
    expect(showStagePresentationWindowAtV2([], 1_000, 0)).toBeNull()
    const record = swappingRecord()
    const windows = buildShowStagePresentationWindowsV2(record, mappedLayoutInput(record))
    expect(showStagePresentationWindowAtV2(windows, 1_000, -1)?.layoutOccurrenceId).toBe('second')
    expect(showStagePresentationWindowAtV2(windows, 0, 5)?.layoutOccurrenceId).toBe('first')
    expect(showStagePresentationWindowAtV2(windows, 1_000, Number.NaN)?.layoutOccurrenceId).toBe('first')
  })
})
