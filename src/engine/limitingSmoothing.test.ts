import { describe, expect, it } from 'vitest'
import {
  createLimitingSmoothingState,
  updateLimitingSmoothing,
} from './limitingSmoothing'

function feed(initial: boolean, samples: boolean[]) {
  return samples.reduce(updateLimitingSmoothing, createLimitingSmoothingState(initial))
}

describe('limiting majority smoothing', () => {
  it('keeps steady idle and limiting samples unchanged', () => {
    expect(feed(false, [false, false, false]).active).toBe(false)
    expect(feed(true, [true, true, true]).active).toBe(true)
  })

  it('rejects a single limiting blip after idle polls', () => {
    expect(feed(false, [false, true])).toEqual({
      samples: [false, false, true],
      active: false,
    })
  })

  it('rejects a single idle blip after limiting polls', () => {
    expect(feed(true, [true, false])).toEqual({
      samples: [true, true, false],
      active: true,
    })
  })

  it('tracks the moving majority for alternating samples and keeps only three polls', () => {
    const state = feed(false, [true, false, true])
    expect(state).toEqual({ samples: [true, false, true], active: true })
  })
})
