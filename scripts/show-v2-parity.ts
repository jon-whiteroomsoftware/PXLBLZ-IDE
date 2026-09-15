import { materializeShowGroupsV2 } from '@/engine/showGroupsV2'
import { projectShowGroupRuntimePatternInstances } from '@/engine/showGroupModel'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { BASELINE_FIXTURES, resolveBaselineFixtureRecord, type BaselineFixture } from '@/agent-harness/baseline/fixtures'
import { createFastReplayRuntime, type FastReplayResult } from '@/engine/fastReplay'
import { nativeDimension } from '@/engine/loadPattern'
import { stockMapSpec } from '@/engine/maps'
import type { MapPoint } from '@/engine/maps/types'
import type { LibraryRecord, PatternRecord, ShowPatternRef, ShowRecord } from '@/engine/personalContentRecords'
import { compileShow, type GeneratedShowArtifact, type ShowRecipe } from '@/engine/showCompiler'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { prepareShowV2ForCompile, type ShowV2CompileProvenance } from '@/engine/showCompositionLoweringV2'
import { projectShowTimeline, showRecordToCompileRecipe, type ShowCompileRecipeSourceLookup } from '@/engine/showModel'
import { convertShowRecordV1ToV2, type ShowV1ToV2Report } from '@/engine/showRecordV1ToV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS, stockShowById } from '@/pixelblaze/stock/shows'

const REPORT_PATH = resolve('docs/plans/show-v2-parity-report.json')
const STEP_MS = 16
const RANDOM_SEED = 1034

type Dependency = { kind: 'pattern' | 'library' | 'map'; id: string; resolvedId?: string; sha256?: string; status: 'pinned' | 'missing' | 'not-applicable' }
type MemberIdentityMapping = { v1MemberId: string; v2MemberId: string; provenance: 'flat-projection' }
type Parity = {
  recipeEqual: boolean
  sourceEqual: boolean
  summaryEqual: boolean
  memberIdentityMappings: MemberIdentityMapping[]
  fast: RuntimeParity
  precise: RuntimeParity
}
type RuntimeParity = {
  matched: boolean
  sampledMs: number[]
  firstMismatchMs?: number
  firstMismatchFrameMaxAbsoluteDifference?: number
  firstFrameMismatchMs?: number
  firstStateMismatchMs?: number
  maxSampledFrameAbsoluteDifference: number
  firstMismatchStateDifferences: string[]
  firstMismatchStateResiduals: Array<{ key: string; source: unknown; converted: unknown }>
  secondLoopMatched: boolean
  loopResetMatched: boolean
  loopResetFrameMatched: boolean
  loopResetStateMatched: boolean
  loopResetStateDifferences: string[]
  loopResetStateResiduals: Array<{ key: string; phase: unknown; secondLoop: unknown }>
  coldSeekMatchedContinuous: boolean
  coldSeekFrameMatchedContinuous: boolean
  coldSeekStateMatchedContinuous: boolean
  coldSeekStateDifferences: string[]
}

interface CorpusEntry {
  corpus: 'stock' | 'agent-baseline'
  corpusId: string
  showId: string
  recordSemanticSha256: string
  dependencies: Dependency[]
  outcome: 'converted-compiled' | 'conversion-refused' | 'preparation-refused' | 'dependency-refused' | 'compile-refused'
  refusalCodes: string[]
  refusalMessages: string[]
  accountedSourceLeaves: number
  unaccountedSourcePaths: string[]
  retiredFlatCellShadows: ShowV1ToV2Report['retiredFlatCellShadows']
  retiredSilentRuntimeUses: ShowV1ToV2Report['retiredSilentRuntimeUses']
  acceptedSemanticDifference?: {
    kind: 'retired-silent-runtime-use'
    rationale: string
    firstRetiredStartMs: number
    modes: {
      fast: Pick<RuntimeParity, 'firstMismatchMs' | 'firstFrameMismatchMs' | 'firstStateMismatchMs' | 'maxSampledFrameAbsoluteDifference' | 'firstMismatchStateDifferences'>
      precise: Pick<RuntimeParity, 'firstMismatchMs' | 'firstFrameMismatchMs' | 'firstStateMismatchMs' | 'maxSampledFrameAbsoluteDifference' | 'firstMismatchStateDifferences'>
    }
  }
  parity?: Parity
}

