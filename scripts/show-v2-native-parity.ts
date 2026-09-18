// Native-versus-converted stock comparison (#1040).
//
// The sibling `show-v2-parity.ts` report measures v1 conversion against the v1
// compiler. This report measures the other seam the cutover depends on: the
// native v2 stock builder against the same choreography reached by converting
// the pinned legacy stock records.
//
// The two inputs are independent on purpose. `src/pixelblaze/stock/shows.ts`
// stays the pinned legacy builder and is never derived from the native one, so
// this is native-builder output versus converted pinned legacy rather than two
// outputs of one builder. Neither side may be allowlisted: a record either has
// an identical representation, or every structural difference carries an
// explicit classification and both lowering routes still produce identical
// deterministic Fast and Precise output, state and lifecycle at matched global
// times. Anything else fails the report.
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileShow, type GeneratedShowArtifact } from '@/engine/showCompiler'
import { prepareShowV2ForCompile } from '@/engine/showCompositionLoweringV2'
import { validateShowRecordV2, type ShowRecordV2 } from '@/engine/showCompositionV2'
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { STOCK_SHOWS } from '@/pixelblaze/stock/shows'
import { STOCK_SHOWS_V2, stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import { nativeStockSourceLookupV2 } from '@/pixelblaze/stock/showsV2Compile'
import { runtimeParity, sha256, stableJson, type RuntimeParity } from './show-v2-parity'

const REPORT_PATH = resolve('docs/plans/show-v2-native-parity-report.json')

/**
 * Record fields that carry no choreography and are excluded from the semantic
 * identity, exactly as the 47-record report excludes them. `updatedAt` is the
 * only one: the pinned legacy builder restamps eight Transition reference Shows
 * with a wall clock through `updateShowBoundaryTransition`, while the native
 * builder stamps one deterministic catalogue vintage.
 */
const VOLATILE_FIELDS = ['updatedAt'] as const

export type RepresentationDifference = {
  path: string
  classification: 'volatile-record-stamp' | 'conversion-provenance' | 'unclassified'
  rationale: string
  native: unknown
  converted: unknown
}

const VOLATILE_RATIONALE = 'The pinned legacy builder restamps this Show through updateShowBoundaryTransition, so its converted value is a wall clock. The native builder stamps the deterministic catalogue vintage. The field carries no choreography and is excluded from the semantic identity; the converted value is redacted here to keep the report reproducible.'
const UNCLASSIFIED_RATIONALE = 'No accepted classification covers this difference; the native builder and the converted pinned legacy record disagree on authored content.'

/**
 * The three #1065 conversion-metadata kinds, each with its own rationale. They
 * are separate concerns and the report says so: a Marker records a retired
 * Scene label, a Transition records which v1 collection it came from, and a
 * Layout occurrence records a v1 zero-duration routing switch.
 */
type ConversionProvenanceKind = 'marker-origin' | 'transition-origin' | 'layout-switch'

const CONVERSION_PROVENANCE_RATIONALE: Record<ConversionProvenanceKind, string> = {
  'marker-origin': 'The native builder authors this chapter Marker directly, while the v1 converter records that it created the Marker from a former Scene label (#1065). Provenance carries no choreography, compilation or playback meaning and governs editor visibility alone. Only a native absence against exactly "converted-scene-label" on a Marker origin is admitted; any other origin value, any origin the native builder authored, and every other field difference stay unclassified.',
  'transition-origin': 'The native builder authors this Transition directly, while the v1 converter records which v1 collection it came from (#1065): a Scene-boundary Transition or a Layer Transition. v1 edits those two families through two different surfaces, and a converted boundary Transition reaches Layer participant scope whenever it does not need whole-output ownership, so structure cannot recover the distinction. Provenance carries no timing, ownership, compilation or playback meaning; lowering strips it before the compiler sees a Transition. Only a native absence against exactly "converted-boundary-transition" or "converted-layer-transition" is admitted; any other origin value, any origin the native builder authored, and every other field difference stay unclassified.',
  'layout-switch': 'The v1 converter records the identity and the authored settings of a v1 zero-duration routing switch here, because the native v2 Layout contract keeps zero duration as a switch with no timed transfer object (#1065). The native builder authors no such record, and lowering derives the switch from the Layout change itself and never reads this field, so compiled playback is unchanged. Only a native absence against a complete, closed "converted-routing-cut" record is admitted; a missing or extra property, a non-string identity, an unrecognized direction or easing, a timed incomingTransfer, a difference inside a switch the native builder authored, and every other field difference stay unclassified. The recorded id, direction and easing are reported verbatim rather than redacted.',
}

/** Exactly the #1065 provenance shapes: nothing wider is admitted. */
const MARKER_ORIGIN_PATH = /^\/composition\/markers\/\d+\/origin$/
const TRANSITION_ORIGIN_PATH = /^\/composition\/transitions\/\d+\/origin$/
const LAYOUT_SWITCH_PATH = /^\/composition\/layoutOccurrences\/\d+\/incomingSwitch$/
const TRANSITION_ORIGINS = new Set(['converted-boundary-transition', 'converted-layer-transition'])
const ROUTING_DIRECTIONS = new Set(['forward', 'reverse'])
const EASING_DIRECTIONS = new Set(['in', 'out', 'in-out'])

/**
 * The one admitted asymmetry is a native *absence* against a recognized
 * converted value at one of the three exact paths. A field the native builder
 * actually authors, the reverse asymmetry, an unknown value, and every
 * difference inside an authored object all fall through to `unclassified` and
 * still fail the report.
 */
function conversionProvenanceKind(difference: { path: string; native: unknown; converted: unknown }): ConversionProvenanceKind | undefined {
  if (difference.native !== undefined) return undefined
  if (MARKER_ORIGIN_PATH.test(difference.path) && difference.converted === 'converted-scene-label') return 'marker-origin'
  if (TRANSITION_ORIGIN_PATH.test(difference.path) && typeof difference.converted === 'string' && TRANSITION_ORIGINS.has(difference.converted)) return 'transition-origin'
  if (LAYOUT_SWITCH_PATH.test(difference.path) && isRecognizedRoutingCut(difference.converted)) return 'layout-switch'
  return undefined
}

/**
 * The switch record is admitted only as a complete closed shape: every required
 * property present and well formed, every optional property well formed when
 * present, and no property outside the recognized set. An absent `direction` is
 * the authored v1 absence, not a defaulted 'forward'.
 */
function isRecognizedRoutingCut(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  if (!hasExactly(value, ['origin', 'id', 'fromOccurrenceId'], ['direction', 'easing'])) return false
  if (value.origin !== 'converted-routing-cut') return false
  if (!isIdentity(value.id) || !isIdentity(value.fromOccurrenceId)) return false
  if ('direction' in value && !(typeof value.direction === 'string' && ROUTING_DIRECTIONS.has(value.direction))) return false
  if ('easing' in value && !isStructuredEasing(value.easing)) return false
  return true
}

/** Each `ShowStructuredEasing` variant, closed on its own property set. */
function isStructuredEasing(value: unknown): boolean {
  if (!isPlainObject(value)) return false
  switch (value.curve) {
    case 'linear':
      return hasExactly(value, ['curve'], [])
    case 'quadratic': case 'cubic': case 'sine':
      return hasExactly(value, ['curve', 'direction'], []) && typeof value.direction === 'string' && EASING_DIRECTIONS.has(value.direction)
    case 'cubic-bezier':
      return hasExactly(value, ['curve', 'x1', 'y1', 'x2', 'y2'], []) && ['x1', 'y1', 'x2', 'y2'].every(key => isFiniteNumber(value[key]))
    case 'steps':
      return hasExactly(value, ['curve', 'steps', 'position'], []) && isFiniteNumber(value.steps) && (value.position === 'start' || value.position === 'end')
    case 'hold':
      return hasExactly(value, ['curve', 'at'], []) && isFiniteNumber(value.at)
    case 'back':
      return hasExactly(value, ['curve', 'direction', 'overshoot'], [])
        && typeof value.direction === 'string' && EASING_DIRECTIONS.has(value.direction) && isFiniteNumber(value.overshoot)
    default:
      return false
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasExactly(value: Record<string, unknown>, required: string[], optional: string[]): boolean {
  const keys = Object.keys(value)
  return required.every(key => keys.includes(key)) && keys.every(key => required.includes(key) || optional.includes(key))
}

function isIdentity(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0
}

function isFiniteNumber(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value)
}

type NativeComparison = {
  showId: string
  showName: string
  nativeSemanticSha256: string
  convertedSemanticSha256: string
  representation: 'identical' | 'classified-difference'
  representationDifferences: RepresentationDifference[]
  outcome: 'compared' | 'conversion-refused' | 'native-invalid' | 'preparation-refused' | 'compile-refused'
  refusalMessages: string[]
  recipeEqual: boolean
  sourceEqual: boolean
  summaryEqual: boolean
  fast: RuntimeParity
  precise: RuntimeParity
}

export async function main(): Promise<void> {
  const records = STOCK_SHOWS.map(compareEntry)
  const report = {
    schemaVersion: 1,
    issue: 1040,
    generatedFrom: {
      specification: 'docs/plans/scene-retirement-specification.md',
      nativeBuilder: 'src/pixelblaze/stock/showsV2.ts',
      pinnedLegacyBuilder: 'src/pixelblaze/stock/shows.ts',
      provisionalSchemaSha256: sha256(readFileSync(resolve('schemas/show-record-v2.provisional.schema.json'), 'utf8')),
      recordIdentity: { algorithm: 'sha256', excludedVolatileFields: [...VOLATILE_FIELDS] },
      runtime: { comparison: 'native-prepared versus converted-prepared, one lowering route each', modes: ['fast', 'fidelity'], mapPoints: 8 },
      note: 'RuntimeParity residual labels read source = native and converted = converted-legacy.',
    },
    corpus: { stock: { expected: 40, observed: STOCK_SHOWS.length, native: STOCK_SHOWS_V2.length } },
    summary: {
      total: records.length,
      byOutcome: countBy(records.map(record => record.outcome)),
      byRepresentation: countBy(records.map(record => record.representation)),
      byClassification: countBy(records.flatMap(record => record.representationDifferences.map(difference => difference.classification))),
      exactRuntime: records.filter(record => record.fast.matched && record.precise.matched).length,
      recipeEqual: records.filter(record => record.recipeEqual).length,
      sourceEqual: records.filter(record => record.sourceEqual).length,
      summaryEqual: records.filter(record => record.summaryEqual).length,
    },
    records,
  }

  if (STOCK_SHOWS.length !== 40 || STOCK_SHOWS_V2.length !== STOCK_SHOWS.length) {
    throw new Error('The native and pinned legacy stock censuses disagree; review the catalogue before updating expected counts.')
  }
  const failed = records.filter(record => record.outcome !== 'compared')
  if (failed.length > 0) {
    throw new Error(`Native stock records did not compare: ${failed.map(record => `${record.showId} (${record.outcome}: ${record.refusalMessages.join('; ')})`).join(', ')}`)
  }
  const unclassified = records.filter(record => record.representationDifferences.some(difference => difference.classification === 'unclassified'))
  if (unclassified.length > 0) {
    throw new Error(`Unclassified native/converted representation differences: ${unclassified.map(record => `${record.showId}${record.representationDifferences.filter(d => d.classification === 'unclassified').map(d => d.path).join(',')}`).join(', ')}`)
  }
  const drifted = records.filter(record => !record.fast.matched || !record.precise.matched)
  if (drifted.length > 0) {
    throw new Error(`Native and converted lowering diverge at matched global times: ${drifted.map(record => `${record.showId}[fast@${record.fast.firstMismatchMs},precise@${record.precise.firstMismatchMs}]`).join(', ')}`)
  }

  const text = `${JSON.stringify(report, null, 2)}\n`
  if (process.argv.includes('--write')) {
    writeFileSync(REPORT_PATH, text)
    console.log(`wrote ${REPORT_PATH}`)
    return
  }
  const committed = readFileSync(REPORT_PATH, 'utf8')
  if (committed !== text) throw new Error(`Native stock parity report drifted. Run npm run show:v2-native-parity -- --write and review ${REPORT_PATH}.`)
  console.log(`Native stock parity report matches: ${records.length} compared Shows.`)
}

function compareEntry(entry: (typeof STOCK_SHOWS)[number]): NativeComparison {
  const native = stockShowV2ById(entry.id)
  const conversion = convertShowRecordV1ToV2(structuredClone(entry.show))
  const base = {
    showId: entry.id,
    showName: entry.name,
    nativeSemanticSha256: native ? semanticSha(native) : '',
    convertedSemanticSha256: conversion.status === 'converted' ? semanticSha(conversion.record) : '',
    representation: 'classified-difference' as const,
    representationDifferences: [] as RepresentationDifference[],
    recipeEqual: false,
    sourceEqual: false,
    summaryEqual: false,
    fast: unmeasured(),
    precise: unmeasured(),
  }
  if (!native) return { ...base, outcome: 'native-invalid', refusalMessages: [`No native v2 record for "${entry.id}".`] }
  const invalid = validateShowRecordV2(native)
  if (invalid.length > 0) {
    return { ...base, outcome: 'native-invalid', refusalMessages: invalid.map(issue => `${issue.path}: ${issue.message}`) }
  }
  if (conversion.status !== 'converted') {
    return { ...base, outcome: 'conversion-refused', refusalMessages: conversion.issues.map(issue => `${issue.path}: ${issue.message}`) }
  }
  const converted = conversion.record
  const representationDifferences = classify(compareValues(native, converted))
  const preparedNative = prepareShowV2ForCompile(native, nativeStockSourceLookupV2(native), { libraries: LIBRARIES })
  const preparedConverted = prepareShowV2ForCompile(converted, nativeStockSourceLookupV2(converted), { libraries: LIBRARIES })
  const refusals = [preparedNative, preparedConverted].flatMap(prepared => prepared.status === 'refused' ? prepared.issues : [])
  const shared = {
    ...base,
    representation: representationDifferences.length === 0 ? ('identical' as const) : ('classified-difference' as const),
    representationDifferences,
  }
  if (preparedNative.status !== 'ready' || preparedConverted.status !== 'ready') {
    return { ...shared, outcome: 'preparation-refused', refusalMessages: refusals.map(issue => `${issue.path}: ${issue.message}`) }
  }
  let nativeArtifact: GeneratedShowArtifact
  let convertedArtifact: GeneratedShowArtifact
  try {
    nativeArtifact = compileShow(preparedNative.recipe, LIBRARIES)
    convertedArtifact = compileShow(preparedConverted.recipe, LIBRARIES)
  } catch (error) {
    return { ...shared, outcome: 'compile-refused', refusalMessages: [error instanceof Error ? error.message : String(error)] }
  }
  return {
    ...shared,
    outcome: 'compared',
    refusalMessages: [],
    recipeEqual: stableJson(preparedNative.recipe) === stableJson(preparedConverted.recipe),
    sourceEqual: nativeArtifact.code === convertedArtifact.code && nativeArtifact.fxCode === convertedArtifact.fxCode,
    summaryEqual: stableJson(nativeArtifact.summary) === stableJson(convertedArtifact.summary),
    fast: runtimeParity(nativeArtifact, convertedArtifact, entry.show, converted, 'fast', []),
    precise: runtimeParity(nativeArtifact, convertedArtifact, entry.show, converted, 'fidelity', []),
  }
}

/** Every leaf path where the two records disagree, in deterministic order. */
export function compareValues(native: unknown, converted: unknown, path = ''): Array<{ path: string; native: unknown; converted: unknown }> {
  if (stableJson(native) === stableJson(converted)) return []
  const bothObjects = native !== null && converted !== null && typeof native === 'object' && typeof converted === 'object'
    && Array.isArray(native) === Array.isArray(converted)
  if (!bothObjects) return [{ path: path || '/', native, converted }]
  const keys = [...new Set([...Object.keys(native), ...Object.keys(converted)])].sort()
  return keys.flatMap(key => compareValues(
    (native as Record<string, unknown>)[key],
    (converted as Record<string, unknown>)[key],
    `${path}/${key}`,
  ))
}

export function classify(differences: Array<{ path: string; native: unknown; converted: unknown }>): RepresentationDifference[] {
  return differences.map(difference => {
    if ((VOLATILE_FIELDS as readonly string[]).includes(difference.path.slice(1))) {
      return {
        path: difference.path,
        classification: 'volatile-record-stamp' as const,
        rationale: VOLATILE_RATIONALE,
        native: difference.native,
        converted: '<volatile wall-clock stamp>',
      }
    }
    const provenance = conversionProvenanceKind(difference)
    if (provenance) {
      return {
        path: difference.path,
        classification: 'conversion-provenance' as const,
        rationale: CONVERSION_PROVENANCE_RATIONALE[provenance],
        native: difference.native,
        converted: difference.converted,
      }
    }
    return {
      path: difference.path,
      classification: 'unclassified' as const,
      rationale: UNCLASSIFIED_RATIONALE,
      native: difference.native,
      converted: difference.converted,
    }
  })
}

function semanticSha(record: ShowRecordV2): string {
  const semantic: Record<string, unknown> = { ...structuredClone(record) }
  for (const field of VOLATILE_FIELDS) delete semantic[field]
  return sha256(stableJson(semantic))
}

function countBy(values: string[]): Record<string, number> {
  return Object.fromEntries([...new Set(values)].sort().map(value => [value, values.filter(item => item === value).length]))
}

function unmeasured(): RuntimeParity {
  return {
    matched: false,
    sampledMs: [],
    maxSampledFrameAbsoluteDifference: 0,
    firstMismatchStateDifferences: [],
    firstMismatchStateResiduals: [],
    secondLoopMatched: false,
    loopResetMatched: false,
    loopResetFrameMatched: false,
    loopResetStateMatched: false,
    loopResetStateDifferences: [],
    loopResetStateResiduals: [],
    coldSeekMatchedContinuous: false,
    coldSeekFrameMatchedContinuous: false,
    coldSeekStateMatchedContinuous: false,
    coldSeekStateDifferences: [],
  }
}
