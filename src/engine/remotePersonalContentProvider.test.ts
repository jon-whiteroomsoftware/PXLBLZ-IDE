import {
  createRemotePersonalContentProvider,
} from './remotePersonalContentProvider'
import type { PatternRecord } from './storage'

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

  it('raises a clear error when the API rejects the request', async () => {
    const provider = createRemotePersonalContentProvider({
      fetcher: async () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    await expect(provider.listPatterns()).rejects.toThrow('Remote personal content request failed: 401')
  })
})
