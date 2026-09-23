import { showV2LogicalClipKey, showV2LogicalClipSegmentIds, type ShowRecordV2 } from './showCompositionV2'
import { isConvertedBoundaryTransitionV2, transitionEndpoints, type ShowTransitionEditIntentV2 } from './showTransitionsV2'
import { planShowV2ClipDeleteRampProjections } from './showV2TransitionEditorModel'

export type ShowV2ClipDeleteIntent = Extract<ShowTransitionEditIntentV2, { kind: 'delete-clip' }>

export type ShowV2ClipDeleteRefusalReason =
  | 'final-clip'
  | 'missing-clip'
  | 'group-child'
  | 'ramp-unsupported'
  | 'invalid-request'

export type ShowV2ClipDeletePlan =
  | { kind: 'ready'; intent: ShowV2ClipDeleteIntent }
  | { kind: 'needs-confirm'; clipId: string; connectedTransitionIds: string[] }
  | { kind: 'refuse'; reason: ShowV2ClipDeleteRefusalReason; message: string }

export function showV2ClipCount(record: ShowRecordV2): number {
  const ordinaryClipCount = new Set(record.composition.clips.map(showV2LogicalClipKey)).size
  return ordinaryClipCount
    + record.composition.groupOccurrences.reduce((count, occurrence) => count + (
      record.composition.groupDefinitions
        .find((definition) => definition.id === occurrence.definitionId)?.clips.length ?? 0
    ), 0)
}

/**
 * v1 confirms only Layer Transitions (showLayerTransitionAuthoring.ts:426); a converted
 * Scene boundary is repaired by the delete owner without a dialog, as v1 deletes across
 * a Scene boundary without one. `converted-layer-transition` and native Transitions still ask.
 */
export function showV2ConnectedTransitionIds(record: ShowRecordV2, clipId: string): string[] {
  return record.composition.transitions
    .filter((transition) => !isConvertedBoundaryTransitionV2(transition))
    .filter((transition) => transitionEndpoints(transition).all.includes(clipId))
    .map((transition) => transition.id)
    .sort()
}

export function planShowV2ClipDelete(
  record: ShowRecordV2,
  clipId: string,
  options: { confirmed: boolean; allocate: () => string },
): ShowV2ClipDeletePlan {
  if (typeof clipId !== 'string' || clipId.trim().length === 0) {
    return { kind: 'refuse', reason: 'invalid-request', message: 'Choose one ordinary Clip to delete.' }
  }
  if (clipId.includes(':')) {
    return { kind: 'refuse', reason: 'group-child', message: 'A Group Clip use is edited through its Group occurrence.' }
  }
  const clip = record.composition.clips.find((candidate) => candidate.id === clipId)
  if (!clip) {
    return { kind: 'refuse', reason: 'missing-clip', message: `Clip "${clipId}" does not exist.` }
  }
  if (showV2ClipCount(record) <= 1) {
    return { kind: 'refuse', reason: 'final-clip', message: 'A Show must contain at least one Clip.' }
  }
  const connected = showV2LogicalClipSegmentIds(record.composition, clipId)
    .flatMap((segmentId) => showV2ConnectedTransitionIds(record, segmentId))
    .filter((transitionId, index, ids) => ids.indexOf(transitionId) === index)
    .sort()
  if (connected.length > 0 && !options.confirmed) {
    return { kind: 'needs-confirm', clipId, connectedTransitionIds: connected }
  }
  const ramps = planShowV2ClipDeleteRampProjections(record, clipId, options.allocate)
  if (ramps.status === 'refused') {
    return { kind: 'refuse', reason: 'ramp-unsupported', message: ramps.message }
  }
  return {
    kind: 'ready',
    intent: {
      kind: 'delete-clip',
      clipId,
      ...(ramps.plans.length > 0 ? { propertyRampProjections: ramps.plans } : {}),
    },
  }
}
