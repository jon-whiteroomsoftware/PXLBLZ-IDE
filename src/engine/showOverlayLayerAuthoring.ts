import type { ShowCompositionV1, ShowRecord, ShowZoneComposition } from './personalContentRecords'
import { validateShowComposition } from './showCompositionModel'

type LayerIndexMap = Record<number, number | null>

export type ShowOverlayLayerAuthoringResult =
  | {
      status: 'changed'
      composition: ShowCompositionV1
      layerIdsBySceneId: Record<string, string>
      indexMap: LayerIndexMap
    }
  | { status: 'noop'; composition: ShowCompositionV1 }
  | {
      status: 'refused'
      code: 'invalid-request' | 'missing-target' | 'unsupported-topology' | 'layer-not-empty' | 'domain-refusal'
      reason: string
      candidates?: string[]
    }

type ResolvedOverlayStack = {
  sceneId: string
  zone: ShowZoneComposition
}

type StackResolution =
  | { ok: true; stacks: ResolvedOverlayStack[]; layerCount: number }
  | { ok: false; refusal: Extract<ShowOverlayLayerAuthoringResult, { status: 'refused' }> }

function refuse(
  code: Extract<ShowOverlayLayerAuthoringResult, { status: 'refused' }>['code'],
  reason: string,
  candidates?: string[],
): Extract<ShowOverlayLayerAuthoringResult, { status: 'refused' }> {
  return { status: 'refused', code, reason, ...(candidates ? { candidates } : {}) }
}

/** Resolve the finite Layer domain once from the current private candidate. */
function resolveOverlayStacks(
  show: ShowRecord,
  composition: ShowCompositionV1,
  zoneId: string,
): StackResolution {
  if (typeof zoneId !== 'string' || !zoneId) {
    return { ok: false, refusal: refuse('invalid-request', 'Use a nonempty Zone id.') }
  }
  if (!show.zones.some(zone => zone.id === zoneId)) {
    return { ok: false, refusal: refuse('missing-target', `No Zone has id "${zoneId}".`) }
  }
  if (composition.scenes.length === 0) {
    return { ok: false, refusal: refuse('unsupported-topology', 'Timeline-wide Layer edits require at least one composition Scene.') }
  }
  if (validateShowComposition(show, composition).length > 0) {
    return { ok: false, refusal: refuse('domain-refusal', 'The composition is invalid.') }
  }
  if ((composition.groupOccurrences ?? []).some(occurrence => occurrence.zoneId === zoneId)) {
    return {
      ok: false,
      refusal: refuse(
        'unsupported-topology',
        `Zone ${zoneId} contains a Group occurrence; timeline-wide Layer reorder and removal currently support explicit Layers only.`,
      ),
    }
  }
  const stacks = composition.scenes.flatMap((scene): ResolvedOverlayStack[] => {
    const zone = scene.zones.find(candidate => candidate.zoneId === zoneId)
    return zone ? [{ sceneId: scene.sceneId, zone }] : []
  })
  if (stacks.length !== composition.scenes.length) {
    return { ok: false, refusal: refuse('missing-target', `Zone ${zoneId} must have an explicit row in every composition Scene.`) }
  }
  const counts = new Set(stacks.map(stack => stack.zone.overlays.length))
  if (counts.size !== 1) {
    return {
      ok: false,
      refusal: refuse(
        'unsupported-topology',
        `Zone ${zoneId} has nonuniform explicit overlay stacks across Scenes; timeline-wide Layer edits require equal counts.`,
      ),
    }
  }
  return { ok: true, stacks, layerCount: stacks[0].zone.overlays.length }
}

function indexRefusal(zoneId: string, index: number, layerCount: number): Extract<ShowOverlayLayerAuthoringResult, { status: 'refused' }> | null {
  if (!Number.isSafeInteger(index) || index < 0) {
    return refuse('invalid-request', 'Overlay Layer indices must be nonnegative safe integers.')
  }
  if (index >= layerCount) {
    const available = layerCount === 0 ? 'none' : `0–${layerCount - 1}`
    return refuse('missing-target', `Zone ${zoneId} has ${layerCount} overlay Layers; available indices: ${available}.`)
  }
  return null
}

