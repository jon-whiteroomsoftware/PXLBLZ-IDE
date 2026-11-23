// Runs a perf-harness entry through Vite's module runner, so modules that use
// `import.meta.glob` and the `@` alias (the production stores) load under Node.
// vite-node is not installed with Vitest 4 (#1268).
//   node test/perf-harness/controllerSaveViteRun.mjs <entry.ts> [args...]
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { createServer, createServerModuleRunner } from 'vite'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const [node, , entry, ...rest] = process.argv
if (!entry) throw new Error('usage: node test/perf-harness/controllerSaveViteRun.mjs <entry.ts> [args...]')
process.argv = [node, entry, ...rest]
const server = await createServer({
  root,
  configFile: false,
  logLevel: 'error',
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { middlewareMode: true, hmr: false, ws: false, watch: null },
  appType: 'custom',
})
const runner = createServerModuleRunner(server.environments.ssr, { hmr: false })
process.on('beforeExit', () => { void server.close() })
await runner.import(path.resolve(root, entry))
