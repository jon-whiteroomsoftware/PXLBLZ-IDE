import { afterEach, describe, it, expect, vi } from 'vitest'
import { slowMoEnabled } from './slowMoFlag'

afterEach(vi.unstubAllGlobals)

describe('slowMoEnabled', () => {
  it.each([
    ['?slowmo=1', true],
    ['?capture&slowmo=1&other=x', true],
    ['', false],
    ['?slowmo', false],
    ['?slowmo=0', false],
    ['?slowmo=true', false],
    ['?slowmo=10', false],
    ['?other=slowmo%3D1', false],
  ])('reads %s as %s', (search, expected) => {
    vi.stubGlobal('location', { search })
    expect(slowMoEnabled()).toBe(expected)
  })

  it('returns false without a browser location', () => {
    vi.stubGlobal('location', undefined)
    expect(slowMoEnabled()).toBe(false)
  })

  it('reads the current query on every call', () => {
    const location = { search: '?slowmo=1' }
    vi.stubGlobal('location', location)
    expect(slowMoEnabled()).toBe(true)
    location.search = '?slowmo=0'
    expect(slowMoEnabled()).toBe(false)
  })
})
