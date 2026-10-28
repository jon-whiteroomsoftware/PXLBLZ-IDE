import { EventEmitter } from 'node:events'
import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import { PixelblazeConnection, type WebSocketLike } from '../src/engine/PixelblazeConnection'
import { createProbeRuntime, createProbeSocketSequence, runProbePostRunConnectCheck, writePrivateProbeReport } from './controller-import-hardware-probe-runtime'
import { runProbeBatches } from './controller-import-hardware-probe-support'

const instances = vi.hoisted(() => [] as FakeSocket[])
vi.mock('ws', () => ({ default: class extends EventEmitter {
  static CLOSED = 3
  static CONNECTING = 0
  static OPEN = 1
  static CLOSING = 2
  constructor() { super(); instances.push(this) }
  readyState = 0
  onopen: ((event: unknown) => void) | null = null
  onerror: ((event: unknown) => void) | null = null
  onclose: ((event: unknown) => void) | null = null
  onmessage: ((event: unknown) => void) | null = null
  send = vi.fn()
  close = vi.fn((_code?: number) => { this.readyState = 2 })
  nativeClose = this.close
  terminate = vi.fn()
} }))

type FakeSocket = EventEmitter & {
  close(code?: number): void
  nativeClose(code?: number): void
  terminate(): void
  send(): void
  readyState: number; onopen: ((event: unknown) => void) | null
  onerror: ((event: unknown) => void) | null; onclose: ((event: unknown) => void) | null
}
const directories: string[] = []
afterEach(() => { for (const socket of instances.splice(0)) if (socket.readyState !== 3) close(socket)
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true }); vi.restoreAllMocks(); vi.useRealTimers() })

function fixture(options: Parameters<typeof createProbeRuntime>[0] = {}) {
  const root = mkdtempSync(join(tmpdir(), 'probe-telemetry-')); directories.push(root)
  const eventPath = join(root, 'socket-events.jsonl'); const reportPath = join(root, 'report.json')
  let tick = 0
  const time = (value: number) => new Date(Date.UTC(2026, 9, 28, 0, 0, value)).toISOString()
  const runtime = createProbeRuntime({ socketEventLogPath: eventPath, now: () => new Date(time(tick++)), ...options })
  const sockets: FakeSocket[] = []
  const adapters: WebSocketLike[] = []
  const connection = () => new PixelblazeConnection({ host: '127.0.0.1', webSocketFactory: (url) => {
    const adapter = runtime.webSocketFactory(url)
    sockets.push(instances[instances.length - 1]); adapters.push(adapter); return adapter
  } })
  const artifacts = () => {
    writePrivateProbeReport(reportPath, { summary: { fixture: true }, observed: [] }, runtime.webSockets)
    expect(statSync(reportPath).mode & 0o777).toBe(0o600)
    expect(statSync(eventPath).mode & 0o777).toBe(0o600)
    return { report: JSON.parse(readFileSync(reportPath, 'utf8')), events: readFileSync(eventPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line)) }
  }
  return { runtime, connection, sockets, adapters, artifacts, time }
}
function open(socket: FakeSocket) { socket.readyState = 1; socket.emit('open'); socket.onopen?.({ type: 'open' }) }
function fail(socket: FakeSocket, error: unknown) { socket.emit('error', error); socket.onerror?.({ type: 'error' }) }
function close(socket: FakeSocket, reason?: Buffer, code = 1006) {
  socket.readyState = 3; socket.emit('close', code, reason); socket.onclose?.({ code })
}

