import { describe, expect, it } from 'vitest'
import { placeShowEntityDetailPanel } from './showEntityDetailPlacement'

describe('Show Entity Detail Panel placement (#467)', () => {
  it('centers below the owner when there is room and aligns the stem', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 200, top: 100, width: 160, height: 44 },
      panel: { width: 400, height: 260 },
      viewport: { width: 1000, height: 800 },
    })).toEqual({ left: 80, top: 154, maxHeight: 638, placement: 'below', stemLeft: 200 })
  })

  it('flips above when the lower viewport cannot hold the panel', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 540, top: 620, width: 120, height: 44 },
      panel: { width: 420, height: 300 },
      viewport: { width: 1000, height: 720 },
    })).toEqual({ left: 390, top: 310, maxHeight: 602, placement: 'above', stemLeft: 210 })
  })

  it('shifts inside narrow viewport margins while keeping the stem reachable', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 4, top: 80, width: 40, height: 44 },
      panel: { width: 360, height: 240 },
      viewport: { width: 390, height: 700 },
    })).toEqual({ left: 8, top: 134, maxHeight: 558, placement: 'below', stemLeft: 16 })
  })

  it('preserves the source gap and constrains height when neither side fits the full panel', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 623, top: 321, width: 289, height: 44 },
      panel: { width: 340, height: 480 },
      viewport: { width: 1280, height: 720 },
    })).toEqual({ left: 597.5, top: 375, maxHeight: 337, placement: 'below', stemLeft: 170 })
  })

  it('packs a comparison panel beside an existing pinned panel without losing its source stem', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 314, top: 277, width: 275, height: 44 },
      panel: { width: 340, height: 178 },
      viewport: { width: 900, height: 720 },
      avoid: [{ left: 552, top: 375, width: 340, height: 337 }],
    })).toEqual({ left: 204, top: 331, maxHeight: 381, placement: 'below', stemLeft: 247.5 })
  })
})
