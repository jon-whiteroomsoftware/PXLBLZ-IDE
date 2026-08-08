import { describe, expect, it } from 'vitest'
import { featureAccessFromSearch, gateRouteForFeatureAccess } from './featureAccess'
import type { Route } from './routes'

describe('featureAccessFromSearch', () => {
  it.each([
    ['', false],
    ['?capture', false],
    ['?showtime', true],
    ['?showtime=0', true],
    ['?capture&showtime=preview', true],
  ])('enables Shows only when the showtime parameter is present in %j', (search, expected) => {
    expect(featureAccessFromSearch(search).shows).toBe(expected)
  })
})

describe('gateRouteForFeatureAccess', () => {
  it.each([
    [
      { kind: 'studio', entity: { kind: 'shows', id: null } },
      { shows: false },
      { kind: 'studio', entity: { kind: 'patterns', id: null } },
    ],
    [
      { kind: 'studio', entity: { kind: 'shows', id: 'opening-night' } },
      { shows: false },
      { kind: 'studio', entity: { kind: 'patterns', id: null } },
    ],
    [
      { kind: 'studio', entity: { kind: 'shows', id: 'opening-night' } },
      { shows: true },
      { kind: 'studio', entity: { kind: 'shows', id: 'opening-night' } },
    ],
    [
      { kind: 'studio', entity: { kind: 'controllers', id: 'controller-1' } },
      { shows: false },
      { kind: 'studio', entity: { kind: 'controllers', id: 'controller-1' } },
    ],
  ] satisfies Array<[Route, { shows: boolean }, Route]>)('gates only Show routes', (route, access, expected) => {
    expect(gateRouteForFeatureAccess(route, access)).toEqual(expected)
  })
})
