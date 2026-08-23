import { describe, it, expect } from 'vitest'
import {
  parseRoute,
  routePath,
  routesEqual,
  legacyDocsHashId,
  type Route,
} from './routes'

describe('parseRoute', () => {
  it('parses the root path as the public gallery', () => {
    expect(parseRoute('/', '/')).toEqual({ kind: 'gallery' })
  })

  it('parses /gallery', () => {
    expect(parseRoute('/gallery', '/')).toEqual({ kind: 'gallery' })
  })

  it('parses a Gallery directory route', () => {
    expect(parseRoute('/gallery/zranger1', '/')).toEqual({
      kind: 'gallery',
      directorySlug: 'zranger1',
    })
  })

  it('parses /studio as plain studio', () => {
    expect(parseRoute('/studio', '/')).toEqual({ kind: 'studio', entity: null })
  })

  it('parses /studio-welcome', () => {
    expect(parseRoute('/studio-welcome', '/')).toEqual({ kind: 'studio-welcome' })
  })

  it('parses entity-addressed studio routes', () => {
    expect(parseRoute('/studio/patterns', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: null },
    })
    expect(parseRoute('/studio/mixins', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'mixins', id: null },
    })
    expect(parseRoute('/studio/patterns/abc-123', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'abc-123' },
    })
    expect(parseRoute('/studio/maps/m1', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'maps', id: 'm1' },
    })
    expect(parseRoute('/studio/libraries/Shader', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'libraries', id: 'Shader' },
    })
  })

  it('rejects unknown studio entity kinds', () => {
    expect(parseRoute('/studio/widgets/w1', '/')).toEqual({
      kind: 'not-found',
      path: '/studio/widgets/w1',
    })
  })

  it('parses pattern detail routes', () => {
    expect(parseRoute('/p/rainbow-melt', '/')).toEqual({
      kind: 'pattern-detail',
      slug: 'rainbow-melt',
    })
  })

  it('parses docs routes', () => {
    expect(parseRoute('/docs', '/')).toEqual({
      kind: 'docs',
      docId: null,
    })
    expect(parseRoute('/docs/feature-guide', '/')).toEqual({
      kind: 'docs',
      docId: 'feature-guide',
    })
  })

  it('parses API reference routes', () => {
    expect(parseRoute('/reference', '/')).toEqual({
      kind: 'api-reference',
      libraryId: null,
    })
    expect(parseRoute('/reference/Anim', '/')).toEqual({
      kind: 'api-reference',
      libraryId: 'Anim',
    })
  })

  it('decodes URI-encoded segments', () => {
    expect(parseRoute('/studio/patterns/a%20b', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'a b' },
    })
  })

  it('treats unknown paths as not-found', () => {
    expect(parseRoute('/bogus', '/')).toEqual({ kind: 'not-found', path: '/bogus' })
  })

  it('strips a non-root base path', () => {
    expect(parseRoute('/PXLBLZ-IDE/', '/PXLBLZ-IDE/')).toEqual({ kind: 'gallery' })
    expect(parseRoute('/PXLBLZ-IDE/gallery', '/PXLBLZ-IDE/')).toEqual({ kind: 'gallery' })
    expect(parseRoute('/PXLBLZ-IDE/gallery/zranger1', '/PXLBLZ-IDE/')).toEqual({
      kind: 'gallery',
      directorySlug: 'zranger1',
    })
    expect(parseRoute('/PXLBLZ-IDE/studio/patterns/x', '/PXLBLZ-IDE/')).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'x' },
    })
  })

  it('treats paths outside the base as not-found', () => {
    expect(parseRoute('/elsewhere/gallery', '/PXLBLZ-IDE/')).toEqual({
      kind: 'not-found',
      path: '/elsewhere/gallery',
    })
  })

  it('ignores trailing slashes', () => {
    expect(parseRoute('/gallery/', '/')).toEqual({ kind: 'gallery' })
    expect(parseRoute('/studio/patterns/x/', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'x' },
    })
  })
})

