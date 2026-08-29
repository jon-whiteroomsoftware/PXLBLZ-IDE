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
  unownedGroupMembers,
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
    expect(classifyMainApiHealth(0, 'unresponsive')).toBe('stopped')
    expect(classifyMainApiHealth(0, 'ok')).toBe('stopped')
  })

  it('is ok when the port both listens and answers', () => {
    expect(classifyMainApiHealth(1, 'ok')).toBe('ok')
  })

  it('is erroring, not wedged, when the port answers with server errors', () => {
    expect(classifyMainApiHealth(1, 'error')).toBe('erroring')
  })

  it('is wedged when the port listens but never answers', () => {
    expect(classifyMainApiHealth(1, 'unresponsive')).toBe('wedged')
    expect(classifyMainApiHealth(3, 'unresponsive')).toBe('wedged')
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
    // The pages child interposes node flags before its script path.
    expect(isRepositoryWranglerCommand(
      `/opt/fnm/node-versions/v24/bin/node --no-warnings --experimental-vm-modules ${mainWorktree}/node_modules/wrangler/wrangler-dist/cli.js pages dev dist`,
      mainWorktree,
    )).toBe(true)
  })

  it('recognizes every member of a live wrangler pages dev process group', () => {
    // Observed verbatim (paths relocated) from wrangler 4.106.0 serving 8788.
    const liveGroup = [
      `/opt/fnm/node-versions/v24.14.0/installation/bin/node ${mainWorktree}/node_modules/wrangler/bin/wrangler.js pages dev dist --port 8788`,
      `/opt/fnm/node-versions/v24.14.0/installation/bin/node --no-warnings --experimental-vm-modules ${mainWorktree}/node_modules/wrangler/wrangler-dist/cli.js pages dev dist`,
      `${mainWorktree}/node_modules/@esbuild/darwin-arm64/bin/esbuild --service=0.28.1 --ping`,
      `${mainWorktree}/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental --socket-addr=entry=localhost:8788`,
      `${mainWorktree}/node_modules/@cloudflare/workerd-darwin-arm64/bin/workerd serve --binary --experimental --socket-addr=entry=127.0.0.1:65235`,
    ]
    for (const command of liveGroup) {
      expect(isRepositoryWranglerCommand(command, mainWorktree)).toBe(true)
    }
  })

  it('refuses node option operands and unknown node flags instead of trusting them as scripts', () => {
    // --require consumes the wrangler path; the real script is foreign.
    expect(isRepositoryWranglerCommand(
      `node --require ${mainWorktree}/node_modules/wrangler/bin/wrangler.js /tmp/foreign-server.js`,
      mainWorktree,
    )).toBe(false)
    expect(isRepositoryWranglerCommand(
      `node --loader ts-node/esm ${mainWorktree}/node_modules/wrangler/bin/wrangler.js`,
      mainWorktree,
    )).toBe(false)
    // An esbuild path outside bin/esbuild does not qualify either.
    expect(isRepositoryWranglerCommand(
      `${mainWorktree}/node_modules/@esbuild/darwin-arm64/bin/other-tool`,
      mainWorktree,
    )).toBe(false)
  })

  it('ignores wrangler paths in non-executable argv positions and lookalike packages', () => {
    // A process merely reading a file under the wrangler package is not ours.
    expect(isRepositoryWranglerCommand(
      `tail -f ${mainWorktree}/node_modules/wrangler/dev.log`,
      mainWorktree,
    )).toBe(false)
    expect(isRepositoryWranglerCommand(
      `node ${mainWorktree}/node_modules/not-workerd/server.js`,
      mainWorktree,
    )).toBe(false)
    expect(isRepositoryWranglerCommand(
      `node ${mainWorktree}/node_modules/@cloudflare/workerdish/server.js`,
      mainWorktree,
    )).toBe(false)
  })

  it('rejects wrangler from another worktree, unrelated commands, and unknown commands', () => {
    expect(isRepositoryWranglerCommand(
      'node /Users/dev/src/worktrees/pixelblaze-v2-issue-1/node_modules/wrangler/bin/wrangler.js pages dev dist',
      mainWorktree,
    )).toBe(false)
    expect(isRepositoryWranglerCommand(`python3 ${mainWorktree}/serve.py`, mainWorktree)).toBe(false)
    expect(isRepositoryWranglerCommand('', mainWorktree)).toBe(false)
  })

  it('rejects paths that traverse out of node_modules and lookalike names outside it', () => {
    expect(isRepositoryWranglerCommand(
      `node ${mainWorktree}/node_modules/../foreign/workerd-server.js`,
      mainWorktree,
    )).toBe(false)
    expect(isRepositoryWranglerCommand(
      `node ${mainWorktree}/node_modules/./evil/../../outside/wrangler/cli.js`,
      mainWorktree,
    )).toBe(false)
    // A wrangler-adjacent package name under node_modules does not qualify.
    expect(isRepositoryWranglerCommand(
      `node ${mainWorktree}/node_modules/not-wrangler/cli.js`,
      mainWorktree,
    )).toBe(false)
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
    expect(decideMainApiAction([], 'unresponsive', mainWorktree)).toBe('start')
  })

  it('leaves a responding server alone', () => {
    expect(decideMainApiAction([owned], 'ok', mainWorktree)).toBe('none')
    expect(decideMainApiAction([foreign], 'ok', mainWorktree)).toBe('none')
  })

  it('never recovers a server that answers with errors: alive is not wedged', () => {
    expect(decideMainApiAction([owned], 'error', mainWorktree)).toBe('unhealthy')
    expect(decideMainApiAction([foreign], 'error', mainWorktree)).toBe('unhealthy')
  })

  it('recovers a wedged listener only when every listener is the repository wrangler', () => {
    expect(decideMainApiAction([owned], 'unresponsive', mainWorktree)).toBe('recover')
  })

  it('refuses when any wedged listener is not the repository wrangler', () => {
    expect(decideMainApiAction([foreign], 'unresponsive', mainWorktree)).toBe('refuse')
    expect(decideMainApiAction([owned, foreign], 'unresponsive', mainWorktree)).toBe('refuse')
    expect(decideMainApiAction([{ pid: 7780, command: '' }], 'unresponsive', mainWorktree)).toBe('refuse')
  })

  it('flags process-group members that are not provably ours so no signal reaches a bystander', () => {
    const shell = { pid: 500, command: '/bin/zsh' }
    const wranglerCli = {
      pid: 7771,
      command: `node ${mainWorktree}/node_modules/wrangler/bin/wrangler.js pages dev dist`,
    }
    expect(unownedGroupMembers([wranglerCli, owned], mainWorktree)).toEqual([])
    expect(unownedGroupMembers([wranglerCli, shell, owned], mainWorktree)).toEqual([shell])
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
