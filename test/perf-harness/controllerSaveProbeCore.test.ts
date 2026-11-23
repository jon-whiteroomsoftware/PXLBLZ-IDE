import { describe, expect, it } from 'vitest'
import { compareReadBack, maxInboundGapMs, sourcePadding } from './controllerSaveProbeCore'

describe('maxInboundGapMs', () => {
  it('counts silence at both window edges', () => {
    expect(maxInboundGapMs([], 100, 600)).toBe(500)
    expect(maxInboundGapMs([150, 200], 100, 900)).toBe(700)
    expect(maxInboundGapMs([1000, 1100], 100, 1100)).toBe(900)
  })

  it('ignores frames outside the window', () => {
    expect(maxInboundGapMs([50, 300, 320, 2000], 100, 400)).toBe(200)
  })
})

describe('compareReadBack', () => {
  const starting = [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Beta' }]

  it('names missing probe ids and leaves unrelated Patterns alone', () => {
    const result = compareReadBack(starting, [...starting, { id: 'P1', name: 'zz-1268-01' }], ['P1', 'P2'])
    expect(result).toEqual({ missingProbeIds: ['P2'], unexpected: [], lost: [] })
  })

  it('reports an unrelated rename as both unexpected and lost', () => {
    const result = compareReadBack(starting, [{ id: 'A', name: 'Alpha' }, { id: 'B', name: 'Renamed' }], [])
    expect(result.unexpected).toEqual([{ id: 'B', name: 'Renamed' }])
    expect(result.lost).toEqual([{ id: 'B', name: 'Beta' }])
  })
})

describe('sourcePadding', () => {
  it('is a deterministic comment of at least the requested size', () => {
    const padding = sourcePadding(4000)
    expect(padding.length).toBeGreaterThanOrEqual(4000)
    expect(padding).toBe(sourcePadding(4000))
    expect(padding.split('\n').filter(Boolean).every((line) => line.startsWith('// '))).toBe(true)
    expect(sourcePadding(0)).toBe('')
  })
})
