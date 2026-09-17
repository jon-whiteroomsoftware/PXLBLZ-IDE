import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { propertyEditGroupRecord } from '../test/showV2PropertyEditsFixture'
import { captureShowStageEditV2 } from '../engine/showPreparedStageV2'
import { defaultGroupRuntimeIdV2 } from '../engine/showGroupsV2'
import { planShowV2GroupReplacementEdit } from '../engine/showV2GroupReplacementEditorModel'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotGroupReplacementEdit } from './showV2PreparedEditAdmission'
import { validateShowRecordV2, type ShowRecordV2 } from '../engine/showCompositionV2'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())

const voice = 'export var gain=.4;var lost=.2;export function sliderGain(v){gain=v}export function sliderLost(v){lost=v}export function render2D(i,x,y){rgb(gain,lost,y)}'
const other = 'export var gain=.9;export function sliderGain(v){gain=v}export function render2D(i,x,y){rgb(0,gain,y)}'
let serial = 0
function setup(mutate: (record: ShowRecordV2) => void = () => {}) {
  const record = propertyEditGroupRecord()
  record.id = `group-replace-${++serial}`
  const instance = record.composition.patternInstances[0]
  instance.pattern = { kind: 'user', id: 'voice' }
  instance.patternName = 'Voice'
  instance.controlTargets = { sliderGain: 0.4, sliderLost: 0.2 }
  const definition = record.composition.groupDefinitions[0]
  definition.patternInstances[0] = { ...structuredClone(instance), id: 'slot' }
  definition.propertyTracks = [
    { id: 'local-gain', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderGain' }, activeStartMs: 0, activeDurationMs: 400,
      keyframes: [{ id: 'local-gain:a', timeMs: 0, value: 0.4, easing: { curve: 'linear' } }, { id: 'local-gain:b', timeMs: 400, value: 0.8, easing: { curve: 'linear' } }] },
  ]
  mutate(record)
  expect(validateShowRecordV2(record)).toEqual([])
  const dependencies = { patterns: [{ id: 'voice', name: 'Voice', src: voice, controls: {}, updatedAt: 1 }, { id: 'other', name: 'Other', src: other, controls: {}, updatedAt: 1 },
    { id: 'bad', name: 'Bad', src: 'invalid source !!!', controls: {}, updatedAt: 1 }], maps: [], libraries: [], profiles: [], stageMap: null }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => {
    const provider = getPersonalContentProvider()
    const capture = captureShowStageEditV2(useShowStore.getState().showV2Pilots[record.id], dependencies)
    expect(capture.prepared.status, JSON.stringify(capture.prepared)).toBe('ready')
    return { showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture,
      isCurrent: () => getPersonalContentProvider() === provider, onAdopted: vi.fn() }
  }
  return { record, dependencies, write, context, saved: () => saved }
}
const empty = { affectedClipIds: [], affectedInstanceIds: [], affectedTransitionIds: [], affectedTrackIds: [], affectedLayoutDefinitionIds: [], affectedLayoutOccurrenceIds: [],
  affectedGroupDefinitionIds: [], affectedGroupOccurrenceIds: [], affectedLayerIds: [], affectedMarkerIds: [], affectedAppearanceKeyIds: [], affectedPropertyKeyIds: [],
  hoistedInstanceIds: [], removedIds: [], discardedControlTargets: [] }
function effects(value: object) { return Object.fromEntries(Object.entries(value).filter(([key]) => key in empty)) }
function plan(context: ReturnType<ReturnType<typeof setup>['context']>, definitionId = 'definition', clipId = 'child', id = 'other', allocate?: () => string) {
  let count = 0
  const result = planShowV2GroupReplacementEdit(context.capture, definitionId, clipId, { kind: 'user', id }, allocate ?? (() => `fresh-${++count}`))
  if (result.status !== 'ready') throw new Error(result.message)
  return result.intent
}

