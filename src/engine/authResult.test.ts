import { describe, expect, it } from 'vitest'
import {
  readAuthResultEvent,
  readAuthResultNotice,
  stripAuthResultParam,
} from './authResult'

describe('readAuthResultNotice', () => {
  it('turns a successful provider callback into a quiet analytics result', () => {
    expect(readAuthResultEvent('?auth=success&auth_provider=github')).toEqual({
      outcome: 'success',
      code: 'success',
      provider: 'github',
    })
    expect(readAuthResultNotice('?auth=success&auth_provider=github')).toBeNull()
  })

  it('returns null when the auth param is absent or empty', () => {
    expect(readAuthResultNotice('')).toBeNull()
    expect(readAuthResultNotice('?foo=bar')).toBeNull()
    expect(readAuthResultNotice('?auth=')).toBeNull()
  })

  it('maps transient flow failures to a retry message', () => {
    for (const code of ['error', 'invalid-state']) {
      const notice = readAuthResultNotice(`?auth=${code}`)
      expect(notice).not.toBeNull()
      expect(notice!.code).toBe(code)
      expect(notice!.detail).toMatch(/try again/i)
    }
  })

  it('maps service configuration failures to an unavailable message', () => {
    for (const code of ['not-configured', 'no-database']) {
      const notice = readAuthResultNotice(`?auth=${code}`)
      expect(notice).not.toBeNull()
      expect(notice!.detail).toMatch(/unavailable/i)
    }
  })

  it('maps a failed link attempt to a link message', () => {
    const notice = readAuthResultNotice('?auth=invalid-link')
    expect(notice).not.toBeNull()
    expect(notice!.detail).toMatch(/connect/i)
  })

  it('treats an unknown non-empty code as a generic sign-in failure', () => {
    const notice = readAuthResultNotice('?auth=mystery-code')
    expect(notice).not.toBeNull()
    expect(notice!.code).toBe('mystery-code')
    expect(notice!.detail).toMatch(/try again/i)
  })
})

describe('stripAuthResultParam', () => {
  it('removes only the auth param and preserves other params and hash', () => {
    expect(stripAuthResultParam('https://x.test/app/?auth=error&view=studio#frag')).toBe(
      'https://x.test/app/?view=studio#frag',
    )
  })

  it('drops the trailing ? when auth was the only param', () => {
    expect(stripAuthResultParam('https://x.test/app/?auth=success&auth_provider=google')).toBe(
      'https://x.test/app/',
    )
  })

  it('returns the url unchanged when no auth param exists', () => {
    expect(stripAuthResultParam('https://x.test/app/?view=studio')).toBe('https://x.test/app/?view=studio')
  })
})
