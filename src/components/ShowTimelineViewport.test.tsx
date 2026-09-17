import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShowTimelineGestureSurface, type ShowTimelineGestureHandlers } from './ShowTimelineGestureSurface'
import { ShowTimelineReadOnlySurface } from './ShowTimelineReadOnlySurface'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { transitionV1Show } from '@/test/showV2TracerFixture'

/**
 * The v2 timeline's visible window (#1039).
 *
 * The oracle is what the consumer sees: the owner intent a gesture submits, the
 * drawn geometry of a Clip, the playhead and the lanes, and the absence of any
 * submission when only the view changed. The window itself is read back from
 * the ruler, which publishes it.
 */

const LANE_WIDTH_PX = 1_000
const SHOW_END_MS = 4_000
const MARKER_MS = 2_345

/** "out" 0-400 and "in" 600-1000 on one Layer, inside a four-second Show. */
function record(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  converted.record.composition.showEndMs = SHOW_END_MS
  converted.record.composition.layoutOccurrences[0].durationMs = SHOW_END_MS
  converted.record.composition.markers = [
    { id: 'marker-1', timeMs: MARKER_MS, name: 'Drop' },
    { id: 'marker-2', timeMs: SHOW_END_MS + 2_000, name: 'Dormant' },
  ]
  return converted.record
}

/** The same Show with no Transition and "in" moved off the drop grid. */
function detachedRecord(): ShowRecordV2 {
  const detached = record()
  detached.composition.transitions = []
  const incoming = detached.composition.clips.find((clip) => clip.id === 'in')!
  incoming.startMs = 1_650
  return detached
}

function renderGestures(source: ShowRecordV2 = record()) {
  const submit = vi.fn()
  const view = projectShowTimelineV2(source)
  const handlers: ShowTimelineGestureHandlers = {
    submit,
    undo: vi.fn(),
    redo: vi.fn(),
    canUndo: false,
    canRedo: false,
    busy: false,
    focusClipId: null,
    onFocused: vi.fn(),
  }
  const surface = (next: typeof view) => (
    <ShowTimelineGestureSurface
      view={next}
      transportShowId="show-1"
      statusLine="Editing this v2 Show."
      gestures={handlers}
    />
  )
  const { rerender } = render(surface(view))
  return { submit, view, rerender: (next: typeof view) => rerender(surface(next)) }
}

/** The visible window, read back from the ruler that draws it. */
function visibleWindow(): { startMs: number; durationMs: number } {
  const ruler = screen.getByTestId('show-timeline-read-only-ruler')
  return {
    startMs: Number(ruler.getAttribute('data-show-visible-start-ms')),
    durationMs: Number(ruler.getAttribute('data-show-visible-duration-ms')),
  }
}

/** Zoom in through the navigator's own keyboard until the window is short enough. */
function zoomUntil(maximumDurationMs: number): { startMs: number; durationMs: number } {
  const endHandle = screen.getByRole('button', { name: 'Resize visible range end' })
  for (let press = 0; press < 40 && visibleWindow().durationMs > maximumDurationMs; press += 1) {
    fireEvent.keyDown(endHandle, { key: 'ArrowLeft' })
  }
  const zoomed = visibleWindow()
  expect(zoomed.durationMs).toBeLessThanOrEqual(maximumDurationMs)
  return zoomed
}

const body = (name: string) => screen.getByRole('button', { name: new RegExp(`^Clip ${name},`) })
/** The positioned element a Clip is drawn in; the gesture body is inside it. */
const drawn = (name: string) => body(name).closest<HTMLElement>('[data-show-clip-id]') ?? body(name)
const leftPercent = (element: Element) => Number.parseFloat((element as HTMLElement).style.left)
const widthPercent = (element: Element) => Number.parseFloat((element as HTMLElement).style.width)

/** Drag "out" so its start lands on `targetMs`, whatever the window is. */
function dragOutgoingTo(targetMs: number, startMs = 0): void {
  const { durationMs } = visibleWindow()
  const pixels = (targetMs - startMs) / durationMs * LANE_WIDTH_PX
  fireEvent.pointerDown(body('Outgoing'), { button: 0, clientX: 0, pointerId: 1 })
  fireEvent.pointerMove(window, { clientX: pixels, pointerId: 1 })
  fireEvent.pointerUp(window, { clientX: pixels, pointerId: 1 })
}

