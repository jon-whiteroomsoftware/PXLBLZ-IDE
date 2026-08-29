import { describe, expect, it } from 'vitest'
import { resolveRoute, type WorkerRoute } from './router'

const ok = () => Response.json({ ok: true })

const routes: WorkerRoute[] = [
  { path: '/api/me', methods: { GET: ok } },
  { path: '/api/patterns', methods: { GET: ok, POST: ok } },
  { path: '/api/patterns/[id]', methods: { PATCH: ok, DELETE: ok } },
  { path: '/api/settings/[key]', methods: { GET: ok, PUT: ok } },
]

describe('worker route resolution', () => {
  it('matches static paths and dispatches by method', () => {
    const resolution = resolveRoute(routes, 'GET', '/api/me')
    expect(resolution.kind).toBe('matched')
    if (resolution.kind === 'matched') expect(resolution.params).toEqual({})
  })

  it('extracts and decodes dynamic segment params', () => {
    const resolution = resolveRoute(routes, 'PATCH', '/api/patterns/pat%20tern-7')
    expect(resolution.kind).toBe('matched')
    if (resolution.kind === 'matched') expect(resolution.params).toEqual({ id: 'pat tern-7' })
  })

  it('keeps a malformed percent-encoded segment verbatim instead of throwing', () => {
    const resolution = resolveRoute(routes, 'PATCH', '/api/patterns/bad%zzid')
    expect(resolution.kind).toBe('matched')
    if (resolution.kind === 'matched') expect(resolution.params).toEqual({ id: 'bad%zzid' })
  })

  it('tolerates a single trailing slash', () => {
    expect(resolveRoute(routes, 'GET', '/api/me/').kind).toBe('matched')
    expect(resolveRoute(routes, 'GET', '/api/patterns/').kind).toBe('matched')
  })

  it('does not let an empty segment satisfy a dynamic parameter', () => {
    expect(resolveRoute(routes, 'PATCH', '/api/patterns//').kind).toBe('no-route')
  })

  it('never resolves prototype members as handlers for arbitrary method tokens', () => {
    for (const method of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) {
      expect(resolveRoute(routes, method, '/api/me')).toEqual({
        kind: 'method-not-allowed',
        allowed: ['GET'],
      })
    }
  })

  it('reports the allowed methods for a known path with the wrong method', () => {
    const resolution = resolveRoute(routes, 'DELETE', '/api/me')
    expect(resolution).toEqual({ kind: 'method-not-allowed', allowed: ['GET'] })
    const multi = resolveRoute(routes, 'PUT', '/api/patterns')
    expect(multi).toEqual({ kind: 'method-not-allowed', allowed: ['GET', 'POST'] })
  })

  it('reports no route for unknown paths, deeper paths, and prefix fragments', () => {
    expect(resolveRoute(routes, 'GET', '/api/nope').kind).toBe('no-route')
    expect(resolveRoute(routes, 'GET', '/api/patterns/p1/extra').kind).toBe('no-route')
    expect(resolveRoute(routes, 'GET', '/api').kind).toBe('no-route')
  })
})
