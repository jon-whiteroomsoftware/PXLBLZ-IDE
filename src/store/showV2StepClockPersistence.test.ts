import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { propertyEditRecord, propertyEditTrack } from '../test/showV2PropertyEditsFixture'
import { openV2EditorForRecord } from '../test/showEditorV2Harness'
import { applyShowCommandV2 } from '../engine/showCommandsV2/registry'
import { editShowPropertyV2 } from '../engine/showPropertyEditsV2'
import { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2, validateShowRecordV2, type ShowRecordV2 } from '../engine/showCompositionV2'
import { cloneValidShowRecordV2ForWorker } from '../cloudflare/showV2Codec'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })

let fixtureId = 0
function recordFixture() {
  const record = propertyEditRecord()
  record.id = `step-clock-persistence-${++fixtureId}`
  return record
}

function candidate(record: ShowRecordV2) {
  const track = propertyEditTrack({ kind: 'instance-time-step-ms', instanceId: record.composition.patternInstances[0].id })
  track.keyframes = track.keyframes.map((key, i) => ({ ...key, value: i * 250, easing: { curve: 'hold', at: 1 } }))
  const before = structuredClone(record)
  const result = editShowPropertyV2(record, { kind: 'show' }, { kind: 'add-track', track })
  expect(record).toEqual(before)
  expect(result.status).toBe('changed')
  if (result.status !== 'changed') throw Error(JSON.stringify(result))
  expect(validateShowRecordV2(result.record)).toEqual([])
  return { next: result.record, track }
}
function reopen(record: ShowRecordV2) {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (result.status !== 'opened') throw Error(JSON.stringify(result.issues))
  expect(validateShowRecordV2(result.record)).toEqual([])
  expect(result.record).toEqual(record)
  return result.record
}
function last(record: ShowRecordV2) { return record.composition.propertyTracks[record.composition.propertyTracks.length - 1] }

it('adopts one complete step record, persists through undo/redo and has no effects for no-op/refusal', async () => {
  const record = recordFixture()
  const before = structuredClone(record)
  const editor = openV2EditorForRecord(record)
  const { next, track } = candidate(record)
  await useShowStore.getState().updateShowV2Pilot(record.id, next)
  expect(editor.state()).toMatchObject({ history: { past: [record], future: [] }, revision: 1, v2Writes: 1, legacyWrites: 0 })
  expect(last(editor.state().record)).toEqual(track)
  reopen(editor.state().record)
  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  expect(editor.state().record.composition).toEqual(record.composition)
  expect(editor.state()).toMatchObject({ v2Writes: 2, legacyWrites: 0 })
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(last(editor.state().record)).toEqual(track)
  expect(editor.state()).toMatchObject({ v2Writes: 3, legacyWrites: 0 })
  reopen(editor.state().record)
  const settled = editor.state()
  for (const value of [250, 15]) {
    const current = editor.state().record
    const snapshot = structuredClone(current)
    const result = applyShowCommandV2(current, 'edit_property_keyframes', { track_id: track.id, edits: { update: [{ keyframe_id: track.keyframes[1].id, value }] } })
    expect(result.status).toBe(value === 250 ? 'unchanged' : 'refused')
    expect(result.record).toBe(current)
    expect(current).toEqual(snapshot)
    if (result.status === 'changed') await useShowStore.getState().updateShowV2Pilot(record.id, result.record)
    expect(editor.state()).toEqual(settled)
  }
  expect(record).toEqual(before)
})

it('round-trips the saved complete payload through serialization, Worker admission and reload', async () => {
  const record = recordFixture()
  const editor = openV2EditorForRecord(record)
  const { next, track } = candidate(record)
  let saved: ShowRecordV2 | undefined
  const write = vi.fn(async (_id: string, value: ShowRecordV2) => { saved = cloneValidShowRecordV2ForWorker(reopen(value)) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), replaceShowV2: write, listShowDocumentsV2: async () => [saved!] })
  await useShowStore.getState().updateShowV2Pilot(record.id, next)
  expect(write).toHaveBeenCalledTimes(1)
  expect(saved).toEqual(editor.state().record)
  expect(saved!.version).toBe(2)
  expect(last(saved!)).toEqual(track)
  expect(await useShowStore.getState().reloadShowV2Pilot(record.id)).toEqual(saved)
  expect(last(reopen(editor.state().record))).toEqual(track)
  expect(editor.state().legacyWrites).toBe(0)
})

it('rolls back a failed current replacement to the original complete record and history', async () => {
  const record = recordFixture()
  const editor = openV2EditorForRecord(record)
  const original = structuredClone(editor.state())
  const { next } = candidate(record)
  const write = vi.fn().mockRejectedValueOnce(Error('Write failed'))
  setPersonalContentProvider({ ...getPersonalContentProvider(), replaceShowV2: write })
  await expect(useShowStore.getState().updateShowV2Pilot(record.id, next)).rejects.toThrow('Write failed')
  expect(write).toHaveBeenCalledTimes(1)
  expect(editor.state().record).toEqual(original.record)
  expect(editor.state().history).toEqual(original.history)
  expect(editor.state().legacyWrites).toBe(0)
  reopen(editor.state().record)
})
