import { stampArtifact } from './artifactStamp'
import { makeProgramId } from './bytecodePush'
import type { ShowRecord } from './personalContentRecords'
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
}

export function buildShowEpeExport(
  show: ShowRecord,
  generatedCode: string,
  options: ShowEpeExportOptions = {},
): ShowEpeExport {
  show = normalizeShowTransitionState(show)
  const name = show.name.trim() || 'Untitled Show'
  const hasSpatialTransitions = show.scenes.some((scene) => scene.transitionOut?.kind === 'portal')
  const documentedSource = `${showArtifactHeader(show)}\n${generatedCode}`
  const source = stampArtifact(documentedSource, {
    kind: 'show',
    id: show.id,
    name,
    transforms: [
      'show',
      ...(show.routingLayouts.length > 1 ? ['routing-layouts'] : []),
      ...(hasSpatialTransitions ? ['spatial-transitions'] : []),
    ],
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

function showArtifactHeader(show: ShowRecord): string {
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
