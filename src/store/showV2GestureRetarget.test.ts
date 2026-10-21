import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import { retargetShowV2GestureCaptureV2 } from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotClipTemporal } from './showV2PreparedEditAdmission'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
let index = 0
const captureFor = (record: ShowRecordV2, dependencies: stage.ShowPreparedStageDependenciesV2) => ({ record, dependencies, prepared: stage.prepareShowStageV2(record, dependencies) })
function setup() {
  const c = convertShowRecordV1ToV2(convertibleV1Show())
  if (c.status !== 'converted') throw Error('Conversion')
  const record = c.record
  record.id = `gesture-${++index}`
  record.composition.showEndMs = 30000
  record.composition.layoutOccurrences[0].durationMs = 30000
  record.composition.transitions = []
  record.composition.propertyTracks = []
  record.composition.clips = record.composition.clips.slice(0, 1)
  record.composition.clips[0].durationMs = 10000
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies: stage.ShowPreparedStageDependenciesV2 = { patterns: [{ id: 'voice', name: 'Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'gesture-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = { showId: record.id, baseRevision: 0, capture: captureFor(record, dependencies), isCurrent: () => true, onAdopted: vi.fn() }
  return { record, context, write, readSaved: () => saved }
}
type Context = ReturnType<typeof setup>['context']
function move(context: Context, capture: Context['capture'], isCurrent = () => true) {
  return admitShowV2PilotClipTemporal({ ...context, capture, isCurrent, intent: { kind: 'move', clipId: context.capture.record.composition.clips[0].id, startMs: 1000 } })
}
function expectPreserved(record: ShowRecordV2, write: ReturnType<typeof setup>['write']) {
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
}
function expectApplied({ record, write, readSaved }: ReturnType<typeof setup>) {
  expect(write).toHaveBeenCalledTimes(1)
  expect(readSaved().composition.clips[0].startMs).toBe(1000)
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(readSaved())
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [record], future: [] })
}

it('re-targets only a different capture of the same record', () => {
  const { record, context } = setup()
  const A = context.capture
  const B = captureFor(record, structuredClone(A.dependencies))
  expect(retargetShowV2GestureCaptureV2(A, A)).toBe(A)
  expect(retargetShowV2GestureCaptureV2(A, null)).toBe(A)
  expect(retargetShowV2GestureCaptureV2(A, undefined)).toBe(A)
  expect(retargetShowV2GestureCaptureV2(A, captureFor(structuredClone(record), A.dependencies))).toBe(A)
  expect(retargetShowV2GestureCaptureV2(A, B)).toBe(B)
})

it('commits after an unrelated load while the old exact-capture check refuses (#1181)', async () => {
  const state = setup()
  const { record, context, write } = state
  const A = context.capture
  const D1 = A.dependencies
  const D2 = { ...D1, patterns: [...D1.patterns, { id: 'other', name: 'Other', src: 'export function render(i){rgb(0,0,1)}', controls: {}, updatedAt: 2 }] }
  const B = captureFor(record, D2)
  expect(await move(context, A, () => B === A)).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' })
  expectPreserved(record, write)
  expect(await move(context, retargetShowV2GestureCaptureV2(A, B))).toMatchObject({ status: 'applied' })
  expectApplied(state)
})

it('refuses a changed Show record', async () => {
  const { record, context, write } = setup()
  const clone = structuredClone(record)
  useShowStore.setState({ showV2Pilots: { [record.id]: clone } })
  const A = context.capture
  const B = captureFor(clone, A.dependencies)
  expect(retargetShowV2GestureCaptureV2(A, B)).toBe(A)
  expect(await move(context, retargetShowV2GestureCaptureV2(A, B))).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' })
  expectPreserved(clone, write)
})

it('refuses a changed Show revision', async () => {
  const { record, context, write } = setup()
  useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  const A = context.capture
  const B = captureFor(record, structuredClone(A.dependencies))
  expect(await move(context, retargetShowV2GestureCaptureV2(A, B))).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' })
  expectPreserved(record, write)
})

it('commits after an identical dependency reload', async () => {
  const state = setup()
  const { record, context } = state
  const A = context.capture
  const B = captureFor(record, structuredClone(A.dependencies))
  expect(await move(context, retargetShowV2GestureCaptureV2(A, B))).toMatchObject({ status: 'applied' })
  expectApplied(state)
})

it('commits against a referenced Pattern changed during the gesture', async () => {
  const state = setup()
  const { record, context, readSaved } = state
  const A = context.capture
  const D1 = A.dependencies
  const D2 = { ...D1, patterns: [{ ...D1.patterns[0], src: D1.patterns[0].src.replace('elapsed/1000', 'elapsed/2000') }] }
  const B = captureFor(record, D2)
  expect(await move(context, retargetShowV2GestureCaptureV2(A, B))).toMatchObject({ status: 'applied' })
  expectApplied(state)
  expect(stage.prepareShowStageV2(readSaved(), D2).status).toBe('ready')
})

it('refuses a missing dependency without a partial commit', async () => {
  const { record, context, write } = setup()
  const A = context.capture
  const B = captureFor(record, { ...A.dependencies, patterns: [] })
  expect(B.prepared.status).toBe('refused')
  expect(await move(context, retargetShowV2GestureCaptureV2(A, B))).toMatchObject({ status: 'refused', source: 'admission' })
  expectPreserved(record, write)
})
