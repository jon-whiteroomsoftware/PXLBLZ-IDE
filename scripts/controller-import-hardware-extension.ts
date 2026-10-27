import { createHash } from 'node:crypto'
import { copyFileSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const baseline = '326f933e446ca8942a32707afeedc30e9f02350c11cbddf6591d2b11a8a80299'
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex')
export interface BenchExtensionProof {
  sourceManifestSha256: string
  patchedManifestSha256: string
  addedHostPermissions: string[]
  addedContentMatches: string[]
  sourceFileHashes: Record<string, string>
  copiedFileHashes: Record<string, string>
}

/** Enumerate regular files only; do not follow links at any depth. */
export function benchExtensionFiles(directory: string): Record<string, string> {
  const files: Record<string, string> = {}
  const visit = (path: string, relative: string) => {
    const stat = lstatSync(path)
    if (stat.isDirectory()) {
      for (const name of readdirSync(path).sort()) visit(join(path, name), relative ? `${relative}/${name}` : name)
    } else if (stat.isFile()) files[relative] = digest(readFileSync(path))
    else throw new Error('Extension inputs must be regular files or directories')
  }
  if (!lstatSync(directory).isDirectory()) throw new Error('Extension source must be a directory')
  visit(directory, '')
  return files
}

export function verifyBenchExtensionIdentity(sourceDir: string, destinationDir: string) {
  try {
    const source = benchExtensionFiles(sourceDir)
    const copied = benchExtensionFiles(destinationDir)
    if (JSON.stringify(Object.keys(source).sort()) !== JSON.stringify(Object.keys(copied).sort())) throw new Error('paths')
    delete source['manifest.json']; delete copied['manifest.json']
    if (JSON.stringify(source) !== JSON.stringify(copied)) throw new Error('bytes')
    return { sourceFileHashes: source, copiedFileHashes: copied }
  } catch { throw new Error('Temporary extension identity mismatch') }
}

export function prepareBenchExtension(sourceDir: string, destinationDir: string, runtimeUrl: string): BenchExtensionProof {
  if (!/^http:\/\/localhost:[0-9]+\/PXLBLZ-IDE\/$/.test(runtimeUrl) || runtimeUrl.trim() !== runtimeUrl) throw new Error('Invalid bench extension runtime URL')
  const runtime = new URL(runtimeUrl)
  const files = benchExtensionFiles(sourceDir)
  const sourceBytes = readFileSync(join(sourceDir, 'manifest.json'))
  const sourceManifestSha256 = digest(sourceBytes)
  if (sourceManifestSha256 !== baseline) throw new Error('Source extension manifest differs from the admitted bench baseline')
  const manifest = JSON.parse(sourceBytes.toString('utf8'))
  const addedHostPermissions = ['http://192.168.8.196/*', 'ws://192.168.8.196/*']
  manifest.host_permissions.push(...addedHostPermissions)
  const addedContentMatches: string[] = []
  if (runtime.port !== '5174') {
    // URL normalizes the default HTTP port to an empty string.
    const port = runtime.port || '80'
    const match = `http://localhost:${port}/*`
    if (!manifest.content_scripts[0].matches.includes(match)) {
      manifest.content_scripts[0].matches.push(match); addedContentMatches.push(match)
    }
  }
  // Non-recursive creation refuses an existing destination, including symlinks.
  mkdirSync(destinationDir, { mode: 0o700 })
  for (const path of Object.keys(files)) {
    const parts = path.split('/'); parts.pop()
    if (parts.length) mkdirSync(join(destinationDir, ...parts), { recursive: true })
    copyFileSync(join(sourceDir, path), join(destinationDir, path))
  }
  const patchedBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`)
  writeFileSync(join(destinationDir, 'manifest.json'), patchedBytes)
  return { sourceManifestSha256, patchedManifestSha256: digest(patchedBytes), addedHostPermissions, addedContentMatches,
    ...verifyBenchExtensionIdentity(sourceDir, destinationDir) }
}
