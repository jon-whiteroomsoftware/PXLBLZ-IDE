import { createHash } from 'node:crypto'
import {
  serializeSurfaceState,
  stableSerialize,
  type FixedValueField,
  type PixelBox,
  type SurfaceNodeEvidence,
} from './showSurfaceStateSerialization'

/**
 * Classifies pixels that changed between two browser captures as independently demonstrated raster
 * noise, or leaves them residual (#1065).
 *
 * Jon approved an independently demonstrated noise classification. The conservative shape below -
 * same position, same actual RGBA alternatives, observed inside one unchanged-state control group -
 * is this harness's implementation choice, not wording Jon supplied, and it is deliberately narrow:
 *
 * - There is no tolerance, mask, region, channel threshold or small-pixel allowance anywhere. A
 *   pixel qualifies only when independently collected controls of an unchanged surface were seen to
 *   render *both* of the candidate's exact RGBA values at *that exact position*.
 * - Both values must come from ONE control group, which is one storage version in one authored
 *   state and one numeric phase. Pooling a stable v1 group that only ever showed A with a stable v2
 *   group that only ever showed B would excuse precisely the version-specific regression this
 *   exists to catch, so it is refused.
 * - No candidate capture may supply its own allowance: controls are separate capture events,
 *   collected before the candidate, under a plan fixed by the caller's code rather than grown until
 *   something passes. There is no waiver: a run's preserved original captures remain retained
 *   diagnostics beside the strict result and never support a qualified verdict.
 * - Independence is capture identity, not image bytes. Two independently acquired captures of an
 *   unchanged surface are expected to be byte-identical, so equal digests are accepted; digests are
 *   retained and checked for shape so the evidence stays auditable.
 * - Missing or partial evidence fails closed, and one unexplained pixel leaves the whole comparison
 *   unclassified.
 *
 * The module is deliberately gauge-agnostic: it is the same machinery for an ordinary editor surface
 * whose strict comparison differs as for the source-size gauge's counterfactual states.
 *
 * The caller supplies only the control groups that share the comparison's numeric state. The
 * fingerprint covers the fill's real geometry, so handing a delivered-state comparison its
 * normalized-state groups refuses on the surface-state gate. That is the intended behaviour, not a
 * reason to hash less: a cross-version normalized comparison takes both normalized groups, and a
 * within-version delivered comparison takes the delivered ones.
 */

export type Rgba = readonly [number, number, number, number]

export type { FixedValueField, PixelBox, SurfaceNodeEvidence }

/**
 * What must be identical across every capture in the comparison, candidate and control alike. The
 * fingerprint is `surfaceStateFingerprint` over the collector's structured surface evidence.
 */
export interface SurfaceContext {
  surface: string
  viewport: { width: number; height: number }
  showId: string
  captureSettings: string
  domFingerprint: string
  /** What the collector hashed and which fixed fields it replaced, recorded in the verdict. */
  fingerprintPolicy: string
}

/** What must be identical within one control group: one version, one state, one phase. */
export interface RenderState {
  storageVersion: string
  authoredState: string
  /**
   * The numeric values on display, e.g. `delivered` or `normalized`. This is the state, not how the
   * page reached it: a restored capture is back in `delivered` alongside the untouched raw capture,
   * and every normalized capture shares one key. Acquisition history lives in `mutationHistory`, is
   * recorded in the verdict, and is never compared - otherwise raw-versus-restored could never be
   * classified at all.
   */
  numericPhase: string
}

export interface PixelSample { x: number; y: number; rgba: Rgba }

export interface CaptureEvidence {
  label: string
  /** Capture order within the run. Controls must precede candidates. */
  sequence: number
  path: string
  sha256: string
  surface: SurfaceContext
  state: RenderState
  /** How this capture's page arrived at its state, recorded in the verdict and never compared. */
  mutationHistory: string
  /** RGBA read back from the retained image at each implicated position. */
  samples: readonly PixelSample[]
}

export interface ControlGroup {
  label: string
  state: RenderState
  captures: readonly CaptureEvidence[]
}

export interface PointChainNode {
  tag: string
  attributes: Readonly<Record<string, string>>
  rect: PixelBox
  computedStyle: Readonly<Record<string, string>>
  pseudoStyle: Readonly<Record<string, Readonly<Record<string, string>>>>
}

export interface PointChainEvidence {
  x: number
  y: number
  /** Whether the paint at this position comes from a canvas, which DOM identity cannot describe. */
  canvasBacked: boolean
  /** The hit element and its ancestors to the surface root, at full precision. */
  chain: readonly PointChainNode[]
}

