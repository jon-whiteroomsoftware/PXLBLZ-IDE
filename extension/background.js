// Service worker for the Pixelblaze IDE Controller Bridge (H3, issue #195).
//
// Owns the real ws://<LAN-IP>:81 sockets — the one thing the https page cannot
// open itself. One long-lived Port per page; sockets are keyed by the connId the
// page minted (see src/engine/RelayWebSocket.ts), so a single page can bridge
// several connections. Frames cross as text, or base64 for binary, because Port
// messaging is JSON-only.
//
// MV3 lifecycle: an open WebSocket with traffic (the app pings every ~5s) keeps
// the worker from idling out on current Chrome. If the worker is nonetheless
// evicted, the socket dies; the page sees a close and its provider reconnects.

const RELAY_SOURCE = 'pblz-relay'

function bytesToBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function base64ToBytes(b64) {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== RELAY_SOURCE) return
  // Sockets owned by this page, keyed by connId.
  const sockets = new Map()

  const send = (msg) => {
    try {
      port.postMessage(msg)
    } catch {
      // Page went away mid-flight; nothing to do.
    }
  }

  port.onMessage.addListener((msg) => {
    if (!msg || msg.source !== RELAY_SOURCE || msg.dir !== 'to-helper') return

    if (msg.type === 'connect') {
      let ws
      try {
        ws = new WebSocket(msg.url)
      } catch (e) {
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: String(e) })
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId })
        return
      }
      ws.binaryType = 'arraybuffer'
      sockets.set(msg.connId, ws)
      ws.addEventListener('open', () => send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: msg.connId }))
      ws.addEventListener('message', (ev) => {
        const payload =
          typeof ev.data === 'string' ? { text: ev.data } : { binary: bytesToBase64(ev.data) }
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: msg.connId, payload })
      })
      ws.addEventListener('error', () =>
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'error', connId: msg.connId, message: 'websocket error' }),
      )
      ws.addEventListener('close', (ev) => {
        sockets.delete(msg.connId)
        send({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: msg.connId, code: ev.code })
      })
      return
    }

    const ws = sockets.get(msg.connId)
    if (!ws) return

    if (msg.type === 'send') {
      try {
        if ('text' in msg.payload) ws.send(msg.payload.text)
        else ws.send(base64ToBytes(msg.payload.binary))
      } catch {
        // Socket not open / already gone; the close path reports it.
      }
    } else if (msg.type === 'close') {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
  })

  port.onDisconnect.addListener(() => {
    for (const ws of sockets.values()) {
      try {
        ws.close()
      } catch {
        // ignore
      }
    }
    sockets.clear()
  })
})
