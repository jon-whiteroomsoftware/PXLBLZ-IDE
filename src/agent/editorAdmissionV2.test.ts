// @vitest-environment jsdom
//
// The agent command path on a `ShowRecordV2` (#1039), end to end inside the
// browser: the shared editor admission resolves the v2 record, the private
// executor folds the v2 catalogue over it, and the candidate admission adopts
// it through the store's one v2 writer. The oracle is what a consumer sees -
// the provider's saved record, the reopened `.pxlshow` and `.epe`, and the
// history - never a generator internal.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { captureShowStageEditV2, prepareShowStageV2 } from '@/engine/showPreparedStageV2'
import { createAgentPrivateExecutor } from '@/engine/agentPrivateExecutor'
import { buildShowEpeExportV2 } from '@/engine/showEpeExportV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { showInitialState, useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { admitShowV2PilotSetShowEnd } from '@/store/showV2PreparedEditAdmission'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { createAgentEditorAdmission } from './editorAdmission'
import { createAgentPrivateAdmissionOwner } from './privateAdmissionOwner'

const VOICE = 'export var t = 0\nexport function beforeRender(delta) { t += delta }\nexport function render2D(index, x, y) { rgb(x, y, t / 1000) }'
const PATTERN = { id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }

// jsdom's Blob has no stream(); the portable file writer uses the platform one.
globalThis.Blob = (await import('node:buffer')).Blob as unknown as typeof globalThis.Blob

let index = 0
let close = () => {}
beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { close(); close = () => {}; resetPersonalContentProvider(); vi.restoreAllMocks() })

function baseRecord(id: string): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const record = converted.record
  record.id = id
  record.composition.showEndMs = 20_000
  record.composition.layoutOccurrences[0].durationMs = 20_000
  record.composition.clips[0].durationMs = 10_000
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  return record
}

function setup(options: { failSave?: boolean; patterns?: typeof PATTERN[] } = {}) {
  // Each setup owns a distinct Show identity: the store's durable v2 baseline
  // is module state keyed by Show id, and a reused id would let one test's
  // saved record become another test's rollback target.
  const showId = `v2-agent-${++index}`
  window.history.replaceState(null, '', `/studio/shows/${showId}?agent=1`)
  const record = baseRecord(showId)
  const patterns = options.patterns ?? [PATTERN]
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => {
    if (options.failSave) throw new Error('save refused')
    saved = structuredClone(next)
  })
  setPersonalContentProvider({
    ...getPersonalContentProvider(),
    id: 'v2-agent-test',
    replaceShowV2: write,
    listShowDocumentsV2: async () => [structuredClone(saved)],
  })
  usePatternStore.setState({ userPatterns: patterns, patternsLoaded: true } as never)
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const dependencies = { patterns, maps: [], libraries: [], profiles: [], stageMap: null }
  const captureOf = (value: ShowRecordV2) => captureShowStageEditV2(value, dependencies)
  let capture = captureOf(record)
  if (capture.prepared.status === 'refused') throw new Error(capture.prepared.message)
  // The route recaptures whenever its record changes; so does this binding.
  const unsubscribe = useShowStore.subscribe(() => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    if (current && current !== capture.record) capture = captureOf(current)
  })
  const admission = createAgentEditorAdmission(record.id, () => ({ playheadMs: 0 }), undefined, undefined, {
    recordVersion: 2,
    capture: () => capture,
    isCurrentCapture: () => useShowStore.getState().showV2Pilots[record.id] === capture.record,
  })
  close = () => { unsubscribe(); admission.close() }
  const scope = { bindingId: 'binding', sessionId: admission.sessionId }
  const executor = createAgentPrivateExecutor(scope, createAgentPrivateAdmissionOwner(admission))
  const sequences = new Map<string, number>()
  const send = (payload: unknown, operationId = 'op') => {
    const sequence = sequences.get(operationId) ?? 0
    sequences.set(operationId, sequence + 1)
    return executor.deliver({ ...scope, operationId, deliveryId: `${operationId}-d${sequence}`, sequence, payload })
  }
  const command = (name: string, args: Record<string, unknown>) => send({ kind: 'command', name, arguments: args })
  return {
    record, admission, executor, send, command, write,
    dependencies, patterns,
    capture: () => capture,
    readSaved: () => saved,
    current: () => useShowStore.getState().showV2Pilots[record.id],
    history: () => useShowStore.getState().showV2Histories[record.id],
  }
}

