import { describe, expect, it } from 'vitest'
import { projectShowPropertyLane } from './showPropertyLaneProjection'
import {
  describePropertyLaneHover,
  propertyLaneAnimatedSpanMs,
  propertyLaneAnimationIsPast,
  propertyLaneLabelObscuresCurve,
  resolvePropertyLaneDisplayLabels,
} from './showPropertyLaneLabels'

describe('resolvePropertyLaneDisplayLabels (#631)', () => {
  it('names a lane by its property alone when that property is unambiguous in the Zone', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'speed', family: 'time', ownerName: 'CompassRose' },
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'CompassRose' },
      { propertyLabel: 'opacity', family: 'appearance', ownerName: 'SignalMandala' },
      { propertyLabel: 'translate X', family: 'transform', ownerName: 'CompassRose' },
    ])).toEqual(['speed', 'brightness', 'opacity', 'translate X'])
  })

  it('leaves Zone-level lanes that have no owning Clip bare', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'speed', family: 'time' },
      { propertyLabel: 'brightness', family: 'appearance' },
    ])).toEqual(['speed', 'brightness'])
  })

  it('leaves same-named lanes bare when their families already distinguish them', () => {
    // A Clip's animation speed and a Pattern control named 'speed' both read
    // 'speed'; the family glyph carries the difference, so neither needs the
    // owning Clip prefixed onto it.
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'speed', family: 'time', ownerName: 'CompassRose' },
      { propertyLabel: 'speed', family: 'control', ownerName: 'CompassRose' },
    ])).toEqual(['speed', 'speed'])
  })

  it('abbreviates the owning Clip when the same family repeats a property', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'CompassRose' },
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'SignalMandala' },
      { propertyLabel: 'opacity', family: 'appearance', ownerName: 'CompassRose' },
    ])).toEqual(['CR brightness', 'SM brightness', 'opacity'])
  })

  it('distinguishes a Zone-level lane from a Clip lane in the same family', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', family: 'appearance' },
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'CompassRose' },
    ])).toEqual(['brightness', 'CR brightness'])
  })

  it('falls back to full Clip names when abbreviations would themselves collide', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'CompassRose' },
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'ColorRipple' },
    ])).toEqual(['CompassRose brightness', 'ColorRipple brightness'])
  })

  it('abbreviates single-word Clip names without internal capitals', () => {
    expect(resolvePropertyLaneDisplayLabels([
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'Caustics' },
      { propertyLabel: 'brightness', family: 'appearance', ownerName: 'SignalMandala' },
    ])).toEqual(['Ca brightness', 'SM brightness'])
  })
})

describe('describePropertyLaneHover (#631)', () => {
  const ramp = projectShowPropertyLane({
    durationMs: 40_000,
    constraint: { min: 0, max: 1 },
    defaultValue: 0.5,
    segments: [{ id: 'ramp', startMs: 5_000, endMs: 12_500, from: 0.2, to: 0.8, easing: { curve: 'linear' } }],
    beats: [
      { id: 'a', timeMs: 5_000, value: 0.2, kind: 'authored' },
      { id: 'b', timeMs: 12_500, value: 0.8, kind: 'authored' },
    ],
  })

  it('names the animated Pattern, the property, and its Show-global seconds', () => {
    expect(describePropertyLaneHover({
      ownerName: 'CompassRose',
      family: 'control',
      propertyLabel: 'speed',
      projection: ramp,
    })).toBe('CompassRose · speed · Pattern control · 5-12.5 s')
  })

  it('omits the Pattern for a Zone-level property', () => {
    expect(describePropertyLaneHover({
      family: 'time',
      propertyLabel: 'speed',
      projection: ramp,
    })).toBe('speed · Animation speed · 5-12.5 s')
  })

  it('starts a beat-less span at the sample the change departs from', () => {
    // Without keyframes the span is inferred from sample-to-sample change; the
    // change is already underway at the earlier sample, not the later one.
    const rampFromZero = projectShowPropertyLane({
      durationMs: 10_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0,
      segments: [{ id: 'ramp', startMs: 0, endMs: 4_000, from: 0, to: 1, easing: { curve: 'linear' } }],
      beats: [],
    })

    expect(propertyLaneAnimatedSpanMs(rampFromZero)).toEqual({ startMs: 0, endMs: 4_000 })
    expect(describePropertyLaneHover({
      family: 'appearance',
      propertyLabel: 'brightness',
      projection: rampFromZero,
    })).toBe('brightness · Appearance · 0-4 s')
  })

  it('reports a single instant rather than an empty span', () => {
    const instant = projectShowPropertyLane({
      durationMs: 10_000,
      constraint: { min: 0, max: 1 },
      defaultValue: 0.5,
      segments: [],
      beats: [{ id: 'only', timeMs: 2_000, value: 1, kind: 'authored' }],
    })

    expect(describePropertyLaneHover({
      family: 'appearance',
      propertyLabel: 'brightness',
      projection: instant,
    })).toBe('brightness · Appearance · 2 s')
  })
})

