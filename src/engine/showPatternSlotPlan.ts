import type { ShowRecipe } from './showCompiler'

export interface ShowPatternLifetimeInterval {
  startMs: number
  endMs: number
}

export interface ShowPatternLifetime {
  id: string
  occurrenceCount: number
  intervals: ShowPatternLifetimeInterval[]
}

export interface ShowPatternSlotCandidate extends ShowPatternLifetime {
  machineKey: string
  resettable: boolean
  hasLiveControls?: boolean
}

export type ShowPatternSlotExclusionReason = 'continue' | 'live-controls' | 'unresettable' | 'unproved-lifetime'

export interface ShowPatternSlotAssignment {
  memberId: string
  machineKey: string
  slotId: string
  slotIndex: number
  shared: boolean
}

export interface ShowPatternSlotPlan {
  machineCountBefore: number
  machineCountAfter: number
  machinesReclaimed: number
  assignments: ShowPatternSlotAssignment[]
  exclusions: Array<{ memberId: string; reason: ShowPatternSlotExclusionReason }>
}

interface AssignedSlot {
  id: string
  index: number
  intervals: ShowPatternLifetimeInterval[]
  memberIds: string[]
}

/**
 * Colors exact Pattern-instance lifetimes. Candidates can share one emitted
 * machine only when their complete state can be reset and their half-open live
 * intervals do not overlap.
 */
export function planShowPatternSlots(candidates: ShowPatternSlotCandidate[]): ShowPatternSlotPlan {
  const assignments: ShowPatternSlotAssignment[] = []
  const exclusions: ShowPatternSlotPlan['exclusions'] = []
  const slotsByMachine = new Map<string, AssignedSlot[]>()
  const groupIndexByMachine = new Map<string, number>()
  let dedicatedIndex = 0

  for (const candidate of candidates) {
    const exclusion = candidateExclusion(candidate)
    if (exclusion) {
      const slotId = `dedicated-${dedicatedIndex}`
      dedicatedIndex += 1
      exclusions.push({ memberId: candidate.id, reason: exclusion })
      assignments.push({
        memberId: candidate.id,
        machineKey: candidate.machineKey,
        slotId,
        slotIndex: 0,
        shared: false,
      })
      continue
    }

    const slots = slotsByMachine.get(candidate.machineKey) ?? []
    let groupIndex = groupIndexByMachine.get(candidate.machineKey)
    if (groupIndex === undefined) {
      groupIndex = groupIndexByMachine.size
      groupIndexByMachine.set(candidate.machineKey, groupIndex)
    }
    let slot = slots.find((entry) => !intervalSetsOverlap(entry.intervals, candidate.intervals))
    if (!slot) {
      slot = {
        id: `machine-${groupIndex}-${slots.length}`,
        index: slots.length,
        intervals: [],
        memberIds: [],
      }
      slots.push(slot)
      slotsByMachine.set(candidate.machineKey, slots)
    }
    slot.intervals.push(...candidate.intervals)
    slot.memberIds.push(candidate.id)
    assignments.push({
      memberId: candidate.id,
      machineKey: candidate.machineKey,
      slotId: slot.id,
      slotIndex: slot.index,
      shared: false,
    })
  }

  const sharedSlotIds = new Set(
    [...slotsByMachine.values()].flatMap((slots) => (
      slots.filter((slot) => slot.memberIds.length > 1).map((slot) => slot.id)
    )),
  )
  for (const assignment of assignments) assignment.shared = sharedSlotIds.has(assignment.slotId)
  const machineCountAfter = dedicatedIndex
    + [...slotsByMachine.values()].reduce((sum, slots) => sum + slots.length, 0)

  return {
    machineCountBefore: candidates.length,
    machineCountAfter,
    machinesReclaimed: candidates.length - machineCountAfter,
    assignments,
    exclusions,
  }
}

export function deriveShowPatternLifetimes(recipe: ShowRecipe): ShowPatternLifetime[] {
  const byId = new Map(recipe.clips.map((clip) => [clip.id, {
    id: clip.id,
    occurrenceCount: 0,
    intervals: [] as ShowPatternLifetimeInterval[],
  }]))
  const scenes = recipe.routedSceneSequence?.scenes.map((scene) => ({
    holdMs: scene.holdMs,
    transitionDurationMs: Math.max(0, scene.transitionOut?.durationMs ?? 0),
    clipIds: [...new Set(scene.placements.map((placement) => placement.clipId))],
  })) ?? recipe.sceneSequence?.scenes.map((scene) => ({
    holdMs: scene.holdMs,
    transitionDurationMs: Math.max(0, scene.transitionOut?.durationMs ?? 0),
    clipIds: [scene.clipId],
  }))

  if (!scenes) {
    const horizon = Math.max(1, recipe.loopDurationMs ?? 1)
    for (const clip of recipe.clips) {
      const lifetime = byId.get(clip.id)!
      lifetime.occurrenceCount = 1
      lifetime.intervals.push({ startMs: 0, endMs: horizon })
    }
    return [...byId.values()]
  }

  let cursorMs = 0
  let precedingTransitionMs = 0
  for (const scene of scenes) {
    const startMs = Math.max(0, cursorMs - precedingTransitionMs)
    const endMs = cursorMs + Math.max(0, scene.holdMs) + scene.transitionDurationMs
    for (const clipId of scene.clipIds) {
      const lifetime = byId.get(clipId)
      if (!lifetime) continue
      lifetime.occurrenceCount += 1
      lifetime.intervals.push({ startMs, endMs })
    }
    cursorMs = endMs
    precedingTransitionMs = scene.transitionDurationMs
  }
  return [...byId.values()]
}

function candidateExclusion(candidate: ShowPatternSlotCandidate): ShowPatternSlotExclusionReason | null {
  if (candidate.occurrenceCount !== 1) return 'continue'
  if (candidate.hasLiveControls) return 'live-controls'
  if (!candidate.resettable) return 'unresettable'
  if (!hasProvedLifetime(candidate.intervals)) return 'unproved-lifetime'
  return null
}

function hasProvedLifetime(intervals: ShowPatternLifetimeInterval[]): boolean {
  return intervals.length > 0 && intervals.every((interval) => (
    Number.isFinite(interval.startMs)
    && Number.isFinite(interval.endMs)
    && interval.startMs >= 0
    && interval.endMs > interval.startMs
  ))
}

function intervalSetsOverlap(
  left: ShowPatternLifetimeInterval[],
  right: ShowPatternLifetimeInterval[],
): boolean {
  return left.some((a) => right.some((b) => a.startMs < b.endMs && b.startMs < a.endMs))
}
