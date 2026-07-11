import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { DeckSelect } from './DeckSelect'

describe('DeckSelect keyboard navigation', () => {
  it('opens with ArrowDown and moves across grouped options without focusing headers', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DeckSelect
        ariaLabel="Map"
        value="square"
        options={[
          { value: 'ring', label: 'Ring', group: 'Recommended · Paths' },
          { value: 'square', label: 'Square', group: 'Recommended · Surfaces' },
          { value: 'cube', label: 'Cube', group: 'Other dimensions · Volumes' },
        ]}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('button', { name: 'Map' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('option', { name: 'Square' })).toHaveFocus()
    await user.keyboard('{ArrowDown}{Enter}')
    expect(onChange).toHaveBeenCalledWith('cube')
  })

  it('closes with Escape and returns focus to the trigger', async () => {
    const user = userEvent.setup()
    render(
      <DeckSelect
        ariaLabel="View"
        value="surface"
        options={[
          { value: 'strand', label: 'Strand' },
          { value: 'surface', label: 'Surface' },
        ]}
        onChange={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'View' })
    trigger.focus()
    await user.keyboard('{ArrowUp}')
    await user.keyboard('{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