const settled = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }
const layer = (record: ShowRecordV2) => record.composition.layers[0]
const zone = (record: ShowRecordV2) => record.zones[0]

it('returns the v2 record to read_show and runs the #1029 sequence through to a reopened artifact', async () => {
  const context = setup()
  const before = structuredClone(context.record)
  expect(context.admission.getShow()).toEqual(context.record)
  expect((context.admission.getShow() as ShowRecordV2).version).toBe(2)

  expect(context.send({ kind: 'begin_edit', intent: 'Rebuild the overlay' }).code).toBe('begun')
  const created = context.command('create_layers', {
    layers: [{
      zone_id: zone(context.record).id,
      name: 'Overlay',
      clips: [{
        zone_id: zone(context.record).id, start_ms: 0, duration_ms: 8_000,
        pattern: { kind: 'user', id: 'voice' }, instance: 'sole',
      }],
    }],
  })
  expect(created.code).toBe('changed')
  const details = (created as unknown as { changes: Array<{ details: { layers: string[]; clips: string[] } }> }).changes
  const newLayerId = details.flatMap(change => change.details.layers)[0]
  const newClipId = details.flatMap(change => change.details.clips)[0]
  expect(newLayerId).toBeTruthy()
  expect(newClipId).toBeTruthy()

  expect(context.command('remove_clips', { clip_ids: [before.composition.clips[0].id] }).code).toBe('changed')
  expect(context.command('set_show_end', { end_ms: 30_000 }).code).toBe('changed')
  expect(context.command('add_property_tracks', {
    tracks: [{ target: { kind: 'opacity', clip_id: newClipId }, keyframes: [
      { at_ms: 0, value: 0, easing: 'linear' },
      { at_ms: 8_000, value: 1, easing: 'linear' },
    ] }],
  }).code).toBe('changed')

  // Nothing reaches the store until the one commit.
  expect(context.current()).toBe(context.record)
  expect(context.write).not.toHaveBeenCalled()

  expect(context.send({ kind: 'commit_edit' }).code).toBe('outcome')
  await settled()
  expect(context.executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'saved' } })
  expect(context.write).toHaveBeenCalledTimes(1)
  expect(context.history().past).toEqual([before])

  const saved = context.readSaved()
  expect(saved.composition.showEndMs).toBe(30_000)
  expect(saved.composition.clips.map(clip => clip.id)).toEqual([newClipId])
  expect(saved.composition.layers.some(entry => entry.id === newLayerId)).toBe(true)
  expect(saved.composition.propertyTracks).toHaveLength(1)

  // Reopened through the consumers: the portable file and the exported artifact.
  const bundle = buildShowFileBundle(saved, { patterns: context.patterns, maps: [], libraries: [] }, { appVersion: 'test', exportedAt: '2026-01-01T00:00:00.000Z' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle.bundle), { acceptV2: true })
  expect(reopened.version).toBe(2)
  expect(reopened.show).toEqual(saved)
  const preparedSaved = prepareShowStageV2(saved, context.dependencies)
  expect(preparedSaved.status).toBe('ready')
  if (preparedSaved.status !== 'ready') throw new Error('prepared')
  const epe = buildShowEpeExportV2(saved, preparedSaved.bundle.artifact.code)
  expect(epe.status).toBe('exported')
})

it('yields deep-equal records and one history entry whether the intent arrives manually or as a command', async () => {
  const manual = setup()
  const manualOutcome = await admitShowV2PilotSetShowEnd({
    showId: manual.record.id, baseRevision: useShowStore.getState().showRevisions[manual.record.id] ?? 0,
    capture: manual.capture(), isCurrent: () => true, onAdopted: () => {},
    intent: { kind: 'set-show-end', showEndMs: 26_000 },
  })
  expect(manualOutcome.status).toBe('applied')
  const manualRecord = manual.readSaved()
  const manualHistory = manual.history().past.length
  close(); close = () => {}
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)

  const commanded = setup()
  expect(commanded.send({ kind: 'begin_edit', intent: 'Set the Show End' }).code).toBe('begun')
  expect(commanded.command('set_show_end', { end_ms: 26_000 }).code).toBe('changed')
  expect(commanded.send({ kind: 'commit_edit' }).code).toBe('outcome')
  await settled()
  const commandedRecord = commanded.readSaved()

  // Two setups own two Show identities; the choreography is what must match.
  const semantic = (record: ShowRecordV2) => ({ ...record, id: 'show', updatedAt: 0 })
  expect(semantic(commandedRecord)).toEqual(semantic(manualRecord))
  expect(commanded.history().past.length).toBe(manualHistory)
})

