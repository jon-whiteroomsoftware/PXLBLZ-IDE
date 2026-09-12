import { showCommandFixture } from './showCommandFixture'

/** Three explicit overlays across two Scenes plus a completely unrelated Zone. */
export function showLayerCommandFixture() {
  const show = showCommandFixture()
  for (const instance of show.composition!.patternInstances) {
    instance.pattern = { kind: 'stock', id: 'CometLoom' }
    instance.patternName = 'CometLoom'
  }
  show.zones.push({ id: 'zone-2', name: 'Other Zone', nominalPixelCount: 8 })
  for (const [sceneIndex, scene] of show.composition!.scenes.entries()) {
    const zone = scene.zones[0]
    const existing = sceneIndex === 0 ? zone.overlays[0].placements : []
    zone.overlays = [
      { id: `top-${scene.sceneId}`, name: `Top ${sceneIndex}`, placements: structuredClone(existing) },
      { id: `middle-${scene.sceneId}`, name: `Middle ${sceneIndex}`, placements: [] },
      { id: `bottom-${scene.sceneId}`, name: `Bottom ${sceneIndex}`, placements: [] },
    ]
    scene.zones.push({
      zoneId: 'zone-2',
      main: [],
      overlays: [{ id: `other-${scene.sceneId}`, name: 'Other', placements: [] }],
    })
  }
  return show
}
