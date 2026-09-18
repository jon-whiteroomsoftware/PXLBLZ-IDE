import { describe, expect, it } from 'vitest'
import { stampArtifact } from '../engine/artifactStamp'
import { assessVisualPair } from './showEditorEquivalenceOracle'
import type { RasterNoiseClassification } from './showCaptureRasterNoiseClassifier'
import {
  formatDeliveredBytes,
  qualifySourceSizeException,
  qualifySourceSizeExceptionWithQualifiedCaptureNoise,
  reclassifyVisualPairWithSourceGaugeException,
  separateDeliveredMetadata,
  type GaugeElementEvidence,
  type GaugePlacement,
  type GaugeVariant,
  type GaugeVersionEvidence,
  type SourceGaugeExceptionInput,
} from './showSourceGaugeExceptionOracle'

/**
 * The approved #1065 exception, exercised with the plan's measured pair: 7,200 delivered bytes for
 * v1 and 7,408 for v2 over one identical program, against the pinned 68,384-byte budget the gauge
 * displays as "66.8 KB". Every case asks whether one specific wrong thing still passes.
 */

/** A measured pair with no differing pixel, and one with a real difference. */
const exact = { comparable: true as const, changedPixels: 0, maximumChannelDelta: 0 }
const measured = (changedPixels: number, maximumChannelDelta: number) => (
  { comparable: true as const, changedPixels, maximumChannelDelta }
)

const V1_BYTES = 7_200
const V2_BYTES = 7_408
const BUDGET_BYTES = 68_384
const BUDGET = { bytes: BUDGET_BYTES, provenance: 'measured artifact budget, #1065 corpus contract' }
const BUDGET_TOKEN = formatDeliveredBytes(BUDGET_BYTES)
const PROGRAM = 'export function render(index) {\n  hsv(index / pixelCount, 1, 1)\n}\n'
const TRACK_WIDTH_PX = 112

/**
 * Stands in for the CSSOM round-trip the harness performs against a detached element in the page.
 * Six decimals is deliberately lossier than a double, so the tests exercise a realistic serializer
 * rather than assuming the browser preserves the full float.
 */
function serializePercent(percent: number): string {
  return `${Number(percent.toFixed(6))}%`
}

describe('delivered artifact grammar', () => {
  it('separates the recognized metadata header from the program', () => {
    const parts = separateDeliveredMetadata(deliveredSource(V1_BYTES))
    expect(parts?.program).toBe(PROGRAM)
    expect(parts?.header.startsWith('/*')).toBe(true)
  })

  it('recovers the same program from both exporters despite different headers', () => {
    expect(separateDeliveredMetadata(deliveredSource(V1_BYTES))?.program)
      .toBe(separateDeliveredMetadata(deliveredSource(V2_BYTES, PROGRAM, 'v2 metadata header'))?.program)
  })

  it('refuses an arbitrary comment, including one carrying a false title marker', () => {
    expect(separateDeliveredMetadata(`/* handwritten */\n${PROGRAM}`)).toBeNull()
    const falseMarker = stampArtifact(`/*\n * Compiled PXLBLZ Show: not really\n */\n${PROGRAM}`, stampMeta())
    expect(separateDeliveredMetadata(falseMarker)).toBeNull()
    const missingRequired = stampArtifact(
      `/*\n * Compiled PXLBLZ Show: x\n * By: someone\n * Source Patterns:\n */\n${PROGRAM}`, stampMeta())
    expect(separateDeliveredMetadata(missingRequired)).toBeNull()
    const unterminated = stampArtifact(`/*\n * Compiled PXLBLZ Show: x\n * By: someone\n${PROGRAM}`, stampMeta())
    expect(separateDeliveredMetadata(unterminated)).toBeNull()
    expect(separateDeliveredMetadata(`/*\n * Compiled PXLBLZ Show: x\n * By: y\n */\n${PROGRAM}`)).toBeNull()
  })

  it('formats bytes by the rule the gauge must follow', () => {
    expect(formatDeliveredBytes(0)).toBe('0 B')
    expect(formatDeliveredBytes(1_023)).toBe('1023 B')
    expect(formatDeliveredBytes(V1_BYTES)).toBe('7.0 KB')
    expect(formatDeliveredBytes(V2_BYTES)).toBe('7.2 KB')
    expect(BUDGET_TOKEN).toBe('66.8 KB')
  })
})

