import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import {
  assertMutationScopeCovered,
  buildShowAuthoringMutationScope,
  buildStrykerConfig,
  parseMutationClassificationsJson,
  parseMutationReportJson,
  qualifyMutationReport,
  summarizeMutationReport,
} from './show-authoring-mutation'

const repoRoot = process.cwd()
const reportDirectory = resolve(repoRoot, 'reports/mutation')
const reportPath = resolve(reportDirectory, 'show-authoring.json')
const configPath = resolve(reportDirectory, 'show-authoring.config.json')
const classificationsPath = resolve(repoRoot, 'scripts/show-authoring-mutation-classifications.json')

try {
  mkdirSync(reportDirectory, { recursive: true })
  rmSync(reportPath, { force: true })
  writeFileSync(configPath, JSON.stringify(buildStrykerConfig(repoRoot), null, 2))

  const startedAt = Date.now()
  const run = spawnSync(
    'npx',
    ['--no-install', 'stryker', 'run', configPath],
    { cwd: repoRoot, stdio: 'inherit' },
  )
  const elapsedMs = Date.now() - startedAt

  if (run.error) {
    throw new Error(`Stryker could not start: ${run.error.message}`)
  }
  if (!existsSync(reportPath)) {
    throw new Error(`Stryker did not produce ${reportPath}.`)
  }

  const report = parseMutationReportJson(readFileSync(reportPath, 'utf8'))
  const classifications = parseMutationClassificationsJson(
    readFileSync(classificationsPath, 'utf8'),
  )
  const summary = summarizeMutationReport(report, classifications, elapsedMs)
  assertMutationScopeCovered(report, buildShowAuthoringMutationScope(repoRoot))

  console.log([
    '',
    'Show authoring mutation qualification',
    `  total:                  ${summary.total}`,
    `  killed:                 ${summary.killed}`,
    `  surviving:              ${summary.surviving}`,
    `  timeout:                ${summary.timeout}`,
    `  error:                  ${summary.error}`,
    `  excluded or equivalent: ${summary.excludedOrEquivalent}`,
    `  elapsed:                ${(summary.elapsedMs / 1_000).toFixed(1)}s`,
    `  report:                 ${reportPath}`,
  ].join('\n'))

  qualifyMutationReport(report, classifications, elapsedMs)
  if (run.status !== 0) {
    throw new Error(`Stryker exited with status ${run.status ?? 'unknown'}.`)
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
}
