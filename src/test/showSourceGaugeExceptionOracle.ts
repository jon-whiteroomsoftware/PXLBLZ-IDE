import { parsePxlblzBanner, stripPxlblzBanner } from '../engine/artifactStamp'
import { parseEpe } from '../engine/epeImport'
import type { VisualPairAssessment } from './showEditorEquivalenceOracle'

/**
 * Qualifies the one approved data-value exception for the Show source-size gauge (#1065).
 *
 * The tracer plan lets the gauge report the true delivered source bytes for each record version,
 * header included, while layout, styling, units and behavior stay unchanged. Nothing else is
 * exempt, and the exception must never become a mask, a region or a tolerance.
 *
 * Three parts, all fail-closed:
 *
 * 1. Every byte-value slot is proved against the `.epe` the native exporter produced, reopened
 *    through the existing importer. The slots are fixed here, not declared by the caller, and a
 *    byte-shaped figure anywhere else in the gauge fails as an unexpected numeric slot. The
 *    displayed text only resolves to 0.1 KB, so the authored inline fill width carries the
 *    higher-resolution check against a pinned budget.
 * 2. The raw, unmutated gauge is compared exactly across the computed styles the harness collected,
 *    including generated pseudo-elements, plus structure, text nodes and geometry, so a
 *    value-dependent style regression is caught where normalizing the values would have equalized
 *    it. The proof domain is the current corpus and the properties actually gathered; this module
 *    does not claim to cover every property CSS may ever define.
 * 3. A counterfactual capture, in which only the one visible numerator text node and the fill's
 *    inline width are set to a common value and then restored, must match across every pixel.
 *    `aria-label` and `title` are verified but never mutated, so a value-dependent attribute
 *    selector cannot be normalized away. Normalization is separately proved to have changed nothing
 *    but those two slots and what the fill's width implies.
 */

import type { RasterNoiseClassification } from './showCaptureRasterNoiseClassifier'
import { measuredExact, type PixelMeasurement } from './showCapturePixelEvidence'
import {
  describePositions,
  type RestorationDifference,
  type RestorationSideEffectDemonstration,
} from './showRestorationSideEffect'

export interface PixelBox { x: number; y: number; width: number; height: number }

/** One gauge element, keyed by a fixed semantic role rather than a caller-chosen path. */
export interface GaugeElementEvidence {
  role: string
  tag: string
  classList: string
  attributes: Readonly<Record<string, string>>
  /** Text node data in document order. Mutation targets a text node, never `textContent`. */
  textNodes: readonly string[]
  childNodeCount: number
  /**
   * The computed properties the harness collected. This module compares whatever set it is given
   * and requires the same set everywhere; it does not claim to cover every property CSS may ever
   * define. The proof domain is the current corpus and its current stylesheets.
   */
  computedStyle: Readonly<Record<string, string>>
  /** Generated pseudo-element styles, keyed by selector, e.g. "::before". */
  pseudoStyle: Readonly<Record<string, Readonly<Record<string, string>>>>
  rect: PixelBox
}

export interface GaugeVersionEvidence {
  /** The `.epe` the native exporter wrote, exactly as the file holds it. */
  deliveredEpeText: string
  /** Where that artifact came from, recorded in the verdict. */
  deliveredArtifact: { path: string; route: string }
  /** The gauge before any mutation. */
  raw: readonly GaugeElementEvidence[]
  /** The same gauge with only the fixed slots normalized. */
  normalized: readonly GaugeElementEvidence[]
  /** The fill's inline width exactly as the DOM reports it. */
  authoredInlineWidth: string
  /**
   * The same page's canonicalization of an expected percentage, produced by setting it on a fresh
   * detached element and reading the value back, so the comparison is exact string equality through
   * the browser's own serializer rather than an epsilon or a reimplemented float format.
   */
  canonicalInlineWidth: { percent: number; serialized: string }
  /** The denominator exactly as displayed, e.g. "66.8 KB". */
  budgetToken: string
}

export interface CounterfactualEvidence {
  commonToken: string
  commonInlineWidth: string
  /** v1's normalized capture against v2's, which is the counterfactual itself. */
  counterfactual: PixelMeasurement
  /** A repeated counterfactual capture per version, to show each normalized surface is stable. */
  repeat: { v1: PixelMeasurement; v2: PixelMeasurement }
  /** Each version re-captured after every mutation was restored, against its raw capture. */
  restored: { v1: PixelMeasurement; v2: PixelMeasurement }
  capturePaths: readonly string[]
}

/**
 * One side of the raw delivered v1-vs-v2 reproduction check (#1065).
 *
 * A pair that could not be compared at all carries no pixel list, exactly like a `PixelMeasurement`:
 * the check refuses on it rather than reading an absent comparison as an exactly-zero difference.
 */
export type ComparableRestorationDifference =
  | { comparable: true; difference: RestorationDifference }
  | { comparable: false; detail: string }

/**
 * The raw delivered v1-vs-v2 difference twice: the candidate pair the verdict speaks for, and an
 * independent control pair from separate opens that must reproduce it exactly (#1065).
 *
 * A transient single-pixel difference in the candidate pair would otherwise be charged to the
 * source-size gauge whenever the freshly captured counterfactual is exactly zero. So the
 * candidate's raw difference must be reproduced exactly - same positions, same values on both
 * sides - by delivered controls of v1 and v2 captured before any candidate. Anything the controls
 * did not reproduce identically refuses with `raw-difference-not-reproduced`, and that refusal is
 * part of the strict assessment, so neither the noise classifier nor the restoration side-effect
 * path can forgive it. There is no tolerance, mask, region, channel threshold or pixel-count cap.
 */
export interface RawDeliveredReproduction {
  /** The delivered v1-vs-v2 candidate pair, with its full changed-pixel list. */
  candidate: ComparableRestorationDifference
  /** The independent delivered control pair, with its full changed-pixel list. */
  control: ComparableRestorationDifference
}

/**
 * One end of the raw delivered pair the verdict's counts were measured from. The reproduction's
 * candidate pair must name these same two captures, so a reproduction of a different capture pair
 * cannot stand in for the difference the row charges to the gauge.
 */
export interface RawDeliveredCaptureRef {
  label: string
  path: string
  sequence: number
}

export interface SourceGaugeExceptionInput {
  surface: string
  /** Which of the two known gauge shapes was captured. */
  variant: GaugeVariant
  /** Where the gauge stood relative to the captured surface. */
  placement: GaugePlacement
  /** The budget is pinned, never inferred from the rounded denominator the gauge displays. */
  budget: { bytes: number; provenance: string }
  v1: GaugeVersionEvidence
  v2: GaugeVersionEvidence
  rawCapturePaths: readonly string[]
  /**
   * The retained raw difference between the two delivered captures. Reported, never deleted, and
   * never read as zero when the pair could not be compared at all.
   */
  rawDifference: PixelMeasurement
  /**
   * The two delivered captures the raw difference was measured from. The reproduction's candidate
   * pair must name these same captures with the same changed-pixel count and maximum delta;
   * otherwise it reproduces a different comparison and the verdict refuses.
   */
  rawCaptures: { left: RawDeliveredCaptureRef; right: RawDeliveredCaptureRef }
  /**
   * The same raw difference with its pixels, plus the independent control pair that must reproduce
   * it exactly. Counts alone cannot tell a transient capture difference from the gauge value.
   */
  rawReproduction: RawDeliveredReproduction
  counterfactual: CounterfactualEvidence
}

export interface DeliveredArtifactFacts {
  path: string
  route: string
  /** UTF-8 length of the reopened `sources.main`, measured independently of the generator. */
  totalBytes: number
  headerBytes: number
  programBytes: number
  /** The value as the gauge must display it, from this module's own formatter. */
  token: string
}

export type SourceGaugeExceptionReason =
  | 'qualified'
  | 'gauge-not-over-surface'
  | 'incomplete-evidence'
  | 'unexpected-structure'
  | 'budget-not-pinned'
  | 'delivered-artifact-unreadable'
  | 'delivered-header-unrecognized'
  | 'delivered-program-differs'
  | 'delivered-value-not-truthful'
  | 'fill-not-value-derived'
  | 'token-length-differs'
  | 'presentation-differs'
  | 'normalization-changed-more-than-values'
  | 'counterfactual-not-exact'
  | 'counterfactual-not-measured'
  | 'raw-difference-not-reproduced'
  | 'qualified-with-classified-capture-noise'
  | 'qualified-with-demonstrated-restoration-side-effect'

export interface SourceGaugeExceptionAssessment {
  surface: string
  qualified: boolean
  reason: SourceGaugeExceptionReason
  detail: string
  /** Where the gauge stood relative to the captured surface, carried through verbatim. */
  placement: GaugePlacement
  delivered: { v1: DeliveredArtifactFacts; v2: DeliveredArtifactFacts } | null
  budget: { bytes: number; provenance: string }
  slotKeys: readonly string[]
  /** The measured raw difference, or `null` when the raw pair could not be compared. */
  rawChangedPixels: number | null
  evidencePaths: readonly string[]
}

