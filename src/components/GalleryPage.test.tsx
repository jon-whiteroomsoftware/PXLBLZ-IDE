import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
