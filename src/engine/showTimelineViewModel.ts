import type {
  ShowCompositionV1,
  ShowRecord,
  ShowStructuredEasing,
  ShowTimelineMarker,
  ShowTransitionKind,
} from './personalContentRecords'
import type { ShowPropertyTargetV2 } from './showCompositionV2'
import type { ShowPropertyCurveSegment } from './showPropertyAnimation'
import type { ShowLayoutInterval } from './showLayoutIntervals'
import { projectShowLayoutIntervals } from './showLayoutIntervals'
import type { ShowStripProjection, ShowTimelineProjection } from './showModel'
import { projectShowStrip, projectShowTimeline } from './showModel'
import type {
  ShowUnifiedTimelineClipProjection,
  ShowUnifiedTimelineProjection,
} from './showUnifiedTimelineProjection'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

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

/** Stable DOM and store key for one selection identity. */
export function showTimelineSelectionKey(selection: ShowTimelineSelection): string {
  switch (selection.kind) {
    case 'show':
      return 'show'
    case 'zone':
      return `zone:${selection.zoneId}`
    case 'layer':
      return `layer:${selection.zoneId}:${selection.layerId}`
    case 'clip':
      return `clip:${selection.clipId}`
    case 'group':
      return `group:${selection.occurrenceId}`
    case 'group-clip':
      return `group-clip:${selection.occurrenceId}:${selection.childId}`
    case 'transition':
      return `transition:${selection.transitionId}`
    case 'cut':
      return `cut:${selection.zoneId}:${selection.layerId}:${selection.fromClipId}:${selection.toClipId}`
    case 'layout-occurrence':
      return `layout-occurrence:${selection.occurrenceId}`
    case 'marker':
      return `marker:${selection.markerId}`
    case 'property-track':
      return `property-track:${selection.trackId}`
  }
}

export interface ShowTimelineProjectionInput {
  showId: string
  timeline: ShowTimelineProjection
  strip: ShowStripProjection
  /** Absent when the record carries no composition sidecar; the Zone rows then have no Layers. */
  unified: ShowUnifiedTimelineProjection | null
  layoutIntervals: ShowLayoutInterval[]
  markers: ShowTimelineMarker[]
}

/**
 * Build the version-agnostic view from the landed v1 projections. The caller
 * supplies the projections it already computed; this adapter allocates no
 * identity and reads no store.
 */
export function fromShowTimelineProjection(
  input: ShowTimelineProjectionInput,
): ShowTimelineViewModel {
  const { timeline, strip, unified, layoutIntervals, markers } = input
  const unifiedZoneById = new Map((unified?.zones ?? []).map((zone) => [zone.id, zone]))
  const transitions = new Map<string, ShowTimelineTransitionView>()

  const rows = strip.rows.map((row): ShowTimelineZoneRowView => {
    const unifiedZone = unifiedZoneById.get(row.zoneId)
    const layerCount = unifiedZone?.layers.length ?? 0
    return {
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      ...(row.color === undefined ? {} : { color: row.color }),
      nominalPixelCount: row.nominalPixelCount,
      pixelCount: row.pixelCount,
      composed: Boolean(unifiedZone),
      layers: (unifiedZone?.layers ?? []).map((layer, layerIndex): ShowTimelineLayerView => ({
        id: layer.id,
        zoneId: row.zoneId,
        name: layer.name,
        rank: layerCount - 1 - layerIndex,
        layerIndex,
        items: layer.clips.map((clip) => legacyItemView(clip, layer.id)),
        junctions: layer.junctions.map((junction) => {
          // A Cut is the absence of a Transition at exact adjacency. A stored
          // zero-duration v1 Cut record is that absence, not an authored owner.
          const scope: ShowTimelineJunctionView['scope'] = junction.kind === 'cut'
            ? 'derived-cut'
            : junction.transition
              ? 'layer'
              : 'whole-output'
          const view: ShowTimelineJunctionView = {
            id: junction.id,
            kind: junction.kind,
            scope,
            transitionId: scope === 'derived-cut' ? null : junction.id,
            leftItemId: junction.leftClipId,
            rightItemId: junction.rightClipId,
            startMs: junction.startMs,
            endMs: junction.endMs,
            durationMs: junction.durationMs,
            selection: scope === 'derived-cut'
              ? {
                  kind: 'cut',
                  zoneId: row.zoneId,
                  layerId: layer.id,
                  fromClipId: junction.leftClipId,
                  toClipId: junction.rightClipId,
                  atMs: junction.startMs,
                }
              : { kind: 'transition', transitionId: junction.id },
            ...(scope === 'derived-cut' && junction.boundaryTransition
              ? { legacy: { boundaryTransitionId: junction.boundaryTransition.id } }
              : {}),
          }
          if (scope === 'layer') {
            recordLegacyLayerTransition(transitions, row.zoneId, layer.id, junction)
          }
          return view
        }),
      })),
      groups: (unifiedZone?.groups ?? []).map((group): ShowTimelineGroupView => ({
        id: group.id,
        definitionId: group.definitionId,
        name: group.name,
        zoneId: group.zoneId,
        startMs: group.startMs,
        endMs: group.endMs,
        durationMs: group.durationMs,
        topLayerIndex: group.topLayerIndex,
        bottomLayerIndex: group.bottomLayerIndex,
        linkedOccurrenceCount: group.linkedOccurrenceCount,
        selection: { kind: 'group', occurrenceId: group.id },
      })),
    }
  })

  // A whole-output boundary owns unequal contributor sets. Its contributors are
  // every item whose contribution meets the window, not only the pairs that
  // happen to be adjacent on one Layer and therefore draw a junction.
  const items = rows.flatMap((row) => row.layers.flatMap((layer) => layer.items))
  for (const boundary of timeline.boundaryTransitions) {
    if (boundary.kind === 'routing' || boundary.kind === 'cut') continue
    transitions.set(boundary.id, {
      id: boundary.id,
      kind: boundary.kind,
      startMs: boundary.startMs,
      durationMs: boundary.durationMs,
      endMs: boundary.endMs,
      scope: {
        kind: 'whole-output',
        fromItemIds: items.filter((item) => item.endMs === boundary.startMs).map((item) => item.id),
        toItemIds: items.filter((item) => item.startMs === boundary.endMs).map((item) => item.id),
      },
    })
  }

  return {
    recordVersion: 1,
    showId: input.showId,
    showEndMs: timeline.durationMs,
    rows,
    transitions: [...transitions.values()].sort(compareTransitions),
    layoutIntervals: layoutIntervals.map((interval): ShowTimelineLayoutIntervalView => ({
      id: interval.id,
      definitionId: interval.layoutId,
      definitionName: interval.layoutName,
      zoneIds: [...interval.zoneIds],
      startMs: interval.startMs,
      endMs: interval.endMs,
      durationMs: interval.durationMs,
      parameters: {},
      selection: { kind: 'layout-occurrence', occurrenceId: interval.id },
      legacy: { sceneIds: [...interval.sceneIds] },
    })),
    markers: markers.map((marker): ShowTimelineMarkerView => ({
      id: marker.id,
      timeMs: marker.timeMs,
      ...(marker.name === undefined ? {} : { name: marker.name }),
      ...(marker.color === undefined ? {} : { color: marker.color }),
      selection: { kind: 'marker', markerId: marker.id },
    })),
    // The contribution order reproduces the surfaces the v1 editor already snaps to.
    structuralTimesMs: [...new Set([
      0,
      timeline.durationMs,
      ...timeline.scenes.flatMap((scene) => [scene.startMs, scene.endMs]),
      ...timeline.transitions.flatMap((transition) => [transition.startMs, transition.endMs]),
      ...timeline.boundaryTransitions.flatMap((transition) => [transition.startMs, transition.endMs]),
      ...timeline.rows.flatMap((row) => row.cells.flatMap((cell) => [cell.startMs, cell.endMs])),
      ...rows.flatMap((row) => row.layers.flatMap((layer) => (
        layer.items.flatMap((item) => [item.startMs, item.endMs])
      ))),
    ])],
  }
}

