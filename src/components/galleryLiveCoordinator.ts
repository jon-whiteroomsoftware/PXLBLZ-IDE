// Gallery live-slot coordinator (#888). Owns the DOM side of live-slot
// selection: which cards are registered, where the pointer is, and when to
// re-rank. The ranking rule itself is the pure engine function
// selectGalleryLiveCards; this module only measures cards and notifies them.
//
// Each registered card is in one of three modes:
//   live   - holds one of the pool's slots and animates
//   warm   - granted a one-frame render to produce its poster, then released
//   frozen - shows its poster (or nothing yet)
// Warm grants are issued one at a time so a page of fresh cards never opens
// more than poolSize + 1 WebGL contexts.

import { selectGalleryLiveCards, type GalleryLiveCard } from '@/engine/galleryLiveSelection'

export type GalleryLiveMode = 'live' | 'warm' | 'frozen'

export const GALLERY_LIVE_POOL_SIZE = 6
export const GALLERY_LIVE_KEEP_MARGIN = 2
/** Trailing debounce on pointer, scroll, and resize before re-ranking. */
export const GALLERY_LIVE_RERANK_DELAY_MS = 100

interface RegisteredCard {
  id: string
  element: HTMLElement
  onMode: (mode: GalleryLiveMode) => void
  mode: GalleryLiveMode
  wantsWarm: boolean
}

const cards = new Map<string, RegisteredCard>()
let pointer: { x: number; y: number } | null = null
let focusedId: string | null = null
let warmingId: string | null = null
let rerankTimer: ReturnType<typeof setTimeout> | null = null
let listenersInstalled = false
let poolSize = GALLERY_LIVE_POOL_SIZE
let keepMargin = GALLERY_LIVE_KEEP_MARGIN

interface Frame {
  left: number
  top: number
  width: number
  height: number
}

/**
 * The eligibility viewport: the window, clipped to the Gallery scrollport
 * (`[data-gallery-scrollport]`) when the cards live inside one, so a card
 * scrolled under the header or past the scrollport's bottom is not eligible.
 * Measurements are expressed relative to the frame's origin.
 */
function viewportFrame(): Frame {
  const first = cards.values().next().value as RegisteredCard | undefined
  const scrollport = first?.element.closest('[data-gallery-scrollport]')
  const windowFrame: Frame = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
  if (!scrollport) return windowFrame
  const rect = scrollport.getBoundingClientRect()
  const left = Math.max(rect.left, 0)
  const top = Math.max(rect.top, 0)
  return {
    left,
    top,
    width: Math.max(0, Math.min(rect.right, window.innerWidth) - left),
    height: Math.max(0, Math.min(rect.bottom, window.innerHeight) - top),
  }
}

function measure(frame: Frame): GalleryLiveCard[] {
  const out: GalleryLiveCard[] = []
  for (const card of cards.values()) {
    const rect = card.element.getBoundingClientRect()
    out.push({
      id: card.id,
      left: rect.left - frame.left,
      top: rect.top - frame.top,
      width: rect.width,
      height: rect.height,
    })
  }
  return out
}

function setMode(card: RegisteredCard, mode: GalleryLiveMode): void {
  if (card.mode === mode) return
  card.mode = mode
  card.onMode(mode)
}

function rerank(): void {
  rerankTimer = null
  if (cards.size === 0) return
  const frame = viewportFrame()
  const measured = measure(frame)
  const current = [...cards.values()].filter((card) => card.mode === 'live').map((card) => card.id)
  const live = new Set(
    selectGalleryLiveCards({
      cards: measured,
      viewport: { width: frame.width, height: frame.height },
      pointer: pointer ? { x: pointer.x - frame.left, y: pointer.y - frame.top } : null,
      focusedId,
      current,
      poolSize,
      keepMargin,
    }),
  )
  for (const card of cards.values()) {
    if (live.has(card.id)) {
      if (card.id === warmingId) warmingId = null
      setMode(card, 'live')
    } else if (card.id !== warmingId) {
      setMode(card, 'frozen')
    }
  }
  grantWarm(measured, frame)
}

