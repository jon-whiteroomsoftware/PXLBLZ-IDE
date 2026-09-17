import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShowTimelineGestureSurface, type ShowTimelineGestureHandlers } from './ShowTimelineGestureSurface'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { transitionV1Show } from '@/test/showV2TracerFixture'

const LANE_WIDTH_PX = 1_000

/** "out" 0-400 and "in" 600-1000 on one Layer, inside a four-second Show. */
function record(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  converted.record.composition.showEndMs = 4_000
  converted.record.composition.layoutOccurrences[0].durationMs = 4_000
  return converted.record
}

function renderSurface(overrides: Partial<ShowTimelineGestureHandlers> = {}) {
  const submit = vi.fn()
  const undo = vi.fn()
  const redo = vi.fn()
  const onFocused = vi.fn()
  const handlers: ShowTimelineGestureHandlers = {
    submit, undo, redo, canUndo: true, canRedo: true, busy: false, focusClipId: null, onFocused, ...overrides,
  }
  render(
    <ShowTimelineGestureSurface
      view={projectShowTimelineV2(record())}
      statusLine="Editing this v2 Show."
      gestures={handlers}
    />,
  )
  return { submit, undo, redo, onFocused }
}

const body = (name: string) => screen.getByRole('button', { name: new RegExp(`^Clip ${name},`) })
const edge = (side: 'Start' | 'End', name: string) =>
  screen.getByRole('button', { name: new RegExp(`^${side} edge of Clip ${name},`) })

