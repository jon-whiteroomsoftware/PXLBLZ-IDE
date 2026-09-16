import { USER_DOCS, docHash, getUserDoc, isDocId, resolveDocAsset, resolveDocHref } from './catalog'

describe('docs catalog', () => {
  it('exposes the keyboard shortcuts guide in the public catalog', () => {
    expect(isDocId('keyboard-shortcuts')).toBe(true)
    expect(getUserDoc('keyboard-shortcuts')).toMatchObject({
      title: 'PXLBLZ Keyboard Shortcuts',
      menuLabel: 'Keyboard Shortcuts',
      menuKicker: 'Using PXLBLZ',
      path: 'docs/reference/PXLBLZ Keyboard Shortcuts.md',
    })
    expect(getUserDoc('keyboard-shortcuts')?.source).toContain('# PXLBLZ Keyboard Shortcuts')
  })

  it('exposes the public documentation set', () => {
    expect(USER_DOCS.map((doc) => doc.id)).toEqual([
      'ecosystem-primer',
      'feature-guide',
      'agent-authoring-reference',
      'keyboard-shortcuts',
      'show-visual-toolkit',
      'understanding-maps',
      'optimization-guide',
      'show-compiler',
      'technical-reference',
      'about',
      'privacy',
    ])
  })

  it('looks up doc ids and routes', () => {
    expect(isDocId('feature-guide')).toBe(true)
    expect(isDocId('technical-reference')).toBe(true)
    expect(isDocId('privacy')).toBe(true)
    expect(getUserDoc('feature-guide')?.menuLabel).toBe('Feature Guide')
    expect(getUserDoc('privacy')?.source).toContain('privacy@whiteroomsoftware.com')
    expect(getUserDoc('show-visual-toolkit')?.source).toContain('Property animation')
    expect(getUserDoc('show-visual-toolkit')).toMatchObject({
      title: 'Visual Effects Guide',
      menuLabel: 'Visual Effects Guide',
      path: 'docs/guides/Visual effects guide.md',
    })
    expect(docHash('optimization-guide')).toBe('#/docs/optimization-guide')
    expect(docHash('understanding-maps')).toBe('#/docs/understanding-maps')
  })

  it('resolves checked-in diagram assets', () => {
    const primer = getUserDoc('ecosystem-primer')
    expect(primer).not.toBeNull()
    expect(resolveDocAsset(primer!, '../images/map-pipeline.svg')).not.toBe('../images/map-pipeline.svg')
    expect(resolveDocAsset(primer!, './unknown.svg')).toBe('./unknown.svg')
    const toolkit = getUserDoc('show-visual-toolkit')
    expect(resolveDocAsset(toolkit!, '../screenshots/show-visual-toolkit-overview.png')).not.toBe(
      '../screenshots/show-visual-toolkit-overview.png',
    )
  })

  it('resolves relative links for production', () => {
    const guide = getUserDoc('optimization-guide')
    expect(guide).not.toBeNull()
    expect(resolveDocHref(guide!, '../../test/perf-harness/costs.md')).toBe(
      'https://github.com/jon-whiteroomsoftware/PXLBLZ-IDE/blob/main/test/perf-harness/costs.md',
    )
  })

  it('resolves the Feature Guide agent-authoring link inside the app', () => {
    const guide = getUserDoc('feature-guide')
    expect(guide).not.toBeNull()
    expect(resolveDocHref(guide!, 'agent-clip-layer-authoring.md')).toBe('#/docs/agent-authoring-reference')
    expect(getUserDoc('agent-authoring-reference')).toMatchObject({
      title: 'Agent Authoring Reference',
      menuLabel: 'Agent Authoring Reference',
      menuKicker: 'Agent editing',
      path: 'docs/reference/agent-clip-layer-authoring.md',
    })
  })
})
