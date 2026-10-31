import { describe, expect, it, vi } from 'vitest'
import { rotateGalleryShows } from './galleryOrder'
import {
  createGalleryOrderSessionResolver,
  GALLERY_ORDER_SESSION_KEY,
  GALLERY_VISIT_KEY,
  type GalleryOrderEnvironment,
} from './galleryOrderSession'

function storage() {
  const values = new Map<string, string>()
  return {
    values,
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
  }
}

function fixture() {
  const session = storage()
  const local = storage()
  const environment = {
    sessionStorage: vi.fn(() => session),
    localStorage: vi.fn(() => local),
    randomSeed: vi.fn(() => 123),
  }
  return { session, local, environment, resolve: createGalleryOrderSessionResolver(environment) }
}

describe('Gallery order session (#1257)', () => {
  it('creates once per page load and survives a new resolver with the same session storage', () => {
    const { session, local, environment, resolve } = fixture()
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(createGalleryOrderSessionResolver(environment)('')).toEqual({ seed: 123, visit: 0 })
    expect(environment.randomSeed).toHaveBeenCalledTimes(1)
    expect(local.values).toEqual(new Map([[GALLERY_VISIT_KEY, '1']]))
    expect(local.setItem).toHaveBeenCalledTimes(1)
    expect(session.values).toEqual(new Map([[GALLERY_ORDER_SESSION_KEY, '{"seed":123,"visit":0}']]))
  })

  it('advances once for each new session and cycles through all six leads', () => {
    const local = storage()
    const shows = ['Overture', 'Quadrille', 'Redline', 'Coronal', 'After Hours', 'Totality']
    for (let visit = 0; visit < shows.length; visit++) {
      const session = storage()
      const resolve = createGalleryOrderSessionResolver({
        sessionStorage: () => session, localStorage: () => local, randomSeed: () => 123 + visit,
      })
      const choice = resolve('')
      expect(choice).toEqual({ seed: 123 + visit, visit })
      expect(rotateGalleryShows(shows, choice.visit)[0]).toBe(shows[visit])
      expect(resolve('')).toEqual(choice)
    }
    expect(local.values.get(GALLERY_VISIT_KEY)).toBe('6')
  })

  it.each([
    ['0', 0], ['5', 5], ['0042', 42], ['4294967295', 4294967295],
    ['hello', 1335831723], ['', 2166136261],
  ])('uses URL seed %j for order and lead without touching storage', (value, seed) => {
    const { environment, resolve } = fixture()
    expect(resolve(`?seed=${value}`)).toEqual({ seed, visit: seed })
    expect(resolve(`?capture&seed=${value}`)).toEqual({ seed, visit: seed })
    expect(environment.sessionStorage).not.toHaveBeenCalled()
    expect(environment.localStorage).not.toHaveBeenCalled()
    expect(environment.randomSeed).not.toHaveBeenCalled()
  })

  it('uses capture seed zero and leaves an ordinary session intact across overrides', () => {
    const { local, environment, resolve } = fixture()
    expect(resolve('?capture')).toEqual({ seed: 0, visit: 0 })
    expect(environment.sessionStorage).not.toHaveBeenCalled()
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(resolve('?seed=5')).toEqual({ seed: 5, visit: 5 })
    expect(resolve('?capture')).toEqual({ seed: 0, visit: 0 })
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(local.setItem).toHaveBeenCalledTimes(1)
  })

  it.each(['missing', 'getter', 'read', 'write'] as const)('keeps one per-load seed with %s storage', (failure) => {
    const broken = () => { throw new Error('storage denied') }
    const session = storage()
    const local = storage()
    if (failure === 'read') {
      session.getItem.mockImplementation(broken)
      local.getItem.mockImplementation(broken)
    }
    if (failure === 'write') {
      session.setItem.mockImplementation(broken)
      local.setItem.mockImplementation(broken)
    }
    const environment: GalleryOrderEnvironment = {
      sessionStorage: failure === 'getter' ? broken : () => failure === 'missing' ? null : session,
      localStorage: failure === 'getter' ? broken : () => failure === 'missing' ? null : local,
      randomSeed: vi.fn(() => 456),
    }
    const resolve = createGalleryOrderSessionResolver(environment)
    expect(resolve('')).toEqual({ seed: 456, visit: 0 })
    expect(resolve('')).toEqual({ seed: 456, visit: 0 })
    expect(environment.randomSeed).toHaveBeenCalledTimes(1)
  })

  it('increments a working counter only once when session writes are blocked', () => {
    const { session, local, resolve } = fixture()
    session.setItem.mockImplementation(() => { throw new Error('quota') })
    local.values.set(GALLERY_VISIT_KEY, '4')
    expect(resolve('')).toEqual({ seed: 123, visit: 4 })
    expect(resolve('')).toEqual({ seed: 123, visit: 4 })
    expect(local.values.get(GALLERY_VISIT_KEY)).toBe('5')
  })

  it('keeps a session when local counter writes are blocked', () => {
    const { local, environment, resolve } = fixture()
    local.setItem.mockImplementation(() => { throw new Error('quota') })
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(createGalleryOrderSessionResolver(environment)('')).toEqual({ seed: 123, visit: 0 })
    expect(environment.randomSeed).toHaveBeenCalledTimes(1)
  })

  it.each(['{', 'null', '[]', '{}', '{"seed":1,"visit":-1}', '{"seed":4294967296,"visit":0}', '{"seed":1.5,"visit":0}'])('replaces invalid session state %j', (raw) => {
    const { session, resolve } = fixture()
    session.values.set(GALLERY_ORDER_SESSION_KEY, raw)
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(JSON.parse(session.values.get(GALLERY_ORDER_SESSION_KEY)!)).toEqual({ seed: 123, visit: 0 })
  })

  it.each(['garbage', '-1', '1.5', '', 'Infinity', '9007199254740992'])('resets an invalid counter %j', (raw) => {
    const { local, resolve } = fixture()
    local.values.set(GALLERY_VISIT_KEY, raw)
    expect(resolve('')).toEqual({ seed: 123, visit: 0 })
    expect(local.values.get(GALLERY_VISIT_KEY)).toBe('1')
  })

  it('wraps the next counter at the last safe integer', () => {
    const { local, resolve } = fixture()
    local.values.set(GALLERY_VISIT_KEY, String(Number.MAX_SAFE_INTEGER))
    expect(resolve('')).toEqual({ seed: 123, visit: Number.MAX_SAFE_INTEGER })
    expect(local.values.get(GALLERY_VISIT_KEY)).toBe('0')
  })
})
