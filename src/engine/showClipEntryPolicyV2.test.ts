import { describe, expect, it } from 'vitest'
import { editShowClipV2 } from './showClipsV2'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

/**
 * The one shared owner that writes an existing Clip's entry policy.
 *
 * Specification section 4 makes Restart an authored Clip-entry instruction, so
 * writing it is an ordinary explicit edit: it changes exactly one Clip, cascades
 * nothing, and reports that Clip alone. The `update_clips` command and the
 * editor's admission wrapper both call this owner, so a Continue/Restart toggle
 * cannot drift from the command that already wrote it.
 */
function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
  const record = converted.record
  record.composition.clips[0].entryPolicy = 'continue'
  expect(validateShowRecordV2(record)).toEqual([])
  return record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Edited record did not reopen')
  return opened.record
}

describe('v2 Clip entry policy owner', () => {
  it('writes one Clip, reports it alone and leaves the preimage untouched', () => {
    const record = fixture()
    const before = structuredClone(record)
    const result = editShowClipV2(record, { kind: 'set-entry-policy', clipId: 'clip', entryPolicy: 'restart' })

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(reopen(result.record).composition.clips[0].entryPolicy).toBe('restart')
    expect(result.affectedClipIds).toEqual(['clip'])
    expect(result.affectedTrackIds).toEqual([])
    expect(result.affectedInstanceIds).toEqual([])
    // Nothing but the one authored flag moves: times, sharing and tracks stand.
    expect({ ...result.record.composition.clips[0], entryPolicy: 'continue' })
      .toEqual(record.composition.clips[0])
    expect(result.record.composition.patternInstances).toEqual(record.composition.patternInstances)
    expect(result.record.composition.propertyTracks).toEqual(record.composition.propertyTracks)
    expect(record).toEqual(before)
  })

  it('returns the original record identity for an unchanged policy', () => {
    const record = fixture()
    const result = editShowClipV2(record, { kind: 'set-entry-policy', clipId: 'clip', entryPolicy: 'continue' })

    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(record)
    expect(result.affectedClipIds).toEqual([])
  })

  it.each([
    { name: 'an unknown Clip', intent: { kind: 'set-entry-policy', clipId: 'missing', entryPolicy: 'restart' }, code: 'missing-clip' },
    { name: 'a blank Clip identity', intent: { kind: 'set-entry-policy', clipId: '', entryPolicy: 'restart' }, code: 'missing-clip' },
    { name: 'an unsupported policy', intent: { kind: 'set-entry-policy', clipId: 'clip', entryPolicy: 'reset' }, code: 'invalid-intent' },
    { name: 'an extra field', intent: { kind: 'set-entry-policy', clipId: 'clip', entryPolicy: 'restart', cascade: true }, code: 'invalid-intent' },
  ])('refuses $name without writing', ({ intent, code }) => {
    const record = fixture()
    const before = structuredClone(record)
    const result = editShowClipV2(record, intent as never)

    expect(result.status).toBe('refused')
    if (result.status !== 'refused') return
    expect(result.code).toBe(code)
    expect(result.record).toBe(record)
    expect(result.affectedClipIds).toEqual([])
    expect(record).toEqual(before)
  })

  it('is the same writer the update_clips command uses', () => {
    const viaOwner = editShowClipV2(fixture(), { kind: 'set-entry-policy', clipId: 'clip', entryPolicy: 'restart' })
    const viaCommand = applyShowCommandV2(fixture(), 'update_clips', {
      updates: [{ clip_id: 'clip', entry_policy: 'restart' }],
    })

    expect(viaOwner.status).toBe('changed')
    expect(viaCommand.status).toBe('changed')
    if (viaOwner.status !== 'changed' || viaCommand.status !== 'changed') return
    expect(viaCommand.record).toEqual(viaOwner.record)
    expect(viaCommand.changes[0].details.clips).toEqual(['clip'])
  })

  it('keeps the command\'s Zone sample mode write alongside the shared owner', () => {
    const outcome = applyShowCommandV2(fixture(), 'update_clips', {
      updates: [{ clip_id: 'clip', entry_policy: 'restart', zone_sample_mode: 'span' }],
    })

    expect(outcome.status).toBe('changed')
    if (outcome.status !== 'changed') return
    expect(outcome.record.composition.clips[0]).toMatchObject({ entryPolicy: 'restart', zoneSampleMode: 'span' })
  })
})
