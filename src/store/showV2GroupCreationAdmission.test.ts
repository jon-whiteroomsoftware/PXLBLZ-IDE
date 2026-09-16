import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { showV2GroupEditorFixture } from '../test/showV2GroupEditorFixture'
import * as stage from '../engine/showPreparedStageV2'
import { planShowV2GroupCreation } from '../engine/showV2GroupCreationEditorModel'
import { createShowGroupFromSelectionV2 } from '../engine/showGroupCreationV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotCreateGroup } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
let fixtureId = 0
function setup(pair = false) {
  const { record, dependencies } = showV2GroupEditorFixture(pair); record.id = `group-admission-${++fixtureId}`; let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'group-create-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = stage.captureShowStageEditV2(record, dependencies)
  expect(capture.inputCapture.status).toBe('qualified'); expect(capture.prepared.status, capture.prepared.status === 'refused' ? capture.prepared.message : '').toBe('ready')
  let id = 0
  const plan = planShowV2GroupCreation(record, { clipIds: ['verse-a', 'verse-b'], transitionIds: pair ? ['verse-transition'] : [], name: 'Verse' }, () => `group-id-${++id}`)
  if (plan.status !== 'ready') throw Error('plan')
  return { record, dependencies, write, saved: () => saved, context: { showId: record.id, baseRevision: 0, capture, isCurrent: () => true, onAdopted: vi.fn() }, intent: plan.intent }
}
it.each([false, true])('admits lossless selection pair=%s with exact fifteen effects and one candidate preparation/history/save', async pair => {
  const { record, write, saved, context, intent } = setup(pair), expected = createShowGroupFromSelectionV2(record, intent)
  expect(expected.status).toBe('changed')
  const prepare = vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2')
  try {
    const result = await admitShowV2PilotCreateGroup({ ...context, intent })
    expect(result.status).toBe('applied'); expect(prepare).toHaveBeenCalledTimes(1); expect(write).toHaveBeenCalledTimes(1)
    expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
    const effects = Object.entries(expected).filter(([key]) => key.startsWith('affected') || ['removedIds', 'discardedControlTargets', 'hoistedInstanceIds'].includes(key))
    expect(effects).toHaveLength(15); for (const [key, value] of effects) expect(result).toHaveProperty(key, value)
    expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
    expect(saved().composition.clips.map(clip => clip.id)).toEqual(['clip'])
    expect(stage.prepareShowStageV2(saved(), context.capture.dependencies).status).toBe('ready')
  } finally { prepare.mockRestore() }
})

