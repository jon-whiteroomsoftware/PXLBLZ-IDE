import { emitShowRenderTargetArenaSource } from '../../src/engine/showRenderTargetArena'
import { createFastReplayRuntime, prepareFastReplay } from '../../src/engine/fastReplay'

export const ISSUE537_PIXEL_COUNTS = [256, 1_000, 2_000] as const

export interface Issue537DiagnosticSources {
  live: string
  trails: string
  retention: number
  arenaWords: number
}

export function buildIssue537DiagnosticSources(
  pixelCount: number,
  retention = 0.9375,
  resetEveryFrames = 0,
): Issue537DiagnosticSources {
  const count = Number.isFinite(pixelCount) ? Math.max(1, Math.floor(pixelCount)) : 1
  const normalizedRetention = Number.isFinite(retention)
    ? Math.max(0, Math.min(1, retention))
    : 0.9375
  const normalizedResetFrames = Number.isFinite(resetEveryFrames)
    ? Math.max(0, Math.floor(resetEveryFrames))
    : 0
  const common = `${emitShowRenderTargetArenaSource(count)}
var __pxlblz_issue537_frame = 0
var __pxlblz_issue537_ready = 0

export function beforeRender(delta) {
  __pxlblz_issue537_frame = __pxlblz_issue537_frame + 1
  ${normalizedResetFrames > 0
    ? `if (__pxlblz_issue537_frame > 1 && (__pxlblz_issue537_frame - 1) % ${normalizedResetFrames} == 0) __pxlblz_issue537_ready = 0`
    : ''}
}

function __pxlblz_issue537_live(index) {
  var lit = index == __pxlblz_issue537_frame % pixelCount ? 1 : 0
  return lit
}`
  const live = `${common}

export function render(index) {
  var r = __pxlblz_issue537_live(index)
  rgb(r, r * 0.35, r * 0.08)
}`
  const trails = `${common}

export function render(index) {
  var r = __pxlblz_issue537_live(index)
  var g = r * 0.35
  var b = r * 0.08
  if (__pxlblz_issue537_ready) {
    r = max(r, __pxlblz_show_rt_plane_0[index] * ${normalizedRetention})
    g = max(g, __pxlblz_show_rt_plane_1[index] * ${normalizedRetention})
    b = max(b, __pxlblz_show_rt_plane_2[index] * ${normalizedRetention})
  }
  __pxlblz_show_rt_plane_0[index] = r
  __pxlblz_show_rt_plane_1[index] = g
  __pxlblz_show_rt_plane_2[index] = b
  if (index == pixelCount - 1) __pxlblz_issue537_ready = 1
  rgb(r, g, b)
}`
  return {
    live,
    trails,
    retention: normalizedRetention,
    arenaWords: 3 * (count + 4),
  }
}

export function measureIssue537SeekCost(options: {
  pixelCount?: number
  durationsMs?: number[]
  stepMs?: number
} = {}) {
  const pixelCount = options.pixelCount ?? 256
  const durationsMs = options.durationsMs ?? [30_000, 300_000]
  const stepMs = options.stepMs ?? (1_000 / 60)
  const sources = buildIssue537DiagnosticSources(pixelCount)
  const mapPoints = Array.from({ length: pixelCount }, (_, index) => [
    index / Math.max(1, pixelCount - 1),
  ])
  return (['fast', 'fidelity'] as const).flatMap((fidelity) => (
    (['live', 'trails'] as const).flatMap((variant) => (
      durationsMs.map((durationMs) => {
        const replay = createFastReplayRuntime(prepareFastReplay(sources[variant], {}), {
          mapPoints,
          randomSeed: 537,
          fidelity,
        })
        const startedMs = performance.now()
        const result = replay.advanceTo(durationMs, { stepMs })
        const wallMs = performance.now() - startedMs
        return {
          fidelity,
          variant,
          pixelCount,
          durationMs,
          stepMs,
          simulatedFrames: result.simulatedFrames,
          wallMs,
          realtimeMultiple: durationMs / wallMs,
          checksum: result.checksum,
        }
      })
    ))
  ))
}

if (process.env.ISSUE537_REPORT || !process.env.VITEST) {
  const reportSeekPixelCount = Number(process.env.ISSUE537_SEEK_PIXELS ?? 256)
  console.log(JSON.stringify({
    artifacts: ISSUE537_PIXEL_COUNTS.map((pixelCount) => {
      const diagnostic = buildIssue537DiagnosticSources(pixelCount)
      return {
        pixelCount,
        retention: diagnostic.retention,
        arenaWords: diagnostic.arenaWords,
        liveSourceBytes: new TextEncoder().encode(diagnostic.live).length,
        trailsSourceBytes: new TextEncoder().encode(diagnostic.trails).length,
      }
    }),
    seek: measureIssue537SeekCost({ pixelCount: reportSeekPixelCount }),
  }, null, 2))
}
