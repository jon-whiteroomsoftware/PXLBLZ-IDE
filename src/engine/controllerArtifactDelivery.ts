import type { ControllerProfile } from './controllerProfile'
import { controllerProfilePassRecipe } from './controllerProfilePassRecipe'
import {
  bundleWithPasses,
  type GeneratedPatternArtifact,
  type PassRecipe,
  type PassSummary,
} from './passEngine'

export function artifactTransformIds(
  passes: Array<Pick<PassSummary, 'id' | 'kind'>>,
): string[] {
  const ids = new Set<string>()
  for (const pass of passes) {
    ids.add(pass.id.replace(/-(sample|drive)$/, ''))
  }
  return [...ids]
}

export interface PreparedControllerArtifactDelivery {
  source: string
  transformIds: string[]
  bundled: GeneratedPatternArtifact | null
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
}: {
  source: string
  profile: ControllerProfile | null | undefined
  artifactId?: string | null
  libraries?: Record<string, string>
  extraPasses?: PassRecipe
}): PreparedControllerArtifactDelivery {
  const recipe = [
    ...controllerProfilePassRecipe(profile, source, artifactId),
    ...extraPasses,
  ]
  if (recipe.length === 0) return { source, transformIds: [], bundled: null }
  const bundled = bundleWithPasses(source, libraries, recipe)
  return {
    source: bundled.code,
    transformIds: artifactTransformIds(bundled.summary.passes),
    bundled,
  }
}
