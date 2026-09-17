import { describe, expect, it } from 'vitest'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import {
  editShowLayoutIntervalsV2,
  showLayoutDuplicateSourceIdsV2,
} from './showLayoutIntervalsV2'
import { buildShowV2LayoutEditorModel, planShowV2LayoutEdit } from './showV2LayoutEditorModel'
import {
  parseProvisionalShowRecordV2,
  serializeProvisionalShowRecordV2,
  validateShowRecordV2,
  type ShowRecordV2,
} from './showCompositionV2'

/**
 * The Layout lane the v2 editor route draws (#1056 slice 4). The lane's own
 * operations are the specification's section 8 occurrence edits; each one
 * plans an intent the landed owner accepts, and every refusal returns the
 * original record identity with no partial write.
 */
function allocator(prefix: string): () => string {
  let index = 0
  return () => `${prefix}-${++index}`
}

function fixture(): ShowRecordV2 {
  return showV2LayoutEditorFixture().record
}

function reopened(record: ShowRecordV2): ShowRecordV2 {
  const result = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(record))
  if (result.status !== 'opened') throw new Error(JSON.stringify(result.issues))
  return result.record
}

describe('v2 Layout lane editor model', () => {
  it('draws each occurrence with its own routing parameters, transfer and predecessor', () => {
    const record = fixture()
    const [first, later] = record.composition.layoutOccurrences
    later.parameters = { splitPosition: 0.25 }
    later.incomingTransfer = {
      id: 'transfer', fromOccurrenceId: first.id, durationMs: 500, direction: 'forward', easing: { curve: 'linear' },
    }
    expect(validateShowRecordV2(record)).toEqual([])

    const model = buildShowV2LayoutEditorModel(record)

    expect(model.occurrences.map(occurrence => [
      occurrence.id, occurrence.previousOccurrenceId, occurrence.splitPosition, occurrence.incomingTransfer?.durationMs ?? null,
    ])).toEqual([
      [first.id, null, undefined, null],
      ['later-layout', first.id, 0.25, 500],
    ])
  })

  it('plans set-parameters, duplicate with complete fresh identity, and a transfer the owner accepts', () => {
    const record = fixture(), original = structuredClone(record)
    const later = record.composition.layoutOccurrences[1]

    const split = planShowV2LayoutEdit(record, { kind: 'set-parameters', occurrenceId: later.id, parameters: { splitPosition: 0.4 } }, allocator('unused'))
    expect(split).toEqual({ status: 'ready', intent: { kind: 'set-parameters', occurrenceId: later.id, parameters: { splitPosition: 0.4 } } })

    const duplicate = planShowV2LayoutEdit(record, { kind: 'duplicate', occurrenceId: later.id, content: 'copy' }, allocator('fresh'))
    if (duplicate.status !== 'ready' || duplicate.intent.kind !== 'duplicate') throw new Error('duplicate plan')
    const sourceIds = showLayoutDuplicateSourceIdsV2(record, later.id)!
    expect(Object.keys(duplicate.intent.content!.idsBySourceId).sort()).toEqual([...sourceIds].sort())
    expect(new Set(Object.values(duplicate.intent.content!.idsBySourceId)).size).toBe(sourceIds.length)
    expect(duplicate.intent.newOccurrenceId).toBe('fresh-1')

    const transfer = planShowV2LayoutEdit(record, {
      kind: 'set-transfer', occurrenceId: later.id, transfer: { durationMs: 400, direction: 'forward', easing: { curve: 'linear' } },
    }, allocator('transfer'))
    expect(transfer).toEqual({
      status: 'ready',
      intent: {
        kind: 'set-transfer', occurrenceId: later.id,
        transfer: { id: 'transfer-1', durationMs: 400, direction: 'forward', easing: { curve: 'linear' } },
      },
    })

    // Every planned intent reaches the landed owner and reopens.
    for (const plan of [split, duplicate, transfer]) {
      if (plan.status !== 'ready') throw new Error('plan')
      const result = editShowLayoutIntervalsV2(record, plan.intent)
      expect(result.status, result.status === 'refused' ? result.message : '').toBe('changed')
      if (result.status !== 'changed') continue
      expect(validateShowRecordV2(result.record)).toEqual([])
      expect(reopened(result.record).composition.layoutOccurrences.length)
        .toBe(record.composition.layoutOccurrences.length + (plan.intent.kind === 'duplicate' ? 1 : 0))
    }
    expect(record).toEqual(original)
  })

  it('clears a transfer without allocating identity and keeps the occurrence', () => {
    const record = fixture()
    const [first, later] = record.composition.layoutOccurrences
    later.incomingTransfer = {
      id: 'transfer', fromOccurrenceId: first.id, durationMs: 500, direction: 'forward', easing: { curve: 'linear' },
    }

    const plan = planShowV2LayoutEdit(record, { kind: 'set-transfer', occurrenceId: later.id, transfer: null }, () => {
      throw new Error('clearing a transfer allocates no identity')
    })

    expect(plan).toEqual({ status: 'ready', intent: { kind: 'set-transfer', occurrenceId: later.id, transfer: null } })
    if (plan.status !== 'ready') return
    const result = editShowLayoutIntervalsV2(record, plan.intent)
    expect(result.status).toBe('changed')
    if (result.status !== 'changed') return
    expect(result.record.composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()
    expect(result.record.composition.layoutOccurrences).toHaveLength(2)
  })

  it('refuses an unknown occurrence, a conflicting fresh identity and a duplicate identity collision', () => {
    const record = fixture()
    const later = record.composition.layoutOccurrences[1]

    expect(planShowV2LayoutEdit(record, { kind: 'duplicate', occurrenceId: 'absent', content: 'copy' }, allocator('fresh')))
      .toMatchObject({ status: 'refused' })
    expect(planShowV2LayoutEdit(record, { kind: 'set-parameters', occurrenceId: 'absent', parameters: {} }, allocator('fresh')))
      .toMatchObject({ status: 'refused' })
    expect(planShowV2LayoutEdit(record, {
      kind: 'set-transfer', occurrenceId: later.id, transfer: { durationMs: 400, direction: 'forward' },
    }, () => later.id)).toMatchObject({ status: 'refused', message: expect.stringContaining('identity') })
    expect(planShowV2LayoutEdit(record, { kind: 'duplicate', occurrenceId: later.id, content: 'copy' }, () => later.id))
      .toMatchObject({ status: 'refused', message: expect.stringContaining('identity') })
  })

  it('protects an owned split-position track when the switch moves and leaves the record unchanged', () => {
    const record = fixture()
    const later = record.composition.layoutOccurrences[1]
    record.composition.propertyTracks.push({
      id: 'split-owned',
      target: { kind: 'layout-occurrence-split-position', layoutOccurrenceId: later.id },
      activeStartMs: 5_500,
      activeDurationMs: 1_000,
      keyframes: [
        { id: 'split-start', timeMs: 5_500, value: 0.5, easing: { curve: 'linear' } },
        { id: 'split-end', timeMs: 6_500, value: 0.5, easing: { curve: 'linear' } },
      ],
    })
    const original = structuredClone(record)

    const plan = planShowV2LayoutEdit(record, { kind: 'move', occurrenceId: later.id, startMs: 6_000 }, allocator('x'))
    if (plan.status !== 'ready') throw new Error(plan.message)
    const result = editShowLayoutIntervalsV2(record, plan.intent)

    expect(result).toMatchObject({ status: 'refused', code: 'owned-track-out-of-bounds' })
    expect(result.record).toBe(record)
    expect(record).toEqual(original)
  })
})
