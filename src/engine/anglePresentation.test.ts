import { describe, expect, it } from 'vitest'
import {
  anglePresentationKind,
  parseAngleDraft,
  resolveAnglePresentation,
} from './anglePresentation'

describe('anglePresentationKind', () => {
  it('narrows only the four angle kinds', () => {
    expect(anglePresentationKind('direction')).toBe('direction')
    expect(anglePresentationKind('cycles')).toBe('cycles')
    expect(anglePresentationKind('percentage')).toBeNull()
    expect(anglePresentationKind(undefined)).toBeNull()
  })
})

describe('parseAngleDraft', () => {
  it('reads bare numbers in the canonical unit', () => {
    expect(parseAngleDraft('90', 'degrees')).toBeCloseTo(0.25, 10)
    expect(parseAngleDraft('-450', 'degrees')).toBeCloseTo(-1.25, 10)
    expect(parseAngleDraft('0.25', 'turns')).toBeCloseTo(0.25, 10)
    expect(parseAngleDraft('-2', 'turns')).toBe(-2)
  })

  it('reads explicit degree suffixes regardless of canonical unit', () => {
    expect(parseAngleDraft('90°', 'turns')).toBeCloseTo(0.25, 10)
    expect(parseAngleDraft('90 deg', 'turns')).toBeCloseTo(0.25, 10)
    expect(parseAngleDraft('-450deg', 'turns')).toBeCloseTo(-1.25, 10)
    expect(parseAngleDraft('180 degrees', 'degrees')).toBeCloseTo(0.5, 10)
  })

  it('reads explicit turn suffixes regardless of canonical unit', () => {
    expect(parseAngleDraft('0.5t', 'degrees')).toBeCloseTo(0.5, 10)
    expect(parseAngleDraft('2 turns', 'degrees')).toBe(2)
    expect(parseAngleDraft('1turn', 'turns')).toBe(1)
  })

  it('is case and whitespace tolerant', () => {
    expect(parseAngleDraft(' 90DEG ', 'turns')).toBeCloseTo(0.25, 10)
    expect(parseAngleDraft('0.5T', 'degrees')).toBeCloseTo(0.5, 10)
  })

  it('rejects drafts that are not a single angle quantity', () => {
    expect(parseAngleDraft('', 'degrees')).toBeNull()
    expect(parseAngleDraft('   ', 'turns')).toBeNull()
    expect(parseAngleDraft('abc', 'degrees')).toBeNull()
    expect(parseAngleDraft('90x', 'degrees')).toBeNull()
    expect(parseAngleDraft('1:2', 'turns')).toBeNull()
    expect(parseAngleDraft('90°°', 'turns')).toBeNull()
    expect(parseAngleDraft(null, 'degrees')).toBeNull()
    expect(parseAngleDraft(42 as unknown as string, 'degrees')).toBeNull()
  })
})

describe('resolveAnglePresentation direction', () => {
  const direction = resolveAnglePresentation('direction', {
    min: 0,
    max: 1,
    step: 0.001,
    anchor: 0.25,
  })

  it('presents degrees and spans exactly one turn', () => {
    expect(direction.unit).toBe('degrees')
    expect(direction.suffix).toBe('°')
    expect(direction.sliderMin).toBe(0)
    expect(direction.sliderMax).toBe(1)
    expect(direction.formatDraft(0.25)).toBe('90')
    expect(direction.format(0.25)).toBe('90°')
  })

  it('wraps exact entry onto the single cycle', () => {
    expect(direction.parse('450')).toBeCloseTo(0.25, 10)
    expect(direction.parse('-90')).toBeCloseTo(0.75, 10)
    expect(direction.parse('360')).toBe(0)
    expect(direction.parse('0.25t')).toBeCloseTo(0.25, 10)
    expect(direction.parse('1.25t')).toBeCloseTo(0.25, 10)
  })

  it('maps the slider linearly across the cycle and wraps the far endpoint to canonical zero', () => {
    expect(direction.toSliderPosition(0.25)).toBeCloseTo(0.25, 10)
    expect(direction.fromSliderPosition(0.5)).toBeCloseTo(0.5, 10)
    expect(direction.fromSliderPosition(1)).toBe(0)
  })

  it('marks compass quarters as labeled majors with eighth minors', () => {
    const majors = direction.sliderMarks.filter((mark) => mark.major)
    expect(majors.map((mark) => mark.position)).toEqual([0, 0.25, 0.5, 0.75, 1])
    expect(majors.map((mark) => mark.label)).toEqual(['E', 'S', 'W', 'N', 'E'])
    const minors = direction.sliderMarks.filter((mark) => !mark.major)
    expect(minors.map((mark) => mark.position)).toEqual([0.125, 0.375, 0.625, 0.875])
    expect(direction.neutralPosition).toBeUndefined()
  })
})

