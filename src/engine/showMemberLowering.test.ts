// Pattern-member lowering module (#570): the shared utilities keep their
// exact pre-move semantics.
import { byteLength, clampNumber, compileMember, normalizeAdaptation } from './showMemberLowering'

describe('member lowering utilities', () => {
  it('clamps non-finite values to the minimum bound', () => {
    expect(clampNumber(Number.NaN, 0, 1)).toBe(0)
    expect(clampNumber(Number.POSITIVE_INFINITY, 0, 1)).toBe(0)
    expect(clampNumber(0.5, 0, 1)).toBe(0.5)
    expect(clampNumber(2, 0, 1)).toBe(1)
  })

  it('measures UTF-8 bytes, not UTF-16 units', () => {
    expect(byteLength('abc')).toBe(3)
    expect(byteLength('abé')).toBe(4)
  })

  it('normalizes non-finite adaptation values to safe bounds', () => {
    const adaptation = normalizeAdaptation({ brightness: Number.NaN, timeScale: Number.POSITIVE_INFINITY })
    expect(adaptation.brightness).toBe(0)
    expect(adaptation.timeScale).toBe(0)
  })

  it('lowers a minimal clip into a renamed member', () => {
    const member = compileMember(
      { id: 'solo', source: 'export function render(index) { rgb(index / pixelCount, 0, 0) }' },
      0,
      {},
    )
    expect(member.prefix).toBe('__pxlblz_show_c0')
    expect(member.hasRender).toBe(true)
    expect(member.code).toContain('__pxlblz_show_c0_render')
    expect(member.code).not.toContain('export ')
  })
})
