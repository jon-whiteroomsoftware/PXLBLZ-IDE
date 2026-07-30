import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './number-field'

describe('NumberField accessibility contract (#656)', () => {
  it('exposes one labelled numeric textbox without native spin controls', () => {
    render(
      <NumberField
        label="Points"
        value={5}
        min={3}
        max={12}
        step={1}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Points' })).toHaveValue('5')
    expect(screen.getAllByLabelText(/Points/i)).toHaveLength(1)
    expect(screen.queryByRole('spinbutton', { name: 'Points' })).not.toBeInTheDocument()
  })
})
