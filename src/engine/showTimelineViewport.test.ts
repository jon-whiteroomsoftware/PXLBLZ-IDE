import {
  fitShowTimelineViewport,
  panShowTimelineViewport,
  rangeThumbCenterOffsetPx,
  resizeShowTimelineViewport,
  showTimelineThumb,
  showTimelineGridStepMs,
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
})
