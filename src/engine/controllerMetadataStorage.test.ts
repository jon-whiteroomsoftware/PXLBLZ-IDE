import {
  createRemoteControllerMetadataStorage,
  demoControllerMetadataStorage,
  getControllerBindings,
  getControllerMetadataStorage,
  getControllerPushRecordsRevision,
  getProgramLabels,
  getPushRecords,
  initializeControllerMetadataStorage,
  resetControllerMetadataStorage,
  resolveControllerMetadataStorageMode,
  setControllerBindings,
  setControllerMetadataStorage,
  setProgramLabels,
  setPushRecords,
  subscribeControllerPushRecordsRevision,
  getControllerPatternImports,
  mutateControllerPatternImport,
  type ControllerMetadataStorage,
} from './controllerMetadataStorage'
import { readControllerPatternImportLedger, type ControllerPatternImportReceipt } from './controllerPatternImport'
import { queueControllerDeviceWrite } from './controllerDeviceWriteQueue'
import { parsePxlblzBanner, stampArtifact } from './artifactStamp'

beforeEach(() => {
  resetControllerMetadataStorage()
})

function memoryStorage(): ControllerMetadataStorage {
  let bindings = {}
  let labels = {}
  let pushRecords = {}
  let imports = readControllerPatternImportLedger(undefined)
  return {
    id: 'memory-test',
    getPatternImports: async () => imports,
    setPatternImports: async (next) => { imports = next },
    getControllerBindings: async () => bindings,
    setControllerBindings: async (next) => {
      bindings = next
    },
    getProgramLabels: async () => labels,
    setProgramLabels: async (next) => {
      labels = next
    },
    getPushRecords: async () => pushRecords,
    setPushRecords: async (next) => {
      pushRecords = next
    },
  }
}

