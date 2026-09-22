import type {
  ShowClipAppearanceValueV2,
  ShowClipV2,
  ShowGroupDefinitionV2,
  ShowGroupOccurrenceV2,
  ShowPropertyTargetV2,
  ShowRecordV2,
  ShowTransitionV2,
} from './showCompositionV2'
import type { ShowGroupSelection } from './showGroupModel'
import {
  defaultGroupRuntimeIdV2,
  groupOccurrenceDuration,
  groupRuntimeBindings,
  occurrenceBoundaryAfter,
  occurrenceBoundaryBefore,
} from './showGroupsV2'
import type {
  ShowTimelineGroupView,
  ShowTimelineItemView,
  ShowTimelineJunctionView,
  ShowTimelineLayerView,
  ShowTimelinePropertyTrackView,
  ShowTimelineTransitionView,
  ShowTimelineViewModel,
} from './showTimelineViewModel'
import { resolveShowZonePixelCount } from './showInstallationCoverage'
import type { ShowTransitionSettingsCarrier } from './showTransitionAuthoring'
import { lowerPropertyTarget } from './showV2ValueConversion'
import {
  describeShowPropertyLaneTarget,
  projectShowPropertyLane,
  projectShowPropertyTrackLane,
  type ShowPropertyLaneBeatInput,
  type ShowPropertyLaneOwnerFacts,
  type ShowPropertyLaneProjection,
  type ShowPropertyLaneSegment,
} from './showPropertyLaneProjection'
import { qualifiedPropertyLabel, type ShowPropertyLaneFamily } from './showPropertyLaneFamilies'

interface AuthoredTimelineItem {
  view: ShowTimelineItemView
  sourceClipId: string
}

function heldAppearance(keys: ShowClipV2['appearance']['keys'], atMs: number): ShowClipAppearanceValueV2 {
  const ordered = [...keys].sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
  return [...ordered].reverse().find(key => key.timeMs <= atMs)?.value
    ?? ordered[0]?.value
    ?? { opacity: 1, view: { brightness: 1, phase: 0, mirror: false } }
}

function propertyTargetEntityId(target: ShowPropertyTargetV2): string | undefined {
  if ('clipId' in target) return target.clipId
  if ('instanceId' in target) return target.instanceId
  if ('layoutOccurrenceId' in target) return target.layoutOccurrenceId
  return undefined
}

function propertyTargetLabel(target: ShowPropertyTargetV2): string {
  switch (target.kind) {
    case 'instance-time-scale': return 'animation speed'
    case 'instance-control': return target.exportName.replace(/^slider/, '').replace(/([A-Z])/g, ' $1').trim()
    case 'clip-opacity': return 'opacity'
    case 'clip-view': return target.property
    case 'clip-transform': return target.property.replace(/([A-Z])/g, ' $1').toLowerCase()
    case 'clip-aperture': return `aperture ${target.property}`
    case 'clip-effect': return `${target.effectKind} ${target.parameterId}`
    case 'layout-occurrence-split-position': return 'split position'
    case 'show-repeat-scale': return 'sample repeat'
  }
}

function projectPropertyTrack(
  track: ShowRecordV2['composition']['propertyTracks'][number],
): ShowTimelinePropertyTrackView {
  return {
    id: track.id,
    owner: { kind: 'show' },
    target: structuredClone(track.target),
    ...(propertyTargetEntityId(track.target) ? { targetEntityId: propertyTargetEntityId(track.target) } : {}),
    label: propertyTargetLabel(track.target),
    activeStartMs: track.activeStartMs,
    activeDurationMs: track.activeDurationMs,
    activeEndMs: track.activeStartMs + track.activeDurationMs,
    keys: [...track.keyframes]
      .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
      .map(key => ({
        id: key.id,
        timeMs: key.timeMs,
        value: key.value,
        easing: structuredClone(key.easing),
        ...(key.curveSegment ? { curveSegment: structuredClone(key.curveSegment) } : {}),
        retainedCurve: Boolean(key.curveSegment),
      })),
  }
}

function ordinaryItem(record: ShowRecordV2, clip: ShowClipV2): AuthoredTimelineItem {
  const instance = record.composition.patternInstances.find(candidate => candidate.id === clip.instanceId)
  const appearance = heldAppearance(clip.appearance.keys, clip.startMs)
  return {
    sourceClipId: clip.id,
    view: {
      id: clip.id,
      selection: { kind: 'clip', clipId: clip.id },
      instanceId: clip.instanceId,
      patternName: instance?.patternName ?? instance?.pattern.id ?? clip.instanceId,
      compiled: Boolean(instance),
      zoneId: clip.zoneId,
      layerId: clip.layerId,
      startMs: clip.startMs,
      durationMs: clip.durationMs,
      endMs: clip.startMs + clip.durationMs,
      entryPolicy: clip.entryPolicy,
      heldAppearance: {
        opacity: appearance.opacity,
        effectKinds: appearance.effects?.map(effect => effect.kind) ?? [],
      },
      appearanceKeys: [...clip.appearance.keys]
        .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
        .map(key => ({
          id: key.id,
          timeMs: key.timeMs,
          opacity: key.value.opacity,
          effectKinds: key.value.effects?.map(effect => effect.kind) ?? [],
        })),
      diagnostics: [],
    },
  }
}

