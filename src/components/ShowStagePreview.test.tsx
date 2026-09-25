import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { ShowStagePreview } from './ShowStagePreview'
import { addShowZone, createDefaultShow, createShowWithOutputContract } from '@/engine/showModel'
import { createInstallationShowOutputContract, createPortableShowOutputContract } from '@/engine/showOutputContract'
import { resetPersonalContentProvider } from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, PatternRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { projectShowEditorStagePresentationV2, type ShowEditorStagePresentationV2 } from '@/engine/showEditorStagePresentation'
import { captureShowStageEditV2, type ShowPreparedStageDependenciesV2 } from '@/engine/showPreparedStageV2'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import { mapInitialState, useMapStore } from '@/store/mapStore'
import { patternInitialState, usePatternStore } from '@/store/patternStore'
import { libraryInitialState, useLibraryStore } from '@/store/libraryStore'
import { previewInitialState, usePreviewStore } from '@/store/previewStore'
import { showInitialState, useShowStore } from '@/store/showStore'
import { showPreviewOverrideInitialState, useShowPreviewOverrideStore } from '@/store/showPreviewOverrideStore'
import { controllerProfileInitialState, useControllerProfileStore } from '@/store/controllerProfileStore'
import { showTransportInitialState, useShowTransportStore } from '@/store/showTransportStore'
import { showEditorSessionInitialState, useShowEditorSessionStore } from '@/store/showEditorSessionStore'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { usePanelPreferencesStore } from '@/store/panelPreferencesStore'
import { convertForTest } from '@/test/showEditorV2Harness'
import * as fastReplay from '@/engine/fastReplay'
import * as rendererModule from '@/engine/renderer'
import * as fastReplayCheckpoints from '@/engine/fastReplayCheckpoints'

const importedMap: MapRecord = {
  id: 'map-1',
  name: 'North Arch map',
  dim: 2,
  generator: 'custom',
  params: {},
  points: [[0, 0], [1, 0], [0, 1], [1, 1]],
  updatedAt: 1,
}

/**
 * The app's Stage projection for one open v2 Show (`src/App.tsx:910-927`).
 * Dependencies default to the Pattern, Library, map and Controller-profile
 * stores the test seeded; a dependency change re-projects, as the app does.
 */
function editorStage(
  record: ShowRecordV2,
  deps: Partial<Omit<ShowPreparedStageDependenciesV2, 'stageMap'>> = {},
): ShowEditorStagePresentationV2 {
  const patterns = deps.patterns ?? usePatternStore.getState().userPatterns
  const libraries = deps.libraries ?? useLibraryStore.getState().userLibraries
  const maps = deps.maps ?? useMapStore.getState().userMaps
  const profiles = deps.profiles ?? useControllerProfileStore.getState().profiles
  return projectShowEditorStagePresentationV2(captureShowStageEditV2(record, {
    patterns,
    libraries,
    maps,
    profiles,
    stageMap: resolveShowV2StageMap(record.stageMapId, maps),
  }))
}

beforeEach(() => {
  usePanelPreferencesStore.setState({ expanded: {} })
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  useShowPreviewOverrideStore.setState(showPreviewOverrideInitialState)
  usePatternStore.setState(patternInitialState)
  useLibraryStore.setState(libraryInitialState)
  useMapStore.setState(mapInitialState)
  usePreviewStore.setState({ ...previewInitialState, isRunning: false })
  useControllerProfileStore.setState(controllerProfileInitialState)
  useShowTransportStore.setState(showTransportInitialState)
  useShowEditorSessionStore.setState(showEditorSessionInitialState)
})

