import { describe, expect, it } from 'vitest'
import {
  GALLERY_ALL_CATEGORY,
  GALLERY_PATTERNS,
  type GalleryPattern,
} from './galleryCatalog'
import {
  createGalleryRandom,
  filterOrderedGalleryPatterns,
  orderGalleryPatterns,
  rotateGalleryShows,
  spreadGalleryPatterns,
} from './galleryOrder'

function card(name: string, section: string, dim: 1 | 2 | 3 = 2, authors?: string[]): GalleryPattern {
  return { name, slug: name.toLowerCase(), src: '', dim, sections: [section], authors }
}

// Contract oracle: each constraint contributes one violation, regardless of
// how many shared names it has. Unknown authors have no shared identity.
function violations(placed: readonly GalleryPattern[], next: GalleryPattern): number {
  const previous = placed[placed.length - 1]
  if (!previous) return 0
  return Number(next.sections.some((section) => previous.sections.includes(section))) +
    Number((next.authors ?? []).some((author) => previous.authors?.includes(author))) +
    Number(placed[placed.length - 2]?.dim === next.dim && previous.dim === next.dim)
}

const names = (patterns: readonly GalleryPattern[]) => patterns.map((pattern) => pattern.name)

describe('Gallery spread order (#1257)', () => {
  it('provides reproducible, advancing random streams including seed zero', () => {
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const first = createGalleryRandom(seed)
      const second = createGalleryRandom(seed)
      const values = Array.from({ length: 100 }, () => first())
      expect(values).toEqual(Array.from({ length: 100 }, () => second()))
      expect(new Set(values).size).toBe(100)
      expect(values.every((value) => value >= 0 && value < 1)).toBe(true)
    }
    expect(createGalleryRandom(0)()).not.toBe(createGalleryRandom(1)())
  })

  it('selects the first safe candidate and preserves shuffled ties', () => {
    const input = [
      card('A', 's1', 1, ['alice']),
      card('B', 's1', 2, ['bob']),
      card('C', 's3', 3, ['alice']),
      card('D', 's4', 1, ['dana']),
      card('E', 's5', 2, ['eve']),
    ]
    expect(names(spreadGalleryPatterns(input))).toEqual(['A', 'D', 'B', 'C', 'E'])
  })

  it('detects any shared section or author, including later entries', () => {
    const first = card('A', 's1', 1, ['alice', 'bob'])
    first.sections.push('s2')
    const input = [
      first,
      { ...card('B', 's3'), sections: ['s3', 's2'] },
      card('C', 's4', 3, ['dana', 'bob']),
      card('D', 's5'),
    ]
    expect(spreadGalleryPatterns(input)[1]).toBe(input[3])
  })

  it('never matches missing or empty authors', () => {
    const input = [card('A', 's1', 1), card('B', 's2', 2, []), card('C', 's3', 3)]
    expect(spreadGalleryPatterns(input)).toEqual(input)
  })

  it('allows a dimension pair but breaks a triple when a remaining card can', () => {
    const input = [card('A', 's1', 1), card('B', 's2', 1), card('C', 's3', 1), card('D', 's4', 2)]
    expect(names(spreadGalleryPatterns(input))).toEqual(['A', 'B', 'D', 'C'])
  })

  it('minimizes violated constraints when no candidate is safe, ties in shuffled order', () => {
    const input = [
      card('A', 's1', 1, ['alice']),
      card('B', 's1', 1, ['alice']),
      card('C', 's1', 2, ['bob']),
      card('D', 's4', 3, ['alice']),
    ]
    // B violates section + author; C and D each violate one rule. C wins.
    expect(names(spreadGalleryPatterns(input))).toEqual(['A', 'C', 'D', 'B'])
  })

  it('counts each constraint once rather than weighting multiple shared names', () => {
    const first = card('A', 's1', 1, ['alice'])
    first.sections.push('s2')
    const input = [
      first,
      { ...card('B', 's1'), sections: ['s1', 's2'] },
      card('C', 's3', 3, ['alice']),
    ]
    expect(spreadGalleryPatterns(input)).toEqual(input)
  })

  it.each([
    { label: 'empty', input: [] },
    { label: 'singleton', input: [card('Only', 'one')] },
    { label: 'one section', input: [card('A', 'one', 1), card('B', 'one', 2), card('C', 'one', 3), card('D', 'one', 1)] },
    { label: 'all 1D', input: [card('A', 's1', 1), card('B', 's2', 1), card('C', 's3', 1), card('D', 's4', 1)] },
  ])('keeps every card without mutation: $label', ({ input }) => {
    for (const pattern of input) {
      Object.freeze(pattern.sections)
      if (pattern.authors) Object.freeze(pattern.authors)
      Object.freeze(pattern)
    }
    Object.freeze(input)
    const before = JSON.stringify(input)
    for (const seed of [0, 1, 42, 0xffffffff]) {
      const ordered = orderGalleryPatterns(input, seed)
      expect(ordered).toHaveLength(input.length)
      expect(new Set(ordered)).toEqual(new Set(input))
      expect(JSON.stringify(input)).toBe(before)
    }
  })

  it('repeats a seed independently of intervening calls', () => {
    const ordered = orderGalleryPatterns(GALLERY_PATTERNS, 42)
    orderGalleryPatterns(GALLERY_PATTERNS, 73)
    expect(orderGalleryPatterns(GALLERY_PATTERNS, 42)).toEqual(ordered)
    expect(ordered).not.toEqual(GALLERY_PATTERNS)
  })

  it('keeps the first 48 real cards conflict-free and chooses minimum violations for seeds 0–1999', () => {
    const before = JSON.stringify(GALLERY_PATTERNS)
    const errors: string[] = []
    const signatures = new Set<string>()
    const totals: number[] = []
    let earliest = GALLERY_PATTERNS.length
    for (let seed = 0; seed < 2000; seed++) {
      const ordered = orderGalleryPatterns(GALLERY_PATTERNS, seed)
      signatures.add(names(ordered).join(','))
      if (ordered.length !== GALLERY_PATTERNS.length || new Set(ordered).size !== GALLERY_PATTERNS.length) {
        errors.push(`seed ${seed}: incomplete permutation`)
      }
      const remaining = new Set(GALLERY_PATTERNS)
      const placed: GalleryPattern[] = []
      let total = 0
      for (const [index, next] of ordered.entries()) {
        const score = violations(placed, next)
        const minimum = Math.min(...[...remaining].map((candidate) => violations(placed, candidate)))
        if (!remaining.delete(next) || score !== minimum || (index < 48 && score !== 0)) {
          errors.push(`seed ${seed} slot ${index}: selected ${score}, minimum ${minimum}`)
        }
        if (score > 0) earliest = Math.min(earliest, index)
        total += score
        placed.push(next)
      }
      totals.push(total)
    }
    // Aggregate assertions keep the 2,000-seed contract check inexpensive.
    expect(errors.slice(0, 10)).toEqual([])
    expect(signatures.size).toBe(2000)
    expect(JSON.stringify(GALLERY_PATTERNS)).toBe(before)
    totals.sort((a, b) => a - b)
    console.info('Gallery spread statistics', JSON.stringify({
      seeds: 2000, cards: GALLERY_PATTERNS.length, earliestViolationSlot: earliest,
      median: totals[999], p90: totals[1799], worst: totals[totals.length - 1],
    }))
  })
})

