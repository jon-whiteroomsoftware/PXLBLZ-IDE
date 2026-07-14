import { beforeEach, describe, expect, it } from 'vitest'
import { routerInitialState, useRouterStore } from './routerStore'
import {
  referenceNavigationInitialState,
  useReferenceNavigationStore,
} from './referenceNavigationStore'

describe('reference navigation', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', '/studio/patterns/p-1')
    useRouterStore.setState({
      route: { kind: 'studio', entity: { kind: 'patterns', id: 'p-1' } },
    })
    useReferenceNavigationStore.setState(referenceNavigationInitialState)
  })

  it('preserves a Studio origin while switching between Docs and API', () => {
    const navigation = useReferenceNavigationStore.getState()

    navigation.toggleDocs()
    expect(useRouterStore.getState().route).toEqual({ kind: 'docs', docId: null })
    expect(useReferenceNavigationStore.getState().studioContext).toBe(true)

    useReferenceNavigationStore.getState().toggleApi()
    expect(useRouterStore.getState().route).toEqual({ kind: 'api-reference', libraryId: null })
    expect(useReferenceNavigationStore.getState().studioContext).toBe(true)

    useReferenceNavigationStore.getState().toggleApi()
    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'p-1' },
    })
  })

  it('falls back to Gallery when an active deep-linked reference has no origin', () => {
    useRouterStore.setState({ route: { kind: 'docs', docId: 'about' } })

    useReferenceNavigationStore.getState().toggleDocs()

    expect(useRouterStore.getState().route).toEqual({ kind: 'gallery' })
    expect(useReferenceNavigationStore.getState()).toMatchObject(referenceNavigationInitialState)
  })

  it('returns explicitly to the captured origin from either reference workspace', () => {
    useReferenceNavigationStore.getState().toggleDocs()
    useReferenceNavigationStore.getState().toggleApi()

    useReferenceNavigationStore.getState().returnToOrigin()

    expect(useRouterStore.getState().route).toEqual({
      kind: 'studio',
      entity: { kind: 'patterns', id: 'p-1' },
    })
    expect(useReferenceNavigationStore.getState()).toMatchObject(referenceNavigationInitialState)
  })

  it('can be reset with the shared initial state', () => {
    useRouterStore.setState(routerInitialState)
    expect(useReferenceNavigationStore.getState()).toMatchObject(referenceNavigationInitialState)
  })
})
