import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { NumberField } from './number-field'

describe('NumberField refused commit (#1098)', () => {
  it('restores the stored value when the owner refuses now', () => {
    render(<NumberField label="Base Layer" value={1} onChange={() => false} />)
    const field = screen.getByRole('textbox', { name: 'Base Layer' })
    fireEvent.change(field, { target: { value: '2' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field).toHaveValue('1')
  })

  it('restores the stored value when the owner refuses after the commit settles', async () => {
    let refuse!: (accepted: false) => void
    render(<NumberField label="X offset" value={0} onChange={() => new Promise<false>((resolve) => { refuse = resolve })} />)
    const field = screen.getByRole('textbox', { name: 'X offset' })
    fireEvent.change(field, { target: { value: '0.25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    expect(field).toHaveValue('0.25')
    await act(async () => refuse(false))
    expect(field).toHaveValue('0')
  })

  it('settles a late refusal against the controlled value as it is then, not as it was at submission', async () => {
    let refuse!: (accepted: false) => void
    const onChange = () => new Promise<false>((resolve) => { refuse = resolve })
    const { rerender } = render(<NumberField label="X offset" value={0} onChange={onChange} />)
    const field = screen.getByRole('textbox', { name: 'X offset' })
    fireEvent.change(field, { target: { value: '0.25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    // Another writer stores 0.5 before the refusal settles.
    rerender(<NumberField label="X offset" value={0.5} onChange={onChange} />)
    await act(async () => refuse(false))
    expect(field).toHaveValue('0.5')
  })

  it('clears a late-refused value from the committed draft even when the field was refocused', async () => {
    let refuse!: (accepted: false) => void
    render(<NumberField label="X offset" value={0} onChange={() => new Promise<false>((resolve) => { refuse = resolve })} />)
    const field = screen.getByRole('textbox', { name: 'X offset' })
    fireEvent.change(field, { target: { value: '0.25' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    fireEvent.focus(field)
    await act(async () => refuse(false))
    // The refocused draft is left alone; cancelling it returns to the stored value.
    expect(field).toHaveValue('0.25')
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(field).toHaveValue('0')
  })
})

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
