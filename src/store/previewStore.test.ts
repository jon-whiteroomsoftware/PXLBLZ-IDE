// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { usePreviewStore, previewInitialState, mergePersistedPreview } from './previewStore'
import { usePatternStore, patternInitialState } from './patternStore'
import { useEditorStore, editorInitialState } from './editorStore'
import {
  useControllerStore,
  controllerInitialState,
  __resetControllerProviders,
} from './controllerStore'
import { defaultControllerProfile } from './controllerProfileStore'
import { seedActiveSettings, writeCascadedOverride } from './settingsCascade'
import {
  NullControllerProvider,
  type ControllerStatus,
  type ControllerTarget,
} from '@/engine/ControllerProvider'
import {
  resetControllerProvider,
  setControllerProviderFactory,
} from '@/engine/controllerProviderRegistry'
import {
  demoPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import { resetControllerMetadataStorage } from '@/engine/controllerMetadataStorage'
import { bundle } from '@/engine/bundle'
import { stampArtifact } from '@/engine/artifactStamp'
import { buildPatternEpeExport } from '@/engine/patternEpeExport'
import { parseEpe } from '@/engine/epeImport'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
})

describe('cascaded live slowMo and dreamy state', () => {
  it('defaults to 0, clamps to [0, 1], and updates independently', () => {
    expect(usePreviewStore.getState().slowMo).toBe(0)
    expect(usePreviewStore.getState().dreamy).toBe(0)
    usePreviewStore.getState().setSlowMo(0.5)
    expect(usePreviewStore.getState().slowMo).toBe(0.5)
    expect(usePreviewStore.getState().dreamy).toBe(0)
    usePreviewStore.getState().setDreamy(0.7)
    expect(usePreviewStore.getState().slowMo).toBe(0.5)
    expect(usePreviewStore.getState().dreamy).toBe(0.7)
    usePreviewStore.getState().setSlowMo(-1)
    usePreviewStore.getState().setDreamy(2)
    expect(usePreviewStore.getState().slowMo).toBe(0)
    expect(usePreviewStore.getState().dreamy).toBe(1)
    usePreviewStore.getState().setSlowMo(Number.NaN)
    usePreviewStore.getState().setDreamy(Number.POSITIVE_INFINITY)
    expect(usePreviewStore.getState().slowMo).toBe(0)
    expect(usePreviewStore.getState().dreamy).toBe(0)
  })

  it('drops stale slowMo, dreamy, and slowMoDraft hydration while preserving live values and persisted preferences', async () => {
    usePreviewStore.getState().setSlowMo(0.4)
    usePreviewStore.getState().setDreamy(0.6)
    const saved = JSON.parse(localStorage.getItem('pixelblaze-preview')!)
    expect(saved.state).toEqual({ fidelity: 'fast', lightSizeSticky: 0.5, diffusionSticky: 0.5 })
    localStorage.setItem('pixelblaze-preview', JSON.stringify({
      ...saved,
      state: { ...saved.state, slowMo: 0.9, dreamy: 0.8, slowMoDraft: { position: 0.25, dreamy: 0.5 } },
    }))
    await usePreviewStore.persist.rehydrate()
    expect(usePreviewStore.getState().slowMo).toBe(0.4)
    expect(usePreviewStore.getState().dreamy).toBe(0.6)
  })
})

describe('transient slow-mo decline', () => {
  it('replaces, drops stale persistence, preserves live values, and resets', async () => {
    const live = { reason: 'shadowed-builtin' as const, message: 'Shadowed builtin refused.' }
    const store = usePreviewStore.getState()
    store.setSlowMoDeclined({ reason: 'no-renderer', message: 'No renderer.' })
    store.setSlowMoDeclined(live)
    store.setSlowMo(0.5)
    const merged = mergePersistedPreview({ slowMo: 0.9, dreamy: 0.8, slowMoArtifact: { code: 'stale' }, slowMoDeclined: { reason: 'stale' } }, usePreviewStore.getState())
    expect(merged.slowMoDeclined).toEqual(live)
    expect(merged).not.toHaveProperty('slowMoArtifact')
    expect(merged.slowMo).toBe(0.5)
    expect(merged.dreamy).toBe(0)
    const saved = localStorage.getItem('pixelblaze-preview')!
    expect(JSON.parse(saved).state).toEqual({ fidelity: 'fast', lightSizeSticky: 0.5, diffusionSticky: 0.5 })
    store.setSlowMoDeclined(null)
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    usePreviewStore.setState(previewInitialState)
    localStorage.setItem('pixelblaze-preview', saved)
    await usePreviewStore.persist.rehydrate()
    expect(usePreviewStore.getState().slowMoDeclined).toBeNull()
    expect(usePreviewStore.getState().slowMo).toBe(0)
    expect(usePreviewStore.getState().dreamy).toBe(0)
  })
})

