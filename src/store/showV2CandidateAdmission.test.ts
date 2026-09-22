import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import { captureShowStageEditV2 } from '@/engine/showPreparedStageV2'
import * as stage from '@/engine/showPreparedStageV2'
import { captureShowAuthoringBaselineV2 } from '@/engine/showAuthoringValidationV2'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowPreparedStageDependenciesV2 } from '@/engine/showPreparedStageV2'
import { showInitialState, useShowStore } from './showStore'

const VOICE = 'export var t = 0\nexport function beforeRender(delta) { t += delta }\nexport function render2D(index, x, y) { rgb(x, y, t / 1000) }'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })

let index = 0
function voiceDependencies(): ShowPreparedStageDependenciesV2 {
  return {
    patterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
}

function voiceBaseline(record: ShowRecordV2) {
  return captureShowAuthoringBaselineV2(record, {
    source: reference => (reference.kind === 'user' && reference.id === 'voice' ? VOICE : undefined),
    libraries: LIBRARIES,
  })
}

function setup(options: { failSave?: boolean } = {}) {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const record = converted.record
  record.id = `candidate-${++index}`
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies = voiceDependencies()
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => {
    if (options.failSave) throw new Error('save refused')
    saved = structuredClone(next)
  })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'candidate-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = captureShowStageEditV2(record, dependencies)
  if (capture.prepared.status === 'refused') throw new Error(capture.prepared.message)
  const store = useShowStore.getState()
  const sessionId = store.beginShowEditSession(record.id)
  const baseline = voiceBaseline(record)
  const begin = (operationId = 'op-1') => {
    const receipt = useShowStore.getState().beginShowEdit(sessionId, { operationId, payloadKey: `payload-${operationId}`, referenceContext: 'context', targets: [record.id] })
    if (receipt.status !== 'pending') throw new Error(`begin refused: ${receipt.status}`)
    return receipt.request
  }
  const deliver = (candidate: unknown, operationId = 'op-1', overrides: { isCurrent?: () => boolean; request?: ReturnType<typeof begin> } = {}) => (
    useShowStore.getState().deliverShowV2EditCandidate({
      request: overrides.request ?? begin(operationId),
      candidate,
      capture,
      baseline,
      isCurrent: overrides.isCurrent ?? (() => useShowStore.getState().showV2Pilots[record.id] === capture.record),
    })
  )
  const edited = (): ShowRecordV2 => {
    const next = structuredClone(record)
    next.composition.clips[0].durationMs = 500
    return next
  }
  return {
    record, capture, dependencies, write, sessionId, begin, deliver, edited,
    readSaved: () => saved,
    history: () => useShowStore.getState().showV2Histories[record.id],
    current: () => useShowStore.getState().showV2Pilots[record.id],
  }
}

const settled = async () => { await new Promise(resolve => setTimeout(resolve, 0)) }

it('adopts one valid candidate with exactly one history entry, one save and a fresh ordering stamp', async () => {
  const context = setup()
  const before = structuredClone(context.record)
  const receipt = context.deliver(context.edited())
  expect(receipt).toMatchObject({ status: 'applied', settlement: 'saving' })
  await settled()
  expect(useShowStore.getState().readShowEdit(context.sessionId, 'op-1')).toMatchObject({ status: 'applied', settlement: 'saved' })
  expect(context.write).toHaveBeenCalledTimes(1)
  expect(context.history().past).toEqual([before])
  expect(context.record).toEqual(before)
  expect(context.current().composition.clips[0].durationMs).toBe(500)
  expect(context.current().updatedAt).toBeGreaterThan(before.updatedAt)
  expect(context.readSaved().composition.clips[0].durationMs).toBe(500)
})

it('refuses a candidate delivered against a stale revision, leaving the Show untouched', async () => {
  const context = setup()
  const request = context.begin()
  await useShowStore.getState().updateShowV2Pilot(context.record.id, context.edited())
  context.write.mockClear()
  const receipt = context.deliver(context.edited(), 'op-1', { request })
  expect(receipt).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(context.write).not.toHaveBeenCalled()
})