export interface DomStateEvidence {
  fingerprint: string
  points: readonly PointChainEvidence[]
}

export interface ChangedPixel { x: number; y: number; left: Rgba; right: Rgba }

export interface RasterNoiseInput {
  /** Names the comparison this classification belongs to, so it cannot be applied to another. */
  comparison: string
  /** Exactly the control groups the run's fixed sequence collects, named by the run's own code. */
  plan: { controlGroups: readonly string[] }
  /**
   * Both captures must be newly acquired after control collection. A run's preserved original
   * captures stay retained diagnostics beside the strict result; they never support this verdict.
   */
  candidate: { left: CaptureEvidence; right: CaptureEvidence }
  controlGroups: readonly ControlGroup[]
  changedPixels: readonly ChangedPixel[]
  /** What the image comparator itself reported, so a short pixel list cannot hide drift. */
  reportedChangedPixels: number
  domStates: readonly DomStateEvidence[]
}

export type RasterNoiseReason =
  | 'classified'
  | 'nothing-to-classify'
  | 'incomplete-evidence'
  | 'control-plan-mismatch'
  | 'control-reuses-candidate-capture'
  | 'control-after-candidate'
  | 'state-differs'
  | 'hidden-drift'
  | 'pixel-not-classified'

export type PixelReason =
  | 'observed-in-one-control-group'
  | 'no-chain-evidence'
  | 'candidate-bytes-disagree'
  | 'control-missing-position'
  | 'variant-not-observed'

export interface ClassifiedPixel {
  x: number
  y: number
  left: Rgba
  right: Rgba
  canvasBacked: boolean
  reason: PixelReason
  qualifyingGroup: string | null
  qualifiedBy: readonly string[]
}

export interface RasterNoiseClassification {
  comparison: string
  classified: boolean
  reason: RasterNoiseReason
  detail: string
  changedPixels: number
  reportedChangedPixels: number
  classifiedPixels: readonly ClassifiedPixel[]
  residualPixels: readonly ClassifiedPixel[]
  controlGroups: readonly { label: string; state: RenderState; captures: readonly string[] }[]
  evidence: readonly { label: string; path: string; sha256: string; sequence: number; mutationHistory: string }[]
}

const SHA256_PATTERN = /^[0-9a-f]{64}$/

export function classifyRasterNoise(input: RasterNoiseInput): RasterNoiseClassification {
  const candidates = [input.candidate.left, input.candidate.right]
  const controlCaptures = input.controlGroups.flatMap(group => group.captures)
  const base = {
    comparison: input.comparison,
    changedPixels: input.changedPixels.length,
    reportedChangedPixels: input.reportedChangedPixels,
    controlGroups: input.controlGroups.map(group => ({
      label: group.label,
      state: group.state,
      captures: group.captures.map(capture => capture.label),
    })),
    evidence: [...candidates, ...controlCaptures].map(capture => ({
      label: capture.label,
      path: capture.path,
      sha256: capture.sha256,
      sequence: capture.sequence,
      mutationHistory: capture.mutationHistory,
    })),
  }
  const refuse = (reason: RasterNoiseReason, detail: string): RasterNoiseClassification => ({
    ...base, classified: false, reason, detail, classifiedPixels: [], residualPixels: [],
  })

  if (input.changedPixels.length === 0 && input.reportedChangedPixels === 0) {
    return refuse('nothing-to-classify', `${input.comparison} found no changed pixel, so nothing was classified.`)
  }

  const shape = checkEvidenceShape(input, candidates, controlCaptures)
  if (shape) return refuse('incomplete-evidence', shape)

  const planned = [...input.plan.controlGroups].sort()
  const supplied = input.controlGroups.map(group => group.label).sort()
  if (!sameStrings(planned, supplied)) {
    return refuse('control-plan-mismatch',
      `The run's fixed plan names [${planned.join(', ')}] but [${supplied.join(', ')}] was supplied;`
      + ' a missing group is incomplete evidence and an extra one is an unplanned retry.')
  }

  const reused = findReusedCapture(candidates, controlCaptures)
  if (reused) {
    return refuse('control-reuses-candidate-capture',
      `Control capture "${reused.control}" is the same capture event as candidate "${reused.candidate}"`
      + ` (${reused.field}); a candidate can never establish its own allowable variants.`)
  }

  const lastControl = Math.max(...controlCaptures.map(capture => capture.sequence))
  const firstCandidate = Math.min(...candidates.map(capture => capture.sequence))
  if (lastControl >= firstCandidate) {
    return refuse('control-after-candidate',
      `A control was captured at sequence ${lastControl}, at or after the candidate's first capture`
      + ` at ${firstCandidate}; controls are collected before the candidate, and a preserved original`
      + ' capture is a retained diagnostic rather than evidence for this verdict.')
  }

  const state = checkStates(input, candidates, controlCaptures)
  if (state) return refuse('state-differs', state)

  if (input.reportedChangedPixels !== input.changedPixels.length) {
    return refuse('hidden-drift',
      `The comparison reported ${input.reportedChangedPixels} changed pixels but ${input.changedPixels.length}`
      + ' were supplied for classification; the remainder would have been cleared without evidence.')
  }

  const eligible = input.controlGroups.filter(group => isEligible(group.state, candidates))
  if (eligible.length === 0) {
    return refuse('state-differs',
      'No control group shares the candidate\'s authored state, numeric phase and one of its storage versions.')
  }

  const domState = input.domStates.find(entry => entry.fingerprint === candidates[0].surface.domFingerprint)
  const classifiedPixels: ClassifiedPixel[] = []
  const residualPixels: ClassifiedPixel[] = []
  for (const pixel of input.changedPixels) {
    const verdict = classifyPixel(pixel, candidates, eligible, domState)
    ;(verdict.reason === 'observed-in-one-control-group' ? classifiedPixels : residualPixels).push(verdict)
  }

  if (residualPixels.length > 0) {
    return {
      ...base,
      classified: false,
      reason: 'pixel-not-classified',
      detail: `${residualPixels.length} of ${input.changedPixels.length} changed pixels in ${input.comparison}`
        + ' are not independently demonstrated raster noise; the strict difference stands.',
      classifiedPixels,
      residualPixels,
    }
  }
  return {
    ...base,
    classified: true,
    reason: 'classified',
    detail: `All ${classifiedPixels.length} changed pixels in ${input.comparison} were independently observed at`
      + ' their own position, with both values, inside one unchanged control group.',
    classifiedPixels,
    residualPixels,
  }
}

