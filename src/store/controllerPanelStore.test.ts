import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
  CONTROLLER_POLL_INTERVAL_MS,
} from './controllerPanelStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import {
  NullControllerProvider,
  type ControllerConfig,
  type ControllerTelemetry,
} from '@/engine/ControllerProvider'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'

class FakeProvider extends NullControllerProvider {
  config: ControllerConfig = { brightness: 0.5, activeProgramId: 'def' }
  telemetry: ControllerTelemetry = { fps: 30 }
  programs: ProgramListEntry[] = [
    { id: 'abc', name: 'Aurora' },
    { id: 'def', name: 'Nebula' },
  ]
  brightnessWrites: Array<{ value: number; save: boolean }> = []

  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve(this.config)
  }
  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.resolve(this.telemetry)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.resolve(this.programs)
  }
  setBrightness(value: number, save = false): Promise<void> {
    this.brightnessWrites.push({ value, save })
    return Promise.resolve()
  }
}

let provider: FakeProvider

beforeEach(() => {
  vi.useFakeTimers()
  provider = new FakeProvider()
  setControllerProvider(provider)
  useControllerPanelStore.setState(controllerPanelInitialState)
})

afterEach(() => {
  useControllerPanelStore.getState().stop()
  vi.useRealTimers()
  resetControllerProvider()
})

// Flush microtasks queued by the polled promises.
const flush = () => vi.advanceTimersByTimeAsync(0)

describe('controllerPanelStore', () => {
  it('start() polls config + telemetry and fetches the program list', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    const s = useControllerPanelStore.getState()
    expect(s.brightness).toBe(0.5)
    expect(s.activeProgramId).toBe('def')
    expect(s.fps).toBe(30)
    expect(s.programs).toHaveLength(2)
  })

  it('keeps polling on the interval', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    provider.telemetry = { fps: 45 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().fps).toBe(45)
  })

  it('seeds brightness once and does not overwrite it on later polls', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    expect(useControllerPanelStore.getState().brightness).toBe(0.5)
    // Device later reports a different brightness; the panel slider owns it now.
    provider.config = { brightness: 0.9, activeProgramId: 'def' }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().brightness).toBe(0.5)
  })

  it('setBrightness writes through volatile (never save:true) and updates locally', () => {
    useControllerPanelStore.getState().setBrightness(0.25)
    expect(useControllerPanelStore.getState().brightness).toBe(0.25)
    expect(provider.brightnessWrites).toEqual([{ value: 0.25, save: false }])
  })

  it('stop() halts polling and resets state', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    useControllerPanelStore.getState().stop()
    expect(useControllerPanelStore.getState()).toMatchObject(controllerPanelInitialState)
    // No further polls after stop.
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBeNull()
  })

  it('tolerates a failing poll without throwing', async () => {
    provider.getConfig = () => Promise.reject(new Error('dropped'))
    useControllerPanelStore.getState().start()
    await expect(flush()).resolves.not.toThrow()
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })
})
