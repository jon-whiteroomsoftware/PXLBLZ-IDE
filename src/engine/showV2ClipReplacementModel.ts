import { bundle } from './bundle'
import { compileLibraries } from './libraries'
import { LIBRARIES } from '../pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '../pixelblaze/stock/patterns'
import { defaultGroupRuntimeIdV2, materializeShowGroupsV2 } from './showGroupsV2'
import type { ShowPatternRef } from './personalContentRecords'
import type { ShowPropertyTargetV2 } from './showCompositionV2'
import type { ResolvedShowPatternReplacementV2, ShowIndependentInstancePlanV2 } from './showClipsV2'
import type { ShowV2ClipSharingCapture } from './showV2ClipSharingEditorModel'

export interface ShowV2ClipReplacementIntent {
  kind: 'replace-pattern'
  clipId: string
  patternReference: ShowPatternRef
  independence?: ShowIndependentInstancePlanV2
}
export type ShowV2PatternReplacementResolution = { status: 'ready'; replacement: ResolvedShowPatternReplacementV2 } | { status: 'refused'; message: string }
export type ShowV2ClipReplacementPlan = { status: 'ready'; intent: ShowV2ClipReplacementIntent } | { status: 'refused'; message: string }
/** One immutable captured record/asset boundary shared by every replacement planner. */
export function capturedShowV2ReplacementContext(capture: ShowV2ClipSharingCapture) {
  return captured(capture)
}
function captured(capture: ShowV2ClipSharingCapture) {
  if (capture.inputCapture?.status === 'invalid') return null
  if (capture.inputCapture?.status === 'qualified') return { record: capture.inputCapture.inputs.record, assets: capture.inputCapture.inputs.assets }
  if (capture.prepared.status === 'ready') return { record: capture.prepared.bundle.record, assets: capture.prepared.bundle.assets }
  if (capture.prepared.status === 'empty') return { record: capture.prepared.record, assets: capture.dependencies }
  return null
}
/** Source/public controls come from one immutable captured bundle boundary; no callbacks execute. */
export function resolveCapturedShowPatternReplacementV2(capture: ShowV2ClipSharingCapture, reference: ShowPatternRef | undefined): ShowV2PatternReplacementResolution {
  const context = captured(capture)
  if (!context || !reference || !['stock', 'user'].includes(reference.kind) || typeof reference.id !== 'string' || !reference.id.trim()
    || Object.keys(reference).length !== 2 || !Object.prototype.hasOwnProperty.call(reference, 'kind') || !Object.prototype.hasOwnProperty.call(reference, 'id')) return { status: 'refused', message: 'Choose an available captured Pattern source.' }
  const pattern = reference.kind === 'user' ? context.assets.patterns.find(pattern => pattern.id === reference.id) : null
  const source = reference.kind === 'stock' ? DEMOS[resolveStockPatternId(reference.id)] : pattern?.src
  if (typeof source !== 'string') return { status: 'refused', message: 'The selected Pattern source is unavailable.' }
  const patternName = reference.kind === 'user' ? pattern?.name : reference.id
  if (typeof patternName !== 'string' || !patternName.trim()) return { status: 'refused', message: 'The selected Pattern name is unavailable.' }
  try {
    const libraries = !capture.inputCapture && capture.prepared.status === 'ready' ? capture.prepared.bundle.libraries : compileLibraries(LIBRARIES, context.assets.libraries)
    const metadata = bundle(source, libraries).metadata
    return { status: 'ready', replacement: { patternReference: { ...reference }, patternName, exportedSliders: metadata.controls.filter(control => control.kind === 'slider').map(control => ({ ...structuredClone(control), kind: 'slider' as const })) } }
  } catch (error) { return { status: 'refused', message: error instanceof Error ? `The selected Pattern cannot be resolved: ${error.message}` : 'The selected Pattern cannot be resolved.' } }
}
export type ShowV2ClipReplacementPreview =
  | { status: 'ready'; discardedControlTargets: ShowPropertyTargetV2[] }
  | { status: 'refused'; message: string }
/**
 * What replacing this ordinary Clip's Pattern would drop, before anything is
 * adopted. Section 6 keeps the loss report in the pure planner and the required
 * confirmation at the adapter: a cancelled confirmation adopts nothing.
 */
