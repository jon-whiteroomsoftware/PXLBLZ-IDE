// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { projectShowEditorTimelineV2 } from '@/engine/showEditorTimelinePresentation'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import * as admission from '@/store/showV2PreparedEditAdmission'
import { SHOW_V2_SPLIT_DRY_RUN_THROTTLE_MS, useShowV2SplitDryRun } from './useShowV2SplitDryRun'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

function fixture() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw Error('Conversion')
  const record = converted.record
  const clip = record.composition.clips[0]
  const capture = (next: ShowRecordV2) => ({ record: next, dependencies: { patterns: [], maps: [], libraries: [], profiles: [], stageMap: null }, prepared: { status: 'empty' as const, record: next } })
  return { record, clip, capture }
}

it('throttles playhead-only dry-runs to the first change and the trailing edge, and reruns at once for a new record (#1126)', () => {
  const { record, clip, capture } = fixture()
  const dryRun = vi.spyOn(admission, 'checkShowV2ClipTemporal')
    .mockImplementation((_capture, intent) => ({ status: 'refused', source: 'admission', code: 'unsupported-pilot-record', message: `refused at ${intent.kind === 'split' ? intent.atMs : -1}` }))
  try {
    const geometry = { enabled: true, reason: 'Split the selected Clip at the playhead.' }
    const view = projectShowEditorTimelineV2(record)
    const initial = { geometry, view, targetClipId: clip.id, positionMs: clip.startMs + 100, capture: capture(record) }
    const hook = renderHook((props: typeof initial) => useShowV2SplitDryRun(props), { initialProps: initial })
    expect(dryRun).toHaveBeenCalledTimes(1)
    expect(hook.result.current).toEqual({ enabled: false, reason: `refused at ${clip.startMs + 100}` })

    act(() => { vi.advanceTimersByTime(SHOW_V2_SPLIT_DRY_RUN_THROTTLE_MS) })
    dryRun.mockClear()
    for (let step = 1; step <= 5; step += 1) {
      hook.rerender({ ...initial, positionMs: clip.startMs + 100 + step * 10 })
      act(() => { vi.advanceTimersByTime(15) })
    }
    expect(dryRun).toHaveBeenCalledTimes(1)
    act(() => { vi.advanceTimersByTime(SHOW_V2_SPLIT_DRY_RUN_THROTTLE_MS) })
    expect(dryRun).toHaveBeenCalledTimes(2)
    expect(dryRun.mock.calls[1][1]).toMatchObject({ kind: 'split', atMs: clip.startMs + 150 })
    expect(hook.result.current.reason).toBe(`refused at ${clip.startMs + 150}`)

    dryRun.mockClear()
    const changed = structuredClone(record)
    hook.rerender({ ...initial, positionMs: clip.startMs + 150, view: projectShowEditorTimelineV2(changed), capture: capture(changed) })
    expect(dryRun).toHaveBeenCalledTimes(1)
    expect(dryRun.mock.calls[0][0].record).toBe(changed)
  } finally {
    dryRun.mockRestore()
  }
})
