import {
  filterGalleryPatterns,
  type GalleryFilter,
  type GalleryPattern,
} from './galleryCatalog'

/** Mulberry32, as in the preview shim, with an independent stream per order. */
export function createGalleryRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let value = Math.imul(state ^ (state >>> 15), 1 | state)
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value)
    return ((value ^ (value >>> 14)) >>> 0) / 0x100000000
  }
}

function spreadViolations(
  candidate: GalleryPattern,
  previous: GalleryPattern | undefined,
  beforePrevious: GalleryPattern | undefined,
): number {
  if (!previous) return 0
  const section = candidate.sections.some((name) => previous.sections.includes(name))
  const author = candidate.authors?.some((name) => previous.authors?.includes(name)) ?? false
  const dimension = candidate.dim === previous.dim && candidate.dim === beforePrevious?.dim
  return Number(section) + Number(author) + Number(dimension)
}

/**
 * Select the first zero-violation remaining card, otherwise the minimum count,
 * ties in shuffled order. Each shared section/author and dimension triple costs
 * one; missing authors never match. Unavoidable is local, with no lookahead.
 */
export function spreadGalleryPatterns(shuffled: readonly GalleryPattern[]): GalleryPattern[] {
  const remaining = [...shuffled]
  const ordered: GalleryPattern[] = []
  while (remaining.length > 0) {
    let bestIndex = 0
    let bestScore = Infinity
    for (let index = 0; index < remaining.length; index++) {
      const score = spreadViolations(remaining[index], ordered[ordered.length - 1], ordered[ordered.length - 2])
      if (score < bestScore) {
        bestIndex = index
        bestScore = score
      }
      if (score === 0) break
    }
    ordered.push(remaining.splice(bestIndex, 1)[0])
  }
  return ordered
}

export function orderGalleryPatterns(patterns: readonly GalleryPattern[], seed: number): GalleryPattern[] {
  const shuffled = [...patterns]
  const random = createGalleryRandom(seed)
  for (let index = shuffled.length - 1; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]]
  }
  return spreadGalleryPatterns(shuffled)
}

export function filterOrderedGalleryPatterns(
  ordered: readonly GalleryPattern[],
  filter: GalleryFilter,
): GalleryPattern[] {
  const filtered = filterGalleryPatterns(ordered, filter)
  return filter.query.trim() ? filtered.sort((a, b) => a.name.localeCompare(b.name)) : filtered
}

/** Visit indexes are nonnegative integers, supplied by the session seed resolver. */
export function rotateGalleryShows<T>(shows: readonly T[], visit: number): T[] {
  if (shows.length === 0) return []
  const lead = visit % shows.length
  return [...shows.slice(lead), ...shows.slice(0, lead)]
}
