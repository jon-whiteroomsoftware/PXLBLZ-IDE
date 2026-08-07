import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { ColorField } from './color-field'

describe('ColorField', () => {
  it('applies a canonical exact value once and cancels valid drafts on blur (#751)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorField label="Target color" value="#00ff00" onChange={onChange} />)

    const exact = screen.getByRole('textbox', { name: 'Target color exact value' })
    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '#ABCDEF')
    expect(onChange).not.toHaveBeenCalled()
    await user.click(document.body)
    expect(onChange).not.toHaveBeenCalled()
    expect(exact).toHaveValue('#00ff00')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '#ABCDEF')
    await user.click(screen.getByRole('button', { name: 'Apply Target color' }))

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('#abcdef')
    expect(exact).toHaveValue('#abcdef')
  })

  it('reverts invalid drafts and cancels valid drafts on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<ColorField label="Target color" value="#123456" onChange={onChange} />)
    const exact = screen.getByRole('textbox', { name: 'Target color exact value' })

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '#xyz')
    await user.click(document.body)
    expect(exact).toHaveValue('#123456')
    expect(onChange).not.toHaveBeenCalled()

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '#abcdef')
    await user.keyboard('{Escape}')
    expect(exact).toHaveValue('#123456')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('previews picker input continuously and commits only its final change', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(<ColorField label="Fade color" value="#000000" onPreview={onPreview} onPreviewEnd={onPreviewEnd} onChange={onChange} />)
    const picker = screen.getByLabelText('Fade color picker')

    fireEvent.input(picker, { target: { value: '#112233' } })
    fireEvent.input(picker, { target: { value: '#445566' } })
    expect(onPreview.mock.calls).toEqual([["#112233"], ["#445566"]])
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.change(picker, { target: { value: '#445566' } })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('#445566')
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Fade color exact value' })).toHaveValue('#445566')
  })

  it('ends an unfinished picker preview when the field unmounts', () => {
    const onPreviewEnd = vi.fn()
    const view = render(
      <ColorField label="Color" value="#000000" onPreview={vi.fn()} onPreviewEnd={onPreviewEnd} onChange={vi.fn()} />,
    )
    fireEvent.input(screen.getByLabelText('Color picker'), { target: { value: '#123456' } })

    view.unmount()
    expect(onPreviewEnd).toHaveBeenCalledOnce()
  })

  it('syncs external values when idle but preserves a focused draft', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const view = render(<ColorField label="Color" value="#111111" onChange={onChange} />)
    const exact = screen.getByRole('textbox', { name: 'Color exact value' })

    view.rerender(<ColorField label="Color" value="#222222" onChange={onChange} />)
    expect(exact).toHaveValue('#222222')
    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '#333333')
    view.rerender(<ColorField label="Color" value="#444444" onChange={onChange} />)
    expect(exact).toHaveValue('#333333')
  })

  it('disables both exact entry and the native picker with accessible names', () => {
    render(<ColorField label="Highlight Color" value="#ffffff" disabled onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Highlight Color exact value' })).toBeDisabled()
    expect(screen.getByLabelText('Highlight Color picker')).toBeDisabled()
  })
})
