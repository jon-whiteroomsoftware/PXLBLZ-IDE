// Compile-only Restart-instance persistent-global census for issue #536.
// Run with: node --import tsx test/perf-harness/issue536.ts

import { installationPhysicalZones } from '../../src/engine/showInstallationCoverage'
import { compileShow, type ShowRecipe } from '../../src/engine/showCompiler'
import { showRecordToCompileRecipe } from '../../src/engine/showModel'
import type { ShowPatternRef, ShowRecord } from '../../src/engine/personalContentRecords'
import { SHOW_ARTIFACT_BUDGET_BYTES } from '../../src/engine/showVmResourceLedger'
import { LIBRARIES } from '../../src/pixelblaze/libs'
import { SOURCE_STOCK_MAPS } from '../../src/pixelblaze/stock/maps/stockCatalogue'
import { DEMOS } from '../../src/pixelblaze/stock/patterns'
import { STOCK_SHOWS } from '../../src/pixelblaze/stock/shows'
import { acceptanceRecipe } from './issue520'
import {
  analyzeCompiledRestartGlobalLiveness,
  type RestartGlobalExclusionReason,
} from './showRestartGlobalLiveness'

type RestartCensusKind = 'saved-show' | 'five-pattern-acceptance' | 'boundary-fixture'

export interface RestartGlobalCensusCase {
  id: string
  name: string
  kind: RestartCensusKind
  representative: boolean
  clipCount: number
  persistentGlobalsBefore: number
  persistentGlobalsAfter: number
  memberGlobalsBefore: number
  memberGlobalsAfter: number
  reclaimedGlobals: number
  reclaimPercent: number
  remainingGlobalsBefore: number
  remainingGlobalsAfter: number
  entryInitializationAssignments: number
  addedInitializerSymbols: number
  estimatedInitializerSourceBytes: number
  artifactBytesBefore: number
  artifactBytesAfterUpperBound: number
  remainingArtifactBytesBefore: number
  remainingArtifactBytesAfterUpperBound: number
  steadyStateRenderOperationsAdded: number
  excludedOwners: Array<{
    id: string
    globals: number
    reasons: RestartGlobalExclusionReason[]
    overlaps: string[]
  }>
  compileError: string | null
}

const GLOBAL_LIMIT = 256

function sourceForPattern(pattern: ShowPatternRef): string {
  return pattern.kind === 'stock' ? DEMOS[pattern.id] ?? DEMOS.TestPattern1D : DEMOS.TestPattern1D
}

const LEGACY_UNSHARED_REFERENCE_IDS = new Set([
  'stock-show-reference-wipe-mix-transitions',
  'stock-show-reference-shape-reveal-transitions',
  'stock-show-reference-easing',
])

function legacyUnsharedReferenceShow(show: ShowRecord): ShowRecord {
  const legacy = structuredClone(show)
  if (!LEGACY_UNSHARED_REFERENCE_IDS.has(legacy.id)) return legacy
  const composition = legacy.composition
  if (!composition || composition.patternInstances.length !== 3) return legacy
  const instanceById = new Map(composition.patternInstances.map((instance) => [instance.id, instance]))
  const backdrop = instanceById.get('instance-reference-backdrop')
  if (!backdrop) return legacy
  const patternInstances = [backdrop]
  composition.scenes.forEach((scene, index) => {
    const placement = scene.zones[0]?.overlays[0]?.placements[0]
    const shared = placement ? instanceById.get(placement.instanceId) : undefined
    if (!placement || !shared) return
    const instanceId = `instance-reference-content-${index + 1}`
    patternInstances.push({ ...shared, id: instanceId })
    placement.instanceId = instanceId
  })
  composition.patternInstances = patternInstances
  return legacy
}

function stockRecipe(index: number): ShowRecipe {
  const stock = STOCK_SHOWS[index]
  // #536 is a historical census. Preserve the Pattern-instance population it
  // measured even after #542 made these three stock references share instances.
  const show = legacyUnsharedReferenceShow(stock.show)
  const map = show.stageMapId
    ? SOURCE_STOCK_MAPS.find((candidate) => candidate.id === show.stageMapId)
    : undefined
  return showRecordToCompileRecipe(show, {
    byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, sourceForPattern(cell.pattern)])),
    byPatternInstanceId: Object.fromEntries((show.composition?.patternInstances ?? []).map((instance) => (
      [instance.id, sourceForPattern(instance.pattern)]
    ))),
    controllerZones: installationPhysicalZones(show),
    stageDimension: map?.dim ?? 2,
  })
}

