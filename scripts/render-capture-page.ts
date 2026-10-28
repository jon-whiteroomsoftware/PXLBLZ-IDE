import type { Page } from '@playwright/test'
import type { SlowMoSettings } from '../src/engine/slowMo'

export interface CaptureSequenceCall {
  frames: number
  fps: number
  prefix: string
  startMs: number
  onProgress?(saved: number, total: number): void
}
export type CaptureSequenceOutcome = { frames: number; failures: { name: string; error: string }[] }

export interface PxlblzCaptureApi {
  setPreview(patch: Record<string, unknown>): void
  loadSource(code: string): void
  getPreviewSource(): string
  captureSequence(opts: CaptureSequenceCall): Promise<CaptureSequenceOutcome>
}

export interface PxlblzShowCaptureApi {
  showId: string
  loopDurationMs(): number
  setPreview(patch: Record<string, unknown>): void
  captureSequence(opts: CaptureSequenceCall): Promise<CaptureSequenceOutcome>
}

export const HIDE_IDE_CHROME_CSS = `
  [data-testid="top-bar"], [data-testid="left-pane"], [data-testid="editor-pane"] { display: none !important; }
  [data-testid="preview-pane"] { display: flex !important; width: 100vw !important; min-width: 0 !important; }
`

// The Show route has no preview pane (#967): the Stage is a strip under the
// timeline inside editor-pane, its canvas frame beside a controls rail. Lift
// the strip over the viewport, drop the rail, and let the frame's own
// aspect-ratio style set its height from the full viewport width, so the
// canvas fits by width rather than by the strip's height (#1142).
export const SHOW_STAGE_CANVAS = '[data-testid="show-stage-canvas-frame"] canvas'
export const HIDE_SHOW_CHROME_CSS = `
  [data-testid="top-bar"], [data-testid="left-pane"], [data-testid="show-timeline-pane"],
  [data-testid="agent-chat-panel"] { display: none !important; }
  [data-testid="show-stage-strip"] {
    position: fixed !important; inset: 0 !important; z-index: 2147483647 !important;
    width: 100vw !important; height: 100vh !important;
  }
  [data-testid="show-stage-preview"] > :not([data-testid="show-stage-canvas-frame"]) { display: none !important; }
  [data-testid="show-stage-canvas-frame"] {
    align-self: flex-start !important; width: 100vw !important; max-width: none !important;
    height: auto !important; border: 0 !important;
  }
`

export const PREVIEW_CANVAS = '[data-testid="preview-pane"] canvas'

export interface PatternCaptureSetup {
  slowMo?: SlowMoSettings
  width: number
  /** Source to rebuild on a fresh clock; undefined reuses the route's own preview source (getPreviewSource). */
  source?: string
  diffusion: number | null
  lightSize: number | null
  /** Preview fidelity pinned before the rebuild; undefined leaves the store value. */
  fidelity?: 'fast' | 'fidelity'
}

