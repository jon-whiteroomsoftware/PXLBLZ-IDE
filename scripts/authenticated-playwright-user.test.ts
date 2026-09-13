import { describe, expect, it } from 'vitest'
import {
  authenticatedPlaywrightSeedSql,
  authenticatedPlaywrightAccountIndex,
  authenticatedPlaywrightUser,
} from './authenticated-playwright-user'

describe('authenticated Playwright synthetic identities', () => {
  it('assigns sequential tests in each worker distinct accounts from disjoint bounded pools', () => {
    expect(authenticatedPlaywrightAccountIndex(0, 0)).toBe(0)
    expect(authenticatedPlaywrightAccountIndex(0, 1)).toBe(1)
    expect(authenticatedPlaywrightAccountIndex(1, 0)).toBe(64)
    expect(() => authenticatedPlaywrightAccountIndex(0, 64)).toThrow(/exhausted/)
    expect(authenticatedPlaywrightUser(0)).toMatchObject({
      userId: 'github:playwright-worker-000',
      primaryHandle: 'playwright-worker-000',
      displayName: 'Playwright Worker 000',
    })
    expect(authenticatedPlaywrightUser(1).userId).toBe('github:playwright-worker-001')
    expect(authenticatedPlaywrightUser(1)).toEqual(authenticatedPlaywrightUser(1))
  })

  it('seeds every requested test account without including the persistent development identity', () => {
    const sql = authenticatedPlaywrightSeedSql(123, 2)

    expect(sql).toContain("'github:playwright-worker-000'")
    expect(sql).toContain("'github:playwright-worker-001'")
    expect(sql.match(/'workspaceStarterState'/g)).toHaveLength(2)
    expect(sql).not.toContain('beta_access')
    expect(sql).not.toContain('github:local-dev')
  })
})
