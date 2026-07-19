import {
  stampArtifact,
  type ArtifactMapCompatibility,
  type ArtifactPreferredMap,
  type ArtifactShowOutputContract,
} from './artifactStamp'
import { makeProgramId } from './bytecodePush'
import { showEasingOptionId } from './showEasing'
import { STOCK_MAP_SPECS } from './maps'
import type { MapRecord, ShowRecord } from './personalContentRecords'
import { normalizeShowTransitionState } from './showModel'
import { buildStudioMapFingerprintCandidates } from './mapFingerprint'
import { buildShowPatternCreditLines, PXLBLZ_AUTHOR, type ShowArtifactAttribution, type ShowPatternAttribution } from './patternAttribution'

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

export function buildShowEpeExport(
  show: ShowRecord,
  generatedCode: string,
  options: ShowEpeExportOptions = {},
): ShowEpeExport {
  show = normalizeShowTransitionState(show)
  const name = show.name.trim() || 'Untitled Show'
  const hasSpatialTransitions = show.scenes.some((scene) => scene.transitionOut?.kind === 'portal')
  const mapMetadata = deriveShowArtifactMapMetadata(show, options.userMaps ?? [])
  const documentedSource = `${showArtifactHeader(show, mapMetadata, options.attribution)}\n${generatedCode}`
  const source = stampArtifact(documentedSource, {
    kind: 'show',
    id: show.id,
    name,
    transforms: [
      'show',
      ...(show.routingLayouts.length > 1 ? ['routing-layouts'] : []),
      ...(hasSpatialTransitions ? ['spatial-transitions'] : []),
    ],
    preferredMap: mapMetadata.preferredMap,
    compatibility: mapMetadata.compatibility,
    showOutputContract: mapMetadata.showOutputContract,
    stampedAt: options.stampedAt,
  })
  return {
    filename: `${epeFilenameStem(name)}.epe`,
    text: JSON.stringify({
      name,
      id: options.id ?? makeProgramId(),
      sources: { main: source },
      preview: options.preview ?? '',
    }, null, 2),
    source,
  }
}

function showArtifactHeader(
  show: ShowRecord,
  mapMetadata: ReturnType<typeof deriveShowArtifactMapMetadata>,
  attribution?: ShowArtifactAttribution,
): string {
  const uniquePatterns = new Map<string, { kind: string; id: string; name: string }>()
  for (const cell of show.cells) {
    const key = `${cell.pattern.kind}:${cell.pattern.id}`
    if (!uniquePatterns.has(key)) {
      uniquePatterns.set(key, {
        kind: cell.pattern.kind,
        id: cell.pattern.id,
        name: cell.patternName,
      })
    }
  }
  for (const instance of show.composition?.patternInstances ?? []) {
    const key = `${instance.pattern.kind}:${instance.pattern.id}`
    if (!uniquePatterns.has(key)) {
      uniquePatterns.set(key, {
        kind: instance.pattern.kind,
        id: instance.pattern.id,
        name: instance.patternName,
      })
    }
  }
  const attributionByKey = new Map((attribution?.patterns ?? []).map((pattern) => [
    `${pattern.kind}:${pattern.id}`,
    pattern,
  ]))
  const creditedPatterns: ShowPatternAttribution[] = [...uniquePatterns.values()].map((pattern) => ({
    kind: pattern.kind === 'user' ? 'user' : 'stock',
    id: pattern.id,
    name: pattern.name,
    authors: attributionByKey.get(`${pattern.kind}:${pattern.id}`)?.authors ?? [],
  }))
  const switchByScene = new Map(show.routingSwitches.map((routingSwitch) => [routingSwitch.afterSceneId, routingSwitch.layoutId]))
  const routingTransitionByScene = new Map((show.transitions ?? []).flatMap((transition) => (
    transition.kind === 'routing' ? [[transition.afterSceneId, transition] as const] : []
  )))
  const layoutName = new Map(show.routingLayouts.map((layout) => [layout.id, layout.name]))
  const lines = [
    '/*',
    ` * Compiled PXLBLZ Show: ${commentText(show.name.trim() || 'Untitled Show')}`,
    ` * By: ${(attribution?.by?.length ? attribution.by : [PXLBLZ_AUTHOR]).map(commentText).join('; ')}`,
    ' *',
    ' * Source Patterns:',
    ...creditedPatterns.map((pattern) => {
      const line = buildShowPatternCreditLines([pattern])[0] ?? `- ${commentText(pattern.name)}`
      return ` * ${line} [${pattern.kind}:${commentText(pattern.id)}]`
    }),
    ...(creditedPatterns.some((pattern) => pattern.authors.length > 0)
      ? [' *   Pattern authors are carried as structured IDE metadata so comments may be stripped safely.']
      : [
          ' *   Pattern author metadata was not recorded for these sources.',
          ' *   If original comments are stripped later, this exported Show cannot recover missing author names.',
        ]
    ),
    ' *',
    ` * Routing Layouts: ${show.routingLayouts.map((layout) => commentText(layout.name)).join(' -> ') || 'Default'}`,
    ...(mapMetadata.preferredMap
      ? [` * Preferred map: ${commentText(mapMetadata.preferredMap.name)} [${preferredMapReference(mapMetadata.preferredMap)}].`]
      : [' * Preferred map: none recorded.']),
    ` * Compatibility: ${describeMapCompatibility(mapMetadata.compatibility)}`,
    ...(mapMetadata.showOutputContract
      ? [` * Output contract: ${describeShowOutputContract(mapMetadata.showOutputContract)}`]
      : []),
    ' * Scenes:',
    ...show.scenes.map((scene) => {
      const destinationId = switchByScene.get(scene.id)
      const routingTransition = routingTransitionByScene.get(scene.id)
      const routingNote = destinationId
        ? routingTransition && routingTransition.durationMs > 0
          ? `: transfer ${routingTransition.routingDirection ?? 'forward'} to ${commentText(layoutName.get(destinationId) ?? destinationId)} over ${formatSeconds(routingTransition.durationMs)} (${showEasingOptionId(routingTransition.easing)}) after scene`
          : `: switch to ${commentText(layoutName.get(destinationId) ?? destinationId)} after scene`
        : ''
      const transitionNote = scene.transitionOut ? `: ${describeTransition(scene.transitionOut)}` : ''
      return ` * - ${commentText(scene.name)} (${formatSeconds(scene.durationMs)})${transitionNote}${routingNote}`
    }),
    ' *',
    ' * Generated orchestration follows; member bindings are isolated with collision-safe prefixes.',
    ' * This file is an ordinary standalone Pixelblaze Pattern after compilation.',
    ' */',
  ]
  return lines.join('\n')
}

