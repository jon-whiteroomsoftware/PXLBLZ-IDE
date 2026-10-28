import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'
import type { SlowMoPlan } from '@/engine/slowMo'
import { createSlowMoDraft, type SlowMoDraft } from '@/engine/slowMoDraft'
import { SlowMoLab, type SlowMoLabProps } from './SlowMoLab'

const defaults: SlowMoDraft = {
  rate: 1, stepMs: 16, inBetween: 'hold',
  stagger: { shape: 'sweep', width: 0 }, persistence: { enabled: false, attackMs: 0, decayMs: 2000 },
}
const active: SlowMoDraft = {
  rate: 1 / 16, stepMs: 32, inBetween: 'hold',
  stagger: { shape: 'scatter', width: 0.7 },
  persistence: { enabled: true, attackMs: 1500, decayMs: 2000 },
}
const props = (overrides: Partial<SlowMoLabProps> = {}): SlowMoLabProps => ({
  draft: createSlowMoDraft(), onChange: vi.fn(), declined: null, arrayWords: null, ...overrides,
})

async function select(user: ReturnType<typeof userEvent.setup>, control: string, option: string) {
  await user.click(screen.getByRole('button', { name: `Slow-mo ${control}` }))
  await user.click(within(screen.getByRole('listbox', { name: `Slow-mo ${control}` })).getByRole('option', { name: option }))
}

