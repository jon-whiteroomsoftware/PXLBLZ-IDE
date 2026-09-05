// Runs an agent-harness entry under Vite module semantics (#945).
//   tsx src/agent-harness/run.ts <entry.ts> [args...]
//
// Plain tsx resolves the `@/` alias but cannot execute this closure: the V2
// stock catalogue (src/pixelblaze/stock/patterns.ts, maps/stockCatalogue.ts)
// loads its sources through Vite's `import.meta.glob` and `?raw`, which have
// no Node equivalent. V3 ran the same code through vite-node; this uses the
// installed Vite's own module runner over a plugin-free server config (no
// React, Tailwind, or Cloudflare plugins, no watcher), imports the entry,
// awaits its exported `main` when present, and closes the server. A
// long-lived entry (the bridge) keeps the process alive through its own
// handles after that.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer, createServerModuleRunner } from 'vite'

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)))

async function run(): Promise<void> {
  const [entry, ...args] = process.argv.slice(2)
  if (!entry) {
    console.error('usage: tsx src/agent-harness/run.ts <entry.ts> [args...]')
    process.exitCode = 2
    return
  }
  const entryPath = resolve(entry)
  // The entry sees itself as argv[1], as it would under `tsx <entry>`.
  process.argv = [process.argv[0], entryPath, ...args]

  const server = await createServer({
    configFile: false,
    root: repoRoot,
    logLevel: 'error',
    resolve: { alias: { '@': resolve(repoRoot, 'src') } },
    server: { middlewareMode: true, watch: null, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
  try {
    const module = (await runner.import(entryPath)) as { main?: () => Promise<void> | void }
    if (typeof module.main === 'function') await module.main()
  } finally {
    await runner.close()
    await server.close()
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error)
  process.exitCode = 1
})
