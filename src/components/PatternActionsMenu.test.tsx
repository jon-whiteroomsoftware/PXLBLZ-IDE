import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PatternActionsMenu } from './PatternActionsMenu'

describe('PatternActionsMenu', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps secondary actions in a labeled overflow menu', () => {
    const onCopy = vi.fn()
    const onDownload = vi.fn()
    const onDelete = vi.fn()
    render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        onCopy={onCopy}
        onDownload={onDownload}
        onDelete={onDelete}
      />,
    )

    expect(screen.queryByRole('menuitem', { name: 'Copy code' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))

    expect(screen.getByRole('menuitem', { name: 'Copy code' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Download .epe' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Delete pattern' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('menuitem', { name: 'Copy code' }))
    expect(onCopy).toHaveBeenCalledOnce()
    expect(screen.queryByRole('menuitem', { name: 'Copy code' })).not.toBeInTheDocument()
  })

  it('shows the applicable built-in Pattern actions', () => {
    render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        onViewInGallery={vi.fn()}
        onClone={vi.fn()}
      />,
    )

    fireEvent.click(screen.getByRole('button', { name: 'Pattern actions' }))
    expect(screen.getByRole('menuitem', { name: 'View in Gallery' })).toBeInTheDocument()
    expect(screen.getByRole('menuitem', { name: 'Clone into Patterns' })).toBeInTheDocument()
  })

  it('portals the open menu above the page, right-aligned to its trigger (#1265)', async () => {
    const { container } = render(
      <PatternActionsMenu
        copied={false}
        compileBroken={false}
        onCopy={vi.fn()}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Pattern actions' })
    stubRect(trigger, { left: 900, top: 40, width: 28, height: 24 })
    stubMenuRect({ width: 208, height: 100 })
    const restoreViewport = stubViewport(1000, 720)
    try {
      fireEvent.click(trigger)

      const menu = screen.getByRole('menu', { name: 'Pattern actions' })
      expect(container.contains(menu)).toBe(false)
      expect(menu.parentElement).toBe(document.body)
      await waitFor(() => expect(menu.style.visibility).toBe('visible'))
      expect(menu.style.position).toBe('fixed')
      expect(menu.style.zIndex).toBe('50')
      expect(menu.style.left).toBe('720px')
      expect(menu.style.top).toBe('68px')
    } finally {
      restoreViewport()
    }
  })
})

function stubRect(element: Element, rect: { left: number; top: number; width: number; height: number }) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(domRect(rect))
}

function stubMenuRect(size: { width: number; height: number }) {
  const original = HTMLElement.prototype.getBoundingClientRect
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    return this.getAttribute('role') === 'menu' ? domRect({ left: 0, top: 0, ...size }) : original.call(this)
  })
}

function stubViewport(width: number, height: number) {
  const previous = { width: window.innerWidth, height: window.innerHeight }
  Object.assign(window, { innerWidth: width, innerHeight: height })
  return () => Object.assign(window, { innerWidth: previous.width, innerHeight: previous.height })
}

function domRect({ left, top, width, height }: { left: number; top: number; width: number; height: number }): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}
