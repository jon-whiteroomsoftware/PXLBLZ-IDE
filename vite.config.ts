import { loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
// Vitest's defineConfig accepts the async config function and the `test`
// projects; Vite's own overloads reject the promise-returning form here.
import { defaultExclude, defineConfig, type ViteUserConfig } from 'vitest/config'
import { playwright } from '@vitest/browser-playwright'
import path from 'path'
import fs from 'fs'
import { execFileSync } from 'child_process'
import { assertVitestProjectIdentity } from './scripts/vitest-project-identity.js'

const DEFAULT_BASE = '/PXLBLZ-IDE/'
const DEFAULT_API_PROXY_TARGET = 'http://localhost:8788'
// A project-level exclude replaces Vitest's defaults. Preserve those defaults,
// then reject nested tool worktrees before their source or dependencies leak in.
const TEST_DISCOVERY_EXCLUDES = [
  ...defaultExclude,
  'e2e/**',
  '**/worktrees/**',
]
const LAYOUT_TEST_FILES = ['**/*.layout.test.ts', '**/*.layout.test.tsx']

// Keep DOM-dependent files explicit. Every other .test.ts file runs in the
// cheaper Node project; the jsdom project retains isolation because
// sharing its global DOM made the suite slower and allowed state to accumulate.
const JSDOM_TEST_FILES = [
  'src/analytics/index.test.ts',
  'src/engine/keyboardShortcuts.test.ts',
  'src/engine/renderLoop.test.ts',
  'src/engine/showEscapeLayers.test.ts',
  'src/engine/renderer.test.ts',
  'src/store/controllerProfileStore.test.ts',
  'src/store/controllerStore.test.ts',
  'src/store/libraryStore.test.ts',
  'src/store/mapStore.test.ts',
  'src/store/mixinStore.test.ts',
  'src/store/referenceNavigationStore.test.ts',
  'src/store/routerStore.test.ts',
  'src/store/showStore.test.ts',
]

export function createVitestTestProjects() {
  const testProjects = [
    {
      extends: true as const,
      test: {
        name: 'node',
        environment: 'node',
        globals: true,
        isolate: false,
        include: ['**/*.test.ts'],
        exclude: [...TEST_DISCOVERY_EXCLUDES, ...JSDOM_TEST_FILES, ...LAYOUT_TEST_FILES],
      },
    },
    {
      extends: true as const,
      test: {
        name: 'jsdom',
        environment: 'jsdom',
        globals: true,
        isolate: true,
        setupFiles: ['./src/test/setup.ts'],
        include: ['**/*.test.tsx', ...JSDOM_TEST_FILES],
        // Playwright E2E specs live in e2e/ and are run by Playwright.
        exclude: [...TEST_DISCOVERY_EXCLUDES, ...LAYOUT_TEST_FILES],
      },
    },
    {
      extends: true as const,
      server: { strictPort: false },
      test: {
        name: 'chromium-layout',
        globals: true,
        setupFiles: ['./src/test/layout.setup.ts'],
        include: LAYOUT_TEST_FILES,
        exclude: TEST_DISCOVERY_EXCLUDES,
        browser: {
          enabled: true,
          headless: true,
          // The #757 qualification expects one failure and consumes its
          // structured fault report; do not leave failure screenshots behind.
          screenshotFailures: process.env.PXLBLZ_LAYOUT_MUTATION !== '1',
          provider: playwright(),
          instances: [{ browser: 'chromium' as const }],
        },
      },
    },
  ]
  assertVitestProjectIdentity(testProjects)
  return testProjects
}

// Dev-only: a sink for in-page canvas captures. The running app can POST raw
// PNG bytes to `/__capture?name=foo.png` and this writes them to disk, so
// automation/tests can grab full-resolution preview frames the WebGL render
// loop would otherwise keep off-buffer. Files land in /tmp/pxlblz-captures.
// Never registered in a production build — purely a dev-server convenience.
function captureSink() {
  const dir = '/tmp/pxlblz-captures'
  return {
    name: 'pxlblz-capture-sink',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (pathname !== '/__capture' || req.method !== 'POST') return next()
        const url = new URL(req.url ?? '', 'http://localhost')
        const raw = url.searchParams.get('name') || 'capture.png'
        // Sanitize: basename only, safe chars, force a known image extension.
        const safe = path.basename(raw).replace(/[^a-zA-Z0-9._-]/g, '_')
        const name = /\.(png|jpe?g)$/i.test(safe) ? safe : safe + '.png'
        const chunks: Buffer[] = []
        req.on('data', (c) => chunks.push(c as Buffer))
        req.on('end', () => {
          try {
            const body = Buffer.concat(chunks)
            fs.mkdirSync(dir, { recursive: true })
            const file = path.join(dir, name)
            fs.writeFileSync(file, body)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true, path: file, bytes: body.length }))
          } catch (err) {
            res.statusCode = 500
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
        })
      })
    },
  }
}