describe('ShowStagePreview (#339)', () => {
  /*
   * Moved to the editor-v2 Stage for #1042 Phase 2 (coverage map
   * `test-results-keep/1042-p2-coverage.md`).
   * COVERED, deleted here:
   * - "draws session-only Zone and selected-clip diagnostics above the Stage
   *   without changing playback (#491)": `e2e/shows.auth.spec.ts:3898` "Stage
   *   outlines follow selection and Zone Layout navigation (#983)".
   * - "draws and removes the selected transformed Clip content bounds (#791)":
   *   `e2e/shows.auth.spec.ts:3898` "Stage outlines follow selection and Zone
   *   Layout navigation (#983)".
   * REPRESENTATION, deleted here: "does not defer a same-Show Pattern-source
   * change behind an older snapshot (#710)" and "detects an immediate
   * Pattern-source change in a composition instance (#710)" asserted only
   * the legacy input's deferral, since deleted with the legacy kind (#1042).
   * The editor-v2 Stage takes one projected presentation; the rebuild itself
   * stays covered by
   * "rebuilds a running same-Show preview immediately when its Pattern changes".
   */
  it('lays out the desktop Stage as an aspect-true strip with folded Zone coverage and icon toggles (#967)', async () => {
    const onPreviewAspectChange = vi.fn()
    let show = createDefaultShow('show-stage-strip', 'Stage strip', 1000)
    show = addShowZone(show, { name: 'Wings', nominalPixelCount: 4 })
    show.stageMapId = importedMap.id
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })

    render(
      <ShowStagePreview
        kind="editor-v2"
        stage={editorStage(convertForTest(show))}
        presentation="strip"
        onPreviewAspectChange={onPreviewAspectChange}
      />,
    )

    await waitFor(() => expect(onPreviewAspectChange).toHaveBeenCalledWith(1))
    expect(screen.getByTestId('show-stage-preview')).toHaveAttribute('data-presentation', 'strip')
    expect(screen.getByTestId('show-stage-controls')).toHaveClass('show-strip-controls')
    expect(screen.getByRole('button', { name: 'Zones' })).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByRole('status', { name: 'Zone coverage' })).toHaveTextContent(/assigned/i)
    expect(screen.queryByRole('button', { name: 'Show all zones' })).not.toBeInTheDocument()

    const zoneToggle = screen.getByRole('button', { name: 'Show Zone outlines' })
    const clipToggle = screen.getByRole('button', { name: 'Show Selected Clip outline' })
    expect(zoneToggle).toHaveClass('size-6', 'border')
    expect(clipToggle).toHaveClass('size-6', 'border')
    const canvas = document.querySelector('canvas')
    expect(screen.getByRole('button', { name: 'Preview' })).toHaveAttribute('aria-expanded', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Preview' }))
    fireEvent.click(screen.getByRole('button', { name: 'Stage' }))
    expect(document.querySelector('canvas')).toBe(canvas)
    expect(usePanelPreferencesStore.getState().expanded['show-strip:preview']).toBe(false)
    expect(usePanelPreferencesStore.getState().expanded['show-strip:stage']).toBe(true)
    fireEvent.click(zoneToggle)
    expect(zoneToggle).toHaveAttribute('aria-pressed', 'true')
    expect(zoneToggle).toHaveClass('text-amber-200')
  })

  it.each([
    ['plane', 'pane'], ['plane', 'strip'], ['cube', 'pane'], ['cube', 'strip'],
  ] as const)('repaints every paused %s %s resize immediately without changing simulation state (#63)', (stageMapId, presentation) => {
    vi.useFakeTimers()
    let resize: ResizeObserverCallback | null = null
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: ResizeObserverCallback) { resize = callback }
      observe() {}
      unobserve() {}
      disconnect() {}
    })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')
    const createRenderer = vi.spyOn(rendererModule, 'createRenderer')
    try {
      const show = createDefaultShow('show-incremental-resize', 'Incremental resize', 1000)
      show.stageMapId = stageMapId

      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} presentation={presentation} />)
      expect(createRuntime).toHaveBeenCalledTimes(1)
      const runtime = createRuntime.mock.results[0]!.value
      const renderer = createRenderer.mock.results[0]!.value
      const paint = vi.spyOn(renderer, 'paint')
      const initialState = runtime.snapshot()
      const initialPosition = useShowTransportStore.getState().positionMs

      // A burst has no settled interval. Every applied resize must repaint
      // synchronously, before a browser can present the cleared drawing buffer.
      for (const [width, height] of [[700, 300], [800, 300], [800, 400], [700, 300]]) {
        paint.mockClear()
        act(() => resize?.([{ contentRect: { width, height } } as ResizeObserverEntry], {} as ResizeObserver))
        expect(paint).toHaveBeenCalledOnce()
        expect(paint.mock.calls[0]![0]).toEqual(initialState.frame)
        expect(runtime.snapshot()).toEqual(initialState)
        expect(useShowTransportStore.getState().positionMs).toBe(initialPosition)
      }
      expect(createRuntime).toHaveBeenCalledTimes(1)
      expect(createRenderer).toHaveBeenCalledTimes(1)
    } finally {
      vi.restoreAllMocks()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })

  it('omits the redundant Zone solo inventory for a healthy single-zone Show', () => {
    const show = createDefaultShow('show-single-zone', 'Single zone', 1000)

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

    expect(screen.getByLabelText('Show stage')).toHaveTextContent('60 px')
    expect(screen.queryByRole('region', { name: 'Zones' })).not.toBeInTheDocument()
  })

  it('does not own workspace playback when the Stage mounts or changes Show identity', () => {
    const first = createDefaultShow('show-first', 'First Show', 1000)
    const second = createDefaultShow('show-second', 'Second Show', 1000)
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })

    const { rerender } = render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(first))} />)

    expect(usePreviewStore.getState().isRunning).toBe(true)
    expect(screen.getByRole('button', { name: 'Pause Show preview' })).toBeInTheDocument()

    rerender(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(second))} />)

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
    const record = convertForTest(show)
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })
    const transport = useShowTransportStore.getState()
    transport.openShow(record.id, 62_000)
    transport.setPosition(record.id, 3_000)
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      const { rerender } = render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
      expect(createRuntime).toHaveBeenCalledTimes(1)
      const initialCode = createRuntime.mock.calls[0]![0].code

      rerender(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(switched))} />)

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

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

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
    usePreviewStore.setState({ ...previewInitialState, isRunning: true })

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)
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

      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)
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
    const record = convertForTest(createDefaultShow('show-1', 'Opening wash', 1000))

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)

    act(() => {
      const transport = useShowTransportStore.getState()
      transport.openShow(record.id, 62_000)
      transport.requestSeek(record.id, 0)
    })

    await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
    expect(screen.getByText(/show paused · Fast/i)).toBeInTheDocument()
  })

  it('restores a crossed seek region into the existing runtime without recompiling (#842)', async () => {
    const record = convertForTest(createDefaultShow('show-checkpoint-seek', 'Checkpoint seek', 1000))
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
      expect(createRuntime).toHaveBeenCalledTimes(1)

      act(() => useShowTransportStore.getState().requestSeek(record.id, 4_500))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
      expect(createRuntime).toHaveBeenCalledTimes(2)

      act(() => useShowTransportStore.getState().requestSeek(record.id, 3_500))
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

      const view = render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)
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

      const view = render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)
      await act(async () => {
        vi.advanceTimersByTime(416)
        await Promise.resolve()
      })
      expect(prewarm).toHaveBeenCalledTimes(1)
      const first = prewarm.mock.calls[0]![0]
      expect(first.isCurrent()).toBe(true)

      view.rerender(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(edited))} />)
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
      usePreviewStore.setState({ ...previewInitialState, isRunning: true })

      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)
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
    const record = convertForTest(createDefaultShow('show-detached-seek', 'Detached seek', 1000))
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
      render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
      act(() => useShowTransportStore.getState().requestSeek(record.id, 4_500))
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))

      act(() => useShowTransportStore.getState().requestSeek(record.id, 30_000))
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
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

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
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    useMapStore.setState({ userMaps: [stageMap], mapsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show, { [pattern.id]: pattern.src }))} />)

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
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show, { [pattern.id]: pattern.src }))} />)

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
    usePatternStore.setState({ userPatterns: [pattern], patternsLoaded: true })
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')

    try {
      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show, { [pattern.id]: pattern.src }))} />)

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

  it('follows full surface, stripes, Grid and back without rebuilding the runtime (#983)', () => {
    // The native v2 stock record (`src/pixelblaze/stock/showsV2.ts:65`): Ember
    // is `zone-2`, and its Grid Clip is `clip-grid-ember`. The v2 focus names
    // an authored Clip rather than a Scene placement.
    const show = structuredClone(stockShowV2ById('stock-show-showcase-zone-layouts-stripes-grid')!)
    const authoredBefore = structuredClone(show)
    useShowEditorSessionStore.setState({
      diagnostics: { ...showEditorSessionInitialState.diagnostics, zoneOutlines: true, clipOutlines: true },
      diagnosticFocus: { recordVersion: 2, showId: show.id, zoneId: 'zone-2', clipId: 'clip-grid-ember', occurrenceId: null },
    })
    const runtime = vi.spyOn(fastReplay, 'createFastReplayRuntime')
    render(<ShowStagePreview kind="editor-v2" stage={editorStage(show)} />)
    const initializations = runtime.mock.calls.length
    const rects = () => Array.from(screen.getByTestId('show-stage-zone-outlines').querySelectorAll('rect'))
    expect(rects()).toHaveLength(1)
    expect(screen.queryByTestId('show-stage-clip-outline')).not.toBeInTheDocument()
    act(() => useShowTransportStore.getState().setPosition(show.id, 5_000))
    expect(rects()).toHaveLength(4)
    expect(Number(rects()[0].getAttribute('width'))).toBeLessThan(0.3)
    act(() => useShowTransportStore.getState().setPosition(show.id, 14_000))
    expect(rects()).toHaveLength(4)
    expect(Number(rects()[0].getAttribute('width'))).toBeGreaterThan(0.4)
    expect(Number(rects()[0].getAttribute('height'))).toBeLessThan(0.5)
    expect(screen.getByTestId('show-stage-clip-outline')).toBeInTheDocument()
    const focus = useShowEditorSessionStore.getState().diagnosticFocus
    act(() => useShowEditorSessionStore.getState().setDiagnosticFocus(null))
    expect(screen.queryByTestId('show-stage-clip-outline')).not.toBeInTheDocument()
    act(() => useShowEditorSessionStore.getState().setDiagnosticFocus({ ...focus!, showId: 'another-show' }))
    expect(screen.queryByTestId('show-stage-clip-outline')).not.toBeInTheDocument()
    act(() => useShowEditorSessionStore.getState().setDiagnosticFocus(focus))
    expect(screen.getByTestId('show-stage-clip-outline')).toBeInTheDocument()
    expect(useShowTransportStore.getState().positionMs).toBe(14_000)
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(show).toEqual(authoredBefore)
    act(() => useShowTransportStore.getState().setPosition(show.id, 0))
    expect(rects()).toHaveLength(1)
    expect(screen.queryByTestId('show-stage-clip-outline')).not.toBeInTheDocument()
    expect(runtime.mock.calls).toHaveLength(initializations)
    runtime.mockRestore()
  })

  it('names an Installation output map once without presenting a faux input (#484)', () => {
    const show = createShowWithOutputContract(
      'show-stage-identity',
      'Measured installation',
      createInstallationShowOutputContract({ outputMapId: 'map-1', pixelCount: 4 }),
      1000,
    )
    useMapStore.setState({ userMaps: [importedMap], mapsLoaded: true })

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

    const stage = screen.getByLabelText('Show stage')
    expect(stage).toHaveTextContent(/Output map.*North Arch map.*4 px/)
    expect(screen.getAllByText(/North Arch map/)).toHaveLength(1)
  })

  it('shares Light size and Diffusion controls with the preview comfort baseline (#484)', async () => {
    const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')
    const createRenderer = vi.spyOn(rendererModule, 'createRenderer')
    const show = createDefaultShow('show-stage-comfort', 'Stage comfort', 1000)
    usePreviewStore.setState({
      ...previewInitialState,
      isRunning: false,
      lightSize: 0.3,
      diffusion: 0.4,
      lightSizeSticky: 0.7,
      diffusionSticky: 0.2,
    })

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

    const lightSize = screen.getByRole('slider', { name: 'Light size' })
    const diffusion = screen.getByRole('slider', { name: 'Diffusion' })
    await waitFor(() => expect(lightSize).toHaveValue('0.7'))
    expect(diffusion).toHaveValue('0.2')

    const runtime = createRuntime.mock.results[0]!.value
    const initialState = runtime.snapshot()
    const paint = vi.spyOn(createRenderer.mock.results[0]!.value, 'paint')
    try {
      for (const [slider, value] of [[lightSize, '0.8'], [diffusion, '0.6']] as const) {
        paint.mockClear()
        fireEvent.change(slider, { target: { value } })
        expect(paint).toHaveBeenCalledOnce()
        expect(paint.mock.calls[0]![0]).toEqual(initialState.frame)
        expect(runtime.snapshot()).toEqual(initialState)
      }
      expect(usePreviewStore.getState()).toMatchObject({
        lightSize: 0.8,
        lightSizeSticky: 0.8,
        diffusion: 0.6,
        diffusionSticky: 0.6,
      })
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('switches the actual Show renderer without exposing Pattern-only controls (#484)', async () => {
    const show = createDefaultShow('show-stage-renderer', 'Stage renderer', 1000)

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

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
      usePreviewStore.setState({ ...previewInitialState, isRunning: true })

      render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)
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
      const record = convertForTest(createDefaultShow('show-scene-playback', 'Scene playback', 1000))
      const transport = useShowTransportStore.getState()
      transport.openShow(record.id, 62_000)
      transport.setPosition(record.id, 90)
      transport.setPlaybackWindow(record.id, { startMs: 0, endMs: 100 })

      render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
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
      // The rewind requests an async seek; wait for it to finish so its
      // completion does not land outside act after the test body (#917).
      await waitFor(() => expect(useShowTransportStore.getState().seekStatus).toBe('idle'))
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
      const record = convertForTest(show)
      const transport = useShowTransportStore.getState()
      transport.openShow(record.id, 100)
      transport.setPosition(record.id, 90)

      render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
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
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'controller-1',
        name: 'Different controller',
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        lastKnownPixelCount: 99,
        updatedAt: 1,
      }],
    })

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

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
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [{
        id: 'controller-1',
        name: 'Physical controller',
        board: { kind: 'pixelblaze-v3-standard' },
        inputs: [],
        globalTransforms: [],
        patternBindings: [],
        lastKnownPixelCount: 99,
        updatedAt: 1,
      }],
    })

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

    expect(screen.getAllByText('1536 px')).toHaveLength(1)
    expect(screen.getByLabelText('Show stage')).toHaveTextContent('Wide 2:1')
    expect(screen.queryByText('99 px')).not.toBeInTheDocument()
  })

  it('falls back to strips when the saved stage map is missing', () => {
    const show = { ...createDefaultShow('show-1', 'Opening wash', 1000), stageMapId: 'missing-map' }

    render(<ShowStagePreview kind="editor-v2" stage={editorStage(convertForTest(show))} />)

    expect(screen.getByText(/saved stage map is gone/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Show stage')).toHaveTextContent('Zone strips - generic')
  })
})


