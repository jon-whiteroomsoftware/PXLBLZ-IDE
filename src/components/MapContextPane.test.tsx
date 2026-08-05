import { render, screen, waitFor } from '@testing-library/react'
import { MapContextPane } from './MapContextPane'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { useControllerProfileStore, controllerProfileInitialState } from '@/store/controllerProfileStore'
import { usePreviewStore, previewInitialState } from '@/store/previewStore'
import { useCameraStore, cameraInitialState } from '@/store/cameraStore'

const CUSTOM_MAP: MapRecord = {
  id: 'map-1',
  name: 'Panel winding',
  dim: 2,
  generator: 'custom',
  params: {},
  source: 'function(pixelCount) { return [[0,0], [1,0], [0,1], [1,1]] }',
  points: [[0, 0], [1, 0], [0, 1], [1, 1]],
  gridDims: { cols: 2, rows: 2 },
  updatedAt: 1,
}

beforeEach(() => {
  useMapStore.setState(mapInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useCameraStore.setState(cameraInitialState)
})

describe('MapContextPane', () => {
  it('renders a custom map wiring check, facts, and explicit pattern provenance', async () => {
    useMapStore.setState({
      editingMap: { kind: 'existing', id: CUSTOM_MAP.id },
      userMaps: [CUSTOM_MAP],
    })
    usePatternStore.setState({
      userPatterns: [
        { id: 'p1', name: 'Panel Pattern', src: '// p', controls: {}, settings: { mapId: CUSTOM_MAP.id }, updatedAt: 1 },
      ],
    })

    render(<MapContextPane />)

    const geometry = await screen.findByTestId('map-wiring-geometry')
    await waitFor(() => expect(geometry).toHaveAttribute('viewBox', '0 0 320 320'))
    expect(screen.getByTestId('map-wiring-viewport')).toHaveStyle({ aspectRatio: '320 / 320' })
    expect(screen.getByTestId('map-wiring-viewport')).not.toHaveClass('aspect-[2/1]')
    expect(geometry).toHaveClass('size-full')
    expect(geometry.querySelectorAll('circle')).toHaveLength(4)
    expect(screen.getByLabelText('Physical map geometry: 4 LEDs')).toBeInTheDocument()
    expect(screen.getByText('gradient follows wire order')).toBeInTheDocument()
    expect(screen.getByText('pixels')).toBeInTheDocument()
    expect(screen.getAllByText('4').length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('arity')).toBeInTheDocument()
    expect(screen.getByText('2D')).toBeInTheDocument()
    expect(screen.getByText('2 x 2')).toBeInTheDocument()
    expect(screen.getByText('Panel Pattern')).toBeInTheDocument()
    expect(screen.getByLabelText('Baked size: 4 pixels')).toHaveTextContent('Baked size · 4 px')
  })

  it('holds the last successful custom map bake when eval fails', async () => {
    useMapStore.setState({
      editingMap: { kind: 'existing', id: CUSTOM_MAP.id },
      userMaps: [CUSTOM_MAP],
      mapEvalError: 'boom',
    })

    render(<MapContextPane />)

    expect(await screen.findByTestId('map-wiring-geometry')).toBeInTheDocument()
    expect(screen.getByText(/Holding last good bake: boom/)).toBeInTheDocument()
  })

  it('reports coincident map coordinates in the diagnostic facts', async () => {
    useMapStore.setState({
      editingMap: { kind: 'existing', id: CUSTOM_MAP.id },
      userMaps: [{ ...CUSTOM_MAP, points: [[0, 0], [0, 0], [1, 1]], gridDims: undefined }],
    })

    render(<MapContextPane />)

    expect(await screen.findByText('unique positions')).toBeInTheDocument()
    expect(screen.getByText('1 at 1 position')).toBeInTheDocument()
  })

  it('uses orbit controls for stock 3D maps without pole-only controls', async () => {
    useMapStore.setState({
      editingMap: { kind: 'stock', id: 'cube' },
      activePixelCount: 8,
      activeShapeId: 'pole',
    })

    render(<MapContextPane />)

    expect(await screen.findByTestId('map-wiring-canvas')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Pause auto-orbit' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument()
    expect(screen.queryByRole('slider', { name: 'Pole wrap density' })).not.toBeInTheDocument()
    expect(screen.getByText('3D')).toBeInTheDocument()
  })

  it('labels a generated stock map with the active Preview size', async () => {
    useMapStore.setState({
      editingMap: { kind: 'stock', id: 'plane' },
      activePixelCount: 1024,
    })

    render(<MapContextPane />)

    expect(await screen.findByTestId('map-wiring-geometry')).toBeInTheDocument()
    expect(screen.getByLabelText('Preview size: 1,024 pixels')).toHaveTextContent('Preview size · 1,024 px')
  })

  it('shows an empty selection state without a stale pattern preview', () => {
    render(<MapContextPane />)

    expect(screen.getByText('No map selected')).toBeInTheDocument()
    expect(screen.queryByTestId('map-wiring-geometry')).not.toBeInTheDocument()
  })
})
