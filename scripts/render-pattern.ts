// Headless pattern video renderer (#576): drives the dev server's `?capture`
// preview through Playwright, steps the render loop deterministically one
// frame per 1000/fps virtual ms (window.__pxlblz.captureSequence), and
// assembles the saved PNG frames into an mp4 when ffmpeg is available.
//
//   npm run render -- --demo PlasmaNebula --seconds 10
//   npm run render -- --file path/to/pattern.js --seconds 5 --fps 30
//   npm run render -- --file aurora-calm.js --demo AuroraSphere
//   npm run render -- --show stock-show-showcase-distortion-effects --start 7 --seconds 2.5
//
// With --file, --demo names the mount point whose map/preview config is used
// (default PlasmaNebula); loadSource then swaps in the file's source.
//
// --show records a Show from its stage preview (#879): the Show editor route
// under ?capture exposes window.__pxlblzShow, which rebuilds the fast-replay
// runtime at t=0, pre-rolls headless to --start, and steps frames exactly as
// the Pattern path does. --start applies to every mode.
//
// Requires the persistent reviewed-main Vite server (npm run dev:main) — the frames are
// written by its /__capture sink to /tmp/pxlblz-captures. Output resolution
// tracks --width (canvas width is container CSS width; no DPR scaling).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'
import { chromium, type Cookie } from '@playwright/test'
import { parseRenderArgs, ffmpegArgs, type RenderConfig } from './render-pattern-lib'

const CAPTURES_DIR = '/tmp/pxlblz-captures'
const RENDERS_DIR = '/tmp/pxlblz-renders'
// Default mount point when --file is passed without --demo; loadSource
// replaces the previewed source without touching pattern records. Pass --demo
// alongside --file to mount a demo whose map matches the file (e.g. a sphere).
const FILE_MODE_BOOTSTRAP_DEMO = 'PlasmaNebula'

interface CaptureSequenceCall {
  frames: number
  fps: number
  prefix: string
  startMs: number
  onProgress?(saved: number, total: number): void
}
type CaptureSequenceOutcome = { frames: number; failures: { name: string; error: string }[] }

interface PxlblzCaptureApi {
  setPreview(patch: Record<string, unknown>): void
  loadSource(code: string): void
  getPreviewSource(): string
  captureSequence(opts: CaptureSequenceCall): Promise<CaptureSequenceOutcome>
}

interface PxlblzShowCaptureApi {
  showId: string
  loopDurationMs(): number
  setPreview(patch: Record<string, unknown>): void
  captureSequence(opts: CaptureSequenceCall): Promise<CaptureSequenceOutcome>
}

const HIDE_IDE_CHROME_CSS = `
  [data-testid="top-bar"], [data-testid="left-pane"], [data-testid="editor-pane"] { display: none !important; }
  [data-testid="preview-pane"] { display: flex !important; width: 100vw !important; min-width: 0 !important; }
`

function fail(message: string): never {
  console.error(`render-pattern: ${message}`)
  process.exit(1)
}

function pngDimensions(file: string): { width: number; height: number } {
  const header = Buffer.alloc(24)
  const fd = fs.openSync(file, 'r')
  fs.readSync(fd, header, 0, 24, 0)
  fs.closeSync(fd)
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) }
}

function clearStaleFrames(prefix: string): void {
  if (!fs.existsSync(CAPTURES_DIR)) return
  for (const entry of fs.readdirSync(CAPTURES_DIR)) {
    if (entry.startsWith(`${prefix}-`) && entry.endsWith('.png')) {
      fs.unlinkSync(path.join(CAPTURES_DIR, entry))
    }
  }
}

async function assertServerReachable(baseUrl: string): Promise<void> {
  try {
    const response = await fetch(baseUrl, { signal: AbortSignal.timeout(3000) })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
  } catch (error) {
    fail(
      `dev server unreachable at ${baseUrl} (${String(error)}). ` +
      'Start it with `npm run dev:main` (port 5174) or pass --base-url.',
    )
  }
}

