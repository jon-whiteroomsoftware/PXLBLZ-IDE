import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { DEFAULT_LIGHT_SIZE } from '../engine/camera'

export type FidelityMode = 'fidelity' | 'fast'

interface PreviewState {
  isRunning: boolean
  speed: number
  brightness: number
  // Preview light size: the drawn diameter of each light source as a
  // fraction of the inter-dot pitch (diameter = pitch × lightSize). Grows the
  // sources in place — never moves dots or resizes the canvas. A preview-only
  // viewing-comfort pref; never written to a map/controller. A HYBRID cascade field
  //: this live value is the working copy seeded from the resolver on open;
  // its global baseline lives in `lightSizeSticky` below.
  lightSize: number
  // Diffusion: a blur that merges the light sources. A sibling
  // viewport pref alongside lightSize — deliberately NOT inside `grid`, so no
  // preview construct lives in anything that could serialize toward a map. Hard
  // invariants: it never changes source size, and it never dims the field. Hybrid
  // cascade field; baseline in `diffusionSticky`.
  diffusion: number
  // The user global-sticky baselines (cascade layer 3) for the hybrid
  // comfort prefs: a single persisted value the user sets once that applies to any
  // pattern without its own recommendation or override. Distinct from the live
  // `lightSize`/`diffusion` working copies above, which the resolver seeds per open.
  lightSizeSticky: number
  diffusionSticky: number
  fidelity: FidelityMode
  // All-or-nothing pattern-variable watch (#150): when on, the readout shows every
  // exported pattern variable; when off, none. Replaces the per-variable + sensor-
  // builtin checkbox model. Transient session state — not persisted.
  watchPatternVars: boolean
  watchValues: Record<string, unknown>
  fps: number | null
  // Pattern elapsed time (ms), updated every frame so the readout's `elapsed` cell
  // is unconditional (#150). null while paused/not yet measured. Never persisted.
  elapsed: number | null
  toggle: () => void
  setFps: (fps: number | null) => void
  setElapsed: (elapsed: number | null) => void
  setFidelity: (fidelity: FidelityMode) => void
  setSpeed: (speed: number) => void
  setBrightness: (brightness: number) => void
  setLightSize: (lightSize: number) => void
  setDiffusion: (diffusion: number) => void
  setLightSizeSticky: (lightSize: number) => void
  setDiffusionSticky: (diffusion: number) => void
  setWatchPatternVars: (on: boolean) => void
  setWatchValues: (values: Record<string, unknown>) => void
}

export const previewInitialState = {
  isRunning: true,
  speed: 1,
  brightness: 1,
  lightSize: DEFAULT_LIGHT_SIZE,
  diffusion: 0.5,
  lightSizeSticky: DEFAULT_LIGHT_SIZE,
  diffusionSticky: 0.5,
  // The Fast renderer (float64) is the default on first load: it's the smoother,
  // good-enough preview. The Precise renderer (16.16 fixed-point) is an opt-in
  // for checking hardware-accurate behaviour — and even it isn't bit-exact
  // without the device. The pure-global cascade field: persisted in the
  // localStorage blob, never recommended, never per-pattern.
  fidelity: 'fast' as FidelityMode,
  watchPatternVars: false,
  watchValues: {} as Record<string, unknown>,
  // Smoothed frames-per-second readout; null while paused/not yet measured.
  // Transient session state — never persisted.
  fps: null as number | null,
  // Pattern elapsed time (ms); null while paused/not yet measured. Never persisted.
  elapsed: null as number | null,
}

// Light size sweeps f: 0.15 (clearly separated) → 0.95 (almost touching), with
// 0.5 the default. Clamp so a stale or fat-fingered value can neither
// collapse sources to a point nor balloon them past touching.
export const MIN_LIGHT_SIZE = 0.15
export const MAX_LIGHT_SIZE = 0.95
function clampLightSize(f: number): number {
  if (!Number.isFinite(f)) return DEFAULT_LIGHT_SIZE
  return Math.max(MIN_LIGHT_SIZE, Math.min(MAX_LIGHT_SIZE, f))
}

// Diffusion sweeps 0 (crisp/distinct sources) → 1 (opaque merged field).
function clampDiffusion(d: number): number {
  if (!Number.isFinite(d)) return 0
  return Math.max(0, Math.min(1, d))
}

// Merge persisted state over the live state. Only true global prefs are persisted
// now: `fidelity` plus the hybrid global-sticky baselines. The live
// `brightness`/`speed` are per-pattern cascaded (seeded by the resolver on open), so
// they are NOT persisted; a legacy blob's `brightness`/`speed`/`grid` are explicitly
// destructured OUT and dropped — they can never land back on state.
//
// Migration: a pre-cascade blob persisted the live `lightSize`/`diffusion`. Lift those
// into the new global-sticky baselines so a returning user keeps their dialled-in
// comfort prefs as the global baseline (`grid.diffusion` is the even older home,
// still honoured as a fallback). The live working copies stay at their
// initial defaults until the resolver seeds them per pattern.
export function mergePersistedPreview(persisted: unknown, current: PreviewState): PreviewState {
  const raw = (persisted ?? {}) as Partial<
    Pick<PreviewState, 'fidelity' | 'lightSizeSticky' | 'diffusionSticky' | 'lightSize' | 'diffusion'>
  > & { grid?: { diffusion?: number }; brightness?: number; speed?: number }
  const { grid: legacyGrid, brightness: _b, speed: _s, lightSize, diffusion, ...p } = raw
  return {
    ...current,
    ...p,
    lightSizeSticky: clampLightSize(p.lightSizeSticky ?? lightSize ?? current.lightSizeSticky),
    diffusionSticky: clampDiffusion(
      p.diffusionSticky ?? diffusion ?? legacyGrid?.diffusion ?? current.diffusionSticky,
    ),
  }
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      ...previewInitialState,
      toggle: () => set((s) => ({ isRunning: !s.isRunning })),
      setFps: (fps) => set({ fps }),
      setElapsed: (elapsed) => set({ elapsed }),
      setFidelity: (fidelity) => set({ fidelity }),
      setSpeed: (speed) => set({ speed }),
      setBrightness: (brightness) => set({ brightness }),
      setLightSize: (lightSize) => set({ lightSize: clampLightSize(lightSize) }),
      setDiffusion: (diffusion) => set({ diffusion: clampDiffusion(diffusion) }),
      setLightSizeSticky: (lightSize) => set({ lightSizeSticky: clampLightSize(lightSize) }),
      setDiffusionSticky: (diffusion) => set({ diffusionSticky: clampDiffusion(diffusion) }),
      setWatchPatternVars: (watchPatternVars) => set({ watchPatternVars }),
      setWatchValues: (watchValues) => set({ watchValues }),
    }),
    {
      name: 'pixelblaze-preview',
      // Only true GLOBAL prefs ride in localStorage now: the renderer
      // choice `fidelity` and the hybrid global-sticky baselines. Per-pattern
      // cascaded fields (brightness/speed) and the live hybrid working copies
      // (lightSize/diffusion) are NOT persisted here — they live on the
      // PatternRecord's sparse overrides and are seeded by the resolver on open.
      partialize: (s) => ({
        fidelity: s.fidelity,
        lightSizeSticky: s.lightSizeSticky,
        diffusionSticky: s.diffusionSticky,
      }),
      merge: mergePersistedPreview,
    }
  )
)