describe('previewStore', () => {
  it('starts running', () => {
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggle flips running state', () => {
    usePreviewStore.getState().toggle()
    expect(usePreviewStore.getState().isRunning).toBe(false)
    usePreviewStore.getState().toggle()
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('has default brightness of 1', () => {
    expect(usePreviewStore.getState().brightness).toBe(1)
  })

  it('setBrightness updates brightness', () => {
    usePreviewStore.getState().setBrightness(0.5)
    expect(usePreviewStore.getState().brightness).toBe(0.5)
  })

  it('holds no preview-wide grid (retired with map-authoritative aspect)', () => {
    expect('grid' in usePreviewStore.getState()).toBe(false)
    expect('setGrid' in usePreviewStore.getState()).toBe(false)
  })

  it('defaults light size to 0.5 and diffusion to 0.5 (preview viewport prefs)', () => {
    const s = usePreviewStore.getState()
    expect(s.lightSize).toBe(0.5)
    expect(s.diffusion).toBe(0.5)
  })

  it('does not watch pattern variables by default (all-or-nothing, collapsed)', () => {
    expect(usePreviewStore.getState().watchPatternVars).toBe(false)
  })

  it('setWatchPatternVars toggles the all-or-nothing watch', () => {
    usePreviewStore.getState().setWatchPatternVars(true)
    expect(usePreviewStore.getState().watchPatternVars).toBe(true)
    usePreviewStore.getState().setWatchPatternVars(false)
    expect(usePreviewStore.getState().watchPatternVars).toBe(false)
  })

  it('setElapsed updates the elapsed telemetry', () => {
    usePreviewStore.getState().setElapsed(1234)
    expect(usePreviewStore.getState().elapsed).toBe(1234)
  })

  it('setWatchValues updates watch values', () => {
    usePreviewStore.getState().setWatchValues({ delta: 16.7, t: 0.42 })
    expect(usePreviewStore.getState().watchValues).toEqual({ delta: 16.7, t: 0.42 })
  })

})

describe('mergePersistedPreview', () => {
  it('drops stale slow-mo and dreamy settings while preserving the current live values', () => {
    const persisted = { slowMo: 0.5, dreamy: 0.4 }
    const current = usePreviewStore.getState()
    expect(mergePersistedPreview(persisted, current).slowMo).toBe(0)
    expect(mergePersistedPreview(persisted, current).dreamy).toBe(0)

    const live = { ...current, slowMo: 0.8, dreamy: 0.9 }
    const merged = mergePersistedPreview(persisted, live)
    expect(merged.slowMo).toBe(0.8)
    expect(merged.dreamy).toBe(0.9)
    expect(persisted).toEqual({ slowMo: 0.5, dreamy: 0.4 })
  })

  it('drops a legacy persisted grid without crashing or landing it on state', () => {
    const current = usePreviewStore.getState()
    const persisted = { grid: { rows: 8, cols: 8, spacing: 20 } }
    const merged = mergePersistedPreview(persisted, current)
    expect('grid' in merged).toBe(false)
  })

  it('drops legacy per-pattern fields (brightness/speed) from the persisted blob', () => {
    const current = usePreviewStore.getState()
    const persisted = { brightness: 0.3, speed: 4 }
    const merged = mergePersistedPreview(persisted, current)
    // Brightness resolves per Pattern; retired speed must never reappear.
    expect(merged.brightness).toBe(previewInitialState.brightness)
    expect(merged).not.toHaveProperty('speed')
  })

  it('migrates a pre-cascade blob: legacy live lightSize/diffusion lift to the sticky baselines', () => {
    const current = usePreviewStore.getState()
    const persisted = { lightSize: 0.7, diffusion: 0.6 }
    const merged = mergePersistedPreview(persisted, current)
    expect(merged.lightSizeSticky).toBe(0.7)
    expect(merged.diffusionSticky).toBe(0.6)
  })

  it('migrates a legacy grid.diffusion blob: it lifts to the diffusion baseline', () => {
    const current = usePreviewStore.getState()
    const persisted = { grid: { rows: 16, cols: 16, spacing: 20, diffusion: 0.6 } }
    const merged = mergePersistedPreview(persisted, current)
    expect(merged.diffusionSticky).toBe(0.6)
    expect('grid' in merged).toBe(false)
  })

  it('prefers a persisted diffusionSticky over the legacy live diffusion and grid.diffusion', () => {
    const current = usePreviewStore.getState()
    const persisted = { diffusionSticky: 0.2, diffusion: 0.5, grid: { diffusion: 0.6 } }
    expect(mergePersistedPreview(persisted, current).diffusionSticky).toBe(0.2)
  })

  it('persists fidelity across the blob', () => {
    const current = usePreviewStore.getState()
    expect(mergePersistedPreview({ fidelity: 'fidelity' }, current).fidelity).toBe('fidelity')
  })

  it('defaults the sticky baselines when absent from a pre-feature blob', () => {
    const current = usePreviewStore.getState()
    const merged = mergePersistedPreview({}, current)
    expect(merged.lightSizeSticky).toBe(previewInitialState.lightSizeSticky)
    expect(merged.diffusionSticky).toBe(previewInitialState.diffusionSticky)
  })

  it('clamps a migrated lightSize baseline to the 0.15–0.95 range', () => {
    const current = usePreviewStore.getState()
    expect(mergePersistedPreview({ lightSizeSticky: 0.7 }, current).lightSizeSticky).toBe(0.7)
    expect(mergePersistedPreview({ lightSizeSticky: 99 }, current).lightSizeSticky).toBe(0.95)
    expect(mergePersistedPreview({ lightSizeSticky: 0 }, current).lightSizeSticky).toBe(0.15)
  })
})

describe('live slow-mo and dreamy defaults', () => {
  it('defaults to zero slow-mo and zero dreamy', () => {
    expect(usePreviewStore.getState().slowMo).toBe(0)
    expect(usePreviewStore.getState().dreamy).toBe(0)
  })

  it('replaces the whole setting and restores defaults without changing other preview settings', () => {
    const preserved = {
      fidelity: 'fidelity' as const,
      lightSizeSticky: 0.7,
      diffusionSticky: 0.3,
    }
    usePreviewStore.setState(preserved)
    for (const [slowMo, dreamy] of [[0.5, 0], [1, 1], [0, 0]] as const) {
      usePreviewStore.getState().setSlowMo(slowMo)
      usePreviewStore.getState().setDreamy(dreamy)
      expect(usePreviewStore.getState().slowMo).toBe(slowMo)
      expect(usePreviewStore.getState().dreamy).toBe(dreamy)
      expect(usePreviewStore.getState()).toMatchObject(preserved)
    }
  })

  it('persists only global preferences and rehydrates with slow-mo defaults', async () => {
    const preferences = {
      fidelity: 'fidelity' as const,
      lightSizeSticky: 0.7,
      diffusionSticky: 0.3,
    }
    usePreviewStore.setState(preferences)
    usePreviewStore.getState().setSlowMo(0.5)
    usePreviewStore.getState().setDreamy(0.4)
    const saved = localStorage.getItem('pixelblaze-preview')!
    expect(JSON.parse(saved).state).toEqual(preferences)

    usePreviewStore.setState(previewInitialState)
    localStorage.setItem('pixelblaze-preview', saved)
    await usePreviewStore.persist.rehydrate()
    expect(usePreviewStore.getState().slowMo).toBe(0)
    expect(usePreviewStore.getState().dreamy).toBe(0)
    expect(usePreviewStore.getState()).toMatchObject(preferences)
  })
})

describe('I17: Controller artifact and .epe export isolation from preview slow-mo', () => {
  afterEach(() => {
    __resetControllerProviders()
    resetControllerProvider()
    resetPersonalContentProvider()
    resetControllerMetadataStorage()
    useControllerStore.setState(controllerInitialState)
    usePatternStore.setState(patternInitialState)
    useEditorStore.setState(editorInitialState)
  })

  it('pushes identical compiled source via pushActivePattern and exports identical .epe across stored slowMo/dreamy overrides', async () => {
    const pushedSources: string[] = []
    const reconcilingBytecode = (() => {
      const bytes = new Uint8Array(16)
      new DataView(bytes.buffer).setUint32(0, 8, true)
      return bytes
    })()
    class CapturingProvider extends NullControllerProvider {
      readonly capabilities = { push: true, compile: true }
      status: ControllerStatus = { kind: 'extension-present' }
      subs = new Set<(s: ControllerStatus) => void>()
      detectHelper() { return Promise.resolve('ready' as const) }
      getStatus() { return this.status }
      subscribe(listener: (s: ControllerStatus) => void) {
        this.subs.add(listener)
        return () => this.subs.delete(listener)
      }
      connect(target: ControllerTarget) {
        this.status = {
          kind: 'connected',
          connectionGeneration: 1,
          controller: { id: 'ctrl-iso', address: target.address, deviceId: 'ctrl-iso', name: 'Bench' },
        }
        this.subs.forEach(l => l(this.status))
        return Promise.resolve()
      }
      getConfig() { return Promise.resolve({ name: 'Bench', pixelCount: 100 }) }
      getPixelMap() { return Promise.resolve([[0, 0], [1, 1]]) }
      getPixelMapData() { return Promise.resolve(null) }
      getActiveProgramBytecodeSize() { return Promise.resolve(0) }
      listPrograms() { return Promise.resolve([]) }
      compile(source: string) {
        pushedSources.push(source)
        return Promise.resolve(reconcilingBytecode)
      }
      pushBytecode() {
        return Promise.resolve()
      }
    }

    const profile = {
      ...defaultControllerProfile({ id: 'slowmo-isolation', now: 1 }),
      deviceId: 'ctrl-iso',
      lastSeenIp: '192.0.2.10',
      lastKnownPixelCount: 100,
      globalTransforms: [{
        id: 'power-cap',
        type: 'power-cap' as const,
        enabled: true,
        mixinId: 'builtin:power-cap',
        mode: 'derived' as const,
        maxDuty: 0.42,
        provenance: { targetAmps: 2.5, brightness: 1, milliampsPerPixel: 60 },
      }],
    }
    const source = 'export function render(index) { rgb(0.8, 0.4, 0.2) }'
    const patternId = 'pat-slowmo-iso'
    const storedRecords = new Map([
      [patternId, { id: patternId, name: 'SlowMo Isolation', src: source, controls: {}, updatedAt: 1 }],
    ])
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      listPatterns: async () => [...storedRecords.values()],
      updatePattern: async (id, changes) => {
        const cur = storedRecords.get(id)
        if (cur) storedRecords.set(id, { ...cur, ...changes })
      },
      listControllerProfiles: async () => [profile],
    })
    setControllerProviderFactory(() => new CapturingProvider())
    useControllerStore.setState(controllerInitialState)
    await useControllerStore.getState().addController('192.0.2.10', 'Bench')

    usePatternStore.setState({
      ...patternInitialState,
      activePatternId: patternId,
      userPatterns: [...storedRecords.values()],
      patternsLoaded: true,
    })
    useEditorStore.setState({
      ...editorInitialState,
      source,
      previewSource: source,
      previewPatternName: 'SlowMo Isolation',
    })
    seedActiveSettings()

    const exportProductionEpe = () => {
      const record = usePatternStore.getState().userPatterns.find(p => p.id === patternId)!
      const editorSource = useEditorStore.getState().source
      const bundled = bundle(editorSource, {})
      const stamped = stampArtifact(bundled.code, { kind: 'pattern', id: patternId, name: record.name })
      return buildPatternEpeExport(record.name, stamped, { idSeed: patternId })
    }

    await useControllerStore.getState().pushActivePattern()
    expect(useControllerStore.getState().pushResult?.ok).toBe(true)
    const baselinePush = pushedSources[0]
    const baselineTransform = useControllerStore.getState().lastTransformArtifacts['192.0.2.10']?.[patternId]?.summary
    const baselineEpe = exportProductionEpe()
    const baselineParsed = parseEpe(baselineEpe.text)
    expect(baselinePush).toBeTruthy()
    expect(baselineTransform?.passes.length).toBeGreaterThan(0)

    for (const [slowMo, dreamy] of [[0.5, 0], [0.5, 1], [1, 1], [0, 0]] as const) {
      usePreviewStore.getState().setSlowMo(slowMo)
      usePreviewStore.getState().setDreamy(dreamy)
      writeCascadedOverride('slowMo', slowMo)
      writeCascadedOverride('dreamy', dreamy)
      await usePatternStore.getState().updatePatternSettings(patternId, { slowMo, dreamy })
      seedActiveSettings()
      usePreviewStore.getState().setSlowMoDeclined(slowMo > 0 ? { reason: 'shadowed-builtin', message: 'Preview-only refusal.' } : null)

      const beforeCount = pushedSources.length
      await useControllerStore.getState().pushActivePattern()
      expect(useControllerStore.getState().pushResult?.ok).toBe(true)
      expect(pushedSources.length).toBe(beforeCount + 1)
      expect(pushedSources[pushedSources.length - 1]).toBe(baselinePush)
      expect(useControllerStore.getState().lastTransformArtifacts['192.0.2.10']?.[patternId]?.summary).toEqual(baselineTransform)

      const stripStamp = (s: string) => s.replace(/stamped=\S+/g, 'stamped=<ts>')
      const normalizeParsed = (parsed: ReturnType<typeof parseEpe>) => ({
        ...parsed,
        src: stripStamp(parsed.src),
        ...(parsed.stamp ? { stamp: { ...parsed.stamp, stamped: '<ts>' } } : {}),
      })
      const currentEpe = exportProductionEpe()
      expect(currentEpe.filename).toBe(baselineEpe.filename)
      expect(stripStamp(currentEpe.text)).toBe(stripStamp(baselineEpe.text))
      expect(normalizeParsed(parseEpe(currentEpe.text))).toEqual(normalizeParsed(baselineParsed))
    }
  })

  it('warns via beforeunload while a personal Pattern or stock demo settings reset is queued behind an in-flight save', async () => {
    const dispatchBeforeUnload = () => {
      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)
      return event.defaultPrevented
    }

    let releasePattern!: () => void
    let releaseDemo!: () => void
    let patternWrites = 0
    let demoWrites = 0
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updatePattern: async () => {
        patternWrites++
        if (patternWrites === 1) await new Promise<void>((resolve) => { releasePattern = resolve })
      },
      setDemoOverrides: async () => {
        demoWrites++
        if (demoWrites === 1) await new Promise<void>((resolve) => { releaseDemo = resolve })
      },
    })

    usePatternStore.setState({
      ...patternInitialState,
      activePatternId: 'p-unload',
      userPatterns: [{ id: 'p-unload', name: 'Unload', src: '', controls: {}, updatedAt: 1 }],
    })
    expect(dispatchBeforeUnload()).toBe(false)

    const p1 = usePatternStore.getState().updatePatternSettings('p-unload', { slowMo: 0.5 })
    const p2 = usePatternStore.getState().updatePatternSettings('p-unload', { slowMo: 0 })
    expect(dispatchBeforeUnload()).toBe(true)
    releasePattern()
    await Promise.all([p1, p2])
    expect(dispatchBeforeUnload()).toBe(false)

    const d1 = usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0.5 })
    const d2 = usePatternStore.getState().updateDemoSettings('KaleidoBloom', { slowMo: 0 })
    expect(dispatchBeforeUnload()).toBe(true)
    releaseDemo()
    await Promise.all([d1, d2])
    expect(dispatchBeforeUnload()).toBe(false)
  })
})