it('clean close waits for actual close and sends native 1000 only once', async () => {
  vi.useFakeTimers()
  const f = fixture(); const connecting = f.connection().connect(); const socket = f.sockets[0]
  open(socket); await connecting
  const nativeClose = socket.nativeClose
  expect(socket.close).toBe(nativeClose)
  f.adapters[0].close()
  expect(socket.close).toBe(nativeClose)
  let done = false
  const shutdown = f.runtime.close().then(() => { done = true })
  void f.runtime.close(); f.adapters[0].close()
  await Promise.resolve(); expect(done).toBe(false)
  expect(nativeClose).toHaveBeenCalledExactlyOnceWith(1000)
  expect(socket.terminate).not.toHaveBeenCalled()
  close(socket, undefined, 1000); await shutdown
  expect(socket.close).toBe(nativeClose)
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(6000); expect(socket.terminate).not.toHaveBeenCalled()
  const { report, events } = f.artifacts()
  expect(report.webSockets[0]).toMatchObject({ closePath: 'clean', closeRequestedAt: expect.any(String), closedAt: expect.any(String), closeCode: 1000 })
  expect(report.webSockets[0]).not.toHaveProperty('terminateRequestedAt')
  expect(events.filter((event) => event.event === 'close-request')).toEqual([
    { socketId: 1, url: 'ws://127.0.0.1:81', event: 'close-request', utc: report.webSockets[0].closeRequestedAt,
      closeRequestedAt: report.webSockets[0].closeRequestedAt, closePath: 'clean' },
  ])
  expect(events[events.length - 1]).toMatchObject({ event: 'close', closeCode: 1000, closePath: 'clean' })
})

it('bound fallback terminates once at 5000ms and still waits for actual close', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T03:00:00Z'))
  const f = fixture({ now: () => new Date() }); const connecting = f.connection().connect(); const socket = f.sockets[0]
  open(socket); await connecting; f.adapters[0].close()
  let done = false; const shutdown = f.runtime.close().then(() => { done = true })
  await vi.advanceTimersByTimeAsync(4999)
  expect(socket.terminate).not.toHaveBeenCalled(); expect(done).toBe(false)
  f.adapters[0].close(); void f.runtime.close()
  await vi.advanceTimersByTimeAsync(1)
  expect(socket.terminate).toHaveBeenCalledTimes(1); expect(done).toBe(false)
  close(socket); await shutdown; await vi.advanceTimersByTimeAsync(6000)
  expect(socket.terminate).toHaveBeenCalledTimes(1)
  const { report, events } = f.artifacts()
  expect(report.webSockets[0]).toEqual({ socketId: 1, url: 'ws://127.0.0.1:81', errors: [],
    createdAt: '2026-10-28T03:00:00.000Z', openedAt: '2026-10-28T03:00:00.000Z',
    closeRequestedAt: '2026-10-28T03:00:00.000Z', closePath: 'terminate-fallback',
    terminateRequestedAt: '2026-10-28T03:00:05.000Z', closedAt: '2026-10-28T03:00:05.000Z', closeCode: 1006 })
  expect(events.filter((event) => event.event === 'terminate-fallback')).toEqual([
    { socketId: 1, url: 'ws://127.0.0.1:81', event: 'terminate-fallback', utc: '2026-10-28T03:00:05.000Z',
      closeRequestedAt: '2026-10-28T03:00:00.000Z', closePath: 'terminate-fallback', terminateRequestedAt: '2026-10-28T03:00:05.000Z' },
  ])
})

