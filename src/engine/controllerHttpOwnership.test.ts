// Real helper service-worker code and production provider/relay; no requests leave the VM.
import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { gzipSync } from 'node:zlib'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ExtensionControllerProvider } from './ExtensionControllerProvider'
import { RELAY_SOURCE, type RelayMessage, type RelayTransport } from './RelayWebSocket'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
function helperHarness() {
  let connectPort!: (port: unknown) => void
  const sockets: Socket[] = []
  class Socket {
    sent: (string | Uint8Array)[] = []
    closeRequested = false
    listeners = new Map<string, (event: unknown) => void>()
    constructor(readonly url: string) { sockets.push(this) }
    addEventListener(type: string, fn: (event: unknown) => void) { this.listeners.set(type, fn) }
    send(frame: string | Uint8Array) { this.sent.push(frame) }
    close() { this.closeRequested = true }
    closed() { this.listeners.get('close')?.({ code: 1000 }) }
    open() { this.listeners.get('open')?.({}) }
    message(value: unknown) { this.listeners.get('message')?.({ data: typeof value === 'string' ? value : JSON.stringify(value) }) }
  }
  const fetch = vi.fn(async (_url: string): Promise<Partial<Response>> => ({
    ok: true, status: 200, arrayBuffer: async () => new ArrayBuffer(0), json: async () => [],
  }))
  const context = {
    URL, AbortController, Uint8Array, setTimeout, clearTimeout, atob, btoa,
    Response, DecompressionStream, fetch, WebSocket: Socket,
    chrome: {
      permissions: { contains: async () => true, onAdded: { addListener() {} } },
      action: { openPopup: async () => {} },
      runtime: {
        onMessage: { addListener() {} },
        onConnect: { addListener: (fn: typeof connectPort) => { connectPort = fn } },
      },
    },
  }
  runInNewContext(readFileSync('extension/background.js', 'utf8'), context)
  function page() {
    let receive!: (msg: RelayMessage) => Promise<void>
    let disconnect!: () => void
    const listeners = new Set<(msg: RelayMessage) => void>()
    const messages: RelayMessage[] = []
    const emit = (msg: RelayMessage) => queueMicrotask(() => {
      messages.push(msg)
      listeners.forEach(fn => fn(msg))
    })
    connectPort({ name: RELAY_SOURCE, postMessage: emit,
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
    const provider = new ExtensionControllerProvider({ transport, pingIntervalMs: 0, livenessTimeoutMs: 0, saveTimeoutMs: 100 })
    return { provider, transport, messages, disconnect: () => disconnect() }
  }
  return { page, sockets, fetch, context }
}
const ip = '192.0.2.10'
const target = { address: ip, deviceId: 'pixelblaze_pb32_005544332211' }
const flush = () => vi.advanceTimersByTimeAsync(0)
type Page = ReturnType<ReturnType<typeof helperHarness>['page']>
function request(page: Page, type: 'get-map' | 'get-program' | 'get-wifi-status' | 'compile', reqId: string, address = ip) {
  page.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type, reqId, address, programId: 'id', patternSrc: '' } as RelayMessage)
}
async function connected(helper: ReturnType<typeof helperHarness>, address = ip) {
  const page = helper.page()
  const ready = page.provider.connect({ ...target, address })
  await flush()
  const socket = helper.sockets[helper.sockets.length - 1]
  socket.open()
  await ready
  return { ...page, socket }
}
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers() })