describe('propertyLaneAnimationIsPast (#631)', () => {
  const lane = projectShowPropertyLane({
    durationMs: 10_000,
    constraint: { min: 0, max: 1 },
    defaultValue: 0.5,
    segments: [{ id: 'ramp', startMs: 1_000, endMs: 2_000, from: 0.1, to: 0.9, easing: { curve: 'linear' } }],
    beats: [
      { id: 'a', timeMs: 1_000, value: 0.1, kind: 'authored' },
      { id: 'b', timeMs: 2_000, value: 0.9, kind: 'authored' },
    ],
  })

  it('retires a label once its animation is behind the visible window', () => {
    expect(propertyLaneAnimationIsPast(lane, 0.3)).toBe(true)
  })

  it('keeps a label while any of its animation is still to come', () => {
    expect(propertyLaneAnimationIsPast(lane, 0.15)).toBe(false)
  })

  it('keeps every label at the start of the timeline', () => {
    expect(propertyLaneAnimationIsPast(lane, 0)).toBe(false)
  })
})

describe('propertyLaneLabelObscuresCurve (#631)', () => {
  const lane = (fromMs: number, toMs: number) => projectShowPropertyLane({
    durationMs: 10_000,
    constraint: { min: 0, max: 1 },
    defaultValue: 0.5,
    segments: [{ id: 'ramp', startMs: fromMs, endMs: toMs, from: 0.1, to: 0.9, easing: { curve: 'linear' } }],
    beats: [
      { id: 'a', timeMs: fromMs, value: 0.1, kind: 'authored' },
      { id: 'b', timeMs: toMs, value: 0.9, kind: 'authored' },
    ],
  })

  it('reports the curve running under a label that covers the lane start', () => {
    expect(propertyLaneLabelObscuresCurve(lane(0, 2_000), { from: 0, to: 0.3 })).toBe(true)
  })

  it('clears once the covered window no longer holds the animated span', () => {
    // Zooming in narrows the window the label covers, which is how the fade
    // resolves itself without the label moving.
    expect(propertyLaneLabelObscuresCurve(lane(6_000, 8_000), { from: 0, to: 0.3 })).toBe(false)
  })

  it('follows the label into the middle of the lane once scrolled', () => {
    // The label sticks to the viewport's left edge, so a scrolled lane is
    // covered in its middle rather than at its start.
    expect(propertyLaneLabelObscuresCurve(lane(6_000, 8_000), { from: 0.55, to: 0.75 })).toBe(true)
    expect(propertyLaneLabelObscuresCurve(lane(0, 2_000), { from: 0.55, to: 0.75 })).toBe(false)
  })

  it('treats a label covering nothing as clear', () => {
    expect(propertyLaneLabelObscuresCurve(lane(0, 2_000), { from: 0, to: 0 })).toBe(false)
  })
})