export async function main(): Promise<void> {
  const records = [
    ...STOCK_SHOWS.map(item => ({ corpus: 'stock' as const, corpusId: item.id, show: structuredClone(item.show) })),
    ...BASELINE_FIXTURES.map(fixture => ({
      corpus: 'agent-baseline' as const,
      corpusId: fixture.id,
      show: resolveBaselineFixtureRecord(fixture, id => stockShowById(id)?.show),
      fixture,
    })),
  ].map(runEntry)
  const report = {
    schemaVersion: 2,
    issue: 1034,
    generatedFrom: {
      baseCommit: 'd685125b34c694f311972e258efb48d12cf05cd8',
      provisionalPlanSha256: 'a13641e8d6233e037ac1e3993b110fce49f44f3908ad0972a50b81279d79722f',
      provisionalSchemaSha256: sha256(readFileSync(resolve('schemas/show-record-v2.provisional.schema.json'), 'utf8')),
      runtime: { stepMs: STEP_MS, randomSeed: RANDOM_SEED, modes: ['fast', 'fidelity'], mapPoints: 8 },
      recordIdentity: { algorithm: 'sha256', excludedVolatileFields: ['updatedAt'] },
      silentRuntimePolicy: 'Retire v1 placements wholly inside intervals where their Zone is absent; do not infer activation from future Clip IDs or Layout gaps.',
    },
    corpus: {
      stock: { expected: 40, observed: STOCK_SHOWS.length },
      agentBaseline: { expected: 7, observed: BASELINE_FIXTURES.length },
      personalExports: { status: 'unavailable', observed: 0, reason: 'Jon confirmed on 2026-09-14 that no personal authored Show exports exist.' },
    },
    compilerLibraries: Object.entries(LIBRARIES).sort(([a], [b]) => a.localeCompare(b)).map(([id, source]) => ({ id, sha256: sha256(source) })),
    summary: summarize(records),
    records,
  }
  if (STOCK_SHOWS.length !== 40 || BASELINE_FIXTURES.length !== 7) throw new Error('The pinned #1034 corpus census changed; review the inventory before updating expected counts.')
  if (records.some(record => record.unaccountedSourcePaths.length > 0)) throw new Error(`Unaccounted source leaves: ${JSON.stringify(records.filter(record => record.unaccountedSourcePaths.length > 0).map(record => ({ id: record.corpusId, paths: record.unaccountedSourcePaths })))}`)
  const unexpectedParityFailures = records.filter(record => record.parity && (!record.parity.fast.matched || !record.parity.precise.matched) && !record.acceptedSemanticDifference)
  if (unexpectedParityFailures.length > 0) {
    throw new Error(`Supported conversion has an unexplained matched-time Fast/Precise replay divergence: ${unexpectedParityFailures.map(record => (
      `${record.corpus}:${record.corpusId}[recipe=${record.parity?.recipeEqual},source=${record.parity?.sourceEqual},fast@${record.parity?.fast.firstMismatchMs},precise@${record.parity?.precise.firstMismatchMs}]`
    )).join(', ')}`)
  }
  const text = `${JSON.stringify(report, null, 2)}\n`
  if (process.argv.includes('--write')) {
    writeFileSync(REPORT_PATH, text)
    console.log(`wrote ${REPORT_PATH}`)
    return
  }
  const committed = readFileSync(REPORT_PATH, 'utf8')
  if (committed !== text) throw new Error(`Show v2 parity report drifted. Run npm run show:v2-parity -- --write and review ${REPORT_PATH}.`)
  console.log(`Show v2 parity report matches: ${records.length} inventoried records.`)
}

function runEntry(input: { corpus: CorpusEntry['corpus']; corpusId: string; show: ShowRecord; fixture?: BaselineFixture }): CorpusEntry {
  const { show } = input
  const dependencies = pinDependencies(show, input.fixture)
  const missing = dependencies.filter(item => item.status === 'missing')
  const lookup = missing.length === 0 ? sourceLookup(show, input.fixture) : undefined
  const conversion = convertShowRecordV1ToV2(show, lookup)
  const base = {
    corpus: input.corpus,
    corpusId: input.corpusId,
    showId: show.id,
    recordSemanticSha256: sha256(stableJson({ ...show, updatedAt: 0 })),
    dependencies,
    accountedSourceLeaves: conversion.report.accounting.length,
    unaccountedSourcePaths: conversion.report.unaccountedSourcePaths,
    retiredFlatCellShadows: structuredClone(conversion.report.retiredFlatCellShadows),
    retiredSilentRuntimeUses: structuredClone(conversion.report.retiredSilentRuntimeUses),
  }
  if (missing.length > 0) return {
    ...base, outcome: 'dependency-refused', refusalCodes: ['missing-dependency'],
    refusalMessages: missing.map(item => `${item.kind}:${item.id}`),
  }
  if (conversion.status === 'refused') return {
    ...base, outcome: 'conversion-refused',
    refusalCodes: sortedUnique(conversion.issues.map(issue => issue.code)),
    refusalMessages: sortedUnique(conversion.issues.map(issue => `${issue.path}: ${issue.message}`)),
  }
  if (!lookup) throw new Error('Exact source lookup unexpectedly unavailable.')
  const preparation = prepareShowV2ForCompile(
    conversion.record,
    sourceLookupWithFlatProjection(lookup, conversion.report.flatProjectionMappings),
  )
  if (preparation.status === 'refused') return {
    ...base,
    outcome: 'preparation-refused',
    refusalCodes: sortedUnique(preparation.issues.map(issue => issue.code)),
    refusalMessages: sortedUnique(preparation.issues.map(issue => `${issue.path}: ${issue.message}`)),
  }
  const libraries = librarySources(input.fixture)
  const v2Recipe = preparation.recipe
  let v1Recipe: ReturnType<typeof showRecordToCompileRecipe>
  let v1: GeneratedShowArtifact
  let v2: GeneratedShowArtifact
  try {
    v1Recipe = showRecordToCompileRecipe(show, lookup)
    v1 = compileShow(v1Recipe, libraries)
    v2 = compileShow(v2Recipe, libraries)
  } catch (error) {
    return { ...base, outcome: 'compile-refused', refusalCodes: ['compile-error'], refusalMessages: [errorMessage(error)] }
  }
  // Check logical ownership before the compiler's independent physical-slot optimization.
  // Actual default-compiled artifacts remain the output and lifecycle parity oracle.
  const identityArtifact = v2.summary.specializations.patternSlots?.selected
    ? compileShow(v2Recipe, libraries, { patternSlotSharing: 'none' })
    : v2
  assertPreparedMemberProvenance(conversion.record, preparation.provenance, preparation.recipe, identityArtifact)
  const memberIdentityMappings = flatMemberIdentityMappings(conversion.report, v1, v2)
  const parity: Parity = {
    recipeEqual: stableJson(v2Recipe) === stableJson(v1Recipe),
    sourceEqual: v2.code === v1.code && v2.fxCode === v1.fxCode,
    summaryEqual: stableJson(v2.summary) === stableJson(v1.summary),
    memberIdentityMappings,
    fast: runtimeParity(v1, v2, show, conversion.record, 'fast', memberIdentityMappings),
    precise: runtimeParity(v1, v2, show, conversion.record, 'fidelity', memberIdentityMappings),
  }
  const acceptedSemanticDifference = classifyRetiredSilentRuntimeDifference(conversion.report, parity)
  return {
    ...base, outcome: 'converted-compiled', refusalCodes: [], refusalMessages: [],
    ...(acceptedSemanticDifference ? { acceptedSemanticDifference } : {}),
    parity,
  }
}

