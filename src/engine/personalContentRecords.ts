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

export type ShowTransitionKind = 'cut' | 'crossfade' | 'fade-color' | 'wipe' | 'dither' | 'portal' | 'motion'
export type ShowTransitionCost = 'free' | 'cheap' | 'expensive'
export type ShowPortalFeatherPolicy = 'dither' | 'blend'
export type ShowTransitionEdgePolicy = 'hard' | 'dither' | 'blend'
export type ShowDissolveVariant = 'pixel' | 'block'
export type ShowSpatialShape = 'circle' | 'box' | 'diamond' | 'ring'
export type ShowRevealMode = 'grow-incoming' | 'shrink-outgoing'
export type ShowMotionTransitionVariant = 'cover' | 'reveal' | 'push' | 'content-grow' | 'content-shrink'
export type ShowMotionAddressPolicy = 'clip' | 'wrap'
export type LegacyShowTransitionEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type ShowEasingDirection = 'in' | 'out' | 'in-out'
export type ShowStructuredEasing =
  | { curve: 'linear' }
  | { curve: 'quadratic' | 'cubic' | 'sine'; direction: ShowEasingDirection }

/**
 * Persisted records normalize to the structured form. Legacy names remain an
 * accepted input so existing Shows and direct compiler recipes retain their
 * exact timing while they cross the normalization boundary.
 */
export type ShowTransitionEasing = LegacyShowTransitionEasing | ShowStructuredEasing
export type ShowRoutingDirection = 'forward' | 'reverse'
export type ShowAutomatableProperty = 'timeScale' | 'brightness'

export interface ShowPropertyTransition {
  fromByCellId: Record<string, number>
  /** Missing only on #417 records; normalization fills from the containing boundary. */
  durationMs?: number
  easing?: ShowTransitionEasing
}

export interface ShowScalarPropertyTransition {
  from: number
  durationMs?: number
  easing?: ShowTransitionEasing
}

export interface ShowPropertyTransitions {
  timeScale?: ShowPropertyTransition
  brightness?: ShowPropertyTransition
  /** Public Pixelblaze slider export name -> the same shared transition descriptor. */
  controls?: Record<string, ShowPropertyTransition>
  routing?: {
    splitPosition?: ShowScalarPropertyTransition
  }
  sample?: {
    repeatScale?: ShowScalarPropertyTransition
  }
  /** Stable Effect id -> public numeric parameter -> shared clip-property descriptor. */
  effects?: Record<string, Record<string, ShowPropertyTransition>>
}

export type ShowClipEffect =
  | { id: string; kind: 'opacity'; opacity: number }
  | { id: string; kind: 'translate'; x: number; y: number }
  | { id: string; kind: 'rotate'; turns: number }
  | { id: string; kind: 'scale'; x: number; y: number }
  | { id: string; kind: 'shear'; x: number; y: number }
  | { id: string; kind: 'wrap' }

export interface ShowPortalSettings {
  centerX: number
  centerY: number
  invert: boolean
  featherPolicy: ShowPortalFeatherPolicy
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  revealMode?: ShowRevealMode
  aspect?: number
  edgePolicy?: ShowTransitionEdgePolicy
}

export interface ShowTransition {
  kind: ShowTransitionKind
  durationMs: number
  /** Editable sRGB color used by the two-phase Fade-through-color Transition. */
  color?: string
  /** Stage-space motion direction in turns. Absent preserves the legacy index-domain Wipe. */
  direction?: number
  edgePolicy?: ShowTransitionEdgePolicy
  dissolveVariant?: ShowDissolveVariant
  seed?: number
  blockSize?: number
  /** Normalized fraction of the 1D route used as a stable wipe feather band. */
  feather?: number
  /** Normalized Stage coordinates used by the 2D portal transition. */
  centerX?: number
  centerY?: number
  /** Grows the incoming scene from the outside toward the center. */
  invert?: boolean
  /** Stable one-renderer threshold or true bounded-band color blend. */
  featherPolicy?: ShowPortalFeatherPolicy
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  revealMode?: ShowRevealMode
  aspect?: number
  motionVariant?: ShowMotionTransitionVariant
  anchorX?: number
  anchorY?: number
  contentScale?: number
  addressPolicy?: ShowMotionAddressPolicy
}

export interface ShowScene {
  id: string
  name: string
  durationMs: number
  transitionOut?: ShowTransition
  /** Show-wide property targets that take effect during this scene. */
  routingTargets?: ShowRoutingTargets
  sampleTargets?: ShowSampleTargets
}

export interface ShowRoutingTargets {
  splitPosition?: number
}

export interface ShowSampleTargets {
  repeatScale?: number
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
  /** Stable directional threshold used when a routing marker has nonzero duration. */
  routingDirection?: ShowRoutingDirection
  color?: string
  direction?: number
  edgePolicy?: ShowTransitionEdgePolicy
  dissolveVariant?: ShowDissolveVariant
  seed?: number
  blockSize?: number
  feather?: number
  centerX?: number
  centerY?: number
  invert?: boolean
  featherPolicy?: ShowPortalFeatherPolicy
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  revealMode?: ShowRevealMode
  aspect?: number
  motionVariant?: ShowMotionTransitionVariant
  anchorX?: number
  anchorY?: number
  contentScale?: number
  addressPolicy?: ShowMotionAddressPolicy
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
  /** Ordered single-source visual Effects. Affine operation order is significant. */
  effects?: ShowClipEffect[]
}

export interface Portable2DShowOutputContract {
  version: 1
  kind: 'portable-2d'
  referenceMapId: string | null
  referencePixelCount: number
  compatibility: {
    dimensions: [2]
    mapClass: 'continuous-surface'
    resolution: 'variable'
  }
}

export interface InstallationShowOutputContract {
  version: 1
  kind: 'installation'
  pixelCount: number
  outputMapId: string | null
  resolution: 'fixed'
}

export type ShowOutputContract =
  | Portable2DShowOutputContract
  | InstallationShowOutputContract

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
  /** Immutable authored promise for new Shows. Absent on legacy records awaiting classification. */
  outputContract?: ShowOutputContract
  updatedAt: number
}
