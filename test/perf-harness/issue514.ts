// Machine-readable no-emission resource census for issue #514.
// Run with: npx tsx test/perf-harness/issue514.ts

import { bundle } from '../../src/engine/bundle'
import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { compileShow } from '../../src/engine/showCompiler'
import { compileShowForPreview } from '../../src/engine/showPreviewArtifact'
import {
  buildShowVmResourceLedger,
  countShowPersistentGlobals,
  type ShowVmResourceLedger,
} from '../../src/engine/showVmResourceLedger'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'

type CensusCaseKind =
  | 'stock-pattern'
  | 'saved-show'
  | 'array-heavy-fixture'
  | 'five-pattern-acceptance'

export interface ShowVmHeadroomCase {
  id: string
  name: string
  kind: CensusCaseKind
  representative: boolean
  memberCount: number
  pixelCount: number
  memberAllocationCount: number
  unboundedAllocationCount: number
  renderTargetWords: number
  memberPatternWords: number
  generatedOverheadWords: number
  remainingWords: number
  persistentGlobals: number
  remainingGlobals: number
  artifactBytes: number
  remainingArtifactBytes: number
  rejectionReasons: string[]
  failsSolelyBecauseOfReservation: boolean
}

const encoder = new TextEncoder()

function censusCase(
  input: Pick<ShowVmHeadroomCase, 'id' | 'name' | 'kind' | 'representative' | 'memberCount'>,
  ledger: ShowVmResourceLedger,
): ShowVmHeadroomCase {
  const generatedOverheadWords = ledger.routingWords + ledger.planWords + ledger.auxiliaryCacheWords
  const rejectionReasons = ledger.blockers.map((blocker) => blocker.message)
  const nonReservationWords = ledger.totalWords - ledger.renderTargetWords
  const wordBudgetIsOnlyFailure = ledger.blockers.length === 1
    && ledger.blockers[0].kind === 'vm-word-budget'
  return {
    ...input,
    pixelCount: ledger.pixelCount,
    memberAllocationCount: ledger.allocations.filter((allocation) => allocation.category === 'member-pattern').length,
    unboundedAllocationCount: ledger.blockers.filter((blocker) => blocker.kind === 'unbounded-allocation').length,
    renderTargetWords: ledger.renderTargetWords,
    memberPatternWords: ledger.memberPatternWords,
    generatedOverheadWords,
    remainingWords: ledger.remainingWords,
    persistentGlobals: ledger.persistentGlobals,
    remainingGlobals: ledger.remainingGlobals,
    artifactBytes: ledger.artifactBytes,
    remainingArtifactBytes: ledger.remainingArtifactBytes,
    rejectionReasons,
    failsSolelyBecauseOfReservation: wordBudgetIsOnlyFailure
      && nonReservationWords <= ledger.vmWordBudget,
  }
}

function stockPatternCases(): ShowVmHeadroomCase[] {
  return Object.entries(DEMOS)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, source]) => {
      const compiled = bundle(source, LIBRARIES).code
      const ledger = buildShowVmResourceLedger({
        pixelCount: 2_000,
        members: [{ owner: name, source: compiled }],
        persistentGlobals: countShowPersistentGlobals(compiled),
        artifactBytes: encoder.encode(compiled).byteLength,
      })
      return censusCase({
        id: `pattern:${name}`,
        name,
        kind: 'stock-pattern',
        representative: false,
        memberCount: 1,
      }, ledger)
    })
}

