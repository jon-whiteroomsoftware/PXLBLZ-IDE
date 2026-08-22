// Gallery live-slot selection (#888). The Gallery can animate only a small pool
// of cards at once; this pure function decides which cards hold those slots.
//
// Rules, in order:
// 1. Only cards intersecting the viewport (partially or wholly) are eligible.
// 2. Cards rank by distance from the pointer to the card center. Without a
//    pointer (touch, first paint), they rank by proximity to the top of the
//    viewport. The keyboard-focused card ranks first.
// 3. Hysteresis, governed by one knob: a card that currently holds a slot is
//    retained while its rank is below poolSize + keepMargin, and it yields to a
//    new entrant only when that entrant ranks more than keepMargin places
//    better. A pointer moving along the boundary between the Nth and N+1th
//    card therefore does not start and stop both repeatedly, while the card
//    nearest the pointer always gets a slot. The result never exceeds poolSize.

export interface GalleryLiveCard {
  id: string
  /** Viewport-relative bounds, as from getBoundingClientRect(). */
  left: number
  top: number
  width: number
  height: number
}

export interface GalleryLiveSelectionInput {
  cards: readonly GalleryLiveCard[]
  viewport: { width: number; height: number }
  pointer: { x: number; y: number } | null
  focusedId: string | null
  /** Ids currently holding live slots. */
  current: readonly string[]
  poolSize: number
  keepMargin: number
}

function intersectsViewport(card: GalleryLiveCard, viewport: { width: number; height: number }): boolean {
  return (
    card.left < viewport.width &&
    card.left + card.width > 0 &&
    card.top < viewport.height &&
    card.top + card.height > 0
  )
}

function cardDistance(card: GalleryLiveCard, pointer: { x: number; y: number } | null): number {
  const cx = card.left + card.width / 2
  const cy = card.top + card.height / 2
  if (!pointer) return cy
  return Math.hypot(cx - pointer.x, cy - pointer.y)
}

/** Returns the ids that should hold live slots, best-ranked first. */
export function selectGalleryLiveCards(input: GalleryLiveSelectionInput): string[] {
  const { cards, viewport, pointer, focusedId, current, poolSize, keepMargin } = input
  if (poolSize <= 0) return []

  const ranked = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => intersectsViewport(card, viewport))
    .map(({ card, index }) => ({
      id: card.id,
      index,
      distance: card.id === focusedId ? -1 : cardDistance(card, pointer),
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)

  const holders = new Set(current)
  const keepLimit = poolSize + keepMargin
  type Entry = { id: string; rank: number }
  const retained: Entry[] = []
  const entrants: Entry[] = []
  ranked.forEach((entry, rank) => {
    if (holders.has(entry.id)) {
      if (rank < keepLimit) retained.push({ id: entry.id, rank })
    } else {
      entrants.push({ id: entry.id, rank })
    }
  })

  // Holders are seated first, best rank first, up to the pool.
  const seated: Entry[] = retained.slice(0, poolSize)
  for (const entrant of entrants) {
    if (seated.length < poolSize) {
      seated.push(entrant)
      continue
    }
    // Pool full: the entrant displaces the worst-ranked holder only when it is
    // more than keepMargin ranks better. Entrants never displace entrants.
    let worst = -1
    for (let i = 0; i < seated.length; i++) {
      if (holders.has(seated[i].id) && (worst < 0 || seated[i].rank > seated[worst].rank)) worst = i
    }
    if (worst >= 0 && seated[worst].rank - entrant.rank > keepMargin) {
      seated[worst] = entrant
    } else {
      break
    }
  }
  return seated.sort((a, b) => a.rank - b.rank).map((entry) => entry.id)
}
