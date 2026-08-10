import {
  DEMO_SECTIONS,
  GALLERY_ALL_CATEGORY,
  GALLERY_CATEGORIES,
  GALLERY_DIRECTORIES,
  GALLERY_PATTERNS,
  STOCK_PATTERNS,
  TEST_PATTERNS,
  filterGalleryPatterns,
  galleryDirectoryBySlug,
  galleryPatternBySlug,
  patternSlug,
} from './galleryCatalog'
import { RECOMMENDED_SETTINGS } from '@/pixelblaze/stock/patterns'

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

  it('gives every built-in Gallery directory one unique shareable slug', () => {
    expect(GALLERY_DIRECTORIES.map((directory) => directory.slug)).toHaveLength(
      new Set(GALLERY_DIRECTORIES.map((directory) => directory.slug)).size,
    )
    expect(galleryDirectoryBySlug('zranger1')).toEqual({
      label: 'ZRanger1',
      slug: 'zranger1',
    })
    expect(galleryDirectoryBySlug('living-1d')?.label).toBe('Living 1D')
  })

  it('AND-combines dimension, category, and name filters', () => {
    const results = filterGalleryPatterns(GALLERY_PATTERNS, {
      lens: 1,
      category: 'Living 1D',
      query: 'metro',
    })

    expect(results.map((pattern) => pattern.name)).toEqual(['MetroLines'])
  })

  it('classifies launch showcase patterns by their real cost and dimensional role', () => {
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'MandelbulbHeartbeat')?.sections).toContain('3D')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'ImpactEngine')?.sections).toContain('Living 1D')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'ShapeShifter')?.sections).toContain('Radial')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'AuroraSphere')?.sections).toContain('3D')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'StandingWaveOrgan')?.sections).toContain('Living 1D')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'ClockworkIris')?.sections).toContain('Radial')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'SceneSplice')?.sections).toContain('FPS Friendly')
    expect(GALLERY_PATTERNS.find((pattern) => pattern.name === 'SceneSplice3D')?.sections).toContain('3D')
  })

  it('catalogues the universal map diagnostic with the measured mast presentation', () => {
    const pattern = STOCK_PATTERNS.find((candidate) => candidate.name === 'MapAlignmentDiagnostic')
    expect(pattern).toMatchObject({
      name: 'MapAlignmentDiagnostic',
      dim: 3,
      sections: ['Test Patterns'],
    })
    expect(RECOMMENDED_SETTINGS.MapAlignmentDiagnostic).toMatchObject({
      mapId: 'clustered-helical-mast-surface',
      pixelCount: 52,
      normalize: 'fill',
    })
  })

  it('catalogues the analog input diagnostic as a wiring-order Test Pattern', () => {
    const pattern = STOCK_PATTERNS.find((candidate) => candidate.name === 'AnalogWiggleFinder')
    expect(pattern).toMatchObject({
      name: 'AnalogWiggleFinder',
      dim: 3,
      sections: ['Test Patterns'],
    })
    expect(RECOMMENDED_SETTINGS.AnalogWiggleFinder).toMatchObject({
      mapId: 'plane-strand',
      pixelCount: 100,
      brightness: 1,
    })
  })

  it('keeps the entire Test Patterns section out of the public Gallery (#785)', () => {
    const galleryNames = new Set(GALLERY_PATTERNS.map((pattern) => pattern.name))
    const testPatternNames = STOCK_PATTERNS
      .filter((pattern) => pattern.sections.includes('Test Patterns'))
      .map((pattern) => pattern.name)

    expect(testPatternNames).toEqual([...TEST_PATTERNS].sort((a, b) => a.localeCompare(b)))
    expect(TEST_PATTERNS.every((name) => !galleryNames.has(name))).toBe(true)
    expect(galleryPatternBySlug('map-alignment-diagnostic')).toBeUndefined()
    expect(GALLERY_CATEGORIES).not.toContain('Test Patterns')
    expect(GALLERY_DIRECTORIES.map((directory) => directory.label)).not.toContain('Test Patterns')
    expect(GALLERY_PATTERNS.some((pattern) => pattern.name === 'IridescentFibers')).toBe(true)
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
