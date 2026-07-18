import type { ShowRenderTargetArenaSummary, ShowRenderTargetRole } from './showRenderTargetArena'
import type { ShowVmResourceLedger } from './showVmResourceLedger'

export type ShowRenderTargetCandidateKind =
  | 'rgb-snapshot'
  | 'sample-xy'
  | 'scalar-field'
  | 'shared-pattern-output'

export type ShowRenderTargetLifetimeKind =
  | 'show'
  | 'scene'
  | 'transition'
  | 'frame'
  | 'placement-epoch'
  | 'property-epoch'

export type ShowRenderTargetExactness = 'exact' | 'authored-snapshot' | 'authored-approximate'

export interface ShowRenderTargetLifetime {
  kind: ShowRenderTargetLifetimeKind
  start: number
  end: number
  key: string
}

export interface ShowRenderTargetCandidate {
  id: string
  kind: ShowRenderTargetCandidateKind
  lifetime: ShowRenderTargetLifetime
  invalidatedBy: string[]
  exactness: ShowRenderTargetExactness
  authorSelected?: boolean
  required?: boolean
  setupCost: number
  perFrameSavings: number
  expectedReuseCount: number
  replayCost?: number
  invalidationCost?: number
  conflictsWith?: string[]
}

export interface ShowRenderTargetAssignment {
  candidateId: string
  kind: ShowRenderTargetCandidateKind
  role: ShowRenderTargetRole
  planes: Array<0 | 1 | 2>
  lifetime: ShowRenderTargetLifetime
  invalidatedBy: string[]
  exactness: ShowRenderTargetExactness
  estimatedSavedWork: number
}

export interface ShowRenderTargetCachePlan {
  planeCount: 3
  availablePlaneCount: number
  peakPlaneCount: number
  totalEstimatedSavedWork: number
  assignments: ShowRenderTargetAssignment[]
  decisions: ShowRenderTargetDecision[]
  resources: {
    arenaWords: number
    additionalArrayWords: 0
    totalVmWords: number
    remainingVmWords: number
    blockerCount: number
  } | null
}

export type ShowRenderTargetDecisionReason =
  | 'selected'
  | 'approximation-not-authored'
  | 'non-profitable'
  | 'explicit-conflict'
  | 'arena-unavailable'
  | 'insufficient-overlap-capacity'

export interface ShowRenderTargetDecision {
  candidateId: string
  status: 'selected' | 'rejected'
  reason: ShowRenderTargetDecisionReason
  estimatedSavedWork: number
  conflictsWith: string[]
  detail: string
}

export interface ShowRenderTargetPlannerContext {
  arena: ShowRenderTargetArenaSummary
  resources?: ShowVmResourceLedger
}

const KIND_CONTRACT: Record<ShowRenderTargetCandidateKind, {
  role: ShowRenderTargetRole
  planeCount: 1 | 2 | 3
}> = {
  'rgb-snapshot': { role: 'stage-rgb', planeCount: 3 },
  'sample-xy': { role: 'sample-xy', planeCount: 2 },
  'scalar-field': { role: 'scalar-field', planeCount: 1 },
  'shared-pattern-output': { role: 'stage-rgb', planeCount: 3 },
}

