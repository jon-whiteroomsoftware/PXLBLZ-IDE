import { describe, expect, it } from 'vitest'
import { SHOW_V2_ROUTE_DEFAULT, isShowV2RouteEnabled } from './showV2RouteGate'

describe('the v2 Show route gate', () => {
  it('is off by default, so production still routes v1 (#1039 owns the flip)', () => {
    expect(SHOW_V2_ROUTE_DEFAULT).toBe(false)
    expect(isShowV2RouteEnabled({ dev: false, search: '?show-v2-editor=1' })).toBe(false)
    expect(isShowV2RouteEnabled({ dev: true, search: '' })).toBe(false)
  })

  it('answers the development opt-in exactly', () => {
    expect(isShowV2RouteEnabled({ dev: true, search: '?show-v2-editor=1' })).toBe(true)
    expect(isShowV2RouteEnabled({ dev: true, search: '?other=1&show-v2-editor=1' })).toBe(true)
    for (const search of ['?show-v2-editor=0', '?show-v2-editor', '?show-v2-editor=true', '?show-v2-pilot=1']) {
      expect(isShowV2RouteEnabled({ dev: true, search })).toBe(false)
    }
  })
})
