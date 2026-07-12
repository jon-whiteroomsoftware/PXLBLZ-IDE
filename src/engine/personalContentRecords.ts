import type { Settings } from './settings'
import type { ShowLogicalRouting } from './showLogicalRouting'

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

export interface MapImportMetadata {
  kind: 'controller'
  controllerName: string
  deviceId?: string | null
  ip?: string | null
  mapHash?: string
  pixelCount: number
  importedAt: number
  normalization: 'device-fill-normalized'
}

// A persisted user map. Serializable form of a PixelMap: a generator descriptor
// plus params, optional baked coordinates, optional authoring source, and optional
// display-only provenance for frozen imports.
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
  // Display-only provenance for maps imported from hardware. This is not a link
  // to a controller profile; deleting or renaming the controller leaves the map.
  importMetadata?: MapImportMetadata
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

// A user-authored helper namespace. `name` is the Pixelblaze namespace used in
// pattern code (`MyLib.fn()`), so it is identifier-constrained and unique against
// stock libraries, built-ins, and the user's other libraries.
export interface LibraryRecord {
  id: string
  name: string
  src: string
  updatedAt: number
}

export type ShowTransitionKind = 'cut' | 'crossfade' | 'wipe' | 'dither' | 'portal'
export type ShowTransitionCost = 'free' | 'cheap' | 'expensive'
export type ShowPortalFeatherPolicy = 'dither' | 'blend'
export type ShowTransitionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type ShowAutomatableProperty = 'timeScale' | 'brightness'

export interface ShowPropertyTransition {
  fromByCellId: Record<string, number>
  /** Missing only on #417 records; normalization fills from the containing boundary. */
  durationMs?: number
  easing?: ShowTransitionEasing
}

export interface ShowPropertyTransitions {
  timeScale?: ShowPropertyTransition
  brightness?: ShowPropertyTransition
  /** Public Pixelblaze slider export name -> the same shared transition descriptor. */
  controls?: Record<string, ShowPropertyTransition>
}

export interface ShowPortalSettings {
  centerX: number
  centerY: number
  invert: boolean
  featherPolicy: ShowPortalFeatherPolicy
}

export interface ShowTransition {
  kind: ShowTransitionKind
  durationMs: number
  /** Normalized fraction of the 1D route used as a stable wipe feather band. */
  feather?: number
  /** Normalized Stage coordinates used by the 2D portal transition. */
  centerX?: number
  centerY?: number
  /** Grows the incoming scene from the outside toward the center. */
  invert?: boolean
  /** Stable one-renderer threshold or true bounded-band color blend. */
  featherPolicy?: ShowPortalFeatherPolicy
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

export interface ShowRoutingLayoutZone {
  zoneId: string
  ranges: Array<{ start: number; end: number }>
}

export interface ShowRoutingLayout {
  id: string
  name: string
  zones: ShowRoutingLayoutZone[]
  logical?: ShowLogicalRouting
}

export interface ShowRoutingSwitch {
  afterSceneId: string
  layoutId: string
}

/** A selectable event on the shared boundary lane. Legacy scene/routing fields are derived compatibility views. */
export interface ShowBoundaryTransition {
  id: string
  afterSceneId: string
  kind: ShowTransitionKind | 'routing'
  durationMs: number
  easing: ShowTransitionEasing
  layoutId?: string
  feather?: number
  centerX?: number
  centerY?: number
  invert?: boolean
  featherPolicy?: ShowPortalFeatherPolicy
  /** Boundary-owned interpolation settings keyed by the destination clip. */
  propertyTransitions?: ShowPropertyTransitions
}

export interface ShowCellAdaptations {
  mirror: boolean
  phase: number
  brightness: number
  timeScale: number
  lightShutter?: ShowLightShutter
  steppedClock?: ShowSteppedClock
  timeOffsetMs?: number
}

export interface ShowLightShutter {
  rateHz: number
  duty: number
  phase: number
  clockBehavior: 'continue' | 'freeze'
}

export interface ShowSteppedClock {
  stepMs: number
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
  /** How a multi-zone clip maps its Pattern domain. Defaults to one continuous span. */
  zoneMode?: 'span' | 'repeat'
  pattern: ShowPatternRef
  patternName: string
  adaptations: ShowCellAdaptations
  /** Start this destination with a fresh Pattern instance instead of continuing matching state. */
  restartOnEntry?: boolean
  /** Scene-owned 0..1 targets for public slider control functions. */
  controlTargets?: Record<string, number>
}

export interface ShowRecord {
  id: string
  name: string
  scenes: ShowScene[]
  zones: ShowZone[]
  cells: ShowCell[]
  routingLayouts: ShowRoutingLayout[]
  routingSwitches: ShowRoutingSwitch[]
  /** Canonical transition-lane entities. Missing only on legacy records awaiting normalization. */
  transitions?: ShowBoundaryTransition[]
  targetControllerProfileId?: string
  stageMapId?: string | null
  updatedAt: number
}