export type GaugeVariant = 'portal' | 'compile-bar'

/**
 * Where the gauge stood relative to the captured surface.
 *
 * `inside` is the original case: the gauge is in the captured surface's own subtree and wholly
 * within its box, so its value is literally drawn into the capture.
 *
 * `behind` is the extension Jon approved on 2026-09-18. The gauge is not in the surface at all - it
 * lies under a translucent, backdrop-filtered panel - so its value still reaches the capture,
 * attenuated and spread by the panel, without being part of it. The proof standard is unchanged:
 * the counterfactual must still be exactly zero, and restoration must be byte-exact or its residual
 * independently demonstrated to be a side effect of the proof's own mutation. The one thing this case
 * has to establish on its own is that the gauge actually lies over the captured surface; a gauge
 * that cannot paint into the capture cannot explain a pixel in it, whatever its counterfactual says.
 */
export type GaugePlacement =
  | { kind: 'inside' }
  | { kind: 'behind'; surfaceBox: PixelBox; trackBox: PixelBox }

/**
 * The two gauge shapes the editor actually renders. The portal gauge
 * (`ShowEditor.tsx` `show-source-thermometer`) labels itself with `aria-label` only; the raw
 * compile-bar gauge carries `title` as well. Both are closed: an attribute that appears on one
 * version and not the other still fails the raw structural comparison.
 */
const VARIANT_LABEL_ATTRIBUTES: Record<GaugeVariant, readonly string[]> = {
  portal: ['aria-label'],
  'compile-bar': ['aria-label', 'title'],
}

export interface GaugeValueSlot {
  key: string
  role: string
  kind: 'attribute' | 'text-node' | 'inline-width'
  attribute?: string
  /** Whether the counterfactual is allowed to touch this slot. */
  mutated: boolean
}

/**
 * The whole exception. Fixed here so no caller can widen it by declaring another slot, and checked
 * for completeness so no caller can narrow it by omitting one.
 *
 * `mutated` marks the two slots the counterfactual is allowed to touch: the one visible numerator
 * text node and the fill's inline width. `aria-label` and `title` are non-pixel data, so they are
 * verified against the delivered artifact and then left alone - normalizing them could equalize a
 * value-dependent attribute selector that should have shown up as a difference.
 */
export function gaugeValueSlots(variant: GaugeVariant): readonly GaugeValueSlot[] {
  return [
    ...VARIANT_LABEL_ATTRIBUTES[variant].map(attribute => ({
      key: `track:${attribute}`, role: 'track', kind: 'attribute' as const, attribute, mutated: false,
    })),
    { key: 'readout:token-text-node', role: 'readout', kind: 'text-node', mutated: true },
    { key: 'fill:inline-width', role: 'fill', kind: 'inline-width', mutated: true },
  ]
}

/** Roles that may carry a byte-shaped figure at all. */
const VALUE_ELEMENT_ROLES = new Set(['track', 'readout'])
/** Roles every gauge must supply. */
const REQUIRED_ROLES = ['track', 'fill', 'readout'] as const
/**
 * Computed properties whose value is a function of the fill's width, and therefore differ between
 * the raw versions for the approved reason. Exempt on the fill only, and only before normalization;
 * the normalized comparison exempts nothing.
 */
const WIDTH_DERIVED_PROPERTIES = new Set(['width', 'inline-size', 'transform-origin', 'perspective-origin'])

/** Lines both Show exporters emit, used to recognize a real metadata header rather than a comment. */
const METADATA_GRAMMAR = {
  opener: '/*',
  terminator: ' */',
  title: ' * Compiled PXLBLZ Show: ',
  by: ' * By: ',
  required: [' * Source Patterns:', ' * Compatibility: '],
}
/** Any byte-shaped figure the gauge could show, used to catch stale, third or extra values. */
const BYTE_TOKEN_PATTERN = /\d+(?:\.\d+)? (?:B|KB|MB)\b/g
const REDACTION = ''

/**
 * The closed shape the source-size readout actually renders. The editor writes
 * `<span>{formatBytes(delivered)} / {formatBytes(budget)}</span>`, so React emits three text nodes:
 * the numerator, the literal separator, and the denominator. Both numbers match the numeric token
 * pattern, so "the one numeric text node" is not a selector - the position in this closed shape is.
 */
export const READOUT_SEPARATOR = ' / '
const READOUT_NUMERIC_TOKEN = /^\d+(?:\.\d+)? (?:B|KB|MB)$/
const TEXT_NODE = 3

/** Reads the readout's two values, or null when the DOM is not that closed shape. */
export function readoutTokensFromTextNodes(
  textNodes: readonly string[],
): { numerator: string; denominator: string } | null {
  if (textNodes.length !== 3) return null
  const [numerator, separator, denominator] = textNodes
  if (separator !== READOUT_SEPARATOR) return null
  if (!READOUT_NUMERIC_TOKEN.test(numerator) || !READOUT_NUMERIC_TOKEN.test(denominator)) return null
  return { numerator, denominator }
}

/**
 * Returns the live numerator text node, refusing any other shape. Never "the first numeric
 * descendant": the denominator matches the same pattern and must be left alone, as must the
 * separator, so only the validated closed shape yields a mutation target.
 */
export function selectReadoutNumeratorNode(readout: Element): Text {
  const nodes = [...readout.childNodes]
  if (nodes.length !== 3 || nodes.some(node => node.nodeType !== TEXT_NODE)) {
    return failReadoutShape(`it has ${nodes.length} child nodes, not three text nodes`, readout.textContent)
  }
  const tokens = readoutTokensFromTextNodes(nodes.map(node => node.nodeValue ?? ''))
  if (!tokens) return failReadoutShape('its text nodes are not <numerator>, " / ", <denominator>', readout.textContent)
  return nodes[0] as Text
}

function failReadoutShape(reason: string, text: string | null): never {
  throw new Error(`The source-size readout is not the expected shape: ${reason} ("${text ?? ''}").`)
}

/**
 * The display rule the gauge must follow, reimplemented independently of the product. Checking the
 * shown text against this is how "units unchanged" is proved; a production formatting change fails.
 */
export function formatDeliveredBytes(bytes: number): string {
  if (!Number.isInteger(bytes) || bytes < 0) throw new Error('Delivered bytes must be a non-negative integer.')
  if (bytes < 1024) return `${bytes} B`
  return `${(bytes / 1024).toFixed(1)} KB`
}

export function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

/** The percentage the gauge must author for a delivered size against a pinned budget. */
export function expectedFillPercent(deliveredBytes: number, budgetBytes: number): number {
  return (deliveredBytes / budgetBytes) * 100
}

/**
 * Splits a delivered source into its recognized metadata header and its program. The PXLBLZ banner
 * is removed by the stamp parser; the exporter block must then match the grammar both Show
 * exporters actually emit. An unrecognized header, including a hand-written comment that merely
 * carries the title line, returns null rather than being deleted on suspicion.
 */
export function separateDeliveredMetadata(deliveredSource: string): { header: string; program: string } | null {
  if (!parsePxlblzBanner(deliveredSource)) return null
  const lines = stripPxlblzBanner(deliveredSource).split('\n')
  if (lines[0] !== METADATA_GRAMMAR.opener) return null
  if (!lines[1]?.startsWith(METADATA_GRAMMAR.title)) return null
  if (!lines[2]?.startsWith(METADATA_GRAMMAR.by)) return null
  let terminator = -1
  for (let index = 1; index < lines.length; index += 1) {
    if (lines[index] === METADATA_GRAMMAR.terminator) { terminator = index; break }
    if (!/^ \*( |$)/.test(lines[index])) return null
  }
  if (terminator < 0) return null
  const body = lines.slice(1, terminator)
  if (!METADATA_GRAMMAR.required.every(required => body.some(line => line.startsWith(required)))) return null
  return { header: `${lines.slice(0, terminator + 1).join('\n')}\n`, program: lines.slice(terminator + 1).join('\n') }
}

