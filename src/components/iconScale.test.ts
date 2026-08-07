import { describe, expect, it } from 'vitest'
import {
  ICON_CONTROL,
  ICON_INLINE,
  ICON_RAIL,
  controlIcon,
  iconProps,
  iconStroke,
  inlineIcon,
  railIcon,
  transportIcon,
} from './iconScale'

describe('iconStroke', () => {
  it('leaves the rail reference on Lucide\'s own weight', () => {
    expect(iconStroke(ICON_RAIL)).toBe(2)
  })

  it('compensates every size below the rail reference', () => {
    expect(iconStroke(ICON_CONTROL)).toBeGreaterThan(iconStroke(ICON_RAIL))
    expect(iconStroke(ICON_INLINE)).toBeGreaterThan(iconStroke(ICON_RAIL))
  })

  it('caps compensation so interior counters stay open', () => {
    expect(iconStroke(8)).toBeLessThanOrEqual(2.25)
  })

  it('never thins a glyph larger than the rail reference', () => {
    expect(iconStroke(24)).toBe(2)
  })
})

describe('icon tiers', () => {
  it('orders rail above control above inline', () => {
    expect(ICON_RAIL).toBeGreaterThan(ICON_CONTROL)
    expect(ICON_CONTROL).toBeGreaterThan(ICON_INLINE)
  })

  it('pairs each tier with its compensated weight', () => {
    expect(railIcon).toEqual({ size: ICON_RAIL, strokeWidth: iconStroke(ICON_RAIL) })
    expect(controlIcon).toEqual({ size: ICON_CONTROL, strokeWidth: iconStroke(ICON_CONTROL) })
    expect(inlineIcon).toEqual({ size: ICON_INLINE, strokeWidth: iconStroke(ICON_INLINE) })
  })

  it('gives sparse transport glyphs weight past the cap at control size', () => {
    expect(transportIcon.size).toBe(ICON_CONTROL)
    expect(transportIcon.strokeWidth).toBeGreaterThan(controlIcon.strokeWidth)
  })
})

describe('iconProps', () => {
  it('weights an arbitrary size to match its tier neighbours', () => {
    expect(iconProps(11)).toEqual({ size: 11, strokeWidth: iconStroke(11) })
    expect(iconProps(20)).toEqual({ size: 20, strokeWidth: 2 })
  })
})
