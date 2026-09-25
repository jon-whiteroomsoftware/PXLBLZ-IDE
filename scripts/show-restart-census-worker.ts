import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BASELINE_FIXTURES,
  resolveBaselineFixtureRecord,
  type BaselineFixture,
} from '../src/agent-harness/baseline/fixtures'
import { projectShowGroupRuntimePatternInstances } from '../src/engine/showGroupModel'
import { stockMapSpec } from '../src/engine/maps'
import type {
  LibraryRecord,
  PatternRecord,
  ShowPatternRef,
  ShowRecord,
} from '../src/engine/personalContentRecords'
import { compileShow } from '../src/engine/showCompiler'
import type { ShowRecordV2 } from '../src/engine/showCompositionV2'
import { prepareShowV2ForCompile } from '../src/engine/showCompositionLoweringV2'
import { compileMember } from '../src/engine/showMemberLowering'
import type { ShowCompileRecipeSourceLookup } from '../src/engine/showModel'
import {
  convertShowRecordV1ToV2,
  type ShowV1ToV2Report,
} from '../src/engine/showRecordV1ToV2'
import { LIBRARIES } from '../src/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '../src/pixelblaze/stock/patterns'
import { V1_STOCK_SHOWS, v1StockShowById } from '../src/test/v1StockShowsFixture'