describe('routePath', () => {
  it('formats each route kind', () => {
    expect(routePath({ kind: 'gallery' }, '/')).toBe('/gallery')
    expect(routePath({ kind: 'gallery', directorySlug: 'living-1d' }, '/')).toBe(
      '/gallery/living-1d',
    )
    expect(routePath({ kind: 'studio-welcome' }, '/')).toBe('/studio-welcome')
    expect(routePath({ kind: 'studio', entity: null }, '/')).toBe('/studio')
    expect(routePath({ kind: 'studio', entity: { kind: 'maps', id: null } }, '/')).toBe(
      '/studio/maps',
    )
    expect(routePath({ kind: 'studio', entity: { kind: 'patterns', id: 'x' } }, '/')).toBe(
      '/studio/patterns/x',
    )
    expect(routePath({ kind: 'studio', entity: { kind: 'libraries', id: 'Shader' } }, '/')).toBe(
      '/studio/libraries/Shader',
    )
    expect(routePath({ kind: 'pattern-detail', slug: 's' }, '/')).toBe('/p/s')
    expect(routePath({ kind: 'show-detail', slug: 'quadrille' }, '/')).toBe('/s/quadrille')
    expect(parseRoute('/s/quadrille', '/')).toEqual({ kind: 'show-detail', slug: 'quadrille' })
    expect(parseRoute('/s/a/b', '/')).toEqual(expect.objectContaining({ kind: 'not-found' }))
    expect(routePath({ kind: 'docs', docId: 'feature-guide' }, '/')).toBe('/docs/feature-guide')
    expect(routePath({ kind: 'api-reference', libraryId: 'Anim' }, '/')).toBe('/reference/Anim')
  })

  it('prefixes a non-root base', () => {
    expect(routePath({ kind: 'gallery' }, '/PXLBLZ-IDE/')).toBe('/PXLBLZ-IDE/gallery')
    expect(routePath({ kind: 'studio', entity: null }, '/PXLBLZ-IDE/')).toBe('/PXLBLZ-IDE/studio')
  })

  it('URI-encodes segments', () => {
    expect(routePath({ kind: 'studio', entity: { kind: 'patterns', id: 'a b' } }, '/')).toBe(
      '/studio/patterns/a%20b',
    )
  })

  it('round-trips through parseRoute', () => {
    const routes: Route[] = [
      { kind: 'gallery' },
      { kind: 'gallery', directorySlug: 'fps-friendly' },
      { kind: 'studio-welcome' },
      { kind: 'studio', entity: null },
      { kind: 'studio', entity: { kind: 'controllers', id: null } },
      { kind: 'studio', entity: { kind: 'maps', id: 'm-1' } },
      { kind: 'studio', entity: { kind: 'libraries', id: 'Shader' } },
      { kind: 'pattern-detail', slug: 'slug' },
      { kind: 'docs', docId: 'ecosystem-primer' },
      { kind: 'api-reference', libraryId: 'PixelBlaze' },
    ]
    for (const base of ['/', '/PXLBLZ-IDE/']) {
      for (const route of routes) {
        expect(parseRoute(routePath(route, base), base)).toEqual(route)
      }
    }
  })

  it('formats not-found back to its original path', () => {
    expect(routePath({ kind: 'not-found', path: '/bogus' }, '/')).toBe('/bogus')
  })
})

describe('routesEqual', () => {
  it('compares by value', () => {
    expect(
      routesEqual(
        { kind: 'studio', entity: { kind: 'patterns', id: 'x' } },
        { kind: 'studio', entity: { kind: 'patterns', id: 'x' } },
      ),
    ).toBe(true)
    expect(
      routesEqual(
        { kind: 'studio', entity: { kind: 'patterns', id: 'x' } },
        { kind: 'studio', entity: { kind: 'patterns', id: 'y' } },
      ),
    ).toBe(false)
    expect(
      routesEqual(
        { kind: 'gallery', directorySlug: 'zranger1' },
        { kind: 'gallery', directorySlug: 'living-1d' },
      ),
    ).toBe(false)
    expect(routesEqual({ kind: 'gallery' }, { kind: 'studio', entity: null })).toBe(false)
  })
})

describe('legacyDocsHashId', () => {
  it('extracts the doc id from a legacy hash route', () => {
    expect(legacyDocsHashId('#/docs/feature-guide')).toBe('feature-guide')
  })

  it('returns null for anything else', () => {
    expect(legacyDocsHashId('')).toBeNull()
    expect(legacyDocsHashId('#section')).toBeNull()
    expect(legacyDocsHashId('#/docs/')).toBeNull()
    expect(legacyDocsHashId('#/docs/a/b')).toBeNull()
  })
})
