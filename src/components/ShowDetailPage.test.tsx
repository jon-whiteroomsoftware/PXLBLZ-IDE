import { render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ShowDetailPage } from './ShowDetailPage'
import { GALLERY_SHOWS, galleryShowChapters } from '@/engine/galleryShows'
import { routerInitialState, useRouterStore } from '@/store/routerStore'

const OVERTURE = GALLERY_SHOWS.find(show => show.slug === 'overture-installation')!

beforeEach(() => {
  window.history.replaceState(null, '', '/s/overture-installation')
  useRouterStore.setState(routerInitialState)
})

describe('Show detail reading card', () => {
  it('reads the arc as the Show chapters in projection order', () => {
    render(<ShowDetailPage show={OVERTURE} />)
    const chapters = galleryShowChapters(OVERTURE)
    expect(chapters.length).toBeGreaterThan(1)
    const items = within(screen.getByTestId('show-detail-chapters')).getAllByRole('listitem')
    expect(items).toHaveLength(chapters.length)
    items.forEach((item, index) => {
      expect(item).toHaveTextContent(chapters[index].name!)
      expect(item).toHaveTextContent(`${Math.round(chapters[index].durationMs / 1000)}s`)
    })
    expect(screen.getByRole('region', { name: 'Chapters' })).toBeInTheDocument()
  })

  it('states loop, Zones and track without a decorative Scene count', () => {
    const { container } = render(<ShowDetailPage show={OVERTURE} />)
    expect(container.textContent).not.toMatch(/\bscenes?\b/i)
    expect(container.textContent).toContain('zones')
    expect(container.textContent).toContain('s loop')
  })

  it('names the current chapter over the live preview', () => {
    render(<ShowDetailPage show={OVERTURE} />)
    expect(screen.getByTestId('gallery-live-chapter')).toBeInTheDocument()
  })
})
