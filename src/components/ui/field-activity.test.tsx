import { TimeField } from "./time-field"

import { NumberField } from './number-field'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { DraftTextField } from './draft-text-field'
import { createFieldActivityScope, FieldActivityContext } from './field-activity'

it('binds an existing dirty draft synchronously and releases only after manual adoption', () => {
  const scope = createFieldActivityScope()
  const events: string[] = []
  render(<FieldActivityContext.Provider value={scope}><DraftTextField ariaLabel="Name" value="Before" onApply={() => { events.push('manual') }} /></FieldActivityContext.Provider>)
  const input = screen.getByRole('textbox', { name: 'Name' })
  fireEvent.focus(input)
  const acquire = vi.fn(() => { events.push('active'); return () => { events.push('released') } })
  const unbind = scope.bind(acquire)
  expect(events).toEqual([])
  fireEvent.change(input, { target: { value: 'After' } })
  expect(events).toEqual(['active'])
  unbind()
  events.length = 0
  scope.bind(acquire)
  expect(events).toEqual(['active'])
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(events).toEqual(['active', 'manual', 'released'])
})

it('keeps overlapping numeric and text drafts through invalid/rejected input and cancellation', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  render(<FieldActivityContext.Provider value={scope}>
    <DraftTextField ariaLabel="Name" value="Before" onApply={() => false} />
    <NumberField label="Count" value={2} onChange={() => { expect(active).toBe(1) }} />
  </FieldActivityContext.Provider>)
  const name = screen.getByRole('textbox', { name: 'Name' })
  const count = screen.getByRole('textbox', { name: 'Count' })
  fireEvent.change(name, { target: { value: 'After' } })
  fireEvent.change(count, { target: { value: '-' } })
  expect(active).toBe(2)
  fireEvent.keyDown(name, { key: 'Enter' })
  fireEvent.keyDown(count, { key: 'Enter' })
  expect(active).toBe(2)
  fireEvent.keyDown(name, { key: 'Escape' })
  expect(active).toBe(1)
  fireEvent.change(count, { target: { value: '3' } })
  fireEvent.keyDown(count, { key: 'Enter' })
  expect(active).toBe(0)
})

it('owns portalled keyboard slider drafts through preview end and authoritative commit', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  render(<FieldActivityContext.Provider value={scope}><TimeField label="Duration" value={2} min={0} max={10} step={0.1}
    onPreviewEnd={() => expect(active).toBe(1)} onChange={() => { expect(active).toBe(1) }} /></FieldActivityContext.Provider>)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Adjust with time slider' }), { key: 'Enter' })
  expect(active).toBe(0)
  const slider = screen.getByRole('slider')
  fireEvent.keyDown(slider, { key: 'ArrowRight' })
  expect(active).toBe(1)
  fireEvent.keyDown(slider, { key: 'Enter' })
  expect(active).toBe(0)
})

it.each(['Enter', 'Escape', 'blur', 'apply'] as const)('settles exact numeric drafts through %s with callback ordering', action => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn(() => { expect(active).toBe(1); return false })
  const mounted = render(<FieldActivityContext.Provider value={scope}><TimeField label="Duration" value={2} min={0} max={10} step={0.1} onChange={change} /></FieldActivityContext.Provider>)
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: '3' } })
  expect(active).toBe(1)
  if (action === 'apply') fireEvent.click(screen.getByRole('button', { name: 'Apply Duration' }))
  else if (action === 'blur') fireEvent.blur(input)
  else fireEvent.keyDown(input, { key: action })
  expect(active).toBe(0)
  expect(input).toHaveValue('2')
  expect(change).toHaveBeenCalledTimes(action === 'Enter' || action === 'apply' ? 1 : 0)
  fireEvent.change(input, { target: { value: '-' } })
  expect(active).toBe(1)
  mounted.unmount()
  expect(active).toBe(0)
})

