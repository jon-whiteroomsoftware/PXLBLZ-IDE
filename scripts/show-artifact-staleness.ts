#!/usr/bin/env tsx
import { resolve } from 'node:path'
import { createServer } from 'vite'

const root = resolve(new URL('..', import.meta.url).pathname)

async function main(): Promise<void> {
  const server = await createServer({
    configFile: resolve(root, 'vite.config.ts'),
    root,
    server: { middlewareMode: true, watch: null, hmr: false },
    appType: 'custom',
    logLevel: 'error',
  })
  try {
    const worker = (await server.ssrLoadModule(
      '/scripts/show-artifact-staleness-worker.ts',
    )) as typeof import('./show-artifact-staleness-worker')
    const report = await worker.buildShowArtifactStalenessReport()
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
