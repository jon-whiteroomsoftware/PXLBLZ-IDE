import { describe, expect, it } from 'vitest'
import type { ChangedPixel, PixelMeasurement } from './showCapturePixelEvidence'
import {
  demonstrateRestorationSideEffect,
  describePositions,
  type RestorationCapture,
  type RestorationSideEffectInput,
} from './showRestorationSideEffect'

/**
 * The retained #1065 scenario: restoring the v2 gauge slots leaves the preview help icon one channel
 * level different at six pixels, the two restored controls from independent opens are byte-identical
 * to each other, and the pristine-versus-restored control difference is exactly the same six pixels
 * with the same two values. Every case asks whether one specific wrong thing still demonstrates.
 */

const exact: PixelMeasurement = { comparable: true, changedPixels: 0, maximumChannelDelta: 0 }
const PRISTINE = [223, 223, 226, 255] as const
const RESTORED = [222, 222, 225, 255] as const
const RESIDUAL_POSITIONS = [
  { x: 181, y: 8 }, { x: 182, y: 8 }, { x: 183, y: 8 },
  { x: 184, y: 9 }, { x: 185, y: 9 }, { x: 186, y: 9 },
]

function digest(seed: string): string {
  return seed.replace(/[^0-9a-f]/g, 'a').padEnd(64, '0').slice(0, 64)
}

function capture(label: string, sequence: number): RestorationCapture {
  return { label, path: `/tmp/pxlblz-show-editor-equivalence/run/${label}.png`, sha256: digest(label), sequence }
}

function pixels(
  positions: readonly { x: number; y: number }[] = RESIDUAL_POSITIONS,
  left: readonly number[] = PRISTINE,
  right: readonly number[] = RESTORED,
): ChangedPixel[] {
  return positions.map(position => ({
    x: position.x,
    y: position.y,
    left: [...left] as unknown as ChangedPixel['left'],
    right: [...right] as unknown as ChangedPixel['right'],
  }))
}

function retainedScenario(): RestorationSideEffectInput {
  return {
    comparison: 'v2 delivered vs restored',
    version: 'v2',
    candidate: {
      left: capture('v2-delivered-candidate', 15),
      right: capture('v2-restored-candidate', 18),
      changedPixels: pixels(),
      reportedChangedPixels: 6,
    },
    control: {
      left: capture('v2-delivered-control-a', 7),
      right: capture('v2-restored-control-1', 9),
      changedPixels: pixels(),
      reportedChangedPixels: 6,
    },
    restoredControls: [capture('v2-restored-control-1', 9), capture('v2-restored-control-2', 12)],
    restoredControlAgreement: [
      { left: 'v2-restored-control-1', right: 'v2-restored-control-2', measurement: exact },
    ],
  }
}