function classifyRetiredSilentRuntimeDifference(
  report: ShowV1ToV2Report,
  parity: Parity,
): CorpusEntry['acceptedSemanticDifference'] | undefined {
  const failedModes = [parity.fast, parity.precise].filter(mode => !mode.matched)
  if (failedModes.length === 0 || report.retiredSilentRuntimeUses.length === 0) return undefined
  const firstRetiredStartMs = Math.min(...report.retiredSilentRuntimeUses.map(retirement => retirement.startMs))
  if (failedModes.some(mode => mode.firstMismatchMs === undefined || mode.firstMismatchMs < firstRetiredStartMs)) return undefined
  const retiredInstanceIds = new Set(report.retiredSilentRuntimeUses.map(retirement => retirement.instanceId))
  if (failedModes.some(mode => mode.firstMismatchStateDifferences.some(key => (
    !key.startsWith('__pxlblz_empty-routed:') && ![...retiredInstanceIds].some(instanceId => key.startsWith(`${instanceId}:`))
  )))) return undefined
  const evidence = (mode: RuntimeParity) => ({
    ...(mode.firstMismatchMs === undefined ? {} : { firstMismatchMs: mode.firstMismatchMs }),
    ...(mode.firstFrameMismatchMs === undefined ? {} : { firstFrameMismatchMs: mode.firstFrameMismatchMs }),
    ...(mode.firstStateMismatchMs === undefined ? {} : { firstStateMismatchMs: mode.firstStateMismatchMs }),
    maxSampledFrameAbsoluteDifference: mode.maxSampledFrameAbsoluteDifference,
    firstMismatchStateDifferences: mode.firstMismatchStateDifferences,
  })
  return {
    kind: 'retired-silent-runtime-use',
    rationale: 'The converter explicitly retired one or more source placements whose Zone was absent for their full authored interval; later state/output drift is accepted from the first retired interval onward.',
    firstRetiredStartMs,
    modes: { fast: evidence(parity.fast), precise: evidence(parity.precise) },
  }
}

function pinDependencies(show: ShowRecord, fixture?: BaselineFixture): Dependency[] {
  const patternRecords = new Map((fixture?.patterns ?? []).map(pattern => [pattern.id, pattern]))
  const refs = allPatternRefs(show)
  const patterns = [...new Map(refs.map(ref => [`${ref.kind}:${ref.id}`, ref])).values()].map(ref => {
    const resolved = patternSource(ref, patternRecords)
    return resolved
      ? { kind: 'pattern' as const, id: `${ref.kind}:${ref.id}`, resolvedId: resolved.id, sha256: sha256(resolved.source), status: 'pinned' as const }
      : { kind: 'pattern' as const, id: `${ref.kind}:${ref.id}`, status: 'missing' as const }
  })
  const libraries = (fixture?.libraries ?? []).map(library => ({
    kind: 'library' as const, id: library.name, resolvedId: library.id, sha256: sha256(library.src), status: 'pinned' as const,
  }))
  const mapId = show.stageMapId ?? (show.outputContract.kind === 'portable-2d' ? show.outputContract.referenceMapId : show.outputContract.outputMapId)
  const map = mapId ? stockMapSpec(mapId) : undefined
  const maps: Dependency[] = mapId
    ? [map
        ? { kind: 'map', id: mapId, resolvedId: map.id, sha256: sha256(stableJson(map)), status: 'pinned' }
        : { kind: 'map', id: mapId, status: 'missing' }]
    : [{ kind: 'map', id: 'none', status: 'not-applicable' }]
  return [...patterns, ...libraries, ...maps].sort((a, b) => `${a.kind}:${a.id}`.localeCompare(`${b.kind}:${b.id}`))
}