function groupItems(
  record: ShowRecordV2,
  occurrence: ShowGroupOccurrenceV2,
  definition: ShowGroupDefinitionV2,
): AuthoredTimelineItem[] {
  const runtimeBySlot = new Map(groupRuntimeBindings(record)
    .filter(binding => binding.occurrenceId === occurrence.id)
    .map(binding => [binding.slotId, binding]))
  const layerByDefinition = new Map(occurrence.layerBindings.map(binding => [binding.definitionLayerId, binding.layerId]))
  return definition.clips.flatMap(child => {
    const layerId = layerByDefinition.get(child.layerId)
    if (!layerId) return []
    const startMs = occurrenceBoundaryAfter(occurrence, child.startMs)
    const endMs = occurrenceBoundaryBefore(occurrence, child.startMs + child.durationMs)
    const binding = runtimeBySlot.get(child.instanceId)
    const instanceId = binding?.runtimeId ?? occurrence.instanceBindings?.[child.instanceId]
      ?? defaultGroupRuntimeIdV2(definition.id, child.instanceId)
    const instance = binding?.instance ?? definition.patternInstances.find(candidate => candidate.id === child.instanceId)
    const appearance = heldAppearance(child.appearance.keys, child.startMs)
    return [{
      sourceClipId: child.id,
      view: {
        id: `${occurrence.id}:${child.id}`,
        selection: { kind: 'group', occurrenceId: occurrence.id },
        instanceId,
        patternName: instance?.patternName ?? instance?.pattern.id ?? child.instanceId,
        compiled: Boolean(instance),
        zoneId: occurrence.zoneId,
        layerId,
        startMs,
        durationMs: endMs - startMs,
        endMs,
        entryPolicy: child.entryPolicy,
        heldAppearance: {
          opacity: appearance.opacity,
          effectKinds: appearance.effects?.map(effect => effect.kind) ?? [],
        },
        groupOccurrenceId: occurrence.id,
        diagnostics: [],
      },
    }]
  })
}

function transitionStart(
  transition: ShowTransitionV2,
  itemById: Map<string, ShowTimelineItemView>,
): number {
  if (transition.wholeOutput) return transition.wholeOutput.startMs
  const from = transition.participants.flatMap(participant => {
    const item = itemById.get(participant.fromClipId)
    return item ? [item.endMs] : []
  })
  const to = transition.participants.flatMap(participant => {
    const item = itemById.get(participant.toClipId)
    return item ? [item.startMs - transition.durationMs] : []
  })
  return Math.min(...from, ...to)
}

function projectTransition(
  transition: ShowTransitionV2,
  itemById: Map<string, ShowTimelineItemView>,
): ShowTimelineTransitionView {
  const startMs = transitionStart(transition, itemById)
  return {
    id: transition.id,
    kind: transition.kind,
    ...(transition.origin === undefined ? {} : { origin: transition.origin }),
    startMs,
    durationMs: transition.durationMs,
    endMs: startMs + transition.durationMs,
    scope: transition.wholeOutput
      ? {
          kind: 'whole-output',
          fromItemIds: [...transition.wholeOutput.fromClipIds],
          toItemIds: [...transition.wholeOutput.toClipIds],
        }
      : {
          kind: 'participants',
          participants: transition.participants.map(participant => ({
            zoneId: participant.zoneId,
            layerId: participant.layerId,
            fromItemId: participant.fromClipId,
            toItemId: participant.toClipId,
          })),
        },
  }
}

function layerJunctions(
  zoneId: string,
  layerId: string,
  items: ShowTimelineItemView[],
  transitions: ShowTransitionV2[],
): ShowTimelineJunctionView[] {
  return items.slice(0, -1).flatMap((left, index) => {
    const right = items[index + 1]
    const participantTransition = transitions.find(candidate => candidate.participants.some(participant => (
      participant.zoneId === zoneId
      && participant.layerId === layerId
      && participant.fromClipId === left.id
      && participant.toClipId === right.id
    )))
    // A whole-output Transition owns every pair it names, so the existing
    // junction renderer draws its band on each of them - the same handle v1
    // draws from its own boundary record. Membership is the authored
    // contributor list, never adjacency alone.
    const wholeOutputTransition = participantTransition ? undefined : transitions.find(candidate => (
      candidate.wholeOutput !== undefined
      && candidate.wholeOutput.fromClipIds.includes(left.id)
      && candidate.wholeOutput.toClipIds.includes(right.id)
      // v1 draws the band only where the pair spans the boundary window
      // exactly; anything else stays the two Clips' own adjacency.
      && candidate.wholeOutput.startMs === left.endMs
      && left.endMs + candidate.durationMs === right.startMs
    ))
    const transition = participantTransition ?? wholeOutputTransition
    if (!transition && left.endMs !== right.startMs) return []
    const startMs = transition ? left.endMs : right.startMs
    const durationMs = transition?.durationMs ?? 0
    return [{
      id: transition?.id ?? `cut:${zoneId}:${layerId}:${left.id}:${right.id}`,
      kind: transition?.kind ?? 'cut',
      scope: transition ? (transition.wholeOutput ? 'whole-output' : 'layer') : 'derived-cut',
      transitionId: transition?.id ?? null,
      leftItemId: left.id,
      rightItemId: right.id,
      startMs,
      endMs: startMs + durationMs,
      durationMs,
      selection: transition
        ? { kind: 'transition', transitionId: transition.id }
        : { kind: 'cut', zoneId, layerId, fromClipId: left.id, toClipId: right.id, atMs: startMs },
    }]
  })
}

