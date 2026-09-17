import { describe, expect, it } from 'vitest'
import { SHOW_V2_ROUTE_DEFAULT, isShowV2RouteEnabled, opensOnShowV2Route } from './showV2RouteGate'

describe('the v2 Show route gate', () => {
  it('is the production default, so v2 is the Show path however the build answers (#1039)', () => {
    expect(SHOW_V2_ROUTE_DEFAULT).toBe(true)
    expect(isShowV2RouteEnabled({ dev: false, search: '' })).toBe(true)
    expect(isShowV2RouteEnabled({ dev: false, search: '?show-v2-editor=0' })).toBe(true)
    expect(isShowV2RouteEnabled({ dev: true, search: '' })).toBe(true)
  })
})

describe('which editor a routed Show opens on', () => {
  it('opens a stored v2 row on the v2 route in every build', () => {
    expect(opensOnShowV2Route({ storedV2: true, dev: false, search: '' })).toBe(true)
    expect(opensOnShowV2Route({ storedV2: true, dev: true, search: '' })).toBe(true)
  })

  it('leaves an unconverted v1 row on the v1 editor in a production build', () => {
    // Specification section 10: no migration on read. Until the operator
    // conversion rewrites the row, the editor that holds it is the v1 one, and
    // the command catalogue follows that same record version.
    expect(opensOnShowV2Route({ storedV2: false, dev: false, search: '' })).toBe(false)
    expect(opensOnShowV2Route({ storedV2: false, dev: false, search: '?show-v2-editor=1' })).toBe(false)
  })

  it('answers the development preview of an unconverted row exactly', () => {
    expect(opensOnShowV2Route({ storedV2: false, dev: true, search: '?show-v2-editor=1' })).toBe(true)
    expect(opensOnShowV2Route({ storedV2: false, dev: true, search: '?other=1&show-v2-editor=1' })).toBe(true)
    for (const search of ['', '?show-v2-editor=0', '?show-v2-editor', '?show-v2-editor=true', '?show-v2-pilot=1']) {
      expect(opensOnShowV2Route({ storedV2: false, dev: true, search })).toBe(false)
    }
  })
})