export function qualifySourceSizeException(input: SourceGaugeExceptionInput): SourceGaugeExceptionAssessment {
  const slots = gaugeValueSlots(input.variant)
  const base = {
    surface: input.surface,
    placement: input.placement,
    delivered: null,
    budget: input.budget,
    slotKeys: slots.map(slot => slot.key),
    rawChangedPixels: input.rawDifference.comparable ? input.rawDifference.changedPixels : null,
    evidencePaths: [...input.rawCapturePaths, ...input.counterfactual.capturePaths],
  }
  const refuse = (
    reason: SourceGaugeExceptionReason,
    detail: string,
    delivered: SourceGaugeExceptionAssessment['delivered'] = null,
  ): SourceGaugeExceptionAssessment => ({ ...base, delivered, qualified: false, reason, detail })

  const shape = checkEvidenceShape(input, slots)
  if (shape) return refuse(shape.reason, shape.detail)

  if (input.placement.kind === 'behind' && !boxesOverlap(input.placement.surfaceBox, input.placement.trackBox)) {
    return refuse('gauge-not-over-surface',
      `The gauge at ${describeBox(input.placement.trackBox)} does not lie over the captured surface at`
      + ` ${describeBox(input.placement.surfaceBox)}, so it cannot reach the capture at all.`)
  }

  const reproduction = checkRawDifferenceReproduced(input.rawDifference, input.rawCaptures, input.rawReproduction)
  if (reproduction) return refuse(reproduction.reason, reproduction.detail)

  let delivered: { v1: DeliveredArtifactFacts; v2: DeliveredArtifactFacts }
  let programs: { v1: string; v2: string }
  try {
    const parts = {
      v1: separateDeliveredMetadata(parseEpe(input.v1.deliveredEpeText).src),
      v2: separateDeliveredMetadata(parseEpe(input.v2.deliveredEpeText).src),
    }
    if (!parts.v1 || !parts.v2) {
      return refuse('delivered-header-unrecognized',
        'A delivered source did not match the recognized PXLBLZ banner and Show metadata grammar.')
    }
    programs = { v1: parts.v1.program, v2: parts.v2.program }
    delivered = { v1: facts(input.v1, parts.v1.program), v2: facts(input.v2, parts.v2.program) }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause)
    return refuse('delivered-artifact-unreadable', `The delivered .epe did not reopen: ${message}`)
  }

  // The approved delta is the accepted v2 metadata header, so the delivered programs must match
  // byte for byte. A v2 that grew the program and shrank the header cannot pass on totals alone.
  if (programs.v1 !== programs.v2) {
    return refuse('delivered-program-differs',
      `Delivered programs differ (${delivered.v1.programBytes} B vs ${delivered.v2.programBytes} B);`
      + ' the byte delta is not confined to the exporter metadata header.', delivered)
  }
  if (delivered.v1.token.length !== delivered.v2.token.length) {
    return refuse('token-length-differs',
      `The delivered values format to "${delivered.v1.token}" and "${delivered.v2.token}", which are`
      + ' different widths, so the change is more than a value substitution. Escalate rather than absorb.',
      delivered)
  }

  for (const [label, evidence, deliveredFacts] of [
    ['v1', input.v1, delivered.v1], ['v2', input.v2, delivered.v2],
  ] as const) {
    const truth = checkDisplayedValues(evidence, slots, deliveredFacts.token, label)
    if (truth) return refuse('delivered-value-not-truthful', truth, delivered)
    const fill = checkAuthoredFill(evidence, deliveredFacts.totalBytes, input.budget.bytes, label)
    if (fill) return refuse('fill-not-value-derived', fill, delivered)
  }

  const provenance = checkCounterfactualValues(input, delivered)
  if (provenance) return refuse('counterfactual-not-exact', provenance, delivered)

  const tokens: [string, string] = [delivered.v1.token, delivered.v2.token]
  const raw = compareRaw(input.v1, input.v2, tokens, slots)
  if (raw) return refuse('presentation-differs', raw, delivered)

  const normalizedComparison = compareNormalized(input.v1, input.v2, tokens, slots)
  if (normalizedComparison) return refuse('presentation-differs', normalizedComparison, delivered)

  for (const [label, evidence, token] of [
    ['v1', input.v1, delivered.v1.token], ['v2', input.v2, delivered.v2.token],
  ] as const) {
    const drift = compareNormalizationDrift(evidence, token, input.counterfactual, label)
    if (drift) return refuse('normalization-changed-more-than-values', drift, delivered)
  }

  const unmeasured = checkCounterfactualMeasured(input.counterfactual)
  if (unmeasured) return refuse('counterfactual-not-measured', unmeasured, delivered)
  const counterfactual = checkCounterfactualPixels(input.counterfactual)
  if (counterfactual) return refuse('counterfactual-not-exact', counterfactual, delivered)

  return {
    ...base,
    delivered,
    qualified: true,
    reason: 'qualified',
    detail: `Normalizing the ${slots.filter(slot => slot.mutated).length} mutated byte-value slots leaves the`
      + ` ${input.surface} surfaces pixel-identical; the delivered artifacts are`
      + ` ${delivered.v1.totalBytes} B and ${delivered.v2.totalBytes} B over one identical program,`
      + ` against a ${input.budget.bytes} B budget (${input.budget.provenance}).`,
  }
}

/** The counterfactual pixel measurements a classification may ever speak for. */
export type SourceGaugeNoiseMeasurement =
  | 'counterfactual' | 'repeat-v1' | 'repeat-v2' | 'restored-v1' | 'restored-v2'

export interface QualifiedCaptureNoise {
  measurement: string
  classification: RasterNoiseClassification
}

/**
 * One restoration residual offered as a demonstrated side effect of the proof's own mutation, rather
 * than as classified raster noise (#1065, Jon 2026-09-18).
 */
export interface DemonstratedRestorationSideEffect {
  measurement: string
  demonstration: RestorationSideEffectDemonstration
}

export interface SourceGaugeExceptionWithNoiseAssessment extends SourceGaugeExceptionAssessment {
  /** The unchanged strict assessment, reported verbatim whatever the qualified verdict says. */
  strict: SourceGaugeExceptionAssessment
  /** The second restoration path, reported distinctly from any capture-noise classification. */
  restorationSideEffect: {
    /**
     * Whether this path was open at all: it requires the counterfactual and both repeat comparisons
     * to be measured and exactly zero, whatever any demonstration says.
     */
    eligible: boolean
    detail: string
    applied: readonly {
      measurement: string
      comparison: string
      version: string
      demonstrated: boolean
      reason: string
      residualPixels: number
      maximumChannelDelta: number
      positions: readonly { x: number; y: number }[]
    }[]
  }
  captureNoise: {
    required: readonly { measurement: SourceGaugeNoiseMeasurement; changedPixels: number }[]
    applied: readonly {
      measurement: string
      comparison: string
      classified: boolean
      reason: string
      classifiedPixels: number
      residualPixels: number
    }[]
    detail: string
  }
}

/**
 * The strict exception, plus the two things a residual pixel count may be forgiven by: demonstrated
 * capture noise in the counterfactual, repeat or restoration comparisons, and - since Jon's decision
 * of 2026-09-18 - a restoration residual independently demonstrated to be a systematic side effect of
 * this proof's own mutation.
 *
 * The second path is narrower than the first and is reported distinctly, as
 * `qualified-with-demonstrated-restoration-side-effect` carrying the residual count, maximum channel
 * delta and positions. It applies only to `restored-v1` and `restored-v2`, only while the
 * counterfactual and both repeat captures are measured and exactly zero, only on a demonstration
 * that names this measurement's own version and comparison, and only when that demonstration speaks
 * for exactly the residual this run measured. It is not a tolerance, a mask, a threshold
 * or a pixel-count cap, and it forgives nothing else: every artifact, byte-truth, fill, raw DOM,
 * style, non-comparable-capture and gauge-placement refusal is untouched.
 *
 * Everything the gauge exception actually proves - the delivered artifacts, their identical program
 * and metadata-only delta, the truth of every displayed value, the fill resolved against the pinned
 * budget, the exact raw and normalized DOM comparisons, and the normalization-drift check - runs
 * first and unchanged. Eligibility is established by re-running the strict assessment with only the
 * residual counts zeroed: if that still refuses, the refusal is one no classification can address
 * and the strict result stands. The raw v1/v2 difference is the gauge's own true exported values and
 * is never asked of the classifier.
 *
 * Every non-zero measurement must have its own fully-classified classification covering exactly the
 * pixels that measurement reported. Missing, partial or mismatched classification fails closed.
 */