/**
 * Convenience projection for a whole v1 record. The editor passes the
 * composition it already resolved, which for a flat record is the projected
 * sidecar rather than a persisted one.
 */
export function projectShowTimelineViewModel(
  show: ShowRecord,
  composition: ShowCompositionV1 | null = show.composition ?? null,
): ShowTimelineViewModel {
  return fromShowTimelineProjection({
    showId: show.id,
    timeline: projectShowTimeline(show),
    strip: projectShowStrip(show),
    unified: composition ? projectShowUnifiedTimeline(show, composition) : null,
    layoutIntervals: projectShowLayoutIntervals(show),
    markers: composition?.markers ?? [],
  })
}

function legacyItemView(
  clip: ShowUnifiedTimelineClipProjection,
  layerId: string,
): ShowTimelineItemView {
  return {
    id: clip.id,
    selection: clip.groupOccurrenceId
      ? { kind: 'group', occurrenceId: clip.groupOccurrenceId }
      : { kind: 'clip', clipId: clip.id },
    instanceId: clip.instanceId,
    patternName: clip.patternName,
    compiled: clip.compiled,
    zoneId: clip.zoneId,
    layerId,
    startMs: clip.startMs,
    durationMs: clip.durationMs,
    endMs: clip.endMs,
    // A v1 composition placement owns no entry instruction; legacy Restart
    // converts to a separate Pattern instance, not to an authored flag.
    entryPolicy: 'continue',
    heldAppearance: { opacity: clip.opacity, effectKinds: [...clip.effectKinds] },
    ...(clip.groupOccurrenceId ? { groupOccurrenceId: clip.groupOccurrenceId } : {}),
    diagnostics: [...clip.diagnostics],
    legacy: {
      sceneId: clip.sceneId,
      startSceneId: clip.startSceneId,
      endSceneId: clip.endSceneId,
      kind: clip.kind,
      overlayLayerId: clip.layerId,
      localStartMs: clip.localStartMs,
      startPlacementId: clip.startPlacementId,
      endPlacementId: clip.endPlacementId,
      ...(clip.logicalClipId === undefined ? {} : { logicalClipId: clip.logicalClipId }),
      ...(clip.segmentIds === undefined ? {} : { segmentIds: [...clip.segmentIds] }),
    },
  }
}

function recordLegacyLayerTransition(
  transitions: Map<string, ShowTimelineTransitionView>,
  zoneId: string,
  layerId: string,
  junction: {
    id: string
    kind: ShowTransitionKind
    leftClipId: string
    rightClipId: string
    startMs: number
    endMs: number
    durationMs: number
  },
): void {
  const participant = {
    zoneId,
    layerId,
    fromItemId: junction.leftClipId,
    toItemId: junction.rightClipId,
  }
  const existing = transitions.get(junction.id)
  if (existing?.scope.kind === 'participants') {
    existing.scope.participants.push(participant)
    return
  }
  transitions.set(junction.id, {
    id: junction.id,
    kind: junction.kind as Exclude<ShowTransitionKind, 'cut'>,
    startMs: junction.startMs,
    durationMs: junction.durationMs,
    endMs: junction.endMs,
    scope: { kind: 'participants', participants: [participant] },
  })
}

function compareTransitions(
  left: ShowTimelineTransitionView,
  right: ShowTimelineTransitionView,
): number {
  return left.startMs - right.startMs || left.id.localeCompare(right.id)
}
