import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '../engine/showRecordV1ToV2'
import { transitionV1Show } from '../test/showV2TracerFixture'
import * as stage from '../engine/showPreparedStageV2'
import { editShowTransitionV2 } from '../engine/showTransitionsV2'
import { planShowV2TransitionEdit } from '../engine/showV2TransitionEditorModel'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { createFastReplayRuntime } from '../engine/fastReplay'
import { qualifyShowV2PilotArtifacts } from '../engine/showV2Pilot'
import { parseShowFileBundle } from '../engine/showFileBundle'
import { admitShowV2PilotTransitionEdit, type ShowV2PilotTransitionEditIntent } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { useShowStore.setState(showInitialState); resetPersonalContentProvider() })
afterEach(() => resetPersonalContentProvider())
let fixtureIndex = 0

/** One 30-second Cut boundary on the Main Layer, prepared through the real owner. */
function setup(customize?: (record: ShowRecordV2) => void) {
  const converted = convertShowRecordV1ToV2(transitionV1Show('crossfade'))
  if (converted.status !== 'converted') throw Error('Conversion refused')
  const record = converted.record
  record.id = `transition-edit-${++fixtureIndex}`
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  record.composition.executionModel = 'continuous'
  record.composition.showEndMs = 30_000
  record.composition.layoutOccurrences[0].durationMs = 30_000
  const outgoing = record.composition.clips.find(clip => clip.id === 'out')!
  const incoming = record.composition.clips.find(clip => clip.id === 'in')!
  outgoing.durationMs = 12_000
  for (const key of incoming.appearance.keys) key.timeMs = 12_000
  incoming.startMs = 12_000
  incoming.durationMs = 16_000
  record.composition.transitions = []
  const dependencies: stage.ShowPreparedStageDependenciesV2 = {
    patterns: [{ id: 'voice', name: 'Voice', src: 'export var elapsed=0; export function beforeRender(d){elapsed+=d} export function render2D(i,x,y){rgb(x,y,elapsed/1000)}', controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  customize?.(record)
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'transition-edit-admission', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const prepared = stage.prepareShowStageV2(record, dependencies)
  if (prepared.status !== 'ready') throw Error(prepared.status === 'refused' ? prepared.message : prepared.status)
  const request = { showId: record.id, baseRevision: 0, capture: { record, dependencies, prepared }, isCurrent: () => true, onAdopted: vi.fn() }
  return { record, dependencies, request, write, readSaved: () => saved }
}

function insertIntent(record: ShowRecordV2, transitionId: string, durationMs = 2_000): ShowV2PilotTransitionEditIntent {
  const junctionKey = `participant:12000:zone:layer:zone:main:out:in`
  const plan = planShowV2TransitionEdit(record, { kind: 'insert', junctionKey, kindKey: 'transition:blend:crossfade', durationMs, crossfadePolicy: 'live-live' }, () => transitionId, 2)
  if (plan.status !== 'ready') throw Error(plan.message)
  return plan.intent
}

it('admits a planned Insert with the exact pure cascade, one preparation and one history/save', async () => {
  const { record, request, write, readSaved } = setup()
  const before = structuredClone(record)
  const intent = insertIntent(record, 'fresh-transition')
  const expected = editShowTransitionV2(record, intent)
  if (expected.status !== 'changed') throw Error(expected.status)
  const factory = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotTransitionEdit({ ...request, intent })
    expect(outcome).toMatchObject({
      status: 'applied', settlement: 'saved',
      affectedClipIds: expected.affectedClipIds, affectedTransitionIds: ['fresh-transition'], affectedTrackIds: [], removedIds: [],
    })
    expect(factory).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    expect(readSaved().composition).toEqual(expected.record.composition)
    expect(readSaved().composition.clips.map(clip => [clip.id, clip.startMs, clip.durationMs])).toEqual([['out', 0, 12_000], ['in', 14_000, 16_000]])
    expect(record).toEqual(before)
    expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([before])
    expect(request.onAdopted).toHaveBeenCalledExactlyOnceWith({ showId: record.id, record: useShowStore.getState().showV2Pilots[record.id], revision: 1, provider: getPersonalContentProvider() })
  } finally { factory.mockRestore() }
})

it('changes kind and policy without touching identity, endpoints, duration or Clip times', async () => {
  const { record, request, write, readSaved } = setup(candidate => {
    candidate.composition.clips.find(clip => clip.id === 'in')!.startMs = 14_000
    candidate.composition.clips.find(clip => clip.id === 'in')!.durationMs = 16_000
    for (const key of candidate.composition.clips.find(clip => clip.id === 'in')!.appearance.keys) key.timeMs = 14_000
    candidate.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 2_000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
      participants: [{ id: 'boundary:participant:1', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'out', toClipId: 'in' }],
      propertyRamps: [],
    }]
  })
  const plan = planShowV2TransitionEdit(record, { kind: 'settings', transitionId: 'boundary', kindKey: 'transition:fade:through-color', crossfadePolicy: 'live-live' }, () => 'unused', 2)
  if (plan.status !== 'ready') throw Error(plan.message)

  const outcome = await admitShowV2PilotTransitionEdit({ ...request, intent: plan.intent })

  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved', affectedClipIds: [], affectedTransitionIds: ['boundary'], removedIds: [] })
  expect(write).toHaveBeenCalledTimes(1)
  const saved = readSaved()
  expect(saved.composition.transitions[0]).toMatchObject({ id: 'boundary', kind: 'fade-color', durationMs: 2_000 })
  expect(saved.composition.transitions[0].participants).toEqual(record.composition.transitions[0].participants)
  expect('crossfadePolicy' in saved.composition.transitions[0]).toBe(false)
  expect(saved.composition.clips).toEqual(record.composition.clips)
})

