// Gallery live-slot selection (#888). The Gallery can animate only a small pool
// of cards at once; this pure function decides which cards hold those slots.
//
// Rules, in order:
// 1. Only cards intersecting the viewport (partially or wholly) are eligible.
// 2. Cards rank by distance from the pointer to the card center. Without a
//    pointer (touch, first paint), they rank by proximity to the top of the
//    viewport. The keyboard-focused card ranks first.
// 3. Admission is by pixel budget, not card count: cards are admitted in rank
//    order while the sum of their costs (pixel counts) fits within `budget`.
//    A 2,000-pixel Show simply costs two 1,000-pixel Patterns' worth.
// 4. Hysteresis, governed by one knob: a card that currently holds a slot is
//    retained while its rank is below admittedCount + keepMargin, and it
//    yields to a new entrant only when that entrant ranks more than keepMargin
//    places better. A pointer moving along the boundary therefore does not
//    start and stop both repeatedly, while the card nearest the pointer always
//    gets a slot (the first-ranked card is always admitted, whatever its cost).

export interface GalleryLiveCard {
  id: string
  /** Viewport-relative bounds, as from getBoundingClientRect(). */
  left: number
  top: number
  width: number
  height: number
  /** Pixel count this card evaluates per frame when live. */
  cost: number
}

export interface GalleryLiveSelectionInput {
  cards: readonly GalleryLiveCard[]
  viewport: { width: number; height: number }
  pointer: { x: number; y: number } | null
  focusedId: string | null
  /** Ids currently holding live slots. */
  current: readonly string[]
  /** Pixel evaluations per frame the page will spend on live cards. */
  budget: number
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
  const { cards, viewport, pointer, focusedId, current, budget, keepMargin } = input
  if (budget <= 0) return []

  const ranked = cards
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => intersectsViewport(card, viewport))
    .map(({ card, index }) => ({
      id: card.id,
      index,
      cost: Math.max(0, card.cost),
      distance: card.id === focusedId ? -1 : cardDistance(card, pointer),
    }))
    .sort((a, b) => a.distance - b.distance || a.index - b.index)

  // How many cards the budget admits in pure rank order; the hysteresis window
  // is measured from there so it scales with card cost.
  let admittedCount = 0
  let spent = 0
  for (const entry of ranked) {
    if (admittedCount > 0 && spent + entry.cost > budget) break
    spent += entry.cost
    admittedCount += 1
  }
  const keepLimit = admittedCount + keepMargin

  const holders = new Set(current)
  type Entry = { id: string; rank: number; cost: number }
  const retained: Entry[] = []
  const entrants: Entry[] = []
  ranked.forEach((entry, rank) => {
    if (holders.has(entry.id)) {
      if (rank < keepLimit) retained.push({ id: entry.id, rank, cost: entry.cost })
    } else {
      entrants.push({ id: entry.id, rank, cost: entry.cost })
    }
  })

  const seated: Entry[] = []
  let used = 0
  const fits = (entry: Entry) => seated.length === 0 || used + entry.cost <= budget
  // Holders are seated first, best rank first, while they fit.
  for (const holder of retained) {
    if (!fits(holder)) break
    seated.push(holder)
    used += holder.cost
  }
  for (const entrant of entrants) {
    if (fits(entrant)) {
      seated.push(entrant)
      used += entrant.cost
      continue
    }
    // Budget spent: the entrant displaces the worst-ranked holder(s) only when
    // it is more than keepMargin ranks better than each of them. The
    // first-ranked card (under the pointer, or focused) ignores the margin: it
    // always gets in. Entrants never displace entrants.
    const mayEvict = (holder: Entry) => entrant.rank === 0 || holder.rank - entrant.rank > keepMargin
    let evicted = false
    while (!fits(entrant)) {
      let worst = -1
      for (let i = 0; i < seated.length; i++) {
        if (holders.has(seated[i].id) && (worst < 0 || seated[i].rank > seated[worst].rank)) worst = i
      }
      if (worst < 0 || !mayEvict(seated[worst])) break
      used -= seated[worst].cost
      seated.splice(worst, 1)
      evicted = true
    }
    if (!fits(entrant)) break
    if (!evicted && seated.length > 0) break
    seated.push(entrant)
    used += entrant.cost
  }
  return seated.sort((a, b) => a.rank - b.rank).map((entry) => entry.id)
}