describe('SlowMoLab', () => {
  it('renders Off with editable complete defaults, unavailable words and disabled Copy', () => {
    render(<SlowMoLab {...props()} />)
    expect(screen.getByRole('region', { name: 'Slow-mo lab' })).toHaveAttribute('data-testid', 'slowmo-lab')
    expect(screen.getByRole('group', { name: 'Tempo' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toHaveTextContent('1')
    expect(screen.getByRole('button', { name: 'Slow-mo step' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo step' })).toHaveTextContent('16 ms')
    expect(screen.getByRole('button', { name: 'Slow-mo method' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo method' })).toHaveTextContent('Off')
    expect(screen.getByRole('group', { name: 'Stagger' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo stagger' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo stagger' })).toHaveTextContent('Sweep')
    expect(screen.getByRole('slider', { name: 'Slow-mo stagger width' })).toBeEnabled()
    expect(screen.getByRole('slider', { name: 'Slow-mo stagger width' })).toHaveAttribute('aria-valuetext', 'Off')
    expect(screen.getByRole('group', { name: 'After-effect' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Slow-mo persistence' })).toBeEnabled()
    for (const [name, value] of [['attack', '0'], ['decay', '2000']]) {
      expect(screen.getByRole('slider', { name: `Slow-mo ${name}` })).toBeEnabled()
      expect(screen.getByRole('slider', { name: `Slow-mo ${name}` })).toHaveValue(value)
    }
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
    const { rerender } = render(<SlowMoLab {...props({ draft: active, onChange })} />)
    for (const inBetween of ['blend', 'eased'] as const) {
      await select(user, 'method', inBetween === 'blend' ? 'Blend' : 'Eased')
      const settings = { ...active, inBetween }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toHaveTextContent('1/16')
      expect(screen.getByRole('button', { name: 'Slow-mo step' })).toHaveTextContent('32 ms')
    }
    await select(user, 'method', 'Off')
    expect(onChange).toHaveBeenLastCalledWith({ ...active, inBetween: 'off' })
    rerender(<SlowMoLab {...props({ draft: { ...active, inBetween: 'off' }, onChange })} />)
    expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toBeEnabled()
  })

  it('changes every rate and step stop while preserving all other fields', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let settings = active
    const { rerender } = render(<SlowMoLab {...props({ draft: settings, onChange })} />)
    for (const [label, rate] of [['1', 1], ['1/2', 1 / 2], ['1/4', 1 / 4], ['1/8', 1 / 8], ['1/16', 1 / 16], ['1/32', 1 / 32]] as const) {
      await select(user, 'rate', label)
      settings = { ...settings, rate }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo rate' })).toHaveTextContent(label)
    }
    for (const stepMs of [16, 32]) {
      await select(user, 'step', `${stepMs} ms`)
      settings = { ...settings, stepMs }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
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

  it.each(['off', 'clock', 'hold', 'blend', 'eased'] as const)('retains editable persistence dials through toggles under %s', async (inBetween) => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const initial = { ...active, inBetween, persistence: { ...active.persistence, enabled: false } }
    const before = structuredClone(initial)
    const { rerender } = render(<SlowMoLab {...props({ draft: initial, onChange })} />)
    for (const name of ['attack', 'decay']) expect(screen.getByRole('slider', { name: `Slow-mo ${name}` })).toBeEnabled()
    fireEvent.change(screen.getByRole('slider', { name: 'Slow-mo attack' }), { target: { value: 4321 } })
    const edited = { ...initial, persistence: { ...initial.persistence, attackMs: 4321 } }
    expect(onChange).toHaveBeenLastCalledWith(edited)
    rerender(<SlowMoLab {...props({ draft: edited, onChange })} />)
    await select(user, 'persistence', 'On')
    const enabled = { ...edited, persistence: { ...edited.persistence, enabled: true } }
    expect(onChange).toHaveBeenLastCalledWith(enabled)
    rerender(<SlowMoLab {...props({ draft: enabled, onChange })} />)
    await select(user, 'persistence', 'Off')
    expect(onChange).toHaveBeenLastCalledWith(edited)
    rerender(<SlowMoLab {...props({ draft: edited, onChange })} />)
    await select(user, 'persistence', 'On')
    expect(onChange).toHaveBeenLastCalledWith(enabled)
    expect(initial).toEqual(before)
  })

  it('updates complete immutable persistence settings at dial boundaries with integer readouts', () => {
    const onChange = vi.fn()
    const before = structuredClone(active)
    let settings = active
    const { rerender } = render(<SlowMoLab {...props({ draft: settings, onChange })} />)
    for (const [name, field, max, values] of [
      ['attack', 'attackMs', 5000, [0, 1500, 5000]],
      ['decay', 'decayMs', 10000, [0, 2000, 10000]],
    ] as const) {
      const range = screen.getByRole('slider', { name: `Slow-mo ${name}` })
      expect(range).toHaveAttribute('min', '0')
      expect(range).toHaveAttribute('max', String(max))
      expect(range).toHaveAttribute('step', '1')
      expect(screen.getByText(`${name} ms`)).toBeInTheDocument()
      for (const value of values) {
        fireEvent.change(range, { target: { value } })
        settings = { ...settings, persistence: { ...settings.persistence!, [field]: value } }
        expect(onChange).toHaveBeenLastCalledWith(settings)
        rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
        expect(range).toHaveValue(String(value))
        expect(range).toHaveAttribute('aria-valuetext', String(value))
        expect(within(range.closest('[data-deck="slider"]')!).getByText(String(value), { exact: true })).toBeInTheDocument()
      }
    }
    expect(active).toEqual(before)
  })

  it.each(['clock', 'hold', 'blend', 'eased'] as const)('enables stagger only in the blend family: %s', (inBetween) => {
    render(<SlowMoLab {...props({ draft: { ...defaults, inBetween } })} />)
    for (const control of [screen.getByRole('button', { name: 'Slow-mo stagger' }), screen.getByRole('slider', { name: 'Slow-mo stagger width' })]) {
      if (inBetween === 'clock') expect(control).toBeDisabled()
      else expect(control).toBeEnabled()
    }
  })

  it('changes shapes and width boundaries without mutating or losing other settings', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const before = structuredClone(active)
    let settings = active
    const { rerender } = render(<SlowMoLab {...props({ draft: settings, onChange })} />)
    const range = screen.getByRole('slider', { name: 'Slow-mo stagger width' })
    expect(range).toHaveAttribute('min', '0')
    expect(range).toHaveAttribute('max', '0.9')
    expect(range).toHaveAttribute('step', '0.01')
    for (const shape of ['sweep', 'radial', 'scatter'] as const) {
      const label = shape[0].toUpperCase() + shape.slice(1)
      await select(user, 'stagger', label)
      settings = { ...settings, stagger: { ...settings.stagger, shape } }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo stagger' })).toHaveTextContent(label)
    }
    for (const width of [0, 0.5, 0.9]) {
      fireEvent.change(range, { target: { value: width } })
      settings = { ...settings, stagger: { ...settings.stagger, width } }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
      expect(range).toHaveValue(String(width))
      expect(range).toHaveAttribute('aria-valuetext', width === 0 ? 'Off' : width.toFixed(2))
    }
    expect(onChange).toHaveBeenCalledTimes(6)
    expect(active).toEqual(before)
  })

  it('retains the complete draft through Clock and Off', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    let settings: SlowMoDraft = active
    const { rerender } = render(<SlowMoLab {...props({ draft: settings, onChange })} />)
    for (const inBetween of ['clock', 'blend'] as const) {
      await select(user, 'method', inBetween === 'clock' ? 'Clock' : 'Blend')
      settings = { ...active, inBetween }
      expect(onChange).toHaveBeenLastCalledWith(settings)
      rerender(<SlowMoLab {...props({ draft: settings, onChange })} />)
      expect(screen.getByRole('button', { name: 'Slow-mo stagger' })).toHaveTextContent('Scatter')
      expect(screen.getByRole('slider', { name: 'Slow-mo stagger width' })).toHaveValue('0.7')
    }
    await select(user, 'method', 'Off')
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, inBetween: 'off' })
    rerender(<SlowMoLab {...props({ draft: { ...settings, inBetween: 'off' }, onChange })} />)
    await select(user, 'method', 'Blend')
    expect(onChange).toHaveBeenLastCalledWith({ ...settings, inBetween: 'blend' })
  })

  it('portals stagger selection and returns focus on Escape', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<SlowMoLab {...props({ draft: defaults, onChange })} />)
    const trigger = screen.getByRole('button', { name: 'Slow-mo stagger' })
    trigger.focus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('listbox', { name: 'Slow-mo stagger' }).parentElement).toBe(document.body)
    expect(screen.getByRole('option', { name: 'Sweep' })).toHaveFocus()
    await user.keyboard('{End}{Enter}')
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ ...defaults, stagger: { ...defaults.stagger, shape: 'scatter' } })
    trigger.focus()
    await user.keyboard('{ArrowDown}{Escape}')
    expect(trigger).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
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
    render(<SlowMoLab {...props({ draft: active, onChange })} />)
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
