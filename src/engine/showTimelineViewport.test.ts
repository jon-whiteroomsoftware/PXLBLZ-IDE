import {
  fitShowTimelineViewport,
  formatShowTimelineRulerTime,
  panShowTimelineViewport,
  rangeThumbCenterOffsetPx,
  resizeShowTimelineViewport,
  showTimelineRulerTicks,
  showTimelineThumb,
  showTimelineGridStepMs,
  showTimelineQuantizeStepMs,
  snapShowTimelineTime,
  timeToViewportPercent,
  viewportPercentToTime,
  zoomShowTimelineViewport,
} from './showTimelineViewport'

describe('Show timeline viewport (#420)', () => {
  it('centers a playhead line on the range thumb across its inset travel', () => {
    expect(rangeThumbCenterOffsetPx(0, 16)).toBe(8)
    expect(rangeThumbCenterOffsetPx(50, 16)).toBe(0)
    expect(rangeThumbCenterOffsetPx(100, 16)).toBe(-8)
  })

  it('fits the whole Show and maps both ends exactly', () => {
    const viewport = fitShowTimelineViewport(60_000)
    expect(viewport).toEqual({ totalMs: 60_000, startMs: 0, durationMs: 60_000, minDurationMs: 3_750 })
    expect(showTimelineThumb(viewport)).toEqual({ leftPercent: 0, widthPercent: 100 })
    expect(timeToViewportPercent(viewport, 30_000)).toBe(50)
    expect(viewportPercentToTime(viewport, 50)).toBe(30_000)
  })

  it('zooms around the playhead without changing its screen position', () => {
    const fit = fitShowTimelineViewport(60_000)
    const zoomed = zoomShowTimelineViewport(fit, 2, 15_000)

    expect(zoomed).toMatchObject({ startMs: 7_500, durationMs: 30_000 })
    expect(timeToViewportPercent(fit, 15_000)).toBe(25)
    expect(timeToViewportPercent(zoomed, 15_000)).toBe(25)
    expect(showTimelineThumb(zoomed)).toEqual({ leftPercent: 12.5, widthPercent: 50 })
  })

  it('clamps pan and zoom to reachable useful bounds', () => {
    const fit = fitShowTimelineViewport(16_000)
    const maximum = zoomShowTimelineViewport(fit, 100, 8_000)
    expect(maximum.durationMs).toBe(1_000)
    expect(panShowTimelineViewport(maximum, -500).startMs).toBe(0)
    expect(panShowTimelineViewport(maximum, 99_000).startMs).toBe(15_000)
    expect(zoomShowTimelineViewport(maximum, 0.001, 8_000)).toEqual(fit)
  })

  it('resizes either navigator edge while preserving the opposite edge', () => {
    const viewport = { ...fitShowTimelineViewport(60_000), startMs: 15_000, durationMs: 30_000 }
    expect(resizeShowTimelineViewport(viewport, 'start', 20_000)).toMatchObject({ startMs: 20_000, durationMs: 25_000 })
    expect(resizeShowTimelineViewport(viewport, 'end', 40_000)).toMatchObject({ startMs: 15_000, durationMs: 25_000 })
    expect(resizeShowTimelineViewport(viewport, 'start', 44_900)).toMatchObject({ startMs: 41_250, durationMs: 3_750 })
  })

  it('uses a finer magnetic time grid as the timeline zooms in (#63)', () => {
    expect(showTimelineGridStepMs(60_000, 600)).toBe(10_000)
    expect(showTimelineGridStepMs(6_000, 600)).toBe(1_000)
    expect(showTimelineGridStepMs(1_000, 600)).toBe(200)
  })

  it('snaps near structural boundaries before the zoom-aware time grid (#63)', () => {
    expect(snapShowTimelineTime(5_930, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [6_000, 30_000],
    })).toEqual({ timeMs: 6_000, kind: 'boundary' })

    expect(snapShowTimelineTime(10_650, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [6_000, 30_000],
    })).toEqual({ timeMs: 10_000, kind: 'grid' })

    expect(snapShowTimelineTime(11_500, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [6_000, 30_000],
    })).toEqual({ timeMs: 11_500 })
  })

  it('quantizes to the requested drop grid when no boundary is near (#667)', () => {
    expect(snapShowTimelineTime(5_430, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [30_000],
      quantizeStepMs: 1_000,
    })).toEqual({ timeMs: 5_000, kind: 'grid' })

    expect(snapShowTimelineTime(5_430, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [30_000],
      quantizeStepMs: 100,
    })).toEqual({ timeMs: 5_400, kind: 'grid' })
  })

  it('quantizes far from any grid magnet threshold, unlike the magnetic grid (#667)', () => {
    // 10_650 is 350ms from the nearest 1s line — outside any magnet threshold —
    // yet a quantizing drop still lands it there.
    expect(snapShowTimelineTime(10_650, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [],
      quantizeStepMs: 1_000,
    })).toEqual({ timeMs: 11_000, kind: 'grid' })
  })

  it('lets a near boundary beat the drop grid (#667)', () => {
    expect(snapShowTimelineTime(5_930, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [6_150],
      quantizeStepMs: 1_000,
    })).toEqual({ timeMs: 6_150, kind: 'boundary' })
  })

  it('clamps a quantized time into the permitted range (#667)', () => {
    expect(snapShowTimelineTime(180, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [],
      quantizeStepMs: 1_000,
      minTimeMs: 500,
    })).toEqual({ timeMs: 500, kind: 'grid' })

    expect(snapShowTimelineTime(59_820, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [],
      quantizeStepMs: 1_000,
      maxTimeMs: 59_500,
    })).toEqual({ timeMs: 59_500, kind: 'grid' })
  })

  it('ignores the magnetic grid flag while a drop grid is active (#667)', () => {
    expect(snapShowTimelineTime(10_650, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [],
      gridEnabled: false,
      quantizeStepMs: 1_000,
    })).toEqual({ timeMs: 11_000, kind: 'grid' })
  })

  it('picks the drop grid step from the fine modifier (#667)', () => {
    expect(showTimelineQuantizeStepMs(false)).toBe(1_000)
    expect(showTimelineQuantizeStepMs(true)).toBe(100)
  })

  it('can snap to explicit boundaries without enabling the time grid', () => {
    expect(snapShowTimelineTime(5_930, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [6_000],
      gridEnabled: false,
    })).toEqual({ timeMs: 6_000, kind: 'boundary' })

    expect(snapShowTimelineTime(10_650, {
      visibleDurationMs: 60_000,
      visibleWidthPx: 600,
      structuralTimesMs: [6_000],
      gridEnabled: false,
    })).toEqual({ timeMs: 10_650 })
  })
})

