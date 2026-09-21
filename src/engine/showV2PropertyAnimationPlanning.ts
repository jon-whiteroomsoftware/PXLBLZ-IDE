import type { ShowPropertyAnimationTarget } from './personalContentRecords'
import type { ShowPropertyAnimationChange } from './showPropertyAnimationEditorModel'
import { targetBelongsToClip } from './showEditorInspectorPresentation'
import type { ShowPropertyEditIntentV2, ShowPropertyTrackOwnerV2 } from './showPropertyEditsV2'
import { convertPropertyTarget } from './showV2ValueConversion'
import type { ShowClipV2, ShowPropertyKeyframeV2, ShowRecordV2 } from './showCompositionV2'

export interface ShowV2PropertyAnimationFrame {
  showTimeOffsetMs: number
  storageDurationMs: number
}

export type ShowV2PropertyAnimationPlan =
  | { kind: 'edit'; propertyOwner: ShowPropertyTrackOwnerV2; intent: ShowPropertyEditIntentV2 }
  | { kind: 'no-op' }
  | { kind: 'refuse'; code: 'missing-clip' | 'foreign-target' | 'missing-track'; message: string }

function toSideContainsClip(
  transition: ShowRecordV2['composition']['transitions'][number],
  clipId: string,
): boolean {
  return (transition.wholeOutput?.toClipIds.includes(clipId) ?? false)
    || transition.participants.some(participant => participant.toClipId === clipId)
}

function fromSideContainsClip(
  transition: ShowRecordV2['composition']['transitions'][number],
  clipId: string,
): boolean {
  return (transition.wholeOutput?.fromClipIds.includes(clipId) ?? false)
    || transition.participants.some(participant => participant.fromClipId === clipId)
}

function boundaryWindowEndMs(record: ShowRecordV2, transition: ShowRecordV2['composition']['transitions'][number], clipId: string): number | undefined {
  if (transition.wholeOutput) return transition.wholeOutput.startMs + transition.durationMs
  const participant = transition.participants.find(candidate => candidate.toClipId === clipId)
  if (!participant) return undefined
  return record.composition.clips.find(candidate => candidate.id === participant.toClipId)?.startMs
}

function boundaryWindowStartMs(record: ShowRecordV2, transition: ShowRecordV2['composition']['transitions'][number], clipId: string): number | undefined {
  if (transition.wholeOutput) return transition.wholeOutput.startMs
  const participant = transition.participants.find(candidate => candidate.fromClipId === clipId)
  if (!participant) return undefined
  const clip = record.composition.clips.find(candidate => candidate.id === participant.fromClipId)
  return clip === undefined ? undefined : clip.startMs + clip.durationMs
}

function activationWindow(
  record: ShowRecordV2,
  clip: ShowClipV2,
  frame: ShowV2PropertyAnimationFrame,
  target: ShowRecordV2['composition']['propertyTracks'][number]['target'],
): { activeStartMs: number; activeDurationMs: number } {
  const offset = frame.showTimeOffsetMs
  const end = offset + frame.storageDurationMs
  let incomingMs = 0
  let outgoingMs = 0
  for (const transition of record.composition.transitions) {
    if (transition.origin !== 'converted-boundary-transition') continue
    // First match wins, exactly as the converter's `visualBoundaries.find`:
    // one boundary owns each scene edge, so a second match is unreachable.
    if (incomingMs === 0 && toSideContainsClip(transition, clip.id) && boundaryWindowEndMs(record, transition, clip.id) === offset) {
      incomingMs = transition.durationMs
    }
    if (outgoingMs === 0 && fromSideContainsClip(transition, clip.id) && boundaryWindowStartMs(record, transition, clip.id) === end) {
      outgoingMs = transition.durationMs
    }
  }
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') {
    return { activeStartMs: offset, activeDurationMs: frame.storageDurationMs + outgoingMs }
  }
  return { activeStartMs: offset - incomingMs, activeDurationMs: frame.storageDurationMs + incomingMs + outgoingMs }
}

