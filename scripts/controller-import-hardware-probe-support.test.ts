import { afterEach, describe, expect, it, vi } from 'vitest'
import { encodePbp } from '../src/engine/pbpEncode'
import { stampArtifact } from '../src/engine/artifactStamp'
import { NodeControllerImportProvider, ProbeEventRecorder, ProbeLivenessMonitor, parseProbeArgs, sanitizedTimingTable, waitForFixtureReadback, type ProbeConnection } from './controller-import-hardware-probe-support'
import { recoverSavedProgram } from '../src/engine/controllerSavedProgramRead'

function harness(fetcher: typeof fetch = vi.fn(), compiler: (source: string) => Promise<Uint8Array> | Uint8Array = () => new Uint8Array(12)) {
  const lines: string[] = []
  const recorder = new ProbeEventRecorder((line) => lines.push(line), () => new Date('2026-10-27T00:00:00Z'), () => Date.now())
  const connection: ProbeConnection = {
    isConnected: true, connect: vi.fn(async () => {}), close: vi.fn(),
    getConfig: vi.fn(async () => ({ activeProgramId: 'active' })), listPrograms: vi.fn(async () => []),
    setActiveProgram: vi.fn(), saveProgram: vi.fn(), pushByteCodeAndWait: vi.fn(async () => {}),
  }
  return { lines, recorder, connection, provider: new NodeControllerImportProvider({ connection, fetcher, compiler, recorder }) }
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('probe liveness monitor', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void
    const promise = new Promise<T>((done) => { resolve = done })
    return { promise, resolve }
  }
  function setup(fetcher: typeof fetch) {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const h = harness(fetcher)
    let phase = 'setup'
    const monitor = new ProbeLivenessMonitor({ fetcher, recorder: h.recorder, fields: () => ({ phase, case: 'drain' }), now: Date.now })
    const provider = new NodeControllerImportProvider({ connection: h.connection, fetcher, recorder: h.recorder,
      compiler: () => new Uint8Array(12), assertMutation: () => {
        monitor.assertCurrent()
        if (!h.connection.isConnected) throw new Error('Controller connection is not open')
        monitor.markMutationStarted()
      } })
    const save = () => provider.saveProgram(encodePbp({ id: 'fixture', name: 'Fixture', sourceCode: '', byteCode: new Uint8Array(12) }), { id: 'fixture' })
    const stop = async () => {
      const stopped = monitor.stop()
      await vi.advanceTimersByTimeAsync(5000)
      await stopped
      await monitor.stop()
      expect(vi.getTimerCount()).toBe(0)
    }
    const paired = () => {
      for (const operation of ['poll.list', 'http.read']) {
        const events = h.recorder.events.filter((e) => e.operation === operation)
        expect(events.filter((e) => e.event === 'start')).toHaveLength(monitor.polls.attempted)
        for (const start of events.filter((e) => e.event === 'start')) {
          expect(events.filter((e) => e.spanId === start.spanId).map((e) => e.event)).toEqual([
            'start', expect.stringMatching(/^(end|error)$/),
          ])
          expect(start).toMatchObject({ case: 'drain', phase: expect.stringMatching(/^(setup|import)$/) })
        }
      }
    }
    return { ...h, monitor, save, provider, stop, paired, setPhase: () => { phase = 'import' } }
  }

  it('serializes slow poll requests with a full second after settlement', async () => {
    const body = deferred<ArrayBuffer>()
    const first = new Response(null)
    vi.spyOn(first, 'arrayBuffer').mockReturnValue(body.promise)
    const fetcher = vi.fn().mockResolvedValueOnce(first).mockImplementation(async () => new Response(null))
    const h = setup(fetcher)
    h.monitor.start(); h.monitor.start()
    await vi.advanceTimersByTimeAsync(4500)
    expect(fetcher).toHaveBeenCalledTimes(1)
    body.resolve(new ArrayBuffer(0)); await vi.advanceTimersByTimeAsync(0)
    expect(h.monitor.lastPollOk).toBe(true)
    h.setPhase()
    await vi.advanceTimersByTimeAsync(999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(h.monitor.polls).toEqual({ attempted: 2, succeeded: 2, failed: 0, skippedAtCapacity: 0, maxConcurrent: 1 })
    expect(h.recorder.events.filter((e) => e.operation === 'poll.list' && e.event === 'start').map((e) => e.phase)).toEqual(['setup', 'import'])
    await h.stop(); h.paired()
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    h.monitor.start()
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each(['fetch', 'body'] as const)('uses the 5000ms deadline for headers and body (%s)', async (boundary) => {
    const headers = deferred<Response>(); const body = deferred<ArrayBuffer>()
    const response = new Response(null)
    vi.spyOn(response, 'arrayBuffer').mockReturnValue(body.promise)
    const signals: AbortSignal[] = []
    const fetcher = vi.fn((_url, options) => {
      signals.push(options.signal)
      return boundary === 'fetch' ? headers.promise : Promise.resolve(response)
    })
    const h = setup(fetcher)
    h.monitor.start()
    await vi.advanceTimersByTimeAsync(4999)
    expect(h.monitor.polls.failed).toBe(0)
    expect(signals[0].aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(h.monitor.polls.failed).toBe(1)
    expect(h.monitor.lastPollOk).toBe(false)
    expect(signals[0].aborted).toBe(true)
    expect(h.recorder.events.filter((e) => e.operation === 'poll.list').map((e) => [e.event, e.durationMs, e.error])).toEqual([
      ['start', undefined, undefined], ['error', 5000, 'GET /list timed out.'],
    ])
    headers.resolve(response); body.resolve(new ArrayBuffer(0))
    await vi.advanceTimersByTimeAsync(999)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect(h.monitor.polls.succeeded).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await h.stop(); h.paired()
    const attempts = fetcher.mock.calls.length
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(attempts)
    expect(vi.getTimerCount()).toBe(0)
  })

  it('declares unavailable only at 20 seconds without success and clears before mutation', async () => {
    const recovery = deferred<Response>()
    const fetcher = vi.fn().mockRejectedValueOnce(new Error('transport failed')).mockImplementation(() => recovery.promise)
    const h = setup(fetcher)
    h.monitor.start()
    await vi.advanceTimersByTimeAsync(19_999)
    expect(() => h.monitor.assertCurrent()).not.toThrow()
    await vi.advanceTimersByTimeAsync(1)
    expect(() => h.monitor.assertCurrent()).toThrow('stopped-http-unavailable')
    await expect(h.save()).rejects.toThrow('stopped-http-unavailable')
    expect(h.monitor.mutationsStarted).toBe(false)
    expect(h.connection.saveProgram).not.toHaveBeenCalled()
    recovery.resolve(new Response(null)); await vi.advanceTimersByTimeAsync(0)
    expect(h.monitor.httpUnavailable).toBe(false)
    expect(h.monitor.lastPollOk).toBe(true)
    await h.save()
    expect(h.monitor.mutationsStarted).toBe(true)
    expect(h.connection.saveProgram).toHaveBeenCalledOnce()
    await h.stop(); h.paired()
  })

  it('awaits a bounded pending attempt on stop without rearming either timer', async () => {
    const body = deferred<ArrayBuffer>()
    const response = new Response(null)
    vi.spyOn(response, 'arrayBuffer').mockReturnValue(body.promise)
    const fetcher = vi.fn().mockResolvedValue(response)
    const h = setup(fetcher)
    h.monitor.start(); await vi.advanceTimersByTimeAsync(0)
    let finished = false
    const stopped = h.monitor.stop().then(() => { finished = true })
    const stoppedAgain = h.monitor.stop()
    await vi.advanceTimersByTimeAsync(4999)
    expect(finished).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await stopped; await stoppedAgain
    expect(finished).toBe(true)
    expect(h.monitor.polls.failed).toBe(1)
    body.resolve(new ArrayBuffer(0)); await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledOnce()
    expect(h.monitor.httpUnavailable).toBe(false)
    expect(h.monitor.polls.succeeded).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
    h.paired()
  })

  it('refreshes the verdict window on each success', async () => {
    const body = deferred<ArrayBuffer>()
    const response = new Response(null)
    vi.spyOn(response, 'arrayBuffer').mockReturnValue(body.promise)
    const fetcher = vi.fn().mockResolvedValueOnce(response).mockImplementation(async () => new Response(null, { status: 503 }))
    const h = setup(fetcher)
    h.monitor.start()
    await vi.advanceTimersByTimeAsync(4000)
    body.resolve(new ArrayBuffer(0)); await vi.advanceTimersByTimeAsync(0)
    expect(h.monitor.polls.succeeded).toBe(1)
    await vi.advanceTimersByTimeAsync(16_000)
    expect(h.monitor.lastPollOk).toBe(false)
    expect(h.monitor.polls.failed).toBeGreaterThan(0)
    expect(() => h.monitor.assertCurrent()).not.toThrow()
    await vi.advanceTimersByTimeAsync(3999)
    expect(() => h.monitor.assertCurrent()).not.toThrow()
    await vi.advanceTimersByTimeAsync(1)
    expect(() => h.monitor.assertCurrent()).toThrow('stopped-http-unavailable')
    await h.stop(); h.paired()
  })

  it('keeps a post-mutation verdict terminal despite HTTP recovery', async () => {
    const recovery = deferred<Response>()
    const fetcher = vi.fn().mockResolvedValueOnce(new Response(null)).mockImplementation(() => recovery.promise)
    const h = setup(fetcher)
    h.monitor.start(); await vi.advanceTimersByTimeAsync(0)
    await h.save()
    expect(h.connection.saveProgram).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(19_999)
    expect(() => h.monitor.assertCurrent()).not.toThrow()
    await vi.advanceTimersByTimeAsync(1)
    await expect(h.save()).rejects.toThrow('stopped-http-unavailable')
    expect(h.connection.saveProgram).toHaveBeenCalledOnce()
    recovery.resolve(new Response(null)); await vi.advanceTimersByTimeAsync(0)
    expect(h.monitor.polls.succeeded).toBe(2)
    expect(h.monitor.lastPollOk).toBe(true)
    expect(h.monitor.httpUnavailable).toBe(true)
    expect(() => h.monitor.markMutationStarted()).toThrow('stopped-http-unavailable')
    await expect(h.save()).rejects.toThrow('stopped-http-unavailable')
    await expect(h.provider.pushBytecode(new Uint8Array(12), { id: 'restore' })).rejects.toThrow('stopped-http-unavailable')
    expect(h.connection.saveProgram).toHaveBeenCalledOnce()
    expect(h.connection.pushByteCodeAndWait).not.toHaveBeenCalled()
    await h.stop(); h.paired()
  })
})

describe('compiler settlement', () => {
  it('awaits each independent compile before recording bytes or completion and preserves rejection', async () => {
    let resolve!: (bytes: Uint8Array) => void
    const bytes = new Uint8Array([2, 4, 6])
    const error = new Error('compiler failed')
    const compiler = vi.fn().mockImplementationOnce(() => new Promise<Uint8Array>((done) => { resolve = done }))
      .mockResolvedValueOnce(bytes).mockRejectedValueOnce(error)
    const h = harness(vi.fn(), compiler)
    const result = h.provider.compile('one')
    let returned = false
    const settled = result.then(() => { returned = true }, () => { returned = true })
    await Promise.resolve(); await Promise.resolve()
    expect(returned).toBe(false)
    expect(h.lines.map((line) => JSON.parse(line)).map((event) => event.event)).toEqual(['start'])
    resolve(bytes)
    await expect(result).resolves.toBe(bytes); await settled
    await expect(h.provider.compile('two')).resolves.toBe(bytes)
    await expect(h.provider.compile('three')).rejects.toBe(error)
    expect(compiler.mock.calls).toEqual([['one'], ['two'], ['three']])
    const events = h.lines.map((line) => JSON.parse(line))
    expect(events.map((event) => event.event)).toEqual(['start', 'end', 'start', 'end', 'start', 'error'])
    expect(events[1].byteLength).toBe(3)
  })
})

describe('fixture setup readback', () => {
  const bytes = encodePbp({ id: 's', name: 'Fixture', sourceCode: '', byteCode: new Uint8Array(12) })
  const different = encodePbp({ id: 's', name: 'Other', sourceCode: '', byteCode: new Uint8Array(12) })
  const unreadable = new Error('Saved program s is not a readable PBP blob.')
  function clock(timeoutMs?: number) {
    let now = 0
    const wait = vi.fn(async (ms: number) => { now += ms })
    return { now: () => now, wait, assertCurrent: vi.fn(), timeoutMs, advance: (ms: number) => { now += ms } }
  }
  it('accepts null, partial successful body, and different PBP before exact bytes under one deadline', async () => {
    const responses = [new Response(null, { status: 404 }), new Response(new Uint8Array()), new Response(different.slice().buffer), new Response(bytes.slice().buffer)]
    const h = harness(vi.fn(async () => responses.shift()!) as typeof fetch)
    const options = clock()
    const read = vi.fn((remaining: number) => h.provider.readSavedProgram('s', remaining))
    await h.recorder.span('setup.readiness', {}, () => waitForFixtureReadback(read, bytes, options))
    expect(read.mock.calls).toEqual([[5000], [4900], [4800], [4700]])
    expect(options.wait.mock.calls).toEqual([[100], [100], [100]])
    expect(options.assertCurrent).toHaveBeenCalledTimes(8)
    const events = h.lines.map((line) => JSON.parse(line))
    expect(events.filter((e) => e.operation === 'readSavedProgram').map((e) => e.event)).toEqual(['start', 'end', 'start', 'error', 'start', 'end', 'start', 'end'])
    expect(events.filter((e) => e.operation === 'setup.readiness').map((e) => e.event)).toEqual(['start', 'end'])
  })
  it('caps waits and never renews the 5000ms deadline for persistent unreadable bytes', async () => {
    const options = clock()
    const read = vi.fn(async () => { options.advance(17); throw unreadable })
    await expect(waitForFixtureReadback(read, bytes, options)).rejects.toThrow('Setup read deadline exceeded')
    expect(options.now()).toBe(5000)
    expect(options.wait.mock.calls[options.wait.mock.calls.length - 1]).toEqual([69])
    expect(read.mock.calls).toHaveLength(43)
  })
  it.each(['Saved program s read timed out.', 'GET /p/s -> 500', 'transport failed', 'guard failed'])('propagates %s unchanged without retry', async (message) => {
    const options = clock(); const error = new Error(message)
    const read = vi.fn().mockRejectedValue(error)
    if (message === 'guard failed') options.assertCurrent.mockImplementation(() => { throw error })
    await expect(waitForFixtureReadback(read, bytes, options)).rejects.toBe(error)
    expect(read).toHaveBeenCalledTimes(message === 'guard failed' ? 0 : 1)
    expect(options.wait).not.toHaveBeenCalled()
  })
  it('accepts the initial exact match without waiting', async () => {
    const recovered = recoverSavedProgram('s', bytes)
    if (!recovered.ok) throw new Error('Invalid fixture')
    const options = clock()
    await waitForFixtureReadback(async () => recovered.value, bytes, options)
    expect(options.wait).not.toHaveBeenCalled()
  })
  it('rejects a late exact match at the deadline without retry', async () => {
    const recovered = recoverSavedProgram('s', bytes)
    if (!recovered.ok) throw new Error('Invalid fixture')
    const options = clock()
    const read = vi.fn(async () => { options.advance(5000); return recovered.value })
    await expect(waitForFixtureReadback(read, bytes, options)).rejects.toThrow('Setup read deadline exceeded')
    expect(read).toHaveBeenCalledOnce(); expect(options.wait).not.toHaveBeenCalled()
  })
})

describe('bounded saved-program reads', () => {
  it.each(['fetch', 'body'] as const)('bounds pending %s at exactly 5000ms and ignores late success', async (boundary) => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    let resolve!: (value: Response) => void
    let bodyResolve!: (value: ArrayBuffer) => void
    const fetcher = vi.fn((_url, options) => {
      signal = options?.signal as AbortSignal
      return boundary === 'fetch' ? new Promise<Response>((r) => { resolve = r })
        : Promise.resolve({ ok: true, status: 200, arrayBuffer: () => new Promise<ArrayBuffer>((r) => { bodyResolve = r }) } as Response)
    }) as unknown as typeof fetch
    const h = harness(fetcher)
    const result = h.provider.readSavedProgram('slot')
    const rejected = expect(result).rejects.toThrow('Saved program slot read timed out.')
    await vi.advanceTimersByTimeAsync(4999)
    expect(h.lines.map((line) => JSON.parse(line)).filter((e) => e.event === 'error')).toHaveLength(0)
    await vi.advanceTimersByTimeAsync(1); await rejected
    expect(signal?.aborted).toBe(true)
    if (boundary === 'fetch') resolve(new Response(new Uint8Array()))
    else bodyResolve(new ArrayBuffer(0))
    await vi.runAllTimersAsync()
    const events = h.lines.map((line) => JSON.parse(line))
    expect(events.filter((e) => e.operation === 'readSavedProgram').map((e) => [e.event, e.durationMs])).toEqual([['start', undefined], ['error', 5000]])
    expect(fetcher).toHaveBeenCalledOnce(); expect(vi.getTimerCount()).toBe(0)
  })
  it('preserves early rejection and clears the timer', async () => {
    vi.useFakeTimers(); const error = new Error('transport failed')
    const h = harness(vi.fn().mockRejectedValue(error))
    await expect(h.provider.readSavedProgram('slot')).rejects.toBe(error)
    expect(vi.getTimerCount()).toBe(0)
  })
  it('trims and encodes ids, preserves exact PBP bytes, and never retries', async () => {
    const bytes = encodePbp({ id: 'a', name: 'Fixture', sourceCode: stampArtifact('export function render(i) {}', { kind: 'pattern', id: 'a', transforms: [] }), byteCode: new Uint8Array(12) })
    const fetcher = vi.fn().mockResolvedValue(new Response(bytes.slice().buffer))
    const h = harness(fetcher)
    expect((await h.provider.readSavedProgram(' a/b '))?.storedArtifact?.pbp).toEqual(bytes)
    expect(fetcher.mock.calls[0][0]).toBe('http://192.168.8.196/p/a%2Fb')
    expect(fetcher).toHaveBeenCalledOnce()
    const events = h.lines.map((line) => JSON.parse(line))
    expect(events.some((e) => e.operation === 'http.headers' && e.status === 200)).toBe(true)
    expect(events.some((e) => e.byteLength === bytes.length && e.sha256)).toBe(true)
  })
  it.each([404, 500, 200])('maps HTTP %s including unreadable successful bodies', async (status) => {
    const response = new Response(new Uint8Array(), { status })
    const body = vi.spyOn(response, 'arrayBuffer')
    const fetcher = vi.fn().mockResolvedValue(response)
    const h = harness(fetcher)
    if (status === 404) await expect(h.provider.readSavedProgram('s')).resolves.toBeNull()
    else await expect(h.provider.readSavedProgram('s')).rejects.toThrow(status === 500 ? 'GET /p/s -> 500' : 'Saved program s is not a readable PBP blob.')
    expect(fetcher).toHaveBeenCalledOnce()
    if (status !== 200) expect(body).not.toHaveBeenCalled()
  })
  it('refuses empty ids offline and preserves corrupt-200 recovery errors', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3])))
    const h = harness(fetcher)
    await expect(h.provider.readSavedProgram(' ')).rejects.toThrow('Saved program id is required')
    expect(fetcher).not.toHaveBeenCalled()
    await expect(h.provider.readSavedProgram('s')).rejects.toThrow('Saved program s is not a readable PBP blob.')
  })
})