export function qualifySourceSizeExceptionWithQualifiedCaptureNoise(
  input: SourceGaugeExceptionInput,
  classifications: readonly QualifiedCaptureNoise[],
  restorationDemonstrations: readonly DemonstratedRestorationSideEffect[] = [],
): SourceGaugeExceptionWithNoiseAssessment {
  const strict = qualifySourceSizeException(input)
  const counterfactual = input.counterfactual
  // Only a measured pair can require - or receive - a classification. An unmeasured pair reported no
  // pixels, so there is nothing for a classification to cover and nothing it could excuse; the
  // strict refusal below stands.
  const required = counterfactualMeasurements(counterfactual)
    .flatMap(({ measurement, value }) => (
      value.comparable && value.changedPixels > 0 ? [{ measurement, changedPixels: value.changedPixels }] : []
    ))

  /**
   * The demonstrated-restoration path Jon approved on 2026-09-18 is open only while the counterfactual
   * and both repeat captures are measured and exactly zero. A demonstration says the restoration
   * residual is a side effect of this proof's own mutation; it says nothing about a surface whose
   * normalized captures still differ or whose normalized state is not even stable, so those refusals
   * stand whatever it shows.
   */
  const restorationEligible = measuredExact(counterfactual.counterfactual)
    && measuredExact(counterfactual.repeat.v1) && measuredExact(counterfactual.repeat.v2)
  const restorationApplied: SourceGaugeExceptionWithNoiseAssessment['restorationSideEffect']['applied'][number][] = []

  const carry = (
    assessment: SourceGaugeExceptionAssessment,
    detail: string,
    applied: SourceGaugeExceptionWithNoiseAssessment['captureNoise']['applied'] = [],
    restorationDetail = restorationEligible
      ? 'No restoration residual was demonstrated as a side effect of the proof\'s own mutation.'
      : 'The demonstrated-restoration path was closed: the counterfactual and both repeat captures'
        + ' must be measured and exactly zero.',
  ): SourceGaugeExceptionWithNoiseAssessment => ({
    ...assessment,
    strict,
    restorationSideEffect: { eligible: restorationEligible, detail: restorationDetail, applied: restorationApplied },
    captureNoise: { required, applied, detail },
  })

  if (strict.qualified) {
    return carry(strict, 'The strict assessment qualified on its own; no capture-noise classification was required.')
  }

  // Only the residual pixel gate is eligible. Re-running with the counts zeroed isolates it exactly:
  // a refusal that survives is a value, artifact or presentation failure the classifier cannot speak to.
  // Only a measured count is zeroed. An unmeasured pair keeps its own shape, so the isolation cannot
  // invent a measurement that was never taken and the refusal survives as it must.
  const zeroed = (value: PixelMeasurement): PixelMeasurement => (
    value.comparable ? { comparable: true, changedPixels: 0, maximumChannelDelta: 0 } : value
  )
  const withoutResiduals = qualifySourceSizeException({
    ...input,
    counterfactual: {
      ...counterfactual,
      counterfactual: zeroed(counterfactual.counterfactual),
      repeat: { v1: zeroed(counterfactual.repeat.v1), v2: zeroed(counterfactual.repeat.v2) },
      restored: { v1: zeroed(counterfactual.restored.v1), v2: zeroed(counterfactual.restored.v2) },
    },
  })
  if (!withoutResiduals.qualified) {
    return carry(strict,
      `The gauge's own proof refused with "${withoutResiduals.reason}", which no capture-noise`
      + ' classification can address; the residual pixels were never considered.')
  }

  const applied: SourceGaugeExceptionWithNoiseAssessment['captureNoise']['applied'][number][] = []
  const unmet: string[] = []
  const demonstrated: RestorationSideEffectDemonstration[] = []
  for (const { measurement, changedPixels } of required) {
    const sideEffect = considerRestorationSideEffect(
      measurement, counterfactual, restorationEligible, restorationDemonstrations)
    if (sideEffect) {
      restorationApplied.push(sideEffect.record)
      if (sideEffect.accepted) {
        demonstrated.push(sideEffect.demonstration)
        continue
      }
    }
    const supplied = classifications.find(entry => entry.measurement === measurement)
    if (!supplied) {
      unmet.push(`${measurement} (${changedPixels} pixels) has no classification`
        + (sideEffect ? ` and ${sideEffect.refusal}` : ''))
      continue
    }
    const { classification } = supplied
    applied.push({
      measurement,
      comparison: classification.comparison,
      classified: classification.classified,
      reason: classification.reason,
      classifiedPixels: classification.classifiedPixels.length,
      residualPixels: classification.residualPixels.length,
    })
    if (!classification.classified) {
      unmet.push(`${measurement} was not classified (${classification.reason})`)
      continue
    }
    if (classification.classifiedPixels.length !== changedPixels
      || classification.changedPixels !== changedPixels
      || classification.reportedChangedPixels !== changedPixels) {
      unmet.push(`${measurement} reported ${changedPixels} changed pixels but its classification covers`
        + ` ${classification.classifiedPixels.length}`)
    }
  }

  if (unmet.length > 0) {
    return carry(strict, `The strict refusal stands: ${unmet.join('; ')}.`, applied,
      demonstrated.length > 0
        ? `Demonstrated as a side effect of the proof's own mutation:`
          + ` ${describeDemonstrated(demonstrated)}; the surface still refuses, so the strict refusal stands.`
        : undefined)
  }
  if (demonstrated.length === 0) {
    return carry({
      ...strict,
      qualified: true,
      reason: 'qualified-with-classified-capture-noise',
      detail: `${strict.detail} Every residual pixel in ${required.map(entry => entry.measurement).join(', ')}`
        + ' was independently demonstrated raster noise; the strict refusal is retained above.',
    }, 'Each non-zero counterfactual measurement was fully classified against its own control group.', applied)
  }
  const sideEffects = describeDemonstrated(demonstrated)
  return carry({
    ...strict,
    qualified: true,
    reason: 'qualified-with-demonstrated-restoration-side-effect',
    detail: `${strict.detail} Restoration is not byte-exact, and its residual is independently`
      + ` demonstrated to be a systematic side effect of this proof's own mutation (${sideEffects});`
      + ' the counterfactual and both repeat captures are exactly zero and the strict refusal is'
      + ' retained above.',
  },
  applied.length > 0
    ? 'Each remaining non-zero counterfactual measurement was fully classified against its own control group.'
    : 'No capture-noise classification was required.',
  applied,
  `Demonstrated as a side effect of the proof's own mutation: ${sideEffects}.`)
}

/**
 * Names each accepted demonstration for the report, so a refusal that still carries one cannot say
 * none was demonstrated.
 */
function describeDemonstrated(demonstrated: readonly RestorationSideEffectDemonstration[]): string {
  return demonstrated.map(entry =>
    `${entry.comparison}: ${entry.residualPixels} pixels at maximum channel delta`
    + ` ${entry.maximumChannelDelta}, at ${describePositions(entry.positions)}`).join('; ')
}

/**
 * The restoration measurements this path may ever speak for, each bound to the version and the
 * comparison a demonstration for it must name. The collector derives both from one version
 * variable, but the pure oracle re-checks the binding itself, so a demonstration of some other
 * comparison cannot be carried across even when its pixel count and channel delta happen to match.
 */
const RESTORATION_MEASUREMENT_IDENTITY: ReadonlyMap<string, { version: string; comparison: string }> = new Map([
  ['restored-v1', { version: 'v1', comparison: 'v1 delivered vs restored' }],
  ['restored-v2', { version: 'v2', comparison: 'v2 delivered vs restored' }],
])

/**
 * Weighs one offered demonstration against the measurement it claims to explain. The demonstration
 * has to be for a restoration comparison, the path has to be open, the demonstration itself has to
 * have succeeded, it has to name this measurement's own version and comparison, and it has to speak
 * for exactly the residual this run measured - same pixel count and same maximum channel delta - so
 * a demonstration of some other comparison cannot be carried across.
 */
function considerRestorationSideEffect(
  measurement: string,
  counterfactual: CounterfactualEvidence,
  eligible: boolean,
  offered: readonly DemonstratedRestorationSideEffect[],
): {
  record: SourceGaugeExceptionWithNoiseAssessment['restorationSideEffect']['applied'][number]
  demonstration: RestorationSideEffectDemonstration
  accepted: boolean
  refusal: string
} | null {
  const identity = RESTORATION_MEASUREMENT_IDENTITY.get(measurement)
  if (!identity) return null
  const supplied = offered.find(entry => entry.measurement === measurement)
  if (!supplied) return null
  const { demonstration } = supplied
  const record = {
    measurement,
    comparison: demonstration.comparison,
    version: demonstration.version,
    demonstrated: demonstration.demonstrated,
    reason: demonstration.reason,
    residualPixels: demonstration.residualPixels,
    maximumChannelDelta: demonstration.maximumChannelDelta,
    positions: demonstration.positions,
  }
  const measured = counterfactualMeasurements(counterfactual)
    .find(entry => entry.measurement === measurement)?.value
  const refusal = !eligible
    ? 'its restoration demonstration cannot be used while the counterfactual and repeat captures are'
      + ' not exactly zero'
    : !demonstration.demonstrated
      ? `its restoration side effect was not demonstrated (${demonstration.reason})`
      : demonstration.version !== identity.version || demonstration.comparison !== identity.comparison
        ? `its restoration demonstration is for ${demonstration.version} ("${demonstration.comparison}"),`
          + ` not for this measurement's ${identity.version} ("${identity.comparison}"), so a demonstration`
          + ' of some other comparison cannot be carried across'
        : !measured || !measured.comparable
          || demonstration.residualPixels !== measured.changedPixels
          || demonstration.maximumChannelDelta !== measured.maximumChannelDelta
          ? `its restoration demonstration speaks for ${demonstration.residualPixels} pixels at maximum`
            + ` channel delta ${demonstration.maximumChannelDelta}, which is not the residual this run`
            + ' measured'
          : ''
  return { record, demonstration, accepted: refusal === '', refusal }
}