describe('controller metadata storage seam', () => {
  it.each([false, true])('publishes only a successful captured write after persistence (reject=%s)', async (reject) => {
    const current = memoryStorage()
    const captured = memoryStorage()
    const records = { controller: { pattern: { transforms: [], artifactHash: 'captured', stampedAt: 'now', name: 'Pattern' } } }
    const unrelated = { other: { pattern: { ...records.controller.pattern, artifactHash: 'unrelated' } } }
    await current.setPushRecords(unrelated)
    setControllerMetadataStorage(current)
    let release!: () => void
    const pending = new Promise<void>((resolve) => { release = resolve })
    const destination = { ...captured, setPushRecords: async (next: typeof records) => {
      await pending
      if (reject) throw new Error('captured write rejected')
      await captured.setPushRecords(next)
    } }
    const onRevision = vi.fn()
    const unsubscribe = subscribeControllerPushRecordsRevision(onRevision)
    try {
      const before = getControllerPushRecordsRevision()
      const writing = setPushRecords(records, destination)
      expect(getControllerPushRecordsRevision()).toBe(before)
      expect(onRevision).not.toHaveBeenCalled()
      release()
      if (reject) await expect(writing).rejects.toThrow('captured write rejected')
      else await writing
      expect(await captured.getPushRecords()).toEqual(reject ? {} : records)
      expect(await current.getPushRecords()).toEqual(unrelated)
      expect(getControllerPushRecordsRevision()).toBe(before + (reject ? 0 : 1))
      expect(onRevision).toHaveBeenCalledTimes(reject ? 0 : 1)
    } finally { unsubscribe() }
  })

  it('publishes a new push-record revision only after durable writes succeed (#777)', async () => {
    const onRevision = vi.fn()
    const unsubscribe = subscribeControllerPushRecordsRevision(onRevision)
    setControllerMetadataStorage(memoryStorage())

    const before = getControllerPushRecordsRevision()
    await setPushRecords({})
    expect(getControllerPushRecordsRevision()).toBe(before + 1)
    expect(onRevision).toHaveBeenCalledTimes(1)

    setControllerMetadataStorage({
      ...memoryStorage(),
      id: 'failing-push-record-write',
      setPushRecords: async () => { throw new Error('metadata offline') },
    })
    const beforeFailure = getControllerPushRecordsRevision()
    await expect(setPushRecords({})).rejects.toThrow('metadata offline')
    expect(getControllerPushRecordsRevision()).toBe(beforeFailure)
    expect(onRevision).toHaveBeenCalledTimes(1)
    unsubscribe()
  })

  it('uses non-durable demo storage by default and allows one active storage override', async () => {
    expect(getControllerMetadataStorage()).toBe(demoControllerMetadataStorage)
    const storage = memoryStorage()
    setControllerMetadataStorage(storage)
    expect(getControllerMetadataStorage()).toBe(storage)

    await setControllerBindings({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    await setProgramLabels({ 'ctrl-A': { DEVPROG1: 'Twinkle' } })
    await setPushRecords({
      'ctrl-A': {
        'pat-1': {
          transforms: ['power-cap'],
          artifactHash: 'abc123',
          stampedAt: '2026-07-09T12:34:56.000Z',
          name: 'Twinkle',
        },
      },
    })
    expect(await getControllerBindings()).toEqual({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    expect(await getProgramLabels()).toEqual({ 'ctrl-A': { DEVPROG1: 'Twinkle' } })
    expect(await getPushRecords()).toMatchObject({
      'ctrl-A': { 'pat-1': { artifactHash: 'abc123' } },
    })
  })

  it('selects remote metadata storage as the only durable mode', async () => {
    expect(resolveControllerMetadataStorageMode(undefined)).toBe('remote-api')
    expect(resolveControllerMetadataStorageMode('remote-api')).toBe('remote-api')
    expect(resolveControllerMetadataStorageMode('browser', { prod: true, baseUrl: '/' })).toBe('remote-api')
    expect(resolveControllerMetadataStorageMode('anything-else')).toBe('remote-api')
    expect(resolveControllerMetadataStorageMode(undefined, { prod: true, baseUrl: '/' })).toBe('remote-api')
    expect(resolveControllerMetadataStorageMode(undefined, { prod: true, baseUrl: '/PXLBLZ-IDE/' })).toBe('remote-api')
    await expect(initializeControllerMetadataStorage({ mode: 'remote-api' })).resolves.toMatchObject({
      id: 'remote-api',
    })
  })

  it('performs controller binding and label reads/writes through the authenticated API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url) === '/api/controller-metadata/controller-bindings' && init?.method === undefined) {
        return Response.json({ value: { 'ctrl-A': { 'pat-1': 'DEVPROG1' } } })
      }
      if (String(url) === '/api/controller-metadata/controller-program-labels' && init?.method === undefined) {
        return Response.json({ value: { 'ctrl-A': { DEVPROG1: 'Twinkle' } } })
      }
      if (String(url) === '/api/controller-metadata/controller-push-records' && init?.method === undefined) {
        return Response.json({ value: { 'ctrl-A': { 'pat-1': { artifactHash: 'abc123' } } } })
      }
      return Response.json({ ok: true })
    }
    const storage = createRemoteControllerMetadataStorage({ fetcher })

    await expect(storage.getControllerBindings()).resolves.toEqual({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    await storage.setControllerBindings({ 'ctrl-A': { 'pat-2': 'DEVPROG2' } })
    await expect(storage.getProgramLabels()).resolves.toEqual({ 'ctrl-A': { DEVPROG1: 'Twinkle' } })
    await storage.setProgramLabels({ 'ctrl-A': { DEVPROG2: 'Sparkle' } })
    await expect(storage.getPushRecords()).resolves.toMatchObject({
      'ctrl-A': { 'pat-1': { artifactHash: 'abc123' } },
    })
    await storage.setPushRecords({})

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/controller-metadata/controller-bindings', 'GET'],
      ['/api/controller-metadata/controller-bindings', 'PUT'],
      ['/api/controller-metadata/controller-program-labels', 'GET'],
      ['/api/controller-metadata/controller-program-labels', 'PUT'],
      ['/api/controller-metadata/controller-push-records', 'GET'],
      ['/api/controller-metadata/controller-push-records', 'PUT'],
    ])
    expect(requests[1].init?.body).toBe(JSON.stringify({ value: { 'ctrl-A': { 'pat-2': 'DEVPROG2' } } }))
    expect(requests[3].init?.body).toBe(JSON.stringify({ value: { 'ctrl-A': { DEVPROG2: 'Sparkle' } } }))
    expect(requests[5].init?.body).toBe(JSON.stringify({ value: {} }))
  })

  it('falls back to empty metadata when the remote API has no stored value yet', async () => {
    const storage = createRemoteControllerMetadataStorage({
      fetcher: async () => Response.json({}),
    })

    await expect(storage.getControllerBindings()).resolves.toEqual({})
    await expect(storage.getProgramLabels()).resolves.toEqual({})
    await expect(storage.getPushRecords()).resolves.toEqual({})
  })

  it('raises a clear error when the API rejects the request', async () => {
    const storage = createRemoteControllerMetadataStorage({
      fetcher: async () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    await expect(storage.getControllerBindings()).rejects.toThrow('Remote controller metadata request failed: 401')
  })
})

function receipt(patternId: string, controllerDeviceId = patternId): ControllerPatternImportReceipt {
  return { version: 1, patternId, controllerDeviceId, programId: 'slot', createdAt: 123,
    sourceMode: 'stored-artifact', origin: { pbpDigest: 'a'.repeat(64), bannerState: 'missing', banner: null },
    accountRecordDigest: 'b'.repeat(64), stage: 'planned' }
}
function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((done) => { resolve = done })
  return { promise, resolve }
}
function wire() {
  const rows = new Map<string, unknown>()
  const requests: string[] = []
  let beforePut: (() => Promise<void>) | undefined
  let afterPut: (() => void) | undefined
  const fetcher: typeof fetch = async (url, init) => {
    const parts = String(url).split('/')
    const key = parts[parts.length - 1]
    requests.push(`${init?.method ?? 'GET'} ${key}`)
    if (init?.method === 'PUT') {
      if (key === 'controller-pattern-imports') await beforePut?.()
      rows.set(key, JSON.parse(String(init.body)).value)
      if (key === 'controller-pattern-imports') afterPut?.()
      return Response.json({ ok: true })
    }
    return Response.json(rows.has(key) ? { value: rows.get(key) } : {})
  }
  return { rows, requests, adapter: () => createRemoteControllerMetadataStorage({ fetcher }),
    pause: (fn?: () => Promise<void>) => { beforePut = fn }, failAfterPut: (fn?: () => void) => { afterPut = fn } }
}
const context = (storage: ControllerMetadataStorage) => ({ storage, assertAccountSession: () => {} })
const metadataError = 'Controller import metadata is unreadable. No Pattern was sent.'

describe('durable Controller import ledger owner', () => {
  it('round trips full provenance through a fresh remote adapter and validates both ports', async () => {
    const server = wire()
    const a = { ...receipt('A'), stage: 'complete' as const, deliveryDigest: 'c'.repeat(64), profileSignature: 'profile' }
    const ledger = { version: 1 as const, byPatternId: { A: a } }
    await server.adapter().setPatternImports!(ledger)
    expect(await server.adapter().getPatternImports!()).toEqual(ledger)
    const empty = wire()
    expect(await empty.adapter().getPatternImports!()).toEqual({ version: 1, byPatternId: {} })
    server.rows.set('controller-pattern-imports', { version: 2, byPatternId: {} })
    await expect(server.adapter().getPatternImports!()).rejects.toThrow(metadataError)
    await expect(server.adapter().setPatternImports!({ ...ledger, version: 2 } as never)).rejects.toThrow(metadataError)
    await expect(server.adapter().setPatternImports!(undefined as never)).rejects.toThrow(metadataError)
    for (const method of ['GET', 'PUT']) {
      const bad = createRemoteControllerMetadataStorage({ fetcher: async () => Response.json({}, { status: 503 }) })
      await expect(method === 'GET' ? bad.getPatternImports!() : bad.setPatternImports!(ledger))
        .rejects.toThrow('Remote controller metadata request failed: 503')
    }
  })

  it('refuses demo and unsupported policy operations rather than inventing empty policy', async () => {
    await expect(getControllerPatternImports()).rejects.toThrow('Sign in required for Controller import storage')
    await expect(mutateControllerPatternImport(context(demoControllerMetadataStorage), 'A', () => receipt('A')))
      .rejects.toThrow('Sign in required for Controller import storage')
    const unsupported = memoryStorage()
    delete unsupported.getPatternImports
    delete unsupported.setPatternImports
    setControllerMetadataStorage(unsupported)
    await expect(getControllerPatternImports()).rejects.toThrow('Controller import storage is unavailable')
    await expect(mutateControllerPatternImport(context(unsupported), 'A', () => receipt('A')))
      .rejects.toThrow('Controller import storage is unavailable')
  })

  it('serializes creation and progress across adapters and device queues while preserving separate bindings', async () => {
    const server = wire()
    const seed = { ...receipt('seed'), stage: 'complete' as const }
    const a = receipt('A')
    const b = { ...receipt('B'), sourceMode: 'authored-verified' as const,
      origin: { pbpDigest: 'a'.repeat(64), bannerState: 'valid' as const,
        banner: parsePxlblzBanner(stampArtifact('export var x=1', { kind: 'pattern', id: 'origin', stampedAt: '2026-01-01' })) } }
    const expected = { version: 1 as const, byPatternId: { seed, A: a, B: b } }
    server.rows.set('controller-pattern-imports', { version: 1, byPatternId: { seed } })
    for (const stage of ['planned', 'metadata-pending'] as const) {
      const started = deferred()
      const release = deferred()
      server.pause(async () => { started.resolve(); await release.promise })
      const first = queueControllerDeviceWrite('A', () => mutateControllerPatternImport(context(server.adapter()), 'A',
        (current) => ({ ...(current ?? a), stage })))
      await started.promise
      const count = server.requests.length
      const enteredB = deferred()
      const second = queueControllerDeviceWrite('B', () => {
        const result = mutateControllerPatternImport(context(server.adapter()), 'B', (current) => ({ ...(current ?? b), stage }))
        enteredB.resolve()
        return result
      })
      await enteredB.promise
      expect(server.requests).toHaveLength(count)
      setControllerMetadataStorage(server.adapter())
      const bindings = { A: { personal: 'SLOT' } }
      await setControllerBindings(bindings)
      expect(server.rows.get('controller-bindings')).toEqual(bindings)
      release.resolve()
      await Promise.all([first, second])
      expected.byPatternId.A = { ...a, stage }
      expected.byPatternId.B = { ...b, stage }
      expect(await server.adapter().getPatternImports!()).toEqual(expected)
      expect(await server.adapter().getControllerBindings()).toEqual(bindings)
    }
  })

  it('fresh-reads persisted writes after rejected responses and rejects stale queued sessions before I/O', async () => {
    const server = wire()
    const a = receipt('A')
    const b = receipt('B')
    server.failAfterPut(() => { throw new Error('lost response') })
    await expect(mutateControllerPatternImport(context(server.adapter()), 'A', () => a)).rejects.toThrow('lost response')
    server.failAfterPut()
    await mutateControllerPatternImport(context(server.adapter()), 'B', () => b)
    await mutateControllerPatternImport(context(server.adapter()), 'A', (current) => {
      expect(current).toEqual(a)
      return current!
    })
    expect(await server.adapter().getPatternImports!()).toEqual({ version: 1, byPatternId: { A: a, B: b } })
    const started = deferred()
    const release = deferred()
    server.pause(async () => { started.resolve(); await release.promise })
    const first = mutateControllerPatternImport(context(server.adapter()), 'A', (current) => ({ ...current!, stage: 'account-saved' }))
    await started.promise
    let active = true
    const stale = mutateControllerPatternImport({ storage: server.adapter(), assertAccountSession: () => {
      if (!active) throw new Error('stale account')
    } }, 'B', () => { throw new Error('must not update') })
    const rejected = expect(stale).rejects.toThrow('stale account')
    active = false
    release.resolve()
    await first
    const count = server.requests.length
    await rejected
    expect(server.requests).toHaveLength(count)
    await mutateControllerPatternImport(context(server.adapter()), 'B', (current) => ({ ...current!, stage: 'complete' }))
    expect(await server.adapter().getPatternImports!()).toEqual({ version: 1, byPatternId: {
      A: { ...a, stage: 'account-saved' }, B: { ...b, stage: 'complete' },
    } })
  })

  it('rejects immutable changes, wrong destination, async callbacks and readback sibling loss', async () => {
    const server = wire()
    const a = receipt('A')
    await mutateControllerPatternImport(context(server.adapter()), 'A', () => a)
    await expect(mutateControllerPatternImport(context(server.adapter()), 'A', (current) => ({ ...current!, sourceMode: 'authored-verified' })))
      .rejects.toThrow(metadataError)
    await expect(mutateControllerPatternImport(context(server.adapter()), 'B', () => a)).rejects.toThrow(metadataError)
    await expect(mutateControllerPatternImport(context(server.adapter()), 'B', (async () => receipt('B')) as never)).rejects.toThrow(metadataError)
    server.failAfterPut(() => { server.rows.set('controller-pattern-imports', { version: 1, byPatternId: { B: receipt('B') } }) })
    await expect(mutateControllerPatternImport(context(server.adapter()), 'B', () => receipt('B'))).rejects.toThrow(metadataError)
  })

  it('guards each awaited storage boundary and keeps captured storage despite active-adapter changes', async () => {
    for (const boundary of ['GET', 'PUT', 'readback'] as const) {
      const storage = memoryStorage()
      const other = memoryStorage()
      let active = true
      let gets = 0
      const get = storage.getPatternImports!
      const put = storage.setPatternImports!
      const writes = vi.fn(async (ledger) => {
        await put(ledger)
        if (boundary === 'PUT') active = false
      })
      storage.setPatternImports = writes
      storage.getPatternImports = async () => {
        const ledger = await get()
        gets++
        setControllerMetadataStorage(other)
        if (boundary === 'GET' || (boundary === 'readback' && gets === 2)) active = false
        return ledger
      }
      await expect(mutateControllerPatternImport({ storage, assertAccountSession: () => {
        if (!active) throw new Error('expired session')
      } }, 'A', () => receipt('A'))).rejects.toThrow('expired session')
      expect(writes).toHaveBeenCalledTimes(boundary === 'GET' ? 0 : 1)
      expect(await other.getPatternImports!()).toEqual({ version: 1, byPatternId: {} })
      expect(await get()).toEqual({ version: 1, byPatternId: boundary === 'GET' ? {} : { A: receipt('A') } })
    }
  })

  it('uses the captured adapter and rejects updater mutation of the immutable initial record', async () => {
    const storage = memoryStorage()
    const other = memoryStorage()
    const a = receipt('A')
    setControllerMetadataStorage(other)
    await mutateControllerPatternImport(context(storage), 'A', () => a)
    await expect(mutateControllerPatternImport(context(storage), 'A', (current) => {
      current!.origin.pbpDigest = 'd'.repeat(64)
      return current!
    })).rejects.toThrow(metadataError)
    expect(await storage.getPatternImports!()).toEqual({ version: 1, byPatternId: { A: a } })
    expect(await other.getPatternImports!()).toEqual({ version: 1, byPatternId: {} })
  })
})
