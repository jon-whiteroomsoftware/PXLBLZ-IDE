// Dev variant of the Controller Helper (#1220). The oracle is the generated
// tree and zip compared against the committed extension/: every file is
// byte-equal except manifest.json, whose parsed diff is exactly the name suffix
// plus the added local preview match origins.
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  DEV_MATCH_ORIGINS,
  DEV_NAME_SUFFIX,
  defaultOutputPaths,
  devManifest,
  generateDevExtension,
  trackedExtensionFiles,
  type Manifest,
} from './extension-dev'

const root = join(__dirname, '..')
const sourceDir = join(root, 'extension')
const sourceManifest = (): Manifest => JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8'))

const temps: string[] = []
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'pxlblz-extension-dev-'))
  temps.push(dir)
  return dir
}
afterEach(() => {
  for (const dir of temps.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)))
    .sort()
}

function digestTree(dir: string, files: string[]): Record<string, string> {
  return Object.fromEntries(files.map((file) => [
    file,
    createHash('sha256').update(readFileSync(join(dir, file))).digest('hex'),
  ]))
}

function zipEntries(zipPath: string): string[] {
  return execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter(Boolean).sort()
}

function zipEntry(zipPath: string, entry: string): Buffer {
  return execFileSync('unzip', ['-p', zipPath, entry], { maxBuffer: 64 * 1024 * 1024 })
}

function withoutDevFields(manifest: Manifest): Manifest {
  const copy = structuredClone(manifest)
  delete copy.name
  delete copy.content_scripts?.[0]?.matches
  return copy
}

describe('devManifest', () => {
  it('changes only the name suffix and appends the three local preview origins (T1)', () => {
    const source = sourceManifest()
    const before = structuredClone(source)
    const dev = devManifest(source)

    expect(source).toEqual(before)
    expect(withoutDevFields(dev)).toEqual(withoutDevFields(source))
    expect(dev.name).toBe(`${source.name}${DEV_NAME_SUFFIX}`)
    expect(DEV_NAME_SUFFIX).toBe(' (dev)')
    expect(DEV_MATCH_ORIGINS).toEqual([
      'http://agent-mini.local:*/*',
      'http://localhost:*/*',
      'http://127.0.0.1:*/*',
    ])
    expect(dev.content_scripts?.[0]?.matches).toEqual([
      ...(source.content_scripts?.[0]?.matches ?? []),
      ...DEV_MATCH_ORIGINS,
    ])
  })

  it.each([
    ['none present', [], [...DEV_MATCH_ORIGINS]],
    ['one present', ['https://a.example/*', 'http://localhost:*/*'], [
      'https://a.example/*', 'http://localhost:*/*', 'http://agent-mini.local:*/*', 'http://127.0.0.1:*/*',
    ]],
    ['all present', [...DEV_MATCH_ORIGINS].reverse(), [...DEV_MATCH_ORIGINS].reverse()],
  ])('appends only missing origins without duplicates: %s (T2)', (_label, matches, expected) => {
    const dev = devManifest({ name: 'X', content_scripts: [{ matches, js: ['content.js'] }] })
    const devMatches = dev.content_scripts?.[0]?.matches ?? []
    expect(devMatches).toEqual(expected)
    expect(new Set(devMatches).size).toBe(devMatches.length)
  })

  it.each([
    ['absent', {}],
    ['empty', { content_scripts: [] }],
    ['two entries', { content_scripts: [{ matches: [] }, { matches: [] }] }],
    ['entry without matches', { content_scripts: [{ js: ['content.js'] }] }],
  ])('refuses an ambiguous content_scripts target: %s (T3)', (_label, fields) => {
    expect(() => devManifest({ name: 'X', ...fields })).toThrow(/content_scripts/)
  })

  it('refuses before writing any output (T3)', () => {
    const fixture = tempDir()
    writeFileSync(join(fixture, 'manifest.json'), JSON.stringify({ name: 'X' }))
    const outDir = join(tempDir(), 'out')
    expect(() => generateDevExtension({ sourceDir: fixture, files: ['manifest.json'], outDir }))
      .toThrow(/content_scripts/)
    expect(existsSync(outDir)).toBe(false)
  })
})

describe('generateDevExtension against the committed extension/', () => {
  const files = trackedExtensionFiles(root)

  it('lists the tracked tree, manifest included', () => {
    expect(files).toContain('manifest.json')
    expect(files).toContain('content.js')
    expect(files).toEqual([...files].sort())
  })

  it('writes a folder and zip equal to source except the manifest, leaving source unchanged (T4, T5)', () => {
    const before = digestTree(sourceDir, files)
    const outDir = tempDir()
    const { folder, zip } = generateDevExtension({ sourceDir, files, outDir })

    expect(walk(folder)).toEqual(files)
    expect(zipEntries(zip)).toEqual(files)
    for (const file of files.filter((f) => f !== 'manifest.json')) {
      const sourceBytes = readFileSync(join(sourceDir, file))
      expect(readFileSync(join(folder, file)).equals(sourceBytes), file).toBe(true)
      expect(zipEntry(zip, file).equals(sourceBytes), `zip ${file}`).toBe(true)
    }
    const expected = devManifest(sourceManifest())
    expect(JSON.parse(readFileSync(join(folder, 'manifest.json'), 'utf8'))).toEqual(expected)
    expect(JSON.parse(zipEntry(zip, 'manifest.json').toString('utf8'))).toEqual(expected)

    expect(digestTree(sourceDir, files)).toEqual(before)
    expect(execFileSync('git', ['status', '--porcelain', '--', 'extension'], { cwd: root, encoding: 'utf8' }))
      .toBe('')
  })

  it('is idempotent down to the zip bytes (T6)', () => {
    const first = generateDevExtension({ sourceDir, files, outDir: tempDir() })
    const second = generateDevExtension({ sourceDir, files, outDir: tempDir() })
    expect(digestTree(second.folder, files)).toEqual(digestTree(first.folder, files))
    expect(readFileSync(second.zip).equals(readFileSync(first.zip))).toBe(true)
  })

  it('pins zip entry times and drops host-specific extra fields, so bytes cannot drift with clock or host (T6)', () => {
    const { zip } = generateDevExtension({ sourceDir, files, outDir: tempDir() })
    const env = { ...process.env, TZ: 'UTC' }
    const times = execFileSync('zipinfo', ['-T', zip], { encoding: 'utf8', env })
      .split('\n').filter((line) => /^[-d]/.test(line)).map((line) => line.split(/\s+/)[6])
    expect(times).toHaveLength(files.length)
    expect(new Set(times)).toEqual(new Set(['20000101.000000']))
    const extraLengths = execFileSync('zipinfo', ['-v', zip], { encoding: 'utf8', env })
      .split('\n').filter((line) => line.includes('length of extra field:'))
    expect(extraLengths).toHaveLength(files.length)
    for (const line of extraLengths) expect(line).toMatch(/:\s+0 bytes$/)
  })

  it('removes output left by an earlier run (T7)', () => {
    const outDir = tempDir()
    const { folder } = generateDevExtension({ sourceDir, files, outDir })
    writeFileSync(join(folder, 'stale.js'), 'old')
    generateDevExtension({ sourceDir, files, outDir })
    expect(walk(folder)).toEqual(files)
  })

  it('writes by default under a git-ignored path (T8)', () => {
    const { folder, zip } = defaultOutputPaths(root, sourceManifest())
    for (const path of [folder, zip]) {
      expect(execFileSync('git', ['check-ignore', '--no-index', path], { cwd: root, encoding: 'utf8' }).trim())
        .toBe(path)
    }
  })
})
