// @vitest-environment jsdom
import { Blob as NodeBlob } from 'node:buffer'
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
const state = () => useShowStore.getState()
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

function setup() {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const record = converted.record
  record.id = `candidate-${++index}`
  for (const instance of record.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  const dependencies = voiceDependencies()
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'candidate-test', replaceShowV2: write, deleteShow: async () => {}, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = captureShowStageEditV2(record, dependencies)
  if (capture.prepared.status === 'refused') throw new Error(capture.prepared.message)
  const sessionId = state().beginShowEditSession(record.id)
  const baseline = voiceBaseline(record)
  const begin = (operationId = 'op') => {
    const receipt = state().beginShowEdit(sessionId, { operationId, payloadKey: `payload-${operationId}`, referenceContext: 'context', targets: [record.id] })
    if (receipt.status !== 'pending') throw new Error(`begin refused: ${receipt.status}`)
    return receipt.request
  }
  const deliver = (candidate: unknown, request: ReturnType<typeof begin>) => state().deliverShowV2EditCandidate({
    request, candidate, capture, baseline,
    isCurrent: () => state().showV2Pilots[record.id] === capture.record,
  })
  const edited = (): ShowRecordV2 => {
    const next = structuredClone(record)
    next.composition.clips[0].durationMs = 500
    return next
  }
  return { record, capture, dependencies, write, sessionId, begin, deliver, edited, readSaved: () => saved }
}

let context: ReturnType<typeof setup>
let session: string
let request: ReturnType<ReturnType<typeof setup>['begin']>
const snapshot = () => structuredClone({
  pilots: { [request.showId]: state().showV2Pilots[request.showId] },
  histories: { [request.showId]: state().showV2Histories[request.showId] },
  writes: context.write.mock.calls.length,
})
const deliver = (candidate: unknown = context.edited(), envelope = request) => context.deliver(candidate, envelope)
const read = (id = request.operationId) => state().readShowEditCandidate(session, id)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] })
  resetPersonalContentProvider()
  useShowStore.setState(showInitialState)
  context = setup()
  session = context.sessionId
  request = context.begin()
})
afterEach(() => { state().retireShowEditSession(session); vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); resetPersonalContentProvider() })

it('waits for overlapping drag and dirty ownership, then adopts exactly once synchronously (v2)', async () => {
  const before = snapshot()
  const drag = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const dirty = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  expect(deliver()).toMatchObject({ status: 'waiting', deadline: 5000 })
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
  state().releaseShowEditActivity(drag)
  expect(read()?.status).toBe('waiting')
  vi.advanceTimersByTime(4999)
  state().releaseShowEditActivity(dirty)
  expect(read()?.status).toBe('applied')
  const adopted = snapshot()
  expect(adopted.pilots[request.showId]).toEqual({ ...context.edited(), updatedAt: expect.any(Number) })
  expect(adopted.pilots[request.showId].updatedAt).toBeGreaterThan(before.pilots[request.showId].updatedAt)
  expect(adopted.histories[request.showId]).toEqual({ past: [before.pilots[request.showId]], future: [] })
  state().releaseShowEditActivity(dirty)
  expect(deliver().status).toBe('applied')
  expect(snapshot()).toEqual(adopted)
  await vi.advanceTimersByTimeAsync(1)
  expect(context.write).toHaveBeenCalledTimes(1)
  expect(vi.getTimerCount()).toBe(0)
})

it.each([4999, 5000, 5001])('checks monotonic settlement at %i ms even if the timer is delayed (v2)', async (now) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const before = snapshot()
  deliver()
  vi.spyOn(performance, 'now').mockReturnValue(now)
  state().releaseShowEditActivity(token)
  const result = read()
  if (now < 5000) expect(result?.status).toBe('applied')
  else {
    expect(result).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
    expect(snapshot()).toEqual(before)
    expect(context.write).not.toHaveBeenCalled()
  }
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
})

