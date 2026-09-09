import { showOverlayLayerFixture } from './showOverlayLayerFixture'
import { insertShowLayerTransition } from '../engine/showLayerTransitionAuthoring'

/** Ordinary overlay target, connected main target, shared survivors and unrelated Group. */
export function showRemoveClipFixture() {
  const show = showOverlayLayerFixture()
  show.name = 'Remove Clip preservation'
  const composition = show.composition!
  composition.scenes[0].zones[0].main[1].startMs = 10_000
  for (const track of composition.scenes[0].propertyTracks ?? []) {
    if (track.id === 'track-b' || track.id === 'track-inst-b') track.keyframes[1].timeMs = 17_000
  }
  composition.patternInstances.push({ ...structuredClone(composition.patternInstances[0]), id: 'unrelated-orphan' })
  composition.scenes[1].propertyTracks = [{ id: 'orphan-track', target: { kind: 'instance-time-scale', instanceId: 'unrelated-orphan' }, keyframes: [{ id: 'orphan-key', timeMs: 0, value: 1, easing: { curve: 'linear' } }, { id: 'orphan-key-end', timeMs: 1000, value: 0.5, easing: { curve: 'linear' } }] }]
  show.composition = insertShowLayerTransition(show, composition, {
    id: 'connected-transition', fromPlacementId: 'clip-a', toPlacementId: 'clip-b',
    kind: 'crossfade', durationMs: 1000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live',
  })
  if (show.composition === composition) throw new Error('Fixture transition refused')
  return show
}
