import { showBoundaryCommandFixture } from './showBoundaryCommandFixture'
import { showOverlayLayerFixture } from './showOverlayLayerFixture'
import { showRemoveClipFixture } from './showRemoveClipFixture'

/** Existing preservation Shows, with a Main/overlay Cut or connected pair. */
export function showLayerTransitionCommandFixture(overlay = false, attached = false, boundaryPinned = false) {
  if (boundaryPinned) {
    const show = showBoundaryCommandFixture()
    show.composition!.transitions = [{ id: 'connected-transition', fromPlacementId: 'clip-b', toPlacementId: 'clip-c', kind: 'crossfade', durationMs: 2000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live' }]
    return show
  }
  const show = attached ? showRemoveClipFixture() : showOverlayLayerFixture()
  const composition = show.composition!
  if (!attached) {
    composition.scenes[0].zones[0].main[1].startMs = 10000
    for (const track of composition.scenes[0].propertyTracks ?? []) {
      if (track.id === 'track-b' || track.id === 'track-inst-b') track.keyframes[1].timeMs = 17000
    }
  }
  if (overlay) {
    const zone = composition.scenes[0].zones[0]
    const main = zone.main
    zone.main = zone.overlays[0].placements
    zone.overlays[0].placements = main.map(clip => ({ ...clip, opacity: 1 }))
  }
  return show
}
