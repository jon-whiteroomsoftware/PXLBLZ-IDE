import { describe, expect, it } from 'vitest'
import {
  normalizeShowMotionTransition,
  sampleShowMotionTransition,
  showMotionTransitionEffects,
} from './showMotionTransition'

describe('Show motion transitions', () => {
  it('normalizes variant-specific parameters and shared addressing', () => {
    expect(normalizeShowMotionTransition({
      motionVariant: 'cover', direction: 1.25, anchorX: -1, anchorY: 2,
      contentScale: 0, addressPolicy: 'wrap', edgePolicy: 'blend',
    })).toEqual({
      motionVariant: 'cover', direction: 0.25, anchorX: 0, anchorY: 1,
      contentScale: 0.01, rotation: 0, spinDirection: 'clockwise',
      addressPolicy: 'wrap', edgePolicy: 'blend',
    })
  })

  it('builds Cover, Reveal, and Push from the shared translate Effect substrate', () => {
    expect(showMotionTransitionEffects({ motionVariant: 'cover', direction: 0 }, 0)).toMatchObject({
      outgoing: [],
      incoming: [{ kind: 'translate', x: -1, y: 0 }],
    })
    expect(showMotionTransitionEffects({ motionVariant: 'reveal', direction: 0 }, 0.5)).toMatchObject({
      outgoing: [{ kind: 'translate', x: 0.5, y: 0 }],
      incoming: [],
    })
    expect(showMotionTransitionEffects({ motionVariant: 'push', direction: 0 }, 0.5)).toMatchObject({
      outgoing: [{ kind: 'translate', x: 0.5, y: 0 }],
      incoming: [{ kind: 'translate', x: -0.5, y: 0 }],
    })
  })

  it('anchors Content Grow and Content Shrink without changing the mask semantics', () => {
    const grow = sampleShowMotionTransition({
      motionVariant: 'content-grow', anchorX: 0, anchorY: 0, contentScale: 0.25,
    }, 0, 0.125, 0.125)
    expect(grow.incoming).toMatchObject({ x: 0.5, y: 0.5, inside: true })
    expect(grow.pick).toBe('incoming')

    const shrink = sampleShowMotionTransition({
      motionVariant: 'content-shrink', anchorX: 0, anchorY: 0, contentScale: 0.25,
    }, 1, 0.5, 0.5)
    expect(shrink.outgoing.inside).toBe(false)
    expect(shrink.pick).toBe('incoming')
  })

  it('keeps wrap addressing explicit while hard clip remains a one-source selector', () => {
    const clipped = sampleShowMotionTransition({ motionVariant: 'cover', direction: 0 }, 0.5, 0.75, 0.5)
    expect(clipped.incoming.inside).toBe(false)
    expect(clipped.pick).toBe('outgoing')

    const wrapped = sampleShowMotionTransition({
      motionVariant: 'cover', direction: 0, addressPolicy: 'wrap', edgePolicy: 'blend',
    }, 0.5, 0.75, 0.5)
    expect(wrapped.incoming).toMatchObject({ x: 0.25, addressPolicy: 'wrap' })
    expect(wrapped.pick).toBe('blend')
  })

  it('normalizes Zoom endpoint scale, rotation turns, and rotation direction (#453)', () => {
    expect(normalizeShowMotionTransition({
      motionVariant: 'zoom-in', contentScale: 9, rotation: 12,
      spinDirection: 'counterclockwise', anchorX: -1, anchorY: 2,
    })).toMatchObject({
      motionVariant: 'zoom-in', contentScale: 1, rotation: 8,
      spinDirection: 'counterclockwise', anchorX: 0, anchorY: 1,
    })
  })

  it('builds Zoom In and clockwise Spin from ordinary affine Effects (#453)', () => {
    const effects = showMotionTransitionEffects({
      motionVariant: 'zoom-in', contentScale: 0.25, rotation: 0.25,
      spinDirection: 'clockwise', anchorX: 0.25, anchorY: 0.75,
    }, 0)
    expect(effects.outgoing).toEqual([])
    expect(effects.incoming).toEqual([
      expect.objectContaining({ kind: 'scale', x: 0.25, y: 0.25 }),
      expect.objectContaining({ kind: 'rotate', turns: 0.25 }),
      expect.objectContaining({ kind: 'translate' }),
    ])

    const anchor = sampleShowMotionTransition({
      motionVariant: 'zoom-in', contentScale: 0.25, rotation: 0.25,
      spinDirection: 'clockwise', anchorX: 0.25, anchorY: 0.75,
    }, 0, 0.25, 0.75)
    expect(anchor.incoming).toMatchObject({ x: 0.25, y: 0.75, inside: true })
    expect(anchor.pick).toBe('incoming')
  })

  it('reverses the affine endpoint for Zoom Out and counterclockwise Spin (#453)', () => {
    const start = showMotionTransitionEffects({
      motionVariant: 'zoom-out', contentScale: 0.2, rotation: 0.5,
      spinDirection: 'counterclockwise',
    }, 0)
    expect(start.outgoing).toEqual([
      expect.objectContaining({ kind: 'scale', x: 1, y: 1 }),
      expect.objectContaining({ kind: 'rotate', turns: 0 }),
      expect.objectContaining({ kind: 'translate', x: 0, y: 0 }),
    ])

    const end = showMotionTransitionEffects({
      motionVariant: 'zoom-out', contentScale: 0.2, rotation: 0.5,
      spinDirection: 'counterclockwise',
    }, 1)
    expect(end.outgoing).toEqual([
      expect.objectContaining({ kind: 'scale', x: 0.2, y: 0.2 }),
      expect.objectContaining({ kind: 'rotate', turns: -0.5 }),
      expect.objectContaining({ kind: 'translate' }),
    ])
    expect(end.incoming).toEqual([])
  })
})