describe('resolveAnglePresentation phase', () => {
  it('windows onto the cycle containing the anchor', () => {
    const phase = resolveAnglePresentation('phase', {
      min: -8,
      max: 8,
      step: 0.01,
      anchor: 2.3,
    })
    expect(phase.unit).toBe('turns')
    expect(phase.suffix).toBe('t')
    expect(phase.sliderMin).toBe(2)
    expect(phase.sliderMax).toBe(3)
    expect(phase.toSliderPosition(2.5)).toBeCloseTo(0.5, 10)
    expect(phase.fromSliderPosition(0.25)).toBeCloseTo(2.25, 10)
  })

  it('keeps the window inside the field bounds at the extremes', () => {
    const atMax = resolveAnglePresentation('phase', {
      min: -8,
      max: 8,
      step: 0.01,
      anchor: 8,
    })
    expect(atMax.sliderMin).toBe(7)
    expect(atMax.sliderMax).toBe(8)
    const negative = resolveAnglePresentation('phase', {
      min: -8,
      max: 8,
      step: 0.01,
      anchor: -0.2,
    })
    expect(negative.sliderMin).toBe(-1)
    expect(negative.sliderMax).toBe(0)
  })

  it('never normalizes exact entry', () => {
    const phase = resolveAnglePresentation('phase', {
      min: -8,
      max: 8,
      step: 0.01,
      anchor: 0,
    })
    expect(phase.parse('1.25')).toBe(1.25)
    expect(phase.parse('450°')).toBeCloseTo(1.25, 10)
    expect(phase.parse('-2.5')).toBe(-2.5)
  })

  it('labels cycle quarters relative to the window cycle', () => {
    const base = resolveAnglePresentation('phase', {
      min: -8,
      max: 8,
      step: 0.01,
      anchor: 2.1,
    })
    const majors = base.sliderMarks.filter((mark) => mark.major)
    expect(majors.map((mark) => mark.label)).toEqual(['2', '2¼', '2½', '2¾', '3'])
    const zero = resolveAnglePresentation('phase', {
      min: 0,
      max: 1,
      step: 0.001,
      anchor: 0.3,
    })
    const zeroMajors = zero.sliderMarks.filter((mark) => mark.major)
    expect(zeroMajors.map((mark) => mark.label)).toEqual(['0', '¼', '½', '¾', '1'])
  })

  it('formats turns without masking authored precision', () => {
    const phase = resolveAnglePresentation('phase', {
      min: 0,
      max: 1,
      step: 0.001,
      anchor: 0,
    })
    expect(phase.formatDraft(0.25)).toBe('0.25')
    expect(phase.formatDraft(0.1 + 0.2)).toBe('0.3')
    expect(phase.format(0.25)).toBe('0.25t')
  })
})

describe('resolveAnglePresentation rotation', () => {
  it('windows two turns centered on the anchor whole turn', () => {
    const rotation = resolveAnglePresentation('rotation', {
      min: -8,
      max: 8,
      step: 1 / 360,
      anchor: 0,
    })
    expect(rotation.unit).toBe('degrees')
    expect(rotation.sliderMin).toBe(-1)
    expect(rotation.sliderMax).toBe(1)
    expect(rotation.neutralPosition).toBeCloseTo(0.5, 10)
    const majors = rotation.sliderMarks.filter((mark) => mark.major)
    expect(majors.map((mark) => mark.position)).toEqual([0, 0.5, 1])
    expect(majors.map((mark) => mark.label)).toEqual(['-360', '0', '360'])
  })

  it('recenters away from zero and drops the neutral marker when out of window', () => {
    const rotation = resolveAnglePresentation('rotation', {
      min: -8,
      max: 8,
      step: 1 / 360,
      anchor: 2.4,
    })
    expect(rotation.sliderMin).toBe(1)
    expect(rotation.sliderMax).toBe(3)
    expect(rotation.neutralPosition).toBeUndefined()
  })

  it('shifts the window inside one-sided bounds', () => {
    const spin = resolveAnglePresentation('rotation', {
      min: 0,
      max: 8,
      step: 0.01,
      anchor: 0,
    })
    expect(spin.sliderMin).toBe(0)
    expect(spin.sliderMax).toBe(2)
    expect(spin.neutralPosition).toBe(0)
  })

  it('preserves sign and turn count through parse and display', () => {
    const rotation = resolveAnglePresentation('rotation', {
      min: -8,
      max: 8,
      step: 1 / 360,
      anchor: 0,
    })
    expect(rotation.parse('720')).toBe(2)
    expect(rotation.parse('-540')).toBeCloseTo(-1.5, 10)
    expect(rotation.parse('1.5t')).toBe(1.5)
    expect(rotation.formatDraft(-0.5)).toBe('-180')
    expect(rotation.formatDraft(2)).toBe('720')
  })
})

describe('resolveAnglePresentation cycles', () => {
  it('presents turns with a two-turn centered window', () => {
    const cycles = resolveAnglePresentation('cycles', {
      min: -8,
      max: 8,
      step: 0.01,
      anchor: 0,
    })
    expect(cycles.unit).toBe('turns')
    expect(cycles.suffix).toBe('t')
    expect(cycles.sliderMin).toBe(-1)
    expect(cycles.sliderMax).toBe(1)
    const majors = cycles.sliderMarks.filter((mark) => mark.major)
    expect(majors.map((mark) => mark.label)).toEqual(['-1', '0', '1'])
    expect(cycles.formatDraft(1.5)).toBe('1.5')
    expect(cycles.format(1.5)).toBe('1.5t')
    expect(cycles.parse('180°')).toBeCloseTo(0.5, 10)
    expect(cycles.parse('2')).toBe(2)
  })
})

describe('resolveAnglePresentation degenerate bounds', () => {
  it('normalizes inverted bounds and falls back to the full span when narrower than the window', () => {
    const narrow = resolveAnglePresentation('rotation', {
      min: 1,
      max: -1,
      step: 0.01,
      anchor: 0,
    })
    expect(narrow.min).toBe(-1)
    expect(narrow.max).toBe(1)
    expect(narrow.sliderMin).toBe(-1)
    expect(narrow.sliderMax).toBe(1)
    const tiny = resolveAnglePresentation('phase', {
      min: 0,
      max: 0.5,
      step: 0.01,
      anchor: 0.2,
    })
    expect(tiny.sliderMin).toBe(0)
    expect(tiny.sliderMax).toBe(0.5)
  })
})