it('keeps the original deadline across duplicate delivery and new ownership, then never applies late (v2)', async () => {
  const first = state().acquireShowEditActivity(session, request.showId, 'drag')!
  deliver()
  vi.advanceTimersByTime(4000)
  const second = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  state().releaseShowEditActivity(first)
  expect(deliver()).toMatchObject({ status: 'waiting', deadline: 5000 })
  const before = snapshot()
  vi.advanceTimersByTime(1000)
  expect(read()).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
  state().releaseShowEditActivity(second)
  expect(deliver()).toMatchObject({ reason: 'interaction-timeout' })
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it.each(['commit', 'undo'] as const)('manual %s publishes before ownership release and refuses stale completed work (v2)', async (mode) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  deliver()
  const manual = structuredClone(context.record)
  manual.composition.clips[0].durationMs = 400
  const saving = state().updateShowV2Pilot(request.showId, manual)
  if (mode === 'undo') await state().undoShowV2Pilot(request.showId)
  const before = snapshot()
  state().releaseShowEditActivity(token)
  expect(read()).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  await saving
  expect(context.write).toHaveBeenCalledTimes(mode === 'undo' ? 2 : 1)
})

it.each(['session', 'show', 'envelope', 'candidate'] as const)('wrong %s identity preserves the original wait (v2)', (mode) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  deliver()
  const wrong = { ...request, ...(mode === 'session' ? { sessionId: 'wrong' } : mode === 'show' ? { showId: 'wrong' } : mode === 'envelope' ? { payloadKey: 'wrong' } : {}) }
  const different = context.edited()
  different.composition.clips[0].durationMs = 400
  const result = deliver(mode === 'candidate' ? different : context.edited(), wrong)
  expect(['refused', 'retired']).toContain(result.status)
  expect(read()?.status).toBe('waiting')
  state().releaseShowEditActivity(token)
  expect(state().showV2Pilots[request.showId].composition.clips[0].durationMs).toBe(500)
})

it.each(['cancel', 'retire', 'new-session', 'hydrate', 'remove', 'complete'] as const)('releases all pending resources on %s (v2)', async (mode) => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  deliver()
  if (mode === 'cancel') state().cancelShowEdit(session, 'op')
  if (mode === 'retire') state().retireShowEditSession(session)
  if (mode === 'new-session') session = state().beginShowEditSession(request.showId)
  if (mode === 'hydrate') await state().loadShows()
  if (mode === 'remove') await state().removeShow(request.showId)
  if (mode === 'complete') expect(state().completeShowEdit(request, 'asked').status).toBe('completed')
  const before = snapshot()
  expect(vi.getTimerCount()).toBe(0)
  state().releaseShowEditActivity(token)
  vi.advanceTimersByTime(6000)
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
})

it('late or forged activity ownership cannot release a new session owner (v2)', () => {
  const old = state().acquireShowEditActivity(session, request.showId, 'drag')!
  session = state().beginShowEditSession(request.showId)
  request = state().beginShowEdit(session, { operationId: 'new', payloadKey: 'payload-new', referenceContext: 'context', targets: [request.showId] }).request
  const current = state().acquireShowEditActivity(session, request.showId, 'dirty-field')!
  deliver()
  state().releaseShowEditActivity(old)
  state().releaseShowEditActivity({ ...current })
  expect(read('new')?.status).toBe('waiting')
  state().releaseShowEditActivity(current)
  expect(read('new')?.status).toBe('applied')
})

it('captures candidate and request before the caller mutates them (v2)', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const mutable = structuredClone(request)
  const candidate = context.edited()
  deliver(candidate, mutable)
  candidate.composition.clips[0].durationMs = 400
  Object.assign(mutable, { operationId: 'other', showId: 'other' })
  state().releaseShowEditActivity(token)
  expect(state().showV2Pilots[request.showId].composition.clips[0].durationMs).toBe(500)
  expect(read()?.status).toBe('applied')
})

