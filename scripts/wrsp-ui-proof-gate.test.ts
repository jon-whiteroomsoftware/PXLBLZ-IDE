import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createGitFixture, runInstalledGuard, type GitFixture } from './wrsp-guard-fixture'

/**
 * The installed `wrsp-check-ui-proof` gate against this repository's real
 * `wrsp-ui-proof.json` policy and the committed Redline Installation Zone
 * properties capture, exercised in disposable Git fixtures (#940).
 * Partitions: missing, fake, malformed, valid, stale, a non-UI range, and a
 * range with no policy at either end.
 */
const policy = readFileSync('wrsp-ui-proof.json', 'utf8')
const realCapture = readFileSync('.wrsp/ui-proof/940-redline-zone-properties.jpg')
const realRecord = JSON.parse(readFileSync('.wrsp/ui-proof/940-redline-zone-properties.json', 'utf8')) as {
  version: number
  issue: string
  route: string
  operation: string
  captures: string[]
  capturedAtCommit: string
}

const fixtures: GitFixture[] = []
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.dispose()
})

function seededFixture(): GitFixture & { baseSha: string } {
  const fixture = createGitFixture('pxlblz-ui-proof-gate')
  fixtures.push(fixture)
  mkdirSync(join(fixture.directory, 'src/components'), { recursive: true })
  writeFileSync(join(fixture.directory, 'wrsp-ui-proof.json'), policy)
  writeFileSync(join(fixture.directory, 'src/components/ShowEditor.tsx'), 'export const ShowEditor = 1\n')
  writeFileSync(join(fixture.directory, 'src/components/ShowEditor.test.tsx'), 'test\n')
  const baseSha = fixture.commitAll('base')
  return { ...fixture, baseSha }
}

function writeRecord(
  fixture: GitFixture,
  name: string,
  record: Record<string, unknown>,
): void {
  mkdirSync(join(fixture.directory, '.wrsp/ui-proof'), { recursive: true })
  writeFileSync(join(fixture.directory, `.wrsp/ui-proof/${name}.json`), `${JSON.stringify(record, null, 2)}\n`)
}

function check(fixture: GitFixture, base: string, tip: string) {
  return runInstalledGuard('check-ui-proof', [base, tip], { cwd: fixture.directory, env: fixture.env })
}