describe('the approved source-size exception', () => {
  it('qualifies the measured pair when only the delivered value differs', () => {
    const assessment = qualifySourceSizeException(approvedInput())
    expect(assessment.reason).toBe('qualified')
    expect(assessment.qualified).toBe(true)
    expect(assessment.delivered?.v1.totalBytes).toBe(V1_BYTES)
    expect(assessment.delivered?.v2.totalBytes).toBe(V2_BYTES)
    expect(assessment.delivered?.v1.programBytes).toBe(assessment.delivered?.v2.programBytes)
    expect(assessment.budget).toEqual(BUDGET)
    expect(assessment.rawChangedPixels).toBe(94)
    expect(assessment.slotKeys).toEqual(['track:aria-label', 'readout:token-text-node', 'fill:inline-width'])
  })

  it('refuses without retained raw or counterfactual captures', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({ ...input, rawCapturePaths: [] }).reason).toBe('incomplete-evidence')
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, capturePaths: [] },
    }).reason).toBe('incomplete-evidence')
    expect(qualifySourceSizeException({
      ...input,
      v2: { ...input.v2, deliveredArtifact: { path: '', route: 'native exporter' } },
    }).reason).toBe('incomplete-evidence')
  })

  it('requires a pinned budget rather than one inferred from the displayed denominator', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({ ...input, budget: { bytes: BUDGET_BYTES, provenance: '' } }).reason)
      .toBe('budget-not-pinned')
    // 68,400 also displays as 66.8 KB, so only the pinned value distinguishes them.
    expect(formatDeliveredBytes(68_400)).toBe(BUDGET_TOKEN)
    expect(qualifySourceSizeException({ ...input, budget: { ...BUDGET, bytes: 68_400 } }).reason)
      .toBe('fill-not-value-derived')
    expect(qualifySourceSizeException({ ...input, budget: { ...BUDGET, bytes: 70_000 } }).reason)
      .toBe('budget-not-pinned')
  })

  it('refuses a byte count wrong by one byte, which the formatted text cannot show', () => {
    const input = approvedInput()
    const wrong = 7_409
    expect(formatDeliveredBytes(wrong)).toBe(formatDeliveredBytes(V2_BYTES))
    const misfilled = withAuthoredFill(input.v2, wrong)
    const assessment = qualifySourceSizeException({ ...input, v2: misfilled })
    expect(assessment.reason).toBe('fill-not-value-derived')
  })

  it('refuses a fill frozen at the other version value or scaled to another budget', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({ ...input, v2: withAuthoredFill(input.v2, V1_BYTES) }).reason)
      .toBe('fill-not-value-derived')
    const rescaled: GaugeVersionEvidence = {
      ...input.v2,
      canonicalInlineWidth: {
        percent: (V2_BYTES / (BUDGET_BYTES * 2)) * 100,
        serialized: serializePercent((V2_BYTES / (BUDGET_BYTES * 2)) * 100),
      },
      authoredInlineWidth: serializePercent((V2_BYTES / (BUDGET_BYTES * 2)) * 100),
    }
    expect(qualifySourceSizeException({ ...input, v2: rescaled }).reason).toBe('fill-not-value-derived')
  })

  it('refuses a canonicalization that does not match what the page authored', () => {
    const input = approvedInput()
    const mismatched: GaugeVersionEvidence = { ...input.v2, authoredInlineWidth: '10.8%' }
    expect(qualifySourceSizeException({ ...input, v2: mismatched }).reason).toBe('fill-not-value-derived')
  })

  it('refuses a gauge value the delivered artifact does not support', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({ ...input, v2: withDisplayedToken(input.v2, '7.2 KB', '7.4 KB') }).reason)
      .toBe('delivered-value-not-truthful')
  })

  it('refuses a stale byte figure even when both versions show the same wrong one', () => {
    const input = approvedInput()
    const stale = (evidence: GaugeVersionEvidence) =>
      withElement(evidence, 'vm', element => ({ ...element, textNodes: ['Peak 6.0 KB'] }))
    expect(qualifySourceSizeException({ ...input, v1: stale(input.v1), v2: stale(input.v2) }).reason)
      .toBe('delivered-value-not-truthful')
  })

  it('refuses an extra numeric slot outside the fixed ones', () => {
    const input = approvedInput()
    const extra = (evidence: GaugeVersionEvidence, token: string) =>
      withElement(evidence, 'copies', element => ({ ...element, textNodes: [`spare ${token}`] }))
    const assessment = qualifySourceSizeException({
      ...input,
      v1: extra(input.v1, '7.0 KB'),
      v2: extra(input.v2, '7.2 KB'),
    })
    expect(assessment.qualified).toBe(false)
    expect(assessment.detail).toContain('not a byte-value slot')
  })

  it('refuses a v2 that grew the program while shrinking its header to the same total', () => {
    const input = approvedInput()
    const grown = `${PROGRAM}// one more generated line\n`
    expect(qualifySourceSizeException({
      ...input,
      v2: { ...input.v2, deliveredEpeText: deliveredEpe(V2_BYTES, grown, 'v2 metadata header') },
    }).reason).toBe('delivered-program-differs')
  })

  it('refuses a value whose token length changed rather than absorbing the shift', () => {
    const bytes = 10_400
    const input = approvedInput()
    const wider = withAuthoredFill(
      withDisplayedToken(
        { ...input.v2, deliveredEpeText: deliveredEpe(bytes, PROGRAM, 'v2 metadata header') },
        '7.2 KB',
        formatDeliveredBytes(bytes),
      ),
      bytes,
    )
    expect(qualifySourceSizeException({ ...input, v2: wider }).reason).toBe('token-length-differs')
  })

  it('refuses any computed style difference, not just typography', () => {
    const input = approvedInput()
    for (const [role, property, value] of [
      ['fill', 'background-color', 'rgb(251, 191, 36)'],
      ['readout', 'font-size', '11px'],
      ['readout', 'padding-left', '4px'],
      ['track', 'border-top-width', '1px'],
      ['track', 'border-radius', '4px'],
      ['readout', 'text-decoration-color', 'rgb(255, 0, 0)'],
      ['copies', 'letter-spacing', '0.4px'],
    ] as const) {
      const assessment = qualifySourceSizeException({
        ...input,
        v2: withElement(input.v2, role, element => ({
          ...element,
          computedStyle: { ...element.computedStyle, [property]: value },
        })),
      })
      expect(assessment.reason).toBe('presentation-differs')
      expect(assessment.detail).toContain(property)
    }
  })

  it('refuses a retyped, reclassed or re-laid-out gauge', () => {
    const input = approvedInput()
    for (const mutation of [
      (evidence: GaugeVersionEvidence) => withElement(evidence, 'track', element => ({
        ...element, classList: `${element.classList} w-32`,
      })),
      (evidence: GaugeVersionEvidence) => withElement(evidence, 'readout', element => ({ ...element, tag: 'div' })),
      (evidence: GaugeVersionEvidence) => withElement(evidence, 'track', element => ({
        ...element, rect: { ...element.rect, y: element.rect.y + 1 },
      })),
      (evidence: GaugeVersionEvidence) => withElement(evidence, 'readout', element => ({
        ...element, rect: { ...element.rect, width: element.rect.width + 1 },
      })),
      (evidence: GaugeVersionEvidence) => withElement(evidence, 'readout', element => ({
        ...element, childNodeCount: element.childNodeCount + 1,
      })),
    ]) {
      expect(qualifySourceSizeException({ ...input, v2: mutation(input.v2) }).reason).toBe('presentation-differs')
    }
  })

  it('refuses an unrelated neighbouring diagnostic that also changed', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      v2: withElement(input.v2, 'vm', element => ({ ...element, textNodes: ['VM 6,014/8,192 words'] })),
    }).reason).toBe('presentation-differs')
    expect(qualifySourceSizeException({
      ...input,
      v2: withElement(input.v2, 'copies', element => ({ ...element, textNodes: ['up to 3 copies'] })),
    }).reason).toBe('presentation-differs')
  })

  it('exempts nothing once the values are normalized', () => {
    const input = approvedInput()
    const drifted: GaugeVersionEvidence = {
      ...input.v2,
      normalized: input.v2.normalized.map(element => (element.role === 'fill'
        ? { ...element, rect: { ...element.rect, width: element.rect.width + 2 } }
        : element)),
    }
    expect(qualifySourceSizeException({ ...input, v2: drifted }).reason).toBe('presentation-differs')
  })

  it('refuses normalization that changed anything but the two mutated slots', () => {
    const input = approvedInput()
    // Applied to both versions, so the normalized surfaces still agree and only the drift check
    // can catch that the mutation itself moved something.
    const restyle = (evidence: GaugeVersionEvidence): GaugeVersionEvidence => ({
      ...evidence,
      normalized: evidence.normalized.map(element => (element.role === 'readout'
        ? { ...element, computedStyle: { ...element.computedStyle, color: 'rgb(255, 255, 255)' } }
        : element)),
    })
    expect(qualifySourceSizeException({ ...input, v1: restyle(input.v1), v2: restyle(input.v2) }).reason)
      .toBe('normalization-changed-more-than-values')

    // Writing textContent instead of the text node would drop the sibling nodes.
    const replaceChildren = (evidence: GaugeVersionEvidence): GaugeVersionEvidence => ({
      ...evidence,
      normalized: evidence.normalized.map(element => (element.role === 'readout'
        ? { ...element, textNodes: [input.counterfactual.commonToken], childNodeCount: 1 }
        : element)),
    })
    expect(qualifySourceSizeException({
      ...input, v1: replaceChildren(input.v1), v2: replaceChildren(input.v2),
    }).reason).toBe('normalization-changed-more-than-values')

    // aria-label and title are verified but never mutated.
    const normalizeLabels = (evidence: GaugeVersionEvidence): GaugeVersionEvidence => ({
      ...evidence,
      normalized: evidence.normalized.map(element => (element.role === 'track'
        ? {
          ...element,
          attributes: Object.fromEntries(Object.entries(element.attributes)
            .map(([key, value]) => [key, value.split(formatDeliveredBytes(V2_BYTES))
              .join(input.counterfactual.commonToken)])),
        }
        : element)),
    })
    // Caught by the normalized comparison: the labels are still expected to carry each version's
    // own verified value, so a normalized label is a difference rather than an equalization.
    const normalized = qualifySourceSizeException({ ...input, v2: normalizeLabels(input.v2) })
    expect(normalized.qualified).toBe(false)
    expect(['presentation-differs', 'normalization-changed-more-than-values']).toContain(normalized.reason)
  })

  it('compares the fill style attribute declaration by declaration', () => {
    const input = approvedInput()
    // The authored width legitimately differs and is proved separately; nothing else may.
    expect(qualifySourceSizeException(input).reason).toBe('qualified')

    const extraDeclaration = qualifySourceSizeException({
      ...input,
      v2: withElement(input.v2, 'fill', element => ({
        ...element,
        attributes: { style: `${element.attributes.style} opacity: 0.5;` },
      })),
    })
    expect(extraDeclaration.reason).toBe('presentation-differs')
    expect(extraDeclaration.detail).toContain('opacity')

    const otherElement = qualifySourceSizeException({
      ...input,
      v2: withElement(input.v2, 'readout', element => ({
        ...element,
        attributes: { ...element.attributes, style: 'letter-spacing: 1px;' },
      })),
    })
    expect(otherElement.reason).toBe('presentation-differs')
  })

  it('refuses a style attribute that the harness omitted', () => {
    const input = approvedInput()
    const stripped = (evidence: GaugeVersionEvidence) =>
      withElement(evidence, 'fill', element => ({ ...element, attributes: {} }))
    expect(qualifySourceSizeException({ ...input, v1: stripped(input.v1), v2: stripped(input.v2) }).reason)
      .toBe('incomplete-evidence')
  })

  it('refuses an authored width that disagrees with the fill style attribute', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      v2: withElement(input.v2, 'fill', element => ({ ...element, attributes: { style: 'width: 9%;' } })),
    }).reason).toBe('fill-not-value-derived')
  })

  it('exempts no style width once the values are normalized', () => {
    const input = approvedInput()
    const drifted: GaugeVersionEvidence = {
      ...input.v2,
      normalized: input.v2.normalized.map(element => (element.role === 'fill'
        ? { ...element, attributes: { style: 'width: 12%;' } }
        : element)),
    }
    expect(qualifySourceSizeException({ ...input, v2: drifted }).reason).toBe('presentation-differs')
  })

  it('allows the fill to normalize when two byte counts round to the same token', () => {
    // 7,200 and 7,210 both display as "7.0 KB" while authoring different widths. The allowance for
    // the fill must come from the widths actually differing, never from the rounded text.
    const nearby = 7_210
    expect(formatDeliveredBytes(nearby)).toBe(formatDeliveredBytes(V1_BYTES))
    const commonToken = formatDeliveredBytes(V1_BYTES)
    const commonInlineWidth = serializePercent((V1_BYTES / BUDGET_BYTES) * 100)
    const input: SourceGaugeExceptionInput = {
      ...approvedInput(),
      v2: versionEvidence(nearby, 'v2 metadata header', commonToken, commonInlineWidth, 'portal'),
    }
    const assessment = qualifySourceSizeException(input)
    expect(assessment.delivered?.v1.token).toBe(assessment.delivered?.v2.token)
    expect(assessment.delivered?.v2.totalBytes).toBe(nearby)
    expect(assessment.reason).toBe('qualified')
  })

  it('refuses pseudo-element styles that changed during normalization', () => {
    const input = approvedInput()
    const drift = (evidence: GaugeVersionEvidence): GaugeVersionEvidence => ({
      ...evidence,
      normalized: evidence.normalized.map(element => (element.role === 'track'
        ? { ...element, pseudoStyle: { '::before': { ...element.pseudoStyle['::before'], content: '"x"' } } }
        : element)),
    })
    expect(qualifySourceSizeException({ ...input, v1: drift(input.v1), v2: drift(input.v2) }).reason)
      .toBe('normalization-changed-more-than-values')
  })

  it('refuses a generated pseudo-element that differs', () => {
    const input = approvedInput()
    const assessment = qualifySourceSizeException({
      ...input,
      v2: withElement(input.v2, 'track', element => ({
        ...element,
        pseudoStyle: { '::before': { ...element.pseudoStyle['::before'], content: '"!"' } },
      })),
    })
    expect(assessment.reason).toBe('presentation-differs')
    expect(assessment.detail).toContain('::before')
  })

  it('refuses a shrunken computed-style collection', () => {
    const input = approvedInput()
    const thin = (evidence: GaugeVersionEvidence): GaugeVersionEvidence => ({
      ...evidence,
      raw: evidence.raw.map(element => ({ ...element, computedStyle: { color: element.computedStyle.color } })),
    })
    expect(qualifySourceSizeException({ ...input, v1: thin(input.v1), v2: thin(input.v2) }).reason)
      .toBe('incomplete-evidence')
  })

  it('refuses when pixels still differ once the byte values agree', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, counterfactual: measured(12, 40) },
    }).reason).toBe('counterfactual-not-exact')
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, counterfactual: measured(0, 3) },
    }).reason).toBe('counterfactual-not-exact')
  })

  it('refuses an unstable normalized surface and a failed restore', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, repeat: { v1: exact, v2: measured(5, 1) } },
    }).reason).toBe('counterfactual-not-exact')
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, restored: { v1: exact, v2: measured(7, 1) } },
    }).reason).toBe('counterfactual-not-exact')
  })

  it('refuses a counterfactual normalized to a value neither version delivered', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, commonToken: '7.1 KB' },
    }).reason).toBe('counterfactual-not-exact')
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, commonInlineWidth: '11%' },
    }).reason).toBe('counterfactual-not-exact')
  })

  it('refuses an unreadable delivered artifact instead of trusting the gauge', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      v2: { ...input.v2, deliveredEpeText: '{ not json' },
    }).reason).toBe('delivered-artifact-unreadable')
  })

  it('accepts the portal gauge the canonical run captures, which has no title', () => {
    const portal = qualifySourceSizeException(approvedInput('portal'))
    expect(portal.reason).toBe('qualified')
    expect(portal.slotKeys).toEqual(['track:aria-label', 'readout:token-text-node', 'fill:inline-width'])

    const compileBar = qualifySourceSizeException(approvedInput('compile-bar'))
    expect(compileBar.reason).toBe('qualified')
    expect(compileBar.slotKeys).toContain('track:title')
  })

  it('refuses a label attribute that appears on only one version', () => {
    const input = approvedInput('portal')
    const withTitle = withElement(input.v2, 'track', element => ({
      ...element,
      attributes: { ...element.attributes, title: element.attributes['aria-label'] },
    }))
    expect(qualifySourceSizeException({ ...input, v2: withTitle }).qualified).toBe(false)
  })

  it('refuses a title both versions grew that the portal variant does not slot', () => {
    const input = approvedInput('portal')
    const addTitle = (evidence: GaugeVersionEvidence) => withElement(evidence, 'track', element => ({
      ...element,
      attributes: { ...element.attributes, title: element.attributes['aria-label'] },
    }))
    const assessment = qualifySourceSizeException({
      ...input, v1: addTitle(input.v1), v2: addTitle(input.v2),
    })
    expect(assessment.reason).toBe('presentation-differs')
  })

  it('refuses the compile-bar variant when its title is missing', () => {
    const input = approvedInput('compile-bar')
    const stripped = (evidence: GaugeVersionEvidence) => withElement(evidence, 'track', element => ({
      ...element,
      attributes: { 'aria-label': element.attributes['aria-label'] },
    }))
    expect(qualifySourceSizeException({ ...input, v1: stripped(input.v1), v2: stripped(input.v2) }).reason)
      .toBe('unexpected-structure')
  })

  it('refuses a gauge whose structure is not the one the slots are defined against', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException({
      ...input,
      v2: { ...input.v2, raw: input.v2.raw.filter(element => element.role !== 'fill') },
    }).reason).toBe('unexpected-structure')
    expect(qualifySourceSizeException({
      ...input,
      v1: withElement(input.v1, 'track', element => ({ ...element, attributes: {} })),
      v2: withElement(input.v2, 'track', element => ({ ...element, attributes: {} })),
    }).reason).toBe('unexpected-structure')
  })
})

