import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CoordinateViewSelect, MapSelect, EmbeddingSelect } from './LayoutSelector'
import { useMapStore, mapInitialState } from '@/store/mapStore'
import { useEditorStore, editorInitialState } from '@/store/editorStore'
import { INDEX_MAP_ID } from '@/engine/layout'
import { AUTO_MAP_ID } from '@/engine/settings'

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  useEditorStore.setState(editorInitialState)
})

// The two layout controls now render in separate regions of the deck (#253): the
// MAP control in the PIXELBLAZE block, the EMBEDDING (shape/surface) control in the
// play-button row. They share routing, so the tests render whichever is under test.
describe('MapSelect (smoke)', () => {
  it('shows the active map name for a 2D pattern', () => {
    useEditorStore.setState({ nativeDim: 2 })
    render(<MapSelect />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Square')
  })

  it('shows the active map name for a regular-lattice custom map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'cm-grid',
      userMaps: [
        {
          id: 'cm-grid',
          name: 'My Grid',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [1, 0], [0, 1], [1, 1]],
          gridDims: { cols: 2, rows: 2 },
          source: '',
          updatedAt: 1,
        },
      ],
    })
    render(<MapSelect />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('My Grid')
  })

  it('offers Index plus other dimensions for an untouched 1D Pattern', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: AUTO_MAP_ID })
    render(<MapSelect />)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Index')
    await user.click(screen.getByRole('button', { name: 'Map' }))
    const recommended = screen.getByRole('group', { name: 'Recommended' })
    const other = screen.getByRole('group', { name: 'Other dimensions' })
    expect(within(recommended).getByRole('option', { name: 'Index' })).toBeInTheDocument()
    expect(within(other).getByRole('option', { name: 'Square' })).toBeInTheDocument()
  })

  it('offers Index and user 1D maps without replacing the Shape control', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({
      activeMapId: INDEX_MAP_ID,
      userMaps: [
        {
          id: 'reverse1d',
          name: 'Reverse strand',
          dim: 1,
          generator: 'custom',
          params: {},
          points: [[1], [0]],
          source: '[[1], [0]]',
          updatedAt: 1,
        },
      ],
    })
    render(<><MapSelect /><EmbeddingSelect /></>)
    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Index')
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(screen.getByRole('option', { name: 'Reverse strand' }))
    expect(useMapStore.getState().activeMapId).toBe('reverse1d')
  })

  it('switches embeddings with the selected map dimension, not Pattern dimension', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: AUTO_MAP_ID })
    render(<><MapSelect /><EmbeddingSelect /></>)
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(screen.getByRole('option', { name: 'Square' }))

    expect(useMapStore.getState().activeMapId).toBe('plane')
    expect(screen.queryByRole('button', { name: 'Shape' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Display' })).toBeInTheDocument()
  })

  it('selecting a map for a 2D pattern routes to the map store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'wide' })
    render(<MapSelect />)
    await user.click(screen.getByRole('button', { name: 'Map' }))
    await user.click(screen.getByRole('option', { name: 'Square' }))
    expect(useMapStore.getState().activeMapId).toBe('plane')
  })

  it('shows Cylinder once and progressively switches its coordinate view', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({ activeMapId: 'cylinder-surface' })
    render(<><MapSelect /><CoordinateViewSelect /></>)

    expect(screen.getByRole('button', { name: 'Map' })).toHaveTextContent('Cylinder')
    expect(screen.getByRole('button', { name: 'Coordinate view' })).toHaveTextContent('Surface')
    await user.click(screen.getByRole('button', { name: 'Coordinate view' }))
    await user.click(screen.getByRole('option', { name: 'Spatial' }))
    expect(useMapStore.getState().activeMapId).toBe('cylinder-spatial')
  })
})

describe('EmbeddingSelect (smoke)', () => {
  it('names the preview-only 2D control Display', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    render(<EmbeddingSelect />)
    const display = screen.getByRole('button', { name: 'Display' })
    expect(display).toHaveTextContent('Flat')
    await user.click(display)
    expect(screen.getByRole('option', { name: 'Cylinder wrap' })).toBeInTheDocument()
  })

  it('offers the Display control for a regular-lattice custom map', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'cm-grid',
      userMaps: [
        {
          id: 'cm-grid',
          name: 'My Grid',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [1, 0], [0, 1], [1, 1]],
          gridDims: { cols: 2, rows: 2 },
          source: '',
          updatedAt: 1,
        },
      ],
    })
    render(<EmbeddingSelect />)
    expect(screen.getByRole('button', { name: 'Display' })).toBeInTheDocument()
  })

  it('hides the embedding control for an irregular custom map (Flat only)', () => {
    useEditorStore.setState({ nativeDim: 2 })
    useMapStore.setState({
      activeMapId: 'cm-cloud',
      userMaps: [
        {
          id: 'cm-cloud',
          name: 'My Cloud',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [0.3, 0.7], [0.9, 0.1]],
          source: '',
          updatedAt: 1,
        },
      ],
    })
    render(<EmbeddingSelect />)
    expect(screen.queryByRole('button', { name: 'Display' })).not.toBeInTheDocument()
  })

  it('shows the Shape control for a 1D pattern', () => {
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: AUTO_MAP_ID })
    render(<EmbeddingSelect />)
    expect(screen.getByRole('button', { name: 'Shape' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Map' })).not.toBeInTheDocument()
  })

  it('lists 1D shapes and routes a choice to the shape store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 1 })
    useMapStore.setState({ activeMapId: AUTO_MAP_ID })
    render(<EmbeddingSelect />)
    await user.click(screen.getByRole('button', { name: 'Shape' }))
    await user.click(screen.getByRole('option', { name: 'Ring' }))
    expect(useMapStore.getState().activeShapeId).toBe('ring')
  })

  it('selecting Cylinder wrap routes to the preview surface store', async () => {
    const user = userEvent.setup()
    useEditorStore.setState({ nativeDim: 2 })
    render(<EmbeddingSelect />)
    await user.click(screen.getByRole('button', { name: 'Display' }))
    await user.click(screen.getByRole('option', { name: 'Cylinder wrap' }))
    expect(useMapStore.getState().activeSurfaceId).toBe('cylinder')
  })
})