type CorpusInput = { corpus: 'stock' | 'agent-baseline'; corpusId: string; show: ShowRecord; fixture?: BaselineFixture }
export function buildShowRestartCensus() {
const inputs: CorpusInput[] = [
  ...V1_STOCK_SHOWS.map(item => ({ corpus: 'stock' as const, corpusId: item.id, show: structuredClone(item.show) })),
  ...BASELINE_FIXTURES.map(fixture => ({
    corpus: 'agent-baseline' as const,
    corpusId: fixture.id,
    show: resolveBaselineFixtureRecord(fixture, id => v1StockShowById(id)?.show),
    fixture,
  })),
]

const sourceProfile = buildSourceProfile()
const qualificationRows: Array<Record<string, unknown>> = []

for (const input of inputs) {
  const libraries = librarySources(input.fixture)
  const lookup = sourceLookup(input.show, input.fixture)
  const conversion = convertShowRecordV1ToV2(input.show, lookup)
  if (conversion.status === 'refused') throw new Error(`${input.corpus}:${input.corpusId} conversion refused: ${JSON.stringify(conversion.issues)}`)
  const projectedLookup = sourceLookupWithFlatProjection(lookup, conversion.report.flatProjectionMappings)
  const continued = withEntryPolicy(conversion.record, 'continue')
  const continuedPreparation = prepareShowV2ForCompile(continued, projectedLookup, { libraries })
  if (continuedPreparation.status === 'refused') throw new Error(`${input.corpus}:${input.corpusId} Continue preparation refused: ${JSON.stringify(continuedPreparation.issues)}`)
  const dependencyIdBySourceHash = patternIdsBySourceHash(input.show, input.fixture)
  const continuedArtifact = compileShow(continuedPreparation.recipe, libraries, { patternSlotSharing: 'none' })
  for (const variant of singleAuthoredRestartVariants(conversion.record)) {
    const source = projectedLookup.byPatternInstanceId[variant.instanceId]
    if (!source) throw new Error(`${input.corpus}:${input.corpusId} missing source for ${variant.instanceId}`)
    const sourceHash = sha256(source)
    const patternIds = dependencyIdBySourceHash.get(sourceHash) ?? [`unmapped:${sourceHash.slice(0, 12)}`]
    const preparation = prepareShowV2ForCompile(variant.record, projectedLookup, { libraries })
    if (preparation.status === 'refused') {
      qualificationRows.push({
        corpus: input.corpus, corpusId: input.corpusId, authoredPath: variant.path,
        instanceId: variant.instanceId, patternIds, status: 'refused', issues: preparation.issues,
      })
      continue
    }
    const eventClipIds = [...new Set((preparation.recipe.restartEvents ?? []).map(event => event.clipId))]
    if (eventClipIds.length === 0) throw new Error(`${input.corpus}:${input.corpusId}:${variant.path} produced no Restart event`)
    for (const eventClipId of eventClipIds) {
      const recipe = {
        ...preparation.recipe,
        restartEvents: preparation.recipe.restartEvents!.filter(event => event.clipId === eventClipId),
      }
      const artifact = compileShow(recipe, libraries, { patternSlotSharing: 'none' })
      const member = artifact.summary.clips.find(clip => clip.id === eventClipId)
      qualificationRows.push({
        corpus: input.corpus, corpusId: input.corpusId, authoredPath: variant.path,
        instanceId: variant.instanceId, eventClipId, patternIds, status: 'ready',
        baselineCount: artifact.expandedCode.match(new RegExp(`\\bvar\\s+${member?.prefix ?? '__missing__'}_restart_initial(?:_\\d+)?\\s*=`, 'g'))?.length ?? 0,
        persistentGlobals: artifact.summary.resources.persistentGlobals,
        continuedPersistentGlobals: continuedArtifact.summary.resources.persistentGlobals,
        persistentGlobalDelta: artifact.summary.resources.persistentGlobals - continuedArtifact.summary.resources.persistentGlobals,
        persistentGlobalBlocker: artifact.summary.resources.blockers.some(blocker => blocker.kind === 'persistent-global-limit'),
        artifactBytes: artifact.summary.artifactBytes,
        continuedArtifactBytes: continuedArtifact.summary.artifactBytes,
        artifactByteDelta: artifact.summary.artifactBytes - continuedArtifact.summary.artifactBytes,
      })
    }
  }
}

const byPattern = new Map<string, Array<Record<string, unknown>>>()
for (const row of qualificationRows) for (const id of row.patternIds as string[]) {
  byPattern.set(id, [...(byPattern.get(id) ?? []), row])
}
const patternRows = [...byPattern].sort(([left], [right]) => left.localeCompare(right)).map(([patternId, rows]) => ({
  patternId,
  status: rows.some(row => row.status === 'refused') ? 'refused' : 'ready',
  observations: rows.length,
  reasons: [...new Set(rows.flatMap(row => row.status === 'refused'
    ? (row.issues as Array<{ message: string }>).map(issue => issue.message)
    : []))],
  baselineCounts: [...new Set(rows.filter(row => row.status === 'ready').map(row => Number(row.baselineCount)))].sort((a, b) => a - b),
  maximumPersistentGlobals: Math.max(0, ...rows.filter(row => row.status === 'ready').map(row => Number(row.persistentGlobals))),
  anyPersistentGlobalBlocker: rows.some(row => row.persistentGlobalBlocker === true),
}))
const report = {
  schemaVersion: 1,
  issue: 1037,
  measuredAt: '2026-09-15',
  method: 'One authored Restart source at a time through prepareShowV2ForCompile; each effective event clip compiled alone.',
  corpus: { records: inputs.length, stockRecords: V1_STOCK_SHOWS.length, agentBaselineRecords: BASELINE_FIXTURES.length, uniquePatternDependencies: patternRows.length },
  summary: {
    sourceAdmittedPatternDependencies: sourceProfile.summary.admitted,
    sourceRefusedPatternDependencies: sourceProfile.summary.refused,
    legacyAdmittedPatternDependencies: sourceProfile.summary.legacyAdmitted,
    newlyRefusedPatternDependencies: sourceProfile.summary.newlyRefused,
    publicAdmittedPatternDependencies: patternRows.filter(row => row.status === 'ready').length,
    publicRefusedPatternDependencies: patternRows.filter(row => row.status === 'refused').length,
    qualificationObservations: qualificationRows.length,
    readyObservations: qualificationRows.filter(row => row.status === 'ready').length,
    refusedObservations: qualificationRows.filter(row => row.status === 'refused').length,
    admittedPatternsWithPersistentGlobalBlocker: patternRows.filter(row => row.status === 'ready' && row.anyPersistentGlobalBlocker).map(row => row.patternId),
  },
  interpretation: {
    persistentGlobalLimit: 256,
    publicResourceBlockersAreSeparateFromSourceEligibility: true,
    allRestartStress: {
      classification: 'optional stress; not an ordinary compatibility profile',
      compiledRecords: 11,
      sourceEligibilityRefusedRecords: 36,
      peakPersistentGlobals: 386,
      peakRecord: 'stock:stock-show-showcase-luma-sources',
    },
  },
  sourceProfile,
  patternDependencies: patternRows,
  qualifications: qualificationRows,
}

return report
}

