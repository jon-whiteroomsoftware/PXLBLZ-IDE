import { commentText, deriveShowArtifactMapMetadata, describeMapCompatibility, describeShowOutputContract, describeTransition, epeFilenameStem, preferredMapReference, type ShowEpeExport, type ShowEpeExportOptions } from './showEpeExport'
import { validateShowRecordV2, type ShowRecordV2 } from './showCompositionV2'
import { materializeShowGroupsV2 } from './showGroupsV2'
import { stampArtifact } from './artifactStamp'
import { makeProgramId } from './bytecodePush'
import { buildShowPatternCreditLines, PXLBLZ_AUTHOR, type ShowPatternAttribution } from './patternAttribution'
import { showEasingOptionId } from './showEasing'
import { formatShowClipIdentity } from './showClipIdentity'

export type ShowEpeExportResultV2 = ({ status: 'exported' } & ShowEpeExport) | { status: 'refused'; code: 'invalid-record' | 'empty-show'; message: string }

/** Wrap already compiled code; source resolution and compilation stay upstream. */
export function buildShowEpeExportV2(record: ShowRecordV2, generatedCode: string, options: ShowEpeExportOptions = {}): ShowEpeExportResultV2 {
  const issues = validateShowRecordV2(record)
  if (issues.length) return { status: 'refused', code: 'invalid-record', message: `Invalid Show: ${issues[0].message}` }
  const effective = materializeShowGroupsV2(record)
  const effectiveIssues = validateShowRecordV2(effective)
  if (effectiveIssues.length) return { status: 'refused', code: 'invalid-record', message: `Invalid effective Show: ${effectiveIssues[0].message}` }
  if (!effective.composition.clips.length) return { status: 'refused', code: 'empty-show', message: 'Add content to the Show before exporting.' }
  const name = record.name.trim() || 'Untitled Show'
  const metadata = deriveShowArtifactMapMetadata({ stageMapId: record.stageMapId, outputContract: record.outputContract, routingLayouts: record.zoneLayouts }, options.userMaps ?? [])
  const instances = new Map(effective.composition.patternInstances.map(instance => [instance.id, instance]))
  const patterns = new Map<string, ShowPatternAttribution>()
  for (const clip of effective.composition.clips) {
    const instance = instances.get(clip.instanceId)!
    const key = JSON.stringify([instance.pattern.kind, instance.pattern.id])
    if (!patterns.has(key)) patterns.set(key, { kind: instance.pattern.kind, id: instance.pattern.id, name: instance.patternName,
      authors: options.attribution?.patterns.find(pattern => pattern.kind === instance.pattern.kind && pattern.id === instance.pattern.id)?.authors ?? [] })
  }
  const credits = [...patterns.values()]
  const layoutNames = new Map(record.zoneLayouts.map(layout => [layout.id, layout.name]))
  const clips = [...effective.composition.clips].sort((a, b) => a.startMs - b.startMs || lexical(a.id, b.id))
  const layouts = [...record.composition.layoutOccurrences].sort((a, b) => a.startMs - b.startMs || lexical(a.id, b.id))
  const transitions = effective.composition.transitions.map(transition => {
    const startMs = transition.wholeOutput?.startMs ?? Math.min(...transition.participants.map(participant => {
      const outgoing = effective.composition.clips.find(clip => clip.id === participant.fromClipId)!
      return outgoing.startMs + outgoing.durationMs
    }))
    return { transition, startMs }
  }).sort((a, b) => a.startMs - b.startMs || lexical(a.transition.id, b.transition.id))
  const lines = [
    '/*', ` * Compiled PXLBLZ Show: ${commentText(name)}`,
    ` * By: ${(options.attribution?.by?.length ? options.attribution.by : [PXLBLZ_AUTHOR]).map(commentText).join('; ')}`,
    ' *', ' * Source Patterns:',
    ...credits.map(pattern => ` * ${buildShowPatternCreditLines([pattern])[0]} [${pattern.kind}:${commentText(pattern.id)}]`),
    ...(credits.some(pattern => pattern.authors.length) ? [' *   Pattern authors are carried as structured IDE metadata so comments may be stripped safely.']
      : [' *   Pattern author metadata was not recorded for these sources.', ' *   If original comments are stripped later, this exported Show cannot recover missing author names.']),
    ' *',
    ...(metadata.preferredMap ? [` * Preferred map: ${commentText(metadata.preferredMap.name)} [${preferredMapReference(metadata.preferredMap)}].`] : [' * Preferred map: none recorded.']),
    ` * Compatibility: ${describeMapCompatibility(metadata.compatibility)}`,
    ...(metadata.showOutputContract ? [` * Output contract: ${commentText(describeShowOutputContract(metadata.showOutputContract))}`] : []),
    ' * Layout schedule:',
    ...layouts.map(layout => ` * - ${formatShowClipIdentity(layout.startMs, commentText(layoutNames.get(layout.layoutId)!))} (${layout.durationMs} ms)${layout.incomingTransfer ? `; transfer ${layout.incomingTransfer.direction} ${layout.incomingTransfer.durationMs} ms ease ${showEasingOptionId(layout.incomingTransfer.easing ?? { curve: 'linear' })} from ${commentText(layout.incomingTransfer.fromOccurrenceId)}` : ''} [start ${layout.startMs} ms]`),
    ' * Clip schedule:',
    ...clips.map(clip => ` * - ${formatShowClipIdentity(clip.startMs, commentText(instances.get(clip.instanceId)!.patternName))} (${clip.durationMs} ms) [${commentText(clip.id)}] [start ${clip.startMs} ms]`),
    ...(transitions.length ? [' *', ' * Transitions:', ...transitions.map(({ transition, startMs }) => ` * - ${formatShowClipIdentity(startMs, commentText(transition.id))}: ${describeTransition(transition)}; start ${startMs} ms; duration ${transition.durationMs} ms; ease ${showEasingOptionId(transition.easing)}`)] : []),
    ' *', ' * Generated orchestration follows; member bindings are isolated with collision-safe prefixes.',
    ' * This file is an ordinary standalone Pixelblaze Pattern after compilation.', ' */',
  ]
  const source = stampArtifact(`${lines.join('\n')}\n${generatedCode}`, { kind: 'show', id: record.id, name,
    transforms: ['show', ...(layouts.length > 1 ? ['routing-layouts'] : []), ...(transitions.some(({ transition }) => transition.kind === 'portal') ? ['spatial-transitions'] : [])],
    preferredMap: metadata.preferredMap, compatibility: metadata.compatibility, showOutputContract: metadata.showOutputContract, stampedAt: options.stampedAt })
  return { status: 'exported', filename: `${epeFilenameStem(name)}.epe`, source,
    text: JSON.stringify({ name, id: options.id ?? makeProgramId(), sources: { main: source }, preview: options.preview ?? '' }, null, 2) }
}

function lexical(a: string, b: string): number { return a < b ? -1 : a > b ? 1 : 0 }
