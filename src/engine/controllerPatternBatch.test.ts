import { describe, expect, it } from 'vitest'
import {
  enterControllerPatternSelection, toggleControllerPatternSelection,
  toggleAllControllerPatternSelection, reconcileControllerPatternSelection,
  runControllerPatternBatch,
  controllerPatternBatchNames,
  planControllerBatchDelete, confirmControllerBatchDelete,
} from './controllerPatternBatch'

describe('Controller Pattern selection', () => {
  it('switches sections empty and selects only eligible stable IDs without mutating inputs', () => {
    const eligible = Object.freeze(['a', 'b']) // running and pending IDs are excluded by the caller
    const empty = Object.freeze({ ...enterControllerPatternSelection('other'), selectedIds: Object.freeze([]) })
    expect(toggleControllerPatternSelection(empty, 'running', eligible)).toEqual(empty)
    expect(toggleControllerPatternSelection(empty, 'pending', eligible)).toEqual(empty)
    const some = toggleControllerPatternSelection(empty, 'b', eligible)
    expect(some).toEqual({ section: 'other', selectedIds: ['b'] })
    expect(toggleAllControllerPatternSelection(some, eligible)).toEqual({ section: 'other', selectedIds: ['a', 'b'] })
    expect(toggleAllControllerPatternSelection({ section: 'saved', selectedIds: eligible }, eligible)).toEqual({ section: 'saved', selectedIds: [] })
    expect(toggleControllerPatternSelection(some, 'b', eligible)).toEqual(empty)
    expect(enterControllerPatternSelection('saved')).toEqual({ section: 'saved', selectedIds: [] })
    expect(empty).toEqual({ section: 'other', selectedIds: [] })
    expect(eligible).toEqual(['a', 'b'])
  })

  it('reconciles inventory/status changes in selection order and handles empty eligibility', () => {
    const state = Object.freeze({ section: 'saved' as const, selectedIds: Object.freeze(['c', 'a', 'b']) })
    expect(reconcileControllerPatternSelection(state, ['b', 'c'])).toEqual({ section: 'saved', selectedIds: ['c', 'b'] })
    expect(reconcileControllerPatternSelection(state, [])).toEqual({ section: 'saved', selectedIds: [] })
    expect(toggleAllControllerPatternSelection(enterControllerPatternSelection('other'), [])).toEqual({ section: 'other', selectedIds: [] })
    expect(toggleControllerPatternSelection({ section: null, selectedIds: [] }, 'a', ['a'])).toEqual({ section: null, selectedIds: [] })
    expect(state.selectedIds).toEqual(['c', 'a', 'b'])
  })
})

describe('Controller Pattern batch', () => {
  const patterns = Object.freeze(['a', 'b', 'c'].map((id) => Object.freeze({ id, name: `Pattern ${id}` })))
  it('lists at most eight confirmation names with the exact remainder', () => {
    const names = Array.from({ length: 11 }, (_, index) => ({ id: String(index), name: `Pattern ${index}` }))
    expect(controllerPatternBatchNames(names)).toEqual(['Pattern 0', 'Pattern 1', 'Pattern 2', 'Pattern 3', 'Pattern 4', 'Pattern 5', 'Pattern 6', 'Pattern 7', '…3 more'])
    expect(controllerPatternBatchNames(patterns)).toEqual(['Pattern a', 'Pattern b', 'Pattern c'])
  })
  it.each([0, 1, 2])('continues after failure at index %s with complete ordered results', async (failedIndex) => {
    const calls: string[] = []
    expect(await runControllerPatternBatch(patterns, async (pattern) => {
      calls.push(pattern.id)
      if (pattern === patterns[failedIndex]) throw new Error('readback failed')
    })).toEqual({
      succeeded: patterns.filter((_, index) => index !== failedIndex),
      failed: [{ pattern: patterns[failedIndex], error: 'readback failed' }],
    })
    expect(calls).toEqual(['a', 'b', 'c'])
    expect(patterns).toEqual([{ id: 'a', name: 'Pattern a' }, { id: 'b', name: 'Pattern b' }, { id: 'c', name: 'Pattern c' }])
  })

  it('awaits each operation before beginning the next', async () => {
    let release!: () => void
    const first = new Promise<void>((resolve) => { release = resolve })
    const calls: string[] = []
    const result = runControllerPatternBatch(patterns, async (pattern) => {
      calls.push(pattern.id)
      if (pattern.id === 'a') await first
    })
    expect(calls).toEqual(['a'])
    release()
    expect(await result).toEqual({ succeeded: patterns, failed: [] })
    expect(calls).toEqual(['a', 'b', 'c'])
    expect(await runControllerPatternBatch([], async () => { throw new Error('unreachable') })).toEqual({ succeeded: [], failed: [] })
  })
})

describe('Controller bulk delete plan and confirmation (#1266)', () => {
  const baseline = Object.freeze([
    { id: 'RUN', name: 'Running' }, { id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' },
    { id: 'C', name: 'Gamma' }, { id: 'KEEP', name: 'Keeper' },
  ])
  const target = (id: string, expectedName: string) => ({ id, expectedName })

  it('sends eligible targets in order and classifies running, renamed and absent targets', () => {
    const plan = planControllerBatchDelete(baseline, { activeProgramId: 'RUN', runSequencer: false }, [
      target('A', 'Alpha'), target('RUN', 'Running'), target('B', 'Old Beta'), target('GONE', 'Gone'), target('C', 'Gamma'),
    ])
    expect(plan).toEqual({ steps: [
      { target: target('A', 'Alpha'), action: 'send' },
      { target: target('RUN', 'Running'), action: 'skip', reason: 'Running now — switch to another Pattern first' },
      { target: target('B', 'Old Beta'), action: 'skip', reason: 'Controller Pattern id B now identifies Beta; choose the Pattern again before deleting.' },
      { target: target('GONE', 'Gone'), action: 'absent' },
      { target: target('C', 'Gamma'), action: 'send' },
    ] })
  })

  it.each([
    [{}, 'Controller did not identify its running Pattern; refresh before deleting.'],
    [{ activeProgramId: '' }, 'Controller did not identify its running Pattern; refresh before deleting.'],
    [{ activeProgramId: 'RUN', runSequencer: true }, 'Stop the Controller sequencer before deleting saved Patterns.'],
  ])('refuses the whole batch for config %o', (config, refusal) => {
    expect(planControllerBatchDelete(baseline, config, [target('A', 'Alpha')])).toEqual({ refusal })
  })

  it('confirms only processed ids absent from the final read', () => {
    const final = [{ id: 'RUN', name: 'Running' }, { id: 'B', name: 'Beta' }, { id: 'KEEP', name: 'Keeper' }]
    expect(confirmControllerBatchDelete(baseline, final, ['A', 'B', 'C', 'GONE'], ['A', 'B', 'C'])).toEqual({
      confirmedIds: ['A', 'C', 'GONE'], stillListedIds: ['B'], collateral: [],
    })
  })

  it('reports unsent baseline Patterns that disappeared or were renamed as collateral', () => {
    // B was refused (not sent), so it stays protected even though it was selected.
    const final = [{ id: 'RUN', name: 'Running' }, { id: 'KEEP', name: 'Renamed' }]
    expect(confirmControllerBatchDelete(baseline, final, ['A', 'C'], ['A', 'C'])).toEqual({
      confirmedIds: ['A', 'C'], stillListedIds: [],
      collateral: [{ id: 'B', name: 'Beta' }, { id: 'KEEP', name: 'Keeper' }],
    })
  })
})
