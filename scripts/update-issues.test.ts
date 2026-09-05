import { execFileSync, spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// The hook under test lives on a protected path. PXLBLZ_UPDATE_ISSUES_SCRIPT
// lets a prepared replacement be qualified through this same suite before it
// is written there; unset, the suite exercises the real hook.
const HOOK_SCRIPT =
  process.env.PXLBLZ_UPDATE_ISSUES_SCRIPT ??
  join(process.cwd(), '.husky/scripts/update-issues.sh')

const APPROVED_LAUNCH =
  /^exec --model gpt-5\.6-sol --config model_reasoning_effort="high" /

interface HookRun {
  status: number | null
  stdout: string
  ghCalls: string
  codexArgs: string
  codexStdin: string
  codexSchema: string
}

interface HookRunOptions {
  branch?: string
  /** JSON the stubbed classifier writes to its --output-last-message file. */
  decision?: string
  /** Stub exits with this code before writing any decision (CLI failure). */
  failWith?: number
  /**
   * Stub writes `decision` to the output file and THEN exits with this code:
   * the CLI failed after a valid-looking result was already on disk.
   */
  failAfterWrite?: number
  /** Drop the stub entirely so `codex` is not on PATH. */
  withoutCodex?: boolean
}

describe('post-commit issue updates under reviewed-main delivery (#598)', () => {
  it.each(['codex/candidate', 'main'])(
    'keeps an issue open when a classifier would close it for a commit on %s',
    (branch) => {
      const run = runHook({
        branch,
        decision: '{"action":"close","message":"Candidate appears complete."}',
      })

      expect(run.status).toBe(0)
      expect(run.ghCalls).toContain('issue comment 598')
      expect(run.ghCalls).not.toContain('issue close 598')
      // The hook never applies the implemented label either (#940): label
      // transitions belong to the coordinator, not to a per-commit judgement.
      expect(run.ghCalls).not.toMatch(/issue edit 598.*--add-label/)
      expect(run.ghCalls).toMatch(/claims implementation of this issue's scope/)
      expect(run.ghCalls).toMatch(/not closure, review, landing, or release/)
      expect(run.stdout).toMatch(
        /claims implementation scope, not review, landing, or release/i,
      )
    },
  )

  it('posts the classifier message as a progress comment', () => {
    const run = runHook({
      decision: '{"action":"comment","message":"Progress note."}',
    })

    expect(run.status).toBe(0)
    expect(run.ghCalls).toContain('issue comment 598 --body Progress note.')
    expect(run.ghCalls).not.toContain('issue close 598')
  })

  it('leaves the issue untouched when the classifier says nothing', () => {
    const run = runHook({ decision: '{"action":"nothing","message":""}' })

    expect(run.status).toBe(0)
    expect(run.ghCalls).not.toContain('issue comment')
    expect(run.ghCalls).not.toContain('issue close')
    expect(run.stdout).toMatch(/No action needed for issue #598/)
  })
})

describe('post-commit classifier launch (#940)', () => {
  it('names the approved Codex worker pair and takes its decision from the output file', () => {
    const run = runHook({
      decision: '{"action":"comment","message":"Progress note."}',
    })

    expect(run.status).toBe(0)
    expect(run.codexArgs).toMatch(APPROVED_LAUNCH)
    expect(run.codexArgs).toMatch(/ --sandbox read-only /)
    expect(run.codexArgs).toMatch(/ --ephemeral /)
    // Prompt arrives on stdin: the trailing `-` is the only positional argument.
    expect(run.codexArgs).toMatch(/ --output-schema \S+ --output-last-message \S+ -\s*$/)
    // The launch is explicit: nothing about it is inherited from a session.
    expect(run.codexArgs).not.toMatch(/claude|haiku|fable/)
    // The structured output contract is the three-way decision.
    expect(JSON.parse(run.codexSchema)).toMatchObject({
      type: 'object',
      additionalProperties: false,
      properties: { action: { enum: ['close', 'comment', 'nothing'] } },
      required: ['action', 'message'],
    })
    // The decision came from the file the stub wrote, and it acted on the issue.
    expect(run.ghCalls).toContain('issue comment 598 --body Progress note.')
  })

  it('sends the prompt over stdin and keeps it and the transcript off stdout', () => {
    const run = runHook({ decision: '{"action":"nothing","message":""}' })

    expect(run.codexStdin).toContain('ISSUE #598: Candidate')
    expect(run.codexStdin).toContain('Acceptance criteria')
    expect(run.codexStdin).toContain('feat: candidate change (#598)')
    expect(run.codexArgs).not.toContain('COMMIT MESSAGE')
    expect(run.codexArgs).not.toContain('Acceptance criteria')
    expect(run.stdout).not.toContain('Acceptance criteria')
    expect(run.stdout).not.toContain('COMMIT MESSAGE')
    expect(run.stdout).not.toContain('classifier transcript chatter')
  })

  it('skips the issue without failing the commit when the classifier call fails', () => {
    const run = runHook({ failWith: 127 })

    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/Classifier call failed — skipping issue #598/)
    expect(run.ghCalls).toContain('issue view 598')
    expect(run.ghCalls).not.toContain('issue comment')
    expect(run.ghCalls).not.toContain('issue close')
  })

  it.each([
    '{"action":"comment","message":"Progress note."}',
    '{"action":"close","message":"Candidate appears complete."}',
  ])(
    'discards the decision %s when the classifier exits nonzero after writing it',
    (decision) => {
      // A nonzero exit is a failed classification even when a valid-looking
      // decision file was written first (#940 review P2): the exit status
      // decides, and a failed call must mutate nothing on the issue.
      const run = runHook({ decision, failAfterWrite: 1 })

      expect(run.status).toBe(0)
      expect(run.stdout).toMatch(/Classifier call failed — skipping issue #598/)
      expect(run.ghCalls).toContain('issue view 598')
      expect(run.ghCalls).not.toContain('issue comment')
      expect(run.ghCalls).not.toContain('issue close')
      expect(run.ghCalls).not.toContain('issue edit')
      expect(run.stdout).not.toMatch(/Adding comment|Commit recorded/)
    },
  )

  it('skips the issue when the classifier exits successfully with an empty decision', () => {
    const run = runHook({ decision: '' })

    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/skipping issue #598/)
    expect(run.ghCalls).toContain('issue view 598')
    expect(run.ghCalls).not.toContain('issue comment')
    expect(run.ghCalls).not.toContain('issue close')
    expect(run.ghCalls).not.toContain('issue edit')
  })

  it('skips the issue without failing the commit when codex is not on PATH', () => {
    const run = runHook({ withoutCodex: true })

    expect(run.status).toBe(0)
    expect(run.stdout).toMatch(/codex not on PATH.*skipping issue #598/)
    expect(run.ghCalls).not.toContain('issue comment')
    expect(run.ghCalls).not.toContain('issue close')
  })
})

function runHook(options: HookRunOptions): HookRun {
  const branch = options.branch ?? 'codex/candidate'
  const repository = mkdtempSync(join(tmpdir(), 'candidate-issue-update-'))
  const fakeBin = join(repository, 'fake-bin')
  const ghCallsPath = join(repository, 'gh-calls.txt')
  const codexArgsPath = join(repository, 'codex-args.txt')
  const codexStdinPath = join(repository, 'codex-stdin.txt')
  const codexSchemaPath = join(repository, 'codex-schema.json')
  const gitEnv = environmentWithoutOuterGitRepository()
  mkdirSync(fakeBin)
  try {
    const git = (...args: string[]): void => {
      execFileSync('git', args, { cwd: repository, env: gitEnv })
    }
    git('init', `--initial-branch=${branch}`)
    git('config', 'user.email', 'test@example.com')
    git('config', 'user.name', 'Test')
    writeFileSync(join(repository, 'candidate.txt'), 'candidate\n')
    git('add', 'candidate.txt')
    git('commit', '-m', 'feat: candidate change (#598)')

    writeExecutable(join(fakeBin, 'gh'), `#!/bin/sh
printf '%s\\n' "$*" >> "$PXLBLZ_TEST_GH_CALLS"
if [ "$1 $2" = "issue view" ]; then
  printf '%s\\n' '{"title":"Candidate","body":"Acceptance criteria","state":"OPEN"}'
fi
`)
    if (!options.withoutCodex) {
      // Records argv and stdin, copies the schema it was handed, prints
      // transcript noise the hook must discard, then writes the decision to
      // the --output-last-message file exactly as `codex exec` would. With
      // failAfterWrite it exits nonzero only after that write.
      writeExecutable(join(fakeBin, 'codex'), `#!/bin/sh
printf '%s\\n' "$*" >> "$PXLBLZ_TEST_CODEX_ARGS"
cat > "$PXLBLZ_TEST_CODEX_STDIN"
${options.failWith !== undefined ? `exit ${options.failWith}` : ''}
output=""
schema=""
while [ $# -gt 0 ]; do
  case "$1" in
    --output-last-message) output="$2"; shift ;;
    --output-schema) schema="$2"; shift ;;
  esac
  shift
done
cp "$schema" "$PXLBLZ_TEST_CODEX_SCHEMA"
echo "classifier transcript chatter"
printf '%s' '${options.decision ?? ''}' > "$output"
${options.failAfterWrite !== undefined ? `exit ${options.failAfterWrite}` : ''}
`)
    }

    // A restricted PATH keeps the developer's real codex out of the run: the
    // stub (when present) is the only classifier the hook can find.
    const result = spawnSync('bash', [HOOK_SCRIPT], {
      cwd: repository,
      encoding: 'utf8',
      env: {
        ...gitEnv,
        PATH: `${fakeBin}:/usr/bin:/bin`,
        PXLBLZ_TEST_GH_CALLS: ghCallsPath,
        PXLBLZ_TEST_CODEX_ARGS: codexArgsPath,
        PXLBLZ_TEST_CODEX_STDIN: codexStdinPath,
        PXLBLZ_TEST_CODEX_SCHEMA: codexSchemaPath,
      },
    })
    return {
      status: result.status,
      stdout: result.stdout,
      ghCalls: readIfPresent(ghCallsPath),
      codexArgs: readIfPresent(codexArgsPath),
      codexStdin: readIfPresent(codexStdinPath),
      codexSchema: readIfPresent(codexSchemaPath),
    }
  } finally {
    rmSync(repository, { recursive: true, force: true })
  }
}

function readIfPresent(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

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
