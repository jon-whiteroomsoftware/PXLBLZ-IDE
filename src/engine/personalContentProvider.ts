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

export const LAST_ACTIVE_KEY = 'lastActive'
export const DEMO_OVERRIDES_KEY = 'demoOverrides'

export type LastActive =
  | { type: 'pattern'; id: string }
  | { type: 'library'; name: string }
  | { type: 'demo'; name: string }

export type PersonalContentStorageMode = 'browser' | 'api'
export type PersonalContentCollection = 'patterns' | 'maps'

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

export function storageModeForPersonalContentProvider(
  provider: Pick<PersonalContentProvider, 'id'>,
): PersonalContentStorageMode {
  if (provider.id === 'remote-api') return 'api'
  return 'browser'
}

export function personalContentCollectionLabel(
  storageMode: PersonalContentStorageMode,
  collection: PersonalContentCollection,
): string {
  const noun = collection === 'patterns' ? 'Patterns' : 'Maps'
  if (storageMode === 'api') return `Cloud ${noun}`
  return `Your ${noun}`
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
  provider?: PersonalContentProvider
}

export async function initializePersonalContentProvider(
  options: PersonalContentProviderInitOptions = {},
): Promise<PersonalContentProvider> {
  activeProvider = options.provider ?? browserPersonalContentProvider
  return activeProvider
}
