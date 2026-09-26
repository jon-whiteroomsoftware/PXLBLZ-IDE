import { describe, expect, it } from 'vitest'
import type { RuntimeAssignment } from './dev-runtime-core'
import { agentServiceRefusal } from '../src/cloudflare/agentAccess'
import { agentOAuthConfig } from '../src/worker/agent/agentOAuthConfig'
import {
  authenticatedPlaywrightEnvironment,
  authenticatedPlaywrightSeedSql,
  resolveAuthenticatedWorkers,
} from './run-authenticated-playwright'

const showsToken = '--workers-env=WRSP_HOST_PLAYWRIGHT_SHOWS_WORKERS:2'

describe('authenticated Playwright worker selection', () => {
  it('keeps arguments and uses the auth pool when no worker token is present', () => {
    const args = ['e2e/shows.auth.spec.ts']
    expect(resolveAuthenticatedWorkers(args, {}, 4)).toEqual({
      args,
      workers: 4,
      line: 'Authenticated Playwright workers: 4 (default)',
    })
  })

  it('keeps an explicit worker argument', () => {
    expect(resolveAuthenticatedWorkers(['e2e/capture.auth.spec.ts', '--workers=1'], {}, 4)).toEqual({
      args: ['e2e/capture.auth.spec.ts', '--workers=1'],
      workers: 1,
      line: 'Authenticated Playwright workers: 1 (argument)',
    })
  })

  it('replaces an unset shows worker token with its default', () => {
    expect(resolveAuthenticatedWorkers(['e2e/shows.auth.spec.ts', showsToken], {}, 4)).toEqual({
      args: ['e2e/shows.auth.spec.ts', '--workers=2'],
      workers: 2,
      line: 'Authenticated Playwright workers: 2 (default)',
    })
  })

  it.each(['3', '4'])('accepts shows count %s within a four-worker pool', (raw) => {
    expect(resolveAuthenticatedWorkers([showsToken], { WRSP_HOST_PLAYWRIGHT_SHOWS_WORKERS: raw }, 4))
      .toEqual({
        args: [`--workers=${raw}`],
        workers: Number(raw),
        line: `Authenticated Playwright workers: ${raw} (WRSP_HOST_PLAYWRIGHT_SHOWS_WORKERS)`,
      })
  })

  it('refuses more shows workers than the auth pool can seed', () => {
    expect(() => resolveAuthenticatedWorkers([showsToken], { WRSP_HOST_PLAYWRIGHT_SHOWS_WORKERS: '5' }, 4))
      .toThrow('Authenticated Playwright was asked for 5 workers but its account pool is sized for 4; set WRSP_HOST_PLAYWRIGHT_AUTH_WORKERS to at least 5.')
  })

  it('names the shows variable when its count is invalid', () => {
    expect(() => resolveAuthenticatedWorkers([showsToken], { WRSP_HOST_PLAYWRIGHT_SHOWS_WORKERS: 'x' }, 4))
      .toThrow(/WRSP_HOST_PLAYWRIGHT_SHOWS_WORKERS/)
  })
})

describe('authenticated Playwright runtime', () => {
  it('binds the isolated server and enables external MCP without production credentials', () => {
    const assignment: RuntimeAssignment = {
      issue: 'playwright-123',
      description: 'authenticated Playwright',
      worktree: '/tmp/worktree',
      branch: 'codex/test',
      profile: 'isolated',
      uiPort: 5200,
      apiPort: 5200,
      apiTarget: 'http://localhost:5200',
      userId: 'github:local-agent-01',
      createdAt: '2026-07-25T18:00:00.000Z',
      updatedAt: '2026-07-25T18:00:00.000Z',
    }

    const environment = authenticatedPlaywrightEnvironment(
      assignment,
      '/tmp/runtime/playwright-123',
      '/repo/main/.dev.vars',
    )

    expect(environment).toEqual({
      AGENT_OAUTH_CLIENTS: '[]',
      AGENT_SERVICE_ENABLED: '1',
      PLAYWRIGHT_AUTH_SMOKE_VITE_PORT: '5200',
      PLAYWRIGHT_STUDIO_URL: 'http://localhost:5200/PXLBLZ-IDE/',
      PXLBLZ_D1_PERSIST_TO: '/tmp/runtime/playwright-123',
      PXLBLZ_DEV_VARS_FILE: '/repo/main/.dev.vars',
      PXLBLZ_DEV_AGENT_OAUTH_ORIGIN: 'http://localhost:5200',
    })
    expect(agentServiceRefusal(environment)).toBeNull()
    expect(agentOAuthConfig(environment)?.resource).toBe('http://localhost:5200/mcp')
  })

  it('seeds the isolated synthetic user before the server starts', () => {
    expect(authenticatedPlaywrightSeedSql(123)).toContain(
      "'github:playwright-worker-000'",
    )
    expect(authenticatedPlaywrightSeedSql(123)).toContain(
      "'__playwright_local_d1_owner_probe__'",
    )
  })
})
