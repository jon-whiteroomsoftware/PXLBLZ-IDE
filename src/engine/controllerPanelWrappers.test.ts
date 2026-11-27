import { describe, expect, it } from 'vitest'
import {
  controllerPanelShowWrapperLine,
  describeControllerWrappersReadout,
  deriveControllerPanelWrappers,
  resolveControllerPanelWrapperEvidence,
  type ControllerPanelWrapperEvidence,
} from './controllerPanelWrappers'
import { shapeControllerControls } from './controllerPanelView'
import type { ControllerWrapperOutcome } from './controllerProfile'
import type { ControllerPushRecord } from './controllerPushRecord'

const pattern = (outcome?: ControllerWrapperOutcome): ControllerPanelWrapperEvidence =>
  outcome ? { sourceKind: 'pattern', outcome } : { sourceKind: 'pattern' }
const unknown: ControllerPanelWrapperEvidence = { sourceKind: 'unknown' }
const both: ControllerWrapperOutcome = { applied: ['slow-mo', 'dreamy'], skipped: {} }
const inputDriven: ControllerWrapperOutcome = {
  ...both,
  inputs: { 'slow-mo': { inputId: 'dial', name: 'Saved dial' } },
}
const memorySkip = { reason: 'array-budget' as const, message: 'Skipped: not enough memory.' }
const clash = { reason: 'control-name-taken' as const, message: 'Skipped: name taken.' }

// The author's controls interleaved with both reserved exports, a near-match, the
// legacy preview name and an author toggle with the same rendered label.
const interleaved = {
  sliderSpeed: 0.4,
  sliderSlowMo: 0.3,
  toggleMirror: 1,
  sliderSlowMoX: 0.2,
  toggleSlowMo: 0,
  sliderDreamy: 0.6,
  slider__pxlblz_slowmo_speed: 0.5,
  sliderHue: 0.9,
}
const authorOnly = {
  sliderSpeed: 0.4,
  toggleMirror: 1,
  sliderSlowMoX: 0.2,
  toggleSlowMo: 0,
  slider__pxlblz_slowmo_speed: 0.5,
  sliderHue: 0.9,
}

