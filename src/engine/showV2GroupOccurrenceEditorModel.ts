import type { ShowRecordV2, ShowTransitionV2 } from './showCompositionV2'
import type { DeleteShowGroupOccurrenceIntentV2, DuplicateShowGroupOccurrenceIntentV2, EditShowGroupDefinitionClipAppearanceIntentV2, InsertShowGroupDefinitionLayerTransitionIntentV2, MakeShowGroupUniqueIntentV2, MoveShowGroupOccurrenceIntentV2, ResizeShowGroupDefinitionLayerTransitionIntentV2, SetShowGroupDefinitionClipTimingIntentV2, ShowGroupOccurrencePlacementV2, ShowGroupUniqueIdentityPlanV2, UngroupShowGroupOccurrenceIntentV2, WriteShowGroupDefinitionInstancePropertiesIntentV2 } from './showGroupEditsV2'
import { groupDefinitionAsRecord, groupOccurrenceDuration, groupOccurrenceLocalTimeAtV2, occurrenceBoundaryAfter } from './showGroupsV2'
import { planShowV2ClipInspectorPatch } from './showV2ClipAppearancePlanning'
import type { ShowV2RemovedControlTarget } from './showV2ClipAppearancePlanning'
import type { ShowClipInspectorPatch } from './showClipInspectorModel'
import { planShowV2GroupLayerTransitionInsertion } from './showV2LayerTransitionInsertion'
import { showTransitionChangesForPresentation } from './showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'

export type ShowV2GroupOccurrenceIntent = MoveShowGroupOccurrenceIntentV2 | DuplicateShowGroupOccurrenceIntentV2 | MakeShowGroupUniqueIntentV2 | UngroupShowGroupOccurrenceIntentV2 | DeleteShowGroupOccurrenceIntentV2 | SetShowGroupDefinitionClipTimingIntentV2 | EditShowGroupDefinitionClipAppearanceIntentV2 | WriteShowGroupDefinitionInstancePropertiesIntentV2 | ResizeShowGroupDefinitionLayerTransitionIntentV2 | InsertShowGroupDefinitionLayerTransitionIntentV2
export type ShowV2GroupOccurrenceRequest =
  | { kind: 'move-occurrence' | 'duplicate-occurrence'; occurrenceId: string; placement: Omit<ShowGroupOccurrencePlacementV2, 'layoutOccurrenceId'> }
  | { kind: 'make-unique' | 'ungroup-occurrence' | 'delete-occurrence'; occurrenceId: string }
  | { kind: 'set-child-timing'; occurrenceId: string; clipId: string; startMs?: number; durationMs?: number }
  | { kind: 'set-child-inspector-patch'; occurrenceId: string; clipId: string; patch: ShowClipInspectorPatch }
  | { kind: 'resize-definition-layer-transition'; occurrenceId: string; transitionId: string; durationMs: number }
  | { kind: 'insert-definition-layer-transition'; occurrenceId: string; fromClipId: string; toClipId: string; kindKey: string; durationMs: number }
export function buildShowV2GroupOccurrenceEditorModel(record: ShowRecordV2) {
  return {
    occurrences: record.composition.groupOccurrences.map(occurrence => {
      const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
      return { id: occurrence.id, name: definition.name, startMs: occurrence.startMs,
        endMs: occurrence.startMs + groupOccurrenceDuration(definition, occurrence),
        holdDurationMs: occurrence.holds.reduce((sum, hold) => sum + hold.durationMs, 0),
        layers: definition.layers.map(layer => ({ id: layer.id, name: layer.name })) }
    }).sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id)),
    zones: record.zones.map(zone => ({ id: zone.id, name: zone.name })),
    layers: record.composition.layers.map(layer => ({ id: layer.id, zoneId: layer.zoneId, name: layer.name })),
  }
}

/** Names the refusals the Group panels explain to the user (#1098); the rest carry none. */
export type ShowV2GroupOccurrenceRefusalCode = 'missing-entity' | 'no-layout' | 'ends-in-hold' | 'entry-policy-unsupported' | 'multi-key-clip' | 'no-change'
type GroupRefused = { status: 'refused'; message: string; code?: ShowV2GroupOccurrenceRefusalCode }

