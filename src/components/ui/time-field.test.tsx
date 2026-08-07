import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { TimeField } from './time-field'

describe('TimeField (#614)', () => {
  it('keeps the field label unique while describing its auxiliary time controls (#656)', () => {
    render(
      <TimeField
        label="Duration"
        value={1}
        min={0}
        max={30}
        step={0.001}
        onChange={vi.fn()}
      />,
    )

    const exact = screen.getByRole('textbox', { name: 'Duration exact time' })
    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    expect(grip).toHaveAccessibleDescription('Duration')
    fireEvent.keyDown(grip, { key: 'Enter' })
    expect(screen.getByRole('slider', { name: 'Time slider' }))
      .toHaveAccessibleDescription('Duration')
    expect(screen.getAllByLabelText(/Duration/i)).toEqual([exact])
  })

  it('accepts exact seconds beyond the thirty-second scrub range', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <TimeField
        label="Start"
        value={2.5}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onChange={onChange}
      />,
    )

    const exact = screen.getByRole('textbox', { name: 'Start exact time' })
    expect(exact).toHaveValue('2.5')
    expect(document.querySelector('[data-unit-suffix="s"]')).toBeInTheDocument()
    await user.clear(exact)
    await user.type(exact, '90.125s')
    await user.keyboard('{Enter}')

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(90.125)
  })

  it('renders whole-second detents and keeps slider keyboard travel within thirty seconds', () => {
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    const onChange = vi.fn()
    render(
      <TimeField
        label="Duration"
        value={12.5}
        min={0.1}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onPreview={onPreview}
        onPreviewEnd={onPreviewEnd}
        onChange={onChange}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    expect(screen.getAllByTestId('bounded-number-detent')).toHaveLength(30)
    expect(screen.getAllByTestId('bounded-number-detent-label').map((label) => label.textContent))
      .toEqual(['5', '10', '15', '20', '25', '30'])

    const slider = screen.getByRole('slider', { name: 'Time slider' })
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onPreview).toHaveBeenLastCalledWith(30)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it('keeps an exact value above the scrub range until the user adjusts the ruler', () => {
    const onChange = vi.fn()
    render(
      <TimeField
        label="Show End"
        value={75.125}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onChange={onChange}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    const slider = screen.getByRole('slider', { name: 'Time slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '30s')
    fireEvent.blur(slider)

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Show End exact time' })).toHaveValue('75.125')
  })

  it('adds half-second minor detents when the scrub range is short', () => {
    render(
      <TimeField
        label="Cadence"
        value={1}
        min={0}
        max={5}
        step={0.001}
        onChange={vi.fn()}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    expect(screen.getAllByTestId('bounded-number-detent')).toHaveLength(11)
    expect(screen.getAllByTestId('bounded-number-detent-label').map((label) => label.textContent))
      .toEqual(['0', '1', '2', '3', '4', '5'])
  })

  it('makes both native ruler endpoints reachable when the span is not step-divisible', () => {
    const onPreview = vi.fn()
    const onChange = vi.fn()
    render(
      <TimeField
        label="Strobe cadence"
        value={1}
        min={0.016}
        max={60}
        step={0.05}
        onPreview={onPreview}
        onChange={onChange}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    const slider = screen.getByRole('slider', { name: 'Time slider' })
    expect(slider).toHaveAttribute('min', '0')
    expect(slider).toHaveAttribute('max', '300')
    expect(slider).toHaveAttribute('step', '1')
    fireEvent.input(slider, { target: { value: '300' } })
    expect(onPreview).toHaveBeenLastCalledWith(30)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(30)
  })

  it('restores the gesture-start value when a controlled preview is canceled', () => {
    const onChange = vi.fn()
    function PreviewHost() {
      const [value, setValue] = useState(1)
      return (
        <TimeField
          label="Insert duration"
          value={value}
          min={0.001}
          max={Number.MAX_SAFE_INTEGER}
          step={0.001}
          onPreview={setValue}
          onChange={onChange}
        />
      )
    }
    render(<PreviewHost />)

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Time slider' })
    fireEvent.keyDown(slider, { key: 'End' })
    expect(screen.getByRole('textbox', { name: 'Insert duration exact time' })).toHaveValue('30')
    fireEvent.keyDown(slider, { key: 'Escape' })

    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('textbox', { name: 'Insert duration exact time' })).toHaveValue('1')
  })

  it('displays valid millisecond values without rounding to the ruler step', () => {
    render(
      <TimeField
        label="Cadence"
        value={0.016}
        min={0.016}
        max={60}
        step={0.05}
        onChange={vi.fn()}
      />,
    )

    expect(screen.getByRole('textbox', { name: 'Cadence exact time' })).toHaveValue('0.016')
  })

  it('reopens and closes at an optimistic drag value before its controlled prop catches up', () => {
    const onChange = vi.fn()
    render(
      <TimeField
        label="Start"
        value={0}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onChange={onChange}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 31, clientX: 209 })
    fireEvent.pointerMove(grip, { pointerId: 31, clientX: 349 })
    fireEvent.pointerUp(grip, { pointerId: 31, clientX: 349 })
    const committed = onChange.mock.calls[0]?.[0]
    expect(committed).toBeGreaterThan(0)
    expect(screen.getByRole('textbox', { name: 'Start exact time' })).toHaveValue(String(committed))

    fireEvent.keyDown(grip, { key: 'Enter' })
    const reopenedSlider = screen.getByRole('slider', { name: 'Time slider' })
    expect(reopenedSlider).toHaveAttribute('aria-valuetext', `${committed}s`)
    fireEvent.keyDown(reopenedSlider, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledOnce()
    expect(screen.getByRole('textbox', { name: 'Start exact time' })).toHaveValue(String(committed))
  })

  it('restores the controlled value when a commit is synchronously refused', () => {
    const onChange = vi.fn(() => false)
    render(
      <TimeField
        label="Start"
        value={0}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onChange={onChange}
      />,
    )

    const exact = screen.getByRole('textbox', { name: 'Start exact time' })
    fireEvent.change(exact, { target: { value: '7' } })
    fireEvent.keyDown(exact, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(7)
    expect(exact).toHaveValue('0')

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })
    expect(screen.getByRole('slider', { name: 'Time slider' })).toHaveAttribute('aria-valuetext', '0s')
  })

  it('restores the gesture-start value when a slider commit is synchronously refused', () => {
    const onChange = vi.fn(() => false)
    render(
      <TimeField
        label="Start"
        value={1}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onChange={onChange}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Time slider' })
    fireEvent.keyDown(slider, { key: 'End' })
    fireEvent.keyDown(slider, { key: 'Enter' })

    expect(onChange).toHaveBeenCalledWith(30)
    expect(screen.getByRole('textbox', { name: 'Start exact time' })).toHaveValue('1')

    fireEvent.keyDown(grip, { key: 'Enter' })
    expect(screen.getByRole('slider', { name: 'Time slider' })).toHaveAttribute('aria-valuetext', '1s')
  })

  it('holds the thumb at a whole-second detent across nearby pointer positions', () => {
    const onPreview = vi.fn()
    render(
      <TimeField
        label="Start"
        value={12.5}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        step={0.001}
        onPreview={onPreview}
        onChange={vi.fn()}
      />,
    )

    const grip = screen.getByRole('button', { name: 'Adjust with time slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })
    const slider = screen.getByRole('slider', { name: 'Time slider' })

    fireEvent.input(slider, { target: { value: '126' } })
    expect(onPreview).toHaveBeenLastCalledWith(12.6)
    fireEvent.input(slider, { target: { value: '127' } })
    expect(onPreview).toHaveBeenLastCalledWith(13)
    expect(slider).toHaveAttribute('aria-valuetext', '13s')
  })
})
