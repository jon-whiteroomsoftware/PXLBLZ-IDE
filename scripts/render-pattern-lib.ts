// Pure helpers for the headless pattern video renderer (#576). The Playwright
// driver (render-pattern.ts) owns all I/O; everything here is table-testable.
import type { SlowMoSettings } from '../src/engine/slowMo'

export interface RenderConfig {
  /** Demo to mount; with --file it only supplies the map/preview config. */
  demo: string | null
  file: string | null
  seconds: number
  fps: number
  /** Headless viewport width in CSS px — the canvas resolution tracks it. */
  width: number
  /** Output mp4 path; null derives /tmp/pxlblz-renders/<name>.mp4. */
  out: string | null
  keepFrames: boolean
  baseUrl: string
  /** Slug naming the frame prefix and default output file. */
  name: string
  /** Preview diffusion override (0..1); null keeps the pattern's own setting. */
  diffusion: number | null
  /** Preview light-size override (0.15..0.95); null keeps the pattern's own setting. */
  lightSize: number | null
  /** Pattern arithmetic override; null keeps the stored preview mode. */
  fidelity: 'fast' | 'precise' | null
  slowMo: SlowMoSettings | null
  /** Show id to record from its stage preview (#879); exclusive with demo/file. */
  show: string | null
  /** Virtual time of the first frame, in seconds; reached by a headless pre-roll. */
  startSeconds: number
}

/** The Show workspace hides its stage-preview pane at or below this viewport
 * width (App.tsx `narrowShowWorkspace`), so a Show render must be wider. */
export const SHOW_STAGE_MIN_WIDTH_PX = 981

const DEFAULTS = {
  seconds: 10,
  fps: 60,
  width: 2000,
  baseUrl: 'http://localhost:5174/PXLBLZ-IDE/',
}

