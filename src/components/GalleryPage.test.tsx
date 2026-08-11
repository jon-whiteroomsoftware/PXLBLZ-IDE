import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { GalleryPage } from './GalleryPage'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import { useWorkspaceStore, workspaceInitialState } from '@/store/workspaceStore'

beforeEach(() => {
  window.history.replaceState(null, '', '/gallery')
  useRouterStore.setState(routerInitialState)
  useWorkspaceStore.setState({
    ...workspaceInitialState,
    personalWorkspaceAuthenticated: false,
    personalWorkspaceResolved: true,
  })
  vi.restoreAllMocks()
})

describe('Studio coming-soon notice', () => {
  it('shows the Studio coming-soon banner to resolved signed-out visitors', () => {
    render(<GalleryPage />)

    expect(screen.getByTestId('studio-coming-soon-banner')).toHaveTextContent(/Studio opens soon/i)
  })

  it('tracks the access gate from unresolved through signed-out and signed-in states', () => {
    useWorkspaceStore.setState({
      personalWorkspaceResolved: false,
      personalWorkspaceAuthenticated: false,
    })
    render(<GalleryPage />)
    expect(screen.queryByText(/Studio opens soon/i)).not.toBeInTheDocument()

    act(() => useWorkspaceStore.setState({ personalWorkspaceResolved: true }))
    expect(screen.getByText(/Studio opens soon/i)).toBeInTheDocument()

    act(() => useWorkspaceStore.setState({ personalWorkspaceAuthenticated: true }))
    expect(screen.queryByText(/Studio opens soon/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/sign-in is invite-only/i)).not.toBeInTheDocument()
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
