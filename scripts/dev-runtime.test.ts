import { describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ensureSharedDevVarsLink,
  parseDevRuntimeArgs,
} from './dev-runtime'

describe('development runtime command', () => {
  it('requires an explicit profile for issue startup', () => {
    expect(() => parseDevRuntimeArgs([
      'start',
      '--issue',
      '627',
      '--description',
      'managed local runtime',
    ])).toThrow('start requires --profile shared or --profile isolated')
  })

  it('links a worktree to main runtime variables without copying secrets', () => {
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-dev-vars-'))
    const main = join(directory, 'main')
    const worktree = join(directory, 'issue')
    mkdirSync(main)
    mkdirSync(worktree)
    const shared = join(main, '.dev.vars')
    writeFileSync(shared, 'SESSION_SECRET=test-secret\n')

    ensureSharedDevVarsLink({
      worktree,
      branch: 'codex/issue-627',
      mainWorktree: main,
      gitCommonDirectory: join(main, '.git'),
      runtimeDirectory: join(main, '.git/pxlblz/dev-runtime/v1'),
    })

    expect(realpathSync(join(worktree, '.dev.vars'))).toBe(realpathSync(shared))
  })
})
