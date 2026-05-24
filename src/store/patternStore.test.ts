import { describe, it, expect, beforeEach } from 'vitest'
import { usePatternStore, patternInitialState, SEED_PATTERN_ID } from './patternStore'

beforeEach(() => {
  usePatternStore.setState(patternInitialState)
})

describe('patternStore', () => {
  it('starts with the seed pattern selected', () => {
    expect(usePatternStore.getState().activePatternId).toBe(SEED_PATTERN_ID)
  })

  it('setActivePattern updates activePatternId', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    expect(usePatternStore.getState().activePatternId).toBe('abc-123')
  })

  it('setActivePattern can clear selection', () => {
    usePatternStore.getState().setActivePattern('abc-123')
    usePatternStore.getState().setActivePattern(null)
    expect(usePatternStore.getState().activePatternId).toBeNull()
  })
})