/**
 * Each Group occurrence's definition-local Layer Transitions, presented under
 * the occurrence they play in.
 *
 * The identity is the occurrence and the definition child, matching the Clip
 * ids `groupItems` presents, so one definition shared by several occurrences
 * stays distinguishable. Nothing is minted for the record: these are presented
 * identities only, and the definition keeps sole ownership of the settings.
 */
function groupOccurrenceTransitionsV2(record: ShowRecordV2): ShowTransitionV2[] {
  return record.composition.groupOccurrences.flatMap(occurrence => {
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
    if (!definition) return []
    const layerByDefinition = new Map(occurrence.layerBindings.map(binding => [binding.definitionLayerId, binding.layerId]))
    return definition.transitions.flatMap(transition => {
      const from = definition.clips.find(clip => clip.id === transition.fromPlacementId)
      const layerId = from ? layerByDefinition.get(from.layerId) : undefined
      if (!layerId) return []
      const { fromPlacementId, toPlacementId, ...settings } = transition
      return [{
        ...structuredClone(settings),
        id: `${occurrence.id}:${transition.id}`,
        participants: [{
          id: `${occurrence.id}:${transition.id}:participant`,
          zoneId: occurrence.zoneId,
          layerId,
          fromClipId: `${occurrence.id}:${fromPlacementId}`,
          toClipId: `${occurrence.id}:${toPlacementId}`,
        }],
        propertyRamps: [],
      } satisfies ShowTransitionV2]
    })
  })
}

/** Every authored item the timeline draws: ordinary Clips and Group children. */
function authoredTimelineItems(record: ShowRecordV2): AuthoredTimelineItem[] {
  const ordinary = record.composition.clips.map(clip => ordinaryItem(record, clip))
  const grouped = record.composition.groupOccurrences.flatMap(occurrence => {
    const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
    return definition ? groupItems(record, occurrence, definition) : []
  })
  return [...ordinary, ...grouped]
}

/**
 * Present the authored v2 timeline to the existing Show editor vocabulary.
 * The projection is read-only: it preserves authored identity and never creates
 * a legacy Show, compiler segment, or persisted candidate.
 */
export function projectShowEditorTimelineV2(record: ShowRecordV2): ShowTimelineViewModel {
  const authoredItems = authoredTimelineItems(record)
  const itemById = new Map(authoredItems.map(item => [item.view.id, item.view]))

  const transitions = [...record.composition.transitions, ...groupOccurrenceTransitionsV2(record)]

  const rows = record.zones.map(zone => {
    const layers = record.composition.layers
      .filter(layer => layer.zoneId === zone.id)
      .sort((left, right) => right.rank - left.rank || left.id.localeCompare(right.id))
    const layerIndexById = new Map(layers.map((layer, index) => [layer.id, index]))
    const layerViews = layers.map((layer, layerIndex): ShowTimelineLayerView => {
      const items = authoredItems
        .map(item => item.view)
        .filter(item => item.zoneId === zone.id && item.layerId === layer.id)
        .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
      return {
        id: layer.id,
        zoneId: zone.id,
        name: layer.name,
        rank: layer.rank,
        layerIndex,
        items,
        junctions: layerJunctions(zone.id, layer.id, items, transitions),
      }
    })
    const groups = record.composition.groupOccurrences.flatMap((occurrence): ShowTimelineGroupView[] => {
      if (occurrence.zoneId !== zone.id) return []
      const definition = record.composition.groupDefinitions.find(candidate => candidate.id === occurrence.definitionId)
      if (!definition) return []
      const indices = occurrence.layerBindings.flatMap(binding => {
        const index = layerIndexById.get(binding.layerId)
        return index === undefined ? [] : [index]
      })
      if (indices.length === 0) return []
      const durationMs = groupOccurrenceDuration(definition, occurrence)
      return [{
        id: occurrence.id,
        definitionId: definition.id,
        name: definition.name,
        zoneId: zone.id,
        startMs: occurrence.startMs,
        endMs: occurrence.startMs + durationMs,
        durationMs,
        topLayerIndex: Math.min(...indices),
        bottomLayerIndex: Math.max(...indices),
        linkedOccurrenceCount: record.composition.groupOccurrences.filter(candidate => candidate.definitionId === definition.id).length,
        selection: { kind: 'group', occurrenceId: occurrence.id },
      }]
    })
    const pixelCount = resolveShowZonePixelCount({
      outputContract: record.outputContract,
      zones: record.zones,
      routingLayouts: record.zoneLayouts,
    }, zone.id)?.pixelCount ?? zone.nominalPixelCount
    return {
      zoneId: zone.id,
      zoneName: zone.name,
      ...(zone.color ? { color: zone.color } : {}),
      nominalPixelCount: zone.nominalPixelCount,
      pixelCount,
      composed: layers.length > 0,
      layers: layerViews,
      groups,
    }
  })

  const transitionViews = transitions.map(transition => projectTransition(transition, itemById))
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
  const layoutIntervals = [...record.composition.layoutOccurrences]
    .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    .map(occurrence => {
      const definition = record.zoneLayouts.find(layout => layout.id === occurrence.layoutId)
      return {
        id: occurrence.id,
        definitionId: occurrence.layoutId,
        // The lane names the authored Zone Layout, exactly as the v1 owner
        // `projectShowLayoutIntervals` does (`layoutName: layout.name`). The
        // kind label is a separate read the surface makes from the definition,
        // and collapses distinct Layouts onto one string (#1065).
        definitionName: definition?.name ?? 'Zone Layout',
        zoneIds: definition?.logical?.zoneIds ? [...definition.logical.zoneIds] : definition?.zones.map(zone => zone.zoneId) ?? [],
        startMs: occurrence.startMs,
        endMs: occurrence.startMs + occurrence.durationMs,
        durationMs: occurrence.durationMs,
        parameters: structuredClone(occurrence.parameters),
        // The lane draws one switch handle per authored routing event, which is
        // what v1's `showRoutingTransitionAfter` finds at any duration. A
        // converted zero-duration switch owns no timed transfer, so it fills
        // this display view with its own identity and duration 0 (#1065).
        ...(occurrence.incomingTransfer ? { incomingTransfer: {
          id: occurrence.incomingTransfer.id,
          fromOccurrenceId: occurrence.incomingTransfer.fromOccurrenceId,
          durationMs: occurrence.incomingTransfer.durationMs,
        } } : occurrence.incomingSwitch ? { incomingTransfer: {
          id: occurrence.incomingSwitch.id,
          fromOccurrenceId: occurrence.incomingSwitch.fromOccurrenceId,
          durationMs: 0,
        } } : {}),
        selection: { kind: 'layout-occurrence' as const, occurrenceId: occurrence.id },
      }
    })
  // A Scene label the converter migrated stays a chapter for chapter consumers
  // but is not an authored editor Marker, so the timeline does not draw it and a
  // v1 Show keeps exactly the Markers it had (#1065, show-v2-markers contract).
  // Only this explicit origin is hidden: an absorbed or ordinary authored Marker
  // carries no origin and stays visible.
  const markers = record.composition.markers
    .filter(marker => marker.origin !== 'converted-scene-label')
    .sort((left, right) => left.timeMs - right.timeMs || left.id.localeCompare(right.id))
    .map(marker => ({
      id: marker.id,
      timeMs: marker.timeMs,
      ...(marker.name === undefined ? {} : { name: marker.name }),
      ...(marker.color === undefined ? {} : { color: marker.color }),
      ...(marker.role === undefined ? {} : { role: marker.role }),
      selection: { kind: 'marker' as const, markerId: marker.id },
    }))
  const structuralTimesMs = [...new Set([
    0,
    record.composition.showEndMs,
    ...rows.flatMap(row => row.layers.flatMap(layer => layer.items.flatMap(item => [item.startMs, item.endMs]))),
    ...transitionViews.flatMap(transition => [transition.startMs, transition.endMs]),
    ...layoutIntervals.flatMap(interval => [interval.startMs, interval.endMs]),
  ])].sort((left, right) => left - right)

  return {
    recordVersion: 2,
    showId: record.id,
    showEndMs: record.composition.showEndMs,
    rows,
    transitions: transitionViews,
    layoutIntervals,
    markers,
    propertyTracks: record.composition.propertyTracks.map(projectPropertyTrack),
    structuralTimesMs,
  }
}

