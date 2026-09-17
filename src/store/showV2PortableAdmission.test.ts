// Portable 2D capability through the production v2 admissions and delivery (#1039).
//
// The rule these assert is v1's, unchanged: a Portable Show carrying a Pattern
// that only defines `render3D` stays authorable - `validateShowAuthoring` reports
// it as a delivery warning and the harness bridge suite pins that the same Show
// remains editable - and `compileShowForArtifact` refuses to deliver it. So the
// oracle for every edit below is a pair: the admission applies, and the artifact
// the route would export or send refuses.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { convertibleV1Show } from '@/test/showV2TracerFixture'
import * as stage from '@/engine/showPreparedStageV2'
import { buildShowV2RouteArtifacts } from '@/engine/showV2RouteDelivery'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { captureShowAuthoringBaselineV2, validateShowAuthoringV2 } from '@/engine/showAuthoringValidationV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import type { CreateShowClipIntentV2 } from '@/engine/showClipCreationV2'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotClipReplacementEdit,
  admitShowV2PilotCreateClip,
  admitShowV2PilotShowMetadata,
} from './showV2PreparedEditAdmission'

const SURFACE = 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render2D(index, x, y) { rgb(gain, x, y) }'
const VOLUME = 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render3D(index, x, y, z) { rgb(gain, y, z) }'
const UNINSPECTABLE = 'export function render2D(index, x, y) { rgb('

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })

let index = 0
function setup(options: { installation?: boolean; pattern?: 'surface' | 'volume' } = {}) {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const record = converted.record
  record.id = `portable-${++index}`
  record.composition.showEndMs = 30_000
  record.composition.layoutOccurrences[0].durationMs = 30_000
  record.composition.clips[0].durationMs = 10_000
  const patternId = options.pattern ?? 'surface'
  for (const instance of record.composition.patternInstances) {
    instance.pattern = { kind: 'user', id: patternId }
    instance.patternName = patternId === 'volume' ? 'Volume' : 'Surface'
  }
  if (options.installation) {
    record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  }
  const dependencies: stage.ShowPreparedStageDependenciesV2 = {
    patterns: [
      { id: 'surface', name: 'Surface', src: SURFACE, controls: {}, updatedAt: 1 },
      { id: 'volume', name: 'Volume', src: VOLUME, controls: {}, updatedAt: 1 },
      { id: 'broken', name: 'Broken', src: UNINSPECTABLE, controls: {}, updatedAt: 1 },
    ],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'portable-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = stage.captureShowStageEditV2(record, dependencies)
  if (capture.prepared.status !== 'ready') throw new Error(JSON.stringify(capture.prepared))
  const context = { showId: record.id, baseRevision: 0, capture, isCurrent: () => true, onAdopted: vi.fn() }
  return {
    record, dependencies, context, write,
    readSaved: () => saved,
    /** What the route would export or send for a record, through its own preparation. */
    delivery: (next: ShowRecordV2) => {
      const prepared = stage.prepareShowStageV2(next, dependencies)
      if (prepared.status !== 'ready') throw new Error(JSON.stringify(prepared))
      return buildShowV2RouteArtifacts(prepared.bundle)
    },
  }
}

const RENDER_3D_REFUSAL = expect.stringContaining('defines only render3D.')

it('adds a 3D-only Clip to a Portable Show, then refuses to deliver it', async () => {
  const context = setup()
  expect(context.delivery(context.record).status).toBe('ready')
  const intent: CreateShowClipIntentV2 = {
    kind: 'create-clip',
    patternReference: { kind: 'user', id: 'volume' },
    clip: {
      id: 'added', zoneId: context.record.zones[0].id, layerId: context.record.composition.layers[0].id,
      startMs: 10_000, durationMs: 10_000, entryPolicy: 'continue', zoneSampleMode: 'span',
      appearance: { keys: [{ id: 'added-key', timeMs: 10_000, value: { opacity: 1, view: { mirror: false, phase: 0, brightness: 1 }, effects: [] } }] },
    },
    runtime: { kind: 'first', instance: { id: 'volume-runtime', pattern: { kind: 'user', id: 'volume' }, patternName: 'Volume', time: { timeScale: 1, timeOffsetMs: 0 }, controlTargets: {} } },
  }
  const applied = await admitShowV2PilotCreateClip({ ...context.context, intent })
  expect(applied).toMatchObject({ status: 'applied', affectedClipIds: ['added'] })
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: RENDER_3D_REFUSAL })
})

