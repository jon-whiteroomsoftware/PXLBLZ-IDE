import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ControllerProfilePage } from './ControllerProfilePage'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { encodeMapData } from '@/engine/mapPush'
import {
  demoPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { MapRecord } from '@/engine/personalContentRecords'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'

const READBACK_POINTS = [
  [0, 0],
  [1, 0],
  [0, 1],
  [0, 1],
]
const READBACK_HASH = '06427689'

class MapReadbackProvider extends NullControllerProvider {
  readonly mapData = encodeMapData(READBACK_POINTS)

  getStatus(): ControllerStatus {
    return {
      kind: 'connected',
      controller: {
        id: '192.168.8.224',
        address: '192.168.8.224',
        deviceId: 'pixelblaze_pb32_abc',
        name: 'Burner bag',
      },
    }
  }

  getPixelMap(): Promise<number[][] | null> {
    return Promise.resolve(READBACK_POINTS)
  }

  getPixelMapData(): Promise<Uint8Array | null> {
    return Promise.resolve(this.mapData)
  }
}

beforeEach(() => {
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
  useMapStore.setState(mapInitialState)
  useRouterStore.setState(routerInitialState)
  resetControllerProvider()
})

afterEach(() => {
  resetControllerProvider()
  resetPersonalContentProvider()
})

function seedProfile() {
  const profile = defaultControllerProfile({
    id: 'ctrl-1',
    deviceId: 'pixelblaze_pb32_abc',
    deviceName: 'Burner bag',
    ip: '192.168.8.224',
    now: 1,
  })
  useControllerProfileStore.setState({ profiles: [profile], profilesLoaded: true })
  return profile
}

describe('ControllerProfilePage', () => {
  it('uses the shared controller traffic-light vocabulary for profile status', () => {
    seedProfile()

    const { rerender } = render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-zinc-700')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'pending',
          mapDim: null,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Trying to connect')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-amber-400')
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('animate-blink-connect')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'error',
          error: 'WebSocket open timed out',
          mapDim: null,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Connect failed')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-red-400')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeDisabled()

    useControllerStore.setState({
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: 'pixelblaze_pb32_abc',
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })
    rerender(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Connected')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-ok')
    expect(screen.getByRole('button', { name: /refresh/i })).toBeEnabled()
  })

  it('shows controller zones as editable range lists with pixel totals', () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [
        {
          ...profile,
          lastKnownPixelCount: 256,
          zones: [
            { id: 'quad-1', name: 'quad-1', ranges: [{ start: 0, end: 63 }] },
            {
              id: 'top-band',
              name: 'top-band',
              ranges: [
                { start: 0, end: 3 },
                { start: 28, end: 31 },
              ],
            },
          ],
        },
      ],
      profilesLoaded: true,
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByRole('textbox', { name: 'quad-1 zone ranges' })).toHaveValue('0-63')
    expect(screen.getByRole('textbox', { name: 'top-band zone ranges' })).toHaveValue('0-3, 28-31')
    expect(screen.getByText('64')).toBeInTheDocument()
    expect(screen.getByText('8')).toBeInTheDocument()
  })

  it('shows the latest generated artifact inspection for the controller profile', () => {
    seedProfile()
    useControllerStore.setState({
      lastTransformArtifacts: {
        '192.168.8.224': {
          'pat-1': {
            patternName: 'Twinkle',
            updatedAt: 1,
            generatedSource: 'export function render(index) { hsv(index, 1, 1) }',
            warnings: [],
            summary: {
              passes: [
                {
                  id: 'speed-drive',
                  kind: 'bind',
                  beforeRender: 'wrapped',
                  bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
                  estimatedPixelCost: 0,
                },
              ],
              callSitesWrapped: {},
              beforeRender: 'wrapped',
              globalsAdded: ['__pxlblz_speed_drive_bind'],
              exportsAdded: [],
              bindingsApplied: [{ target: 'sliderSpeed', mode: 'function-call' }],
              estimatedPixelCost: 0,
            },
          },
        },
      },
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText('Last generated artifact')).toBeInTheDocument()
    expect(screen.getByText('Twinkle')).toBeInTheDocument()
    expect(screen.getByText('sliderSpeed (function-call)')).toBeInTheDocument()
  })

  it('imports the live controller pixel map as a named frozen user map', async () => {
    const profile = seedProfile()
    const created: MapRecord[] = []
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
      createMap: async (record) => {
        created.push(record)
      },
    })
    setControllerProvider(new MapReadbackProvider())
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /import map/i }))
    expect(await screen.findByRole('textbox', { name: 'Imported map name' })).toHaveValue('Burner bag map')
    expect(screen.getByText(/4 px \/ 2D \/ irregular/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^import map$/i }))

    await waitFor(() => expect(created).toHaveLength(1))
    expect(created[0]).toMatchObject({
      name: 'Burner bag map',
      dim: 2,
      generator: 'custom',
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      importMetadata: {
        kind: 'controller',
        controllerName: 'Burner bag',
        deviceId: 'pixelblaze_pb32_abc',
        ip: '192.168.8.224',
        mapHash: READBACK_HASH,
        pixelCount: 4,
        normalization: 'device-fill-normalized',
      },
    })
    await waitFor(() => {
      expect(useMapStore.getState().userMaps[0].id).toBe(created[0].id)
      expect(useRouterStore.getState().route).toEqual({
        kind: 'studio',
        entity: { kind: 'maps', id: created[0].id },
      })
    })
  })

  it('opens an existing Studio map instead of importing a duplicate when the installed map matches', async () => {
    const profile = seedProfile()
    const created: MapRecord[] = []
    const matchingMap: MapRecord = {
      id: 'map-existing',
      name: 'Existing grid',
      dim: 2,
      generator: 'custom',
      params: {},
      points: [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 1],
      ],
      updatedAt: 1,
    }
    useMapStore.setState({ userMaps: [matchingMap], mapsLoaded: true })
    useControllerProfileStore.setState({
      profiles: [
        {
          ...profile,
          mapFingerprints: [
            {
              hash: READBACK_HASH,
              mapId: matchingMap.id,
              mapName: matchingMap.name,
              devicePixelCount: 4,
              pushedAt: 2,
            },
          ],
        },
      ],
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
      createMap: async (record) => {
        created.push(record)
      },
    })
    setControllerProvider(new MapReadbackProvider())
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      controllers: {
        '192.168.8.224': {
          ip: '192.168.8.224',
          deviceId: profile.deviceId,
          nickname: 'Burner bag',
          phase: 'live',
          mapDim: 2,
        },
      },
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    fireEvent.click(screen.getByRole('button', { name: /import map/i }))
    expect(await screen.findByText(/matches "Existing grid"/i)).toBeInTheDocument()
    expect(screen.queryByRole('textbox', { name: 'Imported map name' })).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /^open map$/i }))

    expect(created).toHaveLength(0)
    await waitFor(() => {
      expect(useRouterStore.getState().route).toEqual({
        kind: 'studio',
        entity: { kind: 'maps', id: matchingMap.id },
      })
    })
  })
})