/**
 * One column of the timeline's time grid.
 *
 * The existing editor lays its timeline out in the Show's top-level sections and
 * the whole-output boundary that separates two of them: the Layouts lane draws
 * one cell per section column, and the split-position and sample-repeat controls
 * draw in the boundary column between them. v1 reads those columns straight off
 * its Scenes and the visual Transition after each one. A converted v2 record
 * carries the same structure as its chapter Markers and the Transitions the
 * conversion marked as boundaries, so the same Show lays out in the same grid
 * columns whichever version stores it (#1065).
 *
 * `durationMs` is the span's own length, before the grid's own minimum track
 * sizes: a caller places it, and a boundary of zero length still owns a column
 * exactly as v1's zero-duration Cut does.
 */
export interface ShowEditorTimeColumnV2 {
  kind: 'section' | 'boundary'
  startMs: number
  durationMs: number
}

/**
 * The time-grid columns the existing editor lays a v2 record's timeline out in.
 *
 * Sections are delimited by chapter Markers, which is what a former Scene start
 * becomes. A Transition the conversion recorded as a boundary owns the gap
 * between two sections, exactly as v1's boundary Transition owns the gap between
 * two Scenes, so its length comes off the section that precedes it rather than
 * being counted inside it. A Layer Transition lives inside a section and owns no
 * column. A record with no chapter is one section spanning the whole Show.
 */
export function projectShowEditorTimeColumnsV2(record: ShowRecordV2): ShowEditorTimeColumnV2[] {
  const showEndMs = record.composition.showEndMs
  const itemById = new Map(authoredTimelineItems(record).map(item => [item.view.id, item.view]))
  const boundaries = record.composition.transitions
    .filter(transition => transition.origin === 'converted-boundary-transition')
    .map(transition => ({
      endMs: transitionStart(transition, itemById) + transition.durationMs,
      durationMs: transition.durationMs,
    }))
  const sectionStarts = [...new Set([0, ...record.composition.markers
    .filter(marker => marker.role === 'chapter')
    .map(marker => marker.timeMs)
    .filter(timeMs => timeMs > 0 && timeMs < showEndMs)])]
    .sort((left, right) => left - right)
  return sectionStarts.flatMap((startMs, index): ShowEditorTimeColumnV2[] => {
    const nextStartMs = sectionStarts[index + 1]
    if (nextStartMs === undefined) {
      return [{ kind: 'section', startMs, durationMs: showEndMs - startMs }]
    }
    const boundaryMs = boundaries.find(candidate => candidate.endMs === nextStartMs)?.durationMs ?? 0
    const durationMs = nextStartMs - startMs - boundaryMs
    return [
      { kind: 'section', startMs, durationMs },
      { kind: 'boundary', startMs: startMs + durationMs, durationMs: boundaryMs },
    ]
  })
}

