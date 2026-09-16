import { beforeEach, expect, it, vi } from 'vitest'
import { transitionV1Show } from '../test/showV2TracerFixture'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { compileShowV2PilotArtifact } from '../engine/showV2Pilot'
import { setPersonalContentProvider, type PersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotMarkerEdit } from './showV2MarkerAdmission'

beforeEach(() => useShowStore.setState(showInitialState))
it('adopts one changed Marker with one history/save and reopens the same bytes without changing compiled playback', async () => {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.id = 'marker-admission-changed'
  let saved = structuredClone(record)
  const replaceShowV2 = vi.fn(async (_id: string, next: typeof record) => { saved = structuredClone(next) })
  setPersonalContentProvider({ id: 'marker-admission', listShowDocumentsV2: async () => [structuredClone(saved)], replaceShowV2 } as unknown as PersonalContentProvider)
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const before = compileShowV2PilotArtifact(record, { patterns: [], maps: [], libraries: [] }).code
  const result = await admitShowV2PilotMarkerEdit({ showId: record.id, baseRevision: 0, intent: { kind: 'add', marker: { id: 'marker', timeMs: 9000, name: 'Outro' } }, assets: { patterns: [], maps: [], libraries: [] }, isCurrent: () => true })
  expect(result.status).toBe('applied')
  expect(replaceShowV2).toHaveBeenCalledTimes(1)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
  expect(saved.composition.markers).toContainEqual({ id: 'marker', timeMs: 9000, name: 'Outro' })
  expect(compileShowV2PilotArtifact(saved, { patterns: [], maps: [], libraries: [] }).code).toBe(before)
  const reopened = await useShowStore.getState().reloadShowV2Pilot(record.id)
  expect(reopened).toEqual(saved)
})

let fixtureIndex = 0
function setup() {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw new Error('Conversion failed')
  const record = converted.record
  record.id = `marker-admission-case-${++fixtureIndex}`
  record.composition.markers = [{ id: 'marker', timeMs: 0, name: 'Intro' }]
  let saved = structuredClone(record)
  const replaceShowV2 = vi.fn(async (_id: string, next: typeof record) => { saved = structuredClone(next) })
  setPersonalContentProvider({ id: record.id, listShowDocumentsV2: async () => [structuredClone(saved)], replaceShowV2 } as unknown as PersonalContentProvider)
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  return { record, replaceShowV2, request: { showId: record.id, baseRevision: 0, intent: { kind: 'move' as const, markerId: 'marker', timeMs: 9000 }, assets: { patterns: [], maps: [], libraries: [] }, isCurrent: () => true } }
}
it.each(['revision', 'route', 'dependencies-after-validation', 'provider-after-validation'] as const)('refuses %s eligibility loss with original history/document and zero Marker writes', async partition => {
  const { record, request, replaceShowV2 } = setup()
  if (partition === 'revision') request.baseRevision = 1
  if (partition === 'route') request.isCurrent = () => false
  let calls = 0
  const otherWrites = vi.fn(async () => {})
  if (partition === 'dependencies-after-validation') request.isCurrent = () => ++calls === 1
  if (partition === 'provider-after-validation') request.isCurrent = () => {
    if (++calls === 2) setPersonalContentProvider({ id: 'replaced-provider', replaceShowV2: otherWrites } as unknown as PersonalContentProvider)
    return true
  }
  expect(await admitShowV2PilotMarkerEdit(request)).toMatchObject({ status: 'refused', code: 'stale-edit', affectedMarkerIds: [] })
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
  expect(replaceShowV2).not.toHaveBeenCalled()
  expect(otherWrites).not.toHaveBeenCalled()
})
it.each(['unchanged', 'unsafe-time', 'missing-marker', 'duplicate-marker', 'unsupported-provider', 'advanced-preview'] as const)('preserves the complete prior state and writes nothing for %s', async partition => {
  const { record, request, replaceShowV2 } = setup()
  if (partition === 'advanced-preview') record.composition.clips[0].entryPolicy = 'restart'
  if (partition === 'unsupported-provider') setPersonalContentProvider({ id: 'no-v2-write' } as PersonalContentProvider)
  const intent = partition === 'duplicate-marker' ? { kind: 'add' as const, marker: { id: 'marker', timeMs: 0 } } : { kind: 'move' as const, markerId: partition === 'missing-marker' ? 'absent' : 'marker', timeMs: partition === 'unchanged' ? 0 : partition === 'unsafe-time' ? 0.5 : 9000 }
  const before = structuredClone(record)
  const result = await admitShowV2PilotMarkerEdit({ ...request, intent })
  expect(result.status).toBe(partition === 'unchanged' ? 'unchanged' : 'refused')
  expect(result.affectedMarkerIds).toEqual([])
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(record).toEqual(before)
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
  expect(replaceShowV2).not.toHaveBeenCalled()
})
it('Undo/Redo each saves one complete Marker state and current save failure restores its durable history pair', async () => {
  const { record, request, replaceShowV2 } = setup()
  expect((await admitShowV2PilotMarkerEdit(request)).status).toBe('applied')
  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  expect(useShowStore.getState().showV2Pilots[record.id].composition.markers[0].timeMs).toBe(0)
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(useShowStore.getState().showV2Pilots[record.id].composition.markers[0].timeMs).toBe(9000)
  expect(replaceShowV2).toHaveBeenCalledTimes(3)
  const durable = useShowStore.getState().showV2Pilots[record.id]
  const history = structuredClone(useShowStore.getState().showV2Histories[record.id])
  replaceShowV2.mockRejectedValueOnce(new Error('offline'))
  await expect(admitShowV2PilotMarkerEdit({ ...request, baseRevision: useShowStore.getState().showRevisions[record.id], intent: { kind: 'update', markerId: 'marker', patch: { name: 'Unsaved' } } })).rejects.toThrow('offline')
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(durable)
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual(history)
  expect(useShowStore.getState().showV2SaveFailure?.showId).toBe(record.id)
})

it('admits a structurally valid empty Show, saves/reopens it and preserves empty content through Undo/Redo', async () => {
  const { record, request, replaceShowV2 } = setup()
  record.composition.clips = []
  record.composition.transitions = []
  expect((await admitShowV2PilotMarkerEdit(request)).status).toBe('applied')
  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(replaceShowV2).toHaveBeenCalledTimes(3)
  const reopened = await useShowStore.getState().reloadShowV2Pilot(record.id)
  expect(reopened?.composition.clips).toEqual([])
  expect(reopened?.composition.markers[0].timeMs).toBe(9000)
  expect(reopened?.composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(() => compileShowV2PilotArtifact(reopened!, request.assets)).toThrow()
})

it('refuses an invalid empty record without treating compilation failure as permission to save', async () => {
  const { record, request, replaceShowV2 } = setup()
  record.composition.clips = []
  record.composition.transitions = []
  record.composition.showEndMs = -1
  expect(await admitShowV2PilotMarkerEdit(request)).toMatchObject({ status: 'refused', code: 'invalid-marker', affectedMarkerIds: [] })
  expect(replaceShowV2).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
})
