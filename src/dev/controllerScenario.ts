import { createJSONStorage, type StateStorage } from 'zustand/middleware'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerStatus,
  type ControllerTarget,
} from '@/engine/ControllerProvider'
import { setControllerProviderFactory } from '@/engine/controllerProviderRegistry'
import { pinPersonalContentProvider, type PersonalContentProvider, type LastActive, type WorkspaceStarterState } from '@/engine/personalContentProvider'
import { pinControllerMetadataStorage, type ControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import type { LibraryRecord, MapRecord, MixinRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { Settings } from '@/engine/settings'
import type { EntityOrganizationKind, EntityOrganizationV1 } from '@/engine/entityOrganization'
import type { FirmwareUpdateState } from '@/engine/firmwareUpdate'
import type { BindingStore, ProgramLabelStore } from '@/engine/controllerBinding'
import type { ControllerPushRecords } from '@/engine/controllerPushRecord'
import { bakeMapSource } from '@/engine/maps/bake'
import { stockMapSpec } from '@/pixelblaze/stock/maps/stockCatalogue'
import { encodeMapData } from '@/engine/mapPush'
import { useControllerStore } from '@/store/controllerStore'

export const CONTROLLER_SCENARIO_QUERY_PARAM = 'controllerScenario'
export const CONTROLLER_SCENARIO_SENTINEL = 'pxlblz-dev-controller-scenario-v1'
export const CONTROLLER_SCENARIO_IP = '192.0.2.10'
export const CONTROLLER_SCENARIO_DEVICE_ID = 'pixelblaze_scenario'
export const CONTROLLER_SCENARIO_NAMES = [
  'matched', 'matched-long-name', 'map-unknown', 'map-loading',
  'map-absent', 'map-error', 'count-mismatch', 'firmware-update',
] as const
export type ControllerScenarioName = typeof CONTROLLER_SCENARIO_NAMES[number]

export type ControllerScenarioQuery =
  | { kind: 'none' }
  | { kind: 'scenario'; name: ControllerScenarioName }
  | { kind: 'invalid'; raw: string }

export function parseControllerScenarioQuery(search: string): ControllerScenarioQuery {
  const values = new URLSearchParams(search).getAll(CONTROLLER_SCENARIO_QUERY_PARAM)
  if (values.length === 0) return { kind: 'none' }
  if (values.length === 1) {
    const name = CONTROLLER_SCENARIO_NAMES.find((name) => name === values[0])
    if (name) return { kind: 'scenario', name }
  }
  return { kind: 'invalid', raw: values.join(',') }
}

export interface ControllerScenario {
  name: ControllerScenarioName
  description: string
  pixelCount: number
  installedMap: 'loading' | 'absent' | 'error' | { points: number[][] }
  firmwareUpdate: FirmwareUpdateState
  userMaps: MapRecord[]
}

function ringPoints(): number[][] {
  return bakeMapSource(stockMapSpec('seed-ring-2d')!.source, 256).points
}

export function controllerScenario(name: ControllerScenarioName): ControllerScenario {
  const base: ControllerScenario = {
    name,
    description: 'The installed map matches the stock Ring map.',
    pixelCount: 256,
    installedMap: { points: ringPoints() },
    firmwareUpdate: 'current',
    userMaps: [],
  }
  switch (name) {
    case 'matched': return base
    case 'matched-long-name': {
      const points = Array.from({ length: 64 }, (_, i) => {
        const t = 2 * Math.PI * i / 64
        const r = 0.4 * Math.cos(3 * t)
        return [0.5 + r * Math.cos(t), 0.5 + r * Math.sin(t)]
      })
      return {
        ...base,
        description: 'The installed map matches a personal map with a long name.',
        pixelCount: 64,
        installedMap: { points },
        userMaps: [{
          id: 'scenario-long-name-map',
          name: 'Northeast Gallery Ceiling Canopy, Upper Ring Segment B (Revision 2026-10)',
          dim: 2, generator: 'custom', params: {}, points, updatedAt: 0,
        }],
      }
    }
    case 'map-unknown': return {
      ...base,
      description: 'The installed spiral map has no matching Studio map.',
      pixelCount: 64,
      installedMap: { points: Array.from({ length: 64 }, (_, i) => [
        0.5 + 0.45 * (i / 64) * Math.cos(i * 0.7),
        0.5 + 0.45 * (i / 64) * Math.sin(i * 0.7),
      ]) },
    }
    case 'map-loading': return { ...base, installedMap: 'loading', description: 'The connected Controller is still loading its installed map.' }
    case 'map-absent': return { ...base, installedMap: 'absent', description: 'The connected Controller has no installed map.' }
    case 'map-error': return { ...base, installedMap: 'error', description: 'The connected Controller failed to read its installed map.' }
    case 'count-mismatch': return { ...base, pixelCount: 300, description: 'The Controller pixel count exceeds its installed map point count.' }
    case 'firmware-update': return { ...base, firmwareUpdate: 'available', description: 'The connected Controller reports a firmware update is available.' }
  }
}

export class ScenarioControllerProvider extends NullControllerProvider {
  private status: ControllerStatus = { kind: 'extension-present' }
  private readonly statusListeners = new Set<(status: ControllerStatus) => void>()
  private config: ControllerConfig
  private vars = {
    phase: 0.5,
    __px_powerDutyRecent: 0.12,
    __px_powerDutySinceStart: 0.1,
    __px_powerLimit: 0.25,
    __px_powerScale: 0.9,
    __px_powerClipping: 0,
  }
  private mapReads = 0

  constructor(private readonly scenario: ControllerScenario) {
    super()
    this.config = {
      brightness: 0.4,
      activeProgramId: 'scenario-pattern',
      activeControls: { sliderSpeed: 0.35, toggleMirror: 1, sliderHue: 0.6 },
      name: 'Scenario Controller', pixelCount: scenario.pixelCount, firmwareVersion: '3.51',
    }
  }

  async detectHelper() { return true }
  async discover() {
    return [{ id: CONTROLLER_SCENARIO_DEVICE_ID, address: CONTROLLER_SCENARIO_IP, name: 'Scenario Controller', version: '3.51' }]
  }
  getStatus() { return this.status }
  subscribe(listener: (status: ControllerStatus) => void) {
    this.statusListeners.add(listener)
    return () => { this.statusListeners.delete(listener) }
  }
  private publish(status: ControllerStatus) {
    this.status = status
    for (const listener of this.statusListeners) listener(status)
  }
  async connect(target: ControllerTarget) {
    this.publish({ kind: 'connected', controller: {
      id: CONTROLLER_SCENARIO_DEVICE_ID, address: target.address,
      deviceId: CONTROLLER_SCENARIO_DEVICE_ID, name: 'Scenario Controller', firmwareVersion: '3.51',
    } })
  }
  async disconnect() { this.publish({ kind: 'extension-present' }) }
  async getConfig() { return structuredClone(this.config) }
  async setBrightness(value: number) { this.config.brightness = value }
  async setControls(values: Record<string, number>) {
    this.config.activeControls = { ...this.config.activeControls, ...values }
  }
  async setName(value: string) { this.config.name = value }
  async setPixelCount(value: number) { this.config.pixelCount = value }
  async getTelemetry() { return { fps: 30 } }
  async listPrograms() {
    return [{ id: 'scenario-pattern', name: 'Scenario Pattern' }, { id: 'scenario-other', name: 'Second Pattern' }]
  }
  async getVars() { return { ...this.vars } }
  async setVars(vars: Record<string, number>) { this.vars = { ...this.vars, ...vars } }
  async setRendererPaused() {}
  async checkFirmwareUpdate() { return this.scenario.firmwareUpdate }

  private async readMap(): Promise<number[][] | null> {
    const map = this.scenario.installedMap
    if (map === 'absent') return null
    if (map === 'error') throw new Error('Scenario map read failed')
    if (map === 'loading') {
      // Bootstrap must finish before a later read can hold the live map loading.
      if (this.mapReads++ === 0) return ringPoints()
      return new Promise(() => {})
    }
    return structuredClone(map.points)
  }
  getPixelMap() { return this.readMap() }
  async getPixelMapData() {
    const points = await this.readMap()
    return points ? encodeMapData(points) : null
  }
}

function memoryCollection<T extends { id: string }>(seed: T[] = []) {
  const records = new Map(seed.map((record) => [record.id, structuredClone(record)]))
  return {
    list: async () => structuredClone([...records.values()]),
    create: async (record: T) => { records.set(record.id, structuredClone(record)) },
    update: async (id: string, changes: Partial<Omit<T, 'id'>>) => {
      const record = records.get(id)
      if (record) records.set(id, { ...record, ...structuredClone(changes) })
    },
    delete: async (id: string) => { records.delete(id) },
  }
}

export function createMemoryPersonalContentProvider(seed: { maps: MapRecord[] }): PersonalContentProvider {
  const patterns = memoryCollection<PatternRecord>()
  const maps = memoryCollection(seed.maps)
  const mixins = memoryCollection<MixinRecord>()
  const libraries = memoryCollection<LibraryRecord>()
  const shows = memoryCollection<ShowRecord>()
  const showsV2 = memoryCollection<ShowRecordV2>()
  const profiles = memoryCollection<ControllerProfile>()
  let lastActive: LastActive | undefined
  let overrides: Record<string, Partial<Settings>> | undefined
  let starterState: WorkspaceStarterState = { version: 1, initialized: ['patterns', 'maps', 'mixins', 'libraries'] }
  const organizations = new Map<EntityOrganizationKind, EntityOrganizationV1>()
  return {
    id: 'controller-scenario-memory',
    listPatterns: patterns.list, createPattern: patterns.create, updatePattern: patterns.update, deletePattern: patterns.delete,
    listMaps: maps.list, createMap: maps.create, updateMap: maps.update, deleteMap: maps.delete,
    listMixins: mixins.list, createMixin: mixins.create, updateMixin: mixins.update, deleteMixin: mixins.delete,
    listLibraries: libraries.list, createLibrary: libraries.create, updateLibrary: libraries.update, deleteLibrary: libraries.delete,
    listShows: shows.list, createShow: shows.create, updateShow: shows.update, deleteShow: shows.delete,
    listShowDocumentsV2: showsV2.list,
    createShowV2: showsV2.create,
    replaceShowV2: async (id, record) => { await showsV2.create({ ...record, id }) },
    listControllerProfiles: profiles.list, createControllerProfile: profiles.create,
    updateControllerProfile: profiles.update, deleteControllerProfile: profiles.delete,
    getLastActive: async () => structuredClone(lastActive),
    setLastActive: async (value) => { lastActive = structuredClone(value) },
    getDemoOverrides: async () => structuredClone(overrides),
    setDemoOverrides: async (value) => { overrides = structuredClone(value) },
    getWorkspaceStarterState: async () => structuredClone(starterState),
    setWorkspaceStarterState: async (value) => { starterState = structuredClone(value) },
    getEntityOrganization: async (kind) => structuredClone(organizations.get(kind)),
    setEntityOrganization: async (kind, value) => { organizations.set(kind, structuredClone(value)) },
  }
}

export function createMemoryControllerMetadataStorage(): ControllerMetadataStorage {
  let bindings: BindingStore = {}
  let labels: ProgramLabelStore = {}
  let records: ControllerPushRecords = {}
  return {
    id: 'controller-scenario-memory',
    getControllerBindings: async () => structuredClone(bindings),
    setControllerBindings: async (value) => { bindings = structuredClone(value) },
    getProgramLabels: async () => structuredClone(labels),
    setProgramLabels: async (value) => { labels = structuredClone(value) },
    getPushRecords: async () => structuredClone(records),
    setPushRecords: async (value) => { records = structuredClone(value) },
  }
}

const memoryState = new Map<string, string>()
const memoryStateStorage: StateStorage = {
  getItem: (name) => memoryState.get(name) ?? null,
  setItem: (name, value) => { memoryState.set(name, value) },
  removeItem: (name) => { memoryState.delete(name) },
}
let unsubscribeMapLoading: (() => void) | undefined

type ScenarioWindow = Window & { __pxlblzControllerScenario?: { sentinel: string; name: ControllerScenarioName; ip: string } }

export function installControllerScenario(name: ControllerScenarioName): void {
  const scenario = controllerScenario(name)
  pinPersonalContentProvider(createMemoryPersonalContentProvider({ maps: scenario.userMaps }))
  pinControllerMetadataStorage(createMemoryControllerMetadataStorage())
  useControllerStore.persist.setOptions({ storage: createJSONStorage(() => memoryStateStorage) })
  setControllerProviderFactory(() => new ScenarioControllerProvider(scenario))
  useControllerStore.setState({ lastConnectedIp: CONTROLLER_SCENARIO_IP, lastConnectedNickname: null })
  unsubscribeMapLoading?.()
  unsubscribeMapLoading = undefined
  if (scenario.installedMap === 'loading') {
    unsubscribeMapLoading = useControllerStore.subscribe((state) => {
      const entry = state.controllers[CONTROLLER_SCENARIO_IP]
      if (entry?.phase !== 'live' || entry.installedMap?.status !== 'present') return
      unsubscribeMapLoading?.()
      unsubscribeMapLoading = undefined
      void useControllerStore.getState().refreshInstalledMap(CONTROLLER_SCENARIO_IP)
    })
  }
  ;(window as ScenarioWindow).__pxlblzControllerScenario = { sentinel: CONTROLLER_SCENARIO_SENTINEL, name, ip: CONTROLLER_SCENARIO_IP }
  console.info('[controller scenario] ' + name + ': ' + scenario.description + ' Memory-only; reload without ?controllerScenario to leave.')
}

export function applyControllerScenarioFromSearch(search: string): ControllerScenarioQuery {
  const query = parseControllerScenarioQuery(search)
  if (query.kind === 'invalid') {
    console.error('[controller scenario] Unknown scenario "' + query.raw + '". Valid scenarios: ' + CONTROLLER_SCENARIO_NAMES.join(', ') + '. The extension-backed provider stays installed.')
  } else if (query.kind === 'scenario') {
    installControllerScenario(query.name)
  }
  return query
}

export function __resetControllerScenarioForTests(): void {
  unsubscribeMapLoading?.()
  unsubscribeMapLoading = undefined
  useControllerStore.persist.setOptions({ storage: createJSONStorage(() => localStorage) })
  memoryState.clear()
  pinPersonalContentProvider(null)
  pinControllerMetadataStorage(null)
  delete (window as ScenarioWindow).__pxlblzControllerScenario
}