function sourceLookup(show: ShowRecord, fixture?: BaselineFixture): ShowCompileRecipeSourceLookup {
  const patterns = new Map((fixture?.patterns ?? []).map(pattern => [pattern.id, pattern]))
  const source = (ref: ShowPatternRef) => {
    const found = patternSource(ref, patterns)
    if (!found) throw new Error(`Missing exact Pattern source ${ref.kind}:${ref.id}.`)
    return found.source
  }
  const byPatternInstanceId = Object.fromEntries([
    ...(show.composition?.patternInstances ?? []),
    ...(show.composition?.groupDefinitions ?? []).flatMap(group => group.patternInstances),
    ...(show.composition ? projectShowGroupRuntimePatternInstances(show.composition) : []),
  ].map(instance => [instance.id, source(instance.pattern)]))
  return {
    byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, source(cell.pattern)])),
    byPatternInstanceId,
    stageDimension: outputDimension(show),
  }
}

function sourceLookupWithFlatProjection(
  lookup: ShowCompileRecipeSourceLookup,
  mappings: ShowV1ToV2Report['flatProjectionMappings'],
): ShowCompileRecipeSourceLookup {
  if (mappings.length === 0) return lookup
  const byPatternInstanceId = { ...lookup.byPatternInstanceId }
  for (const mapping of mappings) {
    const source = lookup.byCellId[mapping.cellId]
    if (source === undefined) throw new Error(`Flat projection has no exact Pattern source for cell "${mapping.cellId}".`)
    for (const instanceId of mapping.patternInstanceIds) {
      const existing = byPatternInstanceId[instanceId]
      if (existing !== undefined && existing !== source) {
        throw new Error(`Flat projection maps conflicting Pattern sources to instance "${instanceId}".`)
      }
      byPatternInstanceId[instanceId] = source
    }
  }
  return { ...lookup, byPatternInstanceId }
}

export function flatMemberIdentityMappings(
  report: ShowV1ToV2Report,
  v1: GeneratedShowArtifact,
  v2: GeneratedShowArtifact,
): MemberIdentityMapping[] {
  if (report.flatProjectionMappings.length === 0) return []
  const v1MemberIds = new Set(v1.summary.clips.map(clip => clip.id))
  const v2MemberIds = new Set(v2.summary.clips.map(clip => clip.id))
  const v2MemberByPlacementId = new Map<string, string>()
  for (const mapping of report.clipMappings) {
    for (const placementId of mapping.sourcePlacementIds) {
      const existing = v2MemberByPlacementId.get(placementId)
      if (existing !== undefined && existing !== mapping.clipId) {
        throw new Error(`Flat projection placement "${placementId}" maps to multiple v2 members.`)
      }
      v2MemberByPlacementId.set(placementId, mapping.clipId)
    }
  }
  const byInstance = new Map<string, typeof report.flatProjectionMappings>()
  for (const mapping of report.flatProjectionMappings) {
    if (mapping.patternInstanceIds.length !== 1) throw new Error(`Flat cell "${mapping.cellId}" has ambiguous runtime provenance.`)
    const instanceId = mapping.patternInstanceIds[0]
    byInstance.set(instanceId, [...(byInstance.get(instanceId) ?? []), mapping])
  }
  const mappings = [...byInstance].map(([instanceId, cells]) => {
    const leftIds = sortedUnique([instanceId, ...cells.map(cell => cell.cellId)].filter(id => v1MemberIds.has(id)))
    const placements = cells.flatMap(cell => cell.placementIds.map(id => v2MemberByPlacementId.get(id)))
    if (placements.some(id => id === undefined)) throw new Error(`Flat instance "${instanceId}" has an unaccounted placement.`)
    const rightIds = sortedUnique([instanceId, ...cells.map(cell => cell.cellId), ...placements as string[]].filter(id => v2MemberIds.has(id)))
    if (leftIds.length !== 1 || rightIds.length !== 1) throw new Error(`Flat instance "${instanceId}" does not map to exactly one compiled member on each side.`)
    return { v1MemberId: leftIds[0], v2MemberId: rightIds[0], provenance: 'flat-projection' as const }
  })
  if (v1MemberIds.size !== v1.summary.clips.length || v2MemberIds.size !== v2.summary.clips.length
    || new Set(mappings.map(mapping => mapping.v1MemberId)).size !== mappings.length
    || new Set(mappings.map(mapping => mapping.v2MemberId)).size !== mappings.length
    || mappings.length !== v1MemberIds.size
    || mappings.length !== v2MemberIds.size) {
    throw new Error('Flat projection runtime member mapping is not a complete bijection.')
  }
  return mappings
}