describe('reclassifying a visual pair', () => {
  const surface = 'whole-editor'
  const box = { present: true, x: 0, y: 0, width: 1440, height: 1000 }

  it('clears a pixels-differ verdict only for a qualified exception on the same surface', () => {
    const assessment = assessVisualPair({ surface, v1: box, v2: box, changedPixels: 94, maximumChannelDelta: 137 })
    expect(assessment.reason).toBe('pixels-differ')
    const exception = qualifySourceSizeException({ ...approvedInput(), surface })
    expect(reclassifyVisualPairWithSourceGaugeException(assessment, exception).equivalent).toBe(true)
    expect(reclassifyVisualPairWithSourceGaugeException(assessment, { ...exception, surface: 'timeline' }).equivalent)
      .toBe(false)
    expect(reclassifyVisualPairWithSourceGaugeException(assessment, {
      ...exception, qualified: false, reason: 'presentation-differs',
    }).equivalent).toBe(false)
  })

  it('never clears a missing surface, changed dimensions or changed position', () => {
    const exception = qualifySourceSizeException({ ...approvedInput(), surface })
    for (const failing of [
      assessVisualPair({ surface, v1: { present: false }, v2: box, changedPixels: 0, maximumChannelDelta: 0 }),
      assessVisualPair({ surface, v1: box, v2: { ...box, height: 999 }, changedPixels: 0, maximumChannelDelta: 0 }),
      assessVisualPair({ surface, v1: box, v2: { ...box, x: 1 }, changedPixels: 0, maximumChannelDelta: 0 }),
    ]) {
      expect(reclassifyVisualPairWithSourceGaugeException(failing, exception).equivalent).toBe(false)
    }
  })
})

