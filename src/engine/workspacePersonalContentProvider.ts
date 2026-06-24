import type { PersonalContentProvider } from './personalContentProvider'
import {
  mapRecordFromWorkspaceFile,
  mapRecordToWorkspaceFile,
  parseWorkspaceContentPayload,
  patternRecordFromWorkspaceFile,
  patternRecordToWorkspaceFile,
} from './workspaceContent'
import type { MapRecord, PatternRecord } from './storage'

const WORKSPACE_CONTENT_ENDPOINT = '/__personal-content'

function isLocalhostHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]'
}

export function canUseWorkspaceProvider(locationLike: Pick<Location, 'hostname'> | undefined = globalThis.location): boolean {
  return !!locationLike && isLocalhostHost(locationLike.hostname)
}

async function fetchWorkspaceContent(fetchFn: typeof fetch = globalThis.fetch) {
  const res = await fetchFn(WORKSPACE_CONTENT_ENDPOINT, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Workspace API unavailable: ${res.status}`)
  return parseWorkspaceContentPayload(await res.json())
}

async function postWorkspaceRecord(
  collection: 'patterns' | 'maps',
  record: unknown,
  fetchFn: typeof fetch,
): Promise<void> {
  const res = await fetchFn(`${WORKSPACE_CONTENT_ENDPOINT}/${collection}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(record),
  })
  if (!res.ok) throw new Error(`Workspace write failed: ${res.status}`)
}

async function deleteWorkspaceRecord(
  collection: 'patterns' | 'maps',
  id: string,
  fetchFn: typeof fetch,
): Promise<void> {
  const res = await fetchFn(`${WORKSPACE_CONTENT_ENDPOINT}/${collection}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Workspace delete failed: ${res.status}`)
}

export function createWorkspacePersonalContentProvider(
  settingsProvider: Pick<
    PersonalContentProvider,
    'getLastActive' | 'setLastActive' | 'getDemoOverrides' | 'setDemoOverrides'
  >,
  fetchFn: typeof fetch = globalThis.fetch,
): PersonalContentProvider {
  return {
    id: 'workspace-files',
    async listPatterns() {
      const payload = await fetchWorkspaceContent(fetchFn)
      return payload.patterns.map(patternRecordFromWorkspaceFile).sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async listMaps() {
      const payload = await fetchWorkspaceContent(fetchFn)
      return payload.maps.map(mapRecordFromWorkspaceFile).sort((a, b) => b.updatedAt - a.updatedAt)
    },
    async createPattern(record) {
      await postWorkspaceRecord('patterns', patternRecordToWorkspaceFile(record), fetchFn)
    },
    async updatePattern(id, changes) {
      const existing = (await this.listPatterns()).find((p) => p.id === id)
      if (!existing) throw new Error(`Pattern ${id} not found`)
      await postWorkspaceRecord(
        'patterns',
        patternRecordToWorkspaceFile({ ...existing, ...(changes as Partial<PatternRecord>) }),
        fetchFn,
      )
    },
    async deletePattern(id) {
      await deleteWorkspaceRecord('patterns', id, fetchFn)
    },
    async createMap(record) {
      await postWorkspaceRecord('maps', mapRecordToWorkspaceFile(record), fetchFn)
    },
    async updateMap(id, changes) {
      const existing = (await this.listMaps()).find((m) => m.id === id)
      if (!existing) throw new Error(`Map ${id} not found`)
      await postWorkspaceRecord(
        'maps',
        mapRecordToWorkspaceFile({ ...existing, ...(changes as Partial<MapRecord>) }),
        fetchFn,
      )
    },
    async deleteMap(id) {
      await deleteWorkspaceRecord('maps', id, fetchFn)
    },
    getLastActive: () => settingsProvider.getLastActive(),
    setLastActive: (lastActive) => settingsProvider.setLastActive(lastActive),
    getDemoOverrides: () => settingsProvider.getDemoOverrides(),
    setDemoOverrides: (overrides) => settingsProvider.setDemoOverrides(overrides),
  }
}

export async function workspaceApiAvailable(fetchFn: typeof fetch = globalThis.fetch): Promise<boolean> {
  try {
    await fetchWorkspaceContent(fetchFn)
    return true
  } catch {
    return false
  }
}