export function assertPreparedMemberProvenance(
  record: ShowRecordV2,
  provenance: ShowV2CompileProvenance,
  recipe: ShowRecipe,
  artifact: GeneratedShowArtifact,
): void {
  const clips = materializeShowGroupsV2(record).composition.clips
  const clipIds = clips.map(clip => clip.id).sort()
  const provenanceClipIds = Object.keys(provenance.runtimeInstanceIdByClipId).sort()
  if (stableJson(provenanceClipIds) !== stableJson(clipIds)) {
    throw new Error('Compile preparation provenance does not account for every v2 Clip exactly once.')
  }
  for (const clip of clips) {
    if (provenance.runtimeInstanceIdByClipId[clip.id] !== clip.instanceId) {
      throw new Error(`Compile preparation changed runtime instance ownership for Clip "${clip.id}".`)
    }
  }
  const summaryMemberIds = artifact.summary.clips.map(member => member.id).sort()
  const runtimeInstanceIds = [...new Set(Object.values(provenance.runtimeInstanceIdByClipId))].sort()
  const compilerOwnedEmptyIds = recipe.clips
    .filter(clip => clip.compilerOwnedEmpty)
    .map(clip => clip.id)
    .sort()
  if (provenance.route === 'continuous-flat') {
    const authoredSummaryMemberIds = summaryMemberIds.filter(memberId => !compilerOwnedEmptyIds.includes(memberId))
    if (authoredSummaryMemberIds.some(memberId => !runtimeInstanceIds.includes(memberId) && !Object.prototype.hasOwnProperty.call(provenance.runtimeInstanceIdByClipId, memberId))) {
      throw new Error('Continuous-flat preparation emitted a summary member without Clip provenance.')
    }
    const representedInstances = authoredSummaryMemberIds.map(memberId => runtimeInstanceIds.includes(memberId) ? memberId : provenance.runtimeInstanceIdByClipId[memberId]).sort()
    if (stableJson(representedInstances) !== stableJson(runtimeInstanceIds)) {
      throw new Error('Continuous-flat preparation summary does not represent every runtime instance exactly once.')
    }
    if (stableJson(summaryMemberIds) !== stableJson([...authoredSummaryMemberIds, ...compilerOwnedEmptyIds].sort())) {
      throw new Error('Continuous-flat preparation summary has unaccounted compiler members.')
    }
    return
  }
  const expectedMemberIds = [...runtimeInstanceIds, ...compilerOwnedEmptyIds].sort()
  if (stableJson(summaryMemberIds) !== stableJson(expectedMemberIds)) {
    throw new Error(`${record.id}: ${provenance.route} preparation summary members ${stableJson(summaryMemberIds)} do not match runtime instances and compiler-owned empties ${stableJson(expectedMemberIds)}.`)
  }
}

function patternSource(ref: ShowPatternRef, patterns: Map<string, PatternRecord>): { id: string; source: string } | undefined {
  if (ref.kind === 'stock') {
    const id = resolveStockPatternId(ref.id)
    return Object.prototype.hasOwnProperty.call(DEMOS, id) ? { id, source: DEMOS[id] } : undefined
  }
  const record = patterns.get(ref.id)
  return record ? { id: record.id, source: record.src } : undefined
}

function allPatternRefs(show: ShowRecord): ShowPatternRef[] {
  return [
    ...show.cells.map(cell => cell.pattern),
    ...(show.composition?.patternInstances ?? []).map(instance => instance.pattern),
    ...(show.composition?.groupDefinitions ?? []).flatMap(group => group.patternInstances.map(instance => instance.pattern)),
  ]
}

function librarySources(fixture?: BaselineFixture): Record<string, string> {
  return { ...LIBRARIES, ...Object.fromEntries((fixture?.libraries ?? []).map((library: LibraryRecord) => [library.name, library.src])) }
}

