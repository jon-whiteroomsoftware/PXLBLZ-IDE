import type { Settings } from './settings'

export interface PatternRecord {
  id: string
  name: string
  src: string
  controls: Record<string, number | number[]>
  updatedAt: number
  // The active map's generator params. Not a cascaded setting (it rides with the
  // map, not the four-layer settings cascade), so it stays a flat field.
  params?: Record<string, number>
  // Sparse per-pattern settings overrides — cascade layer 1. A field absent here
  // flows from a lower cascade layer.
  settings?: Partial<Settings>
}

// A persisted user map. Serializable form of a PixelMap: a generator descriptor
// plus params, optional baked coordinates, and optional authoring source.
export interface MapRecord {
  id: string
  name: string
  dim: 1 | 2 | 3
  generator: string
  params: Record<string, number>
  // Baked coordinate array for a custom map (`generator: 'custom'`), authored
  // once and replayed index-aligned by resolve. Absent for stock generator-based
  // maps.
  points?: number[][]
  // The custom map's authoring source: plain JavaScript
  // `function(pixelCount){ … return coords }`, never the Pixelblaze dialect.
  source?: string
  // Recorded grid shape when baked points form a regular lattice.
  gridDims?: { cols: number; rows: number; depth?: number }
  updatedAt: number
}

export type MixinPassKind = 'inject' | 'intercept' | 'bind'

// A user-authored pass-engine source chunk. Parameters are declared in the
// header and bound where the mixin is used, not in the mixin itself.
export interface MixinRecord {
  id: string
  name: string
  kind: MixinPassKind
  src: string
  updatedAt: number
}

export type ShowTransitionKind = 'cut' | 'crossfade' | 'wipe' | 'dither'
export type ShowTransitionCost = 'free' | 'cheap' | 'expensive'

export interface ShowTransition {
  kind: ShowTransitionKind
  durationMs: number
}

export interface ShowScene {
  id: string
  name: string
  durationMs: number
  transitionOut?: ShowTransition
}

export interface ShowZone {
  id: string
  name: string
  nominalPixelCount: number
  color?: string
}

export interface ShowCellAdaptations {
  mirror: boolean
  phase: number
  brightness: number
  timeScale: number
}

export type ShowPatternRef =
  | { kind: 'user'; id: string }
  | { kind: 'stock'; id: string }

export interface ShowCell {
  id: string
  zoneId: string
  sceneId: string
  sceneSpan: number
  zoneSpan?: number
  pattern: ShowPatternRef
  patternName: string
  adaptations: ShowCellAdaptations
}

export interface ShowRecord {
  id: string
  name: string
  scenes: ShowScene[]
  zones: ShowZone[]
  cells: ShowCell[]
  targetControllerProfileId?: string
  updatedAt: number
}