describe('installed wrsp-check-ui-proof under the repository policy (#940)', () => {
  it('walks missing, fake, malformed, valid, then stale proof for one UI change', () => {
    const fixture = seededFixture()
    writeFileSync(join(fixture.directory, 'src/components/ShowEditor.tsx'), 'export const ShowEditor = 2\n')
    const uiSha = fixture.commitAll('touch ShowEditor')

    // Missing: a UI-touching range with no record at all.
    const missing = check(fixture, fixture.baseSha, uiSha)
    expect(missing.status).toBe(1)
    expect(missing.output).toContain('UI proof required (1 UI path(s) changed).')
    expect(missing.output).toContain('UI PROOF BLOCKED: This candidate touches UI paths (src/components/ShowEditor.tsx)')
    expect(missing.output).toContain('requires real-surface proof')

    // Fake: a record whose capture is not screenshot or recording bytes.
    mkdirSync(join(fixture.directory, '.wrsp/ui-proof'), { recursive: true })
    writeFileSync(join(fixture.directory, '.wrsp/ui-proof/fake.txt'), 'component suite passed\n')
    writeRecord(fixture, 'fake', {
      version: 1,
      issue: '940',
      route: realRecord.route,
      operation: realRecord.operation,
      captures: ['.wrsp/ui-proof/fake.txt'],
      capturedAtCommit: uiSha,
    })
    const fakeSha = fixture.commitAll('fake proof')
    const fake = check(fixture, fixture.baseSha, fakeSha)
    expect(fake.status).toBe(1)
    expect(fake.output).toContain('✗ .wrsp/ui-proof/fake.json: unrecognized-capture')
    expect(fake.output).toContain('UI PROOF BLOCKED')

    // Malformed: a mutable ref instead of a full commit id.
    fixture.git('rm', '-q', '.wrsp/ui-proof/fake.json', '.wrsp/ui-proof/fake.txt')
    // git rm prunes the now-empty proof directory; recreate it.
    mkdirSync(join(fixture.directory, '.wrsp/ui-proof'), { recursive: true })
    writeFileSync(join(fixture.directory, '.wrsp/ui-proof/redline.jpg'), realCapture)
    writeRecord(fixture, 'redline', {
      version: 1,
      issue: '940',
      route: realRecord.route,
      operation: realRecord.operation,
      captures: ['.wrsp/ui-proof/redline.jpg'],
      capturedAtCommit: 'HEAD',
    })
    const malformedSha = fixture.commitAll('malformed proof')
    const malformed = check(fixture, fixture.baseSha, malformedSha)
    expect(malformed.status).toBe(1)
    expect(malformed.output).toContain('✗ .wrsp/ui-proof/redline.json: malformed (capturedAtCommit must be a full lowercase commit id')

    // Valid: the real Zone properties capture bytes, recorded at the UI
    // commit they were taken from; only record files changed since.
    writeRecord(fixture, 'redline', {
      version: 1,
      issue: '940',
      route: realRecord.route,
      operation: realRecord.operation,
      captures: ['.wrsp/ui-proof/redline.jpg'],
      capturedAtCommit: uiSha,
    })
    const validSha = fixture.commitAll('valid proof')
    const valid = check(fixture, fixture.baseSha, validSha)
    expect(valid.status).toBe(0)
    expect(valid.output).toContain(
      `✓ .wrsp/ui-proof/redline.json: ${realRecord.route} — ${realRecord.operation} [.wrsp/ui-proof/redline.jpg] at ${uiSha.slice(0, 12)}`,
    )
    expect(valid.output).not.toContain('UI PROOF BLOCKED')

    // Stale: a further UI edit after the capture invalidates the record.
    writeFileSync(join(fixture.directory, 'src/components/ShowEditor.tsx'), 'export const ShowEditor = 3\n')
    const staleSha = fixture.commitAll('touch ShowEditor again')
    const stale = check(fixture, fixture.baseSha, staleSha)
    expect(stale.status).toBe(1)
    expect(stale.output).toContain('✗ .wrsp/ui-proof/redline.json: stale (UI paths changed after the capture: src/components/ShowEditor.tsx')
    expect(stale.output).toContain('UI PROOF BLOCKED')
  })

  it('does not require proof when only a colocated component test changes', () => {
    const fixture = seededFixture()
    writeFileSync(join(fixture.directory, 'src/components/ShowEditor.test.tsx'), 'test 2\n')
    const testOnlySha = fixture.commitAll('touch a component test')

    const result = check(fixture, fixture.baseSha, testOnlySha)
    expect(result.status).toBe(0)
    expect(result.output).toContain('UI proof not required: no configured UI path changed.')
  })

  it('accepts the committed record shape verbatim when its capture commit is the range base', () => {
    // The real record was captured on reviewed main (the adoption base) and
    // committed by a candidate that touches no UI path. In the fixture the
    // same record, re-pointed at the fixture base, must be accepted for a UI
    // change made at that base: same keys, same route, same operation text,
    // same JPEG bytes.
    const fixture = createGitFixture('pxlblz-ui-proof-real-record')
    fixtures.push(fixture)
    mkdirSync(join(fixture.directory, 'src/components'), { recursive: true })
    writeFileSync(join(fixture.directory, 'wrsp-ui-proof.json'), policy)
    writeFileSync(join(fixture.directory, 'src/components/ShowEditor.tsx'), 'export const ShowEditor = 1\n')
    const baseSha = fixture.commitAll('base')
    writeFileSync(join(fixture.directory, 'src/components/ShowEditor.tsx'), 'export const ShowEditor = 2\n')
    const uiSha = fixture.commitAll('touch ShowEditor')
    mkdirSync(join(fixture.directory, '.wrsp/ui-proof'), { recursive: true })
    writeFileSync(join(fixture.directory, realRecord.captures[0]), realCapture)
    writeRecord(fixture, '940-redline-zone-properties', { ...realRecord, capturedAtCommit: uiSha })
    const tipSha = fixture.commitAll('record proof')

    const result = check(fixture, baseSha, tipSha)
    expect(result.status).toBe(0)
    expect(result.output).toContain('✓ .wrsp/ui-proof/940-redline-zone-properties.json:')
    expect(realRecord.version).toBe(1)
    expect(realRecord.issue).toBe('940')
    expect(realRecord.captures).toEqual(['.wrsp/ui-proof/940-redline-zone-properties.jpg'])
    expect(realRecord.capturedAtCommit).toMatch(/^[0-9a-f]{40}$/)
    expect([...realCapture.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff])
  })

  it('requires proof for App.tsx and stylesheet changes', () => {
    const fixture = seededFixture()
    writeFileSync(join(fixture.directory, 'src/App.tsx'), 'export const App = 1\n')
    writeFileSync(join(fixture.directory, 'src/index.css'), 'body { margin: 0 }\n')
    const shellSha = fixture.commitAll('touch shell and styles')

    const result = check(fixture, fixture.baseSha, shellSha)
    expect(result.status).toBe(1)
    expect(result.output).toContain('UI proof required (2 UI path(s) changed).')
    expect(result.output).toContain('src/App.tsx, src/index.css')
  })

  it('fails closed when neither end of the range carries a policy file', () => {
    const fixture = createGitFixture('pxlblz-ui-proof-nopolicy')
    fixtures.push(fixture)
    writeFileSync(join(fixture.directory, 'README.md'), 'one\n')
    const base = fixture.commitAll('base')
    writeFileSync(join(fixture.directory, 'README.md'), 'two\n')
    const tip = fixture.commitAll('tip')

    const result = check(fixture, base, tip)
    expect(result.status).toBe(1)
    expect(result.output).toContain('UI PROOF BLOCKED: wrsp-ui-proof.json must exist at the base or tip')
  })
})
