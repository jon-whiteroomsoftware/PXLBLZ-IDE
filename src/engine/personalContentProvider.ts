import {
  type MapRecord,
  type PatternRecord,
  createMap,
  createPattern,
  deleteMap,
  deletePattern,
  getSetting,
  listMaps,
  listPatterns,
  setSetting,
  updateMap,
  updatePattern,
} from './storage'
import type { Settings } from './settings'
import {
  canUseWorkspaceProvider,
  createWorkspacePersonalContentProvider,
  workspaceApiAvailable,
} from './workspacePersonalContentProvider'

export const LAST_ACTIVE_KEY = 'lastActive'
export const DEMO_OVERRIDES_KEY = 'demoOverrides'

export type LastActive =
  | { type: 'pattern'; id: string }
  | { type: 'library'; name: string }
  | { type: 'demo'; name: string }

export interface PersonalContentProvider {
  readonly id: string
  listPatterns(): Promise<PatternRecord[]>
  createPattern(record: PatternRecord): Promise<void>
  updatePattern(id: string, changes: Partial<Omit<PatternRecord, 'id'>>): Promise<void>
  deletePattern(id: string): Promise<void>
  listMaps(): Promise<MapRecord[]>
  createMap(record: MapRecord): Promise<void>
  updateMap(id: string, changes: Partial<Omit<MapRecord, 'id'>>): Promise<void>
  deleteMap(id: string): Promise<void>
  getLastActive(): Promise<LastActive | undefined>
  setLastActive(lastActive: LastActive): Promise<void>
  getDemoOverrides(): Promise<Record<string, Partial<Settings>> | undefined>
  setDemoOverrides(overrides: Record<string, Partial<Settings>>): Promise<void>
}

export const browserPersonalContentProvider: PersonalContentProvider = {
  id: 'browser-indexeddb',
  listPatterns,
  createPattern,
  updatePattern,
  deletePattern,
  listMaps,
  createMap,
  updateMap,
  deleteMap,
  getLastActive: () => getSetting<LastActive>(LAST_ACTIVE_KEY),
  setLastActive: (lastActive) => setSetting(LAST_ACTIVE_KEY, lastActive),
  getDemoOverrides: () => getSetting<Record<string, Partial<Settings>>>(DEMO_OVERRIDES_KEY),
  setDemoOverrides: (overrides) => setSetting(DEMO_OVERRIDES_KEY, overrides),
}

let activeProvider: PersonalContentProvider = browserPersonalContentProvider

export function getPersonalContentProvider(): PersonalContentProvider {
  return activeProvider
}

export function setPersonalContentProvider(provider: PersonalContentProvider): void {
  activeProvider = provider
}

export function resetPersonalContentProvider(): void {
  activeProvider = browserPersonalContentProvider
}

export interface PersonalContentProviderInitOptions {
  location?: Pick<Location, 'hostname'>
  fetchFn?: typeof fetch
}

export async function initializePersonalContentProvider(
  options: PersonalContentProviderInitOptions = {},
): Promise<PersonalContentProvider> {
  const fetchFn = options.fetchFn ?? globalThis.fetch
  if (canUseWorkspaceProvider(options.location) && (await workspaceApiAvailable(fetchFn))) {
    activeProvider = createWorkspacePersonalContentProvider(browserPersonalContentProvider, fetchFn)
  } else {
    activeProvider = browserPersonalContentProvider
  }
  return activeProvider
}
