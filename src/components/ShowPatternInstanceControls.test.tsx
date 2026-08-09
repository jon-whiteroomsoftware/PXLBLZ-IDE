import { fireEvent, render, screen, within } from '@testing-library/react'
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

  it('authors Stutter as jumps per second with an exact field and transient slider (#779)', () => {
    const onSteppedClockChange = vi.fn()
    render(
      <ShowPatternInstanceControls
        ownership={{ instanceId: 'instance-a', useCount: 1, compatibleTargets: [] }}
        steppedClock={{ stepMs: 500 }}
        onMakeIndependent={vi.fn()}
        onRejoin={vi.fn()}
        onSteppedClockChange={onSteppedClockChange}
      />,
    )

    const rate = screen.getByRole('textbox', { name: 'Jumps per second exact rate' })
    expect(rate).toHaveValue('2')
    expect(screen.getByRole('button', {
      name: 'Adjust with rate slider',
      description: 'Jumps per second',
    })).toBeInTheDocument()
    expect(screen.getByText('every 500 ms')).toBeInTheDocument()

    fireEvent.change(rate, { target: { value: '4' } })
    fireEvent.keyDown(rate, { key: 'Enter' })
    expect(onSteppedClockChange).toHaveBeenLastCalledWith({ stepMs: 250 })
  })

  it('uses the same compact three-column rows as Advanced Clip controls (#63)', () => {
    render(
      <ShowPatternInstanceControls
        ownership={{ instanceId: 'instance-a', useCount: 1, compatibleTargets: [] }}
        onMakeIndependent={vi.fn()}
        onRejoin={vi.fn()}
        onSteppedClockChange={vi.fn()}
      />,
    )

    const group = screen.getByRole('group', { name: 'Pattern instance' })
    const rows = within(group).getAllByRole('row')
    expect(rows).toHaveLength(2)
    rows.forEach((row) => expect(row).toHaveClass(
      'h-6',
      'grid-cols-[1.75rem_24%_minmax(0,1fr)]',
    ))
    expect(rows[0].children[0].querySelector('svg')).toBeInTheDocument()
    expect(rows[0].children[1]).toHaveTextContent('Pattern instance')
    expect(rows[0].children[2]).toHaveTextContent('Independent')
    expect(rows[1].children[0]).toContainElement(screen.getByRole('checkbox', { name: 'Stutter Pattern clock' }))
    expect(rows[1].children[1]).toHaveTextContent('Stutter Pattern clock')
  })
})
