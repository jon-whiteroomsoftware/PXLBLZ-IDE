import { describe, expect, it } from 'vitest'
import { SHOW_CONTROLS_MIN_WIDTH, SHOW_PREVIEW_RAIL_WIDTH, SHOW_STRIP_MIN_HEIGHT, SHOW_TIMELINE_MIN_HEIGHT, parseShowTimelineFraction, measureShowTimelineMinimumHeight, resolveShowWorkspaceLayout, serializeShowTimelineFraction, showTimelineFraction } from './showWorkspaceLayout'

describe('Show workspace sizing (#1006)', () => {
  it('fits short timelines and caps tall initial timelines at half the workspace', () => {
    for (const [timelineContentHeight, timelineHeight, stripHeight] of [[290, 302, 492], [470, 397, 397], [1200, 397, 397]]) {
      expect(resolveShowWorkspaceLayout({ width: 1200, height: 800, desiredTimelineFraction: null, previewAspect: 1, timelineContentHeight }))
        .toMatchObject({ timelineHeight, stripHeight, clamp: null })
    }
  })

  it.each([0.5, 1, 16 / 9])('lets the user enlarge preview independently of aspect %s and controls width', (previewAspect) => {
    for (const width of [390, 900, 1600]) {
      const layout = resolveShowWorkspaceLayout({ width, height: 800, desiredTimelineFraction: null, desiredTimelineHeight: 100, previewAspect })
      expect(layout).toMatchObject({ timelineHeight: 100, stripHeight: 694, clamp: null })
      expect(layout.controlsWidth).toBeGreaterThanOrEqual(SHOW_CONTROLS_MIN_WIDTH)
      expect(layout.previewWidth + layout.controlsWidth + SHOW_PREVIEW_RAIL_WIDTH).toBe(width)
    }
  })

  it.each([null, 400 / 794])('preserves intended proportions through resizing and a temporary height clamp (remembered %s)', (desiredTimelineFraction) => {
    const input = { width: 1600, height: 800, desiredTimelineFraction, timelineContentHeight: 1200, previewAspect: 1 }
    const initial = resolveShowWorkspaceLayout(input)
    const fraction = desiredTimelineFraction ?? initial.timelineHeight / 794
    for (const height of [700, 1000, 800]) {
      const next = resolveShowWorkspaceLayout({ ...input, height, width: 390 })
      expect(next.clamp).toBeNull()
      expect(next.timelineHeight / (height - 6)).toBeCloseTo(fraction, 2)
    }
    expect(resolveShowWorkspaceLayout({ ...input, height: 200 }).clamp).not.toBeNull()
    expect(resolveShowWorkspaceLayout(input)).toEqual(initial)
  })

  it('keeps the fitted short-content height before any divider movement', () => {
    const input = { width: 1200, height: 900, desiredTimelineFraction: null, timelineContentHeight: 290, previewAspect: 1 }
    const initial = resolveShowWorkspaceLayout(input)
    expect(initial.timelineHeight).toBe(302)
    for (const height of [700, 1200, 900]) {
      const resized = resolveShowWorkspaceLayout({ ...input, height })
      expect(resized.clamp).toBeNull()
      expect(resized.timelineHeight).toBe(302)
    }
  })

  it('fits preview width to the available controls space while retaining the chosen height', () => {
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineFraction: null, desiredTimelineHeight: 400, timelineContentHeight: 470, previewAspect: 1 }))
      .toEqual({ timelineHeight: 400, stripHeight: 294, previewWidth: 294, controlsWidth: 576, clamp: null })
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineFraction: null, desiredTimelineHeight: 100, previewAspect: 16 / 9 }))
      .toEqual({ timelineHeight: 100, stripHeight: 594, previewWidth: 670, controlsWidth: 200, clamp: null })
  })

  it('stops at compact timeline chrome and the minimum preview height', () => {
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineFraction: null, desiredTimelineHeight: 1, previewAspect: 1 }))
      .toMatchObject({ timelineHeight: SHOW_TIMELINE_MIN_HEIGHT, clamp: 'timeline-min' })
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineFraction: null, desiredTimelineHeight: 680, previewAspect: 1 }))
      .toMatchObject({ stripHeight: SHOW_STRIP_MIN_HEIGHT, clamp: 'strip-min' })
    const timelineMinimumHeight = measureShowTimelineMinimumHeight({ editorTop: 72, toolbarBottom: 160, fixedFooterHeight: 0 })
    expect(timelineMinimumHeight).toBe(112)
    expect(resolveShowWorkspaceLayout({ width: 1200, height: 900, desiredTimelineFraction: null, desiredTimelineHeight: 40, previewAspect: 1, timelineMinimumHeight }))
      .toMatchObject({ timelineHeight: 112, clamp: 'timeline-min' })
  })

  it('round-trips finite remembered fractions and rejects corrupt preferences', () => {
    expect(parseShowTimelineFraction(serializeShowTimelineFraction(0.52))).toBe(0.52)
    expect(serializeShowTimelineFraction(0)).toBe('0.0001')
    expect(serializeShowTimelineFraction(1)).toBe('0.9999')
    for (const value of ['NaN', '-0.2', '0', '1', '1.5', '', 'Infinity', null]) expect(parseShowTimelineFraction(value)).toBeNull()
  })

  it('measures the divider position as a fraction of the workspace', () => {
    expect(showTimelineFraction(390, 928)).toBe(390 / 922)
  })

  it('restores the remembered proportion at a new viewport without a resize write (#1085)', () => {
    const fraction = showTimelineFraction(474, 1128)
    const restored = parseShowTimelineFraction(serializeShowTimelineFraction(fraction))
    expect(restored).toBe(fraction)
    expect(resolveShowWorkspaceLayout({ width: 1800, height: 928, desiredTimelineFraction: restored, previewAspect: 1 }))
      .toMatchObject({ timelineHeight: Math.round(fraction * 922), clamp: null })
  })
})
