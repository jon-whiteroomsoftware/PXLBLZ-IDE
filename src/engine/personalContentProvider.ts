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
import { createRemotePersonalContentProvider } from './remotePersonalContentProvider'

export const LAST_ACTIVE_KEY = 'lastActive'
export const DEMO_OVERRIDES_KEY = 'demoOverrides'

export type LastActive =
  | { type: 'pattern'; id: string }
  | { type: 'library'; name: string }
  | { type: 'demo'; name: string }

export type PersonalContentStorageMode = 'browser' | 'api'
export type PersonalContentCollection = 'patterns' | 'maps'
export type PersonalContentProviderMode = 'browser' | 'remote-api'

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
  mode?: PersonalContentProviderMode
}

export interface PersonalContentProviderModeContext {
  prod?: boolean
  baseUrl?: string
}

export function resolvePersonalContentProviderMode(
  raw: string | undefined,
  context: PersonalContentProviderModeContext = {},
): PersonalContentProviderMode {
  if (raw === 'browser') return 'browser'
  if (raw === 'remote-api') return 'remote-api'
  if (context.prod && context.baseUrl === '/') return 'remote-api'
  return 'browser'
}

export async function initializePersonalContentProvider(
  options: PersonalContentProviderInitOptions = {},
): Promise<PersonalContentProvider> {
  if (options.provider) {
    activeProvider = options.provider
    return activeProvider
  }
  const mode = options.mode ?? resolvePersonalContentProviderMode(import.meta.env.VITE_PERSONAL_CONTENT_PROVIDER, {
    prod: import.meta.env.PROD,
    baseUrl: import.meta.env.BASE_URL,
  })
  activeProvider = mode === 'remote-api'
    ? createRemotePersonalContentProvider()
    : browserPersonalContentProvider
  return activeProvider
}
