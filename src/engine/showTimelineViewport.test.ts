import {
  fitShowTimelineViewport,
  panShowTimelineViewport,
  resizeShowTimelineViewport,
  showTimelineThumb,
  timeToViewportPercent,
  viewportPercentToTime,
  zoomShowTimelineViewport,
} from './showTimelineViewport'

describe('Show timeline viewport (#420)', () => {
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
})