describe('deriveControllerPanelWrappers', () => {
  it.each([
    [[{ id: 'dial', name: 'Current dial' }], 'Current dial'],
    [[{ id: 'another-id', name: 'Unrelated dial' }], 'Saved dial'],
  ])('describes an applied input by ID and falls back to its saved name (#1278 P1)', (inputs, name) => {
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported: interleaved,
      evidence: pattern(inputDriven),
      enabled: [],
      inputs,
    })
    expect(group).toEqual({
      kind: 'rows',
      rows: [
        { type: 'slow-mo', label: 'Slow-mo', exportName: 'sliderSlowMo', input: { name } },
        { type: 'dreamy', label: 'Dreamy', exportName: 'sliderDreamy', value: 0.6 },
      ],
    })
    expect(ownReported).toEqual(authorOnly)
    if (group.kind !== 'rows') throw new Error('Expected Wrapper rows')
    expect(describeControllerWrappersReadout(group.rows)[0]).toEqual({ label: 'slow-mo', value: name, live: false })
  })

  it('keeps the slider for a saved Pattern that opts out of the profile input (#1278 P1)', () => {
    const { group } = deriveControllerPanelWrappers({
      reported: { sliderSlowMo: 0.3 },
      evidence: pattern({ applied: ['slow-mo'], skipped: {} }),
      enabled: ['slow-mo'],
      inputs: [{ id: 'dial', name: 'Current dial' }],
    })
    expect(group).toEqual({
      kind: 'rows',
      rows: [{ type: 'slow-mo', label: 'Slow-mo', exportName: 'sliderSlowMo', value: 0.3 }],
    })
  })

  it.each([
    ['saved record', pattern(both)],
    ['reported names (no record)', unknown],
    ['reported names (Pattern, record unavailable)', pattern()],
  ])('groups both exact reserved exports from %s and leaves every author Control as today', (_, evidence) => {
    const { group, ownReported } = deriveControllerPanelWrappers({ reported: interleaved, evidence, enabled: [] })
    expect(group).toEqual({
      kind: 'rows',
      rows: [
        { type: 'slow-mo', label: 'Slow-mo', exportName: 'sliderSlowMo', value: 0.3 },
        { type: 'dreamy', label: 'Dreamy', exportName: 'sliderDreamy', value: 0.6 },
      ],
    })
    expect(ownReported).toEqual(authorOnly)
    // Own Controls keep today's order, labels and kinds, including "speed".
    expect(shapeControllerControls(ownReported)).toEqual(shapeControllerControls(authorOnly))
    expect(shapeControllerControls(ownReported).map((c) => c.label)).toEqual([
      'Speed', 'Mirror', 'Slow Mo X', 'Slow Mo', '__pxlblz_slowmo_speed', 'Hue',
    ])
  })

  it.each([
    ['nothing reserved', {}, []],
    ['Slow-mo only', { sliderSlowMo: 0.3 }, ['slow-mo']],
    ['Dreamy only', { sliderDreamy: 0.6 }, ['dreamy']],
    ['both, Dreamy reported first', { sliderDreamy: 0.6, sliderSlowMo: 0.3 }, ['slow-mo', 'dreamy']],
  ])('falls back to the reported names: %s', (_, reserved, expected) => {
    const reported = { sliderSpeed: 0.4, ...reserved }
    const { group, ownReported } = deriveControllerPanelWrappers({ reported, evidence: unknown, enabled: ['slow-mo', 'dreamy'] })
    const types = group.kind === 'rows' ? group.rows.map((row) => row.type) : []
    expect(types).toEqual(expected)
    if (!expected.length) expect(group).toEqual({ kind: 'absent' })
    expect(ownReported).toEqual({ sliderSpeed: 0.4 })
  })

  it('keeps an author Control with the same display label when no reserved name is reported', () => {
    const reported = { toggleSlowMo: 1 }
    expect(deriveControllerPanelWrappers({ reported, evidence: unknown, enabled: ['slow-mo'] })).toEqual({
      group: { kind: 'absent' },
      ownReported: reported,
    })
  })

  it('takes membership from the saved record: an applied Wrapper with no reported value is indeterminate', () => {
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported: { sliderSpeed: 0.4 },
      evidence: pattern(both),
      enabled: ['slow-mo', 'dreamy'],
    })
    expect(group).toEqual({
      kind: 'rows',
      rows: [
        { type: 'slow-mo', label: 'Slow-mo', exportName: 'sliderSlowMo', value: null },
        { type: 'dreamy', label: 'Dreamy', exportName: 'sliderDreamy', value: null },
      ],
    })
    expect(ownReported).toEqual({ sliderSpeed: 0.4 })
  })

  it('shows no row and no note for a skipped Wrapper, and hides its leftover stored value', () => {
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported: { sliderSlowMo: 0.3, sliderDreamy: 0.6, sliderSpeed: 0.4 },
      evidence: pattern({ applied: ['dreamy'], skipped: { 'slow-mo': memorySkip } }),
      enabled: ['slow-mo', 'dreamy'],
    })
    expect(group).toEqual({
      kind: 'rows',
      rows: [{ type: 'dreamy', label: 'Dreamy', exportName: 'sliderDreamy', value: 0.6 }],
    })
    expect(ownReported).toEqual({ sliderSpeed: 0.4 })
  })

  it("keeps an author's Control that owns a reserved name in the author's group", () => {
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported: { sliderSlowMo: 0.3, sliderDreamy: 0.6 },
      evidence: pattern({ applied: ['dreamy'], skipped: { 'slow-mo': clash } }),
      enabled: ['slow-mo', 'dreamy'],
    })
    expect(group).toEqual({
      kind: 'rows',
      rows: [{ type: 'dreamy', label: 'Dreamy', exportName: 'sliderDreamy', value: 0.6 }],
    })
    expect(ownReported).toEqual({ sliderSlowMo: 0.3 })
  })

  it('preserves reported reserved names when a structural refusal preempts the name check', () => {
    const reported = { sliderSlowMo: 0.3, sliderSpeed: 0.4 }
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported,
      evidence: pattern({ applied: [], skipped: {
        'slow-mo': { reason: 'shadowed-builtin', message: 'A top-level binding shadows rgb.' },
      } }),
      enabled: ['slow-mo'],
    })
    expect(group).toEqual({ kind: 'absent' })
    expect(ownReported).toEqual(reported)
  })

  it('keeps an unevaluated reserved name as an own Control when the record applies nothing', () => {
    const reported = { sliderSlowMo: 0.3, sliderSpeed: 0.4 }
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported,
      evidence: pattern({ applied: [], skipped: {} }),
      enabled: [],
    })
    expect(group).toEqual({ kind: 'absent' })
    expect(ownReported).toEqual(reported)
  })

  it.each([
    ['in range', 0.25, 0.25],
    ['exactly 0', 0, 0],
    ['exactly 1', 1, 1],
    ['out of range', 1.98, null],
    ['negative', -0.1, null],
    ['nonfinite', Number.POSITIVE_INFINITY, null],
    ['NaN', Number.NaN, null],
    ['nonnumeric', 'fast', null],
  ])('displays a %s report with the expected slider value', (_, raw, expected) => {
    const { group } = deriveControllerPanelWrappers({
      reported: { sliderSlowMo: raw },
      evidence: unknown,
      enabled: [],
    })
    expect(group.kind === 'rows' ? group.rows[0].value : 'no row').toBe(expected)
  })

  it('returns an untouched control map when no Wrapper is involved', () => {
    const reported = { sliderSpeed: 0.4, toggleMirror: 0 }
    for (const evidence of [unknown, pattern(), pattern({ applied: [], skipped: {} })]) {
      const result = deriveControllerPanelWrappers({ reported, evidence, enabled: ['slow-mo'] })
      expect(result.group).toEqual({ kind: 'absent' })
      expect(result.ownReported).toEqual(reported)
    }
  })

  it.each([
    [['slow-mo', 'dreamy'], { kind: 'show-line', text: 'Slow-mo and Dreamy are off for Shows.' }],
    [['dreamy', 'slow-mo'], { kind: 'show-line', text: 'Slow-mo and Dreamy are off for Shows.' }],
    [['slow-mo'], { kind: 'show-line', text: 'Slow-mo is off for Shows.' }],
    [['dreamy'], { kind: 'show-line', text: 'Dreamy is off for Shows.' }],
    [[], { kind: 'absent' }],
  ] as const)('gives a Show with %j on the group %j and keeps its controls its own', (enabled, expected) => {
    const reported = { sliderSlowMo: 0.3, sliderSpeed: 0.4 }
    const { group, ownReported } = deriveControllerPanelWrappers({
      reported,
      evidence: { sourceKind: 'show' },
      enabled,
    })
    expect(group).toEqual(expected)
    expect(ownReported).toEqual(reported)
  })

  it('never reads the Show line for a Pattern, wrapped or not', () => {
    for (const evidence of [unknown, pattern(), pattern(both)]) {
      const { group } = deriveControllerPanelWrappers({ reported: {}, evidence, enabled: ['slow-mo', 'dreamy'] })
      expect(group.kind).not.toBe('show-line')
    }
  })
})

