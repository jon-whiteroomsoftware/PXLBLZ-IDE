import type { ShowPropertyTrackV2 } from './showCompositionV2'

export interface ShowInstancePropertyTrackConflictV2 {
  target: Extract<ShowPropertyTrackV2['target'], { kind: 'instance-time-scale' | 'instance-control' }>
  trackIds: [string, string]
}

/** Enumerate conflicting active owners after Group targets have been materialized. */
export function findShowInstancePropertyTrackConflictsV2(
  tracks: readonly ShowPropertyTrackV2[],
): ShowInstancePropertyTrackConflictV2[] {
  const conflicts: ShowInstancePropertyTrackConflictV2[] = []
  tracks.forEach((track, index) => {
    if (track.target.kind !== 'instance-time-scale' && track.target.kind !== 'instance-control') return
    for (const candidate of tracks.slice(0, index)) {
      if (!sameInstanceTarget(candidate.target, track.target) || !propertyTrackIntervalsOverlap(candidate, track)) continue
      conflicts.push({ target: structuredClone(track.target), trackIds: [candidate.id, track.id] })
    }
  })
  return conflicts
}

export function findNewShowInstancePropertyTrackConflictV2(
  before: readonly ShowPropertyTrackV2[],
  after: readonly ShowPropertyTrackV2[],
): ShowInstancePropertyTrackConflictV2 | undefined {
  const prior = new Set(findShowInstancePropertyTrackConflictsV2(before).map(conflictIdentity))
  return findShowInstancePropertyTrackConflictsV2(after).find(conflict => !prior.has(conflictIdentity(conflict)))
}

export function sameShowInstancePropertyTargetV2(
  left: ShowPropertyTrackV2['target'],
  right: ShowPropertyTrackV2['target'],
): boolean {
  if (left.kind !== right.kind || !('instanceId' in left) || !('instanceId' in right)
    || left.instanceId !== right.instanceId) return false
  return left.kind === 'instance-time-scale'
    || right.kind === 'instance-time-scale'
    || left.exportName === right.exportName
}

export function propertyTrackIntervalsOverlap(left: ShowPropertyTrackV2, right: ShowPropertyTrackV2): boolean {
  return left.activeStartMs < right.activeStartMs + right.activeDurationMs
    && right.activeStartMs < left.activeStartMs + left.activeDurationMs
}

function sameInstanceTarget(
  left: ShowPropertyTrackV2['target'],
  right: ShowPropertyTrackV2['target'],
): boolean {
  return sameShowInstancePropertyTargetV2(left, right)
}

function conflictIdentity(conflict: ShowInstancePropertyTrackConflictV2): string {
  return JSON.stringify([conflict.target, [...conflict.trackIds].sort()])
}
