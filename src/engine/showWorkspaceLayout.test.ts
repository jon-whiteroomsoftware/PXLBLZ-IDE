import { describe, expect, it } from 'vitest'
import {
  SHOW_CONTROLS_MIN_WIDTH,
  SHOW_STRIP_MIN_HEIGHT,
  SHOW_TIMELINE_MIN_HEIGHT,
  parseShowTimelineHeight,
  measureShowTimelineMinimumHeight,
  resolveShowWorkspaceLayout,
  serializeShowTimelineHeight,
  showControlsLayoutMode,
} from './showWorkspaceLayout'

describe('Show workspace over/under layout (#967)', () => {
  it('fits three or six lanes before giving the square preview the remaining height (#977)', () => {
    for (const [timelineContentHeight, timelineHeight, stripHeight] of [[290, 302, 492], [470, 482, 312]]) {
      expect(resolveShowWorkspaceLayout({
        width: 1200,
        height: 800,
        desiredTimelineHeight: null,
        previewAspect: 1,
        timelineContentHeight,
      })).toMatchObject({ timelineHeight, stripHeight, previewWidth: stripHeight, clamp: null })
    }
  })

  it('turns the remembered timeline height into an aspect-true strip', () => {
    expect(resolveShowWorkspaceLayout({
      width: 900,
      height: 700,
      desiredTimelineHeight: 400,
      timelineContentHeight: 470,
      previewAspect: 1,
    })).toEqual({
      timelineHeight: 400,
      stripHeight: 294,
      previewWidth: 294,
      controlsWidth: 606,
      clamp: null,
    })

    expect(resolveShowWorkspaceLayout({
      width: 900,
      height: 700,
      desiredTimelineHeight: 500,
      previewAspect: 16 / 9,
    })).toMatchObject({ stripHeight: 194, previewWidth: 345, controlsWidth: 555 })
    expect(resolveShowWorkspaceLayout({
      width: 900,
      height: 700,
      desiredTimelineHeight: 300,
      previewAspect: 9 / 16,
    })).toMatchObject({ stripHeight: 394, previewWidth: 222, controlsWidth: 678 })
  })

  it.each([
    [1200, 800, 900, 1, 654, 'strip-min'],
    [900, 700, 100, 16 / 9, 301, 'controls-min'],
    [1200, 800, 100, 1, 164, 'timeline-min'],
  ] as const)('applies the same clamps to automatic fitting at %i × %i', (width, height, timelineContentHeight, previewAspect, timelineHeight, clamp) => {
    expect(resolveShowWorkspaceLayout({ width, height, timelineContentHeight, previewAspect, desiredTimelineHeight: null }))
      .toMatchObject({ timelineHeight, clamp })
  })

  it('stops at the timeline, controls, and strip boundaries', () => {
    expect(resolveShowWorkspaceLayout({
      width: 900,
      height: 500,
      desiredTimelineHeight: 40,
      previewAspect: 1,
    })).toMatchObject({
      timelineHeight: SHOW_TIMELINE_MIN_HEIGHT,
      clamp: 'timeline-min',
    })

    const controlsClamp = resolveShowWorkspaceLayout({
      width: 900,
      height: 700,
      desiredTimelineHeight: 100,
      previewAspect: 16 / 9,
    })
    expect(controlsClamp.clamp).toBe('controls-min')
    expect(controlsClamp.controlsWidth).toBeGreaterThanOrEqual(SHOW_CONTROLS_MIN_WIDTH)

    expect(resolveShowWorkspaceLayout({
      width: 900,
      height: 700,
      desiredTimelineHeight: 680,
      previewAspect: 1,
    })).toMatchObject({
      stripHeight: SHOW_STRIP_MIN_HEIGHT,
      clamp: 'strip-min',
    })
  })

  it('derives the product timeline minimum from its rendered chrome and two lanes', () => {
    const timelineMinimumHeight = measureShowTimelineMinimumHeight({
      editorTop: 72,
      secondLaneBottom: 306,
      fixedFooterHeight: 36.2,
    })
    expect(timelineMinimumHeight).toBe(271)
    expect(resolveShowWorkspaceLayout({
      width: 1200,
      height: 900,
      desiredTimelineHeight: 40,
      previewAspect: 1,
      timelineMinimumHeight,
    })).toMatchObject({ timelineHeight: 271, clamp: 'timeline-min' })
  })

  it('round-trips a finite remembered Show-mode split and rejects corrupt storage', () => {
    expect(parseShowTimelineHeight(serializeShowTimelineHeight(412))).toBe(412)
    expect(parseShowTimelineHeight('NaN')).toBeNull()
    expect(parseShowTimelineHeight('-20')).toBeNull()
    expect(parseShowTimelineHeight(null)).toBeNull()
  })

  it.each([
    [200, 'compact'],
    [300, 'compact'],
    [301, 'one-column'],
    [759, 'one-column'],
    [760, 'two-column'],
    [1139, 'two-column'],
    [1140, 'three-column'],
  ] as const)('uses the controls container width %i for the %s form', (width, mode) => {
    expect(showControlsLayoutMode(width)).toBe(mode)
  })
})
