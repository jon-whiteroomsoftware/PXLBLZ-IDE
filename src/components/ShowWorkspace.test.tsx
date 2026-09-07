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
  it('moves the horizontal divider by 10 px or 50 px and remembers the Show-mode split', () => {
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
