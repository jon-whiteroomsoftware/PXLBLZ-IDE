import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Preview } from './Preview'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('Preview (smoke)', () => {
  it('keeps the LED canvas outside a non-scrolling clipped controls region', () => {
    const { container } = render(<Preview />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('overflow-clip')
    expect(root.className).not.toContain('overflow-hidden')
    expect(root.className).not.toContain('overflow-y-auto')
    expect(root.className).not.toContain('overflow-auto')
    expect(root.className).not.toContain('overflow-x-auto')
    expect(root).toHaveAttribute('data-height-constrained', 'true')

    const controlsRegion = container.querySelector('[data-testid="preview-controls-region"]')
    expect(controlsRegion).toHaveClass('min-h-[180px]', 'flex-1', 'overflow-clip')
  })

  it('keeps a deckless Gallery preview width-authoritative', () => {
    const { container } = render(<Preview showDeck={false} />)

    expect(container.firstElementChild).toHaveAttribute('data-height-constrained', 'false')
    expect(container.querySelector('[data-testid="preview-controls-region"]')).not.toBeInTheDocument()
  })

  it('keeps deterministic capture width-authoritative', () => {
    const previousUrl = window.location.href
    window.history.pushState({}, '', '?capture')
    try {
      const { container } = render(<Preview />)
      expect(container.firstElementChild).toHaveAttribute('data-height-constrained', 'false')
    } finally {
      window.history.pushState({}, '', previousUrl)
    }
  })
})