function emptyEffects(outcome: object) {
  const effects = Object.entries(outcome).filter(([key]) => key.startsWith('affected') || ['removedIds', 'discardedControlTargets', 'hoistedInstanceIds'].includes(key))
  expect(effects).toHaveLength(15); for (const [, value] of effects) expect(value).toEqual([])
}
it.each(['record', 'revision', 'provider', 'route', 'dependencies'] as const)('refuses stale%s without preparing/adopting/writing', async partition => {
  const { record, context, intent, write } = setup()
  if (partition === 'record') useShowStore.setState({ showV2Pilots: { [record.id]: structuredClone(record) } })
  if (partition === 'revision') useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  if (partition === 'provider') { const captured = getPersonalContentProvider(); context.isCurrent = () => getPersonalContentProvider() === captured; setPersonalContentProvider({ ...captured, id: 'replacement' }) }
  if (partition === 'route') context.isCurrent = () => false
  if (partition === 'dependencies' && context.capture.inputCapture.status === 'qualified') Object.assign(context.capture, { inputCapture: { status: 'qualified', inputs: { ...context.capture.inputCapture.inputs, identity: { ...context.capture.inputCapture.inputs.identity, dependencies: { ...context.capture.dependencies } } } } })
  const current = useShowStore.getState().showV2Pilots[record.id], prepare = vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2')
  try {
    const result = await admitShowV2PilotCreateGroup({ ...context, intent })
    expect(result).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit' }); emptyEffects(result)
    expect(prepare).not.toHaveBeenCalled(); expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(current)
    expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  } finally { prepare.mockRestore() }
})
it.each(['partial-chain', 'outside-activation'] as const)('preserves typed%s owner refusal and exact preimage with zero history/save', async partition => {
  const { record, context, intent, write } = setup(true)
  if (partition === 'partial-chain') { intent.selectedClipIds = ['verse-a']; intent.transitionIds = [] }
  if (partition === 'outside-activation') { record.composition.propertyTracks.push({ id: 'outside', target: { kind: 'clip-opacity', clipId: 'verse-a' }, activeStartMs: 1000, activeDurationMs: 2000, keyframes: [{ id: 'a', timeMs: 1000, value: 1, easing: { curve: 'linear' } }, { id: 'b', timeMs: 3000, value: 1, easing: { curve: 'linear' } }] }) }
  context.capture = stage.captureShowStageEditV2(record, context.capture.dependencies)
  const result = await admitShowV2PilotCreateGroup({ ...context, intent })
  expect(result).toMatchObject({ status: 'refused', source: 'owner', code: partition === 'partial-chain' ? 'invalid-selection' : 'unsupported-representation' }); emptyEffects(result)
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record); expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
it('rolls back one current save failure to the ordinary shared schedule and history', async () => {
  const { record, context, intent, write } = setup(); write.mockRejectedValueOnce(Error('Storage unavailable'))
  await expect(admitShowV2PilotCreateGroup({ ...context, intent })).rejects.toThrow('Storage unavailable')
  expect(write).toHaveBeenCalledTimes(1)
  const rolledBack = useShowStore.getState().showV2Pilots[record.id]
  expect(rolledBack).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { emitFixedPoint } from '../engine/fxEmit'
it.each(['fast', 'fidelity'] as const)('reopened native%s UI-admitted grouping preserves independent shared schedule/global animation/Restart', async fidelity => {
  const { record, context, intent, dependencies, saved } = setup(true)
  if (context.capture.prepared.status !== 'ready') throw Error('ready')
  const before = context.capture.prepared.bundle
  expect((await admitShowV2PilotCreateGroup({ ...context, intent })).status).toBe('applied')
  const after = stage.prepareShowStageV2(saved(), dependencies); expect(after.status).toBe('ready'); if (after.status !== 'ready') throw Error('ready')
  const captures = [before, after.bundle], files = await Promise.all(captures.map(bundle => qualifyShowV2PilotArtifacts(bundle)))
  expect(files[1].importedShow.composition).toEqual(saved().composition)
  expect(saved().composition.propertyTracks).toEqual(record.composition.propertyTracks)
  const artifacts = captures.map((bundle, i) => ({ ...bundle.artifact, dimension: bundle.presentation.stageDimension, code: files[i].epeSource, fxCode: emitFixedPoint(files[i].epeSource) }))
  expect(artifacts.map(artifact => artifact.summary.clips.length)).toEqual([1, 1])
  const runtimes = artifacts.map(artifact => createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] }))
  for (const time of [0, 1, 1999, 2000, 2999, 3000, 3001, 3500, 3999, 4000, 4001, 6999, 7000, 29999, 30001]) {
    const frames = runtimes.map(runtime => runtime.advanceTo(time, { stepMs: 1, forceFullIntermediateRender: true }))
    expect(Array.from(frames[1].frame), `native@${time}`).toEqual(Array.from(frames[0].frame))
    if (fidelity === 'fast' && (time === 3000 || time === 3001)) {
      const clocks = runtimes.map(runtime => Number(runtime.snapshot().runtimeState.__pxlblz_show_elapsed_s))
      expect(clocks[1]).toBe(clocks[0])
      const elapsed = Number(frames[1].exports[`${artifacts[1].summary.clips[0].prefix}_elapsed`])
      if (time === 3000) { expect(clocks[1]).toBeLessThan(3); expect(elapsed).toBe(3000) }
      else { expect(clocks[1]).toBeGreaterThan(3); expect(elapsed).toBeGreaterThan(0); expect(elapsed).toBeLessThan(1) }
    }
    for (const name of ['elapsed', 'gain']) expect(frames[1].exports[`${artifacts[1].summary.clips[0].prefix}_${name}`]).toBe(frames[0].exports[`${artifacts[0].summary.clips[0].prefix}_${name}`])

  }
})

it.each(['fast', 'fidelity'] as const)('binary-exact native%s steps prove independent shared first-contribution Restart and global curve', async fidelity => {
  const { context, intent, saved, dependencies } = setup(true)
  expect((await admitShowV2PilotCreateGroup({ ...context, intent })).status).toBe('applied')
  const after = stage.prepareShowStageV2(saved(), dependencies)
  if (after.status !== 'ready') throw Error('ready')
  expect(after.bundle.recipe.restartEvents).toEqual([{ atMs: 3000, clipId: 'instance' }])
  const files = await qualifyShowV2PilotArtifacts(after.bundle)
  const artifact = { ...after.bundle.artifact, dimension: after.bundle.presentation.stageDimension, code: files.epeSource, fxCode: emitFixedPoint(files.epeSource) }
  const runtime = createFastReplayRuntime(artifact, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] })
  for (const time of [125, 1875, 2000, 2125, 2875, 3000, 3125, 3500, 3875, 4000, 4125, 6875, 7000, 29875]) {
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    const elapsed = frame.exports[`${artifact.summary.clips[0].prefix}_elapsed`]
    expect(fidelity === 'fidelity' ? Number(elapsed) / 65536 : elapsed, `elapsed@${time}`).toBe(time < 3000 ? time : time - 3000)
    if (fidelity === 'fast') {
      expect(frame.frame[0], `gain@${time}`).toBeCloseTo(0.4 + 0.4 * (time / 30000) ** 2, 12)
      expect(frame.frame[1], `green@${time}`).toBeCloseTo((time < 3000 ? time : time - 3000) / 30000, 12)
    }
  }
})
