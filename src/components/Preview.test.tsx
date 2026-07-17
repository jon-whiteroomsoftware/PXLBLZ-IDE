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
  it('keeps vertically overflowing controls reachable without horizontal scrolling', () => {
    const { container } = render(<Preview />)
    const root = container.firstElementChild as HTMLElement
    expect(root.className).toContain('overflow-y-auto')
    expect(root.className).not.toContain('overflow-hidden')
    expect(root.className).not.toContain('overflow-auto')
    expect(root.className).not.toContain('overflow-x-auto')
  })
})
