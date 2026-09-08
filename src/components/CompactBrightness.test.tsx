import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { CompactBrightness } from './CompactBrightness'

function Control({ initial = 1, curve = 1 }: { initial?: number | null; curve?: 1 | 2 }) {
  const [value, setValue] = useState(initial)
  return <CompactBrightness curve={curve} value={value} onChange={setValue} />
}

describe('compact brightness', () => {
  it('uses a linear midpoint for browser previews', () => {
    render(<Control />)
    const slider = screen.getByRole('slider', { name: 'Brightness' })
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(slider).toHaveAttribute('aria-valuetext', '50%')
    expect(screen.getByText('50%')).toBeInTheDocument()
  })

  it.each([[0.3758, '38%'], [0.1, '10%'], [0.0998, '9.98%'], [0.0123, '1.23%']])('formats %s consistently in readout, accessibility and tooltip', (value, label) => {
    render(<Control initial={value as number} />)
    expect(screen.getByText(label)).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toHaveAttribute('aria-valuetext', label)
    expect(screen.getByTitle(`Brightness ${label}`)).toBeInTheDocument()
  })

  it('keeps the hardware nonlinear curve, endpoints and percentage keyboard steps', () => {
    render(<Control curve={2} />)
    const slider = screen.getByRole('slider', { name: 'Brightness' })
    fireEvent.change(slider, { target: { value: '0.5' } })
    expect(slider).toHaveAttribute('aria-valuetext', '25%')
    expect(screen.getByText('25%')).toBeInTheDocument()
    fireEvent.keyDown(slider, { key: 'ArrowRight' })
    expect(slider).toHaveAttribute('aria-valuetext', '26%')
    for (const [position, label] of [['0', '0%'], ['1', '100%']]) {
      fireEvent.change(slider, { target: { value: position } })
      expect(slider).toHaveAttribute('aria-valuetext', label)
    }
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument()
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('keeps an unknown Controller value visibly unset until adjusted', () => {
    render(<Control initial={null} curve={2} />)
    const slider = screen.getByRole('slider', { name: 'Brightness' })
    expect(slider).toHaveAttribute('aria-valuetext', 'not set')
    expect(screen.getByText('—')).toBeInTheDocument()
    fireEvent.change(slider, { target: { value: '0.6' } })
    expect(screen.getByText('36%')).toBeInTheDocument()
  })
})