it('resets a global scalar carrier to a Cut and keeps its values, easing and activation', async () => {
  const { record, request, write, readSaved } = setup(candidate => {
    candidate.composition.clips.find(clip => clip.id === 'in')!.startMs = 14_000
    candidate.composition.clips.find(clip => clip.id === 'in')!.durationMs = 16_000
    for (const key of candidate.composition.clips.find(clip => clip.id === 'in')!.appearance.keys) key.timeMs = 14_000
    candidate.composition.transitions = [{
      id: 'boundary', kind: 'crossfade', durationMs: 2_000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live',
      participants: [], wholeOutput: { startMs: 12_000, fromClipIds: ['out'], toClipIds: ['in'] },
      propertyRamps: [{ target: { kind: 'show-repeat-scale' }, from: 3, easing: { curve: 'quadratic', direction: 'in' } }],
    }]
  })
  let index = 0
  const plan = planShowV2TransitionEdit(record, { kind: 'reset', transitionId: 'boundary' }, () => `ramp-${++index}`, 2)
  if (plan.status !== 'ready') throw Error(plan.message)

  const outcome = await admitShowV2PilotTransitionEdit({ ...request, intent: plan.intent })

  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved', affectedTrackIds: ['ramp-1'], removedIds: ['boundary'] })
  expect(write).toHaveBeenCalledTimes(1)
  const saved = readSaved()
  expect(saved.composition.transitions).toEqual([])
  expect(saved.composition.clips.map(clip => [clip.id, clip.startMs])).toEqual([['out', 0], ['in', 12_000]])
  expect(saved.composition.propertyTracks).toEqual([{
    id: 'ramp-1', target: { kind: 'show-repeat-scale' }, activeStartMs: 12_000, activeDurationMs: 2_000,
    keyframes: [
      { id: 'ramp-2', timeMs: 12_000, value: 3, easing: { curve: 'quadratic', direction: 'in' } },
      { id: 'ramp-3', timeMs: 14_000, value: record.composition.sampleRemap.repeatScale, easing: { curve: 'linear' } },
    ],
  }])
})

type InsertIntent = Extract<ShowV2PilotTransitionEditIntent, { kind: 'insert' }>
function asInsert(intent: ShowV2PilotTransitionEditIntent): InsertIntent {
  if (intent.kind !== 'insert') throw Error('insert')
  return intent
}
it.each([
  ['extra field', (intent: InsertIntent) => ({ ...intent, candidate: {} })],
  ['Cut kind', (intent: InsertIntent) => ({ ...intent, transition: { ...intent.transition, kind: 'cut' } })],
  ['zero duration', (intent: InsertIntent) => ({ ...intent, transition: { ...intent.transition, durationMs: 0 } })],
  ['authored ramp', (intent: InsertIntent) => ({ ...intent, transition: { ...intent.transition, propertyRamps: [{ target: { kind: 'show-repeat-scale' as const }, from: 2 }] } })],
])('refuses an Insert with %s before any preparation, write or history', async (_name, corrupt) => {
  const { record, request, write } = setup()
  const before = structuredClone(record)
  const factory = vi.spyOn(stage, 'prepareShowStageV2')
  try {
    const outcome = await admitShowV2PilotTransitionEdit({ ...request, intent: corrupt(asInsert(insertIntent(record, 'fresh'))) as unknown as ShowV2PilotTransitionEditIntent })
    expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-intent', affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [] })
    expect(factory).not.toHaveBeenCalled()
    expect(write).not.toHaveBeenCalled()
    expect(request.onAdopted).not.toHaveBeenCalled()
    expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
    expect(record).toEqual(before)
    expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
  } finally { factory.mockRestore() }
})

