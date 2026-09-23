import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { showV2LayoutEditorFixture } from '../test/showV2LayoutEditorFixture'
import { editShowLayoutIntervalsV2 } from '../engine/showLayoutIntervalsV2'
import { planShowV2LayoutEdit, type ShowV2LayoutEditorRequest } from '../engine/showV2LayoutEditorModel'
import {
  getPersonalContentProvider,
  resetPersonalContentProvider,
  setPersonalContentProvider,
} from '../engine/personalContentProvider'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotLayoutOccurrenceEdit,
  type ShowV2PilotLayoutOccurrenceIntent,
} from './showV2PreparedEditAdmission'

/**
 * The Layout lane's remaining occurrence operations through the closed
 * admission (#1056 slice 4): duplicate, split position and the incoming
 * transfer. Each adopted edit is one preparation, one history entry and one
 * save; each refusal writes nothing and keeps the original record identity.
 */
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

let fixtureIndex = 0

function setup() {
  const { record, dependencies } = showV2LayoutEditorFixture()
  record.id = `layout-lane-${++fixtureIndex}`
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'layout-lane-provider', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = captureShowStageEditV2(record, dependencies)
  expect(capture.prepared.status, capture.prepared.status === 'refused' ? capture.prepared.message : '').toBe('ready')
  return {
    record,
    write,
    saved: () => saved,
    context: { showId: record.id, baseRevision: 0, capture, isCurrent: () => true, onAdopted: vi.fn() },
  }
}

function allocator(prefix: string): () => string {
  let index = 0
  return () => `${prefix}-${++index}`
}

function effects(value: object) {
  return Object.entries(value).filter(([key]) => key.startsWith('affected') || key === 'removedLayoutOccurrenceIds')
}

const requests: Exclude<ShowV2LayoutEditorRequest, { kind: 'insert-interval' }>[] = [
  { kind: 'duplicate', occurrenceId: 'later-layout', content: 'copy' },
  { kind: 'duplicate', occurrenceId: 'later-layout', content: 'empty' },
  { kind: 'set-parameters', occurrenceId: 'later-layout', parameters: { splitPosition: 0.4 } },
  { kind: 'set-transfer', occurrenceId: 'later-layout', transfer: { durationMs: 400, direction: 'forward', easing: { curve: 'linear' } } },
]

describe('v2 Layout lane admission', () => {
  it.each(requests)('admits a planned $kind with the owner\'s own effects, one history entry and one save', async request => {
    const { record, context, write, saved } = setup()
    const plan = planShowV2LayoutEdit(record, request, allocator('fresh'))
    if (plan.status !== 'ready') throw new Error(plan.message)
    const expected = editShowLayoutIntervalsV2(record, plan.intent)
    expect(expected.status, expected.status === 'refused' ? expected.message : '').toBe('changed')

    const result = await admitShowV2PilotLayoutOccurrenceEdit({ ...context, intent: plan.intent })

    expect(result).toMatchObject({ status: 'applied', settlement: 'saved' })
    expect(effects(result)).toEqual(effects(expected))
    expect(write).toHaveBeenCalledTimes(1)
    expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
    if (expected.status !== 'changed') return
    expect(saved().composition).toEqual(expected.record.composition)
  })

  it('clears an existing transfer and leaves every other owner exact', async () => {
    const { record, context, write, saved } = setup()
    const [first, later] = record.composition.layoutOccurrences
    later.incomingTransfer = { id: 'incoming', fromOccurrenceId: first.id, durationMs: 500, direction: 'forward', easing: { curve: 'linear' } }
    const capture = captureShowStageEditV2(record, context.capture.dependencies)

    const result = await admitShowV2PilotLayoutOccurrenceEdit({
      ...context, capture, intent: { kind: 'set-transfer', occurrenceId: later.id, transfer: null },
    })

    expect(result).toMatchObject({ status: 'applied', settlement: 'saved' })
    expect(write).toHaveBeenCalledTimes(1)
    expect(saved().composition.layoutOccurrences[1].incomingTransfer).toBeUndefined()
    expect(saved().composition.clips).toEqual(record.composition.clips)
    expect(saved().composition.markers).toEqual(record.composition.markers)
  })

  it.each([
    { kind: 'duplicate', occurrenceId: 'later-layout' },
    { kind: 'duplicate', occurrenceId: 'later-layout', newOccurrenceId: 'fresh', content: { idsBySourceId: { a: 1 } } },
    { kind: 'duplicate', occurrenceId: 'later-layout', newOccurrenceId: 'fresh', content: {} },
    { kind: 'set-parameters', occurrenceId: 'later-layout', parameters: { splitPosition: 'half' } },
    { kind: 'set-parameters', occurrenceId: 'later-layout', parameters: { splitPosition: 0.5, extra: 1 } },
    { kind: 'set-transfer', occurrenceId: 'later-layout', transfer: { durationMs: 400, direction: 'sideways', id: 'x' } },
    { kind: 'set-transfer', occurrenceId: 'later-layout', transfer: { durationMs: 400, direction: 'forward', id: 'x', fromOccurrenceId: 'a' } },
    { kind: 'set-transfer', occurrenceId: 'later-layout', transfer: { durationMs: 0.5, direction: 'forward', id: 'x' } },
  ])('refuses the malformed intent $kind with zero writes', async intent => {
    const { record, context, write } = setup()

    const result = await admitShowV2PilotLayoutOccurrenceEdit({
      ...context, intent: intent as unknown as ShowV2PilotLayoutOccurrenceIntent,
    })

    expect(result).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-intent' })
    for (const [, array] of effects(result)) expect(array).toEqual([])
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  })

  it('refuses a content duplicate whose interval crosses the boundary and writes nothing', async () => {
    const { record, context, write } = setup()
    const first = record.composition.layoutOccurrences[0]
    // The spanning Main Clip crosses the initial occurrence's own boundary.
    const plan = planShowV2LayoutEdit(record, { kind: 'duplicate', occurrenceId: first.id, content: 'copy' }, allocator('fresh'))
    if (plan.status !== 'ready') throw new Error(plan.message)

    const result = await admitShowV2PilotLayoutOccurrenceEdit({ ...context, intent: plan.intent })

    expect(result).toMatchObject({ status: 'refused', source: 'owner', code: 'boundary-crossing-content' })
    expect(write).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  })
})
