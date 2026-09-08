import type { ShowCompositionV1, ShowRecord } from './personalContentRecords'
import { resizeShowClipExactly, type ShowExactClipResizeRequest, type ShowExactClipResizeResult } from './showExactClipResize'

import { resizeShowConnectedClipInShowAtGlobalTime } from './showLayerTransitionAuthoring'
import { projectShowUnifiedTimeline } from './showUnifiedTimelineProjection'

/** Manual commit of an integer range; preview geometry is never an authored candidate. */
export function resizeShowClipManually(
  show: ShowRecord,
  composition: ShowCompositionV1,
  request: ShowExactClipResizeRequest,
): ShowRecord {
  return applyManualResizeResult(show, composition, request, resizeShowClipExactly(show, composition, request))
}

/** Feedback may bound excess duration to the capacity reported by the exact owner. */
export function previewShowClipResize(
  show: ShowRecord, composition: ShowCompositionV1, request: ShowExactClipResizeRequest,
): ShowCompositionV1 {
  const result = resizeShowClipExactly(show, composition, request)
  const next = result.status === 'refused' && result.code === 'no-space' && result.availableRange
    ? resizeShowClipManually(show, composition, { clipId: request.clipId, globalStartMs: result.availableRange.startMs, globalEndMs: result.availableRange.endMs })
    : applyManualResizeResult(show, composition, request, result)
  return next === show ? composition : next.composition!
}

function applyManualResizeResult(
  show: ShowRecord, composition: ShowCompositionV1, request: ShowExactClipResizeRequest, result: ShowExactClipResizeResult,
): ShowRecord {
  // Only source-qualified manual Transition-to-Cut cases may use legacy
  // canonicalization. Group children retain their separate isolation editor.
  if (result.status === 'refused' && result.manualResidual) {
    const clip = projectShowUnifiedTimeline(show, composition).zones
      .flatMap(zone => zone.layers.flatMap(layer => layer.clips))
      .find(candidate => candidate.id === request.clipId)
    if (!clip) return show
    const globalStartMs = request.globalStartMs ?? clip.startMs
    const owner = clip.kind === 'main'
      ? { kind: 'main' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id }
      : { kind: 'overlay' as const, sceneId: clip.sceneId, zoneId: clip.zoneId, placementId: clip.id, layerId: clip.layerId! }
    return resizeShowConnectedClipInShowAtGlobalTime(show, composition, {
      owner, globalStartMs, durationMs: request.durationMs ?? request.globalEndMs! - globalStartMs,
    })
  }
  return result.status === 'changed' ? { ...show, composition: result.composition } : show
}
