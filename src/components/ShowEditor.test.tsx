import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import {
  addShowRoutingLayout,
  addShowZone,
  createDefaultShow,
  createShowWithOutputContract,
  extendShowCell,
  removeShowClip,
  removeShowZone,
  spanShowCellZones,
  updateShowCellAdaptations,
  updateShowTransition,
} from '@/engine/showModel'
import { usePatternStore, patternInitialState } from '@/store/patternStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { controllerInitialState, useControllerStore } from '@/store/controllerStore'
import { resetControllerProvider, setControllerProvider } from '@/engine/controllerProviderRegistry'
import { NullControllerProvider, type ControllerStatus } from '@/engine/ControllerProvider'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, MixinRecord, PatternRecord, ShowCell, ShowRecord } from '@/engine/personalContentRecords'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from '@/engine/showOutputContract'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { createPropertySlotQualificationShow } from '@/engine/showPatternSlotTestFixture'

// The pressure/blocked compile-bar tests need a show decisively over the
// activation budget. Real fixtures keep shrinking as the compiler improves
// (#716/#717), so the budget is mocked down instead of inflating content.
vi.mock('@/engine/showVmResourceLedger', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/engine/showVmResourceLedger')>()
  return { ...actual, SHOW_ARTIFACT_BUDGET_BYTES: 30_000 }
})
import { buildShowCompositionFreezeCases } from '@/engine/showCompositionFreeze'
import * as showModel from '@/engine/showModel'
import { DEFAULT_SHOW_TRAILS_RETENTION } from '@/engine/showPreviousRgbFeedback'
import { appendShowLayoutInterval, projectShowLayoutIntervals } from '@/engine/showLayoutIntervals'
import * as previewThumbnailJpeg from '@/engine/previewThumbnailJpeg'
import { validateShowComposition } from '@/engine/showCompositionModel'

/**
 * Zone Layout definitions are authored in the Zone Map, reached from the Zone
 * rail on the Timeline, and edited in the Entity Detail panel (#629).
 */
async function openZoneLayout(user: ReturnType<typeof userEvent.setup>, layoutName: string): Promise<void> {
  // Layouts are per-interval now (#694): the inspector opens from the Add
  // menu's Edit link for the interval under the playhead.
  await user.click(screen.getByRole('button', { name: 'Add to Show' }))
  await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
  void layoutName
  await user.click(screen.getByRole('button', { name: "Open this interval's Zone Layout" }))
}

function changeCommittedNumber(label: string, value: string): void {
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
}

function createTransitionMenuShow(
  id: string,
  clips: Array<{ id: string; name: string; startMs: number; durationMs: number }>,
  transitions: Array<{ id: string; fromClipId: string; toClipId: string; durationMs: number }> = [],
): ShowRecord {
  const show = createDefaultShow(id, 'Transition menu fixture', 1000)
  const zoneId = show.zones[0].id
  show.composition = {
    version: 1,
    patternInstances: clips.map((clip) => ({
      id: `instance-${clip.id}`,
      pattern: { ...show.cells[0].pattern },
      patternName: clip.name,
      time: { timeScale: 1, timeOffsetMs: 0 },
    })),
    scenes: show.scenes.map((scene, index) => ({
      sceneId: scene.id,
      zones: [{
        zoneId,
        main: index === 0 ? clips.map((clip) => ({
          id: clip.id,
          instanceId: `instance-${clip.id}`,
          startMs: clip.startMs,
          durationMs: clip.durationMs,
          view: { mirror: false, phase: 0, brightness: 1 },
        })) : [],
        overlays: [],
      }],
    })),
    transitions: transitions.map((transition) => ({
      id: transition.id,
      fromPlacementId: transition.fromClipId,
      toPlacementId: transition.toClipId,
      kind: 'crossfade',
      durationMs: transition.durationMs,
      easing: { curve: 'linear' },
      crossfadePolicy: 'live-live',
    })),
  }
  return show
}

function memoryProvider(seedShows: ShowRecord[] = []): PersonalContentProvider {
  const patterns = new Map<string, PatternRecord>()
  const maps = new Map<string, MapRecord>()
  const mixins = new Map<string, MixinRecord>()
  const shows = new Map(seedShows.map((show) => [show.id, show]))
  const controllers = new Map<string, ControllerProfile>()
  return {
    id: 'memory-test',
    listPatterns: async () => [...patterns.values()],
    createPattern: async (record) => { patterns.set(record.id, record) },
    updatePattern: async (id, changes) => { patterns.set(id, { ...patterns.get(id)!, ...changes }) },
    deletePattern: async (id) => { patterns.delete(id) },
    listMaps: async () => [...maps.values()],
    createMap: async (record) => { maps.set(record.id, record) },
    updateMap: async (id, changes) => { maps.set(id, { ...maps.get(id)!, ...changes }) },
    deleteMap: async (id) => { maps.delete(id) },
    listMixins: async () => [...mixins.values()],
    createMixin: async (record) => { mixins.set(record.id, record) },
    updateMixin: async (id, changes) => { mixins.set(id, { ...mixins.get(id)!, ...changes }) },
    deleteMixin: async (id) => { mixins.delete(id) },
    listShows: async () => [...shows.values()],
    createShow: async (record) => { shows.set(record.id, record) },
    updateShow: async (id, changes) => { shows.set(id, { ...shows.get(id)!, ...changes }) },
    deleteShow: async (id) => { shows.delete(id) },
    listControllerProfiles: async () => [...controllers.values()],
    createControllerProfile: async (profile) => { controllers.set(profile.id, profile) },
    updateControllerProfile: async (id, changes) => { controllers.set(id, { ...controllers.get(id)!, ...changes }) },
    deleteControllerProfile: async (id) => { controllers.delete(id) },
    getLastActive: async () => undefined,
    setLastActive: async () => {},
    getDemoOverrides: async () => undefined,
    setDemoOverrides: async () => {},
  }
}

class ConnectedControllerProvider extends NullControllerProvider {
  private readonly connectedStatus: ControllerStatus = {
    kind: 'connected',
    controller: { id: 'ctrl-live', address: '10.0.0.5', deviceId: null, name: 'Bench PB' },
  }

  getStatus(): ControllerStatus {
    return this.connectedStatus
  }

  subscribe(): () => void {
    return () => {}
  }
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useControllerProfileStore.setState(controllerProfileInitialState)
  usePreviewStore.setState(previewInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
  useControllerStore.setState(controllerInitialState)
  resetControllerProvider()
})

afterEach(() => resetControllerProvider())