describe('helper Controller HTTP ownership', () => {
  it('Save gate holds every same-host HTTP kind across ports; cloud and other hosts proceed', async () => {
    vi.useFakeTimers()
    const h = helperHarness()
    const a = await connected(h)
    const b = await connected(h)
    const save = a.provider.saveProgram(new Uint8Array(), { id: 'id' })
    await flush()
    expect(a.socket.sent.some(frame => typeof frame !== 'string' && frame[0] === 1)).toBe(true)
    request(b, 'get-program', 'p', `${ip}:80`)
    request(b, 'get-map', 'm')
    request(b, 'get-wifi-status', 'w')
    request(b, 'compile', 'c')
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    a.socket.message({ ack: 1 })
    a.socket.message({ saveProgramSourceFile: undefined })
    a.socket.message('malformed')
    b.socket.message({ saveProgramSourceFile: 1 })
    // Observe malformed/nonobject frames on an unclaimed relay socket, so the
    // provider's independent firmware parser is outside this observation oracle.
    b.transport.post({ source: RELAY_SOURCE, dir: 'to-helper', type: 'connect', connId: 'observe', url: `ws://${ip}:81` })
    await flush()
    const observe = h.sockets[2]
    for (const frame of ['null', '[]', 'malformed']) observe.message(frame)
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    expect(b.messages.flatMap(msg => msg.type === 'message' && msg.connId === 'observe' ? [msg.payload] : [])).toEqual([
      { text: 'null' }, { text: '[]' }, { text: 'malformed' },
    ])
    request(b, 'get-map', 'other', '192.0.2.11')
    await b.provider.discover()
    await flush()
    expect(h.fetch.mock.calls.map(([url]) => url).sort()).toEqual([
      'https://discover.electromage.com/discover', 'http://192.0.2.11/pixelmap.dat',
    ].sort())
    a.socket.message({ saveProgramSourceFile: 1 })
    await save
    await flush()
    expect(h.fetch.mock.calls.slice(2).map(([url]) => url)).toEqual([
      `http://${ip}:80/p/id`, `http://${ip}/pixelmap.dat`, `http://${ip}/wifistatus`, `http://${ip}/index.html.gz`,
    ])
    a.disconnect(); b.disconnect()
  })

  it.each(['resolve', 'reject'] as const)('whole-body ownership survives provider timeout and body %s', async (outcome) => {
    vi.useFakeTimers()
    const h = helperHarness()
    const a = await connected(h)
    const b = await connected(h)
    const body = deferred<ArrayBuffer>()
    h.fetch.mockResolvedValueOnce({ ok: true, status: 200, arrayBuffer: () => body.promise })
    const result = a.provider.getPixelMapData().catch(error => error as Error)
    await flush()
    const next = b.provider.readSavedProgram('id').catch(error => error as Error)
    await flush()
    expect(h.fetch).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5001)
    expect(await result).toBeInstanceOf(Error)
    expect(h.fetch).toHaveBeenCalledTimes(1)
    if (outcome === 'resolve') body.resolve(new ArrayBuffer(0))
    else body.reject(new Error('body failed'))
    await flush()
    expect(h.fetch).toHaveBeenCalledTimes(2)
    await next
    a.disconnect(); b.disconnect()
  })

  it.each([
    ['get-program', 404], ['get-program', 503], ['get-map', 404], ['get-map', 503],
    ['get-wifi-status', 503], ['compile', 503],
  ] as const)('awaits error body cancellation (%s %s) before advancing FIFO', async (type, status) => {
    vi.useFakeTimers()
    const h = helperHarness()
    const page = h.page()
    const cancelled = deferred<void>()
    const cancel = vi.fn(() => cancelled.promise)
    h.fetch.mockResolvedValueOnce({ ok: false, status, body: { cancel } as unknown as Response['body'] })
    request(page, type, 'first')
    request(page, 'get-map', 'second')
    await flush()
    expect(cancel).toHaveBeenCalledOnce()
    expect(h.fetch).toHaveBeenCalledTimes(1)
    cancelled.resolve()
    await flush()
    expect(h.fetch).toHaveBeenCalledTimes(2)
    expect(page.messages.find(msg => 'reqId' in msg && msg.reqId === 'first')).toMatchObject({ ok: status === 404 })
    page.disconnect()
  })

  it('rechecks Save hold at admission after the preceding HTTP body settles', async () => {
    vi.useFakeTimers()
    const h = helperHarness()
    const a = await connected(h)
    const body = deferred<unknown>()
    h.fetch.mockResolvedValueOnce({ ok: true, json: () => body.promise })
    request(a, 'get-wifi-status', 'first')
    request(a, 'get-map', 'second')
    await flush()
    const save = a.provider.saveProgram(new Uint8Array(), { id: 'id' })
    await flush()
    body.resolve({ mac: 'test' })
    await flush()
    expect(h.fetch).toHaveBeenCalledTimes(1)
    a.socket.message({ saveProgramSourceFile: 1 })
    await save
    await flush()
    expect(h.fetch).toHaveBeenCalledTimes(2)
    a.disconnect()
  })

  it.each(['late completion', 'actual close', 'negative completion'] as const)('releases only on %s; timeout and close requests retain ownership', async (release) => {
    vi.useFakeTimers()
    const h = helperHarness()
    const a = await connected(h)
    const b = await connected(h)
    const save = a.provider.saveProgram(new Uint8Array(), { id: 'id' }).catch(error => error as Error)
    await flush()
    request(b, 'get-map', 'waiting')
    b.socket.closed()
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    if (release !== 'negative completion') {
      await vi.advanceTimersByTimeAsync(101)
      expect(await save).toMatchObject({ message: expect.stringContaining('completion timed out') })
      expect(h.fetch).not.toHaveBeenCalled()
      await expect(a.provider.saveProgram(new Uint8Array(), { id: 'again' })).rejects.toThrow('unavailable on this socket')
    }
    if (release === 'actual close') {
      a.disconnect()
      expect(a.socket.closeRequested).toBe(true)
      await flush()
      expect(h.fetch).not.toHaveBeenCalled()
      a.socket.closed()
    } else {
      a.socket.message({ saveProgramSourceFile: release === 'late completion' ? 1 : 0 })
      if (release === 'negative completion') expect(await save).toMatchObject({ message: expect.stringContaining('device reported failure') })
      else await expect(a.provider.saveProgram(new Uint8Array(), { id: 'again' })).rejects.toThrow('unavailable on this socket')
    }
    await flush()
    expect(h.fetch).toHaveBeenCalledOnce()
    a.disconnect(); b.disconnect()
  })

  it('keeps multiple socket owners distinct, including reused connId and old callbacks', async () => {
    vi.useFakeTimers()
    const h = helperHarness()
    const page = h.page()
    const raw = (type: 'connect' | 'send', connId: string) => page.transport.post({
      source: RELAY_SOURCE, dir: 'to-helper', type, connId, url: `ws://${ip}:81`,
      payload: { binary: btoa(String.fromCharCode(1, 3, 0)) },
    } as RelayMessage)
    raw('connect', 'same'); await flush()
    const old = h.sockets[0]
    raw('send', 'same'); old.closed()
    raw('connect', 'same'); raw('connect', 'other'); await flush()
    raw('send', 'same'); raw('send', 'other')
    request(page, 'get-map', 'waiting')
    await flush()
    old.message({ saveProgramSourceFile: 1 }); old.closed()
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    const fresh = helperHarness()
    request(fresh.page(), 'get-map', 'restart')
    await flush()
    expect(fresh.fetch).toHaveBeenCalledOnce()
    h.sockets[1].message({ saveProgramSourceFile: 1 })
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    // A stale close must not remove the replacement mapping.
    raw('send', 'same')
    expect(h.sockets[1].sent).toHaveLength(2)
    h.sockets[2].closed()
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    h.sockets[1].closed()
    await flush()
    expect(h.fetch).toHaveBeenCalledOnce()
    page.disconnect()
  })

  it('keeps ownership after a failed first-frame send until actual close', async () => {
    vi.useFakeTimers()
    const h = helperHarness()
    const a = await connected(h)
    vi.spyOn(a.socket, 'send').mockImplementation(() => { throw new Error('send failed') })
    const save = a.provider.saveProgram(new Uint8Array(), { id: 'id' }).catch(error => error as Error)
    request(a, 'get-map', 'held')
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(101)
    expect(await save).toBeInstanceOf(Error)
    a.disconnect()
    await flush()
    expect(h.fetch).not.toHaveBeenCalled()
    a.socket.closed()
    await flush()
    expect(h.fetch).toHaveBeenCalledOnce()
  })

  it('holds the compiler turn through compressed body decoding', async () => {
    vi.useFakeTimers()
    const h = helperHarness()
    const page = h.page()
    const decoded = deferred<string>()
    const text = vi.spyOn(Response.prototype, 'text').mockImplementationOnce(() => decoded.promise)
    h.fetch.mockResolvedValueOnce({ ok: true, arrayBuffer: async () => Uint8Array.from(gzipSync('no compiler')).buffer })
    request(page, 'compile', 'compile')
    await flush()
    request(page, 'get-map', 'next')
    await flush()
    expect(text).toHaveBeenCalledOnce()
    expect(h.fetch).toHaveBeenCalledTimes(1)
    decoded.resolve('no compiler')
    await flush()
    expect(h.fetch).toHaveBeenCalledTimes(2)
    text.mockRestore()
    page.disconnect()
  })
})