/**
 * Reclassifies a visual pair that differs only by the approved source-size value. Only a
 * `pixels-differ` verdict is eligible: a missing surface, changed dimensions or changed position is
 * never a value difference.
 */
export function reclassifyVisualPairWithSourceGaugeException(
  assessment: VisualPairAssessment,
  exception: SourceGaugeExceptionAssessment,
): VisualPairAssessment & { sourceGaugeException: SourceGaugeExceptionAssessment } {
  const carried = { ...assessment, sourceGaugeException: exception }
  if (assessment.equivalent || assessment.reason !== 'pixels-differ') return carried
  if (!exception.qualified || exception.surface !== assessment.surface) return carried
  return { ...carried, equivalent: true, reason: 'equivalent' }
}

function facts(evidence: GaugeVersionEvidence, program: string): DeliveredArtifactFacts {
  const totalBytes = utf8ByteLength(parseEpe(evidence.deliveredEpeText).src)
  const programBytes = utf8ByteLength(program)
  return {
    path: evidence.deliveredArtifact.path,
    route: evidence.deliveredArtifact.route,
    totalBytes,
    headerBytes: totalBytes - programBytes,
    programBytes,
    token: formatDeliveredBytes(totalBytes),
  }
}

/** Positive-area overlap. Touching edges do not paint into each other. */
function boxesOverlap(left: PixelBox, right: PixelBox): boolean {
  return left.width > 0 && left.height > 0 && right.width > 0 && right.height > 0
    && left.x < right.x + right.width && right.x < left.x + left.width
    && left.y < right.y + right.height && right.y < left.y + left.height
}

function describeBox(box: PixelBox): string {
  return `(${box.x}, ${box.y}) ${box.width}x${box.height}`
}

function checkEvidenceShape(
  input: SourceGaugeExceptionInput,
  slots: readonly GaugeValueSlot[],
): { reason: SourceGaugeExceptionReason; detail: string } | null {
  const incomplete = (detail: string) => ({ reason: 'incomplete-evidence' as const, detail })
  const structure = (detail: string) => ({ reason: 'unexpected-structure' as const, detail })
  if (input.rawCapturePaths.length === 0) return incomplete('No retained raw captures or difference were named.')
  if (!input.rawDifference.comparable) {
    return incomplete(`The raw delivered pair could not be compared: ${input.rawDifference.detail}`)
  }
  if (input.counterfactual.capturePaths.length === 0) return incomplete('No retained counterfactual captures were named.')
  if (!Number.isInteger(input.budget.bytes) || input.budget.bytes <= 0 || !input.budget.provenance) {
    return { reason: 'budget-not-pinned', detail: 'The budget must be a pinned positive integer with named provenance.' }
  }
  for (const [label, evidence] of [['v1', input.v1], ['v2', input.v2]] as const) {
    if (!evidence.deliveredArtifact.path) return incomplete(`${label} named no delivered .epe artifact.`)
    if (formatDeliveredBytes(input.budget.bytes) !== evidence.budgetToken) {
      return {
        reason: 'budget-not-pinned',
        detail: `${label} displays ${evidence.budgetToken}, which is not how the pinned`
          + ` ${input.budget.bytes} B budget formats.`,
      }
    }
    for (const [state, elements] of [['raw', evidence.raw], ['normalized', evidence.normalized]] as const) {
      if (elements.length === 0) return incomplete(`${label} supplied no ${state} gauge elements.`)
      for (const role of REQUIRED_ROLES) {
        if (!elements.some(element => element.role === role)) return structure(`${label} ${state} has no ${role} element.`)
      }
      const roles = elements.map(element => element.role)
      if (new Set(roles).size !== roles.length) return structure(`${label} ${state} repeats a gauge role.`)
    }
    if (!sameStrings(evidence.raw.map(element => element.role), evidence.normalized.map(element => element.role))) {
      return structure(`${label} normalized a different set of gauge elements than it captured.`)
    }
    for (const slot of slots) {
      const element = evidence.raw.find(entry => entry.role === slot.role)!
      if (slot.kind === 'attribute' && element.attributes[slot.attribute!] === undefined) {
        return structure(`${label} ${slot.role} has no ${slot.attribute} attribute for slot ${slot.key}.`)
      }
    }
    if (!evidence.authoredInlineWidth) return incomplete(`${label} reported no authored inline fill width.`)
    for (const elements of [evidence.raw, evidence.normalized]) {
      const fill = elements.find(element => element.role === 'fill')!
      if (fill.attributes.style === undefined) {
        return incomplete(`${label} omitted the fill's style attribute, which carries the authored width.`)
      }
    }
  }
  if (!sameStrings(input.v1.raw.map(element => element.role), input.v2.raw.map(element => element.role))) {
    return structure('The two versions supplied different gauge elements.')
  }
  // One collected property set everywhere, so a shrinking collection cannot quietly weaken the
  // comparison. This fixes the proof domain to the properties actually gathered; it is not a claim
  // that every CSS property is covered.
  const signatures = new Set<string>()
  for (const evidence of [input.v1, input.v2]) {
    for (const elements of [evidence.raw, evidence.normalized]) {
      for (const element of elements) signatures.add(Object.keys(element.computedStyle).sort().join(','))
    }
  }
  if (signatures.size !== 1) return incomplete('The collected computed-style properties are not the same everywhere.')
  if ([...signatures][0] === '') return incomplete('No computed styles were collected.')
  return null
}

/**
 * Every byte-shaped value in the gauge must be this version's true delivered value or the displayed
 * denominator, and the delivered value may appear only in the fixed slots. A stale figure fails even
 * when both versions are equally wrong, and an extra numeric readout fails as unexpected structure.
 */
function checkDisplayedValues(
  evidence: GaugeVersionEvidence,
  slots: readonly GaugeValueSlot[],
  token: string,
  label: string,
): string | null {
  const allowed = new Set([token, evidence.budgetToken])
  for (const element of evidence.raw) {
    const strings: [string, string][] = [
      ...element.textNodes.map((data, index) => [`text node ${index}`, data] as [string, string]),
      ...Object.entries(element.attributes),
    ]
    for (const [where, value] of strings) {
      for (const match of value.matchAll(BYTE_TOKEN_PATTERN)) {
        if (!allowed.has(match[0])) {
          return `${label} shows ${match[0]} in ${element.role} ${where}, but the delivered artifact is`
            + ` ${token} against a ${evidence.budgetToken} budget.`
        }
        if (!VALUE_ELEMENT_ROLES.has(element.role)) {
          return `${label} shows ${match[0]} in ${element.role} ${where}, which is not a byte-value slot.`
        }
      }
    }
  }
  const readout = evidence.raw.find(element => element.role === 'readout')!
  const tokens = readoutTokensFromTextNodes(readout.textNodes)
  if (!tokens) {
    return `${label} readout is not the closed "<numerator>${READOUT_SEPARATOR}<denominator>" shape:`
      + ` ${JSON.stringify(readout.textNodes)}.`
  }
  if (tokens.numerator !== token) {
    return `${label} readout numerator is "${tokens.numerator}" while the delivered artifact is ${token}.`
  }
  if (tokens.denominator !== evidence.budgetToken) {
    return `${label} readout denominator is "${tokens.denominator}" while the gauge reports a`
      + ` ${evidence.budgetToken} budget.`
  }
  for (const slot of slots) {
    if (slot.kind !== 'attribute') continue
    const element = evidence.raw.find(entry => entry.role === slot.role)!
    if (!element.attributes[slot.attribute!].includes(token)) {
      return `${label} slot ${slot.key} is "${element.attributes[slot.attribute!]}", which does not carry`
        + ` the delivered value ${token}.`
    }
  }
  return null
}

/**
 * The authored inline width must be exactly what the delivered byte count and the pinned budget
 * imply, compared through the page's own serializer. The text only resolves to 0.1 KB; this is what
 * catches a byte count wrong by less than a rounding step.
 */
