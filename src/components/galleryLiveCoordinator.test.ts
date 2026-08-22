// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  GALLERY_LIVE_RERANK_DELAY_MS,
  configureGalleryLivePool,
  galleryCardWarmed,
  registerGalleryLiveCard,
  resetGalleryLiveCoordinator,
  type GalleryLiveMode,
} from './galleryLiveCoordinator'

function fakeCard(top: number, left = 0): HTMLElement {
  const element = document.createElement('div')
  element.getBoundingClientRect = () =>
    ({ top, left, width: 100, height: 100, right: left + 100, bottom: top + 100, x: left, y: top, toJSON() {} }) as DOMRect
  document.body.appendChild(element)
  return element
}

function register(id: string, top: number, wantsWarm = false) {
  const modes: GalleryLiveMode[] = []
  const element = fakeCard(top)
  const unregister = registerGalleryLiveCard(id, element, (mode) => modes.push(mode), wantsWarm)
  return { modes, element, unregister, current: () => modes[modes.length - 1] ?? 'frozen' }
}

function settle() {
  vi.advanceTimersByTime(GALLERY_LIVE_RERANK_DELAY_MS + 1)
}

describe('galleryLiveCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    Object.defineProperty(window, 'innerHeight', { value: 300, configurable: true })
  })
  afterEach(() => {
    resetGalleryLiveCoordinator()
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('grants live slots to the nearest on-screen cards after the debounce, not before', () => {
    configureGalleryLivePool({ poolSize: 2, keepMargin: 0 })
    const a = register('a', 0)
    const b = register('b', 120)
    const c = register('c', 240)
    const d = register('d', 400) // off-screen
    expect([a, b, c, d].map((x) => x.current())).toEqual(['frozen', 'frozen', 'frozen', 'frozen'])
    settle()
    expect([a, b, c, d].map((x) => x.current())).toEqual(['live', 'live', 'frozen', 'frozen'])
  })

  it('re-ranks on pointer movement and coalesces a burst into one re-rank', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    const a = register('a', 0)
    const b = register('b', 200)
    settle()
    expect(a.current()).toBe('live')
    for (let i = 0; i < 10; i++) {
      window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 250 + i, pointerType: 'mouse' }))
    }
    settle()
    expect(b.current()).toBe('live')
    expect(a.current()).toBe('frozen')
    // One transition each, despite ten events.
    expect(a.modes).toEqual(['live', 'frozen'])
    expect(b.modes).toEqual(['live'])
  })

  it('ignores touch pointer positions and keeps the top-of-viewport ordering', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    const a = register('a', 0)
    const b = register('b', 200)
    settle()
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 250, pointerType: 'touch' }))
    settle()
    expect(a.current()).toBe('live')
    expect(b.current()).toBe('frozen')
  })

  it('re-ranks on scroll using fresh measurements', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    const a = register('a', 0)
    const b = register('b', 200)
    settle()
    // Simulate scrolling a past the top and b to the top.
    a.element.getBoundingClientRect = () => ({ top: -200, left: 0, width: 100, height: 100 }) as DOMRect
    b.element.getBoundingClientRect = () => ({ top: 0, left: 0, width: 100, height: 100 }) as DOMRect
    window.dispatchEvent(new Event('scroll'))
    settle()
    expect(b.current()).toBe('live')
    expect(a.current()).toBe('frozen')
  })

  it('warms one poster-less frozen card at a time and releases it when warmed', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    const a = register('a', 0)
    const b = register('b', 120, true)
    const c = register('c', 240, true)
    settle()
    expect(a.current()).toBe('live')
    expect(b.current()).toBe('warm')
    expect(c.current()).toBe('frozen')
    galleryCardWarmed('b')
    expect(b.current()).toBe('frozen')
    settle()
    expect(c.current()).toBe('warm')
    galleryCardWarmed('c')
    settle()
    expect(c.current()).toBe('frozen')
  })

  it('a warm card that becomes the nearest goes live instead', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    register('a', 0)
    const b = register('b', 200, true)
    settle()
    expect(b.current()).toBe('warm')
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 50, clientY: 250, pointerType: 'mouse' }))
    settle()
    expect(b.current()).toBe('live')
  })

  it('puts the keyboard-focused card first', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    const a = register('a', 0)
    const c = register('c', 200)
    settle()
    expect(a.current()).toBe('live')
    const button = document.createElement('button')
    c.element.appendChild(button)
    button.focus()
    window.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    // focusin target resolution uses event.target; dispatch from the button.
    button.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    settle()
    expect(c.current()).toBe('live')
  })

  it('unregistering a live card frees its slot for the next card', () => {
    configureGalleryLivePool({ poolSize: 1, keepMargin: 0 })
    const a = register('a', 0)
    const b = register('b', 200)
    settle()
    expect(a.current()).toBe('live')
    a.unregister()
    settle()
    expect(b.current()).toBe('live')
  })
})