describe('Show timeline ruler ticks (#670)', () => {
  it('places ruler ticks on the magnetic grid step at fit zoom', () => {
    const { majorStepMs, minorStepMs, ticks } = showTimelineRulerTicks({
      rulerDurationMs: 60_000,
      viewport: fitShowTimelineViewport(60_000),
      visibleWidthPx: 600,
    })

    expect(majorStepMs).toBe(showTimelineGridStepMs(60_000, 600))
    expect(minorStepMs).toBe(2_000)
    expect(ticks[0]).toEqual({ timeMs: 0, fraction: 0, kind: 'major', label: '0s' })
    expect(ticks[ticks.length - 1]).toEqual({ timeMs: 60_000, fraction: 1, kind: 'major', label: '1:00' })
    expect(ticks).toHaveLength(31)
    expect(ticks.filter((tick) => tick.kind === 'major').map((tick) => tick.timeMs))
      .toEqual([0, 10_000, 20_000, 30_000, 40_000, 50_000, 60_000])
    ticks.forEach((tick) => {
      expect(tick.timeMs % minorStepMs).toBe(0)
      expect(tick.fraction).toBeCloseTo(tick.timeMs / 60_000, 12)
      expect(tick.label !== undefined).toBe(tick.kind === 'major')
    })
  })

  it('refines tick steps with zoom while still covering the whole ruler', () => {
    const viewport = { totalMs: 60_000, startMs: 14_500, durationMs: 6_000, minDurationMs: 3_750 }
    const { majorStepMs, minorStepMs, ticks } = showTimelineRulerTicks({
      rulerDurationMs: 60_000,
      viewport,
      visibleWidthPx: 600,
    })

    expect(majorStepMs).toBe(1_000)
    expect(minorStepMs).toBe(200)
    expect(ticks[0].timeMs).toBe(0)
    expect(ticks[ticks.length - 1].timeMs).toBe(60_000)
    expect(ticks).toHaveLength(301)
    expect(ticks.filter((tick) => tick.kind === 'major')).toHaveLength(61)
    expect(ticks.find((tick) => tick.timeMs === 14_000)?.label).toBe('14s')
  })

  it('subdivides 2-multiplier steps into quarters so minors stay on clean decimals', () => {
    const { majorStepMs, minorStepMs } = showTimelineRulerTicks({
      rulerDurationMs: 16_000,
      viewport: { totalMs: 16_000, startMs: 0, durationMs: 1_000, minDurationMs: 1_000 },
      visibleWidthPx: 600,
    })
    expect(majorStepMs).toBe(200)
    expect(minorStepMs).toBe(50)
  })

  it('subdivides 5-multiplier steps into whole units', () => {
    const { majorStepMs, minorStepMs } = showTimelineRulerTicks({
      rulerDurationMs: 30_000,
      viewport: fitShowTimelineViewport(30_000),
      visibleWidthPx: 600,
    })
    expect(majorStepMs).toBe(5_000)
    expect(minorStepMs).toBe(1_000)
  })

  it('covers the whole ruler regardless of viewport position, so on-screen time beyond the logical viewport still has marks', () => {
    const { ticks } = showTimelineRulerTicks({
      rulerDurationMs: 60_000,
      viewport: { totalMs: 60_000, startMs: 54_000, durationMs: 6_000, minDurationMs: 3_750 },
      visibleWidthPx: 600,
    })
    expect(ticks[0].timeMs).toBe(0)
    expect(ticks[ticks.length - 1].timeMs).toBe(60_000)
    expect(ticks.every((tick) => tick.timeMs >= 0 && tick.timeMs <= 60_000)).toBe(true)
  })

  it('returns no ticks for a degenerate ruler duration', () => {
    expect(showTimelineRulerTicks({
      rulerDurationMs: 0,
      viewport: fitShowTimelineViewport(0),
      visibleWidthPx: 600,
    }).ticks).toEqual([])
  })

  it('labels whole seconds, clean sub-second fractions, and minutes', () => {
    expect(formatShowTimelineRulerTime(0)).toBe('0s')
    expect(formatShowTimelineRulerTime(200)).toBe('0.2s')
    expect(formatShowTimelineRulerTime(1_500)).toBe('1.5s')
    expect(formatShowTimelineRulerTime(12_000)).toBe('12s')
    expect(formatShowTimelineRulerTime(90_000)).toBe('1:30')
    expect(formatShowTimelineRulerTime(90_500)).toBe('1:30.5')
    expect(formatShowTimelineRulerTime(600_000)).toBe('10:00')
  })
})
