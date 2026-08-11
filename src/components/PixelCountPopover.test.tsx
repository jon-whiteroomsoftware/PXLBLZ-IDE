import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { PixelCountPopover } from './PixelCountPopover'

describe('PixelCountPopover', () => {
  const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]

  function renderResolutionPopover(onSelect = vi.fn()) {
    render(
      <PixelCountPopover
        value={600}
        triggerLabel="Edit pixel count"
        inputLabel="Pixel count"
        quickSelect={{
          steps,
          dimensionsFor: () => null,
          onSelect,
        }}
        onApply={() => {}}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    const slider = screen.getByRole('slider', { name: 'Preview resolution' })
    vi.spyOn(slider, 'getBoundingClientRect').mockReturnValue({
      left: 0, right: 100, top: 0, bottom: 20, width: 100, height: 20,
      x: 0, y: 0, toJSON: () => ({}),
    })
    return { onSelect, slider }
  }

  it('moves the resolution slider at fine gain while Shift is held (#814)', () => {
    const { onSelect, slider } = renderResolutionPopover()

    fireEvent.pointerDown(slider, { pointerId: 14, clientX: 0, shiftKey: true })
    fireEvent.pointerMove(slider, { pointerId: 14, clientX: 50, shiftKey: true })

    // Coarse travel would cross five stops. Fine adjustment traverses one.
    expect(onSelect).toHaveBeenLastCalledWith(700)
    expect(screen.getByText('Fine')).toBeInTheDocument()

    // Once fine mode engages, a native absolute range event cannot overwrite it.
    fireEvent.change(slider, { target: { value: '10' } })
    expect(onSelect).toHaveBeenLastCalledWith(700)

    fireEvent.pointerUp(slider, { pointerId: 14, clientX: 50, shiftKey: true })
    expect(screen.queryByText('Fine')).not.toBeInTheDocument()
  })

  it('ends a fine drag when Escape closes and unmounts the popover (#814 review)', () => {
    const { onSelect, slider } = renderResolutionPopover()

    fireEvent.pointerDown(slider, { pointerId: 15, clientX: 0, shiftKey: true })
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(screen.queryByRole('slider', { name: 'Preview resolution' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    const reopenedSlider = screen.getByRole('slider', { name: 'Preview resolution' })
    onSelect.mockClear()

    fireEvent.pointerMove(reopenedSlider, { pointerId: 15, clientX: 100 })
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.change(reopenedSlider, { target: { value: '6' } })
    expect(onSelect).toHaveBeenLastCalledWith(700)
  })

  it('ends a fine drag when the resolution slider loses pointer capture (#814 review)', () => {
    const { onSelect, slider } = renderResolutionPopover()

    fireEvent.pointerDown(slider, { pointerId: 16, clientX: 0, shiftKey: true })
    fireEvent.lostPointerCapture(slider, { pointerId: 16 })
    onSelect.mockClear()

    fireEvent.pointerMove(slider, { pointerId: 16, clientX: 100 })
    expect(onSelect).not.toHaveBeenCalled()

    fireEvent.change(slider, { target: { value: '6' } })
    expect(onSelect).toHaveBeenLastCalledWith(700)
  })

  it('re-anchors fine adjustment from the latest coarse slider value (#814 review)', () => {
    const { onSelect, slider } = renderResolutionPopover()

    fireEvent.pointerDown(slider, { pointerId: 17, clientX: 0 })
    fireEvent.change(slider, { target: { value: '8' } })
    expect(onSelect).toHaveBeenLastCalledWith(900)

    fireEvent.pointerMove(slider, { pointerId: 17, clientX: 80 })
    fireEvent.pointerMove(slider, { pointerId: 17, clientX: 180, shiftKey: true })

    expect(onSelect).toHaveBeenLastCalledWith(1000)
  })
})