export function writeShowRestartCensus(
  report: ReturnType<typeof buildShowRestartCensus>,
): void {
  const out = resolve(
    new URL('..', import.meta.url).pathname,
    'docs/reference/evidence/issue-1037-animation/restart-census.json',
  )
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)
}

function buildSourceProfile() {
  const root = resolve(new URL('..', import.meta.url).pathname)
  const parity = JSON.parse(
    readFileSync(resolve(root, 'docs/plans/show-v2-parity-report.json'), 'utf8'),
  ) as {
    records: Array<{
      dependencies: Array<{ kind: string; resolvedId: string }>
    }>
  }
  const ids = [
    ...new Set(
      parity.records.flatMap((record) =>
        record.dependencies
          .filter((dependency) => dependency.kind === 'pattern')
          .map((dependency) => dependency.resolvedId),
      ),
    ),
  ].sort()
  const personal = new Map(
    BASELINE_FIXTURES.flatMap((fixture) => fixture.patterns ?? []).map(
      (pattern) => [pattern.id, pattern.src],
    ),
  )
  const personalLibraries = Object.fromEntries(
    BASELINE_FIXTURES.flatMap((fixture) => fixture.libraries ?? []).map(
      (library) => [library.name, library.src],
    ),
  )
  const patterns = ids.map((patternId, index) => {
    const source = DEMOS[patternId] ?? personal.get(patternId)
    if (!source) throw new Error(`Missing Pattern ${patternId}.`)
    const member = compileMember(
      { id: patternId, source },
      index,
      { ...LIBRARIES, ...personalLibraries },
    )
    const plan = member.restartPlan
    return {
      patternId,
      status: plan.status,
      legacyResettable: member.resettable,
      baselineCount: plan.status === 'ready' ? plan.bindings.length : 0,
      ...(plan.status === 'refused'
        ? { reason: plan.reason, message: plan.message, location: plan.location }
        : {}),
      facilities: restartFacilities(member),
    }
  })
  const newlyRefused = patterns.filter(
    (pattern) => pattern.legacyResettable && pattern.status === 'refused',
  )
  return {
    summary: {
      admitted: patterns.filter((pattern) => pattern.status === 'ready').length,
      refused: patterns.filter((pattern) => pattern.status === 'refused').length,
      legacyAdmitted: patterns.filter((pattern) => pattern.legacyResettable).length,
      newlyRefused: newlyRefused.map((pattern) => pattern.patternId),
      baselineMinimum: Math.min(
        ...patterns
          .filter((pattern) => pattern.status === 'ready')
          .map((pattern) => pattern.baselineCount),
      ),
      baselineMaximum: Math.max(
        ...patterns
          .filter((pattern) => pattern.status === 'ready')
          .map((pattern) => pattern.baselineCount),
      ),
      baselineTotal: patterns.reduce(
        (sum, pattern) => sum + pattern.baselineCount,
        0,
      ),
    },
    patterns,
  }
}

function withEntryPolicy(record: ShowRecordV2, entryPolicy: 'continue' | 'restart'): ShowRecordV2 {
  const copy = structuredClone(record)
  copy.composition.clips = copy.composition.clips.map(clip => ({ ...clip, entryPolicy }))
  copy.composition.groupDefinitions = copy.composition.groupDefinitions.map(definition => ({ ...definition, clips: definition.clips.map(clip => ({ ...clip, entryPolicy })) }))
  return copy
}

