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

  it('raises a clear error when the API rejects the request', async () => {
    const provider = createRemotePersonalContentProvider({
      fetcher: async () => Response.json({ error: 'Unauthorized' }, { status: 401 }),
    })

    await expect(provider.listPatterns()).rejects.toThrow('Remote personal content request failed: 401')
  })
})
