import {
  analyzeShowPatternRenderState,
  estimateShowPatternRenderOperations,
  type ShowPatternOutputRenderFunction,
} from '../../src/engine/showPatternOutputReuse'

export type PatternFieldGeometry = 'none' | 'cheap' | 'expensive'
export type PatternFieldShading = 'inseparable' | 'separable'
export type PatternFieldCoverage = 'none' | 'exact-empty' | 'exact-alpha'
export type PatternRenderPurity = 'pure' | 'render-mutating' | 'indeterminate'

export interface PatternFieldCensusReview {
  geometry: PatternFieldGeometry
  shading: PatternFieldShading
  coverage: PatternFieldCoverage
  renderPurity: PatternRenderPurity
  fieldControls: string[]
  shadingControls: string[]
  mixedControls: string[]
  timeDependencies: string[]
  stateDependencies: string[]
  expectedConsumerMultiplicity: number
  /** Reviewed relative operation estimate for the reusable producer alone. */
  producerOperationScore: number
  notes: string
}

export interface PatternFieldCensusInput {
  id: string
  name: string
  provenance: 'bundled' | 'community'
  sourceRef?: string
  source: string
  review: PatternFieldCensusReview | null
}

export interface PatternFieldCensusThresholds {
  minimumCandidateCount: number
  minimumCandidateRatio: number
  minimumProducerOperationScore: number
}

export interface PatternFieldCensusEntry extends PatternFieldCensusInput {
  renderFunction: ShowPatternOutputRenderFunction | null
  renderOperationScore: number | null
  renderState: ReturnType<typeof analyzeShowPatternRenderState>['state']
  controlExportNames: string[]
  classificationErrors: string[]
  credibleCandidate: boolean
}

export interface PatternFieldCensusReport {
  schemaVersion: 1
  entries: PatternFieldCensusEntry[]
  thresholds: PatternFieldCensusThresholds
  summary: {
    patternCount: number
    reviewedCount: number
    credibleCandidateCount: number
    credibleCandidateRatio: number
    unreviewedIds: string[]
    invalidClassificationIds: string[]
    proceedWithPrototype: boolean
    decision:
      | 'proceed-prototype'
      | 'stop-incomplete-census'
      | 'stop-invalid-classification'
      | 'stop-insufficient-incidence'
  }
}

export function buildPatternFieldCensus(
  inputs: PatternFieldCensusInput[],
  thresholds: PatternFieldCensusThresholds,
): PatternFieldCensusReport {
  const entries = [...inputs]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((input) => {
      const renderFunction = detectRenderFunction(input.source)
      const renderOperationScore = renderFunction
        ? estimateShowPatternRenderOperations(input.source, renderFunction)
        : null
      const renderState = renderFunction
        ? analyzeShowPatternRenderState(input.source, renderFunction).state
        : 'unknown'
      const controlExportNames = patternFieldControlExports(input.source)
      const classificationErrors = input.review
        ? validateControlClassification(controlExportNames, input.review)
        : []
      const credibleCandidate = Boolean(
        input.review
        && classificationErrors.length === 0
        && input.review.geometry === 'expensive'
        && input.review.shading === 'separable'
        && input.review.renderPurity === 'pure'
        && input.review.expectedConsumerMultiplicity >= 2
        && input.review.producerOperationScore >= thresholds.minimumProducerOperationScore,
      )
      return {
        ...input,
        renderFunction,
        renderOperationScore,
        renderState,
        controlExportNames,
        classificationErrors,
        credibleCandidate,
      }
    })
  const unreviewedIds = entries.filter((entry) => !entry.review).map((entry) => entry.id)
  const invalidClassificationIds = entries
    .filter((entry) => entry.classificationErrors.length > 0)
    .map((entry) => entry.id)
  const credibleCandidateCount = entries.filter((entry) => entry.credibleCandidate).length
  const credibleCandidateRatio = entries.length > 0 ? credibleCandidateCount / entries.length : 0
  const complete = unreviewedIds.length === 0
  const valid = invalidClassificationIds.length === 0
  const enoughCandidates = credibleCandidateCount >= thresholds.minimumCandidateCount
    && credibleCandidateRatio >= thresholds.minimumCandidateRatio
  const proceedWithPrototype = complete && valid && enoughCandidates
  return {
    schemaVersion: 1,
    entries,
    thresholds,
    summary: {
      patternCount: entries.length,
      reviewedCount: entries.length - unreviewedIds.length,
      credibleCandidateCount,
      credibleCandidateRatio,
      unreviewedIds,
      invalidClassificationIds,
      proceedWithPrototype,
      decision: proceedWithPrototype
        ? 'proceed-prototype'
        : !complete
          ? 'stop-incomplete-census'
          : !valid
            ? 'stop-invalid-classification'
            : 'stop-insufficient-incidence',
    },
  }
}

export function patternFieldControlExports(source: string): string[] {
  const names = new Set<string>()
  const pattern = /export\s+function\s+((?:slider|toggle|hsvPicker|rgbPicker)[A-Za-z0-9_]*)\s*\(/g
  for (const match of source.matchAll(pattern)) names.add(match[1])
  return [...names].sort()
}

function validateControlClassification(
  controlExportNames: string[],
  review: PatternFieldCensusReview,
): string[] {
  const classes = [review.fieldControls, review.shadingControls, review.mixedControls]
  const errors: string[] = []
  for (const name of controlExportNames) {
    const occurrences = classes.filter((members) => members.includes(name)).length
    if (occurrences > 1) errors.push(`Control ${name} appears in more than one dependency class.`)
    else if (occurrences === 0) errors.push(`Control ${name} has no dependency classification.`)
  }
  const known = new Set(controlExportNames)
  for (const name of new Set(classes.flat())) {
    if (!known.has(name)) errors.push(`Classified control ${name} is not exported by the Pattern.`)
  }
  return errors.sort()
}

function detectRenderFunction(source: string): ShowPatternOutputRenderFunction | null {
  for (const name of ['render3D', 'render2D', 'render'] as const) {
    if (new RegExp(`(?:export\\s+)?function\\s+${name}\\s*\\(`).test(source)) return name
  }
  return null
}
