import { describe, expect, it } from 'vitest'
import {
  STUDIO_PLACES,
  moveStudioPlaceFocus,
  studioPlaceForRoute,
  studioPlaceForShortcut,
  studioPlaceTypeaheadIndex,
} from './studioPlaces'

describe('Studio place control model (#965)', () => {
  it('maps Studio and reference routes to their visible place', () => {
    expect(studioPlaceForRoute({ kind: 'studio', entity: { kind: 'shows', id: 'show-1' } })).toBe('shows')
    expect(studioPlaceForRoute({ kind: 'studio', entity: null })).toBe('patterns')
    expect(studioPlaceForRoute({ kind: 'docs', docId: 'feature-guide' })).toBe('docs')
    expect(studioPlaceForRoute({ kind: 'api-reference', libraryId: 'Anim' })).toBe('api-reference')
    expect(studioPlaceForRoute({ kind: 'pattern-detail', slug: 'aurora' })).toBe('patterns')
    expect(studioPlaceForRoute({ kind: 'show-detail', slug: 'overture' })).toBe('shows')
  })

  it('keeps the accepted menu order and wraps arrow focus', () => {
    expect(STUDIO_PLACES.map((place) => place.id)).toEqual([
      'patterns', 'shows', 'maps', 'controllers', 'mixins', 'libraries', 'docs', 'api-reference',
    ])
    expect(moveStudioPlaceFocus(0, -1)).toBe(7)
    expect(moveStudioPlaceFocus(7, 1)).toBe(0)
  })

  it('uses collision-free mnemonic shortcuts and ignores modified keys', () => {
    expect(['p', 's', 'm', 'c', 'x', 'l', 'd', 'r'].map((key) => studioPlaceForShortcut({
      key,
      altKey: false,
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
    }))).toEqual(STUDIO_PLACES.map((place) => place.id))
    expect(studioPlaceForShortcut({ key: '1', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false })).toBeNull()
    expect(studioPlaceForShortcut({ key: 'p', altKey: false, ctrlKey: true, metaKey: false, shiftKey: false })).toBeNull()
  })

  it('typeahead moves to the next matching place', () => {
    expect(studioPlaceTypeaheadIndex('m', 2)).toBe(4)
    expect(studioPlaceTypeaheadIndex('li', 0)).toBe(5)
    expect(studioPlaceTypeaheadIndex('z', 0)).toBeNull()
  })
})
