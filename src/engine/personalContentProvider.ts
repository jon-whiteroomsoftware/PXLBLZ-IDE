import type { Settings } from './settings'
import type { LibraryRecord, MapRecord, MixinRecord, PatternRecord, ShowRecord } from './personalContentRecords'
import type { ControllerProfile } from './controllerProfile'
import type { EntityOrganizationKind, EntityOrganizationV1 } from './entityOrganization'
import { createRemotePersonalContentProvider } from './remotePersonalContentProvider'

export const LAST_ACTIVE_KEY = 'lastActive'
export const DEMO_OVERRIDES_KEY = 'demoOverrides'
export const ENTITY_ORGANIZATION_KEYS: Record<EntityOrganizationKind, string> = {
  patterns: 'patternOrganization',
  shows: 'showOrganization',
  maps: 'mapOrganization',
  controllers: 'controllerOrganization',
  mixins: 'mixinOrganization',
  libraries: 'libraryOrganization',
}

export type LastActive =
  | { type: 'pattern'; id: string }
  | { type: 'library'; name: string }
  | { type: 'demo'; name: string }
  | { type: 'show'; id: string }

export type PersonalContentStorageMode = 'demo' | 'api'
export type PersonalContentCollection = 'patterns' | 'maps' | 'mixins' | 'libraries' | 'controllers' | 'shows'
export type PersonalContentProviderMode = 'remote-api'

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
  listMixins(): Promise<MixinRecord[]>
  createMixin(record: MixinRecord): Promise<void>
  updateMixin(id: string, changes: Partial<Omit<MixinRecord, 'id'>>): Promise<void>
  deleteMixin(id: string): Promise<void>
  listLibraries?(): Promise<LibraryRecord[]>
  createLibrary?(record: LibraryRecord): Promise<void>
  updateLibrary?(id: string, changes: Partial<Omit<LibraryRecord, 'id'>>): Promise<void>
  deleteLibrary?(id: string): Promise<void>
  listShows(): Promise<ShowRecord[]>
  createShow(record: ShowRecord): Promise<void>
  updateShow(id: string, changes: Partial<Omit<ShowRecord, 'id'>>): Promise<void>
  deleteShow(id: string): Promise<void>
  listControllerProfiles(): Promise<ControllerProfile[]>
  createControllerProfile(profile: ControllerProfile): Promise<void>
  updateControllerProfile(id: string, changes: Partial<Omit<ControllerProfile, 'id'>>): Promise<void>
  deleteControllerProfile(id: string): Promise<void>
  getLastActive(): Promise<LastActive | undefined>
  setLastActive(lastActive: LastActive): Promise<void>
  getDemoOverrides(): Promise<Record<string, Partial<Settings>> | undefined>
  setDemoOverrides(overrides: Record<string, Partial<Settings>>): Promise<void>
  getEntityOrganization?(kind: EntityOrganizationKind): Promise<EntityOrganizationV1 | undefined>
  setEntityOrganization?(kind: EntityOrganizationKind, organization: EntityOrganizationV1): Promise<void>
}

export function storageModeForPersonalContentProvider(
  provider: Pick<PersonalContentProvider, 'id'>,
): PersonalContentStorageMode {
  if (provider.id === 'remote-api') return 'api'
  return 'demo'
}

export function personalContentCollectionLabel(
  _storageMode: PersonalContentStorageMode,
  collection: PersonalContentCollection,
): string {
  if (collection === 'controllers') return 'Controllers'
  if (collection === 'mixins') return 'Mixins'
  if (collection === 'libraries') return 'Libraries'
  if (collection === 'shows') return 'Shows'
  return collection === 'patterns' ? 'Patterns' : 'Maps'
}

function signInRequired(): Promise<never> {
  return Promise.reject(new Error('Sign in required for durable personal workspace storage'))
}

export const demoPersonalContentProvider: PersonalContentProvider = {
  id: 'demo',
  listPatterns: async () => [],
  createPattern: signInRequired,
  updatePattern: signInRequired,
  deletePattern: signInRequired,
  listMaps: async () => [],
  createMap: signInRequired,
  updateMap: signInRequired,
  deleteMap: signInRequired,
  listMixins: async () => [],
  createMixin: signInRequired,
  updateMixin: signInRequired,
  deleteMixin: signInRequired,
  listLibraries: async () => [],
  createLibrary: signInRequired,
  updateLibrary: signInRequired,
  deleteLibrary: signInRequired,
  listShows: async () => [],
  createShow: signInRequired,
  updateShow: signInRequired,
  deleteShow: signInRequired,
  listControllerProfiles: async () => [],
  createControllerProfile: signInRequired,
  updateControllerProfile: signInRequired,
  deleteControllerProfile: signInRequired,
  getLastActive: async () => undefined,
  setLastActive: async () => {},
  getDemoOverrides: async () => undefined,
  setDemoOverrides: async () => {},
  getEntityOrganization: async () => undefined,
  setEntityOrganization: async () => {},
}

let activeProvider: PersonalContentProvider = demoPersonalContentProvider

export function getPersonalContentProvider(): PersonalContentProvider {
  return activeProvider
}

export function setPersonalContentProvider(provider: PersonalContentProvider): void {
  activeProvider = provider
}

export function resetPersonalContentProvider(): void {
  activeProvider = demoPersonalContentProvider
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
  _raw: string | undefined,
  _context: PersonalContentProviderModeContext = {},
): PersonalContentProviderMode {
  return 'remote-api'
}

export async function initializePersonalContentProvider(
  options: PersonalContentProviderInitOptions = {},
): Promise<PersonalContentProvider> {
  if (options.provider) {
    activeProvider = options.provider
    return activeProvider
  }
  activeProvider = createRemotePersonalContentProvider()
  return activeProvider
}
