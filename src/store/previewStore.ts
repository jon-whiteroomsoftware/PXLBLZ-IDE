import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export interface GridConfig {
  rows: number
  cols: number
  spacing: number
  diffusion: number
}

interface PreviewState {
  isRunning: boolean
  speed: number
  brightness: number
  grid: GridConfig
  watchedBuiltins: string[]
  watchedPatternVars: string[]
  watchValues: Record<string, unknown>
  toggle: () => void
  setSpeed: (speed: number) => void
  setBrightness: (brightness: number) => void
  setGrid: (partial: Partial<GridConfig>) => void
  setWatchedBuiltins: (vars: string[]) => void
  setWatchedPatternVars: (vars: string[]) => void
  setWatchValues: (values: Record<string, unknown>) => void
}

export const previewInitialState = {
  isRunning: true,
  speed: 1,
  brightness: 1,
  grid: {
    rows: 32,
    cols: 32,
    spacing: 20,
    diffusion: 0.5,
  },
  watchedBuiltins: ['elapsed', 'pixelCount'] as string[],
  watchedPatternVars: [] as string[],
  watchValues: {} as Record<string, unknown>,
}

// Deep-merge persisted state over the live state so a persisted `grid` that
// predates a newly-added field (e.g. `diffusion`) falls back to its default
// instead of arriving as `undefined`. The default shallow merge would replace
// the whole grid object, dropping any key the saved blob never had.
export function mergePersistedPreview(persisted: unknown, current: PreviewState): PreviewState {
  const p = (persisted ?? {}) as Partial<Pick<PreviewState, 'brightness' | 'speed' | 'grid'>>
  return {
    ...current,
    ...p,
    grid: { ...current.grid, ...(p.grid ?? {}) },
  }
}

export const usePreviewStore = create<PreviewState>()(
  persist(
    (set) => ({
      ...previewInitialState,
      toggle: () => set((s) => ({ isRunning: !s.isRunning })),
      setSpeed: (speed) => set({ speed }),
      setBrightness: (brightness) => set({ brightness }),
      setGrid: (partial) => set((s) => ({ grid: { ...s.grid, ...partial } })),
      setWatchedBuiltins: (watchedBuiltins) => set({ watchedBuiltins }),
      setWatchedPatternVars: (watchedPatternVars) => set({ watchedPatternVars }),
      setWatchValues: (watchValues) => set({ watchValues }),
    }),
    {
      name: 'pixelblaze-preview',
      partialize: (s) => ({ brightness: s.brightness, speed: s.speed, grid: s.grid }),
      merge: mergePersistedPreview,
    }
  )
)
