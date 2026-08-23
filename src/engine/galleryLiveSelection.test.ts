import { describe, expect, it } from 'vitest'
import { selectGalleryLiveCards, type GalleryLiveCard } from './galleryLiveSelection'

// A 3-wide grid of 100px cards with a 20px gap inside a 400x300 viewport.
function card(id: string, col: number, row: number): GalleryLiveCard {
  return { id, left: col * 120, top: row * 120, width: 100, height: 100, cost: 1 }
}

const VIEWPORT = { width: 400, height: 300 }
const GRID = [
  card('a', 0, 0), card('b', 1, 0), card('c', 2, 0),
  card('d', 0, 1), card('e', 1, 1), card('f', 2, 1),
  card('g', 0, 2), card('h', 1, 2), card('i', 2, 2), // row 2 spans y 240..340: partially visible
  card('j', 0, 3), card('k', 1, 3), card('l', 2, 3), // row 3 is off-screen
]

function select(overrides: Partial<Parameters<typeof selectGalleryLiveCards>[0]> = {}) {
  return selectGalleryLiveCards({
    cards: GRID,
    viewport: VIEWPORT,
    pointer: null,
    focusedId: null,
    current: [],
    budget: 3,
    keepMargin: 2,
    ...overrides,
  })
}

describe('selectGalleryLiveCards', () => {
  it('ranks by distance from the pointer to each card center and fills the pool', () => {
    // Pointer on e's center (170, 170): e, then b/d/f/h (equidistant, catalogue order breaks ties).
    expect(select({ pointer: { x: 170, y: 170 } })).toEqual(['e', 'b', 'd'])
  })

  it('never selects a card outside the viewport, however near the pointer', () => {
    // Pointer at the bottom edge: row 3 (off-screen) is nearer than row 0 but ineligible.
    const picked = select({ pointer: { x: 170, y: 299 }, budget: 12 })
    expect(picked).toEqual(expect.arrayContaining(['g', 'h', 'i']))
    expect(picked).not.toEqual(expect.arrayContaining(['j', 'k', 'l']))
    expect(picked).toHaveLength(9)
  })

  it('treats a partially visible card as eligible', () => {
    expect(select({ pointer: { x: 170, y: 290 } })).toContain('h')
  })

  it('falls back to proximity to the top of the viewport without a pointer', () => {
    expect(select({ pointer: null })).toEqual(['a', 'b', 'c'])
  })

  it('puts the focused card first regardless of pointer distance', () => {
    expect(select({ pointer: { x: 170, y: 170 }, focusedId: 'i' })).toEqual(['i', 'e', 'b'])
  })

  it('ignores focus on a card that is off-screen', () => {
    expect(select({ pointer: { x: 170, y: 170 }, focusedId: 'k' })).toEqual(['e', 'b', 'd'])
  })

  it('keeps a current holder that slipped just outside the pool (hysteresis)', () => {
    // Pointer at e: rank order e, b, d, f, h. 'f' is rank 4 (< pool 3 + margin 2), so a holder keeps it.
    expect(select({ pointer: { x: 170, y: 170 }, current: ['f'] })).toEqual(['e', 'b', 'f'])
  })

  it('drops a current holder whose rank exceeds pool plus margin', () => {
    // Pointer at e: 'c' is rank 6 or worse; a holder does not keep it.
    expect(select({ pointer: { x: 170, y: 170 }, current: ['c'] })).toEqual(['e', 'b', 'd'])
  })

  it('drops a current holder immediately when it leaves the viewport', () => {
    expect(select({ pointer: { x: 170, y: 170 }, current: ['j'], keepMargin: 100 })).not.toContain('j')
  })

  it('prefers retained holders over new entrants when both fit, but never exceeds the pool', () => {
    const picked = select({ pointer: { x: 170, y: 170 }, current: ['b', 'd', 'f', 'h'] })
    expect(picked).toHaveLength(3)
    expect(picked).toContain('e')
    expect(picked.filter((id) => ['b', 'd', 'f', 'h'].includes(id))).toHaveLength(2)
  })

  it('is stable across a small pointer move that does not change the ranking', () => {
    // Off-center so neighbors are not equidistant: e, d, b, h, f at both positions.
    const first = select({ pointer: { x: 160, y: 165 } })
    expect(first).toEqual(['e', 'd', 'b'])
    const second = select({ pointer: { x: 158, y: 166 }, current: first })
    expect(second).toEqual(first)
  })

  it('lets a much nearer entrant displace the worst holder once the gap exceeds the margin', () => {
    // Holders e, b, d. Pointer nudged right makes f rank 1 while d falls to rank 4: gap 3 > margin 2.
    expect(select({ pointer: { x: 172, y: 169 }, current: ['e', 'b', 'd'] })).toEqual(['e', 'f', 'b'])
    // With a wider margin the same move keeps d: no flicker at the cost of lag.
    expect(select({ pointer: { x: 172, y: 169 }, current: ['e', 'b', 'd'], keepMargin: 3 })).toEqual(['e', 'b', 'd'])
  })

  it('admits by pixel cost: a costly card takes the room of several cheap ones, and the nearest card always gets in', () => {
    // e costs 2 of a budget of 3: e plus one more; with current holders b and d,
    // only the better-ranked holder stays.
    const cards = GRID.map((c) => (c.id === 'e' ? { ...c, cost: 2 } : c))
    expect(select({ cards, pointer: { x: 170, y: 170 } })).toEqual(['e', 'b'])
    expect(select({ cards, pointer: { x: 170, y: 170 }, current: ['b', 'd'] })).toEqual(['e', 'b'])
    // A card costlier than the whole budget is still admitted when it ranks first.
    const huge = GRID.map((c) => (c.id === 'e' ? { ...c, cost: 99 } : c))
    expect(select({ cards: huge, pointer: { x: 170, y: 170 } })).toEqual(['e'])
  })

  it('handles pool sizes of zero and larger than the candidate set', () => {
    expect(select({ budget: 0 })).toEqual([])
    expect(select({ budget: 50, pointer: { x: 0, y: 0 } })).toHaveLength(9)
  })

  it('does not mutate its inputs', () => {
    const cards = GRID.map((c) => ({ ...c }))
    const current = ['f']
    select({ cards, current, pointer: { x: 170, y: 170 } })
    expect(cards).toEqual(GRID)
    expect(current).toEqual(['f'])
  })
})
