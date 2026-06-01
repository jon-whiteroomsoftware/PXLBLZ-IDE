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
  // #63: the preview pane must never show scrollbars (vertical or horizontal),
  // even when its content is clipped — content is clipped, not scrolled.
  it('clips overflow rather than scrolling', () => {
    const { container } = render(<Preview />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('overflow-hidden')
    expect(root.className).not.toContain('overflow-y-auto')
    expect(root.className).not.toContain('overflow-auto')
    expect(root.className).not.toContain('overflow-x-auto')
  })
})
