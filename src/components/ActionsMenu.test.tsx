import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CopyPlus } from 'lucide-react'
import { ActionsMenu } from './ActionsMenu'

describe('ActionsMenu portaled placement', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('keeps a portaled menu left-aligned to its trigger by default (Show actions, #1265)', async () => {
    render(
      <ActionsMenu
        label="Show actions"
        portaled
        items={[{ label: 'Duplicate show', icon: <CopyPlus aria-hidden />, onSelect: vi.fn() }]}
      />,
    )
    const trigger = screen.getByRole('button', { name: 'Show actions' })
    const original = HTMLElement.prototype.getBoundingClientRect
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this === trigger) return rect({ left: 400, top: 40, width: 28, height: 24 })
      if (this.getAttribute('role') === 'menu') return rect({ left: 0, top: 0, width: 208, height: 60 })
      return original.call(this)
    })
    const previous = { width: window.innerWidth, height: window.innerHeight }
    Object.assign(window, { innerWidth: 1000, innerHeight: 720 })
    try {
      fireEvent.click(trigger)

      const menu = screen.getByRole('menu', { name: 'Show actions' })
      await waitFor(() => expect(menu.style.visibility).toBe('visible'))
      expect(menu.style.left).toBe('400px')
    } finally {
      Object.assign(window, { innerWidth: previous.width, innerHeight: previous.height })
    }
  })
})

function rect({ left, top, width, height }: { left: number; top: number; width: number; height: number }): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) } as DOMRect
}