/** The part of the editor's selection these commands read. The surface maps its
 * own selection onto this shape so the engine stays free of store types. */
export type ShowEditorTimelineCommandSelectionV2 =
  | { kind: 'clip'; clipId: string }
  | { kind: 'multi'; placementIds: readonly string[]; transitionIds: readonly string[] }
  | { kind: 'other' }

/** One timeline command's availability, in the existing toolbar's vocabulary. */
export interface ShowEditorTimelineCommandCapabilityV2 {
  enabled: boolean
  reason: string
}

export interface ShowEditorTimelineCommandsV2 {
  split: ShowEditorTimelineCommandCapabilityV2
  clone: ShowEditorTimelineCommandCapabilityV2
  group: ShowEditorTimelineCommandCapabilityV2
}

function firstOrdinaryItemAt(
  view: ShowTimelineViewModel,
  timeMs: number,
): ShowTimelineItemView | null {
  for (const row of view.rows) {
    for (const layer of row.layers) {
      for (const item of layer.items) {
        if (item.groupOccurrenceId) continue
        if (timeMs > item.startMs && timeMs < item.endMs) return item
      }
    }
  }
  return null
}

function findItem(view: ShowTimelineViewModel, clipId: string): ShowTimelineItemView | null {
  for (const row of view.rows) {
    for (const layer of row.layers) {
      const item = layer.items.find((candidate) => candidate.id === clipId)
      if (item) return item
    }
  }
  return null
}

function layerOf(view: ShowTimelineViewModel, layerId: string): ShowTimelineLayerView | null {
  for (const row of view.rows) {
    const layer = row.layers.find((candidate) => candidate.id === layerId)
    if (layer) return layer
  }
  return null
}

/**
 * Availability of the existing Split, Clone and Group toolbar commands for one
 * authored-v2 Show. The answers read the same presented timeline the surface
 * draws, so a Show stored either way reports the same state and the same
 * refusal text. Availability is a read: Split and Group submit through their
 * v2 owners, while an enabled Clone still returns an internal no-change result.
 */
export function projectShowEditorTimelineCommandsV2(input: {
  view: ShowTimelineViewModel
  selection: ShowEditorTimelineCommandSelectionV2
  playheadMs: number
  isolatedGroupOccurrenceId: string | null
}): ShowEditorTimelineCommandsV2 {
  const { view, selection, playheadMs, isolatedGroupOccurrenceId } = input
  const selectedItem = selection.kind === 'clip' ? findItem(view, selection.clipId) : null
  const selectedOrdinary = selectedItem && !selectedItem.groupOccurrenceId ? selectedItem : null

  const splitTarget = isolatedGroupOccurrenceId
    ? null
    : selectedOrdinary ?? (selection.kind === 'clip' && selectedItem ? null : firstOrdinaryItemAt(view, playheadMs))
  const split: ShowEditorTimelineCommandCapabilityV2 = !splitTarget
    ? selection.kind === 'clip' && selectedItem
      ? { enabled: false, reason: 'Place the playhead inside the selected Clip.' }
      : { enabled: false, reason: 'Place the playhead inside a Clip.' }
    : playheadMs > splitTarget.startMs && playheadMs < splitTarget.endMs
      ? { enabled: true, reason: 'Split the selected Clip at the playhead.' }
      : { enabled: false, reason: 'Place the playhead inside the selected Clip.' }

  const cloneLayer = selectedOrdinary ? layerOf(view, selectedOrdinary.layerId) : null
  const nextOnLayer = selectedOrdinary && cloneLayer
    ? cloneLayer.items
        .filter((candidate) => candidate.startMs >= selectedOrdinary.endMs)
        .sort((left, right) => left.startMs - right.startMs)[0] ?? null
    : null
  const cloneRoom = selectedOrdinary
    ? (nextOnLayer ? nextOnLayer.startMs - selectedOrdinary.endMs : view.showEndMs - selectedOrdinary.endMs)
    : 0
  const clone: ShowEditorTimelineCommandCapabilityV2 = !selectedOrdinary
    ? { enabled: false, reason: 'Select one simple Clip to Clone' }
    : cloneRoom >= selectedOrdinary.durationMs
      ? { enabled: true, reason: `Duplicate ${selectedOrdinary.patternName} immediately after itself` }
      : { enabled: false, reason: 'The selected Clip needs empty time after it on this Layer' }

  return { split, clone, group: projectGroupCapabilityV2(view, selection) }
}

