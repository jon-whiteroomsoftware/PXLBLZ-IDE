import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { editShowTransitionV2, projectShowTransitionJunctionsV2 } from '../engine/showTransitionsV2'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { cloneValidShowRecordV2 } from '../engine/showDocument'
import { setPersonalContentProvider, type PersonalContentProvider } from '../engine/personalContentProvider'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { showInitialState, useShowStore } from './showStore'

function state() { return useShowStore.getState() }

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

beforeEach(() => {
  useShowStore.setState(showInitialState)
})

describe('opt-in v2 Show route adoption', () => {
  it('cold-opens a stored v2 record without a legacy Show list entry', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    setPersonalContentProvider({
      id: 'v2-cold-open',
      listShows: async () => [],
      listShowDocumentsV2: async () => [structuredClone(converted.record)],
      replaceShowV2: async () => {},
    } as unknown as PersonalContentProvider)

    await expect(state().openShowV2Pilot(converted.record.id)).resolves.toEqual({
      status: 'ready',
      record: converted.record,
    })
    expect(state().activeShowId).toBeNull()
    expect(state().showV2Pilots[converted.record.id]).toEqual(converted.record)
  })

  it('does not retire Show creation begun while a pilot open is pending', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const delayedList = deferred<ShowRecordV2[]>()
    const listShowDocumentsV2 = vi.fn(() => delayedList.promise)
    setPersonalContentProvider({
      id: 'v2-open-during-creation',
      listShows: async () => [],
      listShowDocumentsV2,
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ activeShowId: 'previous-selection' })

    const opening = state().openShowV2Pilot(converted.record.id)
    await vi.waitFor(() => expect(listShowDocumentsV2).toHaveBeenCalledTimes(1))
    state().beginShowCreation()
    expect(state().showCreation).toEqual({ previousShowId: 'previous-selection' })

    delayedList.resolve([structuredClone(converted.record)])
    await expect(opening).resolves.toMatchObject({ status: 'ready' })

    expect(state().showCreation).toEqual({ previousShowId: 'previous-selection' })
    expect(state().activeShowId).toBe('previous-selection')
    expect(state().showV2Pilots[converted.record.id]).toEqual(converted.record)
  })

  it('drops the previous workspace pilot cache before reopening the same id from a new provider', async () => {
    const first = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'First account' })
    const second = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Second account' })
    if (first.status !== 'converted' || second.status !== 'converted') throw new Error('conversion failed')
    setPersonalContentProvider({
      id: 'first-workspace',
      listShows: async () => [],
      listShowDocumentsV2: async () => [structuredClone(first.record)],
    } as unknown as PersonalContentProvider)
    await state().openShowV2Pilot(first.record.id)
    useShowStore.setState({
      showV2Histories: { [first.record.id]: { past: [structuredClone(first.record)], future: [] } },
      showV2SaveFailure: { showId: first.record.id, record: structuredClone(first.record) },
    })

    setPersonalContentProvider({
      id: 'second-workspace',
      listShows: async () => [],
      listShowDocumentsV2: async () => [structuredClone(second.record)],
    } as unknown as PersonalContentProvider)
    await state().loadShows()

    expect(state().showV2Pilots).toEqual({})
    expect(state().showV2Histories).toEqual({})
    expect(state().showV2SaveFailure).toBeNull()
    await expect(state().openShowV2Pilot(second.record.id)).resolves.toMatchObject({
      status: 'ready',
      record: { name: 'Second account' },
    })
  })

  it('discards a delayed pilot open from the previous workspace and permits a current retry', async () => {
    const first = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Delayed account A' })
    const second = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Current account B' })
    if (first.status !== 'converted' || second.status !== 'converted') throw new Error('conversion failed')
    const delayedList = deferred<ShowRecordV2[]>()
    const firstProvider = {
      id: 'delayed-workspace-a',
      listShows: async () => [],
      listShowDocumentsV2: vi.fn(() => delayedList.promise),
    } as unknown as PersonalContentProvider
    const secondProvider = {
      id: 'current-workspace-b',
      listShows: async () => [],
      listShowDocumentsV2: vi.fn(async () => [structuredClone(second.record)]),
    } as unknown as PersonalContentProvider
    setPersonalContentProvider(firstProvider)

    const staleOpen = state().openShowV2Pilot(first.record.id)
    await vi.waitFor(() => expect(firstProvider.listShowDocumentsV2).toHaveBeenCalledTimes(1))
    setPersonalContentProvider(secondProvider)
    await state().loadShows()
    delayedList.resolve([structuredClone(first.record)])
    await staleOpen

    expect(state().showV2Pilots).toEqual({})
    expect(state().showV2Histories).toEqual({})
    expect(state().activeShowId).not.toBe(first.record.id)

    await expect(state().openShowV2Pilot(second.record.id)).resolves.toMatchObject({
      status: 'ready',
      record: { name: 'Current account B' },
    })
    expect(state().showV2Pilots[second.record.id].name).toBe('Current account B')
  })

  it('discards a delayed pilot reload from the previous workspace and permits a current retry', async () => {
    const first = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Reload account A' })
    const second = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Reload account B' })
    if (first.status !== 'converted' || second.status !== 'converted') throw new Error('conversion failed')
    const delayedReload = deferred<ShowRecordV2[]>()
    const firstList = vi.fn()
      .mockResolvedValueOnce([structuredClone(first.record)])
      .mockImplementationOnce(() => delayedReload.promise)
    setPersonalContentProvider({
      id: 'reload-workspace-a',
      listShows: async () => [],
      listShowDocumentsV2: firstList,
    } as unknown as PersonalContentProvider)
    await state().openShowV2Pilot(first.record.id)

    const staleReload = state().reloadShowV2Pilot(first.record.id)
    await vi.waitFor(() => expect(firstList).toHaveBeenCalledTimes(2))
    setPersonalContentProvider({
      id: 'reload-workspace-b',
      listShows: async () => [],
      listShowDocumentsV2: async () => [structuredClone(second.record)],
    } as unknown as PersonalContentProvider)
    await state().loadShows()
    delayedReload.resolve([structuredClone(first.record)])

    await expect(staleReload).resolves.toBeNull()
    expect(state().showV2Pilots).toEqual({})
    expect(state().showV2Histories).toEqual({})
    await expect(state().reloadShowV2Pilot(second.record.id)).resolves.toMatchObject({ name: 'Reload account B' })
    expect(state().showV2Pilots[second.record.id].name).toBe('Reload account B')
  })

  it('opens a converted pilot only after the current workspace hydration publishes its v1 source', async () => {
    const previousSource = { ...transitionV1Show('crossfade'), name: 'Previous workspace source' }
    const currentSource = { ...transitionV1Show('crossfade'), name: 'Hydrated workspace source' }
    const pendingShows = deferred<ReturnType<typeof transitionV1Show>[]>()
    const listShowDocumentsV2 = vi.fn(async () => [] as ShowRecordV2[])
    setPersonalContentProvider({
      id: 'hydrating-workspace',
      listShows: () => pendingShows.promise,
      listShowDocumentsV2,
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [previousSource], showsLoaded: true })

    const hydration = state().loadShows()
    const opening = state().openShowV2Pilot(currentSource.id)
    await Promise.resolve()

    expect(listShowDocumentsV2).not.toHaveBeenCalled()
    expect(state().showV2Pilots).toEqual({})

    pendingShows.resolve([currentSource])
    await hydration
    await expect(opening).resolves.toMatchObject({
      status: 'ready',
      record: { name: 'Hydrated workspace source' },
    })
    expect(state().showV2Pilots[currentSource.id].name).toBe('Hydrated workspace source')
  })

  it.each(['open', 'reload'] as const)('permits a valid %s retry after a failed provider read', async (operation) => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const list = vi.fn()
      .mockRejectedValueOnce(new Error('temporary read failure'))
      .mockResolvedValueOnce([structuredClone(converted.record)])
    setPersonalContentProvider({
      id: `v2-${operation}-read-retry`,
      listShows: async () => [],
      listShowDocumentsV2: list,
    } as unknown as PersonalContentProvider)

    if (operation === 'open') {
      await expect(state().openShowV2Pilot(converted.record.id)).rejects.toThrow('temporary read failure')
      await expect(state().openShowV2Pilot(converted.record.id)).resolves.toMatchObject({ status: 'ready' })
    } else {
      await expect(state().reloadShowV2Pilot(converted.record.id)).rejects.toThrow('temporary read failure')
      await expect(state().reloadShowV2Pilot(converted.record.id)).resolves.toMatchObject({ id: converted.record.id })
    }
    expect(list).toHaveBeenCalledTimes(2)
    expect(state().showV2Pilots[converted.record.id]).toEqual(converted.record)
  })

  it('converts v1, edits through the Transition owner, saves, undoes/redoes, and reloads provider bytes', async () => {
    const source = transitionV1Show('crossfade')
    let stored: ShowRecordV2 | undefined
    const writes: ShowRecordV2[] = []
    setPersonalContentProvider({
      id: 'v2-test',
      listShows: async () => [source],
      listShowDocumentsV2: async () => stored ? [structuredClone(stored)] : [],
      replaceShowV2: async (_id: string, record: ShowRecordV2) => { stored = structuredClone(record); writes.push(structuredClone(record)) },
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [source] })

    const opened = await state().openShowV2Pilot(source.id)
    expect(opened.status).toBe('ready')
    if (opened.status !== 'ready') return
    const transitionId = opened.record.composition.transitions[0].id
    const edited = editShowTransitionV2(opened.record, { kind: 'resize-transition', transitionId, durationMs: 100 })
    expect(edited.status).toBe('changed')
    if (edited.status !== 'changed') return
    await state().updateShowV2Pilot(source.id, edited.record)
    const editedStamp = state().showV2Pilots[source.id].updatedAt
    expect(state().showV2Histories[source.id].past).toHaveLength(1)

    await expect(state().undoShowV2Pilot(source.id)).resolves.toBe(true)
    expect(state().showV2Pilots[source.id].composition.transitions[0].durationMs).toBe(opened.record.composition.transitions[0].durationMs)
    await expect(state().redoShowV2Pilot(source.id)).resolves.toBe(true)
    expect(state().showV2Pilots[source.id].composition.transitions[0].durationMs).toBe(100)
    expect(state().showV2Pilots[source.id].updatedAt).toBeGreaterThan(editedStamp)
    expect(writes).toHaveLength(3)

    const reopened = await state().reloadShowV2Pilot(source.id)
    expect(reopened).toEqual(stored)
    expect(state().showV2Histories[source.id]).toEqual({ past: [], future: [] })
  })

  it('reloads only after a pending pilot save reaches the provider', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    let stored = structuredClone(converted.record)
    const pendingWrite = deferred<void>()
    const list = vi.fn(async () => [structuredClone(stored)])
    const replace = vi.fn(async (_id: string, record: ShowRecordV2) => {
      await pendingWrite.promise
      stored = structuredClone(record)
    })
    setPersonalContentProvider({
      id: 'v2-reload-queued-save',
      listShows: async () => [],
      listShowDocumentsV2: list,
      replaceShowV2: replace,
    } as unknown as PersonalContentProvider)

    const opened = await state().openShowV2Pilot(converted.record.id)
    if (opened.status !== 'ready') throw new Error(JSON.stringify(opened.issues))
    const saving = state().updateShowV2Pilot(opened.record.id, { ...opened.record, name: 'Pending B' })
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    const reloading = state().reloadShowV2Pilot(opened.record.id)

    await Promise.resolve()
    expect(list).toHaveBeenCalledTimes(1)
    expect(state().showV2Pilots[opened.record.id].name).toBe('Pending B')
    expect(state().showV2Histories[opened.record.id].past).toEqual([opened.record])

    pendingWrite.resolve()
    await expect(saving).resolves.toBeUndefined()
    await expect(reloading).resolves.toMatchObject({ name: 'Pending B' })
    expect(list).toHaveBeenCalledTimes(2)
    expect(state().showV2Pilots[opened.record.id].name).toBe('Pending B')
    expect(state().showV2Histories[opened.record.id]).toEqual({ past: [], future: [] })
    expect(stored.name).toBe('Pending B')
  })

  it('does not let a delayed reload replace an intervening changed edit', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    let stored = structuredClone(converted.record)
    const pendingReload = deferred<ShowRecordV2[]>()
    const list = vi.fn()
      .mockResolvedValueOnce([structuredClone(stored)])
      .mockImplementationOnce(() => pendingReload.promise)
    const replace = vi.fn(async (_id: string, record: ShowRecordV2) => { stored = structuredClone(record) })
    setPersonalContentProvider({
      id: 'v2-reload-intervening-edit',
      listShows: async () => [],
      listShowDocumentsV2: list,
      replaceShowV2: replace,
    } as unknown as PersonalContentProvider)
    const opened = await state().openShowV2Pilot(converted.record.id)
    if (opened.status !== 'ready') throw new Error(JSON.stringify(opened.issues))

    const reloading = state().reloadShowV2Pilot(opened.record.id)
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    const saving = state().updateShowV2Pilot(opened.record.id, { ...opened.record, name: 'Intervening B' })
    expect(state().showV2Pilots[opened.record.id].name).toBe('Intervening B')
    pendingReload.resolve([structuredClone(converted.record)])

    await expect(reloading).resolves.toBeNull()
    await expect(saving).resolves.toBeUndefined()
    expect(state().showV2Pilots[opened.record.id].name).toBe('Intervening B')
    expect(state().showV2Histories[opened.record.id].past).toEqual([opened.record])
    expect(stored.name).toBe('Intervening B')
  })

  it('allows a delayed reload to adopt after an intervening no-op edit', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const pendingReload = deferred<ShowRecordV2[]>()
    const list = vi.fn()
      .mockResolvedValueOnce([structuredClone(converted.record)])
      .mockImplementationOnce(() => pendingReload.promise)
    setPersonalContentProvider({
      id: 'v2-reload-noop-edit',
      listShows: async () => [],
      listShowDocumentsV2: list,
      replaceShowV2: vi.fn(async () => {}),
    } as unknown as PersonalContentProvider)
    const opened = await state().openShowV2Pilot(converted.record.id)
    if (opened.status !== 'ready') throw new Error(JSON.stringify(opened.issues))

    const reloading = state().reloadShowV2Pilot(opened.record.id)
    await vi.waitFor(() => expect(list).toHaveBeenCalledTimes(2))
    await state().updateShowV2Pilot(opened.record.id, state().showV2Pilots[opened.record.id])
    const refreshed = { ...converted.record, name: 'Provider refresh' }
    pendingReload.resolve([refreshed])

    await expect(reloading).resolves.toMatchObject({ name: 'Provider refresh' })
    expect(state().showV2Pilots[opened.record.id].name).toBe('Provider refresh')
    expect(state().showV2Histories[opened.record.id]).toEqual({ past: [], future: [] })
  })

  it('preserves rollback and failure state when a queued reload follows a failed save', async () => {
    const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
    if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
    const pendingWrite = deferred<void>()
    const list = vi.fn(async () => [structuredClone(converted.record)])
    setPersonalContentProvider({
      id: 'v2-reload-after-failure',
      listShows: async () => [],
      listShowDocumentsV2: list,
      replaceShowV2: async () => pendingWrite.promise,
    } as unknown as PersonalContentProvider)
    const opened = await state().openShowV2Pilot(converted.record.id)
    if (opened.status !== 'ready') throw new Error(JSON.stringify(opened.issues))

    const saving = state().updateShowV2Pilot(opened.record.id, { ...opened.record, name: 'Rejected B' })
    const reloading = state().reloadShowV2Pilot(opened.record.id)
    pendingWrite.reject(new Error('offline'))

    await expect(saving).rejects.toThrow('offline')
    await expect(reloading).resolves.toBeNull()
    expect(list).toHaveBeenCalledTimes(1)
    expect(state().showV2Pilots[opened.record.id]).toEqual(opened.record)
    expect(state().showV2Histories[opened.record.id]).toEqual({ past: [], future: [] })
    expect(state().showV2SaveFailure).toMatchObject({ showId: opened.record.id, record: { name: 'Rejected B' } })
  })

  it('does not let a successful write from a retired workspace replace the current durable baseline', async () => {
    const first = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Workspace A' })
    const second = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Workspace B' })
    if (first.status !== 'converted' || second.status !== 'converted') throw new Error('conversion failed')
    const pendingOldWrite = deferred<void>()
    const oldReplace = vi.fn(async () => pendingOldWrite.promise)
    setPersonalContentProvider({
      id: 'write-workspace-a',
      listShows: async () => [],
      listShowDocumentsV2: async () => [structuredClone(first.record)],
      replaceShowV2: oldReplace,
    } as unknown as PersonalContentProvider)
    const openedA = await state().openShowV2Pilot(first.record.id)
    if (openedA.status !== 'ready') throw new Error(JSON.stringify(openedA.issues))
    const savingA = state().updateShowV2Pilot(first.record.id, { ...openedA.record, name: 'Saved after retirement' })
    await vi.waitFor(() => expect(oldReplace).toHaveBeenCalledTimes(1))

    const currentB = { ...second.record, updatedAt: openedA.record.updatedAt }
    setPersonalContentProvider({
      id: 'write-workspace-b',
      listShows: async () => [],
      replaceShowV2: async () => { throw new Error('current write failed') },
    } as unknown as PersonalContentProvider)
    await state().loadShows()
    useShowStore.setState({
      showV2Pilots: { [currentB.id]: currentB },
      showV2Histories: { [currentB.id]: { past: [], future: [] } },
    })

    pendingOldWrite.resolve()
    await expect(savingA).resolves.toBeUndefined()
    await expect(state().updateShowV2Pilot(currentB.id, { ...currentB, name: 'Rejected current edit' }))
      .rejects.toThrow('current write failed')

    expect(state().showV2Pilots[currentB.id]).toEqual(currentB)
    expect(state().showV2Histories[currentB.id]).toEqual({ past: [], future: [] })
    expect(state().showV2SaveFailure).toMatchObject({ showId: currentB.id, record: { name: 'Rejected current edit' } })
  })

  it('does not publish a failed-write rollback from a retired workspace', async () => {
    const first = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Failing workspace A' })
    const second = convertShowRecordV1ToV2({ ...transitionV1Show('crossfade'), name: 'Current workspace B' })
    if (first.status !== 'converted' || second.status !== 'converted') throw new Error('conversion failed')
    const pendingOldWrite = deferred<void>()
    const oldReplace = vi.fn(async () => pendingOldWrite.promise)
    setPersonalContentProvider({
      id: 'failed-write-workspace-a',
      listShows: async () => [],
      listShowDocumentsV2: async () => [structuredClone(first.record)],
      replaceShowV2: oldReplace,
    } as unknown as PersonalContentProvider)
    const openedA = await state().openShowV2Pilot(first.record.id)
    if (openedA.status !== 'ready') throw new Error(JSON.stringify(openedA.issues))
    const savingA = state().updateShowV2Pilot(first.record.id, { ...openedA.record, name: 'Rejected after retirement' })
    const adoptedA = structuredClone(state().showV2Pilots[first.record.id])
    await vi.waitFor(() => expect(oldReplace).toHaveBeenCalledTimes(1))

    const currentB = { ...second.record, updatedAt: adoptedA.updatedAt }
    setPersonalContentProvider({
      id: 'failed-write-workspace-b',
      listShows: async () => [],
    } as unknown as PersonalContentProvider)
    await state().loadShows()
    useShowStore.setState({
      showV2Pilots: { [currentB.id]: currentB },
      showV2Histories: { [currentB.id]: { past: [], future: [] } },
    })
    pendingOldWrite.reject(new Error('old workspace offline'))

    await expect(savingA).resolves.toBeUndefined()
    expect(state().showV2Pilots[currentB.id]).toEqual(currentB)
    expect(state().showV2Histories[currentB.id]).toEqual({ past: [], future: [] })
    expect(state().showV2SaveFailure).toBeNull()
  })

  it('persists and reopens a delete/re-add candidate without resurrecting Transition identity', async () => {
    const source = transitionV1Show('crossfade')
    let stored: ShowRecordV2 | undefined
    setPersonalContentProvider({
      id: 'v2-delete-readd',
      listShows: async () => [source],
      listShowDocumentsV2: async () => stored ? [structuredClone(stored)] : [],
      replaceShowV2: async (_id: string, record: ShowRecordV2) => { stored = structuredClone(record) },
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [source] })
    const opened = await state().openShowV2Pilot(source.id)
    if (opened.status !== 'ready') throw new Error('conversion failed')
    const originalOut = structuredClone(opened.record.composition.clips.find(clip => clip.id === 'out'))
    const originalIn = structuredClone(opened.record.composition.clips.find(clip => clip.id === 'in'))
    if (!originalOut || !originalIn) throw new Error('fixture clips unavailable')
    const deleted = editShowTransitionV2(opened.record, { kind: 'delete-clip', clipId: originalIn.id })
    if (deleted.status !== 'changed') throw new Error(JSON.stringify(deleted))
    const readded = structuredClone(deleted.record)
    readded.composition.clips.push({
      ...originalIn,
      id: 'replacement',
      startMs: originalOut.startMs + originalOut.durationMs,
      appearance: { keys: originalIn.appearance.keys.map((key, index) => ({
        ...key,
        id: `replacement:appearance:${index + 1}`,
        timeMs: key.timeMs - originalIn.startMs + originalOut.startMs + originalOut.durationMs,
      })) },
    })
    const candidate = cloneValidShowRecordV2(readded)

    await state().updateShowV2Pilot(source.id, candidate)
    const reopened = await state().reloadShowV2Pilot(source.id)
    expect(reopened?.composition.showEndMs).toBe(opened.record.composition.showEndMs)
    expect(reopened?.composition.clips.find(clip => clip.id === 'out')).toEqual(originalOut)
    expect(reopened?.composition.transitions).toEqual([])
    expect(reopened && projectShowTransitionJunctionsV2(reopened)).toEqual([
      expect.objectContaining({ kind: 'cut', atMs: 400, fromClipId: 'out', toClipId: 'replacement' }),
    ])

    const artifacts = await qualifyShowV2PilotArtifacts(reopened!, { patterns: [], maps: [], libraries: [] })
    expect(artifacts.importedShow.composition.transitions).toEqual([])
    expect(projectShowTransitionJunctionsV2(artifacts.importedShow)).toEqual([
      expect.objectContaining({ kind: 'cut', atMs: 400, fromClipId: 'out', toClipId: 'replacement' }),
    ])
  })

  it('rolls a failed current save back atomically with its history', async () => {
    const source = transitionV1Show('crossfade')
    setPersonalContentProvider({
      id: 'v2-failure', listShows: async () => [source], listShowDocumentsV2: async () => [],
      replaceShowV2: async () => { throw new Error('offline') },
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [source] })
    const opened = await state().openShowV2Pilot(source.id)
    if (opened.status !== 'ready') throw new Error('conversion failed')
    const next = { ...opened.record, name: 'Rejected replacement' }

    await expect(state().updateShowV2Pilot(source.id, next)).rejects.toThrow('offline')

    expect(state().showV2Pilots[source.id]).toEqual(opened.record)
    expect(state().showV2Histories[source.id]).toEqual({ past: [], future: [] })
    expect(state().showV2SaveFailure).toMatchObject({ showId: source.id, record: { name: 'Rejected replacement' } })
  })

  it('refuses an unsupported provider before publishing an optimistic edit', async () => {
    const source = transitionV1Show('crossfade')
    setPersonalContentProvider({
      id: 'v1-only', listShows: async () => [source], listShowDocumentsV2: async () => [],
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [source] })
    const opened = await state().openShowV2Pilot(source.id)
    if (opened.status !== 'ready') throw new Error('conversion failed')

    await expect(state().updateShowV2Pilot(source.id, { ...opened.record, name: 'Must remain private' }))
      .rejects.toThrow('does not support v2 Shows')

    expect(state().showV2Pilots[source.id]).toEqual(opened.record)
    expect(state().showV2Histories[source.id]).toEqual({ past: [], future: [] })
    expect(state().showV2SaveFailure).toBeNull()
  })

  it('does not let an older failed save roll back a newer accepted replacement', async () => {
    const source = transitionV1Show('crossfade')
    let rejectFirst!: (reason: Error) => void
    const firstWrite = new Promise<void>((_resolve, reject) => { rejectFirst = reject })
    const replace = vi.fn().mockImplementationOnce(() => firstWrite).mockResolvedValueOnce(undefined)
    setPersonalContentProvider({ id: 'v2-supersession', listShows: async () => [source], listShowDocumentsV2: async () => [], replaceShowV2: replace } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [source] })
    const opened = await state().openShowV2Pilot(source.id)
    if (opened.status !== 'ready') throw new Error('conversion failed')

    const older = state().updateShowV2Pilot(source.id, { ...opened.record, name: 'Older' })
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    const newer = state().updateShowV2Pilot(source.id, { ...state().showV2Pilots[source.id], name: 'Newer' })
    rejectFirst(new Error('older failed'))
    await expect(older).resolves.toBeUndefined()
    await expect(newer).resolves.toBeUndefined()

    expect(state().showV2Pilots[source.id].name).toBe('Newer')
    expect(state().showV2SaveFailure).toBeNull()
    expect(replace).toHaveBeenCalledTimes(2)
  })

  it('rolls a failed newer save back to an older save that settled while superseded', async () => {
    const source = transitionV1Show('crossfade')
    let resolveFirst!: () => void
    let rejectSecond!: (reason: Error) => void
    let stored: ShowRecordV2 | undefined
    const firstWrite = new Promise<void>(resolve => { resolveFirst = resolve })
    const secondWrite = new Promise<void>((_resolve, reject) => { rejectSecond = reject })
    const replace = vi.fn()
      .mockImplementationOnce((_id: string, record: ShowRecordV2) => firstWrite.then(() => { stored = structuredClone(record) }))
      .mockImplementationOnce((_id: string, record: ShowRecordV2) => secondWrite.then(() => { stored = structuredClone(record) }))
    setPersonalContentProvider({
      id: 'v2-durable-supersession',
      listShows: async () => [source],
      listShowDocumentsV2: async () => [],
      replaceShowV2: replace,
    } as unknown as PersonalContentProvider)
    useShowStore.setState({ shows: [source] })
    const opened = await state().openShowV2Pilot(source.id)
    if (opened.status !== 'ready') throw new Error('conversion failed')

    const first = state().updateShowV2Pilot(source.id, { ...opened.record, name: 'Durable A' })
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(1))
    const second = state().updateShowV2Pilot(source.id, { ...state().showV2Pilots[source.id], name: 'Rejected B' })
    expect(state().showV2Pilots[source.id].name).toBe('Rejected B')

    resolveFirst()
    await expect(first).resolves.toBeUndefined()
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(2))
    const durableA = structuredClone(replace.mock.calls[0][1] as ShowRecordV2)
    rejectSecond(new Error('newer failed'))
    await expect(second).rejects.toThrow('newer failed')

    expect(state().showV2Pilots[source.id]).toEqual(durableA)
    expect(state().showV2Histories[source.id]).toEqual({ past: [opened.record], future: [] })
    expect(state().showV2SaveFailure).toMatchObject({ showId: source.id, record: { name: 'Rejected B' } })
    expect(stored).toEqual(durableA)
  })
})
