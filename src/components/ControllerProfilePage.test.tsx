import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ControllerProfilePage } from './ControllerProfilePage'
import { ControllerSavedProgramsPane } from './ControllerSavedProgramsPane'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { encodeMapData } from '@/engine/mapPush'
import {
  demoPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { MapRecord, PatternRecord } from '@/engine/personalContentRecords'
import type { RecoveredSavedProgram } from '@/engine/controllerSavedProgramRead'
import {
  demoControllerMetadataStorage,
  resetControllerMetadataStorage,
  setControllerMetadataStorage,
} from '@/engine/controllerMetadataStorage'
import {
  controllerProfileInitialState,
  defaultControllerProfile,
  useControllerProfileStore,
} from '@/store/controllerProfileStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { routerInitialState, useRouterStore } from '@/store/routerStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'

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

class LiveBrightnessProvider extends MapReadbackProvider {
  getConfig() {
    return Promise.resolve({ brightness: 0.5, pixelCount: 240 })
  }
}

class ProgramListProvider extends MapReadbackProvider {
  programs: Array<{ id: string; name: string }> = []
  recoveredPrograms = new Map<string, RecoveredSavedProgram>()
  listCalls = 0

  listPrograms() {
    this.listCalls += 1
    return Promise.resolve(this.programs)
  }

  readSavedProgram(programId: string) {
    return Promise.resolve(this.recoveredPrograms.get(programId) ?? null)
  }
}

beforeEach(() => {
  useControllerProfileStore.setState(controllerProfileInitialState)
  useControllerStore.setState(controllerInitialState)
  useMapStore.setState(mapInitialState)
  useRouterStore.setState(routerInitialState)
  usePatternStore.setState(patternInitialState)
  resetControllerProvider()
  resetControllerMetadataStorage()
  setPersonalContentProvider({
    ...demoPersonalContentProvider,
    updateControllerProfile: async () => {},
  })
})

afterEach(() => {
  resetControllerProvider()
  resetControllerMetadataStorage()
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
  it('explains when profile transforms apply and which output calls they cover', () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    expect(screen.getByText(
      'Transforms take effect when a pattern is pushed. Push saved programs again after changing them.',
    )).toBeInTheDocument()
    expect(screen.getByText(/multiplies brightness for hsv\(\) output/i)).toBeInTheDocument()
    expect(screen.getByText(/limits estimated output duty for hsv\(\) and rgb\(\)/i)).toBeInTheDocument()
    expect(screen.getByText(/paint\(\) output is not covered/i)).toBeInTheDocument()
  })

  it('uses the shared controller traffic-light vocabulary for profile status', () => {
    seedProfile()

    const { rerender } = render(<ControllerProfilePage profileId="ctrl-1" />)
    expect(screen.getByText('Offline')).toBeInTheDocument()
    expect(screen.getByTestId('controller-profile-status-dot')).toHaveClass('bg-zinc-700')
    expect(screen.getByTitle('Refresh controller metadata')).toBeDisabled()

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
    expect(screen.getByTitle('Refresh controller metadata')).toBeDisabled()

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
    expect(screen.getByTitle('Refresh controller metadata')).toBeDisabled()

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
    expect(screen.getByTitle('Refresh controller metadata')).toBeEnabled()
  })

  it('shows the saved-program inventory offline state in its dedicated pane', () => {
    const profile = seedProfile()

    render(<ControllerSavedProgramsPane profile={profile} />)

    expect(screen.getByText(/connect this controller to inspect its saved programs/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Refresh saved programs' })).toBeDisabled()
  })

  it('groups saved programs by Studio ownership, links owned rows, and refreshes', async () => {
    const profile = seedProfile()
    const provider = new ProgramListProvider()
    provider.programs = [
      { id: 'DEV1', name: 'Device Twinkle' },
      { id: 'FOREIGN1', name: 'sound bar kit' },
      { id: 'DEV2', name: 'Device Aurora' },
    ]
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-1',
        name: 'Twinkle',
        src: 'export function render(i) {}',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'saved-program-test',
      getControllerBindings: async () => ({
        '192.168.8.224': {
          'pat-1': 'DEV1',
          'demo:AuroraSphere': 'DEV2',
        },
      }),
      getPushRecords: async () => ({
        '192.168.8.224': {
          'pat-1': {
            transforms: [],
            artifactHash: 'twinkle-hash',
            stampedAt: '2026-07-09T00:00:00.000Z',
            name: 'Twinkle',
          },
        },
      }),
    })
    setControllerProvider(provider)
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

    const { rerender } = render(<ControllerSavedProgramsPane profile={profile} />)

    expect(await screen.findByRole('button', { name: 'Twinkle' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'AuroraSphere' })).toBeInTheDocument()
    expect(screen.getByText('Foreign programs · 1')).toBeInTheDocument()
    expect(screen.getByText('sound bar kit')).toBeInTheDocument()
    expect(screen.getByText('DEV1')).toBeInTheDocument()
    expect(screen.getByText('FOREIGN1')).toBeInTheDocument()
    expect(screen.getByTitle('Current: pushed with the transforms enabled on this profile.')).toHaveTextContent('current')
    expect(screen.getAllByTitle('Unmanaged: no Studio push record is available for this saved program.')).toHaveLength(2)

    const readsBeforeToggle = provider.listCalls
    const changedProfile = {
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
      ),
    }
    rerender(<ControllerSavedProgramsPane profile={changedProfile} />)
    expect(screen.getByTitle(
      'Stale: profile transforms changed since this program was pushed. Push it again to update.',
    )).toHaveTextContent('stale')
    expect(provider.listCalls).toBe(readsBeforeToggle)

    fireEvent.click(screen.getByRole('button', { name: 'Twinkle' }))
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'pat-1' },
    })

    provider.programs = [...provider.programs, { id: 'FOREIGN2', name: 'New Pattern 14' }]
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved programs' }))
    expect(await screen.findByText('New Pattern 14')).toBeInTheDocument()
    expect(provider.listCalls).toBeGreaterThanOrEqual(2)
  })

  it('imports recovered foreign source as a new Studio pattern', async () => {
    const profile = seedProfile()
    const provider = new ProgramListProvider()
    provider.programs = [{ id: 'FOREIGN1', name: 'sound bar kit' }]
    provider.recoveredPrograms.set('FOREIGN1', {
      programId: 'FOREIGN1',
      deviceName: 'sound bar kit',
      sourceCode: 'export function render(index) { rgb(index, 0, 1) }',
      stamp: null,
    })
    const createPattern = vi.fn(async (_record: PatternRecord) => {})
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      createPattern,
      updateControllerProfile: async () => {},
    })
    setControllerProvider(provider)
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

    render(<ControllerSavedProgramsPane profile={profile} />)

    fireEvent.click(await screen.findByRole('button', { name: 'Import sound bar kit' }))
    expect(await screen.findByRole('heading', { name: 'Import controller pattern?' })).toBeInTheDocument()
    expect(screen.getByText('Name · recovered')).toBeInTheDocument()
    expect(screen.getByText('Studio id · new')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Import pattern' }))

    await waitFor(() => expect(createPattern).toHaveBeenCalledTimes(1))
    const record = createPattern.mock.calls[0]![0]
    expect(record).toMatchObject({
      name: 'sound bar kit',
      src: 'export function render(index) { rgb(index, 0, 1) }',
      controls: {},
    })
    expect(record.id).toEqual(expect.any(String))
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: record.id },
    })
  })

  it('shows a clean empty state when a live Controller has no saved programs', async () => {
    const profile = seedProfile()
    setControllerProvider(new ProgramListProvider())
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

    render(<ControllerSavedProgramsPane profile={profile} />)

    expect(await screen.findByText(/no saved programs are installed/i)).toBeInTheDocument()
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

  it('keeps global transform field interactions from bubbling to selectable ancestors', async () => {
    seedProfile()
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })
    const onAncestorClick = vi.fn()
    const onAncestorKeyDown = vi.fn()

    render(
      <div onClick={onAncestorClick} onKeyDown={onAncestorKeyDown}>
        <ControllerProfilePage profileId="ctrl-1" />
      </div>,
    )

    const milliampsInput = screen.getByRole('spinbutton', { name: 'LED full-white current' })
    expect(milliampsInput).toHaveValue(60)
    fireEvent.change(milliampsInput, { target: { value: '45' } })

    await waitFor(() => {
      const profile = useControllerProfileStore.getState().profiles[0]
      expect(profile.globalTransforms.find((transform) => transform.id === 'power-cap')).toMatchObject({
        mode: 'direct',
        maxDuty: 0.25,
        milliampsPerPixel: 45,
      })
    })

    const input = screen.getByRole('spinbutton', { name: 'Power cap duty percent' })
    fireEvent.click(input)
    fireEvent.keyDown(input, { key: 'ArrowUp' })

    expect(onAncestorClick).not.toHaveBeenCalled()
    expect(onAncestorKeyDown).not.toHaveBeenCalled()

    fireEvent.change(input, { target: { value: '35' } })

    await waitFor(() => {
      const profile = useControllerProfileStore.getState().profiles[0]
      expect(profile.globalTransforms.find((transform) => transform.id === 'power-cap')).toMatchObject({
        mode: 'direct',
        maxDuty: 0.35,
      })
    })
  })

  it('derives the duty cap from a unit-labeled power budget without making pixel count editable', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{ ...profile, lastKnownPixelCount: 240 }],
      profilesLoaded: true,
    })
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)
    fireEvent.click(screen.getByRole('button', { name: 'From power budget' }))

    expect(await screen.findByRole('spinbutton', { name: 'LED full-white current' })).toHaveValue(60)
    expect(screen.getByRole('spinbutton', { name: 'Controller brightness percent' })).toHaveValue(100)
    expect(screen.getByRole('spinbutton', { name: 'Power budget amps' })).toHaveValue(3.6)
    expect(screen.queryByRole('spinbutton', { name: 'Pixel count' })).not.toBeInTheDocument()

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Controller brightness percent' }), {
      target: { value: '50' },
    })

    await waitFor(() => {
      const transform = useControllerProfileStore.getState().profiles[0].globalTransforms
        .find((candidate) => candidate.type === 'power-cap')
      expect(transform).toMatchObject({
        mode: 'derived',
        maxDuty: 0.5,
        milliampsPerPixel: 60,
        provenance: {
          targetAmps: 3.6,
          brightness: 0.5,
        },
      })
    })
  })

  it('prefills missing calculator provenance from the active live Controller brightness', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        lastKnownPixelCount: 240,
        globalTransforms: profile.globalTransforms.map((transform) => (
          transform.type === 'power-cap' ? { ...transform, mode: 'derived' as const } : transform
        )),
      }],
      profilesLoaded: true,
    })
    useControllerStore.setState({
      activeIp: '192.168.8.224',
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
    setControllerProvider(new LiveBrightnessProvider())
    setPersonalContentProvider({
      ...demoPersonalContentProvider,
      updateControllerProfile: async () => {},
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    await waitFor(() => {
      expect(screen.getByRole('spinbutton', { name: 'Controller brightness percent' })).toHaveValue(50)
    })
    expect(screen.getByText(/read from device/i)).toBeInTheDocument()
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
              rendererAdaptations: [],
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