it.each(['clean', 'connect-error', 'fallback'] as const)('post-run report retains actual %s result after last settle without commands or retry', async (mode) => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T03:00:00Z'))
  const sequence = createProbeSocketSequence(); const prior = fixture({ socketSequence: sequence, now: () => new Date() })
  const connecting = prior.connection().connect(); open(prior.sockets[0]); await connecting; close(prior.sockets[0]); await prior.runtime.close()
  const root = mkdtempSync(join(tmpdir(), 'probe-post-run-')); directories.push(root)
  const reportPath = join(root, 'post-run-connect-report.json'); const socketEventLogPath = join(root, 'post-run-socket-events.jsonl')
  const fetchSpy = vi.spyOn(globalThis, 'fetch')
  const check = runProbePostRunConnectCheck({ host: '127.0.0.1', socketSequence: sequence, reportPath, socketEventLogPath })
  await vi.advanceTimersByTimeAsync(999); expect(instances).toHaveLength(1)
  await vi.advanceTimersByTimeAsync(1); expect(instances).toHaveLength(2)
  const socket = instances[1]
  if (mode === 'connect-error') fail(socket, Object.assign(new Error('private connect failure'), { code: 'ECONNRESET' }))
  else open(socket)
  await vi.advanceTimersByTimeAsync(0)
  expect(socket.nativeClose).toHaveBeenCalledExactlyOnceWith(1000)
  if (mode === 'fallback') { await vi.advanceTimersByTimeAsync(5000); expect(socket.terminate).toHaveBeenCalledTimes(1) }
  close(socket, undefined, mode === 'clean' ? 1000 : 1006)
  const summary = await check
  const report = JSON.parse(readFileSync(reportPath, 'utf8'))
  expect(report.summary).toEqual({ success: mode === 'clean', connected: mode !== 'connect-error',
    closePath: mode === 'fallback' ? 'terminate-fallback' : 'clean', closeCode: mode === 'clean' ? 1000 : 1006,
    ...(mode === 'clean' ? {} : { failure: mode === 'connect-error' ? 'connection.connect' : 'connection.close' }) })
  const events = readFileSync(socketEventLogPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line))
  expect(report.summary).toEqual(summary); expect(Object.keys(report).sort()).toEqual(['summary', 'webSockets'])
  expect(report.webSockets).toHaveLength(1)
  expect(report.webSockets[0]).toMatchObject({ createdAt: '2026-10-28T03:00:01.000Z', closedAt: expect.any(String),
    reconnectSettle: { previousClosedAt: '2026-10-28T03:00:00.000Z', settleStartedAt: '2026-10-28T03:00:00.000Z', settleEndedAt: '2026-10-28T03:00:01.000Z', settleMs: 1000 },
    closePath: summary.closePath, closeCode: summary.closeCode })
  if (mode === 'connect-error') {
    expect(report.webSockets[0]).not.toHaveProperty('openedAt')
    expect(report.webSockets[0].errors[0]).toMatchObject({ message: 'private connect failure', code: 'ECONNRESET' })
  } else expect(report.webSockets[0].openedAt).toBe('2026-10-28T03:00:01.000Z')
  expect(events[events.length - 1]).toMatchObject({ event: 'close', closePath: summary.closePath, closeCode: summary.closeCode })
  expect(statSync(reportPath).mode & 0o777).toBe(0o600); expect(statSync(socketEventLogPath).mode & 0o777).toBe(0o600)
  expect(instances).toHaveLength(2); expect(socket.send).not.toHaveBeenCalled(); expect(fetchSpy).not.toHaveBeenCalled()
})

it('wires the post-run check only after batch success and outside batch accounting', () => {
  const source = readFileSync(new URL('./controller-import-hardware-probe.ts', import.meta.url), 'utf8')
  expect(source).toMatch(/const postRunConnectCheck = result.success\s*\? await runProbePostRunConnectCheck/)
  expect(source).toContain("resolve(root, 'post-run-socket-events.jsonl')")
  expect(source).toContain("resolve(root, 'post-run-connect-report.json')")
  expect(source).toContain('completed: result.completed')
  expect(source).toContain('outcomes: result.outcomes')
  expect(source).toContain('...(postRunConnectCheck ? { postRunConnectCheck } : {})')
  expect(source).toContain('success: result.success && postRunConnectCheck?.success === true')
  expect(source).toContain('if (!summary.success) process.exitCode = 1')
})

async function cleanup(f: ReturnType<typeof fixture>) {
  for (const socket of f.sockets) if (socket.readyState !== 3) close(socket)
  await f.runtime.close()
}