it('refuses a candidate whose prepared capture is no longer the open record', () => {
  const context = setup()
  const receipt = context.deliver(context.edited(), 'op-1', { isCurrent: () => false })
  expect(receipt).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(context.write).not.toHaveBeenCalled()
  expect(context.history().past).toEqual([])
})

it('answers a duplicate delivery from the receipt and refuses a changed candidate for the same operation', async () => {
  const context = setup()
  const request = context.begin()
  const candidate = context.edited()
  const first = context.deliver(candidate, 'op-1', { request })
  const repeat = context.deliver(structuredClone(candidate), 'op-1', { request })
  expect(repeat).toEqual(first)
  const different = context.edited()
  different.composition.clips[0].durationMs = 400
  expect(context.deliver(different, 'op-1', { request })).toMatchObject({ status: 'refused', reason: 'identity-mismatch' })
  await settled()
  expect(context.write).toHaveBeenCalledTimes(1)
})

it.each([
  ['raw-schema', (next: ShowRecordV2) => { (next as unknown as { composition: unknown }).composition = 'not a composition' }],
  ['normalized', (next: ShowRecordV2) => { next.composition.clips[0].layerId = 'gone' }],
] as const)('refuses a structurally or domain-invalid candidate at the %s stage', (stageName, break_) => {
  const context = setup()
  const candidate = context.edited()
  break_(candidate)
  const receipt = context.deliver(candidate)
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect((receipt as { diagnostic?: { stage: string } }).diagnostic?.stage).toBe(stageName)
  expect(context.write).not.toHaveBeenCalled()
  expect(context.history().past).toEqual([])
  expect(context.current()).toBe(context.record)
})

it('refuses a raw authoring-schema document delivered in place of a Show record', () => {
  const context = setup()
  const receipt = context.deliver({ version: 2, id: context.record.id, $schema: 'https://example.invalid/show-v2', type: 'object' })
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect((receipt as { diagnostic?: { stage: string } }).diagnostic?.stage).toBe('raw-schema')
  expect(context.write).not.toHaveBeenCalled()
})

it('refuses a candidate that introduces an unavailable Pattern source', () => {
  const context = setup()
  const candidate = context.edited()
  candidate.composition.patternInstances.push({
    id: 'added-instance', pattern: { kind: 'user', id: 'absent' }, patternName: 'Absent', time: { timeScale: 1, timeOffsetMs: 0 },
  })
  const receipt = context.deliver(candidate)
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  const diagnostic = (receipt as { diagnostic?: { stage: string; issues: { code: string }[] } }).diagnostic
  expect(diagnostic?.stage).toBe('authoring')
  expect(diagnostic?.issues.map(issue => issue.code)).toContain('pattern-reference-unavailable')
  expect(context.write).not.toHaveBeenCalled()
})

it('refuses a zero-write candidate without a history entry, save or ordering stamp', () => {
  const context = setup()
  const receipt = context.deliver(structuredClone(context.record))
  expect(receipt).toMatchObject({ status: 'refused', reason: 'no-candidate' })
  expect(context.write).not.toHaveBeenCalled()
  expect(context.history().past).toEqual([])
  expect(context.current()).toBe(context.record)
})

it('refuses a candidate the prepared Stage cannot compile', () => {
  const context = setup()
  vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2').mockReturnValue({ status: 'refused', message: 'compiler refused' })
  const receipt = context.deliver(context.edited())
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect((receipt as { diagnostic?: { issues: { code: string }[] } }).diagnostic?.issues.map(issue => issue.code)).toContain('delivery-invalid')
  expect(context.write).not.toHaveBeenCalled()
})