it('bounds operation and activity retention without eviction or an untracked successful token (v2)', () => {
  session = state().beginShowEditSession(request.showId, 1)
  request = state().beginShowEdit(session, { operationId: 'one', payloadKey: 'payload-one', referenceContext: '', targets: [request.showId] }).request
  const tokens = Array.from({ length: 256 }, () => state().acquireShowEditActivity(session, request.showId, 'drag')!)
  expect(() => state().acquireShowEditActivity(session, request.showId, 'drag')).toThrow('capacity')
  expect(state().beginShowEdit(session, { operationId: 'two', payloadKey: '', referenceContext: '', targets: [] }).reason).toBe('capacity')
  expect(deliver().status).toBe('waiting')
  tokens.forEach(token => state().releaseShowEditActivity(token))
  expect(read('one')?.status).toBe('applied')
  expect(state().beginShowEdit(session, { operationId: 'two', payloadKey: '', referenceContext: '', targets: [] }).reason).toBe('capacity')
})

it('focus alone acquires no activity and the accepted provider record reopens as the complete Show (v2)', async () => {
  vi.stubGlobal('Blob', NodeBlob)
  const { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } = await import('@/engine/showFileBundle')
  const input = document.createElement('input')
  document.body.append(input)
  input.focus()
  expect(document.activeElement).toBe(input)
  expect(deliver().status).toBe('applied')
  await vi.advanceTimersByTimeAsync(0)
  expect(context.write).toHaveBeenCalledTimes(1)
  const durable = context.readSaved()
  const { bundle } = buildShowFileBundle(durable, { patterns: context.dependencies.patterns, maps: [] }, { appVersion: 'B3' })
  const reopened = await parseShowFileBundle(await serializeShowFileBundle(bundle), { acceptV2: true })
  expect(reopened.show).toEqual(state().showV2Pilots[request.showId])
  input.remove()
})

it('already adopted delayed persistence settles normally after all activity and session teardown (v2)', async () => {
  let finish!: () => void
  context.write.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve }))
  expect(deliver().status).toBe('applied')
  await vi.advanceTimersByTimeAsync(0)
  const adopted = snapshot()
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  state().retireShowEditSession(session)
  state().releaseShowEditActivity(token)
  finish()
  await vi.advanceTimersByTimeAsync(0)
  expect(snapshot()).toEqual(adopted)
  expect(context.write).toHaveBeenCalledTimes(1)
  expect(read()).toBeUndefined()
})

it('noncandidate completion never queues and cannot turn into a candidate (v2)', () => {
  state().acquireShowEditActivity(session, request.showId, 'drag')
  const before = snapshot()
  expect(state().completeShowEdit(request, 'asked').status).toBe('completed')
  expect(deliver().status).toBe('completed')
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('refuses a known stale arrival immediately despite active input (v2)', async () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const manual = structuredClone(context.record)
  manual.composition.clips[0].durationMs = 400
  await state().updateShowV2Pilot(request.showId, manual)
  const before = snapshot()
  expect(deliver()).toMatchObject({ status: 'refused', reason: 'revision-conflict' })
  expect(vi.getTimerCount()).toBe(0)
  state().releaseShowEditActivity(token)
  expect(snapshot()).toEqual(before)
  expect(context.write).toHaveBeenCalledTimes(1)
})

it('a foreign-Show candidate terminally refuses without adopting after activity ends (v2)', () => {
  const before = snapshot()
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const result = deliver({ ...context.edited(), id: 'wrong' })
  expect(result).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(read()).toEqual(result)
  expect(vi.getTimerCount()).toBe(0)
  expect(deliver().status).toBe('refused')
  state().releaseShowEditActivity(token)
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
})

it('stock reset releases a pending timer while preserving active draft ownership (v2)', async () => {
  const lesson = stockShowV2ById('stock-show-103-clip-transform')!
  const opened = await state().openShowV2Pilot(lesson.id)
  if (opened.status !== 'ready') throw new Error('Lesson did not open')
  session = state().beginShowEditSession(lesson.id)
  request = state().beginShowEdit(session, { operationId: 'stock', payloadKey: 'payload-stock', referenceContext: '', targets: [lesson.id] }).request
  const capture = captureShowStageEditV2(opened.record, { patterns: [], maps: [], libraries: [], profiles: [], stageMap: null })
  const candidate = structuredClone(opened.record)
  candidate.name = 'Agent draft'
  const token = state().acquireShowEditActivity(session, lesson.id, 'dirty-field')!
  state().deliverShowV2EditCandidate({ request, candidate, capture, baseline: voiceBaseline(opened.record), isCurrent: () => state().showV2Pilots[lesson.id] === opened.record })
  state().resetShowV2LessonDraft(lesson.id)
  const before = snapshot()
  expect(vi.getTimerCount()).toBe(0)
  state().releaseShowEditActivity(token)
  expect(read('stock')).toMatchObject({ reason: 'revision-conflict' })
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
})

it('final validation refusal and same-session cancellation discard the callback without writes (v2)', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const invalid = context.edited()
  invalid.composition.clips[0].layerId = 'gone'
  const before = snapshot()
  deliver(invalid)
  state().releaseShowEditActivity(token)
  expect(read()).toMatchObject({ reason: 'invalid-candidate', diagnostic: { stage: 'normalized' } })
  const different = context.edited()
  different.composition.clips[0].durationMs = 400
  expect(deliver(different)).toMatchObject({ reason: 'identity-mismatch' })
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
  expect(vi.getTimerCount()).toBe(0)
})

