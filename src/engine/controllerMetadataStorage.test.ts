import {
  browserControllerMetadataStorage,
  createRemoteControllerMetadataStorage,
  getControllerBindings,
  getControllerMetadataStorage,
  getProgramLabels,
  initializeControllerMetadataStorage,
  resetControllerMetadataStorage,
  resolveControllerMetadataStorageMode,
  setControllerBindings,
  setControllerMetadataStorage,
  setProgramLabels,
  type ControllerMetadataStorage,
} from './controllerMetadataStorage'
import { resetDbCache } from './storage'

beforeEach(() => {
  resetDbCache()
  resetControllerMetadataStorage()
})

function memoryStorage(): ControllerMetadataStorage {
  let bindings = {}
  let labels = {}
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
  }
}

describe('controller metadata storage seam', () => {
  it('uses browser IndexedDB storage by default and allows one active storage override', async () => {
    expect(getControllerMetadataStorage()).toBe(browserControllerMetadataStorage)
    const storage = memoryStorage()
    setControllerMetadataStorage(storage)
    expect(getControllerMetadataStorage()).toBe(storage)

    await setControllerBindings({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    await setProgramLabels({ 'ctrl-A': { DEVPROG1: 'Twinkle' } })
    expect(await getControllerBindings()).toEqual({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    expect(await getProgramLabels()).toEqual({ 'ctrl-A': { DEVPROG1: 'Twinkle' } })
  })

  it('selects remote metadata storage only through explicit mode', async () => {
    expect(resolveControllerMetadataStorageMode(undefined)).toBe('browser')
    expect(resolveControllerMetadataStorageMode('remote-api')).toBe('remote-api')
    expect(resolveControllerMetadataStorageMode('anything-else')).toBe('browser')
    await expect(initializeControllerMetadataStorage({ mode: 'browser' })).resolves.toBe(
      browserControllerMetadataStorage,
    )
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
      return Response.json({ ok: true })
    }
    const storage = createRemoteControllerMetadataStorage({ fetcher })

    await expect(storage.getControllerBindings()).resolves.toEqual({ 'ctrl-A': { 'pat-1': 'DEVPROG1' } })
    await storage.setControllerBindings({ 'ctrl-A': { 'pat-2': 'DEVPROG2' } })
    await expect(storage.getProgramLabels()).resolves.toEqual({ 'ctrl-A': { DEVPROG1: 'Twinkle' } })
    await storage.setProgramLabels({ 'ctrl-A': { DEVPROG2: 'Sparkle' } })

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/controller-metadata/controller-bindings', 'GET'],
      ['/api/controller-metadata/controller-bindings', 'PUT'],
      ['/api/controller-metadata/controller-program-labels', 'GET'],
      ['/api/controller-metadata/controller-program-labels', 'PUT'],
    ])
    expect(requests[1].init?.body).toBe(JSON.stringify({ value: { 'ctrl-A': { 'pat-2': 'DEVPROG2' } } }))
    expect(requests[3].init?.body).toBe(JSON.stringify({ value: { 'ctrl-A': { DEVPROG2: 'Sparkle' } } }))
  })

  it('falls back to empty metadata when the remote API has no stored value yet', async () => {
    const storage = createRemoteControllerMetadataStorage({
      fetcher: async () => Response.json({}),
    })

    await expect(storage.getControllerBindings()).resolves.toEqual({})
    await expect(storage.getProgramLabels()).resolves.toEqual({})
  })

  it('raises a clear error when the API rejects the request', async () => {
    const storage = createRemoteControllerMetadataStorage({
      fetcher: async () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    await expect(storage.getControllerBindings()).rejects.toThrow('Remote controller metadata request failed: 401')
  })
})