beforeEach(() => {
  // jsdom reports a zero-sized layout; the lane needs a width to map pixels to time.
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0, y: 0, top: 0, left: 0, right: LANE_WIDTH_PX, bottom: 32, width: LANE_WIDTH_PX, height: 32,
    toJSON: () => ({}),
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('v2 timeline gesture surface', () => {
  it('nudges a Clip by one grid step, refined while Shift is held', () => {
    const { submit } = renderSurface()

    fireEvent.keyDown(body('Outgoing'), { key: 'ArrowRight' })
    expect(submit).toHaveBeenLastCalledWith({
      kind: 'move', clipId: 'out', startMs: 1_000, zoneId: 'zone', layerId: 'layer:zone:main',
    })

    fireEvent.keyDown(body('Outgoing'), { key: 'ArrowRight', shiftKey: true })
    expect(submit).toHaveBeenLastCalledWith({
      kind: 'move', clipId: 'out', startMs: 100, zoneId: 'zone', layerId: 'layer:zone:main',
    })

    // The connected chain cannot slide before zero, so "out" holds its start.
    fireEvent.keyDown(body('Incoming'), { key: 'ArrowLeft' })
    expect(submit).toHaveBeenLastCalledWith({
      kind: 'move', clipId: 'in', startMs: 600, zoneId: 'zone', layerId: 'layer:zone:main',
    })
  })

  it('moves one Clip edge from its own handle', () => {
    const { submit } = renderSurface()

    fireEvent.keyDown(edge('End', 'Outgoing'), { key: 'ArrowRight' })
    expect(submit).toHaveBeenLastCalledWith({ kind: 'resize-trailing', clipId: 'out', endMs: 1_400 })

    fireEvent.keyDown(edge('Start', 'Incoming'), { key: 'ArrowLeft' })
    expect(submit).toHaveBeenLastCalledWith({ kind: 'resize-leading', clipId: 'in', startMs: 0 })
  })

  it.each([
    ['s', { kind: 'split', clipId: 'out', atMs: 200 }],
    ['d', { kind: 'duplicate', clipId: 'out', startMs: 400, zoneId: 'zone', layerId: 'layer:zone:main' }],
    ['Delete', { kind: 'delete', clipId: 'out' }],
  ])('maps the %s key onto its gesture', (key, gesture) => {
    const { submit } = renderSurface()
    fireEvent.keyDown(body('Outgoing'), { key })
    expect(submit).toHaveBeenCalledWith(gesture)
  })

  it('splits at the pointer time on a double click', () => {
    const { submit } = renderSurface()
    fireEvent.doubleClick(body('Outgoing'), { clientX: 75 })
    expect(submit).toHaveBeenCalledWith({ kind: 'split', clipId: 'out', atMs: 300 })
  })

  it('drags a Clip to a new start and cancels cleanly on Escape', () => {
    const { submit } = renderSurface()

    fireEvent.pointerDown(body('Outgoing'), { button: 0, clientX: 0, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 500, pointerId: 1 })
    const preview = document.querySelector('[data-show-drop-preview]')
    expect(preview).toHaveAttribute('data-show-drop-preview', 'move')
    fireEvent.pointerUp(window, { clientX: 500, pointerId: 1 })
    expect(submit).toHaveBeenLastCalledWith({
      kind: 'move', clipId: 'out', startMs: 2_000, zoneId: 'zone', layerId: 'layer:zone:main',
    })

    submit.mockClear()
    fireEvent.pointerDown(body('Outgoing'), { button: 0, clientX: 0, pointerId: 2 })
    fireEvent.pointerMove(window, { clientX: 300, pointerId: 2 })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(document.querySelector('[data-show-drop-preview]')).toBeNull()
    fireEvent.pointerUp(window, { clientX: 300, pointerId: 2 })
    expect(submit).not.toHaveBeenCalled()
  })

  it('Alt-drags into a linked duplicate and marks a colliding drop', () => {
    const { submit } = renderSurface()

    fireEvent.pointerDown(body('Outgoing'), { button: 0, clientX: 0, pointerId: 3, altKey: true })
    // 600 ms lands "out" on top of "in".
    fireEvent.pointerMove(window, { clientX: 150, pointerId: 3, altKey: true })
    expect(document.querySelector('[data-show-drop-preview]'))
      .toHaveAttribute('data-show-drop-collides', 'true')
    fireEvent.pointerUp(window, { clientX: 150, pointerId: 3, altKey: true })

    expect(submit).toHaveBeenLastCalledWith({
      kind: 'duplicate', clipId: 'out', startMs: 600, zoneId: 'zone', layerId: 'layer:zone:main',
    })
  })

  it('submits nothing when a drag lands where the Clip already was', () => {
    const { submit } = renderSurface()
    fireEvent.pointerDown(body('Outgoing'), { button: 0, clientX: 0, pointerId: 4 })
    fireEvent.pointerMove(window, { clientX: 1, pointerId: 4 })
    fireEvent.pointerUp(window, { clientX: 1, pointerId: 4 })
    expect(submit).not.toHaveBeenCalled()
  })

  it('runs Undo and Redo from the keyboard and the history controls', () => {
    const { undo, redo } = renderSurface()
    const surface = screen.getByTestId('show-timeline-read-only')

    fireEvent.keyDown(surface, { key: 'z', metaKey: true })
    expect(undo).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(surface, { key: 'z', metaKey: true, shiftKey: true })
    expect(redo).toHaveBeenCalledTimes(1)

    const history = screen.getByRole('group', { name: 'Show history' })
    fireEvent.click(within(history).getByRole('button', { name: 'Undo' }))
    expect(undo).toHaveBeenCalledTimes(2)
  })

  it('offers no history direction the record does not have', () => {
    const { undo, redo } = renderSurface({ canUndo: false, canRedo: false })
    const history = screen.getByRole('group', { name: 'Show history' })
    for (const label of ['Undo', 'Redo']) {
      const control = within(history).getByRole('button', { name: label })
      expect(control).toHaveAttribute('aria-disabled', 'true')
      fireEvent.click(control)
    }
    expect(undo).not.toHaveBeenCalled()
    expect(redo).not.toHaveBeenCalled()
  })

  it('starts no gesture while an edit is in flight', () => {
    const { submit, undo } = renderSurface({ busy: true })
    fireEvent.keyDown(body('Outgoing'), { key: 'ArrowRight' })
    fireEvent.doubleClick(body('Outgoing'), { clientX: 75 })
    fireEvent.pointerDown(body('Outgoing'), { button: 0, clientX: 0, pointerId: 5 })
    fireEvent.pointerMove(window, { clientX: 500, pointerId: 5 })
    fireEvent.pointerUp(window, { clientX: 500, pointerId: 5 })
    fireEvent.keyDown(screen.getByTestId('show-timeline-read-only'), { key: 'z', metaKey: true })
    expect(submit).not.toHaveBeenCalled()
    expect(undo).not.toHaveBeenCalled()
    expect(document.querySelector('[data-show-drop-preview]')).toBeNull()
  })

  it('follows keyboard focus to a Clip a gesture just created', () => {
    const { onFocused } = renderSurface({ focusClipId: 'in' })
    expect(body('Incoming')).toHaveFocus()
    expect(onFocused).toHaveBeenCalledTimes(1)
  })
})
