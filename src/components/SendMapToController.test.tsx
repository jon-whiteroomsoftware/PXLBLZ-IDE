import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { SendMapToController } from './SendMapToController'
import { useControllerStore, controllerInitialState } from '@/store/controllerStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'

class ConnectedProvider extends NullControllerProvider {
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9' },
  }
  getStatus(): ControllerStatus {
    return this.status
  }
}

const BAKED_MAP: MapRecord = {
  id: 'm1',
  name: 'My Map',
  dim: 2,
  generator: 'custom',
  params: {},
  source: 'function(c){ return [[0,0],[1,1]] }',
  points: [
    [0, 0],
    [1, 1],
  ],
  updatedAt: 0,
}

function openBakedMap() {
  useMapStore.setState({ editingMap: { kind: 'existing', id: 'm1' }, userMaps: [BAKED_MAP] })
}

function connect() {
  setControllerProvider(new ConnectedProvider())
  useControllerStore.setState({
    activeIp: '10.0.0.9',
    controllers: { '10.0.0.9': { ip: '10.0.0.9', phase: 'live', mapDim: 2 } },
  })
}

beforeEach(() => {
  useControllerStore.setState(controllerInitialState)
  useMapStore.setState(mapInitialState)
})

afterEach(() => resetControllerProvider())

describe('SendMapToController', () => {
  it('is disabled with an explanation when no Controller is connected', () => {
    openBakedMap()
    render(<SendMapToController />)
    const button = screen.getByTestId('send-map-to-controller')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/connect a controller/i))
  })

  it('is disabled until the map has baked points', () => {
    connect()
    useMapStore.setState({
      editingMap: { kind: 'existing', id: 'm1' },
      userMaps: [{ ...BAKED_MAP, points: undefined }],
    })
    render(<SendMapToController />)
    const button = screen.getByTestId('send-map-to-controller')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/bake/i))
  })

  it('is enabled when connected with a baked map', () => {
    connect()
    openBakedMap()
    render(<SendMapToController />)
    expect(screen.getByTestId('send-map-to-controller')).toBeEnabled()
  })

  it('opens the preflight dialog on click (a map send always confirms)', async () => {
    connect()
    openBakedMap()
    render(<SendMapToController />)
    fireEvent.click(screen.getByTestId('send-map-to-controller'))
    // requestMapPush is async (reads device config); the dialog mounts once it sets preflight.
    expect(await screen.findByTestId('map-preflight-dialog')).toBeInTheDocument()
  })

  it('offers three choices when the map push is blocked (#213)', () => {
    connect()
    openBakedMap()
    // A blocking map-count mismatch: the dialog is open with the remedy armed.
    useControllerStore.setState({
      preflight: [
        { kind: 'map-count-mismatch', message: 'mismatch' },
        { kind: 'map-overwrite', message: 'overwrite' },
      ],
      mapPushRemedyCount: 16,
    })
    render(<SendMapToController />)
    // Cancel, the de-emphasized push-only escape hatch, and the recommended remedy.
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByText('Push map only')).toBeInTheDocument()
    expect(screen.getByText('Push map and set pixel count to 16')).toBeInTheDocument()
    // The non-blocking "Send anyway" label is not used in the blocked case.
    expect(screen.queryByText('Send anyway')).not.toBeInTheDocument()
  })

  it('offers a plain "Send anyway" when the map push is not blocked', () => {
    connect()
    openBakedMap()
    useControllerStore.setState({
      preflight: [{ kind: 'map-overwrite', message: 'overwrite' }],
      mapPushRemedyCount: null,
    })
    render(<SendMapToController />)
    expect(screen.getByText('Send anyway')).toBeInTheDocument()
  })

  it('is disabled once the open map matches the last push', () => {
    connect()
    openBakedMap()
    useControllerStore.setState({ lastPushedMap: { '10.0.0.9': { m1: BAKED_MAP.source as string } } })
    render(<SendMapToController />)
    const button = screen.getByTestId('send-map-to-controller')
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('title', expect.stringMatching(/no changes/i))
  })
})
