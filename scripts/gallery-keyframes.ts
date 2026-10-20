#!/usr/bin/env tsx
// Regenerates the stored Gallery keyframes (#888):
//   npm run gallery:keyframes                 # every public Gallery Pattern
//   npm run gallery:keyframes -- Name1 Name2  # just these
// Boots Vite in SSR mode so engine modules that use `@/` aliases and
// import.meta.glob load exactly as the app sees them, then writes one JSON per
// Pattern into src/pixelblaze/stock/keyframes/ as gzipped JSON (binary to git,
// so review diffs stay small; the browser inflates with DecompressionStream). Edit
// src/pixelblaze/stock/keyframeOverrides.ts to pin a Pattern's poster time.
// Unchanged artifacts keep their committed bytes; --force rewrites them all, for example after a change to snapshot capture or restore that leaves compiled code unchanged.
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { createServer } from 'vite'

const ROOT = resolve(new URL('..', import.meta.url).pathname)
const OUT_DIR = join(ROOT, 'src/pixelblaze/stock/keyframes')

async function main(): Promise<void> {
  const names = process.argv.slice(2).filter((arg) => !arg.startsWith('-'))
  const force = process.argv.includes('--force')
  const server = await createServer({
    configFile: join(ROOT, 'vite.config.ts'),
    root: ROOT,
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const batch = (await server.ssrLoadModule('/src/engine/galleryKeyframeBatch.ts')) as typeof import('../src/engine/galleryKeyframeBatch')
    const { galleryKeyframeArtifactCurrent } = (await server.ssrLoadModule('/src/engine/galleryKeyframes.ts')) as typeof import('../src/engine/galleryKeyframes')
    mkdirSync(OUT_DIR, { recursive: true })
    const started = performance.now()
    const entries = batch.buildGalleryKeyframeBatch({
      names: names.length ? names : undefined,
      log: (line) => console.log(line),
    })
    if (!names.length) {
      // Full runs own the directory: drop artifacts for retired Patterns.
      const produced = new Set(entries.map((entry) => `${entry.name}.json.gz`))
      for (const file of readdirSync(OUT_DIR)) {
        if ((file.endsWith('.json') || file.endsWith('.json.gz')) && !produced.has(file)) unlinkSync(join(OUT_DIR, file))
      }
    }
    let bytes = 0
    let written = 0
    let unchanged = 0
    for (const entry of entries) {
      if (!entry.artifact) continue
      const path = join(OUT_DIR, `${entry.name}.json.gz`)
      if (!force) {
        let existing = null
        let existingBytes = 0
        try {
          if (existsSync(path)) {
            const packed = readFileSync(path)
            existing = JSON.parse(gunzipSync(packed).toString('utf8'))
            existingBytes = packed.length
          }
        } catch {
          // Unreadable or undecodable artifacts need a fresh capture.
        }
        if (galleryKeyframeArtifactCurrent(existing, entry.artifact)) {
          bytes += existingBytes
          unchanged += 1
          continue
        }
      }
      const packed = gzipSync(Buffer.from(JSON.stringify(entry.artifact)), { level: 9 })
      bytes += packed.length
      writeFileSync(path, packed)
      written += 1
    }
    const failures = entries.filter((entry) => entry.error)
    console.log(
      `\n${written} keyframes written, ${unchanged} unchanged (${(bytes / 1024).toFixed(0)} KB), ` +
        `${failures.length} failed, ${((performance.now() - started) / 1000).toFixed(1)}s`,
    )
    for (const failure of failures) console.log(`  ${failure.name}: ${failure.error}`)
    if (failures.length) process.exitCode = 1
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
