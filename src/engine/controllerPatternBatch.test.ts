import { describe, expect, it } from 'vitest'
import {
  enterControllerPatternSelection, toggleControllerPatternSelection,
  toggleAllControllerPatternSelection, reconcileControllerPatternSelection,
  runControllerPatternBatch,
  retryControllerPatternBatch,
  controllerPatternBatchNames,
  controllerPatternDeleteDisabledReason,
} from './controllerPatternBatch'

describe('Controller Pattern selection', () => {
  it.each(['saved', 'unimported', 'other'] as const)('keeps %s selection group-local with no resurrection', (section) => {
    const state = Object.freeze({ section, selectedIds: Object.freeze(['running', 'pending', section]) })
    const eligible = Object.freeze([section])
    const reconciled = reconcileControllerPatternSelection(state, eligible)
    expect(reconciled).toEqual({ section, selectedIds: [section] })
    expect(reconcileControllerPatternSelection(reconciled, [])).toEqual({ section, selectedIds: [] })
    expect(reconcileControllerPatternSelection(reconcileControllerPatternSelection(state, []), eligible)).toEqual({ section, selectedIds: [] })
    for (const next of ['saved', 'unimported', 'other'] as const) expect(enterControllerPatternSelection(next)).toEqual({ section: next, selectedIds: [] })
    expect(state).toEqual({ section, selectedIds: ['running', 'pending', section] })
    expect(eligible).toEqual([section])
  })
  it('switches sections empty and selects only eligible stable IDs without mutating inputs', () => {
    const eligible = Object.freeze(['a', 'b']) // only current group membership limits selection
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

  it('treats running and pending IDs as ordinary current members', () => {
    const eligible = Object.freeze(['running', 'pending'])
    expect(toggleAllControllerPatternSelection(enterControllerPatternSelection('saved'), eligible))
      .toEqual({ section: 'saved', selectedIds: ['running', 'pending'] })
  })

  it('reconciles inventory membership in selection order and handles empty eligibility', () => {
    const state = Object.freeze({ section: 'saved' as const, selectedIds: Object.freeze(['c', 'a', 'b']) })
    expect(reconcileControllerPatternSelection(state, ['b', 'c'])).toEqual({ section: 'saved', selectedIds: ['c', 'b'] })
    expect(reconcileControllerPatternSelection(state, [])).toEqual({ section: 'saved', selectedIds: [] })
    expect(toggleAllControllerPatternSelection(enterControllerPatternSelection('other'), [])).toEqual({ section: 'other', selectedIds: [] })
    expect(toggleControllerPatternSelection({ section: null, selectedIds: [] }, 'a', ['a'])).toEqual({ section: null, selectedIds: [] })
    expect(state.selectedIds).toEqual(['c', 'a', 'b'])
  })
})

describe('Controller Pattern Delete eligibility', () => {
  it.each([
    [false, 'active', null, 'safe', 'Waiting to confirm the running Pattern'],
    [true, undefined, null, 'safe', 'Waiting to confirm the running Pattern'],
    [true, '', null, 'safe', 'Waiting to confirm the running Pattern'],
    [true, '   ', null, 'safe', 'Waiting to confirm the running Pattern'],
    [true, 'active', 'pending', 'pending', 'Waiting to confirm the running Pattern'],
    [true, 'active', 'active', 'active', 'Waiting to confirm the running Pattern'],
    [true, 'active', null, 'active', 'Running now — switch to another Pattern first'],
    [true, 'active', 'pending', 'safe', null],
  ] as const)('returns the Delete reason for session %s, active %s, pending %s, id %s', (sessionKnown, activeProgramId, activatingProgramId, id, reason) => {
    const state = Object.freeze({ sessionKnown, activeProgramId, activatingProgramId })
    expect(controllerPatternDeleteDisabledReason(id, state)).toBe(reason)
    expect(state).toEqual({ sessionKnown, activeProgramId, activatingProgramId })
  })
})

describe('Controller Pattern batch', () => {
  const patterns = Object.freeze(['a', 'b', 'c'].map((id) => Object.freeze({ id, name: `Pattern ${id}` })))
  it('retries only failures and preserves cumulative successes and frozen prior outcomes', async () => {
    const first = await runControllerPatternBatch(patterns, async ({ id }) => { if (id === 'b') throw new Error('first failure') })
    Object.freeze(first.succeeded)
    Object.freeze(first.failed[0])
    Object.freeze(first.failed)
    Object.freeze(first)
    const calls: string[] = []
    const failed = await retryControllerPatternBatch(first, async ({ id }) => { calls.push(id); throw new Error('still failed') })
    expect(failed).toEqual({ succeeded: [patterns[0], patterns[2]], failed: [{ pattern: patterns[1], error: 'still failed' }] })
    const done = await retryControllerPatternBatch(failed, async ({ id }) => { calls.push(id) })
    expect(done).toEqual({ succeeded: [patterns[0], patterns[2], patterns[1]], failed: [] })
    expect(await retryControllerPatternBatch(done, async () => { throw new Error('unreachable') })).toEqual(done)
    expect(calls).toEqual(['b', 'b'])
    expect(first).toEqual({ succeeded: [patterns[0], patterns[2]], failed: [{ pattern: patterns[1], error: 'first failure' }] })
  })

  it('awaits each failed item before retrying the next', async () => {
    const previous = await runControllerPatternBatch(patterns, async () => { throw new Error('failed') })
    let release!: () => void
    const hold = new Promise<void>((resolve) => { release = resolve })
    const calls: string[] = []
    const retry = retryControllerPatternBatch(previous, async ({ id }) => { calls.push(id); if (id === 'a') await hold })
    expect(calls).toEqual(['a'])
    release()
    expect(await retry).toEqual({ succeeded: patterns, failed: [] })
    expect(calls).toEqual(['a', 'b', 'c'])
  })
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
