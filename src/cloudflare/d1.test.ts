import { d1HealthResponse, type D1DatabaseLike } from './d1'

function healthyDb(version: string): D1DatabaseLike {
  return {
    prepare(sql) {
      return {
        bind(...values) {
          expect(sql).toBe(
            'SELECT value FROM app_metadata WHERE key = ? LIMIT 1',
          )
          expect(values).toEqual(['schema_version'])
          return this
        },
        async first<T>() {
          return { value: version } as T
        },
      }
    },
  }
}

describe('D1 backend health probe', () => {
  it('reports the current schema version when the binding is reachable', async () => {
    await expect(d1HealthResponse(healthyDb('1'))).resolves.toEqual({
      ok: true,
      schemaVersion: '1',
    })
  })

  it('reports an unhealthy binding without leaking the thrown error', async () => {
    const db: D1DatabaseLike = {
      prepare() {
        throw new Error('database exploded')
      },
    }

    await expect(d1HealthResponse(db)).resolves.toEqual({
      ok: false,
      schemaVersion: null,
    })
  })
})
