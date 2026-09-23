import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SHOW_TIMELINE_FRACTION_STORAGE_KEY, parseShowTimelineFraction, serializeShowTimelineFraction } from '@/engine/showWorkspaceLayout'
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

function seedTimelineFraction(pixels: number, workspaceHeight: number) {
  window.localStorage.setItem(
    SHOW_TIMELINE_FRACTION_STORAGE_KEY,
    serializeShowTimelineFraction(pixels / (workspaceHeight - 6)),
  )
}

function storedTimelineFraction() {
  return parseShowTimelineFraction(window.localStorage.getItem(SHOW_TIMELINE_FRACTION_STORAGE_KEY))
}

describe('ShowWorkspace (#967)', () => {
  it.each(['release', 'cancel', 'capture loss', 'window release', 'window blur', 'released buttons'])(
    'stops resizing after %s, even at a size limit (#63)', (ending) => {
      seedTimelineFraction(416, 700)
      render(<ShowWorkspace previewAspect={1} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
      resizeWorkspace(900, 700)
      const divider = screen.getByRole('separator')
      const pointer = { pointerId: 7, button: 0, buttons: 1, clientY: 400 }
      fireEvent.pointerDown(divider, pointer)
      fireEvent.pointerMove(divider, { ...pointer, clientY: 0 })
      expect(divider).toHaveAttribute('data-clamp', 'timeline-min')
      if (ending === 'release') fireEvent.pointerUp(divider, { ...pointer, buttons: 0 })
      if (ending === 'cancel') fireEvent.pointerCancel(divider, pointer)
      if (ending === 'capture loss') fireEvent.lostPointerCapture(divider, pointer)
      if (ending === 'window release') fireEvent.pointerUp(window, { ...pointer, buttons: 0 })
      if (ending === 'window blur') fireEvent.blur(window)
      if (ending === 'released buttons') fireEvent.pointerMove(divider, { ...pointer, buttons: 0, clientY: 100 })
      const stopped = divider.getAttribute('aria-valuenow')
      fireEvent.pointerMove(divider, { ...pointer, clientY: 120 })
      expect(divider).toHaveAttribute('aria-valuenow', stopped)
      // A fresh gesture works immediately and starts at the current split.
      fireEvent.pointerDown(divider, { ...pointer, clientY: 120 })
      fireEvent.pointerMove(divider, { ...pointer, clientY: 140 })
      expect(Number(divider.getAttribute('aria-valuenow'))).toBe(Number(stopped) + 20)
    },
  )

  it('retains every movement when pointer events arrive before a render (#63)', () => {
    seedTimelineFraction(416, 700)
    render(<ShowWorkspace previewAspect={1} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(900, 700)
    const divider = screen.getByRole('separator')
    fireEvent.pointerDown(divider, { pointerId: 7, button: 0, buttons: 1, clientY: 400 })
    act(() => {
      fireEvent.pointerMove(divider, { pointerId: 7, buttons: 1, clientY: 390 })
      fireEvent.pointerMove(divider, { pointerId: 7, buttons: 1, clientY: 370 })
    })
    expect(divider).toHaveAttribute('aria-valuenow', '386')
  })

  it('keeps automatic content fitting unremembered through resize and lane changes (#977)', () => {
    const view = render(<ShowWorkspace previewAspect={1} timelineContentHeight={290} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(1200, 800)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '302px' })
    resizeWorkspace(1200, 900)
    expect(screen.getByTestId('show-stage-strip')).toHaveStyle({ height: '592px' })
    view.rerender(<ShowWorkspace previewAspect={1} timelineContentHeight={470} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '447px' })
    expect(window.localStorage.getItem(SHOW_TIMELINE_FRACTION_STORAGE_KEY)).toBeNull()
  })

  it('does not write storage when the window resizes (#1085)', () => {
    const seeded = serializeShowTimelineFraction(416 / (700 - 6))
    window.localStorage.setItem(SHOW_TIMELINE_FRACTION_STORAGE_KEY, seeded)
    render(<ShowWorkspace previewAspect={1} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(900, 700)
    resizeWorkspace(1600, 900)
    resizeWorkspace(900, 700)
    expect(window.localStorage.getItem(SHOW_TIMELINE_FRACTION_STORAGE_KEY)).toBe(seeded)
  })

  it('moves the horizontal divider by 10 px or 50 px and remembers the Show-mode split', () => {
    seedTimelineFraction(416, 700)
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
    expect(storedTimelineFraction()).toBeCloseTo(456 / (700 - 6), 4)

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
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '175px' })
    expect(storedTimelineFraction()).toBeCloseTo(352 / (800 - 6), 4)
    resizeWorkspace(1200, 800)
    expect(screen.getByTestId('show-timeline-pane')).toHaveStyle({ height: '352px' })
  })

  it.each([false, true])('restores the visible remembered split after resize and remount (adjust at resized viewport: %s)', (adjustAfterResize) => {
    seedTimelineFraction(400, 800)
    const mount = () => render(<ShowWorkspace previewAspect={1} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    const height = () => Number(screen.getByRole('separator').getAttribute('aria-valuenow'))
    let view = mount()
    resizeWorkspace(2000, 800)
    resizeWorkspace(2000, 1200)
    if (adjustAfterResize) fireEvent.keyDown(screen.getByRole('separator'), { key: 'ArrowUp' })
    const beforeReload = height()
    view.unmount()
    view = mount()
    resizeWorkspace(2000, 1200)
    expect(height()).toBe(beforeReload)

    // Width changes no longer constrain the vertical split.
    resizeWorkspace(390, 1200)
    expect(screen.getByRole('separator')).toHaveAttribute('data-clamp', 'none')
    view.unmount()
    view = mount()
    resizeWorkspace(390, 1200)
    resizeWorkspace(2000, 1200)
    expect(height()).toBe(beforeReload)

    // The same applies when a shorter viewport temporarily reaches a height limit.
    resizeWorkspace(2000, 200)
    expect(screen.getByRole('separator')).not.toHaveAttribute('data-clamp', 'none')
    view.unmount()
    mount()
    resizeWorkspace(2000, 200)
    resizeWorkspace(2000, 1200)
    expect(Math.abs(height() - beforeReload)).toBeLessThanOrEqual(2)
  })

  it('lets a wide preview grow while its frame fits beside the controls', () => {
    seedTimelineFraction(300, 700)
    render(<ShowWorkspace previewAspect={16 / 9} timeline={<div>timeline</div>} stage={<div>stage</div>} />)
    resizeWorkspace(900, 700)
    const divider = screen.getByRole('separator')
    for (let step = 0; step < 3; step++) fireEvent.keyDown(divider, { key: 'ArrowUp', shiftKey: true })
    expect(divider).toHaveAttribute('data-clamp', 'none')
    expect(screen.getByTestId('show-stage-strip')).toHaveStyle({ height: '544px' })
    expect(storedTimelineFraction()).toBeCloseTo(150 / (700 - 6), 4)
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
