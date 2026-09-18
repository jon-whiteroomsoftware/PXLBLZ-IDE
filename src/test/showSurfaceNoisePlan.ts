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
 * The control plan is fixed here, not discovered from what the run happened to collect: a comparison
 * between two versions in one numeric state takes both versions' groups for that state, and a
 * comparison within one version takes that version's group. Nothing else is ever offered. Because a
 * surface fingerprint covers the fill's real geometry, handing a delivered-state comparison its
 * normalized-state groups would refuse on the surface-state gate; that is the intended behaviour,
 * and the reason the plan is stated rather than inferred.
 */

export type PhaseState = 'delivered' | 'normalized'
export type StorageVersion = 'v1' | 'v2'

export interface PhaseCapture {
  label: string
  role: 'control' | 'candidate'
  /** Control captures name the group they observe; candidates never do. */
  group?: string
  version: StorageVersion
  state: PhaseState
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

export function controlGroupLabel(version: StorageVersion, state: PhaseState): string {
  return `${version}-${state}`
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
  const versions: StorageVersion[] = left.version === right.version ? [left.version] : ['v1', 'v2']
  const plan = versions.map(version => controlGroupLabel(version, left.state))
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
