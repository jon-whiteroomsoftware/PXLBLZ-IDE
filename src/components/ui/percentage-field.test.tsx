import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PercentageField } from './percentage-field'

describe('PercentageField', () => {
  it('presents canonical percentage text and commits percentage or normalized exact entry once', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentageField label="Opacity" value={0.72} min={0} max={1} step={0.01} onChange={onChange} />)
    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })

    expect(exact).toHaveValue('72')
    expect(document.querySelector('[data-unit-suffix="%"]')).toBeInTheDocument()
    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '85')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(0.85)
    expect(exact).toHaveValue('85')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '40%')
    await user.tab()
    expect(onChange).toHaveBeenLastCalledWith(0.4)
    expect(onChange).toHaveBeenCalledTimes(2)
    expect(exact).toHaveValue('40')
  })

  it('previews a high-resolution grip drag continuously and commits once on release', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust Opacity with slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 7, clientX: 400, clientY: 114 })
    const slider = screen.getByRole('slider', { name: 'Opacity percentage slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '50%')
    expect(onPreview).not.toHaveBeenCalled()

    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 424, clientY: 114 })
    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    expect(onPreview.mock.calls).toEqual([[0.605], [0.702]])
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Opacity exact percentage' })).toHaveValue('70.2')

    fireEvent.pointerUp(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(0.702)
    expect(screen.queryByRole('slider', { name: 'Opacity percentage slider' })).not.toBeInTheDocument()
  })

  it('pins on a click and supports stepped keyboard adjustment, endpoints, commit, and cancel', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Diffusion"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust Diffusion with slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 3, clientX: 400 })
    fireEvent.pointerUp(grip, { pointerId: 3, clientX: 400 })
    let slider = screen.getByRole('slider', { name: 'Diffusion percentage slider' })

    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onPreview).toHaveBeenLastCalledWith(0.51)
    fireEvent.keyDown(slider, { key: 'Home' })
    expect(onPreview).toHaveBeenLastCalledWith(0)
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onPreview).toHaveBeenLastCalledWith(1)
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(1)
    expect(onPreviewEnd).toHaveBeenCalledOnce()

    fireEvent.pointerDown(grip, { pointerId: 4, clientX: 400 })
    fireEvent.pointerUp(grip, { pointerId: 4, clientX: 400 })
    slider = screen.getByRole('slider', { name: 'Diffusion percentage slider' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onPreviewEnd).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('textbox', { name: 'Diffusion exact percentage' })).toHaveValue('50')
  })

  it('captures a pinned slider drag so releasing outside commits the last preview', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Brightness"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust Brightness with slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 398, top: 100, bottom: 124, width: 18, height: 24, toJSON: () => ({}),
    })
    fireEvent.pointerDown(grip, { pointerId: 4, clientX: 389 })
    fireEvent.pointerUp(grip, { pointerId: 4, clientX: 389 })

    const slider = screen.getByRole('slider', { name: 'Brightness percentage slider' })
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: setPointerCapture })
    Object.defineProperty(slider, 'releasePointerCapture', { configurable: true, value: releasePointerCapture })

    fireEvent.pointerDown(slider, { pointerId: 11 })
    expect(setPointerCapture).toHaveBeenCalledWith(11)
    fireEvent.input(slider, { target: { value: '0.8' } })
    fireEvent.pointerLeave(slider, { pointerId: 11 })
    fireEvent.pointerUp(slider, { pointerId: 11 })

    expect(releasePointerCapture).toHaveBeenCalledWith(11)
    expect(onPreview).toHaveBeenLastCalledWith(0.8)
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(0.8)
  })

  it('opens the pinned slider from the grip keyboard affordance without a pointer', () => {
    const onPreviewEnd = vi.fn()
    render(
      <PercentageField
        label="Brightness"
        value={0.25}
        min={0}
        max={1}
        step={0.01}
        onPreview={vi.fn()}
        onPreviewEnd={onPreviewEnd}
        onChange={vi.fn()}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust Brightness with slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Brightness percentage slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '25%')
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(screen.queryByRole('slider', { name: 'Brightness percentage slider' })).not.toBeInTheDocument()
  })

  it('keeps partial exact drafts local, clamps valid commits, and reverts invalid or escaped drafts', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<PercentageField label="Opacity" value={0.4} min={0} max={1} step={0.01} onChange={onChange} />)
    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '-')
    expect(exact).toHaveValue('-')
    expect(onChange).not.toHaveBeenCalled()
    await user.tab()
    expect(exact).toHaveValue('40')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '175%')
    await user.tab()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(1)
    expect(exact).toHaveValue('100')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '10%')
    await user.keyboard('{Escape}')
    expect(onChange).toHaveBeenCalledOnce()
    expect(exact).toHaveValue('40')
  })

  it('syncs external values while idle without overwriting an active exact draft', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <PercentageField label="Opacity" value={0.4} min={0} max={1} step={0.01} onChange={onChange} />,
    )
    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })

    rerender(<PercentageField label="Opacity" value={0.6} min={0} max={1} step={0.01} onChange={onChange} />)
    expect(exact).toHaveValue('60')

    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '7' } })
    rerender(<PercentageField label="Opacity" value={0.8} min={0} max={1} step={0.01} onChange={onChange} />)
    expect(exact).toHaveValue('7')
    fireEvent.keyDown(exact, { key: 'Escape' })
    expect(exact).toHaveValue('80')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('cancels an active pointer preview on pointer cancellation or lost capture', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust Opacity with slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 8, clientX: 400 })
    fireEvent.pointerMove(grip, { pointerId: 8, clientX: 440 })
    expect(onPreview).toHaveBeenCalled()
    fireEvent.pointerCancel(grip, { pointerId: 8 })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Opacity exact percentage' })).toHaveValue('50')

    fireEvent.pointerDown(grip, { pointerId: 9, clientX: 400 })
    fireEvent.pointerMove(grip, { pointerId: 9, clientX: 450 })
    fireEvent.lostPointerCapture(grip, { pointerId: 9 })
    expect(onPreviewEnd).toHaveBeenCalledTimes(2)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('ends an active preview once when unmounted and disables both entry affordances', () => {
    const onPreviewEnd = vi.fn()
    const { unmount } = render(
      <PercentageField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={vi.fn()}
        onPreviewEnd={onPreviewEnd}
        onChange={vi.fn()}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust Opacity with slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })
    fireEvent.pointerDown(grip, { pointerId: 10, clientX: 400 })
    fireEvent.pointerMove(grip, { pointerId: 10, clientX: 450 })
    unmount()
    expect(onPreviewEnd).toHaveBeenCalledOnce()

    render(<PercentageField label="Duty" value={0.5} min={0} max={1} step={0.01} disabled onChange={vi.fn()} />)
    expect(screen.getByRole('textbox', { name: 'Duty exact percentage' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Adjust Duty with slider' })).toBeDisabled()
  })
})
