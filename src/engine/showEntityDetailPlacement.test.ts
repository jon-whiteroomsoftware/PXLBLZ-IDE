import { describe, expect, it } from 'vitest'
import { placeShowEntityDetailPanel } from './showEntityDetailPlacement'

describe('Show Entity Detail Panel placement (#467, #665)', () => {
  it('prefers the right side when the complete panel fits there', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 200, top: 300, width: 160, height: 44 },
      panel: { width: 400, height: 260 },
      viewport: { width: 1000, height: 800 },
    })).toEqual({ left: 370, top: 192, maxHeight: 784, placement: 'right', stemTop: 130 })
  })

  it('uses the left side when the right side cannot hold the complete panel', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 600, top: 300, width: 160, height: 44 },
      panel: { width: 400, height: 260 },
      viewport: { width: 1000, height: 800 },
    })).toEqual({ left: 190, top: 192, maxHeight: 784, placement: 'left', stemTop: 130 })
  })

  it('centers below the owner when there is room and aligns the stem', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 220, top: 100, width: 160, height: 44 },
      panel: { width: 400, height: 260 },
      viewport: { width: 600, height: 800 },
    })).toEqual({ left: 100, top: 154, maxHeight: 638, placement: 'below', stemLeft: 200 })
  })

  it('flips above when the lower viewport cannot hold the panel', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 240, top: 620, width: 120, height: 44 },
      panel: { width: 420, height: 300 },
      viewport: { width: 600, height: 720 },
    })).toEqual({ left: 90, top: 310, maxHeight: 602, placement: 'above', stemLeft: 210 })
  })

  it('shifts inside narrow viewport margins while keeping the stem reachable', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 4, top: 80, width: 40, height: 44 },
      panel: { width: 360, height: 240 },
      viewport: { width: 390, height: 700 },
    })).toEqual({ left: 8, top: 134, maxHeight: 558, placement: 'below', stemLeft: 16 })
  })

  it('uses the full vertical viewport budget and clamps a tall side panel', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 623, top: 321, width: 289, height: 44 },
      panel: { width: 340, height: 900 },
      viewport: { width: 1280, height: 720 },
    })).toEqual({ left: 922, top: 8, maxHeight: 704, placement: 'right', stemTop: 335 })
  })

  it('uses the left side when a pinned panel occupies the preferred right side', () => {
    expect(placeShowEntityDetailPanel({
      anchor: { left: 620, top: 300, width: 160, height: 44 },
      panel: { width: 400, height: 260 },
      viewport: { width: 1400, height: 800 },
      avoid: [{ left: 790, top: 192, width: 400, height: 260 }],
    })).toEqual({ left: 210, top: 192, maxHeight: 784, placement: 'left', stemTop: 130 })
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