function projectGroupCapabilityV2(
  view: ShowTimelineViewModel,
  selection: ShowEditorTimelineCommandSelectionV2,
): ShowEditorTimelineCommandCapabilityV2 {
  if (selection.kind !== 'multi') {
    return { enabled: false, reason: 'Select two or more Clips to make a Group.' }
  }
  const ids = [...new Set(selection.placementIds)]
  if (ids.length === 0) return { enabled: false, reason: 'Select at least one Clip.' }
  const items = ids.map((id) => findItem(view, id))
  if (items.some((item) => !item)) {
    return { enabled: false, reason: 'One or more selected Clips no longer exist.' }
  }
  const first = items[0]!
  if (items.some((item) => item!.zoneId !== first.zoneId)) {
    return { enabled: false, reason: 'A Group occurrence belongs to exactly one Zone.' }
  }
  const selectedIds = new Set(ids)
  const selectedTransitions = new Set(selection.transitionIds)
  const broken = view.rows.some((row) => row.layers.some((layer) => layer.junctions.some((junction) => {
    if (junction.scope === 'derived-cut' || !junction.transitionId) return false
    const from = selectedIds.has(junction.leftItemId)
    const to = selectedIds.has(junction.rightItemId)
    const chosen = selectedTransitions.has(junction.transitionId)
    return (from || to || chosen) && !(from && to && chosen)
  })))
  if (broken) {
    return { enabled: false, reason: 'Select both Clips and the complete non-Cut Transition chain.' }
  }
  return { enabled: true, reason: 'Keep the selected choreography together and make it reusable' }
}

/**
 * Completed Group-candidate selection for one authored-v2 Show, read off the
 * same presented timeline the surface draws. Placement ids are the unique input
 * ids in input order; Transition ids are the non-Cut junctions both of whose
 * ends are selected, unique in first-seen order. This is the complement of the
 * `broken` chain test in `projectGroupCapabilityV2`, so a completed selection
 * of joined Clips is never refused for a broken chain.
 */
export function completeShowGroupSelectionV2(
  view: ShowTimelineViewModel,
  placementIds: readonly string[],
): ShowGroupSelection {
  const uniqueIds = [...new Set(placementIds)]
  const selected = new Set(uniqueIds)
  const transitionIds: string[] = []
  for (const row of view.rows) {
    for (const layer of row.layers) {
      for (const junction of layer.junctions) {
        if (junction.scope === 'derived-cut' || !junction.transitionId) continue
        if (!selected.has(junction.leftItemId) || !selected.has(junction.rightItemId)) continue
        if (!transitionIds.includes(junction.transitionId)) transitionIds.push(junction.transitionId)
      }
    }
  }
  return { placementIds: uniqueIds, transitionIds }
}

/**
 * Authored Transition settings the existing timeline pictogram draws, keyed by
 * the Transition identity a junction view carries. Display only: nothing here
 * is persisted, compiled or used as a write target.
 */
export function projectShowEditorTransitionSettingsV2(
  record: ShowRecordV2,
): Record<string, ShowTransitionSettingsCarrier> {
  return Object.fromEntries(
    [...record.composition.transitions, ...groupOccurrenceTransitionsV2(record)]
      .map((transition) => [transition.id, transition]),
  )
}

/**
 * Property lanes for one authored-v2 Show, in the existing lane vocabulary.
 *
 * Two families, exactly as the v1 editor draws them:
 * - Authored animation lanes, one per Show-level Property track, named by the
 *   owning Clip's Pattern. A Group definition's own tracks stay internal, as
 *   they do on v1, where `projectGlobalShowScenePropertyLanes` reads Scene
 *   tracks only.
 * - Per-Zone value lanes for animation speed, brightness, transform and
 *   automated Pattern controls. v1 holds one value per Scene slot; the v2
 *   record holds one per Clip on the Zone's base Layer, so the hold segments
 *   follow Clip boundaries instead of Scene boundaries. A lane still appears
 *   only when its value actually changes over time.
 *
 * Read-only: no authored value, identity or time is written back.
 */
export function projectShowEditorPropertyLanesV2(
  record: ShowRecordV2,
  controls: readonly ShowEditorPropertyLaneControlV2[] = [],
): ShowEditorPropertyLaneV2[] {
  return [
    ...zoneValueLanesV2(record, controls),
    ...authoredTrackLanesV2(record),
  ]
}

/** Pattern-control metadata the Zone control lanes name and default from. */
export interface ShowEditorPropertyLaneControlV2 {
  exportName: string
  label: string
  defaultValue: number
}

/** One presented lane, in the same shape the existing timeline lane renderer reads. */
export interface ShowEditorPropertyLaneV2 {
  id: string
  zoneId: string
  label: string
  patternName?: string
  propertyLabel: string
  family: ShowPropertyLaneFamily
  valueKind: 'number' | 'percent' | 'multiplier'
  /** Which of v1's accessible-name forms this lane takes. */
  ariaKind: 'lane' | 'control-lane' | 'animation'
  /** A Zone value lane selects the Transition under the playhead, as on v1. */
  selectsTransition: boolean
  projection: ShowPropertyLaneProjection
}

interface AuthoredClipFacts {
  clip: ShowClipV2
  zoneId: string
  owner: ShowPropertyLaneOwnerFacts
}

function clipLaneFacts(record: ShowRecordV2, clip: ShowClipV2): AuthoredClipFacts | null {
  const instance = record.composition.patternInstances.find(candidate => candidate.id === clip.instanceId)
  if (!instance) return null
  const appearance = heldAppearance(clip.appearance.keys, clip.startMs)
  return {
    clip,
    zoneId: clip.zoneId,
    owner: {
      patternName: instance.patternName,
      timeScale: instance.time.timeScale,
      ...(instance.controlTargets ? { controlTargets: instance.controlTargets } : {}),
      opacity: appearance.opacity,
      view: appearance.view,
      ...(appearance.transform ? { transform: appearance.transform } : {}),
      ...(appearance.aperture ? { viewport: appearance.aperture } : {}),
      ...(appearance.effects ? { effects: appearance.effects } : {}),
    },
  }
}