describe('qualifying a residual through demonstrated capture noise', () => {
  /**
   * The gauge's own value proof is unchanged and still runs first. The only thing this wrapper can
   * ever forgive is a residual pixel count in the counterfactual, repeat or restoration comparisons,
   * and only on a classification that explained every one of those pixels.
   */
  const withResidual = (): SourceGaugeExceptionInput => ({
    ...approvedInput(),
    counterfactual: { ...approvedInput().counterfactual, restored: { v1: exact, v2: measured(6, 1) } },
  })

  function classification(
    measurement: string,
    changed: number,
    overrides: Partial<RasterNoiseClassification> = {},
  ): { measurement: string; classification: RasterNoiseClassification } {
    return {
      measurement,
      classification: {
        comparison: `${measurement} delivered vs restored`,
        classified: true,
        reason: 'classified',
        detail: 'every changed pixel was observed in one unchanged control group',
        changedPixels: changed,
        reportedChangedPixels: changed,
        classifiedPixels: Array.from({ length: changed }, (_, index) => ({
          x: 366 + index, y: 256, left: [29, 29, 34, 255] as const, right: [29, 29, 33, 255] as const,
          canvasBacked: false, reason: 'observed-in-one-control-group' as const,
          qualifyingGroup: 'v2-delivered', qualifiedBy: ['restored-control-a', 'restored-control-b'],
        })),
        residualPixels: [],
        controlGroups: [],
        evidence: [],
        ...overrides,
      },
    }
  }

  it('requires no classification at all when the strict assessment already qualifies', () => {
    const result = qualifySourceSizeExceptionWithQualifiedCaptureNoise(approvedInput(), [])
    expect(result.qualified).toBe(true)
    expect(result.reason).toBe('qualified')
    expect(result.strict.qualified).toBe(true)
    expect(result.captureNoise.required).toEqual([])
  })

  it('qualifies a restoration residual that was fully classified, keeping the strict refusal intact', () => {
    const result = qualifySourceSizeExceptionWithQualifiedCaptureNoise(withResidual(), [classification('restored-v2', 6)])
    expect(result.qualified).toBe(true)
    expect(result.reason).toBe('qualified-with-classified-capture-noise')
    expect(result.strict.qualified).toBe(false)
    expect(result.strict.reason).toBe('counterfactual-not-exact')
    expect(result.strict.detail).toContain('v2 6 pixels')
    expect(result.strict.evidencePaths.length).toBeGreaterThan(0)
    expect(result.captureNoise.required).toEqual([{ measurement: 'restored-v2', changedPixels: 6 }])
    expect(result.captureNoise.applied[0].classified).toBe(true)
  })

  it('leaves the strict refusal standing when a required measurement has no classification', () => {
    const result = qualifySourceSizeExceptionWithQualifiedCaptureNoise(withResidual(), [])
    expect(result.qualified).toBe(false)
    expect(result.reason).toBe('counterfactual-not-exact')
    expect(result.captureNoise.detail).toContain('restored-v2')
  })

  it('refuses a classification that left a residual pixel, or covered fewer than the comparison found', () => {
    const residual = classification('restored-v2', 6, {
      classified: false,
      reason: 'pixel-not-classified',
      residualPixels: [{
        x: 371, y: 257, left: [36, 36, 41, 255], right: [35, 35, 40, 255], canvasBacked: false,
        reason: 'variant-not-observed', qualifyingGroup: null, qualifiedBy: [],
      }],
    })
    expect(qualifySourceSizeExceptionWithQualifiedCaptureNoise(withResidual(), [residual]).qualified).toBe(false)
    expect(qualifySourceSizeExceptionWithQualifiedCaptureNoise(withResidual(), [classification('restored-v2', 5)]).qualified)
      .toBe(false)
  })

  it('refuses a classification of some other comparison', () => {
    const wrong = qualifySourceSizeExceptionWithQualifiedCaptureNoise(withResidual(), [classification('repeat-v2', 6)])
    expect(wrong.qualified).toBe(false)
    expect(wrong.reason).toBe('counterfactual-not-exact')
  })

  it('requires every non-zero measurement, not just one of them', () => {
    const both: SourceGaugeExceptionInput = {
      ...approvedInput(),
      counterfactual: {
        ...approvedInput().counterfactual,
        counterfactual: measured(2, 1), restored: { v1: exact, v2: measured(6, 1) },
      },
    }
    expect(qualifySourceSizeExceptionWithQualifiedCaptureNoise(both, [classification('restored-v2', 6)]).qualified)
      .toBe(false)
    expect(qualifySourceSizeExceptionWithQualifiedCaptureNoise(both, [
      classification('restored-v2', 6), classification('counterfactual', 2),
    ]).qualified).toBe(true)
  })

  it('never reaches the classifier when the gauge value proof itself failed', () => {
    const everything = [
      classification('counterfactual', 2), classification('repeat-v1', 2), classification('repeat-v2', 2),
      classification('restored-v1', 2), classification('restored-v2', 6),
    ]
    const wrongFill = { ...withResidual(), v1: withAuthoredFill(withResidual().v1, V1_BYTES + 1) }
    const missingArtifact = {
      ...withResidual(),
      v1: { ...withResidual().v1, deliveredArtifact: { path: '', route: 'in-page rebuild' } },
    }
    const movedSlot = {
      ...withResidual(),
      v2: withElement(withResidual().v2, 'readout', element => ({ ...element, tag: 'div' })),
    }
    const craftedCommonValue = {
      ...withResidual(),
      counterfactual: { ...withResidual().counterfactual, commonToken: '9.9 KB' },
    }
    for (const [name, input] of Object.entries({ wrongFill, missingArtifact, movedSlot, craftedCommonValue })) {
      const result = qualifySourceSizeExceptionWithQualifiedCaptureNoise(input, everything)
      expect(result.qualified, name).toBe(false)
      expect(result.captureNoise.applied, name).toEqual([])
    }
  })

  it('clears a visual pair through the ordinary reclassification once it is noise-qualified', () => {
    const box = { present: true, x: 0, y: 0, width: 1440, height: 1000 }
    const assessment = assessVisualPair({
      surface: 'whole-editor', v1: box, v2: box, changedPixels: 94, maximumChannelDelta: 137,
    })
    const qualified = qualifySourceSizeExceptionWithQualifiedCaptureNoise(withResidual(), [classification('restored-v2', 6)])
    expect(reclassifyVisualPairWithSourceGaugeException(assessment, qualified).equivalent).toBe(true)
  })
})

