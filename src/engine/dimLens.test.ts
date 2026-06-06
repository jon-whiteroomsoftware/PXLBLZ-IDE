import { nativeDim, matchesLens } from './dimLens'

describe('nativeDim', () => {
  it('returns the highest render fn a source defines', () => {
    expect(nativeDim('export function render(i) {}')).toBe(1)
    expect(nativeDim('export function render2D(i, x, y) {}')).toBe(2)
    expect(nativeDim('export function render3D(i, x, y, z) {}')).toBe(3)
  })

  it('collapses a membership set to the single canonical (highest) value', () => {
    const src = 'function render(i){} function render3D(i,x,y,z){}'
    expect(nativeDim(src)).toBe(3)
  })

  it('defaults to 2 when no render fn is defined (matches the preview lock)', () => {
    expect(nativeDim('var foo = 1')).toBe(2)
    expect(nativeDim('')).toBe(2)
  })
})

describe('matchesLens', () => {
  it('passes everything under the All lens', () => {
    expect(matchesLens(1, 'all')).toBe(true)
    expect(matchesLens(2, 'all')).toBe(true)
    expect(matchesLens(3, 'all')).toBe(true)
  })

  it('passes only exact dimension matches under a dimension lens', () => {
    expect(matchesLens(2, 2)).toBe(true)
    expect(matchesLens(2, 1)).toBe(false)
    expect(matchesLens(3, 2)).toBe(false)
    expect(matchesLens(1, 1)).toBe(true)
  })
})
