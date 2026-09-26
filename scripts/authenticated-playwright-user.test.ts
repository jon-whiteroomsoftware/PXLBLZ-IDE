import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  authenticatedPlaywrightSeedSql,
  authenticatedPlaywrightAccountIndex,
  authenticatedPlaywrightUser,
} from './authenticated-playwright-user'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
})

describe('authenticated Playwright synthetic identities', () => {
  it('assigns sequential tests in each worker distinct accounts from disjoint bounded pools', () => {
    expect(authenticatedPlaywrightAccountIndex(0, 0, 4)).toBe(0)
    expect(authenticatedPlaywrightAccountIndex(0, 1, 4)).toBe(1)
    expect(authenticatedPlaywrightAccountIndex(1, 0, 4)).toBe(64)
    expect(() => authenticatedPlaywrightAccountIndex(0, 64, 4)).toThrow(/exhausted/)
    expect(authenticatedPlaywrightUser(0)).toMatchObject({
      userId: 'github:playwright-worker-000',
      primaryHandle: 'playwright-worker-000',
      displayName: 'Playwright Worker 000',
    })
    expect(authenticatedPlaywrightUser(1).userId).toBe('github:playwright-worker-001')
    expect(authenticatedPlaywrightUser(1)).toEqual(authenticatedPlaywrightUser(1))
  })

  it('bounds account indices by the selected worker count', () => {
    expect(authenticatedPlaywrightAccountIndex(5, 0, 6)).toBe(320)
    expect(() => authenticatedPlaywrightAccountIndex(6, 0, 6)).toThrow(/out of range/)
    expect(authenticatedPlaywrightAccountIndex(3, 0, 4)).toBe(192)
    expect(() => authenticatedPlaywrightAccountIndex(4, 0, 4)).toThrow(/out of range/)
  })

  it('uses the host worker count when no count is passed', async () => {
    vi.stubEnv('WRSP_HOST_PLAYWRIGHT_AUTH_WORKERS', '6')
    vi.resetModules()
    const { authenticatedPlaywrightWorkerCount, authenticatedPlaywrightAccountIndex } = await import('./authenticated-playwright-user')

    expect(authenticatedPlaywrightWorkerCount).toBe(6)
    expect(authenticatedPlaywrightAccountIndex(5, 0)).toBe(320)
  })

  it('seeds every requested test account without including the persistent development identity', () => {
    const sql = authenticatedPlaywrightSeedSql(123, 2)

    expect(sql).toContain("'github:playwright-worker-000'")
    expect(sql).toContain("'github:playwright-worker-001'")
    expect(sql.match(/'workspaceStarterState'/g)).toHaveLength(2)
    expect(sql).not.toContain('beta_access')
    expect(sql).not.toContain('github:local-dev')
  })

  it('seeds exactly six worker pools when six workers are requested', () => {
    const sql = authenticatedPlaywrightSeedSql(123, 6 * 64)
    expect(sql).toContain('playwright-worker-383')
    expect(sql).not.toContain('playwright-worker-384')
    expect(sql.match(/INSERT INTO users/g)).toHaveLength(384)
  })
})
