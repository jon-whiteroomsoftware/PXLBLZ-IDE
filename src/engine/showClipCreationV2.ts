import { validateShowRecordV2, type ShowClipV2, type ShowRecordV2 } from './showCompositionV2'
import type { ShowPatternInstance, ShowPatternRef } from './personalContentRecords'
import type { ShowClipEditRefusalV2, ShowClipEditResultV2 } from './showClipsV2'
import { materializeShowGroupsV2, defaultGroupRuntimeIdV2 } from './showGroupsV2'
import { editShowLayoutIntervalsV2, validateShowLayoutAvailabilityV2 } from './showLayoutIntervalsV2'
import { firstShowTransitionPlacementRestrictionV2 } from './showTransitionPlacementV2'

export interface CreateShowClipIntentV2 {
  kind: 'create-clip'
  patternReference: ShowPatternRef
  clip: Omit<ShowClipV2, 'instanceId'>
  runtime: { kind: 'existing'; instanceId?: string } | { kind: 'first'; instance: ShowPatternInstance }
  extendShowEnd?: true
}

export type ShowClipCreationResultV2 = ShowClipEditResultV2 & {
  affectedInstanceIds: string[]
  affectedAppearanceKeyIds: string[]
  affectedKeyframeIds: string[]
  hoistedInstanceIds: string[]
  removedIds: string[]
}

