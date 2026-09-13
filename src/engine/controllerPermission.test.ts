// Exercise the production provider, relay, and unpacked helper together. Only
// Chrome's permission boundary and the physical Controller socket are synthetic.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ControllerPermissionDeniedError } from './ControllerProvider'
import { ExtensionControllerProvider } from './ExtensionControllerProvider'
import { RELAY_SOURCE, type RelayMessage, type RelayTransport } from './RelayWebSocket'

function helperHarness(legacy = false) {
  let connectPort!: (port: unknown) => void
  let permissionsAdded!: () => void
  let popupMessage!: (msg: unknown, sender: unknown, reply: (value: unknown) => void) => void
  const granted = new Set<string>()
  const sockets: Socket[] = []
  class Socket {
    closed = false
    listeners = new Map<string, (event: unknown) => void>()
    constructor(readonly url: string) { sockets.push(this) }
    addEventListener(type: string, listener: (event: unknown) => void) { this.listeners.set(type, listener) }
    close() { this.closed = true; this.listeners.get('close')?.({ code: 1000 }) }
    open() { this.listeners.get('open')?.({}) }
    send() {}
  }
  runInNewContext(readFileSync('extension/background.js', 'utf8'), {
    URL, AbortController, Uint8Array, setTimeout, clearTimeout,
    WebSocket: Socket,
    chrome: {
      permissions: {
        contains: async ({ origins }: { origins: string[] }) => origins.every(origin => granted.has(new URL(origin).hostname)),
        onAdded: { addListener: (fn: () => void) => { permissionsAdded = fn } },
      },
      action: { openPopup: async () => {} },
      runtime: {
        onMessage: { addListener: (fn: typeof popupMessage) => { popupMessage = fn } },
        onConnect: { addListener: (fn: typeof connectPort) => { connectPort = fn } },
      },
    },
  })
  function page() {
    let receive!: (msg: RelayMessage) => Promise<void>
    let disconnect!: () => void
    const listeners = new Set<(msg: RelayMessage) => void>()
    const messages: RelayMessage[] = []
    const emit = (msg: RelayMessage) => queueMicrotask(() => {
      if (legacy && msg.type === 'socket-connecting') return
      if (legacy && (msg.type === 'permission-needed' || msg.type === 'permission-denied')) delete msg.connId
      messages.push(msg)
      listeners.forEach(fn => fn(msg))
    })
    connectPort({
      name: RELAY_SOURCE,
      postMessage: emit,
      onMessage: { addListener: (fn: typeof receive) => { receive = fn } },
      onDisconnect: { addListener: (fn: () => void) => { disconnect = fn } },
    })
    const transport: RelayTransport = {
      post(msg) {
        if (msg.type === 'detect') emit({ source: RELAY_SOURCE, dir: 'from-helper', type: 'detect-ack' })
        else void receive(msg)
      },
      subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn) },
    }
    const provider = new ExtensionControllerProvider({ transport, pingIntervalMs: 0, livenessTimeoutMs: 0 })
    return { provider, transport, disconnect: () => disconnect(), messages }
  }
  return {
    page, sockets,
    deny() { popupMessage({ target: 'helper-popup', type: 'grant-outcome', granted: false }, null, () => {}) },
    grant(ip: string) { granted.add(ip); permissionsAdded() },
  }
}
const target = { address: '192.0.2.10', deviceId: 'pixelblaze_pb32_005544332211' }
const flush = () => vi.advanceTimersByTimeAsync(0)
afterEach(() => vi.useRealTimers())

