import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { RuntimeManifest } from './dev-runtime-core'
import {
  loadRuntimeRegistry,
  reserveRuntimeAssignment,
} from './dev-runtime-store'

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

describe('runtime registry store', () => {
  it('serializes concurrent reservations so they receive distinct ports', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-runtime-store-'))
    const reserve = (issue: string) => reserveRuntimeAssignment({
      directory,
      request: {
        issue,
        description: `issue ${issue}`,
        worktree: `/tmp/worktree-${issue}`,
        branch: `codex/issue-${issue}`,
        profile: 'shared',
      },
      manifest,
      now: () => '2026-07-25T18:00:00.000Z',
      portIsAvailable: async () => true,
    })

    const [first, second] = await Promise.all([reserve('627'), reserve('628')])
    const registry = loadRuntimeRegistry(directory)

    expect(new Set([first.uiPort, second.uiPort]).size).toBe(2)
    expect(registry.assignments).toHaveLength(2)
  })

  it('recovers a registry lock left behind by a terminated process', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-runtime-stale-lock-'))
    const lock = join(directory, 'registry-v1.lock')
    mkdirSync(lock)
    writeFileSync(join(lock, 'owner.json'), '{"pid":999999999,"createdAt":0}\n')

    const assignment = await reserveRuntimeAssignment({
      directory,
      request: {
        issue: '627',
        description: 'managed local runtime',
        worktree: '/tmp/worktree-627',
        branch: 'codex/issue-627',
        profile: 'shared',
      },
      manifest,
      now: () => '2026-07-25T18:00:00.000Z',
      portIsAvailable: async () => true,
    })

    expect(assignment.uiPort).toBe(5175)
  })
})
