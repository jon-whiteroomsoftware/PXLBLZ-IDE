import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createDefaultShow } from '@/engine/showModel'
import { replaceShowBoundaryTransition } from '@/engine/showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue } from '@/engine/showVisualToolkitPresentation'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { ShowTransitionPalette, ShowTransitionParameters } from './ShowTransitionAuthoring'

describe('Show Transition authoring UI', () => {
  beforeEach(() => {
    useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState)
    useShowTransportStore.setState(showTransportInitialState)
  })

  it('searches the compact registry, previews without writing, and applies once', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-transitions', 'Transitions', 1)
    const transition = show.transitions![0]
    useShowTransportStore.getState().openShow(show.id, 62_000)
    useShowTransportStore.getState().setPosition(show.id, 5_000)
    const onApply = vi.fn()
    const onClose = vi.fn()
    render(
      <ShowTransitionPalette
        show={show}
        transitionId={transition.id}
        stageDimensions={2}
        onApply={onApply}
        onClose={onClose}
      />,
    )

    expect(screen.getAllByRole('button', { name: /Use .* Transition/ })).toHaveLength(35)
    await user.type(screen.getByRole('searchbox', { name: 'Search Transitions' }), 'star')
    const star = screen.getByRole('button', { name: 'Use Star Transition' })
    expect(screen.getAllByRole('button', { name: /Use .* Transition/ })).toHaveLength(1)

    fireEvent.pointerEnter(star)
    expect(useShowPreviewOverrideStore.getState().show?.transitions?.[0]).toMatchObject({ kind: 'portal', shape: 'star' })
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(31_000)
    fireEvent.pointerLeave(star)
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(5_000)

    await user.click(star)
    expect(onApply).toHaveBeenCalledWith(expect.objectContaining({ kind: 'portal', shape: 'star' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
  })

  it('clears candidate preview and closes on Escape', () => {
    const show = createDefaultShow('show-transitions', 'Transitions', 1)
    const onClose = vi.fn()
    render(
      <ShowTransitionPalette
        show={show}
        transitionId={show.transitions![0].id}
        stageDimensions={2}
        onApply={vi.fn()}
        onClose={onClose}
      />,
    )
    fireEvent.focus(screen.getByRole('button', { name: 'Use Crossfade Transition' }))
    expect(useShowPreviewOverrideStore.getState().show).not.toBeNull()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('renders exact controls from the selected registry variant', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const star = catalogue.find((item) => item.key === 'transition:shape-reveal:star')!
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const show = replaceShowBoundaryTransition(base, base.transitions![0].id, star)
    const transition = show.transitions![0]
    const onChange = vi.fn()
    render(<ShowTransitionParameters transition={transition} item={star} onChange={onChange} />)

    const controls = screen.getByRole('group', { name: 'Star Transition parameters' })
    expect(within(controls).getByRole('spinbutton', { name: 'Points' })).toHaveValue(5)
    expect(within(controls).getByRole('combobox', { name: 'Reveal mode' })).toHaveValue('grow-incoming')
    const points = within(controls).getByRole('spinbutton', { name: 'Points' })
    fireEvent.change(points, { target: { value: '7' } })
    fireEvent.blur(points)
    expect(onChange).toHaveBeenCalledWith('starPoints', 7)
  })

  it('buffers numeric edits so deletion works and commit happens once on blur', async () => {
    const user = userEvent.setup()
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const crossfade = catalogue.find((item) => item.key === 'transition:blend:crossfade')!
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const show = replaceShowBoundaryTransition(base, base.transitions![0].id, crossfade)
    const transition = show.transitions![0]
    const onChange = vi.fn()
    render(<ShowTransitionParameters transition={transition} item={crossfade} onChange={onChange} />)

    const duration = screen.getByRole('spinbutton', { name: 'Duration (ms)' })
    await user.click(duration)
    await user.clear(duration)
    expect(duration).toHaveValue(null)
    expect(onChange).not.toHaveBeenCalled()

    await user.type(duration, '2500')
    expect(onChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('durationMs', 2500)
  })
})