function censusCase(
  input: Pick<RestartGlobalCensusCase, 'id' | 'name' | 'kind' | 'representative'>,
  recipe: ShowRecipe,
): RestartGlobalCensusCase {
  try {
    // Preserve the compile boundary that #536 measured. Later global-saving
    // passes (including #538 shared Effect kernels) must not retroactively
    // change the liveness census or its 15% decision denominator.
    const artifact = compileShow(recipe, LIBRARIES, {
      generatedEffectKernelSharing: false,
      patternSlotSharing: 'none',
      // #558 coefficient hoisting postdates the census; preserve its boundary.
      colorCoefficientHoisting: false,
    })
    // The final artifact is alpha-mangled. The expanded artifact retains the
    // stable member prefixes while declaring the same persistent globals.
    const liveness = analyzeCompiledRestartGlobalLiveness(recipe, artifact.expandedCode, {
      members: artifact.summary.clips.map((clip) => ({
        id: clip.id,
        renamedBindings: clip.renamedBindings,
        renamedPatternVars: clip.renamedPatternVars,
      })),
    })
    const activationTrackingGlobals = liveness.entryInitialization.ownerCount > 0
      ? liveness.entryInitialization.ownerCount + 1
      : 0
    const projectedMemberGlobals = liveness.globalsAfter + activationTrackingGlobals
    const selectReuse = projectedMemberGlobals < liveness.globalsBefore
    const memberGlobalsAfter = selectReuse ? projectedMemberGlobals : liveness.globalsBefore
    const reclaimedGlobals = liveness.globalsBefore - memberGlobalsAfter
    const addedInitializerSymbols = selectReuse ? activationTrackingGlobals : 0
    const estimatedInitializerSourceBytes = selectReuse
      ? liveness.entryInitialization.estimatedSourceBytes + 24
      : 0
    const persistentGlobalsBefore = artifact.summary.resources.persistentGlobals
    const persistentGlobalsAfter = persistentGlobalsBefore - reclaimedGlobals
    const artifactBytesBefore = artifact.summary.resources.artifactBytes
    const artifactBytesAfterUpperBound = artifactBytesBefore + estimatedInitializerSourceBytes
    return {
      ...input,
      clipCount: recipe.clips.length,
      persistentGlobalsBefore,
      persistentGlobalsAfter,
      memberGlobalsBefore: liveness.globalsBefore,
      memberGlobalsAfter,
      reclaimedGlobals,
      reclaimPercent: liveness.globalsBefore > 0 ? reclaimedGlobals / liveness.globalsBefore : 0,
      remainingGlobalsBefore: GLOBAL_LIMIT - persistentGlobalsBefore,
      remainingGlobalsAfter: GLOBAL_LIMIT - persistentGlobalsAfter,
      entryInitializationAssignments: selectReuse ? liveness.entryInitialization.assignmentCount : 0,
      addedInitializerSymbols,
      estimatedInitializerSourceBytes,
      artifactBytesBefore,
      artifactBytesAfterUpperBound,
      remainingArtifactBytesBefore: SHOW_ARTIFACT_BUDGET_BYTES - artifactBytesBefore,
      remainingArtifactBytesAfterUpperBound: SHOW_ARTIFACT_BUDGET_BYTES - artifactBytesAfterUpperBound,
      steadyStateRenderOperationsAdded: liveness.steadyStateRenderOperationsAdded,
      excludedOwners: liveness.owners
        .filter((owner) => owner.excludedGlobals > 0 || owner.exclusionReasons.length > 0)
        .map((owner) => ({
          id: owner.id,
          globals: owner.excludedGlobals,
          reasons: owner.exclusionReasons,
          overlaps: owner.overlaps,
        })),
      compileError: null,
    }
  } catch (error) {
    return {
      ...input,
      clipCount: recipe.clips.length,
      persistentGlobalsBefore: 0,
      persistentGlobalsAfter: 0,
      memberGlobalsBefore: 0,
      memberGlobalsAfter: 0,
      reclaimedGlobals: 0,
      reclaimPercent: 0,
      remainingGlobalsBefore: GLOBAL_LIMIT,
      remainingGlobalsAfter: GLOBAL_LIMIT,
      entryInitializationAssignments: 0,
      addedInitializerSymbols: 0,
      estimatedInitializerSourceBytes: 0,
      artifactBytesBefore: 0,
      artifactBytesAfterUpperBound: 0,
      remainingArtifactBytesBefore: SHOW_ARTIFACT_BUDGET_BYTES,
      remainingArtifactBytesAfterUpperBound: SHOW_ARTIFACT_BUDGET_BYTES,
      steadyStateRenderOperationsAdded: 0,
      excludedOwners: [],
      compileError: error instanceof Error ? error.message : 'Show compile failed',
    }
  }
}