it('accepts a candidate that deletes the final content, leaving a validated empty Show', async () => {
  const context = setup()
  const candidate = structuredClone(context.record)
  candidate.composition.clips = []
  candidate.composition.transitions = []
  candidate.composition.propertyTracks = []
  candidate.composition.patternInstances = []
  expect(context.deliver(candidate)).toMatchObject({ status: 'applied' })
  await settled()
  expect(context.readSaved().composition.clips).toEqual([])
})

it('rolls back a failed save, restores the record and history, and settles the receipt as rolled-back', async () => {
  const context = setup({ failSave: true })
  const before = structuredClone(context.record)
  expect(context.deliver(context.edited())).toMatchObject({ status: 'applied', settlement: 'saving' })
  await settled()
  expect(useShowStore.getState().readShowEdit(context.sessionId, 'op-1')).toMatchObject({ status: 'applied', settlement: 'rolled-back' })
  expect(context.current()).toEqual(before)
  expect(context.history().past).toEqual([])
  expect(useShowStore.getState().showV2SaveFailure?.showId).toBe(context.record.id)
})

it('settles a superseded save without reporting it as saved', async () => {
  const context = setup()
  let release = () => {}
  context.write.mockImplementationOnce(async () => { await new Promise<void>(resolve => { release = resolve }) })
  expect(context.deliver(context.edited())).toMatchObject({ status: 'applied', settlement: 'saving' })
  await settled()
  const superseding = structuredClone(context.current())
  superseding.composition.clips[0].durationMs = 400
  const later = useShowStore.getState().updateShowV2Pilot(context.record.id, superseding)
  release()
  await later
  await settled()
  expect(useShowStore.getState().readShowEdit(context.sessionId, 'op-1')).toMatchObject({ status: 'applied', settlement: 'superseded' })
})

it('adopts a lesson draft through the candidate path with a draft settlement and no provider write', async () => {
  const context = setup()
  const lessonId = 'stock-show-103-clip-transform'
  const lesson = stockShowV2ById(lessonId)
  if (!lesson) throw new Error(`Missing lesson ${lessonId}`)
  // The lesson opens first so its pilot is a session draft; the capture below
  // is built from that live draft, never from setup's own record.
  await expect(useShowStore.getState().openShowV2Pilot(lessonId)).resolves.toMatchObject({ status: 'ready' })
  const live = useShowStore.getState().showV2Pilots[lessonId]
  if (!live) throw new Error('Lesson pilot missing after open')
  const voiced = structuredClone(live)
  for (const instance of voiced.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  useShowStore.setState(state => ({ showV2Pilots: { ...state.showV2Pilots, [lessonId]: voiced } }))
  const capture = captureShowStageEditV2(voiced, voiceDependencies())
  if (capture.prepared.status === 'refused') throw new Error(capture.prepared.message)
  const store = useShowStore.getState()
  const sessionId = store.beginShowEditSession(lessonId)
  const baseline = voiceBaseline(voiced)
  const begin = (operationId = 'op-lesson') => {
    const receipt = useShowStore.getState().beginShowEdit(sessionId, { operationId, payloadKey: `payload-${operationId}`, referenceContext: 'context', targets: [lessonId] })
    if (receipt.status !== 'pending') throw new Error(`begin refused: ${receipt.status}`)
    return receipt.request
  }
  const candidate = structuredClone(voiced)
  candidate.composition.clips[0].durationMs = 500
  const receipt = useShowStore.getState().deliverShowV2EditCandidate({
    request: begin(),
    candidate,
    capture,
    baseline,
    isCurrent: () => useShowStore.getState().showV2Pilots[lessonId] === capture.record,
  })
  expect(receipt).toMatchObject({ status: 'applied', settlement: 'draft' })
  await settled()
  expect(useShowStore.getState().readShowEdit(sessionId, 'op-lesson')).toMatchObject({ status: 'applied', settlement: 'draft' })
  expect(context.write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Histories[lessonId]?.past).toHaveLength(1)
})
