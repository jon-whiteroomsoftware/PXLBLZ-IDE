import { describe, expect, it } from 'vitest'
import { NEUTRAL_SHOW_CLIP_TRANSFORM } from './showClipTransform'
import { DEFAULT_SHOW_CLIP_VIEWPORT } from './showClipViewport'
import {
  resolvePlacementPositionPresentation,
  resolvePlacementScalePresentation,
  anchorContent,
  applyContentFit,
  clampPlacementRectToZone,
  contentRectFromTransform,
  detentPlacementRotation,
  enableViewportForContent,
  frameContent,
  moveContentCentre,
  moveViewportTo,
  nudgeContent,
  nudgeViewport,
  placementCornerAnchor,
  placementPadView,
  resizeContentToAnchor,
  resizeViewportToAnchor,
  setViewportRect,
  snapPlacementRect,
  stickPlacementRect,
  stickPlacementTranslate,
  sweepViewport,
  transformFromContentRect,
  viewportRect,
  type PlacementPadContext,
} from './showClipPlacementPad'
import type { ShowClipTransform, ShowClipViewport } from './personalContentRecords'

const context = (
  transform: Partial<ShowClipTransform> = {},
  viewport: Partial<ShowClipViewport> = {},
  grid = 0,
): PlacementPadContext => ({
  transform: { ...NEUTRAL_SHOW_CLIP_TRANSFORM, ...transform },
  viewport: { ...DEFAULT_SHOW_CLIP_VIEWPORT, ...viewport },
  grid,
})

