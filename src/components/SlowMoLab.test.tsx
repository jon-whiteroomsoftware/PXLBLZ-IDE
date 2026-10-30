import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { SlowMoLab, type SlowMoLabProps } from './SlowMoLab'

const props = (overrides: Partial<SlowMoLabProps> = {}): SlowMoLabProps => ({
  draft: { position: 1, dreamy: 0 }, onChange: vi.fn(), declined: null,
  expanded: false, onExpandedChange: vi.fn(), ...overrides,
})
afterEach(cleanup)

it.each([false, true])('shows only speed and dreamy when expanded=%s', expanded => {
  render(<SlowMoLab {...props({ expanded })} />)
  const section = within(screen.getByRole('region', { name: 'Slow-Mo' }))
  expect(section.getAllByRole('slider')).toHaveLength(2)
  expect(section.getByRole('slider', { name: 'Slow-mo speed' })).toHaveValue('1')
  expect(section.getByRole('slider', { name: 'Slow-mo dreamy' })).toHaveValue('0')
  expect(section.queryByRole('combobox')).not.toBeInTheDocument()
  expect(section.queryByText('array words')).not.toBeInTheDocument()
  expect(section.queryByRole('button', { name: 'Copy generated code' }) !== null).toBe(expanded)
})
it('updates the sliders independently and delegates collapse', () => {
  const onChange = vi.fn(), onExpandedChange = vi.fn()
  render(<SlowMoLab {...props({ draft: { position: 0.5, dreamy: 0.3 }, onChange, onExpandedChange })} />)
  const speed = screen.getByRole('slider', { name: 'Slow-mo speed' })
  expect(speed).toHaveAttribute('aria-valuetext', '0.25×')
  fireEvent.change(speed, { target: { value: '0.75' } })
  expect(onChange).toHaveBeenLastCalledWith({ position: 0.75, dreamy: 0.3 })
  fireEvent.change(screen.getByRole('slider', { name: 'Slow-mo dreamy' }), { target: { value: '1' } })
  expect(onChange).toHaveBeenLastCalledWith({ position: 0.5, dreamy: 1 })
  fireEvent.click(screen.getByRole('button', { name: 'Slow-Mo' }))
  expect(onExpandedChange).toHaveBeenCalledExactlyOnceWith(true)
})
it('keeps refusal visible collapsed and enables Copy only with an artifact', () => {
  const onCopy = vi.fn()
  const view = render(<SlowMoLab {...props({ declined: { reason: 'palette-output', message: 'Palette output refused.' } })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Palette output refused.')
  view.rerender(<SlowMoLab {...props({ expanded: true })} />)
  expect(screen.getByRole('button', { name: 'Copy generated code' })).toBeDisabled()
  view.rerender(<SlowMoLab {...props({ expanded: true, onCopy })} />)
  fireEvent.click(screen.getByRole('button', { name: 'Copy generated code' }))
  expect(onCopy).toHaveBeenCalledOnce()
})
