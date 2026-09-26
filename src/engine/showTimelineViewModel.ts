import type { ShowStructuredEasing, ShowTransitionKind } from './personalContentRecords'
import type { ShowPropertyTargetV2 } from './showCompositionV2'
import type { ShowPropertyCurveSegment } from './showPropertyAnimation'

/**
 * One version-agnostic description of the Show timeline surface.
 *
 * The v1 record and a `ShowRecordV2` both project into this shape, so the
 * timeline, strip, ruler, Layout lane and Marker surfaces read one vocabulary.
 * Scene identity is deliberately absent: the concepts the v1 surfaces still
 * need are carried in the explicitly named `legacy` sidecars, which a v2
 * projection never populates.
 */
export interface ShowTimelineViewModel {
  /** Which record shape produced this view; never a compatibility switch inside a renderer. */
  recordVersion: 1 | 2
  showId: string
  /** Show End owns the loop length. */
  showEndMs: number
  rows: ShowTimelineZoneRowView[]
  transitions: ShowTimelineTransitionView[]
  layoutIntervals: ShowTimelineLayoutIntervalView[]
  markers: ShowTimelineMarkerView[]
  /**
   * Authored Property tracks, for the animation lanes.
   *
   * Absent means this projection resolves none, not that the record has none: a
   * v1 track is Scene-local and its global identity is conversion work
   * (#1035/#1037), so the v1 projection omits the collection and the v1 surfaces
   * keep their own lanes. A renderer draws what is here and nothing when it is
   * absent; it never reads this as a version test.
   */
  propertyTracks?: ShowTimelinePropertyTrackView[]
  /**
   * Snap candidates in first-appearance order. Version-agnostic contributions
   * come first; a v1 projection appends its Scene and flat-cell boundaries.
   */
  structuralTimesMs: number[]
}

/** Which owner's time domain a track's activation and key times live in. */
export type ShowTimelinePropertyOwnerView =
  | { kind: 'show' }
  | { kind: 'group-definition'; definitionId: string; definitionName: string; occurrenceIds: string[] }

/**
 * One authored Property key on a lane.
 *
 * `retainedCurve` marks a key whose outgoing segment is a restriction of a
 * longer authored curve (specification section 6). Such a segment must be drawn
 * from its descriptor: re-normalizing it to a two-point interpolation between
 * this key and the next is a lie, because equal endpoint values can enclose a
 * nonconstant interior.
 */
export interface ShowTimelinePropertyKeyView {
  id: string
  timeMs: number
  value: number
  /** The authored outgoing curve for the segment that starts at this key. */
  easing: ShowStructuredEasing
  /** The retained source-curve coefficients, present exactly when `retainedCurve`. */
  curveSegment?: ShowPropertyCurveSegment
  retainedCurve: boolean
}

/** One authored Property track drawn as an animation lane. */
export interface ShowTimelinePropertyTrackView {
  id: string
  owner: ShowTimelinePropertyOwnerView
  target: ShowPropertyTargetV2
  /** The Clip, Pattern instance or Layout occurrence the target names, when it names one. */
  targetEntityId?: string
  /** Reader-facing name of what this lane animates. */
  label: string
  activeStartMs: number
  activeDurationMs: number
  activeEndMs: number
  keys: ShowTimelinePropertyKeyView[]
}

/** One Zone rail row. `composed` distinguishes an empty Zone from a record with no timeline. */
export interface ShowTimelineZoneRowView {
  zoneId: string
  zoneName: string
  color?: string
  nominalPixelCount: number
  pixelCount: number
  composed: boolean
  /** Ordered top to bottom: descending rank, so rank zero renders last. */
  layers: ShowTimelineLayerView[]
  groups: ShowTimelineGroupView[]
}

export interface ShowTimelineLayerView {
  /** Stable Layer identity for the whole Show, including empty stretches. */
  id: string
  zoneId: string
  name: string
  /** Zero is the bottom Layer. */
  rank: number
  /** Render order inside the Zone row, zero at the top. */
  layerIndex: number
  items: ShowTimelineItemView[]
  junctions: ShowTimelineJunctionView[]
}

export interface ShowTimelineItemHeldAppearanceView {
  opacity: number
  effectKinds: string[]
}

/** One authored held-appearance key inside a Clip, in global milliseconds. */
export interface ShowTimelineItemAppearanceKeyView extends ShowTimelineItemHeldAppearanceView {
  id: string
  timeMs: number
}