describe('Gallery ordered views', () => {
  it('filters the complete permutation as a subsequence, including combined filters', () => {
    const full = orderGalleryPatterns(GALLERY_PATTERNS, 42)
    for (const category of [GALLERY_ALL_CATEGORY, 'Living 1D', 'ZRanger1']) {
      for (const lens of ['all', 1, 2, 3] as const) {
        expect(filterOrderedGalleryPatterns(full, { category, lens, query: '' })).toEqual(
          full.filter((pattern) =>
            (category === GALLERY_ALL_CATEGORY || pattern.sections.includes(category)) &&
            (lens === 'all' || pattern.dim === lens)),
        )
      }
    }
  })

  it('sorts trimmed searches A–Z and restores the session order after clearing search', () => {
    const full = [card('Zebra', 's1'), card('apple', 's2'), card('Beta', 's3'), card('Apricot', 's4')]
    const filter = { category: GALLERY_ALL_CATEGORY, lens: 'all' as const, query: '  A  ' }
    expect(names(filterOrderedGalleryPatterns(full, filter))).toEqual(['apple', 'Apricot', 'Beta', 'Zebra'])
    expect(filterOrderedGalleryPatterns(full, { ...filter, query: ' ' })).toEqual(full)
    expect(names(full)).toEqual(['Zebra', 'apple', 'Beta', 'Apricot'])
    expect(filterOrderedGalleryPatterns(full, { ...filter, query: 'unmatched' })).toEqual([])
  })
})

describe('Gallery Show rotation', () => {
  it('leads with every Show once per cycle, keeps cyclic order, and wraps', () => {
    const shows = Object.freeze([{ id: 'a' }, { id: 'b' }, { id: 'c' }])
    const orders = Array.from({ length: shows.length }, (_, visit) => rotateGalleryShows(shows, visit))
    expect(orders).toEqual([
      [shows[0], shows[1], shows[2]],
      [shows[1], shows[2], shows[0]],
      [shows[2], shows[0], shows[1]],
    ])
    expect(rotateGalleryShows(shows, 4)).toEqual(orders[1])
    expect(shows.map((show) => show.id)).toEqual(['a', 'b', 'c'])
  })

  it('handles empty and single-Show catalogues', () => {
    expect(rotateGalleryShows([], 7)).toEqual([])
    expect(rotateGalleryShows(['only'], 7)).toEqual(['only'])
  })
})
