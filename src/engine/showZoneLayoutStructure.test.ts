// The structural Zone Layout rule, and the v1/v2 parity that is the point of
// sharing it (#1039).
//
// Every expectation below is measured against `validateShowAuthoring` itself
// over the same authored Zone Layout, never against a restated message.
import { expect, it } from 'vitest'
import { LIBRARIES } from '../pixelblaze/libs'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { ShowRecord, ShowRoutingLayout } from './personalContentRecords'
import { validateShowAuthoring } from './showAuthoringValidation'
import { validateShowAuthoringV2 } from './showAuthoringValidationV2'
import type { ShowRecordV2 } from './showCompositionV2'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import { validateShowZoneLayoutStructure, type ShowZoneLayoutStructureCode } from './showZoneLayoutStructure'

const VOICE = 'export function render(index) { hsv(index, 1, 1) }'
const source = () => VOICE

const STRUCTURE_CODES: readonly ShowZoneLayoutStructureCode[] = [
  'empty-identity', 'duplicate-identity', 'layout-missing-zone', 'invalid-physical-range', 'invalid-logical-routing',
]

/** One matched v1/v2 pair over the same authored Zone Layouts. */
function pair(layouts: ShowRoutingLayout[]): { v1: ShowRecord; v2: ShowRecordV2 } {
  const v1 = convertibleV1Show()
  for (const instance of v1.composition!.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  v1.routingLayouts = structuredClone(layouts)
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status !== 'converted') throw new Error('Conversion')
  const v2 = converted.record
  for (const instance of v2.composition.patternInstances) instance.pattern = { kind: 'user', id: 'voice' }
  v2.zoneLayouts = structuredClone(layouts)
  return { v1, v2 }
}

/** Only the Zone Layout family, so unrelated dependency issues cannot mask it. */
function layoutIssues(result: { errors: Array<{ diagnosticCode?: string; message: string; path?: string }> }) {
  return result.errors
    .filter((issue) => STRUCTURE_CODES.includes(issue.diagnosticCode as ShowZoneLayoutStructureCode))
    .map((issue) => ({ diagnosticCode: issue.diagnosticCode, message: issue.message, path: issue.path }))
}

const FAULTS: Array<{ name: string; layouts: ShowRoutingLayout[]; expected: ShowZoneLayoutStructureCode[] }> = [
  {
    name: 'complete physical Layout',
    layouts: [{ id: 'layout', name: 'Full', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 15 }] }] }],
    expected: [],
  },
  {
    name: 'fractional physical endpoints',
    layouts: [{ id: 'layout', name: 'Full', zones: [{ zoneId: 'zone', ranges: [{ start: 0.5, end: 14.75 }] }] }],
    expected: ['invalid-physical-range'],
  },
  {
    name: 'endpoint outside the safe integer range',
    layouts: [{ id: 'layout', name: 'Full', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: Number.MAX_SAFE_INTEGER + 2 }] }] }],
    expected: ['invalid-physical-range'],
  },
  {
    name: 'negative integer endpoint, which v1 admits',
    layouts: [{ id: 'layout', name: 'Full', zones: [{ zoneId: 'zone', ranges: [{ start: -4, end: 15 }] }] }],
    expected: [],
  },
  {
    name: 'physical entry naming a Zone the Show does not have',
    layouts: [{ id: 'layout', name: 'Full', zones: [{ zoneId: 'gone', ranges: [{ start: 0, end: 15 }] }] }],
    expected: ['layout-missing-zone'],
  },
  {
    name: 'routing operator naming a Zone the Show does not have',
    layouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'single', zoneIds: ['gone'] } }],
    expected: ['layout-missing-zone'],
  },
  {
    name: 'one Zone entered twice in one Layout',
    layouts: [{
      id: 'layout',
      name: 'Full',
      zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 7 }] }, { zoneId: 'zone', ranges: [{ start: 8, end: 15 }] }],
    }],
    expected: ['duplicate-identity'],
  },
  {
    name: 'blank Zone identity in one Layout',
    layouts: [{ id: 'layout', name: 'Full', zones: [{ zoneId: ' ', ranges: [{ start: 0, end: 15 }] }] }],
    expected: ['empty-identity', 'layout-missing-zone'],
  },
  {
    name: 'routing operator whose parameters do not describe its Zones',
    layouts: [{ id: 'layout', name: 'Full', zones: [], logical: { kind: 'grid', zoneIds: ['zone'], columns: 2, rows: 2 } }],
    expected: ['invalid-logical-routing'],
  },
  {
    name: 'a second Layout carrying its own fault',
    layouts: [
      { id: 'layout', name: 'Full', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 15 }] }] },
      { id: 'spare', name: 'Spare', zones: [{ zoneId: 'zone', ranges: [{ start: 0, end: 1.5 }] }] },
    ],
    expected: ['invalid-physical-range'],
  },
]

it.each(FAULTS)('reports $name exactly as the v1 authoring validator does', ({ layouts, expected }) => {
  const { v1, v2 } = pair(layouts)
  const v1Issues = layoutIssues(validateShowAuthoring(v1, { source, libraries: LIBRARIES }))
  expect(v1Issues.map((issue) => issue.diagnosticCode)).toEqual(expected)
  expect(layoutIssues(validateShowAuthoringV2(v2, { source, libraries: LIBRARIES }))).toEqual(v1Issues)
})

it('reports the shared rule over the v1 and v2 field names alike', () => {
  for (const { layouts } of FAULTS) {
    const { v1, v2 } = pair(layouts)
    const rule = validateShowZoneLayoutStructure({ zones: v1.zones, routingLayouts: v1.routingLayouts })
    expect(validateShowZoneLayoutStructure({ zones: v2.zones, routingLayouts: v2.zoneLayouts })).toEqual(rule)
    expect(rule.map((issue) => ({ diagnosticCode: issue.diagnosticCode, message: issue.message, path: issue.path })))
      .toEqual(layoutIssues(validateShowAuthoring(v1, { source, libraries: LIBRARIES })))
  }
})

it('returns before the delivery questions, exactly as v1 returns after its structural pass', () => {
  // v1 line 174 returns as soon as a structural error exists, so an
  // Installation coverage warning never accompanies one. The v2 validator must
  // return at the same point or it would report a different diagnostic set.
  const { v1, v2 } = pair([{ id: 'layout', name: 'Full', zones: [{ zoneId: 'zone', ranges: [{ start: 0.5, end: 14.75 }] }] }])
  for (const record of [v1, v2]) {
    record.outputContract = { version: 1, kind: 'installation', outputMapId: null, pixelCount: 16, resolution: 'fixed' }
  }
  const first = validateShowAuthoring(v1, { source, libraries: LIBRARIES })
  const second = validateShowAuthoringV2(v2, { source, libraries: LIBRARIES })
  expect(first.valid).toBe(false)
  expect(first.warnings).toEqual([])
  expect(second.valid).toBe(false)
  expect(second.warnings).toEqual([])
})
