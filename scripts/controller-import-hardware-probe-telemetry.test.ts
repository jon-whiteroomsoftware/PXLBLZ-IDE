import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { PixelblazeConnection } from '../src/engine/PixelblazeConnection'
import { createProbeRuntime, writePrivateProbeReport } from './controller-import-hardware-probe-runtime'

vi.mock('ws', () => ({ default: class extends EventEmitter {
  static CLOSED = 3
  static CONNECTING = 0
  static OPEN = 1
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onmessage: ((event: unknown) => void) | null = null
  send() {}
  close() {}
  terminate() { this.close() }
} }))

type FakeSocket = EventEmitter & {
  readyState: number; onopen: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null; onclose: ((event: unknown) => void) | null
}
const directories: string[] = []
afterEach(() => { for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); vi.restoreAllMocks() })

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'probe-telemetry-')); directories.push(root)
  const eventPath = join(root, 'socket-events.jsonl'); const reportPath = join(root, 'report.json')
  let tick = 0
  const time = (value: number) => new Date(Date.UTC(2026, 9, 28, 0, 0, value)).toISOString()
  const runtime = createProbeRuntime({ socketEventLogPath: eventPath, now: () => new Date(time(tick++)) })
  const sockets: FakeSocket[] = []
  const connection = () => new PixelblazeConnection({ host: '127.0.0.1', webSocketFactory: (url) => {
    const socket = runtime.webSocketFactory(url); sockets.push(socket as unknown as FakeSocket); return socket
  } })
  const artifacts = () => {
    writePrivateProbeReport(reportPath, { summary: { fixture: true }, observed: [] }, runtime.webSockets)
    expect(statSync(reportPath).mode & 0o777).toBe(0o600)
    expect(statSync(eventPath).mode & 0o777).toBe(0o600)
    return { report: JSON.parse(readFileSync(reportPath, 'utf8')), events: readFileSync(eventPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) }
  }
  return { runtime, connection, sockets, artifacts, time }
}
function open(socket: FakeSocket) { socket.readyState = 1; socket.emit('open'); socket.onopen?.({ type: 'open' }) }
function fail(socket: FakeSocket, error: unknown) { socket.emit('error', error); socket.onerror?.({ type: 'error' }) }
function close(socket: FakeSocket, reason?: Buffer) {
  socket.readyState = 3; socket.emit('close', 1006, reason); socket.onclose?.({ code: 1006 })
}

it('preserves Event-style underlying error fields and actual lifecycle in reopened private artifacts', async () => {
  const f = fixture()
  try {
    const first = f.connection().connect(); open(f.sockets[0]); await first
    const second = f.connection().connect()
    fail(f.sockets[1], Object.assign(new Error('connect ECONNREFUSED 192.168.8.196:81'), {
      code: 'ECONNREFUSED', errno: -61, syscall: 'connect', cause: Object.assign(new Error('cause fixture'), { code: 42 }),
    }))
    await expect(second).rejects.toThrow('WebSocket error before open')
    const beforeClose = f.artifacts()
    expect(beforeClose.report.webSockets.every((record: object) => !('closedAt' in record))).toBe(true)
    close(f.sockets[1], Buffer.from('refused fixture'))
    let settled = false
    const cleanup = f.runtime.close().then(() => { settled = true })
    await Promise.resolve(); expect(settled).toBe(false)
    close(f.sockets[0], Buffer.from('opened fixture')); await cleanup
    const { report, events } = f.artifacts()
    const error = { utc: f.time(3), code: 'ECONNREFUSED', name: 'Error', errno: -61, syscall: 'connect',
      message: 'connect ECONNREFUSED 192.168.8.196:81', cause: { name: 'Error', message: 'cause fixture', code: 42 } }
    expect(report).toEqual({ summary: { fixture: true }, observed: [], webSockets: [
      { socketId: 1, url: 'ws://127.0.0.1:81', createdAt: f.time(0), openedAt: f.time(1), closedAt: f.time(5), closeCode: 1006, closeReason: 'opened fixture', errors: [] },
      { socketId: 2, url: 'ws://127.0.0.1:81', createdAt: f.time(2), closedAt: f.time(4), closeCode: 1006, closeReason: 'refused fixture', errors: [error] },
    ] })
    expect(events).toEqual([
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(0), event: 'created' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(1), event: 'open' },
      { socketId: 2, url: 'ws://127.0.0.1:81', utc: f.time(2), event: 'created' },
      { socketId: 2, url: 'ws://127.0.0.1:81', event: 'error', ...error },
      { socketId: 2, url: 'ws://127.0.0.1:81', utc: f.time(4), event: 'close', closeCode: 1006, closeReason: 'refused fixture' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(5), event: 'close', closeCode: 1006, closeReason: 'opened fixture' },
    ])
    expect(report.webSockets.filter((record: { openedAt?: string }) => record.openedAt)).toHaveLength(1)
  } finally { for (const socket of f.sockets) if (socket.readyState !== 3) close(socket); await f.runtime.close() }
})

it('omits missing error fields and close reason without leaking diagnostics to consoles', async () => {
  const spies = [vi.spyOn(console, 'log'), vi.spyOn(console, 'error'), vi.spyOn(console, 'warn')]
  const f = fixture()
  try {
    const pending = f.connection().connect(); fail(f.sockets[0], { type: 'error' })
    await expect(pending).rejects.toThrow('WebSocket error before open')
    const cleanup = f.runtime.close(); close(f.sockets[0]); await cleanup
    const { report, events } = f.artifacts()
    expect(report.webSockets).toEqual([{ socketId: 1, url: 'ws://127.0.0.1:81', createdAt: f.time(0),
      errors: [{ utc: f.time(1) }], closedAt: f.time(2), closeCode: 1006 }])
    expect(events).toEqual([
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(0), event: 'created' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(1), event: 'error' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(2), event: 'close', closeCode: 1006 },
    ])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  } finally { for (const socket of f.sockets) if (socket.readyState !== 3) close(socket); await f.runtime.close() }
})

it('parses only anchored unexpected-response raw errors without installing a handshake listener', async () => {
  const f = fixture()
  try {
    for (const message of ['Unexpected server response: 503', 'generic failure', 'prefix Unexpected server response: 503', 'Unexpected server response: 503 suffix']) {
      const pending = f.connection().connect(); const socket = f.sockets.at(-1)!
      expect(socket.listenerCount('unexpected-response')).toBe(0)
      fail(socket, new Error(message)); await expect(pending).rejects.toThrow('WebSocket error before open'); close(socket)
    }
    await f.runtime.close()
    const { report, events } = f.artifacts()
    expect(report.webSockets.map((record: { errors: { httpStatus?: number }[] }) => record.errors[0].httpStatus)).toEqual([503, undefined, undefined, undefined])
    expect(events.filter((event) => event.event === 'error').map((event) => event.httpStatus)).toEqual([503, undefined, undefined, undefined])
    expect(report.webSockets[0].errors[0].message).toBe('Unexpected server response: 503')
  } finally { for (const socket of f.sockets) if (socket.readyState !== 3) close(socket); await f.runtime.close() }
})
