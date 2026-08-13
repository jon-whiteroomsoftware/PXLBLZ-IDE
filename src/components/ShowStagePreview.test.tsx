import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { resolveShowStagePreviewInput, ShowStagePreview } from './ShowStagePreview'
import { createDefaultShow, createShowWithOutputContract } from '@/engine/showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from '@/engine/showOutputContract'
import { resetPersonalContentProvider, setPersonalContentProvider, type PersonalContentProvider } from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, MixinRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { stockShowById } from '@/pixelblaze/stock/shows'
import * as fastReplay from '@/engine/fastReplay'
import * as fastReplayCheckpoints from '@/engine/fastReplayCheckpoints'

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

const importedMap: MapRecord = {
  id: 'map-1',
  name: 'North Arch map',
  dim: 2,
  generator: 'custom',
  params: {},
  points: [[0, 0], [1, 0], [0, 1], [1, 1]],
  updatedAt: 1,
}

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  usePatternStore.setState(patternInitialState)
  useMapStore.setState(mapInitialState)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
})

describe('ShowStagePreview (#339)', () => {
  it('does not defer a same-Show Pattern-source change behind an older snapshot (#710)', () => {
    const deferred = createDefaultShow('show-pattern-source-change', 'Deferred Show', 1000)
    const nonPatternEdit = { ...deferred, name: 'Resolved Show' }
    const resolved = structuredClone(deferred)
    resolved.cells[0] = {
      ...resolved.cells[0],
      pattern: { kind: 'stock', id: 'ZippyZaps' },
      patternName: 'ZippyZaps',
    }

    expect(resolveShowStagePreviewInput(deferred.id, resolved, deferred)).toBe(resolved)
    expect(resolveShowStagePreviewInput(deferred.id, nonPatternEdit, deferred)).toBe(deferred)
  })

  it('detects an immediate Pattern-source change in a composition instance (#710)', () => {
    const deferred = structuredClone(stockShowById('stock-show-302-installation-composition')!.show)
    const resolved = structuredClone(deferred)
    const instance = resolved.composition!.patternInstances[0]
    resolved.composition!.patternInstances[0] = {
      ...instance,
      pattern: { kind: 'stock', id: 'ZippyZaps' },
      patternName: 'ZippyZaps',
    }

    expect(resolveShowStagePreviewInput(deferred.id, resolved, deferred)).toBe(resolved)
  })

  it('repaints once after a paused Stage resize settles without rebuilding or advancing runtime state (#508, #837)', () => {
    vi.useFakeTimers()
    let resize: ResizeObserverCallback | null = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')
    try {
      const show = createDefaultShow('show-incremental-resize', 'Incremental resize', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

      render(<ShowStagePreview showId={show.id} />)
      expect(createRuntime).toHaveBeenCalledTimes(1)
      const runtime = createRuntime.mock.results[0]!.value
      const initialElapsedMs = runtime.getElapsedMs()
      const advanceTo = vi.spyOn(runtime, 'advanceTo')

      act(() => resize?.([{ contentRect: { width: 700 } } as ResizeObserverEntry], {} as ResizeObserver))
      act(() => vi.advanceTimersByTime(50))
      act(() => resize?.([{ contentRect: { width: 800 } } as ResizeObserverEntry], {} as ResizeObserver))
      act(() => vi.advanceTimersByTime(99))

      expect(advanceTo).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(1))

      expect(advanceTo).toHaveBeenCalledOnce()
      expect(advanceTo).toHaveBeenCalledWith(initialElapsedMs, { stepMs: 1000 / 60 })
      expect(runtime.getElapsedMs()).toBe(initialElapsedMs)
      expect(createRuntime).toHaveBeenCalledTimes(1)
    } finally {
      createRuntime.mockRestore()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('omits the redundant Zone solo inventory for a healthy single-zone Show', () => {
    const show = createDefaultShow('show-single-zone', 'Single zone', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.getByLabelText('Show stage')).toHaveTextContent('60 px')
    expect(screen.queryByRole('region', { name: 'Zones' })).not.toBeInTheDocument()
  })

  it('does not own workspace playback when the Stage mounts or changes Show identity', () => {
    const first = createDefaultShow('show-first', 'First Show', 1000)
    const second = createDefaultShow('show-second', 'Second Show', 1000)
    useShowStore.setState({ shows: [first, second], activeShowId: first.id, showsLoaded: true })
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })

    const { rerender } = render(<ShowStagePreview showId={first.id} />)

    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause Show preview' })).toBeInTheDocument()

    rerender(<ShowStagePreview showId={second.id} />)

    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('rebuilds a running same-Show preview immediately when its Pattern changes (#710)', () => {
    const show = createDefaultShow('show-live-pattern-switch', 'Live Pattern switch', 1000)
    const switched = structuredClone(show)
    switched.cells[0] = {
      ...switched.cells[0],
      pattern: { kind: 'stock', id: 'ZippyZaps' },
      patternName: 'ZippyZaps',
    }
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })
    const transport = useShowTransportStore.getState()
    transport.openShow(show.id, 62_000)
    transport.setPosition(show.id, 3_000)
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      const { rerender } = render(<ShowStagePreview showId={show.id} showOverride={show} />)
      expect(createRuntime).toHaveBeenCalledTimes(1)
      const initialCode = createRuntime.mock.calls[0]![0].code

      rerender(<ShowStagePreview showId={show.id} showOverride={switched} />)

      expect(createRuntime).toHaveBeenCalledTimes(2)
      expect(createRuntime.mock.calls[1]![0].code).not.toBe(initialCode)
      expect(usePreviewStore.getState().isRunning).toBe(true)
      expect(useShowTransportStore.getState().positionMs).toBe(3_000)
    } finally {
      createRuntime.mockRestore()
    }
  })

  it('puts the primary playback control at the right edge of the preview status row', () => {
    const show = createDefaultShow('show-preview-transport', 'Preview transport', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    const statusRow = screen.getByText(/show paused · Fast/i).parentElement!
    const playback = within(statusRow).getByRole('button', { name: 'Play Show preview' })
    expect(statusRow.lastElementChild).toBe(playback)
    expect(playback.querySelector('.lucide-play')).toBeInTheDocument()

    fireEvent.click(playback)
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(
      within(statusRow)
        .getByRole('button', { name: 'Pause Show preview' })
        .querySelector('.lucide-pause'),
    ).toBeInTheDocument()
  })

  it('keeps Zone isolation independent from playback and reserves a stable reset control', () => {
    const show = createDefaultShow('show-zone-isolation', 'Zone isolation', 1000)
    show.zones.push({ ...show.zones[0], id: 'accent', name: 'accent', color: '#f97316' })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })

    render(<ShowStagePreview showId={show.id} />)
    act(() => usePreviewStore.setState({ isRunning: true }))

    const showAll = screen.getByRole('button', { name: 'Show all zones' })
    expect(showAll).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Solo zone main' }))
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(showAll).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Unsolo zone main' }))
      .toHaveClass('bg-live/10', 'text-live', 'ring-live/50')
    fireEvent.click(showAll)
    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(showAll).toBeDisabled()
  })

  it('shows an icon-only seek badge only when rebuilding lasts beyond the short delay', () => {
    vi.useFakeTimers()
    try {
      const show = createDefaultShow('show-seek-badge', 'Seek badge', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

      render(<ShowStagePreview showId={show.id} />)
      act(() => {
        useShowTransportStore.setState({
          seekStatus: 'rebuilding',
          seekRequest: { id: 1, targetMs: 50_000 },
        })
      })

      expect(screen.queryByRole('status', { name: 'Rebuilding Show preview' })).not.toBeInTheDocument()
      act(() => vi.advanceTimersByTime(149))
      expect(screen.queryByRole('status', { name: 'Rebuilding Show preview' })).not.toBeInTheDocument()

      act(() => vi.advanceTimersByTime(1))
      expect(screen.getByRole('status', { name: 'Rebuilding Show preview' })).toBeInTheDocument()
    } finally {
      vi.useRealTimers()
    }
  })

  it('rebuilds an accurate Fast frame for the current seek request (#414)', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    act(() => {
      const transport = useShowTransportStore.getState()
      transport.openShow(show.id, 62_000)
      transport.requestSeek(show.id, 0)
    })

    await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
    expect(screen.getByText(/show paused · Fast/i)).toBeInTheDocument()
  })

  it('restores a crossed seek region into the existing runtime without recompiling (#842)', async () => {
    const show = createDefaultShow('show-checkpoint-seek', 'Checkpoint seek', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview showId={show.id} />)
      expect(createRuntime).toHaveBeenCalledTimes(1)

      act(() => useShowTransportStore.getState().requestSeek(show.id, 4_500))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
      expect(createRuntime).toHaveBeenCalledTimes(2)

      act(() => useShowTransportStore.getState().requestSeek(show.id, 3_500))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
      expect(createRuntime).toHaveBeenCalledTimes(2)
      expect(useShowTransportStore.getState().positionMs).toBe(3_500)
    } finally {
      createRuntime.mockRestore()
    }
  })

  it('starts checkpoint pre-warm only after the paused preview settles and cancels it on close', async () => {
    vi.useFakeTimers()
    const prewarm = vi.spyOn(fastReplayCheckpoints, 'prewarmFastReplayCheckpoints')
      .mockResolvedValue({ status: 'populated', resumedFromMs: null })
    try {
      const show = createDefaultShow('show-prewarm-idle', 'Pre-warm idle', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

      const view = render(<ShowStagePreview showId={show.id} />)
      expect(prewarm).not.toHaveBeenCalled()

      act(() => vi.advanceTimersByTime(399))
      expect(prewarm).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(1))
      expect(prewarm).not.toHaveBeenCalled()
      act(() => vi.advanceTimersByTime(15))
      expect(prewarm).not.toHaveBeenCalled()
      await act(async () => {
        vi.advanceTimersByTime(1)
        await Promise.resolve()
      })
      expect(prewarm).toHaveBeenCalledTimes(1)
      const isCurrent = prewarm.mock.calls[0]![0].isCurrent
      expect(isCurrent()).toBe(true)

      view.unmount()
      expect(isCurrent()).toBe(false)
    } finally {
      prewarm.mockRestore()
      vi.useRealTimers()
    }
  })

  it('cancels an active pre-warm on edit and restarts after the new artifact settles', async () => {
    vi.useFakeTimers()
    const prewarm = vi.spyOn(fastReplayCheckpoints, 'prewarmFastReplayCheckpoints')
      .mockResolvedValue({ status: 'populated', resumedFromMs: null })
    try {
      const show = createDefaultShow('show-prewarm-edit', 'Pre-warm edit', 1000)
      const edited = structuredClone(show)
      edited.cells[0] = {
        ...edited.cells[0],
        pattern: { kind: 'stock', id: 'ZippyZaps' },
        patternName: 'ZippyZaps',
      }

      const view = render(<ShowStagePreview showId={show.id} showOverride={show} />)
      await act(async () => {
        vi.advanceTimersByTime(416)
        await Promise.resolve()
      })
      expect(prewarm).toHaveBeenCalledTimes(1)
      const first = prewarm.mock.calls[0]![0]
      expect(first.isCurrent()).toBe(true)

      view.rerender(<ShowStagePreview showId={show.id} showOverride={edited} />)
      expect(first.isCurrent()).toBe(false)
      expect(prewarm).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(399))
      expect(prewarm).toHaveBeenCalledTimes(1)
      act(() => vi.advanceTimersByTime(1))
      expect(prewarm).toHaveBeenCalledTimes(1)
      await act(async () => {
        vi.advanceTimersByTime(16)
        await Promise.resolve()
      })
      expect(prewarm).toHaveBeenCalledTimes(2)
      expect(prewarm.mock.calls[1]![0].key).not.toBe(first.key)
    } finally {
      prewarm.mockRestore()
      vi.useRealTimers()
    }
  })

  it('does not pre-warm checkpoints while Show playback is running', async () => {
    vi.useFakeTimers()
    const prewarm = vi.spyOn(fastReplayCheckpoints, 'prewarmFastReplayCheckpoints')
      .mockResolvedValue({ status: 'populated', resumedFromMs: null })
    try {
      const show = createDefaultShow('show-prewarm-playback', 'Pre-warm playback', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
      usePreviewStore.setState({ ...previewInitialState, isRunning: true })

      render(<ShowStagePreview showId={show.id} />)
      act(() => vi.advanceTimersByTime(2_000))
      expect(prewarm).not.toHaveBeenCalled()

      act(() => usePreviewStore.getState().setRunning(false))
      await act(async () => {
        vi.advanceTimersByTime(416)
        await Promise.resolve()
      })
      expect(prewarm).toHaveBeenCalledTimes(1)
    } finally {
      prewarm.mockRestore()
      vi.useRealTimers()
    }
  })

  it('detaches the runtime while a warm seek reconstructs it (#842 P2)', async () => {
    const show = createDefaultShow('show-detached-seek', 'Detached seek', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const strayTicks: unknown[][] = []
    const original = fastReplay.createFastReplayRuntime
    const spy = vi.spyOn(fastReplay, 'createFastReplayRuntime').mockImplementation((prepared, options) => {
      const runtime = original(prepared, options)
      const realAdvanceTo = runtime.advanceTo.bind(runtime)
      runtime.advanceTo = (targetMs, advance) => {
        if (useShowTransportStore.getState().seekStatus === 'rebuilding' && !advance.temporalFeedbackSeek) {
          strayTicks.push([targetMs, advance])
        }
        return realAdvanceTo(targetMs, advance)
      }
      return runtime
    })

    try {
      render(<ShowStagePreview showId={show.id} />)
      act(() => useShowTransportStore.getState().requestSeek(show.id, 4_500))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))

      act(() => useShowTransportStore.getState().requestSeek(show.id, 30_000))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('rebuilding'))
      act(() => usePreviewStore.getState().setBrightness(0.5))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'), { timeout: 20_000 })

      expect(strayTicks).toEqual([])
      expect(useShowTransportStore.getState().positionMs).toBe(30_000)
    } finally {
      spy.mockRestore()
    }
  }, 30_000)

  it('shows the saved Stage as read-only output context (#434)', () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    show.stageMapId = 'map-1'
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.getByLabelText('Show stage')).toHaveTextContent('North Arch map')
    expect(screen.queryByRole('combobox', { name: 'Show stage' })).not.toBeInTheDocument()
  })

  it.each([
    ['2D', importedMap, 2],
    ['3D', {
      ...importedMap,
      id: 'map-3d',
      name: 'Depth map',
      dim: 3,
      points: [[0, 0, 0], [1, 1, 1]],
    } satisfies MapRecord, 3],
  ] as const)('dispatches promoted Show renderers by the selected %s Stage map', (
    _label,
    stageMap,
    expectedDimension,
  ) => {
    const show = createDefaultShow(`show-${expectedDimension}d`, 'Stage renderer dimension', 1000)
    show.stageMapId = stageMap.id
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'depth-aware' },
      patternName: 'Depth aware',
    }
    const pattern: PatternRecord = {
      id: 'depth-aware',
      name: 'Depth aware',
      src: `
rotateY(PI / 2)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
      controls: {},
      updatedAt: 1,
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    useMapStore.setState({ userMaps: [stageMap], mapsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview showId={show.id} />)

      expect(createRuntime).toHaveBeenCalled()
      expect(createRuntime.mock.calls[0]?.[0]).toMatchObject({
        dimension: expectedDimension,
        metadata: {
          renderFns: {
            hasRender2D: true,
            hasRender3D: true,
          },
        },
      })
      if (expectedDimension === 3) {
        expect(screen.getByRole('slider', { name: '3D view zoom' })).toHaveValue('1')
        expect(screen.queryByRole('slider', { name: 'Pole wrap density' })).not.toBeInTheDocument()
      } else {
        expect(screen.queryByRole('slider', { name: '3D view zoom' })).not.toBeInTheDocument()
      }
    } finally {
      createRuntime.mockRestore()
    }
  })

  it('preserves native 1D Pattern semantics for generic strip previews', () => {
    const show = createDefaultShow('show-generic-1d', 'Generic 1D renderer', 1000)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'native-1d' },
      patternName: 'Native 1D',
    }
    const pattern: PatternRecord = {
      id: 'native-1d',
      name: 'Native 1D',
      src: 'export function render(index) { rgb(has2DMap(), pixelMapDimensions(), 0) }',
      controls: {},
      updatedAt: 1,
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview showId={show.id} />)

      expect(screen.getByLabelText('Show stage')).toHaveTextContent('Zone strips - generic')
      expect(createRuntime).toHaveBeenCalled()
      expect(createRuntime.mock.calls[0]?.[0]).toMatchObject({
        dimension: 1,
        metadata: {
          renderFns: {
            hasRender: true,
            hasRender2D: false,
            hasRender3D: false,
          },
        },
      })
    } finally {
      createRuntime.mockRestore()
    }
  })

  it('preserves 2D Show semantics for generic strips with a synthetic render3D adapter', () => {
    const show = createDefaultShow('show-generic-promoted-2d', 'Generic promoted 2D renderer', 1000)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'user', id: 'promoted-2d' },
      patternName: 'Promoted 2D',
    }
    const pattern: PatternRecord = {
      id: 'promoted-2d',
      name: 'Promoted 2D',
      src: `
rotateY(PI / 2)
export function render2D(index, x, y) { rgb(x, y, 0) }
`,
      controls: {},
      updatedAt: 1,
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview showId={show.id} />)

      expect(screen.getByLabelText('Show stage')).toHaveTextContent('Zone strips - generic')
      expect(createRuntime).toHaveBeenCalled()
      expect(createRuntime.mock.calls[0]?.[0]).toMatchObject({
        dimension: 2,
        metadata: {
          renderFns: {
            hasRender: false,
            hasRender2D: true,
            hasRender3D: true,
          },
        },
      })
    } finally {
      createRuntime.mockRestore()
    }
  })

  it('draws session-only Zone and selected-clip diagnostics above the Stage without changing playback (#491)', () => {
    const show = createDefaultShow('show-diagnostics', 'Diagnostics', 1000)
    show.stageMapId = 'map-1'
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })
    useShowEditorSessionStore.setState({
      diagnosticFocus: { showId: show.id, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'placement-1' },
    })

    render(<ShowStagePreview showId={show.id} />)

    fireEvent.click(screen.getByRole('button', { name: 'Show Zone outlines' }))
    fireEvent.click(screen.getByRole('button', { name: 'Show Clip outline' }))
    expect(screen.getByTestId('show-stage-zone-outlines')).toBeInTheDocument()
    expect(screen.getByTestId('show-stage-clip-outline')).toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().diagnostics).toMatchObject({ zoneOutlines: true, clipOutlines: true })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('draws and removes the selected transformed Clip content bounds (#791)', () => {
    const show = createDefaultShow('show-transformed-clip-outline', 'Transformed outline', 1000)
    show.stageMapId = 'map-1'
    show.cells[0] = {
      ...show.cells[0],
      transform: { positionX: 0.1, positionY: -0.15, rotation: 0.125, scaleX: 0.5, scaleY: 0.25 },
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })
    useShowEditorSessionStore.setState({
      diagnosticFocus: { showId: show.id, sceneId: 'scene-1', zoneId: 'zone-1', placementId: 'cell-1' },
    })

    render(<ShowStagePreview showId={show.id} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show Clip outline' }))

    const outline = screen.getByTestId('show-stage-clip-outline')
    const polygon = outline.querySelector('polygon')
    expect(polygon).toBeInTheDocument()
    expect(polygon).toHaveAttribute('points', '0.5116,0.0848 0.8652,0.4384 0.6884,0.6152 0.3348,0.2616')

    fireEvent.click(screen.getByRole('button', { name: 'Hide Clip outline' }))
    expect(screen.queryByTestId('show-stage-clip-outline')).not.toBeInTheDocument()
  })

  it('names an Installation output map once without presenting a faux input (#484)', () => {
    const show = createShowWithOutputContract(
      'show-stage-identity',
      'Measured installation',
      createInstallationShowOutputContract({ outputMapId: 'map-1', pixelCount: 4 }),
      1000,
    )
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    const stage = screen.getByLabelText('Show stage')
    expect(stage).toHaveTextContent(/Output map.*North Arch map.*4 px/)
    expect(screen.getAllByText(/North Arch map/)).toHaveLength(1)
  })

  it('shares Light size and Diffusion controls with the preview comfort baseline (#484)', async () => {
    const show = createDefaultShow('show-stage-comfort', 'Stage comfort', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({
      ...previewInitialState,
      isRunning: false,
      lightSize: 0.3,
      diffusion: 0.4,
      lightSizeSticky: 0.7,
      diffusionSticky: 0.2,
    })

    render(<ShowStagePreview showId={show.id} />)

    const lightSize = screen.getByRole('slider', { name: 'Light size' })
    const diffusion = screen.getByRole('slider', { name: 'Diffusion' })
    await waitFor(() => expect(lightSize).toHaveValue('0.7'))
    expect(diffusion).toHaveValue('0.2')

    fireEvent.change(lightSize, { target: { value: '0.8' } })
    fireEvent.change(diffusion, { target: { value: '0.6' } })

    expect(usePreviewStore.getState()).toMatchObject({
      lightSize: 0.8,
      lightSizeSticky: 0.8,
      diffusion: 0.6,
      diffusionSticky: 0.6,
    })
  })

  it('switches the actual Show renderer without exposing Pattern-only controls (#484)', async () => {
    const show = createDefaultShow('show-stage-renderer', 'Stage renderer', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.queryByRole('button', { name: 'Speed' })).not.toBeInTheDocument()
    expect(screen.queryByText('elapsed')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Renderer' }))
    fireEvent.click(screen.getByRole('option', { name: 'Precise' }))

    expect(usePreviewStore.getState().fidelity).toBe('fidelity')
    await waitFor(() => expect(screen.getByText(/show paused · Precise/i)).toBeInTheDocument())
  })

  it('reports the Show Stage frame rate without duplicating elapsed time (#484)', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id) })
    try {
      const show = createDefaultShow('show-stage-fps', 'Stage FPS', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
      usePreviewStore.setState({ ...previewInitialState, isRunning: true })

      render(<ShowStagePreview showId={show.id} />)
      act(() => usePreviewStore.getState().setRunning(true))
      await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))

      const runFrame = (timestamp: number) => {
        const entries = [...callbacks.entries()]
        const entry = entries[entries.length - 1]
        expect(entry).toBeDefined()
        callbacks.delete(entry![0])
        act(() => entry![1](timestamp))
      }
      runFrame(0)
      runFrame(250)
      runFrame(500)

      expect(usePreviewStore.getState().fps).toBeCloseTo(4)
      expect(screen.getByText('4.0')).toBeInTheDocument()
      expect(screen.queryByText('elapsed')).not.toBeInTheDocument()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('pauses and rewinds when Scene-local playback reaches its end', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id) })
    try {
      const show = createDefaultShow('show-scene-playback', 'Scene playback', 1000)
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
      const transport = useShowTransportStore.getState()
      transport.openShow(show.id, 62_000)
      transport.setPosition(show.id, 90)
      transport.setPlaybackWindow(show.id, { startMs: 0, endMs: 100 })

      render(<ShowStagePreview showId={show.id} />)
      act(() => usePreviewStore.getState().setRunning(true))
      await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))

      const runFrame = (timestamp: number) => {
        const entries = [...callbacks.entries()]
        const entry = entries[entries.length - 1]
        expect(entry).toBeDefined()
        callbacks.delete(entry![0])
        act(() => entry![1](timestamp))
      }
      runFrame(0)
      runFrame(20)

      expect(usePreviewStore.getState().isRunning).toBe(false)
      expect(useShowTransportStore.getState().positionMs).toBe(0)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('loops a global Show by rebuilding its runtime at zero without pausing', async () => {
    const callbacks = new Map<number, FrameRequestCallback>()
    let nextFrameId = 1
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      const id = nextFrameId++
      callbacks.set(id, callback)
      return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { callbacks.delete(id) })
    try {
      const show = createDefaultShow('show-global-loop', 'Global loop', 1000)
      show.scenes = show.scenes.map((scene) => ({ ...scene, durationMs: 50 }))
      show.transitions = []
      useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
      const transport = useShowTransportStore.getState()
      transport.openShow(show.id, 100)
      transport.setPosition(show.id, 90)

      render(<ShowStagePreview showId={show.id} />)
      act(() => usePreviewStore.getState().setRunning(true))
      await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))

      const runFrame = (timestamp: number) => {
        const entries = [...callbacks.entries()]
        const entry = entries[entries.length - 1]
        expect(entry).toBeDefined()
        callbacks.delete(entry![0])
        act(() => entry![1](timestamp))
      }
      runFrame(0)
      runFrame(20)

      expect(usePreviewStore.getState().isRunning).toBe(true)
      expect(useShowTransportStore.getState().nextSeekId).toBe(2)
      await waitFor(() => expect(useShowTransportStore.getState()).toMatchObject({
        positionMs: 0,
        seekStatus: 'idle',
        seekRequest: null,
      }))
      await waitFor(() => expect(callbacks.size).toBeGreaterThan(0))
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('uses and reports the Installation master count and physical coverage (#435)', () => {
    const show = createShowWithOutputContract(
      'show-installation',
      'Installation',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 8 }),
      1000,
    )
    show.routingLayouts[0].zones[0].ranges = [{ start: 0, end: 5 }]
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'controller-1',
        name: 'Different controller',
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [],
        lastKnownPixelCount: 99,
        updatedAt: 1,
      }],
    })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.getByText('8 px')).toBeInTheDocument()
    const zones = screen.getByRole('region', { name: 'Zones' })
    expect(within(zones).getByRole('status', { name: 'Zone coverage' })).toHaveTextContent(
      '6/8 assigned · 2 missing · 0 overlap · 0 out of range',
    )
    expect(within(zones).getByRole('status', { name: 'Zone coverage' })).toHaveClass('h-6', 'whitespace-nowrap')
  })

  it('uses the Portable reference count without borrowing Controller physical setup (#436)', () => {
    const show = createShowWithOutputContract(
      'show-portable',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'wide', referencePixelCount: 1536 }),
      1000,
    )
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'controller-1',
        name: 'Physical controller',
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        zones: [{ id: 'physical', name: 'main', ranges: [{ start: 0, end: 98 }] }],
        lastKnownPixelCount: 99,
        updatedAt: 1,
      }],
    })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.getAllByText('1536 px')).toHaveLength(1)
    expect(screen.getByLabelText('Show stage')).toHaveTextContent('Wide 2:1')
    expect(screen.queryByText('99 px')).not.toBeInTheDocument()
  })

  it('falls back to strips when the saved stage map is missing', () => {
    const show = { ...createDefaultShow('show-1', 'Opening wash', 1000), stageMapId: 'missing-map' }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowStagePreview showId={show.id} />)

    expect(screen.getByText(/saved stage map is gone/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Show stage')).toHaveTextContent('Zone strips - generic')
  })
})
