import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GalleryPage } from './GalleryPage'
import { routerInitialState, useRouterStore } from '@/store/routerStore'

beforeEach(() => {
  window.history.replaceState(null, '', '/gallery')
  useRouterStore.setState(routerInitialState)
  vi.restoreAllMocks()
})

describe('Gallery presentation', () => {
  it('uses the approved unenclosed Gallery language', () => {
    render(<GalleryPage />)

    for (const field of [
      screen.getByLabelText('Directory filter'),
      screen.getByLabelText('Search patterns'),
    ]) {
      expect(field.closest('label')).toHaveClass('border-b', 'rounded-none')
      expect(field.closest('label')).not.toHaveClass('border', 'rounded-md')
    }

    // The card is the preview box itself: no enclosing panel, chrome overlaid.
    const card = screen.getByRole('button', { name: /IridescentFibers/ })
    expect(card).toHaveClass('aspect-square', 'overflow-hidden', 'rounded-[4px]')
    expect(card).not.toHaveClass('rounded-lg', 'border', 'bg-panel')
    expect(card.querySelector('[data-pattern-dimension]')).not.toHaveClass('border', 'rounded')
  })

  it('renders 1D Patterns as two-column strips', () => {
    render(<GalleryPage />)
    const strip = screen.getByRole('button', { name: /BubbleColumn/ })
    expect(strip).toHaveAttribute('data-gallery-strip', 'true')
    expect(strip).toHaveClass('md:col-span-2')
    expect(strip).not.toHaveClass('aspect-square')
    expect(screen.getByRole('button', { name: /IridescentFibers/ })).not.toHaveAttribute('data-gallery-strip')
    // Dense auto-placement backfills the cell a two-column strip cannot use.
    expect(screen.getByTestId('gallery-grid')).toHaveClass('grid-flow-dense')
  })
})

describe('Gallery density', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to three per row and remembers a chosen density', () => {
    const { unmount } = render(<GalleryPage />)
    expect(screen.getByTestId('gallery-grid')).toHaveAttribute('data-density', '3')
    expect(screen.getByRole('radio', { name: 'Medium cards, 3 per row' })).toBeChecked()

    fireEvent.click(screen.getByRole('radio', { name: 'Small cards, 4 per row' }))
    expect(screen.getByTestId('gallery-grid')).toHaveAttribute('data-density', '4')
    expect(screen.getByTestId('gallery-grid')).toHaveClass('md:grid-cols-4')
    expect(localStorage.getItem('pxlblz-gallery-density')).toBe('4')

    unmount()
    render(<GalleryPage />)
    expect(screen.getByTestId('gallery-grid')).toHaveAttribute('data-density', '4')
  })
})

describe('Gallery return anchors', () => {
  it('bookmarks the selected Pattern before opening its detail page', async () => {
    render(<GalleryPage />)

    fireEvent.click(screen.getByRole('button', { name: /IridescentFibers/ }))

    expect(window.location.pathname).toBe('/p/iridescent-fibers')
    window.history.back()
    await waitFor(() => expect(window.location.hash).toBe('#gallery-iridescent-fibers'))
  })

  it('restores a bookmarked Pattern card into view', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    })
    window.history.replaceState(null, '', '/gallery#gallery-iridescent-fibers')

    render(<GalleryPage />)

    const card = screen.getByRole('button', { name: /IridescentFibers/ })
    expect(card).toHaveAttribute('id', 'gallery-iridescent-fibers')
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' }))
  })
})

describe('Gallery Shows (#894)', () => {
  it('leads with the hero band, spreads the rest, and sizes each to its stage', () => {
    render(<GalleryPage />)
    const bands = screen.getAllByTestId('gallery-show-band')
    expect(bands).toHaveLength(4)
    const grid = screen.getByTestId('gallery-grid')
    expect(grid.firstElementChild).toBe(bands[0])
    expect(bands[0]).toHaveTextContent('Overture Installation')
    expect(within(bands[0]).getByRole('button', { name: /Overture Installation, a Show/ })).toHaveAttribute('id', 'show-overture-installation')
    // Bands are ordered and interleaved, not clustered.
    const children = [...grid.children]
    const bandIndexes = bands.map((band) => children.indexOf(band))
    expect(bandIndexes[1]).toBeGreaterThan(bandIndexes[0] + 1)
    expect(bandIndexes[2]).toBeGreaterThan(bandIndexes[1] + 1)
    // Caption is capped relative to its preview.
    const preview = within(bands[0]).getByRole('button') as HTMLElement
    const caption = bands[0].lastElementChild as HTMLElement
    expect(parseFloat(caption.style.maxWidth)).toBeLessThanOrEqual(parseFloat(preview.style.width) * 0.8 + 1)
  })

  it('hides bands under a Pattern directory, a dimension lens, or a search', () => {
    render(<GalleryPage directory={{ label: 'ZRanger1', slug: 'zranger1' }} />)
    expect(screen.queryAllByTestId('gallery-show-band')).toHaveLength(0)
  })

  it('lists only bands in the Shows directory, and honours lens and search there too', () => {
    render(<GalleryPage directory={{ label: 'Shows', slug: 'shows' }} />)
    expect(screen.getAllByTestId('gallery-show-band')).toHaveLength(4)
    expect(screen.queryByRole('button', { name: /IridescentFibers/ })).not.toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Search patterns'), { target: { value: 'x' } })
    expect(screen.queryAllByTestId('gallery-show-band')).toHaveLength(0)
    expect(screen.getByText('Shows are listed without a dimension or search filter.')).toBeInTheDocument()
  })

  it('keeps the spotlight while the band is focused after the pointer leaves', () => {
    render(<GalleryPage />)
    const grid = screen.getByTestId('gallery-grid')
    const band = screen.getAllByTestId('gallery-show-band')[0]
    fireEvent.focus(band)
    fireEvent.mouseEnter(band)
    fireEvent.mouseLeave(band)
    expect(grid).toHaveAttribute('data-spotlight')
    fireEvent.blur(band)
    expect(grid).not.toHaveAttribute('data-spotlight')
  })

  it('restores a bookmarked Show band into view', async () => {
    const scrollIntoView = vi.fn()
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: scrollIntoView })
    window.history.replaceState(null, '', '/gallery#show-quadrille')
    render(<GalleryPage />)
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' }))
  })

  it('dims everything else while a band is hovered or focused, and only for Shows', () => {
    render(<GalleryPage />)
    const grid = screen.getByTestId('gallery-grid')
    const bands = screen.getAllByTestId('gallery-show-band')
    expect(grid).not.toHaveAttribute('data-spotlight')
    fireEvent.mouseEnter(bands[1])
    expect(grid).toHaveAttribute('data-spotlight', 'stock-show-remix-quadrille')
    expect(bands[1]).toHaveAttribute('data-spotlit', 'true')
    expect(bands[0]).not.toHaveAttribute('data-spotlit')
    fireEvent.mouseLeave(bands[1])
    expect(grid).not.toHaveAttribute('data-spotlight')
    fireEvent.mouseEnter(screen.getByRole('button', { name: /IridescentFibers/ }))
    expect(grid).not.toHaveAttribute('data-spotlight')
  })
})