/** A Clip use on one Layer, including one materialized Group Clip use. */
export interface ShowTimelineItemView {
  id: string
  selection: ShowTimelineSelection
  instanceId: string
  patternName: string
  /** The effective Pattern instance resolves in the record this view came from. */
  compiled: boolean
  zoneId: string
  layerId: string
  startMs: number
  durationMs: number
  endMs: number
  entryPolicy: 'continue' | 'restart'
  /** Held appearance at the item's start. */
  heldAppearance: ShowTimelineItemHeldAppearanceView
  /**
   * Every authored held-appearance key in this Clip, earliest first. Absent
   * where the projection resolves no per-key detail: a v1 placement carries one
   * held value with no key identity, so the v1 projection omits it.
   */
  appearanceKeys?: ShowTimelineItemAppearanceKeyView[]
  groupOccurrenceId?: string
  diagnostics: string[]
  /** Scene-shaped identity the v1 surfaces still address. Never present for a v2 view. */
  legacy?: ShowTimelineItemLegacyView
}

export interface ShowTimelineItemLegacyView {
  sceneId: string
  startSceneId: string
  endSceneId: string
  kind: 'main' | 'overlay'
  /** `null` for a Main placement, matching the v1 unified projection. */
  overlayLayerId: string | null
  localStartMs: number
  startPlacementId: string
  endPlacementId: string
  logicalClipId?: string
  segmentIds?: string[]
}

/**
 * A drawn boundary between two adjacent items on one Layer. A `derived-cut`
 * junction mints no persisted identity and exists only at exact adjacency.
 */
export interface ShowTimelineJunctionView {
  id: string
  kind: ShowTransitionKind
  scope: 'layer' | 'whole-output' | 'derived-cut'
  /** `null` exactly when the junction is a derived Cut. */
  transitionId: string | null
  leftItemId: string
  rightItemId: string
  startMs: number
  endMs: number
  durationMs: number
  selection: ShowTimelineSelection
  /**
   * The v1 boundary record a derived Cut still resolves through. v2 persists no
   * Cut, so a v2 junction never carries this.
   */
  legacy?: { boundaryTransitionId: string }
}

export interface ShowTimelineTransitionParticipantView {
  zoneId: string
  layerId: string
  fromItemId: string
  toItemId: string
}

export type ShowTimelineTransitionScopeView =
  | { kind: 'participants'; participants: ShowTimelineTransitionParticipantView[] }
  | { kind: 'whole-output'; fromItemIds: string[]; toItemIds: string[] }

export interface ShowTimelineTransitionView {
  id: string
  kind: Exclude<ShowTransitionKind, 'cut'>
  startMs: number
  durationMs: number
  endMs: number
  scope: ShowTimelineTransitionScopeView
  /**
   * Conversion provenance threaded from the v2 record (#1068). Present only
   * when the record carries it; a natively authored Transition and every v1
   * Transition omit the field. It carries no render meaning: the editor draws
   * the same junction with or without it, and only the resize planner reads it
   * to tell a Scene-boundary join from a Layer-Transition join.
   */
  origin?: 'converted-boundary-transition' | 'converted-layer-transition'
}

export interface ShowTimelineLayoutTransferView {
  id: string
  fromOccurrenceId: string
  durationMs: number
}

export interface ShowTimelineLayoutIntervalView {
  /** Layout occurrence identity. */
  id: string
  definitionId: string
  definitionName: string
  zoneIds: string[]
  startMs: number
  endMs: number
  durationMs: number
  parameters: { splitPosition?: number }
  incomingTransfer?: ShowTimelineLayoutTransferView
  selection: ShowTimelineSelection
  /** The internal Scene owners a v1 occurrence still resolves through. */
  legacy?: { sceneIds: string[] }
}

export interface ShowTimelineMarkerView {
  id: string
  timeMs: number
  name?: string
  color?: string
  /** `chapter` selects a Marker for the Gallery, reading-card and Live projections. */
  role?: 'chapter'
  selection: ShowTimelineSelection
}

/**
 * Selection identity for every timeline surface. It addresses Clips, Layers,
 * Layout occurrences, Markers and derived Cut junctions by their own identity
 * rather than by `ShowCell.id` inside a Scene.
 */
export type ShowTimelineSelection =
  | { kind: 'show' }
  | { kind: 'zone'; zoneId: string }
  | { kind: 'layer'; zoneId: string; layerId: string }
  | { kind: 'clip'; clipId: string }
  | { kind: 'group'; occurrenceId: string }
  | { kind: 'group-clip'; occurrenceId: string; childId: string }
  | { kind: 'transition'; transitionId: string }
  | {
      kind: 'cut'
      zoneId: string
      layerId: string
      fromClipId: string
      toClipId: string
      atMs: number
    }
  | { kind: 'layout-occurrence'; occurrenceId: string }
  | { kind: 'marker'; markerId: string }
  /** One authored Property track on an animation lane. */
  | { kind: 'property-track'; trackId: string }

export interface ShowTimelineGroupView {
  id: string
  definitionId: string
  name: string
  zoneId: string
  startMs: number
  endMs: number
  durationMs: number
  topLayerIndex: number
  bottomLayerIndex: number
  linkedOccurrenceCount: number
  selection: ShowTimelineSelection
}
