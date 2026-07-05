import { describe, it, expect } from 'vitest'
import {
  parseRoute,
  routePath,
  routesEqual,
  legacyDocsHashId,
  type Route,
} from './routes'

describe('parseRoute', () => {
  it('parses the root path as plain studio', () => {
    expect(parseRoute('/', '/')).toEqual({ kind: 'studio', entity: null })
  })

  it('parses /gallery', () => {
    expect(parseRoute('/gallery', '/')).toEqual({ kind: 'gallery' })
  })

  it('parses /studio as plain studio', () => {
    expect(parseRoute('/studio', '/')).toEqual({ kind: 'studio', entity: null })
  })

  it('parses entity-addressed studio routes', () => {
    expect(parseRoute('/studio/patterns/abc-123', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'abc-123' },
    })
    expect(parseRoute('/studio/maps/m1', '/')).toEqual({
      kind: 'studio',
      entity: { kind: 'maps', id: 'm1' },
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
    expect(parseRoute('/docs/feature-guide', '/')).toEqual({
      kind: 'docs',
      docId: 'feature-guide',
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
    expect(parseRoute('/studio/patterns', '/')).toEqual({
      kind: 'not-found',
      path: '/studio/patterns',
    })
    expect(parseRoute('/docs', '/')).toEqual({ kind: 'not-found', path: '/docs' })
  })

  it('strips a non-root base path', () => {
    expect(parseRoute('/PXLBLZ-IDE/', '/PXLBLZ-IDE/')).toEqual({ kind: 'studio', entity: null })
    expect(parseRoute('/PXLBLZ-IDE/gallery', '/PXLBLZ-IDE/')).toEqual({ kind: 'gallery' })
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
    expect(routePath({ kind: 'studio', entity: null }, '/')).toBe('/studio')
    expect(routePath({ kind: 'studio', entity: { kind: 'patterns', id: 'x' } }, '/')).toBe(
      '/studio/patterns/x',
    )
    expect(routePath({ kind: 'pattern-detail', slug: 's' }, '/')).toBe('/p/s')
    expect(routePath({ kind: 'docs', docId: 'feature-guide' }, '/')).toBe('/docs/feature-guide')
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
      { kind: 'studio', entity: null },
      { kind: 'studio', entity: { kind: 'maps', id: 'm-1' } },
      { kind: 'pattern-detail', slug: 'slug' },
      { kind: 'docs', docId: 'ecosystem-primer' },
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
