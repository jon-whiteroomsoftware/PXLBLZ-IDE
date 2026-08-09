import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { PercentageField } from './percentage-field'

describe('PercentageField', () => {
  it('uses rule-under amber chrome while keeping the transient slider boxed (#779)', () => {
    render(<PercentageField label="Opacity" value={0.72} min={0} max={1} step={0.01} onChange={vi.fn()} />)

    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })
    const field = exact.parentElement!
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    expect(field).toHaveClass('rounded-none', 'border-0', 'border-b', 'border-zinc-700', 'bg-transparent', 'focus-within:border-live/70')
    expect(field).not.toHaveClass('rounded', 'bg-zinc-950', 'bg-zinc-900', 'focus-within:border-cyan-400/60')
    expect(grip).not.toHaveClass('border-l', 'border-zinc-700', 'hover:text-cyan-300')
    expect(grip).toHaveClass('hover:text-live', 'focus-visible:text-live')

    fireEvent.keyDown(grip, { key: 'Enter' })
    const sliderDialog = screen.getByRole('dialog', { name: 'Percentage slider controls' })
    expect(sliderDialog).toHaveClass('rounded-md', 'border', 'border-live/35', 'bg-zinc-950')
    expect(screen.getByRole('slider', { name: 'Percentage slider' })).toHaveClass('accent-live')
  })

  it('presents canonical percentage text and applies exact drafts only through explicit actions', async () => {
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
    await user.click(screen.getByRole('button', { name: 'Apply Opacity' }))
    expect(onChange).toHaveBeenLastCalledWith(0.85)
    expect(exact).toHaveValue('85')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '40%{Enter}')
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 7, clientX: 400, clientY: 114 })
    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
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
    expect(screen.queryByRole('slider', { name: 'Percentage slider' })).not.toBeInTheDocument()
  })

  it('scrubs at a tenth of the gain with a finer value step while Shift is held (#667)', () => {
    const onPreview = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 7, clientX: 400, clientY: 114 })
    // Coarse travel: +46px over the 228px track from 0.5.
    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    // Fine travel: the same +23px now moves a tenth as far, on a 10x finer
    // value step — and engages mid-gesture without any jump.
    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 469, clientY: 114, shiftKey: true })
    // Releasing Shift resumes coarse deltas from where fine left off.
    fireEvent.pointerMove(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    expect(onPreview.mock.calls).toEqual([[0.702], [0.7118], [0.611]])

    fireEvent.pointerUp(grip, { pointerId: 7, clientX: 446, clientY: 114 })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(0.611)
  })

  it('scrubs fine from the gesture start and cancels back to the origin (#667)', () => {
    const onPreview = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    // Shift held before the drag begins: fine gain applies from the first
    // sample, anchored at the field's current value.
    fireEvent.pointerDown(grip, { pointerId: 8, clientX: 400, shiftKey: true })
    fireEvent.pointerMove(grip, { pointerId: 8, clientX: 446, shiftKey: true })
    expect(onPreview).toHaveBeenLastCalledWith(0.5202)

    // Cancelling mid-fine restores the origin and commits nothing.
    fireEvent.pointerCancel(grip, { pointerId: 8 })
    expect(onPreview).toHaveBeenLastCalledWith(0.5)
    expect(onChange).not.toHaveBeenCalled()
  })

  it('keeps a pinned-slider gesture incremental after Shift is released (#667)', () => {
    const onPreview = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Opacity"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(slider, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      x: 300, y: 100, left: 300, right: 500, top: 100, bottom: 120, width: 200, height: 20, toJSON: () => ({}),
    })

    fireEvent.pointerDown(slider, { pointerId: 21, clientX: 300 })
    // Fine engages: +20px at a tenth of the gain over the 200px track.
    fireEvent.pointerMove(slider, { pointerId: 21, clientX: 320, shiftKey: true })
    expect(onPreview).toHaveBeenLastCalledWith(0.51)

    // Once fine has engaged, native range input is suppressed for the rest
    // of the gesture — an absolute native value must not jump the field
    // (#667 review).
    fireEvent.input(slider, { target: { value: '900' } })
    expect(onPreview).toHaveBeenLastCalledWith(0.51)

    // Releasing Shift continues incrementally at full gain: +20px is +0.1.
    fireEvent.pointerMove(slider, { pointerId: 21, clientX: 340 })
    expect(onPreview).toHaveBeenLastCalledWith(0.61)

    fireEvent.pointerUp(slider, { pointerId: 21, clientX: 340 })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(0.61)
  })

  it('takes a ten-times-coarser keyboard stride with Shift on the pinned slider (#667)', () => {
    const onPreview = vi.fn()
    const onChange = vi.fn()
    render(
      <PercentageField
        label="Diffusion"
        value={0.5}
        min={0}
        max={1}
        step={0.01}
        onPreview={onPreview}
        onChange={onChange}
      />,
    )
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
    fireEvent.keyDown(slider, { key: 'ArrowRight', shiftKey: true })
    expect(onPreview).toHaveBeenLastCalledWith(0.6)
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(onPreview).toHaveBeenLastCalledWith(0.61)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(0.61)
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 3, clientX: 400 })
    fireEvent.pointerUp(grip, { pointerId: 3, clientX: 400 })
    let slider = screen.getByRole('slider', { name: 'Percentage slider' })

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
    slider = screen.getByRole('slider', { name: 'Percentage slider' })
    fireEvent.keyDown(slider, { key: 'ArrowLeft' })
    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onPreviewEnd).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('textbox', { name: 'Diffusion exact percentage' })).toHaveValue('100')
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 398, top: 100, bottom: 124, width: 18, height: 24, toJSON: () => ({}),
    })
    fireEvent.pointerDown(grip, { pointerId: 4, clientX: 389 })
    fireEvent.pointerUp(grip, { pointerId: 4, clientX: 389 })

    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
    const setPointerCapture = vi.fn()
    const releasePointerCapture = vi.fn()
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: setPointerCapture })
    Object.defineProperty(slider, 'releasePointerCapture', { configurable: true, value: releasePointerCapture })

    fireEvent.pointerDown(slider, { pointerId: 11 })
    expect(setPointerCapture).toHaveBeenCalledWith(11)
    fireEvent.input(slider, { target: { value: '800' } })
    fireEvent.pointerLeave(slider, { pointerId: 11 })
    fireEvent.pointerUp(slider, { pointerId: 11 })

    expect(releasePointerCapture).toHaveBeenCalledWith(11)
    expect(onPreview).toHaveBeenLastCalledWith(0.8)
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(0.8)
  })

  it('cancels a pinned slider preview when pointer capture is unexpectedly lost', () => {
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 398, top: 100, bottom: 124, width: 18, height: 24, toJSON: () => ({}),
    })
    fireEvent.pointerDown(grip, { pointerId: 4, clientX: 389 })
    fireEvent.pointerUp(grip, { pointerId: 4, clientX: 389 })

    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(slider, { pointerId: 12 })
    fireEvent.input(slider, { target: { value: '800' } })
    expect(onPreview).toHaveBeenLastCalledWith(0.8)
    fireEvent.lostPointerCapture(slider, { pointerId: 12 })

    expect(onPreview).toHaveBeenLastCalledWith(0.5)
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Brightness exact percentage' })).toHaveValue('50')
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 408, top: 100, bottom: 128, width: 28, height: 28, toJSON: () => ({}),
    })

    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '25%')
    fireEvent.keyDown(slider, { key: 'ArrowUp' })
    fireEvent.keyDown(slider, { key: 'Escape' })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(screen.queryByRole('slider', { name: 'Percentage slider' })).not.toBeInTheDocument()
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
    await user.click(document.body)
    expect(exact).toHaveValue('40')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '175%')
    await user.click(screen.getByRole('button', { name: 'Apply Opacity' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(1)
    expect(exact).toHaveValue('100')

    await user.click(exact)
    await user.clear(exact)
    await user.type(exact, '10%')
    await user.keyboard('{Escape}')
    expect(onChange).toHaveBeenCalledOnce()
    expect(exact).toHaveValue('100')
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
    fireEvent.blur(exact)
    rerender(<PercentageField label="Opacity" value={0.7} min={0} max={1} step={0.01} onChange={onChange} />)
    expect(exact).toHaveValue('70')

    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '7' } })
    rerender(<PercentageField label="Opacity" value={0.8} min={0} max={1} step={0.01} onChange={onChange} />)
    expect(exact).toHaveValue('7')
    fireEvent.keyDown(exact, { key: 'Escape' })
    expect(exact).toHaveValue('80')
    expect(onChange).not.toHaveBeenCalled()
  })

  it('emits a follow-up exact edit that returns an optimistic commit to the stale controlled value', () => {
    const onChange = vi.fn()
    render(<PercentageField label="Opacity" value={0.4} min={0} max={1} step={0.01} onChange={onChange} />)
    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })

    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '100' } })
    fireEvent.keyDown(exact, { key: 'Enter' })
    expect(onChange).toHaveBeenLastCalledWith(1)

    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '40' } })
    fireEvent.keyDown(exact, { key: 'Enter' })

    expect(onChange.mock.calls).toEqual([[1], [0.4]])
    expect(exact).toHaveValue('40')
  })

  it('keeps the newest optimistic commit through delayed intermediate prop acknowledgements', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <PercentageField label="Opacity" value={0.4} min={0} max={1} step={0.01} onChange={onChange} />,
    )
    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })

    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '100' } })
    fireEvent.keyDown(exact, { key: 'Enter' })
    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '60' } })
    fireEvent.keyDown(exact, { key: 'Enter' })
    expect(onChange.mock.calls).toEqual([[1], [0.6]])

    rerender(<PercentageField label="Opacity" value={1} min={0} max={1} step={0.01} onChange={onChange} />)
    expect(exact).toHaveValue('60')
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Percentage slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '60%')
    fireEvent.keyDown(slider, { key: 'Enter' })

    rerender(<PercentageField label="Opacity" value={0.6} min={0} max={1} step={0.01} onChange={onChange} />)
    expect(exact).toHaveValue('60')
  })

  it('does not retain collapsed commits after returning to the current controlled value', () => {
    const onChange = vi.fn()
    const { rerender } = render(
      <PercentageField label="Opacity" value={0.4} min={0} max={1} step={0.01} onChange={onChange} />,
    )
    const exact = screen.getByRole('textbox', { name: 'Opacity exact percentage' })

    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '100' } })
    fireEvent.keyDown(exact, { key: 'Enter' })
    fireEvent.focus(exact)
    fireEvent.change(exact, { target: { value: '40' } })
    fireEvent.keyDown(exact, { key: 'Enter' })
    expect(onChange.mock.calls).toEqual([[1], [0.4]])
    expect(exact).toHaveValue('40')

    rerender(<PercentageField label="Opacity" value={0.4} min={0} max={1} step={0.01} onChange={onChange} />)
    rerender(<PercentageField label="Opacity" value={1} min={0} max={1} step={0.01} onChange={onChange} />)

    expect(exact).toHaveValue('100')
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
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
    const grip = screen.getByRole('button', { name: 'Adjust with percentage slider' })
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
    expect(screen.getByRole('button', { name: 'Adjust with percentage slider' })).toBeDisabled()
  })
})
