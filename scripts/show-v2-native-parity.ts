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

type RepresentationDifference = {
  path: string
  classification: 'volatile-record-stamp' | 'unclassified'
  rationale: string
  native: unknown
  converted: unknown
}

const VOLATILE_RATIONALE = 'The pinned legacy builder restamps this Show through updateShowBoundaryTransition, so its converted value is a wall clock. The native builder stamps the deterministic catalogue vintage. The field carries no choreography and is excluded from the semantic identity; the converted value is redacted here to keep the report reproducible.'
const UNCLASSIFIED_RATIONALE = 'No accepted classification covers this difference; the native builder and the converted pinned legacy record disagree on authored content.'

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
function compareValues(native: unknown, converted: unknown, path = ''): Array<{ path: string; native: unknown; converted: unknown }> {
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

function classify(differences: Array<{ path: string; native: unknown; converted: unknown }>): RepresentationDifference[] {
  return differences.map(difference => (
    (VOLATILE_FIELDS as readonly string[]).includes(difference.path.slice(1))
      ? {
          path: difference.path,
          classification: 'volatile-record-stamp' as const,
          rationale: VOLATILE_RATIONALE,
          native: difference.native,
          converted: '<volatile wall-clock stamp>',
        }
      : {
          path: difference.path,
          classification: 'unclassified' as const,
          rationale: UNCLASSIFIED_RATIONALE,
          native: difference.native,
          converted: difference.converted,
        }
  ))
}

function semanticSha(record: ShowRecordV2): string {
  const semantic = structuredClone(record) as Record<string, unknown>
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
