import WebSocket from 'ws'
import { Agent } from 'undici'
import type { WebSocketLike } from '../src/engine/PixelblazeConnection'

/** All exits use this order. One cleanup failure cannot skip another owner. */
export async function closeProbeResources(owners: {
  stopMonitor: () => Promise<unknown>; disconnectProvider: () => Promise<unknown>;
  closeRuntime: () => Promise<unknown>; restoreFetch: () => void
}) {
  const failures: { operation: string; error: unknown }[] = []
  for (const [operation, close] of [
    ['monitor.stop', owners.stopMonitor], ['provider.disconnect', owners.disconnectProvider], ['runtime.close', owners.closeRuntime],
  ] as const) {
    try { await close() } catch (error) { failures.push({ operation, error }) }
  }
  try { owners.restoreFetch() } catch (error) { failures.push({ operation: 'fetch.restore', error }) }
  return failures
}

export function createProbeRuntime() {
  const agent = new Agent()
  const rawFetch = globalThis.fetch
  const sockets = new Set<WebSocket>()
  let closing: Promise<void> | undefined
  let closed = false
  const assertOpen = () => { if (closed) throw new Error('Probe runtime is closed') }
  return {
    fetch: ((input, init) => {
      if (closed) return Promise.reject(new Error('Probe runtime is closed'))
      // Preserve Node's global implementation and headers. Only ownership changes.
      return rawFetch(input, { ...init, dispatcher: agent } as RequestInit)
    }) as typeof fetch,
    webSocketFactory: (url: string): WebSocketLike => {
      assertOpen()
      const socket = new WebSocket(url)
      sockets.add(socket)
      // A connecting socket emits error before close when terminated.
      socket.on('error', () => {})
      socket.once('close', () => sockets.delete(socket))
      return socket as unknown as WebSocketLike
    },
    close: (): Promise<void> => {
      if (closing) return closing
      closed = true
      closing = (async () => {
        const shutdowns: Promise<unknown>[] = [...sockets].map((socket) => new Promise<void>((resolve) => {
          if (socket.readyState === WebSocket.CLOSED) { resolve(); return }
          socket.once('close', () => resolve())
          socket.terminate()
        }))
        shutdowns.push(agent.destroy())
        const results = await Promise.allSettled(shutdowns)
        const failures = results.filter((result) => result.status === 'rejected')
        if (failures.length) throw new AggregateError(failures.map((result) => result.reason), 'Probe resource cleanup failed')
      })()
      return closing
    },
  }
}
