import {
  classifyRasterNoise,
  type CaptureEvidence,
  type ControlGroup,
  type DomStateEvidence,
  type RasterNoiseClassification,
  type RenderState,
  type SurfaceContext,
} from './showCaptureRasterNoiseClassifier'
import type { ChangedPixel, PixelSample } from './showCapturePixelEvidence'
import type { VisualPairAssessment } from './showEditorEquivalenceOracle'

/**
 * Turns the canonical run's fixed capture sequence into classifier inputs (#1065).
 *
 * The control plan is fixed here, not discovered from what the run happened to collect: each side of
 * a comparison brings the control group for its own storage version, numeric state and acquisition,
 * and nothing else is ever offered. So a comparison between two versions in one state takes both
 * versions' groups, a comparison within one version and one acquisition takes the single group, and
 * a raw-versus-restored comparison takes the pristine group and the restored group separately -
 * never one pooled group that would hold both values by construction. Because a surface fingerprint
 * covers the fill's real geometry, handing a delivered-state comparison its normalized-state groups
 * would refuse on the surface-state gate; that is the intended behaviour, and the reason the plan is
 * stated rather than inferred.
 */

export type PhaseState = 'delivered' | 'normalized'
export type StorageVersion = 'v1' | 'v2'

/**
 * How a capture's page reached its numeric state (#1065).
 *
 * `direct` is a page that arrived at the state and was captured there; `restored` is a page that was
 * mutated to the common value and then put back. Both are the same numeric phase - a restored page
 * displays the delivered values again - so the classifier's state gate rightly treats them as one
 * state. They are not one control group. A deterministic re-raster after restoration shows the
 * delivered value in every `direct` control and the restored value in every `restored` one, so
 * pooling them puts both values in one group by construction and classifies exactly the systematic
 * side effect the restoration comparison exists to catch.
 */
export type PhaseAcquisition = 'direct' | 'restored'

export interface PhaseCapture {
  label: string
  role: 'control' | 'candidate'
  /** Control captures name the group they observe; candidates never do. */
  group?: string
  version: StorageVersion
  state: PhaseState
  /** How the page reached that state. Controls are grouped by it; the classifier never compares it. */
  acquisition: PhaseAcquisition
  sequence: number
  path: string
  sha256: string
  /** The surface-state fingerprint the run computed in the page for this capture. */
  fingerprint: string
  mutationHistory: string
}

export interface PlannedComparison {
  key: string
  left: string
  right: string
  changedPixels: readonly ChangedPixel[]
  reportedChangedPixels: number
}

export interface SurfaceNoisePlanInput {
  surface: string
  viewport: { width: number; height: number }
  showId: string
  authoredState: string
  captureSettings: string
  fingerprintPolicy: string
  captures: readonly PhaseCapture[]
  comparisons: readonly PlannedComparison[]
  /** What each capture's retained image holds at the implicated positions. */
  samples: Readonly<Record<string, readonly PixelSample[]>>
  domStates: readonly DomStateEvidence[]
}

export interface PlannedClassification {
  key: string
  plan: readonly string[]
  classification: RasterNoiseClassification | null
  /** Set when the plan could not even be assembled, so nothing was classified. */
  unusable?: string
}

export function controlGroupLabel(
  version: StorageVersion,
  state: PhaseState,
  acquisition: PhaseAcquisition = 'direct',
): string {
  return acquisition === 'restored' ? `${version}-${state}-restored` : `${version}-${state}`
}

export function classifySurfaceNoisePlan(input: SurfaceNoisePlanInput): PlannedClassification[] {
  return input.comparisons.map(comparison => planOne(input, comparison))
}

function planOne(input: SurfaceNoisePlanInput, comparison: PlannedComparison): PlannedClassification {
  const left = input.captures.find(capture => capture.label === comparison.left)
  const right = input.captures.find(capture => capture.label === comparison.right)
  if (!left || !right) {
    return { key: comparison.key, plan: [], classification: null, unusable: 'A named capture of this comparison is missing.' }
  }
  if (left.role !== 'candidate' || right.role !== 'candidate') {
    return { key: comparison.key, plan: [], classification: null, unusable: 'Only candidate captures may be compared for classification.' }
  }
  if (left.state !== right.state) {
    return { key: comparison.key, plan: [], classification: null, unusable: 'The two sides are in different numeric states.' }
  }
  // One group per side, by version and by acquisition. A comparison of two sides that share both
  // takes one group; a cross-version or raw-versus-restored comparison takes each side's own, and
  // the classifier still has to find both values inside a single one of them.
  const plan = [...new Set([left, right]
    .map(side => controlGroupLabel(side.version, side.state, side.acquisition)))]
  const groups: ControlGroup[] = []
  for (const label of plan) {
    const captures = input.captures.filter(capture => capture.role === 'control' && capture.group === label)
    if (captures.length === 0) {
      return { key: comparison.key, plan, classification: null, unusable: `The run collected no ${label} control group.` }
    }
    groups.push({
      label,
      state: renderState(input, captures[0]),
      captures: captures.map(capture => evidence(input, capture)),
    })
  }
  return {
    key: comparison.key,
    plan,
    classification: classifyRasterNoise({
      comparison: comparison.key,
      plan: { controlGroups: plan },
      candidate: { left: evidence(input, left), right: evidence(input, right) },
      controlGroups: groups,
      changedPixels: comparison.changedPixels,
      reportedChangedPixels: comparison.reportedChangedPixels,
      domStates: input.domStates,
    }),
  }
}

function evidence(input: SurfaceNoisePlanInput, capture: PhaseCapture): CaptureEvidence {
  return {
    label: capture.label,
    sequence: capture.sequence,
    path: capture.path,
    sha256: capture.sha256,
    surface: surfaceContext(input, capture),
    state: renderState(input, capture),
    mutationHistory: capture.mutationHistory,
    samples: input.samples[capture.label] ?? [],
  }
}

function surfaceContext(input: SurfaceNoisePlanInput, capture: PhaseCapture): SurfaceContext {
  return {
    surface: input.surface,
    viewport: input.viewport,
    showId: input.showId,
    captureSettings: input.captureSettings,
    domFingerprint: capture.fingerprint,
    fingerprintPolicy: input.fingerprintPolicy,
  }
}

function renderState(input: SurfaceNoisePlanInput, capture: PhaseCapture): RenderState {
  return {
    storageVersion: capture.version,
    authoredState: input.authoredState,
    numericPhase: capture.state,
  }
}

/**
 * Clears an ordinary surface whose fresh candidate comparison was entirely demonstrated raster
 * noise. Only a `pixels-differ` verdict is eligible - a missing surface, changed dimensions or
 * changed position is never capture noise - and only a classification with no residual at all.
 *
 * The run's original strict captures are never relabelled by this: they stay in the report beside
 * the fresh evidence, and this verdict rests on the post-control candidate captures alone.
 */
export function reclassifyVisualPairWithCaptureNoise(
  assessment: VisualPairAssessment,
  planned: PlannedClassification | undefined,
): VisualPairAssessment & { captureNoise: PlannedClassification | null } {
  const carried = { ...assessment, captureNoise: planned ?? null }
  if (assessment.equivalent || assessment.reason !== 'pixels-differ') return carried
  const classification = planned?.classification
  if (!classification || !classification.classified || classification.residualPixels.length > 0) return carried
  if (classification.changedPixels === 0) return carried
  return { ...carried, equivalent: true, reason: 'equivalent' }
}
