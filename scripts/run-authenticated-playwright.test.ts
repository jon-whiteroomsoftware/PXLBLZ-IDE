import { describe, expect, it } from 'vitest'
import type { RuntimeAssignment } from './dev-runtime-core'
import {
  authenticatedPlaywrightEnvironment,
  authenticatedPlaywrightSeedSql,
} from './run-authenticated-playwright'

describe('authenticated Playwright runtime', () => {
  it('binds the single-process server and D1 persistence to the isolated assignment', () => {
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

    expect(authenticatedPlaywrightEnvironment(
      assignment,
      '/tmp/runtime/playwright-123',
      '/repo/main/.dev.vars',
    )).toEqual({
      PLAYWRIGHT_AUTH_SMOKE_VITE_PORT: '5200',
      PLAYWRIGHT_STUDIO_URL: 'http://localhost:5200/PXLBLZ-IDE/',
      PXLBLZ_D1_PERSIST_TO: '/tmp/runtime/playwright-123',
      PXLBLZ_DEV_VARS_FILE: '/repo/main/.dev.vars',
    })
  })

  it('seeds the isolated synthetic user before the server starts', () => {
    expect(authenticatedPlaywrightSeedSql(123)).toContain(
      "'github:playwright-worker-00'",
    )
    expect(authenticatedPlaywrightSeedSql(123)).toContain(
      "'__playwright_local_d1_owner_probe__'",
    )
  })
})
