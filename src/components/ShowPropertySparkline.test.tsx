import { render, screen } from '@testing-library/react'
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
})
