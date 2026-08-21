import {
  DEMO_OVERRIDES_KEY,
  ENTITY_ORGANIZATION_KEYS,
  LAST_ACTIVE_KEY,
  WORKSPACE_STARTER_STATE_KEY,
  type WorkspaceStarterState,
  type LastActive,
  type PersonalContentProvider,
} from './personalContentProvider'
import type { Settings } from './settings'
import type { LibraryRecord, MapRecord, MixinRecord, PatternRecord, ShowRecord } from './personalContentRecords'
import type { ControllerProfile } from './controllerProfile'
import type { EntityOrganizationV1 } from './entityOrganization'

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
    listMixins: async () => {
      const body = await requestJson<{ mixins: MixinRecord[] }>(fetcher, '/api/mixins')
      return body.mixins
    },
    createMixin: async (record) => {
      await requestJson(fetcher, '/api/mixins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
    },
    updateMixin: async (id, changes) => {
      await requestJson(fetcher, `/api/mixins/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
    },
    deleteMixin: async (id) => {
      await requestJson(fetcher, `/api/mixins/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    listLibraries: async () => {
      const body = await requestJson<{ libraries: LibraryRecord[] }>(fetcher, '/api/libraries')
      return body.libraries
    },
    createLibrary: async (record) => {
      await requestJson(fetcher, '/api/libraries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
    },
    updateLibrary: async (id, changes) => {
      await requestJson(fetcher, `/api/libraries/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(changes),
      })
    },
    deleteLibrary: async (id) => {
      await requestJson(fetcher, `/api/libraries/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
    },
    listShows: async () => {
      const body = await requestJson<{ shows: ShowRecord[] }>(fetcher, '/api/shows')
      return body.shows
    },
    createShow: async (record) => {
      await requestJson(fetcher, '/api/shows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      })
    },
    updateShow: async (id, changes) => {
      // A patch that carries targetControllerProfileId as undefined means
      // "clear it": JSON would drop the key and the D1 update would skip the
      // column, resurrecting the stale id on reload. Translate the clear to
      // an explicit wire-level null here, keeping the typed provider
      // contract (string | undefined) intact for every other provider.
      const wireChanges = 'targetControllerProfileId' in changes
        && changes.targetControllerProfileId === undefined
        ? { ...changes, targetControllerProfileId: null }
        : changes
      await requestJson(fetcher, `/api/shows/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wireChanges),
      })
    },
    deleteShow: async (id) => {
      await requestJson(fetcher, `/api/shows/${encodeURIComponent(id)}`, {
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
    getWorkspaceStarterState: () => getSetting<WorkspaceStarterState>(fetcher, WORKSPACE_STARTER_STATE_KEY),
    setWorkspaceStarterState: (state) => setSetting(fetcher, WORKSPACE_STARTER_STATE_KEY, state),
    getEntityOrganization: (kind) => getSetting<EntityOrganizationV1>(fetcher, ENTITY_ORGANIZATION_KEYS[kind]),
    setEntityOrganization: (kind, organization) => setSetting(fetcher, ENTITY_ORGANIZATION_KEYS[kind], organization),
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