describe('recorder output artifact', () => {
  it('pairs simultaneous/nested spans, preserves results/errors, and sanitizes the timing projection', async () => {
    let clock = 10; const lines: string[] = []
    const recorder = new ProbeEventRecorder((line) => lines.push(line), () => new Date('2026-10-27T00:00:00Z'), () => clock)
    const value = { source: 'PRIVATE SOURCE' }; const error = new Error('PRIVATE ERROR')
    const success = recorder.span('compile', { phase: 'setup', source: 'PRIVATE SOURCE' }, async () => {
      await recorder.span('nested', {}, async () => { clock = 15 })
      return value
    })
    const failure = recorder.span('read', {}, async () => { throw error })
    await expect(success).resolves.toBe(value); await expect(failure).rejects.toBe(error)
    const events = JSON.parse(`[${lines.join(',')}]`)
    const starts = events.filter((e: { event: string }) => e.event === 'start')
    expect(new Set(starts.map((e: { spanId: string }) => e.spanId)).size).toBe(3)
    for (const start of starts) {
      const pair = events.filter((e: { spanId: string }) => e.spanId === start.spanId)
      expect(pair).toHaveLength(2); expect(pair[1].durationMs).toBe(pair[1].elapsedMs - start.elapsedMs)
      expect(start.utc).toBe('2026-10-27T00:00:00.000Z')
    }
    expect(JSON.stringify(sanitizedTimingTable(events))).not.toContain('PRIVATE')
    expect(events.filter((e: { operation: string }) => e.operation === 'compile').map((e: { elapsedMs: number; durationMs?: number }) => [e.elapsedMs, e.durationMs])).toEqual([[0, undefined], [5, 5]])
  })
})

