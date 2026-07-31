import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ShowPropertyAnimationTrack } from '@/engine/personalContentRecords'
import type { ShowPropertyAnimationOption } from '@/engine/showPropertyAnimationEditorModel'
import {
  ShowPropertyAnimationAction,
  ShowPropertyAnimationProvider,
} from './ShowPropertyAnimationEditor'

const brightness: ShowPropertyAnimationOption = {
  key: 'placement-view:placement-1:brightness',
  label: 'Brightness',
  target: { kind: 'placement-view', placementId: 'placement-1', property: 'brightness' },
  value: 0.8,
  min: 0,
  max: 1,
  step: 0.01,
  presentation: 'percentage',
}

const track: ShowPropertyAnimationTrack = {
  id: 'track-brightness',
  target: brightness.target,
  keyframes: [
    { id: 'from', timeMs: 0, value: 0.8, easing: { curve: 'linear' } },
    { id: 'to', timeMs: 4_000, value: 0.2, easing: { curve: 'linear' } },
  ],
}

function editor(
  tracks: ShowPropertyAnimationTrack[],
  onChange = vi.fn(),
  instanceUseCount = 1,
) {
  return {
    onChange,
    view: render(
      <ShowPropertyAnimationProvider
        options={[brightness]}
        tracks={tracks}
        storageDurationMs={4_000}
        showTimeOffsetMs={12_000}
        instanceUseCount={instanceUseCount}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={brightness.target} />
      </ShowPropertyAnimationProvider>,
    ),
  }
}

describe('per-parameter Property animation editor (#648)', () => {
  it('keeps a hollow animation draft transient when dismissed without a real edit', () => {
    const { onChange } = editor([])

    const diamond = screen.getByRole('button', { name: 'Animate Brightness' })
    expect(diamond).toHaveAttribute('data-animated', 'false')
    fireEvent.click(diamond)

    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })).toHaveValue('80')
    expect(screen.getByRole('textbox', { name: 'Brightness animation from time exact time' })).toHaveValue('12')
    expect(screen.getByRole('textbox', { name: 'Brightness animation to time exact time' })).toHaveValue('16')

    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Brightness animation' }), { key: 'Escape' })

    expect(screen.queryByRole('dialog', { name: 'Brightness animation' })).not.toBeInTheDocument()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('commits the edited two-point draft as one semantic change', () => {
    const { onChange } = editor([])
    fireEvent.click(screen.getByRole('button', { name: 'Animate Brightness' }))

    const from = screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })
    fireEvent.change(from, { target: { value: '60%' } })
    fireEvent.blur(from)

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith({
      kind: 'add-track',
      target: brightness.target,
      initialValue: 0.8,
      keyframes: [
        { timeMs: 0, value: 0.6, easing: { curve: 'linear' } },
        { timeMs: 4_000, value: 0.8, easing: { curve: 'linear' } },
      ],
    })
  })

  it('tracks filled state through add/delete and edits existing global times back to local milliseconds', () => {
    const onChange = vi.fn()
    const { view } = editor([], onChange)
    expect(screen.getByRole('button', { name: 'Animate Brightness' })).toHaveAttribute('data-animated', 'false')

    view.rerender(
      <ShowPropertyAnimationProvider
        options={[brightness]}
        tracks={[track]}
        storageDurationMs={4_000}
        showTimeOffsetMs={12_000}
        instanceUseCount={1}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={brightness.target} />
      </ShowPropertyAnimationProvider>,
    )

    const filled = screen.getByRole('button', { name: 'Edit Brightness animation' })
    expect(filled).toHaveAttribute('data-animated', 'true')
    fireEvent.click(filled)
    const toTime = screen.getByRole('textbox', { name: 'Brightness animation to time exact time' })
    fireEvent.change(toTime, { target: { value: '15.5' } })
    fireEvent.blur(toTime)
    expect(onChange).toHaveBeenCalledWith({
      kind: 'update-keyframe',
      trackId: 'track-brightness',
      keyframeId: 'to',
      changes: { timeMs: 3_500 },
    })

    fireEvent.click(screen.getByRole('button', { name: 'Remove Brightness animation' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'delete-track', trackId: 'track-brightness' })
  })

  it('discloses linked Clip ownership for an instance-owned parameter', () => {
    const speed: ShowPropertyAnimationOption = {
      key: 'instance-time-scale:instance-1',
      label: 'Animation speed',
      target: { kind: 'instance-time-scale', instanceId: 'instance-1' },
      value: 1,
      min: 0,
      max: 4,
      step: 0.01,
      presentation: 'multiplier',
    }
    render(
      <ShowPropertyAnimationProvider
        options={[speed]}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={0}
        instanceUseCount={4}
        onChange={vi.fn()}
      >
        <ShowPropertyAnimationAction target={speed.target} />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Animation speed' }))
    expect(screen.getByRole('dialog', { name: 'Animation speed animation' }))
      .toHaveTextContent('Affects 4 linked Clips')
  })

  it('authors Rotation in the degrees taught by the adjacent Clip field', () => {
    const rotation: ShowPropertyAnimationOption = {
      key: 'placement-transform:placement-1:rotation',
      label: 'Rotation',
      target: { kind: 'placement-transform', placementId: 'placement-1', property: 'rotation' },
      value: 0.25,
      min: -8,
      max: 8,
      step: 1 / 360,
      presentation: 'degrees',
    }
    const onChange = vi.fn()
    render(
      <ShowPropertyAnimationProvider
        options={[rotation]}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={0}
        instanceUseCount={1}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={rotation.target} />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Rotation' }))
    const from = screen.getByRole('textbox', { name: 'Rotation animation from degrees' })
    expect(from).toHaveValue('90')
    fireEvent.change(from, { target: { value: '180' } })
    fireEvent.blur(from)

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'add-track',
      keyframes: [
        { timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { timeMs: 4_000, value: 0.25, easing: { curve: 'linear' } },
      ],
    }))
  })

  it('authors Phase in the raw zero-to-one units taught by the adjacent Clip field', () => {
    const phase: ShowPropertyAnimationOption = {
      key: 'placement-view:placement-1:phase',
      label: 'Phase',
      target: { kind: 'placement-view', placementId: 'placement-1', property: 'phase' },
      value: 0.25,
      min: 0,
      max: 1,
      step: 0.01,
      presentation: 'number',
    }
    const onChange = vi.fn()
    render(
      <ShowPropertyAnimationProvider
        options={[phase]}
        tracks={[]}
        storageDurationMs={4_000}
        showTimeOffsetMs={0}
        instanceUseCount={1}
        onChange={onChange}
      >
        <ShowPropertyAnimationAction target={phase.target} />
      </ShowPropertyAnimationProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Animate Phase' }))
    const from = screen.getByRole('textbox', { name: 'Phase animation from' })
    expect(from).toHaveValue('0.25')
    fireEvent.change(from, { target: { value: '0.5' } })
    fireEvent.blur(from)

    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'add-track',
      keyframes: [
        { timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
        { timeMs: 4_000, value: 0.25, easing: { curve: 'linear' } },
      ],
    }))
  })
})
