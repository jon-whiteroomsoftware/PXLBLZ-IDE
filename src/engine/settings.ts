// The tunable preview settings and their developer-default table (ADR-0013).
// Engine-pure: no React, no store. This is the vocabulary the per-pattern settings
// cascade resolves over (see resolveSettings.ts) and the bottom layer (layer 4) of
// that cascade.

import { DEFAULT_LIGHT_SIZE } from './camera'

// The renderer (machine/performance choice). Mirrors the previewStore type; defined
// here so the engine layer owns the Settings vocabulary without importing a store.
export type FidelityMode = 'fast' | 'fidelity'

// Every tunable preview setting. A pattern's effective settings are resolved field
// by field through the four-layer cascade; this is the complete field set and the
// shape of a fully-resolved result.
export interface Settings {
  // Per-pattern cascaded (layers 1, 2, 4 — no global-sticky).
  mapId: string
  shapeId: string
  surfaceId: string
  pixelCount: number | null
  solidity: number
  normalize: 'contain' | 'fill'
  brightness: number
  speed: number
  // Hybrid comfort prefs (all four layers).
  lightSize: number
  diffusion: number
  // Pure global (layer 3 only, never cascaded).
  fidelity: FidelityMode
}

// The developer-default table (cascade layer 4): the static fallback shipped in the
// engine, used for any field no higher layer supplies. Values mirror the stores'
// historical defaults (DEFAULT_MAP_ID 'plane', DEFAULT_SHAPE_ID 'line', etc.) so a
// pattern with no overrides previews exactly as before.
export const DEV_DEFAULTS: Settings = {
  mapId: 'plane',
  shapeId: 'line',
  surfaceId: 'flat',
  pixelCount: null,
  solidity: 1,
  normalize: 'contain',
  brightness: 1,
  speed: 1,
  lightSize: DEFAULT_LIGHT_SIZE,
  diffusion: 0.5,
  fidelity: 'fast',
}

// The field partition (ADR-0013). Each tunable field belongs to exactly one class,
// which decides how many cascade layers apply to it:
//   • CASCADED   — layers 1 (override), 2 (recommended), 4 (dev-default); NO global-sticky.
//   • HYBRID     — all four layers (a global-sticky baseline, recommendable, overridable).
//   • GLOBAL_ONLY — layer 3 only; never recommended, never per-pattern.
export const CASCADED_FIELDS = [
  'mapId',
  'shapeId',
  'surfaceId',
  'pixelCount',
  'solidity',
  'normalize',
  'brightness',
  'speed',
] as const satisfies readonly (keyof Settings)[]

export const HYBRID_FIELDS = ['lightSize', 'diffusion'] as const satisfies readonly (keyof Settings)[]

export const GLOBAL_ONLY_FIELDS = ['fidelity'] as const satisfies readonly (keyof Settings)[]

export type CascadedField = (typeof CASCADED_FIELDS)[number]
export type HybridField = (typeof HYBRID_FIELDS)[number]
export type GlobalOnlyField = (typeof GLOBAL_ONLY_FIELDS)[number]

// The user global-sticky layer (cascade layer 3): a single persisted set of values.
// Holds the comfort-pref baselines (lightSize/diffusion) plus fidelity, the only
// pure-global field. Sourced from previewStore at the resolution site.
export interface GlobalSticky {
  lightSize: number
  diffusion: number
  fidelity: FidelityMode
}
