import { describe, expect, it } from 'vitest'
import type { ShowClipEffect } from './personalContentRecords'
import {
  createShowClipEffect,
  createShowEffectApplication,
  duplicateShowClipEffect,
  moveShowClipEffectWithinStage,
  moveShowClipEffectToStagePosition,
  nextShowEffectId,
  showClipEffectParameterValue,
  showClipEffectParameters,
  showClipEffectPresentationKey,
  showClipEffectStage,
  updateShowClipEffectParameter,
} from './showEffectAuthoring'
import { buildShowToolkitPresentationCatalogue } from './showVisualToolkitPresentation'

describe('Show Effect authoring adapter', () => {
  it('constructs the correct persisted authoring action for every registry Effect', () => {
    const items = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .filter((item) => item.kind === 'effect')

    expect(items).toHaveLength(23)
    for (const item of items) {
      const application = createShowEffectApplication(item, [], undefined)
      if (item.key === 'effect:affine:mirror') {
        expect(application).toEqual({ target: 'placement-mirror', mirror: true })
        continue
      }
      expect(application.target).toBe('effect-stack')
      if (application.target !== 'effect-stack') continue
      const effect = application.effect
      expect(effect.id).toBe(item.variantId)
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

  it('authors a coordinate-aware Vignette with complete controls (#539)', () => {
    const item = buildShowToolkitPresentationCatalogue({ stageDimensions: 2 })
      .find((candidate) => candidate.key === 'effect:output:vignette')!
    const effect = createShowClipEffect(item, 'edge')

    expect(effect).toEqual({
      id: 'edge', kind: 'vignette', amount: 1, radius: 0.35, softness: 0.35,
      centerX: 0.5, centerY: 0.5, aspect: 1,
    })
    expect(showClipEffectParameters(effect).map((parameter) => parameter.id)).toEqual([
      'amount', 'softness', 'radius', 'centerX', 'centerY', 'aspect',
    ])
    expect(showClipEffectStage(effect)).toBe('color-output')
  })

  it('authors Color Map as two Colors while preserving normalized channel storage (#609)', () => {
    const effect: ShowClipEffect = {
      id: 'map', kind: 'color-map', amount: 0.75,
      shadowR: 0.05, shadowG: 0, shadowB: 0.2,
      highlightR: 1, highlightG: 0.7, highlightB: 0.1,
    }

    expect(showClipEffectParameters(effect).map((parameter) => [parameter.id, parameter.label, parameter.kind])).toEqual([
      ['amount', 'Amount', 'number'],
      ['shadowColor', 'Shadow Color', 'color'],
      ['highlightColor', 'Highlight Color', 'color'],
    ])
    expect(showClipEffectParameterValue(effect, 'shadowColor')).toBe('#0d0033')
    expect(showClipEffectParameterValue(effect, 'highlightColor')).toBe('#ffb31a')
    expect(effect).toEqual({
      id: 'map', kind: 'color-map', amount: 0.75,
      shadowR: 0.05, shadowG: 0, shadowB: 0.2,
      highlightR: 1, highlightG: 0.7, highlightB: 0.1,
    })

    expect(updateShowClipEffectParameter(effect, 'shadowColor', '#123456')).toEqual({
      ...effect,
      shadowR: 0x12 / 255,
      shadowG: 0x34 / 255,
      shadowB: 0x56 / 255,
    })
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

  it('drops an Effect before or after only a target in its compiler stage (#644)', () => {
    const effects: ShowClipEffect[] = [
      { id: 'move', kind: 'translate', x: 0.2, y: 0 },
      { id: 'ripple', kind: 'ripple', amount: 0.1, frequency: 8, phase: 0, centerX: 0.5, centerY: 0.5 },
      { id: 'turn', kind: 'rotate', turns: 0.1 },
      { id: 'size', kind: 'scale', x: 1, y: 1 },
    ]

    expect(moveShowClipEffectToStagePosition(effects, 'size', 'move', 'before').map((effect) => effect.id))
      .toEqual(['size', 'ripple', 'move', 'turn'])
    expect(moveShowClipEffectToStagePosition(effects, 'move', 'turn', 'after').map((effect) => effect.id))
      .toEqual(['turn', 'ripple', 'move', 'size'])
    expect(moveShowClipEffectToStagePosition(effects, 'ripple', 'move', 'before'))
      .toEqual(effects)
  })
})