it('retains typed pure refusals for missing identity, inexact junctions and carriers without a plan', async () => {
  const { record, request, write } = setup()
  const intent = insertIntent(record, 'fresh')
  const gapped: ShowV2PilotTransitionEditIntent = {
    kind: 'insert',
    transition: {
      ...asInsert(intent).transition,
      id: 'inexact',
      participants: [{ id: 'p', zoneId: 'zone', layerId: 'layer:zone:main', fromClipId: 'in', toClipId: 'out' }],
    },
  }
  for (const [candidate, code] of [
    [{ kind: 'reset-to-cut', transitionId: 'absent' } as ShowV2PilotTransitionEditIntent, 'missing-transition'],
    [gapped, 'invalid-intent'],
  ] as const) {
    const outcome = await admitShowV2PilotTransitionEdit({ ...request, intent: candidate })
    expect(outcome).toMatchObject({ status: 'refused', source: 'owner', code, affectedClipIds: [], affectedTransitionIds: [], affectedTrackIds: [], removedIds: [] })
  }
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})

it('refuses replacement during preparation and an unsupported provider without history or save', async () => {
  const { record, request, write } = setup()
  const intent = insertIntent(record, 'fresh')
  const provider = getPersonalContentProvider()
  const unsupported = { ...provider }
  delete unsupported.replaceShowV2
  setPersonalContentProvider(unsupported)
  expect(await admitShowV2PilotTransitionEdit({ ...request, intent })).toMatchObject({ status: 'refused', source: 'admission', code: 'unsupported-provider' })
  setPersonalContentProvider(provider)

  const actual = stage.prepareShowStageV2
  const factory = vi.spyOn(stage, 'prepareShowStageV2').mockImplementation((candidate, inputs) => {
    const prepared = actual(candidate, inputs)
    useShowStore.setState({ showV2Pilots: { [record.id]: { ...record, name: 'External' } } })
    return prepared
  })
  try {
    expect(await admitShowV2PilotTransitionEdit({ ...request, intent })).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit', affectedClipIds: [], affectedTransitionIds: [] })
  } finally { factory.mockRestore() }
  expect(write).not.toHaveBeenCalled()
  expect(request.onAdopted).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Histories[record.id]).toEqual({ past: [], future: [] })
})

it('persists an Insert whose saved bytes reopen and render exactly like an independently prepared record', async () => {
  const { record, dependencies, request, write, readSaved } = setup()
  const intent = insertIntent(record, 'boundary')
  const expected = editShowTransitionV2(record, intent)
  if (expected.status !== 'changed') throw Error(expected.status)
  const reference = stage.prepareShowStageV2(expected.record, dependencies)
  if (reference.status !== 'ready') throw Error(reference.status === 'refused' ? reference.message : reference.status)

  expect(await admitShowV2PilotTransitionEdit({ ...request, intent })).toMatchObject({ status: 'applied', settlement: 'saved' })

  const saved = readSaved()
  expect(saved.composition).toEqual(expected.record.composition)
  const delivered = stage.prepareShowStageV2(saved, dependencies)
  if (delivered.status !== 'ready') throw Error(delivered.status)
  expect(delivered.bundle.artifact.code).toBe(reference.bundle.artifact.code)
  for (const fidelity of ['fast', 'fidelity'] as const) {
    const options = { fidelity, randomSeed: 1038, mapPoints: delivered.bundle.presentation.layout.mapPoints }
    const left = createFastReplayRuntime({ ...reference.bundle.artifact, dimension: 2 as const }, options)
    const right = createFastReplayRuntime({ ...delivered.bundle.artifact, dimension: 2 as const }, options)
    for (const timeMs of [11_875, 12_000, 13_000, 13_875, 14_000, 20_000, 30_000]) {
      const a = left.advanceTo(timeMs, { stepMs: 125, forceFullIntermediateRender: true })
      const b = right.advanceTo(timeMs, { stepMs: 125, forceFullIntermediateRender: true })
      expect(b.frame).toEqual(a.frame)
      expect(b.exports).toEqual(a.exports)
    }
  }
  const artifacts = await qualifyShowV2PilotArtifacts(delivered.bundle)
  expect((await parseShowFileBundle(artifacts.pxlshowBytes, { acceptV2: true })).show).toEqual(delivered.bundle.record)

  await useShowStore.getState().undoShowV2Pilot(record.id)
  expect(readSaved().composition).toEqual(record.composition)
  await useShowStore.getState().redoShowV2Pilot(record.id)
  expect(readSaved().composition).toEqual(expected.record.composition)
  expect(write).toHaveBeenCalledTimes(3)
  expect((await useShowStore.getState().reloadShowV2Pilot(record.id))?.composition).toEqual(expected.record.composition)
})
