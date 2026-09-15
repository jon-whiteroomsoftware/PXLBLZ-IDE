import type { ShowMainPlacement, ShowOverlayPlacement, ShowPropertyAnimationTarget } from './personalContentRecords'
import type { ShowPropertyTargetV2 } from './showCompositionV2'

export function clipAppearance(placement: ShowMainPlacement | ShowOverlayPlacement) {
  return {
    opacity: placement.opacity ?? 1,
    view: structuredClone(placement.view),
    ...(placement.presentation !== undefined ? { presentation: structuredClone(placement.presentation) } : {}),
    ...(placement.blink !== undefined ? { blink: structuredClone(placement.blink) } : {}),
    ...(placement.transform !== undefined ? { transform: structuredClone(placement.transform) } : {}),
    ...(placement.viewport !== undefined ? { aperture: structuredClone(placement.viewport) } : {}),
    effects: structuredClone(placement.effects ?? []),
  }
}

export function convertPropertyTarget(
  target: ShowPropertyAnimationTarget,
  clipIdByPlacementId: Map<string, string>,
): ShowPropertyTargetV2 {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') return structuredClone(target)
  const clipId = clipIdByPlacementId.get(target.placementId) ?? ''
  if (target.kind === 'placement-opacity') return { kind: 'clip-opacity', clipId }
  if (target.kind === 'placement-view') return { kind: 'clip-view', clipId, property: target.property }
  if (target.kind === 'placement-transform') return { kind: 'clip-transform', clipId, property: target.property }
  if (target.kind === 'placement-viewport') return { kind: 'clip-aperture', clipId, property: target.property }
  return {
    kind: 'clip-effect',
    clipId,
    effectId: target.effectId,
    effectKind: target.effectKind,
    parameterId: target.parameterId,
  }
}

export function lowerPropertyTarget(target: ShowPropertyTargetV2): ShowPropertyAnimationTarget {
  if (target.kind === 'instance-time-scale' || target.kind === 'instance-control') return structuredClone(target)
  if (target.kind === 'clip-opacity') return { kind: 'placement-opacity', placementId: target.clipId }
  if (target.kind === 'clip-view') return { kind: 'placement-view', placementId: target.clipId, property: target.property }
  if (target.kind === 'clip-transform') return { kind: 'placement-transform', placementId: target.clipId, property: target.property }
  if (target.kind === 'clip-aperture') return { kind: 'placement-viewport', placementId: target.clipId, property: target.property }
  if (target.kind === 'clip-effect') {
    return {
      kind: 'placement-effect',
      placementId: target.clipId,
      effectId: target.effectId,
      effectKind: target.effectKind,
      parameterId: target.parameterId,
    }
  }
  throw new Error(`Show composition v2 property target "${target.kind}" requires direct compiler support.`)
}