function savedShowCases(): ShowVmHeadroomCase[] {
  return STOCK_SHOWS.filter((stockShow) => (
    stockShow.show.outputContract?.kind === 'portable-2d'
    || stockShow.show.outputContract?.pixelCount === 2_000
  )).map((stockShow) => {
    const show = stockShow.show
    const map = show.stageMapId
      ? SOURCE_STOCK_MAPS.find((candidate) => candidate.id === show.stageMapId)
      : undefined
    const compiled = compileShowForPreview(
      show,
      [],
      installationPhysicalZones(show),
      {},
      { stageDimension: map?.dim ?? 2 },
    )
    if (!compiled.artifact) {
      return {
        id: `show:${stockShow.id}`,
        name: stockShow.name,
        kind: 'saved-show' as const,
        representative: true,
        memberCount: show.composition?.patternInstances.length ?? show.cells.length,
        pixelCount: 2_000,
        memberAllocationCount: 0,
        unboundedAllocationCount: 0,
        renderTargetWords: 6_012,
        memberPatternWords: 0,
        generatedOverheadWords: 0,
        remainingWords: 4_228,
        persistentGlobals: 0,
        remainingGlobals: 256,
        artifactBytes: 0,
        remainingArtifactBytes: 68_384,
        rejectionReasons: [compiled.error ?? 'Show compile failed'],
        failsSolelyBecauseOfReservation: false,
      }
    }
    return censusCase({
      id: `show:${stockShow.id}`,
      name: stockShow.name,
      kind: 'saved-show',
      representative: true,
      memberCount: compiled.artifact.summary.clipCount,
    }, compiled.artifact.summary.resources)
  })
}

function arrayFixture(id: string, elementCount: number): ShowVmHeadroomCase {
  const ledger = buildShowVmResourceLedger({
    pixelCount: 2_000,
    members: [{
      owner: id,
      source: `var cache = array(${elementCount})\nexport function render(index) { rgb(cache[index], 0, 0) }`,
    }],
  })
  return censusCase({
    id: `fixture:${id}`,
    name: id,
    kind: 'array-heavy-fixture',
    representative: false,
    memberCount: 1,
  }, ledger)
}

function fivePatternAcceptanceCase(): ShowVmHeadroomCase {
  const source = DEMOS.ClockworkIris
  const clips = Array.from({ length: 5 }, (_, index) => ({
    id: `clockwork-${index + 1}`,
    source,
  }))
  const artifact = compileShow({
    masterPixelCount: 2_000,
    clips,
    sceneSequence: {
      scenes: clips.map((clip, index) => ({
        clipId: clip.id,
        holdMs: 6_000,
        ...(index < clips.length - 1
          ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } }
          : {}),
      })),
    },
    loopDurationMs: 30_000,
  }, LIBRARIES)
  return censusCase({
    id: 'acceptance:five-clockwork-members',
    name: 'Five Clockwork Iris members over 30 seconds',
    kind: 'five-pattern-acceptance',
    representative: true,
    memberCount: 5,
  }, artifact.summary.resources)
}

const patterns = stockPatternCases()
const cases = [
  ...patterns,
  ...savedShowCases(),
  arrayFixture('array-residual-edge', 4_224),
  arrayFixture('array-residual-overflow', 4_225),
  fivePatternAcceptanceCase(),
]
const representativeReservationFailures = cases
  .filter((entry) => entry.representative && entry.failsSolelyBecauseOfReservation)
  .map((entry) => ({ id: entry.id, name: entry.name, rejectionReasons: entry.rejectionReasons }))
const stockPatternRejections = patterns.filter((entry) => entry.rejectionReasons.length > 0)
const savedShows = cases.filter((entry) => entry.kind === 'saved-show')
const savedShowRejections = savedShows.filter((entry) => entry.rejectionReasons.length > 0)

export const report = {
  schemaVersion: 1,
  issue: 514,
  pixelCount: 2_000,
  renderTargetWords: 6_012,
  residualWords: 4_228,
  cases,
  summary: {
    stockPatternCount: patterns.length,
    stockPatternsWithNoMemberArrays: patterns.filter((entry) => (
      entry.memberAllocationCount === 0 && entry.unboundedAllocationCount === 0
    )).length,
    stockPatternsFittingResidualBudget: patterns.filter((entry) => entry.rejectionReasons.length === 0).length,
    stockPatternRejections,
    savedShowCount: savedShows.length,
    savedShowRejections,
  },
  decision: {
    allowArenaImplementation: representativeReservationFailures.length === 0,
    representativeReservationFailures,
  },
}

if (process.argv[1]?.endsWith('/issue514.ts')) {
  console.log(JSON.stringify(report, null, 2))
}
