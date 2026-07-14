import { USER_DOCS, docHash, getUserDoc, isDocId, resolveDocAsset, resolveDocHref } from './catalog'

describe('docs catalog', () => {
  it('exposes the public documentation set', () => {
    expect(USER_DOCS.map((doc) => doc.id)).toEqual([
      'ecosystem-primer',
      'feature-guide',
      'understanding-maps',
      'optimization-guide',
      'technical-reference',
      'about',
    ])
  })

  it('looks up doc ids and routes', () => {
    expect(isDocId('feature-guide')).toBe(true)
    expect(isDocId('technical-reference')).toBe(true)
    expect(getUserDoc('feature-guide')?.menuLabel).toBe('Feature Guide')
    expect(docHash('optimization-guide')).toBe('#/docs/optimization-guide')
    expect(docHash('understanding-maps')).toBe('#/docs/understanding-maps')
  })

  it('resolves checked-in diagram assets', () => {
    const primer = getUserDoc('ecosystem-primer')
    expect(primer).not.toBeNull()
    expect(resolveDocAsset(primer!, '../images/map-pipeline.svg')).not.toBe('../images/map-pipeline.svg')
    expect(resolveDocAsset(primer!, './unknown.svg')).toBe('./unknown.svg')
  })

  it('resolves relative links for production', () => {
    const guide = getUserDoc('optimization-guide')
    expect(guide).not.toBeNull()
    expect(resolveDocHref(guide!, '../../test/perf-harness/costs.md')).toBe(
      'https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/main/test/perf-harness/costs.md',
    )
  })
})
