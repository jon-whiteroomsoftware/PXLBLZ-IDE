import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { SlowMoPlan, SlowMoSettings } from '@/engine/slowMo'
import { SlowMoLab, type SlowMoLabProps } from './SlowMoLab'

const defaults: SlowMoSettings = {
  rate: 1, stepMs: 16, inBetween: 'hold',
  stagger: { shape: 'sweep', width: 0 }, persistence: null,
}
const active: SlowMoSettings = {
  rate: 1 / 16, stepMs: 32, inBetween: 'hold',
  stagger: { shape: 'scatter', width: 0.7 },
  persistence: { attackMs: 1500, decayMs: 2000 },
}
const props = (overrides: Partial<SlowMoLabProps> = {}): SlowMoLabProps => ({
  settings: null, onChange: vi.fn(), declined: null, arrayWords: null, ...overrides,
})

async function select(user: ReturnType<typeof userEvent.setup>, control: string, option: string) {
  await user.click(screen.getByRole('button', { name: `Slow-mo ${control}` }))
  await user.click(within(screen.getByRole('listbox', { name: `Slow-mo ${control}` })).getByRole('option', { name: option }))
}

describe('SlowMoLab', () => {
  it('renders Off with disabled Tempo defaults, unavailable words and disabled Copy', () => {
    render(<SlowMoLab {...props()} />)
    expect(screen.getByRole('region', { name: 'Slow-mo lab' })).toHaveAttribute('data-testid', 'slowmo-lab')
    expect(screen.getByRole('group', { name: 'Tempo' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Slow-mo step' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Slow-mo step' })).toHaveTextContent('16 ms')
    expect(screen.getByRole('button', { name: 'Slow-mo method' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo method' })).toHaveTextContent('Off')
    expect(screen.getByRole('button', { name: 'Copy generated code' })).toBeDisabled()
    expect(screen.getByText('— / 10240')).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it.each(['clock', 'hold', 'blend', 'eased'] as const)('creates complete defaults when selecting %s from Off', async (inBetween) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SlowMoLab {...props({ onChange })} />)
    await select(user, 'method', inBetween[0].toUpperCase() + inBetween.slice(1))
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaults, inBetween })
  })

  it('preserves unrelated fields through Hold, Blend and Eased, then turns Off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const { rerender } = render(<SlowMoLab {...props({ settings: active, onChange })} />)
    for (const inBetween of ['blend', 'eased'] as const) {
      await select(user, 'method', inBetween === 'blend' ? 'Blend' : 'Eased')
      const settings = { ...active, inBetween }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toHaveTextContent('1/16')
      expect(screen.getByRole('button', { name: 'Slow-mo step' })).toHaveTextContent('32 ms')
    }
    await select(user, 'method', 'Off')
    expect(onChange).toHaveBeenLastCalledWith(null)
    rerender(<SlowMoLab {...props({ onChange })} />)
    expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toBeDisabled()
  })

  it('changes every rate and step stop while preserving all other fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let settings = active
    const { rerender } = render(<SlowMoLab {...props({ settings, onChange })} />)
    for (const [label, rate] of [['1', 1], ['1/2', 1 / 2], ['1/4', 1 / 4], ['1/8', 1 / 8], ['1/16', 1 / 16], ['1/32', 1 / 32]] as const) {
      await select(user, 'rate', label)
      settings = { ...settings, rate }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toHaveTextContent(label)
    }
    for (const stepMs of [16, 32]) {
      await select(user, 'step', `${stepMs} ms`)
      settings = { ...settings, stepMs }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo step' })).toHaveTextContent(`${stepMs} ms`)
    }
    expect(onChange).toHaveBeenCalledTimes(8)
  })

  it('renders supplied decline messages only and distinguishes zero from unavailable words', () => {
    const { rerender } = render(<SlowMoLab {...props({ arrayWords: 1560 })} />)
    expect(screen.getByText('1560 / 10240')).toBeInTheDocument()
    const reasons = ['palette-output', 'no-renderer', 'shadowed-builtin', 'reserved-prefix', 'array-budget'] as const
    for (const reason of reasons) {
      const declined: SlowMoPlan['declined'] = { reason, message: `Supplied ${reason} message` }
      rerender(<SlowMoLab {...props({ declined, arrayWords: 0 })} />)
      expect(screen.getByRole('status')).toHaveTextContent(declined.message)
      expect(screen.getByText('0 / 10240')).toBeInTheDocument()
    }
    rerender(<SlowMoLab {...props({ arrayWords: 20000 })} />)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByText('20000 / 10240')).toBeInTheDocument()
  })

  it('enables Copy only while a callback is supplied and calls it once', async () => {
    const user = userEvent.setup()
    const onCopy = vi.fn()
    const { rerender } = render(<SlowMoLab {...props()} />)
    expect(screen.getByRole('button', { name: 'Copy generated code' })).toBeDisabled()
    rerender(<SlowMoLab {...props({ onCopy })} />)
    expect(screen.getByRole('button', { name: 'Copy generated code' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Copy generated code' }))
    expect(onCopy).toHaveBeenCalledExactlyOnceWith()
    rerender(<SlowMoLab {...props()} />)
    expect(screen.getByRole('button', { name: 'Copy generated code' })).toBeDisabled()
  })

  it('portals the active method menu and supports ArrowDown, End, Enter and Escape focus', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SlowMoLab {...props({ settings: active, onChange })} />)
    const trigger = screen.getByRole('button', { name: 'Slow-mo method' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox', { name: 'Slow-mo method' }).parentElement).toBe(document.body)
    expect(screen.getByRole('option', { name: 'Hold' })).toHaveFocus()
    await user.keyboard('{End}{Enter}')
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...active, inBetween: 'eased' })
    trigger.focus()
    await user.keyboard('{ArrowDown}{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
