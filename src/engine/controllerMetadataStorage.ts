import type { BindingStore, ProgramLabelStore } from './controllerBinding'
import type { ControllerPushRecords } from './controllerPushRecord'
import {
  readControllerPatternImportLedger, withControllerPatternImport,
  type ControllerPatternImportLedger, type ControllerPatternImportReceipt,
} from './controllerPatternImport'

export const CONTROLLER_BINDINGS_METADATA_KEY = 'controller-bindings'
export const CONTROLLER_PROGRAM_LABELS_METADATA_KEY = 'controller-program-labels'
export const CONTROLLER_PUSH_RECORDS_METADATA_KEY = 'controller-push-records'
export const CONTROLLER_PATTERN_IMPORTS_METADATA_KEY = 'controller-pattern-imports'

export type ControllerMetadataStorageMode = 'remote-api'

export interface ControllerMetadataStorage {
  readonly id: string
  getControllerBindings(): Promise<BindingStore>
  setControllerBindings(bindings: BindingStore): Promise<void>
  getProgramLabels(): Promise<ProgramLabelStore>
  setProgramLabels(labels: ProgramLabelStore): Promise<void>
  getPushRecords(): Promise<ControllerPushRecords>
  setPushRecords(records: ControllerPushRecords): Promise<void>
  getPatternImports?(): Promise<ControllerPatternImportLedger>
  /** Wire port; product mutations must use mutateControllerPatternImport. */
  setPatternImports?(value: ControllerPatternImportLedger): Promise<void>
}

export const demoControllerMetadataStorage: ControllerMetadataStorage = {
  id: 'demo',
  getControllerBindings: async () => ({}),
  setControllerBindings: async () => {},
  getProgramLabels: async () => ({}),
  setProgramLabels: async () => {},
  getPushRecords: async () => ({}),
  setPushRecords: async () => {},
  getPatternImports: async () => { throw new Error('Sign in required for Controller import storage') },
  setPatternImports: async () => { throw new Error('Sign in required for Controller import storage') },
}

export interface RemoteControllerMetadataStorageOptions {
  fetcher?: typeof fetch
}

export function createRemoteControllerMetadataStorage(
  options: RemoteControllerMetadataStorageOptions = {},
): ControllerMetadataStorage {
  const fetcher = options.fetcher ?? fetch
  return {
    id: 'remote-api',
    getControllerBindings: () => getControllerMetadata<BindingStore>(
      fetcher,
      CONTROLLER_BINDINGS_METADATA_KEY,
      {},
    ),
    setControllerBindings: (bindings) => setControllerMetadata(
      fetcher,
      CONTROLLER_BINDINGS_METADATA_KEY,
      bindings,
    ),
    getProgramLabels: () => getControllerMetadata<ProgramLabelStore>(
      fetcher,
      CONTROLLER_PROGRAM_LABELS_METADATA_KEY,
      {},
    ),
    setProgramLabels: (labels) => setControllerMetadata(
      fetcher,
      CONTROLLER_PROGRAM_LABELS_METADATA_KEY,
      labels,
    ),
    getPushRecords: () => getControllerMetadata<ControllerPushRecords>(
      fetcher,
      CONTROLLER_PUSH_RECORDS_METADATA_KEY,
      {},
    ),
    setPushRecords: (records) => setControllerMetadata(
      fetcher,
      CONTROLLER_PUSH_RECORDS_METADATA_KEY,
      records,
    ),
    getPatternImports: async () => {
      const body = await requestJson<{ value?: unknown }>(fetcher,
        `/api/controller-metadata/${CONTROLLER_PATTERN_IMPORTS_METADATA_KEY}`)
      return readControllerPatternImportLedger(body.value)
    },
    setPatternImports: async (value) => {
      if (value === undefined) throw new Error('Controller import metadata is unreadable. No Pattern was sent.')
      const ledger = readControllerPatternImportLedger(value)
      await setControllerMetadata(fetcher, CONTROLLER_PATTERN_IMPORTS_METADATA_KEY, ledger)
    },
  }
}

let activeStorage: ControllerMetadataStorage = demoControllerMetadataStorage
let pinnedStorage: ControllerMetadataStorage | null = null

/** Dev-only (#766): hold `storage` active across later initialize calls. */
export function pinControllerMetadataStorage(storage: ControllerMetadataStorage | null): void {
  pinnedStorage = storage
  if (storage) activeStorage = storage
}
let pushRecordsRevision = 0
const pushRecordsRevisionListeners = new Set<() => void>()

export function getControllerMetadataStorage(): ControllerMetadataStorage {
  return activeStorage
}

export function setControllerMetadataStorage(storage: ControllerMetadataStorage): void {
  activeStorage = storage
}