// The Show workspace is a signed-in Studio surface (Patterns are public), so
// Show mode signs the headless page in as the synthetic local developer
// identity via the repo's own local-session helper (npm run dev:session).
function localDeveloperSessionCookie(baseUrl: string): Cookie {
  const scriptsDir = fileURLToPath(new URL('.', import.meta.url))
  const result = spawnSync(process.execPath, [
    path.join(scriptsDir, '..', 'node_modules', '.bin', 'tsx'),
    path.join(scriptsDir, 'local-session-cookie.ts'),
    '--developer', '--json',
  ], { encoding: 'utf8' })
  if (result.status !== 0) {
    fail(`could not mint a local Studio session for the Show route:\n${(result.stderr || result.stdout).trim()}\n` +
      'Show mode needs the shared main .dev.vars SESSION_SECRET (see docs/agents/dev-runtime.md).')
  }
  const { cookie } = JSON.parse(result.stdout) as {
    cookie: { name: string; value: string; domain: string; path: string; httpOnly: boolean; secure: boolean; sameSite: 'Lax' }
  }
  return {
    name: cookie.name,
    value: cookie.value,
    domain: new URL(baseUrl).hostname,
    path: cookie.path,
    expires: -1,
    httpOnly: cookie.httpOnly,
    secure: cookie.secure,
    sameSite: cookie.sameSite,
  }
}

async function renderFrames(config: RenderConfig): Promise<number> {
  const frames = Math.round(config.seconds * config.fps)
  const demo = config.demo ?? FILE_MODE_BOOTSTRAP_DEMO
  // Shows are a signed-in Studio surface behind the `showtime` access flag
  // (src/engine/featureAccess.ts); Patterns are public.
  const url = config.show
    ? `${config.baseUrl}studio/shows/${encodeURIComponent(config.show)}?capture&showtime`
    : `${config.baseUrl}studio/patterns/${encodeURIComponent(demo)}?capture`

  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: config.width, height: Math.max(800, config.width) },
    })
    if (config.show) await context.addCookies([localDeveloperSessionCookie(config.baseUrl)])
    const page = await context.newPage()
    page.on('pageerror', (error) => console.error(`page error: ${error.message}`))
    // tsx (esbuild keepNames) injects __name(...) helper calls into functions
    // serialized by page.evaluate; supply the helper in the page.
    await page.addInitScript('globalThis.__name = (target) => target;')
    // Vite full-reloads the page when any watched source file changes, and
    // this checkout is often edited (other agents) while a long render runs —
    // a reload mid-capture destroys the evaluate context. Leave the HMR
    // websocket unconnected so the page never hears about file changes.
    await page.routeWebSocket(/./, () => undefined)
    await page.goto(url, { waitUntil: 'domcontentloaded' })

    // Strip the IDE chrome so the preview pane (and its canvas, whose width
    // tracks the container) owns the whole viewport width.
    await page.addStyleTag({ content: HIDE_IDE_CHROME_CSS })

    // Awaited inside the try so the finally does not close the browser early.
    if (config.show) return await renderShowFrames(page, config, frames, url)

    await page.waitForFunction(
      () => Boolean((window as unknown as { __pxlblz?: unknown }).__pxlblz) &&
        Boolean(document.querySelector('[data-testid="preview-pane"] canvas')),
      undefined,
      { timeout: 30_000 },
    ).catch(() => fail(
      `preview did not come up for "${demo}" — check the demo name and that the route loaded (${url}).`,
    ))

    // Deterministic start: the demo auto-plays on load, so wall-clock rAF ticks
    // have already advanced the virtual clock by an arbitrary amount. Pause,
    // then toggle previewSource ('' → target) to rebuild the loop on a fresh
    // clock — every run's frame K then sits at exactly K * (1000/fps) virtual
    // ms from pattern t=0.
    const source = config.file
      ? fs.readFileSync(config.file, 'utf8')
      : await page.evaluate(() =>
        (window as unknown as { __pxlblz: PxlblzCaptureApi }).__pxlblz.getPreviewSource())
    await page.evaluate(({ code, diffusion, lightSize }) => {
      const api = (window as unknown as { __pxlblz: PxlblzCaptureApi }).__pxlblz
      api.setPreview({ isRunning: false })
      // Store overrides land before the rebuild below, which reads them when
      // wiring the fresh renderer.
      if (diffusion !== null) api.setPreview({ diffusion })
      if (lightSize !== null) api.setPreview({ lightSize })
      api.loadSource('')
      // Defer the reload a macrotask so React commits the teardown first.
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          api.loadSource(code)
          resolve()
        }, 50)
      })
    }, { code: source, diffusion: config.diffusion, lightSize: config.lightSize })
    // The preview loop rebuilds in a React effect; give it a beat, then make
    // sure no compile/runtime error is covering the canvas.
    await page.waitForTimeout(750)
    const overlayError = await page
      .locator('[data-testid="preview-pane"] .text-red-400')
      .first()
      .textContent()
      .catch(() => null)
    if (overlayError) fail(`pattern failed to load: ${overlayError.trim()}`)

    // The chrome-stripping CSS reaches the canvas via a ResizeObserver → React
    // state → loop-rebuild chain that can lag under load; gate on the canvas
    // actually reaching the requested width so no frame captures small.
    await page.waitForFunction(
      (expected) => {
        const canvas = document.querySelector('[data-testid="preview-pane"] canvas') as HTMLCanvasElement | null
        return Boolean(canvas && canvas.width >= expected - 4)
      },
      config.width,
      { timeout: 15_000 },
    ).catch(() => fail(
      `canvas never reached the requested ${config.width}px width — the IDE-chrome override did not apply.`,
    ))

    await exposeProgress(page)

    const result = await page.evaluate(async ({ frames, fps, prefix, startMs }) => {
      const api = (window as unknown as { __pxlblz: PxlblzCaptureApi }).__pxlblz
      const notify = (window as unknown as {
        __pxlblzRenderProgress(saved: number, total: number): void
      }).__pxlblzRenderProgress
      return api.captureSequence({
        frames,
        fps,
        prefix,
        startMs,
        onProgress: (saved, total) => notify(saved, total),
      })
    }, { frames, fps: config.fps, prefix: config.name, startMs: config.startSeconds * 1000 })

    assertNoSinkFailures(result)
    return frames
  } finally {
    await browser.close()
  }
}