describe('gauge placement (#1065, Jon 2026-09-18)', () => {
  /**
   * The approved extension. The gauge is not in the captured surface at all: it sits behind a
   * translucent, backdrop-filtered panel, so its value reaches the capture attenuated and spread
   * instead of drawn. Jon approved this on 2026-09-18 under the same proof standard, so nothing
   * here is weaker than the `inside` case - only the placement evidence differs.
   */
  const SURFACE_BOX = { x: 8, y: 227.578125, width: 374, height: 488 }
  const OVER_SURFACE = { x: 131.546875, y: 491.4375, width: 120, height: 8 }

  const behind = (placement: Partial<Extract<GaugePlacement, { kind: 'behind' }>> = {}): GaugePlacement => ({
    kind: 'behind', surfaceBox: SURFACE_BOX, trackBox: OVER_SURFACE, ...placement,
  })

  it('qualifies a gauge behind the surface on the same evidence as one inside it', () => {
    const input = approvedInput()
    const inside = qualifySourceSizeException(input)
    const assessment = qualifySourceSizeException({ ...input, placement: behind() })

    expect(inside.qualified).toBe(true)
    expect(assessment.qualified).toBe(true)
    expect(assessment.reason).toBe('qualified')
    // The placement is reported, because "the gauge is behind this surface" is a different claim
    // from "the gauge is in it" and a reader must be able to tell them apart.
    expect(assessment.placement).toEqual(behind())
    expect(inside.placement).toEqual({ kind: 'inside' })
  })

  it('refuses a gauge behind the surface whose counterfactual is not exactly zero', () => {
    const input = { ...approvedInput(), placement: behind() }
    for (const counterfactual of [
      { counterfactual: measured(1, 1) },
      { counterfactual: measured(0, 1) },
    ]) {
      expect(qualifySourceSizeException({
        ...input,
        counterfactual: { ...input.counterfactual, ...counterfactual },
      }).reason).toBe('counterfactual-not-exact')
    }
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, restored: { v1: exact, v2: measured(6, 1) } },
    }).reason).toBe('counterfactual-not-exact')
    expect(qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, repeat: { v1: exact, v2: measured(2, 1) } },
    }).reason).toBe('counterfactual-not-exact')
  })

  it('refuses a gauge that does not lie over the captured surface at all', () => {
    const input = approvedInput()
    // Clear of the surface on one axis is enough: a gauge that cannot paint into the capture cannot
    // explain a pixel in it, whatever its counterfactual says.
    for (const trackBox of [
      { x: 131.546875, y: 900, width: 120, height: 8 },
      { x: 400, y: 491.4375, width: 120, height: 8 },
      { x: 131.546875, y: 491.4375, width: 0, height: 8 },
    ]) {
      const assessment = qualifySourceSizeException({ ...input, placement: behind({ trackBox }) })
      expect(assessment.qualified).toBe(false)
      expect(assessment.reason).toBe('gauge-not-over-surface')
    }
  })

  it('carries the placement through the capture-noise wrapper', () => {
    const input = {
      ...approvedInput(),
      placement: behind(),
      counterfactual: {
        ...approvedInput().counterfactual,
        restored: { v1: exact, v2: measured(6, 1) },
      },
    }
    const refused = qualifySourceSizeExceptionWithQualifiedCaptureNoise(input, [])

    expect(refused.qualified).toBe(false)
    expect(refused.placement).toEqual(behind())
    expect(refused.strict.placement).toEqual(behind())
  })
})