function grantWarm(measured: GalleryLiveCard[], viewport: Frame): void {
  if (warmingId !== null) return
  const visible = new Set(
    measured
      .filter((c) => c.left < viewport.width && c.left + c.width > 0 && c.top < viewport.height && c.top + c.height > 0)
      .map((c) => c.id),
  )
  // Nearest-the-top first so the user sees posters fill in reading order.
  const candidates = [...cards.values()]
    .filter((card) => card.wantsWarm && card.mode === 'frozen' && visible.has(card.id))
    .sort((a, b) => a.element.getBoundingClientRect().top - b.element.getBoundingClientRect().top)
  const next = candidates[0]
  if (!next) return
  warmingId = next.id
  setMode(next, 'warm')
}

export function scheduleGalleryRerank(): void {
  if (rerankTimer !== null) return
  rerankTimer = setTimeout(rerank, GALLERY_LIVE_RERANK_DELAY_MS)
}

function onPointerMove(event: PointerEvent): void {
  // Touch has no hover position: drop any stale mouse position so ranking
  // returns to the top-of-viewport fallback.
  pointer = event.pointerType === 'touch' ? null : { x: event.clientX, y: event.clientY }
  scheduleGalleryRerank()
}

function onFocusIn(event: FocusEvent): void {
  const target = event.target as HTMLElement | null
  // The focusable card wraps the registered preview host, so look inside the
  // target as well as above it.
  const host = (target?.closest?.('[data-gallery-live-id]') ??
    target?.querySelector?.('[data-gallery-live-id]')) as HTMLElement | null
  focusedId = host?.dataset.galleryLiveId ?? null
  scheduleGalleryRerank()
}

function installListeners(): void {
  if (listenersInstalled || typeof window === 'undefined') return
  listenersInstalled = true
  window.addEventListener('pointermove', onPointerMove, { passive: true })
  window.addEventListener('scroll', scheduleGalleryRerank, { passive: true, capture: true })
  window.addEventListener('resize', scheduleGalleryRerank, { passive: true })
  window.addEventListener('focusin', onFocusIn)
}

function removeListeners(): void {
  if (!listenersInstalled) return
  listenersInstalled = false
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('scroll', scheduleGalleryRerank, { capture: true })
  window.removeEventListener('resize', scheduleGalleryRerank)
  window.removeEventListener('focusin', onFocusIn)
}

/**
 * Register a card. `onMode` fires whenever the card's mode changes. Set
 * `wantsWarm` when the card has no poster yet; call `galleryCardWarmed` once
 * its one-frame render is captured. Returns an unregister function.
 */
export function registerGalleryLiveCard(
  id: string,
  element: HTMLElement,
  onMode: (mode: GalleryLiveMode) => void,
  wantsWarm: boolean,
): () => void {
  element.dataset.galleryLiveId = id
  cards.set(id, { id, element, onMode, mode: 'frozen', wantsWarm })
  installListeners()
  scheduleGalleryRerank()
  return () => {
    cards.delete(id)
    if (warmingId === id) warmingId = null
    if (focusedId === id) focusedId = null
    if (cards.size === 0) {
      removeListeners()
      if (rerankTimer !== null) {
        clearTimeout(rerankTimer)
        rerankTimer = null
      }
    } else {
      scheduleGalleryRerank()
    }
  }
}

/** A warm card captured its poster (or gave up); release the warm grant. */
export function galleryCardWarmed(id: string): void {
  const card = cards.get(id)
  if (card) card.wantsWarm = false
  if (warmingId === id) {
    warmingId = null
    if (card && card.mode === 'warm') setMode(card, 'frozen')
    scheduleGalleryRerank()
  }
}

/** Test and tuning hook: override pool size and hysteresis margin. */
export function configureGalleryLivePool(options: { poolSize?: number; keepMargin?: number }): void {
  if (options.poolSize !== undefined) poolSize = options.poolSize
  if (options.keepMargin !== undefined) keepMargin = options.keepMargin
  scheduleGalleryRerank()
}

/** Test hook: drop all registrations and listeners. */
export function resetGalleryLiveCoordinator(): void {
  cards.clear()
  pointer = null
  focusedId = null
  warmingId = null
  poolSize = GALLERY_LIVE_POOL_SIZE
  keepMargin = GALLERY_LIVE_KEEP_MARGIN
  removeListeners()
  if (rerankTimer !== null) {
    clearTimeout(rerankTimer)
    rerankTimer = null
  }
}
