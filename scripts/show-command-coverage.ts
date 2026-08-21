// Regenerate the Show command coverage report and the reviewed uncovered
// snapshot. Run after adding or changing registry commands or the ShowRecord
// schema: npm run coverage:show-commands
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  computeShowCommandCoverage,
  renderShowCommandCoverageReport,
  coverageSnapshot,
} from '../src/engine/showCommands/coverage'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const coverage = computeShowCommandCoverage(repoRoot)
writeFileSync(
  join(repoRoot, 'docs', 'reference', 'show-command-coverage.md'),
  renderShowCommandCoverageReport(coverage),
)
writeFileSync(
  join(repoRoot, 'src', 'test', 'showCommandCoverage.snapshot.json'),
  `${JSON.stringify(coverageSnapshot(coverage), null, 2)}\n`,
)
console.log(
  `coverage: ${coverage.covered.size + coverage.subtreeOnly.length + coverage.unreachable.length} paths, ` +
  `${coverage.covered.size} leaf-declared, ${coverage.subtreeOnly.length} subtree-only, ` +
  `${coverage.unreachable.length} unreachable, ${coverage.allowlisted.length} allowlisted`,
)
