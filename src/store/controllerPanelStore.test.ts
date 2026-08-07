import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  useControllerPanelStore,
  controllerPanelInitialState,
  CONTROLLER_POLL_INTERVAL_MS,
  BRIGHTNESS_SEND_INTERVAL_MS,
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
  vars: Record<string, number> = { phase: 0.5 }
  brightnessWrites: Array<{ value: number; save: boolean }> = []
  pixelCountWrites: Array<{ value: number; save: boolean }> = []
  controlWrites: Array<{ controls: Record<string, number>; save: boolean }> = []
  variableWrites: Array<Record<string, number>> = []
  installedMap: number[][] | null = null
  mapWrites: number[][][] = []

  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve(this.config)
  }
  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.resolve(this.telemetry)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    return Promise.resolve(this.programs)
  }
  getVars(): Promise<Record<string, number>> {
    return Promise.resolve(this.vars)
  }
  setBrightness(value: number, save = false): Promise<void> {
    this.brightnessWrites.push({ value, save })
    return Promise.resolve()
  }
  setPixelCount(value: number, save = true): Promise<void> {
    this.pixelCountWrites.push({ value, save })
    return Promise.resolve()
  }
  setControls(controls: Record<string, number>, save = false): Promise<void> {
    this.controlWrites.push({ controls, save })
    return Promise.resolve()
  }
  setVars(vars: Record<string, number>): Promise<void> {
    this.variableWrites.push(vars)
    return Promise.resolve()
  }
  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(this.installedMap)
  }
  setPixelMap(points: number[][]): Promise<void> {
    this.mapWrites.push(points)
    this.installedMap = points
    return Promise.resolve()
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
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

  it('seed() warms panel content without publishing an FPS heartbeat outside an open session (#749)', async () => {
    useControllerPanelStore.getState().seed('192.168.8.224')
    await flush()
    const s = useControllerPanelStore.getState()
    expect(s.brightness).toBe(0.5)
    expect(s.activeProgramId).toBe('def')
    expect(s.fps).toBeNull()
    expect(s.fpsSourceIp).toBeNull()
    expect(s.programs).toHaveLength(2)
    expect(s.programsByController['192.168.8.224']).toEqual(provider.programs)
    // No interval was started: a later device change is not picked up.
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBeNull()
  })

  it('reads the installed map point count once on start (#205)', async () => {
    provider.getPixelMap = () =>
      Promise.resolve([
        [0, 0],
        [1, 1],
        [0.5, 0.5],
      ])
    useControllerPanelStore.getState().start()
    await flush()
    expect(useControllerPanelStore.getState().mapPointCount).toBe(3)
  })

  it('leaves the map point count null when the device has no map', async () => {
    provider.getPixelMap = () => Promise.resolve(null)
    useControllerPanelStore.getState().start()
    await flush()
    expect(useControllerPanelStore.getState().mapPointCount).toBeNull()
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

  it('polls the running pattern controls and watched vars', async () => {
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    useControllerPanelStore.getState().start()
    await flush()
    const s = useControllerPanelStore.getState()
    expect(s.activeControls).toEqual({ sliderSpeed: 0.3 })
    expect(s.vars).toEqual({ phase: 0.5 })
  })

  it('keeps controls slider-owned until the active pattern changes', async () => {
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    useControllerPanelStore.getState().start()
    await flush()
    // Local edit; later poll for the SAME pattern must not clobber it.
    useControllerPanelStore.getState().setControl('sliderSpeed', 0.8)
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderSpeed: 0.8 })
    // A pattern switch reseeds from the device.
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'abc',
      activeControls: { sliderHue: 0.1 },
    }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderHue: 0.1 })
  })

  it('setControl writes through volatile (never save:true) and updates locally', () => {
    useControllerPanelStore.getState().setControl('sliderSpeed', 0.7)
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderSpeed: 0.7 })
    expect(provider.controlWrites).toEqual([{ controls: { sliderSpeed: 0.7 }, save: false }])
  })

  it('setPowerLimit writes the exported runtime limit and updates telemetry optimistically', () => {
    useControllerPanelStore.setState({
      vars: { __px_powerLimit: 0.35, __px_powerDutyRecent: 0.5 },
    })

    useControllerPanelStore.getState().setPowerLimit(0.2)

    expect(useControllerPanelStore.getState().vars).toMatchObject({
      __px_powerLimit: 0.2,
      __px_powerDutyRecent: 0.5,
    })
    expect(provider.variableWrites).toEqual([{ __px_powerLimit: 0.2 }])
  })

  it('setBrightness writes through volatile (never save:true) and updates locally', () => {
    useControllerPanelStore.getState().setBrightness(0.25)
    expect(useControllerPanelStore.getState().brightness).toBe(0.25)
    expect(provider.brightnessWrites).toEqual([{ value: 0.25, save: false }])
  })

  it('targets throttled brightness writes at the provider active when the slider moved', async () => {
    const a = new FakeProvider()
    const b = new FakeProvider()

    await vi.advanceTimersByTimeAsync(BRIGHTNESS_SEND_INTERVAL_MS * 2)
    setControllerProvider(a)
    useControllerPanelStore.getState().setBrightness(0.4)
    await vi.advanceTimersByTimeAsync(20)
    useControllerPanelStore.getState().setBrightness(0.02)

    setControllerProvider(b)
    await vi.advanceTimersByTimeAsync(100)

    expect(a.brightnessWrites).toEqual([
      { value: 0.4, save: false },
      { value: 0.02, save: false },
    ])
    expect(b.brightnessWrites).toEqual([])
  })

  it('setPixelCount persists the count (save:true) and updates locally', async () => {
    // prev is unknown (null) here, so no reduction can be inferred — just a write.
    useControllerPanelStore.getState().setPixelCount(16)
    expect(useControllerPanelStore.getState().pixelCount).toBe(16)
    await flush()
    expect(provider.pixelCountWrites).toEqual([{ value: 16, save: true }])
    expect(provider.brightnessWrites).toEqual([])
  })

  it('reducing the count blacks out the strip, then restores brightness (#222)', async () => {
    // Driving the strip black before shrinking is the only way to darken the tail
    // LEDs (verified on hardware); brightness returns to the device's reported value.
    useControllerPanelStore.setState({ pixelCount: 4 })
    useControllerPanelStore.getState().setPixelCount(2)
    await vi.advanceTimersByTimeAsync(400)
    expect(provider.brightnessWrites).toEqual([
      { value: 0, save: false },
      { value: 0.5, save: false },
    ])
    expect(provider.pixelCountWrites).toEqual([{ value: 2, save: true }])
  })

  it('raising the count just writes it — no blackout (#222)', async () => {
    useControllerPanelStore.setState({ pixelCount: 2 })
    useControllerPanelStore.getState().setPixelCount(8)
    await flush()
    expect(provider.pixelCountWrites).toEqual([{ value: 8, save: true }])
    expect(provider.brightnessWrites).toEqual([])
  })

  it('marks the write in flight so the panel can dim/disable the input', () => {
    useControllerPanelStore.setState({ pixelCount: 16 })
    void useControllerPanelStore.getState().setPixelCount(256)
    // Synchronously: the entered value shows and the in-flight flag is set.
    expect(useControllerPanelStore.getState().pixelCount).toBe(256)
    expect(useControllerPanelStore.getState().pixelCountPending).toBe(256)
  })

  it('a poll mid-write keeps the entered count — never flashes back to the stale device value', async () => {
    // Write in flight (pending 256); the device still reports the old 16.
    useControllerPanelStore.setState({ pixelCount: 256, pixelCountPending: 256 })
    provider.config = { ...provider.config, pixelCount: 16 }
    await useControllerPanelStore.getState().poll()
    expect(useControllerPanelStore.getState().pixelCount).toBe(256)
    expect(useControllerPanelStore.getState().pixelCountPending).toBe(256)
  })

  it('poll holds the pending value and never clears it (setPixelCount owns clearing)', async () => {
    // Even when the device already reports the target, poll must not clear the hold —
    // clearing is the writer's responsibility, so poll alone can never strand the UI.
    useControllerPanelStore.setState({ pixelCount: 256, pixelCountPending: 256 })
    provider.config = { ...provider.config, pixelCount: 256 }
    await useControllerPanelStore.getState().poll()
    expect(useControllerPanelStore.getState().pixelCountPending).toBe(256)
    expect(useControllerPanelStore.getState().pixelCount).toBe(256)
  })

  it('setPixelCount clears the hold once its write sequence completes', async () => {
    provider.config = { ...provider.config, pixelCount: 8 }
    useControllerPanelStore.setState({ pixelCount: 8 })
    const done = useControllerPanelStore.getState().setPixelCount(256)
    // Held while in flight so a mid-write poll can't flash it back.
    expect(useControllerPanelStore.getState().pixelCountPending).toBe(256)
    await flush()
    await done
    expect(useControllerPanelStore.getState().pixelCountPending).toBeNull()
  })

  it('releases the hold even when the firmware silently drops the write (#204) — no stuck input', async () => {
    // Device keeps reporting the OLD count: the write was silently dropped, so it
    // never confirms. The hold must still clear so the input does not stay disabled.
    // A raise (8 → 256) avoids the reduction blackout's real 400ms sleep.
    provider.config = { ...provider.config, pixelCount: 8 }
    useControllerPanelStore.setState({ pixelCount: 8 })
    const done = useControllerPanelStore.getState().setPixelCount(256)
    await flush()
    await done
    expect(useControllerPanelStore.getState().pixelCountPending).toBeNull()
    // A later poll reconciles the display back to the device's real (unchanged) value.
    await useControllerPanelStore.getState().poll()
    expect(useControllerPanelStore.getState().pixelCount).toBe(8)
  })

  it('stop() halts polling, keeps panel content, and discards the FPS heartbeat (#749)', async () => {
    useControllerPanelStore.getState().start('1.2.3.4')
    await flush()
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'def',
      fps: 30,
      programs: provider.programs,
    })
    useControllerPanelStore.getState().stop()
    // Expensive panel content remains warm, but FPS is a connection-session
    // heartbeat and must be observed again before transport consumes it.
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'def',
      fps: null,
      programs: provider.programs,
    })
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBeNull()
  })

  it('ignores an FPS poll that completes after the panel session stops (#749)', async () => {
    const telemetry = deferred<ControllerTelemetry>()
    provider.getTelemetry = () => telemetry.promise

    useControllerPanelStore.getState().start('1.2.3.4')
    useControllerPanelStore.getState().stop()
    telemetry.resolve({ fps: 72 })
    await flush()

    expect(useControllerPanelStore.getState().fps).toBeNull()
  })

  it('reopening the same device keeps values; a never-opened different device clears first', async () => {
    useControllerPanelStore.getState().start('1.2.3.4')
    await flush()
    useControllerPanelStore.getState().stop()

    // Reopen the SAME device: panel content survives, but FPS waits for a fresh poll.
    useControllerPanelStore.getState().start('1.2.3.4')
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'def',
      fps: null,
      programs: provider.programs,
    })
    await flush()
    expect(useControllerPanelStore.getState().fps).toBe(30)
    useControllerPanelStore.getState().stop()

    // Open a DIFFERENT device: stale values are cleared before the warm fetch lands.
    useControllerPanelStore.getState().start('5.6.7.8')
    expect(useControllerPanelStore.getState().fps).toBeNull()
    await flush()
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })

  it('restores a previously opened controller immediately when switching back to it', async () => {
    const a = new FakeProvider()
    const b = new FakeProvider()
    a.config = {
      brightness: 0.4,
      activeProgramId: 'a-program',
      activeControls: { sliderA: 0.7 },
      pixelCount: 32,
    }
    a.telemetry = { fps: 24 }
    a.programs = [{ id: 'a-program', name: 'A Pattern' }]
    b.config = {
      brightness: 0.8,
      activeProgramId: 'b-program',
      activeControls: { sliderB: 0.2 },
      pixelCount: 64,
    }
    b.telemetry = { fps: 60 }
    b.programs = [{ id: 'b-program', name: 'B Pattern' }]

    setControllerProvider(a)
    useControllerPanelStore.getState().start('1.2.3.4')
    await flush()
    useControllerPanelStore.getState().stop()

    setControllerProvider(b)
    useControllerPanelStore.getState().start('5.6.7.8')
    await flush()
    useControllerPanelStore.getState().stop()

    setControllerProvider(a)
    useControllerPanelStore.getState().start('1.2.3.4')

    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'a-program',
      fps: null,
      pixelCount: 32,
      activeControls: { sliderA: 0.7 },
      programs: [{ id: 'a-program', name: 'A Pattern' }],
    })
    await flush()
    expect(useControllerPanelStore.getState().fps).toBe(24)
  })

  it('ignores late async results from a previously active controller after switching devices', async () => {
    const a = new FakeProvider()
    const b = new FakeProvider()
    const aConfig = deferred<ControllerConfig>()
    const aTelemetry = deferred<ControllerTelemetry>()
    const bConfig = deferred<ControllerConfig>()
    const bTelemetry = deferred<ControllerTelemetry>()
    a.getConfig = () => aConfig.promise
    a.getTelemetry = () => aTelemetry.promise
    a.getVars = () => Promise.resolve({ phase: 0.1 })
    b.getConfig = () => bConfig.promise
    b.getTelemetry = () => bTelemetry.promise
    b.getVars = () => Promise.resolve({ phase: 0.2 })

    setControllerProvider(a)
    useControllerPanelStore.getState().start('1.2.3.4')
    useControllerPanelStore.getState().stop()

    setControllerProvider(b)
    useControllerPanelStore.getState().start('5.6.7.8')
    bConfig.resolve({
      brightness: 0.8,
      activeProgramId: 'b-program',
      activeControls: { sliderB: 0.2 },
      pixelCount: 64,
    })
    bTelemetry.resolve({ fps: 60 })
    await flush()
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'b-program',
      fps: 60,
      pixelCount: 64,
      activeControls: { sliderB: 0.2 },
    })

    aConfig.resolve({
      brightness: 0.3,
      activeProgramId: 'a-program',
      activeControls: { sliderA: 0.9 },
      pixelCount: 32,
    })
    aTelemetry.resolve({ fps: 12 })
    await flush()

    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'b-program',
      fps: 60,
      pixelCount: 64,
      activeControls: { sliderB: 0.2 },
    })
  })

  it('tolerates a failing poll without throwing', async () => {
    provider.getConfig = () => Promise.reject(new Error('dropped'))
    useControllerPanelStore.getState().start()
    await expect(flush()).resolves.not.toThrow()
    expect(useControllerPanelStore.getState().fps).toBe(30)
  })
})
