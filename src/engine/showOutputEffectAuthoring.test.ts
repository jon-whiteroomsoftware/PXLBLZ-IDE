import { describe, expect, it } from 'vitest'
import type { ShowOutputEffect, ShowRecord } from './personalContentRecords'
import { createDefaultShow } from './showModel'
import { DEFAULT_SHOW_TRAILS_RETENTION } from './showPreviousRgbFeedback'
import { setShowOutputTrails } from './showOutputEffectAuthoring'

function showWith(outputEffects?: ShowOutputEffect[]): ShowRecord {
  const show = { ...createDefaultShow('show-trails', 'Trails test', 1_000), outputEffects }
  return Object.freeze(show) as ShowRecord
}

describe('setShowOutputTrails', () => {
  it('enables Trails at the default retention when none is given', () => {
    const show = showWith()
    const next = setShowOutputTrails(show, { enabled: true })
    expect(next).not.toBe(show)
    expect(next.outputEffects).toEqual([
      { id: 'trails', kind: 'trails', retention: DEFAULT_SHOW_TRAILS_RETENTION },
    ])
    expect(next.updatedAt).toBeGreaterThan(show.updatedAt)
    expect(show.outputEffects).toBeUndefined()
  })

  it('enables Trails at an explicit retention, clamping to [0, 1]', () => {
    expect(setShowOutputTrails(showWith(), { enabled: true, retention: 0.5 }).outputEffects)
      .toEqual([{ id: 'trails', kind: 'trails', retention: 0.5 }])
    expect(setShowOutputTrails(showWith(), { enabled: true, retention: 1.5 }).outputEffects?.[0].retention)
      .toBe(1)
    expect(setShowOutputTrails(showWith(), { enabled: true, retention: -0.2 }).outputEffects?.[0].retention)
      .toBe(0)
  })

  it('retunes retention preserving the existing Effect id', () => {
    const show = showWith([{ id: 'trails-7', kind: 'trails', retention: 0.25 }])
    const next = setShowOutputTrails(show, { enabled: true, retention: 0.75 })
    expect(next.outputEffects).toEqual([{ id: 'trails-7', kind: 'trails', retention: 0.75 }])
  })

  it('keeps the current retention on an enable without one, and the default from off', () => {
    const on = showWith([{ id: 'trails', kind: 'trails', retention: 0.25 }])
    expect(setShowOutputTrails(on, { enabled: true })).toBe(on)
    expect(setShowOutputTrails(on, { enabled: true, retention: Number.NaN })).toBe(on)
    const fromOff = setShowOutputTrails(showWith(), { enabled: true, retention: Number.NaN })
    expect(fromOff.outputEffects?.[0].retention).toBe(DEFAULT_SHOW_TRAILS_RETENTION)
  })

  it('disables Trails, and is identity when there is nothing to disable', () => {
    const on = showWith([{ id: 'trails', kind: 'trails', retention: 0.5 }])
    const next = setShowOutputTrails(on, { enabled: false })
    expect(next.outputEffects).toEqual([])
    expect(next.updatedAt).toBeGreaterThan(on.updatedAt)

    const off = showWith()
    expect(setShowOutputTrails(off, { enabled: false })).toBe(off)
    const emptied = showWith([])
    expect(setShowOutputTrails(emptied, { enabled: false })).toBe(emptied)
  })

  it('is identity when the requested retention matches the current one', () => {
    const show = showWith([{ id: 'trails', kind: 'trails', retention: 0.5 }])
    expect(setShowOutputTrails(show, { enabled: true, retention: 0.5 })).toBe(show)
  })

  it('normalizes an un-normalized stored list on change', () => {
    const show = showWith([
      { id: '', kind: 'trails', retention: Number.NaN },
    ])
    const next = setShowOutputTrails(show, { enabled: true, retention: 0.5 })
    expect(next.outputEffects).toEqual([{ id: 'trails', kind: 'trails', retention: 0.5 }])
  })
})
