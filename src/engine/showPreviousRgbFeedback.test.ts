import { describe, expect, it } from 'vitest'
import {
  applyPreviousRgbDecay,
  completePreviousRgbFrame,
  createPreviousRgbFeedbackState,
  describePreviousRgbSeek,
  resolvePreviousRgbTransitionConflict,
  stepPreviousRgbFeedback,
} from './showPreviousRgbFeedback'

describe('previous-RGB feedback state (#537)', () => {
  it('seeds one complete frame before temporal feedback becomes readable', () => {
    const initial = createPreviousRgbFeedbackState()

    const first = stepPreviousRgbFeedback(initial, {
      ownerToken: 7,
      invalidationToken: 0,
      elapsedMs: 16,
    })
    expect(first.mode).toBe('seed')
    expect(first.state.ready).toBe(false)

    const ready = completePreviousRgbFrame(first.state)
    const second = stepPreviousRgbFeedback(ready, {
      ownerToken: 7,
      invalidationToken: 0,
      elapsedMs: 32,
    })
    expect(second.mode).toBe('feedback')
    expect(second.state.ready).toBe(true)
  })

  it('clears readiness deterministically on Scene ownership, semantic invalidation, loop, or seek rewind', () => {
    const ready = completePreviousRgbFrame(stepPreviousRgbFeedback(createPreviousRgbFeedbackState(), {
      ownerToken: 3,
      invalidationToken: 10,
      elapsedMs: 500,
    }).state)

    expect(stepPreviousRgbFeedback(ready, {
      ownerToken: 4,
      invalidationToken: 10,
      elapsedMs: 516,
    })).toMatchObject({ mode: 'seed', invalidation: 'owner-changed', state: { ready: false } })
    expect(stepPreviousRgbFeedback(ready, {
      ownerToken: 3,
      invalidationToken: 11,
      elapsedMs: 516,
    })).toMatchObject({ mode: 'seed', invalidation: 'semantic-change', state: { ready: false } })
    expect(stepPreviousRgbFeedback(ready, {
      ownerToken: 3,
      invalidationToken: 10,
      elapsedMs: 0,
    })).toMatchObject({ mode: 'seed', invalidation: 'time-rewind', state: { ready: false } })
  })

  it('preserves live linear RGB while retaining only brighter decaying history', () => {
    expect(applyPreviousRgbDecay(
      [0.8, 0.1, 0.4],
      [0.5, 0.9, 0.2],
      0.75,
    )).toEqual([0.8, 0.675, 0.4])
    expect(applyPreviousRgbDecay([0.1, 0.2, 0.3], [1, 1, 1], -1)).toEqual([0.1, 0.2, 0.3])
    expect(applyPreviousRgbDecay([0.1, 0.2, 0.3], [1, 1, 1], 2)).toEqual([1, 1, 1])
  })

  it.each([
    ['suspend-clear', 'snapshot-live', 'suspend-clear', false],
    ['force-live-live', 'live-live', 'continuous', false],
    ['author-choice', 'unresolved', 'unresolved', true],
  ] as const)('models the %s Transition conflict policy without a fourth buffer', (
    policy,
    transitionMode,
    feedbackMode,
    blocksCompilation,
  ) => {
    expect(resolvePreviousRgbTransitionConflict(policy, true)).toMatchObject({
      policy,
      transitionMode,
      feedbackMode,
      blocksCompilation,
      additionalArrayWords: 0,
    })
  })

  it('quantifies exact-history and clear-at-target seek contracts', () => {
    expect(describePreviousRgbSeek('reconstruct-history', 300_000, 1_000 / 60)).toEqual({
      policy: 'reconstruct-history',
      feedbackFrames: 18_000,
      preservesHistory: true,
      seedsAtTarget: false,
    })
    expect(describePreviousRgbSeek('clear-at-target', 300_000, 1_000 / 60)).toEqual({
      policy: 'clear-at-target',
      feedbackFrames: 0,
      preservesHistory: false,
      seedsAtTarget: true,
    })
  })
})
