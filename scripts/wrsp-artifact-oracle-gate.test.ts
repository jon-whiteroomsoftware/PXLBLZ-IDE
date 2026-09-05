import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import {
  INSTALLED_WRSP_ROOT,
  createGitFixture,
  runInstalledGuard,
  type GitFixture,
} from './wrsp-guard-fixture'

/**
 * The installed `wrsp-check-artifact-oracle` gate in a disposable Git
 * fixture whose deliverables are plain Node scripts (#940). Each script calls
 * the installed `runArtifactOracle` helper the way the real oracle tests do,
 * so what fails here is the helper and checker behaviour, not a re-creation.
 *
 * Evidence boundary: the checker validates a structured report emitted by
 * trusted test code that it ran itself. A bare marker, an absent report, an
 * empty export, and a name mismatch all fail; the parser does not — and does
 * not claim to — authenticate a well-formed report forged by untrusted code.
 */
const helperUrl = pathToFileURL(join(INSTALLED_WRSP_ROOT, 'dist/artifact-oracle.js')).href

const fixtures: GitFixture[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose()
})

function deliverableScript(name: string, body: string): string {
  return [
    `import { runArtifactOracle } from ${JSON.stringify(helperUrl)}`,
    "import { writeFileSync } from 'node:fs'",
    "import { join } from 'node:path'",
    `const name = ${JSON.stringify(name)}`,
    'const directory = process.cwd()',
    body,
    '',
  ].join('\n')
}

function fixtureWithDeliverables(deliverables: Record<string, string>): GitFixture {
  const fixture = createGitFixture('pxlblz-artifact-gate')
  fixtures.push(fixture)
  for (const [name, body] of Object.entries(deliverables)) {
    writeFileSync(join(fixture.directory, `${name}.mjs`), deliverableScript(name, body))
  }
  writeFileSync(join(fixture.directory, 'wrsp.config.mjs'), [
    'export default {',
    "  selection: { runners: { node: ['node'] } },",
    '  artifacts: { deliverables: [',
    ...Object.keys(deliverables).map((name) =>
      `    { name: ${JSON.stringify(name)}, test: ${JSON.stringify(`${name}.mjs`)}, runner: 'node' },`),
    '  ] },',
    '}',
    '',
  ].join('\n'))
  fixture.commitAll('fixture')
  return fixture
}

const goodExport = `
await runArtifactOracle({
  name,
  exportArtifact: () => {
    const path = join(directory, 'good.txt')
    writeFileSync(path, 'reopened content\\n')
    return path
  },
  assert: (bytes) => {
    if (bytes.toString('utf8') !== 'reopened content\\n') throw new Error('reopened bytes differ')
  },
})`

describe('installed wrsp-check-artifact-oracle in a disposable fixture (#940)', () => {
  it('passes a deliverable whose exported file reopens with the asserted bytes', () => {
    const fixture = fixtureWithDeliverables({ good: goodExport })

    const result = runInstalledGuard('check-artifact-oracle', [], { cwd: fixture.directory, env: fixture.env })
    expect(result.status).toBe(0)
    expect(result.stdout).toMatch(/WRSP-ARTIFACT-ORACLE \{"version":1,"name":"good","artifactPath":".*good\.txt","bytes":17,"sha256":"[a-f0-9]{64}"\}/)
    expect(result.stdout).toMatch(/\[PASS\] Artifact deliverable "good": 17 bytes at .*good\.txt \(sha256 [a-f0-9]{64}\)\./)
  })

  it('fails absent, empty, silent, marker-only, and mismatched deliverables while still passing the good one', () => {
    const fixture = fixtureWithDeliverables({
      good: goodExport,
      absent: `
await runArtifactOracle({
  name,
  exportArtifact: () => join(directory, 'never-written.txt'),
  assert: () => {},
})`,
      empty: `
await runArtifactOracle({
  name,
  exportArtifact: () => {
    const path = join(directory, 'empty.txt')
    writeFileSync(path, '')
    return path
  },
  assert: () => {},
})`,
      silent: `
writeFileSync(join(directory, 'silent.txt'), 'exported but never reported\\n')`,
      'marker-only': `
console.log('WRSP-ARTIFACT-ORACLE ')`,
      mismatch: `
await runArtifactOracle({
  name: 'some-other-deliverable',
  exportArtifact: () => {
    const path = join(directory, 'mismatch.txt')
    writeFileSync(path, 'content\\n')
    return path
  },
  assert: () => {},
})`,
    })

    const result = runInstalledGuard('check-artifact-oracle', [], { cwd: fixture.directory, env: fixture.env })
    expect(result.status).not.toBe(0)
    expect(result.stdout).toContain('[PASS] Artifact deliverable "good"')
    // The helper throws inside the deliverable's own process for an absent
    // or empty export, so that process exits nonzero and the checker records
    // the exit; the helper's reason is relayed from the child's stderr.
    expect(result.stderr).toContain('Artifact oracle could not read exported artifact')
    expect(result.stderr).toContain('[FAIL] Artifact deliverable "absent": command exited 1.')
    expect(result.stderr).toContain('Artifact oracle exported artifact is empty')
    expect(result.stderr).toContain('[FAIL] Artifact deliverable "empty": command exited 1.')
    expect(result.stderr).toContain('[FAIL] Artifact deliverable "silent": Artifact oracle command did not emit a WRSP-ARTIFACT-ORACLE report.')
    expect(result.stderr).toContain('[FAIL] Artifact deliverable "marker-only": Artifact oracle command emitted malformed JSON.')
    expect(result.stderr).toContain('[FAIL] Artifact deliverable "mismatch": Artifact oracle report name must be "mismatch"; received "some-other-deliverable".')
    expect(result.stderr).toContain('Artifact oracle gate failed for 5 deliverable(s): absent, empty, silent, marker-only, mismatch.')
  })

  it('refuses to run without configured deliverables', () => {
    const fixture = createGitFixture('pxlblz-artifact-gate-unconfigured')
    fixtures.push(fixture)
    writeFileSync(join(fixture.directory, 'wrsp.config.mjs'), 'export default {}\n')
    fixture.commitAll('fixture')

    const result = runInstalledGuard('check-artifact-oracle', [], { cwd: fixture.directory, env: fixture.env })
    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('wrsp.config.mjs must configure artifacts.deliverables before running the artifact oracle gate.')
  })
})