export function planShowRenderTargetCaches(
  candidates: ShowRenderTargetCandidate[],
  context?: ShowRenderTargetPlannerContext,
): ShowRenderTargetCachePlan {
  const availablePlaneCount = context?.arena.emitted === false
    ? 0
    : Math.min(3, context?.arena.planeCount ?? 3)
  const decisions: ShowRenderTargetDecision[] = []
  const eligible = candidates
    .map((candidate, inputIndex) => ({
      candidate,
      inputIndex,
      contract: KIND_CONTRACT[candidate.kind],
      estimatedSavedWork: estimateSavedWork(candidate),
    }))
    .filter((item) => {
      if (item.candidate.exactness === 'exact' || item.candidate.authorSelected) return true
      decisions.push({
        candidateId: item.candidate.id,
        status: 'rejected',
        reason: 'approximation-not-authored',
        estimatedSavedWork: item.estimatedSavedWork,
        conflictsWith: [],
        detail: 'Approximate or snapshot behavior requires an explicit authored policy.',
      })
      return false
    })
    .filter((item) => {
      if (item.candidate.required || item.estimatedSavedWork > 0) return true
      decisions.push({
        candidateId: item.candidate.id,
        status: 'rejected',
        reason: 'non-profitable',
        estimatedSavedWork: item.estimatedSavedWork,
        conflictsWith: [],
        detail: 'Estimated setup, replay, and invalidation work is not cheaper than recomputation.',
      })
      return false
    })
  const ranked = eligible
    .sort((left, right) => (
      Number(Boolean(right.candidate.required)) - Number(Boolean(left.candidate.required))
      || exactnessRank(left.candidate.exactness) - exactnessRank(right.candidate.exactness)
      || right.estimatedSavedWork - left.estimatedSavedWork
      || left.contract.planeCount - right.contract.planeCount
      || left.candidate.id.localeCompare(right.candidate.id)
    ))
  const selected: Array<ShowRenderTargetAssignment & {
    inputIndex: number
    declaredConflicts: string[]
  }> = []
  for (const item of ranked) {
    if (availablePlaneCount === 0) {
      decisions.push({
        candidateId: item.candidate.id,
        status: 'rejected',
        reason: 'arena-unavailable',
        estimatedSavedWork: item.estimatedSavedWork,
        conflictsWith: [],
        detail: 'The physical Show render-target arena is unavailable.',
      })
      continue
    }
    const conflicts = selected.filter((assignment) => lifetimesOverlap(
      item.candidate.lifetime,
      assignment.lifetime,
    ))
    const explicitConflicts = conflicts
      .filter((assignment) => (
        item.candidate.conflictsWith?.includes(assignment.candidateId)
        || assignment.declaredConflicts.includes(item.candidate.id)
      ))
      .map((assignment) => assignment.candidateId)
      .sort()
    if (explicitConflicts.length > 0) {
      decisions.push({
        candidateId: item.candidate.id,
        status: 'rejected',
        reason: 'explicit-conflict',
        estimatedSavedWork: item.estimatedSavedWork,
        conflictsWith: explicitConflicts,
        detail: `Conflicts with ${explicitConflicts.join(', ')} during an overlapping lifetime.`,
      })
      continue
    }
    const planes = findAvailablePlanes(item.contract.planeCount, conflicts, availablePlaneCount)
    if (!planes) {
      const conflictsWith = conflicts.map((assignment) => assignment.candidateId).sort()
      decisions.push({
        candidateId: item.candidate.id,
        status: 'rejected',
        reason: 'insufficient-overlap-capacity',
        estimatedSavedWork: item.estimatedSavedWork,
        conflictsWith,
        detail: `Needs ${item.contract.planeCount} planes while ${conflictsWith.join(', ') || 'the arena policy'} owns overlapping planes.`,
      })
      continue
    }
    selected.push({
      candidateId: item.candidate.id,
      kind: item.candidate.kind,
      role: item.contract.role,
      planes,
      lifetime: item.candidate.lifetime,
      invalidatedBy: [...item.candidate.invalidatedBy],
      exactness: item.candidate.exactness,
      estimatedSavedWork: item.estimatedSavedWork,
      inputIndex: item.inputIndex,
      declaredConflicts: [...(item.candidate.conflictsWith ?? [])],
    })
    decisions.push({
      candidateId: item.candidate.id,
      status: 'selected',
      reason: 'selected',
      estimatedSavedWork: item.estimatedSavedWork,
      conflictsWith: [],
      detail: `Assigned ${planes.map((plane) => `plane ${plane}`).join(', ')} until ${item.candidate.invalidatedBy.join(' or ')}.`,
    })
  }

  const assignments = selected
    .sort((left, right) => left.inputIndex - right.inputIndex)
    .map(({ inputIndex: _, declaredConflicts: __, ...assignment }) => assignment)
  return {
    planeCount: 3,
    availablePlaneCount,
    peakPlaneCount: peakPlaneCount(assignments),
    totalEstimatedSavedWork: assignments.reduce((total, assignment) => total + assignment.estimatedSavedWork, 0),
    assignments,
    decisions: decisions.sort((left, right) => (
      candidates.findIndex((candidate) => candidate.id === left.candidateId)
      - candidates.findIndex((candidate) => candidate.id === right.candidateId)
    )),
    resources: context?.resources
      ? {
          arenaWords: context.resources.renderTargetWords,
          additionalArrayWords: 0,
          totalVmWords: context.resources.totalWords,
          remainingVmWords: context.resources.remainingWords,
          blockerCount: context.resources.blockers.length,
        }
      : null,
  }
}

function estimateSavedWork(candidate: ShowRenderTargetCandidate): number {
  const reuseCount = Math.max(0, candidate.expectedReuseCount)
  return Math.max(0, (
    candidate.perFrameSavings * reuseCount
    - candidate.setupCost
    - (candidate.replayCost ?? 0) * reuseCount
    - (candidate.invalidationCost ?? 0)
  ))
}

function exactnessRank(exactness: ShowRenderTargetExactness): number {
  return exactness === 'exact' ? 0 : 1
}

function lifetimesOverlap(left: ShowRenderTargetLifetime, right: ShowRenderTargetLifetime): boolean {
  return left.start < right.end && right.start < left.end
}

function findAvailablePlanes(
  planeCount: 1 | 2 | 3,
  conflicts: ShowRenderTargetAssignment[],
  availablePlaneCount: number,
): Array<0 | 1 | 2> | null {
  const occupied = new Set(conflicts.flatMap((assignment) => assignment.planes))
  const available = ([0, 1, 2] as Array<0 | 1 | 2>)
    .slice(0, availablePlaneCount)
    .filter((plane) => !occupied.has(plane))
  return available.length >= planeCount ? available.slice(0, planeCount) : null
}

function peakPlaneCount(assignments: ShowRenderTargetAssignment[]): number {
  const boundaries = [...new Set(assignments.flatMap((assignment) => [
    assignment.lifetime.start,
    assignment.lifetime.end,
  ]))]
  return boundaries.reduce((peak, boundary) => {
    const activePlanes = new Set(assignments
      .filter((assignment) => (
        assignment.lifetime.start <= boundary && boundary < assignment.lifetime.end
      ))
      .flatMap((assignment) => assignment.planes))
    return Math.max(peak, activePlanes.size)
  }, 0)
}
