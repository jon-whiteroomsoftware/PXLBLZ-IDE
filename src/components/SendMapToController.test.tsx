import { act, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SendMapToController } from './SendMapToController'
import { useControllerStore, controllerInitialState } from '@/store/controllerStore'
import { useMapStore, mapInitialState, type MapRecord } from '@/store/mapStore'
import { setControllerProvider, resetControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { expectDisabledReason, expectNotGated } from '@/components/ui/disabled-reason.testing'

class ConnectedProvider extends NullControllerProvider {
  private status: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'c1', address: '10.0.0.9', deviceId: 'c1' },
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

function connect(firmwareVersion?: string) {
  setControllerProvider(new ConnectedProvider())
  useControllerStore.setState({
    activeIp: '10.0.0.9',
    controllers: {
      '10.0.0.9': {
        ip: '10.0.0.9',
        phase: 'live',
        mapDim: 2,
        ...(firmwareVersion ? { firmwareVersion } : {}),
      },
    },
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
    expectDisabledReason(screen.getByTestId('send-map-to-controller'), /connect a controller/i)
  })

  it('is disabled until the map has baked points', () => {
    connect()
    useMapStore.setState({
      editingMap: { kind: 'existing', id: 'm1' },
      userMaps: [{ ...BAKED_MAP, points: undefined }],
    })
    render(<SendMapToController />)
    expectDisabledReason(screen.getByTestId('send-map-to-controller'), /bake/i)
  })

  it('is enabled when connected with a baked map', () => {
    connect()
    openBakedMap()
    render(<SendMapToController />)
    expectNotGated(screen.getByTestId('send-map-to-controller'))
  })

  it('disables a 1D map send to firmware older than 3.66 with an explanation', () => {
    connect('3.65')
    useMapStore.setState({
      editingMap: { kind: 'existing', id: 'm1' },
      userMaps: [{ ...BAKED_MAP, dim: 1, points: [[0], [1]], source: '[[0], [1]]' }],
    })
    render(<SendMapToController />)
    expectDisabledReason(screen.getByTestId('send-map-to-controller'), /3\.66 or newer/i)
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
    expectDisabledReason(button, /no changes since the last send/i)
    // A gated Send is inert on click and reachable by keyboard focus (#875).
    fireEvent.click(button)
    expect(useControllerStore.getState().preflight).toBeNull()
    act(() => button.focus())
    expect(document.activeElement).toBe(button)
    expect(document.getElementById(button.getAttribute('aria-describedby')!)).toBeVisible()
  })
})
