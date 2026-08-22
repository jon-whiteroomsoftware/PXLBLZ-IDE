// Builds Gallery keyframe artifacts for the public stock catalogue (#888).
// Runs headless (no DOM); `scripts/gallery-keyframes.ts` writes the results.
import { GALLERY_PATTERNS } from './galleryCatalog'
import { prepareFastReplay } from './fastReplay'
import { buildGalleryKeyframe, type GalleryKeyframeArtifact, type KeyframeSelectionOptions } from './galleryKeyframes'
import { resolveGalleryThumbnailLayout } from './galleryThumbnailLayout'
import { LIBRARIES } from '@/pixelblaze/libs'
import { GALLERY_KEYFRAME_OVERRIDES } from '@/pixelblaze/stock/keyframeOverrides'

export interface GalleryKeyframeBatchEntry {
  name: string
  artifact?: GalleryKeyframeArtifact
  error?: string
  elapsedMs: number
}

export interface GalleryKeyframeBatchOptions {
  /** Restrict to these Pattern names (default: every public Gallery Pattern). */
  names?: string[]
  selection?: Partial<KeyframeSelectionOptions>
  log?: (line: string) => void
}

export function buildGalleryKeyframeBatch(options: GalleryKeyframeBatchOptions = {}): GalleryKeyframeBatchEntry[] {
  const wanted = options.names ? new Set(options.names) : null
  const entries: GalleryKeyframeBatchEntry[] = []
  for (const pattern of GALLERY_PATTERNS) {
    if (wanted && !wanted.has(pattern.name)) continue
    const started = performance.now()
    try {
      const prepared = prepareFastReplay(pattern.src, LIBRARIES)
      const { layout } = resolveGalleryThumbnailLayout(pattern.name, prepared)
      const artifact = buildGalleryKeyframe({
        name: pattern.name,
        prepared,
        mapPoints: layout.mapPoints,
        selection: options.selection,
        posterTimeMs: GALLERY_KEYFRAME_OVERRIDES[pattern.name],
      })
      const elapsedMs = performance.now() - started
      entries.push({ name: pattern.name, artifact, elapsedMs })
      options.log?.(`${pattern.name}: t=${artifact.posterTimeMs}ms score=${artifact.score.toFixed(3)} px=${artifact.pixelCount} (${elapsedMs.toFixed(0)}ms)`)
    } catch (error) {
      const elapsedMs = performance.now() - started
      const message = error instanceof Error ? error.message : String(error)
      entries.push({ name: pattern.name, error: message, elapsedMs })
      options.log?.(`${pattern.name}: FAILED ${message}`)
    }
  }
  return entries
}