describe('content rect conversion', () => {
  it('reads a neutral transform as the whole Zone', () => {
    expect(contentRectFromTransform(NEUTRAL_SHOW_CLIP_TRANSFORM)).toEqual({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('round-trips an edge-valued rect through centre and scale storage', () => {
    const rect = { left: 0.25, top: 0.5, width: 0.5, height: 0.25 }
    expect(contentRectFromTransform(transformFromContentRect(rect, 0))).toEqual(rect)
  })

  it('keeps rotation across the round trip', () => {
    expect(transformFromContentRect({ left: 0, top: 0, width: 1, height: 1 }, 0.125).rotation).toBe(0.125)
  })
})

describe('grid snapping quantises edges, not the centre', () => {
  it('lands an odd-width box on exact cell boundaries', () => {
    expect(snapPlacementRect({ left: 0.31, top: 0.02, width: 0.34, height: 0.3 }, 3))
      .toEqual({ left: 1 / 3, top: 0, width: 1 / 3, height: 1 / 3 })
  })

  it('never collapses a box below one cell', () => {
    expect(snapPlacementRect({ left: 0.5, top: 0.5, width: 0.001, height: 0.001 }, 4).width).toBeCloseTo(0.25)
  })

  it('snaps a dragged corner onto the lattice when no viewport is present', () => {
    const padContext = context({}, {}, 4)
    const anchor = placementCornerAnchor(contentRectFromTransform(padContext.transform), 'se')
    const rect = contentRectFromTransform(resizeContentToAnchor(padContext, anchor, 0.51, 0.51).transform!)
    expect(rect).toEqual({ left: 0, top: 0, width: 0.5, height: 0.5 })
  })

  it('stops snapping content once a viewport owns the composition', () => {
    const padContext = context({}, { enabled: true, x: 0, y: 0, width: 1 / 3, height: 1 }, 3)
    expect(moveContentCentre(padContext, 0.4, 0.4).transform!.positionX).toBeCloseTo(-0.1)
  })

  it('preserves non-lattice content size during a gridded move', () => {
    const padContext = context({ scaleX: 0.5, scaleY: 0.5 }, {}, 3)
    const moved = contentRectFromTransform(moveContentCentre(padContext, 0.58, 0.58).transform!)

    expect(moved.left).toBeCloseTo(1 / 3)
    expect(moved.top).toBeCloseTo(1 / 3)
    expect(moved.width).toBeCloseTo(0.5)
    expect(moved.height).toBeCloseTo(0.5)
  })

  it('preserves non-lattice aperture size during a gridded move', () => {
    const padContext = context({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 }, 3)
    const moved = viewportRect(moveViewportTo(padContext, 0.3, 0.3).viewport!)

    expect(moved.left).toBeCloseTo(1 / 3)
    expect(moved.top).toBeCloseTo(1 / 3)
    expect(moved.width).toBeCloseTo(0.5)
    expect(moved.height).toBeCloseTo(0.5)
  })
})

describe('resize holds the anchor captured at pointer down', () => {
  it('does not let the box run away across successive moves', () => {
    const padContext = context()
    const anchor = placementCornerAnchor(contentRectFromTransform(padContext.transform), 'nw')
    let transform = padContext.transform
    for (const pointer of [0.6, 0.7, 0.8, 0.9]) {
      transform = resizeContentToAnchor({ ...padContext, transform }, anchor, pointer, pointer).transform!
    }
    const rect = contentRectFromTransform(transform)
    expect(rect.left).toBeCloseTo(0.9)
    expect(rect.left + rect.width).toBeCloseTo(1)
  })

  it('keeps the opposite edge still while a left corner is dragged', () => {
    const padContext = context()
    const anchor = placementCornerAnchor(contentRectFromTransform(padContext.transform), 'nw')
    const rect = contentRectFromTransform(resizeContentToAnchor(padContext, anchor, -0.5, 0.25).transform!)
    expect(rect.left).toBeCloseTo(-0.5)
    expect(rect.left + rect.width).toBeCloseTo(1)
  })

  it('keeps the opposite corner pinned when a uniform resize expands the shorter axis', () => {
    const padContext = context({}, { enabled: true })
    const anchor = placementCornerAnchor(contentRectFromTransform(padContext.transform), 'nw')
    const rect = contentRectFromTransform(
      resizeContentToAnchor(padContext, anchor, 0.4, 0.6, { uniform: true }).transform!,
    )

    expect(rect.left).toBeCloseTo(0.4)
    expect(rect.top).toBeCloseTo(0.4)
    expect(rect.width).toBeCloseTo(0.6)
    expect(rect.height).toBeCloseTo(0.6)
    expect(rect.left + rect.width).toBeCloseTo(anchor.x)
    expect(rect.top + rect.height).toBeCloseTo(anchor.y)
  })

  it.each([
    { corner: 'nw' as const, pointer: [0.4, 0.6], horizontal: 'right', vertical: 'bottom' },
    { corner: 'ne' as const, pointer: [0.6, 0.4], horizontal: 'left', vertical: 'bottom' },
    { corner: 'sw' as const, pointer: [0.4, 0.6], horizontal: 'right', vertical: 'top' },
    { corner: 'se' as const, pointer: [0.6, 0.4], horizontal: 'left', vertical: 'top' },
  ])('pins the $corner opposite corner throughout uniform resize', ({ corner, pointer, horizontal, vertical }) => {
    const padContext = context({}, { enabled: true })
    const anchor = placementCornerAnchor(contentRectFromTransform(padContext.transform), corner)
    const rect = contentRectFromTransform(
      resizeContentToAnchor(padContext, anchor, pointer[0], pointer[1], { uniform: true }).transform!,
    )

    expect(rect.width).toBeCloseTo(rect.height)
    expect(horizontal === 'left' ? rect.left : rect.left + rect.width).toBeCloseTo(anchor.x)
    expect(vertical === 'top' ? rect.top : rect.top + rect.height).toBeCloseTo(anchor.y)
  })

  it('keeps the anchor pinned when the minimum size floor expands both axes', () => {
    const padContext = context({}, { enabled: true })
    const anchor = placementCornerAnchor(contentRectFromTransform(padContext.transform), 'nw')
    const rect = contentRectFromTransform(
      resizeContentToAnchor(padContext, anchor, 0.9999, 0.9998, { uniform: true }).transform!,
    )

    expect(rect.width).toBeCloseTo(rect.height)
    expect(rect.width).toBeGreaterThan(0.0002)
    expect(rect.left + rect.width).toBeCloseTo(anchor.x)
    expect(rect.top + rect.height).toBeCloseTo(anchor.y)
  })
})

describe('edge magnets', () => {
  const framed = () => context({}, { enabled: true, x: 0.2, y: 0.2, width: 0.6, height: 0.4 })

  it('lands an exact fit when a content drag comes close', () => {
    const rect = contentRectFromTransform(resizeContentToAnchor(framed(), { x: 0.2, y: 0.2 }, 0.79, 0.61).transform!)
    expect(rect.left).toBeCloseTo(0.2)
    expect(rect.width).toBeCloseTo(0.6)
    expect(rect.height).toBeCloseTo(0.4)
  })

  it('pulls a viewport resize onto the content edges too', () => {
    const padContext = context({ positionX: -0.15, scaleX: 0.5, scaleY: 0.5 }, { enabled: true, x: 0.6, y: 0.6, width: 0.3, height: 0.3 })
    const content = contentRectFromTransform(padContext.transform)
    const next = viewportRect(setViewportRect(padContext, {
      left: content.left + 0.01,
      top: content.top - 0.008,
      width: content.width,
      height: content.height,
    }).viewport!)
    expect(next.left).toBeCloseTo(content.left)
    expect(next.top).toBeCloseTo(content.top)
  })

  it('leaves a deliberately different size alone', () => {
    const rect = stickPlacementRect({ left: 0.4, top: 0.3, width: 0.1, height: 0.05 }, [viewportRect(framed().viewport)])
    expect(rect.left).toBeCloseTo(0.4)
    expect(rect.width).toBeCloseTo(0.1)
  })

  it('translates on a move instead of resizing', () => {
    const rect = stickPlacementTranslate({ left: 0.19, top: 0.5, width: 0.2, height: 0.2 }, [viewportRect(framed().viewport)])
    expect(rect.left).toBeCloseTo(0.2)
    expect(rect.width).toBeCloseTo(0.2)
    expect(rect.height).toBeCloseTo(0.2)
  })

  it('keeps a moved viewport the same size', () => {
    const padContext = context({}, { enabled: true, x: 0.25, y: 0.25, width: 0.3, height: 0.2 })
    const moved = viewportRect(moveViewportTo(padContext, 0.505, 0.4).viewport!)
    expect(moved.width).toBeCloseTo(0.3)
    expect(moved.height).toBeCloseTo(0.2)
  })
})

describe('dragging stops once the content is clear of the Zone', () => {
  it('lets a full-size clip sit exactly one edge past the Zone', () => {
    const rect = contentRectFromTransform(moveContentCentre(context(), -8, 0.5).transform!)
    expect(rect.left).toBeCloseTo(-1)
    expect(rect.left + rect.width).toBeCloseTo(0)
  })

  it('stops at the far edge on the other side too', () => {
    const rect = contentRectFromTransform(moveContentCentre(context(), 9, 9).transform!)
    expect(rect.left).toBeCloseTo(1)
    expect(rect.top).toBeCloseTo(1)
  })

  it('keeps a clamped clip on the cell lattice', () => {
    const padContext = context({ scaleX: 1 / 3, scaleY: 1 / 3 }, {}, 3)
    const rect = contentRectFromTransform(moveContentCentre(padContext, -5, 0.5).transform!)
    expect(rect.left).toBeCloseTo(-1 / 3)
  })

  it('clamps arrow-key nudges the same way', () => {
    let transform = context().transform
    for (let step = 0; step < 400; step += 1) {
      transform = nudgeContent({ ...context(), transform }, -0.01, 0).transform!
    }
    expect(contentRectFromTransform(transform).left).toBeCloseTo(-1)
  })

  it('nudges an aperture by the exact keyboard step without snapping to its grid', () => {
    const padContext = context({}, {
      enabled: true,
      x: 1 / 3,
      y: 1 / 3,
      width: 1 / 3,
      height: 1 / 3,
    }, 3)
    const rect = viewportRect(nudgeViewport(padContext, 0.01, 0.1).viewport!)

    expect(rect.left).toBeCloseTo(1 / 3 + 0.01)
    expect(rect.top).toBeCloseTo(1 / 3 + 0.1)
    expect(rect.width).toBeCloseTo(1 / 3)
    expect(rect.height).toBeCloseTo(1 / 3)
  })

  it('does not move a rect that is already inside', () => {
    expect(clampPlacementRectToZone({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 }, 0).left).toBe(0.25)
  })
})

describe('rotation detent', () => {
  it('snaps a near-upright angle to exactly zero', () => {
    expect(detentPlacementRotation(3 / 360)).toBe(0)
    expect(detentPlacementRotation(-3 / 360)).toBe(0)
  })

  it('snaps a hair under a full turn to zero as well', () => {
    expect(detentPlacementRotation(357 / 360)).toBe(0)
  })

  it('leaves a deliberate angle alone', () => {
    expect(detentPlacementRotation(30 / 360)).toBeCloseTo(30 / 360)
  })
})

describe('fit and anchor against the target rect', () => {
  const framed = () => context({}, { enabled: true, x: 0.25, y: 0, width: 0.5, height: 1 })

  it('fit contains the content inside a tall viewport', () => {
    expect(contentRectFromTransform(applyContentFit(framed(), 'fit').transform!))
      .toEqual({ left: 0.25, top: 0.25, width: 0.5, height: 0.5 })
  })

  it('fill covers the viewport and overflows the short axis', () => {
    expect(contentRectFromTransform(applyContentFit(framed(), 'fill').transform!))
      .toEqual({ left: 0, top: 0, width: 1, height: 1 })
  })

  it('stretch matches the viewport on both axes independently', () => {
    expect(contentRectFromTransform(applyContentFit(framed(), 'stretch').transform!))
      .toEqual({ left: 0.25, top: 0, width: 0.5, height: 1 })
  })

  it('preserves rotation through a fit', () => {
    const rotated = context({ rotation: 0.125 }, { enabled: true, x: 0.25, y: 0, width: 0.5, height: 1 })
    expect(applyContentFit(rotated, 'fit').transform!.rotation).toBe(0.125)
  })

  it('places a half-size box in the bottom right of the Zone', () => {
    const padContext = context({ scaleX: 0.5, scaleY: 0.5 })
    expect(contentRectFromTransform(anchorContent(padContext, 2, 2).transform!))
      .toEqual({ left: 0.5, top: 0.5, width: 0.5, height: 0.5 })
  })
})

describe('viewport sweep and framing', () => {
  it('turns two points into an inclusive cell span', () => {
    const padContext = context({}, { enabled: true }, 3)
    const swept = viewportRect(sweepViewport(padContext, 0.1, 0.1, 0.4, 0.9).viewport!)
    expect(swept.left).toBeCloseTo(0)
    expect(swept.width).toBeCloseTo(2 / 3)
    expect(swept.height).toBeCloseTo(1)
  })

  it('adopts the content bounds when framing', () => {
    const padContext = context({ positionX: -0.25, scaleX: 0.5, scaleY: 0.5 }, { enabled: true })
    const framed = viewportRect(frameContent(padContext).viewport!)
    expect(framed.left).toBeCloseTo(0)
    expect(framed.top).toBeCloseTo(0.25)
    expect(framed.width).toBeCloseTo(0.5)
  })

  it('leaves the content untouched when framing, so property lanes survive', () => {
    const padContext = context({ positionX: -0.25, positionY: 0.1, scaleX: 0.5, scaleY: 0.5, rotation: 0.25 }, { enabled: true })
    expect(frameContent(padContext).transform).toBeUndefined()
  })

  it('carries content with the viewport only when asked', () => {
    const padContext = context({}, { enabled: true, x: 0, y: 0, width: 0.5, height: 0.5 })
    expect(moveViewportTo(padContext, 0.25, 0, { carryContent: true }).transform!.positionX).toBeCloseTo(0.25)
    expect(moveViewportTo(padContext, 0.25, 0).transform).toBeUndefined()
  })
})

describe('enabling the viewport opens on what the clip already covers', () => {
  it('adopts the content bounds rather than the whole Zone', () => {
    const padContext = context({ positionY: -0.25, scaleY: 0.5 })
    expect(enableViewportForContent(padContext)).toMatchObject({ enabled: true, x: 0, y: 0, width: 1, height: 0.5 })
  })

  it('crops the default to the Zone, since nothing outside it is visible', () => {
    const padContext = context({ positionX: -0.5 })
    expect(enableViewportForContent(padContext)).toMatchObject({ x: 0, width: 0.5 })
  })

  it('restores authored geometry instead of re-deriving it', () => {
    const padContext = context({ scaleX: 0.2, scaleY: 0.2 }, { enabled: false, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    expect(enableViewportForContent(padContext)).toMatchObject({ enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
  })

  it('falls back to the Zone when no content is visible at all', () => {
    const padContext = context({ positionX: 3.5 })
    expect(enableViewportForContent(padContext)).toMatchObject({ x: 0, y: 0, width: 1, height: 1 })
  })
})

describe('pad view follows content out of the Zone', () => {
  it('stays tight when everything is inside', () => {
    const view = placementPadView(context())
    expect(view.max - view.min).toBeCloseTo(1.7)
  })

  it('zooms out far enough to reach a clip parked outside the Zone', () => {
    expect(placementPadView(context({ positionX: -2 / 3, positionY: -2 / 3 })).min).toBeLessThan(-2 / 3)
  })

  it('stays centred on the Zone so the artwork does not slide under the pointer', () => {
    const view = placementPadView(context({ positionX: -1, positionY: 0.4 }))
    expect((view.min + view.max) / 2).toBeCloseTo(0.5)
  })
})

describe('framing ignores the lattice', () => {
  it('matches the content exactly even on a coarse grid', () => {
    const padContext = context({ scaleX: 0.5, scaleY: 0.5 }, { enabled: true }, 3)
    const framed = viewportRect(frameContent(padContext).viewport!)
    expect(framed.width).toBeCloseTo(0.5)
    expect(framed.left).toBeCloseTo(0.25)
  })

  it('still snaps an ordinary sweep on the same grid', () => {
    const padContext = context({ scaleX: 0.5, scaleY: 0.5 }, { enabled: true }, 3)
    expect(viewportRect(sweepViewport(padContext, 0.1, 0.1, 0.1, 0.1).viewport!).width).toBeCloseTo(1 / 3)
  })
})

describe('resolvePlacementPositionPresentation (#633)', () => {
  it('windows the slider to two stage units while exact entry keeps the full bounds', () => {
    const presentation = resolvePlacementPositionPresentation(3)
    expect(presentation.min).toBe(-4)
    expect(presentation.max).toBe(4)
    expect(presentation.sliderMin).toBe(-2)
    expect(presentation.sliderMax).toBe(2)
    expect(presentation.neutralPosition).toBe(0.5)
  })

  it('places detents on the selected grid cells with labeled whole units', () => {
    const presentation = resolvePlacementPositionPresentation(4)
    const values = presentation.sliderMarks.map((mark) => mark.value)
    expect(values[0]).toBe(-2)
    expect(values[values.length - 1]).toBe(2)
    expect(values).toContain(0.25)
    expect(values).toContain(-0.75)
    expect(values).toHaveLength(17)
    const majors = presentation.sliderMarks.filter((mark) => mark.major)
    expect(majors.map((mark) => mark.label)).toEqual(['-2', '-1', '0', '1', '2'])
  })

  it('magnetizes pointer travel onto the selected grid', () => {
    const grid3 = resolvePlacementPositionPresentation(3)
    expect(grid3.snapSliderValue(1 / 3 + 0.05)).toBeCloseTo(1 / 3, 10)
    const grid12 = resolvePlacementPositionPresentation(12)
    expect(grid12.snapSliderValue(1 / 12 + 0.01)).toBeCloseTo(1 / 12, 10)
  })

  it('falls back to half-unit detents when the grid is Free', () => {
    const free = resolvePlacementPositionPresentation(0)
    const values = free.sliderMarks.map((mark) => mark.value)
    expect(values).toEqual([-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2])
  })

  it('never travels finer than tenths outside a detent (#682)', () => {
    const free = resolvePlacementPositionPresentation(0)
    expect(free.sliderStep).toBe(0.1)
    expect(free.snapSliderValue(0.72)).toBeCloseTo(0.7, 10)
    const grid12 = resolvePlacementPositionPresentation(12)
    expect(grid12.snapSliderValue(0.06)).toBeCloseTo(0.1, 10)
  })

  it('pulls hard toward centre and the just-offstage whole units (#682)', () => {
    const free = resolvePlacementPositionPresentation(0)
    expect(free.snapSliderValue(0.12)).toBe(0)
    expect(free.snapSliderValue(-0.88)).toBe(-1)
    expect(free.snapSliderValue(1.12)).toBe(1)
    // The strong stops shrink with the cell so a dense grid stays reachable.
    const grid12 = resolvePlacementPositionPresentation(12)
    expect(grid12.snapSliderValue(0.03)).toBe(0)
    expect(grid12.snapSliderValue(1 / 12 + 0.01)).toBeCloseTo(1 / 12, 10)
  })
})

describe('resolvePlacementScalePresentation (#682)', () => {
  it('presents the multiplier window with 1x neutral and tenth travel', () => {
    const presentation = resolvePlacementScalePresentation(0)
    expect(presentation.min).toBe(0.01)
    expect(presentation.max).toBe(8)
    expect(presentation.suffix).toBe('x')
    expect(presentation.neutralPosition).toBeCloseTo(0.5, 10)
    expect(presentation.sliderStep).toBe(0.1)
    expect(presentation.format(1.5)).toBe('1.5x')
    expect(presentation.parseDraft('1.5x')).toBe(1.5)
    expect(presentation.formatDraft(1.234)).toBe('1.23')
    expect(presentation.snapSliderValue(0.74)).toBeCloseTo(0.7, 10)
  })

  it('detents on the grid fractions through two units with a strong 1x stop', () => {
    const thirds = resolvePlacementScalePresentation(3)
    const values = thirds.sliderMarks.map((mark) => mark.value)
    for (const expected of [1 / 3, 2 / 3, 1, 4 / 3, 5 / 3, 2]) {
      expect(values.some((value) => Math.abs(value - expected) < 1e-9)).toBe(true)
    }
    expect(thirds.snapSliderValue(1 / 3 + 0.05)).toBeCloseTo(1 / 3, 10)
    expect(thirds.snapSliderValue(1.05)).toBe(1)
    const free = resolvePlacementScalePresentation(0)
    expect(free.snapSliderValue(1.08)).toBe(1)
    expect(free.snapSliderValue(1.55)).toBe(1.5)
  })

  it('keeps whole-unit stops above the fraction band and labels landmarks', () => {
    const presentation = resolvePlacementScalePresentation(3)
    const values = presentation.sliderMarks.map((mark) => mark.value)
    for (const expected of [3, 4, 5, 6, 7, 8]) expect(values).toContain(expected)
    expect(presentation.snapSliderValue(3.85)).toBe(4)
    expect(presentation.snapSliderValue(2.5)).toBeCloseTo(2.5, 10)
    const labels = presentation.sliderMarks.filter((mark) => mark.label).map((mark) => mark.label)
    expect(labels).toEqual(['1', '2', '4', '8'])
    const positions = presentation.sliderMarks.map((mark) => mark.position)
    expect([...positions].sort((a, b) => a - b)).toEqual(positions)
  })
})

describe('shaped aperture support (#591)', () => {
  it('squares a Shift corner resize so an ellipse stays a circle', () => {
    const padContext = context({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    const result = resizeViewportToAnchor(padContext, { x: 0.25, y: 0.25 }, 0.85, 0.65, { square: true })
    expect(result.viewport).toMatchObject({ x: 0.25, y: 0.25, width: 0.6, height: 0.6 })
  })

  it('keeps the free corner resize rectangular without the option', () => {
    const padContext = context({}, { enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5 })
    const result = resizeViewportToAnchor(padContext, { x: 0.25, y: 0.25 }, 0.85, 0.65)
    expect(result.viewport).toMatchObject({ x: 0.25, y: 0.25, width: 0.6, height: 0.4 })
  })

  it('keeps the Shift square exact under grid snapping and magnets', () => {
    const padContext = context({}, { enabled: true, x: 0.2, y: 0, width: 0.5, height: 0.5 }, 3)
    const result = resizeViewportToAnchor(padContext, { x: 0.2, y: 0 }, 0.7, 0.5, { square: true })
    expect(result.viewport!.width).toBe(result.viewport!.height)
    // The side still lands on the 3x grid: 0.5 rounds to 2/3.
    expect(result.viewport!.width).toBeCloseTo(2 / 3, 10)
  })

  it('caps the square at the Zone without moving the anchored corner', () => {
    const padContext = context({}, { enabled: true, x: 0.5, y: 0.5, width: 0.4, height: 0.4 })
    const result = resizeViewportToAnchor(padContext, { x: 0.5, y: 0.5 }, 1.4, 0.9, { square: true })
    expect(result.viewport).toMatchObject({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 })
  })

  it('honors the grid inside the anchor cap when snapping would overflow', () => {
    const padContext = context({}, { enabled: true, x: 0.5, y: 0.5, width: 0.3, height: 0.3 }, 3)
    const result = resizeViewportToAnchor(padContext, { x: 0.5, y: 0.5 }, 1.2, 1.2, { square: true })
    expect(result.viewport!.width).toBe(result.viewport!.height)
    expect(result.viewport!.x).toBe(0.5)
    expect(result.viewport!.y).toBe(0.5)
    expect(result.viewport!.width).toBeCloseTo(1 / 3, 10)
  })

  it('flips growth away from an anchored Zone edge instead of overflowing', () => {
    const padContext = context({}, { enabled: true, x: 0, y: 0, width: 1, height: 1 })
    const result = resizeViewportToAnchor(padContext, { x: 1, y: 1 }, 1, 0.5, { square: true })
    expect(result.viewport).toMatchObject({ x: 0.5, y: 0.5, width: 0.5, height: 0.5 })
  })

  it('carries aperture styling through every gesture result', () => {
    const padContext = context({}, {
      enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5,
      aperture: 'ellipse', edge: 'soft', feather: 0.05,
    })
    const moved = moveViewportTo(padContext, 0.1, 0.1)
    expect(moved.viewport).toMatchObject({ aperture: 'ellipse', edge: 'soft', feather: 0.05 })
    const resized = resizeViewportToAnchor(padContext, { x: 0.25, y: 0.25 }, 0.9, 0.8)
    expect(resized.viewport).toMatchObject({ aperture: 'ellipse', edge: 'soft', feather: 0.05 })
    const squared = resizeViewportToAnchor(padContext, { x: 0.25, y: 0.25 }, 0.9, 0.8, { square: true })
    expect(squared.viewport).toMatchObject({ aperture: 'ellipse', edge: 'soft', feather: 0.05 })
    const swept = sweepViewport(padContext, 0.1, 0.1, 0.6, 0.6)
    expect(swept.viewport).toMatchObject({ aperture: 'ellipse', edge: 'soft', feather: 0.05 })
  })

  it('carries shape parameters through gesture results (#678)', () => {
    const ringContext = context({}, {
      enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5,
      aperture: 'ring', ringWidth: 0.5,
    })
    expect(moveViewportTo(ringContext, 0.1, 0.1).viewport)
      .toMatchObject({ aperture: 'ring', ringWidth: 0.5 })
    const boxContext = context({}, {
      enabled: true, x: 0.25, y: 0.25, width: 0.5, height: 0.5,
      aperture: 'rounded-box', cornerRadius: 0.4,
    })
    expect(resizeViewportToAnchor(boxContext, { x: 0.25, y: 0.25 }, 0.9, 0.8).viewport)
      .toMatchObject({ aperture: 'rounded-box', cornerRadius: 0.4 })
    expect(resizeViewportToAnchor(boxContext, { x: 0.25, y: 0.25 }, 0.9, 0.8, { square: true }).viewport)
      .toMatchObject({ aperture: 'rounded-box', cornerRadius: 0.4 })
  })

  it('preserves an authored aperture shape and edge through first enable', () => {
    const padContext = context({}, { aperture: 'ellipse', edge: 'soft', feather: 0.05 })
    expect(enableViewportForContent(padContext)).toMatchObject({
      enabled: true,
      aperture: 'ellipse',
      edge: 'soft',
      feather: 0.05,
    })
  })
})