/**
 * Digests the collected surface structure through the shared serialization rule. The harness itself
 * hashes in the page, over the same module; this is that rule for Node-side use and for the tests
 * that pin it.
 */
export function surfaceStateFingerprint(
  nodes: readonly SurfaceNodeEvidence[],
  fixedValueFields: readonly FixedValueField[],
): string {
  return `sha256:${createHash('sha256').update(serializeSurfaceState(nodes, fixedValueFields)).digest('hex')}`
}

function classifyPixel(
  pixel: ChangedPixel,
  candidates: readonly CaptureEvidence[],
  eligible: readonly ControlGroup[],
  domState: DomStateEvidence | undefined,
): ClassifiedPixel {
  const row = { x: pixel.x, y: pixel.y, left: pixel.left, right: pixel.right }
  const point = domState?.points.find(entry => entry.x === pixel.x && entry.y === pixel.y)
  const chainHasCanvas = point?.chain.some(node => node.tag.toLowerCase() === 'canvas') ?? false
  if (!point || chainHasCanvas !== point.canvasBacked) {
    return { ...row, canvasBacked: chainHasCanvas, reason: 'no-chain-evidence', qualifyingGroup: null, qualifiedBy: [] }
  }
  const canvasBacked = point.canvasBacked
  const left = sampleAt(candidates[0], pixel)
  const right = sampleAt(candidates[1], pixel)
  if (!left || !right || !sameRgba(left, pixel.left) || !sameRgba(right, pixel.right)) {
    return { ...row, canvasBacked, reason: 'candidate-bytes-disagree', qualifyingGroup: null, qualifiedBy: [] }
  }

  let anyGroupCoveredPosition = false
  for (const group of eligible) {
    const observed = group.captures.map(capture => sampleAt(capture, pixel))
    if (observed.some(sample => sample === undefined)) continue
    anyGroupCoveredPosition = true
    const values = observed as Rgba[]
    if (!values.some(value => sameRgba(value, pixel.left))) continue
    if (!values.some(value => sameRgba(value, pixel.right))) continue
    const qualifiedBy = group.captures
      .filter((_, index) => sameRgba(values[index], pixel.left) || sameRgba(values[index], pixel.right))
      .map(capture => capture.label)
    return { ...row, canvasBacked, reason: 'observed-in-one-control-group', qualifyingGroup: group.label, qualifiedBy }
  }
  return {
    ...row,
    canvasBacked,
    reason: anyGroupCoveredPosition ? 'variant-not-observed' : 'control-missing-position',
    qualifyingGroup: null,
    qualifiedBy: [],
  }
}

