import { describe, expect, it } from 'vitest'
import { placeShowPlacementPad } from './showPlacementPadAnchoring'

const base = {
  anchor: { left: 390, top: 360, width: 240, height: 26 },
  panel: { left: 380, top: 215, width: 340, height: 350 },
  pad: { width: 440, height: 470 },
  viewport: { width: 1400, height: 900 },
}

describe('side selection', () => {
  it('sits to the right of the panel when there is room', () => {
    const placed = placeShowPlacementPad(base)
    expect(placed.side).toBe('right')
    expect(placed.left).toBe(730)
  })

  it('clears the panel on the left when the right side cannot hold it', () => {
    const placed = placeShowPlacementPad({ ...base, panel: { ...base.panel, left: 500 }, viewport: { width: 1000, height: 900 } })
    expect(placed.side).toBe('left')
    expect(placed.left + base.pad.width).toBeLessThanOrEqual(500)
  })

  it('stays on screen even when neither side has room, overlapping instead', () => {
    const placed = placeShowPlacementPad({ ...base, viewport: { width: 1000, height: 900 } })
    expect(placed.side).toBe('left')
    expect(placed.left).toBeGreaterThanOrEqual(8)
    expect(placed.left + base.pad.width).toBeLessThanOrEqual(1000 - 8 + 0.001)
  })

  it('keeps the wider side when neither fits outright', () => {
    const placed = placeShowPlacementPad({
      ...base,
      panel: { ...base.panel, left: 120 },
      viewport: { width: 700, height: 900 },
    })
    expect(placed.side).toBe('right')
  })

  it('never leaves the viewport horizontally', () => {
    const placed = placeShowPlacementPad({ ...base, viewport: { width: 500, height: 900 } })
    expect(placed.left).toBeGreaterThanOrEqual(8)
    expect(placed.left + base.pad.width).toBeLessThanOrEqual(500 - 8 + 0.001)
  })
})

describe('vertical placement', () => {
  it('lines up with the row that opened it', () => {
    expect(placeShowPlacementPad(base).top).toBe(360)
  })

  it('pulls back up rather than running off the bottom', () => {
    const placed = placeShowPlacementPad({ ...base, anchor: { ...base.anchor, top: 800 } })
    expect(placed.top + base.pad.height).toBeLessThanOrEqual(900 - 8 + 0.001)
  })

  it('does not run off the top either', () => {
    const placed = placeShowPlacementPad({ ...base, anchor: { ...base.anchor, top: -200 } })
    expect(placed.top).toBe(8)
  })

  it('reports the room available so a tall pad can scroll', () => {
    const placed = placeShowPlacementPad({ ...base, viewport: { width: 1400, height: 400 } })
    expect(placed.maxHeight).toBe(384)
    expect(placed.top).toBe(8)
  })
})

describe('stem', () => {
  it('points back at the row within the pad body', () => {
    const placed = placeShowPlacementPad(base)
    expect(placed.stemTop).toBeCloseTo(13)
  })

  it('stays inside the pad when the row is far above', () => {
    const placed = placeShowPlacementPad({ ...base, anchor: { ...base.anchor, top: 800 } })
    expect(placed.stemTop).toBeGreaterThanOrEqual(10)
    expect(placed.stemTop).toBeLessThanOrEqual(base.pad.height - 10)
  })
})
