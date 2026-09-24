import { showInitialState, useShowStore } from './showStore'
import { mapInitialState, useMapStore } from './mapStore'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { STOCK_SHOWS_V2, stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { editShowTransitionV2 } from '@/engine/showTransitionsV2'
import { createDefaultShow, splitShowAtTime } from '@/engine/showModel'
import { validateInstallationCoverage } from '@/engine/showInstallationCoverage'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import {
  moveShowClipAtGlobalTime,
  resizeShowClipAtGlobalTime,
  splitShowClipAtGlobalTime,
} from '@/engine/showTimelineClipAuthoring'
import { projectShowUnifiedTimeline } from '@/engine/showUnifiedTimelineProjection'
import { expectAcceptedShowAuthoringEdit } from '@/test/showAuthoringContract'
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

function memoryProviderV2(seed: ShowRecordV2[] = []) {
  const stored = [...seed]
  const deleted: string[] = []
  const provider = {
    id: 'memory-v2-test',
    listShows: async () => [],
    listShowDocumentsV2: async () => stored.map(record => structuredClone(record)),
    createShowV2: async (record: ShowRecordV2) => { stored.push(structuredClone(record)) },
    replaceShowV2: async (id: string, record: ShowRecordV2) => {
      const index = stored.findIndex(candidate => candidate.id === id)
      if (index < 0) throw new Error(`No stored v2 Show "${id}".`)
      stored[index] = structuredClone(record)
    },
    deleteShow: async (id: string) => {
      deleted.push(id)
      const index = stored.findIndex(candidate => candidate.id === id)
      if (index >= 0) stored.splice(index, 1)
    },
    setLastActive: async () => {},
  } as unknown as PersonalContentProvider
  setPersonalContentProvider(provider)
  return { provider, stored, deleted }
}

function gateV2(enabled: boolean): void {
  window.history.replaceState({}, '', enabled ? '/studio?show-v2-editor=1' : '/studio')
}

function v2ProviderForPort(seedV2: ShowRecordV2[] = []) {
  const stored = [...seedV2.map((record) => structuredClone(record))]
  const provider = {
    id: 'memory-v2-port',
    listShows: async () => [],
    listShowDocumentsV2: async () => stored.map((record) => structuredClone(record)),
    createShowV2: async (record: ShowRecordV2) => { stored.push(structuredClone(record)) },
    replaceShowV2: async (id: string, record: ShowRecordV2) => {
      const index = stored.findIndex((candidate) => candidate.id === id)
      if (index < 0) throw new Error(`No stored v2 Show "${id}".`)
      stored[index] = structuredClone(record)
    },
    deleteShow: async (id: string) => {
      const index = stored.findIndex((candidate) => candidate.id === id)
      if (index >= 0) stored.splice(index, 1)
    },
  } as unknown as PersonalContentProvider
  setPersonalContentProvider(provider)
  return { stored, provider: provider as unknown as PersonalContentProvider & { listShowDocumentsV2: () => Promise<ShowRecordV2[]>; replaceShowV2: (id: string, record: ShowRecordV2) => Promise<void> } }
}

function deferred(): {
  promise: Promise<void>
  resolve: () => void
  reject: (cause?: unknown) => void
} {
  let resolve!: () => void
  let reject!: (cause?: unknown) => void
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function personalShow(showId: string): ShowRecord {
  return useShowStore.getState().shows.find((show) => show.id === showId)!
}

function persistedShow(record: ShowRecord): Record<string, unknown> {
  return {
    ...record,
    composition: record.composition ?? null,
    outputEffects: record.outputEffects,
    targetControllerProfileId: record.targetControllerProfileId,
    importMetadata: record.importMetadata,
  }
}

void projectShowUnifiedTimeline;
void personalShow;
void persistedShow;

beforeEach(() => {
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  useMapStore.setState(mapInitialState)
})

afterEach(() => gateV2(false))

describe('showStore (#318)', () => {
  /* #1042 P2c-1a deletions (COVERED/REPRESENTATION): each deleted v1 test is covered by the cited v2 test.
   * - groups each Show edit as one session transaction with undo and redo (#470) [COVERED] -> src/store/showV2PilotStore.test.ts:221
   * - restores the previous normalized Show and history when persistence fails (#470) [COVERED] -> src/store/showV2PilotStore.test.ts:505
   * - duplicates a personal Show as a persisted copy with a fresh identity (#794) [COVERED] -> src/store/showStoreV2RailParity.test.ts:100
   * - duplicates an explicit source record when the caller displays transient state (#794) [COVERED] -> src/store/showStoreV2RailParity.test.ts:132
   * - resolves a superseded failed write without rollback or failure notice (#792) [COVERED] -> src/store/showV2PilotStore.test.ts:540
   * - records a save failure alongside the rollback and clears it on dismiss (#792) [COVERED] -> src/store/showV2PilotStore.test.ts:667
   * - retries the failed save once persistence recovers (#792) [COVERED] -> src/store/showV2PilotStore.test.ts:667
   * - persists and reloads the optional Scene composition sidecar [REPRESENTATION] -> v1 record/projection or retired owner only
   */
  it('adds an imported Show through the normal durable creation path', async () => {
    // Ported to v2: durable creation via addImportedShowV2; converter preserves id/name/importMetadata (showRecordV1ToV2.ts:421).
    const source: ShowRecord = {
      ...transitionV1Show('crossfade'),
      id: 'show-imported',
      name: 'Imported Show',
      updatedAt: 100,
      importMetadata: {
        kind: 'show-file',
        originalShowId: 'show-original',
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        importedAt: 100,
      },
    }
    const converted = convertShowRecordV1ToV2(source)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const storedV2: ShowRecordV2[] = []
    setPersonalContentProvider({
      id: 'memory-v2-import',
      listShowDocumentsV2: async () => storedV2.map((record) => structuredClone(record)),
      createShowV2: async (record: ShowRecordV2) => { storedV2.push(structuredClone(record)) },
      replaceShowV2: async (id: string, record: ShowRecordV2) => {
        const index = storedV2.findIndex((candidate) => candidate.id === id)
        if (index < 0) throw new Error(`No stored v2 Show "${id}".`)
        storedV2[index] = structuredClone(record)
      },
      deleteShow: async (id: string) => {
        const index = storedV2.findIndex((candidate) => candidate.id === id)
        if (index >= 0) storedV2.splice(index, 1)
      },
    } as unknown as PersonalContentProvider)

    await useShowStore.getState().addImportedShowV2(converted.record)

    expect(useShowStore.getState().showV2Pilots[converted.record.id]).toEqual(converted.record)
    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toContain(converted.record.id)
    expect(storedV2).toEqual([converted.record])
  })


  it('serializes full-record persistence so rapid inspector edits cannot land out of order', async () => {
    // Ported to v2: full-record persistence via updateShowV2Pilot/replaceShowV2; converter preserves id (showRecordV1ToV2.ts:421).
    const show = { ...transitionV1Show('crossfade'), id: 'show-write-order', name: 'Write order', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const writes: Array<{ name: string }> = []
    let releaseFirst!: () => void
    const firstPending = new Promise<void>((resolve) => { releaseFirst = resolve })
    let stored = structuredClone(converted.record)
    setPersonalContentProvider({
      id: 'memory-v2-write-order',
      listShowDocumentsV2: async () => [structuredClone(stored)],
      createShowV2: async () => {},
      replaceShowV2: async (_id: string, record: ShowRecordV2) => {
        writes.push({ name: record.name })
        if (writes.length === 1) await firstPending
        stored = structuredClone(record)
      },
      deleteShow: async () => {},
    } as unknown as PersonalContentProvider)
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const base = useShowStore.getState().showV2Pilots[converted.record.id]

    const first = useShowStore.getState().updateShowV2Pilot(converted.record.id, { ...base, name: 'First' })
    const secondBase = useShowStore.getState().showV2Pilots[converted.record.id]
    const second = useShowStore.getState().updateShowV2Pilot(converted.record.id, { ...secondBase, name: 'Second' })
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(writes.map((write) => write.name)).toEqual(['First'])
    releaseFirst()
    await Promise.all([first, second])
    expect(writes.map((write) => write.name)).toEqual(['First', 'Second'])
  })


  it('saves a built-in Show copy from its session draft, not the pristine catalogue (#794)', async () => {
    // Ported to v2: built-in lesson opens as a session draft; duplicateShowV2Row copies the open working record (showStore.ts:1008).
    const stock = stockShowV2ById(STOCK_SHOWS_V2[0].id)!
    const storedV2: ShowRecordV2[] = []
    setPersonalContentProvider({
      id: 'memory-v2-builtin-copy',
      listShowDocumentsV2: async () => storedV2.map((record) => structuredClone(record)),
      createShowV2: async (record: ShowRecordV2) => { storedV2.push(structuredClone(record)) },
      replaceShowV2: async (id: string, record: ShowRecordV2) => {
        const index = storedV2.findIndex((candidate) => candidate.id === id)
        if (index < 0) throw new Error(`No stored v2 Show "${id}".`)
        storedV2[index] = structuredClone(record)
      },
      deleteShow: async () => {},
    } as unknown as PersonalContentProvider)

    const opened = await useShowStore.getState().openShowV2Pilot(stock.id)
    expect(opened.status).toBe('ready')
    if (opened.status !== 'ready') return
    await useShowStore.getState().updateShowV2Pilot(stock.id, { ...opened.record, name: 'Authored on top' })

    const copy = await useShowStore.getState().duplicateShowV2Row(stock.id)

    expect(copy).not.toBeNull()
    expect(copy!.id).not.toBe(stock.id)
    expect(copy!.name).toBe('Authored on top copy')
    expect(copy!.composition).toEqual(useShowStore.getState().showV2Pilots[stock.id].composition)
    const persisted = storedV2.find((candidate) => candidate.id === copy!.id)
    expect(persisted?.composition).toEqual(copy!.composition)
  })


  it('does not let an in-flight hydration clobber a fresh duplicate (#794)', async () => {
    // Ported to v2: hydration reads listShowDocumentsV2; duplicateShowV2Row waits for it, so the stale snapshot cannot drop the copy (showStore.ts:1008).
    const seed = { ...transitionV1Show('crossfade'), id: 'show-hydration-seed', name: 'Seeded', updatedAt: 1 }
    const convertedSeed = convertShowRecordV1ToV2(seed)
    if (convertedSeed.status !== 'converted') throw new Error(JSON.stringify(convertedSeed.issues))
    const { provider } = v2ProviderForPort([convertedSeed.record])
    const realList = provider.listShowDocumentsV2
    let releaseList!: () => void
    const listGate = new Promise<void>((resolve) => { releaseList = resolve })
    provider.listShowDocumentsV2 = async () => {
      const snapshot = await (realList as () => Promise<ShowRecordV2[]>)()
      await listGate
      return snapshot
    }

    const hydration = useShowStore.getState().loadShows()
    await Promise.resolve()
    const duplication = useShowStore.getState().duplicateShowV2Row(convertedSeed.record.id)
    await Promise.resolve()
    releaseList()
    await hydration
    const copy = await duplication

    expect(copy).not.toBeNull()
    const ids = useShowStore.getState().showV2Rows.map((candidate) => candidate.id)
    expect(ids).toContain(convertedSeed.record.id)
    expect(ids).toContain(copy!.id)
    expect(ids).toHaveLength(2)
  })

  it('updateShow itself still rejects for callers that gate on persistence (#792)', async () => {
    // Ported to v2: updateShowV2Pilot rejects when replaceShowV2 fails; pilot rolls back with showV2SaveFailure (showStore.ts:488).
    const show = { ...transitionV1Show('crossfade'), id: 'show-save-primitive', name: 'Save primitive', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const stored = structuredClone(converted.record)
    setPersonalContentProvider({
      id: 'memory-v2-save-primitive',
      listShowDocumentsV2: async () => [structuredClone(stored)],
      createShowV2: async () => {},
      replaceShowV2: async () => { throw new Error('offline') },
      deleteShow: async () => {},
    } as unknown as PersonalContentProvider)
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const base = useShowStore.getState().showV2Pilots[converted.record.id]

    await expect(useShowStore.getState().updateShowV2Pilot(converted.record.id, { ...base, name: 'Primitive edit' })).rejects.toThrow('offline')
    expect(useShowStore.getState().showV2Pilots[converted.record.id].name).toBe('Save primitive')
    expect(useShowStore.getState().showV2SaveFailure?.showId).toBe(converted.record.id)
  })


  it('keeps a later edit and its complete history when a superseded undo save fails (#948)', async () => {
    // Ported to v2: undo persistence via undoShowV2Pilot/updateShowV2Pilot; converter preserves id (showRecordV1ToV2.ts:421).
    // v2 restamps via nextShowOrderingStamp (Date.now), so explicit updatedAt inputs are ignored but kept for structure.
    const show = { ...transitionV1Show('crossfade'), id: 'show-undo-overlap', name: 'Undo overlap', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id
    await useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Saved edit', updatedAt: 2 })

    const realReplace = provider.replaceShowV2
    const undoStarted = deferred()
    const undoWrite = deferred()
    let writes = 0
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      writes += 1
      if (writes === 1) {
        undoStarted.resolve()
        await undoWrite.promise
      }
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }

    const undo = useShowStore.getState().undoShowV2Pilot(id)
    await undoStarted.promise
    const undone = useShowStore.getState().showV2Pilots[id]
    const later = useShowStore.getState().updateShowV2Pilot(id, { ...undone, name: 'Later accepted edit', updatedAt: 0 })
    const acceptedRecord = structuredClone(useShowStore.getState().showV2Pilots[id])
    const acceptedHistory = structuredClone(useShowStore.getState().showV2Histories[id])

    undoWrite.reject(new Error('undo offline'))

    await expect(undo).resolves.toBe(true)
    await expect(later).resolves.toBeUndefined()
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(acceptedRecord)
    expect(useShowStore.getState().showV2Histories[id]).toEqual(acceptedHistory)
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(stored).toContainEqual(acceptedRecord)
  })

  it('keeps a later edit and its complete history when a superseded redo save fails (#948)', async () => {
    // Ported to v2: redo persistence via redoShowV2Pilot/updateShowV2Pilot; converter preserves id (showRecordV1ToV2.ts:421).
    const show = { ...transitionV1Show('crossfade'), id: 'show-redo-overlap', name: 'Redo overlap', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id
    await useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Saved edit', updatedAt: 2 })
    await expect(useShowStore.getState().undoShowV2Pilot(id)).resolves.toBe(true)

    const realReplace = provider.replaceShowV2
    const redoStarted = deferred()
    const redoWrite = deferred()
    let writes = 0
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      writes += 1
      if (writes === 1) {
        redoStarted.resolve()
        await redoWrite.promise
      }
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }

    const redo = useShowStore.getState().redoShowV2Pilot(id)
    await redoStarted.promise
    const redone = useShowStore.getState().showV2Pilots[id]
    const later = useShowStore.getState().updateShowV2Pilot(id, { ...redone, name: 'Later accepted edit', updatedAt: 0 })
    const acceptedRecord = structuredClone(useShowStore.getState().showV2Pilots[id])
    const acceptedHistory = structuredClone(useShowStore.getState().showV2Histories[id])

    redoWrite.reject(new Error('redo offline'))

    await expect(redo).resolves.toBe(true)
    await expect(later).resolves.toBeUndefined()
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(acceptedRecord)
    expect(useShowStore.getState().showV2Histories[id]).toEqual(acceptedHistory)
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(stored).toContainEqual(acceptedRecord)
  })

  it('restamps a stale candidate so a later failure restores the saved candidate and matching history (#948)', async () => {
    // Ported to v2: v2 restamps via nextShowOrderingStamp(Date.now), so the stale input is ignored but the saved stamp still exceeds 100.
    const show = { ...transitionV1Show('crossfade'), id: 'show-stale-candidate', name: 'Captured base', updatedAt: 10 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    await useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Manual save', updatedAt: 100 })
    await useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Agent candidate', updatedAt: 1 })
    const savedCandidate = structuredClone(useShowStore.getState().showV2Pilots[id])
    const savedHistory = structuredClone(useShowStore.getState().showV2Histories[id])
    expect(savedCandidate.updatedAt).toBeGreaterThan(100)

    provider.replaceShowV2 = async () => { throw new Error('later offline') }
    const failed = useShowStore.getState().updateShowV2Pilot(id, { ...savedCandidate, name: 'Later failed edit', updatedAt: 101 })
    const failedCandidate = structuredClone(useShowStore.getState().showV2Pilots[id])

    await expect(failed).rejects.toThrow('later offline')
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(savedCandidate)
    expect(useShowStore.getState().showV2Histories[id]).toEqual(savedHistory)
    expect(useShowStore.getState().showV2SaveFailure).toEqual({ showId: id, record: failedCandidate })
    expect(stored).toContainEqual(savedCandidate)
  })

  it('preserves the durable pair and latest failure across consecutive failed retries (#948)', async () => {
    // Ported to v2: consecutive failures via replaceShowV2/retryShowV2SaveFailure; converter preserves id (showRecordV1ToV2.ts:421).
    const show = { ...transitionV1Show('crossfade'), id: 'show-consecutive-failures-948', name: 'Durable base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let offline = true
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      if (offline) throw new Error('offline')
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id
    const baseRecord = structuredClone(useShowStore.getState().showV2Pilots[id])

    const first = useShowStore.getState().updateShowV2Pilot(id, { ...baseRecord, name: 'Retry me', updatedAt: 2 })
    const firstCandidate = structuredClone(useShowStore.getState().showV2Pilots[id])
    await expect(first).rejects.toThrow('offline')
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(baseRecord)
    expect(useShowStore.getState().showV2Histories[id] ?? { past: [], future: [] }).toEqual({ past: [], future: [] })
    expect(useShowStore.getState().showV2SaveFailure).toEqual({ showId: id, record: firstCandidate })

    const second = useShowStore.getState().retryShowV2SaveFailure()
    const secondCandidate = structuredClone(useShowStore.getState().showV2Pilots[id])
    await second
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(baseRecord)
    expect(useShowStore.getState().showV2Histories[id] ?? { past: [], future: [] }).toEqual({ past: [], future: [] })
    expect(useShowStore.getState().showV2SaveFailure).toEqual({ showId: id, record: secondCandidate })

    offline = false
    const recovery = useShowStore.getState().retryShowV2SaveFailure()
    const recoveredRecord = structuredClone(useShowStore.getState().showV2Pilots[id])
    const recoveredHistory = structuredClone(useShowStore.getState().showV2Histories[id])
    await recovery
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(recoveredRecord)
    expect(useShowStore.getState().showV2Histories[id]).toEqual(recoveredHistory)
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(stored).toContainEqual(recoveredRecord)
  })

  // v2 contract (#1115): workspace reload retires the pilot; the write completes and the reopen reads the provider (show-state-history-persistence.md:299-305).
  it('keeps an accepted edit durable when workspace reload retires its pilot mid-save (#948, #1115)', async () => {
    const show = { ...transitionV1Show('crossfade'), id: 'show-hydration-during-save-948', name: 'Hydration base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    const writeStarted = deferred()
    const releaseWrite = deferred()
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      writeStarted.resolve()
      await releaseWrite.promise
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    const edit = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Accepted edit', updatedAt: 2 })
    const acceptedRecord = structuredClone(useShowStore.getState().showV2Pilots[id])
    await writeStarted.promise
    const hydration = useShowStore.getState().loadShows()
    await hydration
    expect(useShowStore.getState().showV2Pilots[id]).toBeUndefined()
    releaseWrite.resolve()
    await expect(edit).resolves.toBeUndefined()

    await useShowStore.getState().openShowV2Pilot(id)
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(acceptedRecord)
    expect(useShowStore.getState().showV2Histories[id]).toEqual({ past: [], future: [] })
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(stored).toContainEqual(acceptedRecord)
  })

  it('retires a failed retry when a later edit is accepted before its save settles (#948)', async () => {
    // Ported to v2: a later accepted v2 edit retires a failed retry; retry becomes a no-op once failure clears.
    const show = { ...transitionV1Show('crossfade'), id: 'show-retry-after-edit-948', name: 'Retry base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let offline = true
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      if (offline) throw new Error('offline')
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id
    await expect(useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Failed candidate', updatedAt: 2 })).rejects.toThrow('offline')
    expect(useShowStore.getState().showV2SaveFailure?.record.name).toBe('Failed candidate')

    offline = false
    const laterStarted = deferred()
    const releaseLater = deferred()
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      laterStarted.resolve()
      await releaseLater.promise
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    const later = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Later accepted edit', updatedAt: 3 })
    const laterRecord = structuredClone(useShowStore.getState().showV2Pilots[id])
    const laterHistory = structuredClone(useShowStore.getState().showV2Histories[id])
    await laterStarted.promise

    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    await useShowStore.getState().retryShowV2SaveFailure()
    releaseLater.resolve()
    await expect(later).resolves.toBeUndefined()

    expect(useShowStore.getState().showV2Pilots[id]).toEqual(laterRecord)
    expect(useShowStore.getState().showV2Histories[id]).toEqual(laterHistory)
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(stored).toContainEqual(laterRecord)
  })

  it('orders deletion after an in-flight save and clears all session recovery state (#948)', async () => {
    // Ported to v2: removeShow orders after an in-flight replaceShowV2 and clears v2 session state (showStore.ts:972).
    const show = { ...transitionV1Show('crossfade'), id: 'show-delete-in-flight-948', name: 'Delete base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    const writeStarted = deferred()
    const releaseWrite = deferred()
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      writeStarted.resolve()
      await releaseWrite.promise
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    const edit = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'In flight', updatedAt: 2 })
    await writeStarted.promise
    const removal = useShowStore.getState().removeShow(id)
    releaseWrite.resolve()

    await expect(edit).resolves.toBeUndefined()
    await expect(removal).resolves.toBeUndefined()
    expect(useShowStore.getState().showV2Pilots[id]).toBeUndefined()
    expect(useShowStore.getState().showV2Rows).toEqual([])
    expect(useShowStore.getState().showV2Histories[id]).toBeUndefined()
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
    expect(stored).toEqual([])
  })

  it('rolls consecutive failed writes back to the last persisted record (#792)', async () => {
    // Ported to v2: rapid v2 edits serialize; a superseded first write resolves while the failed second rolls back to baseline.
    const show = { ...transitionV1Show('crossfade'), id: 'show-chained-failure', name: 'Chained base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let offline = true
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      if (offline) throw new Error('offline')
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id
    const baseName = useShowStore.getState().showV2Pilots[id].name

    const first = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'First', updatedAt: 2 })
    const second = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Second', updatedAt: 3 })

    await expect(first).resolves.toBeUndefined()
    await expect(second).rejects.toThrow('offline')

    expect(useShowStore.getState().showV2Pilots[id].name).toBe(baseName)
    expect(useShowStore.getState().showV2Histories[id]?.past ?? []).toHaveLength(0)
    expect(useShowStore.getState().showV2SaveFailure?.record.name).toBe('Second')

    offline = false
    await useShowStore.getState().retryShowV2SaveFailure()
    expect(useShowStore.getState().showV2Pilots[id].name).toBe('Second')
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
  })

  // v2 contract (#1115): workspace reload retires the pilot; the write completes and the reopen reads the provider (show-state-history-persistence.md:299-305).
  it('resets undo history on workspace reload and rolls a later failed save back to the reopened record (#792, #1115)', async () => {
    const show = { ...transitionV1Show('crossfade'), id: 'show-rehydrated-history', name: 'Rehydrated', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let offline = false
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      if (offline) throw new Error('offline')
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    await useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Saved edit' })
    // Navigating away and back re-hydrates from the provider mid-session.
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(id)
    expect(useShowStore.getState().showV2Pilots[id].name).toBe('Saved edit')
    expect(useShowStore.getState().showV2Histories[id]?.past ?? []).toHaveLength(0)

    offline = true
    await expect(useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Lost edit' })).rejects.toThrow('offline')

    // The rollback returns to the reopened record with its reset history.
    expect(useShowStore.getState().showV2Pilots[id].name).toBe('Saved edit')
    expect(useShowStore.getState().showV2SaveFailure).not.toBeNull()
    await expect(useShowStore.getState().undoShowV2Pilot(id)).resolves.toBe(false)
  })

  // v2 contract (#1115): workspace reload retires the pilot; the write completes and the reopen reads the provider (show-state-history-persistence.md:299-305).
  it('reopens the saved record with empty history when loadShows races an in-flight save (#792, #1115)', async () => {
    const show = { ...transitionV1Show('crossfade'), id: 'show-race-history', name: 'Race base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let releaseWrite!: () => void
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve })
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
      // Durable before the promise resolves, like a response in flight.
      await writeGate
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    const edit = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Saved edit' })
    await Promise.resolve()
    await Promise.resolve()
    const hydration = useShowStore.getState().loadShows()
    await hydration
    expect(useShowStore.getState().showV2Pilots[id]).toBeUndefined()
    releaseWrite()
    await edit

    await useShowStore.getState().openShowV2Pilot(id)
    expect(useShowStore.getState().showV2Pilots[id].name).toBe('Saved edit')
    expect(useShowStore.getState().showV2Histories[id]?.past ?? []).toHaveLength(0)
    await expect(useShowStore.getState().undoShowV2Pilot(id)).resolves.toBe(false)
  })

  // v2 contract (#1115): workspace reload retires the pilot; the write completes and the reopen reads the provider (show-state-history-persistence.md:299-305).
  it('reopens whatever the provider holds after a reload races an older write (#792, #1115)', async () => {
    const show = { ...transitionV1Show('crossfade'), id: 'show-remote-newer', name: 'Remote base', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { stored, provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let releaseWrite!: () => void
    const writeGate = new Promise<void>((resolve) => { releaseWrite = resolve })
    let gateFirst = true
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
      if (gateFirst) {
        gateFirst = false
        await writeGate
      }
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    const edit = useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Mine' })
    await Promise.resolve()
    await Promise.resolve()
    // Another client saves a newer record while our response is in flight.
    const theirIdx = stored.findIndex((candidate) => candidate.id === id)
    stored[theirIdx] = { ...stored[theirIdx], name: 'Theirs', updatedAt: Date.now() + 60_000 }
    const hydration = useShowStore.getState().loadShows()
    await hydration
    expect(useShowStore.getState().showV2Pilots[id]).toBeUndefined()
    releaseWrite()
    await edit

    // The provider is the oracle: the reopen reads whichever write it kept,
    // with no history that undo could use to replay a superseded write.
    await useShowStore.getState().openShowV2Pilot(id)
    const expected = stored.find((candidate) => candidate.id === id)!
    expect(useShowStore.getState().showV2Pilots[id]).toEqual(expected)
    expect(useShowStore.getState().showV2Histories[id]?.past ?? []).toHaveLength(0)
    await expect(useShowStore.getState().undoShowV2Pilot(id)).resolves.toBe(false)
  })



  it('clears a stale save failure when a later save succeeds (#792)', async () => {
    // Ported to v2: a later successful v2 save clears showV2SaveFailure.
    const show = { ...transitionV1Show('crossfade'), id: 'show-save-recovery', name: 'Save recovery', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { provider } = v2ProviderForPort([converted.record])
    const realReplace = provider.replaceShowV2
    let offline = true
    provider.replaceShowV2 = async (pid: string, record: ShowRecordV2) => {
      if (offline) throw new Error('offline')
      await (realReplace as (a: string, b: ShowRecordV2) => Promise<void>)(pid, record)
    }
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id

    await expect(useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Lost edit' })).rejects.toThrow('offline')
    expect(useShowStore.getState().showV2SaveFailure).not.toBeNull()

    offline = false
    await useShowStore.getState().updateShowV2Pilot(id, { ...useShowStore.getState().showV2Pilots[id], name: 'Kept edit' })
    expect(useShowStore.getState().showV2SaveFailure).toBeNull()
  })


  it('persists and reloads a multi-Scene logical Clip edit sequence (#596)', async () => {
    const show = createDefaultShow('show-logical-sequence-persistence', 'Logical sequence persistence', 1)
    const zoneId = show.zones[0].id
    const authored: ShowCompositionV1 = {
      version: 1,
      patternInstances: [{
        id: 'instance-logical',
        pattern: { kind: 'stock', id: 'Rings' },
        patternName: 'Rings',
        time: { timeScale: 1, timeOffsetMs: 0 },
      }],
      scenes: show.scenes.map((scene, sceneIndex) => ({
        sceneId: scene.id,
        zones: [{
          zoneId,
          main: sceneIndex === 0
            ? [{
                id: 'logical-root',
                instanceId: 'instance-logical',
                startMs: 28_000,
                durationMs: 2_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }]
            : [{
                id: `logical-root--span-${scene.id}`,
                logicalClipId: 'logical-root',
                instanceId: 'instance-logical',
                startMs: 0,
                durationMs: 3_000,
                view: { mirror: false, phase: 0, brightness: 1 },
              }],
          overlays: [],
        }],
      })),
    }
    const owner = {
      kind: 'main' as const,
      sceneId: show.scenes[0].id,
      zoneId,
      placementId: 'logical-root',
    }
    const moved = expectAcceptedShowAuthoringEdit({
      show,
      composition: authored,
      edit: (input) => moveShowClipAtGlobalTime(show, input, {
        owner,
        target: { kind: 'main', zoneId, globalStartMs: 27_000 },
      }),
      assertProjection: (projection) => {
        const layers = projection.zones[0].layers
        expect(layers[layers.length - 1]?.clips[0]).toMatchObject({
          id: 'logical-root',
          startMs: 27_000,
        })
      },
      assertReferences: (result, original) => {
        expect(result.patternInstances).toEqual(original.patternInstances)
      },
    })
    const resized = expectAcceptedShowAuthoringEdit({
      show,
      composition: moved,
      edit: (input) => resizeShowClipAtGlobalTime(show, input, {
        owner,
        globalStartMs: 27_000,
        durationMs: 8_000,
      }),
      assertProjection: (projection) => {
        const layers = projection.zones[0].layers
        expect(layers[layers.length - 1]?.clips[0]).toMatchObject({
          id: 'logical-root',
          startMs: 27_000,
          endMs: 35_000,
        })
      },
      assertReferences: (result, original) => {
        expect(result.patternInstances).toEqual(original.patternInstances)
      },
    })
    const edited = expectAcceptedShowAuthoringEdit({
      show,
      composition: resized,
      edit: (input) => splitShowClipAtGlobalTime(show, input, {
        owner,
        globalTimeMs: 33_000,
        newPlacementId: 'logical-right',
      }),
      assertProjection: (projection) => {
        expect(projection.zones[0].layers
          .flatMap((layer) => layer.clips)
          .map((clip) => clip.id)
          .sort()).toEqual(['logical-right', 'logical-root'])
      },
      assertReferences: (result, original) => {
        expect(result.patternInstances).toEqual(original.patternInstances)
      },
    })

    // Ported persistence to v2: the v1 Clip sequence above still verifies the edit; the converted record persists via v2.
    // Converter assigns new v2 Clip ids (showRecordV1ToV2.ts:report.clipMappings), so v2 assertions compare to the converted set.
    const editedShow = { ...show, composition: edited, updatedAt: 2 }
    const convertedEdited = convertShowRecordV1ToV2(editedShow)
    if (convertedEdited.status !== 'converted') throw new Error(JSON.stringify(convertedEdited.issues))
    const { provider } = v2ProviderForPort([convertedEdited.record])
    void provider
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(convertedEdited.record.id)
    const reloaded = useShowStore.getState().showV2Pilots[convertedEdited.record.id]
    expect(reloaded.composition).toEqual(convertedEdited.record.composition)
    expect(validateShowRecordV2(reloaded)).toEqual([])
    expect(reloaded.composition.clips.map((clip) => clip.id).sort()).toEqual(convertedEdited.record.composition.clips.map((clip) => clip.id).sort())
  })

  it('preserves authored empty overlay Layers when a personal Show is reloaded', async () => {
    // Ported to v2: empty overlay converts to a v2 layer and persists; converter preserves id (showRecordV1ToV2.ts:421).
    const authored = composition()
    authored.scenes[0].zones[0].overlays.unshift({
      id: 'empty-layer',
      name: 'Layer 2',
      placements: [],
    })
    const show = {
      ...createDefaultShow('show-empty-layer-reload', 'Empty Layer reload', 1),
      composition: authored,
    }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { provider } = v2ProviderForPort([converted.record])
    void provider
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const reloaded = useShowStore.getState().showV2Pilots[converted.record.id]
    // v2 names layers differently than v1 overlays (showCompositionV2.ts:ShowLayerV2); persistence keeps the converted set.
    expect(reloaded.composition).toEqual(converted.record.composition)
    expect(reloaded.composition.layers.map((layer) => layer.name)).toEqual(converted.record.composition.layers.map((layer) => layer.name))
  })

  it('preserves stable composition ids through undo and redo', async () => {
    // Ported to v2: a resized Transition keeps its id through undo/redo; v2 always has a composition,
    // so undo restores the base composition (showCompositionV2.ts:ShowRecordV2).
    const show = { ...transitionV1Show('crossfade'), id: 'show-composition-history', name: 'Composition history', updatedAt: 1 }
    const converted = convertShowRecordV1ToV2(show)
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const { provider } = v2ProviderForPort([converted.record])
    void provider
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(converted.record.id)
    const id = converted.record.id
    const base = useShowStore.getState().showV2Pilots[id]
    const transitionId = base.composition.transitions[0].id
    const edited = editShowTransitionV2(base, { kind: 'resize-transition', transitionId, durationMs: 100 })
    if (edited.status !== 'changed') throw new Error(JSON.stringify(edited))
    await useShowStore.getState().updateShowV2Pilot(id, edited.record)
    expect(await useShowStore.getState().undoShowV2Pilot(id)).toBe(true)
    expect(useShowStore.getState().showV2Pilots[id].composition).toEqual(base.composition)
    expect(await useShowStore.getState().redoShowV2Pilot(id)).toBe(true)
    expect(useShowStore.getState().showV2Pilots[id].composition).toEqual(edited.record.composition)
  })

  /* COVERED: "undoes and redoes draft edits entirely in memory" — src/store/showV2LessonDraft.test.ts:64. */
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
    gateV2(true)
    const { stored } = memoryProviderV2()
    const portable = createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 })

    expect(useShowStore.getState().showV2Rows).toEqual([])
    const created = await useShowStore.getState().createNewShowV2({ name: 'Touring field', outputContract: portable })
    expect(stored).toHaveLength(1)
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()
    await useShowStore.getState().openShowV2Pilot(created.id)

    expect(created).toMatchObject({
      name: 'Touring field',
      stageMapId: 'plane',
      outputContract: portable,
    })
    expect(useShowStore.getState().showV2Rows).toEqual([expect.objectContaining({ id: created.id })])
    expect(useShowStore.getState().showV2Pilots[created.id]).toMatchObject({ outputContract: portable })

    const installation = createInstallationShowOutputContract({ outputMapId: 'custom-map', pixelCount: 240 })
    const installed = await useShowStore.getState().createNewShowV2({ name: 'Lobby wall', outputContract: installation })
    expect(installed).toMatchObject({
      stageMapId: 'custom-map',
      zones: [expect.objectContaining({ nominalPixelCount: 240 })],
      outputContract: installation,
    })
  })

  it('loads shows sorted by recency and opens one as active', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const older = { ...converted.record, id: 'show-1', name: 'Older', updatedAt: 1 }
    const newer = { ...converted.record, id: 'show-2', name: 'Newer', updatedAt: 2 }
    v2ProviderForPort([older, newer])

    await useShowStore.getState().loadShows()
    const opened = await useShowStore.getState().openShowV2Pilot(older.id)

    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toEqual(['show-2', 'show-1'])
    expect(opened).toMatchObject({ status: 'ready', record: { id: older.id } })
    expect(useShowStore.getState().showV2Pilots[older.id]).toMatchObject({ id: older.id })
  })

  it('keeps provider order for v2 Shows with equal recency', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const first = { ...converted.record, id: 'show-first', name: 'First', updatedAt: 2 }
    const second = { ...converted.record, id: 'show-second', name: 'Second', updatedAt: 2 }
    v2ProviderForPort([first, second])

    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toEqual(['show-first', 'show-second'])
  })

  it('creates, renames, edits, and deletes shows through the provider', async () => {
    setPersonalContentProvider(memoryProvider())

    const show = await useShowStore.getState().createNewShow({
      outputContract: createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: 60 }),
    })
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

    await useShowStore.getState().updateShow(
      legacy.id,
      splitShowAtTime(useShowStore.getState().shows[0], 10_000),
    )
    const destination = useShowStore.getState().shows[0].cells.find((cell) => cell.sceneId === 'scene-3')!
    expect(destination.restartOnEntry).toBe(false)

    await useShowStore.getState().updateCellRestartOnEntry(legacy.id, destination.id, true)
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].cells.find((cell) => cell.id === destination.id)?.restartOnEntry).toBe(true)
  })

  it('persists first-class transition boundary edits by id (#416)', async () => {
    const show = createDefaultShow('show-1', 'Boundary edits', 1)
    const provider = memoryProvider([show])
    setPersonalContentProvider(provider)

    await useShowStore.getState().loadShows()
    expect(useShowStore.getState().shows[0].transitions?.[0]).toMatchObject({
      id: 'transition-scene-1',
      kind: 'crossfade',
      easing: { curve: 'linear' },
    })

    await useShowStore.getState().updateBoundaryTransition(show.id, 'transition-scene-1', {
      kind: 'wipe',
      durationMs: 2500,
      easing: { curve: 'quadratic', direction: 'out' },
      feather: 0.25,
      propertyTransitions: {
        timeScale: { fromByCellId: { 'cell-2': 1.5 }, durationMs: 1500, easing: { curve: 'quadratic', direction: 'in' } },
        brightness: { fromByCellId: { 'cell-2': 1 }, durationMs: 800, easing: { curve: 'quadratic', direction: 'out' } },
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
        controls: { sliderSpeed: { fromByCellId: { 'cell-2': 0.2 }, durationMs: 1200, easing: { curve: 'quadratic', direction: 'in' } } },
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
      kind: 'portal', revealMode: 'shrink-outgoing',
      shape: 'box', aspect: 1.75, rotation: 0.125, edgePolicy: 'blend',
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
  })

  it('persists a wipe feather width through the provider', async () => {
    const show = createDefaultShow('show-1', 'Opening wash', 1)
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], showsLoaded: true })

    await useShowStore.getState().updateTransition(show.id, 'scene-1', 'wipe', 2000, 0.3)
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions[0]).toMatchObject({
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
      { centerX: 0.4, centerY: 0.6, revealMode: 'grow-incoming', featherPolicy: 'dither' },
    )
    useShowStore.setState(showInitialState)
    await useShowStore.getState().loadShows()

    expect(useShowStore.getState().shows[0].transitions[0]).toMatchObject({
      kind: 'portal',
      feather: 0.2,
      centerX: 0.4,
      centerY: 0.6,
      revealMode: 'grow-incoming',
      featherPolicy: 'dither',
    })
  })

  it('preserves rapid partial portal edits', async () => {
    const show = { ...createDefaultShow('show-1', 'Portal', 1), stageMapId: 'plane' }
    show.transitions[0] = {
      id: 'transition-scene-1',
      afterSceneId: 'scene-1',
      kind: 'portal',
      durationMs: 2000,
      easing: { curve: 'linear' },
      feather: 0.12,
      centerX: 0.5,
      centerY: 0.5,
      revealMode: 'grow-incoming',
      featherPolicy: 'dither',
    }
    setPersonalContentProvider(memoryProvider([show]))
    useShowStore.setState({ shows: [show], activeShowId: show.id, showsLoaded: true })

    const first = useShowStore.getState().updateTransition(show.id, 'scene-1', 'portal', 2000, 0.12, { centerX: 0.35 })
    const second = useShowStore.getState().updateTransition(show.id, 'scene-1', 'portal', 2000, 0.12, { featherPolicy: 'blend' })
    const third = useShowStore.getState().updateTransition(show.id, 'scene-1', 'portal', 2000, 0.12, { revealMode: 'shrink-outgoing' })
    await Promise.all([first, second, third])

    expect(useShowStore.getState().shows[0].transitions[0]).toMatchObject({
      centerX: 0.35,
      centerY: 0.5,
      revealMode: 'shrink-outgoing',
      featherPolicy: 'blend',
    })
  })

  it('edits show-local zones and creates a show from controller zones', async () => {
    const provider = memoryProvider()
    const createShow = vi.spyOn(provider, 'createShow')
    const createShowV2 = vi.fn(async (_record: ShowRecordV2) => {})
    provider.createShowV2 = createShowV2
    setPersonalContentProvider(provider)

    const show = await useShowStore.getState().createNewShow({
      outputContract: createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: 60 }),
    })
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
    createShow.mockClear()

    const seeded = await useShowStore.getState().createShowFromController({
      id: 'controller-1',
      name: 'North Arch',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      lastKnownPixelCount: 240,
      updatedAt: 1,
    })

    // #775: no zone seeding — the Show starts single-zone and sizes its
    // installation contract from the Controller's last known pixel count. The
    // zone and its Default layout must cover the complete output, so the Show
    // compiles without manual range repair (review P2).
    expect(seeded.targetControllerProfileId).toBe('controller-1')
    expect(seeded.version).toBe(2)
    expect(validateShowRecordV2(seeded)).toEqual([])
    expect(seeded.zones.map((zone) => [zone.name, zone.nominalPixelCount])).toEqual([['main', 240]])
    expect(seeded.outputContract).toMatchObject({ kind: 'installation', pixelCount: 240 })
    expect(seeded.zoneLayouts[0].zones).toEqual([
      { zoneId: seeded.zones[0].id, ranges: [{ start: 0, end: 239 }] },
    ])
    expect(validateInstallationCoverage({ outputContract: seeded.outputContract, routingLayouts: seeded.zoneLayouts }))
      .toMatchObject({ valid: true, pixelCount: 240 })
    expect(createShowV2).toHaveBeenCalledExactlyOnceWith(seeded)
    expect(createShow).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toContain(seeded.id)
    expect(useShowStore.getState().shows.map((row) => row.id)).toEqual([show.id])
    expect(useShowStore.getState().activeShowId).toBeNull()
  })

  it('seeds and persists a show stage map from controller imports', async () => {
    const { provider, stored } = memoryProviderV2()
    const createShowV2 = vi.spyOn(provider, 'createShowV2')
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
      updatedAt: 1,
    })

    expect(seeded.stageMapId).toBe('map-new')
    // #775: without a last known pixel count the contract falls back to 60.
    expect(seeded.outputContract).toMatchObject({ kind: 'installation', pixelCount: 60 })
    expect(createShowV2).toHaveBeenCalledExactlyOnceWith(seeded)
    expect(stored).toEqual([seeded])
    expect(useShowStore.getState().showV2Rows.map((row) => row.id)).toContain(seeded.id)
    expect(useShowStore.getState().showV2Pilots[seeded.id]).toEqual(seeded)
  })

  it('names a controller-seeded Show uniquely across v1 and v2 rows', async () => {
    memoryProviderV2()
    await useShowStore.getState().createNewShowV2({
      name: 'North Arch Show',
      outputContract: createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: 60 }),
    })
    await useShowStore.getState().createNewShowV2({
      name: 'North Arch Show',
      outputContract: createPortableShowOutputContract({ referenceMapId: null, referencePixelCount: 60 }),
    })

    const seeded = await useShowStore.getState().createShowFromController({
      id: 'controller-1',
      name: 'North Arch',
      board: { kind: 'pixelblaze-v3-standard' },
      inputs: [],
      globalTransforms: [],
      patternBindings: [],
      updatedAt: 1,
    })

    // patternName.ts:1 starts duplicate suffixes at 1 for the v2 row names.
    expect(seeded.name).toBe('North Arch Show 2')
  })
})