export async function preparePatternCapture(page: Page, setup: PatternCaptureSetup, label: string): Promise<void> {
  await page.addStyleTag({ content: HIDE_IDE_CHROME_CSS })
  await page.waitForFunction(
    (selector) => Boolean((window as unknown as { __pxlblz?: unknown }).__pxlblz) &&
      Boolean(document.querySelector(selector)),
    PREVIEW_CANVAS,
    { timeout: 30_000 },
  ).catch(() => { throw new Error(
    `preview did not come up for ${label} — check the demo name and that the route loaded (${page.url()}).`,
  ) })

  // Deterministic start: the demo auto-plays on load, so wall-clock rAF ticks
  // have already advanced the virtual clock by an arbitrary amount. Pause,
  // then toggle previewSource ('' → target) to rebuild the loop on a fresh
  // clock — every run's frame K then sits at exactly K * (1000/fps) virtual
  // ms from pattern t=0.
  const source = setup.source ?? await page.evaluate(() =>
    (window as unknown as { __pxlblz: PxlblzCaptureApi }).__pxlblz.getPreviewSource())
  await page.evaluate(({ code, diffusion, lightSize, fidelity, slowMo }) => {
    const api = (window as unknown as { __pxlblz: PxlblzCaptureApi }).__pxlblz
    api.setPreview({ isRunning: false })
    // Store overrides land before the rebuild below, which reads them when
    // wiring the fresh renderer.
    if (diffusion !== null) api.setPreview({ diffusion })
    if (lightSize !== null) api.setPreview({ lightSize })
    if (fidelity !== undefined) api.setPreview({ fidelity })
    if (slowMo !== undefined) api.setPreview({ slowMo })
    api.loadSource('')
    // Defer the reload a macrotask so React commits the teardown first.
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        api.loadSource(code)
        resolve()
      }, 50)
    })
  }, { code: source, diffusion: setup.diffusion, lightSize: setup.lightSize, fidelity: setup.fidelity, slowMo: setup.slowMo })
  // The preview loop rebuilds in a React effect; give it a beat, then make
  // sure no compile/runtime error is covering the canvas.
  await page.waitForTimeout(750)
  // count() never waits; textContent() would wait for an absent overlay until
  // the caller's timeout (forever under the test runner's actionTimeout 0).
  const overlay = page.locator('[data-testid="preview-pane"] .text-red-400').first()
  const overlayError = await overlay.count() > 0 ? await overlay.textContent() : null
  if (overlayError) throw new Error(`pattern failed to load: ${overlayError.trim()}`)

  // The chrome-stripping CSS reaches the canvas via a ResizeObserver → React
  // state → loop-rebuild chain that can lag under load; gate on the canvas
  // actually reaching the requested width so no frame captures small.
  await page.waitForFunction(
    ({ selector, expected }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null
      return Boolean(canvas && canvas.width >= expected - 4)
    },
    { selector: PREVIEW_CANVAS, expected: setup.width },
    { timeout: 15_000 },
  ).catch(() => { throw new Error(
    `canvas never reached the requested ${setup.width}px width — the IDE-chrome override did not apply.`,
  ) })
}

export interface ShowCaptureSetup {
  width: number
  diffusion: number | null
  lightSize: number | null
  fidelity?: 'fast' | 'fidelity'
}

/** Resolves with the Show's loopDurationMs(). */
export async function prepareShowCapture(page: Page, setup: ShowCaptureSetup, label: string): Promise<{ loopMs: number }> {
  await page.addStyleTag({ content: HIDE_SHOW_CHROME_CSS })
  await page.waitForFunction(
    (selector) => Boolean(window.__pxlblzShow) && Boolean(document.querySelector(selector)),
    SHOW_STAGE_CANVAS,
    { timeout: 30_000 },
  ).catch((error: unknown) => { throw new Error(
    `stage preview did not come up for ${label} — check the show id and that the route loaded (${page.url()}). ${String(error)}`,
  ) })
  if (setup.diffusion !== null || setup.lightSize !== null || setup.fidelity !== undefined) {
    // The stage preview reads the same preview store as the Pattern preview.
    await page.evaluate(({ diffusion, lightSize, fidelity }) => {
      window.__pxlblzShow!.setPreview({
        ...(diffusion !== null ? { diffusion } : {}),
        ...(lightSize !== null ? { lightSize } : {}),
        ...(fidelity !== undefined ? { fidelity } : {}),
      })
    }, { diffusion: setup.diffusion, lightSize: setup.lightSize, fidelity: setup.fidelity })
  }
  // With the frame lifted to the viewport the canvas fills --width to within
  // fit rounding (a 1:1 Stage measured 1200 and 1199 at 1200); the slack
  // absorbs that.
  await page.waitForFunction(
    ({ selector, expected }) => {
      const canvas = document.querySelector(selector) as HTMLCanvasElement | null
      return Boolean(canvas && canvas.width >= expected - 24)
    },
    { selector: SHOW_STAGE_CANVAS, expected: setup.width },
    { timeout: 15_000 },
  ).catch(() => { throw new Error(
    `stage canvas never reached the requested ${setup.width}px width — the IDE-chrome override did not apply.`,
  ) })
  const loopMs = await page.evaluate(() => window.__pxlblzShow!.loopDurationMs())
  return { loopMs }
}

declare global {
  interface Window {
    __pxlblz?: PxlblzCaptureApi
    __pxlblzShow?: PxlblzShowCaptureApi
  }
}
