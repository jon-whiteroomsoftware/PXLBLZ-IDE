import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createDefaultShow } from '../engine/showModel'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import * as stage from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotClipDelete, admitShowV2PilotClipTemporal } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

const LEFT = 'placement-cell-1-scene-1'
const RIGHT = 'placement-cell-2-scene-2'
const BOUNDARY = 'transition-scene-1'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider() })

let index = 0
function setup() {
  const source = createDefaultShow('boundary-admission', 'Boundary admission', 1)
  const converted = convertShowRecordV1ToV2(source, {
    byCellId: Object.fromEntries(source.cells.map(cell => [cell.id, DEMOS[resolveStockPatternId(cell.pattern.id)]])),
  })
  if (converted.status !== 'converted') throw new Error(JSON.stringify(converted.issues))
  const record = converted.record
  record.id = `boundary-${++index}`
  const voice = (id: string) => ({ id, name: `Voice ${id}`, src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 })
  record.composition.patternInstances.forEach((instance, ordinal) => {
    instance.pattern = { kind: 'user', id: `voice-${ordinal}` }
  })
  const dependencies: stage.ShowPreparedStageDependenciesV2 = {
    patterns: record.composition.patternInstances.map(instance => voice((instance.pattern as { id: string }).id)),
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({
    ...getPersonalContentProvider(), id: 'boundary-test', replaceShowV2: write,
    listShowDocumentsV2: async () => [structuredClone(saved)],
  })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const prepared = stage.prepareShowStageV2(record, dependencies)
  if (prepared.status === 'refused') throw new Error(prepared.message)
  const context = { showId: record.id, baseRevision: 0, capture: { record, dependencies, prepared }, isCurrent: () => true, onAdopted: vi.fn() }
  return { record, context, write, readSaved: () => saved }
}

function unstamp(record: ShowRecordV2): ShowRecordV2 {
  return { ...structuredClone(record), updatedAt: 0 }
}

function freshContext(context: ReturnType<typeof setup>['context']) {
  const record = useShowStore.getState().showV2Pilots[context.showId]
  return {
    ...context,
    baseRevision: useShowStore.getState().showRevisions[context.showId] ?? 0,
    capture: { ...context.capture, record, prepared: stage.prepareShowStageV2(record, context.capture.dependencies) },
  }
}

it('admits a converted-boundary trim as one edit with exact Undo and Redo', async () => {
  const { record, context, write } = setup()
  const before = structuredClone(record)
  const outcome = await admitShowV2PilotClipTemporal({
    ...freshContext(context),
    intent: { kind: 'trim', clipId: RIGHT, startMs: 36000, endMs: 62000 },
  })
  expect(outcome.status).toBe('applied')
  if (outcome.status !== 'applied') return
  expect(outcome.settlement).toBe('saved')
  expect(write).toHaveBeenCalledTimes(1)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
  const repaired = structuredClone(useShowStore.getState().showV2Pilots[record.id])
  expect(repaired.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([
    [LEFT, 0, 30000],
    [RIGHT, 34000, 26000],
  ])
  expect(repaired.composition.transitions).toEqual([])
  expect(repaired.composition.showEndMs).toBe(60000)

  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  expect(unstamp(useShowStore.getState().showV2Pilots[record.id])).toEqual(unstamp(before))
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(unstamp(useShowStore.getState().showV2Pilots[record.id])).toEqual(unstamp(repaired))
})

it('admits a converted-boundary delete as one edit with exact Undo and Redo', async () => {
  const { record, context, write } = setup()
  const before = structuredClone(record)
  const outcome = await admitShowV2PilotClipDelete({
    ...freshContext(context),
    intent: { kind: 'delete-clip', clipId: RIGHT },
  })
  expect(outcome.status).toBe('applied')
  if (outcome.status !== 'applied') return
  expect(write).toHaveBeenCalledTimes(1)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
  const removed = structuredClone(useShowStore.getState().showV2Pilots[record.id])
  expect(removed.composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([[LEFT, 0, 30000]])
  expect(removed.composition.transitions).toEqual([])
  expect(removed.composition.showEndMs).toBe(62000)
  expect(outcome.removedIds).toEqual(expect.arrayContaining([RIGHT, BOUNDARY]))

  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  expect(unstamp(useShowStore.getState().showV2Pilots[record.id])).toEqual(unstamp(before))
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(unstamp(useShowStore.getState().showV2Pilots[record.id])).toEqual(unstamp(removed))
})