it.each(['pointerUp', 'pointerCancel', 'lostPointerCapture'] as const)('releases captured slider activity on %s', ending => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn(() => { expect(active).toBe(1) })
  render(<FieldActivityContext.Provider value={scope}><TimeField label="Duration" value={2} min={0} max={10} step={0.1} onChange={change} /></FieldActivityContext.Provider>)
  const handle = screen.getByRole('button', { name: 'Adjust with time slider' })
  handle.setPointerCapture = vi.fn()
  handle.releasePointerCapture = vi.fn()
  fireEvent.pointerDown(handle, { pointerId: 1, clientX: 10 })
  expect(active).toBe(1)
  fireEvent.pointerMove(handle, { pointerId: 1, clientX: 60 })
  fireEvent[ending](handle, { pointerId: 1, clientX: 60 })
  expect(active).toBe(0)
  expect(change).toHaveBeenCalledTimes(ending === 'pointerUp' ? 1 : 0)
})

it('cleans up a numeric authoring exception after its draft has settled', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const errors: string[] = []
  const intercept = (event: ErrorEvent) => { errors.push(event.message); event.preventDefault() }
  window.addEventListener('error', intercept)
  try {
    render(<FieldActivityContext.Provider value={scope}><TimeField label="Duration" value={2} min={0} max={10} step={0.1} onChange={() => { throw new Error('authoring failed') }} /></FieldActivityContext.Provider>)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: '3' } })
    expect(active).toBe(1)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(active).toBe(0)
    expect(errors).toEqual(['authoring failed'])
  } finally { window.removeEventListener('error', intercept) }
})

it('releases a numeric no-op without a callback and excludes disabled controls', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn()
  const view = (disabled: boolean) => <FieldActivityContext.Provider value={scope}><TimeField label="Duration" value={2} min={0} max={10} step={0.1} onChange={change} disabled={disabled} /></FieldActivityContext.Provider>
  const mounted = render(view(false))
  const input = screen.getByRole('textbox')
  fireEvent.change(input, { target: { value: '2.0' } })
  expect(active).toBe(1)
  fireEvent.keyDown(input, { key: 'Enter' })
  expect(active).toBe(0)
  expect(change).not.toHaveBeenCalled()
  fireEvent.change(input, { target: { value: '3' } })
  mounted.rerender(view(true))
  expect(active).toBe(0)
})

it.each(['pointerCancel', 'lostPointerCapture'] as const)('cancels a portalled range gesture on %s', ending => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const change = vi.fn()
  render(<FieldActivityContext.Provider value={scope}><TimeField label="Duration" value={2} min={0} max={10} step={0.1} onChange={change} /></FieldActivityContext.Provider>)
  fireEvent.keyDown(screen.getByRole('button', { name: 'Adjust with time slider' }), { key: 'Enter' })
  const slider = screen.getByRole('slider')
  slider.setPointerCapture = vi.fn()
  fireEvent.pointerDown(slider, { pointerId: 2 })
  expect(active).toBe(1)
  fireEvent.input(slider, { target: { value: '500' } })
  fireEvent[ending](slider, { pointerId: 2 })
  expect(active).toBe(0)
  expect(change).not.toHaveBeenCalled()
})

it('retains a text draft and ownership when its apply callback throws, until cancel', () => {
  const scope = createFieldActivityScope()
  let active = 0
  scope.bind(() => { active++; return () => { active-- } })
  const intercept = (event: ErrorEvent) => event.preventDefault()
  window.addEventListener('error', intercept)
  try {
    render(<FieldActivityContext.Provider value={scope}><DraftTextField ariaLabel="Name" value="Before" onApply={() => { throw new Error('authoring failed') }} /></FieldActivityContext.Provider>)
    const input = screen.getByRole('textbox')
    fireEvent.change(input, { target: { value: 'After' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('After')
    expect(active).toBe(1)
    fireEvent.keyDown(input, { key: 'Escape' })
    expect(input).toHaveValue('Before')
    expect(active).toBe(0)
  } finally { window.removeEventListener('error', intercept) }
})