// Dev-only: report which worktree (and commit) this dev server serves, at
// GET /__identity outside the base path like /__capture. The public
// Playwright suite refuses to run against a server that cannot answer or
// that serves a different worktree (#746) — the stable main runtime always
// occupies 5174, so an unverified target means a candidate gate could pass
// against old main. Never registered in a production build.
function identityEndpoint() {
  return {
    name: 'pxlblz-identity',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (pathname !== '/__identity' || req.method !== 'GET') return next()
        let commit: string | null
        try {
          commit = execFileSync('git', ['rev-parse', 'HEAD'], {
            cwd: __dirname,
            encoding: 'utf8',
          }).trim()
        } catch {
          commit = null
        }
        res.setHeader('Content-Type', 'application/json')
        res.end(JSON.stringify({ project: 'pxlblz-ide', worktree: __dirname, commit }))
      })
    },
  }
}

// Dev-only: redirect a non-root base path without a trailing slash to the
// canonical trailing-slash form, so http://localhost:5174/PXLBLZ-IDE loads
// instead of 404ing.
function redirectBaseTrailingSlash(base: string) {
  const bare = base.replace(/\/$/, '')
  return {
    name: 'redirect-base-trailing-slash',
    configureServer(server: import('vite').ViteDevServer) {
      if (!bare) return
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0].split('#')[0]
        if (pathname === bare) {
          const suffix = (req.url ?? '').slice(pathname.length)
          res.statusCode = 301
          res.setHeader('Location', base + suffix)
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig(async ({ command, mode, isPreview }): Promise<ViteUserConfig> => {
  // loadEnv reads .env files only. Keep shell-provided values authoritative so
  // isolated Playwright smoke servers can select their own Vite port and API
  // proxy target instead of accidentally using the persistent dev pair.
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  const base = env.VITE_BASE_PATH?.trim() || DEFAULT_BASE
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim()
  const port = Number(env.VITE_PORT ?? 5174)

  // Single-process dev (#899): a bare `vite` serve runs the Worker and local
  // D1 in-process through the Cloudflare plugin instead of proxying /api to a
  // separate `wrangler pages dev`. Setting VITE_API_PROXY_TARGET selects the
  // legacy proxy topology — the managed dev-runtime coordinator and the
  // Playwright wrappers still provide it until #900/#901 move them over. The
  // plugin stays out of Vitest, `vite build`, and `vite preview` (the build
  // must keep producing the plain Pages `dist` until cutover (#902), and
  // preview serves that dist without plugin build metadata), so it is
  // imported dynamically only when this serve actually uses it.
  const workerDevMode = command === 'serve' && !isPreview && !process.env.VITEST && !apiProxyTarget
  // The managed coordinator points isolated runtimes at their own throwaway
  // D1 store (#900); everyone else persists to the checkout's .wrangler/state.
  const persistStatePath = env.VITE_CF_PERSIST_STATE?.trim()
  const workerDevPlugins = workerDevMode
    ? [(await import('@cloudflare/vite-plugin')).cloudflare({
        configPath: 'wrangler.workers.jsonc',
        persistState: persistStatePath ? { path: persistStatePath } : true,
      })]
    : []

  const testProjects = createVitestTestProjects()
  const appVersion = JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version as string

  return {
    base,
    define: {
      __PXLBLZ_APP_VERSION__: JSON.stringify(appVersion),
    },
    plugins: [
      redirectBaseTrailingSlash(base),
      captureSink(),
      identityEndpoint(),
      react(),
      tailwindcss(),
      // Local D1 persists in .wrangler/state (wrangler's default), so
      // `npm run db:migrate:local` and the in-process Worker read the same
      // database.
      ...workerDevPlugins,
    ],
    server: {
      port,
      strictPort: true,
      allowedHosts: true,
      // A worktree may link the checked-out dependency tree during local QA.
      // Permit Vite's font imports through that resolved path so the browser
      // smoke's console oracle still catches application errors rather than
      // reporting dependency-serving noise.
      fs: {
        allow: [path.resolve(__dirname), fs.realpathSync(path.resolve(__dirname, 'node_modules'))],
      },
      ...(workerDevMode
        ? {}
        : {
            proxy: {
              '/api': {
                target: apiProxyTarget || DEFAULT_API_PROXY_TARGET,
                changeOrigin: true,
              },
            },
          }),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // Browser Mode discovers component-test dependencies after its worker has
      // started. Pre-bundle the layout suite's graph so Vite never reloads the
      // browser mid-run and silently drops the product-surface tests (#765).
      include: [
        '@monaco-editor/react',
        '@testing-library/react',
        '@whiteroom/software-process/layout-faults',
        'acorn',
        'class-variance-authority',
        'clsx',
        'lucide-react',
        'lz-string',
        'radix-ui',
        'tailwind-merge',
        'zustand',
        'zustand/middleware',
      ],
    },
    test: {
      globals: true,
      maxWorkers: 4,
      projects: testProjects,
    },
  }
})
