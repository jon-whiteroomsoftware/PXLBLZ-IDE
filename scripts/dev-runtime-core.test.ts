import { describe, expect, it } from 'vitest'
import {
  allocateRuntimeAssignment,
  classifyAssignmentPort,
  classifyMainApiHealth,
  classifyProcessGroupPort,
  decideMainApiAction,
  emptyRuntimeRegistry,
  isRepositoryWranglerCommand,
  parseRuntimeManifest,
  type RuntimeManifest,
} from './dev-runtime-core'

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

describe('runtime assignment allocation', () => {
  it('reuses the assignment for the same issue and worktree', async () => {
    const registry = emptyRuntimeRegistry()
    const request = {
      issue: '627',
      description: 'managed local runtime',
      worktree: '/tmp/pixelblaze-v2-issue-627',
      branch: 'codex/issue-627-managed-runtime',
      profile: 'shared' as const,
    }

    const first = await allocateRuntimeAssignment(registry, request, manifest, {
      now: () => '2026-07-25T18:00:00.000Z',
      portIsAvailable: async () => true,
    })
    const second = await allocateRuntimeAssignment(first.registry, request, manifest, {
      now: () => '2026-07-25T18:01:00.000Z',
      portIsAvailable: async () => false,
    })

    expect(second.assignment).toEqual(first.assignment)
    expect(second.registry.assignments).toHaveLength(1)
    expect(second.assignment.uiPort).toBe(5175)
    expect(second.assignment.apiTarget).toBe('http://localhost:8788')
  })

  it('refuses to assign one issue to two worktrees', async () => {
    const first = await allocateRuntimeAssignment(emptyRuntimeRegistry(), {
      issue: '627',
      description: 'managed local runtime',
      worktree: '/tmp/first-worktree',
      branch: 'codex/issue-627-managed-runtime',
      profile: 'shared',
    }, manifest, {
      now: () => '2026-07-25T18:00:00.000Z',
      portIsAvailable: async () => true,
    })

    await expect(allocateRuntimeAssignment(first.registry, {
      issue: '627',
      description: 'managed local runtime',
      worktree: '/tmp/second-worktree',
      branch: 'codex/issue-627-managed-runtime',
      profile: 'shared',
    }, manifest, {
      now: () => '2026-07-25T18:01:00.000Z',
      portIsAvailable: async () => true,
    })).rejects.toThrow('already assigned to /tmp/first-worktree')
  })

  it('refuses an assignment that its registry parser could not read back', async () => {
    await expect(allocateRuntimeAssignment(emptyRuntimeRegistry(), {
      issue: '627',
      description: 'managed local runtime',
      worktree: '/tmp/detached-worktree',
      branch: '',
      profile: 'shared',
    }, manifest, {
      now: () => '2026-07-25T18:00:00.000Z',
      portIsAvailable: async () => true,
    })).rejects.toThrow('Runtime assignment request fields are malformed or unsupported')
  })
})

describe('runtime manifest', () => {
  it('rejects port ranges that include the stable main ports', () => {
    expect(() => parseRuntimeManifest({
      ...manifest,
      shared: {
        ...manifest.shared,
        issueVitePorts: { start: 5174, end: 5199 },
      },
    })).toThrow('issue Vite port range overlaps stable main Vite port 5174')
  })
})

describe('main API health classification', () => {
  it('is stopped with no listeners, whatever the probe said', () => {
    expect(classifyMainApiHealth(0, false)).toBe('stopped')
    expect(classifyMainApiHealth(0, true)).toBe('stopped')
  })

  it('is ok when the port both listens and answers', () => {
    expect(classifyMainApiHealth(1, true)).toBe('ok')
  })

  it('is wedged when the port listens but never answers', () => {
    expect(classifyMainApiHealth(1, false)).toBe('wedged')
    expect(classifyMainApiHealth(3, false)).toBe('wedged')
  })
})

describe('repository wrangler ownership', () => {
  const mainWorktree = '/Users/dev/src/pixelblaze-v2'

  it('recognizes the repository wrangler CLI and its workerd child', () => {
    expect(isRepositoryWranglerCommand(
      `${mainWorktree}/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary`,
      mainWorktree,
    )).toBe(true)
    expect(isRepositoryWranglerCommand(
      `node ${mainWorktree}/node_modules/wrangler/bin/wrangler.js pages dev dist --port 8788`,
      mainWorktree,
    )).toBe(true)
  })

  it('rejects wrangler from another worktree, unrelated commands, and unknown commands', () => {
    expect(isRepositoryWranglerCommand(
      'node /Users/dev/src/worktrees/pixelblaze-v2-issue-1/node_modules/wrangler/bin/wrangler.js pages dev dist',
      mainWorktree,
    )).toBe(false)
    expect(isRepositoryWranglerCommand(`python3 ${mainWorktree}/serve.py`, mainWorktree)).toBe(false)
    expect(isRepositoryWranglerCommand('', mainWorktree)).toBe(false)
  })
})

describe('main API recovery decision', () => {
  const mainWorktree = '/Users/dev/src/pixelblaze-v2'
  const owned = {
    pid: 7780,
    command: `${mainWorktree}/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve`,
  }
  const foreign = { pid: 4242, command: 'python3 -m http.server 8788' }

  it('starts a fresh pair when nothing listens', () => {
    expect(decideMainApiAction([], false, mainWorktree)).toBe('start')
  })

  it('leaves a responding server alone', () => {
    expect(decideMainApiAction([owned], true, mainWorktree)).toBe('none')
    expect(decideMainApiAction([foreign], true, mainWorktree)).toBe('none')
  })

  it('recovers a wedged listener only when every listener is the repository wrangler', () => {
    expect(decideMainApiAction([owned], false, mainWorktree)).toBe('recover')
  })

  it('refuses when any wedged listener is not the repository wrangler', () => {
    expect(decideMainApiAction([foreign], false, mainWorktree)).toBe('refuse')
    expect(decideMainApiAction([owned, foreign], false, mainWorktree)).toBe('refuse')
    expect(decideMainApiAction([{ pid: 7780, command: '' }], false, mainWorktree)).toBe('refuse')
  })
})

describe('runtime process ownership', () => {
  it('treats a listener with a different PID as foreign', () => {
    expect(classifyAssignmentPort({
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
      uiPid: 1234,
    }, [5678])).toBe('foreign')
  })

  it('recognizes listeners in the detached server process group', () => {
    expect(classifyProcessGroupPort(1234, [5678], new Map([[5678, 1234]]))).toBe('owned')
    expect(classifyProcessGroupPort(1234, [5678], new Map([[5678, 9999]]))).toBe('foreign')
    expect(classifyProcessGroupPort(1234, [], new Map())).toBe('free')
  })
})
