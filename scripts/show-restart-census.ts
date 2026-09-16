#!/usr/bin/env tsx
// Regenerates the #1037 Restart compatibility census through Vite so stock
// Pattern and Library sources use the same import.meta.glob path as the app.
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
    const census = (await server.ssrLoadModule(
      '/scripts/show-restart-census-worker.ts',
    )) as typeof import('./show-restart-census-worker')
    const report = await census.buildShowRestartCensus()
    census.writeShowRestartCensus(report)
    console.log(JSON.stringify(report.summary, null, 2))
  } finally {
    await server.close()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