it('replaces a Clip Pattern with the stock 3D AuroraSphere, then refuses to deliver it', async () => {
  const context = setup()
  const clipId = context.record.composition.clips[0].id
  const applied = await admitShowV2PilotClipReplacementEdit({
    ...context.context,
    intent: { kind: 'replace-pattern', clipId, patternReference: { kind: 'stock', id: 'AuroraSphere' } },
  })
  expect(applied).toMatchObject({ status: 'applied', affectedClipIds: [clipId] })
  expect(context.readSaved().composition.patternInstances[0].pattern).toEqual({ kind: 'stock', id: 'AuroraSphere' })
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: RENDER_3D_REFUSAL })
})

it('moves an Installation Show carrying a 3D-only Pattern to Portable, then refuses to deliver it', async () => {
  const context = setup({ installation: true, pattern: 'volume' })
  expect(context.delivery(context.record).status).toBe('ready')
  const applied = await admitShowV2PilotShowMetadata({
    ...context.context,
    intent: { command: 'set_output_contract', input: { kind: 'portable-2d', pixel_count: 16, map_id: null } },
  })
  expect(applied.status).toBe('applied')
  expect(context.readSaved().outputContract.kind).toBe('portable-2d')
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: RENDER_3D_REFUSAL })
})

it('admits an agent candidate that introduces the mismatch, reporting it as a delivery warning', async () => {
  const context = setup()
  const store = useShowStore.getState()
  const sessionId = store.beginShowEditSession(context.record.id)
  const baseline = captureShowAuthoringBaselineV2(context.record, {
    source: ref => (ref.kind === 'user' ? { surface: SURFACE, volume: VOLUME, broken: UNINSPECTABLE }[ref.id] : undefined),
    libraries: LIBRARIES,
  })
  const candidate = structuredClone(context.record)
  candidate.composition.patternInstances[0].pattern = { kind: 'user', id: 'volume' }
  candidate.composition.patternInstances[0].patternName = 'Volume'
  const begin = useShowStore.getState().beginShowEdit(sessionId, { operationId: 'op-1', payloadKey: 'payload-1', referenceContext: 'context', targets: [context.record.id] })
  if (begin.status !== 'pending') throw new Error(`begin refused: ${begin.status}`)
  const receipt = useShowStore.getState().deliverShowV2EditCandidate({
    request: begin.request, candidate, capture: context.context.capture, baseline,
    isCurrent: () => useShowStore.getState().showV2Pilots[context.record.id] === context.context.capture.record,
  })
  expect(receipt).toMatchObject({ status: 'applied' })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(context.write).toHaveBeenCalledTimes(1)

  const validated = validateShowAuthoringV2(candidate, {
    source: ref => (ref.kind === 'user' && ref.id === 'volume' ? VOLUME : undefined),
    libraries: LIBRARIES, baseline, allowExistingMissing: true,
  })
  expect(validated.valid).toBe(true)
  expect(validated.warnings.map(issue => issue.diagnosticCode)).toContain('portable-renderer-unsupported')
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: RENDER_3D_REFUSAL })
})

it('refuses a candidate whose Portable Pattern cannot be inspected, with no history, save or stamp', async () => {
  const context = setup()
  const before = useShowStore.getState().showV2Pilots[context.record.id]
  const store = useShowStore.getState()
  const sessionId = store.beginShowEditSession(context.record.id)
  const baseline = captureShowAuthoringBaselineV2(context.record, {
    source: ref => (ref.kind === 'user' ? { surface: SURFACE, volume: VOLUME, broken: UNINSPECTABLE }[ref.id] : undefined),
    libraries: LIBRARIES,
  })
  const candidate = structuredClone(context.record)
  candidate.composition.patternInstances[0].pattern = { kind: 'user', id: 'broken' }
  candidate.composition.patternInstances[0].patternName = 'Broken'
  const begin = useShowStore.getState().beginShowEdit(sessionId, { operationId: 'op-1', payloadKey: 'payload-1', referenceContext: 'context', targets: [context.record.id] })
  if (begin.status !== 'pending') throw new Error(`begin refused: ${begin.status}`)
  const receipt = useShowStore.getState().deliverShowV2EditCandidate({
    request: begin.request, candidate, capture: context.context.capture, baseline,
    isCurrent: () => useShowStore.getState().showV2Pilots[context.record.id] === context.context.capture.record,
  })
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(JSON.stringify(receipt)).toContain('portable-metadata-unavailable')
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(context.write).not.toHaveBeenCalled()
  expect(useShowStore.getState().showV2Histories[context.record.id].past).toEqual([])
  expect(useShowStore.getState().showV2Pilots[context.record.id]).toBe(before)
  expect(useShowStore.getState().showV2Pilots[context.record.id].updatedAt).toBe(before.updatedAt)
})

it('keeps the same 3D-only Pattern deliverable while the Show stays Installation', async () => {
  const context = setup({ installation: true, pattern: 'volume' })
  expect(context.delivery(context.record).status).toBe('ready')
})
