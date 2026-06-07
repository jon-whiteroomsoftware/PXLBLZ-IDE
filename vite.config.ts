import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const BASE = '/PXLBLZ-IDE/'

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

// Dev-only: redirect the base path without a trailing slash to the canonical
// trailing-slash form, so http://localhost:5174/PXLBLZ-IDE loads instead of 404ing.
function redirectBaseTrailingSlash() {
  const bare = BASE.replace(/\/$/, '')
  return {
    name: 'redirect-base-trailing-slash',
    configureServer(server: import('vite').ViteDevServer) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0].split('#')[0]
        if (pathname === bare) {
          const suffix = (req.url ?? '').slice(pathname.length)
          res.statusCode = 301
          res.setHeader('Location', BASE + suffix)
          res.end()
          return
        }
        next()
      })
    },
  }
}

export default defineConfig({
  base: BASE,
  plugins: [redirectBaseTrailingSlash(), captureSink(), react(), tailwindcss()],
  server: {
    port: 5174,
    strictPort: true,
    allowedHosts: true,
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
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    // Playwright E2E specs live in e2e/ and are run by Playwright, not Vitest.
    exclude: ['e2e/**', 'node_modules/**'],
  },
})