export function previewShowV2ClipReplacement(capture: ShowV2ClipSharingCapture, clipId: string, reference: ShowPatternRef | undefined): ShowV2ClipReplacementPreview {
  const context = captured(capture), clip = context?.record.composition.clips.find(clip => clip.id === clipId)
  if (!context || !clip) return { status: 'refused', message: 'Select an available ordinary Clip.' }
  const resolved = resolveCapturedShowPatternReplacementV2(capture, reference)
  if (resolved.status === 'refused') return resolved
  try {
    const effective = materializeShowGroupsV2(context.record)
    const source = effective.composition.patternInstances.find(instance => instance.id === clip.instanceId)
    if (!source) return { status: 'refused', message: 'Select an available ordinary Clip.' }
    const compatible = new Set(resolved.replacement.exportedSliders.map(control => control.exportName))
    const incompatible = (target: ShowPropertyTargetV2): boolean => target.kind === 'instance-control' && !compatible.has(target.exportName)
    const discardedControlTargets = effective.composition.propertyTracks
      .filter(track => 'instanceId' in track.target && track.target.instanceId === source.id && incompatible(track.target))
      .map(track => structuredClone(track.target))
    for (const exportName of Object.keys(source.controlTargets ?? {}).filter(name => !compatible.has(name))) {
      if (!discardedControlTargets.some(target => target.kind === 'instance-control' && target.exportName === exportName)) {
        discardedControlTargets.push({ kind: 'instance-control', instanceId: source.id, exportName })
      }
    }
    return { status: 'ready', discardedControlTargets }
  } catch (error) { return { status: 'refused', message: error instanceof Error ? error.message : 'Pattern replacement cannot be previewed.' } }
}
/** One explicit source; sharing is counted over every effective Clip, regardless visibility. */
export function createShowV2ClipReplacementIntent(capture: ShowV2ClipSharingCapture, clipId: string, reference: ShowPatternRef | undefined, allocate: () => string): ShowV2ClipReplacementPlan {
  const context = captured(capture), clip = context?.record.composition.clips.find(clip => clip.id === clipId)
  if (!context || !clip) return { status: 'refused', message: 'Select an available ordinary Clip.' }
  const resolved = resolveCapturedShowPatternReplacementV2(capture, reference)
  if (resolved.status === 'refused') return resolved
  try {
    const { record } = context, effective = materializeShowGroupsV2(record), source = record.composition.patternInstances.find(instance => instance.id === clip.instanceId)!
    const compatible = new Set(resolved.replacement.exportedSliders.map(control => control.exportName))
    const ownedTracks = effective.composition.propertyTracks.filter(track => 'instanceId' in track.target && track.target.instanceId === source.id)
    const retained = ownedTracks.filter(track => track.target.kind === 'instance-time-scale' || (track.target.kind === 'instance-control' && compatible.has(track.target.exportName)))
    const unchanged = source.pattern.kind === resolved.replacement.patternReference.kind && source.pattern.id === resolved.replacement.patternReference.id && source.patternName === resolved.replacement.patternName
      && Object.keys(source.controlTargets ?? {}).every(name => compatible.has(name)) && retained.length === ownedTracks.length
    const intent: ShowV2ClipReplacementIntent = { kind: 'replace-pattern', clipId, patternReference: { ...resolved.replacement.patternReference } }
    if (unchanged || effective.composition.clips.filter(clip => clip.instanceId === source.id).length <= 1) return { status: 'ready', intent }
    const used = new Set<string>()
    const visit = (value: unknown): void => {
      if (Array.isArray(value)) value.forEach(visit)
      else if (value && typeof value === 'object') { const item = value as Record<string, unknown>; if ((item.kind === 'user' || item.kind === 'stock') && Object.keys(item).length === 2) return; if (typeof item.id === 'string') used.add(item.id); Object.values(item).forEach(visit) }
    }
    visit(record); visit(effective)
    for (const definition of record.composition.groupDefinitions) for (const slot of definition.patternInstances) used.add(defaultGroupRuntimeIdV2(definition.id, slot.id))
    const mint = () => { const id = allocate(); if (typeof id !== 'string' || !id.trim() || used.has(id)) throw Error('Fresh replacement identities conflict. Try the edit again.'); used.add(id); return id }
    const instanceId = mint()
    intent.independence = { instanceId, identitiesBySourceTrackId: Object.fromEntries(retained.map(track => [track.id, { trackId: mint(), keyframeIdsBySourceId: Object.fromEntries(track.keyframes.map(key => [key.id, mint()])) }])) }
    return { status: 'ready', intent }
  } catch (error) { return { status: 'refused', message: error instanceof Error ? error.message : 'Pattern replacement identities are unavailable.' } }
}
