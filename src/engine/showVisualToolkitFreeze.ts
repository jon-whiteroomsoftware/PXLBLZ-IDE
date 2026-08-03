import {
  SHOW_VISUAL_TOOLKIT_REGISTRY,
  validateShowToolkitRegistry,
  type ShowToolkitKind,
} from './showVisualToolkit'
import {
  createShowEffectToolkitFixtureRecipes,
  createShowPropertyToolkitFixtureRecipes,
  createShowToolkitFixtureRecipes,
  type ShowToolkitFixtureRecipe,
} from './showVisualToolkitFixtures'
import { compileShow } from './showCompiler'

export const SHOW_VISUAL_TOOLKIT_CONTRACT_VERSION = 14

export interface FrozenShowToolkitVariant {
  kind: ShowToolkitKind
  familyId: string
  id: string
  fixtureIds: string[]
}

export interface ShowVisualToolkitFreeze {
  version: number
  fingerprint: string
  variants: FrozenShowToolkitVariant[]
  fixtureIds: string[]
  errors: string[]
}

export interface ShowVisualToolkitFreezeMeasurement {
  fixtureCount: number
  patternFormulaCounts: Record<'N' | 'N + E' | '2N' | 'S * N', number>
  maxArtifact: { fixtureId: string; artifactBytes: number; budgetBytes: number; budgetRatio: number }
  maxGeneratedScalarGlobals: { fixtureId: string; value: number }
  maxGeneratedArrayElements: { fixtureId: string; value: number }
  compatibilityWarningFixtureIds: string[]
  overBudgetFixtureIds: string[]
  /** Populated only by the representative-device gate. */
  representativeHardwareFps: number | null
}

export function allShowVisualToolkitFixtures(): ShowToolkitFixtureRecipe[] {
  return [
    ...createShowPropertyToolkitFixtureRecipes(),
    ...createShowEffectToolkitFixtureRecipes(),
    ...createShowToolkitFixtureRecipes(),
  ]
}

export function buildShowVisualToolkitFreeze(
  fixtures: readonly ShowToolkitFixtureRecipe[] = allShowVisualToolkitFixtures(),
): ShowVisualToolkitFreeze {
  const errors = [...validateShowToolkitRegistry()]
  const fixtureIds = new Set<string>()
  for (const fixture of fixtures) {
    if (fixtureIds.has(fixture.id)) errors.push(`Duplicate fixture ${fixture.id}.`)
    fixtureIds.add(fixture.id)
    const family = SHOW_VISUAL_TOOLKIT_REGISTRY.find((candidate) => candidate.id === fixture.familyId)
    if (!family) {
      errors.push(`Fixture ${fixture.id} references unknown family ${fixture.familyId}.`)
      continue
    }
    for (const variantId of [fixture.variantId, ...(fixture.coveredVariantIds ?? [])]) {
      if (!family.variants.some((variant) => variant.id === variantId)) {
        errors.push(`Fixture ${fixture.id} references unknown variant ${fixture.familyId}:${variantId}.`)
      }
    }
  }

  const variants = SHOW_VISUAL_TOOLKIT_REGISTRY.flatMap((family) => family.variants.map((variant): FrozenShowToolkitVariant => {
    const matching = fixtures.filter((fixture) => (
      fixture.familyId === family.id
      && (fixture.variantId === variant.id || fixture.coveredVariantIds?.includes(variant.id))
    )).map((fixture) => fixture.id)
    if (matching.length === 0) errors.push(`Missing fixture for ${family.kind}:${family.id}:${variant.id}.`)
    return { kind: family.kind, familyId: family.id, id: variant.id, fixtureIds: matching }
  }))

  const signature = stableStringify({
    version: SHOW_VISUAL_TOOLKIT_CONTRACT_VERSION,
    registry: SHOW_VISUAL_TOOLKIT_REGISTRY,
    variants,
    fixtures: fixtures.map((fixture) => ({
      id: fixture.id,
      familyId: fixture.familyId,
      variantId: fixture.variantId,
      coveredVariantIds: fixture.coveredVariantIds,
      recipe: fixture.recipe,
      persistedRecord: Object.fromEntries(
        Object.entries(fixture.persistedRecord).filter(([key]) => key !== 'updatedAt'),
      ),
      progressSamples: fixture.progressSamples,
      capturePixelCount: fixture.capturePixelCount,
      stageDimension: fixture.stageDimension,
      captureStartMs: fixture.captureStartMs,
    })),
  })
  return {
    version: SHOW_VISUAL_TOOLKIT_CONTRACT_VERSION,
    fingerprint: fnv1a(signature),
    variants,
    fixtureIds: [...fixtureIds],
    errors,
  }
}

export function measureShowVisualToolkitFreeze(): ShowVisualToolkitFreezeMeasurement {
  const fixtures = allShowVisualToolkitFixtures()
  const patternFormulaCounts = { N: 0, 'N + E': 0, '2N': 0, 'S * N': 0 }
  let maxArtifact = { fixtureId: '', artifactBytes: 0, budgetBytes: 0, budgetRatio: 0 }
  let maxGeneratedScalarGlobals = { fixtureId: '', value: 0 }
  let maxGeneratedArrayElements = { fixtureId: fixtures[0]?.id ?? '', value: 0 }
  const compatibilityWarningFixtureIds: string[] = []
  const overBudgetFixtureIds: string[] = []
  for (const fixture of fixtures) {
    const cost = compileShow(fixture.recipe, {}).summary.cost
    patternFormulaCounts[cost.cpu.patternEvaluations.formula] += 1
    if (cost.code.artifactBytes > maxArtifact.artifactBytes) {
      maxArtifact = { fixtureId: fixture.id, ...cost.code }
    }
    if (cost.memory.generatedScalarGlobals > maxGeneratedScalarGlobals.value) {
      maxGeneratedScalarGlobals = { fixtureId: fixture.id, value: cost.memory.generatedScalarGlobals }
    }
    if (cost.memory.generatedArrayElements > maxGeneratedArrayElements.value) {
      maxGeneratedArrayElements = { fixtureId: fixture.id, value: cost.memory.generatedArrayElements }
    }
    if (cost.compatibility.warnings.length > 0) compatibilityWarningFixtureIds.push(fixture.id)
    if (cost.code.artifactBytes >= cost.code.budgetBytes) overBudgetFixtureIds.push(fixture.id)
  }
  return {
    fixtureCount: fixtures.length,
    patternFormulaCounts,
    maxArtifact,
    maxGeneratedScalarGlobals,
    maxGeneratedArrayElements,
    compatibilityWarningFixtureIds,
    overBudgetFixtureIds,
    representativeHardwareFps: null,
  }
}

function stableStringify(value: unknown): string {
  return JSON.stringify(sortSignatureValue(value))
}

function sortSignatureValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortSignatureValue)
  if (value === null || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
      .map(([key, entry]) => [key, sortSignatureValue(entry)]),
  )
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}
