import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PatternCombobox, type PatternComboboxOption } from './PatternCombobox'
import { usePatternMruStore } from '@/store/patternMruStore'

const OPTIONS: PatternComboboxOption[] = [
  { value: 'user:mine-1', label: 'My Aurora', group: 'Personal' },
  { value: 'stock:Caustics', label: 'Caustics', group: 'Built-in' },
  { value: 'stock:CompassRose', label: 'CompassRose', group: 'Built-in' },
  { value: 'stock:GlyphRain', label: 'GlyphRain', group: 'Built-in' },
]

function setup(value: string | null = null) {
  const onChange = vi.fn()
  render(<PatternCombobox ariaLabel="Pick Pattern" value={value} options={OPTIONS} onChange={onChange} />)
  return { onChange }
}

const optionLabels = () => within(screen.getByRole('listbox', { name: 'Pick Pattern matches' }))
  .getAllByRole('option').map((option) => option.textContent)

describe('PatternCombobox recency (#63)', () => {
  beforeEach(() => {
    usePatternMruStore.setState({ values: [] })
  })

  it('records selections into one master list and leads the untyped view with them', async () => {
    const user = userEvent.setup()
    const { onChange } = setup()

    await user.click(screen.getByRole('combobox', { name: 'Pick Pattern' }))
    // No history yet: catalogue order, Personal before Built-in.
    expect(optionLabels()).toEqual(['My Aurora', 'Caustics', 'CompassRose', 'GlyphRain'])

    await user.click(screen.getByRole('option', { name: 'GlyphRain' }))
    expect(onChange).toHaveBeenCalledWith('stock:GlyphRain')
    expect(usePatternMruStore.getState().values).toEqual(['stock:GlyphRain'])

    // Reopen: the recent pick leads under a Recent header and is not repeated
    // in its original group below.
    await user.click(screen.getByRole('combobox', { name: 'Pick Pattern' }))
    expect(optionLabels()).toEqual(['GlyphRain', 'My Aurora', 'Caustics', 'CompassRose'])
    expect(screen.getByText('Recent')).toBeInTheDocument()
  })

  it('keeps typed search ranking free of recency and skips stale entries', async () => {
    usePatternMruStore.setState({ values: ['stock:Deleted', 'stock:Caustics'] })
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('combobox', { name: 'Pick Pattern' }))
    // The stale value is skipped; the surviving entry leads.
    expect(optionLabels()).toEqual(['Caustics', 'My Aurora', 'CompassRose', 'GlyphRain'])

    await user.keyboard('c')
    // Typed: starts-with before contains, alphabetical - recency plays no part.
    expect(optionLabels()).toEqual(['Caustics', 'CompassRose'])
  })
})
