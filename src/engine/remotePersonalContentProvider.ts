import {
  DEMO_OVERRIDES_KEY,
  LAST_ACTIVE_KEY,
  type LastActive,
  type PersonalContentProvider,
} from './personalContentProvider'
import type { Settings } from './settings'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import type { ControllerProfile } from './controllerProfile'

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
    listMaps: async () => {
      const body = await requestJson<{ maps: MapRecord[] }>(fetcher, '/api/maps')
      return body.maps
    },
    createMap: async (record) => {
      await requestJson(fetcher, '/api/maps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
    },
    updateMap: async (id, changes) => {
      const body = { ...changes } as Record<string, unknown>
      if ('gridDims' in changes && changes.gridDims === undefined) body.gridDims = null
      await requestJson(fetcher, `/api/maps/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    },
    deleteMap: async (id) => {
      await requestJson(fetcher, `/api/maps/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    listControllerProfiles: async () => {
      const body = await requestJson<{ controllers: ControllerProfile[] }>(fetcher, '/api/controllers')
      return body.controllers
    },
    createControllerProfile: async (profile) => {
      await requestJson(fetcher, '/api/controllers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile),
      })
    },
    updateControllerProfile: async (id, changes) => {
      await requestJson(fetcher, `/api/controllers/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
    },
    deleteControllerProfile: async (id) => {
      await requestJson(fetcher, `/api/controllers/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    getLastActive: () => getSetting<LastActive>(fetcher, LAST_ACTIVE_KEY),
    setLastActive: (lastActive) => setSetting(fetcher, LAST_ACTIVE_KEY, lastActive),
    getDemoOverrides: () => getSetting<Record<string, Partial<Settings>>>(fetcher, DEMO_OVERRIDES_KEY),
    setDemoOverrides: (overrides) => setSetting(fetcher, DEMO_OVERRIDES_KEY, overrides),
  }
}

async function getSetting<T>(fetcher: typeof fetch, key: string): Promise<T | undefined> {
  const body = await requestJson<{ value?: T }>(fetcher, `/api/settings/${encodeURIComponent(key)}`)
  return body.value
}

async function setSetting<T>(fetcher: typeof fetch, key: string, value: T): Promise<void> {
  await requestJson(fetcher, `/api/settings/${encodeURIComponent(key)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value }),
  })
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