describe('non-comparable capture measurements (#1065)', () => {
  /**
   * A pair of captures that could not be compared at all - different pixel dimensions, so there is
   * no per-position difference to speak of - carries no changed-pixel count. Reading that absence as
   * zero would let the "counterfactual must be exactly zero" gate pass on a counterfactual that was
   * never measured, which is the one thing it exists to prevent.
   */
  const notMeasured = { comparable: false as const, detail: 'Captures are 374x488 and 374x489.' }

  it('refuses a counterfactual that could not be measured, rather than reading it as zero', () => {
    const input = approvedInput()
    expect(qualifySourceSizeException(input).qualified).toBe(true)

    const assessment = qualifySourceSizeException({
      ...input,
      counterfactual: { ...input.counterfactual, counterfactual: notMeasured },
    })
    expect(assessment.qualified).toBe(false)
    expect(assessment.reason).toBe('counterfactual-not-measured')
    expect(assessment.detail).toContain('374x489')
  })

  it('refuses every repeat and restoration pair that could not be measured', () => {
    const input = approvedInput()
    for (const counterfactual of [
      { repeat: { v1: notMeasured, v2: input.counterfactual.repeat.v2 } },
      { repeat: { v1: input.counterfactual.repeat.v1, v2: notMeasured } },
      { restored: { v1: notMeasured, v2: input.counterfactual.restored.v2 } },
      { restored: { v1: input.counterfactual.restored.v1, v2: notMeasured } },
    ]) {
      const assessment = qualifySourceSizeException({
        ...input,
        counterfactual: { ...input.counterfactual, ...counterfactual },
      })
      expect(assessment.qualified).toBe(false)
      expect(assessment.reason).toBe('counterfactual-not-measured')
    }
  })

  it('cannot be rescued by a capture-noise classification', () => {
    // A classification speaks for the pixels a measurement reported. An unmeasured pair reported
    // none, so there is nothing for a classification to cover and nothing it can excuse.
    const input = {
      ...approvedInput(),
      counterfactual: { ...approvedInput().counterfactual, restored: { v1: approvedInput().counterfactual.restored.v1, v2: notMeasured } },
    }
    const assessment = qualifySourceSizeExceptionWithQualifiedCaptureNoise(input, [{
      measurement: 'restored-v2',
      classification: {
        comparison: 'v2 delivered vs restored',
        classified: true,
        reason: 'classified',
        detail: 'every changed pixel was observed in one unchanged control group',
        changedPixels: 6,
        reportedChangedPixels: 6,
        classifiedPixels: [],
        residualPixels: [],
        controlGroups: [],
        evidence: [],
      } as unknown as RasterNoiseClassification,
    }])

    expect(assessment.qualified).toBe(false)
    expect(assessment.reason).toBe('counterfactual-not-measured')
    expect(assessment.captureNoise.required.map(entry => entry.measurement)).not.toContain('restored-v2')
    expect(assessment.captureNoise.applied).toEqual([])
  })
})

