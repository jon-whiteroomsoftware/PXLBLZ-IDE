import type { ShowRecordV2 } from './showCompositionV2'

/**
 * The flat-lowering eligibility the v2 lowering selects its route by
 * (showCompositionLoweringV2.ts), shared so an owner can ask the same question
 * the lowering asks without importing the lowering.
 */

/** Routed sampling the global-section emitter cannot represent (#1063). */
export function showV2UnsupportedRoutedSampling(record: ShowRecordV2): boolean {
  return record.composition.clips.some(clip => (
    clip.zoneSampleMode !== 'span'
    // With one Zone, independent and span address the same complete domain;
    // the existing global-section emitter therefore preserves the flat result.
    && !(record.zones.length === 1 && clip.zoneSampleMode === 'independent')
  ))
}

/** Exactly the lowering's `flatEligible`. */
export function showV2FlatLoweringEligible(record: ShowRecordV2): boolean {
  const composition = record.composition
  return composition.executionModel === 'continuous'
    && !composition.clips.some(clip => clip.entryPolicy === 'restart')
    // Exact redundant keys and whole-output boundaries may recover the existing
    // flat sampling route only where routed sampling previously refused.
    // Existing routed admissions keep their representation and generated
    // source bytes: only the unsupported-sampling disjunct passes both flags.
    && (canLowerShowV2ToFlat(record) || (showV2UnsupportedRoutedSampling(record) && canLowerShowV2ToFlat(record, true, true)))
}

export function canLowerShowV2ToFlat(record: ShowRecordV2, allowEqualAppearanceSegments = false, allowWholeOutputBoundaries = false): boolean {
  const composition = record.composition
  // A flat Scene boundary blends the whole output, so it represents a
  // participant Transition exactly only when the two participants are the only
  // Clips the blend can see. Every other Clip must end strictly before the
  // outgoing Clip or start strictly after the incoming one: flat sections split
  // at every Clip edge, so such a Clip is absent from the outgoing hold, the
  // window and the incoming hold alike, and the blend leaves it untouched. A
  // Clip that overlaps the window, or merely touches either edge - where the
  // blend would fade it in or out - refuses here (#1063). The Show's Zone count
  // does not enter this test: with more than one Zone the flat lowering emits
  // the same v1 record v1's own `addShowZone` produces, down to the bytes.
  // A whole-output boundary blends the same whole output, so it is admitted
  // only with `allowWholeOutputBoundaries` and only when every named
  // contributor abuts its window edge and every other Clip sits strictly
  // outside the window: the flat sections split at every Clip edge, so an
  // unrelated Clip that overlaps the window, or merely touches either edge,
  // would be faded in or out by the blend and refuses either way (#1082). An
  // empty contributor side stays on the global-sections route, which owns the
  // compiler Empty hold.
  const wholeBoundary = composition.transitions.every(transition => {
    if (transition.wholeOutput) {
      if (!allowWholeOutputBoundaries) return false
      const windowStart = transition.wholeOutput.startMs
      const windowEnd = windowStart + transition.durationMs
      const fromIds = new Set(transition.wholeOutput.fromClipIds)
      const toIds = new Set(transition.wholeOutput.toClipIds)
      if (fromIds.size === 0 || toIds.size === 0) return false
      for (const id of fromIds) {
        const clip = composition.clips.find(candidate => candidate.id === id)
        if (!clip || clip.startMs + clip.durationMs !== windowStart) return false
      }
      for (const id of toIds) {
        const clip = composition.clips.find(candidate => candidate.id === id)
        if (!clip || clip.startMs !== windowEnd) return false
      }
      return !composition.clips.some(clip => !fromIds.has(clip.id) && !toIds.has(clip.id) && clip.startMs <= windowEnd && clip.startMs + clip.durationMs >= windowStart)
    }
    const participant = transition.participants[0]
    const from = composition.clips.find(clip => clip.id === participant.fromClipId)!
    const to = composition.clips.find(clip => clip.id === participant.toClipId)!
    return !composition.clips.some(clip => clip !== from && clip !== to && clip.startMs <= to.startMs && clip.startMs + clip.durationMs >= from.startMs + from.durationMs)
  })
  return wholeBoundary
    && composition.propertyTracks.every(track => track.target.kind === 'layout-occurrence-split-position')
    && composition.layers.every(layer => layer.rank === 0)
    && composition.clips.every(clip => (clip.appearance.keys.length === 1 || (allowEqualAppearanceSegments && clip.appearance.keys.every(key => structurallyEqualAppearanceV2(key.value, clip.appearance.keys[0].value)))) && clip.appearance.keys[0].value.opacity === 1)
    && composition.clips.every(clip => clip.zoneSampleMode === 'independent')
}

/** Drop retained instance animation with no Clip users, exactly as the lowering does before it asks its route questions. */
export function withoutUnusedInstanceTracksV2(record: ShowRecordV2): ShowRecordV2 {
  // Retained instance animation can outlive its final Clip user. Such tracks
  // remain authored for future edits, but cannot create an executing member.
  // Every effective Clip counts, including invisible and later contributions.
  const usedInstanceIds = new Set(record.composition.clips.map(clip => clip.instanceId))
  const propertyTracks = record.composition.propertyTracks.filter(track => {
    // Promotion asks before validation refuses, so a malformed candidate still
    // reaches this filter: only a well-formed unused-instance target can drop.
    const kind = track.target?.kind
    if (kind !== 'instance-control' && kind !== 'instance-time-scale') return true
    return usedInstanceIds.has((track.target as { instanceId: string }).instanceId)
  })
  if (propertyTracks.length === record.composition.propertyTracks.length) return record
  return { ...record, composition: { ...record.composition, propertyTracks } }
}

/** Complete exact JSON structure comparison; neither floats nor fields are approximated. */
export function structurallyEqualAppearanceV2(left: unknown, right: unknown): boolean {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((value, index) => structurallyEqualAppearanceV2(value, right[index]))
  }
  const leftObject = left as Record<string, unknown>
  const rightObject = right as Record<string, unknown>
  const keys = Object.keys(leftObject)
  return keys.length === Object.keys(rightObject).length
    && keys.every(key => Object.prototype.hasOwnProperty.call(rightObject, key) && structurallyEqualAppearanceV2(leftObject[key], rightObject[key]))
}
