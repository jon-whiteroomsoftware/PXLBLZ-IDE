import {
  type ArtifactMapCompatibility,
  type ArtifactPreferredMap,
  type ArtifactShowOutputContract,
} from './artifactStamp'
import { STOCK_MAP_SPECS } from './maps'
import type { MapRecord, ShowBoundaryTransition, ShowOutputContract, ShowRoutingLayout } from './personalContentRecords'
import { buildStudioMapFingerprintCandidates } from './mapFingerprint'
import type { ShowArtifactAttribution } from './patternAttribution'

export interface ShowEpeExport {
  filename: string
  text: string
  source: string
}

export interface ShowEpeExportOptions {
  id?: string
  preview?: string
  stampedAt?: Date | string
  userMaps?: readonly MapRecord[]
  attribution?: ShowArtifactAttribution
}

export interface ShowEpeMapMetadataInput {
  stageMapId?: string | null
  outputContract?: ShowOutputContract
  routingLayouts: readonly ShowRoutingLayout[]
}

export function deriveShowArtifactMapMetadata(
  show: ShowEpeMapMetadataInput,
  userMaps: readonly MapRecord[],
): {
  preferredMap?: ArtifactPreferredMap
  compatibility: ArtifactMapCompatibility
  showOutputContract?: ArtifactShowOutputContract
} {
  const stock = show.stageMapId ? STOCK_MAP_SPECS.find((map) => map.id === show.stageMapId) : undefined
  const custom = show.stageMapId ? userMaps.find((map) => map.id === show.stageMapId) : undefined
  const preferredMap: ArtifactPreferredMap | undefined = stock
    ? { kind: 'stock', id: stock.id, name: stock.name }
    : custom
      ? { kind: 'custom', name: custom.name }
      : undefined
  const adaptive = show.routingLayouts.length > 0 && show.routingLayouts.every((layout) => layout.logical !== undefined)
  const dimension = stock?.dim ?? custom?.dim
  const mapClass = stock?.kind ?? (custom ? 'custom' : undefined)
  const showOutputContract = deriveArtifactShowOutputContract(show, userMaps, preferredMap)
  const contractPortable = show.outputContract?.kind === 'portable-2d'
  const contractInstallation = show.outputContract?.kind === 'installation'
  return {
    preferredMap,
    compatibility: {
      portability: contractPortable ? 'adaptive' : contractInstallation ? 'installation-bound' : adaptive ? 'adaptive' : 'installation-bound',
      dimensions: contractPortable ? [2] : dimension ? [dimension] : [],
      mapClasses: contractPortable ? ['surface'] : mapClass ? [mapClass] : [],
      resolution: contractPortable ? 'adaptive' : contractInstallation ? 'fixed' : adaptive ? 'adaptive' : 'fixed',
      exactMap: contractInstallation ? true : contractPortable ? false : !adaptive,
    },
    ...(showOutputContract ? { showOutputContract } : {}),
  }
}

function deriveArtifactShowOutputContract(
  show: ShowEpeMapMetadataInput,
  userMaps: readonly MapRecord[],
  preferredMap: ArtifactPreferredMap | undefined,
): ArtifactShowOutputContract | undefined {
  const contract = show.outputContract
  if (!contract) return undefined
  if (contract.kind === 'portable-2d') {
    return {
      version: 1,
      kind: 'portable-2d',
      dimensions: [2],
      mapClasses: ['surface'],
      resolution: 'variable',
    }
  }
  const fingerprint = contract.outputMapId
    ? buildStudioMapFingerprintCandidates({ userMaps: [...userMaps], pixelCount: contract.pixelCount })
      .find((candidate) => candidate.id === contract.outputMapId)?.hash
    : undefined
  const outputMap = preferredMap
    ? { ...preferredMap, ...(fingerprint ? { fingerprint } : {}) }
    : undefined
  return {
    version: 1,
    kind: 'installation',
    pixelCount: contract.pixelCount,
    ...(outputMap ? { outputMap } : {}),
  }
}

export function preferredMapReference(map: ArtifactPreferredMap): string {
  return map.kind === 'stock' ? `stock:${map.id}` : 'custom map name'
}

export function describeMapCompatibility(compatibility: ArtifactMapCompatibility): string {
  const dimensions = compatibility.dimensions.map((dimension) => `${dimension}D`).join('/') || 'unspecified-dimension'
  const classes = compatibility.mapClasses.join('/') || 'unspecified-class'
  if (compatibility.exactMap) {
    return `installation-bound ${dimensions} ${classes} map at fixed resolution; this artifact expects the authored installation/map.`
  }
  return `adaptive ${dimensions} ${classes} maps at adaptive resolution; other compatible maps may change the composition.`
}

export function describeShowOutputContract(contract: ArtifactShowOutputContract): string {
  if (contract.kind === 'installation') {
    return `Installation · ${contract.pixelCount} px fixed${contract.outputMap ? ` · ${contract.outputMap.name}` : ''}${contract.outputMap?.fingerprint ? ` · fingerprint ${contract.outputMap.fingerprint}` : ''}`
  }
  const classes = contract.mapClasses.join('/') || 'compatible'
  const aspect = contract.aspectRatio ? ` · aspect ${contract.aspectRatio.min}:${contract.aspectRatio.max}` : ''
  return `Portable 2D · variable resolution · compatible ${classes} maps${aspect}`
}

export function describeTransition(transition: Omit<ShowBoundaryTransition, 'afterSceneId'>): string {
  if (transition.kind !== 'portal') {
    return `${transition.kind} ${formatSeconds(transition.durationMs)}`
  }
  const centerX = formatNormalized(transition.centerX ?? 0.5)
  const centerY = formatNormalized(transition.centerY ?? 0.5)
  const feather = formatNormalized(transition.feather ?? 0.12)
  const direction = transition.revealMode === 'shrink-outgoing' ? 'inward' : 'outward'
  const policy = transition.featherPolicy === 'blend' ? 'blend' : 'dither'
  if (!transition.shape) {
    return `portal ${formatSeconds(transition.durationMs)}, center ${centerX}/${centerY}, ${direction}, ${policy} feather ${feather}`
  }
  const shape = transition.shape ?? 'circle'
  const shapeDetails = shape === 'diamond'
    ? `, rotation ${transition.rotation ?? 0}, spin ${transition.spin ?? 0}`
    : shape === 'ring'
      ? `, width ${transition.ringWidth ?? 0.12}`
      : ''
  return `${shape} ${formatSeconds(transition.durationMs)}, center ${centerX}/${centerY}, scale ${transition.scale ?? 1}${shapeDetails}, ${direction}, ${policy} feather ${feather}`
}

function formatNormalized(value: number): string {
  return String(Number(Math.max(0, Math.min(1, value)).toFixed(3)))
}

export function epeFilenameStem(name: string, fallback = 'show'): string {
  return name
    .normalize('NFKD')
    .split('')
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || fallback
}

export function commentText(value: string): string {
  return value.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ')
}

function formatSeconds(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
}