function approvedInput(variant: GaugeVariant = 'portal'): SourceGaugeExceptionInput {
  const commonToken = formatDeliveredBytes(V1_BYTES)
  const commonInlineWidth = serializePercent((V1_BYTES / BUDGET_BYTES) * 100)
  return {
    surface: 'whole-editor',
    variant,
    placement: { kind: 'inside' },
    budget: BUDGET,
    v1: versionEvidence(V1_BYTES, 'v1 metadata header', commonToken, commonInlineWidth, variant),
    v2: versionEvidence(V2_BYTES, 'v2 metadata header', commonToken, commonInlineWidth, variant),
    rawCapturePaths: [
      '/tmp/pxlblz-show-editor-equivalence/run/whole-editor-v1.png',
      '/tmp/pxlblz-show-editor-equivalence/run/whole-editor-v2.png',
      '/tmp/pxlblz-show-editor-equivalence/run/whole-editor-raw-diff.json',
    ],
    rawDifference: measured(94, 204),
    counterfactual: {
      commonToken,
      commonInlineWidth,
      counterfactual: exact,
      repeat: { v1: exact, v2: exact },
      restored: { v1: exact, v2: exact },
      capturePaths: [
        '/tmp/pxlblz-show-editor-equivalence/run/whole-editor-v1-normalized.png',
        '/tmp/pxlblz-show-editor-equivalence/run/whole-editor-v2-normalized.png',
        '/tmp/pxlblz-show-editor-equivalence/run/whole-editor-v1-restored.png',
      ],
    },
  }
}

function versionEvidence(
  bytes: number,
  headerMarker: string,
  commonToken: string,
  commonInlineWidth: string,
  variant: GaugeVariant,
): GaugeVersionEvidence {
  const percent = (bytes / BUDGET_BYTES) * 100
  const token = formatDeliveredBytes(bytes)
  return {
    deliveredEpeText: deliveredEpe(bytes, PROGRAM, headerMarker),
    deliveredArtifact: {
      path: `/tmp/pxlblz-show-editor-equivalence/run/${headerMarker.split(' ')[0]}.epe`,
      route: 'native exporter artifact, reopened through parseEpe',
    },
    raw: gaugeElements({ labelToken: token, readoutToken: token, inlineWidth: serializePercent(percent), variant }),
    // aria-label and title keep this version's own value: the counterfactual never mutates them.
    normalized: gaugeElements({ labelToken: token, readoutToken: commonToken, inlineWidth: commonInlineWidth, variant }),
    authoredInlineWidth: serializePercent(percent),
    canonicalInlineWidth: { percent, serialized: serializePercent(percent) },
    budgetToken: BUDGET_TOKEN,
  }
}

