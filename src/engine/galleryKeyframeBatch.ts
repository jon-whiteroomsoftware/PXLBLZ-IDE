// Builds Gallery keyframe artifacts for the public stock catalogue (#888).
// Runs headless (no DOM); `scripts/gallery-keyframes.ts` writes the results.
import { GALLERY_PATTERNS } from './galleryCatalog'
import { buildGalleryKeyframe, type GalleryKeyframeArtifact, type KeyframeSelectionOptions } from './galleryKeyframes'
import { GALLERY_SHOWS, galleryShowFacts } from './galleryShows'
import { gallerySubjectKey, resolveGallerySubject, type GallerySubject } from './gallerySubject'
import { GALLERY_KEYFRAME_OVERRIDES } from '@/pixelblaze/stock/keyframeOverrides'

/** Shows are scored across their whole loop, one sample per second. */
export const GALLERY_SHOW_KEYFRAME_SAMPLE_MS = 1000

/** Every subject the batch builds: public Patterns, then Gallery Shows. */
export function galleryKeyframeSubjects(): { subject: GallerySubject; selection?: Partial<KeyframeSelectionOptions> }[] {
  return [
    ...GALLERY_PATTERNS.map((pattern) => ({ subject: { kind: 'pattern' as const, name: pattern.name, src: pattern.src } })),
    ...GALLERY_SHOWS.map((show) => ({
      subject: { kind: 'show' as const, id: show.id },
      selection: { startMs: 1000, endMs: galleryShowFacts(show).loopSeconds * 1000, sampleMs: GALLERY_SHOW_KEYFRAME_SAMPLE_MS },
    })),
  ]
}

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
  for (const { subject, selection } of galleryKeyframeSubjects()) {
    const name = gallerySubjectKey(subject)
    if (wanted && !wanted.has(name) && !(subject.kind === 'show' && wanted.has(subject.id))) continue
    const started = performance.now()
    try {
      const resolved = resolveGallerySubject(subject)
      const artifact = buildGalleryKeyframe({
        name,
        prepared: resolved.prepared,
        mapPoints: resolved.mapPoints,
        selection: { ...selection, ...options.selection },
        posterTimeMs: GALLERY_KEYFRAME_OVERRIDES[name],
      })
      const elapsedMs = performance.now() - started
      entries.push({ name, artifact, elapsedMs })
      options.log?.(`${name}: t=${artifact.posterTimeMs}ms score=${artifact.score.toFixed(3)} px=${artifact.pixelCount} (${elapsedMs.toFixed(0)}ms)`)
    } catch (error) {
      const elapsedMs = performance.now() - started
      const message = error instanceof Error ? error.message : String(error)
      entries.push({ name, error: message, elapsedMs })
      options.log?.(`${name}: FAILED ${message}`)
    }
  }
  return entries
}
