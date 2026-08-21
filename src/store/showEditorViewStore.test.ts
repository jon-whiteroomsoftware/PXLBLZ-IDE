import { beforeEach, describe, expect, it } from 'vitest'
import { showEditorViewInitialState, useShowEditorViewStore } from './showEditorViewStore'

describe('showEditorViewStore (#884)', () => {
  beforeEach(() => {
    useShowEditorViewStore.setState({ ...showEditorViewInitialState })
  })

  it('starts at the neutral view: Show-level selection, fitted viewport', () => {
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'show' })
    expect(useShowEditorViewStore.getState().viewport).toBeNull()
  })

  it('holds the selection non-component readers can observe', () => {
    useShowEditorViewStore.getState().setSelection({ kind: 'clip', clipId: 'clip-1' })
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: 'clip-1' })
    useShowEditorViewStore.getState().setSelection({
      kind: 'zone-layout',
      layoutId: 'layout-1',
      intervalId: 'occurrence-1',
    })
    expect(useShowEditorViewStore.getState().selection.kind).toBe('zone-layout')
  })

  it('holds the visible range, with null meaning fitted', () => {
    const viewport = { totalMs: 60_000, startMs: 10_000, durationMs: 20_000, minDurationMs: 1_000 }
    useShowEditorViewStore.getState().setViewport(viewport)
    expect(useShowEditorViewStore.getState().viewport).toEqual(viewport)
    useShowEditorViewStore.getState().setViewport(null)
    expect(useShowEditorViewStore.getState().viewport).toBeNull()
  })

  it('resetShowEditorView returns both slices to the neutral view', () => {
    useShowEditorViewStore.getState().setSelection({ kind: 'zone', zoneId: 'zone-1' })
    useShowEditorViewStore.getState().setViewport({
      totalMs: 60_000, startMs: 0, durationMs: 5_000, minDurationMs: 1_000,
    })
    useShowEditorViewStore.getState().resetShowEditorView()
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'show' })
    expect(useShowEditorViewStore.getState().viewport).toBeNull()
  })
})