function gaugeElements(
  { labelToken, readoutToken, inlineWidth, variant }:
  { labelToken: string; readoutToken: string; inlineWidth: string; variant: GaugeVariant },
): GaugeElementEvidence[] {
  const label = `Show source ${labelToken} / ${BUDGET_TOKEN} advisory.`
  const token = readoutToken
  // The portal gauge that the canonical browser run captures labels itself with aria-label only.
  const trackAttributes: Record<string, string> = variant === 'portal'
    ? { 'aria-label': label }
    : { 'aria-label': label, title: label }
  const fillWidthPx = Math.round((Number(inlineWidth.slice(0, -1)) / 100) * TRACK_WIDTH_PX * 64) / 64
  return [
    {
      role: 'track',
      tag: 'span',
      classList: variant === 'portal' ? 'show-source-thermometer' : 'h-2 w-28 overflow-hidden rounded-sm bg-zinc-800',
      attributes: trackAttributes,
      textNodes: [],
      childNodeCount: 1,
      pseudoStyle: { '::before': computedStyle({ content: '""' }) },
      computedStyle: computedStyle({
        'background-color': 'rgb(39, 39, 42)',
        'border-radius': '2px',
        width: `${TRACK_WIDTH_PX}px`,
        'inline-size': `${TRACK_WIDTH_PX}px`,
        height: '8px',
      }),
      rect: { x: 50, y: 198, width: TRACK_WIDTH_PX, height: 8 },
    },
    {
      role: 'fill',
      tag: 'span',
      classList: variant === 'portal' ? 'bg-live' : 'block h-full bg-live',
      // The real element carries style="width: ...%;"; the harness collects it verbatim.
      attributes: { style: `width: ${inlineWidth};` },
      textNodes: [],
      childNodeCount: 0,
      pseudoStyle: {},
      computedStyle: computedStyle({
        'background-color': 'rgb(74, 222, 128)',
        width: `${fillWidthPx}px`,
        'inline-size': `${fillWidthPx}px`,
        'transform-origin': `${fillWidthPx / 2}px 4px`,
        height: '8px',
      }),
      rect: { x: 50, y: 198, width: fillWidthPx, height: 8 },
    },
    {
      role: 'readout',
      tag: 'span',
      classList: 'font-mono',
      attributes: {},
      textNodes: [token, ' / ', BUDGET_TOKEN],
      childNodeCount: 3,
      pseudoStyle: {},
      computedStyle: computedStyle({}),
      rect: { x: 180, y: 200, width: 96, height: 12 },
    },
    {
      role: 'vm',
      tag: 'span',
      classList: 'font-mono',
      attributes: {},
      textNodes: ['VM 6,012/8,192 words'],
      childNodeCount: 1,
      pseudoStyle: {},
      computedStyle: computedStyle({}),
      rect: { x: 300, y: 200, width: 120, height: 12 },
    },
    {
      role: 'copies',
      tag: 'span',
      classList: 'font-mono',
      attributes: {},
      textNodes: ['up to 2 copies'],
      childNodeCount: 1,
      pseudoStyle: {},
      computedStyle: computedStyle({}),
      rect: { x: 440, y: 200, width: 84, height: 12 },
    },
  ]
}

/** Stands in for the full property set `getComputedStyle` enumerates. */
function computedStyle(overrides: Record<string, string>): Record<string, string> {
  return {
    display: 'inline-block',
    position: 'static',
    'box-sizing': 'border-box',
    width: 'auto',
    'inline-size': 'auto',
    height: 'auto',
    'transform-origin': '0px 0px',
    'perspective-origin': '0px 0px',
    'margin-top': '0px',
    'padding-left': '0px',
    'border-top-width': '0px',
    'border-radius': '0px',
    'background-color': 'rgba(0, 0, 0, 0)',
    color: 'rgb(113, 113, 122)',
    opacity: '1',
    overflow: 'visible',
    'font-family': 'ui-monospace',
    'font-size': '10px',
    'font-weight': '400',
    'font-style': 'normal',
    'letter-spacing': 'normal',
    'line-height': '12px',
    'text-transform': 'none',
    'text-decoration-color': 'rgb(113, 113, 122)',
    'white-space': 'nowrap',
    ...overrides,
  }
}

/** Changes what the gauge displays without touching the delivered artifact it should describe. */
function withDisplayedToken(evidence: GaugeVersionEvidence, from: string, to: string): GaugeVersionEvidence {
  const swap = (value: string) => value.split(from).join(to)
  const rewrite = (elements: readonly GaugeElementEvidence[]) => elements.map(element => ({
    ...element,
    textNodes: element.textNodes.map(swap),
    attributes: Object.fromEntries(Object.entries(element.attributes).map(([key, value]) => [key, swap(value)])),
  }))
  return { ...evidence, raw: rewrite(evidence.raw) }
}

/** Authors the fill from a different byte count than the artifact actually delivers. */
function withAuthoredFill(evidence: GaugeVersionEvidence, bytes: number): GaugeVersionEvidence {
  const percent = (bytes / BUDGET_BYTES) * 100
  const serialized = serializePercent(percent)
  return {
    ...evidence,
    authoredInlineWidth: serialized,
    canonicalInlineWidth: { percent, serialized },
  }
}

function withElement(
  evidence: GaugeVersionEvidence,
  role: string,
  edit: (element: GaugeElementEvidence) => GaugeElementEvidence,
): GaugeVersionEvidence {
  return { ...evidence, raw: evidence.raw.map(element => (element.role === role ? edit(element) : element)) }
}

function stampMeta() {
  return { kind: 'show' as const, id: 'gauge-fixture', name: 'Gauge fixture', stampedAt: '2026-09-17T00:00:00.000Z' }
}

/** A delivered source of an exact byte length, stamped and headed like a real Show export. */
function deliveredSource(totalBytes: number, program = PROGRAM, marker = 'v1 metadata header'): string {
  let padding = 0
  for (let attempt = 0; attempt < 64; attempt += 1) {
    const header = [
      '/*',
      ` * Compiled PXLBLZ Show: ${marker}`,
      ' * By: PXLBLZ',
      ' * Source Patterns:',
      ' * Compatibility: portable',
      ` * ${'x'.repeat(padding)}`,
      ' */',
    ].join('\n')
    const source = stampArtifact(`${header}\n${program}`, stampMeta())
    const size = new TextEncoder().encode(source).length
    if (size === totalBytes) return source
    if (size > totalBytes) throw new Error(`Cannot build a ${totalBytes} byte delivered source; minimum is ${size}.`)
    padding += totalBytes - size
  }
  throw new Error(`Could not converge on a ${totalBytes} byte delivered source.`)
}

function deliveredEpe(totalBytes: number, program = PROGRAM, marker = 'v1 metadata header'): string {
  return JSON.stringify({
    name: 'Gauge fixture',
    id: 'gauge-fixture',
    sources: { main: deliveredSource(totalBytes, program, marker) },
    preview: '',
  }, null, 2)
}
