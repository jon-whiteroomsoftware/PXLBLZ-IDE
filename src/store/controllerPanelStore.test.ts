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
  activeProgramWrites: Array<{ programId: string; save: boolean }> = []
  deletedProgramIds: string[] = []
  listProgramsCalls = 0

  getConfig(): Promise<ControllerConfig> {
    return Promise.resolve(this.config)
  }
  getTelemetry(): Promise<ControllerTelemetry> {
    return Promise.resolve(this.telemetry)
  }
  listPrograms(): Promise<ProgramListEntry[]> {
    this.listProgramsCalls += 1
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
  setActiveProgram(programId: string, opts: { save?: boolean } = {}): Promise<void> {
    this.activeProgramWrites.push({ programId, save: opts.save ?? true })
    this.config = {
      ...this.config,
      activeProgramId: programId,
      activeControls: programId === 'abc' ? { sliderHue: 0.1 } : this.config.activeControls,
    }
    return Promise.resolve()
  }
  deleteProgram(programId: string): Promise<void> {
    this.deletedProgramIds.push(programId)
    this.programs = this.programs.filter((program) => program.id !== programId)
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
    expect(s.configSourceIp).toBe('192.168.8.224')
    expect(s.fps).toBeNull()
    expect(s.fpsSourceIp).toBeNull()
    expect(s.programs).toHaveLength(2)
    expect(s.programsByController['192.168.8.224']).toEqual(provider.programs)
    // No interval was started: a later device change is not picked up.
    provider.telemetry = { fps: 99 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS * 3)
    expect(useControllerPanelStore.getState().fps).toBeNull()
  })

  it('keeps polling on the interval', async () => {
    useControllerPanelStore.getState().start()
    await flush()
    provider.telemetry = { fps: 45 }
    await vi.advanceTimersByTimeAsync(CONTROLLER_POLL_INTERVAL_MS)
    expect(useControllerPanelStore.getState().fps).toBe(45)
  })

  it('publishes a confirmed activation immediately and lets polling replace it', async () => {
    useControllerPanelStore.getState().noteProgramActivated('run-pattern-1', '192.168.8.224')
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'run-pattern-1',
      configSourceIp: '192.168.8.224',
    })

    provider.config = { brightness: 0.5, activeProgramId: 'doom-fire' }
    await useControllerPanelStore.getState().poll()

    expect(useControllerPanelStore.getState().activeProgramId).toBe('doom-fire')
  })

  it('keeps the newest same-Controller program-list response when requests finish out of order', async () => {
    const first = deferred<ProgramListEntry[]>()
    const second = deferred<ProgramListEntry[]>()
    provider.listPrograms = vi.fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)

    const oldRefresh = useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    const newRefresh = useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    second.resolve([{ id: 'new', name: 'New Pattern' }])
    await newRefresh
    first.resolve([{ id: 'old', name: 'Old Pattern' }])
    await oldRefresh

    expect(useControllerPanelStore.getState().programsByController['192.168.8.224'])
      .toEqual([{ id: 'new', name: 'New Pattern' }])
  })

  it('activates a saved program persistently and reseeds its controls from the confirming poll', async () => {
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    await useControllerPanelStore.getState().poll()
    useControllerPanelStore.setState({ sequencerMode: 1, runSequencer: true })
    useControllerPanelStore.getState().setControl('sliderSpeed', 0.8)

    await useControllerPanelStore.getState().activateProgram('abc')

    expect(provider.activeProgramWrites).toEqual([{ programId: 'abc', save: true }])
    expect(useControllerPanelStore.getState().activeProgramId).toBe('abc')
    expect(useControllerPanelStore.getState().activeControls).toEqual({ sliderHue: 0.1 })
    expect(useControllerPanelStore.getState()).toMatchObject({
      sequencerMode: 1,
      runSequencer: true,
    })
  })

  it('rejects activation when the confirming config read fails', async () => {
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    })
    provider.getConfig = () => Promise.reject(new Error('config unavailable'))

    await expect(useControllerPanelStore.getState().activateProgram('abc')).rejects.toThrow(
      'Could not confirm Controller Pattern activation',
    )
    expect(provider.activeProgramWrites).toEqual([{ programId: 'abc', save: true }])
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    })
  })

  it('keeps one activation locked while the panel unmounts and the device write is unresolved', async () => {
    const write = deferred<void>()
    provider.setActiveProgram = (programId, opts = {}) => {
      provider.activeProgramWrites.push({ programId, save: opts.save ?? true })
      return write.promise.then(() => {
        provider.config = { activeProgramId: programId }
      })
    }

    const first = useControllerPanelStore.getState().activateProgram('abc')
    await Promise.resolve()
    expect(useControllerPanelStore.getState().activatingProgramId).toBe('abc')

    useControllerPanelStore.getState().stop()
    await expect(useControllerPanelStore.getState().activateProgram('def')).rejects.toThrow(
      'A Controller Pattern switch is already in progress',
    )
    expect(provider.activeProgramWrites).toEqual([{ programId: 'abc', save: true }])

    write.resolve()
    await expect(first).rejects.toThrow(
      'Controller session changed before Pattern activation could be confirmed',
    )
    expect(useControllerPanelStore.getState().activatingProgramId).toBeNull()
  })

  it('rejects activation and publishes device truth when the requested program is not active', async () => {
    provider.setActiveProgram = (programId, opts = {}) => {
      provider.activeProgramWrites.push({ programId, save: opts.save ?? true })
      return Promise.resolve()
    }
    provider.config = {
      brightness: 0.5,
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.8 },
    })

    await expect(useControllerPanelStore.getState().activateProgram('abc')).rejects.toThrow(
      'Controller did not activate Pattern abc',
    )
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.8 },
    })
  })

  it('rejects a late activation confirmation without overwriting the replacement Controller', async () => {
    useControllerPanelStore.setState({
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    })
    const confirmation = deferred<ControllerConfig>()
    provider.getConfig = () => confirmation.promise
    const activation = useControllerPanelStore.getState().activateProgram('abc')
    await Promise.resolve()
    const replacement = new FakeProvider()
    replacement.config = {
      activeProgramId: 'replacement-program',
      activeControls: { sliderReplacement: 0.6 },
    }
    setControllerProvider(replacement)
    useControllerPanelStore.getState().seed('replacement-controller')
    await flush()

    confirmation.resolve({ activeProgramId: 'abc', activeControls: { sliderHue: 0.1 } })

    await expect(activation).rejects.toThrow('Controller session changed')
    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'replacement-program',
      activeControls: { sliderReplacement: 0.6 },
    })
  })

  it('does not let a poll started before activation overwrite its confirmed program', async () => {
    provider.config = {
      activeProgramId: 'def',
      activeControls: { sliderSpeed: 0.3 },
    }
    const oldTelemetry = deferred<ControllerTelemetry>()
    provider.getTelemetry = () => oldTelemetry.promise
    const oldPoll = useControllerPanelStore.getState().poll()
    await Promise.resolve()

    await useControllerPanelStore.getState().activateProgram('abc')
    oldTelemetry.resolve({ fps: 30 })
    await oldPoll

    expect(useControllerPanelStore.getState()).toMatchObject({
      activeProgramId: 'abc',
      activeControls: { sliderHue: 0.1 },
    })
  })

  it('deletes a saved program and refreshes the inventory from the Controller', async () => {
    await useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    const callsBeforeDelete = provider.listProgramsCalls

    await useControllerPanelStore.getState().deleteProgram('abc')

    expect(provider.deletedProgramIds).toEqual(['abc'])
    expect(provider.listProgramsCalls).toBe(callsBeforeDelete + 2)
    expect(useControllerPanelStore.getState().programs).toEqual([{ id: 'def', name: 'Nebula' }])
  })

  it('rejects deletion and preserves the last inventory when refresh fails', async () => {
    await useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    const before = useControllerPanelStore.getState().programs
    provider.listPrograms = () => Promise.reject(new Error('inventory unavailable'))

    await expect(useControllerPanelStore.getState().deleteProgram('abc')).rejects.toThrow(
      'Could not read Controller inventory before deletion',
    )
    expect(provider.deletedProgramIds).toEqual([])
    expect(useControllerPanelStore.getState().programs).toEqual(before)
  })

  it('rejects deletion and preserves the last inventory when post-delete confirmation fails', async () => {
    await useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    const before = useControllerPanelStore.getState().programs
    let reads = 0
    provider.listPrograms = () => {
      reads += 1
      return reads === 1
        ? Promise.resolve([...provider.programs])
        : Promise.reject(new Error('confirmation unavailable'))
    }

    await expect(useControllerPanelStore.getState().deleteProgram('abc')).rejects.toThrow(
      'Could not confirm Controller Pattern deletion',
    )
    expect(provider.deletedProgramIds).toEqual(['abc'])
    expect(useControllerPanelStore.getState().programs).toEqual(before)
  })

  it('treats a target already absent from fresh device truth as an idempotent success', async () => {
    provider.programs = [{ id: 'def', name: 'Nebula' }]

    await expect(useControllerPanelStore.getState().deleteProgram('abc')).resolves.toBeUndefined()

    expect(provider.deletedProgramIds).toEqual([])
    expect(useControllerPanelStore.getState().programs).toEqual([{ id: 'def', name: 'Nebula' }])
  })

  it('rejects deletion when the refreshed inventory still contains the target', async () => {
    await useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    provider.deleteProgram = (programId) => {
      provider.deletedProgramIds.push(programId)
      return Promise.resolve()
    }

    await expect(useControllerPanelStore.getState().deleteProgram('abc')).rejects.toThrow(
      'Controller still reports Pattern abc',
    )
    expect(useControllerPanelStore.getState().programs).toContainEqual({ id: 'abc', name: 'Aurora' })
  })

  it('rejects deletion when the target disappears with an unrelated program', async () => {
    await useControllerPanelStore.getState().refreshPrograms('192.168.8.224')
    provider.deleteProgram = (programId) => {
      provider.deletedProgramIds.push(programId)
      provider.programs = []
      return Promise.resolve()
    }

    await expect(useControllerPanelStore.getState().deleteProgram('abc')).rejects.toThrow(
      'also removed unrelated Pattern def',
    )
    expect(useControllerPanelStore.getState().programs).toEqual([])
  })

  it('rejects a late deletion confirmation from a replaced provider without publishing it', async () => {
    const inventory = deferred<ProgramListEntry[]>()
    useControllerPanelStore.setState({ programs: [...provider.programs] })
    provider.listPrograms = () => inventory.promise
    const deletion = useControllerPanelStore.getState().deleteProgram('abc')
    await Promise.resolve()
    setControllerProvider(new FakeProvider())

    inventory.resolve([{ id: 'def', name: 'Nebula' }])

    await expect(deletion).rejects.toThrow('Controller session changed')
    expect(useControllerPanelStore.getState().programs).toContainEqual({ id: 'abc', name: 'Aurora' })
  })

  it('keeps the last sequencer state when a later config poll omits the fields', async () => {
    provider.config = {
      ...provider.config,
      sequencerMode: 2,
      runSequencer: true,
    }
    await useControllerPanelStore.getState().poll()
    expect(useControllerPanelStore.getState()).toMatchObject({
      sequencerMode: 2,
      runSequencer: true,
    })

    provider.config = { brightness: 0.5, activeProgramId: 'def' }
    await useControllerPanelStore.getState().poll()
    expect(useControllerPanelStore.getState()).toMatchObject({
      sequencerMode: 2,
      runSequencer: true,
    })
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

  it('counts only vars polls for limiter smoothing and retains history across a reopen', async () => {
    provider.vars = {
      __px_powerDutyRecent: 0.5,
      __px_powerLimit: 0.35,
      __px_powerClipping: 1,
    }
    useControllerPanelStore.getState().start('limiter-ip')
    await flush()
    expect(useControllerPanelStore.getState().limitingSmoothing).toMatchObject({
      samples: [true],
      active: true,
    })

    provider.vars = { ...provider.vars, __px_powerClipping: 0 }
    await useControllerPanelStore.getState().poll()
    expect(useControllerPanelStore.getState().limitingSmoothing).toMatchObject({
      samples: [true, false],
      active: true,
    })

    useControllerPanelStore.getState().setPowerLimit(0.2)
    expect(useControllerPanelStore.getState().limitingSmoothing).toMatchObject({
      samples: [true, false],
      active: true,
    })

    useControllerPanelStore.getState().stop()
    useControllerPanelStore.getState().start('limiter-ip')
    expect(useControllerPanelStore.getState().limitingSmoothing?.active).toBe(true)
    await flush()
    expect(useControllerPanelStore.getState().limitingSmoothing).toMatchObject({
      samples: [true, false, false],
      active: false,
    })
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
      sequencerMode: 1,
      runSequencer: true,
    }
    a.telemetry = { fps: 24 }
    a.programs = [{ id: 'a-program', name: 'A Pattern' }]
    b.config = {
      brightness: 0.8,
      activeProgramId: 'b-program',
      activeControls: { sliderB: 0.2 },
      pixelCount: 64,
      sequencerMode: 2,
      runSequencer: false,
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
      sequencerMode: 1,
      runSequencer: true,
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
