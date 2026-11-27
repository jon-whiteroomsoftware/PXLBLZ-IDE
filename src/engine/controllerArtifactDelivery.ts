import {
  enabledControllerWrappers,
  wrapperInputsFor,
  type ControllerProfile,
  type ControllerWrapperOutcome,
} from './controllerProfile'
import { controllerProfileArtifactSignature, controllerProfilePassRecipe } from './controllerProfilePassRecipe'
import type { MapDimension } from './renderCompatibility'
import {
  bundleWithPasses,
  type GeneratedPatternArtifact,
  type PassRecipe,
  type PassSummary,
} from './passEngine'

export function artifactTransformIds(
  passes: Array<Pick<PassSummary, 'id' | 'kind' | 'wrappers'>>,
): string[] {
  const ids = new Set<string>()
  for (const pass of passes) {
    if (pass.kind === 'wrappers') {
      for (const wrapper of pass.wrappers?.applied ?? []) ids.add(wrapper)
      continue
    }
    if (pass.id.endsWith('-sample')) continue
    ids.add(pass.id.endsWith('-drive') ? pass.id.slice(0, -'-drive'.length) : pass.id)
  }
  return [...ids]
}

export interface PreparedControllerArtifactDelivery {
  source: string
  transformIds: string[]
  bundled: GeneratedPatternArtifact | null
  profileSignature: string
  wrapperOutcome?: ControllerWrapperOutcome
}

/** Build the exact Controller-specific derivative produced by active profile
 * transforms plus any caller-owned passes. The canonical Pattern or Show stays
 * unchanged; this derivative is what the Controller compiler receives. */
export function prepareControllerArtifactDelivery({
  source,
  profile,
  artifactId,
  libraries = {},
  extraPasses = [],
  pixelCount,
  mapDim,
  alwaysBundle = false,
}: {
  source: string
  profile: ControllerProfile | null | undefined
  artifactId?: string | null
  libraries?: Record<string, string>
  extraPasses?: PassRecipe
  pixelCount?: number | null
  mapDim?: MapDimension | null
  alwaysBundle?: boolean
}): PreparedControllerArtifactDelivery {
  const enabled = enabledControllerWrappers(profile, artifactId)
  let wrapperOutcome: ControllerWrapperOutcome | undefined = artifactId?.startsWith('show:')
    ? undefined
    : { applied: [], skipped: {} }
  let bundled: GeneratedPatternArtifact | null = null
  if (enabled.length > 0) {
    if (typeof pixelCount !== 'number' || !Number.isSafeInteger(pixelCount) || pixelCount <= 0) {
      throw new Error('Controller pixel count is unavailable.')
    }
    const candidate = bundleWithPasses(source, libraries, [
      ...controllerProfilePassRecipe(profile, source, artifactId, pixelCount),
      ...extraPasses,
    ])
    const decision = candidate.summary.passes.find((pass) => pass.kind === 'wrappers')?.wrappers
    if (!decision) throw new Error('Controller Wrapper decision is unavailable.')
    wrapperOutcome = { applied: decision.applied, skipped: decision.skipped }
    if (decision.inputs?.length) {
      const driven = wrapperInputsFor(profile, artifactId)
      const inputs: NonNullable<ControllerWrapperOutcome['inputs']> = {}
      for (const type of decision.inputs) {
        const input = driven[type]
        if (input) inputs[type] = { inputId: input.id, name: input.name }
      }
      wrapperOutcome.inputs = inputs
    }
    if (decision.applied.length > 0) bundled = candidate
  }
  if (!bundled) {
    // A complete skip retains the legacy pass order and emitted bytes.
    const recipe = [...controllerProfilePassRecipe(profile, source, artifactId), ...extraPasses]
    if (alwaysBundle || recipe.length) bundled = bundleWithPasses(source, libraries, recipe)
  }
  const transformIds = bundled ? artifactTransformIds(bundled.summary.passes) : []
  return {
    source: bundled?.code ?? source,
    transformIds,
    bundled,
    profileSignature: controllerProfileArtifactSignature(
      profile, artifactId, mapDim === undefined ? undefined : { mapDim }, wrapperOutcome?.applied ?? [],
    ),
    ...(wrapperOutcome ? { wrapperOutcome } : {}),
  }
}