function assertNoSinkFailures(result: CaptureSequenceOutcome): void {
  if (result.failures.length > 0) {
    fail(`capture sink reported ${result.failures.length} failed frame(s), first: ${result.failures[0].name}: ${result.failures[0].error}`)
  }
}

async function exposeProgress(page: import('@playwright/test').Page): Promise<void> {
  let lastLogged = 0
  await page.exposeFunction('__pxlblzRenderProgress', (saved: number, total: number) => {
    const now = Date.now()
    if (saved === total || now - lastLogged > 2000) {
      lastLogged = now
      console.log(`  frame ${saved}/${total}`)
    }
  })
}

// Show mode (#879): the stage preview owns its own fast-replay runtime and
// transport, so there is no source to swap in — the page's __pxlblzShow API
// rebuilds the runtime at t=0 and pre-rolls to --start itself.
async function renderShowFrames(
  page: import('@playwright/test').Page,
  config: RenderConfig,
  frames: number,
  url: string,
): Promise<number> {
  await page.waitForFunction(
    () => Boolean(window.__pxlblzShow) &&
      Boolean(document.querySelector('[data-testid="preview-pane"] canvas')),
    undefined,
    { timeout: 30_000 },
  ).catch((error: unknown) => fail(
    `stage preview did not come up for Show "${config.show}" — check the show id and that the route loaded (${url}). ${String(error)}`,
  ))
  if (config.diffusion !== null || config.lightSize !== null) {
    // The stage preview reads the same preview store as the Pattern preview.
    await page.evaluate(({ diffusion, lightSize }) => {
      window.__pxlblzShow!.setPreview({
        ...(diffusion !== null ? { diffusion } : {}),
        ...(lightSize !== null ? { lightSize } : {}),
      })
    }, { diffusion: config.diffusion, lightSize: config.lightSize })
  }
  // The stage sits inside the pane's own padding, so its canvas lands a few
  // px short of the viewport; gate with that slack rather than exactly.
  await page.waitForFunction(
    (expected) => {
      const canvas = document.querySelector('[data-testid="preview-pane"] canvas') as HTMLCanvasElement | null
      return Boolean(canvas && canvas.width >= expected - 24)
    },
    config.width,
    { timeout: 15_000 },
  ).catch(() => fail(
    `stage canvas never reached the requested ${config.width}px width — the IDE-chrome override did not apply.`,
  ))
  const loopMs = await page.evaluate(() => window.__pxlblzShow!.loopDurationMs())
  const startMs = config.startSeconds * 1000
  const endMs = startMs + config.seconds * 1000
  console.log(`show loop ${(loopMs / 1000).toFixed(1)}s; recording ${(startMs / 1000).toFixed(2)}s → ${(endMs / 1000).toFixed(2)}s`)
  if (loopMs > 0 && endMs > loopMs) {
    console.warn(`  note: the clip runs past the loop point at ${(loopMs / 1000).toFixed(1)}s (the runtime keeps advancing; it does not rewind).`)
  }

  await exposeProgress(page)
  const result = await page.evaluate(async ({ frames, fps, prefix, startMs }) => {
    const notify = (window as unknown as {
      __pxlblzRenderProgress(saved: number, total: number): void
    }).__pxlblzRenderProgress
    return window.__pxlblzShow!.captureSequence({
      frames,
      fps,
      prefix,
      startMs,
      onProgress: (saved, total) => notify(saved, total),
    })
  }, { frames, fps: config.fps, prefix: config.name, startMs })
  assertNoSinkFailures(result)
  return frames
}