function authoredTrackLanesV2(record: ShowRecordV2): ShowEditorPropertyLaneV2[] {
  const showEndMs = Math.max(1, record.composition.showEndMs)
  return record.composition.propertyTracks.flatMap((track): ShowEditorPropertyLaneV2[] => {
    // A Show-wide scalar track - repeat scale, split position - owns no Clip,
    // and v1 draws it on its own sample-remap row rather than as an animation
    // lane. Resolving owners first keeps that target out of the lowering the
    // Clip-owned lanes need, which has no form for it.
    const owners = laneOwnersForTarget(record, track.target)
    if (owners.length === 0) return []
    const lowered = lowerPropertyTarget(track.target)
    return owners.flatMap(facts => {
      const descriptor = describeShowPropertyLaneTarget(lowered, facts.owner)
      if (!descriptor) return []
      const projection = projectShowPropertyTrackLane({
        durationMs: showEndMs,
        constraint: descriptor.constraint,
        defaultValue: descriptor.defaultValue,
        track: {
          id: track.id,
          target: lowered,
          keyframes: track.keyframes.map(key => ({
            id: key.id,
            timeMs: key.timeMs,
            value: key.value,
            easing: key.easing,
          })),
        },
      })
      if (!projection.timeVarying) return []
      const label = `${descriptor.patternName} ${qualifiedPropertyLabel(descriptor.family, descriptor.propertyLabel)}`
      return [{
        id: `track:${facts.zoneId}:${track.id}`,
        zoneId: facts.zoneId,
        label,
        patternName: descriptor.patternName,
        propertyLabel: descriptor.propertyLabel,
        family: descriptor.family,
        valueKind: descriptor.valueKind,
        ariaKind: 'animation',
        selectsTransition: false,
        projection: {
          ...projection,
          beats: projection.beats.map(beat => ({
            ...beat,
            label: `${label} keyframe at ${Number((beat.timeMs / 1_000).toFixed(1))} s`,
          })),
        },
      }]
    })
  })
}

/** Which Clips one authored target's lane belongs to, and their resolved facts. */
function laneOwnersForTarget(record: ShowRecordV2, target: ShowPropertyTargetV2): AuthoredClipFacts[] {
  if ('clipId' in target) {
    const clip = record.composition.clips.find(candidate => candidate.id === target.clipId)
    const facts = clip ? clipLaneFacts(record, clip) : null
    return facts ? [facts] : []
  }
  if ('instanceId' in target) {
    const owners = record.composition.clips
      .filter(clip => clip.instanceId === target.instanceId)
      .flatMap(clip => clipLaneFacts(record, clip) ?? [])
    // One lane per Zone, exactly as the v1 instance lane resolves.
    return owners.filter((facts, index) => (
      owners.findIndex(candidate => candidate.zoneId === facts.zoneId) === index
    ))
  }
  return []
}

type ZoneLaneTarget =
  | { kind: 'timeScale' }
  | { kind: 'brightness' }
  | { kind: 'transform'; property: 'positionX' | 'positionY' | 'rotation' | 'scaleX' | 'scaleY'; label: string }
  | { kind: 'control'; exportName: string; label: string; defaultValue: number }

/** Does one authored Transition ramp drive this Zone lane's property? */
function rampMatchesZoneLaneTarget(target: ShowPropertyTargetV2, lane: ZoneLaneTarget): boolean {
  if (lane.kind === 'timeScale') return target.kind === 'instance-time-scale'
  if (lane.kind === 'brightness') return target.kind === 'clip-view' && target.property === 'brightness'
  if (lane.kind === 'transform') return target.kind === 'clip-transform' && target.property === lane.property
  return target.kind === 'instance-control' && target.exportName === lane.exportName
}

function zoneLaneValue(facts: AuthoredClipFacts | null, target: ZoneLaneTarget, fallback: number): number {
  if (!facts) return fallback
  if (target.kind === 'timeScale') return facts.owner.timeScale
  if (target.kind === 'brightness') return facts.owner.view.brightness
  if (target.kind === 'transform') {
    const transform = facts.owner.transform
    if (!transform) return target.property === 'scaleX' || target.property === 'scaleY' ? 1 : 0
    return transform[target.property]
  }
  return facts.owner.controlTargets?.[target.exportName] ?? fallback
}

