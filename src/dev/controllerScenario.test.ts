// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  CONTROLLER_SCENARIO_DEVICE_ID, CONTROLLER_SCENARIO_IP, CONTROLLER_SCENARIO_NAMES,
  CONTROLLER_SCENARIO_SENTINEL, ScenarioControllerProvider,
  __resetControllerScenarioForTests, applyControllerScenarioFromSearch,
  controllerScenario, createMemoryControllerMetadataStorage, createMemoryPersonalContentProvider,
  installControllerScenario, parseControllerScenarioQuery,
} from './controllerScenario'
import { NullControllerProvider, NO_CAPABILITIES } from '@/engine/ControllerProvider'
import { createControllerProvider, getControllerProvider, resetControllerProvider, setControllerProviderFactory } from '@/engine/controllerProviderRegistry'
import { demoPersonalContentProvider, getPersonalContentProvider, initializePersonalContentProvider, resetPersonalContentProvider } from '@/engine/personalContentProvider'
import { initializeControllerMetadataStorage, resetControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import { __resetControllerProviders, controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { __resetControllerProfileAutoCreateGuards, controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { __resetControllerProfileWriteQueue } from '@/engine/controllerProfileWriteQueue'
import { __resetControllerDeviceWriteQueue } from '@/engine/controllerDeviceWriteQueue'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { useLibraryStore, libraryInitialState } from '@/store/libraryStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useControllerPanelStore, controllerPanelInitialState } from '@/store/controllerPanelStore'
import { useShowStore, showInitialState } from '@/store/showStore'
import { buildStudioMapFingerprintCandidates, matchInstalledMapFingerprint } from '@/engine/mapFingerprint'
import { canonicalControllerDeviceId } from '@/engine/controllerIdentity'

const scenarioGlobal = () => (window as Window & {
  __pxlblzControllerScenario?: { sentinel: string; name: string; ip: string }
}).__pxlblzControllerScenario
const entry = () => useControllerStore.getState().controllers[CONTROLLER_SCENARIO_IP]

beforeEach(() => {
  localStorage.clear()
  __resetControllerProviders()
  resetControllerProvider()
  resetPersonalContentProvider()
  resetControllerMetadataStorage()
  __resetControllerProfileAutoCreateGuards()
  __resetControllerProfileWriteQueue()
  __resetControllerDeviceWriteQueue()
  useControllerStore.setState(controllerInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePatternStore.setState(patternInitialState)
  useEditorStore.setState(editorInitialState)
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  useControllerPanelStore.setState(controllerPanelInitialState)
  useShowStore.setState(showInitialState)
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network'))))
})

afterEach(() => {
  __resetControllerProviders()
  resetControllerProvider()
  __resetControllerScenarioForTests()
  resetPersonalContentProvider()
  resetControllerMetadataStorage()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function connectScenario() {
  await useControllerStore.getState().detectExtension()
  await useControllerStore.getState().autoConnect()
  await vi.waitFor(() => expect(entry()?.phase).toBe('live'))
}

describe('Controller scenarios', () => {
  it.each([
    ['', { kind: 'none' }],
    ['?capture', { kind: 'none' }],
    ['?controllerScenario=matched', { kind: 'scenario', name: 'matched' }],
    ['?capture&controllerScenario=map-error', { kind: 'scenario', name: 'map-error' }],
    ['?controllerScenario=Matched', { kind: 'invalid', raw: 'Matched' }],
    ['?controllerScenario=', { kind: 'invalid', raw: '' }],
    ['?controllerScenario=matched&controllerScenario=map-absent', { kind: 'invalid', raw: 'matched,map-absent' }],
  ])('parses %s', (search, expected) => {
    expect(parseControllerScenarioQuery(search)).toEqual(expected)
  })

  it('registers eight distinct scenarios with matching names', () => {
    expect(new Set(CONTROLLER_SCENARIO_NAMES).size).toBe(8)
    for (const name of CONTROLLER_SCENARIO_NAMES) expect(controllerScenario(name).name).toBe(name)
  })

  it('leaves startup alone without the flag', async () => {
    const sentinel = new NullControllerProvider()
    setControllerProviderFactory(() => sentinel)
    expect(applyControllerScenarioFromSearch('')).toEqual({ kind: 'none' })
    expect(createControllerProvider('10.0.0.5')).toBe(sentinel)
    expect(scenarioGlobal()).toBeUndefined()
    expect(console.error).not.toHaveBeenCalled()
    expect(await initializePersonalContentProvider({ provider: demoPersonalContentProvider })).toBe(demoPersonalContentProvider)
  })

  it('diagnoses invalid names once and preserves startup', () => {
    const sentinel = new NullControllerProvider()
    setControllerProviderFactory(() => sentinel)
    const priorIp = useControllerStore.getState().lastConnectedIp
    expect(applyControllerScenarioFromSearch('?controllerScenario=bogus')).toEqual({ kind: 'invalid', raw: 'bogus' })
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[controller scenario] Unknown scenario "bogus". Valid scenarios: ' + CONTROLLER_SCENARIO_NAMES.join(', ') + '. The extension-backed provider stays installed.',
    )
    expect(createControllerProvider('10.0.0.5')).toBe(sentinel)
    expect(scenarioGlobal()).toBeUndefined()
    expect(useControllerStore.getState().lastConnectedIp).toBe(priorIp)
  })

  it('pins memory providers across component re-initialization', async () => {
    installControllerScenario('matched')
    expect((await initializePersonalContentProvider({ mode: 'remote-api' })).id).toBe('controller-scenario-memory')
    expect((await initializeControllerMetadataStorage({ mode: 'remote-api' })).id).toBe('controller-scenario-memory')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('keeps connection and auto-created profiles out of localStorage and network', async () => {
    localStorage.setItem('pixelblaze-controller', JSON.stringify({ state: {
      lastConnectedIp: '10.0.0.9', lastConnectedNickname: 'Real', rendererPausedByPxlblz: false, saveArmed: false,
    }, version: 0 }))
    const saved = localStorage.getItem('pixelblaze-controller')
    installControllerScenario('matched')
    const memoryProvider = getPersonalContentProvider()
    await connectScenario()
    // ControllerBar re-initializes before ensuring the live Controller profile.
    await initializePersonalContentProvider({ mode: 'remote-api' })
    await useControllerProfileStore.getState().ensureProfileForLiveController(entry())
    expect(localStorage.getItem('pixelblaze-controller')).toBe(saved)
    const profiles = await memoryProvider.listControllerProfiles()
    expect(profiles).toHaveLength(1)
    expect(profiles[0].deviceId).toBe(canonicalControllerDeviceId(CONTROLLER_SCENARIO_DEVICE_ID))
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each(CONTROLLER_SCENARIO_NAMES)('exposes %s through the real Controller store', async (name) => {
    const scenario = controllerScenario(name)
    expect(applyControllerScenarioFromSearch('?controllerScenario=' + name)).toEqual({ kind: 'scenario', name })
    expect(scenarioGlobal()).toEqual({ sentinel: CONTROLLER_SCENARIO_SENTINEL, name, ip: CONTROLLER_SCENARIO_IP })
    await connectScenario()
    await vi.waitFor(() => expect(entry().firmwareUpdateState).toBe(scenario.firmwareUpdate))
    const status = scenario.installedMap === 'loading' || scenario.installedMap === 'absent' || scenario.installedMap === 'error'
      ? scenario.installedMap : 'present'
    await vi.waitFor(() => expect(entry().installedMap?.status).toBe(status))
    if (name === 'map-loading') {
      // Advance the specified observation window without charging a real sleep.
      vi.useFakeTimers()
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 50)
        vi.advanceTimersByTime(50)
      })
      expect(entry().installedMap?.status).toBe('loading')
    }
    expect(entry().deviceId).toBe(CONTROLLER_SCENARIO_DEVICE_ID)
    const installedMap = entry().installedMap
    if (name === 'matched' || name === 'matched-long-name' || name === 'map-unknown') {
      expect(installedMap?.status).toBe('present')
      if (installedMap?.status !== 'present') throw new Error('Expected an observed map')
      const match = matchInstalledMapFingerprint({
        hash: installedMap.fingerprint,
        candidates: buildStudioMapFingerprintCandidates({ userMaps: scenario.userMaps, pixelCount: scenario.pixelCount }),
      })
      if (name === 'map-unknown') expect(match).toBeNull()
      else expect(match?.name).toBe(name === 'matched' ? 'Ring' : scenario.userMaps[0].name)
    }
    if (name === 'count-mismatch') {
      expect(installedMap?.status === 'present' && installedMap.pointCount).toBe(256)
      expect((await getControllerProvider().getConfig()).pixelCount).toBe(300)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('supplies panel data and applies volatile configuration writes', async () => {
    const provider = new ScenarioControllerProvider(controllerScenario('matched'))
    expect(await provider.getVars()).toEqual({
      phase: 0.5, __px_powerDutyRecent: 0.12, __px_powerDutySinceStart: 0.1,
      __px_powerLimit: 0.25, __px_powerScale: 0.9, __px_powerClipping: 0,
    })
    const config = await provider.getConfig()
    expect(Object.keys(config.activeControls ?? {}).length).toBeGreaterThanOrEqual(2)
    expect((await provider.listPrograms()).map((program) => program.id)).toContain(config.activeProgramId)
    await provider.setBrightness(0.7)
    await provider.setControls({ sliderSpeed: 0.9 })
    await provider.setName('Renamed')
    await provider.setPixelCount(300)
    await provider.setVars({ phase: 0.8, extra: 1 })
    expect(await provider.getConfig()).toMatchObject({
      brightness: 0.7, activeControls: { sliderSpeed: 0.9, toggleMirror: 1 }, name: 'Renamed', pixelCount: 300,
    })
    expect(await provider.getVars()).toMatchObject({ phase: 0.8, extra: 1 })
    expect(provider.capabilities).toEqual(NO_CAPABILITIES)
    await expect(provider.compile('')).rejects.toThrow('Not connected')
  })

  it('publishes connection changes and stops notifying removed listeners', async () => {
    const provider = new ScenarioControllerProvider(controllerScenario('matched'))
    const listener = vi.fn()
    const unsubscribe = provider.subscribe(listener)
    expect(provider.getStatus()).toEqual({ kind: 'extension-present' })
    expect(await provider.detectHelper()).toBe(true)
    expect(await provider.discover()).toEqual([{
      id: CONTROLLER_SCENARIO_DEVICE_ID, address: CONTROLLER_SCENARIO_IP, name: 'Scenario Controller', version: '3.51',
    }])
    await provider.connect({ address: CONTROLLER_SCENARIO_IP })
    expect(listener).toHaveBeenLastCalledWith(provider.getStatus())
    await provider.disconnect()
    expect(listener).toHaveBeenLastCalledWith({ kind: 'extension-present' })
    unsubscribe()
    await provider.disconnect()
    expect(listener).toHaveBeenCalledTimes(2)
  })

  it('stores personal records as isolated copies and supports their lifecycle', async () => {
    const seed = controllerScenario('matched-long-name').userMaps
    const provider = createMemoryPersonalContentProvider({ maps: seed })
    seed[0].name = 'Mutated input'
    const map = (await provider.listMaps())[0]
    expect(map.name).not.toBe('Mutated input')
    map.points![0][0] = -99
    expect((await provider.listMaps())[0].points![0][0]).not.toBe(-99)
    await provider.updateMap(map.id, { name: 'Updated' })
    expect((await provider.listMaps())[0].name).toBe('Updated')
    await provider.deleteMap(map.id)
    expect(await provider.listMaps()).toEqual([])
    await provider.createMap(map)
    expect(await provider.listMaps()).toEqual([map])
    await provider.setLastActive({ type: 'pattern', id: 'test' })
    expect(await provider.getLastActive()).toEqual({ type: 'pattern', id: 'test' })
    await provider.setDemoOverrides({ test: { brightness: 0.5 } })
    expect(await provider.getDemoOverrides()).toEqual({ test: { brightness: 0.5 } })
    expect(await provider.getWorkspaceStarterState!()).toEqual({ version: 1, initialized: ['patterns', 'maps', 'mixins', 'libraries'] })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('holds all Controller metadata in memory', async () => {
    const storage = createMemoryControllerMetadataStorage()
    expect(await storage.getControllerBindings()).toEqual({})
    expect(await storage.getProgramLabels()).toEqual({})
    expect(await storage.getPushRecords()).toEqual({})
    const labels = { [CONTROLLER_SCENARIO_IP]: { 'scenario-pattern': 'Local label' } }
    await storage.setProgramLabels(labels)
    labels[CONTROLLER_SCENARIO_IP]['scenario-pattern'] = 'Changed input'
    expect(await storage.getProgramLabels()).toEqual({ [CONTROLLER_SCENARIO_IP]: { 'scenario-pattern': 'Local label' } })
    await storage.setControllerBindings({})
    await storage.setPushRecords({})
    expect(fetch).not.toHaveBeenCalled()
  })

  it('releases pins on reset', async () => {
    installControllerScenario('matched')
    __resetControllerScenarioForTests()
    resetPersonalContentProvider()
    expect(await initializePersonalContentProvider({ provider: demoPersonalContentProvider })).toBe(demoPersonalContentProvider)
    expect(scenarioGlobal()).toBeUndefined()
  })
})
