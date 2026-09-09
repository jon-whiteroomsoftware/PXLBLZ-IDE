import { showOverlayLayerFixture } from './showOverlayLayerFixture'

/** A compile-ready, Group-bearing Show with a connected multi-Scene Clip. */
export function showSplitClipFixture() {
  const show = showOverlayLayerFixture()
  show.name = 'Split Clip preservation'
  show.transitions = [{ id: 'transition-scene-1', afterSceneId: 'scene-1', kind: 'cut', durationMs: 0, easing: { curve: 'linear' } }]
  const composition = show.composition!
  const first = composition.scenes[0].zones[0]
  first.main[1].durationMs = 18000
  const next = first.main.pop()!
  composition.scenes[1].zones[0].main = [
    { ...structuredClone(first.main[1]), id: 'clip-b--span-scene-2', logicalClipId: 'clip-b', startMs: 0, durationMs: 6000 },
    { ...next, startMs: 7000, durationMs: 3000 },
  ]
  composition.groupOccurrences![0].startMs = 12000
  composition.transitions = [
    { id: 'incoming', fromPlacementId: 'clip-a', toPlacementId: 'clip-b', kind: 'crossfade', durationMs: 2000, easing: { curve: 'linear' }, crossfadePolicy: 'snapshot-live' },
    { id: 'outgoing', fromPlacementId: 'clip-b--span-scene-2', toPlacementId: 'clip-c', kind: 'crossfade', durationMs: 1000, easing: { curve: 'linear' }, crossfadePolicy: 'live-live' },
  ]
  composition.scenes[1].propertyTracks = [{
    id: 'tail-track', target: { kind: 'placement-view', placementId: 'clip-b--span-scene-2', property: 'brightness' },
    keyframes: [
      { id: 'tail-first', timeMs: 0, value: 0.2, easing: { curve: 'linear' } },
      { id: 'tail-last', timeMs: 6000, value: 1, easing: { curve: 'linear' } },
    ],
  }]
  return show
}
