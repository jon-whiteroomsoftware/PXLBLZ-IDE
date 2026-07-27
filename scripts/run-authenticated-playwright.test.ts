import { describe, expect, it } from 'vitest'
import type { RuntimeAssignment } from './dev-runtime-core'
import {
  authenticatedPlaywrightEnvironment,
  authenticatedPlaywrightSeedSql,
} from './run-authenticated-playwright'

describe('authenticated Playwright runtime', () => {
  it('binds both servers and D1 persistence to the isolated assignment', () => {
    const assignment: RuntimeAssignment = {
      issue: 'playwright-123',
      description: 'authenticated Playwright',
      worktree: '/tmp/worktree',
      branch: 'codex/test',
      profile: 'isolated',
      uiPort: 5200,
      apiPort: 8789,
      apiTarget: 'http://localhost:8789',
      userId: 'github:local-agent-01',
      createdAt: '2026-07-25T18:00:00.000Z',
      updatedAt: '2026-07-25T18:00:00.000Z',
    }

    expect(authenticatedPlaywrightEnvironment(
      assignment,
      '/tmp/runtime/playwright-123',
      '/repo/main/.dev.vars',
    )).toMatchObject({
      PLAYWRIGHT_AUTH_SMOKE_VITE_PORT: '5200',
      PLAYWRIGHT_AUTH_SMOKE_WRANGLER_PORT: '8789',
      PLAYWRIGHT_STUDIO_URL: 'http://localhost:5200/PXLBLZ-IDE/',
      PXLBLZ_D1_PERSIST_TO: '/tmp/runtime/playwright-123',
      PXLBLZ_DEV_VARS_FILE: '/repo/main/.dev.vars',
    })
  })

  it('seeds the isolated synthetic user before Wrangler starts', () => {
    expect(authenticatedPlaywrightSeedSql(123)).toContain(
      "'github:playwright-worker-00'",
    )
    expect(authenticatedPlaywrightSeedSql(123)).toContain(
      "'__playwright_local_d1_owner_probe__'",
    )
  })
})