function deriveShowArtifactMapMetadata(
  show: ShowRecord,
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
  show: ShowRecord,
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

function preferredMapReference(map: ArtifactPreferredMap): string {
  return map.kind === 'stock' ? `stock:${map.id}` : 'custom map name'
}

function describeMapCompatibility(compatibility: ArtifactMapCompatibility): string {
  const dimensions = compatibility.dimensions.map((dimension) => `${dimension}D`).join('/') || 'unspecified-dimension'
  const classes = compatibility.mapClasses.join('/') || 'unspecified-class'
  if (compatibility.exactMap) {
    return `installation-bound ${dimensions} ${classes} map at fixed resolution; this artifact expects the authored installation/map.`
  }
  return `adaptive ${dimensions} ${classes} maps at adaptive resolution; other compatible maps may change the composition.`
}

function describeShowOutputContract(contract: ArtifactShowOutputContract): string {
  if (contract.kind === 'installation') {
    return `Installation · ${contract.pixelCount} px fixed${contract.outputMap ? ` · ${contract.outputMap.name}` : ''}${contract.outputMap?.fingerprint ? ` · fingerprint ${contract.outputMap.fingerprint}` : ''}`
  }
  const classes = contract.mapClasses.join('/') || 'compatible'
  const aspect = contract.aspectRatio ? ` · aspect ${contract.aspectRatio.min}:${contract.aspectRatio.max}` : ''
  return `Portable 2D · variable resolution · compatible ${classes} maps${aspect}`
}

function describeTransition(transition: NonNullable<ShowRecord['scenes'][number]['transitionOut']>): string {
  if (transition.kind !== 'portal') {
    return `${transition.kind} ${formatSeconds(transition.durationMs)}`
  }
  const centerX = formatNormalized(transition.centerX ?? 0.5)
  const centerY = formatNormalized(transition.centerY ?? 0.5)
  const feather = formatNormalized(transition.feather ?? 0.12)
  const direction = transition.invert ? 'inward' : 'outward'
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

function epeFilenameStem(name: string): string {
  return name
    .normalize('NFKD')
    .split('')
    .filter((character) => character.charCodeAt(0) <= 0x7f)
    .join('')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'show'
}

function commentText(value: string): string {
  return value.replace(/\*\//g, '* /').replace(/[\r\n]+/g, ' ')
}

function formatSeconds(durationMs: number): string {
  const seconds = Math.max(0, durationMs) / 1000
  return `${Number.isInteger(seconds) ? seconds : seconds.toFixed(1)}s`
}
