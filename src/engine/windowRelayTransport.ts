// The browser-side RelayTransport: bridges the app to the extension's content
// script over window.postMessage (H3, issue #195). This is the ONE place that
// touches `window` for the relay; everything above it (RelayWebSocket,
// ExtensionControllerProvider) is transport-agnostic and unit-tested with a fake.
//
// Pure of React, but inherently browser-only (no DOM-free test) — hence the thin
// shell. The content script answers `to-helper` messages and posts `from-helper`
// replies back onto the same window; we filter by source + direction.

import { RELAY_SOURCE, type RelayMessage, type RelayTransport } from './RelayWebSocket'

export function windowRelayTransport(win: Window = window): RelayTransport {
  return {
    post: (message) => win.postMessage(message, win.location.origin),
    subscribe: (listener) => {
      const handler = (event: MessageEvent) => {
        if (event.source !== win) return
        const data = event.data as RelayMessage | undefined
        if (data && data.source === RELAY_SOURCE && data.dir === 'from-helper') listener(data)
      }
      win.addEventListener('message', handler)
      return () => win.removeEventListener('message', handler)
    },
  }
}
