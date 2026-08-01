import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { ShowPropertyAnimationTrack } from '@/engine/personalContentRecords'
import type { ShowPropertyAnimationOption } from '@/engine/showPropertyAnimationEditorModel'
import {
  ShowPropertyAnimationOverview,
  ShowPropertyAnimationProvider,
} from './ShowPropertyAnimationEditor'

const brightness: ShowPropertyAnimationOption = {
  key: 'placement-view:placement-1:brightness',
  label: 'Brightness',
  target: { kind: 'placement-view', placementId: 'placement-1', property: 'brightness' },
  value: 1,
  min: 0,
  max: 1,
  step: 0.01,
  presentation: 'percentage',
}

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

function track(
  id: string,
  target: ShowPropertyAnimationTrack['target'],
  values = [0.25, 0.75],
): ShowPropertyAnimationTrack {
  return {
    id,
    target,
    keyframes: values.map((value, index) => ({
      id: `${id}-${index}`,
      timeMs: index * 1_000,
      value,
      easing: { curve: 'linear' },
    })),
  }
}

function overview({
  tracks,
  options = [brightness, speed],
  trackIssues = {},
}: {
  tracks: ShowPropertyAnimationTrack[]
  options?: ShowPropertyAnimationOption[]
  trackIssues?: Record<string, Array<{ path: string; code: 'missing-effect'; message: string }>>
}) {
  const onChange = vi.fn()
  const onBack = vi.fn()
  const onNavigate = vi.fn()
  render(
    <ShowPropertyAnimationProvider
      options={options}
      tracks={tracks}
      trackIssues={trackIssues}
      storageDurationMs={4_000}
      showTimeOffsetMs={12_000}
      instanceUseCount={3}
      onChange={onChange}
    >
      <ShowPropertyAnimationOverview onBack={onBack} onNavigate={onNavigate} />
    </ShowPropertyAnimationProvider>,
  )
  return { onBack, onChange, onNavigate }
}

describe('Animations overview (#649)', () => {
  it('groups owners, summarizes endpoints and time, navigates, and removes', () => {
    const { onChange, onNavigate } = overview({
      tracks: [
        track('brightness', brightness.target),
        track('speed', speed.target, [1, 2]),
      ],
    })

    expect(screen.getByRole('heading', { name: 'This Clip placement' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Shared Pattern instance' })).toBeInTheDocument()
    expect(screen.getByText('affects 3 linked Clips')).toBeInTheDocument()
    const brightnessRow = screen.getByRole('group', { name: 'Brightness animation summary' })
    expect(brightnessRow).toHaveTextContent('25% → 75%')
    expect(brightnessRow).toHaveTextContent('12s → 13s')
    expect(brightnessRow).toHaveTextContent('Header')

    fireEvent.click(within(brightnessRow).getByRole('button', { name: 'Go to Brightness field' }))
    expect(onNavigate).toHaveBeenCalledWith('header', brightness.key)

    fireEvent.click(within(brightnessRow).getByRole('button', { name: 'Remove Brightness animation' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'delete-track', trackId: 'brightness' })
  })

  it('marks an orphan removable without offering impossible field navigation', () => {
    const orphan = track('orphan', {
      kind: 'placement-effect',
      placementId: 'placement-1',
      effectId: 'removed',
      effectKind: 'brightness',
      parameterId: 'amount',
    })
    const { onChange } = overview({
      tracks: [orphan],
      options: [],
      trackIssues: {
        orphan: [{
          path: 'scenes[0].propertyTracks[0].target.effectId',
          code: 'missing-effect',
          message: 'Effect removed no longer exists.',
        }],
      },
    })

    const row = screen.getByRole('group', { name: 'Brightness Amount animation summary' })
    expect(row).toHaveTextContent('Orphaned')
    expect(row).toHaveTextContent('Effect removed no longer exists.')
    expect(within(row).queryByRole('button', { name: /^Go to/ })).not.toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Remove Brightness Amount animation' }))
    expect(onChange).toHaveBeenCalledWith({ kind: 'delete-track', trackId: 'orphan' })
  })

  it('summarizes an N-keyframe track with every value and returns with Back or Escape', () => {
    const { onBack, onChange } = overview({
      tracks: [track('three-point', brightness.target, [0.1, 0.5, 0.9])],
    })

    // Multi-keyframe tracks are ordinary editable tracks (#363): the row
    // reports the count neutrally, and the summary carries every value
    // because a curve's meaning often lives in its middle.
    expect(screen.getByText('3 keyframes')).toBeInTheDocument()
    expect(screen.queryByText(/read-only/)).not.toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Brightness animation summary' }))
      .toHaveTextContent('10% → 50% → 90%')
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Back from Animations overview' }))
    expect(onBack).toHaveBeenCalledOnce()

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onBack).toHaveBeenCalledTimes(2)
    expect(onChange).not.toHaveBeenCalled()
  })
})
