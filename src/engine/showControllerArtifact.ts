import { parsePxlblzBanner, stampArtifact, type ArtifactStampMeta } from './artifactStamp'
import { bundleWithPasses } from './passEngine'
import { describePreflight, type PreflightWarning } from './preflight'
import { planHardwareRenderer } from './renderCompatibility'

export interface PreparedShowControllerArtifact {
  source: string
  artifactStamp: ArtifactStampMeta
  warnings: PreflightWarning[]
  blocked: boolean
}

export function prepareShowControllerArtifact(
  canonicalSource: string,
  mapDim: 1 | 2 | 3 | null,
  firmwareVersion?: string,
): PreparedShowControllerArtifact {
  const banner = parsePxlblzBanner(canonicalSource)
  if (!banner || banner.kind !== 'show') {
    throw new Error('Generated Show source is missing its Show artifact provenance')
  }
  const baseStamp: ArtifactStampMeta = {
    kind: 'show',
    id: banner.id,
    name: banner.name,
    transforms: banner.transforms,
    stampedAt: banner.stamped,
  }
  if (mapDim === null) {
    return { source: canonicalSource, artifactStamp: baseStamp, warnings: [], blocked: false }
  }

  const base = bundleWithPasses(canonicalSource, {})
  const rendererPlan = planHardwareRenderer(mapDim, base.metadata.renderFns, firmwareVersion)
  const preflight = describePreflight({ mapDim, rendererPlan })
  if (!rendererPlan.adapterRequired) {
    return {
      source: canonicalSource,
      artifactStamp: baseStamp,
      warnings: preflight.warnings,
      blocked: preflight.blocking,
    }
  }

  const adapted = bundleWithPasses(canonicalSource, {}, [{
    id: 'renderer-adapter',
    kind: 'renderer-adapter',
    mapDim,
  }])
  const collision = adapted.warnings.find((warning) => warning.code === 'renderer-adapter-name-collision')
  if (collision) throw new Error(collision.message)
  const artifactStamp: ArtifactStampMeta = {
    ...baseStamp,
    transforms: [...new Set([...(baseStamp.transforms ?? []), 'renderer-adapter'])],
  }
  return {
    source: stampArtifact(adapted.code, artifactStamp),
    artifactStamp,
    warnings: preflight.warnings,
    blocked: preflight.blocking,
  }
}