type GroupInsertKindSettings = Omit<ShowTransitionV2, 'id' | 'durationMs' | 'participants' | 'wholeOutput' | 'propertyRamps'> & { easing?: ShowTransitionV2['easing'] }

/**
 * Catalogue defaults for one palette kind key. The palette gates
 * compatibility against the live Stage; catalogue keys are
 * stage-independent, so the planner resolves them across Stages.
 */
function groupInsertKindSettings(
  kindKey: string,
): { status: 'ready'; value: GroupInsertKindSettings } | { status: 'refused'; message: string } {
  for (const stageDimensions of [2, 1, 3] as const) {
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions })
      .find(candidate => candidate.kind === 'transition' && candidate.key === kindKey && candidate.variantId !== 'cut')
    if (!item) continue
    const { durationMs: _durationMs, ...changes } = showTransitionChangesForPresentation(item)
    if (changes.kind === undefined || changes.kind === 'cut' || changes.kind === 'routing') {
      return { status: 'refused', message: 'Cut is the absence of a Transition; choose a visual kind.' }
    }
    return { status: 'ready', value: structuredClone(changes) as GroupInsertKindSettings }
  }
  return { status: 'refused', message: 'Choose a Transition kind for this Stage.' }
}

/** Plans only explicit placement/identities. Existing pure owners validate choreography. */
export function planShowV2GroupOccurrenceEdit(record: ShowRecordV2, request: ShowV2GroupOccurrenceRequest, allocate: () => string):
  { status: 'ready'; intent: ShowV2GroupOccurrenceIntent; removedControls?: ShowV2RemovedControlTarget[]; overwritesHeldSegments?: number } | GroupRefused {
  const occurrence = record.composition.groupOccurrences.find(value => value.id === request.occurrenceId)
  if (!occurrence) return { status: 'refused', code: 'missing-entity', message: 'Select an existing Group occurrence.' }
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence.definitionId)!
  try {
    const fresh = (reserved: Set<string>) => {
      const id = allocate()
      if (typeof id !== 'string' || !id.trim() || reserved.has(id)) throw Error('Fresh Group identities conflict. Try the edit again.')
      reserved.add(id); return id
    }
    if (request.kind === 'move-occurrence' || request.kind === 'duplicate-occurrence') {
      const placement = request.placement
      const layout = record.composition.layoutOccurrences.find(value => placement.startMs >= value.startMs && placement.startMs < value.startMs + value.durationMs)
      if (!layout) return { status: 'refused', code: 'no-layout', message: 'The requested start needs an existing Layout occurrence.' }
      const common = { ...structuredClone(placement), layoutOccurrenceId: layout.id, occurrenceId: occurrence.id }
      return { status: 'ready', intent: request.kind === 'move-occurrence'
        ? { kind: 'move-occurrence', ...common }
        : { kind: 'duplicate-occurrence', ...common, newOccurrenceId: fresh(new Set(record.composition.groupOccurrences.map(value => value.id))) } }
    }
    if (request.kind === 'set-child-timing') {
      const child = definition.clips.find(value => value.id === request.clipId)
      if (!child) return { status: 'refused', code: 'missing-entity', message: 'Select an existing Group Clip.' }
      const hasStart = request.startMs !== undefined
      const hasDuration = request.durationMs !== undefined
      if (!hasStart && !hasDuration) return { status: 'refused', message: 'Give a Start and/or Duration for one Group Clip.' }
      if (hasStart && (typeof request.startMs !== 'number' || !Number.isFinite(request.startMs))) {
        return { status: 'refused', message: 'Give a finite Show-time Start for one Group Clip.' }
      }
      if (hasDuration && (typeof request.durationMs !== 'number' || !Number.isFinite(request.durationMs))) {
        return { status: 'refused', message: 'Give a finite Duration for one Group Clip.' }
      }
      // A Duration that rounds to zero or below is invalid, not a hold: it
      // carries no code, so the panel shows the fallback (#1098).
      if (hasDuration && Math.round(request.durationMs!) <= 0) {
        return { status: 'refused', message: 'Give a positive Duration for one Group Clip.' }
      }
      // The panel shows Show time, which is converted back the way Start is (#1075 G2a review).
      const localStart = hasStart ? Math.round(groupOccurrenceLocalTimeAtV2(occurrence, Math.round(request.startMs!))) : child.startMs
      let localDuration: number | undefined
      if (hasDuration) {
        const showStart = occurrenceBoundaryAfter(occurrence, localStart)
        const localEnd = groupOccurrenceLocalTimeAtV2(occurrence, showStart + Math.round(request.durationMs!))
        localDuration = localEnd - localStart
        if (!Number.isSafeInteger(localDuration) || localDuration <= 0) {
          return { status: 'refused', code: 'ends-in-hold', message: "Duration must end after the Clip's start outside a hold." }
        }
      }
      const intent: SetShowGroupDefinitionClipTimingIntentV2 = {
        kind: 'set-definition-clip-timing',
        definitionId: definition.id,
        clipId: child.id,
        ...(hasStart ? { startMs: localStart } : {}),
        ...(hasDuration ? { durationMs: localDuration! } : {}),
      }
      return { status: 'ready', intent }
    }
    if (request.kind === 'set-child-inspector-patch') {
      const child = definition.clips.find(value => value.id === request.clipId)
      if (!child) return { status: 'refused', code: 'missing-entity', message: 'Select an existing Group Clip.' }
      const plan = planShowV2ClipInspectorPatch(groupDefinitionAsRecord(record, definition), request.clipId, request.patch)
      if (plan.kind === 'appearance') {
        const intent: EditShowGroupDefinitionClipAppearanceIntentV2 = {
          kind: 'edit-definition-clip-appearance',
          definitionId: definition.id,
          appearance: plan.intent,
        }
        return { status: 'ready', intent, overwritesHeldSegments: plan.overwritesHeldSegments }
      }
      if (plan.kind === 'instance-properties') {
        const intent: WriteShowGroupDefinitionInstancePropertiesIntentV2 = {
          kind: 'write-definition-instance-properties',
          definitionId: definition.id,
          clipId: plan.intent.clipId,
          properties: plan.intent.properties,
        }
        return { status: 'ready', intent, removedControls: plan.removedControls }
      }
      if (plan.kind === 'replacement') return { status: 'refused', message: 'Changing a Group Clip\'s Pattern is not connected yet.' }
      if (plan.kind === 'refuse') {
        const code = plan.reason === 'missing-clip' ? 'missing-entity' : plan.reason === 'multi-key-clip' ? 'multi-key-clip' : undefined
        return { status: 'refused', ...(code ? { code } : {}), message: plan.message }
      }
      if (plan.kind === 'entry-policy') return { status: 'refused', code: 'entry-policy-unsupported', message: 'Changing a Group Clip\'s entry policy is not connected yet.' }
      return { status: 'refused', code: 'no-change', message: 'No change.' }
    }
    if (request.kind === 'resize-definition-layer-transition') {
      const transition = definition.transitions.find(value => value.id === request.transitionId)
      if (!transition) return { status: 'refused', code: 'missing-entity', message: 'Select an existing Group Transition.' }
      if (typeof request.durationMs !== 'number' || !Number.isFinite(request.durationMs) || request.durationMs < 0) {
        return { status: 'refused', message: 'Give a finite Duration for one Group Transition.' }
      }
      const durationMs = Math.round(request.durationMs)
      if (durationMs === transition.durationMs) return { status: 'refused', code: 'no-change', message: 'No change.' }
      const intent: ResizeShowGroupDefinitionLayerTransitionIntentV2 = {
        kind: 'resize-definition-layer-transition',
        definitionId: definition.id,
        transitionId: transition.id,
        durationMs,
      }
      return { status: 'ready', intent }
    }
    if (request.kind === 'insert-definition-layer-transition') {
      const fromClip = definition.clips.find(value => value.id === request.fromClipId)
      const toClip = definition.clips.find(value => value.id === request.toClipId)
      if (!fromClip || !toClip) return { status: 'refused', message: 'Select two Group Clips that follow each other on one Layer.' }
      if (fromClip.layerId !== toClip.layerId) return { status: 'refused', message: 'A Transition joins two Group Clips on the same definition Layer.' }
      const insertion = planShowV2GroupLayerTransitionInsertion(record, occurrence.id, fromClip.id, toClip.id)
      if (!insertion.enabled) return { status: 'refused', message: insertion.reason }
      const durationMs = Math.min(Math.round(request.durationMs), insertion.maxDurationMs)
      if (!Number.isSafeInteger(durationMs) || durationMs <= 0) {
        return { status: 'refused', message: 'A Transition requires a positive whole-millisecond duration.' }
      }
      const settings = groupInsertKindSettings(request.kindKey)
      if (settings.status !== 'ready') return settings
      const id = fresh(new Set([...record.composition.transitions.map(value => value.id), ...definition.transitions.map(value => value.id)]))
      const { kind, ...rest } = settings.value
      const intent: InsertShowGroupDefinitionLayerTransitionIntentV2 = {
        kind: 'insert-definition-layer-transition',
        definitionId: definition.id,
        transition: {
          ...rest,
          id,
          kind,
          durationMs,
          easing: rest.easing ?? { curve: 'linear' },
          ...(kind === 'crossfade' ? { crossfadePolicy: 'live-live' as const } : {}),
          participants: [{ id: `${id}:participant`, zoneId: 'definition-zone', layerId: fromClip.layerId, fromClipId: fromClip.id, toClipId: toClip.id }],
          propertyRamps: [],
        },
      }
      return { status: 'ready', intent }
    }
    if (request.kind !== 'make-unique') return { status: 'ready', intent: { kind: request.kind, occurrenceId: occurrence.id } }
    const definitions = record.composition.groupDefinitions
    const map = (ids: string[], reserved: string[]) => {
      const used = new Set(reserved)
      return Object.fromEntries(ids.map(id => [id, fresh(used)]))
    }
    const appearanceReserved = new Set([...record.composition.clips, ...definitions.flatMap(value => value.clips)].flatMap(clip => clip.appearance.keys.map(key => key.id)))
    const propertyReserved = new Set([...record.composition.propertyTracks, ...definitions.flatMap(value => value.propertyTracks)].flatMap(track => track.keyframes.map(key => key.id)))
    const identities: ShowGroupUniqueIdentityPlanV2 = {
      definitionId: fresh(new Set(definitions.map(value => value.id))),
      patternInstanceIds: map(definition.patternInstances.map(value => value.id), [...record.composition.patternInstances, ...definitions.flatMap(value => value.patternInstances)].map(value => value.id)),
      layerIds: map(definition.layers.map(value => value.id), [...record.composition.layers, ...definitions.flatMap(value => value.layers)].map(value => value.id)),
      clipIds: map(definition.clips.map(value => value.id), [...record.composition.clips, ...definitions.flatMap(value => value.clips)].map(value => value.id)),
      transitionIds: map(definition.transitions.map(value => value.id), [...record.composition.transitions, ...definitions.flatMap(value => value.transitions)].map(value => value.id)),
      propertyTrackIds: map(definition.propertyTracks.map(value => value.id), [...record.composition.propertyTracks, ...definitions.flatMap(value => value.propertyTracks)].map(value => value.id)),
      appearanceKeyIdsByClipId: Object.fromEntries(definition.clips.map(clip => [clip.id, Object.fromEntries(clip.appearance.keys.map(key => [key.id, fresh(appearanceReserved)]))])),
      propertyKeyIdsByTrackId: Object.fromEntries(definition.propertyTracks.map(track => [track.id, Object.fromEntries(track.keyframes.map(key => [key.id, fresh(propertyReserved)]))])),
    }
    return { status: 'ready', intent: { kind: 'make-unique', occurrenceId: occurrence.id, identities } }
  } catch (error) { return { status: 'refused', message: error instanceof Error ? error.message : 'Fresh Group identities conflict.' } }
}

/**
 * The highest Base Layer the Group panel can place this occurrence on: the
 * largest rank offset at which every definition Layer finds a Layer of the
 * occurrence's Zone, the same rebinding the panel's Place request builds.
 * `null` when the occurrence or its definition is gone (#1098).
 */
export function showV2GroupBaseLayerMax(record: ShowRecordV2, occurrenceId: string): number | null {
  const occurrence = record.composition.groupOccurrences.find(value => value.id === occurrenceId)
  const definition = record.composition.groupDefinitions.find(value => value.id === occurrence?.definitionId)
  if (!occurrence || !definition) return null
  const ranks = new Set(record.composition.layers.filter(layer => layer.zoneId === occurrence.zoneId).map(layer => layer.rank))
  for (let base = Math.max(-1, ...ranks); base >= 0; base -= 1) {
    if (definition.layers.every(layer => ranks.has(base + layer.rank))) return base
  }
  return null
}
