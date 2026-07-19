import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShowEditor } from './ShowEditor'
import { showInitialState, useShowStore } from '@/store/showStore'
import {
  addShowScene,
  addShowRoutingLayout,
  addShowZone,
  createDefaultShow,
  createShowWithOutputContract,
  removeShowScene,
  spanShowCellZones,
  updateShowCellAdaptations,
  updateShowCellPattern,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowScene,
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
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { buildShowCompositionFreezeCases } from '@/engine/showCompositionFreeze'
import { projectFlatShowToCompositionV1 } from '@/engine/showCompositionModel'
import * as showModel from '@/engine/showModel'
import { DEFAULT_SHOW_TRAILS_RETENTION } from '@/engine/showPreviousRgbFeedback'

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
    expect(within(guide).getByText(builtInContext.note.purpose)).toBeInTheDocument()
    expect(within(guide).getByText(builtInContext.note.notice)).toBeInTheDocument()
    expect(within(guide).getByRole('link', { name: builtInContext.note.guide.label })).toHaveAttribute(
      'href',
      expect.stringContaining('/docs/show-visual-toolkit#clips-scenes-and-boundaries'),
    )

    await user.click(within(guide).getByRole('button', { name: 'Collapse 101 guide' }))
    expect(screen.queryByRole('region', { name: '101 Clips and Crossfade guide' })).not.toBeInTheDocument()
    expect(useShowEditorSessionStore.getState().showNoteOpenById[stock.id]).toBe(false)

    const trigger = screen.getByRole('button', { name: 'Open 101 Clips and Crossfade guide' })
    expect(trigger).toHaveAttribute('data-size', 'icon-xs')
    expect(within(trigger).queryByText('101 Guide')).not.toBeInTheDocument()
    await user.click(trigger)
    expect(screen.getByRole('region', { name: '101 Clips and Crossfade guide' })).toBeInTheDocument()
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

  it('labels same-Pattern Effect ramps as tweens rather than Crossfades (#506)', () => {
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-showcase-transform-effects')!

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

    expect(screen.getByRole('button', { name: 'Select Reference to Translate Effect tween' })).toHaveTextContent('fx')
    expect(screen.queryByRole('button', { name: /Reference to Translate transition \(crossfade\)/i })).not.toBeInTheDocument()
  })

  it('keeps every Clip fact inline and repeats a categorized summary inside Entity Detail', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-constant-overrides', 'Constant overrides', 1000)
    show = updateShowCellPattern(show, show.cells[0].id, {
      pattern: { kind: 'stock', id: 'RibbonLoom' },
      patternName: 'Ribbon Loom',
    })
    show = updateShowCellAdaptations(show, show.cells[0].id, { timeScale: 0.35 })
    show.cells[0] = {
      ...show.cells[0],
      controlTargets: { sliderSpeed: 0.28 },
      effects: [{ id: 'clip-hue', kind: 'hue', turns: 0.1 }],
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('group', { name: 'Animation speed lane for main' })).not.toBeInTheDocument()
    expect(screen.queryByRole('group', { name: 'Speed control lane for main' })).not.toBeInTheDocument()

    const clip = screen.getByRole('button', { name: 'Select Ribbon Loom' })
    expect(within(clip).getByTitle('Animation speed 0.35× · Speed 0.28 · Hue 0.1 turn')).toBeInTheDocument()
    expect(within(clip).getByText('0.35×')).toBeInTheDocument()
    expect(within(clip).getByText('0.28')).toBeInTheDocument()
    expect(within(clip).getByText('0.1 turn')).toBeInTheDocument()
    expect(within(clip).queryByText('Animation speed')).not.toBeInTheDocument()
    await user.hover(clip)
    expect(screen.queryByRole('tooltip', { name: 'Ribbon Loom Clip overrides' })).not.toBeInTheDocument()
    await user.click(clip)

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    const summary = within(panel).getByRole('region', { name: 'Clip summary' })
    expect(within(summary).getByRole('group', { name: 'Playback summary' })).toBeInTheDocument()
    expect(within(summary).getByRole('group', { name: 'Pattern controls summary' })).toBeInTheDocument()
    expect(within(summary).getByRole('group', { name: 'Effects summary' })).toBeInTheDocument()
    expect(within(summary).getByText('Animation speed')).toBeInTheDocument()
    expect(within(summary).getByText('0.35×')).toBeInTheDocument()
    expect(within(summary).getByText('Speed')).toBeInTheDocument()
    expect(within(summary).getByText('0.28')).toBeInTheDocument()
    expect(within(summary).getByText('Hue')).toBeInTheDocument()
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

  it('signals nontrivial Scene-local composition on the global Clip and exposes every layer in Super Detail', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS.find((candidate) => candidate.id === 'stock-show-202-layers-local-animation')!

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)

    const clip = screen.getByRole('button', { name: 'Select Caustics' })
    expect(within(clip).getByTitle('Scene composition: 2 clips · 2 layers · 2 effects · 1 animation')).toBeInTheDocument()

    expect(screen.getByTitle('Caustics · 0s–16s')).toBeInTheDocument()
    expect(screen.getByTitle('SignalMandala · 3s–13s')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Signal over water Super Detail' }))
    const detail = screen.getByRole('dialog', { name: 'Signal over water Super Detail' })
    expect(within(detail).getByRole('group', { name: 'Main layer for Main' })).toHaveTextContent('Caustics')
    expect(within(detail).getByRole('group', { name: 'Signal overlay layer for Main' })).toHaveTextContent('SignalMandala')
    expect(within(detail).getByRole('group', { name: 'SignalMandala opacity local animation' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Signal over water Super Detail' }))
    expect(screen.queryByRole('dialog', { name: 'Signal over water Super Detail' })).not.toBeInTheDocument()
  })

  it('presents built-in Clip values as legible read-only inspection instead of failed editing (#482)', async () => {
    const user = userEvent.setup()
    const stock = STOCK_SHOWS[0]
    const clip = stock.show.cells[0]

    render(<ShowEditor showId={stock.id} showOverride={stock.show} readOnly />)
    await user.click(screen.getAllByRole('button', { name: `Select ${clip.patternName}` })[0])

    const panel = screen.getByRole('dialog', { name: 'Entity Detail Panel' })
    expect(within(panel).getByText('Built-in values')).toBeInTheDocument()
    expect(within(panel).getByText('Inspect here; create your own Show to edit.')).toBeInTheDocument()
    expect(panel.querySelector('fieldset')).toHaveAttribute('data-read-only', 'true')
    expect(within(panel).getByRole('combobox', { name: 'Source pattern' })).toBeDisabled()
    expect(within(panel).getByRole('spinbutton', { name: 'Animation speed' })).toBeDisabled()
    expect(within(panel).getByRole('button', { name: `Delete clip ${clip.patternName}` })).toBeDisabled()

    await user.click(within(panel).getByText('Advanced clip controls'))
    expect(within(panel).getByRole('combobox', { name: 'Hold scenes' })).toBeDisabled()
    expect(within(panel).getByRole('table', { name: 'Advanced clip controls' })).toHaveClass('text-[10px]')
  })

  it('keeps every Scene X-ray visible and toggles Super Detail only from its button (#548)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-scene-xray', 'Scene X-ray', 1000)
    show.transitions![0].propertyTransitions = {
      brightness: { fromByCellId: { 'cell-2': 0.25 }, durationMs: 2000, easing: 'linear' },
    }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const firstXray = screen.getByRole('group', { name: 'Scene 1 Scene X-ray, read only' })
    const secondXray = screen.getByRole('group', { name: 'Scene 2 Scene X-ray, read only' })
    expect(firstXray).toHaveClass('h-[36px]')
    expect(secondXray).toHaveClass('h-[36px]')
    expect(screen.getByText('clips')).toBeInTheDocument()
    const transitionXray = screen.getByRole('group', { name: 'Scene 1 to Scene 2 transition X-ray' })
    expect(transitionXray).toHaveAttribute('data-transition-kind', 'crossfade')
    expect(transitionXray).toHaveAttribute('data-property-transition', 'true')
    expect(transitionXray).toHaveAttribute('title', 'crossfade · 2s · property transition')
    expect(transitionXray.querySelector('[data-xray-transition-icon="crossfade"]')).toBeInTheDocument()
    expect(transitionXray).not.toHaveTextContent('xf')

    fireEvent.mouseEnter(firstXray)
    expect(screen.queryByRole('dialog', { name: 'Scene 1 Super Detail' })).not.toBeInTheDocument()
    fireEvent.focus(firstXray)
    expect(screen.queryByRole('dialog', { name: 'Scene 1 Super Detail' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Open Scene 1 Super Detail' }))
    expect(screen.getByRole('dialog', { name: 'Scene 1 Super Detail' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Open Scene 1 editor' })).toBeInTheDocument()
    fireEvent.mouseLeave(firstXray)
    expect(screen.getByRole('dialog', { name: 'Scene 1 Super Detail' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Close Scene 1 Super Detail' }))
    expect(screen.queryByRole('dialog', { name: 'Scene 1 Super Detail' })).not.toBeInTheDocument()

    fireEvent.mouseEnter(secondXray)
    expect(screen.queryByRole('dialog', { name: 'Scene 2 Super Detail' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Open Scene 2 Super Detail' }))
    expect(screen.getByRole('dialog', { name: 'Scene 2 Super Detail' })).toBeInTheDocument()

    fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), { target: { value: '5.1' } })
    expect(screen.getByRole('group', { name: 'Scene 1 Scene X-ray, read only' })).toHaveClass('h-[36px]')
    expect(screen.getByRole('group', { name: 'Scene 2 Scene X-ray, read only' })).toHaveClass('h-[36px]')
    expect(screen.queryByRole('dialog', { name: 'Scene 2 Super Detail' })).not.toBeInTheDocument()
  })

  it.each([
    ['fade-color' as const, 'fc'],
    ['motion' as const, 'mv'],
  ])('does not mislabel a %s boundary as a cut', (kind, mnemonic) => {
    const show = createDefaultShow(`show-${kind}-mnemonic`, `${kind} mnemonic`, 1000)
    show.transitions![0] = { ...show.transitions![0], kind }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: `Select Scene 1 to Scene 2 transition (${kind})` })).toHaveTextContent(mnemonic)
  })

  it('enters the production Scene x Zone editor and returns without unmounting the global Timeline (#487)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-scene-editor', 'Scene editor', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const sceneHeaderActions = within(screen.getByRole('group', { name: 'Scene Scene 1' })).getAllByRole('button')
    expect(sceneHeaderActions[sceneHeaderActions.length - 1]).toHaveAccessibleName('Edit Scene 1')
    fireEvent.change(screen.getByRole('slider', { name: 'Timeline zoom' }), { target: { value: '5.1' } })
    await user.click(screen.getByRole('button', { name: 'Edit Scene 1' }))

    expect(screen.getByRole('region', { name: 'Scene 1 main Scene editor' })).toBeInTheDocument()
    expect(screen.getByTestId('show-timeline-grid')).not.toBeVisible()
    expect(screen.getByRole('button', { name: 'Go to Scene start' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Go to Show start' })).not.toBeInTheDocument()
    expect(useShowTransportStore.getState().playbackWindow).toEqual({ startMs: 0, endMs: 30_000 })
    usePreviewStore.setState({ isRunning: false })
    fireEvent.keyDown(document, { code: 'Space', key: ' ' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D Main clip' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Scene 1 main Scene editor' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('region', { name: 'Scene 1 main Scene editor' })).not.toBeInTheDocument()
    expect(screen.getByTestId('show-timeline-grid')).toBeVisible()
    expect(usePreviewStore.getState().isRunning).toBe(false)
    expect(useShowTransportStore.getState().playbackWindow).toBeNull()
    expect(screen.getByRole('slider', { name: 'Timeline zoom' })).toHaveValue('5.1')
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
  })

  it('reserves Space for Show playback across Timeline toolbar controls', () => {
    const show = createDefaultShow('show-space', 'Keyboard Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    usePreviewStore.setState({ isRunning: false })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('button', { name: 'Fit timeline to Show' }), { code: 'Space' })
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('leaves Space available while editing Show text', () => {
    const show = createDefaultShow('show-text-space', 'Text Show', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Scene 1 scene name' }), { code: 'Space' })
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

  it('does not reactivate Add zone when Space follows a navigator interaction', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-add-zone-focus', 'Add zone focus', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByRole('region', { name: 'Show timeline' })
    await user.click(within(timeline).getByRole('button', { name: 'Add zone' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].zones).toHaveLength(2))

    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    fireEvent.pointerDown(navigator, { pointerId: 1, clientX: 10 })
    fireEvent.pointerUp(navigator, { pointerId: 1, clientX: 10 })
    await user.keyboard(' ')

    expect(useShowStore.getState().shows[0].zones).toHaveLength(2)
    expect(usePreviewStore.getState().isRunning).toBe(false)
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
    expect(usePreviewStore.getState().isRunning).toBe(false)
  })

  it('seeks by one second and Home with clamping while preserving playback (#439)', () => {
    const show = createDefaultShow('show-keyboard-seek', 'Keyboard seek', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    const transport = useShowTransportStore.getState()

    usePreviewStore.setState({ isRunning: false })
    transport.setPosition(show.id, 500)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(false)

    usePreviewStore.setState({ isRunning: true })
    useShowTransportStore.getState().setPosition(show.id, 61_500)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 62_000 })
    expect(usePreviewStore.getState().isRunning).toBe(true)

    fireEvent.keyDown(document, { key: 'Home' })
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
    const goToStart = screen.getByRole('button', { name: 'Go to Show start' })
    expect(goToStart).toHaveAttribute('title', 'Go to Show start (Home)')
    useShowTransportStore.getState().setPosition(show.id, 5_000)
    fireEvent.click(goToStart)
    expect(useShowTransportStore.getState().seekRequest).toMatchObject({ targetMs: 0 })
    expect(usePreviewStore.getState().isRunning).toBe(true)
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

  it('keeps Arrow keys local to number, range, select, and navigator controls (#439)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-owned-arrows', 'Owned arrows', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)
    act(() => useShowTransportStore.getState().setPosition(show.id, 5_000))

    fireEvent.keyDown(screen.getByRole('slider', { name: 'Show playhead' }), { key: 'ArrowRight' })
    fireEvent.keyDown(screen.getByRole('spinbutton', { name: 'Scene 1 duration seconds' }), { key: 'ArrowLeft' })
    await user.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0])
    fireEvent.keyDown(screen.getByLabelText('Source pattern'), { key: 'ArrowRight' })

    expect(useShowTransportStore.getState()).toMatchObject({ positionMs: 6_000, seekRequest: null })
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
    expect(usePreviewStore.getState().isRunning).toBe(true)
  })

  it('drives proportional Show transport and requests an accurate seek (#414)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('region', { name: 'Show timeline' })).toBeInTheDocument()
    expect(screen.getByRole('slider', { name: 'Show playhead' })).toHaveAttribute('max', '62000')
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')
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

  it('organizes the production Timeline header by transport, zoom, and command priority (#466)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-toolbar-groups', 'Toolbar study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const transport = screen.getByRole('group', { name: 'Show transport controls' })
    expect(within(transport).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Pause Show preview',
      'Go to Show start',
    ])
    const playback = within(transport).getByRole('button', { name: 'Pause Show preview' })
    expect(playback.querySelector('.lucide-play')).toBeInTheDocument()
    expect(within(transport).getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')

    const zoom = screen.getByRole('group', { name: 'Timeline zoom controls' })
    expect(within(zoom).getByRole('button', { name: 'Zoom timeline out' })).toBeInTheDocument()
    expect(within(zoom).getByRole('slider', { name: 'Timeline zoom' })).toHaveValue('1')
    expect(within(zoom).getByRole('button', { name: 'Zoom timeline in' })).toBeInTheDocument()
    expect(within(zoom).getByText('1.0x')).toBeInTheDocument()

    const commands = screen.getByRole('group', { name: 'Timeline commands' })
    expect(within(commands).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Undo Show edit',
      'Redo Show edit',
      'Snap playhead',
      'Fit timeline to Show',
      'Split at playhead',
      'Clone selection',
    ])
    expect(within(commands).getByRole('button', { name: 'Clone selection' })).toBeDisabled()
    expect(screen.getByTestId('show-timeline-grid').style.gridTemplateRows).toContain('44px')

    await user.click(playback)
    expect(screen.getByRole('button', { name: 'Play Show preview' }).querySelector('.lucide-pause')).toBeInTheDocument()

    const split = within(commands).getByRole('button', { name: 'Split at playhead' })
    expect(split).toHaveAttribute(
      'title',
      'Leave at least 1.0 s on both sides of the playhead.',
    )
    expect(split).toHaveAttribute('aria-disabled', 'true')
    await user.click(split)
    expect(within(commands).getByRole('status', { name: 'Split unavailable' })).toHaveTextContent(
      'Split needs 1.0 s on both sides',
    )

    useShowTransportStore.setState({ seekStatus: 'rebuilding' })
    expect(screen.queryByText('rebuilding')).not.toBeInTheDocument()
  })

  it('clones the selected Scene and a supported simple Clip, then undoes and redoes the Scene transaction (#470)', async () => {
    const user = userEvent.setup()
    const sceneShow = createDefaultShow('show-470-scene-clone', 'Scene clone', 1000)
    setPersonalContentProvider(memoryProvider([sceneShow]))
    useShowStore.setState({ shows: [sceneShow], activeShowId: sceneShow.id, showsLoaded: true })

    const view = render(<ShowEditor showId={sceneShow.id} />)
    await user.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))
    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeEnabled()
    expect(clone).toHaveAttribute('title', 'Clone Scene 1 after itself')
    await user.click(clone)
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
    expect(screen.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Scene 1 copy')

    await user.click(screen.getByRole('button', { name: 'Undo Show edit' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(2))
    await user.click(screen.getByRole('button', { name: 'Redo Show edit' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))

    const clipShow = createDefaultShow('show-470-clip-clone', 'Clip clone', 2000)
    clipShow.cells = clipShow.cells.filter((cell) => cell.sceneId !== 'scene-2')
    setPersonalContentProvider(memoryProvider([clipShow]))
    useShowStore.setState({ ...showInitialState, shows: [clipShow], activeShowId: clipShow.id, showsLoaded: true })
    view.rerender(<ShowEditor showId={clipShow.id} />)
    await user.click(screen.getByRole('button', { name: 'Select TestPattern1D' }))
    expect(screen.getByRole('button', { name: 'Clone selection' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: 'Clone selection' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toHaveLength(2))
    expect(useShowStore.getState().shows[0].cells.find((cell) => cell.sceneId === 'scene-2')?.patternName).toBe('TestPattern1D')
  })

  it('enables Clip Clone by rippling an occupied following slot (#470)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-470-ripple-clone', 'Ripple clone', 2000)
    show.cells[0] = { ...show.cells[0], patternName: 'Clone source' }
    show.cells[1] = { ...show.cells[1], patternName: 'Occupied next' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Clone source' }))

    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeEnabled()
    expect(clone).toHaveAttribute('title', 'Clone Clone source immediately after itself')
    await user.click(clone)

    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
    expect(screen.getByRole('heading', { name: 'Clone source' })).toBeInTheDocument()
  })

  it('explains unsupported Clone owners and previews a legal magnetic Clip destination before drop (#470)', async () => {
    const show = createDefaultShow('show-470-move', 'Magnetic move', 1000)
    show.cells = show.cells.filter((cell) => cell.sceneId !== 'scene-2')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    const clone = screen.getByRole('button', { name: 'Clone selection' })
    expect(clone).toBeDisabled()
    expect(clone).toHaveAttribute('title', 'Select one Scene or simple Clip to Clone')

    const clip = screen.getByRole('button', { name: 'Select TestPattern1D' })
    const destination = screen.getByRole('button', { name: 'Add clip to main in Scene 2' })
    const dataTransfer = { setData: () => {}, effectAllowed: 'none', dropEffect: 'none' }
    fireEvent.dragStart(clip, { dataTransfer })
    fireEvent.dragEnter(destination, { dataTransfer })
    fireEvent.dragOver(destination, { dataTransfer })
    expect(destination).toHaveAttribute('data-drop-active', 'true')
    expect(destination).toHaveTextContent('Move here')
    fireEvent.drop(destination, { dataTransfer })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === 'cell-1')?.sceneId).toBe('scene-2')
    })
  })

  it('keeps Snap durable and excludes editable controls from Show undo shortcuts (#470)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-470-shortcuts', 'Shortcuts', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Snap playhead' }))
    expect(useShowEditorSessionStore.getState().snapEnabled).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))
    await user.click(screen.getByRole('button', { name: 'Clone selection' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))

    const name = screen.getByRole('textbox', { name: 'Scene name' })
    name.focus()
    fireEvent.keyDown(name, { key: 'z', metaKey: true })
    expect(useShowStore.getState().shows[0].scenes).toHaveLength(3)
    fireEvent.keyDown(document.body, { key: 'z', metaKey: true })
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(2))
  })

  it('selects a scene and exposes compact Scene properties (#424)', async () => {
    const show = createDefaultShow('show-scene-properties', 'Scene properties study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const sceneHeader = screen.getByRole('group', { name: 'Scene Scene 1' })
    expect(sceneHeader).toHaveAttribute('title', 'Open Scene 1 properties')
    fireEvent.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))

    expect(screen.getByRole('region', { name: 'Scene properties' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Scene properties' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Scene name' })).toHaveValue('Scene 1')
    expect(screen.queryByRole('spinbutton', { name: 'Scene duration seconds' })).not.toBeInTheDocument()
    await userEvent.setup().click(screen.getByRole('button', { name: 'Edit scene duration' }))
    expect(screen.getByRole('dialog', { name: 'Scene duration editor' })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Scene duration seconds' })).toHaveValue('30')

    fireEvent.change(screen.getByRole('textbox', { name: 'Scene duration seconds' }), { target: { value: '12.5' } })
    expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(30_000)
    fireEvent.click(screen.getByRole('button', { name: 'Apply scene duration' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(12_500))

    fireEvent.click(screen.getByRole('button', { name: 'Duplicate scene Scene 1' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
  })

  it('edits Scene duration inline without falling through to Scene properties', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-inline-scene-duration', 'Inline Scene duration', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const sceneHeader = screen.getByRole('group', { name: 'Scene Scene 1' })
    const duration = within(sceneHeader).getByRole('spinbutton', { name: 'Scene 1 duration seconds' })
    await user.click(duration)
    expect(screen.queryByRole('region', { name: 'Scene properties' })).not.toBeInTheDocument()

    await user.clear(duration)
    await user.type(duration, '16')
    expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(30_000)
    await user.tab()
    await waitFor(() => expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(16_000))

    expect(within(sceneHeader).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      'Open Scene 1 properties',
      'Remove scene Scene 1',
      'Edit Scene 1',
    ])
  })

  it('keeps invalid Scene-duration drafts out of local composition state', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-scene-duration-draft', 'Scene duration draft', 1000)
    show.composition = projectFlatShowToCompositionV1(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS[cell.pattern.id]])),
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Open Scene 1 properties' }))
    await user.click(screen.getByRole('button', { name: 'Edit scene duration' }))
    const input = screen.getByRole('textbox', { name: 'Scene duration seconds' })
    await user.clear(input)
    await user.type(input, '1')

    expect(screen.getByRole('button', { name: 'Apply scene duration' })).toBeDisabled()
    expect(screen.getByText('Minimum 30 s for Scene content')).toBeInTheDocument()
    expect(useShowStore.getState().shows[0].scenes[0].durationMs).toBe(30_000)
    expect(screen.queryByText(/Main placement must stay inside positive Scene-local time/i)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Cancel scene duration' }))
    expect(screen.queryByRole('dialog', { name: 'Scene duration editor' })).not.toBeInTheDocument()
  })

  it('opens 2D Installation spatial zone selection from the center inspector only (#340)', async () => {
    const user = userEvent.setup()
    const show = createShowWithOutputContract(
      'show-spatial-zone',
      'Spatial zone',
      createInstallationShowOutputContract({ outputMapId: 'plane', pixelCount: 16 }),
      1000,
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    const open = screen.getByRole('button', { name: 'Select main LEDs on output map' })
    expect(open).toBeEnabled()
    await user.click(open)

    expect(screen.getByRole('heading', { name: 'Select LEDs for main' })).toBeInTheDocument()
    expect(screen.getByLabelText('Select LEDs for zone main')).toBeInTheDocument()
    expect(screen.getByText(/Square.*Default.*saved 2D output map/i)).toBeInTheDocument()
  })

  it('hides physical selection for Portable and disables unsupported 3D selection (#340)', async () => {
    const user = userEvent.setup()
    const portable = createShowWithOutputContract(
      'show-portable-no-spatial',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 16 }),
      1000,
    )
    useShowStore.setState({ shows: [portable], activeShowId: portable.id, showsLoaded: true })
    const view = render(<ShowEditor showId={portable.id} />)
    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    expect(screen.queryByRole('button', { name: /LEDs on output map/i })).not.toBeInTheDocument()

    const spatial3D = createShowWithOutputContract(
      'show-3d-no-spatial',
      '3D Installation',
      createInstallationShowOutputContract({ outputMapId: 'cube', pixelCount: 8 }),
      1000,
    )
    useShowStore.setState({ shows: [spatial3D], activeShowId: spatial3D.id, showsLoaded: true })
    view.rerender(<ShowEditor showId={spatial3D.id} />)
    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    expect(screen.getByRole('button', { name: 'Select main LEDs on output map' })).toBeDisabled()
    expect(screen.getByText('Spatial selection is unavailable for 3D maps.')).toBeInTheDocument()
  })

  it('uses Delete for the selected timeline entity while protecting editors (#424)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-424-delete', 'Delete study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('group', { name: 'Scene Scene 1' }))
    fireEvent.keyDown(screen.getByLabelText('Scene name'), { key: 'Delete' })
    expect(screen.queryByText('Remove scene?')).not.toBeInTheDocument()

    fireEvent.keyDown(document, { key: 'Delete' })
    expect(screen.getByText('Remove scene?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Cancel' }))

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    fireEvent.keyDown(document, { key: 'Delete' })
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.id === 'transition-scene-1')?.kind)
        .toBe('cut')
    })
  })

  it('uses the Mac Delete key from the focused timeline entity (#424)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-424-mac-delete', 'Mac Delete study', 1000)
    const clipId = show.cells[0].id
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const clip = screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0]
    await user.click(clip)
    expect(clip).toHaveFocus()

    await user.keyboard('{Backspace}')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.some((cell) => cell.id === clipId)).toBe(false)
    })
  })

  it('resumes playback after scrubbing a Show that was already playing', () => {
    const show = createDefaultShow('show-resume-scrub', 'Resume after scrub', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

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

  it('zooms, pans, resizes, and fits one synchronized timeline viewport (#420)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-420', 'Zoom study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    fireEvent.change(screen.getByRole('slider', { name: 'Show playhead' }), { target: { value: '10000' } })
    const playhead = screen.getByRole('slider', { name: 'Show playhead' })
    const split = screen.getByRole('button', { name: 'Split at playhead' })
    const navigator = screen.getByRole('slider', { name: 'Pan visible timeline range' })
    expect(screen.getByRole('group', { name: 'Show navigator' })).toBeInTheDocument()
    expect(navigator).toHaveStyle({ width: '100%' })

    await user.click(screen.getByRole('button', { name: 'Zoom timeline in' }))
    expect(navigator).toHaveStyle({ width: '80%' })
    expect(playhead).toHaveValue('10000')
    expect(split).toBeEnabled()

    fireEvent.keyDown(navigator, { key: 'ArrowRight' })
    expect(Number(navigator.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    fireEvent.keyDown(screen.getByRole('button', { name: 'Resize visible range end' }), { key: 'ArrowLeft' })
    await waitFor(() => expect(Number(screen.getByRole('slider', { name: 'Pan visible timeline range' }).getAttribute('aria-valuemax'))).toBeGreaterThan(12400))

    await user.click(screen.getByRole('button', { name: 'Fit timeline to Show' }))
    expect(navigator).toHaveStyle({ width: '100%' })
    expect(navigator).toHaveAttribute('aria-valuenow', '0')
    expect(playhead).toHaveValue('10000')
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

  it('keeps Ctrl or Command wheel input assigned to timeline zoom (#476)', () => {
    const show = createDefaultShow('show-476-modifier', 'Modifier zoom study', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    const timeline = screen.getByTestId('show-timeline-scroll-region')
    fireEvent.wheel(timeline, { ctrlKey: true, deltaY: -120 })

    expect(screen.getByLabelText('Timeline zoom level')).toHaveTextContent('1.3x')
  })

  it('splits at the playhead and exposes explicit Continue or Restart entry behavior (#415)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Split Show', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    const splitButton = screen.getByRole('button', { name: 'Split at playhead' })
    expect(splitButton).toHaveAttribute('aria-disabled', 'true')
    fireEvent.change(screen.getByRole('slider', { name: 'Show playhead' }), { target: { value: '10000' } })
    expect(splitButton).not.toHaveAttribute('aria-disabled')
    await user.click(splitButton)

    await waitFor(() => expect(useShowStore.getState().shows[0].scenes).toHaveLength(3))
    expect(screen.getByDisplayValue('Scene 1 part 2')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[1])
    const restart = screen.getByLabelText('Restart Pattern on entry')
    expect(restart).not.toBeChecked()
    expect(screen.getByText(/continues the matching Pattern instance/i)).toBeInTheDocument()
    await user.click(restart)

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.sceneId === 'scene-3')?.restartOnEntry).toBe(true)
    })
    expect(screen.getByText(/starts a fresh Pattern instance/i)).toBeInTheDocument()
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

  it('authors named routing layouts and scene-boundary switch markers (#398)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-1', 'Routing Show', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByText('Routing layouts')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Add routing layout' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].routingLayouts).toHaveLength(2))

    const added = useShowStore.getState().shows[0].routingLayouts[1]
    fireEvent.change(screen.getByLabelText(`${added.name} routing layout name`), { target: { value: 'Quadrants' } })
    await waitFor(() => expect(useShowStore.getState().shows[0].routingLayouts[1].name).toBe('Quadrants'))

    await user.click(screen.getByRole('button', { name: 'Set routing layout after Scene 1' }))
    await user.selectOptions(screen.getByLabelText('Destination routing layout'), added.id)
    await waitFor(() => expect(useShowStore.getState().shows[0].routingSwitches).toEqual([
      { afterSceneId: 'scene-1', layoutId: added.id },
    ]))
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
    expect(screen.getByLabelText('Wave amplitude')).toHaveValue(0.3)
    expect(screen.getByLabelText('Wave frequency')).toHaveValue(2.5)
    expect(screen.getByLabelText('Wave phase')).toHaveValue(0)
    await user.selectOptions(screen.getByLabelText('Wave axis'), 'y')
    changeCommittedNumber('Wave band count', '6')
    changeCommittedNumber('Wave amplitude', '0.4')
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
    expect(screen.getByLabelText('Soft Split feather')).toHaveValue(0.2)
    expect(screen.getByText(/inside the feather, both patterns render/i)).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Split position lane' })).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Soft Split axis'), 'y')
    changeCommittedNumber('Soft Split feather', '0.3')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].routingLayouts[0].logical).toEqual({
        kind: 'soft-split',
        zoneIds: ['zone-1', 'zone-2'],
        axis: 'y',
        feather: 0.3,
      })
    })
  })

  it('authors scene-owned moving-split targets from the shared property lane (#405)', async () => {
    const user = userEvent.setup()
    let show = addShowZone(createDefaultShow('show-405-editor', 'Moving split', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id], axis: 'x' },
    })
    show = updateShowScene(show, show.scenes[0].id, { routingTargets: { splitPosition: 0.25 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Split position lane' })).toBeInTheDocument()
    expect(screen.getByText(/moving split: 1 scalar/i)).toBeInTheDocument()
    await user.click(screen.getByRole('group', { name: 'Scene Scene 1' }))
    expect(screen.getByLabelText('Split position')).toHaveValue(0.25)
    changeCommittedNumber('Split position', '0.4')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].routingTargets?.splitPosition).toBe(0.4)
    })
  })

  it('authors moving-split interpolation on the incoming shared boundary (#405)', async () => {
    const user = userEvent.setup()
    let show = addShowZone(createDefaultShow('show-405-boundary', 'Moving split boundary', 1000), {
      name: 'right',
      nominalPixelCount: 4,
    })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'split', zoneIds: [show.zones[0].id, show.zones[1].id], axis: 'x' },
    })
    show = updateShowScene(show, show.scenes[0].id, { routingTargets: { splitPosition: 0.25 } })
    show = updateShowScene(show, show.scenes[1].id, { routingTargets: { splitPosition: 0.75 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate split position'))
    changeCommittedNumber('Split position start', '0.2')
    changeCommittedNumber('Split position duration seconds', '1.2')
    await user.selectOptions(screen.getByLabelText('Split position easing'), 'ease-in-out')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.[0].propertyTransitions?.routing?.splitPosition).toEqual({
        from: 0.2,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      })
    })
  })

  it('authors scene-owned synchronized tiling from the shared Sample lane (#406)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-406-editor', 'Synchronized tiling', 1000)
    show = updateShowScene(show, show.scenes[0].id, { sampleTargets: { repeatScale: 2 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Sample repeat lane' })).toBeInTheDocument()
    expect(screen.getByText(/sample repeat: 1 scalar/i)).toBeInTheDocument()
    await user.click(screen.getByRole('group', { name: 'Scene Scene 1' }))
    expect(screen.getByLabelText('Repeat scale')).toHaveValue(2)
    changeCommittedNumber('Repeat scale', '3')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].sampleTargets?.repeatScale).toBe(3)
    })
  })

  it('authors repeat-scale interpolation on the incoming shared boundary (#406)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-406-boundary', 'Repeated sample boundary', 1000)
    show = updateShowScene(show, show.scenes[0].id, { sampleTargets: { repeatScale: 1.5 } })
    show = updateShowScene(show, show.scenes[1].id, { sampleTargets: { repeatScale: 3 } })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate repeat scale'))
    changeCommittedNumber('Repeat scale start', '1.25')
    changeCommittedNumber('Repeat scale duration seconds', '1.2')
    await user.selectOptions(screen.getByLabelText('Repeat scale easing'), 'ease-in-out')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.[0].propertyTransitions?.sample?.repeatScale).toEqual({
        from: 1.25,
        durationMs: 1200,
        easing: { curve: 'quadratic', direction: 'in-out' },
      })
    })
  })

  it('selects visual and routing events from one first-class transition lane and inspector (#416)', async () => {
    const user = userEvent.setup()
    const base = addShowRoutingLayout(createDefaultShow('show-1', 'Boundary lane', 1000), 'Alternate')
    const show = updateShowRoutingSwitch(base, 'scene-1', base.routingLayouts[1].id)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('group', { name: 'Transition lane' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    expect(screen.getByRole('heading', { name: 'Transition properties' })).toBeInTheDocument()
    expect(screen.getByText(/Scene 1 → Scene 2 · crossfade/i)).toBeInTheDocument()
    expect(screen.getByTestId('show-compile-bar')).toHaveTextContent(
      'crossfade: snapshot outgoing · capture frame 2 render paths/px · then 1 live render path/px',
    )
    expect(screen.getByLabelText('Crossfade source')).toHaveValue('snapshot-live')
    expect(screen.getByLabelText('Crossfade evaluation cost')).toHaveTextContent(
      'one live Pattern renderer per pixel after capture',
    )
    await user.selectOptions(screen.getByLabelText('Crossfade source'), 'live-live')
    await user.selectOptions(screen.getByLabelText('Easing'), 'ease-in-out')
    expect(screen.getByLabelText('Duration')).toHaveAttribute('step', '100')
    changeCommittedNumber('Duration', '1500')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.id === 'transition-scene-1'))
        .toMatchObject({
          durationMs: 1500,
          easing: { curve: 'quadratic', direction: 'in-out' },
          crossfadePolicy: 'live-live',
        })
    })

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (routing)' }))
    expect(screen.getByText(/Scene 1 → Scene 2 · routing/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Destination routing layout')).toHaveValue(base.routingLayouts[1].id)

    changeCommittedNumber('Routing transfer duration seconds', '2')
    await user.selectOptions(screen.getByLabelText('Routing transfer easing'), 'ease-in-out')
    await user.selectOptions(screen.getByLabelText('Routing transfer direction'), 'reverse')
    expect(screen.getByLabelText('Routing transfer cost')).toHaveTextContent('Cost tier: cheap')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].transitions?.find((transition) => transition.kind === 'routing'))
        .toMatchObject({
          durationMs: 2000,
          easing: { curve: 'quadratic', direction: 'in-out' },
          routingDirection: 'reverse',
        })
    })
  })

  it('authors a boundary-owned time-scale ramp from the nested Time lane (#417)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-417', 'Time lane', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('group', { name: 'Animation speed lane for main' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate speed for main'))
    changeCommittedNumber('Animation speed start main', '1.5')
    changeCommittedNumber('Animation speed target main', '0')

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.transitions?.[0].propertyTransitions).toEqual({
        timeScale: { fromByCellId: { 'cell-2': 1.5 }, durationMs: 2000, easing: { curve: 'linear' } },
      })
      expect(saved.cells[1].adaptations.timeScale).toBe(0)
    })
    expect(screen.getByRole('group', { name: 'Animation speed lane for main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Boundary starts at 30000 ms, value 1\.5/i })).toBeInTheDocument()
    await user.click(screen.getAllByRole('button', { name: 'Select TestPattern1D' })[0])
    await user.click(screen.getByRole('button', { name: /Boundary starts at 30000 ms, value 1\.5/i }))
    expect(screen.getByRole('heading', { name: 'Transition properties' })).toBeInTheDocument()
  })

  it('authors independent Time and Brightness curves through one property inspector (#418)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-418', 'Two properties', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('group', { name: 'Brightness lane for main' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate speed for main'))
    await user.click(screen.getByLabelText('Animate brightness for main'))
    changeCommittedNumber('Animation speed duration seconds', '1.5')
    await user.selectOptions(screen.getByLabelText('Animation speed easing'), 'ease-in')
    changeCommittedNumber('Brightness duration seconds', '0.8')
    await user.selectOptions(screen.getByLabelText('Brightness easing'), 'ease-out')
    changeCommittedNumber('Brightness target main', '0.25')

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.transitions?.[0].propertyTransitions).toMatchObject({
        timeScale: { durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' } },
        brightness: { durationMs: 800, easing: { curve: 'quadratic', direction: 'out' } },
      })
      expect(saved.cells[1].adaptations.brightness).toBe(0.25)
    })
    expect(screen.getByRole('group', { name: 'Brightness lane for main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Boundary reaches 0\.25 at 30800 ms, value 25%/i })).toBeInTheDocument()
  })

  it('authors a public Pattern slider with the shared target, lane, and boundary vocabulary (#419)', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-419', 'Pattern control', 1000)
    for (const cell of show.cells) {
      show = updateShowCellPattern(show, cell.id, {
        pattern: { kind: 'stock', id: 'RibbonLoom' },
        patternName: 'Ribbon Loom',
      })
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getAllByRole('button', { name: 'Select Ribbon Loom' })[0])
    expect(screen.getByText('sliderSpeed · 0–1')).toHaveAttribute(
      'title',
      'sliderSpeed · Studio default 0.5',
    )
    await user.click(screen.getByLabelText('Set Speed target'))
    const firstSpeedTarget = screen.getByLabelText('Speed target')
    expect(firstSpeedTarget.closest('label')?.querySelector('.sr-only')).toHaveTextContent('Speed target')
    fireEvent.change(firstSpeedTarget, { target: { value: '0.2' } })
    fireEvent.blur(firstSpeedTarget)

    await user.click(screen.getAllByRole('button', { name: 'Select Ribbon Loom' })[1])
    await user.click(screen.getByLabelText('Set Speed target'))
    changeCommittedNumber('Speed target', '0.8')

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    await user.click(screen.getByLabelText('Animate Speed for main'))
    await user.selectOptions(screen.getByLabelText('Speed easing'), 'ease-in-out')

    await waitFor(() => {
      const saved = useShowStore.getState().shows[0]
      expect(saved.cells.map((cell) => cell.controlTargets?.sliderSpeed)).toEqual([0.2, 0.8])
      expect(saved.transitions?.[0].propertyTransitions?.controls?.sliderSpeed).toMatchObject({
        fromByCellId: { 'cell-2': 0.2 },
        easing: { curve: 'quadratic', direction: 'in-out' },
      })
    })
    expect(screen.getByRole('group', { name: 'Speed control lane for main' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Boundary reaches 0\.8 at 32000 ms, value 0\.8/i })).toBeInTheDocument()
  })

  it('opens Pattern controls by default when the selected Clip has an authored target', async () => {
    const user = userEvent.setup()
    let show = createDefaultShow('show-authored-control-open', 'Authored control', 1000)
    show = updateShowCellPattern(show, show.cells[0].id, {
      pattern: { kind: 'stock', id: 'RibbonLoom' },
      patternName: 'Ribbon Loom',
    })
    show.cells[0] = { ...show.cells[0], controlTargets: { sliderSpeed: 0.5 } }
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: 'Select Ribbon Loom' }))

    expect(screen.getByRole('group', { name: 'Pattern automation targets' })).toHaveAttribute('open')
  })

  it('opens Advanced Clip controls by default when the selected Clip overrides an advanced setting', async () => {
    const user = userEvent.setup()
    const base = createDefaultShow('show-advanced-open', 'Advanced authored setting', 1000)
    const show = updateShowCellAdaptations(base, base.cells[0].id, { timeOffsetMs: 500 })
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByRole('group', { name: 'Advanced Clip controls' })).toHaveAttribute('open')
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

  it('keeps zone selection in the clip row and hides default property lanes (#466, #483)', () => {
    const show = createDefaultShow('show-466-zone-target', 'Zone target', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'Select zone main' })).toHaveStyle({ gridRow: '5' })
    expect(screen.queryByRole('group', { name: 'Animation speed lane for main' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Add zone' })).toHaveStyle({ gridRow: '6' })
  })

  it('renders a scene strip, selectable clip inspector, and compile bar', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByText('Opening wash')).toBeInTheDocument()
    expect(screen.queryByText(/show - 1 scenes/i)).not.toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'Show time' })).toHaveTextContent('00:00.0/01:02.0')
    expect(screen.getByDisplayValue('Scene 1')).toBeInTheDocument()
    expect(screen.getAllByText('main').length).toBeGreaterThan(0)
    expect(screen.getByText(/show source/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export Show as .epe' })).toBeEnabled()
    expect(screen.getByText(/renderer\/px/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Show properties' })).toBeInTheDocument()
    expect(screen.getByLabelText('Target controller')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Scene Scene 1' }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Select zone main' }).querySelector('svg')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0].querySelector('svg')).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    const clipRegion = screen.getByRole('region', { name: 'Clip properties' })
    const clipHeader = clipRegion.querySelector('header')!
    expect(within(clipHeader).getByRole('heading', { name: 'TestPattern1D' })).toBeInTheDocument()
    expect(within(clipHeader).getByText('Pattern')).toBeInTheDocument()
    expect(within(clipHeader).getByText('Scene 1')).toBeInTheDocument()
    expect(within(clipHeader).queryByText('main')).not.toBeInTheDocument()
    expect(within(clipHeader).getByRole('region', { name: 'Clip summary' })).toBeInTheDocument()
    expect(screen.getByLabelText('Mirror clip')).toBeInTheDocument()
    expect(screen.getByLabelText('Animation speed')).toHaveAttribute('min', '0')
    expect(screen.getByLabelText('Animation speed')).toHaveAttribute(
      'title',
      'How quickly Pattern animation advances. Does not change Clip duration or frame rate.',
    )

    const primaryFields = screen.getByTestId('clip-primary-fields')
    expect(primaryFields).toHaveClass('min-w-0')
    expect(screen.getByLabelText('Brightness').closest('label')).toHaveClass('min-w-0')

    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))
    expect(screen.getByRole('heading', { name: 'Transition properties' })).toBeInTheDocument()
    expect(screen.getByText(/Scene 1 → Scene 2 · crossfade/i)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Crossfade · Change/i }))
    expect(screen.getByRole('button', { name: 'Use Linear Transition' })).toBeInTheDocument()
    await user.keyboard('{Escape}')
  })

  it('lets a Clip numeric field be cleared and edited before committing a bounded value', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-number-edit', 'Number edit', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    const speed = screen.getByRole('spinbutton', { name: 'Animation speed' })
    await user.clear(speed)
    expect(speed).toHaveValue(null)

    await user.type(speed, '4')
    expect(speed).toHaveValue(4)
    expect(useShowStore.getState().shows[0].cells[0].adaptations.timeScale).toBe(1)

    await user.type(speed, '4')
    expect(speed).toHaveValue(44)
    fireEvent.blur(speed)
    expect(speed).toHaveValue(4)
    expect(useShowStore.getState().shows[0].cells[0].adaptations.timeScale).toBe(4)

    const brightness = screen.getByRole('spinbutton', { name: 'Brightness' })
    expect(brightness.closest('label')).toHaveTextContent('0–1')
    await user.clear(brightness)
    await user.type(brightness, '9')
    fireEvent.blur(brightness)
    expect(brightness).toHaveValue(1)
    expect(useShowStore.getState().shows[0].cells[0].adaptations.brightness).toBe(1)
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

  it('opens one anchored Entity Detail Panel, transfers it, and closes it predictably (#467)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-entity-detail', 'Entity detail', 1000)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    const clip = screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0]
    await user.click(clip)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `clip:${show.cells[0].id}`)
    expect(screen.getByTestId('show-entity-detail-stem')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'TestPattern1D' })).toBeInTheDocument()

    const scene = screen.getByRole('group', { name: 'Scene Scene 1' })
    await user.click(scene)
    expect(screen.getAllByRole('dialog', { name: 'Entity Detail Panel' })).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `scene:${show.scenes[0].id}`)
    expect(screen.getByRole('heading', { name: 'Scene properties' })).toBeInTheDocument()

    await user.click(scene)
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
    await user.click(clip)
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show properties' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'show')
    await user.click(screen.getByText('Show time'))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
  })

  it('adds and edits a registry Effect through the selected Clip panel (#468)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-effects-ui', 'Effect authoring', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    const effectStack = screen.getByRole('region', { name: 'Clip Effects' })
    await user.click(within(effectStack).getByRole('button', { name: 'Add' }))
    expect(screen.getByRole('dialog', { name: 'Add Effect' })).toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Search Effects' }), 'ripple')
    await user.click(screen.getByRole('button', { name: 'Add Ripple Effect' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells[0].effects).toEqual([
      expect.objectContaining({ id: 'ripple', kind: 'ripple', amount: 0 }),
    ]))
    expect(screen.queryByRole('dialog', { name: 'Add Effect' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit Ripple Effect' }))
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Amount' }), { target: { value: '0.2' } })
    fireEvent.blur(screen.getByRole('spinbutton', { name: 'Amount' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells[0].effects?.[0]).toMatchObject({
      id: 'ripple',
      kind: 'ripple',
      amount: 0.2,
    }))

    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].cells[0].effects?.[0]).toMatchObject({ amount: 0.2 })
  })

  it('anchors every remaining Timeline selection family in the same panel (#467)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-entity-families', 'Entity families', 1000)
    show.cells = show.cells.filter((cell) => !(cell.zoneId === 'zone-1' && cell.sceneId === 'scene-1'))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Select Scene 1 to Scene 2 transition (crossfade)' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', `transition:${show.transitions?.[0].id}`)
    expect(screen.getByRole('region', { name: 'Transition properties' })).toHaveAttribute('data-entity-family', 'transition')

    await user.click(screen.getByRole('button', { name: 'Select zone main' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'zone:zone-1')
    expect(screen.getByRole('region', { name: 'Zone properties' })).toHaveAttribute('data-entity-family', 'zone')

    await user.click(screen.getByRole('button', { name: 'Add clip to main in Scene 1' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'empty:zone-1:scene-1')
    expect(screen.getByRole('region', { name: 'Clip properties' })).toHaveAttribute('data-entity-family', 'clip')

    await user.click(screen.getByRole('button', { name: 'Set routing layout after Scene 1' }))
    expect(screen.getByRole('dialog', { name: 'Entity Detail Panel' })).toHaveAttribute('data-owner-key', 'routing:scene-1')
    expect(screen.getByRole('region', { name: 'Transition properties' })).toHaveAttribute('data-entity-family', 'transition')
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

  it('deletes a selected Clip from Properties without confirmation', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-delete', 'Clip deletion', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.click(screen.getByRole('button', { name: 'Delete clip TestPattern1D' }))

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
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
    expect(compileBar).toHaveTextContent('arena 6,012')
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
    expect(compileBar).toHaveTextContent('frame invariants: 7 hoisted · 18 ops/evaluation avoided')
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

  it('replaces a deleted Clip through its empty timeline slot (#430)', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-430-place', 'Clip placement', 1000)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.click(screen.getByRole('button', { name: 'Delete clip TestPattern1D' }))
    await user.click(await screen.findByRole('button', { name: 'Add clip to main in Scene 1' }))
    await user.type(screen.getByRole('combobox', { name: 'Pattern for new clip' }), 'TestPattern2D')
    await user.click(screen.getByRole('option', { name: 'TestPattern2D' }))

    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toContainEqual(expect.objectContaining({
      zoneId: 'zone-1',
      sceneId: 'scene-1',
      patternName: 'TestPattern2D',
    })))
    expect(screen.getByRole('button', { name: 'Select TestPattern2D' })).toBeInTheDocument()
    const clipHeader = screen.getByRole('region', { name: 'Clip properties' }).querySelector('header')!
    expect(within(clipHeader).getByRole('heading', { name: 'TestPattern2D' })).toBeInTheDocument()
    expect(within(clipHeader).getByText('Scene 1')).toBeInTheDocument()
    expect(within(clipHeader).queryByText('main')).not.toBeInTheDocument()
  })

  it('filters Clip Patterns by typing and selects a matching Pattern', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-pattern-typeahead', 'Pattern typeahead', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    const chooser = screen.getByRole('combobox', { name: 'Source pattern' })
    await user.clear(chooser)
    await user.type(chooser, 'shape')

    const results = screen.getByRole('listbox', { name: 'Source pattern matches' })
    expect(within(results).getByRole('option', { name: 'ShapeShifter' })).toBeInTheDocument()
    expect(within(results).queryByRole('option', { name: 'TestPattern2D' })).not.toBeInTheDocument()

    await user.click(within(results).getByRole('option', { name: 'ShapeShifter' }))
    await waitFor(() => expect(useShowStore.getState().shows[0].cells[0].patternName).toBe('ShapeShifter'))
  })

  it('composes source replacement, a hold, and a zone span without overlapping clips (#430)', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-430-compose', 'Clip composition', 1000), {
      name: 'edge',
      nominalPixelCount: 16,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.clear(screen.getByRole('combobox', { name: 'Source pattern' }))
    await user.type(screen.getByRole('combobox', { name: 'Source pattern' }), 'TestPattern2D')
    await user.click(screen.getByRole('option', { name: 'TestPattern2D' }))
    await user.click(screen.getByText('Advanced clip controls'))
    await user.selectOptions(screen.getByLabelText('Span zones'), '2')
    await user.selectOptions(screen.getByLabelText('Hold scenes'), '2')

    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toEqual([
      expect.objectContaining({
        id: 'cell-1',
        patternName: 'TestPattern2D',
        sceneSpan: 2,
        zoneSpan: 2,
      }),
    ]))
    expect(screen.queryByRole('button', { name: /^Add clip to/ })).not.toBeInTheDocument()
  })

  it('deletes the selected Clip with the Delete key', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-clip-delete-key', 'Clip keyboard deletion', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.keyboard('{Delete}')

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
    await waitFor(() => expect(useShowStore.getState().shows[0].cells).toHaveLength(1))
    expect(screen.queryByRole('dialog', { name: 'Entity Detail Panel' })).not.toBeInTheDocument()
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

  it('edits and explains a masked-evaluation light shutter', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Shutter study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.click(screen.getByLabelText('Light shutter'))

    expect(screen.getByLabelText('Shutter rate (Hz)')).toHaveValue(8)
    expect(screen.getByLabelText('Light on fraction')).toHaveValue(0.5)
    expect(screen.getByLabelText('Shutter phase')).toHaveValue(0)
    expect(screen.getByLabelText('Clock while dark')).toHaveValue('continue')
    expect(screen.getByText(/closed frames emit black/i)).toHaveTextContent('skip Pattern rendering')
    expect(screen.getByText(/Pattern eval:/i)).toHaveTextContent('50% expected')
    expect(screen.getByText(/Pattern eval:/i)).toHaveTextContent('outer loop + LEDs unchanged')

    changeCommittedNumber('Light on fraction', '0.35')
    await user.selectOptions(screen.getByLabelText('Clock while dark'), 'freeze')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.lightShutter).toMatchObject({
        duty: 0.35,
        clockBehavior: 'freeze',
      })
    })
    expect(screen.getByRole('region', { name: 'Clip summary' })).toHaveTextContent(
      'Light shutter8 Hz, 35% on, freeze clock',
    )
  })

  it('edits stepped motion as cadence and keeps it distinct from rendering and light output', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Temporal study', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByRole('button', { name: 'Smooth motion' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Stepped motion' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('group', { name: 'Motion cadence controls' })).toHaveClass('sm:grid-rows-[auto_1.5rem]')
    expect(screen.getByLabelText('Hold scenes')).toHaveClass('h-6', 'text-[9.5px]')
    expect(screen.getByLabelText('Start offset (ms)')).toHaveClass('h-6', 'text-[9.5px]')
    expect(screen.getByLabelText('Start offset (ms)').closest('label')?.querySelector('.sr-only')).toHaveTextContent('Start offset (ms)')
    expect(screen.queryByLabelText('Jumps per second')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Stepped motion' }))

    expect(screen.getByLabelText('Jumps per second')).toHaveValue('8')
    expect(screen.getByText('every 125 ms')).toBeInTheDocument()
    expect(screen.getByText(/motion freezes and jumps/i)).toHaveTextContent('pixels do not blink off')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.steppedClock).toEqual({ stepMs: 125 })
    })

    fireEvent.change(screen.getByLabelText('Jumps per second'), { target: { value: '4' } })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.steppedClock).toEqual({ stepMs: 250 })
    })
    expect(screen.getByText('every 250 ms')).toBeInTheDocument()
    expect(screen.getByText(/Motion cadence:/i)).toHaveTextContent('4/s stepped clip')
    expect(screen.getByText(/Motion cadence:/i)).toHaveTextContent('renderer cost unchanged')
    expect(screen.getByRole('region', { name: 'Clip summary' })).toHaveTextContent('Motion cadence4/s')

    await user.click(screen.getByRole('button', { name: 'Smooth motion' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.steppedClock).toBeUndefined()
    })
  })

  it('edits a private Pattern time offset with the settled motion vocabulary', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Rounds', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])

    expect(screen.getByLabelText('Start offset (ms)')).toHaveValue(0)
    changeCommittedNumber('Start offset (ms)', '500')

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells[0].adaptations.timeOffsetMs).toBe(500)
    })
    expect(screen.getByText(/shift this clip's private Pattern clock/i)).toHaveTextContent('rounds across zones')
    expect(screen.getByRole('region', { name: 'Clip summary' })).toHaveTextContent('Start offset500 ms')
    expect(screen.getByText(/Clock offset:/i)).toHaveTextContent('500ms')
    expect(screen.getByText(/Clock offset:/i)).toHaveTextContent('renderer cost unchanged')
  })

  it('explains feathered wipe as a stable one-renderer route edge', async () => {
    const user = userEvent.setup()
    const show = updateShowTransition(createDefaultShow('show-1', 'Feathered wipe', 1000), 'scene-1', 'wipe', 2000, 0.2)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))

    expect(screen.getByLabelText('Feather')).toHaveValue(0.2)
    expect(screen.getByText(/Cost tier:/i)).toHaveTextContent('cheap')
    expect(screen.getByText('worst instant: feathered wipe')).toBeInTheDocument()
  })

  it('edits a 2D portal transition and reports bounded blend cost', async () => {
    const user = userEvent.setup()
    const show = updateShowTransition(
      { ...createDefaultShow('show-1', 'Portal', 1000), stageMapId: 'plane' },
      'scene-1',
      'portal',
      2000,
      0.12,
      {
        centerX: 0.5,
        centerY: 0.5,
        invert: false,
        featherPolicy: 'dither',
        shape: 'diamond',
        scale: 1,
        rotation: 0.125,
        spin: 0,
      },
    )
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)
    await user.click(screen.getByRole('button', { name: /Select Scene 1 to Scene 2 transition/i }))

    expect(screen.getByLabelText('Center X')).toHaveValue(0.5)
    expect(screen.getByLabelText('Center Y')).toHaveValue(0.5)
    expect(screen.getByRole('button', { name: /Diamond · Change/i })).toBeInTheDocument()
    expect(screen.getByLabelText('Rotation')).toHaveValue(0.125)
    expect(screen.getByLabelText('Spin')).toHaveValue(0)
    expect(screen.queryByLabelText('Ring width')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Edge')).toHaveValue('dither')
    expect(screen.getByText('worst instant: portal dither')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Diamond · Change/i }))
    await user.click(screen.getByRole('button', { name: 'Use Ring Transition' }))
    fireEvent.change(screen.getByLabelText('Center X'), { target: { value: '0.35' } })
    await user.selectOptions(screen.getByLabelText('Edge'), 'blend')
    await user.selectOptions(screen.getByLabelText('Reveal mode'), 'shrink-outgoing')
    fireEvent.change(screen.getByLabelText('Ring width'), { target: { value: '0.2' } })

    expect(screen.queryByLabelText('Rotation')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Spin')).not.toBeInTheDocument()

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
        kind: 'portal',
        centerX: 0.35,
        centerY: 0.5,
        invert: true,
        edgePolicy: 'blend',
        shape: 'ring',
        scale: 1,
        ringWidth: 0.2,
      })
    })
    await waitFor(() => expect(screen.getByText(/worst instant:/)).toHaveTextContent('portal'))
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

  it('edits a newly empty freestyle Show Zone', async () => {
    const user = userEvent.setup()
    const show = addShowZone(createDefaultShow('show-1', 'Opening wash', 1000), {
      name: 'doorframe',
      nominalPixelCount: 12,
    })
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    useControllerProfileStore.setState({
      profilesLoaded: true,
      profiles: [
        {
          id: 'controller-1',
          name: 'North Arch',
          board: { kind: 'pixelblaze-v3-standard' },
          inputs: [],
          globalTransforms: [],
          patternBindings: [],
          zones: [{ id: 'main', name: 'main', ranges: [{ start: 0, end: 119 }] }],
          updatedAt: 1,
        },
      ],
    })

    render(<ShowEditor showId={show.id} />)

    expect(screen.getByRole('button', { name: 'Add clip to doorframe in Scene 1' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: /Select TestPattern1D/i })[0])
    await user.selectOptions(screen.getByLabelText('Span zones'), '2')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
        zoneSpan: 2,
      })
    })
    expect(screen.getByLabelText('Zone domain')).toHaveValue('span')
    await user.selectOptions(screen.getByLabelText('Zone domain'), 'repeat')
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === 'cell-1')).toMatchObject({
        zoneMode: 'repeat',
      })
    })

    await user.click(screen.getByRole('button', { name: /Select zone doorframe/i }))
    const nameInput = screen.getByLabelText('Zone name doorframe')
    await user.clear(nameInput)
    await user.type(nameInput, 'entry')
    fireEvent.change(screen.getByLabelText('Nominal pixels entry'), { target: { value: '24' } })

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].zones[1]).toMatchObject({
        name: 'entry',
        nominalPixelCount: 24,
      })
    })
  })

  it('edits the selected second transition boundary in a three-scene show', async () => {
    const user = userEvent.setup()
    const show = addShowScene(createDefaultShow('show-1', 'Opening wash', 1000))
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: /Select Scene 2 to Scene 3 transition/i }))
    await user.click(screen.getByRole('button', { name: /Crossfade · Change/i }))
    await user.click(screen.getByRole('button', { name: 'Use Pixel Transition' }))

    await waitFor(() => {
      const updated = useShowStore.getState().shows[0]
      expect(updated.scenes[0].transitionOut?.kind).toBe('crossfade')
      expect(updated.scenes[1].transitionOut?.kind).toBe('dither')
    })
  })

  it('adds scenes and zones from strip ghost affordances and confirms scene removal', async () => {
    const user = userEvent.setup()
    const show = createDefaultShow('show-1', 'Opening wash', 1000)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    await user.click(screen.getByRole('button', { name: 'Add scene' }))
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes).toHaveLength(3)
    })
    expect(screen.getByRole('group', { name: 'Scene Scene 3' })).toBeInTheDocument()

    await user.click(screen.getAllByRole('button', { name: 'Add zone' })[0])
    await waitFor(() => {
      expect(useShowStore.getState().shows[0].zones).toHaveLength(2)
    })

    await user.click(screen.getByRole('button', { name: 'Remove scene Scene 3' }))
    expect(screen.getByText('Remove scene?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Remove' }))

    await waitFor(() => {
      expect(useShowStore.getState().shows[0].scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2'])
    })
  })

  it('hides scene removal when the show has one scene', () => {
    const show = removeShowScene(createDefaultShow('show-1', 'Opening wash', 1000), 'scene-2')
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    render(<ShowEditor showId={show.id} />)

    expect(screen.queryByRole('button', { name: /Remove scene/i })).not.toBeInTheDocument()
  })
})