it('early timer wakeups cannot expire before the monotonic deadline (v2)', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  deliver()
  vi.spyOn(performance, 'now').mockReturnValue(4999)
  vi.advanceTimersByTime(5000)
  expect(read()?.status).toBe('waiting')
  state().releaseShowEditActivity(token)
  expect(read()?.status).toBe('applied')
  expect(vi.getTimerCount()).toBe(0)
  vi.restoreAllMocks()
})

it.each([2000, 5000])('counts %i ms snapshot preparation against first-arrival deadline (v2)', (preparation) => {
  state().acquireShowEditActivity(session, request.showId, 'drag')
  const candidate = context.edited()
  const originalClone = globalThis.structuredClone
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0)
  vi.spyOn(globalThis, 'structuredClone').mockImplementation(value => {
    const result = originalClone(value)
    clock.mockReturnValue(preparation)
    return result
  })
  const result = deliver(candidate)
  expect(result).toMatchObject(preparation < 5000 ? { status: 'waiting', deadline: 5000 } : { status: 'refused', reason: 'interaction-timeout' })
  expect(context.write).not.toHaveBeenCalled()
  vi.restoreAllMocks()
})

it('does not adopt when final synchronous validation reaches the deadline (v2)', () => {
  const token = state().acquireShowEditActivity(session, request.showId, 'drag')!
  const before = snapshot()
  deliver()
  vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2').mockImplementation((...args) => {
    vi.spyOn(performance, 'now').mockReturnValue(5000)
    return stage.prepareShowStageV2(args[0], context.dependencies)
  })
  vi.advanceTimersByTime(4999)
  state().releaseShowEditActivity(token)
  expect(read()).toMatchObject({ status: 'refused', reason: 'interaction-timeout' })
  expect(snapshot()).toEqual(before)
  expect(context.write).not.toHaveBeenCalled()
})

it('does not impose a validation deadline on an immediate candidate that never waited for input (v2)', async () => {
  const before = snapshot()
  vi.spyOn(stage, 'prepareShowStageFromCapturedInputsV2').mockImplementation((...args) => {
    vi.spyOn(performance, 'now').mockReturnValue(6000)
    return stage.prepareShowStageV2(args[0], context.dependencies)
  })
  expect(deliver().status).toBe('applied')
  expect(state().showV2Histories[request.showId]).toEqual({ past: [before.pilots[request.showId]], future: [] })
  expect(state().showV2Pilots[request.showId]).toEqual({ ...context.edited(), updatedAt: expect.any(Number) })
  expect(vi.getTimerCount()).toBe(0)
  await vi.advanceTimersByTimeAsync(0)
  expect(context.write).toHaveBeenCalledTimes(1)
  expect(read()).toMatchObject({ status: 'applied', settlement: 'saved' })
})