describe('demonstrating a restoration side effect (#1065, Jon 2026-09-18)', () => {
  it('demonstrates the retained scenario and reports what it speaks for', () => {
    const result = demonstrateRestorationSideEffect(retainedScenario())
    expect(result.demonstrated).toBe(true)
    expect(result.reason).toBe('demonstrated')
    expect(result.residualPixels).toBe(6)
    expect(result.maximumChannelDelta).toBe(1)
    expect(result.positions).toEqual(RESIDUAL_POSITIONS)
    expect(result.controlPixels).toBe(6)
    expect(result.controlGroup).toEqual(['v2-restored-control-1', 'v2-restored-control-2'])
    expect(result.evidence.map(entry => entry.role)).toContain('control-pristine')
    expect(describePositions(result.positions)).toContain('(181, 8)')
  })

  it('refuses one residual pixel the controls never reproduced', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      candidate: {
        ...scenario.candidate,
        changedPixels: [...pixels(), ...pixels([{ x: 400, y: 40 }])],
        reportedChangedPixels: 7,
      },
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('residual-not-reproduced')
    expect(result.detail).toContain('(400, 40)')
  })

  it('refuses a residual whose values differ from the ones the controls showed', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      candidate: { ...scenario.candidate, changedPixels: pixels(RESIDUAL_POSITIONS, PRISTINE, [220, 222, 225, 255]) },
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('residual-not-reproduced')
    expect(result.detail).toContain('rgba(220, 222, 225, 255)')
  })

  it('refuses a control difference that also changed pixels the candidate never did', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      control: {
        ...scenario.control,
        changedPixels: [...pixels(), ...pixels([{ x: 12, y: 300 }])],
        reportedChangedPixels: 7,
      },
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('residual-not-reproduced')
    expect(result.detail).toContain('(12, 300)')
  })

  it('refuses restored controls that disagree with each other', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControlAgreement: [{
        left: 'v2-restored-control-1',
        right: 'v2-restored-control-2',
        measurement: { comparable: true, changedPixels: 2, maximumChannelDelta: 1 },
      }],
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('restored-controls-disagree')
    expect(result.detail).toContain('raster-noise classifier')
  })

  it('refuses restored controls that could not be compared at all', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControlAgreement: [{
        left: 'v2-restored-control-1',
        right: 'v2-restored-control-2',
        measurement: { comparable: false, detail: 'Captures are 390x844 and 390x843.' },
      }],
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('restored-controls-disagree')
  })

  it('refuses a restored-control group that was observed once, or never compared', () => {
    const scenario = retainedScenario()
    const single = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControls: [capture('v2-restored-control-1', 9)],
      restoredControlAgreement: [],
    })
    expect(single.reason).toBe('incomplete-evidence')
    const uncompared = demonstrateRestorationSideEffect({ ...scenario, restoredControlAgreement: [] })
    expect(uncompared.demonstrated).toBe(false)
    expect(uncompared.reason).toBe('incomplete-evidence')
    expect(uncompared.detail).toContain('never compared')
  })

  it('refuses a restored-control group whose members are one capture event under two labels', () => {
    const scenario = retainedScenario()
    const event = capture('v2-restored-control-1', 9)
    const vacuous = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControls: [event, { ...event, label: 'v2-restored-control-2' }],
      restoredControlAgreement: [{
        left: 'v2-restored-control-1', right: 'v2-restored-control-2', measurement: exact,
      }],
    })
    expect(vacuous.demonstrated).toBe(false)
    expect(vacuous.reason).toBe('incomplete-evidence')
    expect(vacuous.detail).toContain('independent opens')
    const resequence = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControls: [event, { ...capture('v2-restored-control-2', 12), sequence: 9 }],
      restoredControlAgreement: [{
        left: 'v2-restored-control-1', right: 'v2-restored-control-2', measurement: exact,
      }],
    })
    expect(resequence.demonstrated).toBe(false)
    expect(resequence.reason).toBe('incomplete-evidence')
  })

  it('accepts byte-identical images from separate capture events', () => {
    const scenario = retainedScenario()
    const first = capture('v2-restored-control-1', 9)
    const second = { ...capture('v2-restored-control-2', 12), sha256: first.sha256 }
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControls: [first, second],
    })
    expect(result.demonstrated).toBe(true)
    expect(result.reason).toBe('demonstrated')
  })

  it('refuses a control difference that does not run from a pristine control to a restored one', () => {
    const scenario = retainedScenario()
    const backwards = demonstrateRestorationSideEffect({
      ...scenario,
      control: { ...scenario.control, left: capture('v2-restored-control-2', 12), right: capture('v2-restored-control-1', 9) },
    })
    expect(backwards.reason).toBe('incomplete-evidence')
    const unrelated = demonstrateRestorationSideEffect({
      ...scenario,
      control: { ...scenario.control, right: capture('v2-normalized-control-1', 8) },
    })
    expect(unrelated.reason).toBe('incomplete-evidence')
  })

  it('refuses a control that is the candidate capture itself, or was taken after it', () => {
    const scenario = retainedScenario()
    const reused = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControls: [capture('v2-restored-candidate', 18), capture('v2-restored-control-2', 12)],
      restoredControlAgreement: [{ left: 'v2-restored-candidate', right: 'v2-restored-control-2', measurement: exact }],
      control: { ...scenario.control, right: capture('v2-restored-candidate', 18) },
    })
    expect(reused.demonstrated).toBe(false)
    expect(reused.reason).toBe('control-reuses-candidate-capture')
    const late = demonstrateRestorationSideEffect({
      ...scenario,
      restoredControls: [capture('v2-restored-control-1', 9), capture('v2-restored-control-2', 20)],
      restoredControlAgreement: [{ left: 'v2-restored-control-1', right: 'v2-restored-control-2', measurement: exact }],
    })
    expect(late.demonstrated).toBe(false)
    expect(late.reason).toBe('control-after-candidate')
  })

  it('refuses a short pixel list behind a larger reported count', () => {
    const scenario = retainedScenario()
    const candidate = demonstrateRestorationSideEffect({
      ...scenario, candidate: { ...scenario.candidate, reportedChangedPixels: 9 },
    })
    expect(candidate.reason).toBe('hidden-drift')
    const control = demonstrateRestorationSideEffect({
      ...scenario, control: { ...scenario.control, reportedChangedPixels: 9 },
    })
    expect(control.reason).toBe('hidden-drift')
  })

  it('refuses a capture with no retained image or digest', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario,
      candidate: { ...scenario.candidate, right: { ...scenario.candidate.right, sha256: 'not-a-digest' } },
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('incomplete-evidence')
  })

  it('has nothing to demonstrate when restoration was byte-exact', () => {
    const scenario = retainedScenario()
    const result = demonstrateRestorationSideEffect({
      ...scenario, candidate: { ...scenario.candidate, changedPixels: [], reportedChangedPixels: 0 },
    })
    expect(result.demonstrated).toBe(false)
    expect(result.reason).toBe('nothing-to-demonstrate')
  })
})
