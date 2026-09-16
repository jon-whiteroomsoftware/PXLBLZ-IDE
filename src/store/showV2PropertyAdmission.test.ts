import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { recoveryFixture } from '../test/showV2RecoveryFixture'
import { captureShowStageEditV2, prepareShowStageV2 } from '../engine/showPreparedStageV2'
import { editShowPropertyV2, type ShowPropertyEditIntentV2 } from '../engine/showPropertyEditsV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '../engine/personalContentProvider'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotPropertyEdit, admitShowV2PilotLayerEdit } from './showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '../engine/showCompositionV2'
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => resetPersonalContentProvider())
let fixtureId = 0
function setup(ready = false) {
  const { record, dependencies } = recoveryFixture()
  record.id = `recovery-${++fixtureId}`
  if (ready) record.composition.clips[0].zoneSampleMode = 'span'
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'recovery-test', replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => { const provider = getPersonalContentProvider(); return ({ showId: record.id, baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0, capture: captureShowStageEditV2(useShowStore.getState().showV2Pilots[record.id], dependencies), isCurrent: () => getPersonalContentProvider() === provider, onAdopted: vi.fn() }) }
  return { record, dependencies, write, saved: () => saved, context }
}
function emptyEffects(outcome: object) {
  const effects = Object.entries(outcome).filter(([key]) => key.startsWith('affected') || key === 'removedIds' || key === 'discardedControlTargets')
  expect(effects).toHaveLength(14)
  for (const [, value] of effects) expect(value).toEqual([])
}
it('recovers qualified refused preimage with exact six-intent Property owner effects and one adoption', async () => {
  const { record, write, saved, context, dependencies } = setup(); const request = context()
  expect(request.capture.prepared.status).toBe('refused')
  const intent = { kind: 'remove-track', trackId: 'animation' } as const
  const expected = editShowPropertyV2(record, { kind: 'show' }, intent)
  const outcome = await admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent })
  expect(outcome).toMatchObject({ status: 'applied', settlement: 'saved' })
  for (const [key, value] of Object.entries(expected)) if (key.startsWith('affected') || key === 'removedIds' || key === 'discardedControlTargets') expect(outcome).toHaveProperty(key, value)
  expect(write).toHaveBeenCalledTimes(1); expect(request.onAdopted).toHaveBeenCalledTimes(1)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([record])
  expect(prepareShowStageV2(saved(), dependencies).status).toBe('ready')
})
it.each(['missing-source', 'saved-control', 'invalid-context', 'no-qualified-capture'] as const)('refuses recovery %s with exact input and empty effects', async partition => {
  const { record, dependencies, write, context } = setup()
  if (partition === 'missing-source') dependencies.patterns = []
  if (partition === 'saved-control') dependencies.patterns[0].src = 'export function render2D(i,x,y){rgb(x,y,.25)}'
  const request = context()
  if (partition === 'invalid-context') Object.assign(request.capture, { inputCapture: { status: 'invalid', message: 'Invalid map context' } })
  if (partition === 'no-qualified-capture') Object.assign(request.capture, { inputCapture: undefined })
  const outcome = await admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: 'animation' } })
  expect(outcome).toMatchObject({ status: 'refused', source: 'admission', code: 'unsupported-pilot-record' }); emptyEffects(outcome)
  expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record); expect(write).not.toHaveBeenCalled()
})
it.each(['record', 'revision', 'provider', 'route', 'capture'] as const)('preserves final eligibility on %s replacement', async partition => {
  const { record, write, context } = setup(); const request = context()
  if (partition === 'record') useShowStore.setState({ showV2Pilots: { [record.id]: structuredClone(record) } })
  if (partition === 'revision') useShowStore.setState({ showRevisions: { [record.id]: 1 } })
  if (partition === 'provider') setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'replacement' })
  if (partition === 'route') request.isCurrent = () => false
  if (partition === 'capture' && request.capture.inputCapture.status === 'qualified') Object.assign(request.capture, { inputCapture: { status: 'qualified', inputs: { ...request.capture.inputCapture.inputs, identity: { ...request.capture.inputCapture.inputs.identity, record: structuredClone(record) } } } })
  const outcome = await admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: 'animation' } })
  expect(outcome).toMatchObject({ status: 'refused', code: 'stale-edit' }); emptyEffects(outcome); expect(write).not.toHaveBeenCalled()
})
it('no-op and typed refusal have zero writes even when current playback refuses', async () => {
  const { record, write, context } = setup()
  for (const intent of [{ kind: 'update-track', trackId: 'animation', patch: { activeStartMs: 0 } }, { kind: 'remove-track', trackId: 'missing' }] as ShowPropertyEditIntentV2[]) {
    const outcome = await admitShowV2PilotPropertyEdit({ ...context(), propertyOwner: { kind: 'show' }, intent })
    expect(outcome.status).toBe(intent.kind === 'update-track' ? 'unchanged' : 'refused'); emptyEffects(outcome)
  }
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
it('existing visible remove-Layer command recovers through the same closed admission', async () => {
  const { record, dependencies } = recoveryFixture(false)
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record } })
  const layer = record.composition.layers.find(value => value.rank !== 0)!
  const outcome = await admitShowV2PilotLayerEdit({ showId: record.id, baseRevision: 0, capture: captureShowStageEditV2(record, dependencies), isCurrent: () => true, onAdopted: vi.fn(), intent: { kind: 'remove', zoneId: layer.zoneId, layerId: layer.id } })
  expect(outcome.status).toBe('applied'); expect(write).toHaveBeenCalledTimes(1)
})
it.each(['add-track', 'update-track', 'remove-track', 'add-key', 'update-key', 'remove-key'] as const)('preserves closed %s owner semantics and every affected collection', async kind => {
  const { record, context, write } = setup(true)
  if (kind === 'update-track') { record.composition.showEndMs = 1125; record.composition.layoutOccurrences[0].durationMs = 1125; record.composition.clips[0].durationMs = 1125 }
  if (kind === 'remove-key') record.composition.propertyTracks[0].keyframes.splice(1, 0, { id: 'middle', timeMs: 500, value: 0.5, easing: { curve: 'linear' } })
  const track = structuredClone(record.composition.propertyTracks[0])
  if (kind === 'add-track') record.composition.propertyTracks = []
  const intent: ShowPropertyEditIntentV2 = kind === 'add-track' ? { kind, track }
    : kind === 'update-track' ? { kind, trackId: track.id, patch: { activeDurationMs: 1100 } }
    : kind === 'remove-track' ? { kind, trackId: track.id }
    : kind === 'add-key' ? { kind, trackId: track.id, key: { id: 'middle', timeMs: 500, value: 0.6, easing: { curve: 'linear' } } }
    : kind === 'update-key' ? { kind, trackId: track.id, keyId: 'first', patch: { value: 0.3 } }
    : { kind, trackId: track.id, keyId: 'middle' }
  const expected = editShowPropertyV2(record, { kind: 'show' }, intent)
  expect(expected.status).toBe('changed')
  const outcome = await admitShowV2PilotPropertyEdit({ ...context(), propertyOwner: { kind: 'show' }, intent })
  expect(outcome.status).toBe('applied'); expect(write).toHaveBeenCalledTimes(1)
  for (const [key, value] of Object.entries(expected)) if (key.startsWith('affected') || key === 'removedIds' || key === 'discardedControlTargets') expect(outcome).toHaveProperty(key, value)
})
it('failed recovery save restores original refused record without publishing ready state', async () => {
  const { record, context, write } = setup(); write.mockRejectedValueOnce(Error('Write failed'))
  const request = context()
  await expect(admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: 'animation' } })).rejects.toThrow('Write failed')
  expect(useShowStore.getState().showV2Pilots[record.id]).toEqual(record)
  expect(useShowStore.getState().showV2Histories[record.id].past).toEqual([])
  expect(request.onAdopted).toHaveBeenCalledTimes(1); expect(write).toHaveBeenCalledTimes(1)
})
it.each(['fast', 'fidelity'] as const)('saved recovery reopens as native Show/EPE with independent%s output and preserved state', async fidelity => {
  const { record, dependencies, context, saved } = setup()
  dependencies.patterns[0].src = 'export var elapsed=0;export var gain=0;export function sliderGain(v){gain=v}export function beforeRender(d){elapsed+=d}export function render2D(i,x,y){rgb(x,y,gain)}'
  const request = context()
  expect(request.capture.prepared.status).toBe('refused')
  expect((await admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: 'animation' } })).status).toBe('applied')
  const { parseProvisionalShowRecordV2, serializeProvisionalShowRecordV2 } = await import('../engine/showCompositionV2')
  const opened = parseProvisionalShowRecordV2(serializeProvisionalShowRecordV2(saved()))
  expect(opened.status).toBe('opened'); if (opened.status !== 'opened') throw Error('Codec')
  expect(opened.record.composition.patternInstances).toEqual(record.composition.patternInstances)
  const prepared = prepareShowStageV2(opened.record, dependencies)
  expect(prepared.status).toBe('ready'); if (prepared.status !== 'ready') throw Error('Prepare')
  const { buildShowEpeExportV2 } = await import('../engine/showEpeExportV2')
  const { parseEpe } = await import('../engine/epeImport')
  const { emitFixedPoint } = await import('../engine/fxEmit')
  const { createFastReplayRuntime } = await import('../engine/fastReplay')
  const exported = buildShowEpeExportV2(opened.record, prepared.bundle.artifact.code, { id: 'recovery-proof', stampedAt: '2026-09-16T00:00:00Z' })
  if (exported.status !== 'exported') throw Error('Export')
  const source = parseEpe(exported.text).src
  const runtime = createFastReplayRuntime({ ...prepared.bundle.artifact, code: source, fxCode: emitFixedPoint(source), dimension: 2 }, { fidelity, randomSeed: 1038, mapPoints: [{ sample: [0.25, 0.5], pos: [0.25, 0.5] }] })
  const prefix = prepared.bundle.artifact.summary.clips[0].prefix
  for (const time of [125, 250, 500, 750]) {
    const frame = runtime.advanceTo(time, { stepMs: 125, forceFullIntermediateRender: true })
    // Left split Zone samples x / 0.5; authored sliderGain remains exactly 0.4.
    expect(Array.from(frame.frame)).toEqual([0.5, 0.5, fidelity === 'fast' ? 0.4 : 26214 / 65536])
    expect(frame.exports[`${prefix}_elapsed`]).toBe(time * (fidelity === 'fast' ? 1 : 65536))
  }
  expect(await useShowStore.getState().undoShowV2Pilot(record.id)).toBe(true)
  expect(prepareShowStageV2(useShowStore.getState().showV2Pilots[record.id], dependencies).status).toBe('refused')
  expect(await useShowStore.getState().redoShowV2Pilot(record.id)).toBe(true)
  expect(prepareShowStageV2(useShowStore.getState().showV2Pilots[record.id], dependencies).status).toBe('ready')
})
it('linked persisted Group owner returns complete affected identities without changing authoritative payloads', async () => {
  const { propertyEditGroupRecord } = await import('../test/showV2PropertyEditsFixture')
  const { propertyEditTrack } = await import('../test/showV2PropertyEditsFixture')
  const record = propertyEditGroupRecord(); record.id = 'recovery-group'
  const { dependencies } = recoveryFixture()
  record.composition.executionModel = 'continuous'
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'recovery-source' }
  const track = propertyEditTrack({ kind: 'clip-view', clipId: 'child', property: 'brightness' }); track.activeDurationMs = 400; track.keyframes[1].timeMs = 400
  const intent = { kind: 'add-track', track } as const
  const expected = editShowPropertyV2(record, { kind: 'group-definition', definitionId: 'definition' }, intent)
  expect(expected.status).toBe('changed')
  const capture = captureShowStageEditV2(record, dependencies); expect(capture.prepared.status).toBe('ready')
  const write = vi.fn(async () => {})
  setPersonalContentProvider({ ...getPersonalContentProvider(), replaceShowV2: write })
  useShowStore.setState({ showV2Pilots: { [record.id]: record } })
  const outcome = await admitShowV2PilotPropertyEdit({ showId: record.id, baseRevision: 0, capture, isCurrent: () => true, onAdopted: vi.fn(), propertyOwner: { kind: 'group-definition', definitionId: 'definition' }, intent })
  expect(outcome.status).toBe('applied')
  expect(outcome.affectedGroupOccurrenceIds).toEqual(['occ-0', 'occ-1'])
  expect(outcome.affectedGroupDefinitionIds).toEqual(['definition'])
  expect(useShowStore.getState().showV2Pilots[record.id].composition.patternInstances).toEqual(record.composition.patternInstances)
  for (const [key, value] of Object.entries(expected)) if (key.startsWith('affected') || key === 'removedIds' || key === 'discardedControlTargets') expect(outcome).toHaveProperty(key, value)
})
it('rechecks route/dependencies after candidate preparation before the only adoption', async () => {
  const { record, context, write } = setup(); const request = context()
  let checks = 0; request.isCurrent = () => ++checks === 1
  const outcome = await admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: 'animation' } })
  expect(checks).toBe(2); expect(outcome).toMatchObject({ status: 'refused', code: 'stale-edit' }); emptyEffects(outcome)
  expect(write).not.toHaveBeenCalled(); expect(useShowStore.getState().showV2Pilots[record.id]).toBe(record)
})
it('own receipt identifies adoption but a replaced provider supersedes completion', async () => {
  const { context, write } = setup(); const request = context()
  let finish!: () => void
  write.mockImplementationOnce(async () => { await new Promise<void>(resolve => { finish = resolve }) })
  const saving = admitShowV2PilotPropertyEdit({ ...request, propertyOwner: { kind: 'show' }, intent: { kind: 'remove-track', trackId: 'animation' } })
  await vi.waitFor(() => expect(write).toHaveBeenCalledTimes(1))
  expect(request.onAdopted).toHaveBeenCalledTimes(1)
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'external' }); finish()
  expect(await saving).toMatchObject({ status: 'applied', settlement: 'superseded' })
})
