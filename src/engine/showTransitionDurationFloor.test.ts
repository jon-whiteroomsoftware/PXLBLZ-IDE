import { describe, expect, it } from 'vitest'
import { createDefaultShow, normalizeShowTransitionState } from './showModel'

// Boundary and Layer Transition durations have no model floor. The authoring
// contract has declared `durationMs: min: 0` since the first headless visual
// toolkit version (#443), and the editors expose min 0 - but a 1,000 ms
// `Math.max` survived inside normalization from the pre-compiler scene-strip
// editor (#318) and silently rewrote every shorter authored fade. Quadrille
// shipped de-phased because of it (#823). Scene durations keep their own
// floor; transitions clamp at zero.
describe('transition duration floor (#823)', () => {
  const showWith = (durationMs: number) => {
    const show = createDefaultShow('show-floor', 'Floor probe')
    show.transitions = [{
      id: 'transition-scene-1',
      afterSceneId: 'scene-1',
      kind: 'crossfade',
      crossfadePolicy: 'live-live',
      durationMs,
      easing: { curve: 'sine', direction: 'in-out' },
    }]
    return show
  }

  it('preserves sub-second boundary transition durations through normalization', () => {
    for (const durationMs of [800, 250, 1]) {
      const normalized = normalizeShowTransitionState(showWith(durationMs))
      expect(normalized.transitions[0].durationMs, `${durationMs}ms fade`).toBe(durationMs)
    }
  })

  it('clamps only negatives and keeps zero-duration records intact', () => {
    expect(normalizeShowTransitionState(showWith(0)).transitions[0].durationMs).toBe(0)
    expect(normalizeShowTransitionState(showWith(-50)).transitions[0].durationMs).toBe(0)
  })

  it('caps boundary-owned property descriptors at the real transition duration', () => {
    const show = showWith(800)
    show.transitions[0] = {
      ...show.transitions[0],
      propertyTransitions: {
        routing: { splitPosition: { from: 0.25, durationMs: 1_800, easing: { curve: 'sine', direction: 'in-out' } } },
      },
    }
    const normalized = normalizeShowTransitionState(show)
    expect(normalized.transitions[0].propertyTransitions?.routing?.splitPosition?.durationMs).toBe(800)
  })
})
