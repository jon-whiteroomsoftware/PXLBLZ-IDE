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

  it('resetShowEditorView returns both slices to the neutral view for the new owner', () => {
    useShowEditorViewStore.getState().setSelection({ kind: 'zone', zoneId: 'zone-1' })
    useShowEditorViewStore.getState().setViewport({
      totalMs: 60_000, startMs: 0, durationMs: 5_000, minDurationMs: 1_000,
    })
    useShowEditorViewStore.getState().resetShowEditorView('show-b')
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'show' })
    expect(useShowEditorViewStore.getState().viewport).toBeNull()
    expect(useShowEditorViewStore.getState().ownerShowId).toBe('show-b')
  })

  it('drops epoch-tagged writes from a visit that no longer owns the view', () => {
    useShowEditorViewStore.getState().resetShowEditorView('show-a')
    const firstVisitEpoch = useShowEditorViewStore.getState().viewEpoch
    expect(useShowEditorViewStore.getState().setSelection({ kind: 'clip', clipId: 'a-clip' }, firstVisitEpoch))
      .toBe(true)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'clip', clipId: 'a-clip' })

    // Navigate show-a -> show-b -> show-a. The Show id repeats but the
    // epoch does not, so a continuation from the first visit is dropped
    // even though the id matches again — and the caller learns it.
    useShowEditorViewStore.getState().resetShowEditorView('show-b')
    useShowEditorViewStore.getState().resetShowEditorView('show-a')
    const secondVisitEpoch = useShowEditorViewStore.getState().viewEpoch
    useShowEditorViewStore.getState().setSelection({ kind: 'zone', zoneId: 'fresh' }, secondVisitEpoch)
    expect(useShowEditorViewStore.getState().setSelection({ kind: 'clip', clipId: 'a-clip' }, firstVisitEpoch))
      .toBe(false)
    expect(useShowEditorViewStore.getState().setViewport(
      { totalMs: 1_000, startMs: 0, durationMs: 500, minDurationMs: 100 },
      firstVisitEpoch,
    )).toBe(false)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'zone', zoneId: 'fresh' })
    expect(useShowEditorViewStore.getState().viewport).toBeNull()
    expect(useShowEditorViewStore.getState().ownerShowId).toBe('show-a')

    // Untagged writes (tests, tooling) still land unconditionally.
    expect(useShowEditorViewStore.getState().setSelection({ kind: 'zone', zoneId: 'z' })).toBe(true)
    expect(useShowEditorViewStore.getState().selection).toEqual({ kind: 'zone', zoneId: 'z' })
  })
})
