/**
 * Deterministic Escape layering for the Show editor (#672).
 *
 * The editor's Escape surfaces used to be independent `document` keydown
 * listeners, so whether one press peeled one layer or several depended on
 * accidental listener registration order. This registry owns a single
 * document listener and offers each press to registered layers from the
 * highest rank down, stopping at the first layer that consumes it.
 *
 * Surfaces marked `data-show-detail-owned-portal` / `data-show-detail-escape-owned`
 * keep claiming Escape with their own listeners: while one is present the
 * registry dispatches nothing.
 */

export const SHOW_ESCAPE_LAYER_RANK = {
  /** Entity Detail panel, Group isolation exit, and active-selection clearing. */
  editorSurfaces: 30,
  /** Toolbar and rail popovers: Zone Map, Add menu, Add Clip. */
  toolbarPopover: 20,
} as const

export interface ShowEscapeLayer {
  rank: number
  /** Return true to consume the press; lower layers then stay untouched. */
  onEscape: (event: KeyboardEvent) => boolean
}

const DETAIL_OWNED_SELECTOR =
  '[data-show-detail-owned-portal="true"], [data-show-detail-escape-owned="true"]'

interface RegisteredLayer {
  layer: ShowEscapeLayer
  /** Registration order breaks rank ties: later-registered surfaces sit on top. */
  seq: number
}

const registered: RegisteredLayer[] = []
let nextSeq = 0
let installed = false

const dispatchEscape = (event: KeyboardEvent) => {
  if (event.key !== 'Escape') return
  if (document.querySelector(DETAIL_OWNED_SELECTOR)) return
  const ordered = [...registered].sort(
    (a, b) => b.layer.rank - a.layer.rank || b.seq - a.seq,
  )
  for (const entry of ordered) {
    if (!entry.layer.onEscape(event)) continue
    event.preventDefault()
    return
  }
}

export function registerShowEscapeLayer(layer: ShowEscapeLayer): () => void {
  const entry: RegisteredLayer = { layer, seq: nextSeq++ }
  registered.push(entry)
  if (!installed) {
    document.addEventListener('keydown', dispatchEscape)
    installed = true
  }
  return () => {
    const index = registered.indexOf(entry)
    if (index >= 0) registered.splice(index, 1)
    if (registered.length === 0 && installed) {
      document.removeEventListener('keydown', dispatchEscape)
      installed = false
    }
  }
}
