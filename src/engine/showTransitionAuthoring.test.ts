import { describe, expect, it } from 'vitest'
import { createDefaultShow } from './showModel'
import {
  replaceShowBoundaryTransition,
  showBoundaryTransitionParameterValue,
  showBoundaryTransitionParameters,
  showBoundaryTransitionPresentationKey,
  updateShowBoundaryTransitionParameter,
} from './showTransitionAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'

describe('Show Transition authoring adapter', () => {
  it('constructs a normalized persisted boundary for every registry variant', () => {
    const items = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .filter((item) => item.kind === 'transition')
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const transitionId = base.transitions![0].id

    expect(items).toHaveLength(36)
    for (const item of items) {
      const changed = replaceShowBoundaryTransition(base, transitionId, item)
      const transition = changed.transitions!.find((candidate) => candidate.id === transitionId)!
      expect(transition.id).toBe(transitionId)
      expect(transition.afterSceneId).toBe(base.transitions![0].afterSceneId)
      expect(showBoundaryTransitionPresentationKey(transition)).toBe(item.key)
      expect(showBoundaryTransitionParameters(item, transition).length).toBeGreaterThan(0)
    }
  })

  it('maps family variants, defaults, and presets onto persisted fields', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const transitionId = base.transitions![0].id

    const fade = replaceShowBoundaryTransition(
      base,
      transitionId,
      catalogue.find((item) => item.key === 'transition:fade:through-color')!,
      'white',
    ).transitions![0]
    expect(fade).toMatchObject({ kind: 'fade-color', durationMs: 2000, color: '#ffffff' })

    const shape = replaceShowBoundaryTransition(
      base,
      transitionId,
      catalogue.find((item) => item.key === 'transition:shape-reveal:star')!,
    ).transitions![0]
    expect(shape).toMatchObject({ kind: 'portal', shape: 'star', starPoints: 5, starInner: 0.45 })

    const spin = replaceShowBoundaryTransition(
      base,
      transitionId,
      catalogue.find((item) => item.key === 'transition:motion:zoom-in')!,
      'zoom-spin-counterclockwise',
    ).transitions![0]
    expect(spin).toMatchObject({
      kind: 'motion', motionVariant: 'zoom-in', contentScale: 0.25,
      rotation: 0.5, spinDirection: 'counterclockwise',
    })
  })

  it('edits exact registry parameters while retaining identity and property animation', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const item = catalogue.find((candidate) => candidate.key === 'transition:wipe:clock')!
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const transitionId = base.transitions![0].id
    let show = replaceShowBoundaryTransition(base, transitionId, item)
    show = updateShowBoundaryTransitionParameter(show, transitionId, item, 'phase', 0.35)
    show = updateShowBoundaryTransitionParameter(show, transitionId, item, 'clockwise', false)
    show = updateShowBoundaryTransitionParameter(show, transitionId, item, 'durationMs', 3400)
    const transition = show.transitions![0]

    expect(transition).toMatchObject({
      id: transitionId, kind: 'wipe', wipeVariant: 'clock', phase: 0.35, clockwise: false, durationMs: 3400,
    })
    expect(showBoundaryTransitionParameterValue(transition, 'clockwise')).toBe(false)
    expect(showBoundaryTransitionParameterValue(transition, 'durationMs')).toBe(3400)
  })

  it('keeps a routing marker beside the visual boundary and resets Cut to zero duration', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const base = createDefaultShow('show-transitions', 'Transitions', 1)
    const transitionId = base.transitions![0].id
    const withRouting = {
      ...base,
      transitions: [
        ...base.transitions!,
        {
          id: 'routing-scene-1', afterSceneId: base.scenes[0].id, kind: 'routing' as const,
          durationMs: 0, easing: { curve: 'linear' as const }, layoutId: base.routingLayouts[0]?.id,
        },
      ],
    }
    const crossfade = replaceShowBoundaryTransition(
      withRouting,
      transitionId,
      catalogue.find((item) => item.key === 'transition:blend:crossfade')!,
    )
    const cut = replaceShowBoundaryTransition(
      crossfade,
      transitionId,
      catalogue.find((item) => item.key === 'transition:blend:cut')!,
    )

    expect(cut.transitions).toContainEqual(expect.objectContaining({ id: 'routing-scene-1', kind: 'routing' }))
    expect(cut.transitions).toContainEqual(expect.objectContaining({ id: transitionId, kind: 'cut', durationMs: 0 }))
  })

  it('authors a selected crossfade with the recommended snapshot/live policy (#516)', () => {
    const catalogue = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const base = createDefaultShow('show-516-authoring', 'Snapshot crossfade', 1)
    const transitionId = base.transitions![0].id
    const wipe = replaceShowBoundaryTransition(
      base,
      transitionId,
      catalogue.find((item) => item.key === 'transition:wipe:linear')!,
    )

    const crossfade = replaceShowBoundaryTransition(
      wipe,
      transitionId,
      catalogue.find((item) => item.key === 'transition:blend:crossfade')!,
    )

    expect(crossfade.transitions![0]).toMatchObject({
      kind: 'crossfade',
      crossfadePolicy: 'snapshot-live',
    })
  })
})
