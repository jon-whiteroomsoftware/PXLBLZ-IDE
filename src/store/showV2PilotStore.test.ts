import { beforeEach, describe, expect, it, vi } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { editShowTransitionV2 } from '../engine/showTransitionsV2'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { setPersonalContentProvider, type PersonalContentProvider } from '../engine/personalContentProvider'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { showInitialState, useShowStore } from './showStore'

function state() { return useShowStore.getState() }

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
    expect(state().activeShowId).toBe(converted.record.id)
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
})
