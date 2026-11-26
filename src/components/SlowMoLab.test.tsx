import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, vi } from 'vitest'
import { SlowMoLab, type SlowMoLabProps } from './SlowMoLab'

const props = (overrides: Partial<SlowMoLabProps> = {}): SlowMoLabProps => ({
  slowMo: 0,
  dreamy: 0,
  onSlowMoChange: vi.fn(),
  onDreamyChange: vi.fn(),
  declined: null,
  expanded: false,
  onExpandedChange: vi.fn(),
  ...overrides,
})
afterEach(cleanup)

it('shows Wrappers with preview only tag and only slow-mo and dreamy when expanded', () => {
  render(<SlowMoLab {...props({ expanded: true })} />)
  const section = within(screen.getByRole('region', { name: 'Wrappers' }))
  expect(section.getByText('preview only')).toBeInTheDocument()
  expect(section.getAllByRole('slider')).toHaveLength(2)
  expect(section.getByRole('slider', { name: 'Slow-mo' })).toHaveValue('0')
  expect(section.getByRole('slider', { name: 'Slow-mo' })).toHaveAttribute('aria-valuetext', 'off')
  expect(section.getByRole('slider', { name: 'Dreamy' })).toHaveValue('0')
  expect(section.getByRole('slider', { name: 'Dreamy' })).toHaveAttribute('aria-valuetext', '0%')
  expect(section.queryByRole('combobox')).not.toBeInTheDocument()
  expect(section.queryByText('array words')).not.toBeInTheDocument()
  expect(section.queryByRole('button', { name: 'Copy generated code' })).not.toBeInTheDocument()
})

it('collapses to a live summary with preview only tag and no controls', () => {
  const view = render(<SlowMoLab {...props({ slowMo: 0.5, dreamy: 0.3 })} />)
  const section = screen.getByRole('region', { name: 'Wrappers' })
  expect(within(section).getByText('preview only')).toBeInTheDocument()
  expect(within(section).queryAllByRole('slider')).toHaveLength(0)
  expect(section.querySelector('.panel-section-body')).toHaveAttribute('hidden')
  const summary = within(section).getByTestId('deck-section-summary')
  expect(summary).toHaveTextContent('slow-mo1/4×·dreamy30%')
  expect(summary.querySelectorAll('.panel-readout-item')).toHaveLength(2)
  view.rerender(<SlowMoLab {...props({ slowMo: 0, dreamy: 1 })} />)
  expect(summary).toHaveTextContent('slow-mooff·dreamy100%')
  view.rerender(<SlowMoLab {...props({ slowMo: 0.14, dreamy: 0 })} />)
  expect(summary).toHaveTextContent('slow-mo1/1.5×·dreamy0%')
})

it('updates the sliders independently and delegates collapse', () => {
  const onSlowMoChange = vi.fn()
  const onDreamyChange = vi.fn()
  const onExpandedChange = vi.fn()
  render(<SlowMoLab {...props({ slowMo: 0.5, dreamy: 0.3, expanded: true, onSlowMoChange, onDreamyChange, onExpandedChange })} />)
  const slowMo = screen.getByRole('slider', { name: 'Slow-mo' })
  expect(slowMo).toHaveAttribute('aria-valuetext', '1/4×')
  fireEvent.change(slowMo, { target: { value: '0.75' } })
  expect(onSlowMoChange).toHaveBeenLastCalledWith(0.75)
  expect(onDreamyChange).not.toHaveBeenCalled()
  fireEvent.change(screen.getByRole('slider', { name: 'Dreamy' }), { target: { value: '1' } })
  expect(onDreamyChange).toHaveBeenLastCalledWith(1)
  fireEvent.click(screen.getByRole('button', { name: 'Wrappers' }))
  expect(onExpandedChange).toHaveBeenCalledExactlyOnceWith(false)
})

it('keeps refusal visible collapsed and expanded without a Copy action', () => {
  const view = render(<SlowMoLab {...props({ declined: { reason: 'shadowed-builtin', message: 'Shadowed builtin refused.' } })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Shadowed builtin refused.')
  view.rerender(<SlowMoLab {...props({ expanded: true, declined: { reason: 'shadowed-builtin', message: 'Shadowed builtin refused.' } })} />)
  expect(screen.getByRole('status')).toHaveTextContent('Shadowed builtin refused.')
  expect(screen.queryByRole('button', { name: 'Copy generated code' })).not.toBeInTheDocument()
})
