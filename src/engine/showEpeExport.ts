import {
  stampArtifact,
  type ArtifactMapCompatibility,
  type ArtifactPreferredMap,
} from './artifactStamp'
import { makeProgramId } from './bytecodePush'
import { STOCK_MAP_SPECS } from './maps'
import type { MapRecord, ShowRecord } from './personalContentRecords'
import { normalizeShowTransitionState } from './showModel'

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
  const documentedSource = `${showArtifactHeader(show, mapMetadata)}\n${generatedCode}`
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
  const switchByScene = new Map(show.routingSwitches.map((routingSwitch) => [routingSwitch.afterSceneId, routingSwitch.layoutId]))
  const layoutName = new Map(show.routingLayouts.map((layout) => [layout.id, layout.name]))
  const lines = [
    '/*',
    ` * Compiled PXLBLZ Show: ${commentText(show.name.trim() || 'Untitled Show')}`,
    ' *',
    ' * Source Patterns:',
    ...[...uniquePatterns.values()].map((pattern) => (
      ` * - ${commentText(pattern.name)} [${pattern.kind}:${commentText(pattern.id)}]`
    )),
    ' *   Detailed provenance and license comments remain embedded in each isolated member source.',
    ' *',
    ` * Routing Layouts: ${show.routingLayouts.map((layout) => commentText(layout.name)).join(' -> ') || 'Default'}`,
    ...(mapMetadata.preferredMap
      ? [` * Preferred map: ${commentText(mapMetadata.preferredMap.name)} [${preferredMapReference(mapMetadata.preferredMap)}].`]
      : [' * Preferred map: none recorded.']),
    ` * Compatibility: ${describeMapCompatibility(mapMetadata.compatibility)}`,
    ' * Scenes:',
    ...show.scenes.map((scene) => {
      const destinationId = switchByScene.get(scene.id)
      const routingNote = destinationId
        ? `: switch to ${commentText(layoutName.get(destinationId) ?? destinationId)} after scene`
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
): { preferredMap?: ArtifactPreferredMap; compatibility: ArtifactMapCompatibility } {
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
  return {
    preferredMap,
    compatibility: {
      portability: adaptive ? 'adaptive' : 'installation-bound',
      dimensions: dimension ? [dimension] : [],
      mapClasses: mapClass ? [mapClass] : [],
      resolution: adaptive ? 'adaptive' : 'fixed',
      exactMap: !adaptive,
    },
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

function describeTransition(transition: NonNullable<ShowRecord['scenes'][number]['transitionOut']>): string {
  if (transition.kind !== 'portal') {
    return `${transition.kind} ${formatSeconds(transition.durationMs)}`
  }
  const centerX = formatNormalized(transition.centerX ?? 0.5)
  const centerY = formatNormalized(transition.centerY ?? 0.5)
  const feather = formatNormalized(transition.feather ?? 0.12)
  const direction = transition.invert ? 'inward' : 'outward'
  const policy = transition.featherPolicy === 'blend' ? 'blend' : 'dither'
  return `portal ${formatSeconds(transition.durationMs)}, center ${centerX}/${centerY}, ${direction}, ${policy} feather ${feather}`
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
