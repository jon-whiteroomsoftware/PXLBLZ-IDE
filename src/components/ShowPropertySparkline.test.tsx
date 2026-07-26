import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { projectShowPropertyLane } from '@/engine/showPropertyLaneProjection'
import { ShowPropertySparkline } from './ShowPropertySparkline'

describe('ShowPropertySparkline (#483)', () => {
  it('uses compact accessible beat targets without turning dots into large handles', async () => {
    const user = userEvent.setup()
    const onSelectBeat = vi.fn()
    const projection = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 1,
      segments: [{ id: 'ramp', startMs: 0, endMs: 1_000, from: 0.2, to: 0.8, easing: { curve: 'linear' } }],
      beats: [{ id: 'beat-a', timeMs: 0, value: 0.2, kind: 'authored', label: 'Opening keyframe' }],
    })

    render(
      <ShowPropertySparkline
        ariaLabel="Brightness property sparkline"
        projection={projection}
        selectedBeatId="beat-a"
        onSelectBeat={onSelectBeat}
      />,
    )

    expect(screen.getByRole('group', { name: 'Brightness property sparkline' }).querySelector('polyline')).toBeInTheDocument()
    const beat = screen.getByRole('button', { name: 'Opening keyframe, value 0.2' })
    expect(beat.querySelector('[data-property-beat-dot]')).toHaveClass('size-1')
    expect(beat).toHaveClass('motion-reduce:transition-none')
    await user.tab()
    await user.keyboard('{Enter}')
    expect(onSelectBeat).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'beat-a', value: 0.2 }),
      expect.any(HTMLButtonElement),
    )
  })

  it('names the animated property on the lane without renaming the lane (#631)', () => {
    const projection = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 1,
      segments: [{ id: 'ramp', startMs: 0, endMs: 1_000, from: 0.2, to: 0.8, easing: { curve: 'linear' } }],
      beats: [],
    })

    render(
      <ShowPropertySparkline
        ariaLabel="SignalMandala brightness animation for Main"
        label="SignalMandala brightness"
        projection={projection}
      />,
    )

    const group = screen.getByRole('group', { name: 'SignalMandala brightness animation for Main' })
    const pill = screen.getByTestId('show-property-lane-inline-label')
    const overlay = pill.parentElement!
    expect(group).toContainElement(pill)
    expect(pill).toHaveTextContent('SignalMandala brightness')
    expect(overlay).toHaveAttribute('aria-hidden', 'true')
    // pointer-events-none keeps the label off the hit-test path, so beat dots
    // underneath stay clickable and no dead `title` promises a tooltip (#631).
    expect(overlay).toHaveClass('pointer-events-none')
    expect(pill).not.toHaveAttribute('title')
    expect(pill.querySelector('.truncate')).toHaveTextContent('SignalMandala brightness')
    // Sticky, so the name follows the viewport when a zoomed timeline scrolls.
    expect(pill).toHaveClass('sticky')
  })

  it('carries the hover text on the lane so it reads over label, glyph, and curve (#631)', () => {
    const projection = projectShowPropertyLane({
      durationMs: 10_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0.5,
      segments: [{ id: 'ramp', startMs: 5_000, endMs: 8_000, from: 0.2, to: 0.8, easing: { curve: 'linear' } }],
      beats: [{ id: 'a', timeMs: 5_000, value: 0.2, kind: 'authored' }],
    })

    render(
      <ShowPropertySparkline
        ariaLabel="CompassRose speed control animation for main"
        label="speed"
        family="control"
        hoverText="CompassRose · speed · Pattern control · 5 s"
        projection={projection}
      />,
    )

    // The lane owns the tooltip rather than the pill, because the pill has to
    // stay off the hit-test path to protect beat clicks (#631).
    const group = screen.getByRole('group', { name: 'CompassRose speed control animation for main' })
    expect(group).toHaveAttribute('title', 'CompassRose · speed · Pattern control · 5 s')
  })

  it('leaves the family glyph to the gutter mark unless no gutter is on screen (#631)', () => {
    const projection = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0.5,
      segments: [{ id: 'ramp', startMs: 0, endMs: 1_000, from: 0.2, to: 0.8, easing: { curve: 'linear' } }],
      beats: [],
    })
    const lane = (showFamilyGlyph: boolean) => (
      <ShowPropertySparkline
        ariaLabel="Speed control lane"
        label="speed"
        family="control"
        showFamilyGlyph={showFamilyGlyph}
        projection={projection}
      />
    )

    const { unmount } = render(lane(false))
    expect(screen.getByTestId('show-property-lane-inline-label').querySelector('svg')).toBeNull()
    unmount()

    render(lane(true))
    expect(
      screen.getByTestId('show-property-lane-inline-label').querySelector('[data-property-lane-family="control"]'),
    ).toBeInTheDocument()
  })

  it('retires the label once its animation is behind the scrolled viewport (#631)', () => {
    const projection = projectShowPropertyLane({
      durationMs: 10_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0.5,
      segments: [{ id: 'ramp', startMs: 1_000, endMs: 2_000, from: 0.1, to: 0.9, easing: { curve: 'linear' } }],
      beats: [
        { id: 'a', timeMs: 1_000, value: 0.1, kind: 'authored' },
        { id: 'b', timeMs: 2_000, value: 0.9, kind: 'authored' },
      ],
    })

    render(
      <ShowPropertySparkline
        ariaLabel="Early brightness lane"
        label="brightness"
        family="appearance"
        projection={projection}
      />,
    )

    // Unscrolled, every label stands: its animation is still ahead.
    const pill = screen.getByTestId('show-property-lane-inline-label')
    expect(pill).toHaveAttribute('data-retired', 'false')
    expect(pill).toHaveStyle({ opacity: '1' })
  })

  it('keeps beat targets above the label so the pill cannot intercept a dot (#631)', () => {
    const projection = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0.5,
      segments: [{ id: 'ramp', startMs: 0, endMs: 1_000, from: 0.2, to: 0.8, easing: { curve: 'linear' } }],
      beats: [{ id: 'beat-a', timeMs: 0, value: 0.2, kind: 'authored', label: 'Opening keyframe' }],
    })

    render(
      <ShowPropertySparkline
        ariaLabel="Overlapped lane"
        label="brightness"
        family="appearance"
        projection={projection}
        onSelectBeat={vi.fn()}
      />,
    )

    const pill = screen.getByTestId('show-property-lane-inline-label')
    const beat = screen.getByRole('button', { name: 'Opening keyframe, value 0.2' })
    expect(pill.parentElement).toHaveClass('z-[1]')
    expect(beat).toHaveClass('z-[2]')
  })

  it('leaves the lane unlabelled when no property name is supplied (#631)', () => {
    const projection = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 1,
      segments: [],
      beats: [],
    })

    render(<ShowPropertySparkline ariaLabel="Unlabelled lane" projection={projection} />)

    expect(screen.queryByTestId('show-property-lane-inline-label')).not.toBeInTheDocument()
  })

  it('reports vertical beat dragging in sparkline display coordinates (#496)', () => {
    const onMoveBeat = vi.fn()
    const projection = projectShowPropertyLane({
      durationMs: 1_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0.5,
      segments: [],
      beats: [{ id: 'beat-a', timeMs: 0, value: 0.5, kind: 'authored' }],
    })
    render(
      <ShowPropertySparkline
        ariaLabel="Draggable property sparkline"
        projection={projection}
        onSelectBeat={vi.fn()}
        onMoveBeat={onMoveBeat}
      />,
    )

    const group = screen.getByRole('group', { name: 'Draggable property sparkline' })
    Object.defineProperty(group, 'getBoundingClientRect', {
      value: () => ({ top: 10, height: 100, left: 0, right: 100, bottom: 110, width: 100, x: 0, y: 10, toJSON: () => ({}) }),
    })
    const beat = screen.getByRole('button', { name: 'Property beat, value 0.5' })
    let captured = false
    Object.defineProperties(beat, {
      setPointerCapture: { value: () => { captured = true } },
      hasPointerCapture: { value: () => captured },
      releasePointerCapture: { value: () => { captured = false } },
    })

    fireEvent.pointerDown(beat, { pointerId: 7, button: 0, clientY: 60 })
    fireEvent.pointerMove(beat, { pointerId: 7, buttons: 1, clientY: 36 })
    expect(onMoveBeat).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'beat-a' }), expect.closeTo(0.2))
    fireEvent.pointerUp(beat, { pointerId: 7, button: 0, clientY: 36 })
    expect(captured).toBe(false)
  })
})
