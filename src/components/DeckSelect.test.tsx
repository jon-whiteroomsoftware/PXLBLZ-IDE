import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import { DeckSelect } from './DeckSelect'

describe('DeckSelect keyboard navigation', () => {
  it('portals its menu beyond a clipped controls container', async () => {
    const user = userEvent.setup()
    render(
      <div data-testid="clipped-controls" className="overflow-clip">
        <DeckSelect
          ariaLabel="Map"
          value="square"
          options={[
            { value: 'square', label: 'Square' },
            { value: 'cube', label: 'Cube' },
          ]}
          onChange={vi.fn()}
          portaled
        />
      </div>,
    )

    await user.click(screen.getByRole('button', { name: 'Map' }))

    expect(screen.getByRole('listbox', { name: 'Map' }).parentElement).toBe(document.body)
  })

  it('renders explicit option columns while preserving each column group order', async () => {
    const user = userEvent.setup()
    render(
      <DeckSelect
        ariaLabel="Map"
        value="square"
        options={[
          { value: 'ring', label: 'Ring', column: 'Recommended', group: 'Paths' },
          { value: 'square', label: 'Square', column: 'Recommended', group: 'Surfaces' },
          { value: 'cube', label: 'Cube', column: 'Other dimensions', group: 'Volumes' },
        ]}
        onChange={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Map' }))
    const recommended = screen.getByRole('group', { name: 'Recommended' })
    const other = screen.getByRole('group', { name: 'Other dimensions' })
    expect(within(recommended).getAllByRole('option').map((option) => option.textContent)).toEqual(['Ring', 'Square'])
    expect(within(other).getAllByRole('option').map((option) => option.textContent)).toEqual(['Cube'])
  })

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

  it('still treats a click in the portaled menu as internal interaction', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DeckSelect
        ariaLabel="View"
        value="surface"
        options={[
          { value: 'strand', label: 'Strand' },
          { value: 'surface', label: 'Surface' },
        ]}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByRole('button', { name: 'View' }))
    await user.click(screen.getByRole('option', { name: 'Strand' }))

    expect(onChange).toHaveBeenCalledWith('strand')
  })

  it('remeasures an unclamped menu after it closes and reopens', async () => {
    const user = userEvent.setup()
    let triggerTop = 140
    let viewportHeight = 300
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.getAttribute('aria-label') === 'Map' && this.getAttribute('role') === 'listbox') {
        const maxHeight = Number.parseFloat((this as HTMLElement).style.maxHeight)
        const height = Number.isFinite(maxHeight) ? Math.min(500, maxHeight) : 500
        return DOMRect.fromRect({ width: 352, height })
      }
      if (this.getAttribute('aria-label') === 'Map') {
        return DOMRect.fromRect({ x: 900, y: triggerTop, width: 80, height: 20 })
      }
      return DOMRect.fromRect()
    })
    vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(1000)
    vi.spyOn(window, 'innerHeight', 'get').mockImplementation(() => viewportHeight)

    render(
      <DeckSelect
        ariaLabel="Map"
        value="square"
        options={[{ value: 'square', label: 'Square' }]}
        onChange={vi.fn()}
        menuSide="top"
        portaled
      />,
    )

    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByRole('listbox')).toHaveStyle({ top: '8px', maxHeight: '128px' })
    await user.click(screen.getByRole('button', { name: 'Map' }))

    triggerTop = 650
    viewportHeight = 720
    await user.click(screen.getByRole('button', { name: 'Map' }))
    expect(screen.getByRole('listbox')).toHaveStyle({ top: '146px', maxHeight: '638px' })
  })
})
