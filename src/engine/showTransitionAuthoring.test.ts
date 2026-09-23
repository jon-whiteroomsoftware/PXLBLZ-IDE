import { describe, expect, it } from 'vitest'
import { DEMOS } from '../pixelblaze/stock/patterns'
import { createDefaultShow, showRecordToCompileRecipe, updateShowBoundaryTransition } from './showModel'
import {
  replaceShowBoundaryTransition,
  showBoundaryTransitionParameterValue,
  showBoundaryTransitionParameters,
  showBoundaryTransitionPresentationKey,
  showTransitionChangesForPresentation,
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
    const cloudItem = items.find((item) => item.key === 'transition:shape-reveal:cloud')!
    const cloudShow = replaceShowBoundaryTransition(base, transitionId, cloudItem)
    expect(cloudShow.transitions!.find((candidate) => candidate.id === transitionId))
      .toMatchObject({ shape: 'cloud', aspect: 1.4 })
    const sideCatItem = items.find((item) => item.key === 'transition:shape-reveal:cat-side-profile')!
    const sideCatShow = replaceShowBoundaryTransition(base, transitionId, sideCatItem)
    expect(sideCatShow.transitions!.find((candidate) => candidate.id === transitionId))
      .toMatchObject({ shape: 'cat-side-profile', aspect: 1.6 })
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

  it('authors a directionless linear Wipe on a 1D Stage that compiles (#1077)', () => {
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 1 })
      .find((candidate) => candidate.key === 'transition:wipe:linear')!
    expect(item.compatible).toBe(true)
    const changes = showTransitionChangesForPresentation(item, undefined, 1)
    expect(changes).toMatchObject({ kind: 'wipe', wipeVariant: 'linear' })
    expect(changes.direction).toBeUndefined()
    const base = createDefaultShow('show-1077-wipe-1d', 'Wipe 1D', 1)
    const show = replaceShowBoundaryTransition(base, base.transitions![0].id, item, undefined, 1)
    expect(show.transitions![0]).not.toHaveProperty('direction')
    const recipe = showRecordToCompileRecipe(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
      stageDimension: 1,
    })
    expect(recipe.routeTransition).toMatchObject({ kind: 'wipe' })
  })

  it('keeps the 2D linear Wipe direction (#1077)', () => {
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .find((candidate) => candidate.key === 'transition:wipe:linear')!
    expect(showTransitionChangesForPresentation(item, undefined, 2)).toMatchObject({
      kind: 'wipe', wipeVariant: 'linear', direction: 0,
    })
  })

  it('clears a stored 2D-only direction when the 1D palette applies Linear Wipe (#1077 corrective)', () => {
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 1 })
      .find((candidate) => candidate.key === 'transition:wipe:linear')!
    const base = createDefaultShow('show-1077-clear-1d', 'Clear direction 1D', 1)
    const transitionId = base.transitions![0].id
    const stored = updateShowBoundaryTransition(base, transitionId, { kind: 'wipe', wipeVariant: 'linear', direction: 0 })
    expect(stored.transitions![0]).toHaveProperty('direction', 0)
    const changes = showTransitionChangesForPresentation(item, undefined, 1)
    expect(changes.direction).toBeUndefined()
    const repaired = updateShowBoundaryTransition(stored, transitionId, changes)
    expect(repaired.transitions![0]).not.toHaveProperty('direction')
    const recipe = showRecordToCompileRecipe(repaired, {
      byCellId: Object.fromEntries(repaired.cells.map((cell) => [cell.id, DEMOS.TestPattern1D])),
      stageDimension: 1,
    })
    expect(recipe.routeTransition).toMatchObject({ kind: 'wipe' })
  })

  it('omits the 2D-only Direction from the 1D parameter panel (#1077 corrective)', () => {
    const linear = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .find((candidate) => candidate.key === 'transition:wipe:linear')!
    const base = createDefaultShow('show-1077-panel-1d', 'Panel 1D', 1)
    const stored = updateShowBoundaryTransition(
      base,
      base.transitions![0].id,
      { kind: 'wipe', wipeVariant: 'linear', direction: 0 },
    )
    const transition = stored.transitions![0]
    expect(showBoundaryTransitionParameters(linear, transition, 2).map((parameter) => parameter.id))
      .toContain('direction')
    expect(showBoundaryTransitionParameters(linear, transition, 1).map((parameter) => parameter.id))
      .not.toContain('direction')
  })
})
