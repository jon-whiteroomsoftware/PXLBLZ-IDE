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

  it('uses the approved unenclosed Gallery language', () => {
    render(<GalleryPage />)

    const notice = screen.getByTestId('studio-coming-soon-banner')
    expect(notice).not.toHaveClass('rounded-lg', 'border', 'bg-live/[0.06]')

    for (const field of [
      screen.getByLabelText('Directory filter'),
      screen.getByLabelText('Search patterns'),
    ]) {
      expect(field.closest('label')).toHaveClass('border-b', 'rounded-none')
      expect(field.closest('label')).not.toHaveClass('border', 'rounded-md')
    }

    const card = screen.getByRole('button', { name: /IridescentFibers/ })
    expect(card).not.toHaveClass('overflow-hidden', 'rounded-lg', 'border', 'bg-panel')
    expect(card.firstElementChild).toHaveClass('aspect-square', 'overflow-hidden', 'rounded-[4px]')
    expect(card.querySelector('[data-pattern-dimension]')).not.toHaveClass('border', 'rounded')
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
