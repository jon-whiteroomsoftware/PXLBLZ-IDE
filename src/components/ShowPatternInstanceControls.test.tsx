import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ShowPatternInstanceControls } from './ShowPatternInstanceControls'

describe('Show Pattern instance controls (#586)', () => {
  it('explains shared ownership and makes the selected Clip independent', () => {
    const onMakeIndependent = vi.fn()
    render(
      <ShowPatternInstanceControls
        ownership={{ instanceId: 'instance-a', useCount: 3, compatibleTargets: [] }}
        steppedClock={{ stepMs: 250 }}
        onMakeIndependent={onMakeIndependent}
        onRejoin={vi.fn()}
        onSteppedClockChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Shared by 3 Clips')
    fireEvent.click(screen.getByRole('button', { name: 'Make Pattern Independent' }))
    expect(onMakeIndependent).toHaveBeenCalledOnce()
  })

  it('requires an explicit compatible target and warns before rejoining it', () => {
    const onRejoin = vi.fn()
    render(
      <ShowPatternInstanceControls
        ownership={{
          instanceId: 'instance-a',
          useCount: 1,
          compatibleTargets: [
            { instanceId: 'instance-b', patternName: 'Rings', useCount: 2 },
            { instanceId: 'instance-c', patternName: 'Rings', useCount: 1 },
          ],
        }}
        onMakeIndependent={vi.fn()}
        onRejoin={onRejoin}
        onSteppedClockChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Independent')
    fireEvent.change(screen.getByRole('combobox', { name: 'Shared Pattern instance' }), {
      target: { value: 'instance-c' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Rejoin Shared Pattern' }))
    expect(screen.getByRole('alertdialog')).toHaveTextContent('This Clip will use the selected shared clock and settings')
    expect(onRejoin).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Rejoin Pattern instance' }))
    expect(onRejoin).toHaveBeenCalledWith('instance-c')
  })

  it('labels Stutter as a shared Pattern-clock policy', () => {
    const onSteppedClockChange = vi.fn()
    render(
      <ShowPatternInstanceControls
        ownership={{ instanceId: 'instance-a', useCount: 2, compatibleTargets: [] }}
        onMakeIndependent={vi.fn()}
        onRejoin={vi.fn()}
        onSteppedClockChange={onSteppedClockChange}
      />,
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Stutter Pattern clock' }))
    expect(onSteppedClockChange).toHaveBeenCalledWith({ stepMs: 250 })
    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Affects 2 linked Clips')
  })
})
