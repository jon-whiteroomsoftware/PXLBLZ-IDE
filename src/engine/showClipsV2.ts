import { validateShowRecordV2, type ShowClipV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { validateClipLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { editShowClipPropertyTracksV2, findNewShowInstancePropertyTrackConflictV2 } from './showPropertyAnimationV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'

export interface ShowClipDuplicateTrackIdentityV2 {
  trackId: string
  keyframeIdsBySourceId: Readonly<Record<string, string>>
}

export interface ShowClipDuplicateIdentityPlanV2 {
  clipId: string
  appearanceKeyIdsBySourceId: Readonly<Record<string, string>>
  clipTrackIdentitiesBySourceTrackId: Readonly<Record<string, ShowClipDuplicateTrackIdentityV2>>
}

export type ShowClipEditIntentV2 =
  | { kind: 'move'; clipId: string; startMs: number }
  | { kind: 'trim' | 'extend'; clipId: string; startMs: number; endMs: number }
  | { kind: 'split'; clipId: string; atMs: number; rightClipId: string }
  | {
      kind: 'duplicate'
      clipId: string
      zoneId: string
      layerId: string
      startMs: number
      identities: ShowClipDuplicateIdentityPlanV2
    }
export type ShowClipEditRefusalV2 = 'invalid-record' | 'missing-clip' | 'invalid-intent' | 'unsupported-topology' | 'compiler-ineligible' | 'invalid-result'
export type ShowClipEditResultV2 =
  | { status: 'changed'; record: ShowRecordV2; affectedClipIds: string[]; affectedTrackIds: string[] }
  | { status: 'unchanged'; record: ShowRecordV2; affectedClipIds: []; affectedTrackIds: [] }
  | { status: 'refused'; record: ShowRecordV2; code: ShowClipEditRefusalV2; message: string; affectedClipIds: []; affectedTrackIds: [] }

/** Additive v2 engine owner. Adoption, history and saving remain caller-owned. */
export function editShowClipV2(record: ShowRecordV2, intent: ShowClipEditIntentV2): ShowClipEditResultV2 {
  const refuse = (code: ShowClipEditRefusalV2, message: string): ShowClipEditResultV2 => ({
    status: 'refused', record, code, message, affectedClipIds: [], affectedTrackIds: [],
  })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  const composition = record.composition
  const index = composition.clips.findIndex(clip => clip.id === intent.clipId)
  if (index < 0) return refuse('missing-clip', `Clip "${intent.clipId}" does not exist.`)
  const clip = composition.clips[index]
  if (intent.kind === 'duplicate') return duplicateShowClipV2(record, clip, intent, refuse)
  const oldEnd = clip.startMs + clip.durationMs
  const start = intent.kind === 'split' ? clip.startMs : intent.startMs
  const end = intent.kind === 'split' ? intent.atMs : intent.kind === 'move' ? start + clip.durationMs : intent.endMs
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > composition.showEndMs) {
    return refuse('invalid-intent', 'Clip interval must use safe integer milliseconds within Show End.')
  }
  if (intent.kind === 'trim' && (start < clip.startMs || end > oldEnd)) return refuse('invalid-intent', 'Trim must stay inside the current Clip.')
  if (intent.kind === 'extend' && (start > clip.startMs || end < oldEnd)) return refuse('invalid-intent', 'Extension must contain the current Clip.')
  if (intent.kind === 'split' && (end >= oldEnd || !intent.rightClipId.trim() || composition.clips.some(candidate => candidate.id === intent.rightClipId))) {
    return refuse('invalid-intent', 'Split requires an interior time and a fresh right Clip ID.')
  }
  if (start === clip.startMs && end === oldEnd) return { status: 'unchanged', record, affectedClipIds: [], affectedTrackIds: [] }
  if (composition.transitions.length || composition.groupOccurrences.length || composition.layoutOccurrences.length !== 1) {
    return refuse('unsupported-topology', 'This edit requires the Transition, Group or Layout-crossing authoring owner.')
  }
  const layout = record.zoneLayouts.find(candidate => candidate.id === composition.layoutOccurrences[0].layoutId)!
  const activeZoneIds = layout.logical?.zoneIds ?? (layout.zones.length ? layout.zones.map(zone => zone.zoneId) : record.zones.map(zone => zone.id))
  if (!activeZoneIds.includes(clip.zoneId)) return refuse('unsupported-topology', 'The Clip Zone is absent from the active Layout.')
  const trackEdit = editShowClipPropertyTracksV2(record, clip, intent)
  const newTrackConflict = findNewShowInstancePropertyTrackConflictV2(composition.propertyTracks, trackEdit.propertyTracks)
  if (newTrackConflict) {
    return refuse('invalid-result', `Instance animation tracks "${newTrackConflict.trackIds[0]}" and "${newTrackConflict.trackIds[1]}" would overlap for the same target.`)
  }
  const next = structuredClone(record)
  const edited = next.composition.clips[index]
  edited.startMs = start
  edited.durationMs = end - start
  next.composition.propertyTracks = trackEdit.propertyTracks
  const affectedTrackIds = trackEdit.affectedTrackIds
  if (intent.kind === 'move') {
    const delta = start - clip.startMs
    edited.appearance.keys.forEach(key => { key.timeMs += delta })
  } else edited.appearance.keys = retainedAppearance(clip, start, end)
  if (intent.kind === 'split') {
    next.composition.clips.splice(index + 1, 0, {
      ...structuredClone(clip), id: intent.rightClipId, startMs: intent.atMs,
      durationMs: oldEnd - intent.atMs, entryPolicy: 'continue',
      appearance: { keys: retainedAppearance(clip, intent.atMs, oldEnd) },
    })
  }
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  return { status: 'changed', record: next, affectedClipIds: intent.kind === 'split' ? [clip.id, intent.rightClipId] : [clip.id], affectedTrackIds }
}

function duplicateShowClipV2(
  record: ShowRecordV2,
  clip: ShowClipV2,
  intent: Extract<ShowClipEditIntentV2, { kind: 'duplicate' }>,
  refuse: (code: ShowClipEditRefusalV2, message: string) => ShowClipEditResultV2,
): ShowClipEditResultV2 {
  const endMs = intent.startMs + clip.durationMs
  if (!Number.isSafeInteger(intent.startMs) || intent.startMs < 0
    || !Number.isSafeInteger(endMs) || endMs > record.composition.showEndMs) {
    return refuse('invalid-intent', 'Duplicate interval must use safe integer milliseconds within Show End.')
  }
  const rawPlan: unknown = intent.identities
  if (!isRecord(rawPlan)
    || typeof rawPlan.clipId !== 'string'
    || !isRecord(rawPlan.appearanceKeyIdsBySourceId)
    || !isRecord(rawPlan.clipTrackIdentitiesBySourceTrackId)) {
    return refuse('invalid-intent', 'Duplicate requires a complete identity plan.')
  }
  const plan = rawPlan as unknown as ShowClipDuplicateIdentityPlanV2
  const effective = record.composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record
  const usedClipIds = new Set(effective.composition.clips.map(candidate => candidate.id))
  if (!plan.clipId.trim() || usedClipIds.has(plan.clipId)) {
    return refuse('invalid-intent', 'Duplicate requires a fresh nonblank Clip identity.')
  }
  const sourceTracks = record.composition.propertyTracks.filter(track => (
    'clipId' in track.target && track.target.clipId === clip.id
  ))
  if (!exactKeys(plan.appearanceKeyIdsBySourceId, clip.appearance.keys.map(key => key.id))
    || !exactKeys(plan.clipTrackIdentitiesBySourceTrackId, sourceTracks.map(track => track.id))) {
    return refuse('invalid-intent', 'Duplicate requires complete exact appearance and Clip-track identity maps.')
  }
  if (sourceTracks.some(track => {
    const identity: unknown = plan.clipTrackIdentitiesBySourceTrackId[track.id]
    return !isRecord(identity)
      || typeof identity.trackId !== 'string'
      || !isRecord(identity.keyframeIdsBySourceId)
  })) {
    return refuse('invalid-intent', 'Duplicate requires a complete identity for every Clip-owned track.')
  }
  const appearanceIds = clip.appearance.keys.map(key => plan.appearanceKeyIdsBySourceId[key.id])
  const trackIds = sourceTracks.map(track => plan.clipTrackIdentitiesBySourceTrackId[track.id]?.trackId ?? '')
  const keyIds = sourceTracks.flatMap(track => track.keyframes.map(key => (
    plan.clipTrackIdentitiesBySourceTrackId[track.id]?.keyframeIdsBySourceId[key.id] ?? ''
  )))
  const usedAppearanceIds = new Set(effective.composition.clips.flatMap(candidate => (
    candidate.appearance.keys.map(key => key.id)
  )))
  const usedTrackIds = new Set(effective.composition.propertyTracks.map(track => track.id))
  const usedKeyIds = new Set(effective.composition.propertyTracks.flatMap(track => (
    track.keyframes.map(key => key.id)
  )))
  if ([...appearanceIds, ...trackIds, ...keyIds].some(id => typeof id !== 'string' || !id.trim())
    || new Set(appearanceIds).size !== appearanceIds.length
    || new Set(trackIds).size !== trackIds.length
    || new Set(keyIds).size !== keyIds.length
    || appearanceIds.some(id => usedAppearanceIds.has(id))
    || trackIds.some(id => usedTrackIds.has(id))
    || keyIds.some(id => usedKeyIds.has(id))
    || sourceTracks.some(track => !exactKeys(
      plan.clipTrackIdentitiesBySourceTrackId[track.id].keyframeIdsBySourceId,
      track.keyframes.map(key => key.id),
    ))) {
    return refuse('invalid-intent', 'Duplicate identities must be complete, nonblank and unique.')
  }

  const deltaMs = intent.startMs - clip.startMs
  const next = structuredClone(record)
  next.composition.clips.push({
    ...structuredClone(clip),
    id: plan.clipId,
    zoneId: intent.zoneId,
    layerId: intent.layerId,
    startMs: intent.startMs,
    appearance: {
      keys: clip.appearance.keys.map(key => ({
        ...structuredClone(key),
        id: plan.appearanceKeyIdsBySourceId[key.id],
        timeMs: key.timeMs + deltaMs,
      })),
    },
  })
  const copies = sourceTracks.map(track => {
    const identity = plan.clipTrackIdentitiesBySourceTrackId[track.id]
    return {
      ...structuredClone(track),
      id: identity.trackId,
      target: { ...structuredClone(track.target), clipId: plan.clipId },
      activeStartMs: track.activeStartMs + deltaMs,
      keyframes: track.keyframes.map(key => ({
        ...structuredClone(key),
        id: identity.keyframeIdsBySourceId[key.id],
        timeMs: key.timeMs + deltaMs,
      })),
    }
  })
  next.composition.propertyTracks.push(...copies)
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const availabilityIssue = validateClipLayoutAvailabilityV2(next, [plan.clipId])[0]
  if (availabilityIssue) {
    return refuse(
      'invalid-result',
      `Clip "${plan.clipId}" Zone is unavailable in Layout occurrence "${availabilityIssue.layoutOccurrenceId}".`,
    )
  }
  const compilerRestriction = firstShowTransitionPlacementRestrictionV2(next)
  if (compilerRestriction) return refuse('compiler-ineligible', compilerRestriction.message)
  return {
    status: 'changed', record: next, affectedClipIds: [plan.clipId], affectedTrackIds: trackIds,
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactKeys(value: unknown, expected: readonly string[]): boolean {
  if (!isRecord(value)) return false
  const actual = Object.keys(value).sort()
  return JSON.stringify(actual) === JSON.stringify([...expected].sort())
}

function retainedAppearance(clip: ShowClipV2, start: number, end: number): ShowClipV2['appearance']['keys'] {
  const keys = clip.appearance.keys
  const held = [...keys].reverse().find(key => key.timeMs <= start) ?? keys[0]
  return [
    { ...structuredClone(held), timeMs: start },
    ...structuredClone(keys.filter(key => key !== held && key.timeMs > start && key.timeMs < end)),
  ]
}