function checkAuthoredFill(
  evidence: GaugeVersionEvidence,
  deliveredBytes: number,
  budgetBytes: number,
  label: string,
): string | null {
  const expected = expectedFillPercent(deliveredBytes, budgetBytes)
  if (expected >= 100) {
    return `${label} delivers ${deliveredBytes} B against a ${budgetBytes} B budget, so the fill clamps`
      + ' and stops encoding the value.'
  }
  if (evidence.canonicalInlineWidth.percent !== expected) {
    return `${label} canonicalized ${evidence.canonicalInlineWidth.percent}% while its delivered`
      + ` ${deliveredBytes} B against the pinned budget implies ${expected}%.`
  }
  if (evidence.canonicalInlineWidth.serialized !== evidence.authoredInlineWidth) {
    return `${label} authored a fill width of "${evidence.authoredInlineWidth}" where its delivered`
      + ` ${deliveredBytes} B serializes to "${evidence.canonicalInlineWidth.serialized}".`
  }
  // The verified slot must be the width the element's own style attribute actually carries.
  const fill = evidence.raw.find(element => element.role === 'fill')!
  const declared = parseStyleAttribute(fill.attributes.style ?? '')
  if (declared.width !== evidence.authoredInlineWidth) {
    return `${label} reports an authored width of "${evidence.authoredInlineWidth}" while the fill's`
      + ` style attribute declares "${declared.width}".`
  }
  return null
}

/** The raw gauges must match exactly, outside the fixed slots and what the fill's width implies. */
function compareRaw(
  v1: GaugeVersionEvidence,
  v2: GaugeVersionEvidence,
  tokens: [string, string],
  slots: readonly GaugeValueSlot[],
): string | null {
  return compareElements(v1.raw, v2.raw, { label: 'raw', tokens, slots, exemptMutatedSlots: true })
}

/**
 * Once the mutated values agree, the only remaining exemption is the byte value inside `aria-label`
 * and `title`, which are deliberately never mutated. Pixels, text nodes, geometry and every
 * collected style are compared with no exemption at all.
 */
function compareNormalized(
  v1: GaugeVersionEvidence,
  v2: GaugeVersionEvidence,
  tokens: [string, string],
  slots: readonly GaugeValueSlot[],
): string | null {
  return compareElements(v1.normalized, v2.normalized, { label: 'normalized', tokens, slots, exemptMutatedSlots: false })
}

function compareElements(
  left: readonly GaugeElementEvidence[],
  right: readonly GaugeElementEvidence[],
  options: { label: string; tokens: [string, string]; slots: readonly GaugeValueSlot[]; exemptMutatedSlots: boolean },
): string | null {
  const [token1, token2] = options.tokens
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index]
    const b = right[index]
    const where = `${options.label} ${a.role}`
    if (a.tag !== b.tag) return `${where} changed element from ${a.tag} to ${b.tag}.`
    if (a.classList !== b.classList) return `${where} changed classes from "${a.classList}" to "${b.classList}".`
    if (a.childNodeCount !== b.childNodeCount) return `${where} has ${a.childNodeCount} child nodes against ${b.childNodeCount}.`
    if (a.textNodes.length !== b.textNodes.length) return `${where} has a different number of text nodes.`

    for (let node = 0; node < a.textNodes.length; node += 1) {
      const slotted = options.exemptMutatedSlots && a.role === 'readout'
        && a.textNodes[node] === token1 && b.textNodes[node] === token2
      if (!slotted && a.textNodes[node] !== b.textNodes[node]) {
        return `${where} text node ${node} differs: "${a.textNodes[node]}" vs "${b.textNodes[node]}".`
      }
    }
    for (const key of new Set([...Object.keys(a.attributes), ...Object.keys(b.attributes)])) {
      const leftValue = a.attributes[key]
      const rightValue = b.attributes[key]
      if (leftValue === undefined || rightValue === undefined) {
        return `${where} attribute ${key} is present on only one version.`
      }
      // The unmutated aria-label and title still carry each version's own verified value.
      const slotted = options.slots.some(slot =>
        slot.kind === 'attribute' && slot.role === a.role && slot.attribute === key)
      const difference = key === 'style'
        ? compareStyleAttribute(leftValue, rightValue, `${where} attribute style`,
          options.exemptMutatedSlots && a.role === 'fill')
        : slotted
          ? compareAroundToken(leftValue, rightValue, token1, token2, `${where} attribute ${key}`)
          : (leftValue === rightValue ? null : `${where} attribute ${key} differs: "${leftValue}" vs "${rightValue}".`)
      if (difference) return difference
    }
    const styleDifference = compareStyles(a, b, where, options.exemptMutatedSlots)
    if (styleDifference) return styleDifference
    const exemptWidth = options.exemptMutatedSlots && a.role === 'fill'
    if (a.rect.x !== b.rect.x || a.rect.y !== b.rect.y || a.rect.height !== b.rect.height
      || (!exemptWidth && a.rect.width !== b.rect.width)) {
      return `${where} geometry differs.`
    }
  }
  return null
}

/**
 * Parses a `style` attribute into its declarations. The attribute is collected verbatim, never
 * omitted, so the fill's authored width is compared as a property rather than as opaque text.
 */
export function parseStyleAttribute(value: string): Record<string, string> {
  const declarations: Record<string, string> = {}
  for (const part of value.split(';')) {
    if (!part.trim()) continue
    const separator = part.indexOf(':')
    if (separator < 0) return {}
    declarations[part.slice(0, separator).trim()] = part.slice(separator + 1).trim()
  }
  return declarations
}

/**
 * Compares two `style` attributes declaration by declaration. Only the fill's `width` is exempt, and
 * only before normalization, because it is the one slot proved independently against the artifact.
 */
function compareStyleAttribute(
  left: string,
  right: string,
  label: string,
  exemptFillWidth: boolean,
): string | null {
  const leftDeclarations = parseStyleAttribute(left)
  const rightDeclarations = parseStyleAttribute(right)
  if (Object.keys(leftDeclarations).length === 0 && left.trim()) return `${label} could not be parsed: "${left}".`
  if (Object.keys(rightDeclarations).length === 0 && right.trim()) return `${label} could not be parsed: "${right}".`
  for (const key of new Set([...Object.keys(leftDeclarations), ...Object.keys(rightDeclarations)])) {
    if (exemptFillWidth && key === 'width') continue
    if (leftDeclarations[key] !== rightDeclarations[key]) {
      return `${label} ${key} differs: ${leftDeclarations[key]} vs ${rightDeclarations[key]}.`
    }
  }
  return null
}

function compareStyles(
  a: GaugeElementEvidence,
  b: GaugeElementEvidence,
  where: string,
  exemptFillWidth: boolean,
): string | null {
  const widthDerived = (key: string) => exemptFillWidth && a.role === 'fill' && WIDTH_DERIVED_PROPERTIES.has(key)
  for (const key of new Set([...Object.keys(a.computedStyle), ...Object.keys(b.computedStyle)])) {
    if (widthDerived(key)) continue
    if (a.computedStyle[key] !== b.computedStyle[key]) {
      return `${where} computed ${key} differs: ${a.computedStyle[key]} vs ${b.computedStyle[key]}.`
    }
  }
  for (const selector of new Set([...Object.keys(a.pseudoStyle), ...Object.keys(b.pseudoStyle)])) {
    const leftPseudo = a.pseudoStyle[selector]
    const rightPseudo = b.pseudoStyle[selector]
    if (!leftPseudo || !rightPseudo) return `${where} ${selector} is generated on only one side.`
    for (const key of new Set([...Object.keys(leftPseudo), ...Object.keys(rightPseudo)])) {
      if (widthDerived(key)) continue
      if (leftPseudo[key] !== rightPseudo[key]) {
        return `${where} ${selector} computed ${key} differs: ${leftPseudo[key]} vs ${rightPseudo[key]}.`
      }
    }
  }
  return null
}

/**
 * Normalization must have changed the two mutated slots and nothing else: no attribute, no other
 * text node, no style that is not a consequence of the fill's width. Without this, a conditional CSS
 * regression could in principle be equalized by the mutation itself rather than by the values.
 */
