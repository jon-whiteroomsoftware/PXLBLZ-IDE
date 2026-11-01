#!/usr/bin/env node
// Generate a local-only dev variant of the Controller Helper extension (#1220).
//
// The published manifest injects the content script only on the public hosts
// and localhost/127.0.0.1 port 5174, so the IDE never detects the extension on
// an Agent Mini preview or an issue runtime port. This writes a copy of the
// tracked extension/ files whose manifest differs in exactly two ways: the
// name gains " (dev)", and content_scripts.matches gains the local preview
// origins. Every other byte is the committed source. The variant is for
// unpacked loading only; it is never published.
//
// Run: `npm run extension:dev`. Output, under the ignored build/:
//   build/extension-dev/<slug>/            unpacked folder for "Load unpacked"
//   build/extension-dev/<slug>-<version>.zip  the same files, manifest at root

import { execFileSync } from 'node:child_process'
import { copyFileSync, mkdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const DEV_NAME_SUFFIX = ' (dev)'
export const DEV_MATCH_ORIGINS: readonly string[] = [
  'http://agent-mini.local:*/*',
  'http://localhost:*/*',
  'http://127.0.0.1:*/*',
]

// Entry mtimes are pinned so two runs over the same source give the same zip bytes.
const PINNED_MTIME = new Date('2000-01-01T00:00:00Z')

interface ContentScript {
  matches?: string[]
  [field: string]: unknown
}

export interface Manifest {
  name?: string
  version?: string
  content_scripts?: ContentScript[]
  [field: string]: unknown
}

/** The source manifest with the dev name suffix and the missing local preview
 *  origins appended to its single content script. Throws when the content
 *  script entry to widen is ambiguous. Does not mutate `source`. */
export function devManifest(source: Manifest): Manifest {
  const dev = structuredClone(source)
  const scripts = dev.content_scripts
  const matches = Array.isArray(scripts) && scripts.length === 1 ? scripts[0]?.matches : undefined
  if (!Array.isArray(matches)) {
    throw new Error('Expected exactly one content_scripts entry with a matches list.')
  }
  dev.name = `${source.name}${DEV_NAME_SUFFIX}`
  for (const origin of DEV_MATCH_ORIGINS) {
    if (!matches.includes(origin)) matches.push(origin)
  }
  return dev
}

function slugOf(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** Output directory for the repository at `root`; build/ is git-ignored. */
export function defaultOutDir(root: string): string {
  return join(root, 'build', 'extension-dev')
}

function outputPaths(outDir: string, manifest: Manifest): { folder: string; zip: string } {
  const slug = slugOf(String(manifest.name))
  return { folder: join(outDir, slug), zip: join(outDir, `${slug}-${manifest.version}.zip`) }
}

/** Default folder and zip paths for the repository at `root`, given the source manifest. */
export function defaultOutputPaths(root: string, source: Manifest): { folder: string; zip: string } {
  return outputPaths(defaultOutDir(root), devManifest(source))
}

/** Tracked files under extension/, relative to it and sorted. */
export function trackedExtensionFiles(root: string): string[] {
  const listed = execFileSync('git', ['ls-files', '-z', '--', 'extension'], { cwd: root, encoding: 'utf8' })
  return listed.split('\0').filter(Boolean).map((path) => path.slice('extension/'.length)).sort()
}

/** Replace `outDir` with the dev folder and zip built from `files` in `sourceDir`. */
export function generateDevExtension(options: {
  sourceDir: string
  files: string[]
  outDir: string
}): { folder: string; zip: string } {
  const { sourceDir, outDir } = options
  const files = [...options.files].sort()
  const manifest = devManifest(JSON.parse(readFileSync(join(sourceDir, 'manifest.json'), 'utf8')))
  const { folder, zip } = outputPaths(outDir, manifest)

  rmSync(outDir, { recursive: true, force: true })
  for (const file of files) {
    const target = join(folder, file)
    mkdirSync(dirname(target), { recursive: true })
    if (file === 'manifest.json') writeFileSync(target, `${JSON.stringify(manifest, null, 2)}\n`)
    else copyFileSync(join(sourceDir, file), target)
    utimesSync(target, PINNED_MTIME, PINNED_MTIME)
  }

  // An explicit sorted file list fixes entry order and adds no directory entries;
  // -X drops extra fields (uid/gid, extended timestamps); TZ=UTC fixes the
  // DOS-time rendering of the pinned mtime.
  execFileSync('zip', ['-q', '-X', zip, ...files], {
    cwd: folder,
    env: { ...process.env, TZ: 'UTC' },
  })
  return { folder, zip }
}

function main(): void {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const sourceDir = join(root, 'extension')
  const { folder, zip } = generateDevExtension({
    sourceDir,
    files: trackedExtensionFiles(root),
    outDir: defaultOutDir(root),
  })
  console.log(`Wrote ${folder}\nWrote ${zip}\nLoad the folder unpacked at chrome://extensions. Never publish it.`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
