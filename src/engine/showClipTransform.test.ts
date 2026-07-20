import { describe, expect, it } from 'vitest'
import { applyShowEffectsToSample } from './showEffects'
import {
  normalizeShowClipTransform,
  showClipTransformEffects,
} from './showClipTransform'

describe('first-class Clip Transform (#529)', () => {
  it('normalizes legacy missing state to the neutral pose', () => {
    expect(normalizeShowClipTransform(undefined)).toEqual({
      positionX: 0,
      positionY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 1,
    })
  })

  it('uses neutral defaults for malformed persisted values before clamping finite values', () => {
    expect(normalizeShowClipTransform({
      positionX: Number.NaN,
      positionY: Number.POSITIVE_INFINITY,
      rotation: Number.NEGATIVE_INFINITY,
      scaleX: Number.NaN,
      scaleY: 20,
    })).toEqual({
      positionX: 0,
      positionY: 0,
      rotation: 0,
      scaleX: 1,
      scaleY: 8,
    })
  })

  it('compiles neutral state away and lowers scale, rotation, then position before advanced Effects', () => {
    expect(showClipTransformEffects(undefined, [])).toEqual([])

    const effects = showClipTransformEffects({
      positionX: 0.1,
      positionY: -0.2,
      rotation: 0.25,
      scaleX: 2,
      scaleY: 0.5,
    }, [{ id: 'user-translate', kind: 'translate', x: 0.3, y: 0.4 }])
    expect(effects.map((effect) => effect.id)).toEqual([
      'pxlblz-clip-transform-scale',
      'pxlblz-clip-transform-rotation',
      'pxlblz-clip-transform-position',
      'user-translate',
    ])

    const sample = applyShowEffectsToSample(effects, 0.9, 0.7)
    expect(sample.x).toBeCloseTo(0.5)
    expect(sample.y).toBeCloseTo(0.5)
  })
})