it('forks the shared linked runtime once, prunes only incompatible controls and records one save and history entry', async () => {
  const { record, write, context, saved } = setup()
  const request = context()
  const result = await admitShowV2PilotGroupReplacementEdit({ ...request, intent: plan(request) })
  expect(result.status, JSON.stringify(result)).toBe('applied')
  expect(write).toHaveBeenCalledTimes(1)
  expect(request.onAdopted).toHaveBeenCalledTimes(1)
  const next = saved()
  expect(next.composition.patternInstances[0]).toEqual(record.composition.patternInstances[0])
  expect(next.composition.clips).toEqual(record.composition.clips)
  expect(next.composition.groupDefinitions[0].propertyTracks).toEqual(record.composition.groupDefinitions[0].propertyTracks)
  expect(next.composition.groupDefinitions[0].patternInstances[1]).toMatchObject({ id: 'fresh-1', patternName: 'Other', controlTargets: { sliderGain: 0.4 } })
  expect(next.composition.groupDefinitions[0].clips[0].instanceId).toBe('fresh-1')
  expect(next.composition.groupOccurrences.map(occurrence => occurrence.instanceBindings)).toEqual([{ slot: 'instance', 'fresh-1': 'fresh-2' }, { slot: 'instance', 'fresh-1': 'fresh-2' }])
  expect(effects(result)).toEqual({ ...empty, affectedGroupDefinitionIds: ['definition'], affectedClipIds: ['child'], affectedGroupOccurrenceIds: ['occ-0', 'occ-1'],
    affectedInstanceIds: ['fresh-1', 'fresh-2'], affectedTrackIds: result.affectedTrackIds, affectedPropertyKeyIds: result.affectedPropertyKeyIds,
    discardedControlTargets: [{ kind: 'instance-control', instanceId: 'instance', exportName: 'sliderLost' }] })
  expect(result.affectedTrackIds).toHaveLength(2)
  expect(useShowStore.getState().showV2Histories[record.id].past).toHaveLength(1)
  await useShowStore.getState().undoShowV2Pilot(record.id)
  expect({ ...saved(), updatedAt: record.updatedAt }).toEqual(record)
  await useShowStore.getState().redoShowV2Pilot(record.id)
  expect(saved().composition.groupDefinitions[0].clips[0].instanceId).toBe('fresh-1')
})

it('replaces a dormant definition template without creating, changing or hoisting any runtime', async () => {
  const { record, write, context, saved } = setup(value => { value.composition.groupOccurrences = [] })
  const request = context()
  const result = await admitShowV2PilotGroupReplacementEdit({ ...request, intent: plan(request) })
  expect(result.status, JSON.stringify(result)).toBe('applied')
  expect(write).toHaveBeenCalledTimes(1)
  expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
  expect(saved().composition.groupDefinitions[0].patternInstances[0]).toMatchObject({ id: 'slot', patternName: 'Other', controlTargets: { sliderGain: 0.4 } })
  expect(effects(result)).toMatchObject({ affectedGroupDefinitionIds: ['definition'], affectedClipIds: ['child'], affectedInstanceIds: ['slot'], affectedGroupOccurrenceIds: [], hoistedInstanceIds: [] })
})

it('splits a dormant slot whose derived default runtime already holds top-level authority', async () => {
  const { record, context, saved } = setup(value => {
    value.composition.groupOccurrences = []
    value.composition.patternInstances.push({ ...structuredClone(value.composition.patternInstances[0]), id: defaultGroupRuntimeIdV2('definition', 'slot') })
  })
  const request = context()
  const result = await admitShowV2PilotGroupReplacementEdit({ ...request, intent: plan(request) })
  expect(result.status, JSON.stringify(result)).toBe('applied')
  expect(saved().composition.patternInstances).toEqual(record.composition.patternInstances)
  const definition = saved().composition.groupDefinitions[0]
  expect(definition.patternInstances[0]).toEqual(record.composition.groupDefinitions[0].patternInstances[0])
  expect(definition.patternInstances[1]).toMatchObject({ id: 'fresh-1', patternName: 'Other' })
  expect(definition.clips[0].instanceId).toBe('fresh-1')
  expect(definition.propertyTracks.slice(0, 1)).toEqual(record.composition.groupDefinitions[0].propertyTracks)
})

