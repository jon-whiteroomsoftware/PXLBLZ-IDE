// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import {
  sanitizeStudioEntityDrawerPinPreferences,
  useStudioEntityDrawerStore,
} from './studioEntityDrawerStore'

describe('Studio entity drawer pin persistence (#966)', () => {
  beforeEach(() => {
    localStorage.clear()
    useStudioEntityDrawerStore.setState({ pinPreferences: {} })
  })

  it('stores pin choices independently for each place', () => {
    useStudioEntityDrawerStore.getState().setPinned('patterns', false)
    useStudioEntityDrawerStore.getState().setPinned('shows', true)

    expect(useStudioEntityDrawerStore.getState().pinPreferences).toEqual({ patterns: false, shows: true })
    expect(localStorage.getItem('pxlblz-studio-entity-drawer')).toContain('"patterns":false')
    expect(localStorage.getItem('pxlblz-studio-entity-drawer')).toContain('"shows":true')
  })

  it('fails closed to default-pinned for malformed and unknown persisted values', () => {
    expect(sanitizeStudioEntityDrawerPinPreferences({
      patterns: false,
      shows: 'false',
      docs: false,
      maps: true,
    })).toEqual({ patterns: false, maps: true })
    expect(sanitizeStudioEntityDrawerPinPreferences(null)).toEqual({})
  })
})
