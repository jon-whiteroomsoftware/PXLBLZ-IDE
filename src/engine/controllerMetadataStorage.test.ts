import {
  createRemoteControllerMetadataStorage,
  demoControllerMetadataStorage,
  getControllerBindings,
  getControllerMetadataStorage,
  getProgramLabels,
  getPushRecords,
  initializeControllerMetadataStorage,
  resetControllerMetadataStorage,
  resolveControllerMetadataStorageMode,
  setControllerBindings,
  setControllerMetadataStorage,
  setProgramLabels,
  setPushRecords,
  type ControllerMetadataStorage,
} from './controllerMetadataStorage'

beforeEach(() => {
  resetControllerMetadataStorage()
})

function memoryStorage(): ControllerMetadataStorage {
  let bindings = {}
  let labels = {}
  let pushRecords = {}
  return {
    id: 'memory-test',
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