function selectedIds(stacks: ResolvedOverlayStack[], layerIndex: number): Record<string, string> {
  return Object.fromEntries(stacks.map(stack => [stack.sceneId, stack.zone.overlays[layerIndex].id]))
}

export function reorderShowOverlayLayerAcrossTimeline(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { zoneId: string; fromIndex: number; toIndex: number },
): ShowOverlayLayerAuthoringResult {
  const resolved = resolveOverlayStacks(show, composition, input.zoneId)
  if (!resolved.ok) return resolved.refusal
  const fromIssue = indexRefusal(input.zoneId, input.fromIndex, resolved.layerCount)
  if (fromIssue) return fromIssue
  const toIssue = indexRefusal(input.zoneId, input.toIndex, resolved.layerCount)
  if (toIssue) return toIssue
  if (input.fromIndex === input.toIndex) return { status: 'noop', composition }

  const layerIdsBySceneId = selectedIds(resolved.stacks, input.fromIndex)
  const order = Array.from({ length: resolved.layerCount }, (_value, index) => index)
  const [selected] = order.splice(input.fromIndex, 1)
  order.splice(input.toIndex, 0, selected)
  const indexMap = Object.fromEntries(order.map((oldIndex, newIndex) => [oldIndex, newIndex]))
  const draft = structuredClone(composition)
  for (const scene of draft.scenes) {
    const zone = scene.zones.find(candidate => candidate.zoneId === input.zoneId)!
    const [layer] = zone.overlays.splice(input.fromIndex, 1)
    zone.overlays.splice(input.toIndex, 0, layer)
  }
  if (validateShowComposition(show, draft).length > 0) {
    return refuse('domain-refusal', 'The requested Layer reorder would produce an invalid composition.')
  }
  return { status: 'changed', composition: draft, layerIdsBySceneId, indexMap }
}

export function removeEmptyShowOverlayLayerAcrossTimeline(
  show: ShowRecord,
  composition: ShowCompositionV1,
  input: { zoneId: string; layerIndex: number },
): ShowOverlayLayerAuthoringResult {
  const resolved = resolveOverlayStacks(show, composition, input.zoneId)
  if (!resolved.ok) return resolved.refusal
  const indexIssue = indexRefusal(input.zoneId, input.layerIndex, resolved.layerCount)
  if (indexIssue) return indexIssue
  const layerIdsBySceneId = selectedIds(resolved.stacks, input.layerIndex)
  const occupants = [...new Set(resolved.stacks.flatMap(stack => (
    stack.zone.overlays[input.layerIndex].placements.map(placement => placement.logicalClipId ?? placement.id)
  )))]
  if (occupants.length > 0) {
    return refuse(
      'layer-not-empty',
      `Overlay Layer ${input.layerIndex} in Zone ${input.zoneId} is not empty across the Show.`,
      occupants,
    )
  }

  const indexMap: LayerIndexMap = Object.fromEntries(Array.from(
    { length: resolved.layerCount },
    (_value, oldIndex) => [oldIndex, oldIndex === input.layerIndex ? null : oldIndex < input.layerIndex ? oldIndex : oldIndex - 1],
  ))
  const draft = structuredClone(composition)
  for (const scene of draft.scenes) {
    const zone = scene.zones.find(candidate => candidate.zoneId === input.zoneId)!
    zone.overlays.splice(input.layerIndex, 1)
  }
  if (validateShowComposition(show, draft).length > 0) {
    return refuse('domain-refusal', 'The requested empty Layer removal would produce an invalid composition.')
  }
  return { status: 'changed', composition: draft, layerIdsBySceneId, indexMap }
}