it('admits the first batch immediately without a settle timer or private settle fields', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T03:00:00.000Z'))
  const sequence = createProbeSocketSequence()
  expect(await sequence.beforeBatch()).toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
  const f = fixture({ socketSequence: sequence, now: () => new Date() })
  try {
    const pending = f.connection().connect(); expect(f.sockets).toHaveLength(1)
    open(f.sockets[0]); await pending; await cleanup(f)
    const { report, events } = f.artifacts()
    expect(report.webSockets[0]).not.toHaveProperty('reconnectSettle')
    expect(events.every((event) => !('reconnectSettle' in event))).toBe(true)
  } finally { await cleanup(f) }
})

it('waits for actual close and 999ms before constructing the next socket with reopened settle artifacts', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T03:00:00.000Z'))
  const sequence = createProbeSocketSequence()
  const first = fixture({ socketSequence: sequence, now: () => new Date() })
  let next: ReturnType<typeof fixture> | undefined
  try {
    const pending = first.connection().connect(); open(first.sockets[0]); await pending
    const timer = vi.spyOn(globalThis, 'setTimeout')
    const admission = sequence.beforeBatch().then((reconnectSettle) => {
      next = fixture({ socketSequence: sequence, reconnectSettle, now: () => new Date() })
      const connecting = next.connection().connect(); open(next.sockets[0]); return connecting
    })
    first.adapters[0].close()
    await vi.advanceTimersByTimeAsync(1500)
    expect(next).toBeUndefined(); expect(timer).toHaveBeenCalledExactlyOnceWith(expect.any(Function), 5000)
    const closedAt = new Date().toISOString()
    close(first.sockets[0])
    await vi.advanceTimersByTimeAsync(999)
    expect(next).toBeUndefined()
    await vi.advanceTimersByTimeAsync(1); await admission
    const second = next!; expect(second.sockets).toHaveLength(1)
    const createdAt = new Date().toISOString()
    const reconnectSettle = { previousClosedAt: closedAt, settleStartedAt: closedAt, settleEndedAt: createdAt, settleMs: 1000 }
    await cleanup(second)
    const before = second.artifacts()
    expect(before.report.webSockets[0]).toEqual({ socketId: 1, url: 'ws://127.0.0.1:81', createdAt,
      openedAt: createdAt, closedAt: createdAt, closeCode: 1006, errors: [], reconnectSettle })
    expect(before.events).toEqual([
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'created', utc: createdAt, reconnectSettle },
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'open', utc: createdAt },
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'close', utc: createdAt, closeCode: 1006 },
    ])
    expect(Date.parse(createdAt) - Date.parse(closedAt)).toBeGreaterThanOrEqual(1000)
    await vi.advanceTimersByTimeAsync(50); close(first.sockets[0]); open(first.sockets[0])
    expect(second.artifacts()).toEqual(before)
  } finally { await cleanup(first); if (next) await cleanup(next) }
})