export function runtimeParity(
  leftArtifact: GeneratedShowArtifact,
  rightArtifact: GeneratedShowArtifact,
  source: ShowRecord,
  converted: ShowRecordV2,
  fidelity: 'fast' | 'fidelity',
  memberIdentityMappings: MemberIdentityMapping[],
): RuntimeParity {
  const showEndMs = converted.composition.showEndMs
  const dimension = Math.max(nativeDimension(leftArtifact.metadata.renderFns), nativeDimension(rightArtifact.metadata.renderFns)) as 1 | 2 | 3
  const points = mapPoints(dimension)
  const runtime = (artifact: GeneratedShowArtifact) => createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata,
    dimension: nativeDimension(artifact.metadata.renderFns),
  }, { mapPoints: points, randomSeed: RANDOM_SEED, fidelity })
  const times = semanticSampleTimes(source, converted)
  const rightMemberIdAliases = new Map(memberIdentityMappings.map(mapping => [mapping.v2MemberId, mapping.v1MemberId]))
  const sample = (artifact: GeneratedShowArtifact, aliases: ReadonlyMap<string, string> = new Map()) => {
    const instance = runtime(artifact)
    const results = [freeze(instance.renderCurrentFrame(), artifact, aliases)]
    for (const timeMs of times.filter(time => time > 0)) {
      results.push(freeze(instance.advanceTo(timeMs, { stepMs: STEP_MS, forceFullIntermediateRender: true }), artifact, aliases))
    }
    return results
  }
  const leftSamples = sample(leftArtifact)
  const rightSamples = sample(rightArtifact, rightMemberIdAliases)
  const sampleTimes = [0, ...times.filter(time => time > 0)]
  const mismatchIndex = leftSamples.findIndex((result, index) => stableJson(result) !== stableJson(rightSamples[index]))
  let matched = mismatchIndex < 0
  const firstMismatchMs = mismatchIndex < 0 ? undefined : sampleTimes[mismatchIndex]
  const firstMismatchLeft = mismatchIndex < 0 ? undefined : leftSamples[mismatchIndex]
  const firstMismatchRight = mismatchIndex < 0 ? undefined : rightSamples[mismatchIndex]
  const firstMismatchStateDifferences = firstMismatchLeft && firstMismatchRight
    ? differentKeys(firstMismatchLeft.state, firstMismatchRight.state)
    : []
  const firstMismatchStateResiduals = firstMismatchLeft && firstMismatchRight
    ? firstMismatchStateDifferences.map(key => ({ key, source: firstMismatchLeft.state[key], converted: firstMismatchRight.state[key] }))
    : []
  const firstMismatchFrameMaxAbsoluteDifference = firstMismatchLeft && firstMismatchRight
    ? firstMismatchLeft.frame.reduce((maximum, value, index) => Math.max(maximum, Math.abs(value - firstMismatchRight.frame[index])), 0)
    : undefined
  const frameDifferences = leftSamples.map((result, index) => (
    result.frame.reduce((maximum, value, pixelIndex) => Math.max(maximum, Math.abs(value - rightSamples[index].frame[pixelIndex])), 0)
  ))
  const firstFrameMismatchIndex = frameDifferences.findIndex(difference => difference > 0)
  const firstStateMismatchIndex = leftSamples.findIndex((result, index) => stableJson(result.state) !== stableJson(rightSamples[index].state))
  const phaseMs = Math.max(1, Math.min(256, Math.floor(showEndMs / 4)))
  const phase = (artifact: GeneratedShowArtifact, secondLoop: boolean, aliases: ReadonlyMap<string, string> = new Map()) => {
    const instance = runtime(artifact)
    instance.renderCurrentFrame()
    if (secondLoop) instance.advanceTo(showEndMs, { stepMs: STEP_MS, forceFullIntermediateRender: true })
    return freeze(instance.advanceTo((secondLoop ? showEndMs : 0) + phaseMs, { stepMs: STEP_MS, forceFullIntermediateRender: true }), artifact, aliases)
  }
  const phaseLeftResult = phase(leftArtifact, false)
  const phaseRightResult = phase(rightArtifact, false, rightMemberIdAliases)
  const loopLeftResult = phase(leftArtifact, true)
  const loopRightResult = phase(rightArtifact, true, rightMemberIdAliases)
  const targetMs = Math.max(1, Math.min(512, showEndMs - 1))
  const cold = runtime(leftArtifact)
  cold.renderCurrentFrame()
  const coldResult = freeze(cold.advanceTo(targetMs, { stepMs: STEP_MS, forceFullIntermediateRender: true }), leftArtifact)
  const coldRight = runtime(rightArtifact)
  coldRight.renderCurrentFrame()
  const coldRightResult = freeze(coldRight.advanceTo(targetMs, { stepMs: STEP_MS, forceFullIntermediateRender: true }), rightArtifact, rightMemberIdAliases)
  const continuous = runtime(leftArtifact)
  let live = continuous.renderCurrentFrame()
  while (continuous.getElapsedMs() + STEP_MS <= targetMs) live = continuous.advanceLive(STEP_MS)
  if (continuous.getElapsedMs() < targetMs) live = continuous.advanceLive(targetMs - continuous.getElapsedMs())
  const continuousResult = freeze(live, leftArtifact)
  const continuousRight = runtime(rightArtifact)
  let liveRight = continuousRight.renderCurrentFrame()
  while (continuousRight.getElapsedMs() + STEP_MS <= targetMs) liveRight = continuousRight.advanceLive(STEP_MS)
  if (continuousRight.getElapsedMs() < targetMs) liveRight = continuousRight.advanceLive(targetMs - continuousRight.getElapsedMs())
  const continuousRightResult = freeze(liveRight, rightArtifact, rightMemberIdAliases)
  const coldFrameMatched = stableJson(coldResult.frame) === stableJson(continuousResult.frame)
    && stableJson(coldRightResult.frame) === stableJson(continuousRightResult.frame)
  const coldStateMatched = stableJson(coldResult.state) === stableJson(continuousResult.state)
    && stableJson(coldRightResult.state) === stableJson(continuousRightResult.state)
  const loopFrameMatched = stableJson(phaseLeftResult.frame) === stableJson(loopLeftResult.frame)
    && stableJson(phaseRightResult.frame) === stableJson(loopRightResult.frame)
  const loopStateMatched = stableJson(phaseLeftResult.state) === stableJson(loopLeftResult.state)
    && stableJson(phaseRightResult.state) === stableJson(loopRightResult.state)
  const secondLoopMatched = stableJson(loopLeftResult) === stableJson(loopRightResult)
  matched = matched
    && stableJson(phaseLeftResult) === stableJson(phaseRightResult)
    && stableJson(coldResult) === stableJson(coldRightResult)
    && secondLoopMatched
  return {
    matched,
    sampledMs: times,
    ...(firstMismatchMs === undefined ? {} : { firstMismatchMs }),
    ...(firstMismatchFrameMaxAbsoluteDifference === undefined ? {} : { firstMismatchFrameMaxAbsoluteDifference }),
    ...(firstFrameMismatchIndex < 0 ? {} : { firstFrameMismatchMs: sampleTimes[firstFrameMismatchIndex] }),
    ...(firstStateMismatchIndex < 0 ? {} : { firstStateMismatchMs: sampleTimes[firstStateMismatchIndex] }),
    maxSampledFrameAbsoluteDifference: Math.max(...frameDifferences),
    firstMismatchStateDifferences,
    firstMismatchStateResiduals,
    secondLoopMatched,
    loopResetMatched: loopFrameMatched && loopStateMatched,
    loopResetFrameMatched: loopFrameMatched,
    loopResetStateMatched: loopStateMatched,
    loopResetStateDifferences: sortedUnique([
      ...differentKeys(phaseLeftResult.state, loopLeftResult.state),
      ...differentKeys(phaseRightResult.state, loopRightResult.state),
    ]),
    loopResetStateResiduals: differentKeys(phaseLeftResult.state, loopLeftResult.state).map(key => ({
      key, phase: phaseLeftResult.state[key], secondLoop: loopLeftResult.state[key],
    })),
    coldSeekMatchedContinuous: coldFrameMatched && coldStateMatched,
    coldSeekFrameMatchedContinuous: coldFrameMatched,
    coldSeekStateMatchedContinuous: coldStateMatched,
    coldSeekStateDifferences: sortedUnique([
      ...differentKeys(coldResult.state, continuousResult.state),
      ...differentKeys(coldRightResult.state, continuousRightResult.state),
    ]),
  }
}

