import { beforeEach, describe, expect, it } from 'vitest'
import { useShowClipHoverStore } from './showClipHoverStore'

describe('showClipHoverStore (#884)', () => {
  beforeEach(() => {
    useShowClipHoverStore.getState().resetHoveredClip()
  })

  it('tracks the clip under the pointer', () => {
    expect(useShowClipHoverStore.getState().hoveredClipId).toBeNull()
    useShowClipHoverStore.getState().setHoveredClip('clip-1')
    expect(useShowClipHoverStore.getState().hoveredClipId).toBe('clip-1')
  })

  it('a stale leave never clobbers a newer enter', () => {
    const store = useShowClipHoverStore.getState()
    store.setHoveredClip('clip-1')
    useShowClipHoverStore.getState().setHoveredClip('clip-2')
    // clip-1's pointerleave arrives after clip-2's pointerenter.
    useShowClipHoverStore.getState().clearHoveredClip('clip-1')
    expect(useShowClipHoverStore.getState().hoveredClipId).toBe('clip-2')
    useShowClipHoverStore.getState().clearHoveredClip('clip-2')
    expect(useShowClipHoverStore.getState().hoveredClipId).toBeNull()
  })

  it('resetHoveredClip clears unconditionally on Show switch', () => {
    useShowClipHoverStore.getState().setHoveredClip('clip-9')
    useShowClipHoverStore.getState().resetHoveredClip()
    expect(useShowClipHoverStore.getState().hoveredClipId).toBeNull()
  })
})