beforeEach(() => {
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
  useShowTransportStore.setState(showTransportInitialState)
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

describe('v2 timeline viewport (#1039)', () => {
  it('opens fitted to the whole Show', () => {
    renderGestures()
    expect(visibleWindow()).toEqual({ startMs: 0, durationMs: SHOW_END_MS })
    expect(leftPercent(drawn('Incoming'))).toBeCloseTo(15, 6)
    expect(widthPercent(drawn('Incoming'))).toBeCloseTo(10, 6)
  })

  it('submits the same owner intent for one target time at any zoom', () => {
    const { submit } = renderGestures()

    dragOutgoingTo(2_000)
    expect(submit).toHaveBeenLastCalledWith({
      kind: 'move', clipId: 'out', startMs: 2_000, zoneId: 'zone', layerId: 'layer:zone:main',
    })

    // The same authored time, now named through a window a quarter as long.
    // The adopted record is zoom independent; zoom only changes how finely a
    // pointer can name a time.
    const zoomed = zoomUntil(SHOW_END_MS / 4)
    expect(zoomed.startMs).toBe(0)
    submit.mockClear()
    dragOutgoingTo(2_000)
    expect(submit).toHaveBeenLastCalledWith({
      kind: 'move', clipId: 'out', startMs: 2_000, zoneId: 'zone', layerId: 'layer:zone:main',
    })
  })

  it('resolves an edge drag in the window too, and splits at the window time', () => {
    const { submit } = renderGestures()
    const zoomed = zoomUntil(SHOW_END_MS / 2)

    const endEdge = screen.getByRole('button', { name: /^End edge of Clip Outgoing,/ })
    const pixels = (1_200 - 400) / zoomed.durationMs * LANE_WIDTH_PX
    fireEvent.pointerDown(endEdge, { button: 0, clientX: 0, pointerId: 4 })
    fireEvent.pointerMove(window, { clientX: pixels, pointerId: 4 })
    fireEvent.pointerUp(window, { clientX: pixels, pointerId: 4 })
    expect(submit).toHaveBeenLastCalledWith({ kind: 'resize-trailing', clipId: 'out', endMs: 1_200 })

    // A double-click splits at the time under the pointer in the window, not at
    // the same fraction of the whole Show.
    submit.mockClear()
    const atMs = Math.round(zoomed.startMs + 0.05 * zoomed.durationMs)
    fireEvent.doubleClick(body('Outgoing'), { clientX: 50 })
    expect(submit).toHaveBeenLastCalledWith({ kind: 'split', clipId: 'out', atMs })
    expect(atMs).toBeLessThan(400)
  })

  it('draws the window, not the whole Show, and lets content outside it run past the edge', () => {
    renderGestures()
    const endHandle = screen.getByRole('button', { name: 'Resize visible range end' })
    const panThumb = screen.getByRole('slider', { name: 'Pan visible timeline range' })

    zoomUntil(SHOW_END_MS / 2)
    for (let press = 0; press < 12; press += 1) fireEvent.keyDown(panThumb, { key: 'ArrowRight' })
    const zoomed = visibleWindow()
    expect(zoomed.startMs).toBeGreaterThan(0)

    const expectedLeft = (0 - zoomed.startMs) / zoomed.durationMs * 100
    expect(leftPercent(drawn('Outgoing'))).toBeCloseTo(expectedLeft, 1)
    expect(leftPercent(drawn('Outgoing'))).toBeLessThan(0)
    expect(widthPercent(drawn('Outgoing'))).toBeCloseTo(400 / zoomed.durationMs * 100, 1)

    // Fit returns the whole Show, and the handle that zoomed reports it.
    fireEvent.click(screen.getByRole('button', { name: 'Fit timeline to Show' }))
    expect(visibleWindow()).toEqual({ startMs: 0, durationMs: SHOW_END_MS })
    expect(endHandle).toBeInTheDocument()
  })

  it('follows the transport playhead into the window', () => {
    useShowTransportStore.setState({ showId: 'show-1', positionMs: 3_000 })
    renderGestures()
    expect(leftPercent(screen.getByTestId('show-timeline-playhead'))).toBeCloseTo(75, 6)

    const zoomed = zoomUntil(SHOW_END_MS / 2)
    expect(leftPercent(screen.getByTestId('show-timeline-playhead')))
      .toBeCloseTo((3_000 - zoomed.startMs) / zoomed.durationMs * 100, 1)
  })

  it('changes nothing about the record when only the view changes', () => {
    const { submit, view } = renderGestures()
    const before = structuredClone(view)

    zoomUntil(SHOW_END_MS / 2)
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Pan visible timeline range' }), { key: 'ArrowRight' })
    for (const name of ['Snap to boundaries', 'Hide Markers', 'Hide the Zone Layouts lane', 'Hide Transition junctions']) {
      fireEvent.click(screen.getByRole('button', { name }))
    }

    expect(view).toEqual(before)
    expect(submit).not.toHaveBeenCalled()
  })

  it('magnetizes a drop to a drawn boundary only while the Magnet toggle is on', () => {
    // "in" starts at 1 650 ms, which no drop grid step lands on, so only
    // boundary magnetism can put a drop there.
    const { submit } = renderGestures(detachedRecord())

    dragOutgoingTo(1_655)
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ startMs: 1_650 }))

    submit.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Snap to boundaries' }))
    // With the Magnet off nothing attracts, and the always-on drop grid still
    // lands the drop on a visible tick rather than raw milliseconds.
    dragOutgoingTo(1_655)
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ startMs: 1_600 }))
  })

  it('stops snapping to Markers when Markers are hidden', () => {
    const { submit } = renderGestures(detachedRecord())
    const lane = screen.getByRole('group', { name: 'Show Markers' })
    expect(within(lane).getByRole('button', { name: /^Marker Drop at/ })).toBeInTheDocument()

    // The Marker at 2 345 ms is not on the drop grid, so only magnetism can
    // land a drop there.
    dragOutgoingTo(2_350)
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ startMs: MARKER_MS }))

    submit.mockClear()
    fireEvent.click(screen.getByRole('button', { name: 'Hide Markers' }))
    expect(within(lane).queryByRole('button', { name: /^Marker Drop at/ })).toBeNull()
    dragOutgoingTo(2_350)
    expect(submit).toHaveBeenLastCalledWith(expect.objectContaining({ startMs: 2_400 }))
  })

  it('keeps a dormant Marker at the Show End mark, where the v1 timeline draws it', () => {
    renderGestures()
    const dormant = screen.getByRole('button', { name: /^Marker Dormant at 6\.00s/ })
    expect(leftPercent(dormant)).toBeCloseTo(100, 6)

    // No window can reach a Marker beyond Show End, so it stays at that mark
    // and is clipped with it. Its label still states the time it is at.
    const zoomed = zoomUntil(SHOW_END_MS / 2)
    expect(leftPercent(dormant))
      .toBeCloseTo((SHOW_END_MS - zoomed.startMs) / zoomed.durationMs * 100, 1)
  })

  it('draws or hides the Zone Layouts lane and the Transition junctions on request', () => {
    renderGestures()
    expect(screen.getByRole('group', { name: 'Zone Layouts lane' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-show-layer-junction]').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Hide the Zone Layouts lane' }))
    fireEvent.click(screen.getByRole('button', { name: 'Hide Transition junctions' }))
    expect(screen.queryByRole('group', { name: 'Zone Layouts lane' })).toBeNull()
    expect(document.querySelectorAll('[data-show-layer-junction]')).toHaveLength(0)

    fireEvent.click(screen.getByRole('button', { name: 'Show the Zone Layouts lane' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Transition junctions' }))
    expect(screen.getByRole('group', { name: 'Zone Layouts lane' })).toBeInTheDocument()
    expect(document.querySelectorAll('[data-show-layer-junction]').length).toBeGreaterThan(0)
  })

  it('gives the read-only surface the same window and the same controls', () => {
    render(
      <ShowTimelineReadOnlySurface
        view={projectShowTimelineV2(record())}
        transportShowId="show-1"
        statusLine="Read only - this v2 Show cannot be prepared."
      />,
    )
    expect(visibleWindow()).toEqual({ startMs: 0, durationMs: SHOW_END_MS })

    const zoomed = zoomUntil(SHOW_END_MS / 2)
    const clip = screen.getByRole('button', { name: /^Clip Incoming,/ })
    expect(leftPercent(clip)).toBeCloseTo((600 - zoomed.startMs) / zoomed.durationMs * 100, 1)
    expect(widthPercent(clip)).toBeCloseTo(400 / zoomed.durationMs * 100, 1)
    expect(clip).toHaveAttribute('aria-disabled', 'true')
  })

  it('carries a zoomed window onto a changed Show End instead of dropping back to fit', () => {
    const { view, rerender } = renderGestures()
    const zoomed = zoomUntil(SHOW_END_MS / 2)
    const zoomFactor = SHOW_END_MS / zoomed.durationMs

    // An edit doubled Show End. The author keeps the magnification they chose.
    rerender({ ...view, showEndMs: SHOW_END_MS * 2 })
    const carried = visibleWindow()
    expect(SHOW_END_MS * 2 / carried.durationMs).toBeCloseTo(zoomFactor, 1)
    expect(carried.startMs).toBe(0)
  })
})