function freeze(
  result: FastReplayResult,
  artifact: GeneratedShowArtifact,
  memberIdAliases: ReadonlyMap<string, string> = new Map(),
) {
  const normalizedBindings = new Set(artifact.metadata.deterministicReplay?.normalizedBindings ?? [])
  const state = Object.fromEntries(artifact.summary.clips.flatMap(clip => Object.entries(result.exports)
    .filter(([key, value]) => key.startsWith(`${clip.prefix}_`) && !normalizedBindings.has(key) && scalar(value))
    .map(([key, value]) => [`${memberIdAliases.get(clip.id) ?? clip.id}:${key.slice(clip.prefix.length + 1)}`, value])))
  return { frame: Array.from(result.frame), state }
}

export function semanticSampleTimes(
  source: ShowRecord,
  converted: ShowRecordV2,
): number[] {
  converted = materializeShowGroupsV2(converted)
  const showEndMs = converted.composition.showEndMs
  const boundaries = new Set<number>()
  const intervalMidpoints: number[] = []
  const boundary = (timeMs: number) => {
    if (Number.isSafeInteger(timeMs)) boundaries.add(timeMs)
  }
  const interval = (startMs: number, endMs: number) => {
    boundary(startMs)
    boundary(endMs)
    if (Number.isSafeInteger(startMs) && Number.isSafeInteger(endMs) && endMs > startMs) {
      intervalMidpoints.push(Math.floor((startMs + endMs) / 2))
    }
  }
  const partition = (startMs: number, endMs: number, points: number[]) => {
    const ordered = sortedUnique([startMs, ...points.filter(timeMs => timeMs > startMs && timeMs < endMs), endMs])
    ordered.slice(0, -1).forEach((timeMs, index) => interval(timeMs, ordered[index + 1]))
  }

  interval(0, showEndMs)
  const timeline = projectShowTimeline(source)
  timeline.scenes.forEach(range => interval(range.startMs, range.endMs))
  timeline.transitions.forEach(range => interval(range.startMs, range.endMs))
  timeline.boundaryTransitions.forEach(range => interval(range.startMs, range.endMs))
  timeline.rows.flatMap(row => row.cells).forEach(range => interval(range.startMs, range.endMs))
  const sourceSceneById = new Map(timeline.scenes.map(scene => [scene.sceneId, scene]))
  for (const scene of source.composition?.scenes ?? []) {
    const sceneRange = sourceSceneById.get(scene.sceneId)
    if (!sceneRange) continue
    for (const zone of scene.zones) {
      for (const placement of [...zone.main, ...zone.overlays.flatMap(layer => layer.placements)]) {
        interval(sceneRange.startMs + placement.startMs, sceneRange.startMs + placement.startMs + placement.durationMs)
      }
    }
    for (const track of scene.propertyTracks ?? []) {
      partition(
        sceneRange.startMs,
        sceneRange.endMs,
        track.keyframes.map(keyframe => sceneRange.startMs + keyframe.timeMs),
      )
    }
  }

  const clipById = new Map(converted.composition.clips.map(clip => [clip.id, clip]))
  for (const clip of converted.composition.clips) {
    partition(
      clip.startMs,
      clip.startMs + clip.durationMs,
      clip.appearance.keys.map(key => key.timeMs),
    )
  }
  for (const occurrence of converted.composition.layoutOccurrences) {
    interval(occurrence.startMs, occurrence.startMs + occurrence.durationMs)
    if (occurrence.incomingTransfer) {
      interval(occurrence.startMs, occurrence.startMs + occurrence.incomingTransfer.durationMs)
    }
  }
  for (const track of converted.composition.propertyTracks) {
    partition(
      track.activeStartMs,
      track.activeStartMs + track.activeDurationMs,
      track.keyframes.map(keyframe => keyframe.timeMs),
    )
  }
  for (const transition of converted.composition.transitions) {
    if (transition.wholeOutput) interval(transition.wholeOutput.startMs, transition.wholeOutput.startMs + transition.durationMs)
    for (const participant of transition.participants) {
      const from = clipById.get(participant.fromClipId)
      if (!from) continue
      const startMs = from.startMs + from.durationMs
      interval(startMs, startMs + transition.durationMs)
    }
  }
  return sortedUnique([
    ...intervalMidpoints,
    ...[...boundaries].flatMap(timeMs => [timeMs - 1, timeMs, timeMs + 1]),
  ].filter(timeMs => Number.isSafeInteger(timeMs) && timeMs >= 0 && timeMs < showEndMs))
}