describe('resident footprint', () => {
  it('returns from save after one synchronous frame send without an acknowledgement', async () => {
    const h = harness()
    const bytes = encodePbp({ id: 's', name: 'Fixture', sourceCode: '', byteCode: new Uint8Array(12) })
    await h.provider.saveProgram(bytes, { id: 's' })
    expect(h.connection.saveProgram).toHaveBeenCalledExactlyOnceWith('s', bytes)
    expect(h.connection.getConfig).not.toHaveBeenCalled()
    expect(h.connection.pushByteCodeAndWait).not.toHaveBeenCalled()
  })
  it('caches only confirmed push, invalidates failed pushes, saved switches, disconnect and external changes', async () => {
    const h = harness(); const push = () => h.provider.pushBytecode(new Uint8Array(12), { id: 'active' })
    await push(); expect(await h.provider.getActiveProgramBytecodeSize()).toBe(12)
    vi.mocked(h.connection.pushByteCodeAndWait).mockRejectedValueOnce(new Error('activation failed'))
    await expect(push()).rejects.toThrow('activation failed'); expect(await h.provider.getActiveProgramBytecodeSize()).toBeNull()
    await push(); vi.mocked(h.connection.getConfig).mockResolvedValueOnce({ activeProgramId: 'external' })
    expect(await h.provider.getActiveProgramBytecodeSize()).toBeNull()
    await push(); await h.provider.setActiveProgram('other', { save: false }); expect(await h.provider.getActiveProgramBytecodeSize()).toBeNull()
    await push(); await h.provider.disconnect(); expect(await h.provider.getActiveProgramBytecodeSize()).toBeNull()
  })
})

describe('explicit admission', () => {
  const args = ['--device', '192.168.8.196', '--case', 'drain', '--run-id', 'i24-offline', '--run']
  it('accepts only the pinned target and complete opt-in; help is inert', () => {
    expect(parseProbeArgs(args)).toEqual({ device: '192.168.8.196', case: 'drain', runId: 'i24-offline', run: true })
    expect(parseProbeArgs(['--help'])).toEqual({ help: true })
    for (const bad of [args.slice(0, -1), [...args, '--other'], args.map((x) => x === '192.168.8.196' ? 'example.com' : x), args.map((x) => x === 'drain' ? 'other' : x), args.map((x) => x === 'i24-offline' ? '../escape' : x)]) expect(() => parseProbeArgs(bad)).toThrow()
  })
})
