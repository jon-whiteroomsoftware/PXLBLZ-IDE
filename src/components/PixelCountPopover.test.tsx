import { fireEvent, render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import { PixelCountPopover } from './PixelCountPopover'

describe('PixelCountPopover', () => {
  it('moves the resolution slider at fine gain while Shift is held (#814)', () => {
    const steps = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100]
    const onSelect = vi.fn()
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
})
