// H3 (#195): RelayWebSocket tunnels a ws:// socket through the relay seam. These
// tests drive a fake transport (no DOM, no extension) and prove the proxy honours
// the WebSocketLike contract PixelblazeConnection depends on: open/message/close
// routing, text vs base64-binary framing, and connId isolation between instances.

import { describe, it, expect, vi } from 'vitest'
import {
  RelayWebSocket,
  RELAY_SOURCE,
  bytesToBase64,
  base64ToBytes,
  type RelayMessage,
  type RelayTransport,
} from './RelayWebSocket'

/** A fake relay: records what the page posted, and lets the test play the helper
 *  by pushing messages back to every subscriber. */
function makeFakeTransport() {
  const posted: RelayMessage[] = []
  const listeners = new Set<(m: RelayMessage) => void>()
  const transport: RelayTransport = {
    post: (m) => posted.push(m),
    subscribe: (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
  }
  return {
    transport,
    posted,
    listenerCount: () => listeners.size,
    deliver: (m: RelayMessage) => listeners.forEach((l) => l(m)),
  }
}

/** The connId the proxy minted for its connect message. */
function connIdOf(posted: RelayMessage[]): string {
  const connect = posted.find((m) => m.type === 'connect')
  if (!connect || !('connId' in connect)) throw new Error('no connect posted')
  return connect.connId
}

describe('base64 round-trip', () => {
  it('survives arbitrary bytes', () => {
    const bytes = new Uint8Array([0, 1, 2, 127, 128, 255, 65, 0])
    expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes)
  })
})

describe('RelayWebSocket', () => {
  it('posts a connect with the url on construction and starts CONNECTING', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://192.168.8.224:81', f.transport)
    expect(ws.readyState).toBe(0)
    const connect = f.posted.find((m) => m.type === 'connect')
    expect(connect).toMatchObject({ source: RELAY_SOURCE, dir: 'to-helper', url: 'ws://192.168.8.224:81' })
  })

  it('fires onopen and flips to OPEN on a matching open message', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const onopen = vi.fn()
    ws.onopen = onopen
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: connIdOf(f.posted) })
    expect(ws.readyState).toBe(1)
    expect(onopen).toHaveBeenCalledOnce()
  })

  it('delivers text frames as strings to onmessage', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const id = connIdOf(f.posted)
    const onmessage = vi.fn()
    ws.onmessage = onmessage
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: id, payload: { text: '{"fps":42}' } })
    expect(onmessage).toHaveBeenCalledWith({ data: '{"fps":42}' })
  })

  it('decodes binary frames to a Uint8Array', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const id = connIdOf(f.posted)
    const onmessage = vi.fn()
    ws.onmessage = onmessage
    const bytes = new Uint8Array([7, 4, 1, 2, 3])
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: id, payload: { binary: bytesToBase64(bytes) } })
    expect(onmessage).toHaveBeenCalledWith({ data: bytes })
  })

  it('sends text frames as { text }', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    ws.send('{"getVars":true}')
    const sent = f.posted.find((m) => m.type === 'send')
    expect(sent).toMatchObject({ payload: { text: '{"getVars":true}' } })
  })

  it('sends binary frames as base64 { binary }', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const bytes = new Uint8Array([1, 0, 200])
    ws.send(bytes)
    const sent = f.posted.find((m) => m.type === 'send')
    expect(sent && 'payload' in sent && 'binary' in sent.payload).toBe(true)
    if (sent && 'payload' in sent && 'binary' in sent.payload) {
      expect(base64ToBytes(sent.payload.binary)).toEqual(bytes)
    }
  })

  it('ignores messages for a different connId', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const onmessage = vi.fn()
    ws.onmessage = onmessage
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'message', connId: 'someone-else', payload: { text: 'nope' } })
    expect(onmessage).not.toHaveBeenCalled()
  })

  it('ignores foreign postMessage chatter (wrong source)', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const onopen = vi.fn()
    ws.onopen = onopen
    // A message that isn't ours at all.
    f.deliver({ source: 'something-else', dir: 'from-helper', type: 'open', connId: connIdOf(f.posted) } as unknown as RelayMessage)
    expect(onopen).not.toHaveBeenCalled()
    expect(ws.readyState).toBe(0)
  })

  it('fires onclose and unsubscribes on a close message', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    const id = connIdOf(f.posted)
    const onclose = vi.fn()
    ws.onclose = onclose
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: id })
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'close', connId: id, code: 1006 })
    expect(ws.readyState).toBe(3)
    expect(onclose).toHaveBeenCalledOnce()
    expect(f.listenerCount()).toBe(0)
  })

  it('close() posts a close, flips to CLOSED, and unsubscribes', () => {
    const f = makeFakeTransport()
    const ws = new RelayWebSocket('ws://d:81', f.transport)
    ws.close()
    expect(ws.readyState).toBe(3)
    expect(f.posted.some((m) => m.type === 'close')).toBe(true)
    expect(f.listenerCount()).toBe(0)
  })

  it('routes each instance independently by connId', () => {
    const f = makeFakeTransport()
    const a = new RelayWebSocket('ws://a:81', f.transport)
    const b = new RelayWebSocket('ws://b:81', f.transport)
    const idA = (f.posted.filter((m) => m.type === 'connect')[0] as Extract<RelayMessage, { type: 'connect' }>).connId
    const onA = vi.fn()
    const onB = vi.fn()
    a.onopen = onA
    b.onopen = onB
    f.deliver({ source: RELAY_SOURCE, dir: 'from-helper', type: 'open', connId: idA })
    expect(onA).toHaveBeenCalledOnce()
    expect(onB).not.toHaveBeenCalled()
  })
})
