import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import fs from 'fs'

const BASE = '/PXLBLZ-IDE/'
const PERSONAL_DIRS = ['patterns', 'maps', 'controllers', 'bindings'] as const

function googleAnalyticsSnippet(measurementId: string | undefined): Plugin {
  return {
    name: 'pxlblz-google-analytics',
    apply: 'build',
    transformIndexHtml() {
      if (!measurementId) return []
      const id = JSON.stringify(measurementId)
      return [
        {
          tag: 'script',
          attrs: {
            async: true,
            src: `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`,
          },
          injectTo: 'head',
        },
        {
          tag: 'script',
          children: [
            'window.dataLayer = window.dataLayer || [];',
            'function gtag(){dataLayer.push(arguments);}',
            'gtag("js", new Date());',
            `gtag("config", ${id});`,
          ].join('\n'),
          injectTo: 'head',
        },
      ]
    },
  }
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

function readJsonFiles(dir: string) {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((name) => /^[a-z0-9][a-z0-9._-]*\.json$/.test(name) && !name.includes('..'))
    .sort((a, b) => a.localeCompare(b))
    .map((name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')))
}

function safeFileStem(name: string) {
  const ascii = String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '')
    .toLowerCase()
  return ascii.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'untitled'
}

function workspaceFileName(record: { id: string; name: string }, dir: string) {
  const base = safeFileStem(record.name)
  const id = safeFileStem(record.id)
  const used = new Set(fs.existsSync(dir) ? fs.readdirSync(dir) : [])
  let fileName = `${base}--${id}.json`
  let suffix = 2
  while (used.has(fileName) && JSON.parse(fs.readFileSync(path.join(dir, fileName), 'utf8')).id !== record.id) {
    fileName = `${base}--${id}-${suffix}.json`
    suffix += 1
  }
  if (fileName.includes('..') || !/^[a-z0-9][a-z0-9._-]*\.json$/.test(fileName)) {
    throw new Error(`unsafe workspace filename: ${fileName}`)
  }
  return fileName
}

function readBodyJson(req: import('http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c as Buffer))
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'))
      } catch (err) {
        reject(err)
      }
    })
    req.on('error', reject)
  })
}

function findWorkspaceFileById(dir: string, id: string) {
  if (!fs.existsSync(dir)) return null
  for (const name of fs.readdirSync(dir)) {
    if (!/^[a-z0-9][a-z0-9._-]*\.json$/.test(name) || name.includes('..')) continue
    const file = path.join(dir, name)
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
      if (parsed?.id === id) return file
    } catch {
      continue
    }
  }
  return null
}

function workspaceDir(root: string, kind: string) {
  if (kind === 'patterns') return path.join(root, 'patterns')
  if (kind === 'maps') return path.join(root, 'maps')
  return null
}

// Dev-only: expose repo-backed personal patterns/maps to localhost. Writes land
// through the same localhost-only endpoint family; the app never bundles fs.
function personalContentWorkspace() {
  const root = path.resolve(__dirname, 'personal')
  return {
    name: 'pxlblz-personal-content-workspace',
    configureServer(server: import('vite').ViteDevServer) {
      for (const dir of PERSONAL_DIRS) fs.mkdirSync(path.join(root, dir), { recursive: true })
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url ?? '').split('?')[0]
        if (pathname === '/__personal-content' && req.method === 'GET') {
          try {
            const payload = {
              ok: true,
              patterns: readJsonFiles(path.join(root, 'patterns')),
              maps: readJsonFiles(path.join(root, 'maps')),
            }
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify(payload))
          } catch (err) {
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
          return
        }
        const writeMatch = /^\/__personal-content\/(patterns|maps)$/.exec(pathname)
        if (writeMatch && req.method === 'POST') {
          readBodyJson(req)
            .then((body) => {
              const record = body as { id?: unknown; name?: unknown; kind?: unknown }
              const kind = writeMatch[1]
              if (typeof record.id !== 'string' || typeof record.name !== 'string') {
                throw new Error('workspace record requires string id and name')
              }
              if ((kind === 'patterns' && record.kind !== 'pattern') || (kind === 'maps' && record.kind !== 'map')) {
                throw new Error(`workspace record kind does not match ${kind}`)
              }
              const dir = workspaceDir(root, kind)!
              fs.mkdirSync(dir, { recursive: true })
              const prior = findWorkspaceFileById(dir, record.id)
              const next = path.join(dir, workspaceFileName({ id: record.id, name: record.name }, dir))
              if (prior && prior !== next) fs.unlinkSync(prior)
              fs.writeFileSync(next, JSON.stringify(body, null, 2) + '\n')
              res.statusCode = 200
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: true }))
            })
            .catch((err) => {
              res.statusCode = 400
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: String(err) }))
            })
          return
        }
        const deleteMatch = /^\/__personal-content\/(patterns|maps)\/([^/]+)$/.exec(pathname)
        if (deleteMatch && req.method === 'DELETE') {
          try {
            const dir = workspaceDir(root, deleteMatch[1])!
            const id = decodeURIComponent(deleteMatch[2])
            const file = findWorkspaceFileById(dir, id)
            if (file) fs.unlinkSync(file)
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: true }))
          } catch (err) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: String(err) }))
          }
          return
        }
        return next()
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const gaMeasurementId = env.VITE_GA_MEASUREMENT_ID?.trim()

  return {
    base: BASE,
    plugins: [
      googleAnalyticsSnippet(gaMeasurementId),
      redirectBaseTrailingSlash(),
      captureSink(),
      personalContentWorkspace(),
      react(),
      tailwindcss(),
    ],
    server: {
      port: 5174,
      strictPort: true,
      allowedHosts: true,
      watch: {
        ignored: ['**/personal/**'],
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
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./src/test/setup.ts'],
      // Playwright E2E specs live in e2e/ and are run by Playwright, not Vitest.
      exclude: ['e2e/**', 'node_modules/**'],
    },
  }
})
