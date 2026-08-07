import { placeAnchoredOverlay } from './useAnchoredOverlayPosition'

describe('placeAnchoredOverlay', () => {
  const anchor = { left: 900, right: 980, top: 650, bottom: 670, width: 80, height: 20 }
  const viewport = { width: 1000, height: 720 }

  it('flips a tall bottom menu above a low trigger and keeps it inside the viewport', () => {
    expect(placeAnchoredOverlay({
      anchor,
      overlay: { width: 352, height: 500 },
      viewport,
      align: 'right',
      preferredSide: 'bottom',
    })).toEqual({
      left: 628,
      top: 146,
      maxWidth: 984,
      maxHeight: 638,
      side: 'top',
    })
  })

  it('clamps a left-aligned overlay at both viewport edges', () => {
    expect(placeAnchoredOverlay({
      anchor: { ...anchor, left: 990, right: 1010 },
      overlay: { width: 240, height: 120 },
      viewport,
      align: 'left',
      preferredSide: 'top',
    }).left).toBe(752)
  })
})
