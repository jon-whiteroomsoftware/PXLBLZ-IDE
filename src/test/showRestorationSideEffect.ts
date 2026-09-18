import { measuredExact, type ChangedPixel, type PixelMeasurement, type Rgba } from './showCapturePixelEvidence'

/**
 * Demonstrates that a restoration residual is a systematic side effect of the proof's own mutation
 * (#1065).
 *
 * The gauge counterfactual mutates two byte-value slots, captures, then restores them and re-captures.
 * Jon decided on 2026-09-18 that restoration qualifies when it is byte-exact, or when the residual is
 * independently demonstrated to be a systematic side effect of that mutate-and-restore cycle. This
 * module implements only the second half, and only in the shape Jon named:
 *
 * - The restored-control group for the version, whose members come from independent opens, must be
 *   byte-identical to each other. Restored controls that disagree are refused here; a nondeterministic
 *   residual remains the raster-noise classifier's case, not this one. Independence is distinct
 *   capture events, exactly as the raster-noise classifier defines it: label, path and sequence all
 *   differ, so one event named under two labels proves nothing. Byte-identical images from separate
 *   events are fine and expected; the digests are never compared against each other.
 * - The candidate's own raw-versus-restored changed pixels must equal the pristine-control-versus-
 *   restored-control difference, position for position and value for value. One pixel in the
 *   candidate's residual that the controls did not reproduce identically refuses the whole
 *   demonstration.
 *
 * There is no tolerance, mask, region, channel threshold or pixel-count cap anywhere, and nothing
 * here speaks for any other comparison: the counterfactual, the repeat captures and every value,
 * artifact and presentation check remain exactly as strict as they were. Controls are separate
 * capture events collected before the candidate under a plan the caller's code fixes, so a candidate
 * can never demonstrate its own side effect.
 */

export type RestorationSideEffectReason =
  | 'demonstrated'
  | 'nothing-to-demonstrate'
  | 'incomplete-evidence'
  | 'control-reuses-candidate-capture'
  | 'control-after-candidate'
  | 'restored-controls-disagree'
  | 'hidden-drift'
  | 'residual-not-reproduced'

/** One retained capture, identified the way the classifier identifies one. */
export interface RestorationCapture {
  label: string
  path: string
  sha256: string
  /** Capture order within the run. Controls must precede candidates. */
  sequence: number
}

/** One comparison of two retained captures, with the full changed-pixel list behind its count. */
export interface RestorationDifference {
  left: RestorationCapture
  right: RestorationCapture
  changedPixels: readonly ChangedPixel[]
  /** What the image comparator itself reported, so a short pixel list cannot hide drift. */
  reportedChangedPixels: number
}

export interface RestorationSideEffectInput {
  /** Names the comparison this demonstration belongs to, so it cannot be applied to another. */
  comparison: string
  version: string
  /** The candidate's raw-versus-restored difference: the residual under test. */
  candidate: RestorationDifference
  /** A pristine control against a restored control, which must reproduce that residual exactly. */
  control: RestorationDifference
  /** Every member of the restored-control group, each from its own independent open. */
  restoredControls: readonly RestorationCapture[]
  /** Every unordered pair inside that group, each of which must be exactly zero. */
  restoredControlAgreement: readonly { left: string; right: string; measurement: PixelMeasurement }[]
}

