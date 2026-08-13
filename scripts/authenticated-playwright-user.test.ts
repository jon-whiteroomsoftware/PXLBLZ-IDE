import { describe, expect, it } from 'vitest'
import {
  authenticatedPlaywrightSeedSql,
  authenticatedPlaywrightUser,
} from './authenticated-playwright-user'

describe('authenticated Playwright synthetic identities', () => {
  it('derives a distinct stable identity for each parallel worker', () => {
    expect(authenticatedPlaywrightUser(0)).toMatchObject({
      userId: 'github:playwright-worker-00',
      primaryHandle: 'playwright-worker-00',
      displayName: 'Playwright Worker 00',
    })
    expect(authenticatedPlaywrightUser(1).userId).toBe('github:playwright-worker-01')
    expect(authenticatedPlaywrightUser(1)).toEqual(authenticatedPlaywrightUser(1))
  })

  it('seeds every worker without including the persistent development identity', () => {
    const sql = authenticatedPlaywrightSeedSql(123, 2)

    expect(sql).toContain("'github:playwright-worker-00'")
    expect(sql).toContain("'github:playwright-worker-01'")
    expect(sql).not.toContain('beta_access')
    expect(sql).not.toContain('github:local-dev')
  })
})
