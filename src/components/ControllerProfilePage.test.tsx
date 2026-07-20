import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
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
import {
  controllerPanelInitialState,
  useControllerPanelStore,
} from '@/store/controllerPanelStore'
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
  useControllerPanelStore.setState(controllerPanelInitialState)
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
  it('shows the current hardware input direction and persists inversion', async () => {
    const profile = seedProfile()
    useControllerProfileStore.setState({
      profiles: [{
        ...profile,
        inputs: [{
          id: 'brightness-pot',
          name: 'Brightness knob',
          pin: 33,
          signal: 'analog',
          role: 'brightness',
          smoothing: 0.2,
          fallback: 0.5,
          invert: false,
        }],
      }],
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const invert = screen.getByRole('checkbox', { name: 'Brightness knob invert' })
    expect(invert).not.toBeChecked()
    expect(screen.getByText('0 → 1')).toBeInTheDocument()

    fireEvent.click(invert)

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].inputs[0].invert).toBe(true)
      expect(screen.getByText('1 → 0')).toBeInTheDocument()
    })
  })

  it('creates a Pattern binding only after choosing an installed managed Pattern', async () => {
    const base = seedProfile()
    const profile = {
      ...base,
      keepPatternsUpToDate: true,
      inputs: [{
        id: 'green-pot',
        name: 'Green pot',
        pin: 36,
        signal: 'analog' as const,
        role: 'brightness' as const,
        smoothing: 0.2,
        fallback: 0.5,
        invert: false,
      }],
      globalTransforms: base.globalTransforms.map((transform) =>
        transform.type === 'hardware-brightness'
          ? { ...transform, enabled: true, inputId: 'green-pot' }
          : transform,
      ),
    }
    const scheduleReconciliation = vi.fn()
    useControllerProfileStore.setState({ profiles: [profile] })
    usePatternStore.setState({
      userPatterns: [{
        id: 'pat-line',
        name: 'Line Dancer',
        src: 'export function render(index) { hsv(0, 1, 1) }',
        controls: {},
        updatedAt: 1,
      }],
      patternsLoaded: true,
    })
    useControllerStore.setState({
      activeIp: '192.168.8.224',
      scheduleControllerReconciliation: scheduleReconciliation,
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
    useControllerPanelStore.setState({
      programsByController: {
        '192.168.8.224': [
          { id: 'DEV_LINE', name: 'Line Dancer' },
          { id: 'FOREIGN', name: 'Foreign pattern' },
        ],
      },
    })
    setControllerMetadataStorage({
      ...demoControllerMetadataStorage,
      id: 'binding-pattern-choices',
      getControllerBindings: async () => ({
        '192.168.8.224': {
          'pat-line': 'DEV_LINE',
          'pat-not-installed': 'DEV_MISSING',
        },
      }),
    })

    render(<ControllerProfilePage profileId="ctrl-1" />)

    fireEvent.click(screen.getByRole('button', { name: 'Binding' }))
    expect(useControllerProfileStore.getState().profiles[0].patternBindings).toEqual([])
    expect(scheduleReconciliation).not.toHaveBeenCalled()

    const pattern = await screen.findByRole('combobox', { name: 'New binding Pattern' })
    expect(pattern.closest('tr')?.querySelectorAll('td')).toHaveLength(6)
    expect(pattern).toHaveTextContent('Line Dancer')
    expect(pattern).not.toHaveTextContent('Foreign pattern')
    expect(pattern).not.toHaveTextContent('DEV_MISSING')

    fireEvent.change(pattern, { target: { value: 'pat-line' } })

    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].patternBindings).toMatchObject([
        { patternId: 'pat-line', inputId: 'green-pot' },
      ])
      expect(scheduleReconciliation).toHaveBeenCalledTimes(1)
    })
    const override = await screen.findByText('Brightness override')
    expect(override).toHaveAttribute(
      'title',
      'This input controls the Pattern binding instead of hardware brightness while this Pattern runs.',
    )
    expect(override).toHaveClass('border', 'uppercase')
    expect(override).not.toHaveClass('text-amber-300/85')

    expect(screen.getByRole('combobox', { name: 'Binding Pattern' })).toHaveTextContent('Line Dancer')
    act(() => {
      useControllerStore.setState({
        activeIp: '192.168.8.224',
        controllers: {
          '192.168.8.224': {
            ip: '192.168.8.224',
            deviceId: profile.deviceId,
            nickname: 'Burner bag',
            phase: 'error',
            mapDim: 2,
          },
        },
      })
    })
    expect(screen.getByRole('combobox', { name: 'Binding Pattern' })).toHaveTextContent('Line Dancer')
    expect(screen.getByRole('combobox', { name: 'Binding Pattern' })).not.toHaveTextContent('pat-line')
  })

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

  it('declares the output profile as an unverifiable user statement (#567)', async () => {
    seedProfile()

    render(<ControllerProfilePage profileId="ctrl-1" />)

    const select = screen.getByRole('combobox', { name: 'Declared output profile' })
    expect(select).toHaveValue('native-serial')
    expect(screen.getByText(/the device cannot report or verify output wiring/i)).toBeInTheDocument()

    fireEvent.change(select, { target: { value: 'pro-expander' } })
    await waitFor(() => {
      expect(useControllerProfileStore.getState().profiles[0].outputProfile).toBe('pro-expander')
    })
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

  it('makes managed reconciliation explicit while keeping unmanaged programs exempt', () => {
    const profile = { ...seedProfile(), keepPatternsUpToDate: true }
    useControllerProfileStore.setState({ profiles: [profile] })
    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'running',
          managedCount: 3,
          unmanagedCount: 2,
          completedCount: 1,
          programs: [
            { programId: 'CURRENT', bindingKey: 'pat-1', name: 'Current', state: 'current' },
            { programId: 'WORKING', bindingKey: 'pat-2', name: 'Working', state: 'updating' },
            { programId: 'QUEUED', bindingKey: 'pat-3', name: 'Queued', state: 'queued' },
          ],
        },
      },
    })

    render(<ControllerSavedProgramsPane profile={profile} />)

    expect(screen.getByRole('checkbox', { name: 'Keep PXLBLZ patterns up to date' })).toBeChecked()
    expect(screen.getByText('1 of 3 managed Patterns current')).toBeInTheDocument()
    expect(screen.getByText(/2 unmanaged programs are completely exempt/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Managed Pattern refresh progress')).toHaveTextContent(
      '1 current, 1 updating, 1 queued, 0 failed',
    )

    fireEvent.click(screen.getByRole('checkbox', { name: 'Keep PXLBLZ patterns up to date' }))
    expect(useControllerProfileStore.getState().profiles[0].keepPatternsUpToDate).toBe(false)
  })

  it('keeps offline work pending and removes the progress rail once current', () => {
    const profile = { ...seedProfile(), keepPatternsUpToDate: true }
    useControllerProfileStore.setState({ profiles: [profile] })
    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'pending',
          managedCount: 2,
          unmanagedCount: 1,
          completedCount: 0,
          programs: [
            { programId: 'A', bindingKey: 'pat-a', name: 'A', state: 'queued' },
            { programId: 'B', bindingKey: 'pat-b', name: 'B', state: 'queued' },
          ],
        },
      },
    })
    const { rerender } = render(<ControllerSavedProgramsPane profile={profile} />)

    expect(screen.getByText('2 updates pending - reconnect to continue')).toBeInTheDocument()
    expect(screen.getByLabelText('Managed Pattern refresh progress')).toBeInTheDocument()

    useControllerStore.setState({
      controllerReconciliations: {
        'ctrl-1': {
          phase: 'current',
          managedCount: 2,
          unmanagedCount: 1,
          completedCount: 2,
          programs: [
            { programId: 'A', bindingKey: 'pat-a', name: 'A', state: 'current' },
            { programId: 'B', bindingKey: 'pat-b', name: 'B', state: 'current' },
          ],
        },
      },
    })
    rerender(<ControllerSavedProgramsPane profile={profile} />)

    expect(screen.getByText('2 of 2 managed Patterns current')).toBeInTheDocument()
    expect(screen.queryByLabelText('Managed Pattern refresh progress')).not.toBeInTheDocument()
  })

  it('groups saved programs by Studio ownership, links owned rows, and refreshes', async () => {
    const profile = seedProfile()
    const provider = new ProgramListProvider()
    provider.programs = [
      { id: 'DEV1', name: 'Device Twinkle' },
      { id: 'FOREIGN1', name: 'sound bar kit' },
      { id: 'DEV2', name: 'Device Aurora' },
      { id: 'SHOW1', name: 'Measured wall Show' },
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
          'show:show-1': 'SHOW1',
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
          'show:show-1': {
            transforms: ['show'],
            artifactHash: 'show-hash',
            stampedAt: '2026-07-12T00:00:00.000Z',
            name: 'Measured wall Show',
            showOutputContract: {
              version: 1,
              kind: 'installation',
              pixelCount: 256,
              outputMap: { kind: 'custom', name: 'Measured wall', fingerprint: '11111111' },
            },
          },
        },
      }),
    })
    setControllerProvider(provider)
    useControllerPanelStore.setState({
      programs: provider.programs,
      programsByController: { '192.168.8.224': provider.programs },
    })
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
    expect(screen.getByText('Installation · 256 px · Measured wall')).toBeInTheDocument()
    expect(screen.getByLabelText('Saved from a Show')).toBeInTheDocument()
    expect(screen.getByText('Studio Show missing')).toBeInTheDocument()
    expect(screen.queryByText('Studio pattern missing')).not.toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Program' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Pattern' })).not.toBeInTheDocument()
    expect(screen.getByTitle('Map fingerprint 11111111')).toBeInTheDocument()
    expect(screen.getByTitle('Current: pushed with the transforms enabled on this profile.')).toHaveTextContent('current')
    expect(screen.getAllByTitle('Unmanaged: no Studio push record is available for this saved program.')).toHaveLength(2)
    expect(provider.listCalls).toBe(0)

    const inventory = screen.getByRole('table', { name: 'Saved programs inventory' })
    expect(inventory).toHaveClass('table-fixed')
    expect(screen.queryByRole('button', { name: 'Import Twinkle' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Import AuroraSphere' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Import sound bar kit' })).toBeInTheDocument()
    const rowText = () => within(inventory).getAllByRole('row').map((row) => row.textContent ?? '')
    expect(screen.getByRole('button', { name: 'A–Z' })).toHaveAttribute('aria-pressed', 'true')
    expect(rowText().findIndex((text) => text.includes('AuroraSphere'))).toBeLessThan(
      rowText().findIndex((text) => text.includes('Twinkle')),
    )

    fireEvent.click(screen.getByRole('button', { name: 'Device' }))
    expect(screen.getByRole('button', { name: 'Device' })).toHaveAttribute('aria-pressed', 'true')
    expect(rowText().findIndex((text) => text.includes('Twinkle'))).toBeLessThan(
      rowText().findIndex((text) => text.includes('AuroraSphere')),
    )

    const changedProfile = {
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'power-cap' ? { ...transform, enabled: true } : transform,
      ),
    }
    rerender(<ControllerSavedProgramsPane profile={changedProfile} />)
    expect(screen.getAllByTitle(
      'Stale: profile transforms changed since this program was pushed. Push it again to update.',
    )).toHaveLength(2)
    expect(provider.listCalls).toBe(0)

    fireEvent.click(screen.getByRole('button', { name: 'Twinkle' }))
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'pat-1' },
    })

    provider.programs = [...provider.programs, { id: 'FOREIGN2', name: 'New Pattern 14' }]
    fireEvent.click(screen.getByRole('button', { name: 'Refresh saved programs' }))
    expect(await screen.findByText('New Pattern 14')).toBeInTheDocument()
    expect(provider.listCalls).toBe(1)
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
    useControllerPanelStore.setState({
      programsByController: { '192.168.8.224': provider.programs },
    })
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
