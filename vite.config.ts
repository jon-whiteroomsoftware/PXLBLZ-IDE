import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const BASE = '/PXLBLZ-IDE/'

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
  plugins: [redirectBaseTrailingSlash(), react(), tailwindcss()],
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
