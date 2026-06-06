#!/usr/bin/env node
// Build a clean Chrome Web Store upload zip from extension/.
//
// The Store wants a zip with manifest.json at the ROOT (not nested under an
// extension/ dir) and no OS/junk files. We zip the *contents* of extension/ and
// hard-exclude macOS cruft. Output is versioned from the manifest so a stale
// build is obvious. Run: `npm run pack:extension`.

import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const extDir = join(root, 'extension')
const outDir = join(root, 'build')

const { version, name } = JSON.parse(readFileSync(join(extDir, 'manifest.json'), 'utf8'))
const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const zipName = `${slug}-${version}.zip`
const zipPath = join(outDir, zipName)

mkdirSync(outDir, { recursive: true })
rmSync(zipPath, { force: true })

// zip the contents of extension/ (cwd = extension) so manifest.json is at the root.
const excludes = ['.DS_Store', '**/.DS_Store', '__MACOSX', '**/.*.swp', 'Thumbs.db']
execFileSync('zip', ['-r', '-X', zipPath, '.', '-x', ...excludes], {
  cwd: extDir,
  stdio: 'inherit',
})

console.log(`\nWrote ${join('build', zipName)} — upload this to the Chrome Web Store.`)
