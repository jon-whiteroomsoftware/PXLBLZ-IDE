// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest'
import { usePreviewStore, previewInitialState, mergePersistedPreview } from './previewStore'
import type { SlowMoSettings } from '../engine/slowMo'
import { controllerProfilePassRecipe } from '../engine/controllerProfilePassRecipe'
import { bundleWithPasses } from '../engine/passEngine'
import { defaultControllerProfile } from './controllerProfileStore'

const slowMoSample: SlowMoSettings = {
  rate: 0.25,
  stepMs: 16,
  inBetween: 'blend',
  stagger: { shape: 'sweep', width: 0 },
  persistence: null,
}

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
})

describe('session-only generated slow-mo artifact', () => {
  it('replaces, drops stale persistence, preserves live values, and resets', async () => {
    const live = { code: 'live', arrayWords: 120 }
    const store = usePreviewStore.getState()
    store.setSlowMoArtifact({ code: 'old', arrayWords: 0 })
    store.setSlowMoArtifact(live)
    store.setSlowMo(slowMoSample)
    const merged = mergePersistedPreview({ slowMo: null, slowMoArtifact: { code: 'stale' } }, usePreviewStore.getState())
    expect(merged.slowMoArtifact).toEqual(live)
    expect(merged.slowMo).toEqual(slowMoSample)
    const saved = localStorage.getItem('pixelblaze-preview')!
    expect(JSON.parse(saved).state).toEqual({ fidelity: 'fast', lightSizeSticky: 0.5, diffusionSticky: 0.5 })
    store.setSlowMoArtifact(null)
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
    usePreviewStore.setState(previewInitialState)
    localStorage.setItem('pixelblaze-preview', saved)
    await usePreviewStore.persist.rehydrate()
    expect(usePreviewStore.getState().slowMoArtifact).toBeNull()
    expect(usePreviewStore.getState().slowMo).toBeNull()
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

  it('has default speed of 1', () => {
    expect(usePreviewStore.getState().speed).toBe(1)
  })

  it('setSpeed updates speed', () => {
    usePreviewStore.getState().setSpeed(2)
    expect(usePreviewStore.getState().speed).toBe(2)
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
  it('drops stale slow-mo settings while preserving the current session setting', () => {
    const persisted = { slowMo: slowMoSample }
    const current = usePreviewStore.getState()
    expect(mergePersistedPreview(persisted, current).slowMo).toBeNull()

    const liveSlowMo: SlowMoSettings = { ...slowMoSample, inBetween: 'clock', rate: 1 / 16 }
    const live = { ...current, slowMo: liveSlowMo }
    expect(mergePersistedPreview(persisted, live).slowMo).toEqual(liveSlowMo)
    expect(live.slowMo).toEqual(liveSlowMo)
    expect(persisted).toEqual({ slowMo: slowMoSample })
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
    // brightness/speed are per-pattern cascaded now; the blob's stale values must
    // not land back on the live state — they stay at their initial defaults.
    expect(merged.brightness).toBe(previewInitialState.brightness)
    expect(merged.speed).toBe(previewInitialState.speed)
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

describe('session-only slow-mo', () => {
  it('defaults to Off', () => {
    expect(usePreviewStore.getState().slowMo).toBeNull()
  })

  it('replaces the whole setting and restores Off without changing other preview settings', () => {
    const preserved = {
      speed: 2,
      fidelity: 'fidelity' as const,
      lightSizeSticky: 0.7,
      diffusionSticky: 0.3,
    }
    usePreviewStore.setState(preserved)
    const eased: SlowMoSettings = {
      ...slowMoSample, rate: 1 / 16, stepMs: 32, inBetween: 'eased',
    }
    for (const slowMo of [slowMoSample, eased, null]) {
      usePreviewStore.getState().setSlowMo(slowMo)
      expect(usePreviewStore.getState().slowMo).toEqual(slowMo)
      expect(usePreviewStore.getState()).toMatchObject(preserved)
    }
  })

  it('persists only global preferences and rehydrates with slow-mo Off', async () => {
    const preferences = {
      fidelity: 'fidelity' as const,
      lightSizeSticky: 0.7,
      diffusionSticky: 0.3,
    }
    usePreviewStore.setState(preferences)
    usePreviewStore.getState().setSlowMo(slowMoSample)
    const saved = localStorage.getItem('pixelblaze-preview')!
    expect(JSON.parse(saved).state).toEqual(preferences)

    usePreviewStore.setState(previewInitialState)
    localStorage.setItem('pixelblaze-preview', saved)
    await usePreviewStore.persist.rehydrate()
    expect(usePreviewStore.getState().slowMo).toBeNull()
    expect(usePreviewStore.getState()).toMatchObject(preferences)
  })
})

describe('I17: Controller artifact isolation from preview slow-mo', () => {
  it('preserves the complete push recipe and artifact across Off, blend, clock, and reset', () => {
    const profile = {
      ...defaultControllerProfile({ id: 'slowmo-isolation', now: 1 }),
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
    const recipe = controllerProfilePassRecipe(profile, source, 'slowmo-test')
    const artifact = bundleWithPasses(source, {}, recipe)
    expect(recipe.length).toBeGreaterThan(0)
    const clock: SlowMoSettings = { ...slowMoSample, inBetween: 'clock' }
    for (const slowMo of [null, slowMoSample, clock, null]) {
      usePreviewStore.getState().setSlowMo(slowMo)
      usePreviewStore.getState().setSlowMoArtifact(slowMo ? { code: 'preview-only wrapper', arrayWords: 120 } : null)
      expect(usePreviewStore.getState().slowMo).toEqual(slowMo)
      const currentRecipe = controllerProfilePassRecipe(profile, source, 'slowmo-test')
      expect(currentRecipe).toEqual(recipe)
      const currentArtifact = bundleWithPasses(source, {}, currentRecipe)
      expect(currentArtifact.code).toBe(artifact.code)
      expect(currentArtifact.fxCode).toBe(artifact.fxCode)
      expect(currentArtifact.metadata).toEqual(artifact.metadata)
      expect(currentArtifact).toEqual(artifact)
    }
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