export function renderSlug(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function positiveNumber(flag: string, raw: string | undefined): number {
  const value = Number(raw)
  if (raw === undefined || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} requires a positive number, got "${raw}".`)
  }
  return value
}

function nonNegativeNumber(flag: string, raw: string | undefined): number {
  const value = Number(raw)
  if (raw === undefined || raw.trim() === '' || !Number.isFinite(value) || value < 0) {
    throw new Error(`${flag} requires a non-negative number, got "${raw}".`)
  }
  return value
}

function parseSlowMo(raw: string): SlowMoSettings {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { throw new Error('--slowmo requires a SlowMoSettings JSON object.') }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('--slowmo requires a SlowMoSettings JSON object.')
  }
  const { rate, stepMs, inBetween, stagger, persistence } = parsed as Record<string, unknown>
  if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0 || rate > 1) {
    throw new Error('--slowmo rate must be finite and in (0, 1].')
  }
  if (typeof stepMs !== 'number' || !Number.isFinite(stepMs) || stepMs <= 0 || stepMs > 32767) {
    throw new Error('--slowmo stepMs must be finite and in (0, 32767].')
  }
  if (inBetween !== 'clock' && inBetween !== 'hold' && inBetween !== 'blend' && inBetween !== 'eased') {
    throw new Error('--slowmo inBetween must be clock, hold, blend, or eased.')
  }
  const offset = stagger as Record<string, unknown> | null
  if (typeof offset !== 'object' || offset === null || Array.isArray(offset) ||
    (offset.shape !== 'sweep' && offset.shape !== 'radial' && offset.shape !== 'scatter') || offset.width !== 0) {
    throw new Error('--slowmo stagger must have shape sweep, radial, or scatter and width 0 in slice A.')
  }
  if (persistence !== null) throw new Error('--slowmo persistence must be null in slice A.')
  return { rate, stepMs, inBetween, stagger: { shape: offset.shape, width: 0 }, persistence: null }
}

export function parseRenderArgs(argv: string[]): RenderConfig {
  let demo: string | null = null
  let file: string | null = null
  let seconds = DEFAULTS.seconds
  let fps = DEFAULTS.fps
  let width = DEFAULTS.width
  let out: string | null = null
  let keepFrames = false
  let baseUrl = DEFAULTS.baseUrl
  let name: string | null = null
  let diffusion: number | null = null
  let lightSize: number | null = null
  let fidelity: RenderConfig['fidelity'] = null
  let slowMo: SlowMoSettings | null = null
  let show: string | null = null
  let startSeconds = 0

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = () => {
      const v = argv[i + 1]
      if (v === undefined) throw new Error(`${flag} requires a value.`)
      i += 1
      return v
    }
    switch (flag) {
      case '--demo': demo = value(); break
      case '--file': file = value(); break
      case '--show': show = value(); break
      case '--slowmo': slowMo = parseSlowMo(value()); break
      case '--start': startSeconds = nonNegativeNumber(flag, value()); break
      case '--seconds': seconds = positiveNumber(flag, value()); break
      case '--fps': fps = positiveNumber(flag, value()); break
      case '--width': width = Math.round(positiveNumber(flag, value())); break
      case '--out': out = value(); break
      case '--name': name = value(); break
      case '--base-url': baseUrl = value(); break
      case '--fidelity': {
        const v = value()
        if (v !== 'fast' && v !== 'precise') {
          throw new Error('--fidelity requires fast or precise.')
        }
        fidelity = v
        break
      }
      case '--diffusion': {
        const v = Number(value())
        if (!Number.isFinite(v) || v < 0 || v > 1) {
          throw new Error(`--diffusion requires a number in 0..1, got "${argv[i]}".`)
        }
        diffusion = v
        break
      }
      case '--light-size': {
        const v = Number(value())
        if (!Number.isFinite(v) || v < 0.15 || v > 0.95) {
          throw new Error(`--light-size requires a number in 0.15..0.95, got "${argv[i]}".`)
        }
        lightSize = v
        break
      }
      case '--keep-frames': keepFrames = true; break
      default: throw new Error(`Unknown flag ${flag}.`)
    }
  }

  if (show !== null && (demo !== null || file !== null)) {
    throw new Error('--show records a Show from its stage preview and cannot be combined with --demo or --file.')
  }
  if (show !== null && slowMo !== null) {
    throw new Error('--slowmo is supported for Pattern renders only.')
  }
  if (show !== null && fidelity !== null) {
    throw new Error('--fidelity is supported for Pattern renders only.')
  }
  if (show === null && demo === null && file === null) {
    throw new Error('Pass --show <ShowId>, --demo <DemoName>, --file <pattern.js>, or --file with --demo (--demo names the mount point for the file).')
  }
  if (show !== null && width < SHOW_STAGE_MIN_WIDTH_PX) {
    throw new Error(`--width must be at least ${SHOW_STAGE_MIN_WIDTH_PX} for a Show render; narrower workspaces hide the stage preview.`)
  }
  const baseName = name ?? (show ? showBasename(show) : file ? fileBasename(file) : demo!)
  const slug = renderSlug(baseName)
  if (!slug) throw new Error(`Cannot derive a usable name from "${baseName}"; pass --name.`)
  return { demo, file, seconds, fps, width, out, keepFrames, baseUrl, name: slug, diffusion, lightSize, fidelity, slowMo, show, startSeconds }
}

function showBasename(showId: string): string {
  return showId.replace(/^stock-show-/, '')
}

function fileBasename(path: string): string {
  const base = path.split('/').pop() ?? path
  return base.replace(/\.[^.]*$/, '')
}

/** ffmpeg argv for assembling the saved frames into a constant-frame-rate,
 * high-bitrate H.264 mp4 (CRF 12) that survives YouTube's re-encode well. */
export function ffmpegArgs(opts: { fps: number; framePattern: string; outFile: string }): string[] {
  return [
    '-y',
    '-framerate', String(opts.fps),
    '-i', opts.framePattern,
    // libx264 + yuv420p requires even dimensions; the canvas can be odd.
    '-vf', 'pad=ceil(iw/2)*2:ceil(ih/2)*2',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-crf', '12',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    opts.outFile,
  ]
}
