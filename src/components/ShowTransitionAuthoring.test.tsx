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

  it('applies a previewed candidate without restoring transport or repeating cleanup', () => {
    const show = createDefaultShow('show-transitions', 'Transitions', 1)
    useShowTransportStore.getState().openShow(show.id, 62_000)
    useShowTransportStore.getState().setPosition(show.id, 5_000)
    const clearPreview = vi.fn(useShowPreviewOverrideStore.getState().clear)
    useShowPreviewOverrideStore.setState({ clear: clearPreview })
    const onApply = vi.fn()
    const onClose = vi.fn()
    const { unmount } = render(
      <ShowTransitionPalette
        show={show}
        transitionId={show.transitions![0].id}
        stageDimensions={2}
        onApply={onApply}
        onClose={onClose}
      />,
    )
    const crossfade = screen.getByRole('button', { name: 'Use Crossfade Transition' })

    fireEvent.pointerEnter(crossfade)
    const previewedTransition = useShowPreviewOverrideStore.getState().show?.transitions?.[0]
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(31_000)

    fireEvent.click(crossfade)
    expect(onApply).toHaveBeenCalledWith(previewedTransition)
    expect(onApply.mock.calls[0]?.[0]).toBe(previewedTransition)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(clearPreview).toHaveBeenCalledTimes(1)
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(31_000)

    unmount()
    expect(clearPreview).toHaveBeenCalledTimes(1)
    expect(useShowTransportStore.getState().seekRequest?.targetMs).toBe(31_000)
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
    expect(within(controls).getByRole('spinbutton', { name: 'Points' })).toHaveClass('h-5', 'px-[5px]')
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

    const duration = screen.getByRole('spinbutton', { name: 'Duration (s)' })
    await user.click(duration)
    await user.clear(duration)
    expect(duration).toHaveValue(null)
    expect(onChange).not.toHaveBeenCalled()

    await user.type(duration, '2.5')
    expect(onChange).not.toHaveBeenCalled()

    await user.tab()
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith('durationMs', 2500)
  })

  it('presents explicitly classified transition fractions as percentages while preserving real units', async () => {
    const user = userEvent.setup()
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const split = catalogue.find((item) => item.key === 'transition:wipe:split')!
    const base = createDefaultShow('show-percent-transition', 'Percent Transition', 1)
    const show = replaceShowBoundaryTransition(base, base.transitions![0].id, split)
    const onChange = vi.fn()
    render(<ShowTransitionParameters transition={show.transitions![0]} item={split} onChange={onChange} />)

    const feather = screen.getByRole('textbox', { name: 'Feather exact percentage' })
    expect(feather).toHaveValue('0%')
    await user.clear(feather)
    await user.type(feather, '12.5%')
    await user.tab()

    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('feather', 0.125)
  })

  it('reverts the draft on Escape without committing the abandoned edit', async () => {
    const user = userEvent.setup()
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const crossfade = catalogue.find((item) => item.key === 'transition:blend:crossfade')!
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const show = replaceShowBoundaryTransition(base, base.transitions![0].id, crossfade)
    const onChange = vi.fn()
    render(<ShowTransitionParameters transition={show.transitions![0]} item={crossfade} onChange={onChange} />)

    const duration = screen.getByRole('spinbutton', { name: 'Duration (s)' })
    await user.click(duration)
    await user.clear(duration)
    await user.type(duration, '9.9')
    await user.keyboard('{Escape}')

    expect(onChange).not.toHaveBeenCalled()
    expect(duration).toHaveValue(2)
  })

  it('authors Fade through color with the shared Color field and one picker commit (#609)', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const fade = catalogue.find((item) => item.key === 'transition:fade:through-color')!
    const base = createDefaultShow('show-fade-color', 'Fade color', 1)
    const show = replaceShowBoundaryTransition(base, base.transitions![0].id, fade)
    const onChange = vi.fn()
    const onPreview = vi.fn()
    const onPreviewEnd = vi.fn()
    render(<ShowTransitionParameters transition={show.transitions![0]} item={fade} onPreview={onPreview} onPreviewEnd={onPreviewEnd} onChange={onChange} />)

    expect(screen.getByRole('textbox', { name: 'Color exact value' })).toHaveValue('#000000')
    const picker = screen.getByLabelText('Color picker')
    fireEvent.input(picker, { target: { value: '#112233' } })
    fireEvent.input(picker, { target: { value: '#445566' } })
    expect(onPreview.mock.calls).toEqual([['color', '#112233'], ['color', '#445566']])
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.change(picker, { target: { value: '#445566' } })
    expect(onPreviewEnd).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledOnce()
    expect(onChange).toHaveBeenCalledWith('color', '#445566')
  })
})
