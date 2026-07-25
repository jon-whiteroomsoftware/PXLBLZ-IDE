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
  updateShowCellPattern,
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
import type { MapRecord, MixinRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from '@/engine/showOutputContract'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { buildShowCompositionFreezeCases } from '@/engine/showCompositionFreeze'
import * as showModel from '@/engine/showModel'
import { DEFAULT_SHOW_TRAILS_RETENTION } from '@/engine/showPreviousRgbFeedback'
import { projectShowLayoutIntervals } from '@/engine/showLayoutIntervals'
import * as previewThumbnailJpeg from '@/engine/previewThumbnailJpeg'

function changeCommittedNumber(label: string, value: string): void {
  const input = screen.getByLabelText(label)
  fireEvent.change(input, { target: { value } })
  fireEvent.blur(input)
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
    expect(within(authoring).getByRole('button', { name: 'Open Zones' }).querySelector('.timeline-command-label-tertiary')).toHaveTextContent('Zones')
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
    expect(within(timeline).queryByRole('button', { name: /Select zone/i })).not.toBeInTheDocument()
    expect(within(timeline).queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()

    await user.click(within(timeline).getByRole('button', { name: 'Open Zones' }))

    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })
    expect(timeline).not.toContainElement(zoneMap)
    expect(zoneMap).toHaveClass('fixed', 'z-[80]')
    expect(within(zoneMap).getByText('main')).toBeInTheDocument()
    expect(within(zoneMap).getByRole('button', { name: 'Add Zone' })).toBeInTheDocument()
    expect(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Select zone main' })).toBeInTheDocument()
    expect(within(zoneMap).queryByRole('button', { name: 'Collapse zone main' })).not.toBeInTheDocument()

    await user.selectOptions(within(zoneMap).getByRole('combobox', { name: 'Zone icon main' }), 'bolt')
    await waitFor(() => expect(useShowStore.getState().shows[0].zones[0].icon).toBe('bolt'))
    await user.click(within(zoneMap).getByRole('button', { name: 'Add Zone' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].zones).toHaveLength(2))
    expect(screen.getAllByRole('button', { name: /^Focus zone / })).toHaveLength(2)
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
    const zoneMap = screen.getByRole('dialog', { name: 'Zone Map' })
    await user.click(within(zoneMap).getByRole('button', { name: 'Collapse zone main' }))
    await user.click(within(zoneMap).getByRole('button', { name: 'Focus zone accent' }))

    expect(within(screen.getByTestId('show-timeline-grid')).getByRole('button', { name: 'Expand zone main' })).toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().collapsedZoneIdsByShowId[show.id]).toEqual(['zone-1'])
    expect(useShowEditorSessionStore.getState().focusedZoneIdByShowId[show.id]).toBe('zone-2')

    await user.click(within(timeline).getByRole('button', { name: 'Close Zones' }))
    expect(within(timeline).queryByRole('dialog', { name: 'Zone Map' })).not.toBeInTheDocument()
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

  it('inserts and appends sequential Zone Layout intervals from the unified toolbar (#582)', async () => {
    const user = userEvent.setup()
    const show = addShowRoutingLayout(createDefaultShow('show-layout-authoring', 'Layout authoring', 1000), 'Alternate')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useShowTransportStore.setState({ showId: show.id, positionMs: 10_000 })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    let dialog = screen.getByRole('dialog', { name: 'Layout interval actions' })
    expect(screen.getByTestId('show-timeline-toolbar')).not.toContainElement(dialog)
    expect(dialog).toHaveClass('fixed')
    await user.selectOptions(within(dialog).getByRole('combobox', { name: 'Layout definition' }), show.routingLayouts[1].id)
    const duration = within(dialog).getByRole('textbox', { name: 'Layout interval duration in seconds exact time' })
    await user.clear(duration)
    await user.type(duration, '3')
    await user.click(within(dialog).getByRole('button', { name: 'Insert here' }))

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(projectShowLayoutIntervals(saved).map((interval) => [interval.layoutId, interval.durationMs])).toEqual([
        ['layout-1', 10_000],
        [show.routingLayouts[1].id, 3_000],
        ['layout-1', 52_000],
      ])
    })

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    dialog = screen.getByRole('dialog', { name: 'Layout interval actions' })
    await user.click(within(dialog).getByRole('button', { name: 'Append' }))
    await waitFor(() => {
      const intervals = projectShowLayoutIntervals(useShowStore.getState().shows[0])
      expect(intervals[intervals.length - 1]).toMatchObject({ layoutId: show.routingLayouts[1].id, durationMs: 3_000 })
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
    let dialog = screen.getByRole('dialog', { name: 'Layout interval actions' })
    await user.click(within(dialog).getByRole('button', { name: 'Duplicate Layout' }))

    await waitFor(() => expect(projectShowLayoutIntervals(useShowStore.getState().shows[0])).toHaveLength(2))
    const savedScenes = useShowStore.getState().shows[0].composition?.scenes ?? []
    expect(savedScenes[savedScenes.length - 1]?.zones[0].main).toEqual([])

    const reusedIntervals = projectShowLayoutIntervals(useShowStore.getState().shows[0])
    act(() => useShowTransportStore.getState().setPosition(show.id, reusedIntervals[1].startMs + 1))

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    await user.click(screen.getByRole('menuitem', { name: 'Zone Layout' }))
    dialog = screen.getByRole('dialog', { name: 'Layout interval actions' })
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

    await user.click(within(addDialog).getByRole('button', { name: 'Add Clip' }))

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
    changeCommittedNumber('Duration seconds exact time', '1.5')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].composition?.groupDefinitions?.[0].placements[0].durationMs).toBe(1_500)
    })

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Group isolation: Pulse phrase' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Outside' })).toHaveAttribute('aria-disabled', 'true')

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('status', { name: 'Group isolation: Pulse phrase' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select Outside' })).not.toHaveAttribute('aria-disabled')

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
    expect(within(addDialog).getByRole('combobox', { name: 'Pattern for new Clip' })).toBeInTheDocument()
    await user.click(within(addDialog).getByRole('button', { name: 'Add Clip' }))

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
    fireEvent.pointerDown(screen.getByRole('region', { name: 'Show timeline' }))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('keeps Clip details open while dragging a portaled domain slider (#610)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-domain-slider-detail', 'Domain slider detail', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const grip = within(panel).getByRole('button', { name: 'Adjust Animation speed with slider' })
    Object.defineProperty(grip, 'setPointerCapture', { configurable: true, value: vi.fn() })
    Object.defineProperty(grip, 'releasePointerCapture', { configurable: true, value: vi.fn() })
    vi.spyOn(grip, 'getBoundingClientRect').mockReturnValue({
      x: 380, y: 100, left: 380, right: 398, top: 100, bottom: 124, width: 18, height: 24, toJSON: () => ({}),
    })

    fireEvent.pointerDown(grip, { pointerId: 7, clientX: 389, clientY: 112 })
    fireEvent.pointerUp(grip, { pointerId: 7, clientX: 389, clientY: 112 })
    const slider = screen.getByRole('slider', { name: 'Animation speed multiplier slider' })
    Object.defineProperty(slider, 'setPointerCapture', { configurable: true, value: vi.fn() })
    fireEvent.pointerDown(slider, { pointerId: 8, clientX: 420, clientY: 112 })

    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()
    expect(slider).toBeInTheDocument()
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
    await user.click(within(addDialog).getByRole('button', { name: 'Add Clip' }))

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
    expect(within(clip).getByText('0.5x')).toBeInTheDocument()
    expect(within(clip).getByText('75%')).toBeInTheDocument()
    expect(within(clip).getByText('0.1 turn')).toBeInTheDocument()
    expect(within(clip).getByText('animated')).toBeInTheDocument()

    await user.click(clip)

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const header = panel.querySelector<HTMLElement>('section[data-entity-family="clip"] > header')!
    expect(within(header).getByRole('heading', { name: 'Summary Rings' })).toBeInTheDocument()
    expect(header).not.toHaveTextContent('Main Layer')
    expect(header).not.toHaveTextContent('Pattern Clip')
    const summary = within(panel).getByRole('region', { name: 'Clip summary' })
    expect(summary).toHaveTextContent('Animation speed0.5x')
    expect(summary).toHaveTextContent('Brightness75%')
    expect(summary).toHaveTextContent('Hue0.1 turn')
    expect(summary).toHaveTextContent('Animation speedanimated')
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
    expect(screen.queryByRole('button', { name: 'Layout interval actions' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Add to Show' }))
    const menu = screen.getByRole('menu', { name: 'Add to Show' })
    expect(within(menu).getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'ClipNo empty Layer',
      'Layer',
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
    await user.click(screen.getByText('Advanced clip controls'))
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

  it('keeps legacy stock Clips on one absolute Layer and exposes their boundary Transition (#589)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-101-clips-crossfade')!

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

    const trigger = screen.getByRole('button', { name: 'Open 101 Clips and Crossfade guide' })
    expect(trigger).toHaveAttribute('data-size', 'icon-xs')
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

  it('turns a reference Show guide into a live Pattern comparison instrument (#506)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-wipe-mix-transitions')!

    render(<ShowEditor
      showId={stock.id}
      showOverride={stock.show}
      readOnly
      builtInContext={{
        track: stock.track,
        lesson: stock.lesson,
        description: stock.description,
        note: stock.note,
        reference: stock.reference,
      }}
    />)

    const guide = screen.getByRole('region', { name: 'Wipe and Mix Transitions guide' })
    expect(within(guide).getByText(stock.reference!.summary)).toBeInTheDocument()
    expect(within(guide).getByText('Reference frame')).toBeInTheDocument()
    expect(within(guide).getByRole('combobox', { name: 'Try with Pattern' })).toHaveValue('CompassRose')

    act(() => useShowTransportStore.getState().setPosition(stock.id, 3_050))
    expect(within(guide).getByText('Cut')).toBeInTheDocument()
    expect(within(guide).getByText('Reference -> Selected')).toBeInTheDocument()

    await user.click(within(guide).getByRole('combobox', { name: 'Try with Pattern' }))
    expect(screen.queryByRole('option', { name: 'TestPattern3D' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('option', { name: 'Caustics' }))
    expect(useShowEditorSessionStore.getState().referencePatternByShowId[stock.id]).toEqual({
      kind: 'stock', id: 'Caustics',
    })
    expect(within(guide).getByRole('button', { name: 'Reset Pattern' })).toBeInTheDocument()

    await user.click(within(guide).getByRole('button', { name: 'Reset Pattern' }))
    expect(useShowEditorSessionStore.getState().referencePatternByShowId[stock.id]).toBeUndefined()
  })

  it('projects one Scene-local keyframe animation into one main-timeline sparkline', () => {
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-202-layers-local-animation')!

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    const localAnimation = screen.getByRole('group', { name: 'SignalMandala opacity animation for Main' })
    expect(localAnimation.querySelector('polyline')).toBeInTheDocument()
    expect(localAnimation.querySelectorAll('[data-property-beat-dot]')).toHaveLength(4)
    expect(screen.getAllByRole('group', { name: /animation for Main$/ })).toHaveLength(1)
    expect(screen.queryByRole('group', { name: 'Animation speed lane for Main' })).not.toBeInTheDocument()
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
    await user.clear(screen.getByRole('combobox', { name: 'Source pattern' }))
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
    fireEvent.keyDown(document, { key: 'a', metaKey: true })
    expect(useShowTransportStore.getState().seekRequest).toBeNull()
    fireEvent.keyDown(document, { key: 'a' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    const goToStart = screen.getByRole('button', { name: 'Go to Show start' })
    expect(goToStart).toHaveAttribute('title', 'Go to Show start (A)')
    useShowTransportStore.getState().setPosition(show.id, 5_000)
    fireEvent.click(goToStart)
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('pans one visible timeline page with arrows while a Clip owns focus (#588)', () => {
    const show = createDefaultShow('show-keyboard-pan', 'Keyboard pan', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize visible range end' }), { key: 'ArrowLeft' })
    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    clip.focus()
    fireEvent.keyDown(clip, { key: 'ArrowRight' })

    expect(Number(navigator.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    expect(useShowTransportStore.getState().seekRequest).toBeNull()
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

  it('removes Show shortcuts when the Show editor closes (#439)', () => {
    const show = createDefaultShow('show-shortcut-scope', 'Shortcut scope', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const view = render(<ShowEditor showId={show.id} />)
    useShowTransportStore.getState().setPosition(show.id, 5_000)

    view.unmount()
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    fireEvent.keyDown(document, { code: 'Space' })

    expect(useShowTransportStore.getState()).toMatchObject({ positionMs: 5_000, seekRequest: null })
    expect(usePreviewStore.getState().isRunning).toBe(false)
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
      'Snap to scene, clip, transition, and time-grid boundaries. Hold Alt to temporarily reverse.',
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
    expect(refusal()).toHaveTextContent('Split only works inside a Scene')
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
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'split-x')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'split',
        zoneIds: ['zone-1', 'zone-2'],
        axis: 'x',
      })
    })
    expect(screen.getByText(/scene targets move the split continuously/i)).toBeInTheDocument()
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
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
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
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
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
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
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
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
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
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    await user.selectOptions(screen.getByLabelText('Default routing mode'), 'soft-split')

    expect(screen.getByLabelText('Soft Split axis')).toHaveValue('x')
    expect(screen.getByRole('textbox', { name: 'Soft Split feather exact percentage' })).toHaveValue('20')
    expect(screen.getByText(/inside the feather, both patterns render/i)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Split position lane' })).toBeInTheDocument()
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

  it('compiles a library-backed 2D Pattern for generated Show actions', () => {
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
    expect(compileBar).toHaveTextContent('arena 192')
    expect(compileBar).toHaveTextContent('render target: 3 planes · stage-rgb · RGB 0/1/2 · XY 0/1 · scalar 0 · previous RGB 0/1/2')
    expect(compileBar).toHaveTextContent('cache plan: 1 selected · 0 rejected · peak 3/3 planes')
    expect(compileBar).toHaveTextContent('stage-rgb planes 0/1/2 · transition · invalidates transition-exit/show-loop')
    expect(compileBar).toHaveTextContent('crossfade: snapshot outgoing · capture frame 2 render paths/px · then 1 live render path/px')
  })

  it('discloses exact routing and capture specialization for Redline (#512)', () => {
    const redline = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-redline-installation')!

    render(<ShowEditor showId={redline.id} showOverride={redline.show} readOnly />)

    const compileBar = screen.getByTestId('show-compile-bar')
    expect(compileBar).toHaveTextContent('routing specialization: complete disjoint short-circuit · max 10 -> 4 comparisons/px · 6 avoided')
    expect(compileBar).toHaveTextContent('capture specialization: 1 identity sample · 2 clear omitted · up to 7 ops/evaluation avoided')
    // #565 helper inlining exposes one more Redline frame-invariant
    // candidate (inline#0): 7 -> 8 hoisted, 18 -> 21 ops avoided.
    expect(compileBar).toHaveTextContent('frame invariants: 8 hoisted · 21 ops/evaluation avoided')
    expect(compileBar).toHaveTextContent('kernel specialization: measured-neutral on pb32 · 18 plans / 2 kernels · up to 16 branches/px candidate · source dispatch -2,461 B retained as baseline dispatch')
  })

  it('discloses shared Motion transition kernels and their resource tradeoff (#525)', () => {
    const motion = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-motion-transitions')!

    render(<ShowEditor showId={motion.id} showOverride={motion.show} readOnly />)

    expect(screen.getByTestId('show-compile-bar')).toHaveTextContent(
      'motion sharing: family kernels · 20 boundaries / 11 kernels · 2 stack plans · 80,812 emitted B avoided · 7 scalars · +0 branches/px',
    )
  })

  it('discloses the selected table-driven Show score and measured exchange (#542)', () => {
    const easing = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-easing')!

    render(<ShowEditor showId={easing.id} showOverride={easing.show} readOnly />)

    expect(screen.getByTestId('show-compile-bar')).toHaveTextContent(
      'show score: table driven · 20 boundaries / 2 stacks / 1 kernel · 104 words · init 100 assignments + 0 ops · 146,105 emitted B avoided · regular cadence · pb32 bytecode -66.6% to -78.9% · runtime neutral',
    )
  })

  it('discloses selected Restart Pattern machine reuse and its steady-state cost (#546)', () => {
    const property = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!

    render(<ShowEditor showId={property.id} showOverride={property.show} readOnly />)

    expect(screen.getByTestId('show-compile-bar')).toHaveTextContent(
      'pattern machines: 17 logical -> 8 physical · 9 reclaimed · 0 steady-state render ops added',
    )
  })

  it('opens an exact proportional Show source inventory from keyboard-equivalent focus (#545)', async () => {
    const user = userEvent.setup()
    const property = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-property-animation')!

    render(<ShowEditor showId={property.id} showOverride={property.show} readOnly />)

    const compileBar = screen.getByTestId('show-compile-bar')
    expect(compileBar).toHaveTextContent('generated UTF-8 source')
    expect(compileBar).toHaveTextContent('observed compiled-bytecode activation ceiling 68,384 B')
    expect(screen.getByLabelText(/source-size proxy derived from the observed 68,384-byte compiled-bytecode activation ceiling/i)).toHaveAccessibleName(
      /not remaining Controller capacity/i,
    )

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
    expect(inventory).toHaveTextContent('Generated program')
    expect(inventory).toHaveTextContent('PXLBLZ Show infrastructure')
    expect(inventory).toHaveTextContent('Effects and Transitions')
    expect(inventory).toHaveTextContent('CompassRose')
    expect(inventory).toHaveTextContent('Pattern machines: 17 logical · 8 physical')
    expect(inventory).toHaveTextContent('Ways to slim this Show')
    expect(inventory).toHaveTextContent('Source percentages do not describe Controller bytecode or runtime cost.')
  })

  it('connects table-driven score bytes to their reused stacks and kernels (#545)', async () => {
    const user = userEvent.setup()
    const easing = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-reference-easing')!

    render(<ShowEditor showId={easing.id} showOverride={easing.show} readOnly />)
    await user.click(screen.getByRole('button', { name: /show source inventory/i }))

    const inventory = screen.getByRole('dialog', { name: 'Show source inventory' })
    expect(inventory).toHaveTextContent('Show score data')
    expect(inventory).toHaveTextContent('20 boundaries · 2 interned stacks · 1 kernel')
  })

  it('identifies an exact-pause clock ramp without changing renderer policy', async () => {
    const base = createDefaultShow('show-1', 'Opening wash', 1000)
    const repeated = updateShowCellPattern(base, base.cells[1].id, {
      pattern: base.cells[0].pattern,
      patternName: base.cells[0].patternName,
    })
    const paused = updateShowCellAdaptations(repeated, repeated.cells[1].id, { timeScale: 0 })
    useShowStore.setState({ shows: [paused], activeShowId: paused.id, showsLoaded: true })

    render(<ShowEditor showId={paused.id} />)

    expect(screen.getByText('clock: exact pause ramp')).toBeInTheDocument()
    expect(screen.getByText(/steady state/i)).toHaveTextContent('1 renderer/px')
  })

  it('reflects compact artifact pressure and discloses dense renderer pressure (#492, #499)', () => {
    const [portable, installation] = buildShowCompositionFreezeCases()
    usePatternStore.setState({ userPatterns: portable.patterns })
    useShowStore.setState({ shows: [portable.show], activeShowId: portable.show.id, showsLoaded: true })

    const rendered = render(<ShowEditor showId={portable.show.id} />)

    expect(screen.queryByText(/Generated UTF-8 source is 80% or more of the source-size proxy/)).not.toBeInTheDocument()

    rendered.unmount()
    useShowStore.setState({ shows: [installation.show], activeShowId: installation.show.id, showsLoaded: true })
    render(<ShowEditor showId={installation.show.id} />)

    expect(screen.getByText('Worst instant evaluates 4 simultaneous Pattern sources per pixel.')).toBeInTheDocument()
    expect(screen.getByText(/worst instant:/i)).toHaveTextContent('4 renderers/px')
    expect(screen.getByText(/steady state/i)).toHaveTextContent('2 renderers/px')
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
    expect(screen.getByLabelText('Default main pixel ranges')).toHaveValue('0-5')
    expect(screen.getByRole('button', { name: 'View code' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeDisabled()

    const ranges = screen.getByLabelText('Default main pixel ranges')
    await user.clear(ranges)
    await user.type(ranges, '0-7')
    await user.tab()

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'View code' })).toBeEnabled()
      expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    })
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
