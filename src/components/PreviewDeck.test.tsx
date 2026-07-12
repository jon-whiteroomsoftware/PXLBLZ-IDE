import { describe, it, expect, beforeEach } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PreviewDeck } from './PreviewDeck'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { INDEX_MAP_ID } from '@/engine/layout'
import { AUTO_MAP_ID } from '@/engine/settings'

beforeEach(() => {
  usePreviewStore.setState(previewInitialState)
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
  usePatternStore.setState(patternInitialState)
})

describe('PreviewDeck (smoke)', () => {
  it('renders the deck sections inline (no dialog over the canvas)', () => {
    useEditorStore.setState({ nativeDim: 2, previewPatternName: 'Demo' })
    render(<PreviewDeck />)

    // Primary band: play/pause + the viewport embedding control.
    expect(screen.getByRole('button', { name: /run|pause/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Display' })).toBeInTheDocument()

    // Pixelblaze section: the Map control now lives here (#253), alongside pixel
    // count + fit, with brightness as a long slider.
    expect(screen.getByRole('button', { name: 'Map' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Edit pixel count' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()

    // Preview section: light size, diffusion sliders + renderer, speed.
    expect(screen.getByRole('slider', { name: 'Light size' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Diffusion' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Renderer' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Speed' })).toBeInTheDocument()

    // Telemetry (merged in from the retired Readout section) is unconditional.
    expect(screen.getByText('fps')).toBeInTheDocument()
    expect(screen.getByText('elapsed')).toBeInTheDocument()

    // No gear settings dialog exists anymore.
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /preview settings/i })).not.toBeInTheDocument()
  })

  it('offers cross-dimensional maps but omits Fit while Index is active for 1D', () => {
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: AUTO_MAP_ID })
    render(<PreviewDeck />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Index')
    expect(
      screen.queryByRole('button', { name: 'Map normalization (Fill / Contain)' }),
    ).not.toBeInTheDocument()
    // The rest of the Pixelblaze block is still present.
    expect(screen.getByRole('button', { name: 'Edit pixel count' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Brightness' })).toBeInTheDocument()
  })

  it('shows a reversible 1D map choice but no fit control while Index is active', () => {
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({
      activeMapId: INDEX_MAP_ID,
      userMaps: [{
        id: 'reverse1d', name: 'Reverse strand', dim: 1, generator: 'custom', params: {},
        points: [[1], [0]], source: '[[1], [0]]', updatedAt: 1,
      }],
    })
    render(<PreviewDeck />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Index')
    expect(
      screen.queryByRole('button', { name: 'Map normalization (Fill / Contain)' }),
    ).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
  })

  it('keeps the meaningless 1D fit control hidden while a real map is active', () => {
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({
      activeMapId: 'reverse1d',
      userMaps: [{
        id: 'reverse1d', name: 'Reverse strand', dim: 1, generator: 'custom', params: {},
        points: [[1], [0]], source: '[[1], [0]]', updatedAt: 1,
      }],
    })
    render(<PreviewDeck />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Reverse strand')
    expect(
      screen.queryByRole('button', { name: 'Map normalization (Fill / Contain)' }),
    ).not.toBeInTheDocument()
  })

  it('keys Fit and embedding controls off the selected map, not Pattern dimension', () => {
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: 'plane' })
    render(<PreviewDeck />)
    expect(
      screen.getByRole('button', { name: 'Map normalization (Fill / Contain)' }),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Display' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Coordinate view' })).toBeInTheDocument()
  })

  it('offers an info hint on both the Pixelblaze and Preview sections', () => {
    render(<PreviewDeck />)
    expect(
      screen.getByRole('button', { name: 'About the Pixelblaze section' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'About the Preview section' }),
    ).toBeInTheDocument()
  })

  it('opens a focused pixel-count drawer and applies the preview count explicitly', async () => {
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: AUTO_MAP_ID })
    render(<PreviewDeck />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    const input = screen.getByRole('textbox', { name: 'Pixel count' }) as HTMLInputElement
    await waitFor(() => expect(input).toHaveFocus())
    expect(input.value).toBe('100')

    fireEvent.change(input, { target: { value: '128px' } })
    expect(input.value).toBe('128')
    fireEvent.click(screen.getByRole('button', { name: 'Apply pixel count' }))

    expect(useMapStore.getState().activePixelCount).toBe(128)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('shows an indeterminate quick-resolution slider for an off-ladder exact count', async () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'plane', activePixelCount: 1000 })
    usePatternStore.setState({ activeDemoName: 'TestPattern2D' })
    render(<PreviewDeck />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    const slider = screen.getByRole('slider', { name: 'Preview resolution' }) as HTMLInputElement
    expect(slider).toHaveClass('deck-slider-unset')
    expect(screen.getByText('32×32')).toBeInTheDocument()
    expect(screen.getByText('1,000 LEDs')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Increase preview resolution' }))
    expect(useMapStore.getState().activePixelCount).toBe(1024)
    await waitFor(() => expect(usePatternStore.getState().demoOverrides.TestPattern2D?.pixelCount).toBe(1024))
  })

  it('moves the Preview immediately through natural resolution stops', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'wide', activePixelCount: 512 })
    render(<PreviewDeck />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    const slider = screen.getByRole('slider', { name: 'Preview resolution' })
    fireEvent.change(slider, { target: { value: '4' } })

    expect(useMapStore.getState().activePixelCount).toBe(1568)
    expect(screen.getByText('56×28')).toBeInTheDocument()
  })

  it('reports the complete cube lattice realized by an off-ladder exact count', () => {
    useEditorStore.setState({ nativeDim: 3 })
    useMapStore.setState({ activeMapId: 'cube', activePixelCount: 1600 })
    render(<PreviewDeck />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    expect(screen.getByText('12×12×12')).toBeInTheDocument()
    expect(screen.getByText('1,728 LEDs')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Pixel count' })).toHaveValue('1600')
  })

  it('keeps exact Preview entry available above the quick-resolution ceiling', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'plane', activePixelCount: 1024 })
    render(<PreviewDeck />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Pixel count' }), { target: { value: '4096' } })
    fireEvent.click(screen.getByRole('button', { name: 'Apply pixel count' }))

    expect(useMapStore.getState().activePixelCount).toBe(4096)
  })

  it('keeps quick resolution absent for a fixed baked map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'fixed-map',
      activePixelCount: 4,
      userMaps: [{
        id: 'fixed-map', name: 'Fixed map', dim: 2, generator: 'custom', params: {},
        points: [[0, 0], [1, 0], [0, 1], [1, 1]], source: '[[0,0],[1,0],[0,1],[1,1]]', updatedAt: 1,
      }],
    })
    render(<PreviewDeck />)

    fireEvent.click(screen.getByRole('button', { name: 'Edit pixel count' }))
    expect(screen.queryByRole('slider', { name: 'Preview resolution' })).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Pixel count' })).toHaveValue('4')
  })

  it('shows the layout telemetry cell only when a regular grid is live', () => {
    const { rerender } = render(<PreviewDeck />)
    expect(screen.queryByText('layout')).not.toBeInTheDocument()

    useEditorStore.setState({ layoutLabel: '10×10' })
    rerender(<PreviewDeck />)
    expect(screen.getByText('layout')).toBeInTheDocument()
    expect(screen.getByText('10×10')).toBeInTheDocument()
  })

  it('explains an adapted map/renderer combination', () => {
    useEditorStore.setState({
      renderAdaptation: 'Using render3D with a 2D map; missing z is 0.5.',
    })
    render(<PreviewDeck />)
    expect(screen.getByRole('status')).toHaveTextContent(
      'Using render3D with a 2D map; missing z is 0.5.',
    )
  })

  it('shows the solidity slider only when the embedding is solid-eligible', () => {
    const { rerender } = render(<PreviewDeck />)
    expect(screen.queryByRole('slider', { name: /Interior opacity/ })).not.toBeInTheDocument()

    useEditorStore.setState({ solidEligible: true })
    rerender(<PreviewDeck />)
    expect(screen.getByRole('slider', { name: /Interior opacity/ })).toBeInTheDocument()
  })

  it('hides the reset-preview icon until the active item carries overrides', () => {
    useEditorStore.setState({ nativeDim: 2 })
    const { rerender } = render(<PreviewDeck />)
    expect(screen.queryByRole('button', { name: 'Reset preview' })).not.toBeInTheDocument()

    // A user pattern with an override surfaces the icon.
    usePatternStore.setState({
      activePatternId: 'p1',
      userPatterns: [{ id: 'p1', name: 'P1', src: '', controls: {}, updatedAt: 1, settings: { brightness: 0.5 } }],
    })
    rerender(<PreviewDeck />)
    const reset = screen.getByRole('button', { name: 'Reset preview' })
    const display = screen.getByRole('button', { name: 'Display' })
    expect(reset).toBeInTheDocument()
    expect(reset).toHaveAttribute('title', 'Reset preview settings')
    expect(reset.compareDocumentPosition(display) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('surfaces the same reset-preview icon for a demo with overrides', () => {
    usePatternStore.setState({
      activePatternId: null,
      activeDemoName: 'AuroraSphere',
      demoOverrides: { AuroraSphere: { brightness: 0.5 } },
    })
    render(<PreviewDeck />)
    expect(screen.getByRole('button', { name: 'Reset preview' })).toBeInTheDocument()
  })

  it('provides tooltips for primary-row controls', () => {
    useEditorStore.setState({ nativeDim: 2, previewPatternName: 'Demo' })
    render(<PreviewDeck />)

    expect(screen.getByText('Demo')).toHaveAttribute('title', 'Demo')
    expect(screen.getByRole('button', { name: 'Pause' })).toHaveAttribute('title', 'Pause preview')
    expect(screen.getByRole('button', { name: 'Display' })).toHaveAttribute('title', expect.stringMatching(/^Display: /))
  })
})
