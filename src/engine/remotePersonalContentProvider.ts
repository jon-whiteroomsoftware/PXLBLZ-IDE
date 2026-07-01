import {
  browserPersonalContentProvider,
  type PersonalContentProvider,
} from './personalContentProvider'
import type { PatternRecord } from './storage'

export interface RemotePersonalContentProviderOptions {
  fetcher?: typeof fetch
}

export function createRemotePersonalContentProvider(
  options: RemotePersonalContentProviderOptions = {},
): PersonalContentProvider {
  const fetcher = options.fetcher ?? fetch
  return {
    id: 'remote-api',
    listPatterns: async () => {
      const body = await requestJson<{ patterns: PatternRecord[] }>(fetcher, '/api/patterns')
      return body.patterns
    },
    createPattern: async (record) => {
      await requestJson(fetcher, '/api/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
    },
    updatePattern: async (id, changes) => {
      await requestJson(fetcher, `/api/patterns/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
    },
    deletePattern: async (id) => {
      await requestJson(fetcher, `/api/patterns/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    listMaps: browserPersonalContentProvider.listMaps,
    createMap: browserPersonalContentProvider.createMap,
    updateMap: browserPersonalContentProvider.updateMap,
    deleteMap: browserPersonalContentProvider.deleteMap,
    getLastActive: browserPersonalContentProvider.getLastActive,
    setLastActive: browserPersonalContentProvider.setLastActive,
    getDemoOverrides: browserPersonalContentProvider.getDemoOverrides,
    setDemoOverrides: browserPersonalContentProvider.setDemoOverrides,
  }
}

async function requestJson<T = unknown>(
  fetcher: typeof fetch,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetcher(url, init)
  if (!response.ok) {
    throw new Error(`Remote personal content request failed: ${response.status}`)
  }
  return await response.json() as T
}
