import { createSessionToken, sessionCookieName } from '../../../cloudflare/auth'
import { createDefaultShow } from '../../../engine/showModel'
import worker, { type WorkerEnv } from '../../index'

function workerEnv(database: unknown): WorkerEnv {
  return {
    SESSION_SECRET: 'secret',
    PXLBLZ_DB: database,
    ASSETS: { fetch: async () => new Response('asset') },
  } as WorkerEnv
}

async function authenticationCookie(): Promise<string> {
  const token = await createSessionToken({
    userId: 'github:123',
    primaryProvider: 'github',
    primaryHandle: 'octocat',
    githubUserId: '123',
    githubLogin: 'octocat',
    displayName: 'The Octocat',
    avatarUrl: null,
  }, 'secret')
  return `${sessionCookieName}=${encodeURIComponent(token)}`
}

describe('Shows API output-contract validation (#653)', () => {
  it('returns a named 400 before a contract-less Show reaches D1', async () => {
    const { outputContract: _outputContract, ...show } = createDefaultShow(
      'contract-less-show',
      'Contract-less',
      123,
    )
    let wrote = false
    const db = {
      prepare(_sql: string) {
        return {
          bind() {
            return this
          },
          async first<T>() {
            return { entity_count: 0, content_bytes: 0 } as T
          },
          async all<T>() {
            return { results: [] as T[] }
          },
          async run() {
            wrote = true
            return { success: true }
          },
        }
      },
    }
    const request = new Request('https://pxlblz.example/api/shows', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        cookie: await authenticationCookie(),
      },
      body: JSON.stringify(show),
    })

    const response = await worker.fetch(request, workerEnv(db))

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      code: 'missing_show_output_contract',
      error: 'Show contract-less-show is missing a valid output contract',
    })
    expect(wrote).toBe(false)
  })

  it('returns unreadable row details without failing the Shows collection', async () => {
    const show = createDefaultShow('legacy-show', 'Legacy', 123)
    const db = {
      prepare() {
        return {
          bind() {
            return this
          },
          async all<T>() {
            return { results: [{
              id: show.id,
              name: show.name,
              scenes_json: JSON.stringify(show.scenes),
              zones_json: JSON.stringify(show.zones),
              cells_json: JSON.stringify(show.cells),
              routing_layouts_json: JSON.stringify(show.routingLayouts),
              transitions_json: JSON.stringify(show.transitions),
              composition_json: null,
              target_controller_profile_id: null,
              stage_map_id: null,
              output_contract_json: null,
              updated_at: show.updatedAt,
            }] as T[] }
          },
        }
      },
    }
    const request = new Request('https://pxlblz.example/api/shows', {
      headers: { cookie: await authenticationCookie() },
    })

    const response = await worker.fetch(request, workerEnv(db))

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      shows: [],
      unreadableShows: [{
        id: show.id,
        name: show.name,
        code: 'missing_show_output_contract',
        error: 'Show legacy-show is missing a valid output contract',
      }],
    })
  })
})