it('atomically refuses mixed sole and shared incompatible Group animation with zero writes', async () => {
  const { record, write, context } = setup(value => {
    value.composition.patternInstances.push({ ...structuredClone(value.composition.patternInstances[0]), id: 'sole' })
    value.composition.groupOccurrences[0].instanceBindings = { slot: 'sole' }
    value.composition.groupDefinitions[0].propertyTracks.push({ id: 'local-lost', target: { kind: 'instance-control', instanceId: 'slot', exportName: 'sliderLost' },
      activeStartMs: 0, activeDurationMs: 400, keyframes: [{ id: 'local-lost:a', timeMs: 0, value: 0.2, easing: { curve: 'linear' } }, { id: 'local-lost:b', timeMs: 400, value: 0.3, easing: { curve: 'linear' } }] })
  })
  const request = context()
  const result = await admitShowV2PilotGroupReplacementEdit({ ...request, intent: plan(request) })
  expect(result).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-result', ...empty })
  expect(result.status === 'refused' && result.message).toMatch(/Group "definition"/)
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('same-source no-op, malformed ingress and unavailable sources keep the record, history and provider untouched', async () => {
  const { record, write, context } = setup()
  const request = context()
  expect(await admitShowV2PilotGroupReplacementEdit({ ...request, intent: plan(request, 'definition', 'child', 'voice') })).toMatchObject({ status: 'unchanged', ...empty })
  const valid = plan(request)
  for (const intent of [
    { ...valid, patternReference: { kind: 'user', id: 'missing' } },
    { ...valid, patternReference: { kind: 'user', id: 'bad' } },
    { ...valid, patternReference: { kind: 'user', id: 'other', src: 'guess' } },
    { ...valid, replacement: { exportedSliders: [] } },
    { ...valid, clipId: ' ' },
    { ...valid, definitionId: 'missing' },
    { ...valid, context: 'dormant-definition' },
    { ...valid, kind: 'replace-pattern' },
    { ...valid, slot: { kind: 'split' } },
    { ...valid, runtimePlansBySourceRuntimeId: { instance: { kind: 'independent', instanceId: 'instance', identitiesBySourceTrackId: {} } } },
    { ...valid, extra: true },
  ]) {
    const result = await admitShowV2PilotGroupReplacementEdit({ ...request, intent: intent as never })
    expect(result.status, JSON.stringify(intent)).toBe('refused')
    expect(effects(result), JSON.stringify(intent)).toEqual(empty)
  }
  expect(write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
})

it('stale record or provider refuses before adoption and a fresh request still saves once', async () => {
  const { write, context } = setup()
  const request = context()
  const intent = plan(request)
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'provider-B' })
  expect(await admitShowV2PilotGroupReplacementEdit({ ...request, intent })).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit', ...empty })
  expect(write).not.toHaveBeenCalled()
  const fresh = context()
  expect((await admitShowV2PilotGroupReplacementEdit({ ...fresh, intent: plan(fresh) })).status).toBe('applied')
  expect(write).toHaveBeenCalledTimes(1)
  expect(await admitShowV2PilotGroupReplacementEdit({ ...request, intent })).toMatchObject({ status: 'refused', source: 'admission', code: 'stale-edit', ...empty })
})

it('a failed save rolls back the record and history, and an explicit retry adopts the rolled-back record', async () => {
  const { record, write, context, saved } = setup()
  write.mockRejectedValueOnce(Error('group-replace-failed'))
  const first = context()
  await expect(admitShowV2PilotGroupReplacementEdit({ ...first, intent: plan(first) })).rejects.toThrow('group-replace-failed')
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  const retry = context()
  expect((await admitShowV2PilotGroupReplacementEdit({ ...retry, intent: plan(retry) })).status).toBe('applied')
  expect(saved().composition.groupDefinitions[0].clips[0].instanceId).toBe('fresh-1')
  expect(write).toHaveBeenCalledTimes(2)
})
