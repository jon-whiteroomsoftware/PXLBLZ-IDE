import { createServer } from 'node:http'
import { execFile, spawn, type ChildProcess } from 'node:child_process'
import { once } from 'node:events'
import type { Socket } from 'node:net'
import { promisify } from 'node:util'
import { WebSocketServer } from 'ws'
import { expect, it, vi } from 'vitest'
import { closeProbeResources, createProbeRuntime } from './controller-import-hardware-probe-runtime'

const REPORT_MARKER = 'REPORT:cleanup-complete'
type ChildExit = Promise<[number | null, NodeJS.Signals | null]>

async function bounded<T>(operation: Promise<T>, label: string, milliseconds = 500): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([operation, new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => reject(new Error(`Cleanup failed: ${label}`)), milliseconds)
    })])
  } finally { clearTimeout(timer) }
}

function childAlive(child: ChildProcess) {
  return child.exitCode === null && child.signalCode === null
}

async function terminateOwnedChild(child: ChildProcess, exit: ChildExit) {
  for (const signal of ['SIGTERM', 'SIGKILL'] as const) {
    if (!childAlive(child)) return
    if (!child.pid) throw new Error('Cleanup failed: missing owned child PID')
    const { stdout } = await promisify(execFile)('ps', ['-p', String(child.pid), '-o', 'pid='], { timeout: 500 })
    if (!childAlive(child)) return
    if (stdout.trim() !== String(child.pid)) throw new Error('Cleanup failed: owned child PID not verified')
    child.kill(signal)
    const exited = await bounded(exit.then(() => true), `${signal} exit`).catch(() => false)
    if (exited) return
  }
  throw new Error('Cleanup failed: owned child termination not observed')
}

async function waitForChildOracle(child: ReturnType<typeof spawn>, exit: ChildExit,
  closures: Promise<void>[], closeFixtures: () => Promise<void>, deadlineOnReport = false) {
  let stdout = ''; let stderr = ''; let reportSeen!: () => void
  const report = new Promise<void>((done) => { reportSeen = done })
  child.stdout!.on('data', (bytes) => { stdout += bytes; if (stdout.includes(REPORT_MARKER)) reportSeen() })
  child.stderr!.on('data', (bytes) => { stderr += bytes })
  let timer: ReturnType<typeof setTimeout> | undefined
  let deadlineExceeded = false
  // Allow the intentional 5s close fallback; the failure witness triggers on its report.
  const deadline = (deadlineOnReport ? report : new Promise<void>((done) => {
    timer = setTimeout(done, 8000)
  })).then(() => { deadlineExceeded = true })
  try {
    await Promise.race([Promise.all([exit, ...closures]), deadline])
  } finally {
    clearTimeout(timer)
    try { await bounded(closeFixtures(), 'parent fixture closure') }
    finally { if (childAlive(child)) await terminateOwnedChild(child, exit) }
  }
  const [code, signal] = await bounded(exit, 'child exit')
  await bounded(Promise.all(closures), 'body/socket closure')
  return { deadlineExceeded, code, signal, stdout, stderr }
}

it('refuses new resources after idempotent shutdown', async () => {
  const runtime = createProbeRuntime()
  const closing = runtime.close()
  expect(runtime.close()).toBe(closing)
  await closing
  await expect(runtime.fetch('http://127.0.0.1:1')).rejects.toThrow('runtime is closed')
  expect(() => runtime.webSocketFactory('ws://127.0.0.1:1')).toThrow('runtime is closed')
})

it.each(['none', 'stop', 'disconnect', 'close'])('settles all cleanup owners even when %s fails', async (failing) => {
  const order: string[] = []
  const cleanup = async (operation: string) => { order.push(operation); if (operation === failing) throw new Error('private failure') }
  const failures = await closeProbeResources({
    stopMonitor: () => cleanup('stop'), disconnectProvider: () => cleanup('disconnect'),
    closeRuntime: () => cleanup('close'), restoreFetch: () => { order.push('restore') },
  })
  expect(order).toEqual(['stop', 'disconnect', 'close', 'restore'])
  expect(failures.map((failure) => failure.operation)).toEqual(failing === 'none' ? [] : [
    failing === 'stop' ? 'monitor.stop' : failing === 'disconnect' ? 'provider.disconnect' : 'runtime.close',
  ])
})