declare global {
  interface Window {
    __pxlblz?: PxlblzCaptureApi
    __pxlblzShow?: PxlblzShowCaptureApi
  }
}

function assembleVideo(config: RenderConfig, frames: number): void {
  const framePattern = path.join(CAPTURES_DIR, `${config.name}-%05d.png`)
  const firstFrame = path.join(CAPTURES_DIR, `${config.name}-00000.png`)
  const saved = fs.readdirSync(CAPTURES_DIR)
    .filter((entry) => entry.startsWith(`${config.name}-`) && entry.endsWith('.png'))
  if (saved.length !== frames) {
    fail(`expected ${frames} frames in ${CAPTURES_DIR}, found ${saved.length}.`)
  }
  const { width, height } = pngDimensions(firstFrame)
  console.log(`${frames} frames saved (${width}x${height}) under ${CAPTURES_DIR}/${config.name}-*.png`)

  const outFile = config.out ?? path.join(RENDERS_DIR, `${config.name}.mp4`)
  const args = ffmpegArgs({ fps: config.fps, framePattern, outFile })
  const probe = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' })
  if (probe.error) {
    console.log('\nffmpeg not found — frames kept. Assemble with:')
    console.log(`  ffmpeg ${args.map((a) => (a.includes('(') || a.includes('%') ? `'${a}'` : a)).join(' ')}`)
    console.log('\nTip: install it with `brew install ffmpeg`.')
    return
  }
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  console.log(`assembling ${outFile} ...`)
  const encode = spawnSync('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] })
  if (encode.status !== 0) {
    fail(`ffmpeg failed (${encode.status}):\n${encode.stderr?.toString().slice(-2000)}`)
  }
  const bytes = fs.statSync(outFile).size
  console.log(`done: ${outFile} (${(bytes / 1024 / 1024).toFixed(1)} MB, ${config.seconds}s @ ${config.fps}fps)`)
  if (!config.keepFrames) {
    for (const entry of saved) fs.unlinkSync(path.join(CAPTURES_DIR, entry))
  }
}

async function main(): Promise<void> {
  let config: RenderConfig
  try {
    config = parseRenderArgs(process.argv.slice(2))
  } catch (error) {
    fail(String(error instanceof Error ? error.message : error) +
      '\nUsage: npm run render -- (--demo <DemoName> | --file <pattern.js> [--demo <MountDemo>] | --show <ShowId>) ' +
      '[--start SECONDS] [--seconds N] [--fps N] [--width PX] [--diffusion 0..1] [--light-size 0.15..0.95] [--out FILE.mp4] [--name SLUG] [--base-url URL] [--keep-frames]')
  }
  if (config.file && !fs.existsSync(config.file)) fail(`no such file: ${config.file}`)
  await assertServerReachable(config.baseUrl)
  clearStaleFrames(config.name)
  const target = config.show
    ? `show "${config.show}"`
    : config.file
      ? `file ${config.file} on demo "${config.demo ?? FILE_MODE_BOOTSTRAP_DEMO}"`
      : `demo "${config.demo}"`
  const from = config.startSeconds > 0 ? ` from ${config.startSeconds}s` : ''
  console.log(`rendering ${target}${from}: ${config.seconds}s @ ${config.fps}fps, width ${config.width}px`)
  const frames = await renderFrames(config)
  assembleVideo(config, frames)
}

void main()
