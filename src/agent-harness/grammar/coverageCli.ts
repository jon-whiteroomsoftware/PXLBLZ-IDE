// Provenance: pxlblz-v3 src/grammar/coverageCli.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Regenerate the committed coverage artifacts: the report in
// src/agent-harness/reference and the generic-only snapshot the suite
// asserts against.
//   npm run -s agent:coverage
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { generateCoverageReport, renderCoverageReport } from './coverage.js'

const report = generateCoverageReport()
const reportPath = fileURLToPath(new URL('../reference/show-grammar-coverage.md', import.meta.url))
const snapshotPath = fileURLToPath(new URL('../test/fixtures/grammar-generic-only.json', import.meta.url))
writeFileSync(reportPath, renderCoverageReport(report))
writeFileSync(snapshotPath, `${JSON.stringify(report.genericOnly, null, 2)}\n`)
console.log(
  `coverage: ${report.rows.length} paths, ` +
  `${report.rows.filter((row) => row.classification === 'specific').length} specific, ` +
  `${report.genericOnly.length} generic-only, ${report.unreachable.length} unreachable`,
)