export interface RestorationSideEffectDemonstration {
  comparison: string
  version: string
  demonstrated: boolean
  reason: RestorationSideEffectReason
  detail: string
  /** The candidate residual this demonstration speaks for. */
  residualPixels: number
  maximumChannelDelta: number
  positions: readonly { x: number; y: number }[]
  /** What the pristine-versus-restored control difference held. */
  controlPixels: number
  controlGroup: readonly string[]
  evidence: readonly { role: string; label: string; path: string; sha256: string; sequence: number }[]
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/

export function demonstrateRestorationSideEffect(
  input: RestorationSideEffectInput,
): RestorationSideEffectDemonstration {
  const candidates = [input.candidate.left, input.candidate.right]
  const controls = [input.control.left, input.control.right, ...input.restoredControls]
  const base = {
    comparison: input.comparison,
    version: input.version,
    residualPixels: input.candidate.changedPixels.length,
    maximumChannelDelta: maximumChannelDelta(input.candidate.changedPixels),
    positions: input.candidate.changedPixels.map(pixel => ({ x: pixel.x, y: pixel.y })),
    controlPixels: input.control.changedPixels.length,
    controlGroup: input.restoredControls.map(capture => capture.label),
    evidence: [
      { role: 'candidate-raw', ...identity(input.candidate.left) },
      { role: 'candidate-restored', ...identity(input.candidate.right) },
      { role: 'control-pristine', ...identity(input.control.left) },
      { role: 'control-restored', ...identity(input.control.right) },
      ...input.restoredControls.map(capture => ({ role: 'restored-control-group', ...identity(capture) })),
    ],
  }
  const refuse = (reason: RestorationSideEffectReason, detail: string): RestorationSideEffectDemonstration =>
    ({ ...base, demonstrated: false, reason, detail })

  if (input.candidate.changedPixels.length === 0 && input.candidate.reportedChangedPixels === 0) {
    return refuse('nothing-to-demonstrate',
      `${input.comparison} found no changed pixel, so there is no residual to demonstrate.`)
  }

  const shape = checkEvidenceShape(input, candidates, controls)
  if (shape) return refuse('incomplete-evidence', shape)

  for (const [label, difference] of [['candidate', input.candidate], ['control', input.control]] as const) {
    if (difference.reportedChangedPixels !== difference.changedPixels.length) {
      return refuse('hidden-drift',
        `The ${label} comparison reported ${difference.reportedChangedPixels} changed pixels but`
        + ` ${difference.changedPixels.length} were supplied; the remainder would have been cleared`
        + ' without evidence.')
    }
  }

  const reused = findReusedCapture(candidates, controls)
  if (reused) {
    return refuse('control-reuses-candidate-capture',
      `Control capture "${reused.control}" is the same capture event as candidate "${reused.candidate}"`
      + ` (${reused.field}); a candidate can never demonstrate its own side effect.`)
  }

  const lastControl = Math.max(...controls.map(capture => capture.sequence))
  const firstCandidate = Math.min(...candidates.map(capture => capture.sequence))
  if (lastControl >= firstCandidate) {
    return refuse('control-after-candidate',
      `A control was captured at sequence ${lastControl}, at or after the candidate's first capture`
      + ` at ${firstCandidate}; controls are collected before the candidate.`)
  }

  const agreement = checkRestoredControlAgreement(input)
  if (agreement) return refuse(agreement.reason, agreement.detail)

  const reproduction = checkResidualReproduced(input)
  if (reproduction) return refuse('residual-not-reproduced', reproduction)

  return {
    ...base,
    demonstrated: true,
    reason: 'demonstrated',
    detail: `All ${base.residualPixels} changed pixels of ${input.comparison} (maximum channel delta`
      + ` ${base.maximumChannelDelta}) were reproduced, position for position and value for value, by`
      + ` "${input.control.left.label}" against "${input.control.right.label}", while the`
      + ` ${input.restoredControls.length} restored controls from independent opens are byte-identical`
      + ' to each other; the residual is a systematic side effect of the proof\'s own mutation.',
  }
}

/** Where a demonstrated residual actually lands, in row order, for the report. */
export function describePositions(positions: readonly { x: number; y: number }[]): string {
  return positions.map(position => `(${position.x}, ${position.y})`).join(', ')
}

function identity(capture: RestorationCapture) {
  return { label: capture.label, path: capture.path, sha256: capture.sha256, sequence: capture.sequence }
}

function maximumChannelDelta(pixels: readonly ChangedPixel[]): number {
  let maximum = 0
  for (const pixel of pixels) {
    for (let channel = 0; channel < 4; channel += 1) {
      maximum = Math.max(maximum, Math.abs(pixel.left[channel] - pixel.right[channel]))
    }
  }
  return maximum
}

function checkEvidenceShape(
  input: RestorationSideEffectInput,
  candidates: readonly RestorationCapture[],
  controls: readonly RestorationCapture[],
): string | null {
  if (!input.comparison) return 'The demonstration names no comparison.'
  if (!input.version) return 'The demonstration names no storage version.'
  for (const capture of [...candidates, ...controls]) {
    if (!capture.label) return 'A capture was supplied without a label.'
    if (!capture.path) return `Capture "${capture.label}" names no retained image.`
    if (!SHA256_PATTERN.test(capture.sha256)) return `Capture "${capture.label}" has no 64-hex retained digest.`
    if (!Number.isInteger(capture.sequence)) return `Capture "${capture.label}" has no integer capture sequence.`
  }
  if (input.restoredControls.length < 2) {
    return `The restored-control group holds ${input.restoredControls.length} capture(s); a restored state`
      + ' observed once demonstrates nothing about whether the effect is systematic.'
  }
  const groupLabels = input.restoredControls.map(capture => capture.label)
  if (new Set(groupLabels).size !== groupLabels.length) {
    return 'The restored-control group names one capture twice, so its members are not independent opens.'
  }
  for (let left = 0; left < input.restoredControls.length; left += 1) {
    for (let right = left + 1; right < input.restoredControls.length; right += 1) {
      const a = input.restoredControls[left]
      const b = input.restoredControls[right]
      // Labels are already known distinct above, so what remains of the classifier's triple is the
      // retained image and the capture order: one event under two labels, or two entries sharing one
      // sequence number, are not two opens. Digests are deliberately not compared: two independent
      // opens of an unchanged surface are expected to be byte-identical.
      if (a.path === b.path || a.sequence === b.sequence) {
        const shared = a.path === b.path ? 'the same retained image path' : 'the same capture sequence'
        return `The restored-control group names "${a.label}" and "${b.label}" from one capture event`
          + ` (${shared}), so its members are not independent opens.`
      }
    }
  }
  if (!groupLabels.includes(input.control.right.label)) {
    return `The control difference ends at "${input.control.right.label}", which is not a member of the`
      + ' restored-control group.'
  }
  if (groupLabels.includes(input.control.left.label)) {
    return `The control difference starts at "${input.control.left.label}", which is itself a restored`
      + ' control; the demonstration runs from a pristine control to a restored one.'
  }
  for (const [label, difference] of [['candidate', input.candidate], ['control', input.control]] as const) {
    if (!Number.isInteger(difference.reportedChangedPixels) || difference.reportedChangedPixels < 0) {
      return `The ${label} comparison reported no usable changed-pixel count.`
    }
    const seen = new Set<string>()
    for (const pixel of difference.changedPixels) {
      if (!Number.isInteger(pixel.x) || !Number.isInteger(pixel.y)) {
        return `A ${label} changed pixel has no integer position.`
      }
      const key = `${pixel.x},${pixel.y}`
      if (seen.has(key)) return `The ${label} comparison lists (${pixel.x}, ${pixel.y}) twice.`
      seen.add(key)
      if (sameRgba(pixel.left, pixel.right)) {
        return `The ${label} pixel at (${pixel.x}, ${pixel.y}) was listed as changed but holds one value.`
      }
    }
  }
  return null
}

/**
 * Every unordered pair inside the restored-control group must be named and exactly zero. A missing
 * pair is incomplete evidence rather than agreement by omission.
 */
function checkRestoredControlAgreement(
  input: RestorationSideEffectInput,
): { reason: RestorationSideEffectReason; detail: string } | null {
  const labels = input.restoredControls.map(capture => capture.label)
  const wanted = new Set<string>()
  for (let left = 0; left < labels.length; left += 1) {
    for (let right = left + 1; right < labels.length; right += 1) wanted.add(pairKey(labels[left], labels[right]))
  }
  const supplied = new Set<string>()
  for (const entry of input.restoredControlAgreement) {
    if (!labels.includes(entry.left) || !labels.includes(entry.right) || entry.left === entry.right) {
      return {
        reason: 'incomplete-evidence',
        detail: `A restored-control agreement compares "${entry.left}" with "${entry.right}", which is not`
          + ' a pair of distinct members of the restored-control group.',
      }
    }
    supplied.add(pairKey(entry.left, entry.right))
    if (!entry.measurement.comparable) {
      return {
        reason: 'restored-controls-disagree',
        detail: `The restored controls "${entry.left}" and "${entry.right}" could not be compared at all:`
          + ` ${entry.measurement.detail}`,
      }
    }
    if (!measuredExact(entry.measurement)) {
      return {
        reason: 'restored-controls-disagree',
        detail: `The restored controls "${entry.left}" and "${entry.right}" differ at`
          + ` ${entry.measurement.changedPixels} pixels (maximum channel delta`
          + ` ${entry.measurement.maximumChannelDelta}), so the residual is not shown to be systematic;`
          + ' that case belongs to the raster-noise classifier, not here.',
      }
    }
  }
  for (const pair of wanted) {
    if (!supplied.has(pair)) {
      return {
        reason: 'incomplete-evidence',
        detail: `The restored controls ${pair} were never compared, so the group is not shown to be`
          + ' byte-identical.',
      }
    }
  }
  return null
}

/**
 * The candidate's residual and the control difference must be the same set of positions carrying the
 * same pair of values. Anything the controls did not reproduce identically refuses the whole
 * demonstration; there is no partial credit.
 */
function checkResidualReproduced(input: RestorationSideEffectInput): string | null {
  const control = new Map(input.control.changedPixels.map(pixel => [`${pixel.x},${pixel.y}`, pixel]))
  for (const pixel of input.candidate.changedPixels) {
    const match = control.get(`${pixel.x},${pixel.y}`)
    if (!match) {
      return `The candidate residual at (${pixel.x}, ${pixel.y}) is not in the control difference, so the`
        + ' controls did not reproduce it.'
    }
    if (!sameRgba(match.left, pixel.left) || !sameRgba(match.right, pixel.right)) {
      return `The candidate residual at (${pixel.x}, ${pixel.y}) goes ${describeRgba(pixel.left)} to`
        + ` ${describeRgba(pixel.right)} while the controls go ${describeRgba(match.left)} to`
        + ` ${describeRgba(match.right)}, so it is not the same effect.`
    }
  }
  if (input.control.changedPixels.length !== input.candidate.changedPixels.length) {
    const extra = input.control.changedPixels.find(pixel =>
      !input.candidate.changedPixels.some(other => other.x === pixel.x && other.y === pixel.y))!
    return `The controls changed ${input.control.changedPixels.length} pixels against the candidate's`
      + ` ${input.candidate.changedPixels.length}, starting at (${extra.x}, ${extra.y}); the two`
      + ' differences are not the same effect.'
  }
  return null
}

function findReusedCapture(
  candidates: readonly RestorationCapture[],
  controls: readonly RestorationCapture[],
): { control: string; candidate: string; field: string } | null {
  for (const control of controls) {
    for (const candidate of candidates) {
      if (control.label === candidate.label) return { control: control.label, candidate: candidate.label, field: 'same label' }
      if (control.path === candidate.path) return { control: control.label, candidate: candidate.label, field: 'same retained image path' }
      if (control.sequence === candidate.sequence) return { control: control.label, candidate: candidate.label, field: 'same capture sequence' }
    }
  }
  return null
}

function pairKey(left: string, right: string): string {
  return [left, right].sort().join(' / ')
}

function describeRgba(rgba: Rgba): string {
  return `rgba(${rgba.join(', ')})`
}

function sameRgba(left: Rgba, right: Rgba): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index])
}
