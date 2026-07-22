import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShowEditorOverhaulPrototype } from './ShowEditorOverhaulPrototype'

function clickClip(name: string) {
  const clip = screen.getByRole('button', { name })
  fireEvent.pointerDown(clip, { clientX: 100, clientY: 100 })
  fireEvent.pointerUp(window, { clientX: 100, clientY: 100 })
}

describe('ShowEditorOverhaulPrototype details', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/?prototype=show-overhaul&fixture=topology&variant=working')
  })

  it('closes an open clip details panel when its selected clip is clicked again', () => {
    render(<ShowEditorOverhaulPrototype />)

    clickClip('Rings')
    expect(screen.getByLabelText('Entity Details · Rings')).toBeInTheDocument()

    clickClip('Rings')
    expect(screen.queryByLabelText('Entity Details · Rings')).not.toBeInTheDocument()
  })

  it('closes open details when the timeline background is clicked', () => {
    render(<ShowEditorOverhaulPrototype />)

    clickClip('Rings')
    expect(screen.getByLabelText('Entity Details · Rings')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByTestId('show-timeline-surface'))

    expect(screen.queryByLabelText('Entity Details · Rings')).not.toBeInTheDocument()
  })

  it('closes open details when a Zone header is clicked', () => {
    render(<ShowEditorOverhaulPrototype />)

    clickClip('Rings')
    expect(screen.getByLabelText('Entity Details · Rings')).toBeInTheDocument()

    const zoneHeader = screen.getByRole('button', { name: 'Collapse North west' })
    fireEvent.pointerDown(zoneHeader)
    fireEvent.click(zoneHeader)

    expect(screen.queryByLabelText('Entity Details · Rings')).not.toBeInTheDocument()
  })

  it('restores clip details after a drag gesture finishes', () => {
    render(<ShowEditorOverhaulPrototype />)

    clickClip('Rings')
    const clip = screen.getByRole('button', { name: 'Rings' })
    fireEvent.pointerDown(clip, { clientX: 100, clientY: 100 })
    fireEvent.pointerMove(window, { clientX: 110, clientY: 100 })
    expect(screen.queryByLabelText('Entity Details · Rings')).not.toBeInTheDocument()

    fireEvent.pointerUp(window, { clientX: 110, clientY: 100 })

    expect(screen.getByLabelText('Entity Details · Rings')).toBeInTheDocument()
  })

  it('keeps an applied Effects summary visible while the Effects catalogue is open', () => {
    render(<ShowEditorOverhaulPrototype />)

    clickClip('Rings')
    const details = screen.getByLabelText('Entity Details · Rings')
    expect(within(details).getByText('Glow')).toBeInTheDocument()
    expect(within(details).getByText('Stutter')).toBeInTheDocument()

    const addEffect = within(details).getByRole('button', { name: 'Add Effect' })
    fireEvent.pointerDown(addEffect)
    fireEvent.click(addEffect)

    expect(screen.getByRole('dialog', { name: 'Add Effect' })).toBeInTheDocument()
    expect(screen.getByLabelText('Entity Details · Rings')).toBeInTheDocument()
  })

  it('adds a chosen Effect to the compact summary and closes the catalogue', () => {
    render(<ShowEditorOverhaulPrototype />)

    clickClip('Rings')
    const details = screen.getByLabelText('Entity Details · Rings')
    const addEffect = within(details).getByRole('button', { name: 'Add Effect' })
    fireEvent.pointerDown(addEffect)
    fireEvent.click(addEffect)
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Add Ripple Effect' }))
    fireEvent.click(screen.getByRole('button', { name: 'Add Ripple Effect' }))

    expect(screen.queryByRole('dialog', { name: 'Add Effect' })).not.toBeInTheDocument()
    expect(within(screen.getByLabelText('Entity Details · Rings')).getByText('Ripple')).toBeInTheDocument()
  })
})