function compareNormalizationDrift(
  evidence: GaugeVersionEvidence,
  token: string,
  counterfactual: CounterfactualEvidence,
  label: string,
): string | null {
  // The readout text and the fill width are separate allowances. Two different byte counts can
  // round to the same token, so the width allowance is based on the authored width actually
  // changing, never on the rounded text differing.
  const changedText = token !== counterfactual.commonToken
  const changedWidth = evidence.authoredInlineWidth !== counterfactual.commonInlineWidth
  for (let index = 0; index < evidence.raw.length; index += 1) {
    const before = evidence.raw[index]
    const after = evidence.normalized[index]
    const where = `${label} ${before.role}`
    if (before.role !== after.role) return `${where} was paired with ${after.role} after normalization.`
    if (before.tag !== after.tag || before.classList !== after.classList) {
      return `${where} was restructured by normalization.`
    }
    if (before.childNodeCount !== after.childNodeCount || before.textNodes.length !== after.textNodes.length) {
      return `${where} gained or lost nodes during normalization, so a text node was not the target.`
    }
    for (let node = 0; node < before.textNodes.length; node += 1) {
      if (before.textNodes[node] === after.textNodes[node]) continue
      const isSlot = changedText && before.role === 'readout'
        && before.textNodes[node] === token && after.textNodes[node] === counterfactual.commonToken
      if (!isSlot) return `${where} text node ${node} changed outside the one mutated text node.`
    }
    for (const key of new Set([...Object.keys(before.attributes), ...Object.keys(after.attributes)])) {
      if (before.attributes[key] === after.attributes[key]) continue
      if (key !== 'style') {
        return `${where} attribute ${key} changed during normalization; only the style width is mutated.`
      }
      const styleDrift = compareStyleAttribute(
        before.attributes[key], after.attributes[key], `${where} attribute style`,
        before.role === 'fill' && changedWidth)
      if (styleDrift) return styleDrift
      if (!(before.role === 'fill' && changedWidth)) {
        return `${where} style attribute changed during normalization outside the fill width.`
      }
    }
    const widthDerived = (key: string) => before.role === 'fill' && WIDTH_DERIVED_PROPERTIES.has(key) && changedWidth
    for (const key of new Set([...Object.keys(before.computedStyle), ...Object.keys(after.computedStyle)])) {
      if (before.computedStyle[key] === after.computedStyle[key]) continue
      if (widthDerived(key)) continue
      return `${where} computed ${key} changed during normalization: ${before.computedStyle[key]}`
        + ` became ${after.computedStyle[key]}.`
    }
    // Generated content can be styled from the value too, so it is held to the same rule.
    for (const selector of new Set([...Object.keys(before.pseudoStyle), ...Object.keys(after.pseudoStyle)])) {
      const beforePseudo = before.pseudoStyle[selector]
      const afterPseudo = after.pseudoStyle[selector]
      if (!beforePseudo || !afterPseudo) {
        return `${where} ${selector} appeared or disappeared during normalization.`
      }
      for (const key of new Set([...Object.keys(beforePseudo), ...Object.keys(afterPseudo)])) {
        if (beforePseudo[key] === afterPseudo[key]) continue
        if (widthDerived(key)) continue
        return `${where} ${selector} computed ${key} changed during normalization:`
          + ` ${beforePseudo[key]} became ${afterPseudo[key]}.`
      }
    }
    if (before.rect.x !== after.rect.x || before.rect.y !== after.rect.y || before.rect.height !== after.rect.height) {
      return `${where} moved or resized during normalization.`
    }
    if (before.rect.width !== after.rect.width && !(before.role === 'fill' && changedWidth)) {
      return `${where} changed width during normalization outside the fill.`
    }
  }
  return null
}

/**
 * Compares two strings that carry a byte value. Each side's own value is removed and the occurrence
 * positions must match, so the exception stays a value substitution and never absorbs a
 * repositioned or reworded string.
 */
function compareAroundToken(
  left: string,
  right: string,
  leftToken: string,
  rightToken: string,
  label: string,
): string | null {
  const leftRedacted = redact(left, leftToken)
  const rightRedacted = redact(right, rightToken)
  if (leftRedacted.text !== rightRedacted.text) {
    return `${label} differs beyond the byte value: "${left}" vs "${right}".`
  }
  if (!sameNumbers(leftRedacted.indices, rightRedacted.indices)) {
    return `${label} places the byte value differently, so the change is not value-only.`
  }
  return null
}

/** The normalized value must be one the versions actually delivered, not a crafted third one. */
function checkCounterfactualValues(
  input: SourceGaugeExceptionInput,
  delivered: { v1: DeliveredArtifactFacts; v2: DeliveredArtifactFacts },
): string | null {
  const counterfactual = input.counterfactual
  if (![delivered.v1.token, delivered.v2.token].includes(counterfactual.commonToken)) {
    return `The counterfactual used "${counterfactual.commonToken}", which is neither version's verified value.`
  }
  if (![input.v1.authoredInlineWidth, input.v2.authoredInlineWidth].includes(counterfactual.commonInlineWidth)) {
    return `The counterfactual used a fill width of "${counterfactual.commonInlineWidth}", which neither version authored.`
  }
  return null
}

/** Every measurement the counterfactual rests on, named for the refusal that reports it. */
export function counterfactualMeasurements(
  counterfactual: CounterfactualEvidence,
): readonly { measurement: SourceGaugeNoiseMeasurement; value: PixelMeasurement }[] {
  return [
    { measurement: 'counterfactual', value: counterfactual.counterfactual },
    { measurement: 'repeat-v1', value: counterfactual.repeat.v1 },
    { measurement: 'repeat-v2', value: counterfactual.repeat.v2 },
    { measurement: 'restored-v1', value: counterfactual.restored.v1 },
    { measurement: 'restored-v2', value: counterfactual.restored.v2 },
  ]
}

/**
 * A pair that could not be compared refuses before any count is read. This runs ahead of the
 * exactly-zero check on purpose: an unmeasured pair has no count, and treating its absence as zero
 * would clear the surface on a counterfactual that never happened.
 */
function checkCounterfactualMeasured(counterfactual: CounterfactualEvidence): string | null {
  for (const { measurement, value } of counterfactualMeasurements(counterfactual)) {
    if (!value.comparable) {
      return `The ${measurement} captures could not be compared, so the counterfactual was never`
        + ` measured: ${value.detail}`
    }
  }
  return null
}

function checkCounterfactualPixels(counterfactual: CounterfactualEvidence): string | null {
  const { counterfactual: pair, repeat, restored } = counterfactual
  if (pair.comparable && !measuredExact(pair)) {
    return `${pair.changedPixels} pixels still differ once the byte values agree`
      + ` (maximum channel delta ${pair.maximumChannelDelta}).`
  }
  if ((repeat.v1.comparable && !measuredExact(repeat.v1)) || (repeat.v2.comparable && !measuredExact(repeat.v2))) {
    return 'A normalized surface is not stable across repeated captures'
      + ` (v1 ${changedOf(repeat.v1)}, v2 ${changedOf(repeat.v2)} pixels).`
  }
  if ((restored.v1.comparable && !measuredExact(restored.v1)) || (restored.v2.comparable && !measuredExact(restored.v2))) {
    return 'Restoring the normalized slots did not return the pages to their captured state'
      + ` (v1 ${changedOf(restored.v1)}, v2 ${changedOf(restored.v2)} pixels).`
  }
  return null
}

function changedOf(measurement: PixelMeasurement): number {
  return measurement.comparable ? measurement.changedPixels : 0
}

/**
 * The candidate's raw delivered difference must be reproduced exactly by the independent control
 * pair (#1065). This runs inside the strict assessment, ahead of every value, artifact and
 * presentation check it could otherwise hide behind, so the refusal survives the residual-zeroing
 * isolation below and neither forgiveness path can touch it.
 */
function checkRawDifferenceReproduced(
  rawDifference: PixelMeasurement,
  rawCaptures: { left: RawDeliveredCaptureRef; right: RawDeliveredCaptureRef } | undefined,
  reproduction: RawDeliveredReproduction | undefined,
): { reason: SourceGaugeExceptionReason; detail: string } | null {
  if (!reproduction) {
    return {
      reason: 'incomplete-evidence',
      detail: 'No independent control pair was supplied for the raw delivered difference, so a transient'
        + ' capture difference in the candidate pair cannot be told apart from the gauge value.',
    }
  }
  if (!reproduction.candidate.comparable) {
    return {
      reason: 'incomplete-evidence',
      detail: `The raw delivered candidate pair could not be compared: ${reproduction.candidate.detail}`,
    }
  }
  if (!reproduction.control.comparable) {
    return {
      reason: 'incomplete-evidence',
      detail: `The raw delivered control pair could not be compared: ${reproduction.control.detail}`,
    }
  }
  const { difference: candidate } = reproduction.candidate
  const { difference: control } = reproduction.control
  for (const [label, pair] of [['candidate', candidate], ['control', control]] as const) {
    const malformed = checkReproductionPairShape(label, pair)
    if (malformed) return { reason: 'incomplete-evidence', detail: malformed }
  }
  const binding = findRawBindingMismatch(rawDifference, rawCaptures, candidate)
  if (binding) return { reason: 'incomplete-evidence', detail: binding }
  const reused = findReusedRawCapture(candidate, control)
  if (reused) {
    return {
      reason: 'raw-difference-not-reproduced',
      detail: `The raw control capture "${reused.control}" is the same capture event as the candidate`
        + ` "${reused.candidate}" (${reused.field}), so the control pair cannot independently reproduce`
        + ' the candidate difference.',
    }
  }
  const order = findControlAfterCandidate(candidate, control)
  if (order) return { reason: 'raw-difference-not-reproduced', detail: order }
  const mismatch = findUnreproducedRawPixel(candidate, control)
  if (mismatch) return { reason: 'raw-difference-not-reproduced', detail: mismatch }
  return null
}

