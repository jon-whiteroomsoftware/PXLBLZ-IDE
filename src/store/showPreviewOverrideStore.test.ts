import { beforeEach, describe, expect, it } from 'vitest'
import { createDefaultShow } from '@/engine/showModel'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { showPreviewOverrideInitialState, showV2StageRecord, useShowPreviewOverrideStore } from './showPreviewOverrideStore'

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

describe('Show v2 preview override (#1066 slice 5c)', () => {
  const v2Record = (id: string): ShowRecordV2 => ({ id }) as ShowRecordV2

  beforeEach(() => useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState))

  it('previews a v2 candidate and clears it by owner id', () => {
    const candidate = v2Record('show-v2-1')
    useShowPreviewOverrideStore.getState().previewV2(candidate)

    expect(useShowPreviewOverrideStore.getState().showV2).toBe(candidate)
    useShowPreviewOverrideStore.getState().clear('show-v2-1')
    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
  })

  it('leaves the v2 candidate when clearing another Show id', () => {
    const candidate = v2Record('show-v2-1')
    useShowPreviewOverrideStore.getState().previewV2(candidate)

    useShowPreviewOverrideStore.getState().clear('another-show')

    expect(useShowPreviewOverrideStore.getState().showV2).toBe(candidate)
  })

  it('clears each backing only for its own owner id', () => {
    const show = createDefaultShow('show-1', 'Preview', 1)
    const candidate = v2Record('show-v2-1')
    useShowPreviewOverrideStore.getState().preview(show)
    useShowPreviewOverrideStore.getState().previewV2(candidate)

    useShowPreviewOverrideStore.getState().clear('show-1')

    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(useShowPreviewOverrideStore.getState().showV2).toBe(candidate)

    useShowPreviewOverrideStore.getState().clear()

    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(useShowPreviewOverrideStore.getState().showV2).toBeNull()
  })

  it('routes the Stage to the override only for the matching pilot id', () => {
    const pilot = v2Record('show-v2-1')
    const override = v2Record('show-v2-1')
    const stranger = v2Record('show-v2-2')

    expect(showV2StageRecord(pilot, override)).toBe(override)
    expect(showV2StageRecord(pilot, stranger)).toBe(pilot)
    expect(showV2StageRecord(pilot, null)).toBe(pilot)
    expect(showV2StageRecord(undefined, override)).toBeUndefined()
  })
})
