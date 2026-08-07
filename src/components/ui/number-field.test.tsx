import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

  it('keeps typed drafts local until explicit apply and cancels on blur or Escape (#751)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NumberField label="Points" value={5} min={3} max={12} step={1} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Points' })

    await user.click(input)
    await user.clear(input)
    await user.type(input, '9')
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Apply Points' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Cancel Points edit' })).toBeInTheDocument()

    await user.click(document.body)
    expect(onChange).not.toHaveBeenCalled()
    expect(input).toHaveValue('5')

    await user.click(input)
    await user.clear(input)
    await user.type(input, '9')
    await user.click(screen.getByRole('button', { name: 'Apply Points' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(9)
    expect(input).toHaveValue('9')

    await user.click(input)
    await user.clear(input)
    await user.type(input, '7{Escape}')
    expect(onChange).toHaveBeenCalledOnce()
    expect(input).toHaveValue('9')
  })

  it('cancels to the latest controlled value when it changes during a draft', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const view = render(<NumberField label="Points" value={5} onChange={onChange} />)
    const input = screen.getByRole('textbox', { name: 'Points' })

    await user.click(input)
    await user.clear(input)
    await user.type(input, '7')
    view.rerender(<NumberField label="Points" value={6} onChange={onChange} />)
    view.rerender(<NumberField label="Points" value={5} onChange={onChange} />)
    expect(input).toHaveValue('7')

    await user.click(document.body)
    expect(input).toHaveValue('5')
    expect(onChange).not.toHaveBeenCalled()
  })
})