function mapPoints(dimension: 1 | 2 | 3): MapPoint[] {
  return Array.from({ length: 8 }, (_, index) => {
    const x = index / 7
    const sample = dimension === 1 ? [x] : dimension === 2 ? [x, 0.5] : [x, 0.5, 0.25]
    return { sample, pos: [x, 0.5] }
  })
}

function outputDimension(show: ShowRecord): 1 | 2 | 3 {
  if (show.outputContract.kind === 'portable-2d') return 2
  const map = show.stageMapId ? stockMapSpec(show.stageMapId) : undefined
  return map?.dim ?? 2
}

function summarize(records: CorpusEntry[]) {
  return {
    total: records.length,
    byOutcome: Object.fromEntries(sortedUnique(records.map(record => record.outcome)).map(outcome => [outcome, records.filter(record => record.outcome === outcome).length])),
    byRefusalCode: Object.fromEntries(sortedUnique(records.flatMap(record => record.refusalCodes)).map(code => [code, records.filter(record => record.refusalCodes.includes(code)).length])),
    parityFailures: records.filter(record => record.parity && (!record.parity.fast.matched || !record.parity.precise.matched)).map(record => `${record.corpus}:${record.corpusId}`),
    acceptedSilentRuntimeDifferences: records.filter(record => record.acceptedSemanticDifference).map(record => `${record.corpus}:${record.corpusId}`),
    unexpectedParityFailures: records.filter(record => record.parity && (!record.parity.fast.matched || !record.parity.precise.matched) && !record.acceptedSemanticDifference).map(record => `${record.corpus}:${record.corpusId}`),
    lifecycleObservations: {
      secondLoopParityFailures: records.filter(record => record.parity && (!record.parity.fast.secondLoopMatched || !record.parity.precise.secondLoopMatched)).map(record => `${record.corpus}:${record.corpusId}`),
      coldSeekSemanticFailures: records.filter(record => record.parity && (!record.parity.fast.coldSeekMatchedContinuous || !record.parity.precise.coldSeekMatchedContinuous)).map(record => `${record.corpus}:${record.corpusId}`),
      fixedStepFreshPhaseResiduals: records.filter(record => record.parity && (!record.parity.fast.loopResetMatched || !record.parity.precise.loopResetMatched)).map(record => `${record.corpus}:${record.corpusId}`),
    },
  }
}

function scalar(value: unknown): boolean {
  return value === null || ['string', 'number', 'boolean'].includes(typeof value)
}

function differentKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return sortedUnique([...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter(key => stableJson(left[key]) !== stableJson(right[key])))
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]))
  }
  return value
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function sortedUnique<T extends string | number>(values: T[]): T[] {
  return [...new Set(values)].sort((a, b) => typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b)))
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
