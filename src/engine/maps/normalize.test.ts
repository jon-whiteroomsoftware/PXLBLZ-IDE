import { normalizeAspect } from './normalize'

describe('normalizeAspect', () => {
  it('anchors the longest axis to [0,1] and scales shorter axes proportionally', () => {
    // x spans 0..4 (range 4, longest), y spans 0..2 (range 2) → y maps to 0..0.5,
    // preserving the 2:1 aspect instead of stretching both axes to fill [0,1].
    expect(normalizeAspect([[0, 0], [2, 1], [4, 2]])).toEqual([
      [0, 0],
      [0.5, 0.25],
      [1, 0.5],
    ])
  })

  it('keeps a square layout square (equal ranges → both fill [0,1])', () => {
    expect(normalizeAspect([[0, 0], [2, 2], [4, 4]])).toEqual([
      [0, 0],
      [0.5, 0.5],
      [1, 1],
    ])
  })

  it('reproduces i/(cols-1) for a single row (plane byte-stability)', () => {
    const cols = 5
    const raw = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]]
    const out = normalizeAspect(raw)
    for (let col = 0; col < cols; col++) {
      // x is the longest (and only non-degenerate) axis → fills [0,1] as before.
      expect(out[col][0]).toBe(col / (cols - 1))
      expect(out[col][1]).toBe(0)
    }
  })

  it('preserves aspect across 3 axes (longest axis anchors all)', () => {
    // x:0..4, y:0..2, z:0..1 → divide all by 4.
    expect(normalizeAspect([[0, 0, 0], [4, 2, 1]])).toEqual([
      [0, 0, 0],
      [1, 0.5, 0.25],
    ])
  })

  it('collapses a degenerate (constant) short axis to 0', () => {
    expect(normalizeAspect([[0, 7], [2, 7], [4, 7]])).toEqual([
      [0, 0],
      [0.5, 0],
      [1, 0],
    ])
  })

  it('collapses a fully coincident input to the origin', () => {
    expect(normalizeAspect([[3, 9, 2]])).toEqual([[0, 0, 0]])
    expect(normalizeAspect([[5, 5], [5, 5]])).toEqual([[0, 0], [0, 0]])
  })

  it('returns empty for empty input and does not mutate the input', () => {
    expect(normalizeAspect([])).toEqual([])
    const raw = [[1, 2], [3, 4]]
    normalizeAspect(raw)
    expect(raw).toEqual([[1, 2], [3, 4]])
  })
})