function planAddTrack(
  record: ShowRecordV2,
  clip: ShowClipV2,
  frame: ShowV2PropertyAnimationFrame,
  change: Extract<ShowPropertyAnimationChange, { kind: 'add-track' }>,
  newId: () => string,
  toRecordTime: (editorTimeMs: number) => number,
): ShowV2PropertyAnimationPlan {
  const target: ShowPropertyAnimationTarget = change.target
  if ('placementId' in target) {
    if (target.placementId !== clip.id) {
      return { kind: 'refuse', code: 'foreign-target', message: `Target placement "${target.placementId}" does not belong to Clip "${clip.id}".` }
    }
  } else if ('instanceId' in target) {
    if (target.instanceId !== clip.instanceId) {
      return { kind: 'refuse', code: 'foreign-target', message: `Target instance "${target.instanceId}" does not belong to Clip "${clip.id}".` }
    }
  } else {
    return { kind: 'refuse', code: 'foreign-target', message: `Target does not belong to Clip "${clip.id}".` }
  }
  const converted = convertPropertyTarget(target, new Map([[clip.id, clip.id]]))
  const sources = change.keyframes ?? [
    { timeMs: 0, value: change.initialValue, easing: { curve: 'linear' as const } },
    { timeMs: frame.storageDurationMs, value: change.initialValue, easing: { curve: 'linear' as const } },
  ]
  const trackId = newId()
  const keyframes = sources.map(source => ({
    id: newId(),
    timeMs: toRecordTime(source.timeMs),
    value: source.value,
    easing: structuredClone(source.easing),
  }))
  const { activeStartMs, activeDurationMs } = activationWindow(record, clip, frame, converted)
  return {
    kind: 'edit',
    propertyOwner: { kind: 'show' },
    intent: { kind: 'add-track', track: { id: trackId, target: converted, activeStartMs, activeDurationMs, keyframes } },
  }
}

export function planShowV2PropertyAnimationChange(
  record: ShowRecordV2,
  clipId: string,
  frame: ShowV2PropertyAnimationFrame,
  change: ShowPropertyAnimationChange,
  newId: () => string,
): ShowV2PropertyAnimationPlan {
  const clip = record.composition.clips.find(candidate => candidate.id === clipId)
  if (!clip) return { kind: 'refuse', code: 'missing-clip', message: `Clip "${clipId}" does not exist.` }
  const toRecordTime = (editorTimeMs: number): number => Math.round(editorTimeMs) + frame.showTimeOffsetMs
  if (change.kind === 'add-track') return planAddTrack(record, clip, frame, change, newId, toRecordTime)
  const track = record.composition.propertyTracks.find(candidate => candidate.id === change.trackId)
  if (!track || !targetBelongsToClip(track.target, clip.id, clip.instanceId)) {
    return { kind: 'refuse', code: 'missing-track', message: `Track "${change.trackId}" does not belong to Clip "${clipId}".` }
  }
  switch (change.kind) {
    case 'update-keyframe': {
      const patch: Partial<Pick<ShowPropertyKeyframeV2, 'timeMs' | 'value' | 'easing'>> = {}
      if (change.changes.timeMs !== undefined) patch.timeMs = toRecordTime(change.changes.timeMs)
      if (change.changes.value !== undefined) patch.value = change.changes.value
      if (change.changes.easing !== undefined) patch.easing = structuredClone(change.changes.easing)
      if (Object.keys(patch).length === 0) return { kind: 'no-op' }
      return { kind: 'edit', propertyOwner: { kind: 'show' }, intent: { kind: 'update-key', trackId: track.id, keyId: change.keyframeId, patch } }
    }
    case 'add-keyframe':
      return {
        kind: 'edit',
        propertyOwner: { kind: 'show' },
        intent: {
          kind: 'add-key',
          trackId: track.id,
          key: { id: newId(), timeMs: toRecordTime(change.keyframe.timeMs), value: change.keyframe.value, easing: structuredClone(change.keyframe.easing) },
        },
      }
    case 'delete-keyframe':
      if (track.keyframes.length <= 2) return { kind: 'no-op' }
      return { kind: 'edit', propertyOwner: { kind: 'show' }, intent: { kind: 'remove-key', trackId: track.id, keyId: change.keyframeId } }
    case 'delete-track':
      return { kind: 'edit', propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: track.id } }
  }
}
