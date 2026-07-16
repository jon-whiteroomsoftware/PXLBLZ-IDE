import { showInitialState, useShowStore } from './showStore'
import { mapInitialState, useMapStore } from './mapStore'
import { createDefaultShow } from '@/engine/showModel'
import {
  createInstallationShowOutputContract,
  createPortableShowOutputContract,
} from '@/engine/showOutputContract'
import {
  resetPersonalContentProvider,
  setPersonalContentProvider,
  type PersonalContentProvider,
} from '@/engine/personalContentProvider'
import type { ControllerProfile } from '@/engine/controllerProfile'
import type { MapRecord, MixinRecord, PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import type { ShowCompositionV1 } from '@/engine/personalContentRecords'

function composition(): ShowCompositionV1 {
  return {
    version: 1,
    patternInstances: [{
      id: 'instance-1',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }, {
      id: 'instance-overlay',
      pattern: { kind: 'stock', id: 'CometLoom' },
      patternName: 'CometLoom',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: [{
      sceneId: 'scene-1',
      zones: [{
        zoneId: 'zone-1',
        main: [{
          id: 'placement-1',
          instanceId: 'instance-1',
          startMs: 0,
          durationMs: 10_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [{
          id: 'overlay-layer-1',
          name: 'Atmosphere',
          placements: [{
            id: 'overlay-placement-1',
            instanceId: 'instance-overlay',
            startMs: 1_000,
            durationMs: 4_000,
            opacity: 0.4,
            view: { mirror: false, phase: 0, brightness: 1 },
          }],
        }],
      }],
    }],
  }
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

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  useMapStore.setState(mapInitialState)
})

describe('showStore (#318)', () => {
  it('groups each Show edit as one session transaction with undo and redo (#470)', async () => {
    const show = createDefaultShow('show-history', 'History', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    await useShowStore.getState().updateScene(show.id, 'scene-1', { name: 'Opening' })
    expect(useShowStore.getState().shows[0].scenes[0].name).toBe('Opening')
    expect(useShowStore.getState().showHistories[show.id].past).toHaveLength(1)

    await useShowStore.getState().undoShow(show.id)
    expect(useShowStore.getState().shows[0].scenes[0].name).toBe('Scene 1')
    expect(useShowStore.getState().showHistories[show.id].future).toHaveLength(1)

    await useShowStore.getState().redoShow(show.id)
    expect(useShowStore.getState().shows[0].scenes[0].name).toBe('Opening')
    expect(useShowStore.getState().showHistories[show.id].future).toHaveLength(0)
  })

  it('restores the previous normalized Show and history when persistence fails (#470)', async () => {
    const show = createDefaultShow('show-rollback', 'Rollback', 1)
    delete show.transitions
    const provider = memoryProvider([show])
    provider.updateShow = async () => { throw new Error('offline') }
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    await expect(useShowStore.getState().updateScene(show.id, 'scene-1', { name: 'Lost edit' })).rejects.toThrow('offline')

    const restored = useShowStore.getState().shows[0]
    expect(restored.scenes[0].name).toBe('Scene 1')
    expect(restored.transitions?.[0]).toMatchObject({ kind: 'crossfade' })
    expect(useShowStore.getState().showHistories[show.id]?.past ?? []).toHaveLength(0)
  })
  it('serializes full-record persistence so rapid inspector edits cannot land out of order', async () => {
    const show = createDefaultShow('show-write-order', 'Write order', 1)
    const provider = memoryProvider([show])
    const writes: Array<Partial<Omit<ShowRecord, 'id'>>> = []
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve })
    provider.updateShow = async (_id, changes) => {
      writes.push(changes)
      if (writes.length === 1) await firstPending
    }
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    const first = useShowStore.getState().updateShow(show.id, { ...show, name: 'First', updatedAt: 2 })
    const second = useShowStore.getState().updateShow(show.id, { ...show, name: 'Second', updatedAt: 3 })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(writes.map((write) => write.name)).toEqual(['First'])
    releaseFirst()
    await Promise.all([first, second])
    expect(writes.map((write) => write.name)).toEqual(['First', 'Second'])
  })

  it('persists and reloads the optional Scene composition sidecar', async () => {
    const show = createDefaultShow('show-composition-persistence', 'Composition persistence', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    await useShowStore.getState().updateShow(show.id, {
      ...show,
      composition: composition(),
      updatedAt: 2,
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].composition).toEqual(composition())
  })

  it('preserves stable composition ids through undo and redo', async () => {
    const show = createDefaultShow('show-composition-history', 'Composition history', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })
    const authored = composition()

    await useShowStore.getState().updateShow(show.id, { ...show, composition: authored, updatedAt: 2 })
    expect(await useShowStore.getState().undoShow(show.id)).toBe(true)
    expect(useShowStore.getState().shows[0].composition).toBeUndefined()
    expect(await useShowStore.getState().redoShow(show.id)).toBe(true)
    expect(useShowStore.getState().shows[0].composition).toEqual(authored)
  })

  it('keeps Show creation provisional and restores the previously open Show on cancel (#434)', async () => {
    const previous = createDefaultShow('show-previous', 'Previous', 1)
    setPersonalContentProvider(memoryProvider([previous]))
    useShowStore.setState({ shows: [previous], activeShowId: previous.id, showsLoaded: true })

    useShowStore.getState().beginShowCreation()
    expect(useShowStore.getState()).toMatchObject({
      shows: [previous],
      activeShowId: previous.id,
      showCreation: { previousShowId: previous.id },
    })

    useShowStore.getState().cancelShowCreation()
    expect(useShowStore.getState()).toMatchObject({
      shows: [previous],
      activeShowId: previous.id,
      showCreation: null,
    })
  })

  it('persists and reloads configured Shows only when final creation is requested (#434)', async () => {
    const provider = memoryProvider()
    setPersonalContentProvider(provider)
    const portable = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })

    expect(useShowStore.getState().shows).toEqual([])
    const created = await useShowStore.getState().createNewShow({ name: 'Touring field', outputContract: portable })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(created).toMatchObject({
      name: 'Touring field',
      stageMapId: 'plane',
      outputContract: portable,
    })
    expect(useShowStore.getState().shows).toEqual([expect.objectContaining({
      id: created.id,
      outputContract: portable,
    })])

    const installation = createInstallationShowOutputContract({ outputMapId: 'custom-map', pixelCount: 240 })
    const installed = await useShowStore.getState().createNewShow({ name: 'Lobby wall', outputContract: installation })
    expect(installed).toMatchObject({
      stageMapId: 'custom-map',
      zones: [expect.objectContaining({ nominalPixelCount: 240 })],
      outputContract: installation,
    })
  })

  it('loads shows sorted by recency and opens one as active', async () => {
    const older = createDefaultShow('show-1', 'Older', 1)
    const newer = createDefaultShow('show-2', 'Newer', 2)
    setPersonalContentProvider(memoryProvider([older, newer]))

    await useShowStore.getState().loadShows()
    useShowStore.getState().openShow('show-1')

    expect(useShowStore.getState().shows.map((show) => show.id)).toEqual(['show-2', 'show-1'])
    expect(useShowStore.getState().activeShowId).toBe('show-1')
  })

  it('automatically persists a proven legacy Installation contract on open (#438)', async () => {
    const legacy = createDefaultShow('show-legacy-installation', 'Legacy Installation', 1)
    const choreography = structuredClone({
      scenes: legacy.scenes,
      cells: legacy.cells,
      transitions: legacy.transitions,
    })
    const provider = memoryProvider([legacy])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [legacy], showsLoaded: true })

    await useShowStore.getState().openShow(legacy.id)

    expect(useShowStore.getState()).toMatchObject({
      activeShowId: legacy.id,
      showClassification: null,
      shows: [expect.objectContaining({
        outputContract: expect.objectContaining({ kind: 'installation', pixelCount: 60 }),
      })],
    })
    expect(useShowStore.getState().shows[0]).toMatchObject(choreography)

    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].outputContract?.kind).toBe('installation')
  })

  it('prompts for an ambiguous legacy Show and cancel performs no write (#438)', async () => {
    const previous = {
      ...createDefaultShow('show-previous', 'Previous', 2),
      outputContract: createInstallationShowOutputContract({ outputMapId: null, pixelCount: 60 }),
    }
    const ambiguous = createDefaultShow('show-ambiguous', 'Ambiguous', 1)
    ambiguous.stageMapId = 'plane'
    ambiguous.routingLayouts[0].zones = []
    ambiguous.routingLayouts[0].logical = { kind: 'single', zoneIds: ['zone-1'] }
    const provider = memoryProvider([previous, ambiguous])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [previous, ambiguous], activeShowId: previous.id, showsLoaded: true })

    await useShowStore.getState().openShow(ambiguous.id)
    expect(useShowStore.getState()).toMatchObject({
      activeShowId: null,
      showClassification: {
        showId: ambiguous.id,
        previousShowId: previous.id,
        modeledPixelCount: 60,
      },
    })

    useShowStore.getState().cancelShowClassification()
    expect(useShowStore.getState()).toMatchObject({
      activeShowId: previous.id,
      showClassification: null,
    })

    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows.find((show) => show.id === ambiguous.id)?.outputContract).toBeUndefined()
  })

  it('persists one prompted contract without rewriting choreography and never asks again (#438)', async () => {
    const ambiguous = createDefaultShow('show-ambiguous', 'Ambiguous', 1)
    ambiguous.stageMapId = 'plane'
    ambiguous.routingLayouts[0].zones = []
    const choreography = structuredClone({
      scenes: ambiguous.scenes,
      cells: ambiguous.cells,
      routingLayouts: ambiguous.routingLayouts,
      routingSwitches: ambiguous.routingSwitches,
      transitions: ambiguous.transitions,
    })
    const provider = memoryProvider([ambiguous])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [ambiguous], showsLoaded: true })

    await useShowStore.getState().openShow(ambiguous.id)
    await useShowStore.getState().confirmShowClassification(
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 60 }),
    )

    const classified = useShowStore.getState().shows[0]
    expect(classified.outputContract?.kind).toBe('portable-2d')
    expect(classified).toMatchObject(choreography)
    expect(useShowStore.getState()).toMatchObject({ activeShowId: ambiguous.id, showClassification: null })

    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShow(ambiguous.id)
    expect(useShowStore.getState()).toMatchObject({ activeShowId: ambiguous.id, showClassification: null })
  })

  it('creates, renames, edits, and deletes shows through the provider', async () => {
    setPersonalContentProvider(memoryProvider())

    const show = await useShowStore.getState().createNewShow()
    expect(useShowStore.getState().activeShowId).toBeNull()
    await useShowStore.getState().renameShow(show.id, 'Opening wash')
    await useShowStore.getState().updateScene(show.id, show.scenes[0].id, { durationMs: 45000 })
    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, { mirror: true })

    expect(useShowStore.getState().shows[0]).toMatchObject({
      id: show.id,
      name: 'Opening wash',
      scenes: [expect.objectContaining({ durationMs: 45000 }), expect.any(Object)],
      cells: [expect.objectContaining({ adaptations: expect.objectContaining({ mirror: true }) }), expect.any(Object)],
    })

    await useShowStore.getState().removeShow(show.id)
    expect(useShowStore.getState().shows).toEqual([])
    expect(useShowStore.getState().activeShowId).toBeNull()
  })

  it('removes a Show clip through the persistence provider', async () => {
    const show = createDefaultShow('show-clip-delete', 'Clip deletion', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    await useShowStore.getState().removeClip(show.id, show.cells[0].id)

    expect(useShowStore.getState().shows[0].cells.map((clip) => clip.id)).toEqual([show.cells[1].id])
  })

  it('places a replacement clip and persists it through the provider (#430)', async () => {
    const show = createDefaultShow('show-430-place', 'Clip placement', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    await useShowStore.getState().removeClip(show.id, 'cell-1')
    const placed = await useShowStore.getState().placeClip(show.id, 'zone-1', 'scene-1', {
      pattern: { kind: 'stock', id: 'TestPattern2D' },
      patternName: 'TestPattern2D',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(placed).toMatchObject({ id: 'cell-3', zoneId: 'zone-1', sceneId: 'scene-1' })
    expect(useShowStore.getState().shows[0].cells).toContainEqual(expect.objectContaining({
      id: 'cell-3',
      patternName: 'TestPattern2D',
    }))
  })

  it('persists an exact-zero clip time scale through the provider', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, { timeScale: 0 })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].cells[0].adaptations.timeScale).toBe(0)
  })

  it('persists a full-clip light shutter through the provider', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, {
      lightShutter: { rateHz: 12, duty: 0.4, phase: 0.2, clockBehavior: 'freeze' },
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].cells[0].adaptations.lightShutter).toEqual({
      rateHz: 12,
      duty: 0.4,
      phase: 0.2,
      clockBehavior: 'freeze',
    })
  })

  it('persists stepped-clock cadence independently from time scale and light shutter', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, {
      timeScale: 0.75,
      steppedClock: { stepMs: 125 },
      lightShutter: { rateHz: 8, duty: 0.4, phase: 0.2, clockBehavior: 'continue' },
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].cells[0].adaptations).toMatchObject({
      timeScale: 0.75,
      steppedClock: { stepMs: 125 },
      lightShutter: { rateHz: 8, duty: 0.4, phase: 0.2, clockBehavior: 'continue' },
    })
  })

  it('persists a per-cell private time offset', async () => {
    const show = createDefaultShow('show-1', 'Rounds', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellAdaptations(show.id, show.cells[0].id, { timeOffsetMs: 750 })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].cells[0].adaptations.timeOffsetMs).toBe(750)
  })

  it('normalizes legacy entry state and persists split Continue/Restart choices (#415)', async () => {
    const legacy = createDefaultShow('show-1', 'Split Show', 1)
    legacy.cells = legacy.cells.map(({ restartOnEntry: _restartOnEntry, ...cell }) => cell)
    const provider = memoryProvider([legacy])
    setPersonalContentProvider(provider)

    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].cells.every((cell) => cell.restartOnEntry === false)).toBe(true)

    await useShowStore.getState().splitAtTime(legacy.id, 10_000)
    const destination = useShowStore.getState().shows[0].cells.find((cell) => cell.sceneId === 'scene-3')!
    expect(destination.restartOnEntry).toBe(false)

    await useShowStore.getState().updateCellRestartOnEntry(legacy.id, destination.id, true)
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === destination.id)?.restartOnEntry).toBe(true)
  })

  it('migrates and persists first-class transition boundary edits by id (#416)', async () => {
    const legacy = createDefaultShow('show-1', 'Legacy boundaries', 1)
    delete legacy.transitions
    const provider = memoryProvider([legacy])
    setPersonalContentProvider(provider)

    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      id: 'transition-scene-1',
      kind: 'crossfade',
      easing: { curve: 'linear' },
    })

    await useShowStore.getState().updateBoundaryTransition(legacy.id, 'transition-scene-1', {
      kind: 'wipe',
      durationMs: 2500,
      easing: 'ease-out',
      feather: 0.25,
      propertyTransitions: {
        timeScale: { fromByCellId: { 'cell-2': 1.5 }, durationMs: 1500, easing: 'ease-in' },
        brightness: { fromByCellId: { 'cell-2': 1 }, durationMs: 800, easing: 'ease-out' },
      },
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      id: 'transition-scene-1',
      kind: 'wipe',
      durationMs: 2500,
      easing: { curve: 'quadratic', direction: 'out' },
      feather: 0.25,
      propertyTransitions: {
        timeScale: {
          fromByCellId: { 'cell-2': 1.5 },
          durationMs: 1500,
          easing: { curve: 'quadratic', direction: 'in' },
        },
        brightness: {
          fromByCellId: { 'cell-2': 1 },
          durationMs: 800,
          easing: { curve: 'quadratic', direction: 'out' },
        },
      },
    })
  })

  it('persists public Pattern control targets and their shared boundary curve (#419)', async () => {
    const show = createDefaultShow('show-419', 'Control persistence', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellControlTarget(show.id, 'cell-1', 'sliderSpeed', 0.2)
    await useShowStore.getState().updateCellControlTarget(show.id, 'cell-2', 'sliderSpeed', 0.8)
    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      propertyTransitions: {
        controls: { sliderSpeed: { fromByCellId: { 'cell-2': 0.2 }, durationMs: 1200, easing: 'ease-in' } },
      },
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    const loaded = useShowStore.getState().shows[0]
    expect(loaded.cells.map((cell) => cell.controlTargets?.sliderSpeed)).toEqual([0.2, 0.8])
    expect(loaded.transitions?.[0].propertyTransitions?.controls?.sliderSpeed).toEqual({
      fromByCellId: { 'cell-2': 0.2 },
      durationMs: 1200,
      easing: { curve: 'quadratic', direction: 'in' },
    })
  })

  it('persists and reloads an ordered headless Effect stack (#444)', async () => {
    const show = createDefaultShow('show-444', 'Effect persistence', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateCellEffects(show.id, 'cell-1', [
      { id: 'move', kind: 'translate', x: 0.25, y: -0.1 },
      { id: 'fade', kind: 'opacity', opacity: 0.6 },
      { id: 'wrap', kind: 'wrap' },
    ])
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].cells[0].effects).toEqual([
      { id: 'move', kind: 'translate', x: 0.25, y: -0.1 },
      { id: 'fade', kind: 'opacity', opacity: 0.6 },
      { id: 'wrap', kind: 'wrap' },
    ])
  })

  it('persists and reloads a Fade-through-color boundary (#445)', async () => {
    const show = createDefaultShow('show-445', 'Fade color persistence', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'fade-color',
      durationMs: 1700,
      easing: { curve: 'sine', direction: 'in-out' },
      color: '#F0A020',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'fade-color',
      durationMs: 1700,
      easing: { curve: 'sine', direction: 'in-out' },
      color: '#f0a020',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'fade-color',
      durationMs: 1700,
      color: '#f0a020',
    })
  })

  it('persists and reloads a directional Wipe boundary (#446)', async () => {
    const show = { ...createDefaultShow('show-446', 'Directional wipe persistence', 1), stageMapId: 'plane' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'wipe',
      durationMs: 1500,
      easing: { curve: 'cubic', direction: 'in-out' },
      direction: 1.875,
      feather: 0.12,
      edgePolicy: 'dither',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'wipe', direction: 0.875, feather: 0.12, edgePolicy: 'dither',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'wipe', direction: 0.875, feather: 0.12, edgePolicy: 'dither',
    })
  })

  it('persists and reloads a Block Dissolve boundary (#447)', async () => {
    const show = createDefaultShow('show-447', 'Block dissolve persistence', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'dither', durationMs: 1800,
      easing: { curve: 'quadratic', direction: 'out' },
      dissolveVariant: 'block', seed: 1234, blockSize: 12, edgePolicy: 'dither',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'dither', dissolveVariant: 'block', seed: 1234, blockSize: 12, edgePolicy: 'dither',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'dither', dissolveVariant: 'block', seed: 1234, blockSize: 12, edgePolicy: 'dither',
    })
  })

  it('persists and reloads an explicit Box reveal mode (#448)', async () => {
    const show = { ...createDefaultShow('show-448', 'Box reveal persistence', 1), stageMapId: 'plane' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'portal', durationMs: 1900,
      revealMode: 'shrink-outgoing', shape: 'box', aspect: 1.75, rotation: 0.125,
      centerX: 0.4, centerY: 0.6, scale: 1.2, feather: 0.1, edgePolicy: 'blend',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'portal', revealMode: 'shrink-outgoing', invert: true,
      shape: 'box', aspect: 1.75, rotation: 0.125, edgePolicy: 'blend',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      revealMode: 'shrink-outgoing', shape: 'box', aspect: 1.75,
    })
  })

  it('persists and reloads a Content Shrink motion transition (#449)', async () => {
    const show = { ...createDefaultShow('show-449', 'Motion persistence', 1), stageMapId: 'plane' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'motion', durationMs: 1700, motionVariant: 'content-shrink',
      anchorX: 0.2, anchorY: 0.8, contentScale: 0.3,
      addressPolicy: 'wrap', edgePolicy: 'blend',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'motion', motionVariant: 'content-shrink', anchorX: 0.2, anchorY: 0.8,
      contentScale: 0.3, addressPolicy: 'wrap', edgePolicy: 'blend',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'motion', motionVariant: 'content-shrink', contentScale: 0.3,
    })
  })

  it('persists and reloads a Clock Wipe variant (#450)', async () => {
    const show = { ...createDefaultShow('show-450', 'Clock wipe persistence', 1), stageMapId: 'plane' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'wipe', durationMs: 1400, wipeVariant: 'clock',
      centerX: 0.3, centerY: 0.7, phase: 0.125, clockwise: false,
      feather: 0.08, edgePolicy: 'dither',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'wipe', wipeVariant: 'clock', centerX: 0.3, centerY: 0.7,
      phase: 0.125, clockwise: false, edgePolicy: 'dither',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'wipe', wipeVariant: 'clock', phase: 0.125,
    })
  })

  it('persists and reloads a Soft Threshold Dissolve (#451)', async () => {
    const show = { ...createDefaultShow('show-451', 'Soft dissolve persistence', 1), stageMapId: 'plane' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'dither', durationMs: 1600, dissolveVariant: 'soft-threshold',
      seed: 29, scale: 7.5, softness: 0.18, edgePolicy: 'blend',
    })
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      kind: 'dither', dissolveVariant: 'soft-threshold', seed: 29,
      scale: 7.5, softness: 0.18, edgePolicy: 'blend',
    })
    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'dither', dissolveVariant: 'soft-threshold', scale: 7.5, softness: 0.18,
    })
  })

  it('persists a wipe feather width through the provider', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateTransition(show.id, 'scene-1', 'wipe', 2000, 0.3)
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'wipe',
      feather: 0.3,
    })
  })

  it('persists portal geometry and feather policy through the provider', async () => {
    const show = { ...createDefaultShow('show-1', 'Portal', 1), stageMapId: 'plane' }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateTransition(
      show.id,
      'scene-1',
      'portal',
      3000,
      0.2,
      { centerX: 0.4, centerY: 0.6, invert: false, featherPolicy: 'dither' },
    )
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      kind: 'portal',
      feather: 0.2,
      centerX: 0.4,
      centerY: 0.6,
      invert: false,
      featherPolicy: 'dither',
    })
  })

  it('preserves rapid partial portal edits', async () => {
    const show = { ...createDefaultShow('show-1', 'Portal', 1), stageMapId: 'plane' }
    show.scenes[0].transitionOut = {
      kind: 'portal',
      durationMs: 2000,
      feather: 0.12,
      centerX: 0.5,
      centerY: 0.5,
      invert: false,
      featherPolicy: 'dither',
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    const first = useShowStore.getState().updateTransition(show.id, 'scene-1', 'portal', 2000, 0.12, { centerX: 0.35 })
    const second = useShowStore.getState().updateTransition(show.id, 'scene-1', 'portal', 2000, 0.12, { featherPolicy: 'blend' })
    const third = useShowStore.getState().updateTransition(show.id, 'scene-1', 'portal', 2000, 0.12, { invert: true })
    await Promise.all([first, second, third])

    expect(useShowStore.getState().shows[0].scenes[0].transitionOut).toMatchObject({
      centerX: 0.35,
      centerY: 0.5,
      invert: true,
      featherPolicy: 'blend',
    })
  })

  it('edits show-local zones and creates a show from controller zones', async () => {
    setPersonalContentProvider(memoryProvider())

    const show = await useShowStore.getState().createNewShow()
    await useShowStore.getState().addScene(show.id)
    expect(useShowStore.getState().shows[0].scenes).toHaveLength(3)

    await useShowStore.getState().removeScene(show.id, 'scene-3')
    expect(useShowStore.getState().shows[0].scenes.map((scene) => scene.id)).toEqual(['scene-1', 'scene-2'])

    await useShowStore.getState().addZone(show.id)
    const withZone = useShowStore.getState().shows[0]
    const addedZone = withZone.zones[1]

    await useShowStore.getState().updateZone(show.id, addedZone.id, {
      name: 'doorframe',
      nominalPixelCount: 24,
    })
    await useShowStore.getState().spanCellZones(show.id, show.cells[0].id, 2)

    expect(useShowStore.getState().shows[0].zones[1]).toMatchObject({
      name: 'doorframe',
      nominalPixelCount: 24,
    })
    expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === show.cells[0].id)).toMatchObject({
      zoneSpan: 2,
    })

    const seeded = await useShowStore.getState().createShowFromController({
      id: 'controller-1',
      name: 'North Arch',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [
        { id: 'left', name: 'arch-left', ranges: [{ start: 0, end: 119 }] },
        { id: 'right', name: 'arch-right', ranges: [{ start: 120, end: 239 }] },
      ],
      updatedAt: 1,
    })

    expect(seeded.targetControllerProfileId).toBe('controller-1')
    expect(seeded.zones.map((zone) => [zone.name, zone.nominalPixelCount])).toEqual([
      ['arch-left', 120],
      ['arch-right', 120],
    ])
    expect(useShowStore.getState().activeShowId).toBeNull()
  })

  it('seeds and persists a show stage map from controller imports', async () => {
    setPersonalContentProvider(memoryProvider())
    useMapStore.setState({
      userMaps: [
        {
          id: 'map-old',
          name: 'Old import',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0]],
          importMetadata: {
            kind: 'controller',
            controllerName: 'North Arch',
            deviceId: 'device-1',
            pixelCount: 1,
            importedAt: 100,
            normalization: 'device-fill-normalized',
          },
          updatedAt: 100,
        },
        {
          id: 'map-new',
          name: 'New import',
          dim: 2,
          generator: 'custom',
          params: {},
          points: [[0, 0], [1, 0]],
          importMetadata: {
            kind: 'controller',
            controllerName: 'North Arch',
            deviceId: 'device-1',
            pixelCount: 2,
            importedAt: 200,
            normalization: 'device-fill-normalized',
          },
          updatedAt: 200,
        },
      ],
    })

    const seeded = await useShowStore.getState().createShowFromController({
      id: 'controller-1',
      name: 'North Arch',
      deviceId: 'device-1',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      zones: [{ id: 'left', name: 'arch-left', ranges: [{ start: 0, end: 1 }] }],
      updatedAt: 1,
    })

    expect(seeded.stageMapId).toBe('map-new')

    await useShowStore.getState().updateStageMap(seeded.id, null)
    expect(useShowStore.getState().shows[0].stageMapId).toBeNull()
  })
})
