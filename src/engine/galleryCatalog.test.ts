import {
  DEMO_SECTIONS,
  GALLERY_ALL_CATEGORY,
  GALLERY_PATTERNS,
  filterGalleryPatterns,
  galleryPatternBySlug,
  patternSlug,
} from './galleryCatalog'

describe('galleryCatalog (#309)', () => {
  it('creates stable lowercase slugs for built-in pattern names', () => {
    expect(patternSlug('IridescentFibers')).toBe('iridescent-fibers')
    expect(galleryPatternBySlug('neon-squircles')?.name).toBe('NeonSquircles')
  })

  it('uses the built-in section vocabulary as gallery categories', () => {
    const sectionNames = DEMO_SECTIONS.map((section) => section.label)
    expect(sectionNames).toContain('ShaderToy Ports')
    expect(sectionNames).toContain('FPS Friendly')
    expect(sectionNames).toContain('Living 1D')
  })

  it('AND-combines dimension, category, and name filters', () => {
    const results = filterGalleryPatterns(GALLERY_PATTERNS, {
      lens: 1,
      category: 'Living 1D',
      query: 'metro',
    })

    expect(results.map((pattern) => pattern.name)).toEqual(['MetroLines'])
  })

  it('treats Everything and an empty query as no-ops', () => {
    const all = filterGalleryPatterns(GALLERY_PATTERNS, {
      lens: 'all',
      category: GALLERY_ALL_CATEGORY,
      query: ' ',
    })

    expect(all).toHaveLength(GALLERY_PATTERNS.length)
  })
})
