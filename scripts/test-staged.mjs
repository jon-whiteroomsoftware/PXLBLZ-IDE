import { execFileSync, spawnSync } from 'node:child_process'
import { collectVitestInputs, selectPrecommitTests } from './test-selection.mjs'

function stagedFiles() {
  const output = execFileSync(
    'git',
    ['diff', '--cached', '--name-only', '--diff-filter=ACMR'],
    { encoding: 'utf8' },
  )
  return output.split('\n').filter(Boolean)
}

const changedFiles = process.argv.slice(2)
const selectedFiles = changedFiles.length > 0 ? changedFiles : stagedFiles()
const selection = selectPrecommitTests(selectedFiles)
const vitestInputs = collectVitestInputs(selection)

if (vitestInputs.length === 0) {
  console.log('No staged JavaScript or TypeScript changes require Vitest.')
  process.exit(0)
}

console.log(`Running ${selection.focusedTests.length} focused test file(s)`
  + (selection.invariantTests.length > 0
    ? ` plus ${selection.invariantTests.length} invariant test(s).`
    : '.'))

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
const result = spawnSync(npx, [
  'vitest',
  '--run',
  '--passWithNoTests',
  ...vitestInputs,
], { stdio: 'inherit' })

if (result.error) throw result.error
process.exit(result.status ?? 1)
