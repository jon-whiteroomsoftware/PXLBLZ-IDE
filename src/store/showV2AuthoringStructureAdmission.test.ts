// The structural Zone Layout and output-count rules through the production v2
// admissions (#1039).
//
// v1's classification is unambiguous: `validateShowAuthoring` reports an
// unknown Zone, a non-integer physical endpoint, invalid logical routing, a
// duplicate Zone identity inside one Layout and an output pixel count that is
// not a positive safe integer as STRUCTURAL ERRORS, so
// `agent/editorAdmission.ts` and `store/showResizeAdmission.ts` refuse the
// candidate outright. An output count merely past the compiled capacity is a
// delivery warning that leaves the Show authorable. Nothing on the v2 path
// asked any of them. The oracle for each case below is therefore the real
// admission's receipt plus the provider write spy and the history: refused,
// nothing written, nothing adopted - or applied, with the warning present.
//
// The Zone Layout definition owner already refuses these inputs, so the
// reachable v2 surface is the agent candidate. One case pins the owner refusal
// too, and one pins that a negative integer endpoint - which v1 admits - is
// still admitted here.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { captureShowAuthoringBaselineV2, validateShowAuthoringV2 } from '@/engine/showAuthoringValidationV2'
import { SHOW_MAX_OUTPUT_PIXELS } from '@/engine/showVmResourceLedger'
import { commandFixtureV2 } from '@/engine/showCommandsV2/fixtures'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import type { ShowRoutingLayout } from '@/engine/personalContentRecords'
import { getPersonalContentProvider, resetPersonalContentProvider, setPersonalContentProvider } from '@/engine/personalContentProvider'
import * as stage from '@/engine/showPreparedStageV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { showInitialState, useShowStore } from './showStore'
import { admitShowV2PilotLayoutDefinitionEdit } from './showV2PreparedEditAdmission'

const VOICE = 'export function render2D(index, x, y) { rgb(x, y, .5) }'

beforeEach(() => { resetPersonalContentProvider(); useShowStore.setState(showInitialState) })
afterEach(() => { resetPersonalContentProvider(); vi.restoreAllMocks() })

let index = 0

/** A 16-pixel Installation Show whose one physical Zone Layout owns every pixel once. */
function setup() {
  const record = commandFixtureV2()
  record.id = `zone-layout-${++index}`
  for (const instance of record.composition.patternInstances) {
    instance.pattern = { kind: 'user', id: 'voice' }
    instance.patternName = 'Voice'
  }
  record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  record.zoneLayouts = [{
    id: 'both',
    name: 'Both',
    zones: [
      { zoneId: 'left', ranges: [{ start: 0, end: 7 }] },
      { zoneId: 'right', ranges: [{ start: 8, end: 15 }] },
    ],
  }]
  expect(validateShowRecordV2(record)).toEqual([])
  const dependencies: stage.ShowPreparedStageDependenciesV2 = {
    patterns: [{ id: 'voice', name: 'Voice', src: VOICE, controls: {}, updatedAt: 1 }],
    maps: [], libraries: [], profiles: [], stageMap: null,
  }
  let saved = structuredClone(record)
  const write = vi.fn(async (_id: string, next: ShowRecordV2) => { saved = structuredClone(next) })
  setPersonalContentProvider({ ...getPersonalContentProvider(), id: 'zone-layout-test', replaceShowV2: write, listShowDocumentsV2: async () => [structuredClone(saved)] })
  useShowStore.setState({ showV2Pilots: { [record.id]: record }, showV2Histories: { [record.id]: { past: [], future: [] } } })
  const capture = stage.captureShowStageEditV2(record, dependencies)
  if (capture.prepared.status === 'refused') throw new Error(capture.prepared.message)
  const sessionId = useShowStore.getState().beginShowEditSession(record.id)
  const baseline = captureShowAuthoringBaselineV2(record, {
    source: reference => (reference.kind === 'user' && reference.id === 'voice' ? VOICE : undefined),
    libraries: LIBRARIES,
  })
  let operation = 0
  const deliver = (candidate: unknown) => {
    const begin = useShowStore.getState().beginShowEdit(sessionId, {
      operationId: `op-${++operation}`, payloadKey: `payload-${operation}`, referenceContext: 'context', targets: [record.id],
    })
    if (begin.status !== 'pending') throw new Error(`begin refused: ${begin.status}`)
    return useShowStore.getState().deliverShowV2EditCandidate({
      request: begin.request,
      candidate,
      capture,
      baseline,
      isCurrent: () => useShowStore.getState().showV2Pilots[record.id] === capture.record,
    })
  }
  /** One candidate that changes only the Show's Zone Layouts. */
  const candidate = (zoneLayouts: ShowRoutingLayout[]): ShowRecordV2 => {
    const next = structuredClone(record)
    next.zoneLayouts = structuredClone(zoneLayouts)
    return next
  }
  return {
    record, dependencies, capture, write, deliver, candidate,
    source: (reference: { kind: string; id: string }) => (reference.kind === 'user' && reference.id === 'voice' ? VOICE : undefined),
    readSaved: () => saved,
    history: () => useShowStore.getState().showV2Histories[record.id],
    current: () => useShowStore.getState().showV2Pilots[record.id],
    context: () => ({
      showId: record.id,
      baseRevision: useShowStore.getState().showRevisions[record.id] ?? 0,
      capture: stage.captureShowStageEditV2(useShowStore.getState().showV2Pilots[record.id], dependencies),
      isCurrent: () => true,
      onAdopted: vi.fn(),
    }),
  }
}

