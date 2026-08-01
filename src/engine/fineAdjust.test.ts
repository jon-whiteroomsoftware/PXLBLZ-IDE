import { beginFineAdjust, moveFineAdjust } from './fineAdjust'

describe('fine-adjust drag accumulation (#667)', () => {
  it('matches absolute pointer tracking while the modifier is up', () => {
    let drag = beginFineAdjust(400, 0.5)
    drag = moveFineAdjust(drag, 424, { fine: false, scale: 1 / 200 })
    drag = moveFineAdjust(drag, 446, { fine: false, scale: 1 / 200 })
    expect(drag.position).toBeCloseTo(0.5 + 46 / 200, 12)
  })

  it('scales travel by a tenth while the modifier is down', () => {
    let drag = beginFineAdjust(0, 0.5)
    drag = moveFineAdjust(drag, 100, { fine: true, scale: 1 / 200 })
    expect(drag.position).toBeCloseTo(0.55, 12)
  })

  it('re-anchors on every modifier toggle without jumping', () => {
    let drag = beginFineAdjust(0, 0.2)
    drag = moveFineAdjust(drag, 20, { fine: false, scale: 0.01 })
    expect(drag.position).toBeCloseTo(0.4, 12)
    // Pressing the modifier continues from 0.4 — no snap back toward the
    // absolute pointer mapping.
    drag = moveFineAdjust(drag, 40, { fine: true, scale: 0.01 })
    expect(drag.position).toBeCloseTo(0.42, 12)
    // Releasing it resumes coarse deltas from where fine left off.
    drag = moveFineAdjust(drag, 60, { fine: false, scale: 0.01 })
    expect(drag.position).toBeCloseTo(0.62, 12)
    drag = moveFineAdjust(drag, 40, { fine: true, scale: 0.01 })
    expect(drag.position).toBeCloseTo(0.6, 12)
  })

  it('keeps overshoot so leaving a bound unwinds over the same travel', () => {
    let drag = beginFineAdjust(0, 0.9)
    drag = moveFineAdjust(drag, 30, { fine: false, scale: 0.01 })
    expect(drag.position).toBeCloseTo(1.2, 12)
    expect(Math.min(1, drag.position)).toBe(1)
    drag = moveFineAdjust(drag, 20, { fine: false, scale: 0.01 })
    expect(drag.position).toBeCloseTo(1.1, 12)
  })

  it('honors a custom gain', () => {
    const drag = moveFineAdjust(beginFineAdjust(0, 0), 10, { fine: true, scale: 1, gain: 0.5 })
    expect(drag.position).toBeCloseTo(5, 12)
  })
})
