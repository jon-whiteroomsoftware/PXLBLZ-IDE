import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('post-commit issue updates under reviewed-main delivery (#598)', () => {
  it.each(['codex/candidate', 'main'])(
    'keeps an issue open when a reviewer would close it for a commit on %s',
    (branch) => {
    const repository = mkdtempSync(join(tmpdir(), 'candidate-issue-update-'))
    const fakeBin = join(repository, 'fake-bin')
    const callsPath = join(repository, 'gh-calls.txt')
    const gitEnv = environmentWithoutOuterGitRepository()
    mkdirSync(fakeBin)
    try {
      execFileSync('git', ['init', `--initial-branch=${branch}`], {
        cwd: repository,
        env: gitEnv,
      })
      execFileSync('git', ['config', 'user.email', 'test@example.com'], {
        cwd: repository,
        env: gitEnv,
      })
      execFileSync('git', ['config', 'user.name', 'Test'], {
        cwd: repository,
        env: gitEnv,
      })
      writeFileSync(join(repository, 'candidate.txt'), 'candidate\n')
      execFileSync('git', ['add', 'candidate.txt'], { cwd: repository, env: gitEnv })
      execFileSync('git', ['commit', '-m', 'feat: candidate change (#598)'], {
        cwd: repository,
        env: gitEnv,
      })

      writeExecutable(join(fakeBin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$PXLBLZ_TEST_GH_CALLS"
if [ "$1 $2" = "issue view" ]; then
  printf '%s\\n' '{"title":"Candidate","body":"Acceptance criteria","state":"OPEN"}'
fi
`)
      writeExecutable(join(fakeBin, 'claude'), `#!/bin/sh
printf '%s\\n' '{"action":"close","message":"Candidate appears complete."}'
`)

      const result = spawnSync(
        'bash',
        [join(process.cwd(), '.husky/scripts/update-issues.sh')],
        {
          cwd: repository,
          encoding: 'utf8',
          env: {
            ...gitEnv,
            PATH: `${fakeBin}:${process.env.PATH}`,
            PXLBLZ_TEST_GH_CALLS: callsPath,
          },
        },
      )
      const calls = readFileSync(callsPath, 'utf8')

      expect(result.status).toBe(0)
      expect(calls).toContain('issue comment 598')
      expect(calls).not.toContain('issue close 598')
      expect(result.stdout).toMatch(/awaiting review and landing/i)
    } finally {
      rmSync(repository, { recursive: true, force: true })
    }
    },
  )
})

function writeExecutable(path: string, contents: string): void {
  writeFileSync(path, contents)
  chmodSync(path, 0o755)
}

function environmentWithoutOuterGitRepository(): NodeJS.ProcessEnv {
  const environment = { ...process.env }
  const repositoryVariables = execFileSync(
    'git',
    ['rev-parse', '--local-env-vars'],
    { encoding: 'utf8' },
  ).trim().split(/\s+/)
  for (const variable of repositoryVariables) {
    delete environment[variable]
  }
  return environment
}