const fixtureSource = `
var phase = 0
var gain = 1
export function beforeRender(delta) { phase = phase + delta * gain }
export function render(index) { rgb(phase, gain, index) }
`

function disjointRestartRecipe(): ShowRecipe {
  const clips = Array.from({ length: 5 }, (_, index) => ({ id: `restart-${index}`, source: fixtureSource }))
  return {
    clips,
    sceneSequence: {
      scenes: clips.map((clip, index) => ({
        clipId: clip.id,
        holdMs: 1_000,
        ...(index < clips.length - 1
          ? { transitionOut: { kind: 'cut' as const, durationMs: 0 } }
          : {}),
      })),
    },
    loopDurationMs: 5_000,
  }
}

function overlappingRestartRecipe(): ShowRecipe {
  const clips = Array.from({ length: 5 }, (_, index) => ({ id: `overlap-${index}`, source: fixtureSource }))
  const zones = clips.map((_, index) => ({
    id: `zone-${index}`,
    name: `zone-${index}`,
    ranges: [{ start: index * 10, end: index * 10 + 9 }],
  }))
  return {
    masterPixelCount: 50,
    clips,
    zones,
    routingLayouts: [{ id: 'all-zones', name: 'All zones', zones }],
    routedSceneSequence: {
      scenes: [
        {
          holdMs: 2_500,
          placements: clips.map((clip, index) => ({ zoneName: zones[index].name, clipId: clip.id })),
          transitionOut: { kind: 'cut', durationMs: 0 },
        },
        {
          holdMs: 2_500,
          placements: clips.map((clip, index) => ({ zoneName: zones[index].name, clipId: clip.id })),
        },
      ],
    },
    loopDurationMs: 5_000,
  }
}

const savedShowCases = STOCK_SHOWS.map((stock, index) => censusCase({
  id: `show:${stock.id}`,
  name: stock.name,
  kind: 'saved-show',
  representative: true,
}, stockRecipe(index)))

const cases: RestartGlobalCensusCase[] = [
  ...savedShowCases,
  censusCase({
    id: 'acceptance:five-pattern',
    name: 'Five-Pattern acceptance Show',
    kind: 'five-pattern-acceptance',
    representative: true,
  }, acceptanceRecipe('snapshot-live')),
  censusCase({
    id: 'fixture:five-disjoint-restarts',
    name: 'Five disjoint Restart members',
    kind: 'boundary-fixture',
    representative: false,
  }, disjointRestartRecipe()),
  censusCase({
    id: 'fixture:five-overlapping-restarts',
    name: 'Five overlapping Restart members',
    kind: 'boundary-fixture',
    representative: false,
  }, overlappingRestartRecipe()),
]

const representative = cases.filter((entry) => entry.representative && !entry.compileError)
const representativeMemberGlobals = representative.reduce((sum, entry) => sum + entry.memberGlobalsBefore, 0)
const representativeReclaimedGlobals = representative.reduce((sum, entry) => sum + entry.reclaimedGlobals, 0)
const weightedRepresentativeReclaimPercent = representativeMemberGlobals > 0
  ? representativeReclaimedGlobals / representativeMemberGlobals
  : 0
const representativeReclaimPercents = representative.map((entry) => entry.reclaimPercent).sort((left, right) => left - right)
const middle = Math.floor(representativeReclaimPercents.length / 2)
const representativeReclaimPercent = representativeReclaimPercents.length === 0
  ? 0
  : representativeReclaimPercents.length % 2 === 0
    ? (representativeReclaimPercents[middle - 1] + representativeReclaimPercents[middle]) / 2
    : representativeReclaimPercents[middle]
const ceilingRescues = representative
  .filter((entry) => entry.persistentGlobalsBefore > GLOBAL_LIMIT && entry.persistentGlobalsAfter <= GLOBAL_LIMIT)
  .map((entry) => ({
    id: entry.id,
    before: entry.persistentGlobalsBefore,
    after: entry.persistentGlobalsAfter,
  }))
const threshold = 0.15

export const report = {
  schemaVersion: 1,
  issue: 536,
  cases,
  summary: {
    savedShowCount: savedShowCases.length,
    compileFailures: cases
      .filter((entry) => entry.compileError)
      .map((entry) => ({ id: entry.id, error: entry.compileError! })),
    representativeMemberGlobals,
    representativeReclaimedGlobals,
  },
  decision: {
    threshold,
    representativeReclaimPercent,
    weightedRepresentativeReclaimPercent,
    ceilingRescues,
    proceedWithEmission: representativeReclaimPercent >= threshold || ceilingRescues.length > 0,
  },
}

if (process.argv[1]?.endsWith('/issue536.ts')) {
  console.log(JSON.stringify(report, null, 2))
}
