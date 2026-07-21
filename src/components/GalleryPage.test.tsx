import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GalleryPage } from './GalleryPage'
import { routerInitialState, useRouterStore } from '@/store/routerStore'

beforeEach(() => {
  window.history.replaceState(null, '', '/gallery')
  useRouterStore.setState(routerInitialState)
  vi.restoreAllMocks()
})

describe('Studio coming-soon notice', () => {
  it('shows the Studio coming-soon banner to every visitor', () => {
    render(<GalleryPage />)

    expect(screen.getByTestId('studio-coming-soon-banner')).toHaveTextContent(/Studio opens soon/i)
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