it('keeps the captured global fetch implementation, dispatcher ownership and headers', async () => {
  const rawFetch = vi.fn(async () => new Response(null))
  vi.stubGlobal('fetch', rawFetch)
  const runtime = createProbeRuntime()
  try {
    await runtime.fetch('http://127.0.0.1:1', { headers: { 'x-fixture': 'preserved' } })
    expect(rawFetch).toHaveBeenCalledWith('http://127.0.0.1:1', expect.objectContaining({ headers: { 'x-fixture': 'preserved' }, dispatcher: expect.any(Object) }))
  } finally { await runtime.close(); vi.unstubAllGlobals() }
})

it('closes pending HTTP bodies and uncooperative sockets, reports and exits naturally', async () => {
  const sockets = new Set<Socket>()
  let bodyClosed!: () => void; let socketClosed!: () => void
  const bodyClosure = new Promise<void>((done) => { bodyClosed = done })
  const socketClosure = new Promise<void>((done) => { socketClosed = done })
  const server = createServer((_req, res) => {
    res.writeHead(200); res.write('unfinished')
    res.on('close', bodyClosed)
  })
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)) })
  const wss = new WebSocketServer({ server })
  wss.on('connection', (socket) => {
    // ws normally echoes the close frame via close(); this peer withholds it.
    socket.close = () => {}
    socket.on('close', socketClosed)
  })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Missing loopback port')
  const origin = `127.0.0.1:${address.port}`
  const child = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '--eval', `
    import { createProbeRuntime, closeProbeResources } from './scripts/controller-import-hardware-probe-runtime.ts';
    const runtime = createProbeRuntime();
    const response = await runtime.fetch('http://${origin}/');
    const body = response.arrayBuffer().catch(() => undefined);
    const ws = runtime.webSocketFactory('ws://${origin}/');
    await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject });
    // Also terminate a connecting socket: Node ws emits error before close.
    runtime.webSocketFactory('ws://${origin}/');
    const failures = await closeProbeResources({ stopMonitor: async () => {},
      disconnectProvider: async () => ws.close(), closeRuntime: () => runtime.close(), restoreFetch: () => {} });
    if (failures.length) throw new Error('cleanup failed');
    await runtime.close();
    await body;
    console.log('REPORT:cleanup-complete');
  `], { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] })
  const exit = once(child, 'exit') as ChildExit
  const { stdout, ...verdict } = await waitForChildOracle(child, exit, [bodyClosure, socketClosure], async () => {
    for (const socket of wss.clients) socket.terminate()
    for (const socket of sockets) socket.destroy()
    await Promise.all([
      new Promise<void>((done) => wss.close(() => done())),
      new Promise<void>((done) => server.close(() => done())),
    ])
  })
  expect(verdict).toEqual({ deadlineExceeded: false, code: 0, signal: null, stderr: '' })
  expect(stdout).toContain(REPORT_MARKER)
}, 10000)

it('fails the natural-exit verdict and cleans up an owned child that retains an interval', async () => {
  const child = spawn(process.execPath, ['--eval', `console.log('${REPORT_MARKER}'); setInterval(() => {}, 1000)`],
    { stdio: ['ignore', 'pipe', 'pipe'] })
  const exit = once(child, 'exit') as ChildExit
  try {
    const verdict = await waitForChildOracle(child, exit, [], async () => {}, true)
    expect(verdict).toEqual({ deadlineExceeded: true, code: null, signal: 'SIGTERM', stdout: `${REPORT_MARKER}\n`, stderr: '' })
    expect(childAlive(child)).toBe(false)
    expect(await bounded(exit, 'failure witness exit')).toEqual([null, 'SIGTERM'])
  } finally {
    // Independent rescue keeps the bounded red witness from leaking a child when oracle cleanup is removed.
    if (childAlive(child)) await terminateOwnedChild(child, exit)
  }
}, 5000)
