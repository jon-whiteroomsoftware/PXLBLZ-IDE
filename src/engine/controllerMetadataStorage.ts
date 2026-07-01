import type { BindingStore, ProgramLabelStore } from './controllerBinding'
import {
  getControllerBindings as getBrowserControllerBindings,
  getProgramLabels as getBrowserProgramLabels,
  setControllerBindings as setBrowserControllerBindings,
  setProgramLabels as setBrowserProgramLabels,
} from './storage'

export const CONTROLLER_BINDINGS_METADATA_KEY = 'controller-bindings'
export const CONTROLLER_PROGRAM_LABELS_METADATA_KEY = 'controller-program-labels'

export type ControllerMetadataStorageMode = 'browser' | 'remote-api'

export interface ControllerMetadataStorage {
  readonly id: string
  getControllerBindings(): Promise<BindingStore>
  setControllerBindings(bindings: BindingStore): Promise<void>
  getProgramLabels(): Promise<ProgramLabelStore>
  setProgramLabels(labels: ProgramLabelStore): Promise<void>
}

export const browserControllerMetadataStorage: ControllerMetadataStorage = {
  id: 'browser-indexeddb',
  getControllerBindings: () => getBrowserControllerBindings(),
  setControllerBindings: (bindings) => setBrowserControllerBindings(bindings),
  getProgramLabels: () => getBrowserProgramLabels(),
  setProgramLabels: (labels) => setBrowserProgramLabels(labels),
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
  }
}

let activeStorage: ControllerMetadataStorage = browserControllerMetadataStorage

export function getControllerMetadataStorage(): ControllerMetadataStorage {
  return activeStorage
}

export function setControllerMetadataStorage(storage: ControllerMetadataStorage): void {
  activeStorage = storage
}

export function resetControllerMetadataStorage(): void {
  activeStorage = browserControllerMetadataStorage
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
  raw: string | undefined,
  context: ControllerMetadataStorageModeContext = {},
): ControllerMetadataStorageMode {
  if (raw === 'browser') return 'browser'
  if (raw === 'remote-api') return 'remote-api'
  if (context.prod && context.baseUrl === '/') return 'remote-api'
  return 'browser'
}

export async function initializeControllerMetadataStorage(
  options: ControllerMetadataStorageInitOptions = {},
): Promise<ControllerMetadataStorage> {
  if (options.storage) {
    activeStorage = options.storage
    return activeStorage
  }
  const mode = options.mode ?? resolveControllerMetadataStorageMode(import.meta.env.VITE_PERSONAL_CONTENT_PROVIDER, {
    prod: import.meta.env.PROD,
    baseUrl: import.meta.env.BASE_URL,
  })
  activeStorage = mode === 'remote-api'
    ? createRemoteControllerMetadataStorage()
    : browserControllerMetadataStorage
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
