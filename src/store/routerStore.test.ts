import { describe, it, expect, beforeEach } from 'vitest'
import { useRouterStore, routerInitialState } from './routerStore'

// Vitest serves the app at base '/', so router paths are root-relative here.

function setLocation(path: string) {
  window.history.replaceState(null, '', path)
}

beforeEach(() => {
  useRouterStore.setState(routerInitialState)
  setLocation('/')
})

describe('syncFromLocation', () => {
  it('parses the current pathname into the route', () => {
    setLocation('/gallery')
    useRouterStore.getState().syncFromLocation()
    expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' })
  })

  it('parses entity-addressed studio paths', () => {
    setLocation('/studio/patterns/p-1')
    useRouterStore.getState().syncFromLocation()
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'p-1' },
    })
  })

  it('redirects legacy #/docs/<id> hash links to the path route', () => {
    setLocation('/#/docs/feature-guide')
    useRouterStore.getState().syncFromLocation()
    expect(useRouterStore.getState().route).toEqual({ kind: 'docs', docId: 'feature-guide' })
    expect(window.location.pathname).toBe('/docs/feature-guide')
    expect(window.location.hash).toBe('')
  })

  it('redirects legacy hash links even from a non-root path', () => {
    setLocation('/docs/ecosystem-primer#/docs/feature-guide')
    useRouterStore.getState().syncFromLocation()
    expect(useRouterStore.getState().route).toEqual({ kind: 'docs', docId: 'feature-guide' })
    expect(window.location.pathname).toBe('/docs/feature-guide')
  })
})

describe('navigate', () => {
  it('pushes a history entry and updates the route', () => {
    useRouterStore.getState().syncFromLocation()
    useRouterStore.getState().navigate({ kind: 'gallery' })
    expect(window.location.pathname).toBe('/gallery')
    expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' })
  })

  it('replaces instead of pushing when asked', () => {
    setLocation('/studio')
    useRouterStore.getState().syncFromLocation()
    const before = window.history.length
    useRouterStore.getState().navigate({ kind: 'gallery' }, { replace: true })
    expect(window.location.pathname).toBe('/gallery')
    expect(window.history.length).toBe(before)
  })

  it('does not touch history when the route is unchanged', () => {
    setLocation('/gallery')
    useRouterStore.getState().syncFromLocation()
    const before = window.history.length
    useRouterStore.getState().navigate({ kind: 'gallery' })
    expect(window.history.length).toBe(before)
  })

  it('preserves the query string (e.g. ?capture)', () => {
    setLocation('/studio?capture')
    useRouterStore.getState().syncFromLocation()
    useRouterStore.getState().navigate({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'x' },
    })
    expect(window.location.pathname).toBe('/studio/patterns/x')
    expect(window.location.search).toBe('?capture')
  })
})
