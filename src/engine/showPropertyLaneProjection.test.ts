import { describe, expect, it } from 'vitest'
import { createDefaultShow, updateShowBoundaryTransition, updateShowCellAdaptations } from './showModel'
import {
  projectGlobalShowPropertyLane,
  projectGlobalShowScenePropertyLanes,
  projectShowPropertyLane,
  projectShowPropertyTrackLane,
  unprojectShowPropertyLaneValue,
} from './showPropertyLaneProjection'
import { STOCK_SHOWS } from '../pixelblaze/stock/shows'

describe('Show property lane projection (#483)', () => {
  it('keeps flat normalized tracks at their truthful vertical level (#496)', () => {
    const projectFlatValue = (value: number) => projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: value,
      segments: [],
      beats: [{ id: `flat-${value}`, timeMs: 0, value, kind: 'authored' }],
    }).beats[0].displayY

    expect(projectFlatValue(1)).toBeCloseTo(0)
    expect(projectFlatValue(0.5)).toBeCloseTo(0.5)
    expect(projectFlatValue(0)).toBeCloseTo(1)
  })

  it('keeps authored values truthful while magnifying a small variation for legibility', () => {
    const lane = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 1,
      segments: [{
        id: 'subtle-ramp',
        startMs: 0,
        endMs: 1_000,
        from: 0.8,
        to: 0.85,
        easing: { curve: 'linear' },
      }],
      beats: [
        { id: 'start', timeMs: 0, value: 0.8, kind: 'authored' },
        { id: 'end', timeMs: 1_000, value: 0.85, kind: 'authored' },
      ],
    })

    expect(lane.disclosed).toBe(true)
    expect(lane.samples[0]).toMatchObject({ timeMs: 0, value: 0.8 })
    expect(lane.samples[lane.samples.length - 1]).toMatchObject({ timeMs: 1_000, value: 0.85 })
    expect(lane.extrema).toEqual({ min: 0.8, max: 0.85 })
    expect(lane.displayRange.max - lane.displayRange.min).toBeCloseTo(0.12)
    expect(lane.samples[0].displayY).toBeGreaterThan(lane.samples[lane.samples.length - 1].displayY)
    expect(unprojectShowPropertyLaneValue(lane, { min: 0, max: 1 }, lane.beats[0].displayY)).toBeCloseTo(0.8)
    expect(unprojectShowPropertyLaneValue(lane, { min: 0, max: 1 }, lane.beats[1].displayY)).toBeCloseTo(0.85)
    expect(unprojectShowPropertyLaneValue(lane, { min: 0, max: 1 }, -1)).toBeGreaterThan(0.85)
    expect(unprojectShowPropertyLaneValue(lane, { min: 0, max: 1 }, 2)).toBeLessThan(0.8)
  })

  it('projects authored Scene keyframes with stable selectable ownership', () => {
    const lane = projectShowPropertyTrackLane({
      durationMs: 2_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 1,
      track: {
        id: 'brightness-track',
        target: { kind: 'placement-view', placementId: 'placement-1', property: 'brightness' },
        keyframes: [
          { id: 'bright-a', timeMs: 0, value: 0.2, easing: { curve: 'quadratic', direction: 'in' } },
          { id: 'bright-b', timeMs: 2_000, value: 0.8, easing: { curve: 'linear' } },
        ],
      },
    })

    expect(lane.beats).toEqual([
      expect.objectContaining({ id: 'bright-a', ownerId: 'brightness-track', timeMs: 0, value: 0.2 }),
      expect.objectContaining({ id: 'bright-b', ownerId: 'brightness-track', timeMs: 2_000, value: 0.8 }),
    ])
    expect(lane.samples.find((sample) => sample.timeMs === 1_000)?.value).toBeCloseTo(0.35)
  })

  it('projects only genuine Scene-local change into parent Show-time coordinates', () => {
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-102-transitions-values')!
    const lanes = projectGlobalShowScenePropertyLanes(stock.show)

    expect(lanes).toHaveLength(1)
    expect(lanes[0]).toMatchObject({
      sceneId: 'passages',
      zoneId: 'zone-1',
      label: 'SignalMandala brightness',
      // Owning Clip and property stay separable so lane naming can drop or
      // abbreviate the Clip without re-parsing the label (#631).
      patternName: 'SignalMandala',
      propertyLabel: 'brightness',
      valueKind: 'percent',
    })
    expect(lanes[0].projection.beats.map((beat) => ({ timeMs: beat.timeMs, value: beat.value }))).toEqual([
      { timeMs: 12_500, value: 1 },
      { timeMs: 14_500, value: 1 },
      { timeMs: 16_500, value: 0.45 },
    ])
    expect(lanes[0].projection.beats.map((beat) => beat.displayX)).toEqual([
      12.5 / 16.5,
      14.5 / 16.5,
      16.5 / 16.5,
    ])
  })

  it('hides a global default lane and reveals a truthful boundary ramp once authored', () => {
    let show = createDefaultShow('show-global-lane', 'Global lane', 1_000)
    expect(projectGlobalShowPropertyLane(show, 'zone-1', { kind: 'timeScale' }).disclosed).toBe(false)

    show = updateShowCellAdaptations(show, 'cell-2', { timeScale: 0 })
    const constantOverrides = projectGlobalShowPropertyLane(show, 'zone-1', { kind: 'timeScale' })
    expect(constantOverrides.disclosed).toBe(true)
    expect(constantOverrides.timeVarying).toBe(false)

    show = updateShowBoundaryTransition(show, 'transition-scene-1', {
      propertyTransitions: {
        timeScale: {
          fromByCellId: { 'cell-2': 0.8 },
          durationMs: 2_000,
          easing: { curve: 'linear' },
        },
      },
    })
    const lane = projectGlobalShowPropertyLane(show, 'zone-1', { kind: 'timeScale' })
    expect(lane.timeVarying).toBe(true)
    const rampStart = lane.beats.find((beat) => beat.id.endsWith(':start'))!
    const rampEnd = lane.beats.find((beat) => beat.id.endsWith(':end'))!

    expect(lane.disclosed).toBe(true)
    expect(rampStart).toMatchObject({ ownerId: 'transition-scene-1', value: 0.8, kind: 'boundary' })
    expect(rampEnd).toMatchObject({ ownerId: 'transition-scene-1', value: 0, kind: 'boundary' })
    expect(lane.samples.find((sample) => sample.timeMs === rampStart.timeMs)?.value).toBe(0.8)
    expect(lane.samples.find((sample) => sample.timeMs === rampStart.timeMs + 1_000)?.value).toBeCloseTo(0.4)
  })

  it('retains the shape of a short ramp inside a long Show', () => {
    const lane = projectShowPropertyLane({
      durationMs: 60_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0,
      segments: [{
        id: 'brief-ease',
        startMs: 30_000,
        endMs: 30_800,
        from: 0,
        to: 1,
        easing: { curve: 'quadratic', direction: 'in' },
      }],
    })

    expect(lane.samples.find((sample) => sample.timeMs === 30_400)?.value).toBeCloseTo(0.25)
  })

  it('names Effect lanes by kind and parameter without repeating the kind (#63)', () => {
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-transform-effects')!
    const labels = new Set(projectGlobalShowScenePropertyLanes(stock.show).map((lane) => lane.propertyLabel))

    expect(labels).toContain('translate X')
    expect(labels).toContain('scale X')
    expect(labels).toContain('rotate turns')
    expect(labels).toContain('shear X')
    for (const label of labels) {
      expect(label).not.toMatch(/scale X scale|Turns|shear X shear/)
    }
  })
})