export function resetControllerMetadataStorage(): void {
  pinnedStorage = null
  activeStorage = demoControllerMetadataStorage
}

export interface ControllerMetadataStorageInitOptions {
  storage?: ControllerMetadataStorage
  mode?: ControllerMetadataStorageMode
}

export interface ControllerMetadataStorageModeContext {
  prod?: boolean
  baseUrl?: string
}

export function resolveControllerMetadataStorageMode(
  _raw: string | undefined,
  _context: ControllerMetadataStorageModeContext = {},
): ControllerMetadataStorageMode {
  return 'remote-api'
}

export async function initializeControllerMetadataStorage(
  options: ControllerMetadataStorageInitOptions = {},
): Promise<ControllerMetadataStorage> {
  if (import.meta.env.DEV && pinnedStorage) {
    activeStorage = pinnedStorage
    return activeStorage
  }
  if (options.storage) {
    activeStorage = options.storage
    return activeStorage
  }
  activeStorage = createRemoteControllerMetadataStorage()
  return activeStorage
}

export function getControllerBindings(): Promise<BindingStore> {
  return activeStorage.getControllerBindings()
}

function importPorts(storage: ControllerMetadataStorage) {
  if (storage.id === 'demo') throw new Error('Sign in required for Controller import storage')
  if (!storage.getPatternImports || !storage.setPatternImports) throw new Error('Controller import storage is unavailable')
  return { get: () => storage.getPatternImports!(), set: (value: ControllerPatternImportLedger) => storage.setPatternImports!(value) }
}

export async function getControllerPatternImports(): Promise<ControllerPatternImportLedger> {
  return readControllerPatternImportLedger(await importPorts(activeStorage).get())
}

// One client-wide owner, independent of physical Controller and adapter identity.
let importMutationTail: Promise<void> = Promise.resolve()

function orderedJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}

export function mutateControllerPatternImport(
  context: { storage: ControllerMetadataStorage; assertAccountSession: () => void },
  patternId: string,
  update: (current: ControllerPatternImportReceipt | null) => ControllerPatternImportReceipt,
): Promise<ControllerPatternImportReceipt> {
  const { storage, assertAccountSession } = context
  const result = importMutationTail.then(async () => {
    assertAccountSession()
    const ports = importPorts(storage)
    const latest = readControllerPatternImportLedger(await ports.get())
    assertAccountSession()
    // A separate copy prevents an updater from rewriting the immutable comparison witness.
    const current = Object.prototype.hasOwnProperty.call(latest.byPatternId, patternId) ? latest.byPatternId[patternId] : null
    const next = update(structuredClone(current))
    if (!next || next.patternId !== patternId) throw new Error('Controller import metadata is unreadable. No Pattern was sent.')
    const intended = withControllerPatternImport(latest, next)
    assertAccountSession()
    await ports.set(intended)
    assertAccountSession()
    const confirmed = readControllerPatternImportLedger(await ports.get())
    assertAccountSession()
    if (orderedJson(confirmed) !== orderedJson(intended)) throw new Error('Controller import metadata is unreadable. No Pattern was sent.')
    return confirmed.byPatternId[patternId]
  })
  importMutationTail = result.then(() => undefined, () => undefined)
  return result
}

export function setControllerBindings(bindings: BindingStore): Promise<void> {
  return activeStorage.setControllerBindings(bindings)
}

export function getProgramLabels(): Promise<ProgramLabelStore> {
  return activeStorage.getProgramLabels()
}

export function setProgramLabels(labels: ProgramLabelStore): Promise<void> {
  return activeStorage.setProgramLabels(labels)
}

export function getPushRecords(): Promise<ControllerPushRecords> {
  return activeStorage.getPushRecords()
}

export function getControllerPushRecordsRevision(): number {
  return pushRecordsRevision
}

export function subscribeControllerPushRecordsRevision(listener: () => void): () => void {
  pushRecordsRevisionListeners.add(listener)
  return () => pushRecordsRevisionListeners.delete(listener)
}

export async function setPushRecords(records: ControllerPushRecords): Promise<void> {
  await activeStorage.setPushRecords(records)
  pushRecordsRevision += 1
  for (const listener of pushRecordsRevisionListeners) listener()
}

async function getControllerMetadata<T>(
  fetcher: typeof fetch,
  key: string,
  fallback: T,
): Promise<T> {
  const body = await requestJson<{ value?: T }>(fetcher, `/api/controller-metadata/${encodeURIComponent(key)}`)
  return body.value ?? fallback
}

async function setControllerMetadata<T>(fetcher: typeof fetch, key: string, value: T): Promise<void> {
  await requestJson(fetcher, `/api/controller-metadata/${encodeURIComponent(key)}`, {
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
    throw new Error(`Remote controller metadata request failed: ${response.status}`)
  }
  return await response.json() as T
}