/** Exact placement only. Resolved source/dependency and final compile admission stay caller-owned. */
export function createShowClipV2(record: ShowRecordV2, intent: CreateShowClipIntentV2): ShowClipCreationResultV2 {
  const empty = { affectedClipIds: [] as [], affectedTrackIds: [] as [], affectedInstanceIds: [], affectedAppearanceKeyIds: [], affectedKeyframeIds: [], hoistedInstanceIds: [], removedIds: [] }
  const refuse = (code: ShowClipEditRefusalV2, message: string): ShowClipCreationResultV2 => ({ status: 'refused', record, code, message, ...empty })
  const invalid = validateShowRecordV2(record)[0]
  if (invalid) return refuse('invalid-record', `${invalid.path}: ${invalid.message}`)
  // Only the v1 converter writes conversion provenance; an authored creation
  // cannot mint it (#1068). The shape check below owns malformed intents, so
  // this guard only reads a present Clip object.
  const clipValue: unknown = typeof intent === 'object' && intent !== null ? (intent as { clip?: unknown }).clip : undefined
  if (typeof clipValue === 'object' && clipValue !== null
    && (clipValue as { logicalClipId?: unknown }).logicalClipId !== undefined) {
    return refuse('invalid-intent', 'A created Clip cannot author conversion provenance.')
  }
  const extendShowEnd: unknown = object(intent) ? (intent as { extendShowEnd?: unknown }).extendShowEnd : undefined
  if (object(intent) && Object.prototype.hasOwnProperty.call(intent, 'extendShowEnd') && extendShowEnd !== true) {
    return refuse('invalid-intent', 'extendShowEnd must be true when present.')
  }
  if (!exact(intent, extendShowEnd === true ? ['kind', 'patternReference', 'clip', 'runtime', 'extendShowEnd'] : ['kind', 'patternReference', 'clip', 'runtime']) || intent.kind !== 'create-clip'
    || !exact(intent.patternReference, ['kind', 'id']) || !['stock', 'user'].includes(intent.patternReference.kind)
    || typeof intent.patternReference.id !== 'string' || !intent.patternReference.id.trim()
    || !exact(intent.clip, ['id', 'zoneId', 'layerId', 'startMs', 'durationMs', 'entryPolicy', 'zoneSampleMode', 'appearance'])
    || !exact(intent.clip.appearance, ['keys']) || !Array.isArray(intent.clip.appearance.keys) || intent.clip.appearance.keys.length !== 1
    || !exact(intent.clip.appearance.keys[0], ['id', 'timeMs', 'value'])
    || intent.clip.appearance.keys[0].timeMs !== intent.clip.startMs) {
    return refuse('invalid-intent', 'Supply an exact Clip placement and one complete appearance key at its start.')
  }
  const clip = intent.clip
  // v1's Add Clip at Show End grows the Show first via addShowClipAtGlobalTimeExtendingShow; v2 extends here only on explicit request (#1091).
  let base = record
  if (extendShowEnd === true) {
    if (clip.startMs !== record.composition.showEndMs) {
      return refuse('invalid-intent', 'Only a Clip placed exactly at Show End can extend the Show.')
    }
    const extended = editShowLayoutIntervalsV2(record, { kind: 'set-show-end', showEndMs: clip.startMs + clip.durationMs })
    if (extended.status === 'refused') return refuse('invalid-result', extended.message)
    base = extended.record
  }
  const endMs = clip.startMs + clip.durationMs
  if (!Number.isSafeInteger(clip.startMs) || clip.startMs < 0 || !Number.isSafeInteger(clip.durationMs) || clip.durationMs <= 0
    || !Number.isSafeInteger(endMs) || endMs > base.composition.showEndMs) return refuse('invalid-intent', 'Clip interval must use safe integer milliseconds within Show End.')
  const effective = materializeShowGroupsV2(base)
  const used = ownedIds(base)
  ownedIds(effective).forEach(id => used.add(id))
  base.composition.groupDefinitions.forEach(definition => definition.patternInstances.forEach(slot => used.add(defaultGroupRuntimeIdV2(definition.id, slot.id))))
  const matches = effective.composition.patternInstances.filter(instance => instance.pattern.kind === intent.patternReference.kind && instance.pattern.id === intent.patternReference.id)
  let instance: ShowPatternInstance
  let firstRuntime = false
  if (object(intent.runtime) && intent.runtime.kind === 'existing') {
    const hasInstanceId = Object.prototype.hasOwnProperty.call(intent.runtime, 'instanceId')
    const instanceId = intent.runtime.instanceId
    if (!exact(intent.runtime, hasInstanceId ? ['kind', 'instanceId'] : ['kind'])
      || (hasInstanceId && (typeof instanceId !== 'string' || !instanceId.trim()))) return refuse('invalid-intent', 'Select an existing runtime explicitly when several source matches exist.')
    const selected = instanceId === undefined ? (matches.length === 1 ? matches[0] : undefined)
      : matches.find(candidate => candidate.id === instanceId)
    if (!selected) return refuse('invalid-intent', matches.length > 1 ? 'Select one existing runtime for this Pattern source.' : 'The selected runtime must match the requested Pattern source; no match requires explicit first-runtime setup.')
    instance = selected
  } else if (exact(intent.runtime, ['kind', 'instance']) && intent.runtime.kind === 'first'
    && object(intent.runtime.instance) && object(intent.runtime.instance.pattern)
    && intent.runtime.instance.pattern.kind === intent.patternReference.kind && intent.runtime.instance.pattern.id === intent.patternReference.id) {
    if (matches.length) return refuse('invalid-intent', 'Reuse an existing runtime for this Pattern source; creation is not independence.')
    instance = intent.runtime.instance
    firstRuntime = true
  } else return refuse('invalid-intent', 'Supply existing-runtime selection or explicit first setup with the requested Pattern source identity.')
  const ids = [clip.id, clip.appearance.keys[0].id, ...(firstRuntime ? [instance.id] : [])]
  if (ids.some(id => typeof id !== 'string' || !id.trim() || used.has(id)) || new Set(ids).size !== ids.length) return refuse('invalid-intent', 'Clip, appearance and first-runtime identities must be fresh and nonblank.')
  const next = structuredClone(base)
  const needsRecord = !next.composition.patternInstances.some(candidate => candidate.id === instance.id)
  if (needsRecord) next.composition.patternInstances.push(structuredClone(instance))
  if (firstRuntime) next.composition.executionModel = 'continuous'
  next.composition.clips.push({ ...structuredClone(clip), instanceId: instance.id })
  const resultIssue = validateShowRecordV2(next)[0]
  if (resultIssue) return refuse('invalid-result', `${resultIssue.path}: ${resultIssue.message}`)
  const availability = validateShowLayoutAvailabilityV2(next)[0]
  if (availability) return refuse('invalid-result', `Zone ${availability.zoneId} is unavailable in Layout ${availability.layoutId} during [${availability.startMs}, ${availability.endMs}).`)
  const restriction = firstShowTransitionPlacementRestrictionV2(next)
  if (restriction) return refuse('compiler-ineligible', restriction.message)
  return { status: 'changed', record: next, ...empty, affectedClipIds: [clip.id], affectedInstanceIds: [instance.id], affectedAppearanceKeyIds: [clip.appearance.keys[0].id], hoistedInstanceIds: !firstRuntime && needsRecord ? [instance.id] : [] }
}

function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function exact(value: unknown, keys: readonly string[]): boolean { return object(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort()) }
function ownedIds(record: ShowRecordV2): Set<string> {
  const ids = new Set<string>()
  const visit = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(visit)
    else if (object(value)) {
      // Pattern references name dependencies; they are not authored entity owners.
      if (exact(value, ['kind', 'id']) && (value.kind === 'stock' || value.kind === 'user')) return
      if (typeof value.id === 'string') ids.add(value.id)
      Object.values(value).forEach(visit)
    }
  }
  visit(record)
  return ids
}
