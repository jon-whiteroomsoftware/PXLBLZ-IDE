import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WatchPanel } from './WatchPanel'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

describe('WatchPanel layout readout', () => {
  it('shows the 2D layout (width×height) after pixelCount', () => {
    useEditorStore.setState({ displayDim: 2 })
    useMapStore.setState({ activePixelCount: 100 })
    render(<WatchPanel />)
    expect(screen.getByText('layout')).toBeInTheDocument()
    expect(screen.getByText('10×10')).toBeInTheDocument()
  })

  it('shows the 3D layout (width×height×depth)', () => {
    useEditorStore.setState({ displayDim: 3 })
    useMapStore.setState({ activePixelCount: 512 })
    render(<WatchPanel />)
    expect(screen.getByText('8×8×8')).toBeInTheDocument()
  })

  it('shows no layout cell for a 1D pattern', () => {
    useEditorStore.setState({ displayDim: 1 })
    render(<WatchPanel />)
    expect(screen.queryByText('layout')).not.toBeInTheDocument()
  })
})
