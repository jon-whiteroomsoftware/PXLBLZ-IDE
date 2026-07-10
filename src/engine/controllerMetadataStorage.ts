import type { BindingStore, ProgramLabelStore } from './controllerBinding'
import type { ControllerPushRecords } from './controllerPushRecord'

export const CONTROLLER_BINDINGS_METADATA_KEY = 'controller-bindings'
export const CONTROLLER_PROGRAM_LABELS_METADATA_KEY = 'controller-program-labels'
export const CONTROLLER_PUSH_RECORDS_METADATA_KEY = 'controller-push-records'

export type ControllerMetadataStorageMode = 'remote-api'

export interface ControllerMetadataStorage {
  readonly id: string
  getControllerBindings(): Promise<BindingStore>
  setControllerBindings(bindings: BindingStore): Promise<void>
  getProgramLabels(): Promise<ProgramLabelStore>
  setProgramLabels(labels: ProgramLabelStore): Promise<void>
  getPushRecords(): Promise<ControllerPushRecords>
  setPushRecords(records: ControllerPushRecords): Promise<void>
}

export const demoControllerMetadataStorage: ControllerMetadataStorage = {
  id: 'demo',
  getControllerBindings: async () => ({}),
  setControllerBindings: async () => {},
  getProgramLabels: async () => ({}),
  setProgramLabels: async () => {},
  getPushRecords: async () => ({}),
  setPushRecords: async () => {},
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
  }
}

let activeStorage: ControllerMetadataStorage = demoControllerMetadataStorage

export function getControllerMetadataStorage(): ControllerMetadataStorage {
  return activeStorage
}

export function setControllerMetadataStorage(storage: ControllerMetadataStorage): void {
  activeStorage = storage
}

export function resetControllerMetadataStorage(): void {
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

export function setPushRecords(records: ControllerPushRecords): Promise<void> {
  return activeStorage.setPushRecords(records)
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
