import { describe, expect, it } from 'vitest'
import {
  addOverlayClip,
  addOverlayLayer,
  createNeonOrchardOverlayState,
  moveOverlayClip,
  reorderOverlayLayer,
  resolveLayerDrag,
  resizeOverlayClip,
  setPlacementInstancePolicy,
  summarizeOverlayCost,
} from './showOverlayPlacementPrototypeState'

describe('Show overlay placement prototype state', () => {
  it('models one Scene x Zone with reusable manual layers', () => {
    const state = createNeonOrchardOverlayState()
    const glassClips = state.placements.filter((item) => item.layerId === 'layer-glass')

    expect(state.sceneName).toBe('Orchard Wake')
    expect(state.zoneName).toBe('Canopy')
    expect(glassClips.map((item) => item.id)).toEqual(['overlay-1', 'overlay-4'])
    expect(glassClips.every((item) => item.zoneName === 'Canopy')).toBe(true)
  })

  it('adds layers separately from clips and inserts a clip in the selected layer', () => {
    const initial = createNeonOrchardOverlayState()
    const withLayer = addOverlayLayer(initial)
    const withClip = addOverlayClip(withLayer, withLayer.selectedLayerId, 2.25)

    expect(withLayer.layers[0]).toMatchObject({ id: 'layer-4', name: 'Overlay 4' })
    expect(withClip.selectedPlacementId).toBe('overlay-5')
    expect(withClip.placements.find((item) => item.id === 'overlay-5')).toMatchObject({ layerId: 'layer-4', start: 2.25 })
  })

  it('snaps an illegal horizontal drop to the nearest legal position in its lane', () => {
    const initial = createNeonOrchardOverlayState()
    const moved = moveOverlayClip(initial, 'overlay-4', { proposedStart: 3.9, targetLayerId: 'layer-glass' })

    // Glass Moths ends at 4.6, so a 1.4 s clip dropped over it lands directly after it.
    expect(moved.placements.find((item) => item.id === 'overlay-4')).toMatchObject({ start: 4.6, layerId: 'layer-glass' })
    expect(moved.snapGuideSeconds).toBe(4.6)
  })

  it('uses vertical drag hysteresis before moving a clip between layers', () => {
    const state = createNeonOrchardOverlayState()

    expect(resolveLayerDrag(state.layers, 'layer-signal', 10)).toBe('layer-signal')
    expect(resolveLayerDrag(state.layers, 'layer-signal', -18)).toBe('layer-glass')
    expect(resolveLayerDrag(state.layers, 'layer-signal', 50)).toBe('layer-ground')
  })

  it('reorders a layer without rewriting clip timing', () => {
    const initial = createNeonOrchardOverlayState()
    const reordered = reorderOverlayLayer(initial, 'layer-ground', -1)

    expect(reordered.layers.map((layer) => layer.id)).toEqual(['layer-glass', 'layer-ground', 'layer-signal'])
    expect(reordered.placements).toEqual(initial.placements)
  })

  it('trims clips within Scene bounds without overlapping a lane neighbour', () => {
    const initial = createNeonOrchardOverlayState()
    const resized = resizeOverlayClip(initial, 'overlay-1', 'end', 3)

    expect(resized.placements.find((item) => item.id === 'overlay-1')).toMatchObject({ start: 1.1, duration: 5.1 })
  })

  it('summarizes concurrent render cost for the final composite', () => {
    expect(summarizeOverlayCost(createNeonOrchardOverlayState())).toEqual({ peakSources: 4, overlayCount: 4, effectPasses: 7 })
  })

  it('changes the user-facing Continue or Restart behavior for one clip', () => {
    const initial = createNeonOrchardOverlayState()
    const continued = setPlacementInstancePolicy(initial, 'overlay-2', 'Continue')

    expect(continued.placements.find((item) => item.id === 'overlay-2')?.instancePolicy).toBe('Continue')
    expect(continued.placements.find((item) => item.id === 'overlay-1')?.instancePolicy).toBe('Restart')
  })
})
