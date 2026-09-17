// Installation physical coverage through the production v2 admissions and
// delivery (#1039).
//
// The rule these assert is v1's, unchanged: an Installation Show whose physical
// Zone Layout does not own every output pixel exactly once stays authorable -
// `validateShowAuthoring` reports it as a delivery warning and the harness
// bridge suite pins that the same Show commits and reopens - and
// `compileShowForArtifact` refuses to deliver it. So the oracle for every edit
// below is a pair: the admission applies, and the artifact the route would
// export or send refuses.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import * as stage from '@/engine/showPreparedStageV2'
import { buildShowV2RouteArtifacts } from '@/engine/showV2RouteDelivery'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import { captureShowAuthoringBaselineV2, validateShowAuthoringV2 } from '@/engine/showAuthoringValidationV2'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { showInitialState, useShowStore } from './showStore'
import {
  admitShowV2PilotLayoutDefinitionEdit,
  admitShowV2PilotShowMetadata,
  admitShowV2PilotZoneEdit,
} from './showV2PreparedEditAdmission'

const VOICE = 'export var gain = .4\nexport function sliderGain(v) { gain = v }\nexport function render2D(index, x, y) { rgb(gain, x, y) }'
const INCOMPLETE = expect.stringContaining('Installation output is incomplete')

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })

/** A 16-pixel Installation Show whose two physical Zone Layouts each own every pixel once. */
function setup() {
  const record = commandFixtureV2()
  for (const instance of record.composition.patternInstances) {
    instance.pattern = { kind: 'user', id: 'voice' }
    instance.patternName = 'Voice'
  }
  record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  record.zoneLayouts = [
    { id: 'both', name: 'Both', zones: [
      { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
      { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
    ] },
    { id: 'left-only', name: 'Left only', zones: [
      { zoneId: 'left', ranges: [{ start: 0, end: 15 }] },
    ] },
  ]
  expect(validateShowRecordV2(record)).toEqual([])
  const dependencies: stage.ShowPreparedStageDependenciesV2 = {
    patterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'coverage-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const context = () => {
    const current = useShowStore.getState().showV2Pilots[record.id]
    return {
      showId: record.id,
      baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
      capture: stage.captureShowStageEditV2(current, dependencies),
      isCurrent: () => true,
      onAdopted: vi.fn(),
    }
  }
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

it('narrows one Zone Layout range, then refuses to deliver the Show', async () => {
  const context = setup()
  expect(context.delivery(context.record).status).toBe('ready')
  const applied = await admitShowV2PilotLayoutDefinitionEdit({
    ...context.context(),
    intent: { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 8, end: 11 }] },
  })
  expect(applied).toMatchObject({ status: 'applied', affectedLayoutDefinitionIds: ['both'], affectedZoneIds: ['right'] })
  expect(context.readSaved().zoneLayouts[0].zones[1].ranges).toEqual([{ start: 8, end: 11 }])
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('overlaps two Zone Layout ranges, then refuses to deliver the Show', async () => {
  const context = setup()
  const applied = await admitShowV2PilotLayoutDefinitionEdit({
    ...context.context(),
    intent: { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 4, end: 15 }] },
  })
  expect(applied.status).toBe('applied')
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('pushes one Zone Layout range past the output, then refuses to deliver the Show', async () => {
  const context = setup()
  const applied = await admitShowV2PilotLayoutDefinitionEdit({
    ...context.context(),
    intent: { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 8, end: 23 }] },
  })
  expect(applied.status).toBe('applied')
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('raises the Installation pixel count past the authored ranges, then refuses to deliver the Show', async () => {
  const context = setup()
  const applied = await admitShowV2PilotShowMetadata({
    ...context.context(),
    intent: { command: 'set_output_contract', input: { kind: 'installation', pixel_count: 32, map_id: null } },
  })
  expect(applied.status).toBe('applied')
  expect(context.readSaved().outputContract).toMatchObject({ kind: 'installation', pixelCount: 32 })
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('adds a Zone whose appended ranges fall outside the output, then refuses to deliver the Show', async () => {
  // The Zone owner appends nominal ranges after the largest authored end, which
  // is exactly what v1 did; on a fixed Installation output those pixels do not
  // exist, and v1 refuses the artifact for the same reason.
  const context = setup()
  const applied = await admitShowV2PilotZoneEdit({
    ...context.context(),
    intent: { kind: 'add', zone: { id: 'spare', name: 'Spare', nominalPixelCount: 8, color: '#22c55e' } },
  })
  expect(applied).toMatchObject({ status: 'applied', affectedZoneIds: ['spare'] })
  expect(context.readSaved().zoneLayouts[0].zones[2]).toEqual({ zoneId: 'spare', ranges: [{ start: 16, end: 23 }] })
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('removes a Zone whose ranges owned part of the output, then refuses to deliver the Show', async () => {
  const context = setup()
  const applied = await admitShowV2PilotZoneEdit({
    ...context.context(),
    intent: { kind: 'remove', zoneId: 'right' },
  })
  expect(applied).toMatchObject({ status: 'applied', removedIds: expect.arrayContaining(['right']) })
  expect(context.readSaved().zoneLayouts[0].zones.map(zone => zone.zoneId)).toEqual(['left'])
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('admits an agent candidate that introduces the fault, reporting it as a delivery warning', async () => {
  const context = setup()
  const store = useShowStore.getState()
  const sessionId = store.beginShowEditSession(context.record.id)
  const source = (ref: { kind: string; id: string }) => (ref.kind === 'user' && ref.id === 'voice' ? VOICE : undefined)
  const baseline = captureShowAuthoringBaselineV2(context.record, { source, libraries: LIBRARIES })
  const candidate = structuredClone(context.record)
  candidate.zoneLayouts[0].zones[1].ranges = [{ start: 8, end: 11 }]
  const captured = context.context()
  const begin = useShowStore.getState().beginShowEdit(sessionId, { operationId: 'op-1', payloadKey: 'payload-1', referenceContext: 'context', targets: [context.record.id] })
  if (begin.status !== 'pending') throw new Error(`begin refused: ${begin.status}`)
  const receipt = useShowStore.getState().deliverShowV2EditCandidate({
    request: begin.request, candidate, capture: captured.capture, baseline,
    isCurrent: () => useShowStore.getState().showV2Pilots[context.record.id] === captured.capture.record,
  })
  expect(receipt).toMatchObject({ status: 'applied' })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(context.write).toHaveBeenCalledTimes(1)

  const validated = validateShowAuthoringV2(candidate, { source, libraries: LIBRARIES, baseline, allowExistingMissing: true })
  expect(validated.valid).toBe(true)
  expect(validated.warnings.map(issue => issue.message)).toContainEqual(INCOMPLETE)
  expect(context.delivery(context.readSaved())).toEqual({ status: 'refused', message: INCOMPLETE })
})

it('repairs the ranges through the owner and delivers the Show again', async () => {
  const context = setup()
  const broken = await admitShowV2PilotLayoutDefinitionEdit({
    ...context.context(),
    intent: { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 8, end: 11 }] },
  })
  expect(broken.status).toBe('applied')
  expect(context.delivery(context.readSaved()).status).toBe('refused')
  const repaired = await admitShowV2PilotLayoutDefinitionEdit({
    ...context.context(),
    intent: { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
  })
  expect(repaired.status).toBe('applied')
  expect(context.delivery(context.readSaved()).status).toBe('ready')
})
