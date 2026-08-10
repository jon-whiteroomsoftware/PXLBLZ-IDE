import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import { editorInitialState, useEditorStore } from '@/store/editorStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { PatternDetailPage } from './PatternDetailPage'

describe('PatternDetailPage', () => {
  beforeEach(() => {
    useEditorStore.setState(editorInitialState)
    useMapStore.setState(mapInitialState)
    usePatternStore.setState(patternInitialState)
    usePreviewStore.setState(previewInitialState)
  })

  it('shows the preview action available on the next press', () => {
    render(<PatternDetailPage pattern={GALLERY_PATTERNS[0]!} onOpenInStudio={() => {}} />)

    const pause = screen.getByRole('button', { name: 'Pause preview' })
    expect(pause.querySelector('.lucide-pause')).toBeInTheDocument()

    fireEvent.click(pause)

    const play = screen.getByRole('button', { name: 'Run preview' })
    expect(play.querySelector('.lucide-play')).toBeInTheDocument()
  })
})
