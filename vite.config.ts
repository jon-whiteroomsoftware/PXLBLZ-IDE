import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const DEFAULT_BASE = '/PXLBLZ-IDE/'
const DEFAULT_API_PROXY_TARGET = 'http://localhost:8788'

// Keep browser-dependent files explicit. Every other .test.ts file runs in the
// cheaper Node project; the browser project retains jsdom isolation because
// sharing its global DOM made the suite slower and allowed state to accumulate.
const BROWSER_TEST_FILES = [
  'src/analytics/index.test.ts',
  'src/engine/keyboardShortcuts.test.ts',
  'src/engine/renderLoop.test.ts',
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

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const base = env.VITE_BASE_PATH?.trim() || DEFAULT_BASE
  const apiProxyTarget = env.VITE_API_PROXY_TARGET?.trim() || DEFAULT_API_PROXY_TARGET

  return {
    base,
    plugins: [
      redirectBaseTrailingSlash(base),
      captureSink(),
      react(),
      tailwindcss(),
    ],
    server: {
      port: 5174,
      strictPort: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['@monaco-editor/react', 'zustand'],
    },
    test: {
      globals: true,
      maxWorkers: 4,
      projects: [
        {
          extends: true,
          test: {
            name: 'node',
            environment: 'node',
            globals: true,
            isolate: false,
            include: ['**/*.test.ts'],
            exclude: ['e2e/**', 'node_modules/**', ...BROWSER_TEST_FILES],
          },
        },
        {
          extends: true,
          test: {
            name: 'browser',
            environment: 'jsdom',
            globals: true,
            isolate: true,
            setupFiles: ['./src/test/setup.ts'],
            include: ['**/*.test.tsx', ...BROWSER_TEST_FILES],
            // Playwright E2E specs live in e2e/ and are run by Playwright.
            exclude: ['e2e/**', 'node_modules/**'],
          },
        },
      ],
    },
  }
})
