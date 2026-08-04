import { describe, expect, it } from 'vitest'
import type {
  RuntimeManifest,
  RuntimeRegistry,
} from './dev-runtime-core'
import { localIdentitySeedSql, localSessionUser } from './dev-runtime-auth'

const manifest: RuntimeManifest = {
  schemaVersion: 1,
  project: 'pxlblz-ide',
  basePath: '/PXLBLZ-IDE/',
  shared: {
    vitePort: 5174,
    wranglerPort: 8788,
    issueVitePorts: { start: 5175, end: 5199 },
  },
  isolated: {
    vitePorts: { start: 5200, end: 5299 },
    wranglerPorts: { start: 8789, end: 8888 },
  },
  localIdentities: {
    developerUserId: 'github:local-dev',
    agentUserIdPrefix: 'github:local-agent-',
    agentPoolSize: 32,
  },
}

const registry: RuntimeRegistry = {
  schemaVersion: 1,
  assignments: [{
    issue: '627',
    description: 'managed local runtime',
    worktree: '/tmp/worktree',
    branch: 'codex/issue-627',
    profile: 'shared',
    uiPort: 5175,
    apiPort: 8788,
    apiTarget: 'http://localhost:8788',
    userId: 'github:local-agent-01',
    createdAt: '2026-07-25T18:00:00.000Z',
    updatedAt: '2026-07-25T18:00:00.000Z',
  }],
}

describe('local runtime authentication', () => {
  it('mints an issue session for the identity assigned by the registry', () => {
    expect(localSessionUser({ issue: '627' }, registry, manifest)).toMatchObject({
      userId: 'github:local-agent-01',
      githubUserId: 'local-agent-01',
      githubLogin: 'local-agent-01',
      displayName: 'Local Agent 01',
    })
  })

  it('admits every managed local identity when D1 beta access is authoritative', () => {
    const sql = localIdentitySeedSql(manifest)

    expect(sql).toContain('INSERT INTO beta_access')
    expect(sql).toContain("'local-dev@local.invalid'")
    expect(sql).toContain("'github:local-dev'")
    expect(sql).toContain("'local-agent-32@local.invalid'")
    expect(sql).toContain("'github:local-agent-32'")
  })
})