function zoneValueLanesV2(
  record: ShowRecordV2,
  controls: readonly ShowEditorPropertyLaneControlV2[],
): ShowEditorPropertyLaneV2[] {
  const showEndMs = Math.max(1, record.composition.showEndMs)
  // v1 lists a control lane for every control any Clip automates; the authored
  // v2 record names the same set through its Pattern instances.
  const automated = [...new Set(record.composition.patternInstances
    .flatMap(instance => Object.keys(instance.controlTargets ?? {})))]
  const targets: ZoneLaneTarget[] = [
    { kind: 'timeScale' },
    { kind: 'brightness' },
    ...([
      ['positionX', 'position x'],
      ['positionY', 'position y'],
      ['rotation', 'rotation'],
      ['scaleX', 'scale x'],
      ['scaleY', 'scale y'],
    ] as const).map(([property, label]) => ({ kind: 'transform' as const, property, label })),
    ...automated.map(exportName => {
      const control = controls.find(candidate => candidate.exportName === exportName)
      return {
        kind: 'control' as const,
        exportName,
        label: control?.label ?? exportName.replace(/^slider/, '').replace(/([A-Z])/g, ' $1').trim(),
        defaultValue: control?.defaultValue ?? 0.5,
      }
    }),
  ]
  return record.zones.flatMap(zone => {
    // v1 reads the Zone's main slot; the authored record's base Layer is the
    // same place in the composition.
    const baseLayer = record.composition.layers
      .filter(layer => layer.zoneId === zone.id)
      .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))[0]
    if (!baseLayer) return []
    const clips = record.composition.clips
      .filter(clip => clip.layerId === baseLayer.id)
      .sort((left, right) => left.startMs - right.startMs || left.id.localeCompare(right.id))
    return targets.flatMap((target): ShowEditorPropertyLaneV2[] => {
      const defaultValue = target.kind === 'control'
        ? target.defaultValue
        : target.kind === 'transform'
          ? target.property === 'scaleX' || target.property === 'scaleY' ? 1 : 0
          : 1
      const constraint = target.kind === 'timeScale'
        ? { min: 0, max: 4 }
        : target.kind === 'transform'
          ? target.property === 'positionX' || target.property === 'positionY'
            ? { min: -4, max: 4 }
            : target.property === 'rotation' ? { min: -8, max: 8 } : { min: 0.01, max: 8 }
          : { min: 0, max: 1 }
      const values = clips.map(clip => zoneLaneValue(clipLaneFacts(record, clip), target, defaultValue))
      const segments: ShowPropertyLaneSegment[] = []
      const beats: ShowPropertyLaneBeatInput[] = []
      clips.forEach((clip, index) => {
        const value = values[index]!
        segments.push({
          id: `${clip.id}:hold`,
          startMs: clip.startMs,
          endMs: clip.startMs + clip.durationMs,
          from: value,
          to: value,
          easing: { curve: 'linear' },
        })
        const next = clips[index + 1]
        if (!next) return
        const gapStartMs = clip.startMs + clip.durationMs
        const gapEndMs = next.startMs
        if (gapEndMs <= gapStartMs) return
        // The window between two Clips is v1's boundary column. A ramp on the
        // Transition drives the value across it; otherwise it holds, exactly as
        // v1's `transition-hold` segment does.
        const transition = record.composition.transitions.find(candidate => (
          candidate.participants.some(participant => (
            participant.zoneId === zone.id
            && participant.layerId === baseLayer.id
            && participant.fromClipId === clip.id
            && participant.toClipId === next.id
          ))
        ))
        const ramp = transition?.propertyRamps
          .find(candidate => rampMatchesZoneLaneTarget(candidate.target, target))
        const destinationValue = values[index + 1]!
        const rampDurationMs = Math.min(
          gapEndMs - gapStartMs,
          Math.max(0, ramp?.durationMs ?? transition?.durationMs ?? 0),
        )
        if (!transition || !ramp || rampDurationMs <= 0) {
          segments.push({
            id: `${clip.id}:boundary-hold`,
            startMs: gapStartMs,
            endMs: gapEndMs,
            from: value,
            to: value,
            easing: { curve: 'linear' },
          })
          return
        }
        const rampEndMs = gapStartMs + rampDurationMs
        segments.push({
          id: `${transition.id}:ramp`,
          startMs: gapStartMs,
          endMs: rampEndMs,
          from: ramp.from,
          to: destinationValue,
          easing: ramp.easing ?? transition.easing,
        })
        if (rampEndMs < gapEndMs) {
          segments.push({
            id: `${transition.id}:tail`,
            startMs: rampEndMs,
            endMs: gapEndMs,
            from: destinationValue,
            to: destinationValue,
            easing: { curve: 'linear' },
          })
        }
        beats.push(
          {
            id: `${transition.id}:start`,
            ownerId: transition.id,
            timeMs: gapStartMs,
            value: ramp.from,
            kind: 'boundary',
            label: `Boundary starts at ${gapStartMs} ms`,
          },
          {
            id: `${transition.id}:end`,
            ownerId: transition.id,
            timeMs: rampEndMs,
            value: destinationValue,
            kind: 'boundary',
            label: `Boundary reaches ${destinationValue} at ${rampEndMs} ms`,
          },
        )
      })
      const projection = projectShowPropertyLane({ durationMs: showEndMs, constraint, defaultValue, segments, beats })
      if (!projection.timeVarying) return []
      const family: ShowPropertyLaneFamily = target.kind === 'timeScale'
        ? 'time'
        : target.kind === 'brightness'
          ? 'appearance'
          : target.kind === 'transform' ? 'transform' : 'control'
      const propertyLabel = target.kind === 'timeScale'
        ? 'speed'
        : target.kind === 'brightness'
          ? 'brightness'
          : target.label
      return [{
        id: target.kind === 'control'
          ? `control:${target.exportName}`
          : target.kind === 'transform'
            ? `transform:${target.property}`
            : target.kind,
        zoneId: zone.id,
        label: target.kind === 'timeScale'
          ? 'animation speed'
          : target.kind === 'control' ? target.label : propertyLabel,
        propertyLabel,
        family,
        valueKind: target.kind === 'timeScale'
          ? 'multiplier'
          : target.kind === 'brightness' || target.kind === 'control' ? 'percent' : 'number',
        ariaKind: target.kind === 'control' ? 'control-lane' : 'lane',
        selectsTransition: true,
        projection,
      }]
    })
  })
}
