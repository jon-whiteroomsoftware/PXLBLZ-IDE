import { describe, expect, it } from 'vitest'
import { resolveShowLayerDragTarget } from '@/engine/showLayerDrag'

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
})
