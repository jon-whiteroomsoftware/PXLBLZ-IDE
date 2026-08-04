// Pure helpers for the headless pattern video renderer (#576). The Playwright
// driver (render-pattern.ts) owns all I/O; everything here is table-testable.

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
}

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
      case '--seconds': seconds = positiveNumber(flag, value()); break
      case '--fps': fps = positiveNumber(flag, value()); break
      case '--width': width = Math.round(positiveNumber(flag, value())); break
      case '--out': out = value(); break
      case '--name': name = value(); break
      case '--base-url': baseUrl = value(); break
      case '--diffusion': {
        const v = Number(value())
        if (!Number.isFinite(v) || v < 0 || v > 1) {
          throw new Error(`--diffusion requires a number in 0..1, got "${argv[i]}".`)
        }
        diffusion = v
        break
      }
      case '--keep-frames': keepFrames = true; break
      default: throw new Error(`Unknown flag ${flag}.`)
    }
  }

  if (demo === null && file === null) {
    throw new Error('Pass --demo <DemoName>, --file <pattern.js>, or both (--demo names the mount point for the file).')
  }
  const baseName = name ?? (file ? fileBasename(file) : demo!)
  const slug = renderSlug(baseName)
  if (!slug) throw new Error(`Cannot derive a usable name from "${baseName}"; pass --name.`)
  return { demo, file, seconds, fps, width, out, keepFrames, baseUrl, name: slug, diffusion }
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
