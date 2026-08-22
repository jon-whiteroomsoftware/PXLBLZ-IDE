// Gallery keyframes (#888). A keyframe is a stored fast-replay snapshot of a
// stock Pattern at a representative moment. The Gallery restores it so a card's
// first frame is lit and characteristic, and live playback continues from that
// exact state with no hover-time work. Pure: no DOM, no filesystem.
//
// Artifacts are keyed by the compiled code, the thumbnail map, the seed, and
// the format version. A stale key degrades to the runtime poster path.

import {
  createFastReplayRuntime,
  decodeFastReplaySnapshot,
  encodeFastReplaySnapshot,
  type FastReplayRuntime,
  type FastReplaySnapshot,
  type FastReplaySnapshotJson,
  type PreparedFastReplay,
} from './fastReplay'
import type { MapPoint } from './maps/types'

export const GALLERY_KEYFRAME_FORMAT_VERSION = 1
export const GALLERY_KEYFRAME_RANDOM_SEED = 0x50584c42 // 'PXLB'
export const GALLERY_KEYFRAME_STEP_MS = 1000 / 60

export interface GalleryKeyframeArtifact {
  version: number
  name: string
  key: string
  randomSeed: number
  pixelCount: number
  posterTimeMs: number
  score: number
  snapshot: FastReplaySnapshotJson
}

export interface GalleryKeyframeKeyParts {
  code: string
  mapPoints: readonly MapPoint[]
  randomSeed: number
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

/** Identity of the runtime a keyframe was captured in. */
export function galleryKeyframeKey(parts: GalleryKeyframeKeyParts): string {
  const points = parts.mapPoints
    .map((point) => point.sample.map((value) => Math.round(value * 1e4) / 1e4).join(','))
    .join(';')
  return fnv1a(`${GALLERY_KEYFRAME_FORMAT_VERSION}\0${parts.randomSeed}\0${points}\0${parts.code}`)
}

export function galleryKeyframeMatches(artifact: GalleryKeyframeArtifact | null | undefined, key: string): artifact is GalleryKeyframeArtifact {
  return Boolean(artifact) && artifact!.version === GALLERY_KEYFRAME_FORMAT_VERSION && artifact!.key === key
}

/**
 * How representative a frame is as a still: lit coverage times spatial
 * contrast. All-dark scores 0; a flat wash scores low; a lit frame with
 * structure scores highest.
 */
export function scoreKeyframe(frame: ArrayLike<number>): number {
  const pixelCount = Math.floor(frame.length / 3)
  if (pixelCount === 0) return 0
  let lit = 0
  let sum = 0
  let sumSquares = 0
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 3
    // Patterns may emit values outside [0,1]; the renderer clamps, so score
    // what is displayed.
    const r = Math.min(1, Math.max(0, frame[offset]))
    const g = Math.min(1, Math.max(0, frame[offset + 1]))
    const b = Math.min(1, Math.max(0, frame[offset + 2]))
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if (luminance > 0.05) lit += 1
    sum += luminance
    sumSquares += luminance * luminance
  }
  const mean = sum / pixelCount
  const variance = Math.max(0, sumSquares / pixelCount - mean * mean)
  const contrast = Math.sqrt(variance)
  const litFraction = lit / pixelCount
  return Math.sqrt(litFraction) * (0.1 + 2 * contrast)
}

export interface KeyframeSelectionOptions {
  startMs: number
  endMs: number
  sampleMs: number
  stepMs?: number
}

export interface KeyframeSelection {
  posterTimeMs: number
  score: number
  samples: { timeMs: number; score: number }[]
}

/** Advances the runtime through the window, scoring one frame per sample. */
export function selectGalleryKeyframe(
  runtime: Pick<FastReplayRuntime, 'advanceTo'>,
  options: KeyframeSelectionOptions,
): KeyframeSelection {
  const stepMs = options.stepMs ?? GALLERY_KEYFRAME_STEP_MS
  const samples: { timeMs: number; score: number }[] = []
  let best = { timeMs: options.startMs, score: -1 }
  for (let timeMs = options.startMs; timeMs <= options.endMs + 1e-6; timeMs += options.sampleMs) {
    const result = runtime.advanceTo(timeMs, { stepMs })
    const score = scoreKeyframe(result.frame)
    samples.push({ timeMs, score })
    if (score > best.score) best = { timeMs, score }
  }
  return { posterTimeMs: best.timeMs, score: best.score, samples }
}

export interface BuildGalleryKeyframeOptions {
  name: string
  prepared: PreparedFastReplay
  mapPoints: MapPoint[]
  randomSeed?: number
  selection?: Partial<KeyframeSelectionOptions>
  /** Pin the poster time instead of scoring for it. */
  posterTimeMs?: number
}

export const DEFAULT_KEYFRAME_SELECTION: KeyframeSelectionOptions = {
  startMs: 500,
  endMs: 6000,
  sampleMs: 250,
}

/** Scores a window, then captures the snapshot at the chosen time in a fresh
 * runtime so the stored state is exactly reproducible from time zero. */
export function buildGalleryKeyframe(options: BuildGalleryKeyframeOptions): GalleryKeyframeArtifact {
  const randomSeed = options.randomSeed ?? GALLERY_KEYFRAME_RANDOM_SEED
  const runtimeOptions = { mapPoints: options.mapPoints, randomSeed, fidelity: 'fast' as const }
  const selection = { ...DEFAULT_KEYFRAME_SELECTION, ...options.selection }
  let posterTimeMs = options.posterTimeMs
  let score: number
  if (posterTimeMs === undefined) {
    const chosen = selectGalleryKeyframe(createFastReplayRuntime(options.prepared, runtimeOptions), selection)
    posterTimeMs = chosen.posterTimeMs
    score = chosen.score
  } else {
    score = NaN
  }
  const runtime = createFastReplayRuntime(options.prepared, runtimeOptions)
  const result = runtime.advanceTo(posterTimeMs, { stepMs: selection.stepMs ?? GALLERY_KEYFRAME_STEP_MS })
  if (Number.isNaN(score)) score = scoreKeyframe(result.frame)
  return {
    version: GALLERY_KEYFRAME_FORMAT_VERSION,
    name: options.name,
    key: galleryKeyframeKey({ code: options.prepared.code, mapPoints: options.mapPoints, randomSeed }),
    randomSeed,
    pixelCount: options.mapPoints.length,
    posterTimeMs,
    score,
    snapshot: encodeFastReplaySnapshot(runtime.snapshot()),
  }
}

/**
 * Restore a keyframe into a runtime built for the same key. The runtime is
 * ticked once first: Pattern globals assigned implicitly inside beforeRender
 * do not exist until the Pattern has run, and restore refuses unknown names.
 */
export function restoreGalleryKeyframe(
  runtime: Pick<FastReplayRuntime, 'renderCurrentFrame' | 'restore'>,
  artifact: GalleryKeyframeArtifact,
): FastReplaySnapshot {
  runtime.renderCurrentFrame()
  const snapshot = decodeFastReplaySnapshot(artifact.snapshot)
  runtime.restore(snapshot)
  // Returned so callers can present the snapshot's own frame without ticking.
  return snapshot
}
