import { describe, expect, it } from 'vitest'
import {
  deriveShowPatternLifetimes,
  planShowPatternSlots,
  type ShowPatternSlotCandidate,
} from './showPatternSlotPlan'
import type { ShowRecipe } from './showCompiler'
import { showRecordToCompileRecipe } from './showModel'
import { sourceForShowPatternRef } from './showPreviewArtifact'
import { createPropertySlotQualificationShow } from './showPatternSlotTestFixture'

const source = 'export function render(index) { rgb(index, 0, 0) }'

function candidate(
  id: string,
  intervals: Array<{ startMs: number; endMs: number }>,
  patch: Partial<ShowPatternSlotCandidate> = {},
): ShowPatternSlotCandidate {
  return {
    id,
    machineKey: 'same-machine',
    intervals,
    occurrenceCount: 1,
    resettable: true,
    ...patch,
  }
}

describe('Show Pattern lifetime slot planner (#546)', () => {
  it('reuses one machine for half-open disjoint Restart lifetimes', () => {
    const plan = planShowPatternSlots([
      candidate('a', [{ startMs: 0, endMs: 1_000 }]),
      candidate('b', [{ startMs: 1_000, endMs: 2_000 }]),
      candidate('c', [{ startMs: 2_000, endMs: 3_000 }]),
    ])

    expect(plan.machineCountBefore).toBe(3)
    expect(plan.machineCountAfter).toBe(1)
    expect(new Set(plan.assignments.map((assignment) => assignment.slotId))).toHaveLength(1)
  })

  it('keeps overlapping transition participants in distinct machines', () => {
    const plan = planShowPatternSlots([
      candidate('outgoing', [{ startMs: 0, endMs: 1_500 }]),
      candidate('incoming', [{ startMs: 1_000, endMs: 2_500 }]),
      candidate('later', [{ startMs: 2_500, endMs: 3_500 }]),
    ])

    expect(plan.machineCountAfter).toBe(2)
    expect(plan.assignments.find((entry) => entry.memberId === 'outgoing')?.slotId)
      .not.toBe(plan.assignments.find((entry) => entry.memberId === 'incoming')?.slotId)
    expect(plan.assignments.find((entry) => entry.memberId === 'later')?.slotId)
      .toBe(plan.assignments.find((entry) => entry.memberId === 'outgoing')?.slotId)
  })

  it('keeps colors globally distinct when several machine families overlap', () => {
    const plan = planShowPatternSlots([
      candidate('a0', [{ startMs: 0, endMs: 2_000 }], { machineKey: 'a' }),
      candidate('a1', [{ startMs: 1_000, endMs: 3_000 }], { machineKey: 'a' }),
      candidate('b0', [{ startMs: 0, endMs: 2_000 }], { machineKey: 'b' }),
      candidate('b1', [{ startMs: 1_000, endMs: 3_000 }], { machineKey: 'b' }),
    ])

    expect(new Set(plan.assignments.map((assignment) => assignment.slotId))).toHaveLength(4)
  })

  it('does not merge Continue identities, live controls, unresettable members, or different machines', () => {
    const plan = planShowPatternSlots([
      candidate('continue', [{ startMs: 0, endMs: 1_000 }], { occurrenceCount: 2 }),
      candidate('controlled', [{ startMs: 1_000, endMs: 2_000 }], { hasLiveControls: true }),
      candidate('array-state', [{ startMs: 2_000, endMs: 3_000 }], { resettable: false }),
      candidate('other-source', [{ startMs: 3_000, endMs: 4_000 }], { machineKey: 'other-machine' }),
    ])

    expect(plan.machineCountAfter).toBe(4)
    expect(plan.exclusions).toEqual([
      { memberId: 'continue', reason: 'continue' },
      { memberId: 'controlled', reason: 'live-controls' },
      { memberId: 'array-state', reason: 'unresettable' },
    ])
  })

  it('derives overlap windows from routed Scene transitions', () => {
    const recipe: ShowRecipe = {
      clips: [
        { id: 'a', source },
        { id: 'b', source },
        { id: 'c', source },
      ],
      routedSceneSequence: {
        scenes: [
          {
            holdMs: 1_000,
            placements: [{ zoneName: 'all', clipId: 'a' }],
            transitionOut: { kind: 'crossfade', durationMs: 500 },
          },
          {
            holdMs: 1_000,
            placements: [{ zoneName: 'all', clipId: 'b' }],
            transitionOut: { kind: 'cut', durationMs: 0 },
          },
          {
            holdMs: 1_000,
            placements: [{ zoneName: 'all', clipId: 'c' }],
          },
        ],
      },
    }

    expect(deriveShowPatternLifetimes(recipe)).toEqual([
      { id: 'a', occurrenceCount: 1, intervals: [{ startMs: 0, endMs: 1_500 }] },
      { id: 'b', occurrenceCount: 1, intervals: [{ startMs: 1_000, endMs: 2_500 }] },
      { id: 'c', occurrenceCount: 1, intervals: [{ startMs: 2_500, endMs: 3_500 }] },
    ])
  })

  it('finds a five-slot lifetime-only upper bound for the qualification fixture before structural splitting', () => {
    // The shipping Property Animation reference consolidated to shared
    // voices (#514/#536 ceilings), so the planner's realistic stress case is
    // the preserved per-scene expansion of that fixture.
    const show = createPropertySlotQualificationShow()
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [
        cell.id,
        sourceForShowPatternRef(cell.pattern, []),
      ])),
      byPatternInstanceId: Object.fromEntries((show.composition?.patternInstances ?? []).map((instance) => [
        instance.id,
        sourceForShowPatternRef(instance.pattern, []),
      ])),
      stageDimension: 2,
    })
    const lifetimeById = new Map(deriveShowPatternLifetimes(recipe).map((entry) => [entry.id, entry]))
    const plan = planShowPatternSlots(recipe.clips.map((clip) => ({
      ...lifetimeById.get(clip.id)!,
      machineKey: JSON.stringify({
        source: clip.source,
        evaluationPolicy: clip.evaluationPolicy ?? 'live',
        effects: clip.effects ?? [],
      }),
      resettable: true,
      hasLiveControls: Object.keys(clip.controlTargets ?? {}).length > 0,
    })))

    expect(recipe.clips).toHaveLength(19)
    expect(new Set(recipe.clips.map((clip) => clip.source))).toHaveLength(2)
    expect(plan.machineCountAfter).toBe(5)
    expect(plan.machinesReclaimed).toBe(14)
  })
})