it('replaces one Clip Pattern and reopens the saved record with the replacement', async () => {
  const context = setup({ patterns: [PATTERN, { id: 'other', name: 'Other', src: 'export function render(index) { hsv(0, 1, 1) }', controls: {}, updatedAt: 1 }] })
  const clipId = context.record.composition.clips[0].id
  expect(context.send({ kind: 'begin_edit', intent: 'Swap the Pattern' }).code).toBe('begun')
  const replaced = context.command('replace_clip_pattern', { clip_id: clipId, pattern: { kind: 'user', id: 'other' } })
  expect(replaced.code).toBe('changed')
  expect(context.send({ kind: 'commit_edit' }).code).toBe('outcome')
  await settled()
  expect(context.executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied' } })
  const saved = context.readSaved()
  const instanceId = saved.composition.clips.find(clip => clip.id === clipId)!.instanceId
  expect(saved.composition.patternInstances.find(instance => instance.id === instanceId)!.pattern).toEqual({ kind: 'user', id: 'other' })
  expect(context.history().past).toHaveLength(1)
})

it('deletes the last Clip and adds a replacement at the freed boundary in one committed sequence', async () => {
  const context = setup()
  const clipId = context.record.composition.clips[0].id
  expect(context.send({ kind: 'begin_edit', intent: 'Delete and re-add' }).code).toBe('begun')
  expect(context.command('remove_clips', { clip_ids: [clipId] }).code).toBe('changed')
  const created = context.command('create_clips', {
    clips: [{
      zone_id: zone(context.record).id, layer_id: layer(context.record).id,
      start_ms: 0, duration_ms: 10_000, pattern: { kind: 'user', id: 'voice' }, instance: 'sole',
    }],
  })
  expect(created.code).toBe('changed')
  expect(context.send({ kind: 'commit_edit' }).code).toBe('outcome')
  await settled()
  const saved = context.readSaved()
  expect(saved.composition.clips).toHaveLength(1)
  expect(saved.composition.clips[0].id).not.toBe(clipId)
  expect(saved.composition.clips[0]).toMatchObject({ startMs: 0, durationMs: 10_000 })
  // No resurrected Transition at the boundary the deletion freed.
  expect(saved.composition.transitions).toEqual([])
  expect(context.history().past).toHaveLength(1)
})

it('refuses a commit whose base revision a manual edit superseded, leaving one adoption', async () => {
  const context = setup()
  const before = structuredClone(context.record)
  expect(context.send({ kind: 'begin_edit', intent: 'Rename' }).code).toBe('begun')
  expect(context.command('rename_show', { name: 'Agent name' }).code).toBe('changed')
  await admitShowV2PilotSetShowEnd({
    showId: context.record.id, baseRevision: useShowStore.getState().showRevisions[context.record.id] ?? 0,
    capture: context.capture(), isCurrent: () => true, onAdopted: () => {},
    intent: { kind: 'set-show-end', showEndMs: 25_000 },
  })
  context.write.mockClear()
  expect(context.send({ kind: 'commit_edit' }).code).toBe('outcome')
  await settled()
  expect(context.executor.getOutcome('op')).toMatchObject({ receipt: { status: 'refused', reason: 'revision-conflict' } })
  expect(context.write).not.toHaveBeenCalled()
  expect(context.current().name).toBe(before.name)
})

it('rolls a failed save back and reports it on the receipt without a history entry', async () => {
  const context = setup({ failSave: true })
  const before = structuredClone(context.record)
  expect(context.send({ kind: 'begin_edit', intent: 'Rename' }).code).toBe('begun')
  expect(context.command('rename_show', { name: 'Agent name' }).code).toBe('changed')
  expect(context.send({ kind: 'commit_edit' }).code).toBe('outcome')
  await settled()
  expect(context.executor.getOutcome('op')).toMatchObject({ receipt: { status: 'applied', settlement: 'rolled-back' } })
  expect(context.current()).toEqual(before)
  expect(context.history().past).toEqual([])
  expect(useShowStore.getState().showV2SaveFailure?.showId).toBe(context.record.id)
})

it('refuses a duplicate begin key and keeps one private operation', () => {
  const context = setup()
  expect(context.send({ kind: 'begin_edit', intent: 'First' }).code).toBe('begun')
  expect(context.send({ kind: 'begin_edit', intent: 'Again' }).code).toBe('finished')
  expect(context.send({ kind: 'begin_edit', intent: 'Other' }, 'second').code).toBe('busy')
})
