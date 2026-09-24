import { describe, expect, it } from 'vitest'
import { showLayerTransitionPopoverKey } from './showLayerTransitionPopoverKey'

describe('showLayerTransitionPopoverKey (#1098)', () => {
  it('tells linked Group occurrences apart although they share the definition Transition id', () => {
    const first = showLayerTransitionPopoverKey({ groupOccurrenceId: 'occurrence-first', groupTransitionId: 'group-pulse-join' })
    const second = showLayerTransitionPopoverKey({ groupOccurrenceId: 'occurrence-second', groupTransitionId: 'group-pulse-join' })
    expect(first).not.toBe(second)
    expect(showLayerTransitionPopoverKey({ groupOccurrenceId: 'occurrence-first', groupTransitionId: 'group-pulse-join' })).toBe(first)
  })

  it('tells a top-level Transition, a Group-local one and a v1 junction apart', () => {
    const keys = [
      showLayerTransitionPopoverKey({ transitionId: 'join' }),
      showLayerTransitionPopoverKey({ groupOccurrenceId: 'occurrence-first', groupTransitionId: 'join' }),
      showLayerTransitionPopoverKey({ legacy: { id: 'join' } }),
      showLayerTransitionPopoverKey({ groupOccurrenceId: 'occurrence-first', legacy: { id: 'join' } }),
    ]
    expect(new Set(keys).size).toBe(keys.length)
  })
})
