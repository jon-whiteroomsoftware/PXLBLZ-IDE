import {
  parsePxlblzBanner,
  stampArtifact,
  type ArtifactMapClass,
  type ArtifactShowOutputContract,
  type ArtifactStampMeta,
} from './artifactStamp'
import { bundleWithPasses } from './passEngine'
import { describePreflight, type PreflightWarning } from './preflight'
import { planHardwareRenderer } from './renderCompatibility'

export interface PreparedShowControllerArtifact {
  source: string
  artifactStamp: ArtifactStampMeta
  warnings: PreflightWarning[]
  blocked: boolean
}

export interface ShowControllerCompatibilityContext {
  pixelCount?: number
  map?: {
    id?: string
    name?: string
    fingerprint?: string
    mapClass?: ArtifactMapClass
    aspectRatio?: number
  }
}

export function prepareShowControllerArtifact(
  canonicalSource: string,
  mapDim: 1 | 2 | 3 | null,
  firmwareVersion?: string,
  controller: ShowControllerCompatibilityContext = {},
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
    showOutputContract: banner.showOutputContract,
    stampedAt: banner.stamped,
  }
  const contractComparison = compareShowOutputContract(banner.showOutputContract, mapDim, controller)
  const legacyMapWarnings = !banner.showOutputContract && banner.compatibility?.exactMap && banner.preferredMap
    ? [{
        kind: 'show-map-compatibility' as const,
        message: banner.preferredMap.kind === 'custom'
          ? `This Show expects its authored custom map "${banner.preferredMap.name}".`
          : `This Show expects its authored map "${banner.preferredMap.name}".`,
        detail: 'Sending the Show does not change the Controller\'s installed map. Confirm the Controller already has the intended map and installation geometry.',
      }]
    : []
  const mapWarnings = [...contractComparison.warnings, ...legacyMapWarnings]
  if (mapDim === null) {
    return { source: canonicalSource, artifactStamp: baseStamp, warnings: mapWarnings, blocked: contractComparison.blocked }
  }

  const base = bundleWithPasses(canonicalSource, {})
  const rendererPlan = planHardwareRenderer(mapDim, base.metadata.renderFns, firmwareVersion)
  const preflight = describePreflight({ mapDim, rendererPlan })
  if (!rendererPlan.adapterRequired) {
    return {
      source: canonicalSource,
      artifactStamp: baseStamp,
      warnings: [...mapWarnings, ...preflight.warnings],
      blocked: contractComparison.blocked || preflight.blocking,
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
    blocked: contractComparison.blocked || preflight.blocking,
  }
}

function compareShowOutputContract(
  contract: ArtifactShowOutputContract | undefined,
  mapDim: 1 | 2 | 3 | null,
  controller: ShowControllerCompatibilityContext,
): { warnings: PreflightWarning[]; blocked: boolean } {
  if (!contract) return { warnings: [], blocked: false }
  const warnings: PreflightWarning[] = []
  let blocked = false
  const add = (message: string, detail: string, isBlocking: boolean) => {
    warnings.push({ kind: 'show-map-compatibility', message, detail })
    blocked ||= isBlocking
  }

  if (contract.kind === 'portable-2d') {
    if (mapDim !== null && !contract.dimensions.includes(mapDim as 2)) {
      add(
        `This Portable Show promises 2D mapped surfaces; the Controller reports a ${mapDim}D map.`,
        'Portable compatibility is advisory at send time. Sending does not replace the Controller map.',
        false,
      )
    }
    const mapClass = controller.map?.mapClass
    if (mapClass && !contract.mapClasses.includes(mapClass)) {
      add(
        `This Portable Show promises compatible ${contract.mapClasses.join('/')} maps; the Controller map is classified as ${mapClass}.`,
        'Review the composition on this Controller before sending. The reference preview map and count are not exact requirements.',
        false,
      )
    }
    const aspect = controller.map?.aspectRatio
    if (aspect && contract.aspectRatio && (aspect < contract.aspectRatio.min || aspect > contract.aspectRatio.max)) {
      add(
        `This Portable Show expects aspect ${contract.aspectRatio.min}-${contract.aspectRatio.max}; the Controller map reports ${aspect}.`,
        'Position-based zones may become narrow or empty. Sending does not replace the Controller map.',
        false,
      )
    }
    return { warnings, blocked }
  }

  if (controller.pixelCount !== undefined && controller.pixelCount !== contract.pixelCount) {
    add(
      `This Installation Show requires ${contract.pixelCount} pixels; the Controller reports ${controller.pixelCount}.`,
      'Choose the intended Controller or change its physical setup explicitly before sending. Sending the Show does not change pixel count or map.',
      true,
    )
  }
  const expected = contract.outputMap
  if (!expected) return { warnings, blocked }
  const installed = controller.map
  const fingerprintMismatch = Boolean(expected.fingerprint && installed?.fingerprint && expected.fingerprint !== installed.fingerprint)
  const identityMismatch = expected.kind === 'stock'
    ? Boolean(installed?.id && installed.id !== expected.id)
    : Boolean(installed?.name && installed.name !== expected.name)
  if (fingerprintMismatch) {
    add(
      'This Installation Show map fingerprint does not match the Controller map.',
      `The artifact expects "${expected.name}". Choose the intended Controller or install the map explicitly; sending the Show never changes the shared map.`,
      true,
    )
  } else if (identityMismatch) {
    add(
      `This Installation Show expects map "${expected.name}"; the Controller reports "${installed?.name ?? installed?.id}".`,
      'Choose the intended Controller or install the map explicitly; sending the Show never changes the shared map.',
      true,
    )
  } else if (!installed || (expected.fingerprint && !installed.fingerprint)) {
    add(
      `This Installation Show expects its authored map "${expected.name}".`,
      'The Controller map identity cannot be confirmed. Confirm the physical map before sending; the Show will not install or change it.',
      false,
    )
  }
  return { warnings, blocked }
}
