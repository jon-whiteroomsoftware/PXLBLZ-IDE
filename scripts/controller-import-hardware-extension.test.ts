import { afterEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { prepareBenchExtension, verifyBenchExtensionIdentity } from './controller-import-hardware-extension'

const baseline = '326f933e446ca8942a32707afeedc30e9f02350c11cbddf6591d2b11a8a80299'
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const manifestBytes = readFileSync(new URL('../extension/manifest.json', import.meta.url))
const hosts = ['http://192.168.8.196/*', 'ws://192.168.8.196/*']
const roots: string[] = []
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }) })
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'bench-extension-')); roots.push(root)
  const source = join(root, 'source'); const destination = join(root, 'extension')
  mkdirSync(join(source, 'nested'), { recursive: true })
  writeFileSync(join(source, 'manifest.json'), manifestBytes)
  writeFileSync(join(source, 'background.js'), 'worker bytes\n')
  writeFileSync(join(source, 'nested', 'asset.bin'), Buffer.from([0, 255, 42]))
  return { source, destination }
}
function tree(directory: string, prefix = ''): Record<string, string> {
  return Object.fromEntries(readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name); const name = prefix + entry.name
    return entry.isDirectory() ? Object.entries(tree(path, `${name}/`)) : [[name, hash(readFileSync(path))]]
  }).sort(([a], [b]) => a.localeCompare(b)))
}
describe('temporary bench extension consumer directory', () => {
  it.each([5174, 5176, 5179])('preserves complete source and copies only admitted changes for port %s', (port) => {
    expect(hash(manifestBytes)).toBe(baseline)
    const { source, destination } = fixture(); const before = tree(source)
    const original = JSON.parse(manifestBytes.toString())
    const proof = prepareBenchExtension(source, destination, `http://localhost:${port}/PXLBLZ-IDE/`)
    const expected = structuredClone(original)
    expected.host_permissions.push(...hosts)
    const matches = port === 5174 ? [] : [`http://localhost:${port}/*`]
    expected.content_scripts[0].matches.push(...matches)
    expect(JSON.parse(readFileSync(join(destination, 'manifest.json'), 'utf8'))).toEqual(expected)
    expect(tree(source)).toEqual(before)
    const { 'manifest.json': ignored, ...nonManifest } = before
    void ignored
    const copied = tree(destination)
    expect(copied).toEqual({ ...before, 'manifest.json': hash(readFileSync(join(destination, 'manifest.json'))) })
    expect(proof).toEqual({ sourceManifestSha256: baseline, patchedManifestSha256: copied['manifest.json'], addedHostPermissions: hosts,
      addedContentMatches: matches, sourceFileHashes: nonManifest, copiedFileHashes: nonManifest })
    expect(new Set(expected.content_scripts[0].matches).size).toBe(expected.content_scripts[0].matches.length)
  })
  it.each(['existing', 'unknown', 'optional', 'deleted', 'matches'])('refuses manifest drift (%s) before creating a destination', (change) => {
    const { source, destination } = fixture(); const manifest = JSON.parse(manifestBytes.toString())
    if (change === 'existing') manifest.name = 'changed'
    if (change === 'unknown') manifest.unknown = true
    if (change === 'optional') manifest.optional_host_permissions = []
    if (change === 'deleted') delete manifest.icons
    if (change === 'matches') manifest.content_scripts[0].matches.push('http://localhost:5176/*')
    writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest))
    const before = tree(source)
    expect(() => prepareBenchExtension(source, destination, 'http://localhost:5174/PXLBLZ-IDE/')).toThrow('Source extension manifest differs from the admitted bench baseline')
    expect(existsSync(destination)).toBe(false); expect(tree(source)).toEqual(before)
  })
  it.each(['extra', 'missing', 'modified'])('detects %s copied non-manifest files', (change) => {
    const { source, destination } = fixture()
    prepareBenchExtension(source, destination, 'http://localhost:5174/PXLBLZ-IDE/')
    if (change === 'extra') writeFileSync(join(destination, 'extra.js'), 'extra')
    if (change === 'missing') unlinkSync(join(destination, 'background.js'))
    if (change === 'modified') writeFileSync(join(destination, 'nested', 'asset.bin'), 'changed')
    expect(() => verifyBenchExtensionIdentity(source, destination)).toThrow('Temporary extension identity mismatch')
  })
  it('refuses symlink inputs without copying', () => {
    const { source, destination } = fixture(); symlinkSync(join(source, 'background.js'), join(source, 'link.js'))
    expect(() => prepareBenchExtension(source, destination, 'http://localhost:5174/PXLBLZ-IDE/')).toThrow()
    expect(existsSync(destination)).toBe(false); expect(readFileSync(join(source, 'manifest.json'))).toEqual(manifestBytes)
  })
  it('refuses an existing destination without overwriting either directory', () => {
    const { source, destination } = fixture(); mkdirSync(destination); writeFileSync(join(destination, 'keep'), 'keep')
    const before = tree(source); const existing = tree(destination)
    expect(() => prepareBenchExtension(source, destination, 'http://localhost:5174/PXLBLZ-IDE/')).toThrow()
    expect(tree(source)).toEqual(before); expect(tree(destination)).toEqual(existing)
  })
  it.each(['https://localhost:5174/PXLBLZ-IDE/', 'http://127.0.0.1:5174/PXLBLZ-IDE/', 'http://user@localhost:5174/PXLBLZ-IDE/',
    'http://localhost:5174/PXLBLZ-IDE/?x', 'http://localhost:5174/PXLBLZ-IDE/#x', 'http://localhost:5174/',
    'http://localhost/PXLBLZ-IDE/', 'http://localhost:99999/PXLBLZ-IDE/', 'http://localhost:5174/PXLBLZ-IDE/\n'])('refuses invalid runtime %s before copying', (url) => {
    const { source, destination } = fixture(); const before = tree(source)
    expect(() => prepareBenchExtension(source, destination, url)).toThrow()
    expect(existsSync(destination)).toBe(false); expect(tree(source)).toEqual(before)
  })
})