/**
 * The reproduction's candidate pair must be the same comparison as the verdict's raw delivered
 * difference: the same two captures on both sides, and the same changed-pixel count and maximum
 * channel delta. A miswired caller could otherwise pass a reproduction of a different capture pair
 * while the row still charges the raw difference to the gauge. A pair that is not this comparison
 * is malformed evidence for the claim, not a failed reproduction.
 */
function findRawBindingMismatch(
  rawDifference: PixelMeasurement,
  rawCaptures: { left: RawDeliveredCaptureRef; right: RawDeliveredCaptureRef } | undefined,
  candidate: RestorationDifference,
): string | null {
  if (!rawCaptures) {
    return 'The verdict names no raw delivered captures, so the candidate pair cannot be bound to'
      + ' the raw difference it claims to reproduce.'
  }
  if (!rawDifference.comparable) {
    return 'The raw delivered pair was never measured, so no candidate pair can reproduce it.'
  }
  for (const [side, expected, supplied] of [
    ['left', rawCaptures.left, candidate.left],
    ['right', rawCaptures.right, candidate.right],
  ] as const) {
    if (supplied.label !== expected.label || supplied.path !== expected.path
      || supplied.sequence !== expected.sequence) {
      return `The raw candidate pair compares "${candidate.left.label}" against`
        + ` "${candidate.right.label}", not the raw delivered captures "${rawCaptures.left.label}"`
        + ` against "${rawCaptures.right.label}" the verdict speaks for (mismatch on the ${side});`
        + ' a reproduction of a different capture pair proves nothing about this difference.'
    }
  }
  if (candidate.changedPixels.length !== rawDifference.changedPixels) {
    return `The raw delivered difference reports ${rawDifference.changedPixels} changed pixels but its`
      + ` candidate pair supplies ${candidate.changedPixels.length}; the remainder would have been`
      + ' charged to the gauge without evidence.'
  }
  const maximumDelta = maximumChangedChannelDelta(candidate.changedPixels)
  if (maximumDelta !== rawDifference.maximumChannelDelta) {
    return `The raw delivered difference reports maximum channel delta ${rawDifference.maximumChannelDelta}`
      + ` but its candidate pair carries ${maximumDelta}; it is not the same difference.`
  }
  return null
}

function maximumChangedChannelDelta(pixels: RestorationDifference['changedPixels']): number {
  let maximum = 0
  for (const pixel of pixels) {
    for (let channel = 0; channel < pixel.left.length; channel += 1) {
      maximum = Math.max(maximum, Math.abs(pixel.left[channel] - pixel.right[channel]))
    }
  }
  return maximum
}

/**
 * Every control capture must precede every candidate capture. A control taken at or after the
 * candidate's first capture shares the transient page state the gate exists to exclude, so it
 * cannot independently reproduce the candidate difference.
 */
function findControlAfterCandidate(
  candidate: RestorationDifference,
  control: RestorationDifference,
): string | null {
  const lastControl = Math.max(control.left.sequence, control.right.sequence)
  const firstCandidate = Math.min(candidate.left.sequence, candidate.right.sequence)
  if (lastControl >= firstCandidate) {
    return `A raw control capture at sequence ${lastControl} is at or after the candidate's first`
      + ` capture at sequence ${firstCandidate}; controls are captured before any candidate, so this`
      + ' control pair cannot independently reproduce the candidate difference.'
  }
  return null
}

/**
 * Both raw pairs must be well-formed evidence before any reproduction is read off them: named
 * captures with a capture order, and a pixel list that agrees with its own reported count, with one
 * value per listed position. Anything else is malformed evidence, not a reproduced difference.
 */
function checkReproductionPairShape(label: 'candidate' | 'control', pair: RestorationDifference): string | null {
  for (const capture of [pair.left, pair.right]) {
    if (!capture.label) return `The raw ${label} pair names a capture without a label.`
    if (!capture.path) return `The raw ${label} capture "${capture.label}" names no retained image.`
    if (!Number.isInteger(capture.sequence)) {
      return `The raw ${label} capture "${capture.label}" has no integer capture sequence.`
    }
  }
  if (pair.left.label === pair.right.label || pair.left.path === pair.right.path
    || pair.left.sequence === pair.right.sequence) {
    return `The raw ${label} pair compares "${pair.left.label}" with itself, which proves nothing;`
      + ' a difference needs two capture events.'
  }
  if (!Number.isInteger(pair.reportedChangedPixels) || pair.reportedChangedPixels < 0) {
    return `The raw ${label} pair reported no usable changed-pixel count.`
  }
  if (pair.reportedChangedPixels !== pair.changedPixels.length) {
    return `The raw ${label} pair reported ${pair.reportedChangedPixels} changed pixels but`
      + ` ${pair.changedPixels.length} were supplied; the remainder would have been charged to the`
      + ' gauge without evidence.'
  }
  const seen = new Set<string>()
  for (const pixel of pair.changedPixels) {
    if (!Number.isInteger(pixel.x) || !Number.isInteger(pixel.y)) {
      return `A raw ${label} changed pixel has no integer position.`
    }
    const key = `${pixel.x},${pixel.y}`
    if (seen.has(key)) return `The raw ${label} pair lists (${pixel.x}, ${pixel.y}) twice.`
    seen.add(key)
    if (sameRgba(pixel.left, pixel.right)) {
      return `The raw ${label} pixel at (${pixel.x}, ${pixel.y}) was listed as changed but holds one value.`
    }
  }
  return null
}

/**
 * The control pair must be two capture events the candidate pair never used. Reusing a candidate
 * capture as its own control would make the reproduction vacuous: the pair would reproduce itself.
 */
function findReusedRawCapture(
  candidate: RestorationDifference,
  control: RestorationDifference,
): { control: string; candidate: string; field: string } | null {
  for (const controlCapture of [control.left, control.right]) {
    for (const candidateCapture of [candidate.left, candidate.right]) {
      if (controlCapture.label === candidateCapture.label) {
        return { control: controlCapture.label, candidate: candidateCapture.label, field: 'same label' }
      }
      if (controlCapture.path === candidateCapture.path) {
        return {
          control: controlCapture.label,
          candidate: candidateCapture.label,
          field: 'same retained image path',
        }
      }
      if (controlCapture.sequence === candidateCapture.sequence) {
        return {
          control: controlCapture.label,
          candidate: candidateCapture.label,
          field: 'same capture sequence',
        }
      }
    }
  }
  return null
}

/**
 * The candidate's raw difference and the control difference must be the same set of positions
 * carrying the same pair of values. A transient pixel the controls never showed, a value the
 * controls showed differently, or a control difference with pixels of its own all refuse the whole
 * attribution; there is no partial credit.
 */
function findUnreproducedRawPixel(
  candidate: RestorationDifference,
  control: RestorationDifference,
): string | null {
  const controlPixels = new Map(control.changedPixels.map(pixel => [`${pixel.x},${pixel.y}`, pixel]))
  for (const pixel of candidate.changedPixels) {
    const match = controlPixels.get(`${pixel.x},${pixel.y}`)
    if (!match) {
      return `The raw candidate difference at (${pixel.x}, ${pixel.y}) is not in the independent control`
        + ' difference, so the controls did not reproduce it; a transient capture difference is never'
        + ' charged to the gauge.'
    }
    if (!sameRgba(match.left, pixel.left) || !sameRgba(match.right, pixel.right)) {
      return `The raw candidate difference at (${pixel.x}, ${pixel.y}) goes ${describeRgba(pixel.left)} to`
        + ` ${describeRgba(pixel.right)} while the controls go ${describeRgba(match.left)} to`
        + ` ${describeRgba(match.right)}, so it is not the same difference.`
    }
  }
  if (control.changedPixels.length !== candidate.changedPixels.length) {
    const extra = control.changedPixels.find(pixel =>
      !candidate.changedPixels.some(other => other.x === pixel.x && other.y === pixel.y))!
    return `The controls changed ${control.changedPixels.length} pixels against the candidate's`
      + ` ${candidate.changedPixels.length}, starting at (${extra.x}, ${extra.y}); the two differences`
      + ' are not the same.'
  }
  return null
}

function describeRgba(rgba: readonly number[]): string {
  return `rgba(${rgba.join(', ')})`
}

function sameRgba(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((channel, index) => channel === right[index])
}

function redact(text: string, token: string): { text: string; indices: number[] } {
  const indices: number[] = []
  let out = ''
  let cursor = 0
  while (cursor < text.length) {
    if (token && text.startsWith(token, cursor)) {
      indices.push(cursor)
      out += REDACTION
      cursor += token.length
      continue
    }
    out += text[cursor]
    cursor += 1
  }
  return { text: out, indices }
}

function sameNumbers(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}