describe('controllerPanelShowWrapperLine', () => {
  it('names nothing when both Wrappers are off', () => {
    expect(controllerPanelShowWrapperLine([])).toBeNull()
  })
})

describe('resolveControllerPanelWrapperEvidence', () => {
  const record = (patch: Partial<ControllerPushRecord>): ControllerPushRecord => ({
    transforms: [],
    artifactHash: 'h',
    stampedAt: '2026-11-26T00:00:00.000Z',
    name: 'Aurora',
    ...patch,
  })
  const bindings = { '10.0.0.5': { 'pattern-a': 'prog-a', 'show:s1': 'prog-s', 'pattern-b': 'prog-b' } }
  const pushRecords = {
    '10.0.0.5': {
      'pattern-a': record({ wrapperOutcome: both, wrapperProgramId: 'prog-a' }),
      // A receipt for an earlier slot: its outcome does not describe prog-b.
      'pattern-b': record({ wrapperOutcome: inputDriven, wrapperProgramId: 'prog-old' }),
    },
  }
  const resolve = (activeProgramId: string | undefined, overrides: Partial<Parameters<typeof resolveControllerPanelWrapperEvidence>[0]> = {}) =>
    resolveControllerPanelWrapperEvidence({ controllerId: '10.0.0.5', activeProgramId, bindings, pushRecords, ...overrides })

  it('joins the confirmed outcome by the active program ID', () => {
    expect(resolve('prog-a')).toEqual({ sourceKind: 'pattern', outcome: both })
  })
  it('has no outcome when the receipt names another program ID', () => {
    const evidence = resolve('prog-b')
    expect(evidence).toEqual({ sourceKind: 'pattern' })
    expect(deriveControllerPanelWrappers({
      evidence, reported: { sliderSlowMo: 0.3 }, enabled: ['slow-mo'],
    }).group).toEqual({
      kind: 'rows',
      rows: [{ type: 'slow-mo', label: 'Slow-mo', exportName: 'sliderSlowMo', value: 0.3 }],
    })
  })
  it('identifies a Show from its binding key, not from its controls', () => {
    expect(resolve('prog-s')).toEqual({ sourceKind: 'show' })
  })
  it.each([
    ['a foreign program', 'prog-foreign', {}],
    ['no active program', undefined, {}],
    ['unread bindings', 'prog-a', { bindings: null }],
    ['another Controller', 'prog-a', { controllerId: '10.0.0.9' }],
    ['no Controller', 'prog-a', { controllerId: null }],
  ] as const)('is unknown for %s', (_, id, overrides) => {
    expect(resolve(id, overrides)).toEqual({ sourceKind: 'unknown' })
  })
})
