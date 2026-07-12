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
    preferredMap: banner.preferredMap,
    compatibility: banner.compatibility,
    stampedAt: banner.stamped,
  }
  const mapWarnings = banner.compatibility?.exactMap && banner.preferredMap
    ? [{
        kind: 'show-map-compatibility' as const,
        message: banner.preferredMap.kind === 'custom'
          ? `This Show expects its authored custom map "${banner.preferredMap.name}".`
          : `This Show expects its authored map "${banner.preferredMap.name}".`,
        detail: 'Sending the Show does not change the Controller\'s installed map. Confirm the Controller already has the intended map and installation geometry.',
      }]
    : []
  if (mapDim === null) {
    return { source: canonicalSource, artifactStamp: baseStamp, warnings: mapWarnings, blocked: false }
  }

  const base = bundleWithPasses(canonicalSource, {})
  const rendererPlan = planHardwareRenderer(mapDim, base.metadata.renderFns, firmwareVersion)
  const preflight = describePreflight({ mapDim, rendererPlan })
  if (!rendererPlan.adapterRequired) {
    return {
      source: canonicalSource,
      artifactStamp: baseStamp,
      warnings: [...mapWarnings, ...preflight.warnings],
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
    warnings: [...mapWarnings, ...preflight.warnings],
    blocked: preflight.blocking,
  }
}
