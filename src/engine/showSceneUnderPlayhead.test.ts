import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import { currentShowScene } from './showReferenceShow'

describe('Scene under the live-strip playhead (#985)', () => {
  const show = createDefaultShow('lesson', 'Lesson', 0)
  show.scenes = [
    { id: 'first', name: 'Reference', durationMs: 4000 },
    { id: 'second', name: 'Position', durationMs: 6000 },
  ]
  show.transitions = []

  it.each([
    [0, 'Reference', 0],
    [3999, 'Reference', 0],
    [4000, 'Position', 1],
    [9999, 'Position', 1],
    [10000, 'Reference', 0],
    [14000, 'Position', 1],
    [-1, 'Position', 1],
  ])('at %i ms names %s, index %i', (time, name, index) => {
    expect(currentShowScene(show, time)).toMatchObject({ scene: { name }, index })
  })

  it('wraps a one-Scene Show to its only Scene', () => {
    expect(currentShowScene({ ...show, scenes: show.scenes.slice(0, 1) }, 9000))
      .toMatchObject({ scene: { name: 'Reference' }, index: 0 })
  })

  it('returns no Scene for an empty Show', () => {
    expect(currentShowScene({ ...show, scenes: [] }, 0)).toBeNull()
  })
})
