import { describe, expect, it } from 'vitest'
import { SHOW_CONTROLS_MIN_WIDTH, SHOW_PREVIEW_RAIL_WIDTH, SHOW_STRIP_MIN_HEIGHT, SHOW_TIMELINE_MIN_HEIGHT, parseShowTimelineHeight, measureShowTimelineMinimumHeight, resolveShowWorkspaceLayout, serializeShowTimelineHeight } from './showWorkspaceLayout'

describe('Show workspace sizing (#1006)', () => {
  it('fits short timelines and caps tall initial timelines at half the workspace', () => {
    for (const [timelineContentHeight, timelineHeight, stripHeight] of [[290, 302, 492], [470, 397, 397], [1200, 397, 397]]) {
      expect(resolveShowWorkspaceLayout({ width: 1200, height: 800, desiredTimelineHeight: null, previewAspect: 1, timelineContentHeight }))
        .toMatchObject({ timelineHeight, stripHeight, clamp: null })
    }
  })

  it.each([0.5, 1, 16 / 9])('lets the user enlarge preview independently of aspect %s and controls width', (previewAspect) => {
    for (const width of [390, 900, 1600]) {
      const layout = resolveShowWorkspaceLayout({ width, height: 800, desiredTimelineHeight: 100, previewAspect })
      expect(layout).toMatchObject({ timelineHeight: 100, stripHeight: 694, clamp: null })
      expect(layout.controlsWidth).toBeGreaterThanOrEqual(SHOW_CONTROLS_MIN_WIDTH)
      expect(layout.previewWidth + layout.controlsWidth + SHOW_PREVIEW_RAIL_WIDTH).toBe(width)
    }
  })

  it.each([null, 400])('preserves intended proportions through resizing and a temporary height clamp (remembered %s)', (desiredTimelineHeight) => {
    const input = { width: 1600, height: 800, referenceHeight: 800, desiredTimelineHeight, timelineContentHeight: 1200, previewAspect: 1 }
    const initial = resolveShowWorkspaceLayout(input)
    for (const height of [700, 1000, 800]) {
      const next = resolveShowWorkspaceLayout({ ...input, height, width: 390 })
      expect(next.clamp).toBeNull()
      expect(next.timelineHeight / (height - 6)).toBeCloseTo(initial.timelineHeight / 794, 2)
    }
    expect(resolveShowWorkspaceLayout({ ...input, height: 200 }).clamp).not.toBeNull()
    expect(resolveShowWorkspaceLayout(input)).toEqual(initial)
  })

  it('keeps the initial short-content proportion before any divider movement', () => {
    const input = { width: 1200, height: 900, referenceHeight: 900, desiredTimelineHeight: null, timelineContentHeight: 290, previewAspect: 1 }
    const initial = resolveShowWorkspaceLayout(input)
    expect(initial.timelineHeight).toBe(302)
    for (const height of [500, 1200, 900]) {
      const resized = resolveShowWorkspaceLayout({ ...input, height })
      expect(resized.clamp).toBeNull()
      expect(resized.timelineHeight / (height - 6)).toBeCloseTo(initial.timelineHeight / 894, 2)
    }
  })

  it('fits preview width to the available controls space while retaining the chosen height', () => {
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineHeight: 400, timelineContentHeight: 470, previewAspect: 1 }))
      .toEqual({ timelineHeight: 400, stripHeight: 294, previewWidth: 294, controlsWidth: 576, clamp: null })
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineHeight: 100, previewAspect: 16 / 9 }))
      .toEqual({ timelineHeight: 100, stripHeight: 594, previewWidth: 670, controlsWidth: 200, clamp: null })
  })

  it('stops at compact timeline chrome and the minimum preview height', () => {
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineHeight: 1, previewAspect: 1 }))
      .toMatchObject({ timelineHeight: SHOW_TIMELINE_MIN_HEIGHT, clamp: 'timeline-min' })
    expect(resolveShowWorkspaceLayout({ width: 900, height: 700, desiredTimelineHeight: 680, previewAspect: 1 }))
      .toMatchObject({ stripHeight: SHOW_STRIP_MIN_HEIGHT, clamp: 'strip-min' })
    const timelineMinimumHeight = measureShowTimelineMinimumHeight({ editorTop: 72, toolbarBottom: 160, fixedFooterHeight: 0 })
    expect(timelineMinimumHeight).toBe(112)
    expect(resolveShowWorkspaceLayout({ width: 1200, height: 900, desiredTimelineHeight: 40, previewAspect: 1, timelineMinimumHeight }))
      .toMatchObject({ timelineHeight: 112, clamp: 'timeline-min' })
  })

  it('round-trips finite remembered splits and rejects corrupt preferences', () => {
    expect(parseShowTimelineHeight(serializeShowTimelineHeight(412))).toBe(412)
    for (const value of ['NaN', '-20', '', 'Infinity', null]) expect(parseShowTimelineHeight(value)).toBeNull()
  })
})
