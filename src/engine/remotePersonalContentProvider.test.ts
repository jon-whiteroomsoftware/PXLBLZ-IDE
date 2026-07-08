import {
  createRemotePersonalContentProvider,
} from './remotePersonalContentProvider'
import type { ControllerProfile } from './controllerProfile'
import type { PatternRecord, ShowRecord } from './personalContentRecords'

describe('remote personal content provider', () => {
  it('performs pattern CRUD through the authenticated API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const pattern: PatternRecord = {
      id: 'p1',
      name: 'Cloud Pattern',
      src: 'export function render() {}',
      controls: {},
      updatedAt: 1,
    }
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (init?.method === undefined) {
        return Response.json({ patterns: [pattern] })
      }
      return Response.json({ ok: true })
    }
    const provider = createRemotePersonalContentProvider({ fetcher })

    await expect(provider.listPatterns()).resolves.toEqual([pattern])
    await provider.createPattern(pattern)
    await provider.updatePattern('p1', { name: 'Renamed', updatedAt: 2 })
    await provider.deletePattern('p1')

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/patterns', 'GET'],
      ['/api/patterns', 'POST'],
      ['/api/patterns/p1', 'PATCH'],
      ['/api/patterns/p1', 'DELETE'],
    ])
  })

  it('performs map CRUD and provider-owned settings through the authenticated API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url) === '/api/maps' && init?.method === undefined) {
        return Response.json({ maps: [] })
      }
      if (String(url) === '/api/settings/lastActive' && init?.method === undefined) {
        return Response.json({ value: { type: 'demo', name: 'IridescentFibers' } })
      }
      return Response.json({ ok: true })
    }
    const provider = createRemotePersonalContentProvider({ fetcher })

    await provider.listMaps()
    await provider.createMap({
      id: 'm1',
      name: 'Cloud Map',
      dim: 2,
      generator: 'custom',
      params: {},
      updatedAt: 1,
    })
    await provider.updateMap('m1', { name: 'Renamed', gridDims: undefined, updatedAt: 2 })
    await provider.deleteMap('m1')
    await expect(provider.getLastActive()).resolves.toEqual({ type: 'demo', name: 'IridescentFibers' })
    await provider.setDemoOverrides({ AuroraSphere: { brightness: 0.5 } })

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/maps', 'GET'],
      ['/api/maps', 'POST'],
      ['/api/maps/m1', 'PATCH'],
      ['/api/maps/m1', 'DELETE'],
      ['/api/settings/lastActive', 'GET'],
      ['/api/settings/demoOverrides', 'PUT'],
    ])
    expect(requests[2].init?.body).toBe(JSON.stringify({ name: 'Renamed', gridDims: null, updatedAt: 2 }))
  })

  it('performs controller profile CRUD through the authenticated API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const profile: ControllerProfile = {
      id: 'ctrl-1',
      name: 'Burner bag',
      deviceId: 'pixelblaze_pb32_3cd4ee549434',
      lastKnownDeviceName: 'Pixelblaze shelf',
      lastSeenIp: '192.168.8.224',
      lastKnownPixelCount: 256,
      lastKnownMapDim: 2,
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [],
      updatedAt: 1,
    }
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url) === '/api/controllers' && init?.method === undefined) {
        return Response.json({ controllers: [profile] })
      }
      return Response.json({ ok: true })
    }
    const provider = createRemotePersonalContentProvider({ fetcher })

    await expect(provider.listControllerProfiles()).resolves.toEqual([profile])
    await provider.createControllerProfile(profile)
    await provider.updateControllerProfile('ctrl-1', { lastKnownPixelCount: 512, updatedAt: 2 })
    await provider.deleteControllerProfile('ctrl-1')

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/controllers', 'GET'],
      ['/api/controllers', 'POST'],
      ['/api/controllers/ctrl-1', 'PATCH'],
      ['/api/controllers/ctrl-1', 'DELETE'],
    ])
    expect(requests[2].init?.body).toBe(JSON.stringify({ lastKnownPixelCount: 512, updatedAt: 2 }))
  })

  it('performs mixin CRUD through the authenticated API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const mixin = {
      id: 'mx1',
      name: 'Pot binding',
      kind: 'bind' as const,
      src: '// @param PIN\n// @target CONTROL\n// @wraps beforeRender',
      updatedAt: 1,
    }
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url) === '/api/mixins' && init?.method === undefined) {
        return Response.json({ mixins: [mixin] })
      }
      return Response.json({ ok: true })
    }
    const provider = createRemotePersonalContentProvider({ fetcher })

    await expect(provider.listMixins()).resolves.toEqual([mixin])
    await provider.createMixin(mixin)
    await provider.updateMixin('mx1', { name: 'Renamed', updatedAt: 2 })
    await provider.deleteMixin('mx1')

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/mixins', 'GET'],
      ['/api/mixins', 'POST'],
      ['/api/mixins/mx1', 'PATCH'],
      ['/api/mixins/mx1', 'DELETE'],
    ])
    expect(requests[2].init?.body).toBe(JSON.stringify({ name: 'Renamed', updatedAt: 2 }))
  })

  it('performs show CRUD through the authenticated API', async () => {
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const show: ShowRecord = {
      id: 'show-1',
      name: 'Opening wash',
      scenes: [],
      zones: [],
      cells: [],
      updatedAt: 1,
    }
    const fetcher: typeof fetch = async (url, init) => {
      requests.push({ url: String(url), init })
      if (String(url) === '/api/shows' && init?.method === undefined) {
        return Response.json({ shows: [show] })
      }
      return Response.json({ ok: true })
    }
    const provider = createRemotePersonalContentProvider({ fetcher })

    await expect(provider.listShows()).resolves.toEqual([show])
    await provider.createShow(show)
    await provider.updateShow('show-1', { name: 'Renamed', updatedAt: 2 })
    await provider.deleteShow('show-1')

    expect(requests.map((r) => [r.url, r.init?.method ?? 'GET'])).toEqual([
      ['/api/shows', 'GET'],
      ['/api/shows', 'POST'],
      ['/api/shows/show-1', 'PATCH'],
      ['/api/shows/show-1', 'DELETE'],
    ])
    expect(requests[2].init?.body).toBe(JSON.stringify({ name: 'Renamed', updatedAt: 2 }))
  })

  it('raises a clear error when the API rejects the request', async () => {
    const provider = createRemotePersonalContentProvider({
      fetcher: async () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    await expect(provider.listPatterns()).rejects.toThrow('Remote personal content request failed: 401')
  })
})
