import { describe, expect, it } from 'vitest'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import type { ShowRecord } from './personalContentRecords'
import type { ShowTransitionChanges } from './showTransitionAuthoring'
import { updateShowBoundaryTransition } from './showModel'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { editShowTransitionV2 } from './showTransitionsV2'
import { planShowV2BoundaryTransitionChanges } from './showV2TransitionEditorModel'
import { cloneValidShowRecordV2 } from './showDocument'

/**
 * #1066 slice 9c2a: the boundary panel's Animate repeat scale and Animate split
 * position sections on the v2 backing. Oracle: v1 applies the section's exact
 * `changes`, then converts; v2 plans the same `changes` on the converted
 * before-record and applies them through `update-transition`. The results
 * must be deep-equal.
 */
function stockV1(): ShowRecord {
  return structuredClone(STOCK_SHOWS.find(candidate => candidate.id === 'stock-show-reference-property-animation')!.show) as ShowRecord
}

function convert(show: ShowRecord): ShowRecordV2 {
  const result = convertShowRecordV1ToV2(show, {
    byCellId: Object.fromEntries(show.cells.map(cell => {
      if (cell.pattern.kind !== 'stock') throw new Error('non-stock cell')
      return [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]]
    })),
  })
  if (result.status !== 'converted') throw new Error(JSON.stringify(result.issues))
  return result.record
}

type Section = 'repeat' | 'split'
type Edit = 'on' | 'from' | 'duration' | 'easing' | 'remove'

/** Exactly the `changes` object the v1 section's updateDescriptor/removeDescriptor build. */
function sectionChanges(show: ShowRecord, transitionId: string, section: Section, edit: Edit): ShowTransitionChanges {
  const transition = show.transitions!.find(candidate => candidate.id === transitionId)!
  const existing = transition.propertyTransitions ?? {}
  const group = section === 'repeat' ? 'sample' : 'routing'
  const field = section === 'repeat' ? 'repeatScale' : 'splitPosition'
  const descriptor = (existing as Record<string, Record<string, { from: number; durationMs?: number; easing?: unknown }> | undefined>)[group]?.[field]
  if (edit === 'remove') {
    const propertyTransitions = structuredClone(existing) as Record<string, Record<string, unknown>>
    const inner = { ...(propertyTransitions[group] ?? {}) }
    delete inner[field]
    if (Object.keys(inner).length > 0) propertyTransitions[group] = inner
    else delete propertyTransitions[group]
    return { propertyTransitions: Object.keys(propertyTransitions).length > 0 ? propertyTransitions : undefined } as ShowTransitionChanges
  }
  const fromTarget = section === 'repeat' ? 1 : 0.75
  const changed = {
    from: edit === 'from' ? (section === 'repeat' ? 2 : 0.6) : descriptor?.from ?? fromTarget,
    durationMs: edit === 'duration' ? 900 : descriptor?.durationMs ?? transition.durationMs,
    easing: edit === 'easing' ? { curve: 'sine', direction: 'in-out' } : descriptor?.easing ?? transition.easing,
  }
  return {
    propertyTransitions: {
      ...structuredClone(existing),
      [group]: { ...((existing as Record<string, object | undefined>)[group] ?? {}), [field]: changed },
    },
  } as ShowTransitionChanges
}

const CASES: Array<{ name: string; transitionId: string; section: Section; edit: Edit }> = [
  { name: 'a repeat on', transitionId: 'transition-effect-parameter', section: 'repeat', edit: 'on' },
  { name: 'b repeat from', transitionId: 'transition-split-position', section: 'repeat', edit: 'from' },
  { name: 'c repeat duration', transitionId: 'transition-split-position', section: 'repeat', edit: 'duration' },
  { name: 'd repeat easing', transitionId: 'transition-split-position', section: 'repeat', edit: 'easing' },
  { name: 'e repeat removed', transitionId: 'transition-split-position', section: 'repeat', edit: 'remove' },
  { name: 'f split on', transitionId: 'transition-split-position', section: 'split', edit: 'on' },
  { name: 'g split from', transitionId: 'transition-effect-parameter', section: 'split', edit: 'from' },
  { name: 'h split duration', transitionId: 'transition-effect-parameter', section: 'split', edit: 'duration' },
  { name: 'i split easing', transitionId: 'transition-effect-parameter', section: 'split', edit: 'easing' },
  { name: 'j split removed', transitionId: 'transition-effect-parameter', section: 'split', edit: 'remove' },
]