describe('ShowEditor (#318)', () => {
  it('renders the production Show as one unified timeline workspace (#579)', () => {
    const show = createDefaultShow('show-unified-workspace', 'Unified workspace', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByRole('region', { name: 'Show timeline' })
    const toolbar = within(timeline).getByRole('toolbar', { name: 'Show timeline controls' })
    expect(toolbar).toHaveClass('flex-nowrap', 'overflow-x-auto')
    expect(toolbar).not.toHaveClass('flex-wrap')
    expect(within(toolbar).getByRole('group', { name: 'Show navigator' })).toBeInTheDocument()
    expect(within(timeline).getByRole('slider', { name: 'Show playhead' })).toBeInTheDocument()
    expect(within(timeline).getAllByRole('button', { name: 'Select TestPattern1D' })).not.toHaveLength(0)
    expect(within(timeline).queryByRole('button', { name: 'Add scene' })).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('button', { name: 'Edit Scene 1' })).not.toBeInTheDocument()
    expect(within(timeline).queryByText('X-ray')).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('group', { name: 'Transition lane' })).not.toBeInTheDocument()
    expect(within(timeline).queryByText('Show time')).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('group', { name: 'Timeline zoom controls' })).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('button', { name: /Select zone/i })).not.toBeInTheDocument()
  })

  it('identifies a selected boundary by Show time and incoming Pattern (#634)', () => {
    const show = createDefaultShow('show-boundary-identity', 'Boundary identity', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    fireEvent.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))

    const inspector = screen.getByRole('region', { name: 'Transition properties' })
    expect(inspector).toHaveTextContent('32.0: CometLoom · crossfade')
    expect(inspector).not.toHaveTextContent('Scene 1')
    expect(inspector).not.toHaveTextContent('Scene 2')
  })

  it('omits obsolete Scene controls and decoration from Clip properties (#634)', () => {
    const show = createDefaultShow('show-scene-control-removal', 'Control removal', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Select CometLoom' }))

    const inspector = screen.getByRole('region', { name: 'Clip properties' })
    expect(within(inspector).queryByLabelText('Hold scenes')).not.toBeInTheDocument()
    expect(inspector).not.toHaveTextContent(/scene boundary/i)
  })

  it('orders the unified toolbar as transport, Navigator/Fit, then authoring commands (#592, #63)', () => {
    const show = createDefaultShow('show-unified-toolbar', 'Unified toolbar', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const toolbar = screen.getByRole('toolbar', { name: 'Show timeline controls' })
    const transport = within(toolbar).getByRole('group', { name: 'Show transport controls' })
    const view = within(toolbar).getByRole('group', { name: 'Timeline view controls' })
    const authoring = within(toolbar).getByRole('group', { name: 'Show authoring commands' })

    expect(transport).toHaveClass('gap-1')
    expect(transport.parentElement).toHaveClass('mr-1')
    expect(within(transport).getByLabelText('Show time')).toHaveClass('ml-1', 'gap-0.5')
    expect(within(view).getByRole('group', { name: 'Show navigator' })).toBeInTheDocument()
    expect(within(view).getByRole('button', { name: 'Fit timeline to Show' })).toBeDisabled()
    expect(view).toHaveClass('max-w-[210px]', 'flex-[0_1_180px]', 'gap-1')
    expect(toolbar).toHaveClass('ml-[-3px]', 'pl-0', 'pr-0')
    expect(view).toHaveClass('border-l')
    expect(view).not.toHaveClass('border-r', 'border-x')
    expect(within(authoring).getByRole('button', { name: 'Open Zones' })).toBeInTheDocument()
    expect(within(authoring).getByRole('button', { name: 'Add to Show' })).toBeInTheDocument()
    expect(within(authoring).getByRole('button', { name: 'Add to Show' }).querySelector('.timeline-command-label-primary')).toHaveTextContent('Add')
    expect(within(authoring).getByRole('button', { name: 'Split at playhead' }).querySelector('.timeline-command-label-secondary')).toHaveTextContent('Split')
    expect(within(authoring).getByRole('button', { name: 'Clone selection' }).querySelector('.timeline-command-label-secondary')).toHaveTextContent('Clone')
    expect(within(authoring).getByRole('button', { name: 'Make Group from selection' }).querySelector('.timeline-command-label-tertiary')).toHaveTextContent('Group')
    expect(within(authoring).getByRole('button', { name: 'Open Zones' }).querySelector('.timeline-command-label')).toBeNull()
    expect(within(authoring).getByRole('button', { name: 'Open Zones' })).toHaveAttribute('data-size', 'icon-xs')
    expect(authoring).toHaveClass('ml-auto')
    expect(within(authoring).getByRole('button', { name: 'Snap playhead' })).toHaveAttribute('data-size', 'icon-xs')
    expect(within(authoring).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add to Show',
      'Split at playhead',
      'Clone selection',
      'Make Group from selection',
      'Undo Show edit',
      'Redo Show edit',
      'Open Zones',
      'Snap playhead',
      'Hide Markers',
    ])
    expect(transport.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(view.compareDocumentPosition(authoring) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('uses one visual state language for Show authoring toolbar controls', () => {
    const show = createDefaultShow('show-toolbar-states', 'Toolbar states', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const add = screen.getByRole('button', { name: 'Add to Show' })
    const split = screen.getByRole('button', { name: 'Split at playhead' })
    const clone = screen.getByRole('button', { name: 'Clone selection' })
    const group = screen.getByRole('button', { name: 'Make Group from selection' })
    const undo = screen.getByRole('button', { name: 'Undo Show edit' })
    const zones = screen.getByRole('button', { name: 'Open Zones' })
    const snap = screen.getByRole('button', { name: 'Snap playhead' })
    const markers = screen.getByRole('button', { name: 'Hide Markers' })

    for (const control of [add, zones]) {
      expect(control).toHaveClass('text-zinc-400', 'hover:text-amber-200')
    }
    for (const control of [split, clone, group, undo]) {
      expect(control).toHaveClass('cursor-not-allowed', 'text-zinc-700', 'hover:text-zinc-700')
      expect(control).not.toHaveClass('hover:text-amber-200')
    }
    expect(clone).toHaveClass('disabled:pointer-events-auto', 'disabled:opacity-100')
    for (const toggle of [snap, markers]) {
      expect(toggle).toHaveClass('bg-amber-400/10', 'text-amber-300', 'hover:text-amber-200')
    }
  })

  it('uses one Marker control for both visibility and snapping (#63)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-unified-marker-mode', 'Unified marker mode', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const hideMarkers = screen.getByRole('button', { name: 'Hide Markers' })
    expect(hideMarkers).toHaveAttribute('aria-pressed', 'true')
    await user.click(hideMarkers)

    expect(screen.getByRole('button', { name: 'Show Markers' })).toHaveAttribute('aria-pressed', 'false')
    expect(useShowEditorSessionStore.getState()).toMatchObject({
      markersVisible: false,
      markerSnapEnabled: false,
    })
  })

  it('keeps the ruler and timeline overlays aligned with Clips through Show End (#588)', () => {
    const show = createDefaultShow('show-unified-time-canvas', 'Unified time canvas', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const finalClip = screen.getByRole('button', { name: 'Select CometLoom' })
    const clipTimeCanvas = finalClip.parentElement
    const ruler = screen.getByRole('slider', { name: 'Show playhead' }).parentElement
    const markers = screen.getByLabelText('Timeline Markers and Show End')
    const playheadOverlay = screen.getByTestId('show-timeline-playhead-surface')
    const playheadHitTarget = screen.getByTestId('show-timeline-playhead-hit-target')
    const playheadCapSurface = screen.getByTestId('show-timeline-playhead-cap-surface')
    const playheadCap = screen.getByTestId('show-timeline-playhead-cap')
    const navigatorPlayhead = screen.getByTestId('show-timeline-navigator-playhead')
    const navigatorPlayheadCap = screen.getByTestId('show-timeline-navigator-playhead-cap')
    const navigatorStartHandle = screen.getByRole('button', { name: 'Resize visible range start' })
    const navigatorEndHandle = screen.getByRole('button', { name: 'Resize visible range end' })
    const grid = screen.getByTestId('show-timeline-grid')
    const scrollRegion = screen.getByTestId('show-timeline-scroll-region')
    const showEnd = screen.getByRole('button', { name: 'Show End at 62 seconds' })
    const showEndHandle = screen.getByTestId('show-timeline-end-handle')
    const firstLayoutInterval = screen.getByTestId('show-timeline-ruler').querySelector('[data-show-layout-interval]')

    expect(clipTimeCanvas).not.toBeNull()
    expect(ruler).not.toBeNull()
    expect(ruler?.style.gridColumn).toBe(clipTimeCanvas?.style.gridColumn)
    expect(markers.style.gridColumn).toBe(clipTimeCanvas?.style.gridColumn)
    expect(ruler).not.toHaveTextContent('Default · main')
    expect(clipTimeCanvas).not.toHaveTextContent('Default · main')
    expect(grid.style.minWidth).toBe('0px')
    expect(grid).toHaveClass('isolate', 'px-1')
    expect(scrollRegion).toHaveClass('scrollbar-hidden')
    expect(playheadOverlay).toHaveClass('z-30')
    expect(playheadOverlay.style.gridRowStart).toBe(ruler?.style.gridRowStart)
    expect(playheadHitTarget).toHaveStyle({ left: '0%' })
    expect(playheadCapSurface).toContainElement(playheadCap)
    expect(playheadCapSurface).toHaveClass('z-[45]')
    expect(playheadCapSurface.style.gridColumn).toBe(playheadOverlay.style.gridColumn)
    expect(playheadCapSurface.style.gridRow).toBe(playheadOverlay.style.gridRow)
    expect(playheadCap).toHaveClass(
      'absolute',
      'z-[45]',
      'h-0',
      'w-0',
      '-translate-x-1/2',
      'border-x-[4px]',
      'border-t-[6px]',
    )
    expect(playheadCap).not.toHaveClass('-ml-1')
    expect(playheadCap).toHaveStyle({ left: '0%' })
    expect(navigatorPlayhead).toHaveStyle({ left: '0%' })
    expect(navigatorPlayheadCap).toHaveStyle({
      left: '0%',
      transform: 'translateX(0)',
      clipPath: 'polygon(0 100%, 0 0, 100% 0)',
    })
    expect(navigatorPlayhead).toHaveClass('bg-live/60')
    expect(navigatorPlayhead).not.toHaveClass('bg-cyan-300')
    expect(navigatorStartHandle).toHaveClass('border-zinc-500/70', 'hover:border-amber-300', 'focus-visible:border-amber-300')
    expect(navigatorEndHandle).toHaveClass('border-zinc-500/70', 'hover:border-amber-300', 'focus-visible:border-amber-300')
    const playheadLine = screen.getByTestId('show-timeline-playhead')
    const readPlayheadRect = vi.spyOn(playheadLine, 'getBoundingClientRect')
    act(() => useShowTransportStore.getState().setPosition(show.id, 31_000))
    expect(navigatorPlayhead).toHaveStyle({ left: '50%' })
    expect(playheadCap).toHaveStyle({ left: '50%' })
    expect(readPlayheadRect).not.toHaveBeenCalled()
    expect(firstLayoutInterval).not.toBeInTheDocument()
    expect(markers).toHaveClass('z-[35]')
    expect(markers).not.toContainElement(showEnd)
    expect(showEnd).toHaveClass('fixed', 'z-[45]')
    expect(showEnd).not.toHaveClass('translate-x-1/2')
    expect(showEndHandle).toHaveClass('left-1/2', 'top-1/2', 'bg-current')
  })

  it('persists deterministic loop semantics when the unified Timeline first materializes a composition (#586)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-deterministic-composition', 'Deterministic composition', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0])
    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    fireEvent.change(brightness, { target: { value: '75%' } })
    fireEvent.blur(brightness)

    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.executionModel).toBe('deterministic-loop'))
  })

  it('progressively reveals the existing Zone workspace without burdening a one-Zone Show (#581)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-zone-disclosure', 'Zone disclosure', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByRole('region', { name: 'Show timeline' })
    expect(within(timeline).queryByRole('button', { name: /zone main properties/i })).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('button', { name: 'Open Zone Map' })).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()

    await user.click(within(timeline).getByRole('button', { name: 'Open Zones' }))

    expect(screen.queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()
    const grid = screen.getByTestId('show-timeline-grid')
    expect(within(grid).getByRole('button', { name: 'Open zone main properties' })).toBeInTheDocument()
    expect(grid.style.gridTemplateColumns.startsWith('108px')).toBe(true)

    await user.click(within(grid).getByRole('button', { name: 'Open Zone Map' }))

    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })
    expect(timeline).not.toContainElement(zoneMap)
    expect(zoneMap).toHaveClass('fixed', 'z-[80]')
    expect(within(zoneMap).getByText('main')).toBeInTheDocument()
    expect(within(zoneMap).getByRole('button', { name: 'Add Zone' })).toBeInTheDocument()
    expect(within(zoneMap).queryByRole('button', { name: 'Collapse zone main' })).not.toBeInTheDocument()

    // The map rows carry the basics only (#63): a color swatch picker,
    // inline rename, and delete - no icon picker, no focus, no collapse.
    await user.click(within(zoneMap).getByRole('button', { name: 'Zone color main' }))
    await user.click(within(zoneMap).getByRole('button', { name: 'main color #f97316' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].zones[0].color).toBe('#f97316'))
    await user.click(within(zoneMap).getByRole('button', { name: 'Add Zone' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].zones).toHaveLength(2))
    expect(within(zoneMap).queryByRole('button', { name: /^Focus zone / })).not.toBeInTheDocument()
    expect(within(zoneMap).getAllByRole('button', { name: /^Delete zone / })).toHaveLength(2)
  })

  it('arms Zone Map row deletion behind an explicit confirm (#63)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-delete-confirm', 'Zone delete confirm', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const timeline = screen.getByRole('region', { name: 'Show timeline' })
    await user.click(within(timeline).getByRole('button', { name: 'Open Zones' }))
    await user.click(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Open Zone Map' }))
    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })

    // First click only arms; the zone survives until the red confirm.
    await user.click(within(zoneMap).getByRole('button', { name: 'Delete zone accent' }))
    expect(useShowStore.getState().shows[0].zones).toHaveLength(2)
    await user.click(within(zoneMap).getByRole('button', { name: 'Confirm delete zone accent' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].zones).toHaveLength(1))
  })

  it('dismisses the Zone Map without retiring the Zone rail (#629)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-map-dismiss', 'Zone map dismiss', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const timeline = screen.getByRole('region', { name: 'Show timeline' })

    await user.click(within(timeline).getByRole('button', { name: 'Open Zones' }))
    const grid = screen.getByTestId('show-timeline-grid')
    const trigger = within(grid).getByRole('button', { name: 'Open Zone Map' })

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Zone Map' })).toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'Close Zone Map' })).toBe(trigger)

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'Open zone main properties' })).toBeInTheDocument()

    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Zone Map' })).toBeInTheDocument()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()
    expect(within(grid).getByRole('button', { name: 'Open zone main properties' })).toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().zoneWorkspaceOpenByShowId[show.id]).toBe(true)
  })

  it('peels Escape one layer per press: Detail panel, then selection, then Zone Map (#672)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-escape-layering', 'Escape layering', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    const grid = screen.getByTestId('show-timeline-grid')
    // The map no longer hosts panel-opening rows (#694), and opening it
    // dismisses an open panel, so the peel covers the layers that coexist:
    // panel, then selection, then - separately - the map.
    await user.click(within(grid).getByRole('button', { name: 'Open zone accent properties' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Show timeline' })).toHaveFocus())

    await user.click(within(grid).getByRole('button', { name: 'Open Zone Map' }))
    expect(screen.getByRole('dialog', { name: 'Zone Map' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument())
  })

  it('gives each Zone header one disclosure and one properties affordance (#632)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-header', 'Zone header', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    const grid = screen.getByTestId('show-timeline-grid')

    expect(within(grid).queryByRole('button', { name: 'Select zone main' })).not.toBeInTheDocument()
    const collapse = within(grid).getByRole('button', { name: 'Collapse zone main' })
    const properties = within(grid).getByRole('button', { name: 'Open zone main properties' })
    const header = collapse.parentElement
    expect(header).toContainElement(properties)
    expect(collapse.compareDocumentPosition(properties) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(properties).toHaveAttribute('data-show-selection-key', 'zone:zone-1')

    await user.click(properties)
    expect(screen.getByRole('button', { name: 'Remove zone main' })).toBeInTheDocument()
  })

  it('fits a collapsed Zone header in its own row and drops the pixel count (#632)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-collapsed-header', 'Collapsed header', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    const grid = screen.getByTestId('show-timeline-grid')
    expect(within(grid).getByText('24px')).toBeInTheDocument()

    await user.click(within(grid).getByRole('button', { name: 'Collapse zone accent' }))

    const header = within(grid).getByRole('button', { name: 'Expand zone accent' }).parentElement!
    expect(within(header).getByText('accent')).toBeInTheDocument()
    expect(within(header).queryByText('24px')).not.toBeInTheDocument()
    expect(header.className).toContain('overflow-hidden')
    expect(within(grid).getByText('60px')).toBeInTheDocument()
  })

  it('names a collapsed Zone summary only while its rail header cannot (#632)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-collapsed-label', 'Collapsed label', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    await user.click(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Collapse zone accent' }))

    expect(screen.queryByTestId('collapsed-zone-layout-label')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Close Zones' }))

    const label = screen.getByTestId('collapsed-zone-layout-label')
    expect(label).toHaveTextContent('accent')
    expect(screen.queryByText('24px')).not.toBeInTheDocument()
    // Sticky, so the name follows a scrolled timeline, which requires living
    // outside the collapsed lane: that lane clips, and a clipping box becomes the
    // scrollport sticky resolves against (#632).
    expect(label).toHaveClass('sticky')
    const summary = screen.getByRole('img', { name: 'Collapsed zone accent timeline' })
    expect(summary).not.toContainElement(label)
    expect(label.getBoundingClientRect().top).toBeGreaterThanOrEqual(summary.getBoundingClientRect().top)
    expect(label.getBoundingClientRect().bottom).toBeLessThanOrEqual(summary.getBoundingClientRect().bottom)
  })

  it('leaves Space with Show playback after using the Zone rail controls (#632)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-space', 'Zone rail space', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    const grid = screen.getByTestId('show-timeline-grid')

    const collapse = within(grid).getByRole('button', { name: 'Collapse zone accent' })
    await user.click(collapse)
    collapse.focus()
    await user.keyboard(' ')
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(within(grid).getByRole('button', { name: 'Expand zone accent' })).toBeInTheDocument()

    const mapTrigger = within(grid).getByRole('button', { name: 'Open Zone Map' })
    await user.click(mapTrigger)
    mapTrigger.focus()
    await user.keyboard(' ')
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(screen.getByRole('dialog', { name: 'Zone Map' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await user.click(screen.getByRole('button', { name: 'Close Zones' }))
    const picker = screen.getByRole('button', { name: 'Expand zone accent' })
    picker.focus()
    await user.keyboard(' ')
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(screen.getByRole('button', { name: 'Expand zone accent' })).toBeInTheDocument()
  })

  it('leaves native Tab traversal intact for Zone rail controls (#632)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-tab', 'Zone rail tab', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    const grid = screen.getByTestId('show-timeline-grid')

    const collapse = within(grid).getByRole('button', { name: 'Collapse zone accent' })
    collapse.focus()
    expect(fireEvent.keyDown(collapse, { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(collapse)

    const mapTrigger = within(grid).getByRole('button', { name: 'Open Zone Map' })
    mapTrigger.focus()
    expect(fireEvent.keyDown(mapTrigger, { key: 'Tab', shiftKey: true })).toBe(true)
    expect(document.activeElement).toBe(mapTrigger)

    const properties = within(grid).getByRole('button', { name: 'Open zone accent properties' })
    properties.focus()
    expect(fireEvent.keyDown(properties, { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(properties)

    await user.click(screen.getByRole('button', { name: 'Close Zones' }))
    const picker = screen.getByRole('button', { name: 'Collapse zone accent' })
    picker.focus()
    expect(fireEvent.keyDown(picker, { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(picker)
  })

  it('collapses Zones independently and retains a micro Zone picker when the map closes (#581)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-collapse', 'Zone collapse', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    const { unmount } = render(<ShowEditor showId={show.id} />)
    const timeline = screen.getByRole('region', { name: 'Show timeline' })

    expect(within(timeline).getAllByRole('button', { name: /^Collapse zone / })).toHaveLength(2)
    await user.click(within(timeline).getByRole('button', { name: 'Open Zones' }))
    await user.click(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Open Zone Map' }))
    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })
    // Collapse belongs to the Zone rail alone; the map rows stay minimal (#63).
    expect(within(zoneMap).queryByRole('button', { name: /Collapse zone/ })).not.toBeInTheDocument()
    await user.click(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Collapse zone main' }))

    expect(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Expand zone main' })).toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().collapsedZoneIdsByShowId[show.id]).toEqual(['zone-1'])

    await user.click(within(timeline).getByRole('button', { name: 'Close Zones' }))
    expect(screen.queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()
    expect(within(timeline).getByRole('button', { name: 'Expand zone main' })).toBeInTheDocument()
    expect(within(timeline).getByRole('button', { name: 'Collapse zone accent' })).toBeInTheDocument()
    expect(within(timeline).queryByText('Show time')).not.toBeInTheDocument()

    await user.click(within(timeline).getByRole('button', { name: 'Expand zone main' }))
    expect(useShowEditorSessionStore.getState().collapsedZoneIdsByShowId[show.id]).toBeUndefined()
    expect(screen.queryByRole('img', { name: 'Collapsed zone main timeline' })).not.toBeInTheDocument()

    await user.click(within(timeline).getByRole('button', { name: 'Collapse zone accent' }))
    expect(useShowEditorSessionStore.getState().collapsedZoneIdsByShowId[show.id]).toEqual(['zone-2'])

    unmount()
    render(<ShowEditor showId={show.id} />)
    expect(screen.getByRole('img', { name: 'Collapsed zone accent timeline' })).toBeInTheDocument()
  })

  it('keeps the Zone Map to Zones; Layout intervals own their layout (#694)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-zone-layout-authoring', 'Zone Layout authoring', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.queryByRole('button', { name: 'Add routing layout' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Default routing mode')).not.toBeInTheDocument()
    expect(screen.getByText(/Zones are authored in the Zone Map/i)).toBeInTheDocument()

    // The registry is gone: no layout rows, no Add Zone Layout.
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    await user.click(screen.getByRole('button', { name: 'Open Zone Map' }))
    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })
    expect(within(zoneMap).queryByRole('button', { name: /Open Zone Layout/ })).not.toBeInTheDocument()
    expect(within(zoneMap).queryByRole('button', { name: 'Add Zone Layout' })).not.toBeInTheDocument()

    // The inspector reaches through the interval and has no name field: the
    // layout's identity is its kind.
    await openZoneLayout(user, 'Default')
    const panel = screen.getByRole('region', { name: 'Zone Layout properties' })
    expect(panel).toBeInTheDocument()
    expect(screen.queryByLabelText(/Zone Layout name/)).not.toBeInTheDocument()
  })

  it('defines and places a Zone Layout in one pass from the Add menu (#629)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-zone-layout-new-option', 'Zone Layout at playhead', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 0 })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    const dialog = screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
    // No registry select: Append copies the layout under the playhead into a
    // fresh definition and places it in one pass (#694).
    expect(within(dialog).queryByRole('combobox', { name: 'Zone Layout' })).not.toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Append' }))

    await waitFor(() => expect(useShowStore.getState().shows[0].routingLayouts).toHaveLength(2))
    const added = useShowStore.getState().shows[0].routingLayouts[1]
    expect(added.logical).toEqual(useShowStore.getState().shows[0].routingLayouts[0].logical)
    await waitFor(() => {
      const intervals = projectShowLayoutIntervals(useShowStore.getState().shows[0])
      expect(intervals.map((interval) => interval.layoutId)).toEqual([show.routingLayouts[0].id, added.id])
    })

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    await user.click(screen.getByRole('button', { name: "Open this interval's Zone Layout" }))
    expect(screen.queryByRole('dialog', { name: 'Zone Layout at playhead' })).not.toBeInTheDocument()
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(within(panel).getByRole('region', { name: 'Zone Layout properties' })).toBeInTheDocument()
    expect(panel).toBeVisible()
  })

  it('keeps Zone Map pointer presses out of the timeline marquee (#629)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-zone-map-marquee', 'Zone map marquee', 1000), { name: 'accent' })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Zones' }))
    await user.click(screen.getByRole('button', { name: 'Open Zone Map' }))
    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })

    fireEvent.pointerDown(within(zoneMap).getByText('Zone Map'), { button: 0, clientX: 40, clientY: 40 })

    expect(document.querySelector('[data-show-timeline-marquee]')).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Zone Map' })).toBeInTheDocument()
  })

  it('inserts and appends sequential Zone Layout intervals from the unified toolbar (#582)', async () => {
    const user = userEvent.setup()
    const show = addShowRoutingLayout(createDefaultShow('show-layout-authoring', 'Layout authoring', 1000), 'Alternate')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 10_000 })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    let dialog = screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
    expect(screen.getByTestId('show-timeline-toolbar')).not.toContainElement(dialog)
    expect(dialog).toHaveClass('fixed')
    const duration = within(dialog).getByRole('textbox', { name: 'Layout interval duration in seconds exact time' })
    await user.clear(duration)
    await user.type(duration, '3')
    await user.click(within(dialog).getByRole('button', { name: 'Insert here' }))

    // Insert places a fresh copy of the playhead interval's layout (#694).
    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      const copyId = saved.routingLayouts[2]?.id
      expect(copyId).toBeDefined()
      expect(saved.routingLayouts[2].logical).toEqual(saved.routingLayouts[0].logical)
      expect(projectShowLayoutIntervals(saved).map((interval) => [interval.layoutId, interval.durationMs])).toEqual([
        ['layout-1', 10_000],
        [copyId, 3_000],
        ['layout-1', 52_000],
      ])
    })

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    dialog = screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
    await user.click(within(dialog).getByRole('button', { name: 'Append' }))
    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      const intervals = projectShowLayoutIntervals(saved)
      const appendedId = intervals[intervals.length - 1].layoutId
      expect(appendedId).not.toBe('layout-1')
      expect(intervals[intervals.length - 1].durationMs).toBe(3_000)
      expect(saved.routingLayouts.find((layout) => layout.id === appendedId)?.logical)
        .toEqual(saved.routingLayouts[0].logical)
    })
  })

  it('places a Zone Layout copy as one Show edit that a single Undo removes (#694 review P2)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-layout-atomic-append', 'Atomic layout append', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 0 })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    const dialog = screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
    await user.click(within(dialog).getByRole('button', { name: 'Append' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].routingLayouts).toHaveLength(2))

    await act(async () => { await useShowStore.getState().undoShow(show.id) })
    const restored = useShowStore.getState().shows[0]
    expect(restored.routingLayouts).toHaveLength(1)
    expect(projectShowLayoutIntervals(restored)).toHaveLength(1)
  })

  it('selects an appended Zone Layout routing interval from the timeline (#624)', async () => {
    const user = userEvent.setup()
    const show = addShowRoutingLayout(createDefaultShow('show-routing-interval-select', 'Routing interval selection', 1000), 'Alternate')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    // Arrange the placed interval directly; the Add flow's copy semantics have
    // their own coverage (#694, #582).
    act(() => {
      useShowStore.setState({
        shows: [appendShowLayoutInterval(show, { layoutId: show.routingLayouts[1].id, durationMs: 4_000 })],
      })
    })
    await waitFor(() => expect(projectShowLayoutIntervals(useShowStore.getState().shows[0])).toHaveLength(2))

    const interval = await screen.findByRole('button', { name: 'Select Physical ranges routing interval 1' })
    expect(interval).toHaveAttribute('aria-pressed', 'false')
    await user.click(interval)

    expect(interval).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
    expect(screen.getByLabelText('Destination routing layout')).toHaveValue(show.routingLayouts[1].id)
    changeCommittedNumber('Routing transfer duration seconds exact time', '2')
    await user.selectOptions(screen.getByLabelText('Routing transfer easing'), 'ease-in-out')
    await user.selectOptions(screen.getByLabelText('Routing transfer direction'), 'reverse')

    await waitFor(() => expect(useShowStore.getState().shows[0].transitions).toContainEqual(expect.objectContaining({
      kind: 'routing',
      layoutId: show.routingLayouts[1].id,
      durationMs: 2_000,
      routingDirection: 'reverse',
      easing: { curve: 'quadratic', direction: 'in-out' },
    })))
  })

  it('keeps repeated routing interval controls distinct from visual transitions (#624)', async () => {
    const user = userEvent.setup()
    const base = addShowRoutingLayout(createDefaultShow('show-routing-interval-identities', 'Routing interval identities', 1000), 'Alternate')
    const once = appendShowLayoutInterval(base, { layoutId: base.routingLayouts[1].id, durationMs: 4_000 })
    const show = appendShowLayoutInterval(once, { layoutId: base.routingLayouts[1].id, durationMs: 5_000 })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const first = screen.getByRole('button', { name: 'Select Physical ranges routing interval 1' })
    const second = screen.getByRole('button', { name: 'Select Physical ranges routing interval 2' })
    expect(first).toHaveAttribute('data-show-selection-key', 'transition:routing-scene-2')
    expect(second).toHaveAttribute('data-show-selection-key', 'transition:routing-scene-3')
    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(second).toHaveAttribute('aria-pressed', 'false')

    await user.click(second)

    expect(first).toHaveAttribute('aria-pressed', 'false')
    expect(second).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Destination routing layout')).toHaveValue(base.routingLayouts[1].id)
    expect(useShowStore.getState().shows[0].transitions.find((transition) => transition.id === 'transition-scene-1')).toMatchObject({
      kind: 'crossfade',
      durationMs: 2_000,
    })
  })

  it('keeps Insert Time visible and explains when the playhead is inside a Transition (#584)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-insert-time-reason', 'Insert reason', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 31_000 })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Time' }))
    const dialog = screen.getByRole('dialog', { name: 'Insert Time' })
    expect(within(dialog).getByText('Insert Time is unavailable inside a Transition.')).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Insert' })).toBeDisabled()
  })

  it('creates a global Marker at the playhead from the ruler affordance (#584)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-marker-create', 'Marker create', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 4_023 })

    render(<ShowEditor showId={show.id} />)

    const markerSource = screen.getByRole('button', { name: 'Add Marker at playhead' })
    expect(screen.getByTestId('show-timeline-ruler')).not.toContainElement(markerSource)
    expect(screen.getByTestId('show-timeline-scroll-region')).not.toContainElement(markerSource)
    expect(markerSource.parentElement).toHaveAttribute('data-show-marker-source-gutter')
    expect(screen.getByTestId('show-timeline-grid').style.gridTemplateColumns).toMatch(/^0px /)
    await user.click(markerSource)

    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers).toEqual([
      expect.objectContaining({ timeMs: 4_023, name: 'Marker 1' }),
    ]))
    await user.click(screen.getByRole('button', { name: 'Marker 1 at 4.023 seconds' }))
    const details = screen.getByRole('dialog', { name: 'Marker 1 details' })
    const markerTime = within(details).getByRole('textbox', { name: 'Marker time in seconds exact time' })
    fireEvent.keyDown(within(details).getByRole('button', { name: 'Adjust with time slider', description: 'Marker time in seconds' }), { key: 'Enter' })
    const markerSliderDialog = screen.getByRole('dialog', { name: 'Time slider controls' })
    fireEvent.pointerDown(markerSliderDialog, { pointerId: 77 })
    expect(screen.getByRole('dialog', { name: 'Marker 1 details' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time slider', description: 'Marker time in seconds' }), { key: 'Escape' })
    await user.clear(markerTime)
    await user.type(markerTime, '4.125')
    fireEvent.blur(markerTime)

    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers?.[0].timeMs).toBe(4_125))
    expect(screen.getByRole('button', { name: 'Marker 1 at 4.125 seconds' })).toBeInTheDocument()

    await user.clear(markerTime)
    fireEvent.blur(markerTime)
    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers?.[0].timeMs).toBe(4_125))
    expect(markerTime).toHaveValue('4.125')

    await user.click(screen.getByTestId('show-timeline-toolbar'))
    expect(screen.queryByRole('dialog', { name: 'Marker 1 details' })).not.toBeInTheDocument()
  })

  it('previews a new Marker while dragging it from the gutter onto the ruler', async () => {
    const show = createDefaultShow('show-marker-drag-create', 'Marker drag create', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const markerSource = screen.getByRole('button', { name: 'Add Marker at playhead' })
    const ruler = screen.getByTestId('show-timeline-ruler')
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      x: 100,
      y: 0,
      left: 100,
      right: 720,
      top: 0,
      bottom: 24,
      width: 620,
      height: 24,
      toJSON: () => ({}),
    })

    expect(markerSource).toHaveClass('cursor-ew-resize')
    expect(markerSource).not.toHaveClass('cursor-grab')

    fireEvent.pointerDown(markerSource, { pointerId: 11, clientX: 80, altKey: true })
    fireEvent.pointerMove(markerSource, { pointerId: 11, clientX: 90, altKey: true })
    expect(screen.queryByTestId('show-timeline-marker-preview')).not.toBeInTheDocument()

    fireEvent.pointerMove(markerSource, { pointerId: 11, clientX: 410, altKey: true })
    const preview = screen.getByTestId('show-timeline-marker-preview')
    expect(preview).toHaveStyle({ left: '50%' })
    expect(useShowStore.getState().shows[0].composition?.markers ?? []).toEqual([])

    fireEvent.pointerUp(markerSource, { pointerId: 11, clientX: 410, altKey: true })
    expect(screen.queryByTestId('show-timeline-marker-preview')).not.toBeInTheDocument()
    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers).toEqual([
      expect.objectContaining({ timeMs: 31_000, name: 'Marker 1' }),
    ]))
  })

  it('lands a dragged-out Marker on the drop grid: whole seconds, tenths with Shift (#667)', async () => {
    const show = createDefaultShow('show-marker-drag-grid', 'Marker drag grid', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const markerSource = screen.getByRole('button', { name: 'Add Marker at playhead' })
    const ruler = screen.getByTestId('show-timeline-ruler')
    vi.spyOn(ruler, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 0, left: 100, right: 720, top: 0, bottom: 24, width: 620, height: 24,
      toJSON: () => ({}),
    })
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })

    // The raw pointer time is 14,570ms; the default drop grid lands on 15s.
    fireEvent.pointerDown(markerSource, { pointerId: 21, clientX: 80 })
    fireEvent.pointerMove(markerSource, { pointerId: 21, clientX: 245.7 })
    expect(screen.getByTestId('show-timeline-marker-preview')).toHaveStyle({
      left: `${15_000 / 62_000 * 100}%`,
    })

    // Shift mid-drag asks for tenths: the same pointer resolves to 14.6s.
    fireEvent.pointerMove(markerSource, { pointerId: 21, clientX: 245.7, shiftKey: true })
    expect(screen.getByTestId('show-timeline-marker-preview')).toHaveStyle({
      left: `${14_600 / 62_000 * 100}%`,
    })

    fireEvent.pointerUp(markerSource, { pointerId: 21, clientX: 245.7, shiftKey: true })
    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers).toEqual([
      expect.objectContaining({ timeMs: 14_600, name: 'Marker 1' }),
    ]))
  })

  it('moves a Marker with a live preview onto the drop grid (#667)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-marker-move-grid', 'Marker move grid', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 4_023 })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add Marker at playhead' }))
    const marker = await screen.findByRole('button', { name: 'Marker 1 at 4.023 seconds' })

    const surface = screen.getByLabelText('Timeline Markers and Show End')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 0, left: 100, top: 0, right: 720, bottom: 100, width: 620, height: 100,
      toJSON: () => ({}),
    })

    // The raw pointer time is 9,730ms. The handle itself previews at 10s while
    // the pointer is still down; the document does not change until release.
    fireEvent.pointerDown(marker, { pointerId: 31, clientX: 140 })
    fireEvent.pointerMove(marker, { pointerId: 31, clientX: 197.3 })
    expect(marker).toHaveStyle({ left: `${10_000 / 62_000 * 100}%` })
    expect(useShowStore.getState().shows[0].composition?.markers?.[0].timeMs).toBe(4_023)

    fireEvent.pointerUp(marker, { pointerId: 31, clientX: 197.3 })
    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers?.[0].timeMs).toBe(10_000))

    // A short Shift-fine nudge must not magnetize back to the Marker's own
    // previous time: +0.5s of travel lands on 10.5s, not 10s (#667).
    const movedMarker = await screen.findByRole('button', { name: 'Marker 1 at 10 seconds' })
    fireEvent.pointerDown(movedMarker, { pointerId: 32, clientX: 200 })
    fireEvent.pointerMove(movedMarker, { pointerId: 32, clientX: 205, shiftKey: true })
    expect(movedMarker).toHaveStyle({ left: `${10_500 / 62_000 * 100}%` })
    fireEvent.pointerUp(movedMarker, { pointerId: 32, clientX: 205, shiftKey: true })
    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers?.[0].timeMs).toBe(10_500))
  })

  it('lands the Show End handle on the drop grid: whole seconds, tenths with Shift (#667)', async () => {
    const show = createDefaultShow('show-end-grid', 'Show End grid', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const surface = screen.getByLabelText('Timeline Markers and Show End')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 0, left: 100, top: 0, right: 720, bottom: 100, width: 620, height: 100,
      toJSON: () => ({}),
    })
    const showEnd = screen.getByRole('button', { name: 'Show End at 62 seconds' })
    // +63.7px of travel is +6,370ms raw; the default grid previews 68s.
    fireEvent.pointerDown(showEnd, { pointerId: 41, clientX: 720 })
    fireEvent.pointerMove(showEnd, { pointerId: 41, clientX: 783.7 })
    expect(screen.getByRole('button', { name: 'Show End at 68 seconds' })).toBeInTheDocument()

    // Shift mid-drag refines the same travel to 68.4s.
    fireEvent.pointerMove(showEnd, { pointerId: 41, clientX: 783.7, shiftKey: true })
    expect(screen.getByRole('button', { name: 'Show End at 68.4 seconds' })).toBeInTheDocument()

    fireEvent.pointerUp(showEnd, { pointerId: 41, clientX: 783.7, shiftKey: true })
    await waitFor(() => expect(showModel.showLoopDurationMs(useShowStore.getState().shows[0])).toBe(68_400))
  })

  it('confirms a Marker created underneath the playhead without moving its insertion time', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-marker-click-confirmation', 'Marker click confirmation', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 4_023 })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add Marker at playhead' }))

    expect(await screen.findByRole('status', { name: 'Marker added at playhead' })).toHaveTextContent('Marker added')
    expect(useShowStore.getState().shows[0].composition?.markers).toEqual([
      expect.objectContaining({ timeMs: 4_023 }),
    ])
  })

  it('centers Marker heads on quiet dashed stems', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-marker-visuals', 'Marker visuals', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 10_000 })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add Marker at playhead' }))

    const marker = await screen.findByRole('button', { name: 'Marker 1 at 10 seconds' })
    const stem = screen.getByLabelText('Timeline Markers and Show End')
      .querySelector<HTMLElement>('[data-show-timeline-marker-stem]')
    const head = marker.querySelector('[data-show-timeline-marker-head]')
    expect(marker).toHaveClass('top-0', 'h-7')
    expect(marker).not.toHaveClass('inset-y-0')
    expect(stem).toHaveClass('pointer-events-none', 'inset-y-0')
    expect(marker).not.toContainElement(stem)
    expect(stem).toHaveClass(
      'left-1/2',
      '-translate-x-1/2',
      'border-l',
      'border-dashed',
      'border-current',
    )
    expect(stem).not.toHaveClass('w-px', 'bg-current')
    expect(head).toHaveClass('left-1/2', '-translate-x-1/2')
    expect(head).not.toHaveClass('-left-[3px]')
  })

  it('uses the standard compact delete action in the Marker dialog header', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-marker-delete-treatment', 'Marker delete treatment', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 10_000 })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add Marker at playhead' }))
    await user.click(screen.getByRole('button', { name: 'Marker 1 at 10 seconds' }))

    const details = screen.getByRole('dialog', { name: 'Marker 1 details' })
    const deleteMarker = within(details).getByRole('button', { name: 'Delete Marker 1' })
    expect(deleteMarker).toHaveAttribute('data-size', 'icon-xs')
    expect(deleteMarker).toHaveClass('text-zinc-500')
    expect(deleteMarker.parentElement?.parentElement).toContainElement(within(details).getByText('Marker'))
    expect(within(details).queryByText('Remove Marker')).not.toBeInTheDocument()
  })

  it('centers a solid Show End diamond on the timeline boundary', () => {
    const show = createDefaultShow('show-end-visuals', 'Show End visuals', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const anchor = screen.getByTestId('show-timeline-end-anchor')
    const scrollRegion = screen.getByTestId('show-timeline-scroll-region')
    vi.spyOn(scrollRegion, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 1000,
      top: 0,
      bottom: 300,
      width: 1000,
      height: 300,
      toJSON: () => ({}),
    })
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({
      x: 620,
      y: 40,
      left: 620,
      right: 621,
      top: 40,
      bottom: 200,
      width: 1,
      height: 160,
      toJSON: () => ({}),
    })
    fireEvent(window, new Event('resize'))

    const showEnd = screen.getByRole('button', { name: 'Show End at 62 seconds' })
    const diamond = screen.getByTestId('show-timeline-end-handle')
    expect(showEnd).toHaveStyle({ left: '620.5px', top: '40px' })
    expect(showEnd).toHaveClass('-translate-x-1/2', '-translate-y-1/2')
    expect(diamond).toHaveClass(
      'left-1/2',
      'top-1/2',
      '-translate-x-1/2',
      '-translate-y-1/2',
      'h-[5px]',
      'w-[5px]',
      'rotate-45',
      'bg-current',
    )
    expect(diamond).not.toHaveClass('border', 'bg-[#060608]')
  })

  it('drags a Marker against the timeline surface rather than its boxless wrapper (#584)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-marker-drag', 'Marker drag', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 10_000 })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add Marker at playhead' }))

    const surface = screen.getByLabelText('Timeline Markers and Show End')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 0, left: 100, top: 0, right: 720, bottom: 100, width: 620, height: 100,
      toJSON: () => ({}),
    })
    const marker = screen.getByRole('button', { name: 'Marker 1 at 10 seconds' })
    fireEvent.pointerDown(marker, { pointerId: 1, clientX: 200, altKey: true })
    fireEvent.pointerUp(marker, { pointerId: 1, clientX: 410, altKey: true })

    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.markers?.[0].timeMs).toBe(31_000))
    fireEvent.click(marker)
    expect(screen.queryByRole('dialog', { name: 'Marker 1 details' })).not.toBeInTheDocument()
  })

  it('edits Show End in decimal seconds and clamps rather than truncating content (#584)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-end-edit', 'Show End', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show End at 62 seconds' }))
    const details = screen.getByRole('dialog', { name: 'Show End details' })
    const showEnd = within(details).getByRole('textbox', { name: 'Show End time in seconds exact time' })
    fireEvent.keyDown(within(details).getByRole('button', { name: 'Adjust with time slider', description: 'Show End time in seconds' }), { key: 'Enter' })
    const showEndSliderDialog = screen.getByRole('dialog', { name: 'Time slider controls' })
    fireEvent.pointerDown(showEndSliderDialog, { pointerId: 78 })
    expect(screen.getByRole('dialog', { name: 'Show End details' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('slider', { name: 'Time slider', description: 'Show End time in seconds' }), { key: 'Escape' })
    await user.clear(showEnd)
    await user.type(showEnd, '65.5')
    fireEvent.blur(showEnd)

    await waitFor(() => expect(showModel.showLoopDurationMs(useShowStore.getState().shows[0])).toBe(65_500))
    expect(screen.getByRole('button', { name: 'Show End at 65.5 seconds' })).toBeInTheDocument()

    await user.clear(showEnd)
    fireEvent.blur(showEnd)
    await waitFor(() => expect(showModel.showLoopDurationMs(useShowStore.getState().shows[0])).toBe(65_500))
    expect(showEnd).toHaveValue('65.5')
  })

  it('does not toggle Show End details after dragging its handle (#584)', async () => {
    const show = createDefaultShow('show-end-drag', 'Show End drag', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const surface = screen.getByLabelText('Timeline Markers and Show End')
    vi.spyOn(surface, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 0, left: 100, top: 0, right: 720, bottom: 100, width: 620, height: 100,
      toJSON: () => ({}),
    })
    const showEnd = screen.getByRole('button', { name: 'Show End at 62 seconds' })
    fireEvent.pointerDown(showEnd, { pointerId: 1, clientX: 720, altKey: true })
    fireEvent.pointerMove(showEnd, { pointerId: 1, clientX: 780, altKey: true })

    expect(showEnd).toHaveAttribute('data-show-end-dragging', 'true')
    expect(showEnd).not.toHaveAttribute('data-show-end-drag-blocked')
    expect(showEnd).toHaveClass('cursor-ew-resize')
    expect(screen.getByRole('button', { name: 'Show End at 68 seconds' })).toBeInTheDocument()
    expect(screen.getByTestId('show-timeline-grid').style.gridTemplateColumns).toContain('36000fr')

    fireEvent.pointerUp(showEnd, { pointerId: 1, clientX: 780, altKey: true })

    await waitFor(() => expect(showModel.showLoopDurationMs(useShowStore.getState().shows[0])).toBe(68_000))
    expect(showEnd).not.toHaveAttribute('data-show-end-dragging')
    const resizedShowEnd = screen.getByRole('button', { name: 'Show End at 68 seconds' })
    fireEvent.pointerDown(resizedShowEnd, { pointerId: 2, clientX: 720, altKey: true })
    fireEvent.pointerMove(resizedShowEnd, { pointerId: 2, clientX: 500, altKey: true })

    expect(resizedShowEnd).toHaveAttribute('data-show-end-drag-blocked', 'true')
    expect(resizedShowEnd).toHaveClass('cursor-not-allowed')
    expect(resizedShowEnd).not.toHaveClass('cursor-ew-resize')
    expect(screen.getByRole('button', { name: 'Show End at 62 seconds' })).toBeInTheDocument()
    expect(screen.getByTestId('show-timeline-grid').style.gridTemplateColumns).toContain('30000fr')

    fireEvent.pointerUp(resizedShowEnd, { pointerId: 2, clientX: 500, altKey: true })
    await waitFor(() => expect(showModel.showLoopDurationMs(useShowStore.getState().shows[0])).toBe(62_000))
    fireEvent.click(resizedShowEnd)
    expect(screen.queryByRole('dialog', { name: 'Show End details' })).not.toBeInTheDocument()
  })

  it('duplicates a Layout occurrence and makes one reused occurrence independent (#582)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-layout-reuse', 'Layout reuse', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    let dialog = screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
    await user.click(within(dialog).getByRole('button', { name: 'Duplicate Layout' }))

    await waitFor(() => expect(projectShowLayoutIntervals(useShowStore.getState().shows[0])).toHaveLength(2))
    const savedScenes = useShowStore.getState().shows[0].composition?.scenes ?? []
    expect(savedScenes[savedScenes.length - 1]?.zones[0].main).toEqual([])

    const reusedIntervals = projectShowLayoutIntervals(useShowStore.getState().shows[0])
    act(() => useShowTransportStore.getState().setPosition(show.id, reusedIntervals[1].startMs + 1))

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    dialog = screen.getByRole('dialog', { name: 'Zone Layout at playhead' })
    expect(within(dialog).getByText(/Separate this occurrence from 1 other use/)).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: /Make this Layout unique/i }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.routingLayouts).toHaveLength(2)
      const intervals = projectShowLayoutIntervals(saved)
      expect(intervals[0].layoutId).not.toBe(intervals[1].layoutId)
    })

    const unique = useShowStore.getState().shows[0]
    const uniqueInterval = projectShowLayoutIntervals(unique)[1]
    act(() => useShowTransportStore.getState().setPosition(unique.id, uniqueInterval.startMs + 1))
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Clip' }))
    const addDialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })

    await user.click(within(addDialog).getByRole('combobox', { name: 'Pattern for new Clip' }))
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      const activeZoneId = projectShowLayoutIntervals(saved)[1].zoneIds[0]
      const activeScene = saved.composition!.scenes.find((scene) => scene.sceneId === uniqueInterval.sceneIds[0])!
      expect(activeScene.zones.find((zone) => zone.zoneId === activeZoneId)?.main).toHaveLength(1)
    })
  })

  it('renders durable composition Clips on the unified global timeline (#580)', () => {
    const show = createDefaultShow('show-composition-workspace', 'Composition workspace', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-composed',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Composition-only Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-composed',
            instanceId: 'instance-composed',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByRole('region', { name: 'Show timeline' })
    expect(within(timeline).getByRole('button', { name: 'Select Composition-only Rings' })).toBeInTheDocument()
  })

  it('selects a linked Group occurrence and exposes its structural actions (#587)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-group-workspace', 'Group workspace', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: [{ zoneId, main: [], overlays: [] }],
      })),
      groupDefinitions: [{
        id: 'phrase',
        name: 'Pulse phrase',
        patternInstances: [{
          id: 'inside-instance', pattern: { kind: 'stock', id: 'Murmuration' }, patternName: 'Murmuration',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [{
          id: 'inside-clip', instanceId: 'inside-instance', layerOffset: 0,
          startMs: 0, durationMs: 1_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
      groupOccurrences: [{
        id: 'phrase-use', definitionId: 'phrase', sceneId: show.scenes[0].id, zoneId,
        startMs: 1_000, baseLayer: 0, translationX: 0, translationY: 0,
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Group Pulse phrase' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(panel).toHaveAttribute('data-owner-key', 'group:phrase-use')
    expect(within(panel).getByText('Pulse phrase')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Duplicate Group occurrence' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Make Group unique' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Ungroup occurrence' })).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Delete Group Pulse phrase' })).toBeInTheDocument()
    expect(within(panel).getByLabelText('Start seconds exact time')).toBeInTheDocument()
    expect(within(panel).getByLabelText('Base Layer')).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Pin Entity Detail Panel' }))
    const pinned = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(pinned).toHaveAttribute('data-pinned', 'true')
    await user.click(within(pinned).getByRole('button', { name: 'Ungroup occurrence' }))

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.groupOccurrences).toBeUndefined()
    })
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('isolates a Group modelessly, edits its linked definition, and exits with Escape (#587)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-group-isolation', 'Group isolation', 1000)
    const zoneId = show.zones[0].id
    const sceneId = show.scenes[0].id
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [{
        id: 'outside-instance', pattern: { ...show.cells[0].pattern }, patternName: 'Outside',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'outside-clip', instanceId: 'outside-instance', startMs: 4_000, durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
      groupDefinitions: [{
        id: 'phrase',
        name: 'Pulse phrase',
        patternInstances: [{
          id: 'inside-instance', pattern: { kind: 'stock', id: 'Murmuration' }, patternName: 'Murmuration',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [{
          id: 'inside-clip', instanceId: 'inside-instance', layerOffset: 0,
          startMs: 0, durationMs: 1_000, opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
      groupOccurrences: [
        { id: 'phrase-use-a', definitionId: 'phrase', sceneId, zoneId, startMs: 0, baseLayer: 0, translationX: 0, translationY: 0 },
        { id: 'phrase-use-b', definitionId: 'phrase', sceneId, zoneId, startMs: 2_000, baseLayer: 0, translationX: 0, translationY: 0 },
      ],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const groupChildren = screen.getAllByRole('button', { name: 'Select Group Pulse phrase' })
    fireEvent.doubleClick(groupChildren[0])

    expect(screen.getByRole('status', { name: 'Group isolation: Pulse phrase' })).toHaveTextContent('Editing Pulse phrase')
    expect(screen.getByRole('button', { name: 'Select Outside' })).toHaveAttribute('aria-disabled', 'true')
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(panel).toHaveAttribute('data-owner-key', 'group-clip:phrase-use-a:inside-clip')
    expect(within(panel).getByLabelText('Pattern automation targets')).toBeInTheDocument()
    expect(within(panel).queryByRole('region', { name: 'Animations overview' })).not.toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Animate Brightness' })).toBeVisible()
    changeCommittedNumber('Duration seconds exact time', '1.5')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.groupDefinitions?.[0].placements[0].durationMs).toBe(1_500)
    })
    await user.click(within(panel).getByRole('tab', { name: /^Effects/ }))
    await user.click(within(panel).getByRole('button', { name: 'Add Effect' }))
    expect(within(panel).getByRole('region', { name: 'Add Effect' })).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Add Mirror Effect' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.groupDefinitions?.[0].placements[0].view.mirror).toBe(true)
    })
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    expect(screen.queryByRole('status', { name: 'Group isolation: Pulse phrase' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Outside' })).not.toHaveAttribute('aria-disabled')
    await waitFor(() => expect(screen.getByLabelText('Show timeline')).toHaveFocus())

    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Select Group Pulse phrase' })[0])
    expect(screen.getByRole('status', { name: 'Group isolation: Pulse phrase' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pin Entity Detail Panel' }))
    await user.click(within(screen.getByRole('status', { name: 'Group isolation: Pulse phrase' }))
      .getByRole('button', { name: /Exit/ }))
    await user.click(screen.getAllByRole('button', { name: 'Select Group Pulse phrase' })[0])
    const groupPanel = document.querySelector<HTMLElement>('[data-owner-key="group:phrase-use-a"]')!
    await user.click(within(groupPanel).getByRole('button', { name: 'Ungroup occurrence' }))

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.groupOccurrences?.map((occurrence) => occurrence.id))
        .toEqual(['phrase-use-b'])
      expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    })
  })

  it('reconciles Group Property tracks after Pattern and Effect edits in Clip Detail (#628)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-group-property-reconciliation', 'Group Property reconciliation', 1000)
    const zoneId = show.zones[0].id
    const sceneId = show.scenes[0].id
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: [{ zoneId, main: [], overlays: [] }],
      })),
      groupDefinitions: [{
        id: 'phrase',
        name: 'Pulse phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'stock', id: 'Murmuration' },
          patternName: 'Murmuration',
          time: { timeScale: 1, timeOffsetMs: 0 },
          controlTargets: { sliderSpeed: 0.5 },
        }],
        placements: [{
          id: 'inside-clip',
          instanceId: 'inside-instance',
          layerOffset: 0,
          startMs: 0,
          durationMs: 1_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
          effects: [{ id: 'move', kind: 'translate', x: 0, y: 0 }],
        }],
        propertyTracks: [
          {
            id: 'track-control-speed',
            target: { kind: 'instance-control', instanceId: 'inside-instance', exportName: 'sliderSpeed' },
            keyframes: [
              { id: 'control-start', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
              { id: 'control-end', timeMs: 1_000, value: 0.8, easing: { curve: 'linear' } },
            ],
          },
          {
            id: 'track-effect-x',
            target: {
              kind: 'placement-effect',
              placementId: 'inside-clip',
              effectId: 'move',
              effectKind: 'translate',
              parameterId: 'translateX',
            },
            keyframes: [
              { id: 'effect-start', timeMs: 0, value: 0, easing: { curve: 'linear' } },
              { id: 'effect-end', timeMs: 1_000, value: 0.2, easing: { curve: 'linear' } },
            ],
          },
        ],
      }],
      groupOccurrences: [{
        id: 'phrase-use',
        definitionId: 'phrase',
        sceneId,
        zoneId,
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Select Group Pulse phrase' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })

    const source = within(panel).getByRole('combobox', { name: 'Source pattern' })
    // Focusing the picker starts a fresh search over an empty field (#63).
    await user.click(source)
    await user.type(source, 'Caustics')
    await user.click(screen.getByRole('option', { name: 'Caustics' }))
    await waitFor(() => {
      const current = useShowStore.getState().shows[0]
      expect(current.composition?.groupDefinitions?.[0].propertyTracks?.map((track) => track.id))
        .toEqual(['track-effect-x'])
      expect(validateShowComposition(current, current.composition!)).toEqual([])
    })

    await user.click(within(panel).getByRole('tab', { name: /^Effects/ }))
    await user.click(within(panel).getByRole('button', { name: 'More actions for Translate Effect' }))
    await user.click(screen.getByRole('menuitem', { name: 'Remove Translate Effect' }))
    await waitFor(() => {
      const current = useShowStore.getState().shows[0]
      expect(current.composition?.groupDefinitions?.[0].propertyTracks).toBeUndefined()
      expect(validateShowComposition(current, current.composition!)).toEqual([])
    })
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))
    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')
    })
  })

  it('closes a pinned Group child inspector when its owning Zone is removed', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-group-zone-removal', 'Group Zone removal', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[1].id
    show.composition = {
      version: 1,
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: show.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
      })),
      groupDefinitions: [{
        id: 'phrase',
        name: 'Accent phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'stock', id: 'Murmuration' },
          patternName: 'Murmuration',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [{
          id: 'inside-clip',
          instanceId: 'inside-instance',
          layerOffset: 0,
          startMs: 0,
          durationMs: 1_000,
          opacity: 1,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
      }],
      groupOccurrences: [{
        id: 'phrase-use',
        definitionId: 'phrase',
        sceneId,
        zoneId,
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Select Group Accent phrase' }))
    await user.click(screen.getByRole('button', { name: 'Pin Entity Detail Panel' }))
    await user.click(within(screen.getByRole('status', { name: 'Group isolation: Accent phrase' }))
      .getByRole('button', { name: /Exit/ }))

    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute(
      'data-owner-key',
      'group-clip:phrase-use:inside-clip',
    )
    act(() => {
      useShowStore.setState({
        shows: [removeShowZone(useShowStore.getState().shows[0], zoneId)],
      })
    })

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    })
  })

  it('edits an internal Group Transition while its linked definition is isolated (#587)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-group-transition', 'Group transition', 1000)
    const zoneId = show.zones[0].id
    const sceneId = show.scenes[0].id
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: [{ zoneId, main: [], overlays: [] }],
      })),
      groupDefinitions: [{
        id: 'phrase',
        name: 'Transition phrase',
        patternInstances: [{
          id: 'inside-instance',
          pattern: { kind: 'stock', id: 'Murmuration' },
          patternName: 'Murmuration',
          time: { timeScale: 1, timeOffsetMs: 0 },
        }],
        placements: [
          {
            id: 'inside-left',
            instanceId: 'inside-instance',
            layerOffset: 0,
            startMs: 0,
            durationMs: 1_000,
            opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          },
          {
            id: 'inside-right',
            instanceId: 'inside-instance',
            layerOffset: 0,
            startMs: 1_250,
            durationMs: 1_000,
            opacity: 1,
            view: { mirror: false, phase: 0, brightness: 1 },
          },
        ],
        transitions: [{
          id: 'inside-crossfade',
          fromPlacementId: 'inside-left',
          toPlacementId: 'inside-right',
          kind: 'crossfade',
          durationMs: 250,
          easing: { curve: 'linear' },
          crossfadePolicy: 'live-live',
        }],
      }],
      groupOccurrences: [{
        id: 'phrase-use-a',
        definitionId: 'phrase',
        sceneId,
        zoneId,
        startMs: 0,
        baseLayer: 0,
        translationX: 0,
        translationY: 0,
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    fireEvent.doubleClick(screen.getAllByRole('button', { name: 'Select Group Transition phrase' })[0])

    const transitions = screen.getAllByRole('button', {
      name: 'Edit crossfade Transition between Murmuration and Murmuration',
    })
    await user.click(transitions[0])
    expect(screen.getByRole('dialog', { name: 'Layer Transition Details' })).toBeInTheDocument()
    changeCommittedNumber('Layer Transition duration in seconds exact time', '0.5')

    await waitFor(() => {
      const definition = useShowStore.getState().shows[0].composition?.groupDefinitions?.[0]
      expect(definition?.transitions?.[0].durationMs).toBe(500)
      expect(definition?.placements.find((placement) => placement.id === 'inside-right')?.startMs).toBe(1_500)
    })

    await user.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between Murmuration and Murmuration',
    }))
    await user.click(screen.getByRole('button', { name: 'Reset to Cut' }))
    await waitFor(() => {
      const definition = useShowStore.getState().shows[0].composition?.groupDefinitions?.[0]
      expect(definition?.transitions).toBeUndefined()
      expect(definition?.placements.find((placement) => placement.id === 'inside-right')?.startMs).toBe(1_000)
    })

    await user.click(screen.getByRole('button', {
      name: 'Edit Cut between Murmuration and Murmuration',
    }))
    const palette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    await user.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))
    await waitFor(() => {
      const definition = useShowStore.getState().shows[0].composition?.groupDefinitions?.[0]
      expect(definition?.transitions?.[0]).toMatchObject({
        fromPlacementId: 'inside-left',
        toPlacementId: 'inside-right',
        kind: 'crossfade',
      })
      expect(definition?.placements.find((placement) => placement.id === 'inside-right')?.startMs)
        .toBeGreaterThan(1_000)
    })
  })

  it('refines a multi-Clip selection and creates one reusable Group (#587)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-create-group', 'Create Group', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      executionModel: 'deterministic-loop',
      patternInstances: [{
        id: 'shared', pattern: { ...show.cells[0].pattern }, patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [
            { id: 'left', instanceId: 'shared', startMs: 0, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
            { id: 'right', instanceId: 'shared', startMs: 1_250, durationMs: 1_000, view: { mirror: false, phase: 0, brightness: 1 } },
          ] : [],
          overlays: [],
        }],
      })),
      transitions: [{
        id: 'left-right-transition',
        fromPlacementId: 'left',
        toPlacementId: 'right',
        kind: 'crossfade',
        durationMs: 250,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const clips = screen.getAllByRole('button', { name: 'Select Rings' })
    await user.click(clips[0])
    await user.keyboard('{Shift>}')
    await user.click(clips[1])
    await user.keyboard('{/Shift}')
    const group = screen.getByRole('button', { name: 'Make Group from selection' })
    expect(group).not.toHaveAttribute('aria-disabled')
    await user.keyboard('{Shift>}')
    await user.click(clips[1])
    await user.keyboard('{/Shift}')
    expect(group).toHaveAttribute('aria-disabled', 'true')
    await user.click(group)
    expect(screen.getByRole('status', { name: 'Group unavailable' })).toHaveTextContent('complete non-Cut Transition chain')
    await user.keyboard('{Shift>}')
    await user.click(clips[1])
    await user.keyboard('{/Shift}')
    expect(group).not.toHaveAttribute('aria-disabled')
    await user.click(group)

    await waitFor(() => {
      const composition = useShowStore.getState().shows[0].composition!
      expect(composition.groupDefinitions).toHaveLength(1)
      expect(composition.groupOccurrences).toHaveLength(1)
      expect(composition.scenes[0].zones[0].main).toEqual([])
    })
    expect(screen.getAllByRole('button', { name: 'Select Group Group' })).toHaveLength(2)
  })

  it('explains that the Add-menu Transition command needs a selected Clip (#639)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-transition-selection', 'Add Transition selection', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', {
      name: 'Transition unavailable: Select a Clip first.',
    })
    expect(command).toBeDisabled()
    expect(within(command).getByText('Select a Clip first.')).toHaveClass('text-zinc-600')
  })

  it('explains when the selected Clip has no touching neighbour (#639)', async () => {
    const user = userEvent.setup()
    const show = createTransitionMenuShow('show-add-transition-isolated', [
      { id: 'clip-solo', name: 'Solo', startMs: 1_000, durationMs: 2_000 },
    ])
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Solo' }))
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const reason = 'This Clip does not touch another Clip. Move it next to another Clip first.'
    const command = screen.getByRole('menuitem', { name: `Transition unavailable: ${reason}` })
    expect(command).toBeDisabled()
    expect(within(command).getByText(reason)).toBeInTheDocument()
  })

  it('reuses the insertion planner explanation when the junction is already a Transition (#639)', async () => {
    const user = userEvent.setup()
    const show = createTransitionMenuShow('show-add-transition-existing', [
      { id: 'clip-outgoing', name: 'Outgoing', startMs: 1_000, durationMs: 2_000 },
      { id: 'clip-incoming', name: 'Incoming', startMs: 5_000, durationMs: 2_000 },
    ], [
      { id: 'existing-crossfade', fromClipId: 'clip-outgoing', toClipId: 'clip-incoming', durationMs: 2_000 },
    ])
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Outgoing' }))
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const reason = 'This junction already has a Transition. Edit that one instead of adding another.'
    const command = screen.getByRole('menuitem', { name: `Transition unavailable: ${reason}` })
    expect(command).toBeDisabled()
    expect(within(command).getByText(reason)).toBeInTheDocument()
  })

  it('reuses the insertion planner explanation when a Cut has no free time (#639)', async () => {
    const user = userEvent.setup()
    const show = createTransitionMenuShow('show-add-transition-no-room', [
      { id: 'clip-penultimate', name: 'Penultimate', startMs: 26_000, durationMs: 2_000 },
      { id: 'clip-final', name: 'Final', startMs: 28_000, durationMs: 2_000 },
    ])
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Penultimate' }))
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const reason = 'There is no free time after the last Clip on this Layer. Shorten a Clip or extend Show End, then come back.'
    const command = screen.getByRole('menuitem', { name: `Transition unavailable: ${reason}` })
    expect(command).toBeDisabled()
    expect(within(command).getByText(reason)).toBeInTheDocument()
  })

  it('opens the Add-menu Transition command at the preferred trailing Cut (#639)', async () => {
    const user = userEvent.setup()
    const show = createTransitionMenuShow('show-add-transition-menu', [
      { id: 'clip-left', name: 'Left', startMs: 1_000, durationMs: 2_000 },
      { id: 'clip-middle', name: 'Middle', startMs: 3_000, durationMs: 2_000 },
      { id: 'clip-right', name: 'Right', startMs: 5_000, durationMs: 2_000 },
    ])
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Middle' }))
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', { name: 'Transition to Right' })
    expect(command).toBeEnabled()

    command.focus()
    expect(command).toHaveFocus()
    await user.keyboard('{Enter}')

    const palette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    expect(within(palette).getByText('Middle to Right')).toBeInTheDocument()
  })

  it('falls back to an enabled leading Cut when the trailing junction already transitions (#639)', async () => {
    const user = userEvent.setup()
    const show = createTransitionMenuShow('show-add-transition-leading', [
      { id: 'clip-leading-left', name: 'Left', startMs: 1_000, durationMs: 2_000 },
      { id: 'clip-leading-middle', name: 'Middle', startMs: 3_000, durationMs: 2_000 },
      { id: 'clip-leading-right', name: 'Right', startMs: 7_000, durationMs: 2_000 },
    ], [
      {
        id: 'trailing-crossfade',
        fromClipId: 'clip-leading-middle',
        toClipId: 'clip-leading-right',
        durationMs: 2_000,
      },
    ])
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Middle' }))
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const command = screen.getByRole('menuitem', { name: 'Transition from Left' })
    expect(command).toBeEnabled()

    await user.click(command)

    const palette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    expect(within(palette).getByText('Left to Middle')).toBeInTheDocument()
  })

  it('opens the Transition palette from a Cut and inserts literal duration (#583)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-cut-junction', 'Cut junction', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-cut',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Cut source',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [
            {
              id: 'clip-left',
              instanceId: 'instance-cut',
              startMs: 1_000,
              durationMs: 2_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
            {
              id: 'clip-right',
              instanceId: 'instance-cut',
              startMs: 3_000,
              durationMs: 2_000,
              view: { mirror: false, phase: 0, brightness: 1 },
            },
          ] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const cut = screen.getByRole('button', { name: 'Edit Cut between Cut source and Cut source' })
    expect(cut).toHaveClass('z-[15]')
    await user.click(cut)
    const palette = screen.getByRole('dialog', { name: 'Choose Layer Transition' })
    expect(within(palette).getByRole('textbox', { name: 'Transition duration in seconds exact time' })).toHaveValue('2')
    await user.click(within(palette).getByRole('button', { name: 'Use Crossfade Transition' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0].composition!
      expect(saved.transitions).toEqual([
        expect.objectContaining({
          fromPlacementId: 'clip-left',
          toPlacementId: 'clip-right',
          kind: 'crossfade',
          durationMs: 2_000,
        }),
      ])
      expect(saved.scenes[0].zones[0].main.find((clip) => clip.id === 'clip-right')?.startMs).toBe(5_000)
    })

    await user.click(screen.getByRole('button', { name: 'Edit crossfade Transition between Cut source and Cut source' }))
    expect(screen.getByRole('dialog', { name: 'Layer Transition Details' })).toBeInTheDocument()
    changeCommittedNumber('Layer Transition duration in seconds exact time', '1.5')
    await waitFor(() => {
      const saved = useShowStore.getState().shows[0].composition!
      expect(saved.transitions?.[0].durationMs).toBe(1_500)
      expect(saved.scenes[0].zones[0].main.find((clip) => clip.id === 'clip-right')?.startMs).toBe(4_500)
    })

    await user.click(screen.getByRole('button', { name: 'Edit crossfade Transition between Cut source and Cut source' }))
    await user.click(screen.getByRole('button', { name: 'Reset to Cut' }))
    await waitFor(() => {
      const saved = useShowStore.getState().shows[0].composition!
      expect(saved.transitions).toEqual([])
      expect(saved.scenes[0].zones[0].main.find((clip) => clip.id === 'clip-right')?.startMs).toBe(3_000)
    })
    expect(screen.getByRole('button', { name: 'Edit Cut between Cut source and Cut source' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Cut between Cut source and Cut source' }))
    await user.click(within(screen.getByRole('dialog', { name: 'Choose Layer Transition' })).getByRole('button', { name: 'Use Crossfade Transition' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].composition?.transitions).toHaveLength(1))
    await user.click(screen.getAllByRole('button', { name: 'Select Cut source' })[1])
    fireEvent.keyDown(document, { key: 'Delete' })
    const warning = screen.getByRole('alertdialog')
    expect(within(warning).getByText(/also removes its connected Transition/)).toBeInTheDocument()
    await user.click(within(warning).getByRole('button', { name: 'Remove Clip and Transition' }))
    await waitFor(() => {
      const saved = useShowStore.getState().shows[0].composition!
      expect(saved.transitions).toEqual([])
      expect(saved.scenes[0].zones[0].main.map((clip) => clip.id)).toEqual(['clip-left'])
    })
  })

  it('adds a Pattern Clip at the playhead and selects it (#580)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-at-playhead', 'Add at playhead', 1000)
    show.composition = {
      version: 1,
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: show.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Clip' }))

    const addDialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    const chooser = within(addDialog).getByRole('combobox', { name: 'Pattern for new Clip' })
    expect(chooser).toHaveValue('')
    expect(within(addDialog).queryByRole('button', { name: 'Add Clip' })).not.toBeInTheDocument()
    await user.click(chooser)
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.patternInstances).toHaveLength(1)
      expect(saved?.composition?.scenes[0].zones[0].main).toHaveLength(1)
    })
    const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
    const patternName = saved.composition!.patternInstances[0].patternName
    const clip = screen.getByRole('button', { name: `Select ${patternName}` })
    expect(clip).toHaveAttribute('data-show-composition-clip', 'true')
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument())
    expect(screen.getByRole('textbox', { name: 'Start seconds exact time' })).toHaveValue('0')
    expect(screen.getByRole('textbox', { name: 'Duration seconds exact time' })).toHaveValue('5')

    await user.click(clip)
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    await user.click(clip)
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument())
    const ownedPortal = document.createElement('div')
    ownedPortal.dataset.showDetailOwnedPortal = 'true'
    document.body.append(ownedPortal)
    fireEvent.pointerDown(ownedPortal)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
    ownedPortal.remove()
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Show timeline' }))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('opens the Clip chooser at an empty Layer double-click and adds there (#601)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-at-layer-pointer', 'Add at Layer pointer', 1000)
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'existing-overlay-instance',
        pattern: { kind: 'stock', id: 'AuroraSphere' },
        patternName: 'Existing overlay',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        zones: show.zones.map((zone) => ({
          zoneId: zone.id,
          main: [],
          overlays: [{
            id: `overlay-${scene.id}`,
            name: 'Layer 2',
            placements: sceneIndex === 0 ? [{
              id: 'existing-overlay-clip',
              instanceId: 'existing-overlay-instance',
              startMs: 0,
              durationMs: 20_000,
              opacity: 1,
              view: { mirror: false, phase: 0, brightness: 1 },
            }, {
              id: 'future-overlay-clip',
              instanceId: 'existing-overlay-instance',
              startMs: 28_000,
              durationMs: 2_000,
              opacity: 1,
              view: { mirror: false, phase: 0, brightness: 1 },
            }] : [],
          }],
        })),
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', {
      configurable: true,
      value: 620,
    })
    const overlayLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="overlay"]')!
    vi.spyOn(overlayLayer, 'getBoundingClientRect').mockReturnValue({
      x: 100, y: 120, left: 100, top: 120, right: 720, bottom: 160, width: 620, height: 40,
      toJSON: () => ({}),
    })

    fireEvent.doubleClick(overlayLayer, { clientX: 300.37, clientY: 150 })

    const addDialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    expect(addDialog).toHaveStyle({ left: '300.37px', top: '154px' })
    expect(within(addDialog).getByText('00:20.0')).toBeInTheDocument()
    const chooser = within(addDialog).getByRole('combobox', { name: 'Pattern for new Clip' })
    expect(chooser).toHaveValue('')
    expect(chooser).toBeEnabled()
    expect(within(addDialog).queryByRole('button', { name: 'Add Clip' })).not.toBeInTheDocument()
    await user.click(chooser)
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].overlays[0].placements).toContainEqual(expect.objectContaining({
        startMs: 20_000,
        durationMs: 5_000,
      }))
      expect(saved.composition?.scenes[0].zones[0].main).toEqual([])
    })

    fireEvent.doubleClick(overlayLayer, { clientX: 377, clientY: 150 })
    const occupiedSnapDialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    expect(within(occupiedSnapDialog).getByText('00:27.7')).toBeInTheDocument()
    const occupiedSnapChooser = within(occupiedSnapDialog).getByRole('combobox', { name: 'Pattern for new Clip' })
    await user.click(occupiedSnapChooser)
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].overlays[0].placements).toContainEqual(expect.objectContaining({
        startMs: 27_700,
        durationMs: 300,
      }))
    })

    fireEvent.doubleClick(overlayLayer, { clientX: 350.37, clientY: 150, altKey: true })
    const unsnappedDialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    const unsnappedChooser = within(unsnappedDialog).getByRole('combobox', { name: 'Pattern for new Clip' })
    await user.click(unsnappedChooser)
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].overlays[0].placements).toContainEqual(expect.objectContaining({
        startMs: 25_037,
      }))
    })
  })

  it('restores a Clip timing field when the engine refuses an overlap (#614)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-refused-inspector-timing', 'Refused inspector timing', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-refused-timing',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Refusal source',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'clip-refused-left',
            instanceId: 'instance-refused-timing',
            startMs: 0,
            durationMs: 5_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }, {
            id: 'clip-refused-right',
            instanceId: 'instance-refused-timing',
            startMs: 5_000,
            durationMs: 5_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: 'Select Refusal source' })[0])

    const start = screen.getByRole('textbox', { name: 'Start seconds exact time' })
    expect(start).toHaveValue('0')
    fireEvent.change(start, { target: { value: '7' } })
    fireEvent.blur(start)

    expect(useShowStore.getState().shows[0].composition?.scenes[0].zones[0].main[0].startMs).toBe(0)
    expect(start).toHaveValue('0')

    const grip = screen.getByRole('button', { name: 'Adjust with time slider', description: 'Start seconds' })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 200, y: 100, left: 200, right: 218, top: 100, bottom: 120, width: 18, height: 20, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })
    expect(screen.getByRole('slider', { name: 'Time slider', description: 'Start seconds' })).toHaveAttribute('aria-valuetext', '0s')
  })

  it('keeps Clip details open while dragging a portaled domain slider (#610)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-domain-slider-detail', 'Domain slider detail', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const grip = within(panel).getByRole('button', { name: 'Adjust with multiplier slider', description: 'Animation speed' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 398, top: 100, bottom: 124, width: 18, height: 24, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 7, clientX: 389, clientY: 112 })
    fireEvent.pointerUp(grip, { pointerId: 7, clientX: 389, clientY: 112 })
    const slider = screen.getByRole('slider', { name: 'Multiplier slider', description: 'Animation speed' })
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(slider, { pointerId: 8, clientX: 420, clientY: 112 })

    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
    expect(slider).toBeInTheDocument()
  })

  it('defers a paused Clip Animation speed edit until the slider is released (#63)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-deferred-speed-slider', 'Deferred speed slider', 1000)
    const provider = memoryProvider([show])
    const updateShow = vi.spyOn(provider, 'updateShow')
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const grip = within(panel).getByRole('button', {
      name: 'Adjust with multiplier slider',
      description: 'Animation speed',
    })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 398, top: 100, bottom: 124, width: 18, height: 24, toJSON: () => ({}),
    })
    fireEvent.keyDown(grip, { key: 'Enter' })

    const slider = screen.getByRole('slider', {
      name: 'Multiplier slider',
      description: 'Animation speed',
    })
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(slider, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(slider, { pointerId: 8, clientX: 420, clientY: 112 })
    fireEvent.input(slider, { target: { value: '650' } })
    fireEvent.input(slider, { target: { value: '700' } })

    expect(slider).toHaveAttribute('aria-valuetext', '1.48x')
    expect(within(panel).getByRole('textbox', { name: 'Animation speed exact multiplier' }))
      .toHaveValue('1.48')
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(useShowStore.getState().shows[0].cells[0].adaptations.timeScale).toBe(1)
    expect(updateShow).not.toHaveBeenCalled()
    expect(usePreviewStore.getState().isRunning).toBe(false)

    fireEvent.pointerUp(slider, { pointerId: 8, clientX: 520, clientY: 112 })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.patternInstances[0].time.timeScale)
        .toBeCloseTo(1.48, 8)
    })
    expect(updateShow).toHaveBeenCalledTimes(1)
    expect(useShowPreviewOverrideStore.getState().show).toBeNull()
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })

  it('adds a Clip to the topmost available Layer without asking for a destination (#594)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-auto-add-layer', 'Automatic Add Layer', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-occupied-top',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Occupied top',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: [],
          overlays: [{
            id: `top-${scene.id}`,
            name: 'Top',
            placements: sceneIndex === 0 ? [{
              id: 'occupied-top',
              instanceId: 'instance-occupied-top',
              startMs: 0,
              durationMs: 5_000,
              opacity: 1,
              view: { mirror: false, phase: 0, brightness: 1 },
            }] : [],
          }, {
            id: `lower-${scene.id}`,
            name: 'Lower',
            placements: [],
          }],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Clip' }))

    const addDialog = screen.getByRole('dialog', { name: 'Add Clip at playhead' })
    expect(within(addDialog).queryByRole('combobox', { name: 'Destination Layer' })).not.toBeInTheDocument()
    await user.click(within(addDialog).getByRole('combobox', { name: 'Pattern for new Clip' }))
    await user.click(screen.getByRole('option', { name: 'AuroraSphere' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].overlays[0].placements).toHaveLength(1)
      expect(saved.composition?.scenes[0].zones[0].overlays[1].placements).toHaveLength(1)
      expect(saved.composition?.scenes[0].zones[0].main).toEqual([])
    })
  })

  it('keeps the selected Clip ring above the lit Clip surface (#592)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-selected-clip-ring', 'Selected Clip ring', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    await user.click(clip)

    expect(clip).toHaveAttribute('aria-pressed', 'true')
    expect(clip.style.boxShadow).toContain('var(--color-live)')
  })

  it('restores unified Clip summaries in the timeline and Entity Detail (#599)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-unified-clip-summary', 'Unified Clip summary', 1000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-summary-ui',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Summary Rings',
        time: { timeScale: 0.5, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        propertyTracks: scene.id === sceneId ? [{
          id: 'track-summary-speed',
          target: { kind: 'instance-time-scale', instanceId: 'instance-summary-ui' },
          keyframes: [
            { id: 'summary-speed-0', timeMs: 0, value: 0.5, easing: { curve: 'linear' } },
            { id: 'summary-speed-1', timeMs: 1_000, value: 1, easing: { curve: 'linear' } },
          ],
        }] : undefined,
        zones: [{
          zoneId,
          main: scene.id === sceneId ? [{
            id: 'placement-summary-ui',
            instanceId: 'instance-summary-ui',
            startMs: 0,
            durationMs: 5_000,
            view: { mirror: false, phase: 0, brightness: 0.75 },
            effects: [{ id: 'hue-summary-ui', kind: 'hue', turns: 0.1 }],
          }] : [],
          overlays: [],
        }],
      })),
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select Summary Rings' })
    expect(within(clip).getByText('.5–1x')).toBeInTheDocument()
    expect(within(clip).getByText('75%')).toBeInTheDocument()
    expect(within(clip).getByText('.1t')).toBeInTheDocument()

    await user.click(clip)

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const header = panel.querySelector<HTMLElement>('section[data-entity-family="clip"] > header')!
    expect(within(header).getByRole('heading', { name: 'Summary Rings' })).toBeInTheDocument()
    expect(header).not.toHaveTextContent('Main Layer')
    expect(header).not.toHaveTextContent('Pattern Clip')
    const summary = within(panel).getByRole('region', { name: 'Clip summary' })
    expect(summary).toHaveTextContent('Animation speed0.5–1x')
    expect(summary).toHaveTextContent('Brightness75%')
    expect(summary).toHaveTextContent('Hue0.1t')
    expect(summary).toHaveTextContent('Animations — 1')
  })

  it('navigates each configuration summary category to its exact owning field or row (#650)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-navigational-summary', 'Navigational summary', 1000)
    show.stageMapId = 'plane'
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
      controlTargets: { sliderSpeed: 0.42 },
      adaptations: {
        ...show.cells[0].adaptations,
        timeScale: 0.5,
        brightness: 0.75,
        mirror: true,
        phase: 0.2,
        timeOffsetMs: 250,
      },
      transform: { positionX: 0.25, positionY: 0, rotation: 0, scaleX: 1, scaleY: 1 },
      viewport: { enabled: true, x: 0.1, y: 0, width: 0.8, height: 1 },
      effects: [{ id: 'threshold-navigation', kind: 'threshold', amount: 1, threshold: 0.2 }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: 'Select CometLoom' })[0])
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const summary = within(panel).getByRole('region', { name: 'Clip summary' })

    const speed = within(summary).getByRole('button', {
      name: 'Animation speed 0.5x; go to Pattern Speed field',
    })
    speed.focus()
    await user.keyboard('{Enter}')
    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Animation speed exact multiplier' })).toHaveFocus()
    })

    await user.click(within(summary).getByRole('button', {
      name: 'Speed 42%; go to Pattern control',
    }))
    await waitFor(() => {
      expect(within(panel).getByRole('textbox', { name: 'Speed target exact percentage' })).toHaveFocus()
    })

    await user.click(within(summary).getByRole('button', {
      name: 'Brightness 75%; go to Clip header Brightness field',
    }))
    await waitFor(() => {
      expect(within(panel).getByRole('textbox', { name: 'Brightness exact percentage' })).toHaveFocus()
    })

    await user.click(within(summary).getByRole('button', {
      name: 'Position X 0.25; go to Place Position X field',
    }))
    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Content X exact position' })).toHaveFocus()
    })

    await user.click(within(summary).getByRole('button', {
      name: 'Viewport On · x 0.1, y 0, 0.8 × 1; go to Place Viewport fields',
    }))
    await waitFor(() => {
      expect(within(panel).getByRole('textbox', { name: 'Viewport X exact position' })).toHaveFocus()
    })

    await user.click(within(panel).getByRole('tab', { name: /^Effects/ }))
    await user.click(within(panel).getByRole('button', { name: 'Add Effect' }))
    expect(within(panel).getByRole('region', { name: 'Add Effect' })).toBeInTheDocument()
    await user.click(within(summary).getByRole('button', {
      name: 'Mirror On; go to Effects Mirror row',
    }))
    const mirrorRow = within(panel).getByTestId('show-effect-mirror')
    await waitFor(() => {
      expect(within(panel).queryByRole('region', { name: 'Add Effect' })).not.toBeInTheDocument()
      expect(within(panel).getByRole('tab', { name: /^Effects/ })).toHaveAttribute('aria-selected', 'true')
      expect(mirrorRow).toHaveFocus()
    })

    await user.click(within(summary).getByRole('button', {
      name: /Threshold .*; go to Effects row/,
    }))
    const thresholdRow = within(panel).getByTestId('show-effect-threshold-navigation')
    await waitFor(() => expect(thresholdRow).toHaveFocus())

    await user.click(within(summary).getByRole('button', {
      name: 'Phase 0.2; go to Playback Phase field',
    }))
    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Playback/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Phase exact phase' })).toHaveFocus()
    })

    expect(within(summary).getByText('Start offset')).toBeInTheDocument()
    expect(within(summary).queryByRole('button', { name: /Start offset/ })).not.toBeInTheDocument()
  })

  it('reveals retained Viewport fields without enabling a disabled Aperture (#650 review)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-disabled-viewport-summary', 'Disabled viewport summary', 1000)
    show.stageMapId = 'plane'
    show.cells[0] = {
      ...show.cells[0],
      viewport: { enabled: false, x: 0.1, y: 0, width: 0.8, height: 1 },
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const summary = within(panel).getByRole('region', { name: 'Clip summary' })

    await user.click(within(summary).getByRole('button', {
      name: 'Viewport Off · x 0.1, y 0, 0.8 × 1; go to Place Viewport fields',
    }))

    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Viewport X exact position' })).toHaveFocus()
    })
    expect(within(panel).getByRole('button', { name: 'Content' })).toHaveAttribute('aria-pressed', 'false')
    expect(within(panel).getByRole('button', { name: 'Aperture' })).toHaveAttribute('aria-pressed', 'true')
    expect(within(panel).getByText('Aperture (off)')).toBeInTheDocument()
    expect(within(panel).getByRole('application', {
      name: 'Placement pad. Arrow keys nudge the aperture rectangle.',
    })).toBeInTheDocument()
    expect(useShowStore.getState().shows[0]!.cells[0]!.viewport!.enabled).toBe(false)
  })

  it('keeps summary navigation operable while a built-in destination remains disabled (#650)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-read-only-navigational-summary', 'Read-only navigational summary', 1000)
    show.cells[0] = {
      ...show.cells[0],
      adaptations: { ...show.cells[0].adaptations, timeScale: 0.5 },
    }

    render(<ShowEditor showId={show.id} showOverride={show} readOnly />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const summary = within(panel).getByRole('region', { name: 'Clip summary' })

    const speed = within(summary).getByRole('button', {
      name: 'Animation speed 0.5x; go to Pattern Speed field',
    })
    expect(speed).toBeEnabled()
    await user.click(speed)

    await waitFor(() => {
      const destination = within(panel).getByTestId('clip-summary-target-speed')
      expect(within(panel).getByRole('tab', { name: /^Pattern/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Animation speed exact multiplier' })).toBeDisabled()
      expect(destination).toHaveFocus()
    })
  })

  it('keeps compatibility Clip animation summaries aligned between timeline and Detail (#599 review)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-compatibility-clip-summary', 'Compatibility Clip summary', 1000)
    show.transitions = [{
      ...show.transitions![0],
      propertyTransitions: {
        timeScale: {
          fromByCellId: { [show.cells[0].id]: 0.5 },
          durationMs: 1_000,
          easing: { curve: 'linear' },
        },
      },
    }]
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    expect(within(clip).getByText('animated')).toBeInTheDocument()

    await user.click(clip)

    expect(within(screen.getByRole('dialog', { name: 'Entity Detail Panel' }))
      .getByRole('region', { name: 'Clip summary' })).toHaveTextContent('Animation speedanimated')
  })

  it('authors boundary speed and repeat scales as multipliers while persisting raw values (#610)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-boundary-domain-units', 'Boundary domain units', 1000)
    show.scenes = [
      { ...show.scenes[0], sampleTargets: { repeatScale: 1 } },
      { ...show.scenes[1], sampleTargets: { repeatScale: 2 } },
    ]
    show.cells[1] = {
      ...show.cells[1],
      adaptations: { ...show.cells[1].adaptations, timeScale: 0.25 },
    }
    show.transitions = [{
      ...show.transitions![0],
      propertyTransitions: {
        timeScale: {
          fromByCellId: { [show.cells[1].id]: 0.5 },
          durationMs: 1_000,
        },
        sample: {
          repeatScale: { from: 1.5, durationMs: 1_000 },
        },
      },
    }]
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', {
      name: 'Edit crossfade Transition between TestPattern1D and CometLoom',
    }))
    await user.click(screen.getByText('Advanced transition controls'))

    expect(screen.getByRole('textbox', { name: 'Animation speed start main exact multiplier' })).toHaveValue('0.5')
    expect(screen.getByRole('textbox', { name: 'Animation speed target main exact multiplier' })).toHaveValue('0.25')
    expect(screen.getByRole('textbox', { name: 'Repeat scale start exact multiplier' })).toHaveValue('1.5')

    changeCommittedNumber('Animation speed target main exact multiplier', '0x')
    changeCommittedNumber('Repeat scale start exact multiplier', '2x')

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.cells[1].adaptations.timeScale).toBe(0)
      expect(saved.transitions?.[0].propertyTransitions?.sample?.repeatScale?.from).toBe(2)
    })
  })

  it('contracts unchanged values across a non-Cut Clip junction (#599 review)', () => {
    const show = createDefaultShow('show-transition-summary-delta', 'Transition summary delta', 1000)
    const sceneId = show.scenes[0].id
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-transition-summary',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Summary Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: scene.id === sceneId ? [{
            id: 'summary-left',
            instanceId: 'instance-transition-summary',
            startMs: 0,
            durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 0.75 },
          }, {
            id: 'summary-right',
            instanceId: 'instance-transition-summary',
            startMs: 1_250,
            durationMs: 1_000,
            view: { mirror: false, phase: 0, brightness: 0.75 },
          }] : [],
          overlays: [],
        }],
      })),
      transitions: [{
        id: 'summary-crossfade',
        fromPlacementId: 'summary-left',
        toPlacementId: 'summary-right',
        kind: 'crossfade',
        durationMs: 250,
        easing: { curve: 'linear' },
        crossfadePolicy: 'live-live',
      }],
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const clips = screen.getAllByRole('button', { name: 'Select Summary Rings' })
    expect(within(clips[0]).getByText('75%')).toBeInTheDocument()
    expect(within(clips[1]).queryByText('75%')).not.toBeInTheDocument()
    expect(clips[1].querySelector('.show-clip-summary-section svg')).toBeInTheDocument()
  })

  it('moves a composition Clip by dragging its unified Layer and restores Detail (#580)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-drag-composition', 'Drag composition', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-drag',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Draggable Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-drag',
            instanceId: 'instance-drag',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const clip = screen.getByRole('button', { name: 'Select Draggable Rings' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    await user.click(clip)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pin Entity Detail Panel' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-pinned', 'true')

    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: false },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }
    fireEvent(clip, dragEvent('dragstart', 20))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    fireEvent(layer, dragEvent('dragover', 100))
    expect(layer).toHaveAttribute('data-drop-active', 'true')
    fireEvent(layer, dragEvent('drop', 100))
    fireEvent(clip, dragEvent('dragend', 100))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.scenes[0].zones[0].main[0].startMs).not.toBe(2_000)
    })
    expect(screen.getAllByRole('dialog', { name: 'Entity Detail Panel' })).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-pinned', 'true')
  })

  it('latches Option-drag into an independent Clip duplicate after Option is released (#668)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-option-drag-copy', 'Option drag copy', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-option-source',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Option Copy Rings',
        time: { timeScale: 0.75, timeOffsetMs: 1_250 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-option-source',
            instanceId: 'instance-option-source',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: true, phase: 0.25, brightness: 0.6 },
          }] : [],
          overlays: [{ id: `layer-option-${index}`, name: 'Layer 1', placements: [] }],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: false,
      markerSnapEnabled: false,
    })

    render(<ShowEditor showId={show.id} />)
    const clip = screen.getByRole('button', { name: 'Select Option Copy Rings' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="overlay"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number, altKey: boolean) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: altKey },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20, true))
    expect(dataTransfer.effectAllowed).toBe('copy')

    // The drop grid quantizes the duplicate onto a whole second (#667); the
    // raw pointer time is 12,337ms.
    fireEvent(layer, dragEvent('dragover', 123.37, true))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${12_000 / 62_000 * 100}%`,
    })

    // Copy mode is chosen when the drag begins. Releasing Option must not turn
    // the gesture into a move or restore Option's former snap inversion.
    fireEvent(layer, dragEvent('dragover', 123.37, false))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveAttribute('data-drag-mode', 'duplicate')
    expect(useShowStore.getState().shows[0].composition).toEqual(show.composition)

    fireEvent(layer, dragEvent('drop', 123.37, false))
    fireEvent(clip, dragEvent('dragend', 123.37, false))

    await waitFor(() => {
      const composition = useShowStore.getState().shows[0].composition!
      const source = composition.scenes[0].zones[0].main
      const duplicates = composition.scenes[0].zones[0].overlays[0].placements
      expect(source).toHaveLength(1)
      expect(duplicates).toHaveLength(1)
      expect(source[0]).toMatchObject({
        startMs: 2_000,
        durationMs: 4_000,
        instanceId: 'instance-option-source',
        view: { mirror: true, phase: 0.25, brightness: 0.6 },
      })
      const duplicate = duplicates[0]
      expect(duplicate).toMatchObject({
        startMs: 12_000,
        durationMs: 4_000,
        view: { mirror: true, phase: 0.25, brightness: 0.6 },
      })
      expect(duplicate?.instanceId).not.toBe('instance-option-source')
      expect(composition.patternInstances.find((instance) => instance.id === duplicate?.instanceId)).toMatchObject({
        pattern: show.composition!.patternInstances[0].pattern,
        time: { timeScale: 0.75, timeOffsetMs: 1_250 },
      })
    })
    const selected = screen.getAllByRole('button', { name: 'Select Option Copy Rings' })
      .filter((candidate) => candidate.getAttribute('aria-pressed') === 'true')
    expect(selected).toHaveLength(1)
    expect(selected[0]).not.toBe(clip)
    expect(useShowStore.getState().showHistories[show.id]?.past).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.scenes[0].zones[0].main).toEqual([
        expect.objectContaining({ id: 'placement-option-source', startMs: 2_000 }),
      ])
    })
  })

  it('cancels Option-drag over an invalid target or without a drop without changing history (#668)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-option-drag-cancel', 'Option drag cancel', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-cancel-source',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Cancel Source',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }, {
        id: 'instance-cancel-blocker',
        pattern: { ...show.cells[1].pattern },
        patternName: 'Cancel Blocker',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-cancel-source',
            instanceId: 'instance-cancel-source',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }, {
            id: 'placement-cancel-blocker',
            instanceId: 'instance-cancel-blocker',
            startMs: 8_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: false,
      markerSnapEnabled: false,
    })

    render(<ShowEditor showId={show.id} />)
    const clip = screen.getByRole('button', { name: 'Select Cancel Source' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number, altKey = false) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: altKey },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }
    await user.click(clip)
    const before = structuredClone(useShowStore.getState().shows[0])

    fireEvent(clip, dragEvent('dragstart', 20, true))
    fireEvent(layer, dragEvent('dragover', 50))
    expect(screen.queryByTestId('show-clip-move-preview')).not.toBeInTheDocument()
    expect(dataTransfer.dropEffect).toBe('none')
    fireEvent(layer, dragEvent('drop', 50))
    fireEvent(clip, dragEvent('dragend', 50))

    expect(useShowStore.getState().shows[0]).toEqual(before)
    expect(useShowStore.getState().showHistories[show.id]?.past ?? []).toEqual([])
    expect(clip).toHaveAttribute('aria-pressed', 'true')

    // Native drag-and-drop reports Escape and outside releases as dragend
    // without a committed drop. Both use the same cleanup-only path.
    fireEvent(clip, dragEvent('dragstart', 20, true))
    fireEvent(clip, dragEvent('dragend', 200))

    expect(useShowStore.getState().shows[0]).toEqual(before)
    expect(useShowStore.getState().showHistories[show.id]?.past ?? []).toEqual([])
    expect(screen.queryByTestId('show-clip-move-preview')).not.toBeInTheDocument()
  })

  it('duplicates into a collapsed Zone without moving the source Clip (#668)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-option-drag-collapsed', 'Collapsed option drag', 1000), {
      name: 'accent',
      nominalPixelCount: 24,
    })
    const [sourceZone, targetZone] = show.zones
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-collapsed-source',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Collapsed Copy Source',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId: sourceZone.id,
          main: index === 0 ? [{
            id: 'placement-collapsed-source',
            instanceId: 'instance-collapsed-source',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }, {
          zoneId: targetZone.id,
          main: [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({ snapEnabled: false })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Collapse zone accent' }))
    const clip = screen.getByRole('button', { name: 'Select Collapsed Copy Source' })
    const collapsedZone = screen.getByRole('img', { name: 'Collapsed zone accent timeline' })
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(collapsedZone, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 40, bottom: 68, width: 620, height: 28, x: 0, y: 40, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number, altKey: boolean) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: altKey },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20, true))
    fireEvent(collapsedZone, dragEvent('dragover', 123, false))
    expect(dataTransfer.dropEffect).toBe('copy')
    fireEvent(collapsedZone, dragEvent('drop', 123, false))
    fireEvent(clip, dragEvent('dragend', 123, false))

    await waitFor(() => {
      const composition = useShowStore.getState().shows[0].composition!
      expect(composition.scenes[0].zones[0].main).toEqual([
        expect.objectContaining({ id: 'placement-collapsed-source', instanceId: 'instance-collapsed-source' }),
      ])
      expect(composition.scenes[0].zones[1].main).toHaveLength(1)
      expect(composition.scenes[0].zones[1].main[0].instanceId).not.toBe('instance-collapsed-source')
      expect(composition.patternInstances).toHaveLength(2)
    })
    expect(useShowStore.getState().showHistories[show.id]?.past).toHaveLength(1)
  })

  it('previews and snaps either Clip edge to a visible Marker while the global magnet is off', async () => {
    const show = createDefaultShow('show-clip-marker-snap', 'Clip Marker snap', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-marker-snap',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Marker Magnet',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }, {
        id: 'instance-marker-obstruction',
        pattern: { ...show.cells[1].pattern },
        patternName: 'Marker Obstruction',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0
            ? [{
                id: 'placement-marker-snap',
                instanceId: 'instance-marker-snap',
                startMs: 2_000,
                durationMs: 4_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }, {
                id: 'placement-marker-obstruction',
                instanceId: 'instance-marker-obstruction',
                startMs: 14_000,
                durationMs: 4_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : [],
          overlays: [],
        }],
      })),
      markers: [{ id: 'marker-snap-target', timeMs: 13_333, name: 'Snap target' }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: true,
      markerSnapEnabled: true,
    })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'Snap playhead' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: 'Snap target at 13.333 seconds' })).toBeInTheDocument()

    const clip = screen.getByRole('button', { name: 'Select Marker Magnet' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: false },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20))
    fireEvent(layer, dragEvent('dragover', 90))
    const movePreview = screen.getByTestId('show-clip-move-preview')
    expect(movePreview).toHaveStyle({
      left: `${9_333 / 62_000 * 100}%`,
      width: `${4_000 / 62_000 * 100}%`,
    })

    // A small final shake leaves the 10 px acquisition radius, but should not
    // release the detent into the adjacent Clip before the browser can repaint.
    fireEvent(layer, dragEvent('dragover', 104))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${9_333 / 62_000 * 100}%`,
    })
    fireEvent(layer, dragEvent('drop', 104))
    fireEvent(clip, dragEvent('dragend', 104))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main[0].startMs).toBe(9_333)
    })
  })

  it('switches a short Clip detent from its end edge to its start edge at the same Marker', () => {
    const show = createDefaultShow('show-short-clip-marker-snap', 'Short Clip Marker snap', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-short-marker-snap',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Short Marker Magnet',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0
            ? [{
                id: 'placement-short-marker-snap',
                instanceId: 'instance-short-marker-snap',
                startMs: 2_000,
                durationMs: 1_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : [],
          overlays: [],
        }],
      })),
      markers: [{ id: 'marker-short-snap-target', timeMs: 29_000, name: 'Short snap target' }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: true,
      markerSnapEnabled: true,
    })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select Short Marker Magnet' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 30, top: 0, bottom: 40, width: 10, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: false },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20))

    // At 28.2 seconds, the Clip end is the nearer edge and snaps to 29.
    fireEvent(layer, dragEvent('dragover', 282))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${28_000 / 62_000 * 100}%`,
    })

    // The one-second Clip is narrower than the 16 px release radius. Its old
    // end detent must not mask the newly acquired start-edge snap.
    fireEvent(layer, dragEvent('dragover', 289))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${29_000 / 62_000 * 100}%`,
    })
  })

  it('only shows a Clip move outline for a position that can be committed', async () => {
    const show = createDefaultShow('show-clip-valid-drop-preview', 'Valid Clip drop preview', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-valid-drop-preview',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Drop Contract',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }, {
        id: 'instance-drop-obstruction',
        pattern: { ...show.cells[1].pattern },
        patternName: 'Drop Obstruction',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0
            ? [{
                id: 'placement-valid-drop-preview',
                instanceId: 'instance-valid-drop-preview',
                startMs: 2_000,
                durationMs: 4_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }, {
                id: 'placement-drop-obstruction',
                instanceId: 'instance-drop-obstruction',
                startMs: 8_000,
                durationMs: 4_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: false,
      markerSnapEnabled: false,
    })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select Drop Contract' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        altKey: { value: false },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20))

    // This pointer position would place the Clip at 5-9 seconds, overlapping
    // the obstruction at 8-12 seconds. A geometric-only preview used to claim
    // this invalid position even though the drop planner rejected it.
    fireEvent(layer, dragEvent('dragover', 50))
    expect(screen.queryByTestId('show-clip-move-preview')).not.toBeInTheDocument()

    // Moving left produces a valid 3-7 second plan. Once its outline appears,
    // dropping must commit that exact plan.
    fireEvent(layer, dragEvent('dragover', 30))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${3_000 / 62_000 * 100}%`,
      width: `${4_000 / 62_000 * 100}%`,
    })
    fireEvent(layer, dragEvent('drop', 30))
    fireEvent(clip, dragEvent('dragend', 30))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main[0].startMs).toBe(3_000)
    })
  })

  it('keeps snapping a Clip while its drag pointer is left of the visible timeline', () => {
    const show = createDefaultShow('show-clip-left-gutter-snap', 'Clip left gutter snap', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-left-gutter-snap',
        pattern: { ...show.cells[1].pattern },
        patternName: 'Gutter Magnet',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 1 ? [{
            id: 'placement-left-gutter-snap',
            instanceId: 'instance-left-gutter-snap',
            startMs: 0,
            durationMs: 5_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
      markers: [{
        id: 'marker-left-gutter',
        timeMs: 4_083,
        name: 'Left gutter target',
      }, {
        id: 'marker-visible-edge',
        timeMs: 6_000,
        name: 'Visible edge target',
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: true,
      markerSnapEnabled: true,
    })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select Gutter Magnet' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    const scrollRegion = screen.getByTestId('show-timeline-scroll-region')
    Object.defineProperty(scrollRegion, 'clientWidth', { value: 620 })
    Object.defineProperty(scrollRegion, 'getBoundingClientRect', {
      value: () => ({ left: 100, right: 720, top: 0, bottom: 400, width: 620, height: 400, x: 100, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 370, right: 420, top: 0, bottom: 40, width: 50, height: 40, x: 370, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 50, right: 670, top: 0, bottom: 40, width: 620, height: 40, x: 50, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: 20 },
        altKey: { value: false },
        relatedTarget: { value: null },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 370))
    fireEvent(layer, dragEvent('dragover', 110))
    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${6_000 / 62_000 * 100}%`,
    })

    fireEvent(layer, dragEvent('dragleave', 99))
    fireEvent(clip, dragEvent('drag', 91))

    expect(screen.getByTestId('show-clip-move-preview')).toHaveStyle({
      left: `${4_083 / 62_000 * 100}%`,
    })
  })

  it('moves a composition Clip into a newly added Layer', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-drag-new-layer', 'Drag to new Layer', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-new-layer',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Layer Traveler',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-new-layer',
            instanceId: 'instance-new-layer',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Layer' }))

    await waitFor(() => {
      expect(document.querySelectorAll('[data-show-layer-kind="overlay"]')).toHaveLength(1)
    })
    const clip = screen.getByRole('button', { name: 'Select Layer Traveler' })
    const targetLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="overlay"]')!
    const mainLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    expect(targetLayer).toHaveClass('bg-[#18181b]')
    expect(mainLayer).toHaveClass('bg-[#18181b]')
    expect(clip).toHaveClass('inset-y-1')
    expect(clip).not.toHaveClass('inset-y-0')
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 40, bottom: 80, width: 40, height: 40, x: 20, y: 40, toJSON: () => ({}) }),
    })
    Object.defineProperty(targetLayer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20))
    fireEvent(targetLayer, dragEvent('dragover', 20))
    expect(targetLayer).toHaveAttribute('data-drop-active', 'true')
    fireEvent(targetLayer, dragEvent('drop', 20))
    fireEvent(clip, dragEvent('dragend', 20))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main).toEqual([])
      expect(saved.composition?.scenes[0].zones[0].overlays[0].placements)
        .toEqual([expect.objectContaining({ id: 'placement-new-layer', startMs: 2_000 })])
    })
  })

  it('deletes an unmappable Scene-boundary crossfade when its Clip moves between Layers (#635)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-legacy-transition-round-trip', 'Legacy transition round trip', 1000)
    const zoneId = show.zones[0].id
    const [leftScene, rightScene] = show.scenes
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-left',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Outgoing',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }, {
        id: 'instance-right',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Incoming',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: [{
        sceneId: leftScene.id,
        zones: [{
          zoneId,
          main: [{
            id: 'clip-left',
            instanceId: 'instance-left',
            startMs: 0,
            durationMs: leftScene.durationMs,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }, {
        sceneId: rightScene.id,
        zones: [{
          zoneId,
          main: [{
            id: 'clip-right',
            instanceId: 'instance-right',
            startMs: 0,
            durationMs: rightScene.durationMs,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    expect(screen.getByRole('button', {
      name: 'Edit crossfade Transition between Outgoing and Incoming',
    })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Layer' }))

    const dragEvent = (type: string) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: 20 },
        dataTransfer: { value: { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' } },
      })
      return event
    }
    const clipRect = () => ({
      left: 0, right: 300, top: 40, bottom: 80, width: 300, height: 40, x: 0, y: 40,
      toJSON: () => ({}),
    })
    const layerRect = () => ({
      left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0,
      toJSON: () => ({}),
    })

    const outgoing = screen.getByRole('button', { name: 'Select Outgoing' })
    const overlayLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="overlay"]')!
    Object.defineProperty(outgoing, 'getBoundingClientRect', { value: clipRect })
    Object.defineProperty(overlayLayer, 'getBoundingClientRect', { value: layerRect })
    fireEvent(outgoing, dragEvent('dragstart'))
    fireEvent(overlayLayer, dragEvent('dragover'))
    fireEvent(overlayLayer, dragEvent('drop'))
    fireEvent(outgoing, dragEvent('dragend'))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.transitions).toEqual([expect.objectContaining({
        afterSceneId: leftScene.id,
        kind: 'cut',
        durationMs: 0,
      })])
      expect(saved.composition?.scenes[0].zones[0].overlays[0].placements.map((clip) => clip.id))
        .toEqual(['clip-left'])
    })
    expect(screen.queryByRole('button', {
      name: 'Edit crossfade Transition between Outgoing and Incoming',
    })).not.toBeInTheDocument()

    const movedOutgoing = screen.getByRole('button', { name: 'Select Outgoing' })
    const mainLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(movedOutgoing, 'getBoundingClientRect', { value: clipRect })
    Object.defineProperty(mainLayer, 'getBoundingClientRect', { value: layerRect })
    fireEvent(movedOutgoing, dragEvent('dragstart'))
    fireEvent(mainLayer, dragEvent('dragover'))
    fireEvent(mainLayer, dragEvent('drop'))
    fireEvent(movedOutgoing, dragEvent('dragend'))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main.map((clip) => clip.id))
        .toEqual(['clip-left'])
    })
    expect(screen.queryByRole('button', {
      name: 'Edit crossfade Transition between Outgoing and Incoming',
    })).not.toBeInTheDocument()
  })

  it('moves a composition Clip between Zone Layers without duplicating it (#581)', async () => {
    const show = addShowZone(createDefaultShow('show-drag-zone', 'Drag Zone', 1000), { name: 'accent' })
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-drag-zone',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Zone Traveler',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: show.zones.map((zone, zoneIndex) => ({
          zoneId: zone.id,
          main: index === 0 && zoneIndex === 0 ? [{
            id: 'placement-drag-zone',
            instanceId: 'instance-drag-zone',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        })),
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const clip = screen.getByRole('button', { name: 'Select Zone Traveler' })
    const layers = document.querySelectorAll<HTMLElement>('[data-show-layer-kind="main"]')
    const targetLayer = layers[1]
    Object.defineProperty(clip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 0, bottom: 40, width: 40, height: 40, x: 20, y: 0, toJSON: () => ({}) }),
    })
    Object.defineProperty(targetLayer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 40, bottom: 80, width: 620, height: 40, x: 0, y: 40, toJSON: () => ({}) }),
    })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    const dragEvent = (type: string, clientX: number) => {
      const event = new Event(type, { bubbles: true, cancelable: true })
      Object.defineProperties(event, {
        clientX: { value: clientX },
        dataTransfer: { value: dataTransfer },
      })
      return event
    }

    fireEvent(clip, dragEvent('dragstart', 20))
    fireEvent(targetLayer, dragEvent('dragover', 100))
    fireEvent(targetLayer, dragEvent('drop', 100))
    fireEvent(clip, dragEvent('dragend', 100))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main).toEqual([])
      expect(saved.composition?.scenes[0].zones[1].main).toHaveLength(1)
      expect(saved.composition?.patternInstances).toHaveLength(1)
    })
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()

    const movedClip = screen.getByRole('button', { name: 'Select Zone Traveler' })
    Object.defineProperty(movedClip, 'getBoundingClientRect', {
      value: () => ({ left: 20, right: 60, top: 40, bottom: 80, width: 40, height: 40, x: 20, y: 40, toJSON: () => ({}) }),
    })
    Object.defineProperty(layers[0], 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    await userEvent.setup().click(movedClip)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'clip:placement-drag-zone')

    fireEvent(movedClip, dragEvent('dragstart', 20))
    fireEvent(layers[0], dragEvent('dragover', 100))
    fireEvent(layers[0], dragEvent('drop', 100))
    fireEvent(movedClip, dragEvent('dragend', 100))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main).toHaveLength(1)
      expect(saved.composition?.scenes[0].zones[1].main).toEqual([])
    })
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' }))
      .toHaveAttribute('data-owner-key', 'clip:placement-drag-zone'))
  })

  it('resizes a composition Clip edge and restores its attached Detail (#580)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-resize-composition', 'Resize composition', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-resize-ui',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Resizable Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-resize-ui',
            instanceId: 'instance-resize-ui',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const clip = screen.getByRole('button', { name: 'Select Resizable Rings' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    await user.click(clip)
    const handle = screen.getByRole('separator', { name: 'Resize Resizable Rings end' })
    fireEvent.pointerDown(handle, { clientX: 60, pointerId: 1, altKey: true })
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    fireEvent.pointerMove(window, { clientX: 100, pointerId: 1, altKey: true })
    fireEvent.pointerUp(window, { clientX: 100, pointerId: 1, altKey: true })

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.scenes[0].zones[0].main[0].durationMs).toBe(8_000)
    })
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument())
  })

  it('removes hidden Scene-boundary Transition time when resizing a generated Clip (#695)', async () => {
    const show = createDefaultShow('show-resize-boundary-transition', 'Resize boundary Transition', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const handle = screen.getByRole('separator', { name: 'Resize CometLoom start' })

    fireEvent.pointerDown(handle, { clientX: 320, pointerId: 1, altKey: true })
    fireEvent.pointerMove(window, { clientX: 360, pointerId: 1, altKey: true })
    fireEvent.pointerUp(window, { clientX: 360, pointerId: 1, altKey: true })

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(showModel.showLoopDurationMs(saved)).toBe(60_000)
      expect(saved.transitions).toContainEqual(expect.objectContaining({
        id: 'transition-scene-1',
        kind: 'cut',
        durationMs: 0,
      }))
      expect(saved.composition?.scenes[1].zones[0].main[0]).toMatchObject({
        id: 'placement-cell-2-scene-2',
        startMs: 4_000,
        durationMs: 26_000,
      })
      expect(validateShowComposition(saved, saved.composition!)).toEqual([])
    })
    expect(screen.getByRole('button', { name: 'Select CometLoom' })).toHaveStyle({
      left: `${34_000 / 60_000 * 100}%`,
      width: `${26_000 / 60_000 * 100}%`,
    })
  })

  it('snaps a Clip start resize across visible Markers without opening Details on release', async () => {
    const show = createDefaultShow('show-resize-start-markers', 'Resize start to Markers', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-resize-start-markers',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Marker Trim',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-resize-start-markers',
            instanceId: 'instance-resize-start-markers',
            startMs: 8_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
      markers: [4_000, 5_000, 6_000, 7_000].map((timeMs) => ({
        id: `marker-resize-${timeMs}`,
        timeMs,
        name: `Resize ${timeMs / 1_000}`,
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: true,
      markerSnapEnabled: true,
    })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select Marker Trim' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const handle = screen.getByRole('separator', { name: 'Resize Marker Trim start' })

    fireEvent.pointerDown(handle, { clientX: 80, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 60, pointerId: 1 })
    expect(clip).toHaveStyle({
      left: `${6_000 / 62_000 * 100}%`,
      width: `${6_000 / 62_000 * 100}%`,
    })
    fireEvent.pointerMove(window, { clientX: 70, pointerId: 1 })
    expect(clip).toHaveStyle({
      left: `${7_000 / 62_000 * 100}%`,
      width: `${5_000 / 62_000 * 100}%`,
    })
    // Commit the last painted valid preview even if pointer-up arrives after
    // the browser's last delivered pointer-move sample.
    fireEvent.pointerUp(window, { clientX: 81, pointerId: 1 })

    // Native pointer release can synthesize this click on the Clip button
    // because the pointer is no longer over the narrow resize handle.
    fireEvent.click(clip)

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main[0]).toMatchObject({
        startMs: 7_000,
        durationMs: 5_000,
      })
    })
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('always snaps a Clip edge to the playhead across a hidden Scene boundary', async () => {
    const show = createDefaultShow('show-resize-playhead-snap', 'Resize to playhead', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-resize-playhead',
        pattern: { ...show.cells[1].pattern },
        patternName: 'Playhead Trim',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 1 ? [{
            id: 'placement-resize-playhead',
            instanceId: 'instance-resize-playhead',
            startMs: 0,
            durationMs: 5_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({
      showId: show.id,
      durationMs: 62_000,
      positionMs: 29_000,
    })
    useShowEditorSessionStore.setState({
      snapEnabled: false,
      markersVisible: false,
      markerSnapEnabled: false,
    })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select Playhead Trim' })
    const layer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')!
    Object.defineProperty(screen.getByTestId('show-timeline-scroll-region'), 'clientWidth', { value: 620 })
    Object.defineProperty(layer, 'getBoundingClientRect', {
      value: () => ({ left: 0, right: 620, top: 0, bottom: 40, width: 620, height: 40, x: 0, y: 0, toJSON: () => ({}) }),
    })
    const handle = screen.getByRole('separator', { name: 'Resize Playhead Trim start' })

    fireEvent.pointerDown(handle, { clientX: 320, pointerId: 1 })
    fireEvent.pointerMove(window, { clientX: 291, pointerId: 1 })
    expect(clip).toHaveStyle({
      left: `${29_000 / 62_000 * 100}%`,
      width: `${8_000 / 62_000 * 100}%`,
    })
    fireEvent.pointerUp(window, { clientX: 291, pointerId: 1 })

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)!
      expect(saved.composition?.scenes[0].zones[0].main).toContainEqual(expect.objectContaining({
        id: 'placement-resize-playhead',
        startMs: 29_000,
        durationMs: 1_000,
      }))
      expect(saved.composition?.scenes[1].zones[0].main).toContainEqual(expect.objectContaining({
        logicalClipId: 'placement-resize-playhead',
        startMs: 0,
        durationMs: 5_000,
      }))
    })
  })

  it('deletes a selected composition Clip from the keyboard (#580)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-delete-composition', 'Delete composition', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-delete-ui',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Disposable Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }, {
        id: 'instance-keeper-ui',
        pattern: { ...show.cells[1].pattern },
        patternName: 'Keeper',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-delete-ui',
            instanceId: 'instance-delete-ui',
            startMs: 2_000,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [{
            id: 'placement-keeper-ui',
            instanceId: 'instance-keeper-ui',
            startMs: 0,
            durationMs: 4_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Disposable Rings' }))
    await user.click(screen.getByRole('button', { name: 'Pin Entity Detail Panel' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-pinned', 'true')
    fireEvent.keyDown(document, { key: 'Delete' })

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.scenes[0].zones[0].main).toEqual([])
    })
    expect(screen.queryByRole('button', { name: 'Select Disposable Rings' })).not.toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('deletes a selected flat Show Clip from its projected timeline placement (#63)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-delete-flat-projection', 'Delete flat projection', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const selectedClip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    expect(selectedClip).toHaveAttribute(
      'data-show-selection-key',
      'clip:placement-cell-1-scene-1',
    )

    await user.click(selectedClip)
    await user.keyboard('{Delete}')

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.cells.map((cell) => cell.id)).toEqual(['cell-2'])
    })
    expect(screen.queryByRole('button', { name: 'Select TestPattern1D' })).not.toBeInTheDocument()
  })

  it('disables deletion when the selected Clip is the Show’s final Clip', async () => {
    const user = userEvent.setup()
    const show = removeShowClip(
      createDefaultShow('show-protect-final-clip', 'Protect final Clip', 1000),
      'cell-1',
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select CometLoom' }))

    const remove = screen.getByRole('button', { name: 'Delete clip CometLoom' })
    expect(remove).toBeDisabled()
    expect(remove).toHaveAttribute('title', 'A Show must contain at least one Clip.')

    await user.keyboard('{Delete}')

    expect(screen.getByTestId('show-clip-delete-blocked')).toBeInTheDocument()
    expect(screen.getByText('Keep one Clip')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Clip deletion unavailable' })).toHaveTextContent(
      'A Show must contain at least one Clip.',
    )
    expect(screen.getByRole('button', { name: 'Select CometLoom' })).toBeInTheDocument()
  })

  it('blocks deletion when the final flat Clip spans multiple projected placements (#63)', async () => {
    const user = userEvent.setup()
    const show = extendShowCell(
      removeShowClip(
        createDefaultShow('show-protect-spanned-final-clip', 'Protect spanned final Clip', 1000),
        'cell-2',
      ),
      'cell-1',
      2,
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const firstProjectedPlacement = screen.getAllByRole('button', { name: 'Select TestPattern1D' })
      .find((button) => button.getAttribute('data-show-selection-key') === 'clip:placement-cell-1-scene-1')
    expect(firstProjectedPlacement).toBeDefined()
    await user.click(firstProjectedPlacement!)

    expect(screen.getByRole('button', { name: 'Delete clip TestPattern1D' })).toBeDisabled()
    await user.keyboard('{Delete}')

    expect(screen.getByTestId('show-clip-delete-blocked')).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Clip deletion unavailable' })).toHaveTextContent(
      'A Show must contain at least one Clip.',
    )
    expect(useShowStore.getState().shows.find((candidate) => candidate.id === show.id)?.cells).toEqual(show.cells)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
  })

  it('blocks deletion when the final flat Clip spans multiple projected Zones (#63)', async () => {
    const user = userEvent.setup()
    let show = removeShowClip(
      createDefaultShow('show-protect-zone-spanned-final-clip', 'Protect Zone-spanned final Clip', 1000),
      'cell-2',
    )
    show = addShowZone(show, { name: 'accent' })
    show = spanShowCellZones(show, 'cell-1', 2)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const projectedPlacements = screen.getAllByRole('button', { name: 'Select TestPattern1D' })
    expect(projectedPlacements).toHaveLength(2)
    await user.click(projectedPlacements[0])

    expect(screen.getByRole('button', { name: 'Delete clip TestPattern1D' })).toBeDisabled()
    await user.keyboard('{Delete}')

    expect(screen.getByTestId('show-clip-delete-blocked')).toBeInTheDocument()
    expect(useShowStore.getState().shows.find((candidate) => candidate.id === show.id)?.cells).toEqual(show.cells)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
  })

  it('consolidates Show creation commands into one flat Add menu (#594)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-menu', 'Add menu', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('button', { name: 'Add Clip at playhead' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Add Layer' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Insert Time' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Zone Layout at playhead' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const menu = screen.getByRole('menu', { name: 'Add to Show' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'ClipNo empty Layer',
      'Layer',
      'TransitionSelect a Clip first.',
      'Time',
      'Zone Layout',
    ])
    const disabledClip = within(menu).getByRole('menuitem', { name: 'Clip unavailable: no empty Layer' })
    expect(disabledClip).toBeDisabled()
    expect(disabledClip).not.toHaveAttribute('title')
    expect(within(disabledClip).getByText('No empty Layer')).toHaveClass('text-zinc-600')
    expect(within(menu).getByRole('menuitem', { name: 'Layer' })).toHaveFocus()

    await user.keyboard('{ArrowDown}')
    expect(within(menu).getByRole('menuitem', { name: 'Time' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('menu', { name: 'Add to Show' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add to Show' })).toHaveFocus()
  })

  it('adds an explicit Layer to the selected Zone across the unified timeline (#580)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-layer-ui', 'Add layer UI', 1000)
    show.composition = {
      version: 1,
      patternInstances: [],
      scenes: show.scenes.map((scene) => ({
        sceneId: scene.id,
        zones: show.zones.map((zone) => ({ zoneId: zone.id, main: [], overlays: [] })),
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Layer' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.scenes.every((scene) => scene.zones[0].overlays.length === 1)).toBe(true)
    })
    const overlayLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="overlay"]')
    const mainLayer = document.querySelector<HTMLElement>('[data-show-layer-kind="main"]')
    expect(overlayLayer).toHaveClass('bg-[#18181b]')
    expect(mainLayer).toHaveClass('bg-[#18181b]')
    expect(screen.queryByRole('dialog', { name: 'Add Clip at playhead' })).not.toBeInTheDocument()
    const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
    expect(saved?.composition?.scenes.every((scene) => (
      scene.zones[0].overlays[0].placements.length === 0
    ))).toBe(true)
  })

  it('splits and duplicates the selected composition Clip from timeline commands (#580)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-commands', 'Clip commands', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-command',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Command Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-command',
            instanceId: 'instance-command',
            startMs: 2_000,
            durationMs: 3_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    act(() => useShowTransportStore.getState().setPosition(show.id, 3_500))
    await user.click(screen.getByRole('button', { name: 'Select Command Rings' }))
    await user.click(screen.getByRole('button', { name: 'Split at playhead' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.scenes[0].zones[0].main).toHaveLength(2)
    })
    await user.click(screen.getByRole('button', { name: 'Clone selection' }))
    await waitFor(() => {
      const saved = useShowStore.getState().shows.find((candidate) => candidate.id === show.id)
      expect(saved?.composition?.scenes[0].zones[0].main).toHaveLength(3)
      expect(saved?.composition?.patternInstances).toHaveLength(2)
      const instanceIds = saved?.composition?.scenes[0].zones[0].main.map((placement) => placement.instanceId)
      expect(new Set(instanceIds).size).toBe(2)
    })
  })

  it('restores Clone for a selected Clip whose duplicate crosses a Cut (#668)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clone-cut-regression', 'Clone Cut regression', 1000)
    show.transitions[0] = { ...show.transitions[0], kind: 'cut', durationMs: 0 }
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-clone-cut',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Cut Crossing Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-clone-cut',
            instanceId: 'instance-clone-cut',
            startMs: 27_000,
            durationMs: 3_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Cut Crossing Rings' }))
    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeEnabled()
    await user.click(clone)

    await waitFor(() => {
      const composition = useShowStore.getState().shows[0].composition!
      expect(composition.scenes[0].zones[0].main).toEqual([
        expect.objectContaining({ id: 'placement-clone-cut', startMs: 27_000, durationMs: 3_000 }),
      ])
      expect(composition.scenes[1].zones[0].main).toEqual([
        expect.objectContaining({ startMs: 0, durationMs: 3_000 }),
      ])
      expect(composition.patternInstances).toHaveLength(2)
      expect(useShowStore.getState().showHistories[show.id]?.past).toHaveLength(1)
    })
  })

  it('makes a shared composition Clip independent and explicitly rejoins it (#586)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-instance-controls', 'Pattern instance controls', 1000)
    const zoneId = show.zones[0].id
    show.composition = {
      version: 1,
      patternInstances: [{
        id: 'instance-shared',
        pattern: { ...show.cells[0].pattern },
        patternName: 'Shared Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, index) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: index === 0 ? [{
            id: 'placement-shared-a',
            instanceId: 'instance-shared',
            startMs: 2_000,
            durationMs: 3_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }, {
            id: 'placement-shared-b',
            instanceId: 'instance-shared',
            startMs: 5_000,
            durationMs: 3_000,
            view: { mirror: false, phase: 0, brightness: 1 },
          }] : [],
          overlays: [],
        }],
      })),
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getAllByRole('button', { name: 'Select Shared Rings' })[0])
    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Shared by 2 Clips')
    await user.click(screen.getByRole('button', { name: 'Make Pattern Independent' }))

    await waitFor(() => {
      const composition = useShowStore.getState().shows[0].composition!
      expect(composition.patternInstances).toHaveLength(2)
      expect(composition.scenes[0].zones[0].main[0].instanceId).not.toBe('instance-shared')
    })
    expect(screen.getByRole('group', { name: 'Pattern instance' })).toHaveTextContent('Independent')

    await user.click(screen.getByRole('button', { name: 'Rejoin Shared Pattern' }))
    await user.click(screen.getByRole('button', { name: 'Rejoin Pattern instance' }))
    await waitFor(() => {
      const composition = useShowStore.getState().shows[0].composition!
      expect(composition.patternInstances).toHaveLength(1)
      expect(composition.scenes[0].zones[0].main.map((placement) => placement.instanceId)).toEqual([
        'instance-shared',
        'instance-shared',
      ])
    })
  })

  it('authors Show-level Trails with a retention control and scrub disclosure (#537)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-537-trails-ui', 'Trails UI', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Show properties' }))

    const enabled = screen.getByRole('checkbox', { name: 'Enable Trails' })
    expect(enabled).not.toBeChecked()
    expect(screen.getByText(/scrubbing clears trail history/i)).toBeInTheDocument()

    await user.click(enabled)
    await waitFor(() => expect(useShowStore.getState().shows[0].outputEffects).toEqual([
      { id: 'trails', kind: 'trails', retention: DEFAULT_SHOW_TRAILS_RETENTION },
    ]))

    const retention = screen.getByRole('slider', { name: 'Trails retention' })
    expect(retention).toHaveValue(String(DEFAULT_SHOW_TRAILS_RETENTION))
    fireEvent.change(retention, { target: { value: '0.75' } })
    await waitFor(() => expect(useShowStore.getState().shows[0].outputEffects).toEqual([
      { id: 'trails', kind: 'trails', retention: 0.75 },
    ]))
  })

  it('does not re-project the complete Scene strip for live position updates (#508)', () => {
    const show = createDefaultShow('show-narrow-position-subscription', 'Narrow position subscription', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const projectStrip = vi.spyOn(showModel, 'projectShowStrip')

    render(<ShowEditor showId={show.id} />)
    const initialProjectionCount = projectStrip.mock.calls.length

    act(() => useShowTransportStore.getState().setPosition(show.id, 250))

    expect(projectStrip).toHaveBeenCalledTimes(initialProjectionCount)
  })

  it('opens a stock Show in the real editor without creating a personal record (#363)', async () => {
    const stock = STOCK_SHOWS[0]

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    expect(screen.getByText('Built-in Show')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Show preview/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Split at playhead' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    expect(useShowStore.getState().shows).toEqual([])
  })

  it('renders the current built-in session draft and enables Reset for it (#619)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS[0]
    const draft = { ...stock.show, name: 'Edited session Show', updatedAt: stock.show.updatedAt + 1 }
    useShowStore.setState({ stockShowDrafts: { [stock.id]: draft } })

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{ track: 'portable', lesson: 'Session draft', description: 'Test built-in draft state' }}
    />)

    const reset = screen.getByRole('button', { name: 'Reset built-in Show' })
    expect(reset).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Edited session Show')).toBeInTheDocument()

    await user.click(reset)
    expect(reset).toBeDisabled()
    expect(useShowStore.getState().stockShowDrafts[stock.id]).toBeUndefined()

    act(() => useShowStore.setState({ stockShowDrafts: { [stock.id]: draft } }))
    await waitFor(() => expect(reset).toBeEnabled())
    reset.focus()
    await user.keyboard('{Enter}')
    expect(reset).toBeDisabled()
    expect(useShowStore.getState().stockShowDrafts[stock.id]).toBeUndefined()
  })

  it('enables Reset after a built-in Clip edit without creating a personal Show (#619)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-101-clips-cuts-blank-time')!

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{ track: 'portable', lesson: 'Session edit', description: 'Test built-in reset state' }}
    />)

    const reset = screen.getByRole('button', { name: 'Reset built-in Show' })
    expect(reset).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Select MetaballGarden' }))
    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    await user.clear(brightness)
    await user.type(brightness, '75%')
    fireEvent.blur(brightness)

    await waitFor(() => expect(reset).toBeEnabled())
    expect(useShowStore.getState().shows).toEqual([])

    await user.click(reset)
    expect(reset).toBeDisabled()
    expect(useShowStore.getState().stockShowDrafts[stock.id]).toBeUndefined()
    expect(useShowStore.getState().shows).toEqual([])
  })

  // A flat-cell record with a boundary Transition and Clip control targets: the
  // shape older saved Shows still load with. It lives here rather than pointing
  // at a curriculum fixture, because the Learn catalogue is authored in the
  // composition model and must stay free to change (#363).
  function legacyTwoClipShow(id: string): ShowRecord {
    const cell = (sceneId: string, pattern: string, controls: Record<string, number>): ShowCell => ({
      id: `cell-${sceneId}-zone-1`,
      zoneId: 'zone-1',
      sceneId,
      sceneSpan: 1,
      pattern: { kind: 'stock', id: pattern },
      patternName: pattern,
      adaptations: { mirror: false, phase: 0, brightness: 1, timeScale: 0.35 },
      restartOnEntry: false,
      controlTargets: controls,
    })
    return {
      id,
      name: 'Legacy two-Clip Show',
      scenes: [
        { id: 'mandala', name: 'Mandala', durationMs: 8_000 },
        { id: 'compass', name: 'Compass', durationMs: 8_000 },
      ],
      zones: [{ id: 'zone-1', name: 'Main', nominalPixelCount: 2_000, color: '#38bdf8' }],
      cells: [
        cell('mandala', 'SignalMandala', { sliderSpeed: 0.45, sliderSpokes: 0.48 }),
        cell('compass', 'CompassRose', { sliderSpeed: 0.3, sliderPoints: 0.42 }),
      ],
      routingLayouts: [{ id: 'layout-main', name: 'Main', zones: [], logical: { kind: 'single', zoneIds: ['zone-1'] } }],
      transitions: [{
        id: 'transition-mandala',
        afterSceneId: 'mandala',
        kind: 'crossfade',
        durationMs: 3_000,
        easing: { curve: 'sine', direction: 'in-out' },
      }],
      stageMapId: 'plane',
      outputContract: createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 2_000 }),
      updatedAt: 363,
    }
  }

  it('keeps legacy stock Clips on one absolute Layer and exposes their boundary Transition (#589)', async () => {
    const user = userEvent.setup()
    const stock = { id: 'legacy-two-clip-show', show: legacyTwoClipShow('legacy-two-clip-show') }

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    const signal = screen.getByRole('button', { name: 'Select SignalMandala' })
    const compass = screen.getByRole('button', { name: 'Select CompassRose' })
    expect(signal.parentElement).toBe(compass.parentElement)
    expect(signal.parentElement).toHaveAttribute('data-show-layer-kind', 'main')
    expect(signal).toHaveClass('absolute')
    expect(signal).not.toHaveClass('relative')

    const crossfade = screen.getByRole('button', {
      name: 'Edit crossfade Transition between SignalMandala and CompassRose',
    })
    expect(crossfade.parentElement).toBe(signal.parentElement)
    expect(crossfade).toHaveClass('inset-y-0', 'bg-transparent')
    expect(crossfade).not.toHaveClass('border-amber-400/45', 'bg-amber-400/15')
    expect(within(crossfade).getByTestId('transition-xray-pictogram')).toHaveAttribute(
      'data-xray-transition-icon',
      'crossfade',
    )

    await user.click(crossfade)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveTextContent('crossfade')
    await user.click(crossfade)
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('shows legacy stock Clip Pattern controls before any edit and retains them across Aperture toggles (#615, #617)', async () => {
    const user = userEvent.setup()
    const show = { ...legacyTwoClipShow('show-issue-615') }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select SignalMandala' }))
    expect(screen.getByRole('table', { name: 'Pattern controls' })).toBeInTheDocument()

    // The Aperture focus/toggle lives in the inline placement pad (#646), which
    // is on its own tab (#642). Pattern controls survive the round trip.
    await user.click(screen.getByRole('tab', { name: /^Place/ }))
    const aperture = screen.getByRole('button', { name: 'Aperture' })
    await user.click(aperture)
    await waitFor(() => expect(aperture).toHaveAttribute('aria-pressed', 'true'))
    await user.click(aperture)
    await waitFor(() => expect(aperture).toHaveAttribute('aria-pressed', 'false'))

    await user.click(screen.getByRole('tab', { name: /^Pattern/ }))
    expect(screen.getByRole('table', { name: 'Pattern controls' })).toBeInTheDocument()
  })

  it('opens a stock Show guide on first visit and fully collapses it per Show (#363)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS[0]
    const builtInContext = {
      track: stock.track,
      lesson: stock.lesson,
      description: stock.description,
      note: {
        label: 'Learn 100',
        number: '101',
        title: 'Clips and Crossfade',
        purpose: 'Two Patterns become one timed composition. Each Clip owns what plays; the boundary between them owns how the picture changes.',
        notice: 'The Crossfade is a separate timeline entity, not a property hidden inside either Clip.',
        prompts: [
          'Shorten the Crossfade from 2.0 s to 0.8 s.',
          'Replace Clockwork Iris with a Pattern that moves differently.',
        ] as [string, string],
        guide: {
          documentId: 'show-visual-toolkit' as const,
          heading: 'clips-scenes-and-boundaries',
          label: 'Read clips, scenes, and boundaries',
        },
        defaultOpen: true,
      },
    }

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly builtInContext={builtInContext} />)

    const guide = screen.getByRole('region', { name: '101 Clips and Crossfade guide' })
    expect(guide).toHaveClass('select-none')
    expect(guide.closest('.show-editor-pane')).toBeInTheDocument()
    expect(guide.querySelector('.show-note-expanded-content')).toBeInTheDocument()
    expect(within(guide).getByText(builtInContext.note.purpose)).toBeInTheDocument()
    expect(within(guide).getByText(builtInContext.note.notice)).toBeInTheDocument()
    expect(within(guide).getByRole('link', { name: builtInContext.note.guide.label })).toHaveAttribute(
      'href',
      expect.stringContaining('/docs/show-visual-toolkit#clips-scenes-and-boundaries'),
    )
    const compactDetails = within(guide).getByRole('button', { name: 'Show guide details' })
    expect(compactDetails).toHaveAttribute('aria-expanded', 'false')
    await user.click(compactDetails)
    expect(compactDetails).toHaveAttribute('aria-expanded', 'true')
    expect(guide).toHaveAttribute('data-compact-expanded', 'true')

    await user.click(within(guide).getByRole('button', { name: 'Collapse 101 guide' }))
    expect(screen.queryByRole('region', { name: '101 Clips and Crossfade guide' })).not.toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().showNoteOpenById[stock.id]).toBe(false)

    // The trigger reads as a labeled chip, not an icon-only button (#63):
    // numbered lessons say "Lesson" without repeating the number in the label.
    const trigger = screen.getByRole('button', { name: 'Open 101 Clips and Crossfade guide' })
    expect(within(trigger).getByText('Lesson')).toBeInTheDocument()
    expect(within(trigger).queryByText('101 Guide')).not.toBeInTheDocument()
    await user.click(trigger)
    expect(screen.getByRole('region', { name: '101 Clips and Crossfade guide' })).toBeInTheDocument()
  })

  it('removes compacted guide actions from keyboard access until Details opens', async () => {
    const user = userEvent.setup()
    const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 367, bottom: 300, width: 367, height: 300,
      toJSON: () => ({}),
    })
    const stock = STOCK_SHOWS[0]
    const note = {
      label: 'Learn 100',
      number: '101',
      title: 'Clips and Crossfade',
      purpose: 'Compose two Patterns.',
      notice: 'The Transition is its own entity.',
      prompts: ['Inspect the Clips.', 'Inspect the Transition.'] as [string, string],
      guide: {
        documentId: 'show-visual-toolkit' as const,
        heading: 'clips-scenes-and-boundaries',
        label: 'Read the guide',
      },
      defaultOpen: true,
    }

    render(<div style={{ width: 367 }}>
      <ShowEditor
        showId={stock.id}
        showOverride={stock.show}
        readOnly
        builtInContext={{
          track: stock.track,
          lesson: stock.lesson,
          description: stock.description,
          note,
        }}
      />
    </div>)

    const guide = screen.getByRole('region', { name: '101 Clips and Crossfade guide' })
    await waitFor(() => expect(within(guide).queryByRole('link', { name: 'Read the guide' })).not.toBeInTheDocument())
    await user.click(within(guide).getByRole('button', { name: 'Show guide details' }))
    expect(within(guide).getByRole('link', { name: 'Read the guide' })).toBeVisible()
    rect.mockRestore()
  })

  it('offers Try with Pattern on lesson guides through catalogue patternSlots (#63)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-201-layers-property-animation')!

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        patternSlots: stock.patternSlots,
      }}
    />)

    const guide = screen.getByRole('region', { name: '201 Layers and Property Animation guide' })
    // A lesson gets one picker per slot group in timeline order, without
    // Reference mode: 201 slots the water bed and then the firefly overlay
    // (TimeFlies2D since the #727 ZRanger recast).
    expect(within(guide).queryByText('Reference mode')).not.toBeInTheDocument()
    expect(within(guide).getByRole('combobox', { name: 'Pattern 1' })).toHaveValue('Caustics')
    expect(within(guide).getByRole('combobox', { name: 'Pattern 2' })).toHaveValue('TimeFlies2D')

    await user.click(within(guide).getByRole('combobox', { name: 'Pattern 2' }))
    await user.click(screen.getByRole('option', { name: 'Murmuration' }))
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toEqual({
      1: { kind: 'stock', id: 'Murmuration' },
    })
    // Picking releases keyboard focus so transport shortcuts work right away,
    // and the field returns to its read-only selected state.
    expect(within(guide).getByRole('combobox', { name: 'Pattern 2' })).not.toHaveFocus()
    expect(within(guide).getByRole('combobox', { name: 'Pattern 2' })).toHaveAttribute('readonly')
    // The untouched slot keeps its authored cast; the one header Reset
    // clears every slot along with any draft edits (#63).
    expect(within(guide).getByRole('combobox', { name: 'Pattern 1' })).toHaveValue('Caustics')
    await user.click(screen.getByRole('button', { name: 'Reset built-in Show' }))
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toBeUndefined()

    // A deliberate Source-pattern edit in Clip Detail supersedes the picker:
    // that slot's transient selection clears and the dialog choice persists
    // into the draft as authored (#63).
    await user.click(within(guide).getByRole('combobox', { name: 'Pattern 2' }))
    await user.click(screen.getByRole('option', { name: 'Murmuration' }))
    await user.click(screen.getAllByRole('button', { name: 'Select Murmuration' })[0])
    const source = screen.getByRole('combobox', { name: 'Source pattern' })
    await user.click(source)
    await user.type(source, 'CometLoom')
    await user.click(screen.getByRole('option', { name: 'CometLoom' }))
    await waitFor(() => {
      expect(useShowStore.getState().stockShowDrafts[stock.id]?.composition?.patternInstances
        .find((instance) => instance.id === 'flies')?.pattern).toEqual({ kind: 'stock', id: 'CometLoom' })
    })
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toBeUndefined()
  })

  it('restores untouched grouped slot instances when one member is reassigned (#63 review P2)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-303-compile-simplify-deliver')!

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        patternSlots: stock.patternSlots,
      }}
    />)

    // Slot 1 casts both loom instances at once. Reassigning one of them in
    // Clip Detail supersedes the slot, but the untouched sibling must strip
    // back to the authored Pattern instead of persisting the transient cast.
    const guide = screen.getByRole('region', { name: '303 Compile, Simplify, and Deliver guide' })
    await user.click(within(guide).getByRole('combobox', { name: 'Pattern 1' }))
    await user.click(screen.getByRole('option', { name: 'Murmuration' }))

    await user.click(screen.getAllByRole('button', { name: 'Select Murmuration' })[0])
    const source = screen.getByRole('combobox', { name: 'Source pattern' })
    await user.click(source)
    await user.type(source, 'CometLoom')
    await user.click(screen.getByRole('option', { name: 'CometLoom' }))

    await waitFor(() => {
      const draft = useShowStore.getState().stockShowDrafts[stock.id]
      const patternOf = (instanceId: string) => draft?.composition?.patternInstances
        .find((instance) => instance.id === instanceId)?.pattern
      const pair = [patternOf('loom'), patternOf('loom-echo')]
      expect(pair).toContainEqual({ kind: 'stock', id: 'CometLoom' })
      expect(pair).toContainEqual({ kind: 'stock', id: 'RibbonLoom' })
    })
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toBeUndefined()
  })

  it('reserves the first Showcase guide row for every Pattern slot (#714)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-aperture-shapes')!

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        patternSlots: stock.patternSlots,
        reference: stock.reference,
      }}
    />)

    const guide = screen.getByRole('region', { name: 'Aperture Shapes: Geometric guide' })
    const slotRow = within(guide).getByRole('group', { name: 'Aperture Shapes: Geometric Pattern slots' })
    const referenceControls = within(guide).getByRole('group', { name: `${stock.show.name} reference controls` })
    expect(slotRow.compareDocumentPosition(referenceControls) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(slotRow).getByRole('combobox', { name: 'Pattern 1' })).toHaveValue('MetaballGarden')
    expect(within(slotRow).getByRole('combobox', { name: 'Pattern 2' })).toHaveValue('CompassRose')

    await user.click(within(slotRow).getByRole('combobox', { name: 'Pattern 2' }))
    await user.click(screen.getByRole('option', { name: 'Caustics' }))
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toEqual({
      1: { kind: 'stock', id: 'Caustics' },
    })
  })

  it('turns a reference Show guide into a live Pattern comparison instrument (#506)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-blend-fade-transitions')!

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        reference: stock.reference,
      }}
    />)

    const guide = screen.getByRole('region', { name: 'Blend and Fade Transitions guide' })
    expect(within(guide).getByText(stock.reference!.summary)).toBeInTheDocument()
    expect(within(guide).getByText('Reference frame')).toBeInTheDocument()
    expect(within(guide).getByRole('combobox', { name: 'Try with Pattern' })).toHaveValue('MetaballGarden')

    act(() => useShowTransportStore.getState().setPosition(stock.id, 3_050))
    expect(within(guide).getByText('Cut')).toBeInTheDocument()
    expect(within(guide).getByText('Reference -> Selected')).toBeInTheDocument()

    await user.click(within(guide).getByRole('combobox', { name: 'Try with Pattern' }))
    expect(screen.queryByRole('option', { name: 'TestPattern3D' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Caustics' }))
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toEqual({
      0: { kind: 'stock', id: 'Caustics' },
    })
    // One Reset in the header owns all restoration; the guide has none (#63).
    expect(within(guide).queryByRole('button', { name: 'Reset Pattern' })).toBeNull()

    const editedDraft = {
      ...stock.show,
      name: 'Edited reference draft',
      updatedAt: stock.show.updatedAt + 1,
      composition: stock.show.composition ? {
        ...stock.show.composition,
        patternInstances: stock.show.composition.patternInstances.map((instance) => (
          instance.id === 'instance-reference-content-selected'
            ? { ...instance, controlTargets: { speed: 0.42 } }
            : instance
        )),
      } : undefined,
    }
    act(() => useShowStore.setState({
      stockShowDrafts: {
        [stock.id]: editedDraft,
      },
    }))
    expect(screen.queryByRole('button', { name: 'Select CompassRose' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveTextContent('Edited reference draft')

    await user.click(screen.getAllByRole('button', { name: 'Select Caustics' })[0])
    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    await user.clear(brightness)
    await user.type(brightness, '60%')
    fireEvent.blur(brightness)
    await waitFor(() => expect(useShowStore.getState().stockShowDrafts[stock.id].composition
      ?.patternInstances.find((instance) => instance.id === 'instance-reference-content-selected')).toMatchObject({
      pattern: { kind: 'stock', id: 'MetaballGarden' },
      controlTargets: { speed: 0.42 },
    }))

    await user.click(screen.getByRole('button', { name: 'Reset built-in Show' }))
    expect(useShowEditorSessionStore.getState().referencePatternsByShowId[stock.id]).toBeUndefined()
    expect(screen.getAllByRole('button', { name: 'Select MetaballGarden' }).length).toBeGreaterThan(0)
  }, 10_000)

  it('keeps a legacy reference Pattern transient after its first composition edit (#619)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-transform-effects')!

    const editor = render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        reference: stock.reference,
      }}
    />)

    await user.click(screen.getByRole('combobox', { name: 'Try with Pattern' }))
    await user.click(screen.getByRole('option', { name: 'Caustics' }))
    await user.click(screen.getAllByRole('button', { name: 'Select Caustics' })[0])
    const brightness = screen.getByRole('textbox', { name: 'Brightness exact percentage' })
    await user.clear(brightness)
    await user.type(brightness, '60%')
    fireEvent.blur(brightness)

    await waitFor(() => {
      const draft = useShowStore.getState().stockShowDrafts[stock.id]
      expect(draft.composition?.patternInstances.length).toBeGreaterThan(0)
      expect(draft.composition?.patternInstances.every((instance) => (
        instance.pattern.kind === 'stock' && instance.pattern.id === 'CompassRose'
      ))).toBe(true)
    })

    editor.unmount()
    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        reference: stock.reference,
      }}
    />)
    expect(screen.getAllByRole('button', { name: 'Select Caustics' }).length).toBeGreaterThan(0)

    await user.click(screen.getByRole('button', { name: 'Reset built-in Show' }))
    expect(screen.getAllByRole('button', { name: 'Select CompassRose' }).length).toBeGreaterThan(0)
  })

  it('keeps Clip resize grab zones clear of the junction band (#363)', () => {
    // A junction draws a 16px band centred on the boundary, covering 8px inside
    // each neighbouring Clip. A grab zone at the very edge of a joined Clip sits
    // underneath it and can never be hit, which is what made resizing feel
    // broken. 105 is two touching Clips per Zone, so one edge of each is joined
    // and the other is free.
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-105-portable-zones')!

    render(<ShowEditor showId={stock.id} showOverride={stock.show} />)

    const handles = screen.getAllByRole('separator', { name: /^Resize .+ (start|end)$/ })
    expect(handles.length).toBeGreaterThanOrEqual(8)

    const joined = handles.filter((handle) => handle.dataset.resizeJoined === 'true')
    const free = handles.filter((handle) => handle.dataset.resizeJoined !== 'true')
    expect(joined.length, 'each Zone has one Cut, joining two Clip edges').toBeGreaterThan(0)
    expect(free.length, 'the outer edges of the row are free').toBeGreaterThan(0)

    // Joined edges step inward past the band; free edges stay flush.
    for (const handle of joined) {
      expect(handle.className, handle.getAttribute('aria-label') ?? '').toMatch(/(left|right)-2\b/)
    }
    for (const handle of free) {
      expect(handle.className, handle.getAttribute('aria-label') ?? '').toMatch(/(left|right)-0\b/)
    }
  })

  it('projects one Scene-local keyframe animation into one main-timeline sparkline', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-102-transitions-values')!
    const before = structuredClone(stock.show.composition?.scenes[0].propertyTracks)

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    const localAnimation = screen.getByRole('group', { name: 'SignalMandala brightness animation for Main' })
    expect(localAnimation.querySelector('polyline')).toBeInTheDocument()
    expect(localAnimation.querySelectorAll('[data-property-beat-dot]')).toHaveLength(3)
    expect(screen.getAllByRole('group', { name: /animation for Main$/ })).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Animation speed lane for Main' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Select SignalMandala' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(within(panel).queryByText('Unsupported Property')).not.toBeInTheDocument()
    fireEvent.click(within(panel).getByRole('button', { name: 'Animations — 1' }))
    expect(within(panel).getByRole('region', { name: 'Animations overview' })).toBeInTheDocument()
    expect(within(panel).getByText('3 keyframes')).toBeInTheDocument()
    expect(within(panel).getByRole('button', { name: 'Remove Brightness animation' })).toBeDisabled()
    await user.click(within(panel).getByRole('button', { name: 'Back from Animations overview' }))
    expect(stock.show.composition?.scenes[0].propertyTracks).toEqual(before)
  })

  it('identifies each property sparkline on the lane itself (#631)', () => {
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-102-transitions-values')!

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    const lane = screen.getByRole('group', { name: 'SignalMandala brightness animation for Main' })
    const inlineLabel = within(lane).getByTestId('show-property-lane-inline-label')
    // The owning Clip sits directly above the lane, so an unambiguous property
    // needs no Clip name on the lane itself (#631).
    expect(inlineLabel).toHaveTextContent('brightness')
  })

  it('opens the Animations overview, returns to the owning field, and removes in one undo step (#607, #649)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-property-animation', 'Clip Property animation', 1000)
    const scene = show.scenes[0]
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(within(panel).queryByRole('button', { name: /^Animations/ })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'Animate Brightness' }))
    const toValue = screen.getByRole('textbox', { name: 'Brightness animation to exact percentage' })
    await user.clear(toValue)
    await user.type(toValue, '42%')
    fireEvent.blur(toValue)
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Brightness animation easing' }),
      'steps-4-end',
    )
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Brightness animation' }), { key: 'Escape' })

    await waitFor(() => {
      const track = useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks?.[0]
      expect(track?.target).toEqual({
        kind: 'placement-view',
        placementId: 'placement-cell-1-scene-1',
        property: 'brightness',
      })
      expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, scene.durationMs])
      const keyframe = track?.keyframes[1]
      expect(keyframe?.value).toBe(0.42)
      expect(track?.keyframes[0].easing).toMatchObject({ curve: 'steps', steps: 4, position: 'end' })
    })

    const summary = within(panel).getByRole('button', { name: 'Animations — 1' })
    await user.click(summary)
    const overview = within(panel).getByRole('region', { name: 'Animations overview' })
    expect(within(overview).getByRole('heading', { name: 'This Clip placement' })).toBeInTheDocument()
    const row = within(overview).getByRole('group', { name: 'Brightness animation summary' })
    expect(row).toHaveTextContent('100% → 42%')
    expect(row).toHaveTextContent(`0s → ${scene.durationMs / 1_000}s`)
    expect(row).toHaveTextContent('Header')

    await user.click(within(row).getByRole('button', { name: 'Go to Brightness field' }))
    await waitFor(() => expect(
      within(panel).getByRole('textbox', { name: 'Brightness exact percentage' }),
    ).toHaveFocus())

    await user.click(within(panel).getByRole('button', { name: 'Animations — 1' }))
    await user.click(within(panel).getByRole('button', { name: 'Back from Animations overview' }))
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Animations — 1' })).toHaveFocus())

    await user.click(within(panel).getByRole('button', { name: 'Animations — 1' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Animations — 1' })).toHaveFocus())

    await user.click(within(panel).getByRole('button', { name: 'Animations — 1' }))
    const historyBeforeRemove = useShowStore.getState().showHistories[show.id]?.past.length ?? 0
    await user.click(within(panel).getByRole('button', { name: 'Remove Brightness animation' }))
    await waitFor(() => {
      const current = useShowStore.getState()
      expect(current.shows[0].composition?.scenes[0].propertyTracks).toBeUndefined()
      expect(current.showHistories[show.id]?.past.length).toBe(historyBeforeRemove + 1)
      expect(within(panel).queryByRole('button', { name: /^Animations/ })).not.toBeInTheDocument()
    })
  })

  it('adds, edits, and deletes interior keyframes in the animation popover (#363)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-multi-keyframe-animation', 'Multi keyframe animation', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    await user.click(within(panel).getByRole('button', { name: 'Animate Brightness' }))
    const toValue = screen.getByRole('textbox', { name: 'Brightness animation to exact percentage' })
    await user.clear(toValue)
    await user.type(toValue, '42%')
    fireEvent.blur(toValue)
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks?.[0].keyframes).toHaveLength(2)
    })

    // A new keyframe splits the largest gap without changing the curve: it
    // lands at the midpoint carrying the evaluated value there.
    const sceneDurationMs = show.scenes[0].durationMs
    await user.click(screen.getByRole('button', { name: 'Add Brightness keyframe' }))
    await waitFor(() => {
      const track = useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks?.[0]
      expect(track?.keyframes.map((keyframe) => keyframe.timeMs))
        .toEqual([0, sceneDurationMs / 2, sceneDurationMs])
      expect(track?.keyframes[1].value).toBeCloseTo(0.71, 5)
    })

    // The interior keyframe is a full editing surface: value, time, and the
    // easing of the segment it starts.
    const middleValue = screen.getByRole('textbox', { name: 'Brightness animation keyframe 2 exact percentage' })
    await user.clear(middleValue)
    await user.type(middleValue, '20%')
    fireEvent.blur(middleValue)
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks?.[0].keyframes[1].value).toBe(0.2)
    })
    expect(screen.getByRole('combobox', { name: 'Brightness animation easing' })).toBeInTheDocument()
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Brightness animation easing after keyframe 2' }),
      'steps-4-end',
    )
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks?.[0].keyframes[1].easing)
        .toMatchObject({ curve: 'steps', steps: 4, position: 'end' })
    })

    // Only the interior keyframe offers deletion: endpoints own the values
    // the track holds outside its keyframes.
    expect(screen.getAllByRole('button', { name: /Delete Brightness animation/ }))
      .toHaveLength(1)

    // A multi-keyframe track reopens the same editor from its field diamond.
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Brightness animation' }), { key: 'Escape' })
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Brightness animation' })).not.toBeInTheDocument()
    })
    await user.click(within(panel).getByRole('button', { name: 'Edit Brightness animation' }))
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Brightness animation keyframe 2 exact percentage' }))
        .toBeInTheDocument()
    })

    await user.click(screen.getByRole('button', { name: 'Delete Brightness animation keyframe 2' }))
    await waitFor(() => {
      const track = useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks?.[0]
      expect(track?.keyframes.map((keyframe) => keyframe.timeMs)).toEqual([0, sceneDurationMs])
    })
    // The two-point floor: end keyframes offer no per-row delete.
    expect(screen.queryByRole('button', { name: /Delete Brightness animation/ })).not.toBeInTheDocument()
  })

  it('keeps a per-parameter draft transient and records its first edit as one undo step (#648)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-per-parameter-animation', 'Per-parameter animation', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const historyBeforeDraft = useShowStore.getState().showHistories[show.id]?.past.length ?? 0

    await user.click(within(panel).getByRole('button', { name: 'Animate Brightness' }))
    expect(screen.getByRole('dialog', { name: 'Brightness animation' })).toBeInTheDocument()
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Brightness animation' }), { key: 'Escape' })
    expect(useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks).toBeUndefined()
    expect(useShowStore.getState().showHistories[show.id]?.past.length ?? 0).toBe(historyBeforeDraft)
    expect(panel).toBeInTheDocument()

    await user.click(within(panel).getByRole('button', { name: 'Animate Brightness' }))
    const from = screen.getByRole('textbox', { name: 'Brightness animation from exact percentage' })
    await user.clear(from)
    await user.type(from, '60%')
    fireEvent.blur(from)

    await waitFor(() => {
      const current = useShowStore.getState()
      const track = current.shows[0].composition?.scenes[0].propertyTracks?.[0]
      expect(track?.target).toEqual({
        kind: 'placement-view',
        placementId: 'placement-cell-1-scene-1',
        property: 'brightness',
      })
      expect(track?.keyframes.map(({ timeMs, value }) => ({ timeMs, value }))).toEqual([
        { timeMs: 0, value: 0.6 },
        { timeMs: show.scenes[0].durationMs, value: 1 },
      ])
      expect(current.showHistories[show.id]?.past.length).toBe(historyBeforeDraft + 1)
    })

    expect(within(panel).getByRole('button', { name: 'Edit Brightness animation' }))
      .toHaveAttribute('data-animated', 'true')
    await user.click(screen.getByRole('button', { name: 'Remove Brightness animation' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.scenes[0].propertyTracks).toBeUndefined()
      expect(within(panel).getByRole('button', { name: 'Animate Brightness' }))
        .toHaveAttribute('data-animated', 'false')
    })
  })

  it('returns an overview row to its owning tab and focuses the exact field (#649)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-animation-navigation', 'Animation navigation', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    await user.click(within(panel).getByRole('tab', { name: /^Playback/ }))
    await user.click(within(panel).getByRole('button', { name: 'Animate Phase' }))
    const phaseFrom = screen.getByRole('textbox', { name: 'Phase animation from exact phase' })
    await user.clear(phaseFrom)
    await user.type(phaseFrom, '0.2')
    fireEvent.blur(phaseFrom)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Phase animation' }), { key: 'Escape' })
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))

    await user.click(within(panel).getByRole('button', { name: 'Animations — 1' }))
    const row = within(panel).getByRole('group', { name: 'Phase animation summary' })
    expect(row).toHaveTextContent('Playback')
    await user.click(within(row).getByRole('button', { name: 'Go to Phase field' }))

    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Playback/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Phase exact phase' })).toHaveFocus()
    })
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))
  })

  it('reveals the aperture before focusing a Viewport animation field (#649 review)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-viewport-animation-navigation', 'Viewport animation navigation', 1000)
    show.stageMapId = 'plane'
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    await user.click(within(panel).getByRole('tab', { name: /^Place/ }))
    await user.click(within(panel).getByRole('button', { name: 'Aperture summary' }))
    await user.click(within(panel).getByRole('button', { name: 'Animate Viewport Width' }))
    // The popover titles itself with the visible geometry field label (#687),
    // not the overview option label ('Viewport width' / 'Position X').
    const widthFrom = screen.getByRole('textbox', { name: 'Width animation from exact multiplier' })
    await user.clear(widthFrom)
    await user.type(widthFrom, '0.8x')
    fireEvent.blur(widthFrom)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Width animation' }), { key: 'Escape' })
    await user.click(within(panel).getByRole('button', { name: 'Content summary' }))
    await user.click(within(panel).getByRole('button', { name: 'Animate Content X' }))
    const positionFrom = screen.getByRole('textbox', { name: 'X animation from' })
    await user.clear(positionFrom)
    await user.type(positionFrom, '0.2')
    fireEvent.blur(positionFrom)
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'X animation' }), { key: 'Escape' })
    await user.click(within(panel).getByRole('button', { name: 'Aperture summary' }))
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))

    await user.click(within(panel).getByRole('button', { name: 'Animations — 2' }))
    const row = within(panel).getByRole('group', { name: 'Viewport width animation summary' })
    await user.click(within(row).getByRole('button', { name: 'Go to Viewport width field' }))

    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Viewport Width exact multiplier' })).toHaveFocus()
    })
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))
    await user.click(within(panel).getByRole('button', { name: 'Animations — 2' }))
    const positionRow = within(panel).getByRole('group', { name: 'Position X animation summary' })
    await user.click(within(positionRow).getByRole('button', { name: 'Go to Position X field' }))

    await waitFor(() => {
      expect(within(panel).getByRole('tab', { name: /^Place/ })).toHaveAttribute('aria-selected', 'true')
      expect(within(panel).getByRole('textbox', { name: 'Content X exact position' })).toHaveFocus()
    })
    await user.click(within(panel).getByRole('tab', { name: /^Pattern/ }))
  })

  it('abbreviates the owning Clip only where two lanes animate the same property (#631)', () => {
    const show = createDefaultShow('show-colliding-property-lanes', 'Colliding property lanes', 1000)
    const [firstScene] = show.scenes
    const zone = show.zones[0]
    const ramp = (id: string) => [
      { id: `${id}-start`, timeMs: 0, value: 0.25, easing: { curve: 'linear' as const } },
      { id: `${id}-end`, timeMs: firstScene.durationMs, value: 0.75, easing: { curve: 'linear' as const } },
    ]
    show.composition = {
      version: 1,
      patternInstances: [
        { id: 'instance-a', pattern: { kind: 'stock', id: 'TestPattern1D' }, patternName: 'TestPattern1D', time: { timeScale: 1, timeOffsetMs: 0 } },
        { id: 'instance-b', pattern: { kind: 'stock', id: 'CometLoom' }, patternName: 'CometLoom', time: { timeScale: 1, timeOffsetMs: 0 } },
      ],
      scenes: [{
        sceneId: firstScene.id,
        propertyTracks: [
          {
            id: 'track-a-brightness',
            target: { kind: 'placement-view', placementId: 'placement-a', property: 'brightness' },
            keyframes: ramp('key-a'),
          },
          {
            id: 'track-b-brightness',
            target: { kind: 'placement-view', placementId: 'placement-b', property: 'brightness' },
            keyframes: ramp('key-b'),
          },
          {
            id: 'track-b-phase',
            target: { kind: 'placement-view', placementId: 'placement-b', property: 'phase' },
            keyframes: ramp('key-p'),
          },
        ],
        zones: [{
          zoneId: zone.id,
          main: [
            { id: 'placement-a', instanceId: 'instance-a', startMs: 0, durationMs: firstScene.durationMs, view: { brightness: 1, phase: 0, mirror: false } },
            { id: 'placement-b', instanceId: 'instance-b', startMs: 0, durationMs: firstScene.durationMs, view: { brightness: 1, phase: 0, mirror: false } },
          ],
          overlays: [],
        }],
      }],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const labelFor = (accessibleName: string) => within(
      screen.getByRole('group', { name: accessibleName }),
    ).getByTestId('show-property-lane-inline-label').textContent

    // Two Clips animate brightness, so those lanes reclaim an abbreviated owner.
    expect(labelFor('TestPattern1D brightness animation for main')).toBe('TPD brightness')
    expect(labelFor('CometLoom brightness animation for main')).toBe('CL brightness')
    // Phase is unique in the Zone, so it stays bare.
    expect(labelFor('CometLoom phase animation for main')).toBe('phase')
  })

  it('exposes only Property animations owned by the inspected Clip (#607)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-property-ownership', 'Clip Property ownership', 1000)
    const [firstScene, secondScene] = show.scenes
    const zone = show.zones[0]
    show.composition = {
      version: 1,
      patternInstances: [
        {
          id: 'instance-a',
          pattern: { kind: 'stock', id: 'TestPattern1D' },
          patternName: 'TestPattern1D',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
        {
          id: 'instance-b',
          pattern: { kind: 'stock', id: 'CometLoom' },
          patternName: 'CometLoom',
          time: { timeScale: 1, timeOffsetMs: 0 },
        },
      ],
      scenes: [
        {
          sceneId: firstScene.id,
          propertyTracks: [{
            id: 'track-b-brightness',
            target: { kind: 'placement-view', placementId: 'placement-b', property: 'brightness' },
            keyframes: [
              { id: 'key-b-start', timeMs: 0, value: 0.25, easing: { curve: 'linear' } },
              { id: 'key-b-end', timeMs: firstScene.durationMs, value: 0.75, easing: { curve: 'linear' } },
            ],
          }],
          zones: [{
            zoneId: zone.id,
            main: [
              {
                id: 'placement-a',
                instanceId: 'instance-a',
                startMs: 0,
                durationMs: firstScene.durationMs / 2,
                view: { brightness: 1, phase: 0, mirror: false },
              },
              {
                id: 'placement-b',
                instanceId: 'instance-b',
                startMs: firstScene.durationMs / 2,
                durationMs: firstScene.durationMs / 2,
                view: { brightness: 1, phase: 0, mirror: false },
              },
            ],
            overlays: [],
          }],
        },
        { sceneId: secondScene.id, zones: [{ zoneId: zone.id, main: [], overlays: [] }] },
      ],
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    expect(screen.queryByText('Unsupported Property')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Animations/ })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Select CometLoom' }))
    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    await user.click(within(panel).getByRole('button', { name: 'Animations — 1' }))
    expect(within(panel).getByRole('group', { name: 'Brightness animation summary' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    const switchedPanel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(within(switchedPanel).queryByRole('region', { name: 'Animations overview' })).not.toBeInTheDocument()
    expect(within(switchedPanel).getByRole('combobox', { name: 'Source pattern' })).toBeInTheDocument()
  })


  it('switches from an existing Show to a newly created Show during playback without an update loop', async () => {
    const existing = createDefaultShow('show-existing', 'Existing Show', 1000)
    existing.scenes[0] = { ...existing.scenes[0], durationMs: 12_000 }
    const created = createDefaultShow('show-created', 'Untitled Show', 2000)
    useShowStore.setState({
      shows: [created, existing],
      activeShowId: existing.id,
      showsLoaded: true,
    })

    useShowTransportStore.getState().openShow(existing.id, 43_000)
    const view = render(<ShowEditor showId={existing.id} />)
    view.rerender(<ShowEditor showId={created.id} />)
    useShowTransportStore.getState().openShow(created.id, 62_000)

    for (let frame = 1; frame <= 60; frame += 1) {
      await act(async () => {
        useShowTransportStore.getState().setPosition(created.id, frame * 16)
      })
    }

    await userEvent.setup().click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Untitled Show')).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
  })

  it('keeps the Show workspace scrollable without exposing a vertical scrollbar', () => {
    const show = createDefaultShow('show-scroll', 'Long Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByTestId('show-editor-scroll')).toHaveClass('overflow-auto', 'scrollbar-hidden')
    expect(screen.getByTestId('show-compile-bar')).toHaveClass('overflow-x-auto', 'scrollbar-hidden')
  })

  it('reserves Space for Show playback across Timeline toolbar controls', () => {
    const show = createDefaultShow('show-space', 'Keyboard Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Fit timeline to Show' }), { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggles playback with Space while the Show playhead has focus', () => {
    const show = createDefaultShow('show-playhead-space', 'Focused playhead', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    playhead.focus()
    fireEvent.keyDown(playhead, { code: 'Space', key: ' ' })

    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('toggles playback with Space while the Show navigator thumb has focus', () => {
    const show = createDefaultShow('show-navigator-space', 'Focused navigator', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)

    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    navigator.focus()
    fireEvent.keyDown(navigator, { code: 'Space', key: ' ' })

    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('returns focus to the selected Clip after a discrete inspector commit so Space previews the change (#439)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-focus-return', 'Fast edit loop', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const selectedClip = screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0]
    await user.click(selectedClip)
    // Focusing the picker starts a fresh search over an empty field (#63).
    await user.click(screen.getByRole('combobox', { name: 'Source pattern' }))
    await user.type(screen.getByRole('combobox', { name: 'Source pattern' }), 'CometLoom')
    await user.click(screen.getByRole('option', { name: 'CometLoom' }))

    await waitFor(() => expect(document.activeElement).toBe(selectedClip))
    await user.keyboard(' ')
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('seeks to Show start with A while preserving playback (#588)', () => {
    const show = createDefaultShow('show-keyboard-seek', 'Keyboard seek', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    usePreviewStore.setState({ isRunning: true })
    useShowTransportStore.getState().setPosition(show.id, 61_500)
    fireEvent.keyDown(document.body, { key: 'a', metaKey: true })
    expect(useShowTransportStore.getState().seekRequest).toBeNull()
    fireEvent.keyDown(document.body, { key: 'a' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    const goToStart = screen.getByRole('button', { name: 'Go to Show start' })
    expect(goToStart).toHaveAttribute('title', 'Go to Show start (A)')
    useShowTransportStore.getState().setPosition(show.id, 5_000)
    fireEvent.click(goToStart)
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('seeks five seconds with arrows without changing playback or the timeline viewport (#602)', () => {
    const show = createDefaultShow('show-keyboard-seek-step', 'Keyboard seek step', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize visible range end' }), { key: 'ArrowLeft' })
    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    const viewportStart = navigator.getAttribute('aria-valuenow')
    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    clip.focus()
    usePreviewStore.setState({ isRunning: true })
    useShowTransportStore.getState().setPosition(show.id, 10_000)

    fireEvent.keyDown(clip, { key: 'ArrowRight' })
    const seekAfterInitialPress = useShowTransportStore.getState().seekRequest
    expect(seekAfterInitialPress).toMatchObject({ targetMs: 15_000 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(navigator).toHaveAttribute('aria-valuenow', viewportStart)

    fireEvent.keyDown(clip, { key: 'ArrowRight', repeat: true })
    expect(useShowTransportStore.getState().seekRequest).toEqual(seekAfterInitialPress)
    expect(useShowTransportStore.getState().positionMs).toBe(15_000)
    expect(usePreviewStore.getState().isRunning).toBe(true)

    fireEvent.keyDown(clip, { key: 'ArrowLeft' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 10_000 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(navigator).toHaveAttribute('aria-valuenow', viewportStart)

    usePreviewStore.setState({ isRunning: false })
    fireEvent.keyDown(clip, { key: 'ArrowLeft' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 5_000 })
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(navigator).toHaveAttribute('aria-valuenow', viewportStart)
  })

  it('seeks five seconds with arrows from ordinary Show page content without timeline focus (#63)', () => {
    const show = createDefaultShow('show-global-keyboard-seek', 'Global keyboard seek', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    usePreviewStore.setState({ isRunning: true })
    useShowTransportStore.getState().setPosition(show.id, 10_000)
    document.body.focus()

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })

    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 15_000 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('leaves global Arrow and A Show shortcuts inactive in text-entry controls (#63)', () => {
    const show = createDefaultShow('show-editable-keyboard-guard', 'Editable keyboard guard', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    useShowTransportStore.getState().setPosition(show.id, 10_000)
    const input = document.createElement('input')
    input.type = 'text'
    document.body.append(input)

    fireEvent.keyDown(input, { key: 'ArrowRight' })
    fireEvent.keyDown(input, { key: 'a' })

    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 10_000,
      seekRequest: null,
    })
    input.remove()
  })

  it.each([
    ['Meta', { metaKey: true }],
    ['Control', { ctrlKey: true }],
    ['Alt', { altKey: true }],
    ['Shift', { shiftKey: true }],
  ])('leaves %s+Arrow available to the browser or focused page content (#63)', (_name, modifier) => {
    const show = createDefaultShow('show-modified-arrow-guard', 'Modified Arrow guard', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    useShowTransportStore.getState().setPosition(show.id, 10_000)
    fireEvent.keyDown(document.body, { key: 'ArrowRight', ...modifier })

    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 10_000,
      seekRequest: null,
    })
  })

  it('ignores a global Arrow while transport is transiently open on another Show (#63)', () => {
    const show = createDefaultShow('show-transport-owner', 'Transport owner', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    useShowTransportStore.getState().openShow('other-show', 62_000)
    useShowTransportStore.getState().setPosition('other-show', 25_000)
    usePreviewStore.setState({ isRunning: true })
    const toggle = vi.spyOn(usePreviewStore.getState(), 'toggle')

    fireEvent.keyDown(document.body, { key: 'ArrowRight' })

    expect(toggle).not.toHaveBeenCalled()
    expect(useShowTransportStore.getState()).toMatchObject({
      showId: 'other-show',
      positionMs: 25_000,
      seekRequest: null,
    })
  })

  it.each([
    ['expanded', 'true', 'ArrowRight'],
    ['collapsed', 'false', 'ArrowLeft'],
  ])('leaves Arrow ownership with an %s Show rail folder (#63)', (_state, expanded, key) => {
    const show = createDefaultShow('show-rail-folder-arrow-guard', 'Rail folder Arrow guard', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const folder = document.createElement('li')
    folder.setAttribute('role', 'treeitem')
    folder.setAttribute('aria-expanded', expanded)
    folder.setAttribute('data-studio-space-preview', 'true')
    document.body.append(folder)
    useShowTransportStore.getState().setPosition(show.id, 10_000)

    fireEvent.keyDown(folder, { key })

    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 10_000,
      seekRequest: null,
    })
    folder.remove()
  })

  it('clamps arrow-key Show seeks at the Show boundaries (#602)', () => {
    const show = createDefaultShow('show-keyboard-seek-clamp', 'Keyboard seek clamp', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    useShowTransportStore.getState().setPosition(show.id, 2_000)
    fireEvent.keyDown(clip, { key: 'ArrowLeft' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })

    useShowTransportStore.getState().setPosition(show.id, 60_000)
    fireEvent.keyDown(clip, { key: 'ArrowRight' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 62_000 })
  })

  it('maps 1, 2, and 3 to 1x, 2x, and 3x without changing playback (#63)', () => {
    const show = createDefaultShow('show-keyboard-speed', 'Keyboard speed', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false, speed: 4 })
    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(document, { key: '1' })
    expect(usePreviewStore.getState()).toMatchObject({ speed: 1, isRunning: false })
    fireEvent.keyDown(document, { key: '2' })
    expect(usePreviewStore.getState()).toMatchObject({ speed: 2, isRunning: false })
    usePreviewStore.setState({ isRunning: true })
    fireEvent.keyDown(document, { key: '3' })
    expect(usePreviewStore.getState()).toMatchObject({ speed: 3, isRunning: true })

    fireEvent.keyDown(document, { key: '1', metaKey: true })
    expect(usePreviewStore.getState().speed).toBe(3)

    const input = document.createElement('input')
    input.type = 'text'
    document.body.append(input)
    fireEvent.keyDown(input, { key: '1' })
    expect(usePreviewStore.getState().speed).toBe(3)
    input.remove()
  })

  it('traverses Clips in timeline order with Tab and Shift-Tab and wraps (#588)', () => {
    const show = createDefaultShow('show-keyboard-traversal', 'Keyboard traversal', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const first = screen.getByRole('button', { name: 'Select TestPattern1D' })
    const second = screen.getByRole('button', { name: 'Select CometLoom' })
    first.focus()

    fireEvent.keyDown(first, { key: 'Tab' })
    expect(document.activeElement).toBe(second)
    fireEvent.keyDown(second, { key: 'Tab' })
    expect(document.activeElement).toBe(first)
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(document.activeElement).toBe(second)
  })

  it('leaves native Tab traversal intact inside the Timeline toolbar (#592)', () => {
    const show = createDefaultShow('show-toolbar-tab', 'Toolbar Tab', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const zones = screen.getByRole('button', { name: 'Open Zones' })
    zones.focus()

    expect(fireEvent.keyDown(zones, { key: 'Tab' })).toBe(true)
    expect(document.activeElement).toBe(zones)
  })

  it('reserves Space for Show playback after a transport button retains focus', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-focused-transport', 'Focused transport', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })
    render(<ShowEditor showId={show.id} />)

    const goToStart = screen.getByRole('button', { name: 'Go to Show start' })
    await user.click(goToStart)
    expect(document.activeElement).not.toBe(goToStart)
    goToStart.focus()
    expect(document.activeElement).toBe(goToStart)
    expect(usePreviewStore.getState().isRunning).toBe(false)

    await user.keyboard(' ')

    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('accelerates held arrow keys on the Show playhead and commits on release', () => {
    const show = createDefaultShow('show-keyboard-hold', 'Keyboard hold', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    act(() => useShowTransportStore.getState().setPosition(show.id, 10_000))

    const press = (timeStamp: number, repeat: boolean) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', repeat, bubbles: true })
      Object.defineProperty(event, 'timeStamp', { value: timeStamp })
      fireEvent(playhead, event)
    }

    press(100, false)
    expect(useShowTransportStore.getState().positionMs).toBe(11_000)
    press(700, true)
    expect(useShowTransportStore.getState().positionMs).toBe(13_000)
    press(1_700, true)
    expect(useShowTransportStore.getState().positionMs).toBe(18_000)
    expect(useShowTransportStore.getState().seekRequest).toBeNull()

    fireEvent.keyUp(playhead, { key: 'ArrowRight' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 18_000 })
  })

  it('scrubs the playhead at a tenth of the gain while Shift is held (#667)', async () => {
    const show = createDefaultShow('show-playhead-fine', 'Playhead fine scrub', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    act(() => useShowTransportStore.getState().setPosition(show.id, 10_000))
    // The input extends 8px past each ruler edge: 636px rect = 620px track
    // over 62s, i.e. 100ms per pixel coarse.
    vi.spyOn(playhead, 'getBoundingClientRect').mockReturnValue({
      left: 92, right: 728, top: 0, bottom: 24, width: 636, height: 24, x: 92, y: 0, toJSON: () => ({}),
    })

    fireEvent.pointerDown(playhead, { pointerId: 51, clientX: 200, shiftKey: true })
    fireEvent.pointerMove(playhead, { pointerId: 51, clientX: 250, shiftKey: true })
    // +50px of travel at a tenth of the gain is +500ms, from the playhead's
    // own position — no jump to the pointer.
    expect(useShowTransportStore.getState().positionMs).toBe(10_500)

    // Releasing Shift keeps the gesture incremental at full gain: +10px is
    // +1s from the fine-adjusted time, not a jump to the pointer's absolute
    // track position (#667 review).
    fireEvent.pointerMove(playhead, { pointerId: 51, clientX: 260 })
    expect(useShowTransportStore.getState().positionMs).toBe(11_500)

    // The native range mapping stays suppressed for the rest of the gesture.
    fireEvent.change(playhead, { target: { value: '15000' } })
    expect(useShowTransportStore.getState().positionMs).toBe(11_500)

    fireEvent.pointerUp(playhead, { pointerId: 51, clientX: 260 })
    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 11_500 })
    })
  })

  it('keeps the direct playhead drag incremental after Shift is released (#667)', async () => {
    const show = createDefaultShow('show-direct-playhead-fine', 'Direct playhead fine', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    act(() => useShowTransportStore.getState().setPosition(show.id, 10_000))

    const hitTarget = screen.getByTestId('show-timeline-playhead-hit-target')
    const track = hitTarget.parentElement!
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100, right: 720, top: 0, bottom: 300, width: 620, height: 300, x: 100, y: 0, toJSON: () => ({}),
    })

    // Grab with Shift: fine from the playhead's own time, 100ms/px track.
    fireEvent.pointerDown(hitTarget, { pointerId: 61, clientX: 200, shiftKey: true })
    fireEvent.pointerMove(hitTarget, { pointerId: 61, clientX: 250, shiftKey: true })
    expect(useShowTransportStore.getState().positionMs).toBe(10_500)

    // Releasing Shift continues from 10.5s at full gain — the pointer's
    // absolute position (15s) must not win (#667 review).
    fireEvent.pointerMove(hitTarget, { pointerId: 61, clientX: 260 })
    expect(useShowTransportStore.getState().positionMs).toBe(11_500)

    fireEvent.pointerUp(hitTarget, { pointerId: 61, clientX: 260 })
    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 11_500 })
    })
  })

  it('removes Show shortcuts when the Show editor closes (#439)', () => {
    const show = createDefaultShow('show-shortcut-scope', 'Shortcut scope', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false, speed: 4 })
    const view = render(<ShowEditor showId={show.id} />)
    useShowTransportStore.getState().setPosition(show.id, 5_000)

    view.unmount()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { key: '2' })
    fireEvent.keyDown(document, { code: 'Space' })

    expect(useShowTransportStore.getState()).toMatchObject({ positionMs: 5_000, seekRequest: null })
    expect(usePreviewStore.getState()).toMatchObject({ isRunning: false, speed: 4 })
  })

  it('drives proportional Show transport and requests an accurate seek (#414)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Show playhead' })).toHaveAttribute('max', '62000')
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')
    expect(screen.getByRole('button', { name: 'Play Show preview' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Play Show preview' }))
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause Show preview' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Pause Show preview' }))
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(screen.getByRole('button', { name: 'Play Show preview' })).toBeInTheDocument()

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.change(playhead, { target: { value: '31000' } })

    expect(useShowTransportStore.getState().seekRequest).toBeNull()
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:31.0/01:02.0')

    fireEvent.pointerUp(playhead)

    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 31_000 })
    })
    expect(useShowTransportStore.getState().seekStatus).toBe('rebuilding')

    fireEvent.keyDown(document, { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('drags the one-pixel playhead through a wider direct pointer target (#480)', async () => {
    const show = createDefaultShow('show-direct-playhead', 'Direct playhead drag', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const hitTarget = screen.getByTestId('show-timeline-playhead-hit-target')
    const track = hitTarget.parentElement!
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      right: 720,
      top: 0,
      bottom: 300,
      width: 620,
      height: 300,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    })

    fireEvent.pointerDown(hitTarget, { pointerId: 7, clientX: 100 })
    fireEvent.pointerMove(hitTarget, { pointerId: 7, clientX: 410 })
    expect(useShowTransportStore.getState().positionMs).toBe(30_000)
    expect(useShowTransportStore.getState().seekRequest).toBeNull()

    fireEvent.pointerUp(hitTarget, { pointerId: 7, clientX: 410 })
    await waitFor(() => {
      expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 30_000 })
    })
  })

  it('snaps pointer scrubbing to Show boundaries and allows snapping to be disabled (#63)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-63-snap', 'Snapping', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const toggle = screen.getByRole('button', { name: 'Snap playhead' })
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(toggle).toHaveAttribute(
      'title',
      'Magnetize drags to nearby Clip, Transition, Marker, Show-end, and playhead boundaries. Drops always land on the time grid: whole seconds, finer as you zoom in · Shift for tenths · Alt for free placement.',
    )
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.pointerDown(playhead)
    fireEvent.change(playhead, { target: { value: '29500' } })
    expect(useShowTransportStore.getState().positionMs).toBe(30_000)
    fireEvent.pointerUp(playhead)

    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.pointerDown(playhead)
    fireEvent.change(playhead, { target: { value: '29500' } })
    expect(useShowTransportStore.getState().positionMs).toBe(29_500)
    fireEvent.pointerUp(playhead)
  })

  it('resumes playback after scrubbing a Show that was already playing', () => {
    const show = createDefaultShow('show-resume-scrub', 'Resume after scrub', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    act(() => usePreviewStore.getState().setRunning(true))

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    fireEvent.change(playhead, { target: { value: '31000' } })
    expect(usePreviewStore.getState().isRunning).toBe(false)

    fireEvent.pointerUp(playhead)
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(useShowTransportStore.getState()).toMatchObject({
      positionMs: 31_000,
      seekStatus: 'rebuilding',
    })
  })

  it('leaves ordinary vertical wheel input available to the Show editor scroll owner (#476)', () => {
    const show = createDefaultShow('show-476-wheel', 'Wheel pan study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByTestId('show-timeline-scroll-region')
    Object.defineProperties(timeline, {
      clientWidth: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 1200 },
      scrollLeft: { configurable: true, writable: true, value: 100 },
    })

    const defaultAllowed = fireEvent.wheel(timeline, { deltaY: 120 })

    expect(defaultAllowed).toBe(true)
    expect(timeline.scrollLeft).toBe(100)
  })

  it('pans the Show timeline horizontally with Shift and a vertical mouse wheel (#476)', () => {
    const show = createDefaultShow('show-476-shift-wheel', 'Shift wheel pan study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByTestId('show-timeline-scroll-region')
    Object.defineProperties(timeline, {
      clientWidth: { configurable: true, value: 600 },
      scrollWidth: { configurable: true, value: 1200 },
      scrollLeft: { configurable: true, writable: true, value: 300 },
    })

    fireEvent.wheel(timeline, { shiftKey: true, deltaY: -75 })

    expect(timeline.scrollLeft).toBe(225)
  })

  it('updates the visible Split refusal at Scene boundaries and valid positions (#473)', () => {
    const show = createDefaultShow('show-473', 'Split guidance', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    const split = screen.getByRole('button', { name: 'Split at playhead' })
    const commands = screen.getByRole('group', { name: 'Timeline commands' })
    const refusal = () => within(commands).queryByRole('status', { name: 'Split unavailable' })

    expect(split).toHaveAttribute('aria-disabled', 'true')
    expect(refusal()).not.toBeInTheDocument()
    fireEvent.focus(split)
    expect(refusal()).toHaveTextContent('Split needs 1.0 s on both sides')

    fireEvent.change(playhead, { target: { value: '500' } })
    expect(split).toHaveAttribute('aria-disabled', 'true')
    expect(refusal()).toHaveTextContent('Split needs 1.0 s on both sides')

    fireEvent.change(playhead, { target: { value: '1000' } })
    expect(split).not.toHaveAttribute('aria-disabled')
    expect(refusal()).not.toBeInTheDocument()

    fireEvent.change(playhead, { target: { value: '30000' } })
    expect(split).toHaveAttribute('aria-disabled', 'true')
    fireEvent.click(split)
    expect(refusal()).toHaveTextContent('Split needs 1.0 s on both sides')

    fireEvent.change(playhead, { target: { value: '30500' } })
    expect(refusal()).toHaveTextContent('Move the playhead inside the selected Clip')
  })

  it('turns a named routing layout into a two-zone moving split (#405)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-405-layout', 'Moving split setup', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'split-x')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'split',
        zoneIds: ['zone-1', 'zone-2'],
        axis: 'x',
      })
    })
    expect(screen.getByRole('button', { name: 'Edit split position at 32.0: CometLoom' })).toBeInTheDocument()
    expect(screen.getByText(/boundary values move the split continuously/i)).toBeInTheDocument()
  })

  it('authors Checker dimensions from the existing routing inspector (#507)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-507-checker-editor',
      'Checker setup',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'alternate', nominalPixelCount: 4 })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'checker')

    expect(screen.getByLabelText('Checker columns')).toHaveValue(4)
    expect(screen.getByLabelText('Checker rows')).toHaveValue(4)
    changeCommittedNumber('Checker columns', '6')
    changeCommittedNumber('Checker rows', '3')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'checker',
        zoneIds: ['zone-1', 'zone-2'],
        columns: 6,
        rows: 3,
      })
    })
    expect(screen.getByText(/alternate across a 6 x 3 checker/i)).toBeInTheDocument()
  })

  it('authors Rings count from the existing routing inspector (#507)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-507-rings-editor',
      'Rings setup',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'alternate', nominalPixelCount: 4 })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'rings')

    expect(screen.getByLabelText('Ring count')).toHaveValue(5)
    changeCommittedNumber('Ring count', '7')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'rings',
        zoneIds: ['zone-1', 'zone-2'],
        rings: 7,
      })
    })
    expect(screen.getByText(/cycle through 7 concentric rings/i)).toBeInTheDocument()
  })

  it('authors Pinwheel arms, twist, and rotation from the existing routing inspector (#507)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-507-pinwheel-editor',
      'Pinwheel setup',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'alternate', nominalPixelCount: 4 })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'pinwheel')

    expect(screen.getByLabelText('Pinwheel arms')).toHaveValue(6)
    expect(screen.getByLabelText('Pinwheel twist turns')).toHaveValue(1.35)
    expect(screen.getByLabelText('Pinwheel rotation degrees')).toHaveValue(0)
    changeCommittedNumber('Pinwheel arms', '8')
    changeCommittedNumber('Pinwheel twist turns', '0.75')
    changeCommittedNumber('Pinwheel rotation degrees', '30')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'pinwheel',
        zoneIds: ['zone-1', 'zone-2'],
        arms: 8,
        twist: Math.PI * 1.5,
        rotation: Math.PI / 6,
      })
    })
  })

  it('authors Wave axis and band parameters from the existing routing inspector (#507)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-507-wave-editor',
      'Wave setup',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'alternate', nominalPixelCount: 4 })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'wave')

    expect(screen.getByLabelText('Wave axis')).toHaveValue('x')
    expect(screen.getByLabelText('Wave band count')).toHaveValue(4)
    expect(screen.getByRole('textbox', { name: 'Wave amplitude exact percentage' })).toHaveValue('30')
    expect(screen.getByLabelText('Wave frequency')).toHaveValue(2.5)
    expect(screen.getByLabelText('Wave phase')).toHaveValue(0)
    await user.selectOptions(screen.getByLabelText('Wave axis'), 'y')
    changeCommittedNumber('Wave band count', '6')
    changeCommittedNumber('Wave amplitude', '40%')
    changeCommittedNumber('Wave frequency', '3')
    changeCommittedNumber('Wave phase', '0.2')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'wave',
        zoneIds: ['zone-1', 'zone-2'],
        axis: 'y',
        bands: 6,
        amplitude: 0.4,
        frequency: 3,
        phase: 0.2,
      })
    })
  })

  it('authors Soft Split feather and discloses its bounded two-renderer cost (#507)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-507-soft-split-editor',
      'Soft Split setup',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'alternate', nominalPixelCount: 4 })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'soft-split')

    expect(screen.getByLabelText('Soft Split axis')).toHaveValue('x')
    expect(screen.getByRole('textbox', { name: 'Soft Split feather exact percentage' })).toHaveValue('20')
    expect(screen.getByText(/inside the feather, both patterns render/i)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Zone Layouts lane' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Soft Split axis'), 'y')
    changeCommittedNumber('Soft Split feather', '30%')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'soft-split',
        zoneIds: ['zone-1', 'zone-2'],
        axis: 'y',
        feather: 0.3,
      })
    })
  })

  it('shows the Zone Layouts lane as soon as a second zone makes the layout non-trivial (#694)', () => {
    let show = createShowWithOutputContract(
      'show-694-lane-visibility',
      'Two zones',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'alternate' })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Zone Layouts lane' })).toBeInTheDocument()
    expect(screen.getByText('Left / right stripes')).toBeInTheDocument()
  })

  it('hides the Zone Layouts lane while a show keeps the trivial full-surface layout (#694)', () => {
    const show = createShowWithOutputContract(
      'show-694-lane-trivial',
      'One zone',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('group', { name: 'Zone Layouts lane' })).not.toBeInTheDocument()
  })

  it('does not mistake a constant spanning Clip override for property animation (#417)', () => {
    let show = addShowZone(createDefaultShow('show-417-span', 'Spanning time', 1000), {
      name: 'edge',
      nominalPixelCount: 16,
    })
    show = spanShowCellZones(show, show.cells[0].id, 2)
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 0.75 })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('group', { name: 'Animation speed lane for main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Animation speed lane for edge' })).not.toBeInTheDocument()
  })

  it('opens Show properties from the Show header action', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-properties-route', 'Properties route', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    expect(screen.getByRole('heading', { name: 'TestPattern1D' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
  })

  it('offers first-class Run and Save actions for the canonical generated Show (#429)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-send', 'Opening Night', 1000)
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          nickname: 'Bench PB',
          phase: 'live',
          mapDim: 1,
          firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))
    expect(pushGeneratedArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      artifactId: 'show:show-send',
      name: 'Opening Night',
      persist: false,
      artifactStamp: expect.objectContaining({ kind: 'show', id: 'show-send' }),
    }))

    await user.click(screen.getByRole('button', { name: 'Save to Bench PB' }))
    expect(pushGeneratedArtifact).toHaveBeenLastCalledWith(expect.objectContaining({
      artifactId: 'show:show-send',
      persist: true,
    }))
  })

  it('compiles the current Pattern source when Run follows an urgent Show dependency update (#593)', async () => {
    const show = createDefaultShow('show-send-current', 'Current source', 1000)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'live-pattern' },
      patternName: 'Live Pattern',
    }
    const oldPattern: PatternRecord = {
      id: 'live-pattern',
      name: 'Live Pattern',
      src: 'export function render(index) { rgb(0.1234567, 0, 0) }',
      controls: {},
      updatedAt: 1,
    }
    const newPattern: PatternRecord = {
      ...oldPattern,
      src: 'export function render(index) { rgb(0.7654321, 0, 0) }',
      updatedAt: 2,
    }
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePatternStore.setState({ userPatterns: [oldPattern], patternsLoaded: true })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          nickname: 'Bench PB',
          phase: 'live',
          mapDim: 1,
          firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    const run = screen.getByRole('button', { name: 'Run on Bench PB' })
    act(() => {
      usePatternStore.setState({ userPatterns: [newPattern] })
      fireEvent.click(run)
    })

    await waitFor(() => expect(pushGeneratedArtifact).toHaveBeenCalled())
    const source = pushGeneratedArtifact.mock.calls[0][0].source as string
    expect(source).toContain('0.7654321')
    expect(source).not.toContain('0.1234567')
  })

  it('confirms a Controller renderer adaptation before sending the adapted Show (#429)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-adapt', 'Spatial Show', 1000)
    show = { ...show, stageMapId: 'plane' }
    show = updateShowTransition(show, show.scenes[0].id, 'portal', 2000, 0.1)
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench PB', phase: 'live', mapDim: 1, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))

    expect(screen.getByTestId('show-preflight-dialog')).toBeInTheDocument()
    expect(pushGeneratedArtifact).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Send anyway' }))
    await waitFor(() => expect(pushGeneratedArtifact).toHaveBeenCalledWith(expect.objectContaining({
      source: expect.stringContaining('export function render(index, x)'),
      artifactStamp: expect.objectContaining({ transforms: expect.arrayContaining(['renderer-adapter']) }),
    })))
  })

  it('dismisses pending Controller delivery when navigating to another Show (#593)', async () => {
    const user = userEvent.setup()
    let firstShow = createDefaultShow('show-pending-first', 'Pending first', 1000)
    firstShow = { ...firstShow, stageMapId: 'plane' }
    firstShow = updateShowTransition(firstShow, firstShow.scenes[0].id, 'portal', 2000, 0.1)
    const secondShow = createDefaultShow('show-pending-second', 'Pending second', 1000)
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({
      shows: [firstShow, secondShow],
      activeShowId: firstShow.id,
      showsLoaded: true,
    })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench PB', phase: 'live', mapDim: 1, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    const view = render(<ShowEditor showId={firstShow.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))
    expect(screen.getByTestId('show-preflight-dialog')).toBeInTheDocument()

    view.rerender(<ShowEditor showId={secondShow.id} />)

    expect(screen.queryByTestId('show-preflight-dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send anyway' })).not.toBeInTheDocument()
    expect(pushGeneratedArtifact).not.toHaveBeenCalled()
  })

  it('dismisses pending Controller delivery when the active Controller changes (#593)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-pending-controller', 'Pending Controller', 1000)
    show = { ...show, stageMapId: 'plane' }
    show = updateShowTransition(show, show.scenes[0].id, 'portal', 2000, 0.1)
    const pushGeneratedArtifact = vi.fn().mockResolvedValue(undefined)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench A', phase: 'live', mapDim: 1, firmwareVersion: '3.67',
        },
        '10.0.0.6': {
          ip: '10.0.0.6', nickname: 'Bench B', phase: 'live', mapDim: 2, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact,
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench A' }))
    expect(screen.getByTestId('show-preflight-dialog')).toBeInTheDocument()

    act(() => useControllerStore.setState({ activeIp: '10.0.0.6' }))

    expect(screen.queryByTestId('show-preflight-dialog')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Send anyway' })).not.toBeInTheDocument()
    expect(pushGeneratedArtifact).not.toHaveBeenCalled()
  })

  it('closes generated code when navigating to another Show (#593)', async () => {
    const user = userEvent.setup()
    const firstShow = createDefaultShow('show-code-first', 'Generated first', 1000)
    const secondShow = createDefaultShow('show-code-second', 'Generated second', 1000)
    useShowStore.setState({
      shows: [firstShow, secondShow],
      activeShowId: firstShow.id,
      showsLoaded: true,
    })

    const view = render(<ShowEditor showId={firstShow.id} />)
    await user.click(screen.getByRole('button', { name: 'View code' }))
    expect(screen.getByText('Generated pattern - Generated first')).toBeInTheDocument()

    view.rerender(<ShowEditor showId={secondShow.id} />)

    expect(screen.queryByText('Generated pattern - Generated first')).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
  })

  it('exports the generated-code snapshot instead of later live Show state (#593)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-code-export-snapshot', 'Inspected snapshot', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:show-snapshot')
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    const previewJpeg = vi.spyOn(previewThumbnailJpeg, 'buildPreviewJpeg')
      .mockResolvedValue(new Uint8Array([1, 2, 3]))

    try {
      render(<ShowEditor showId={show.id} />)
      await user.click(screen.getByRole('button', { name: 'View code' }))
      expect(screen.getByText('Generated pattern - Inspected snapshot')).toBeInTheDocument()

      act(() => useShowStore.setState({
        shows: [{ ...show, name: 'Rolled back live Show', updatedAt: show.updatedAt + 1 }],
      }))
      await user.click(screen.getByRole('button', { name: 'Export Show as .epe' }))
      await waitFor(() => expect(createObjectURL).toHaveBeenCalledTimes(1))

      const blob = createObjectURL.mock.calls[0][0]
      if (!(blob instanceof Blob)) throw new TypeError('Expected Show export to create a Blob URL')
      const exportedText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.addEventListener('load', () => resolve(String(reader.result)))
        reader.addEventListener('error', () => reject(reader.error))
        reader.readAsText(blob)
      })
      const exported = JSON.parse(exportedText) as {
        name: string
        sources: { main: string }
      }
      expect(exported.name).toBe('Inspected snapshot')
      expect(exported.sources.main).toContain('Compiled PXLBLZ Show: Inspected snapshot')
      expect(exported.sources.main).not.toContain('Rolled back live Show')
    } finally {
      previewJpeg.mockRestore()
      anchorClick.mockRestore()
      revokeObjectURL.mockRestore()
      createObjectURL.mockRestore()
    }
  })

  it('blocks a known-invalid Installation Controller target without changing its map (#437)', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-fixed',
      'Measured wall Show',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1000,
    )
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'profile-live',
        name: 'Bench PB',
        lastSeenIp: '10.0.0.5',
        lastKnownPixelCount: 7,
        lastKnownMapDim: 2,
        mapFingerprints: [{
          hash: '22222222',
          mapId: 'wide',
          mapName: 'Wide 2:1',
          devicePixelCount: 7,
          pushedAt: 1,
        }],
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [],
        updatedAt: 1,
      }],
    })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench PB', phase: 'live', mapDim: 2, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact: vi.fn().mockResolvedValue(undefined),
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))

    expect(screen.getByTestId('show-preflight-dialog')).toHaveTextContent(
      'This Installation Show requires 8 pixels; the Controller reports 7.',
    )
    expect(screen.queryByRole('button', { name: 'Send anyway' })).not.toBeInTheDocument()
    expect(useControllerStore.getState().pushGeneratedArtifact).not.toHaveBeenCalled()
  })

  it('does not reinterpret map push history as the live installed map', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-live-map-truth',
      'Live map truth',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1000,
    )
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'profile-live',
        name: 'Bench PB',
        lastSeenIp: '10.0.0.5',
        lastKnownPixelCount: 8,
        mapFingerprints: [{
          hash: 'historical-only',
          mapId: 'wide',
          mapName: 'Wide 2:1',
          devicePixelCount: 8,
          pushedAt: 1,
        }],
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [],
        updatedAt: 1,
      }],
    })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5',
          nickname: 'Bench PB',
          phase: 'live',
          mapDim: 2,
          firmwareVersion: '3.67',
          installedMap: { status: 'absent', observedAt: 2 },
        },
      },
      activeIp: '10.0.0.5',
      pushGeneratedArtifact: vi.fn().mockResolvedValue(undefined),
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Run on Bench PB' }))

    const dialog = screen.getByTestId('show-preflight-dialog')
    expect(dialog).toHaveTextContent('This Installation Show expects its authored map')
    expect(dialog).not.toHaveTextContent('Wide 2:1')
    expect(screen.getByRole('button', { name: 'Send anyway' })).toBeInTheDocument()
  })

  it('keeps the compile bar focused on source, VM capacity, and actionable feedback (#63)', () => {
    const show = createDefaultShow('show-library-pattern', 'Shape study', 1000)
    show.stageMapId = 'plane'
    show.cells = [{
      ...show.cells[0],
      pattern: { kind: 'stock', id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    }]
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByText(/Unknown library namespace "SDF"/i)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'View code' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    const compileBar = screen.getByTestId('show-compile-bar')
    expect(compileBar).toHaveTextContent('Show source')
    expect(compileBar).toHaveTextContent(/VM [\d,]+\/10,240 words/)
    expect(compileBar).not.toHaveTextContent(/arena|free|render target:|cache plan:|crossfade:|est\. \d+ fps|steady state|worst instant:/i)
  })

  it('opens an exact proportional Show source inventory from keyboard-equivalent focus (#545)', async () => {
    const user = userEvent.setup()
    const property = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!

    render(<ShowEditor showId={property.id} showOverride={createPropertySlotQualificationShow()} readOnly />)

    const compileBar = screen.getByTestId('show-compile-bar')
    expect(compileBar).toHaveTextContent(/[\d.]+ KB \/ 29\.3 KB/)
    // The gauge reports the same delivered total as the inventory trigger,
    // not the smaller generated-only count (#63 review follow-up).
    expect(screen.getByLabelText(/The budget is a source-size proxy/i)).toHaveAccessibleName(
      /Show source [\d.]+ KB of the 29\.3 KB source budget/,
    )
    expect(screen.getByLabelText(/The budget is a source-size proxy/i)).toHaveAccessibleName(
      /not remaining Controller capacity/i,
    )
    // Pressure, gauge color, and label share the delivered numerator (#63):
    // a label past 100% of the budget always reads as blocked, never as an
    // under-budget green/amber bar. The compiler's generated-only ledger
    // backstop stays quiet here — generated source alone is under budget.
    expect(compileBar).toHaveTextContent(
      'Output blocked: Delivered UTF-8 source meets or exceeds the source-size proxy',
    )
    expect(compileBar).not.toHaveTextContent('Generated UTF-8 source alone')
    expect(screen.getByLabelText(/The budget is a source-size proxy/i).firstElementChild).toHaveClass('bg-red-500')

    const trigger = screen.getByRole('button', { name: /show source inventory/i })
    expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument()

    fireEvent.focus(trigger)
    const focusedInventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    fireEvent.keyDown(focusedInventory, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())

    fireEvent.pointerEnter(trigger)
    expect(screen.getByRole('dialog', { name: 'Show source inventory' })).toBeInTheDocument()
    fireEvent.pointerLeave(trigger)
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Show source inventory' })).not.toBeInTheDocument())

    await user.click(trigger)

    const inventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(inventory).toHaveTextContent('Delivered source')
    expect(inventory).toHaveTextContent('PXLBLZ Show infrastructure')
    expect(inventory).toHaveTextContent('Effects and Transitions')
    expect(inventory).toHaveTextContent('CompassRose')
    expect(inventory).toHaveTextContent('Ways to slim this Show')
    // Read-only chrome stays deleted: no subtitle, no machine summary, no
    // generated-program box, no trailing disclaimer (#63).
    expect(inventory).not.toHaveTextContent('Exact UTF-8 bytes')
    expect(inventory).not.toHaveTextContent('Pattern machines:')
    expect(inventory).not.toHaveTextContent('Generated program')
    expect(inventory).not.toHaveTextContent('Source percentages do not describe')

    // Budget-relative segment widths can sum past 100% for an over-budget
    // Show; fixed (non-shrinking) segments clip instead of silently
    // renormalizing back to delivered-total proportions (#63 review follow-up).
    const strip = inventory.querySelector('[aria-hidden].flex')
    expect(strip).not.toBeNull()
    expect(strip!.children.length).toBeGreaterThan(0)
    for (const segment of Array.from(strip!.children)) {
      expect(segment.className).toContain('shrink-0')
    }
  })

  it('keeps a pressure-blocked Show inspectable while export stays gated (#63 review follow-up)', async () => {
    const user = userEvent.setup()
    // Seed the over-budget fixture as a real store show so the editor and the
    // View code snapshot resolve the same blocked content.
    const blockedShow = { ...createPropertySlotQualificationShow(), id: 'show-over-budget' }
    useShowStore.setState({ shows: [blockedShow], activeShowId: blockedShow.id, showsLoaded: true })

    render(<ShowEditor showId={blockedShow.id} />)

    // Delivered source exceeds the budget, so output is blocked - but blocked
    // output must remain previewable and inspectable (View code).
    expect(screen.getByTestId('show-compile-bar')).toHaveTextContent(
      'Output blocked: Delivered UTF-8 source meets or exceeds the source-size proxy',
    )
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()
    const viewCode = screen.getByRole('button', { name: 'View code' })
    expect(viewCode).toBeEnabled()
    await user.click(viewCode)
    expect(screen.getByText(/Generated pattern -/)).toBeInTheDocument()
    // Inspectable, but not exportable: the generated-code view's export
    // button obeys the same delivered-pressure gate as the editor's.
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()
  })

  it('keeps table-driven score bytes as a single-line category row (#545, #63)', async () => {
    const user = userEvent.setup()
    const easing = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-easing')!

    render(<ShowEditor showId={easing.id} showOverride={easing.show} readOnly />)
    await user.click(screen.getByRole('button', { name: /show source inventory/i }))

    const inventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(inventory).toHaveTextContent('Show score data')
    // Compiler-structural detail stays internal; inventory rows remain one
    // line each (#63).
    expect(inventory).not.toHaveTextContent('interned stacks')
  })

  it('surfaces actionable renderer pressure without tinting the source gauge (#63, #492, #499)', () => {
    const [portable, installation] = buildShowCompositionFreezeCases()
    usePatternStore.setState({ userPatterns: portable.patterns })
    useShowStore.setState({ shows: [portable.show], activeShowId: portable.show.id, showsLoaded: true })

    const rendered = render(<ShowEditor showId={portable.show.id} />)

    expect(screen.queryByText(/Delivered UTF-8 source is 80% or more of the source-size proxy/)).not.toBeInTheDocument()

    rendered.unmount()
    useShowStore.setState({ shows: [installation.show], activeShowId: installation.show.id, showsLoaded: true })
    render(<ShowEditor showId={installation.show.id} />)

    expect(screen.getByText('Worst instant evaluates 4 simultaneous Pattern sources per pixel.')).toBeInTheDocument()
    expect(screen.queryByText(/worst instant:/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/steady state/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/The budget is a source-size proxy/i).firstElementChild).toHaveClass('bg-live')
  })

  it('discloses the output contract in Show properties without a Stage mutation control (#434)', async () => {
    const user = userEvent.setup()
    const contract = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })
    const show = { ...createDefaultShow('show-1', 'Portable field', 1000), stageMapId: 'plane', outputContract: contract }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Portable · Resolution-independent 2D')).toBeInTheDocument()
    expect(screen.getByText('1024 px reference')).toBeInTheDocument()
    expect(screen.getAllByText('Square')).not.toHaveLength(0)
    expect(screen.queryByLabelText('Stage map')).not.toBeInTheDocument()
  })

  it('edits only Portable reference output and position-based routing (#436)', async () => {
    const user = userEvent.setup()
    let show = createShowWithOutputContract(
      'show-portable',
      'Portable field',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
      1000,
    )
    show = addShowZone(show, { name: 'right' })
    show = addShowZone(show, { name: 'bottom-left' })
    show = addShowZone(show, { name: 'bottom-right' })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Compatible 2D mapped surfaces at variable resolution.')).toBeInTheDocument()
    expect(screen.queryByLabelText('Target controller')).not.toBeInTheDocument()
    expect(screen.queryByText(/pixel ranges/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText('Portable reference map')).toHaveValue('plane')
    expect(screen.getByLabelText('Portable reference pixels')).toHaveValue(1024)
    expect(screen.getByLabelText('Portable reference pixels')).toHaveAttribute('max', '2000')

    await user.selectOptions(screen.getByLabelText('Portable reference map'), 'wide')
    fireEvent.change(screen.getByLabelText('Portable reference pixels'), { target: { value: '1536' } })
    fireEvent.blur(screen.getByLabelText('Portable reference pixels'))
    await openZoneLayout(user, 'Default')
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'grid-2x2')

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.stageMapId).toBe('wide')
      expect(saved.outputContract).toMatchObject({
        kind: 'portable-2d',
        referenceMapId: 'wide',
        referencePixelCount: 1536,
      })
      expect(saved.routingLayouts[0].logical).toEqual({
        kind: 'grid',
        columns: 2,
        rows: 2,
        zoneIds: saved.zones.map((zone) => zone.id),
      })
    })
  })

  it('keeps invalid Installation ranges editable and unblocks artifacts after repair (#435)', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-installation',
      'Lobby wall',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1000,
    )
    show.routingLayouts[0].zones[0].ranges = [{ start: 0, end: 5 }]
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getAllByText(/assigns 6 of 8 pixels \(2 missing\)/i)).toHaveLength(2)
    expect(screen.getByRole('button', { name: 'View code' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()

    await openZoneLayout(user, 'Default')
    expect(screen.getByLabelText('Default main pixel ranges')).toHaveValue('0-5')
    const ranges = screen.getByLabelText('Default main pixel ranges')
    await user.clear(ranges)
    await user.type(ranges, '0-7')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View code' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    })
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText(/Default assigns 8 of 8 pixels exactly once/i)).toBeInTheDocument()
  })

  it('keeps an over-limit legacy Installation editable while blocking generated artifacts (#514)', () => {
    const show = createShowWithOutputContract(
      'show-installation-over-limit',
      'Legacy arena',
      { version: 1, kind: 'installation', outputMapId: 'plane', pixelCount: 2_001, resolution: 'fixed' },
      1000,
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'Show properties' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'View code' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()
    const compileBar = screen.getByTestId('show-compile-bar')
    expect(compileBar).toHaveTextContent(
      'Show output contract requests 2,001 pixels; compiled Shows support at most 2,000.',
    )
    expect(compileBar.textContent?.match(/Show output contract requests/g)).toHaveLength(1)
  })

  it('blocks Portable artifacts when the active Controller exceeds the supported output envelope (#514)', () => {
    const show = createShowWithOutputContract(
      'show-portable-over-limit-target',
      'Portable arena',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1_024 }),
      1000,
    )
    show.cells = show.cells.map((cell) => ({
      ...cell,
      pattern: { kind: 'stock', id: 'ShapeShifter' },
      patternName: 'ShapeShifter',
    }))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'profile-live',
        name: 'Bench PB',
        lastSeenIp: '10.0.0.5',
        lastKnownPixelCount: 2_001,
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [],
        updatedAt: 1,
      }],
    })
    useControllerStore.setState({
      controllers: {
        '10.0.0.5': {
          ip: '10.0.0.5', nickname: 'Bench PB', phase: 'live', mapDim: 2, firmwareVersion: '3.67',
        },
      },
      activeIp: '10.0.0.5',
    })
    setControllerProvider(new ConnectedControllerProvider())

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'View code' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()
    expect(screen.getByTestId('show-compile-bar')).toHaveTextContent(
      'Target Controller reports 2,001 pixels; compiled Shows support at most 2,000.',
    )
  })

})
