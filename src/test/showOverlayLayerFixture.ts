import { trackedCommandFixture } from './showCommandFixture'

/** Two Scenes, two Zones, unequal overlay counts and a mixed main/overlay Group. */
export function showOverlayLayerFixture() {
  const show = trackedCommandFixture()
  show.name = 'Overlay Layer preservation'
  show.zones.push({ id: 'zone-2', name: 'Second', nominalPixelCount: 16 })
  const composition = show.composition!
  for (const scene of composition.scenes) {
    scene.zones.push({ zoneId: 'zone-2', main: [], overlays: [{ id: `other-${scene.sceneId}`, name: 'Other Zone', placements: [] }] })
    scene.zones[0].overlays.push({ id: `bottom-${scene.sceneId}`, name: 'Bottom', placements: [] })
  }
  for (const instance of composition.patternInstances) {
    instance.pattern = { kind: 'stock', id: 'CometLoom' }
    instance.patternName = 'CometLoom'
  }
  composition.groupDefinitions = [{
    id: 'group-definition', name: 'Mixed Group', patternInstances: [{ ...structuredClone(composition.patternInstances[0]), id: 'group-pattern' }],
    placements: [
      { id: 'group-main', instanceId: 'group-pattern', startMs: 0, durationMs: 1000, layerOffset: 0, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
      { id: 'group-overlay', instanceId: 'group-pattern', startMs: 0, durationMs: 1000, layerOffset: 1, opacity: 1, view: { mirror: false, phase: 0, brightness: 1 } },
    ],
  }]
  composition.groupOccurrences = [{ id: 'group-use', definitionId: 'group-definition', sceneId: 'scene-2', zoneId: 'zone-1', startMs: 1000, baseLayer: 0, translationX: 0, translationY: 0 }]
  return show
}