describe('first-time Controller access (#63)', () => {
  it.each([false, true])('connects after delayed approval without reloading (legacy helper: %s)', async (legacy) => {
    vi.useFakeTimers()
    const helper = helperHarness(legacy)
    const { provider } = helper.page()
    const result = provider.connect(target).then(() => 'connected', () => 'failed')
    await flush()
    await vi.advanceTimersByTimeAsync(3500)
    expect(provider.getStatus()).toMatchObject({ kind: 'connecting', authorizationNeededIp: target.address })
    expect(helper.sockets).toHaveLength(0)
    helper.grant(target.address)
    await flush()
    expect(helper.sockets).toHaveLength(1)
    helper.sockets[0].open()
    expect(await result).toBe('connected')
    expect(provider.getStatus()).toMatchObject({ kind: 'connected' })
    provider.disconnect()
  })
  it('bounds socket opening separately after a delayed grant', async () => {
    vi.useFakeTimers()
    const helper = helperHarness()
    const { provider } = helper.page()
    const result = provider.connect(target).then(() => 'connected', () => 'failed')
    await vi.advanceTimersByTimeAsync(3500)
    helper.grant(target.address)
    await flush()
    expect(helper.sockets).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(2999)
    expect(provider.getStatus().kind).toBe('connecting')
    await vi.advanceTimersByTimeAsync(1)
    expect(provider.getStatus().kind).toBe('error')
    expect(await result).toBe('failed')
    expect(helper.sockets[0].closed).toBe(true)
  })

  it.each(['cancel', 'port disconnect'] as const)('does not open an abandoned socket after %s', async (action) => {
    vi.useFakeTimers()
    const helper = helperHarness()
    const page = helper.page()
    let settled = false
    void page.provider.connect(target).catch(() => {}).finally(() => { settled = true })
    await flush()
    if (action === 'cancel') page.provider.disconnect()
    else page.disconnect()
    await flush()
    helper.grant(target.address)
    await flush()
    expect(helper.sockets).toHaveLength(0)
    if (action === 'cancel') {
      expect(settled).toBe(true)
      expect(page.provider.getStatus().kind).toBe('extension-present')
    }
  })

  it.each(['deny', 'timeout'] as const)('settles %s as permission denial and allows another attempt', async (action) => {
    vi.useFakeTimers()
    const helper = helperHarness()
    const { provider } = helper.page()
    const result = provider.connect(target).catch(error => error)
    await flush()
    if (action === 'deny') helper.deny()
    else await vi.advanceTimersByTimeAsync(60000)
    expect(await result).toBeInstanceOf(ControllerPermissionDeniedError)
    expect(provider.getStatus().kind).toBe('extension-present')
    expect(helper.sockets).toHaveLength(0)
    const retry = provider.connect(target)
    await flush()
    helper.grant(target.address)
    await flush()
    helper.sockets[0].open()
    await retry
    expect(provider.getStatus().kind).toBe('connected')
    await provider.disconnect()
  })

  it('connects an already-authorized Controller without a permission hint', async () => {
    vi.useFakeTimers()
    const helper = helperHarness()
    helper.grant(target.address)
    const { provider, messages } = helper.page()
    const result = provider.connect(target)
    await flush()
    helper.sockets[0].open()
    await result
    expect(provider.getStatus().kind).toBe('connected')
    expect(messages.some(msg => msg.type === 'permission-needed')).toBe(false)
    await provider.disconnect()
  })

  it('cancels during the initial permission lookup before opening a popup or socket', async () => {
    vi.useFakeTimers()
    const helper = helperHarness()
    const page = helper.page()
    page.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'connect', connId: 'early', url: 'ws://192.0.2.10:81' })
    page.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'close', connId: 'early' })
    await flush()
    helper.grant(target.address)
    await flush()
    expect(helper.sockets).toHaveLength(0)
    expect(page.messages).toHaveLength(0)
  })

  it('cancels one page without canceling another page waiting for the same IP', async () => {
    vi.useFakeTimers()
    const helper = helperHarness()
    const first = helper.page()
    const second = helper.page()
    const abandoned = first.provider.connect(target).catch(error => error)
    const connected = second.provider.connect(target)
    await flush()
    await first.provider.disconnect()
    await abandoned
    helper.grant(target.address)
    await flush()
    expect(helper.sockets).toHaveLength(1)
    helper.sockets[0].open()
    await connected
    expect(second.provider.getStatus().kind).toBe('connected')
    expect(first.provider.getStatus().kind).toBe('extension-present')
    await second.provider.disconnect()
  })

  it('preserves an immediate retry after canceling a pending grant', async () => {
    vi.useFakeTimers()
    const helper = helperHarness()
    const { provider } = helper.page()
    const abandoned = provider.connect(target).catch(error => error)
    await flush()
    void provider.disconnect()
    const connected = provider.connect(target)
    await abandoned
    await flush()
    helper.grant(target.address)
    await flush()
    expect(helper.sockets).toHaveLength(1)
    helper.sockets[0].open()
    await connected
    expect(provider.getStatus().kind).toBe('connected')
    await provider.disconnect()
  })

})