function singleAuthoredRestartVariants(record: ShowRecordV2): Array<{ path: string; instanceId: string; record: ShowRecordV2 }> {
  const continued = withEntryPolicy(record, 'continue')
  return [
    ...continued.composition.clips.map((clip, index) => ({
      path: `composition.clips[${index}]`, instanceId: clip.instanceId,
      record: { ...structuredClone(continued), composition: { ...structuredClone(continued.composition), clips: continued.composition.clips.map((candidate, candidateIndex) => ({ ...candidate, entryPolicy: candidateIndex === index ? 'restart' as const : 'continue' as const })) } },
    })),
    ...continued.composition.groupDefinitions.flatMap((definition, definitionIndex) => definition.clips.map((clip, clipIndex) => {
      const copy = structuredClone(continued)
      copy.composition.groupDefinitions[definitionIndex].clips[clipIndex].entryPolicy = 'restart'
      return { path: `composition.groupDefinitions[${definitionIndex}].clips[${clipIndex}]`, instanceId: clip.instanceId, record: copy }
    })),
  ]
}

function restartFacilities(member: ReturnType<typeof compileMember>): string[] {
  return [
    member.coordinateTransformBuiltins.length > 0 ? 'coordinate-transform' : null,
    member.usesMapPixels ? 'map-pixels' : null,
    member.usesPaint ? 'palette' : null,
    member.adaptation.steppedClock ? 'stepped-clock' : null,
    member.evaluationPolicy !== 'live' ? member.evaluationPolicy : null,
    member.resourceSource.includes('_time') ? 'elapsed-clock-or-time-call' : null,
  ].filter((value): value is string => value !== null)
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
  return { byCellId: Object.fromEntries(show.cells.map(cell => [cell.id, source(cell.pattern)])), byPatternInstanceId, stageDimension: outputDimension(show) }
}

function sourceLookupWithFlatProjection(lookup: ShowCompileRecipeSourceLookup, mappings: ShowV1ToV2Report['flatProjectionMappings']): ShowCompileRecipeSourceLookup {
  if (mappings.length === 0) return lookup
  const byPatternInstanceId = { ...lookup.byPatternInstanceId }
  for (const mapping of mappings) {
    const source = lookup.byCellId[mapping.cellId]
    if (source === undefined) throw new Error(`Flat projection has no exact Pattern source for cell "${mapping.cellId}".`)
    for (const instanceId of mapping.patternInstanceIds) {
      const existing = byPatternInstanceId[instanceId]
      if (existing !== undefined && existing !== source) throw new Error(`Conflicting Pattern sources for instance "${instanceId}".`)
      byPatternInstanceId[instanceId] = source
    }
  }
  return { ...lookup, byPatternInstanceId }
}

function patternIdsBySourceHash(show: ShowRecord, fixture?: BaselineFixture): Map<string, string[]> {
  const patterns = new Map((fixture?.patterns ?? []).map(pattern => [pattern.id, pattern]))
  const result = new Map<string, string[]>()
  const refs = [
    ...show.cells.map(cell => cell.pattern),
    ...(show.composition?.patternInstances ?? []).map(instance => instance.pattern),
    ...(show.composition?.groupDefinitions ?? []).flatMap(group => group.patternInstances.map(instance => instance.pattern)),
  ]
  for (const ref of refs) {
    const found = patternSource(ref, patterns)
    if (!found) continue
    const hash = sha256(found.source)
    result.set(hash, [...new Set([...(result.get(hash) ?? []), found.id])].sort())
  }
  return result
}

function patternSource(ref: ShowPatternRef, patterns: Map<string, PatternRecord>): { id: string; source: string } | undefined {
  if (ref.kind === 'stock') {
    const id = resolveStockPatternId(ref.id)
    return Object.prototype.hasOwnProperty.call(DEMOS, id) ? { id, source: DEMOS[id] } : undefined
  }
  const record = patterns.get(ref.id)
  return record ? { id: record.id, source: record.src } : undefined
}

function librarySources(fixture?: BaselineFixture): Record<string, string> {
  return { ...LIBRARIES, ...Object.fromEntries((fixture?.libraries ?? []).map((library: LibraryRecord) => [library.name, library.src])) }
}

function outputDimension(show: ShowRecord): 1 | 2 | 3 {
  if (show.outputContract.kind === 'portable-2d') return 2
  const map = show.stageMapId ? stockMapSpec(show.stageMapId) : undefined
  return map?.dim ?? 2
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}