describe('lightSize', () => {
  it('defaults to 0.5', () => {
    expect(usePreviewStore.getState().lightSize).toBe(0.5)
  })

  it('setLightSize clamps to the 0.15–0.95 range', () => {
    usePreviewStore.getState().setLightSize(0.7)
    expect(usePreviewStore.getState().lightSize).toBe(0.7)
    usePreviewStore.getState().setLightSize(100)
    expect(usePreviewStore.getState().lightSize).toBe(0.95)
    usePreviewStore.getState().setLightSize(-5)
    expect(usePreviewStore.getState().lightSize).toBe(0.15)
  })
})

describe('diffusion', () => {
  it('setDiffusion clamps to the 0–1 range', () => {
    usePreviewStore.getState().setDiffusion(0.3)
    expect(usePreviewStore.getState().diffusion).toBe(0.3)
    usePreviewStore.getState().setDiffusion(2)
    expect(usePreviewStore.getState().diffusion).toBe(1)
    usePreviewStore.getState().setDiffusion(-1)
    expect(usePreviewStore.getState().diffusion).toBe(0)
  })
})

describe('global-sticky baselines', () => {
  it('default to the same values as the live working copies', () => {
    const s = usePreviewStore.getState()
    expect(s.lightSizeSticky).toBe(0.5)
    expect(s.diffusionSticky).toBe(0.5)
  })

  it('setLightSizeSticky clamps to the 0.15–0.95 range', () => {
    usePreviewStore.getState().setLightSizeSticky(100)
    expect(usePreviewStore.getState().lightSizeSticky).toBe(0.95)
  })

  it('setDiffusionSticky clamps to the 0–1 range', () => {
    usePreviewStore.getState().setDiffusionSticky(-1)
    expect(usePreviewStore.getState().diffusionSticky).toBe(0)
  })
})
