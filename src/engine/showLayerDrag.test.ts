import { describe, expect, it } from 'vitest'
import { resolveShowLayerDragTarget, resolveShowLayerDragTargetFromBounds } from '@/engine/showLayerDrag'

const layers = [{ id: 'front' }, { id: 'middle' }, { id: 'back' }]

describe('resolveShowLayerDragTarget (#491)', () => {
  it('keeps casual horizontal drags in their original layer', () => {
    expect(resolveShowLayerDragTarget(layers, 'middle', 13)).toBe('middle')
    expect(resolveShowLayerDragTarget(layers, 'middle', -13)).toBe('middle')
  })

  it('changes layers only after vertical hysteresis is crossed', () => {
    expect(resolveShowLayerDragTarget(layers, 'middle', 14)).toBe('back')
    expect(resolveShowLayerDragTarget(layers, 'middle', -14)).toBe('front')
    expect(resolveShowLayerDragTarget(layers, 'front', 46)).toBe('back')
  })

  it('clamps deliberate movement at the first and last layer', () => {
    expect(resolveShowLayerDragTarget(layers, 'front', -100)).toBe('front')
    expect(resolveShowLayerDragTarget(layers, 'back', 100)).toBe('back')
    expect(resolveShowLayerDragTarget(layers, 'missing', 100)).toBe('missing')
  })

  it('uses live lane geometry when an expanded detail row separates layers', () => {
    const bounds = [
      { id: 'front', top: 100, bottom: 140 },
      { id: 'middle', top: 190, bottom: 230 },
      { id: 'back', top: 230, bottom: 270 },
    ]

    expect(resolveShowLayerDragTargetFromBounds(bounds, 'front', 120, 132)).toBe('front')
    expect(resolveShowLayerDragTargetFromBounds(bounds, 'front', 120, 205)).toBe('middle')
    expect(resolveShowLayerDragTargetFromBounds(bounds, 'front', 120, 255)).toBe('back')
  })
})
