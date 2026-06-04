import { render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

  it('offers Push-map / Push-pixel-count checkboxes when the map push is blocked (#213)', () => {
    connect()
    openBakedMap()
    // A blocking map-count mismatch: the popover is open with the remedy armed.
    useControllerStore.setState({
      preflight: [
        { kind: 'map-count-mismatch', message: 'mismatch' },
        { kind: 'map-overwrite', message: 'overwrite' },
      ],
      mapPushRemedyCount: 16,
    })
    render(<SendMapToController />)
    // Both steps offered as checkboxes, on by default, under Cancel / Push.
    expect(screen.getByText('Recommended')).toBeInTheDocument()
    const pushMap = screen.getByRole('checkbox', { name: 'Push map' }) as HTMLInputElement
    const pushCount = screen.getByRole('checkbox', { name: 'Push pixel count' }) as HTMLInputElement
    expect(pushMap).toBeChecked()
    expect(pushCount).toBeChecked()
    expect(screen.getByText('Cancel')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Push' })).toBeEnabled()
  })

  it('routes the blocked push by which checkboxes are left on (#213)', () => {
    connect()
    openBakedMap()
    const confirmMapPush = vi.fn()
    const confirmMapPushOnly = vi.fn()
    const confirmSetPixelCountOnly = vi.fn()
    useControllerStore.setState({
      preflight: [
        { kind: 'map-count-mismatch', message: 'mismatch' },
        { kind: 'map-overwrite', message: 'overwrite' },
      ],
      mapPushRemedyCount: 16,
      confirmMapPush,
      confirmMapPushOnly,
      confirmSetPixelCountOnly,
    })
    render(<SendMapToController />)
    // Uncheck "Push pixel count" → map-only path.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Push pixel count' }))
    fireEvent.click(screen.getByRole('button', { name: 'Push' }))
    expect(confirmMapPushOnly).toHaveBeenCalledOnce()
    expect(confirmMapPush).not.toHaveBeenCalled()
    expect(confirmSetPixelCountOnly).not.toHaveBeenCalled()
  })

  it('greys out Push when both checkboxes are cleared (#213)', () => {
    connect()
    openBakedMap()
    useControllerStore.setState({
      preflight: [
        { kind: 'map-count-mismatch', message: 'mismatch' },
        { kind: 'map-overwrite', message: 'overwrite' },
      ],
      mapPushRemedyCount: 16,
    })
    render(<SendMapToController />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Push map' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Push pixel count' }))
    expect(screen.getByRole('button', { name: 'Push' })).toBeDisabled()
  })

  it('shows no checkboxes and a plain Push when the map push is not blocked', () => {
    connect()
    openBakedMap()
    useControllerStore.setState({
      preflight: [{ kind: 'map-overwrite', message: 'overwrite' }],
      mapPushRemedyCount: null,
    })
    render(<SendMapToController />)
    expect(screen.queryByText('Recommended')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Push pixel count' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Push' })).toBeInTheDocument()
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
