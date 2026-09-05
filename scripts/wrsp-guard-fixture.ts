/**
 * Shared fixture helpers for exercising the installed
 * `@whiteroom/software-process` consumer guards in disposable Git
 * repositories under the OS temp directory (#940). The guards are invoked as
 * subprocesses through their installed `bin/` entry points, so what the tests
 * prove is the behaviour of the package actually vendored in this repository,
 * never a re-implementation.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

export const INSTALLED_WRSP_ROOT = resolve(process.cwd(), 'node_modules/@whiteroom/software-process')

export function installedWrspBin(name: string): string {
  return join(INSTALLED_WRSP_ROOT, 'bin', `${name}.mjs`)
}

/**
 * Under a Git hook, git exports GIT_DIR / GIT_INDEX_FILE / GIT_WORK_TREE for
 * the enclosing repository. Inherited by fixture commands they would redirect
 * every git call into the real repository, so every GIT_* variable is scrubbed.
 */
export function environmentWithoutOuterGitRepository(): NodeJS.ProcessEnv {
  return Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  )
}

export interface GitFixture {
  directory: string
  env: NodeJS.ProcessEnv
  git: (...args: string[]) => string
  commitAll: (message: string) => string
  dispose: () => void
}

export function createGitFixture(prefix: string): GitFixture {
  const directory = mkdtempSync(join(tmpdir(), `${prefix}-`))
  const env = environmentWithoutOuterGitRepository()
  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: directory, encoding: 'utf8', env }).trim()
  git('init', '-q', '-b', 'main')
  git('config', 'user.email', 'test@example.com')
  git('config', 'user.name', 'Test')
  git('config', 'commit.gpgsign', 'false')
  return {
    directory,
    env,
    git,
    commitAll: (message) => {
      git('add', '-A')
      git('commit', '-qm', message)
      return git('rev-parse', 'HEAD')
    },
    dispose: () => rmSync(directory, { recursive: true, force: true }),
  }
}

export interface GuardRun {
  status: number | null
  stdout: string
  stderr: string
  output: string
}

export function runInstalledGuard(
  bin: string,
  args: readonly string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv },
): GuardRun {
  const result = spawnSync(process.execPath, [installedWrspBin(bin), ...args], {
    cwd: options.cwd,
    env: options.env ?? environmentWithoutOuterGitRepository(),
    encoding: 'utf8',
    timeout: 120_000,
  })
  if (result.error) throw result.error
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  }
}
