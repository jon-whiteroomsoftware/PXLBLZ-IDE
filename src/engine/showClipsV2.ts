import { validateShowRecordV2, type ShowClipV2, type ShowRecordV2 } from './showCompositionV2'
import { editShowClipPropertyTracksV2, findNewShowInstancePropertyTrackConflictV2 } from './showPropertyAnimationV2'

export type ShowClipEditIntentV2 =
  | { kind: 'move'; clipId: string; startMs: number }
  | { kind: 'trim' | 'extend'; clipId: string; startMs: number; endMs: number }
  | { kind: 'split'; clipId: string; atMs: number; rightClipId: string }
export type ShowClipEditRefusalV2 = 'invalid-record' | 'missing-clip' | 'invalid-intent' | 'unsupported-topology' | 'invalid-result'
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

function retainedAppearance(clip: ShowClipV2, start: number, end: number): ShowClipV2['appearance']['keys'] {
  const keys = clip.appearance.keys
  const held = [...keys].reverse().find(key => key.timeMs <= start) ?? keys[0]
  return [
    { ...structuredClone(held), timeMs: start },
    ...structuredClone(keys.filter(key => key !== held && key.timeMs > start && key.timeMs < end)),
  ]
}
