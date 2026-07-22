import type { Settings } from './settings'
import type { ShowLogicalRouting } from './showLogicalRouting'

export interface PatternRecord {
  id: string
  name: string
  src: string
  controls: Record<string, number | number[]>
  authors?: string[]
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
export type ShowCrossfadePolicy = 'snapshot-live' | 'live-live'
export type ShowPortalFeatherPolicy = 'dither' | 'blend'
export type ShowTransitionEdgePolicy = 'hard' | 'dither' | 'blend'
export type ShowDissolveVariant = 'pixel' | 'block' | 'coherent-noise' | 'soft-threshold'
export type ShowWipeVariant = 'linear' | 'split' | 'barn-doors' | 'blinds' | 'clock' | 'checker' | 'grid'
export type ShowWipeMode = 'center-out' | 'center-in'
export type ShowWipeOrientation = 'horizontal' | 'vertical'
export type ShowSpatialShape =
  | 'circle' | 'ellipse' | 'box' | 'rounded-box' | 'diamond' | 'cross' | 'ring'
  | 'heart' | 'star' | 'crescent' | 'polygon'
  | 'cat-head' | 'cat-side-profile' | 'bastet'
export type ShowRevealMode = 'grow-incoming' | 'shrink-outgoing'
export type ShowMotionTransitionVariant =
  | 'cover' | 'reveal' | 'push' | 'content-grow' | 'content-shrink'
  | 'zoom-in' | 'zoom-out'
export type ShowMotionAddressPolicy = 'clip' | 'wrap'
export type ShowMotionSpinDirection = 'clockwise' | 'counterclockwise'
/** Compact compiler-recipe shorthands; persisted Show records use structured easing. */
export type ShowEasingPreset = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out'
export type ShowEasingDirection = 'in' | 'out' | 'in-out'
export type ShowStructuredEasing =
  | { curve: 'linear' }
  | { curve: 'quadratic' | 'cubic' | 'sine'; direction: ShowEasingDirection }
  | { curve: 'cubic-bezier'; x1: number; y1: number; x2: number; y2: number }
  | { curve: 'steps'; steps: number; position: 'start' | 'end' }
  | { curve: 'hold'; at: number }
  | { curve: 'back'; direction: ShowEasingDirection; overshoot: number }

export type ShowTransitionEasing = ShowEasingPreset | ShowStructuredEasing
export type ShowRoutingDirection = 'forward' | 'reverse'
export type ShowAutomatableProperty = 'timeScale' | 'brightness'

export interface ShowPropertyTransition {
  fromByCellId: Record<string, number>
  durationMs?: number
  easing?: ShowStructuredEasing
}

export interface ShowScalarPropertyTransition {
  from: number
  durationMs?: number
  easing?: ShowStructuredEasing
}

export interface ShowPropertyTransitions {
  timeScale?: ShowPropertyTransition
  brightness?: ShowPropertyTransition
  /** Public Pixelblaze slider export name -> the same shared transition descriptor. */
  controls?: Record<string, ShowPropertyTransition>
  /** Stable canonical placement Transform property -> shared clip-property descriptor. */
  transform?: Partial<Record<keyof ShowClipTransform, ShowPropertyTransition>>
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
  | { id: string; kind: 'brightness'; brightness: number }
  | { id: string; kind: 'hue'; turns: number }
  | { id: string; kind: 'saturation'; saturation: number }
  | { id: string; kind: 'contrast'; contrast: number }
  | { id: string; kind: 'invert'; amount: number }
  | { id: string; kind: 'threshold'; threshold: number; amount: number }
  | { id: string; kind: 'luma-key'; target: number; tolerance: number; softness: number }
  | { id: string; kind: 'chroma-key'; color: string; tolerance: number; softness: number }
  | { id: string; kind: 'posterize'; levels: number; amount: number }
  | { id: string; kind: 'vignette'; amount: number; radius: number; softness: number; centerX: number; centerY: number; aspect: number }
  | {
      id: string
      kind: 'color-map'
      amount: number
      shadowR: number
      shadowG: number
      shadowB: number
      highlightR: number
      highlightG: number
      highlightB: number
    }
  | { id: string; kind: 'translate'; x: number; y: number }
  | { id: string; kind: 'rotate'; turns: number }
  | { id: string; kind: 'scale'; x: number; y: number }
  | { id: string; kind: 'shear'; x: number; y: number }
  | { id: string; kind: 'ripple'; amount: number; frequency: number; phase: number; centerX: number; centerY: number }
  | { id: string; kind: 'swirl'; amount: number; radius: number; centerX: number; centerY: number }
  | { id: string; kind: 'bulge'; amount: number; radius: number; centerX: number; centerY: number }
  | { id: string; kind: 'pixelate'; amount: number; columns: number; rows: number }
  | { id: string; kind: 'kaleidoscope'; amount: number; segments: number; rotation: number; centerX: number; centerY: number }
  | { id: string; kind: 'wrap' }

/** Ordered Effects applied once to the fully composed physical Show output. */
export type ShowOutputEffect =
  | { id: string; kind: 'trails'; retention: number }

/** Structured identity for one numeric value authored inside a Scene. */
export type ShowPropertyAnimationTarget =
  | { kind: 'instance-time-scale'; instanceId: string }
  | { kind: 'instance-control'; instanceId: string; exportName: string }
  | { kind: 'placement-opacity'; placementId: string }
  | { kind: 'placement-view'; placementId: string; property: 'brightness' | 'phase' }
  | {
      kind: 'placement-transform'
      placementId: string
      property: keyof ShowClipTransform
    }
  | {
      kind: 'placement-viewport'
      placementId: string
      property: 'x' | 'y' | 'width' | 'height'
    }
  | {
      kind: 'placement-effect'
      placementId: string
      effectId: string
      effectKind: ShowClipEffect['kind']
      /** Visual-toolkit parameter id, such as translateX or amount. */
      parameterId: string
    }

export interface ShowPropertyAnimationKeyframe {
  id: string
  /** Whole milliseconds relative to the owning Scene. */
  timeMs: number
  value: number
  /** Interpolation used while leaving this keyframe. */
  easing: ShowStructuredEasing
}

export interface ShowPropertyAnimationTrack {
  id: string
  target: ShowPropertyAnimationTarget
  keyframes: ShowPropertyAnimationKeyframe[]
}

export interface ShowPortalSettings {
  centerX: number
  centerY: number
  featherPolicy: ShowPortalFeatherPolicy
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  revealMode?: ShowRevealMode
  aspect?: number
  edgePolicy?: ShowTransitionEdgePolicy
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  crescentOffset?: number
  polygonSides?: number
}

export interface ShowScene {
  id: string
  name: string
  durationMs: number
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
  /** Optional stable visual identifier used when timeline headers become narrow. */
  icon?: string
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

/** A selectable event on the shared boundary lane. */
export interface ShowBoundaryTransition {
  id: string
  afterSceneId: string
  kind: ShowTransitionKind | 'routing'
  durationMs: number
  easing: ShowStructuredEasing
  /** Authored only for crossfade. */
  crossfadePolicy?: ShowCrossfadePolicy
  layoutId?: string
  /** Stable directional threshold used when a routing marker has nonzero duration. */
  routingDirection?: ShowRoutingDirection
  color?: string
  direction?: number
  wipeVariant?: ShowWipeVariant
  wipeMode?: ShowWipeMode
  orientation?: ShowWipeOrientation
  count?: number
  phase?: number
  clockwise?: boolean
  edgePolicy?: ShowTransitionEdgePolicy
  dissolveVariant?: ShowDissolveVariant
  seed?: number
  blockSize?: number
  softness?: number
  feather?: number
  centerX?: number
  centerY?: number
  featherPolicy?: ShowPortalFeatherPolicy
  shape?: ShowSpatialShape
  scale?: number
  rotation?: number
  spin?: number
  ringWidth?: number
  revealMode?: ShowRevealMode
  aspect?: number
  cornerRadius?: number
  crossWidth?: number
  starPoints?: number
  starInner?: number
  crescentOffset?: number
  polygonSides?: number
  motionVariant?: ShowMotionTransitionVariant
  anchorX?: number
  anchorY?: number
  contentScale?: number
  spinDirection?: ShowMotionSpinDirection
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

export type ShowClipPresentation =
  | { mode: 'live' }
  | { mode: 'freeze' }
  | { mode: 'strobe'; cadenceMs: number }

export interface ShowClipBlink {
  rateHz: number
  duty: number
  phase: number
}

export type ShowPatternRef =
  | { kind: 'user'; id: string }
  | { kind: 'stock'; id: string }

export type ShowClipEvaluationPolicy = 'live' | 'freeze-at-entry' | 'rolling-refresh'

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
  /** Evaluate continuously, freeze one complete entry frame, or refresh one quarter of pixels per frame. */
  evaluationPolicy?: ShowClipEvaluationPolicy
  /** Placement-owned RGB presentation. Live is the default when omitted. */
  presentation?: ShowClipPresentation
  /** Placement-owned visibility gate; Pattern-instance time continues while hidden. */
  blink?: ShowClipBlink
  /** Scene-owned 0..1 targets for public slider control functions. */
  controlTargets?: Record<string, number>
  /** Canonical placement transform, applied before optional ordered Effects. Missing is neutral. */
  transform?: ShowClipTransform
  /** Preserved when disabled so later re-enable restores the authored frame. */
  viewport?: ShowClipViewport
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

/** Show-owned private Pattern state referenced by one or more local placements. */
export interface ShowPatternInstance {
  id: string
  pattern: ShowPatternRef
  patternName: string
  /** Evaluate continuously, freeze one complete entry frame, or refresh one quarter of pixels per frame. */
  evaluationPolicy?: ShowClipEvaluationPolicy
  time: {
    timeScale: number
    timeOffsetMs: number
    lightShutter?: ShowLightShutter
    steppedClock?: ShowSteppedClock
  }
  controlTargets?: Record<string, number>
}

/** Placement-owned render values; simulation and exported controls stay on the instance. */
export interface ShowPlacementView {
  mirror: boolean
  phase: number
  brightness: number
}

/** Stable placement-owned affine pose. Rotation is persisted in signed turns around (0.5, 0.5). */
export interface ShowClipTransform {
  positionX: number
  positionY: number
  rotation: number
  scaleX: number
  scaleY: number
}

/** Optional placement-owned, axis-aligned clipping rectangle in normalized Zone coordinates. */
export interface ShowClipViewport {
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
}

export interface ShowMainPlacement {
  id: string
  instanceId: string
  startMs: number
  durationMs: number
  view: ShowPlacementView
  /** Placement-owned RGB presentation. Live is the default when omitted. */
  presentation?: ShowClipPresentation
  /** Placement-owned visibility gate; Pattern-instance time continues while hidden. */
  blink?: ShowClipBlink
  /** Canonical placement transform, applied before optional ordered Effects. Missing is neutral. */
  transform?: ShowClipTransform
  /** Preserved when disabled so later re-enable restores the authored frame. */
  viewport?: ShowClipViewport
  effects?: ShowClipEffect[]
}

export interface ShowOverlayPlacement extends Omit<ShowMainPlacement, 'view'> {
  opacity: number
  view: ShowPlacementView
}

/** Front-to-back manual order; the first layer renders visually on top. */
export interface ShowOverlayLayer {
  id: string
  name: string
  placements: ShowOverlayPlacement[]
}

export interface ShowZoneComposition {
  zoneId: string
  main: ShowMainPlacement[]
  overlays: ShowOverlayLayer[]
}

export interface ShowSceneComposition {
  sceneId: string
  /** Authored tracks only. Static values remain inline on their typed owners. */
  propertyTracks?: ShowPropertyAnimationTrack[]
  zones: ShowZoneComposition[]
}

/** A Show-owned alignment guide in absolute Show time. */
export interface ShowTimelineMarker {
  id: string
  timeMs: number
  name?: string
  color?: string
}

/**
 * A visible, positive-duration transition between two consecutive placements
 * on one Layer. Cuts are derived from abutting placement endpoints and are not
 * persisted.
 */
export interface ShowLayerTransition extends Omit<
  ShowBoundaryTransition,
  'afterSceneId' | 'kind' | 'layoutId' | 'routingDirection' | 'propertyTransitions'
> {
  fromPlacementId: string
  toPlacementId: string
  kind: Exclude<ShowTransitionKind, 'cut'>
}

/** One definition-local Clip. Time and layer are relative to its Group occurrence. */
export interface ShowGroupPlacement extends ShowOverlayPlacement {
  /** Zero is the occurrence's base Layer; positive values move upward. */
  layerOffset: number
}

/** Zone-agnostic reusable choreography. Group definitions cannot contain Groups. */
export interface ShowGroupDefinition {
  id: string
  name: string
  patternInstances: ShowPatternInstance[]
  placements: ShowGroupPlacement[]
  transitions?: ShowLayerTransition[]
  /** Definition-local time and owner ids. */
  propertyTracks?: ShowPropertyAnimationTrack[]
}

/** One Zone- and Layout-interval-local use of a Group definition. */
export interface ShowGroupOccurrence {
  id: string
  definitionId: string
  sceneId: string
  zoneId: string
  startMs: number
  /** Zero is Main; positive values count overlay Layers upward from Main. */
  baseLayer: number
  translationX: number
  translationY: number
}

/**
 * Additive Scene-composition sidecar. Version 1 carries mutually exclusive
 * Main schedules, manually ordered overlay layers, typed Scene-local property
 * animation tracks, and endpoint-owned non-Cut Layer transitions.
 */
export interface ShowCompositionV1 {
  version: 1
  /** New timeline execution contract; absent preserves legacy compiled artifacts. */
  executionModel?: 'deterministic-loop'
  patternInstances: ShowPatternInstance[]
  scenes: ShowSceneComposition[]
  /** Explicit deterministic loop boundary in absolute Show time. */
  durationMs?: number
  /** Global guides; Markers may remain dormant beyond Show End. */
  markers?: ShowTimelineMarker[]
  /** Non-Cut transitions; endpoint-owned Cuts remain implicit and lossless. */
  transitions?: ShowLayerTransition[]
  /** Reusable choreography definitions, omitted when the Show has no Groups. */
  groupDefinitions?: ShowGroupDefinition[]
  /** Zone- and Layout-interval-local placements of Group definitions. */
  groupOccurrences?: ShowGroupOccurrence[]
}

export interface ShowRecord {
  id: string
  name: string
  scenes: ShowScene[]
  zones: ShowZone[]
  cells: ShowCell[]
  routingLayouts: ShowRoutingLayout[]
  /** Canonical visual and routing events on Scene boundaries. */
  transitions: ShowBoundaryTransition[]
  targetControllerProfileId?: string
  stageMapId?: string | null
  /** Immutable authored promise for the Show's output. */
  outputContract: ShowOutputContract
  /** Optional additive local composition alongside the global timeline. */
  composition?: ShowCompositionV1 | null
  /** Ordered full-Show output Effects, after clip composition and Transitions. */
  outputEffects?: ShowOutputEffect[]
  updatedAt: number
}