it('stops real batch sequencing after one settled failed connect without retry or fabricated open', async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-28T03:00:00.000Z'))
  const sequence = createProbeSocketSequence()
  const fixtures: ReturnType<typeof fixture>[] = []
  const stops = { phase: 'setup' as const, operation: 'connection.connect' }
  const callback = vi.fn(async (batchIndex: number) => {
    const reconnectSettle = await sequence.beforeBatch()
    const f = fixture({ socketSequence: sequence, reconnectSettle, now: () => new Date() }); fixtures.push(f)
    try {
      const connecting = f.connection().connect()
      if (batchIndex === 1) { open(f.sockets[0]); await connecting }
      else {
        fail(f.sockets[0], Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET', syscall: 'read' }))
        await expect(connecting).rejects.toThrow('WebSocket error before open')
        expect(f.artifacts().report.webSockets[0]).not.toHaveProperty('closedAt')
      }
      const closing = f.runtime.close(); close(f.sockets[0]); await closing
      return { success: batchIndex === 1, connected: batchIndex === 1, qualified: batchIndex === 1,
        httpStopped: false, ...(batchIndex === 1 ? {} : { firstStop: stops }) }
    } finally { await cleanup(f) }
  })
  try {
    const resultPromise = runProbeBatches(3, callback)
    await vi.advanceTimersByTimeAsync(0)
    expect(fixtures).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(999); expect(fixtures).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    const result = await resultPromise
    expect(callback.mock.calls.map(([index]) => index)).toEqual([1, 2])
    expect(fixtures[1].sockets).toHaveLength(1)
    expect(result).toMatchObject({ success: false, completed: 2, firstStop: { batchIndex: 2, ...stops },
      outcomes: [{ batchIndex: 1, status: 'qualified' }, { batchIndex: 2, status: 'lost-connection' }] })
    const { report, events } = fixtures[1].artifacts()
    const utc = '2026-10-28T03:00:01.000Z'
    const reconnectSettle = { previousClosedAt: '2026-10-28T03:00:00.000Z', settleStartedAt: '2026-10-28T03:00:00.000Z', settleEndedAt: utc, settleMs: 1000 }
    const error = { utc, name: 'Error', message: 'read ECONNRESET', code: 'ECONNRESET', syscall: 'read' }
    expect(report.webSockets).toEqual([{ socketId: 1, url: 'ws://127.0.0.1:81', createdAt: utc,
      reconnectSettle, errors: [error], closeRequestedAt: utc, closePath: 'clean', closedAt: utc, closeCode: 1006 }])
    expect(events).toEqual([
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'created', utc, reconnectSettle },
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'error', ...error },
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'close-request', utc, closeRequestedAt: utc, closePath: 'clean' },
      { socketId: 1, url: 'ws://127.0.0.1:81', event: 'close', utc, closeCode: 1006, closeRequestedAt: utc, closePath: 'clean' },
    ])
  } finally { for (const f of fixtures) await cleanup(f) }
})

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
      { socketId: 1, url: 'ws://127.0.0.1:81', createdAt: f.time(0), openedAt: f.time(1), closeRequestedAt: f.time(5), closePath: 'clean', closedAt: f.time(6), closeCode: 1006, closeReason: 'opened fixture', errors: [] },
      { socketId: 2, url: 'ws://127.0.0.1:81', createdAt: f.time(2), closedAt: f.time(4), closeCode: 1006, closeReason: 'refused fixture', errors: [error] },
    ] })
    expect(events).toEqual([
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(0), event: 'created' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(1), event: 'open' },
      { socketId: 2, url: 'ws://127.0.0.1:81', utc: f.time(2), event: 'created' },
      { socketId: 2, url: 'ws://127.0.0.1:81', event: 'error', ...error },
      { socketId: 2, url: 'ws://127.0.0.1:81', utc: f.time(4), event: 'close', closeCode: 1006, closeReason: 'refused fixture' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(5), event: 'close-request', closeRequestedAt: f.time(5), closePath: 'clean' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(6), event: 'close', closeCode: 1006, closeReason: 'opened fixture', closeRequestedAt: f.time(5), closePath: 'clean' },
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
      errors: [{ utc: f.time(1) }], closeRequestedAt: f.time(2), closePath: 'clean', closedAt: f.time(3), closeCode: 1006 }])
    expect(events).toEqual([
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(0), event: 'created' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(1), event: 'error' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(2), event: 'close-request', closeRequestedAt: f.time(2), closePath: 'clean' },
      { socketId: 1, url: 'ws://127.0.0.1:81', utc: f.time(3), event: 'close', closeCode: 1006, closeRequestedAt: f.time(2), closePath: 'clean' },
    ])
    for (const spy of spies) expect(spy).not.toHaveBeenCalled()
  } finally { for (const socket of f.sockets) if (socket.readyState !== 3) close(socket); await f.runtime.close() }
})

it('parses only anchored unexpected-response raw errors without installing a handshake listener', async () => {
  const f = fixture()
  try {
    for (const message of ['Unexpected server response: 503', 'generic failure', 'prefix Unexpected server response: 503', 'Unexpected server response: 503 suffix']) {
      const pending = f.connection().connect(); const socket = f.sockets[f.sockets.length - 1]
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