describe('boundary scalar ramp edits on v2 equal v1 then convert (#1066 slice 9c2a)', () => {
  it.each(CASES)('$name', ({ transitionId, section, edit }) => {
    const v1 = stockV1()
    const changes = sectionChanges(v1, transitionId, section, edit)
    const expected = convert(updateShowBoundaryTransition(v1, transitionId, changes))
    const before = convert(v1)

    const plan = planShowV2BoundaryTransitionChanges(before, transitionId, changes)
    expect(plan.status, JSON.stringify(plan)).toBe('ready')
    if (plan.status !== 'ready') return
    const result = editShowTransitionV2(before, plan.intent)
    expect(result.status, JSON.stringify(result)).toBe('changed')
    if (result.status !== 'changed') return

    expect(result.record.composition.transitions).toEqual(expected.composition.transitions)
    expect(result.record.composition.propertyTracks).toEqual(expected.composition.propertyTracks)
    expect(result.record.composition.layoutOccurrences).toEqual(expected.composition.layoutOccurrences)
    expect(result.record.composition.showEndMs).toBe(expected.composition.showEndMs)
  })

  it('still refuses a settings edit that changes a Clip-owned ramp', () => {
    const before = convert(stockV1())
    const transition = structuredClone(before.composition.transitions.find(candidate => candidate.id === 'transition-split-position')!)
    const clipId = before.composition.clips[0].id
    transition.propertyRamps = [...transition.propertyRamps, { target: { kind: 'clip-opacity', clipId }, from: 0 }]
    const result = editShowTransitionV2(before, { kind: 'update-transition', transition })
    expect(result.status).toBe('refused')
  })

  it('refuses an unknown propertyTransitions field before any owner', () => {
    const before = convert(stockV1())
    const plan = planShowV2BoundaryTransitionChanges(before, 'transition-split-position', {
      propertyTransitions: { sample: { repeatScale: { from: 1 }, other: { from: 1 } } },
    } as unknown as ShowTransitionChanges)
    expect(plan).toMatchObject({ status: 'refused', code: 'unsupported-field' })
  })

  it.each([
    { name: 'a zero duration', durationMs: 0 },
    { name: 'a fractional duration', durationMs: 123.4 },
  ])('normalizes $name exactly as v1 does, leaving a record storage accepts', ({ durationMs }) => {
    const v1 = stockV1()
    const changes = sectionChanges(v1, 'transition-split-position', 'repeat', 'duration')
    changes.propertyTransitions!.sample!.repeatScale!.durationMs = durationMs
    const expected = convert(updateShowBoundaryTransition(v1, 'transition-split-position', changes))
    const before = convert(v1)
    const plan = planShowV2BoundaryTransitionChanges(before, 'transition-split-position', changes)
    if (plan.status !== 'ready') throw new Error(JSON.stringify(plan))
    const result = editShowTransitionV2(before, plan.intent)
    if (result.status !== 'changed') throw new Error(JSON.stringify(result))
    expect(result.record.composition.transitions).toEqual(expected.composition.transitions)
    const ramp = result.record.composition.transitions.find(transition => transition.id === 'transition-split-position')!.propertyRamps[0]
    expect(Number.isSafeInteger(ramp.durationMs) && ramp.durationMs! >= 1).toBe(true)
    expect(() => cloneValidShowRecordV2(result.record)).not.toThrow()
  })

  it('caps a duration past the Transition at the Transition, as v1 does, so rewriting the held ramp is a no-op', () => {
    const v1 = stockV1()
    const changes = sectionChanges(v1, 'transition-split-position', 'repeat', 'duration')
    changes.propertyTransitions!.sample!.repeatScale!.durationMs = 9000
    const before = convert(v1)
    expect(convert(updateShowBoundaryTransition(v1, 'transition-split-position', changes)).composition.transitions).toEqual(before.composition.transitions)
    expect(planShowV2BoundaryTransitionChanges(before, 'transition-split-position', changes)).toEqual({ status: 'no-op' })
  })

  it('is a no-op when the section writes the ramp it already holds', () => {
    const v1 = stockV1()
    const changes = sectionChanges(v1, 'transition-split-position', 'repeat', 'on')
    expect(planShowV2BoundaryTransitionChanges(convert(v1), 'transition-split-position', changes)).toEqual({ status: 'no-op' })
  })
})
