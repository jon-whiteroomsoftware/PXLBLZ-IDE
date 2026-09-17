import { describe, expect, it } from 'vitest'
import { applyShowCommandV2 } from './showCommandsV2/registry'
import { writeShowInstancePropertiesV2 } from './showInstancePropertiesV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

/**
 * The shared Pattern-instance value owner behind `update_clips.instance_properties`.
 *
 * Specification section 4 keeps controls, clock and evaluation policy on the
 * Pattern instance, so writing one is a shared edit: every Clip on that runtime
 * observes it, and the result reports them. The editor's admission wrapper calls
 * this same owner, so the route and the command cannot diverge.
 */
function fixture(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Fixture conversion failed')
  expect(validateShowRecordV2(converted.record)).toEqual([])
  return converted.record
}

function reopen(record: ShowRecordV2): ShowRecordV2 {
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (opened.status !== 'opened') throw new Error('Edited record did not reopen')
  return opened.record
}

describe('v2 Pattern-instance value owner', () => {
  it('writes the authored clock values and reports every Clip on the runtime', () => {
    const record = fixture()
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, 'clip', { time_scale: 0.5, evaluation: 'freeze-at-entry' }, undefined)

    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    const next = reopen(result.record)
    expect(next.composition.patternInstances[0].time.timeScale).toBe(0.5)
    expect(next.composition.patternInstances[0].evaluationPolicy).toBe('freeze-at-entry')
    expect(result.affectedInstanceIds).toEqual(['instance'])
    expect(result.affectedClipIds).toEqual(['clip'])
    expect(record).toEqual(before)
  })

  it('writes and clears the stepped clock through the same owner', () => {
    const stuttered = writeShowInstancePropertiesV2(fixture(), 'clip', { stepped_clock: { stepMs: 250 } }, undefined)
    expect(stuttered.status).toBe('changed')
    if (stuttered.status !== 'changed') return
    expect(reopen(stuttered.record).composition.patternInstances[0].time.steppedClock).toEqual({ stepMs: 250 })

    const cleared = writeShowInstancePropertiesV2(stuttered.record, 'clip', { stepped_clock: null }, undefined)
    expect(cleared.status).toBe('changed')
    if (cleared.status !== 'changed') return
    expect(reopen(cleared.record).composition.patternInstances[0].time.steppedClock).toBeUndefined()
    expect(reopen(cleared.record)).toEqual(reopen(fixture()))
  })

  it.each([
    { name: 'a zero step', properties: { stepped_clock: { stepMs: 0 } } },
    { name: 'an unsupported stepped-clock field', properties: { stepped_clock: { stepMs: 250, phase: 1 } } },
    { name: 'a missing Clip', properties: { time_scale: 1 }, clipId: 'missing' },
  ])('refuses $name without writing', ({ properties, clipId }) => {
    const record = fixture()
    const before = structuredClone(record)
    const result = writeShowInstancePropertiesV2(record, clipId ?? 'clip', properties, undefined)

    expect(result.status).toBe('refused')
    expect(result.record).toBe(record)
    expect(record).toEqual(before)
  })

  it('returns the original record identity when nothing changes', () => {
    const record = fixture()
    const result = writeShowInstancePropertiesV2(record, 'clip', {
      time_scale: record.composition.patternInstances[0].time.timeScale,
    }, undefined)

    expect(result.status).toBe('unchanged')
    expect(result.record).toBe(record)
  })

  it('is the writer the update_clips command already uses', () => {
    const viaOwner = writeShowInstancePropertiesV2(fixture(), 'clip', { time_scale: 0.25 }, undefined)
    const viaCommand = applyShowCommandV2(fixture(), 'update_clips', {
      updates: [{ clip_id: 'clip', instance_properties: { time_scale: 0.25 } }],
    })

    expect(viaOwner.status).toBe('changed')
    expect(viaCommand.status).toBe('changed')
    if (viaOwner.status !== 'changed' || viaCommand.status !== 'changed') return
    expect(viaCommand.record).toEqual(viaOwner.record)
  })
})
