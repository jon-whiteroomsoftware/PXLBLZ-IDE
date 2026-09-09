import { showOverlayLayerFixture } from './showOverlayLayerFixture'

/** Shared tracked Show with authored control and Effect targets for the seven animation kinds. */
export function showAnimationCommandFixture() {
  const show = showOverlayLayerFixture()
  show.composition!.patternInstances[0].controlTargets = { sliderSpeed: 0.5 }
  show.composition!.scenes[0].zones[0].main[0].effects = [{ id: 'effect-a', kind: 'brightness', brightness: 0.8 }]
  return show
}
