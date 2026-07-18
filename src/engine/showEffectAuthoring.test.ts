import { describe, expect, it } from 'vitest'
import type { ShowClipEffect } from './personalContentRecords'
import {
  createShowClipEffect,
  duplicateShowClipEffect,
  moveShowClipEffectWithinStage,
  nextShowEffectId,
  showClipEffectParameterValue,
  showClipEffectParameters,
  showClipEffectPresentationKey,
  showClipEffectStage,
  updateShowClipEffectParameter,
} from './showEffectAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'

describe('Show Effect authoring adapter', () => {
  it('constructs a normalized persisted Effect for every registry variant', () => {
    const items = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .filter((item) => item.kind === 'effect')

    expect(items).toHaveLength(21)
    for (const [index, item] of items.entries()) {
      const effect = createShowClipEffect(item, `effect-${index}`)
      expect(effect.id).toBe(`effect-${index}`)
      expect(showClipEffectPresentationKey(effect)).toBe(item.key)
      expect(showClipEffectStage(effect)).toBe(item.effectStage)
      expect(showClipEffectParameters(effect).every((parameter) => parameter.kind === 'number' || parameter.kind === 'color')).toBe(true)
    }
  })

  it('maps registry parameter names and presets onto persisted field names', () => {
    const items = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const translate = items.find((item) => item.key === 'effect:affine:translate')!
    const bulge = items.find((item) => item.key === 'effect:distortion:bulge')!

    let moved = createShowClipEffect(translate, 'move')
    moved = updateShowClipEffectParameter(moved, 'translateX', 0.35)
    moved = updateShowClipEffectParameter(moved, 'translateY', -0.2)
    expect(moved).toEqual({ id: 'move', kind: 'translate', x: 0.35, y: -0.2 })
    expect(showClipEffectParameterValue(moved, 'translateX')).toBe(0.35)

    expect(createShowClipEffect(bulge, 'pinch', 'pinch')).toMatchObject({
      id: 'pinch',
      kind: 'bulge',
      amount: -0.65,
    })
  })

  it('authors luma and chroma keys with target, tolerance, and softness controls (#527)', () => {
    const items = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
    const lumaItem = items.find((item) => item.key === 'effect:output:luma-key')!
    const chromaItem = items.find((item) => item.key === 'effect:output:chroma-key')!

    expect(createShowClipEffect(lumaItem, 'black-key')).toEqual({
      id: 'black-key', kind: 'luma-key', target: 0, tolerance: 0.05, softness: 0.05,
    })
    expect(createShowClipEffect(chromaItem, 'green-key')).toEqual({
      id: 'green-key', kind: 'chroma-key', color: '#00ff00', tolerance: 0.05, softness: 0.05,
    })
    const chroma = updateShowClipEffectParameter(
      createShowClipEffect(chromaItem, 'green-key'),
      'color',
      '#ff00aa',
    )
    expect(chroma).toEqual({
      id: 'green-key', kind: 'chroma-key', color: '#ff00aa', tolerance: 0.05, softness: 0.05,
    })
    expect(showClipEffectParameters(chroma).map((parameter) => [parameter.id, parameter.kind])).toEqual([
      ['color', 'color'], ['tolerance', 'number'], ['softness', 'number'],
    ])
  })

  it('duplicates next to its source with a stable unique id', () => {
    const effects: ShowClipEffect[] = [
      { id: 'move', kind: 'translate', x: 0.2, y: 0 },
      { id: 'move-2', kind: 'rotate', turns: 0.1 },
    ]

    expect(nextShowEffectId(effects, 'move')).toBe('move-3')
    expect(duplicateShowClipEffect(effects, 'move')).toEqual([
      effects[0],
      { id: 'move-3', kind: 'translate', x: 0.2, y: 0 },
      effects[1],
    ])
  })

  it('moves only among siblings in the same compiler stage', () => {
    const effects: ShowClipEffect[] = [
      { id: 'move', kind: 'translate', x: 0.2, y: 0 },
      { id: 'ripple', kind: 'ripple', amount: 0.1, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
      { id: 'turn', kind: 'rotate', turns: 0.1 },
      { id: 'fade', kind: 'opacity', opacity: 0.5 },
    ]

    expect(moveShowClipEffectWithinStage(effects, 'turn', -1).map((effect) => effect.id))
      .toEqual(['turn', 'ripple', 'move', 'fade'])
    expect(moveShowClipEffectWithinStage(effects, 'move', -1)).toEqual(effects)
    expect(moveShowClipEffectWithinStage(effects, 'move', 1).map((effect) => effect.id))
      .toEqual(['turn', 'ripple', 'move', 'fade'])
    expect(moveShowClipEffectWithinStage(effects, 'ripple', 1)).toEqual(effects)
  })
})