const diagnosticOf = (receipt: unknown) => (
  receipt as { diagnostic?: { stage: string; issues: { code: string; path?: string }[] } }
).diagnostic

const FAULTS: Array<{ name: string; code: string; zoneLayouts: ShowRoutingLayout[] }> = [
  {
    name: 'a physical range endpoint that is not a safe integer',
    code: 'invalid-physical-range',
    zoneLayouts: [{ id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0.5, end: 14.75 }] }, { zoneId: 'right', ranges: [] }] }],
  },
  {
    name: 'a Layout naming a Zone the Show does not have',
    code: 'layout-missing-zone',
    zoneLayouts: [{ id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'gone', ranges: [{ start: 8, end: 15 }] }] }],
  },
  {
    name: 'a routing operator whose parameters do not describe its Zones',
    code: 'invalid-logical-routing',
    zoneLayouts: [{ id: 'both', name: 'Both', zones: [], logical: { kind: 'grid', zoneIds: ['left', 'right'], columns: 2, rows: 2 } }],
  },
  {
    name: 'one Zone entered twice in one Layout',
    code: 'duplicate-identity',
    zoneLayouts: [{ id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'left', ranges: [{ start: 8, end: 15 }] }] }],
  },
]

it.each(FAULTS)('refuses an agent candidate carrying $name', ({ code, zoneLayouts }) => {
  const context = setup()
  const receipt = context.deliver(context.candidate(zoneLayouts))
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  const diagnostic = diagnosticOf(receipt)
  expect(diagnostic?.stage).toBe('authoring')
  expect(diagnostic?.issues.map(issue => issue.code)).toContain(code)
  expect(context.write).not.toHaveBeenCalled()
  expect(context.history().past).toEqual([])
  expect(context.current()).toBe(context.record)
  expect(context.readSaved().zoneLayouts).toEqual(context.record.zoneLayouts)
})

it('still admits a negative integer endpoint, which v1 admits too', async () => {
  // v1 asks for a safe integer, not a nonnegative one; the Installation
  // coverage rule answers the pixels that do not exist. Refusing here would be
  // a new rule, not a restored one.
  const context = setup()
  const receipt = context.deliver(context.candidate([{
    id: 'both', name: 'Both', zones: [{ zoneId: 'left', ranges: [{ start: -4, end: 7 }] }, { zoneId: 'right', ranges: [{ start: 8, end: 15 }] }],
  }]))
  expect(receipt).toMatchObject({ status: 'applied' })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(context.write).toHaveBeenCalledTimes(1)
  expect(context.readSaved().zoneLayouts[0].zones[0].ranges).toEqual([{ start: -4, end: 7 }])
})

it('refuses an agent candidate whose output pixel count is not a positive safe integer', () => {
  const context = setup()
  const candidate = structuredClone(context.record)
  candidate.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16.5, resolution: 'fixed' }
  const receipt = context.deliver(candidate)
  expect(receipt).toMatchObject({ status: 'refused', reason: 'invalid-candidate' })
  expect(diagnosticOf(receipt)?.issues.map(issue => issue.code)).toContain('invalid-output-count')
  expect(context.write).not.toHaveBeenCalled()
  expect(context.history().past).toEqual([])
  expect(context.current()).toBe(context.record)
})

it('admits an agent candidate whose output count is past the compiled capacity, with the delivery warning', async () => {
  // v1 keeps this authorable: the count check returns only for a non-integer or
  // non-positive count, and the capacity message is a warning admissions ignore.
  const context = setup()
  const candidate = structuredClone(context.record)
  candidate.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: SHOW_MAX_OUTPUT_PIXELS + 1, resolution: 'fixed' }
  candidate.zoneLayouts = [{
    id: 'both',
    name: 'Both',
    zones: [
      { zoneId: 'left', ranges: [{ start: 0, end: SHOW_MAX_OUTPUT_PIXELS / 2 - 1 }] },
      { zoneId: 'right', ranges: [{ start: SHOW_MAX_OUTPUT_PIXELS / 2, end: SHOW_MAX_OUTPUT_PIXELS }] },
    ],
  }]
  expect(context.deliver(candidate)).toMatchObject({ status: 'applied' })
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(context.write).toHaveBeenCalledTimes(1)
  const validated = validateShowAuthoringV2(candidate, { source: context.source, libraries: LIBRARIES })
  expect(validated.valid).toBe(true)
  expect(validated.warnings.map(issue => issue.message)).toContain(
    `Show output requests ${(SHOW_MAX_OUTPUT_PIXELS + 1).toLocaleString('en-US')} pixels; compiled Shows support at most ${SHOW_MAX_OUTPUT_PIXELS.toLocaleString('en-US')}.`,
  )
})

it('keeps the editor Zone Layout owner refusing the same input at the owner, before admission', async () => {
  const context = setup()
  const refused = await admitShowV2PilotLayoutDefinitionEdit({
    ...context.context(),
    intent: { kind: 'set-physical-ranges', layoutId: 'both', zoneId: 'left', ranges: [{ start: 0.5, end: 7 }] },
  })
  expect(refused).toMatchObject({ status: 'refused', source: 'owner', code: 'invalid-request' })
  expect(context.write).not.toHaveBeenCalled()
  expect(context.current()).toBe(context.record)
})
