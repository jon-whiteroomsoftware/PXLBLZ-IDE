import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHOW_TIMELINE_HEIGHT_STORAGE_KEY } from '@/engine/showWorkspaceLayout'
import { ShowWorkspace } from './ShowWorkspace'

let resizeObserverCallback: ResizeObserverCallback | null = null

beforeEach(() => {
  window.localStorage.clear()
  resizeObserverCallback = null
  vi.stubGlobal('ResizeObserver', class {
    constructor(callback: ResizeObserverCallback) { resizeObserverCallback = callback }
    observe() {}
    disconnect() {}
  })
})

function resizeWorkspace(width: number, height: number) {
  act(() => resizeObserverCallback?.([{
    contentRect: { width, height },
  } as ResizeObserverEntry], {} as ResizeObserver))
}

describe('ShowWorkspace (#967)', () => {
  it('keeps automatic content fitting unremembered through resize and lane changes (#977)', () => {
    const view = render(<ShowWorkspace previewAspect={1} timelineContentHeight={290} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(1200, 800)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '302px' })
    resizeWorkspace(1200, 900)
    expect(screen.getByTestId('show-stage-strip')).toHaveStyle({ height: '592px' })
    view.rerender(<ShowWorkspace previewAspect={1} timelineContentHeight={470} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '482px' })
    expect(window.localStorage.getItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY)).toBeNull()
  })

  it('moves the horizontal divider by 10 px or 50 px and remembers the Show-mode split', () => {
    window.localStorage.setItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY, '416')
    const first = render(
      <ShowWorkspace previewAspect={1} timeline={<div>timeline</div>} stage={<div>stage</div>} />,
    )
    resizeWorkspace(900, 700)

    const divider = screen.getByRole('separator', { name: 'Resize timeline and Stage' })
    expect(divider).toHaveAttribute('aria-orientation', 'horizontal')
    expect(divider).toHaveAttribute('aria-valuenow', '416')

    fireEvent.keyDown(divider, { key: 'ArrowUp' })
    expect(divider).toHaveAttribute('aria-valuenow', '406')
    fireEvent.keyDown(divider, { key: 'ArrowDown', shiftKey: true })
    expect(divider).toHaveAttribute('aria-valuenow', '456')
    expect(window.localStorage.getItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY)).toBe('456')

    first.unmount()
    render(<ShowWorkspace previewAspect={1} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(900, 700)
    expect(screen.getByRole('separator', { name: 'Resize timeline and Stage' }))
      .toHaveAttribute('aria-valuenow', '456')
  })

  it('preserves a keyed position through content changes and temporary window clamps (#977)', () => {
    const view = render(<ShowWorkspace previewAspect={1} timelineContentHeight={290} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(1200, 800)
    fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowDown', shiftKey: true })
    view.rerender(<ShowWorkspace previewAspect={1} timelineContentHeight={470} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '352px' })
    resizeWorkspace(1200, 400)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '254px' })
    expect(window.localStorage.getItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY)).toBe('352')
    resizeWorkspace(1200, 800)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '352px' })
  })

  it('marks a divider stopped by the preview-controls width clamp', () => {
    render(<ShowWorkspace previewAspect={16 / 9} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(900, 700)

    const divider = screen.getByRole('separator', { name: 'Resize timeline and Stage' })
    fireEvent.keyDown(divider, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(divider, { key: 'ArrowUp', shiftKey: true })
    fireEvent.keyDown(divider, { key: 'ArrowUp', shiftKey: true })
    expect(divider).toHaveAttribute('data-clamp', 'controls-min')
    expect(screen.getByTestId('show-stage-strip')).toHaveStyle({ height: '393px' })
    expect(window.localStorage.getItem(SHOW_TIMELINE_HEIGHT_STORAGE_KEY)).toBe('301')
  })

  it('uses the timeline chrome measurement as the keyboard clamp', () => {
    render(
      <ShowWorkspace
        previewAspect={1}
        timelineMinimumHeight={271}
        timeline={<div>timeline</div>}
        stage={<div>stage</div>}
      />,
    )
    resizeWorkspace(900, 700)

    const divider = screen.getByRole('separator', { name: 'Resize timeline and Stage' })
    for (let step = 0; step < 10; step += 1) {
      fireEvent.keyDown(divider, { key: 'ArrowUp', shiftKey: true })
    }
    expect(divider).toHaveAttribute('aria-valuenow', '271')
    expect(divider).toHaveAttribute('data-clamp', 'timeline-min')
  })
})
