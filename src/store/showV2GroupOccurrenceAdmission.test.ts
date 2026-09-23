import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { showV2GroupOccurrenceEditorFixture } from '../test/showV2GroupOccurrenceEditorFixture'
import { planShowV2GroupOccurrenceEdit, type ShowV2GroupOccurrenceIntent } from '../engine/showV2GroupOccurrenceEditorModel'
import { moveShowGroupOccurrenceV2, duplicateShowGroupOccurrenceV2, makeShowGroupUniqueV2, ungroupShowGroupOccurrenceV2, deleteShowGroupOccurrenceV2, setShowGroupDefinitionClipTimingV2 } from '../engine/showGroupEditsV2'
import * as stage from '../engine/showPreparedStageV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotGroupOccurrenceEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
let fixtureId = 0
function setup(linked = true, onlyGroup = false) {
  const { record, dependencies } = showV2GroupOccurrenceEditorFixture(linked, onlyGroup)
  record.id = `group-occurrence-admission-${++fixtureId}`; let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'group-occurrence-test', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = stage.captureShowStageEditV2(record, dependencies)
  expect(capture.inputCapture.status).toBe('qualified'); expect(capture.prepared.status, capture.prepared.status === 'refused' ? capture.prepared.message : '').toBe('ready')
  return { record, dependencies, write, saved: () => saved, context: { showId: record.id, baseRevision: 0, capture, isCurrent: () => true, onAdopted: vi.fn() } }
}
function intentFor(record: ShowRecordV2, kind: Exclude<ShowV2GroupOccurrenceIntent['kind'], 'set-definition-clip-timing' | 'edit-definition-clip-appearance' | 'write-definition-instance-properties' | 'resize-definition-layer-transition' | 'insert-definition-layer-transition'>) {
  const occurrence = record.composition.groupOccurrences[0]; let id = 0
  const request = kind === 'move-occurrence' || kind === 'duplicate-occurrence'
    ? { kind, occurrenceId: occurrence.id, placement: { startMs: 18000, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, translationX: 0, translationY: 0 } }
    : { kind, occurrenceId: occurrence.id }
  const plan = planShowV2GroupOccurrenceEdit(record, request, () => `planned-${++id}`)
  if (plan.status !== 'ready') throw Error(plan.message)
  return plan.intent
}
function owner(record: ShowRecordV2, intent: ShowV2GroupOccurrenceIntent) {
  switch (intent.kind) {
    case 'move-occurrence': return moveShowGroupOccurrenceV2(record, intent)
    case 'duplicate-occurrence': return duplicateShowGroupOccurrenceV2(record, intent)
    case 'make-unique': return makeShowGroupUniqueV2(record, intent)
    case 'ungroup-occurrence': return ungroupShowGroupOccurrenceV2(record, intent)
    case 'delete-occurrence': return deleteShowGroupOccurrenceV2(record, intent)
    case 'set-definition-clip-timing': return setShowGroupDefinitionClipTimingV2(record, intent)
    case 'edit-definition-clip-appearance':
    case 'write-definition-instance-properties':
    case 'resize-definition-layer-transition':
    case 'insert-definition-layer-transition':
      throw new Error('unused')
  }
}
function effects(value: object) { return Object.entries(value).filter(([key]) => key.startsWith('affected') || ['hoistedInstanceIds', 'removedIds', 'discardedControlTargets'].includes(key)) }
function emptyEffects(value: object) { const entries = effects(value); expect(entries).toHaveLength(15); for (const [, result] of entries) expect(result).toEqual([]) }
it.each(['move-occurrence', 'duplicate-occurrence', 'make-unique', 'ungroup-occurrence', 'delete-occurrence'] as const)('checked %s preserves exact owner effects and one prepare/history/save', async kind => {
  const { record, context, write, saved, dependencies } = setup(), intent = intentFor(record, kind), expected = owner(record, intent)
  expect(expected.status).toBe('changed')
  const prepare = vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2')
  try {
    const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...context, intent })
    expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' }); expect(prepare).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1); expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
    expect(effects(outcome)).toHaveLength(15); for (const [key, value] of effects(expected)) expect(outcome).toHaveProperty(key, value)
    expect(saved().composition).toEqual(expected.record.composition)
    expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
    expect(saved().composition.propertyTracks).toEqual(record.composition.propertyTracks)
    expect(stage.prepareShowStageV2(saved(), dependencies).status).toBe('ready')
  } finally { prepare.mockRestore() }
})
it('permits only explicit final-content Delete to validated empty, preserving dormant authoritative data', async () => {
  const { record, context, saved, dependencies, write } = setup(false, true)
  const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...context, intent: intentFor(record, 'delete-occurrence') })
  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' }); expect(write).toHaveBeenCalledTimes(1)
  expect(stage.prepareShowStageV2(saved(), dependencies).status).toBe('empty')
  expect(saved().composition.groupDefinitions).toEqual(record.composition.groupDefinitions)
  expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(saved().composition.propertyTracks).toEqual(record.composition.propertyTracks)
})
it('writes nothing for exact placement no-op, sole Make Unique and owner binding refusal', async () => {
  const { record, context, write } = setup(false), occurrence = record.composition.groupOccurrences[0]
  const placement = { startMs: occurrence.startMs, layoutOccurrenceId: occurrence.layoutOccurrenceId, zoneId: occurrence.zoneId, layerBindings: occurrence.layerBindings, translationX: occurrence.translationX, translationY: occurrence.translationY }
  for (const intent of [{ kind: 'move-occurrence' as const, occurrenceId: occurrence.id, ...placement }, intentFor(record, 'make-unique')]) {
    const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...context, intent }); expect(outcome.status).toBe('unchanged'); emptyEffects(outcome)
  }
  const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...context, intent: { kind: 'move-occurrence', occurrenceId: occurrence.id, ...placement, layerBindings: [] } })
  expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-placement' }); emptyEffects(outcome)
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it.each(['record', 'revision', 'provider', 'route', 'dependencies'] as const)('refuses stale %s without owner adoption/preparation/write', async partition => {
  const { record, context, write } = setup(), intent = intentFor(record, 'delete-occurrence')
  if (partition === 'record') useShowStore.setState({ showV2Pilots: { [record.id]: structuredClone(record) } })
  if (partition === 'revision') useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  if (partition === 'provider') { const captured = getPersonalContentProvider(); context.isCurrent = () => getPersonalContentProvider() === captured; setPersonalContentProvider({ ...captured, id: 'replacement' }) }
  if (partition === 'route') context.isCurrent = () => false
  if (partition === 'dependencies' && context.capture.inputCapture.status === 'qualified') Object.assign(context.capture, { inputCapture: { status: 'qualified', inputs: { ...context.capture.inputCapture.inputs, identity: { ...context.capture.inputCapture.inputs.identity, dependencies: { ...context.capture.dependencies } } } } })
  const current = useShowStore.getState().showV2Pilots[record.id], prepare = vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2')
  try {
    const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...context, intent }); expect(outcome).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' }); emptyEffects(outcome)
    expect(prepare).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(current)
  } finally { prepare.mockRestore() }
})
it('rolls back a current failed save and preserves every held shared shell for retry', async () => {
  const { record, context, write } = setup(); write.mockRejectedValueOnce(Error('offline'))
  await expect(admitShowV2PilotGroupOccurrenceEdit({ ...context, intent: intentFor(record, 'delete-occurrence') })).rejects.toThrow('offline')
  expect(write).toHaveBeenCalledTimes(1); expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { emitFixedPoint } from '../engine/fxEmit'
it.each(['fast', 'fidelity'] as const)('reopened native %s five-action schedules advance one shared runtime and honor held first contribution', async fidelity => {
  for (const kind of ['move-occurrence', 'duplicate-occurrence', 'make-unique', 'ungroup-occurrence', 'delete-occurrence'] as const) {
    const { record, context, saved, dependencies } = setup(kind !== 'move-occurrence' && kind !== 'duplicate-occurrence')
    const before = context.capture.prepared
    if (before.status !== 'ready') throw Error('before')
    expect((await admitShowV2PilotGroupOccurrenceEdit({ ...context, intent: intentFor(record, kind) })).status).toBe('applied')
    const after = stage.prepareShowStageV2(saved(), dependencies); if (after.status !== 'ready') throw Error('after')
    const bundles = [before.bundle, after.bundle], files = await Promise.all(bundles.map(bundle => qualifyShowV2PilotArtifacts(bundle)))
    expect(files[1].importedShow.composition).toEqual(saved().composition)
    const artifacts = bundles.map((bundle, i) => ({ ...bundle.artifact, dimension: bundle.presentation.stageDimension, code: files[i].epeSource, fxCode: emitFixedPoint(files[i].epeSource) }))
    expect(artifacts.map(artifact => artifact.summary.clips.length)).toEqual([1, 1])
    const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }))
    const resets = kind === 'move-occurrence' ? [19000] : kind === 'duplicate-occurrence' ? [3000, 19000] : kind === 'delete-occurrence' ? [11000] : [3000, 11000]
    for (const time of [125, 2000, 2875, 3000, 3125, 4875, 5000, 5875, 6000, 10875, 11000, 11125, 17875, 18000, 18875, 19000, 19125, 22000, 30875]) {
      const frames = runtimes.map(runtime => runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true }))
      // Read current getter exports before either runtime advances to the next frame.
      const elapsed = Number(frames[1].exports[`${artifacts[1].summary.clips[0].prefix}_elapsed`]) / (fidelity === 'fidelity' ? 65536 : 1)
      const expectedElapsed = time - Math.max(0, ...resets.filter(reset => reset <= time))
      expect(elapsed, `${kind} shared elapsed@${time}`).toBe(expectedElapsed)
      // Precise live crossfade weights can sum one16.16 step below unity.
      expect(Math.round(frames[1].frame[2] * 255), `${kind} displayed blue@${time}`).toBe(64)
      if (fidelity === 'fast') {
        const authoredTime = time < 5000 ? time : time < 6000 ? 5000 : time - 1000
        const expectedGain = 0.4 + 0.4 * (authoredTime / 30000) ** 2
        expect(Math.round(frames[1].frame[0] * 255), `${kind} displayed gain@${time}`).toBe(Math.round(expectedGain * 255))
        expect(Math.round(frames[1].frame[1] * 255), `${kind} displayed elapsed@${time}`).toBe(Math.round(expectedElapsed / 30000 * 255))
      }
      if (kind === 'make-unique' || kind === 'ungroup-occurrence') {
        expect(Array.from(frames[1].frame), `${kind} frame@${time}`).toEqual(Array.from(frames[0].frame))
        for (const name of ['elapsed', 'gain']) expect(frames[1].exports[`${artifacts[1].summary.clips[0].prefix}_${name}`]).toBe(frames[0].exports[`${artifacts[0].summary.clips[0].prefix}_${name}`])
      }
    }
  }
})
it('adopts Make Unique across positive Layer Transition and repeated Layouts without duplicating runtime owners', async () => {
  const { record, context, write, dependencies, saved } = setup()
  const first = record.composition.layoutOccurrences[0]; first.durationMs = 17000
  record.composition.layoutOccurrences.push({ ...structuredClone(first), id: 'later-layout', startMs: 17000, durationMs: 14000 })
  const capture = stage.captureShowStageEditV2(record, dependencies)
  expect(capture.inputCapture.status).toBe('qualified')
  expect(capture.prepared.status).toBe('ready')
  const outcome = await admitShowV2PilotGroupOccurrenceEdit({ ...context, capture, intent: intentFor(record, 'make-unique') })
  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' })
  expect(write).toHaveBeenCalledTimes(1)
  expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(saved().composition.propertyTracks).toEqual(record.composition.propertyTracks)
  expect(saved().composition.layoutOccurrences).toEqual(record.composition.layoutOccurrences)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
  const reopened = stage.captureShowStageEditV2(saved(), dependencies)
  expect(reopened.prepared.status).toBe('ready')
})
