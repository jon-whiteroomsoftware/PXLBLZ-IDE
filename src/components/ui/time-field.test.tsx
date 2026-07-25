import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TimeField } from './time-field'

describe('TimeField (#614)', () => {
  it('accepts exact seconds beyond the sixty-second scrub range', async () => {
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
    await user.tab()

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(90.125)
  })

  it('renders whole-second detents and keeps slider keyboard travel within sixty seconds', () => {
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

    const grip = screen.getByRole('button', { name: 'Adjust Duration with slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    expect(screen.getAllByTestId('bounded-number-detent')).toHaveLength(60)
    expect(screen.getAllByTestId('bounded-number-detent-label').map((label) => label.textContent))
      .toEqual(['10', '20', '30', '40', '50', '60'])

    const slider = screen.getByRole('slider', { name: 'Duration time slider' })
    fireEvent.keyDown(slider, { key: 'End' })
    expect(onPreview).toHaveBeenLastCalledWith(60)
    fireEvent.keyDown(slider, { key: 'Enter' })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith(60)
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

    const grip = screen.getByRole('button', { name: 'Adjust Show End with slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    const slider = screen.getByRole('slider', { name: 'Show End time slider' })
    expect(slider).toHaveAttribute('aria-valuetext', '60s')
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

    const grip = screen.getByRole('button', { name: 'Adjust Cadence with slider' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    expect(screen.getAllByTestId('bounded-number-detent')).toHaveLength(11)
    expect(screen.getAllByTestId('bounded-number-detent-label').map((label) => label.textContent))
      .toEqual(['0', '1', '2', '3', '4', '5'])
  })
})
