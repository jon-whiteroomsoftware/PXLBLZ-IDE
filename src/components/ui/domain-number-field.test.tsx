import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { DomainNumberField } from './domain-number-field'

describe('DomainNumberField (#610)', () => {
  it('keeps the field label unique while describing its auxiliary multiplier controls (#656)', () => {
    render(
      <DomainNumberField
        label="Animation speed"
        presentation="multiplier"
        value={1}
        min={0}
        max={4}
        step={0.1}
        onChange={vi.fn()}
      />,
    )

    const exact = screen.getByRole('textbox', { name: 'Animation speed exact multiplier' })
    const grip = screen.getByRole('button', { name: 'Adjust with multiplier slider' })
    expect(grip).toHaveAccessibleDescription('Animation speed')
    fireEvent.keyDown(grip, { key: 'Enter' })
    expect(screen.getByRole('slider', { name: 'Multiplier slider' }))
      .toHaveAccessibleDescription('Animation speed')
    expect(screen.getAllByLabelText(/Animation speed/i)).toEqual([exact])
  })

  it('preserves partial multiplier drafts and canonicalizes or clamps once on commit', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DomainNumberField
        label="Animation speed"
        presentation="multiplier"
        value={1}
        min={0}
        max={4}
        step={0.1}
        onChange={onChange}
      />,
    )
    const exact = screen.getByRole('textbox', { name: 'Animation speed exact multiplier' })

    expect(exact).toHaveValue('1')
    expect(document.querySelector('[data-unit-suffix="x"]')).toBeInTheDocument()
    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '1.')
    expect(exact).toHaveValue('1.')
    expect(onChange).not.toHaveBeenCalled()
    await user.type(exact, '5x')
    await user.tab()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(1.5)
    expect(exact).toHaveValue('1.5')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '9x')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(4)
  })

  it('accepts ratio and decimal entry, reverts invalid drafts, and cancels with Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <DomainNumberField
        label="Aspect"
        presentation="ratio"
        value={1}
        min={0.25}
        max={4}
        step={0.01}
        onChange={onChange}
      />,
    )
    const exact = screen.getByRole('textbox', { name: 'Aspect exact ratio' })

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '16:9')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(16 / 9)
    expect(exact).toHaveValue('16:9')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '3:0')
    await user.tab()
    expect(onChange).toHaveBeenCalledOnce()
    expect(exact).toHaveValue('16:9')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '1.5')
    await user.keyboard('{Escape}')
    expect(onChange).toHaveBeenCalledOnce()
    expect(exact).toHaveValue('16:9')
  })

  it('keeps focused drafts stable across external values and synchronizes after blur', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(
      <DomainNumberField
        label="Scale X"
        presentation="multiplier"
        value={1}
        min={0.01}
        max={8}
        step={0.01}
        onChange={onChange}
      />,
    )
    const exact = screen.getByRole('textbox', { name: 'Scale X exact multiplier' })
    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '1.')
    rerender(
      <DomainNumberField
        label="Scale X"
        presentation="multiplier"
        value={2}
        min={0.01}
        max={8}
        step={0.01}
        onChange={onChange}
      />,
    )
    expect(exact).toHaveValue('1.')
    await user.tab()
    expect(onChange).toHaveBeenCalledWith(1)
    expect(exact).toHaveValue('1')
  })

  it('marks neutral, previews a neutral-aware pointer gesture, and commits once', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <DomainNumberField
        label="Animation speed"
        presentation="multiplier"
        value={1}
        min={0}
        max={4}
        step={0.1}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with multiplier slider' })
    expect(grip).toHaveClass('w-[18px]')
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 7, clientX: 400, clientY: 114 })
    expect(screen.getByTestId('domain-number-neutral')).toHaveStyle({ left: '50%' })
    expect(screen.getByRole('slider', { name: 'Multiplier slider' }))
      .toHaveAttribute('aria-valuetext', '1x')

    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 424, clientY: 114 })
    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    expect(onPreview).toHaveBeenCalledTimes(2)
    expect(onPreview.mock.calls[0][0]).toBeGreaterThan(1)
    expect(onPreview.mock.calls[1][0]).toBeGreaterThan(onPreview.mock.calls[0][0])
    expect(onChange).not.toHaveBeenCalled()

    fireEvent.pointerUp(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(onPreview.mock.calls[1][0])
  })

  it('supports keyboard adjustment and cancellation through the transient slider', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <DomainNumberField
        label="Repeat scale"
        presentation="multiplier"
        value={1}
        min={1}
        max={8}
        step={0.1}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with multiplier slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 228, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Multiplier slider' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onPreview).toHaveBeenCalledWith(1.1)
    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Repeat scale exact multiplier' })).toHaveValue('1')
  })

  it('applies keyboard slider steps to the precise controlled value rather than its rounded draft', () => {
    const onPreview = vi.fn()
    const onChange = vi.fn()
    render(
      <DomainNumberField
        label="Scale X"
        presentation="multiplier"
        value={1.234567}
        min={0.01}
        max={8}
        step={0.01}
        onPreview={onPreview}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with multiplier slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })

    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Multiplier slider' })
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onPreview).toHaveBeenLastCalledWith(1.244567)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(1.244567)
  })
})