it('renders current personal Library source and rebuilds after its saved edit (#955)', () => {
  const show = createDefaultShow('library-preview-955', 'Library preview', 1)
  show.cells[0].pattern = { kind: 'user', id: 'library-pattern-955' }
  show.cells[0].patternName = 'Library Pattern'
  const pattern = { id: 'library-pattern-955', name: 'Library Pattern', src: 'export function render(index) { Personal.paint(index) }', controls: {}, updatedAt: 1 }
  usePatternStore.setState({ userPatterns: [pattern] })
  const library = { id: 'library-955', name: 'Personal', src: 'function paint(index) { rgb(0.25,0,0) }', updatedAt: 1 }
  useLibraryStore.setState({ userLibraries: [library] })
  const record = convertForTest(show, { [pattern.id]: pattern.src })
  const recordBefore = structuredClone(record)
  const createRuntime = vi.spyOn(fastReplay, 'createFastReplayRuntime')
  try {
    const view = render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
    expect(createRuntime).toHaveBeenCalledTimes(1)
    expect(Array.from(createRuntime.mock.results[0].value.renderCurrentFrame().frame.slice(0, 3))).toEqual([0.25, 0, 0])
    act(() => useLibraryStore.setState({ userLibraries: [{ ...library, src: 'function paint(index) { rgb(0,0.75,0) }', updatedAt: 2 }] }))
    view.rerender(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
    expect(createRuntime).toHaveBeenCalledTimes(2)
    expect(Array.from(createRuntime.mock.results[1].value.renderCurrentFrame().frame.slice(0, 3))).toEqual([0, 0.75, 0])
    expect(record).toEqual(recordBefore)
  } finally { createRuntime.mockRestore() }
})


it.each(['Show', 'Pattern', 'Library', 'map', 'profile', 'output', 'preview override', 'navigation', 'unmount'] as const)(
  'does not publish delayed reconstruction after %s changes (#955)', async (dependency) => {
    const show = createDefaultShow('delayed-stage-955', 'Delayed Stage', 1)
    show.cells[0].pattern = { kind: 'user', id: 'delayed-pattern' }
    show.stageMapId = importedMap.id
    useMapStore.setState({ userMaps: [importedMap] })
    const pattern = { id: 'delayed-pattern', name: 'Personal Pattern', src: 'export function render(index) { Personal.paint(index) }', controls: {}, updatedAt: 1 }
    const library = { id: 'delayed-library', name: 'Personal', src: 'function paint(index) { rgb(0.25,0,0) }', updatedAt: 1 }
    usePatternStore.setState({ userPatterns: [pattern] })
    useLibraryStore.setState({ userLibraries: [library] })
    const profile: ControllerProfile = { id: 'stage-profile', name: 'Stage profile', board: { kind: 'pixelblaze-v3-standard' }, inputs: [], globalTransforms: [], patternBindings: [], lastKnownPixelCount: 60, updatedAt: 1 }
    useControllerProfileStore.setState({ profiles: [profile] })
    const sources = { [pattern.id]: pattern.src }
    const record = convertForTest(show, sources)
    const transport = useShowTransportStore.getState()
    transport.openShow(record.id, 62000)
    transport.setPosition(record.id, 1000)
    const original = fastReplayCheckpoints.reconstructFastReplayWithCheckpoints
    const completions: Array<() => Promise<void>> = []
    const reconstruction = vi.spyOn(fastReplayCheckpoints, 'reconstructFastReplayWithCheckpoints').mockImplementation((options) => new Promise((resolve, reject) => {
      // A late worker completion may arrive even after cancellation. Produce
      // real replay frames, but let the test choose the publication order.
      completions.push(async () => {
        try { resolve(await original({ ...options, isCurrent: () => true })) }
        catch (error) { reject(error) }
      })
    }))
    const realRenderer = rendererModule.createRenderer
    const paint = vi.fn()
    const renderer = vi.spyOn(rendererModule, 'createRenderer').mockImplementation((...args) => ({ ...realRenderer(...args), paint }))
    try {
      const view = render(<ShowStagePreview kind="editor-v2" stage={editorStage(record)} />)
      expect(completions).toHaveLength(1)
      const changed = structuredClone(show)
      changed.cells[0].adaptations.brightness = 0.5
      // In v2 the app re-projects the Stage on every dependency change and
      // passes a new `stage` (`src/App.tsx:908-944`); a preview override is a
      // changed candidate record, and navigation is a record with another id.
      const reproject = (next: ShowRecordV2) => view.rerender(<ShowStagePreview kind="editor-v2" stage={editorStage(next)} />)
      act(() => {
        switch (dependency) {
          case 'Show': reproject(convertForTest(changed, sources)); break
          case 'Pattern':
            usePatternStore.setState({ userPatterns: [{ ...pattern, src: 'export function render(index) { rgb(0,0.75,0) }', updatedAt: 2 }] })
            reproject(record)
            break
          case 'Library':
            useLibraryStore.setState({ userLibraries: [{ ...library, src: 'function paint(index) { rgb(0,0.75,0) }', updatedAt: 2 }] })
            reproject(record)
            break
          case 'map':
            useMapStore.setState({ userMaps: [{ ...importedMap, points: [[0, 0], [0.5, 0.5], [1, 1]], updatedAt: 2 }] })
            reproject(record)
            break
          case 'profile':
            useControllerProfileStore.setState({ profiles: [{ ...profile, lastKnownPixelCount: 120, updatedAt: 2 }] })
            reproject(record)
            break
          case 'output': reproject(convertForTest({ ...show, outputContract: createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 8 }) }, sources)); break
          case 'preview override': reproject(convertForTest(changed, sources)); break
          case 'navigation': {
            changed.id = 'next-stage-955'
            reproject(convertForTest(changed, sources))
            break
          }
          case 'unmount': view.unmount(); break
        }
      })
      if (dependency !== 'unmount' && dependency !== 'navigation') {
        expect(completions.length).toBeGreaterThanOrEqual(2)
        await act(async () => { await completions[completions.length - 1]() })
      }
      const currentPaints = paint.mock.calls.length
      if (dependency === 'unmount') expect(currentPaints).toBe(0)
      else {
        expect(currentPaints).toBeGreaterThan(0)
        const frame = paint.mock.lastCall![0] as Float64Array
        expect(Array.from(frame.slice(0, 3))).toEqual(
          dependency === 'Pattern' || dependency === 'Library' ? [0, 0.75, 0]
            : dependency === 'Show' || dependency === 'preview override' || dependency === 'navigation' ? [0.125, 0, 0] : [0.25, 0, 0],
        )
        if (dependency === 'output') expect(frame).toHaveLength(8 * 3)
      }
      await act(async () => { for (const finish of completions.slice(0, dependency === 'unmount' || dependency === 'navigation' ? undefined : -1)) await finish() })
      expect(paint).toHaveBeenCalledTimes(currentPaints)
      expect(screen.queryByText('Show preview failed')).not.toBeInTheDocument()
    } finally { reconstruction.mockRestore(); renderer.mockRestore() }
  },
)
