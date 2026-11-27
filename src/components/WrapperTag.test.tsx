import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WrapperTags } from './WrapperTag'

const memory = 'Skipped: not enough memory. Needs 2,340 array words, 512 free.'
const generic = "Skipped: this Pattern's code can't take a Wrapper."

describe('WrapperTags (#1277)', () => {
  it('gives applied tags no tab stop', () => {
    render(<WrapperTags tags={[{ wrapper: 'power', state: 'applied' }, { wrapper: 'binding', state: 'applied', label: 'IO36 → sliderSpeed' }]} />)
    expect(screen.getByText('power')).not.toHaveAttribute('tabindex')
    expect(screen.getByText('IO36 → sliderSpeed')).not.toHaveAttribute('tabindex')
  })

  it('renders repeated binding labels with distinct React keys', () => {
    const label = 'IO36 → sliderSpeed'
    const binding = { wrapper: 'binding', state: 'applied', label } as const
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      render(<WrapperTags tags={[binding, { wrapper: 'power', state: 'applied' }, { ...binding }]} />)
      expect(screen.getAllByText(label)).toHaveLength(2)
      expect(screen.getByText('power')).toBeVisible()
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      consoleError.mockRestore()
    }
  })

  it('reveals a skipped reason on focus, hides it on Escape and reveals it again on re-focus', () => {
    const sibling = vi.fn()
    render(<div>
      <WrapperTags tags={[{ wrapper: 'slow-mo', state: 'skipped', reason: memory }, { wrapper: 'dreamy', state: 'skipped', reason: generic }]} />
      <button type="button" onClick={sibling}>Run</button>
    </div>)
    const slowMo = screen.getByText('slow-mo')
    const dreamy = screen.getByText('dreamy')
    expect(slowMo).toHaveAttribute('tabindex', '0')
    expect(slowMo).toHaveAccessibleDescription(memory)
    expect(dreamy).toHaveAccessibleDescription(generic)
    expect(slowMo.getAttribute('aria-describedby')).not.toBe(dreamy.getAttribute('aria-describedby'))
    expect(screen.queryByRole('tooltip')).toBeNull()

    act(() => slowMo.focus())
    expect(screen.getByRole('tooltip')).toHaveTextContent(memory)
    fireEvent.keyDown(slowMo, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(slowMo).toHaveFocus()
    act(() => slowMo.blur())
    act(() => slowMo.focus())
    expect(screen.getByRole('tooltip')).toHaveTextContent(memory)
    fireEvent.keyDown(slowMo, { key: 'Enter' })
    expect(sibling).not.toHaveBeenCalled()
  })

  it('reveals a skipped reason on hover', () => {
    render(<WrapperTags tags={[{ wrapper: 'dreamy', state: 'skipped', reason: generic }]} />)
    fireEvent.mouseEnter(screen.getByText('dreamy'))
    expect(screen.getByRole('tooltip')).toHaveTextContent(generic)
    fireEvent.mouseLeave(screen.getByText('dreamy'))
    expect(screen.queryByRole('tooltip')).toBeNull()
  })
})