describe('built-in Show session drafts (#363)', () => {
  const STOCK_ID = 'stock-show-101-clips-cuts-blank-time'

  it('edits a built-in Show into an in-memory draft without any provider write', async () => {
    const provider = memoryProvider()
    const updateSpy = vi.spyOn(provider, 'updateShow')
    const createSpy = vi.spyOn(provider, 'createShow')
    setPersonalContentProvider(provider)

    const base = useShowStore.getState().resolveEditableShow(STOCK_ID)!
    expect(base.name).toBe('101 Clips, Cuts, and Blank Time')

    await useShowStore.getState().addScene(STOCK_ID)

    const draft = useShowStore.getState().stockShowDrafts[STOCK_ID]
    expect(draft.scenes).toHaveLength(base.scenes.length + 1)
    expect(useShowStore.getState().resolveEditableShow(STOCK_ID)).toBe(draft)
    expect(updateSpy).not.toHaveBeenCalled()
    expect(createSpy).not.toHaveBeenCalled()
    expect(stockShowById(STOCK_ID)!.show.scenes).toHaveLength(base.scenes.length)
  })

  it('keeps complete stock draft records and history paired across stale-stamped edits (#948)', async () => {
    memoryProviderV2()
    const now = vi.spyOn(Date, 'now')
    const base = stockShowV2ById(STOCK_ID)!
    await useShowStore.getState().openShowV2Pilot(STOCK_ID)

    try {
      now.mockReturnValue(100)
      await useShowStore.getState().updateShowV2Pilot(STOCK_ID, { ...base, name: 'Draft A', updatedAt: 0 })
      const draftA = { ...base, name: 'Draft A', updatedAt: base.updatedAt + 1 }
      expect(useShowStore.getState().showV2Pilots[STOCK_ID]).toEqual(draftA)
      expect(useShowStore.getState().showV2Histories[STOCK_ID]).toEqual({ past: [base], future: [] })

      now.mockReturnValue(101)
      await useShowStore.getState().updateShowV2Pilot(STOCK_ID, { ...draftA, name: 'Draft B', updatedAt: 0 })
      const draftB = { ...draftA, name: 'Draft B', updatedAt: draftA.updatedAt + 1 }
      expect(useShowStore.getState().showV2Pilots[STOCK_ID]).toEqual(draftB)
      expect(useShowStore.getState().showV2Histories[STOCK_ID]).toEqual({ past: [base, draftA], future: [] })

      now.mockReturnValue(102)
      await expect(useShowStore.getState().undoShowV2Pilot(STOCK_ID)).resolves.toBe(true)
      const undoneA = { ...draftA, updatedAt: draftB.updatedAt + 1 }
      expect(useShowStore.getState().showV2Pilots[STOCK_ID]).toEqual(undoneA)
      expect(useShowStore.getState().showV2Histories[STOCK_ID]).toEqual({ past: [base], future: [draftB] })

      now.mockReturnValue(103)
      await expect(useShowStore.getState().redoShowV2Pilot(STOCK_ID)).resolves.toBe(true)
      const redoneB = { ...draftB, updatedAt: undoneA.updatedAt + 1 }
      expect(useShowStore.getState().showV2Pilots[STOCK_ID]).toEqual(redoneB)
      expect(useShowStore.getState().showV2Histories[STOCK_ID]).toEqual({ past: [base, undoneA], future: [] })
    } finally {
      now.mockRestore()
    }
  })

  it('resetStockShowDraft discards the draft and its history', async () => {
    setPersonalContentProvider(memoryProvider())

    await useShowStore.getState().addScene(STOCK_ID)
    expect(useShowStore.getState().stockShowDrafts[STOCK_ID]).toBeDefined()

    useShowStore.getState().resetStockShowDraft(STOCK_ID)
    expect(useShowStore.getState().stockShowDrafts[STOCK_ID]).toBeUndefined()
    expect(useShowStore.getState().showHistories[STOCK_ID]).toBeUndefined()
    expect(await useShowStore.getState().undoShow(STOCK_ID)).toBe(false)
  })

  it('keeps a reset stock draft discarded when its accepted update promise settles (#948)', async () => {
    const provider = memoryProvider()
    const updateSpy = vi.spyOn(provider, 'updateShow')
    setPersonalContentProvider(provider)
    const base = useShowStore.getState().resolveEditableShow(STOCK_ID)!

    const edit = useShowStore.getState().updateShow(STOCK_ID, {
      ...base,
      name: 'Discarded draft',
      updatedAt: 0,
    })
    useShowStore.getState().resetStockShowDraft(STOCK_ID)
    await edit

    expect(useShowStore.getState().stockShowDrafts[STOCK_ID]).toBeUndefined()
    expect(useShowStore.getState().showHistories[STOCK_ID]).toBeUndefined()
    expect(useShowStore.getState().resolveEditableShow(STOCK_ID)).toEqual(base)
    expect(updateSpy).not.toHaveBeenCalled()
  })
})
