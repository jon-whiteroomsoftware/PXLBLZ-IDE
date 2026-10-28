import WebSocket from 'ws'
import { Agent } from 'undici'
import { appendFileSync, writeFileSync } from 'node:fs'
import type { WebSocketLike } from '../src/engine/PixelblazeConnection'

export interface ProbeErrorFields {
  code?: string | number
  name?: string | number
  errno?: string | number
  syscall?: string | number
  message?: string | number
}

export interface ProbeSocketError extends ProbeErrorFields {
  utc: string
  httpStatus?: number
  cause?: ProbeErrorFields
}

export interface ProbeSocketRecord {
  socketId: number
  url: string
  createdAt: string
  reconnectSettle?: ProbeSocketSettle
  openedAt?: string
  closedAt?: string
  errors: ProbeSocketError[]
  closeCode?: number
  closeReason?: string
}

export interface ProbeSocketSettle {
  previousClosedAt: string
  settleStartedAt: string
  settleEndedAt: string
  settleMs: number
}

export interface ProbeSocketSequence {
  beforeBatch(): Promise<ProbeSocketSettle | undefined>
  trackSocket(): (closedAt: string) => void
}

export function createProbeSocketSequence(options: { now?: () => Date } = {}): ProbeSocketSequence {
  const now = () => (options.now?.() ?? new Date()).toISOString()
  let previousClose: Promise<string> | undefined
  return {
    async beforeBatch() {
      const priorClose = previousClose
      if (!priorClose) return undefined
      const previousClosedAt = await priorClose
      const settleStartedAt = now()
      await new Promise<void>((resolve) => setTimeout(resolve, 1000))
      return { previousClosedAt, settleStartedAt, settleEndedAt: now(), settleMs: 1000 }
    },
    trackSocket() {
      let closed!: (closedAt: string) => void
      previousClose = new Promise<string>((resolve) => { closed = resolve })
      return closed
    },
  }
}

function primitiveErrorFields(error: unknown): ProbeErrorFields {
  const fields: ProbeErrorFields = {}
  if (error === null || (typeof error !== 'object' && typeof error !== 'function')) return fields
  for (const key of ['code', 'name', 'errno', 'syscall', 'message'] as const) {
    const value = (error as Record<string, unknown>)[key]
    if (typeof value === 'string' || typeof value === 'number') fields[key] = value
  }
  return fields
}

export function writePrivateProbeReport(path: string, report: Record<string, unknown>, webSockets: readonly ProbeSocketRecord[]): void {
  writeFileSync(path, JSON.stringify({ ...report, webSockets }, null, 2), { mode: 0o600 })
}

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

export function createProbeRuntime(options: { socketEventLogPath?: string; now?: () => Date;
  socketSequence?: ProbeSocketSequence; reconnectSettle?: ProbeSocketSettle } = {}) {
  const agent = new Agent()
  const rawFetch = globalThis.fetch
  const sockets = new Set<WebSocket>()
  const webSockets: ProbeSocketRecord[] = []
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const observe = (record: ProbeSocketRecord, event: string, utc: string, fields: object = {}) => {
    if (options.socketEventLogPath) appendFileSync(options.socketEventLogPath,
      `${JSON.stringify({ socketId: record.socketId, url: record.url, event, utc, ...fields })}\n`, { mode: 0o600 })
  }
  let closing: Promise<void> | undefined
  let closed = false
  const assertOpen = () => { if (closed) throw new Error('Probe runtime is closed') }
  return {
    webSockets,
    fetch: ((input, init) => {
      if (closed) return Promise.reject(new Error('Probe runtime is closed'))
      // Preserve Node's global implementation and headers. Only ownership changes.
      return rawFetch(input, { ...init, dispatcher: agent } as RequestInit)
    }) as typeof fetch,
    webSocketFactory: (url: string): WebSocketLike => {
      assertOpen()
      const record: ProbeSocketRecord = { socketId: webSockets.length + 1, url, createdAt: now(), errors: [] }
      if (options.reconnectSettle) record.reconnectSettle = options.reconnectSettle
      webSockets.push(record)
      observe(record, 'created', record.createdAt, record.reconnectSettle ? { reconnectSettle: record.reconnectSettle } : {})
      const socket = new WebSocket(url)
      const recordClose = options.socketSequence?.trackSocket()
      sockets.add(socket)
      // A connecting socket emits error before close when terminated.
      socket.on('error', (error: unknown) => {
        const fields = primitiveErrorFields(error)
        const observation: ProbeSocketError = { utc: now(), ...fields }
        const status = typeof fields.message === 'string' ? /^Unexpected server response: (\d+)$/.exec(fields.message) : null
        if (status) observation.httpStatus = Number(status[1])
        if (error !== null && typeof error === 'object' && 'cause' in error) {
          const cause = primitiveErrorFields(error.cause)
          if (Object.keys(cause).length) observation.cause = cause
        }
        record.errors.push(observation)
        observe(record, 'error', observation.utc, observation)
      })
      socket.on('open', () => {
        record.openedAt = now()
        observe(record, 'open', record.openedAt)
      })
      socket.on('close', (code, reason) => {
        record.closedAt = now()
        record.closeCode = code
        if (reason !== undefined) record.closeReason = reason.toString('utf8')
        observe(record, 'close', record.closedAt, { closeCode: record.closeCode, closeReason: record.closeReason })
        recordClose?.(record.closedAt)
      })
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
