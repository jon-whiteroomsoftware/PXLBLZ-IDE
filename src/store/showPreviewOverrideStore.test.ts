import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultShow } from '@/engine/showModel'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from './showPreviewOverrideStore'

describe('Show preview override store', () => {
  beforeEach(() => useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState))

  it('exposes one ephemeral candidate Show and clears only its owner', () => {
    const show = createDefaultShow('show-1', 'Preview', 1)
    useShowPreviewOverrideStore.getState().preview(show)

    expect(useShowPreviewOverrideStore.getState().show).toBe(show)
    useShowPreviewOverrideStore.getState().clear('another-show')
    expect(useShowPreviewOverrideStore.getState().show).toBe(show)
    useShowPreviewOverrideStore.getState().clear('show-1')
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
  })

  it('does not notify the Stage when there is no candidate preview to clear', () => {
    const updates: Array<unknown> = []
    const unsubscribe = useShowPreviewOverrideStore.subscribe((state) => updates.push(state.show))

    useShowPreviewOverrideStore.getState().clear('show-1')

    expect(updates).toEqual([])
    unsubscribe()
  })
})