function sampleAt(capture: CaptureEvidence, pixel: { x: number; y: number }): Rgba | undefined {
  return capture.samples.find(sample => sample.x === pixel.x && sample.y === pixel.y)?.rgba
}

function sameRgba(left: Rgba, right: Rgba): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index])
}

function isEligible(state: RenderState, candidates: readonly CaptureEvidence[]): boolean {
  return state.authoredState === candidates[0].state.authoredState
    && state.numericPhase === candidates[0].state.numericPhase
    && candidates.some(candidate => candidate.state.storageVersion === state.storageVersion)
}

function checkEvidenceShape(
  input: RasterNoiseInput,
  candidates: readonly CaptureEvidence[],
  controlCaptures: readonly CaptureEvidence[],
): string | null {
  for (const capture of [...candidates, ...controlCaptures]) {
    if (!capture.label) return 'A capture was supplied without a label.'
    if (!capture.path) return `Capture "${capture.label}" names no retained image.`
    if (!SHA256_PATTERN.test(capture.sha256)) return `Capture "${capture.label}" has no 64-hex retained digest.`
    if (!Number.isInteger(capture.sequence)) return `Capture "${capture.label}" has no integer capture sequence.`
    if (!capture.mutationHistory) return `Capture "${capture.label}" records no mutation history.`
    const missing = describeMissingState(capture)
    if (missing) return `Capture "${capture.label}" is missing ${missing}.`
  }
  for (const group of input.controlGroups) {
    if (!group.label) return 'A control group was supplied without a label.'
    if (group.captures.length < 2) {
      return `Control group "${group.label}" holds ${group.captures.length} capture(s); an unchanged state`
        + ' observed once demonstrates no alternative at all.'
    }
  }
  for (const pixel of input.changedPixels) {
    if (!Number.isInteger(pixel.x) || !Number.isInteger(pixel.y)) return 'A changed pixel has no integer position.'
    if (sameRgba(pixel.left, pixel.right)) return `The pixel at (${pixel.x}, ${pixel.y}) was listed as changed but holds one value.`
  }
  if (!Number.isInteger(input.reportedChangedPixels) || input.reportedChangedPixels < 0) {
    return 'The comparison reported no usable changed-pixel count.'
  }
  return null
}

function describeMissingState(capture: CaptureEvidence): string | null {
  const { surface, state } = capture
  if (!surface.surface) return 'a surface name'
  if (!surface.showId) return 'a Show identity'
  if (!surface.captureSettings) return 'its capture settings'
  if (!surface.domFingerprint) return 'a surface DOM fingerprint'
  if (!surface.fingerprintPolicy) return 'the policy its fingerprint was built under'
  if (!(surface.viewport.width > 0) || !(surface.viewport.height > 0)) return 'a viewport'
  if (!state.storageVersion) return 'a storage version'
  if (!state.authoredState) return 'an authored state'
  if (!state.numericPhase) return 'a numeric phase'
  return null
}

function checkStates(
  input: RasterNoiseInput,
  candidates: readonly CaptureEvidence[],
  controlCaptures: readonly CaptureEvidence[],
): string | null {
  const reference = stableSerialize(candidates[0].surface)
  for (const capture of [...candidates, ...controlCaptures]) {
    if (stableSerialize(capture.surface) !== reference) {
      return `Capture "${capture.label}" was taken from a different surface state than the candidate's;`
        + ' surface, viewport, Show identity, capture settings, geometry and styles must all be identical.'
    }
  }
  const [left, right] = candidates
  if (left.state.authoredState !== right.state.authoredState || left.state.numericPhase !== right.state.numericPhase) {
    return 'The candidate captures are in different authored states or numeric phases; only the storage'
      + ' version may differ, because that is what is under test.'
  }
  for (const group of input.controlGroups) {
    for (const capture of group.captures) {
      if (stableSerialize(capture.state) !== stableSerialize(group.state)) {
        return `Control capture "${capture.label}" is not in the state its group "${group.label}" claims;`
          + ' a group is one storage version in one authored state and one numeric phase.'
      }
    }
  }
  return null
}

function findReusedCapture(
  candidates: readonly CaptureEvidence[],
  controlCaptures: readonly CaptureEvidence[],
): { control: string; candidate: string; field: string } | null {
  for (const control of controlCaptures) {
    for (const candidate of candidates) {
      if (control.label === candidate.label) return { control: control.label, candidate: candidate.label, field: 'same label' }
      if (control.path === candidate.path) return { control: control.label, candidate: candidate.label, field: 'same retained image path' }
      if (control.sequence === candidate.sequence) return { control: control.label, candidate: candidate.label, field: 'same capture sequence' }
    }
  }
  return null
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
