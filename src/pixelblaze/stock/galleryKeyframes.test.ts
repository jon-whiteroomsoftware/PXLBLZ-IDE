import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { prepareFastReplay } from '@/engine/fastReplay'
import { GALLERY_PATTERNS } from '@/engine/galleryCatalog'
import {
  GALLERY_KEYFRAME_RANDOM_SEED,
  galleryKeyframeKey,
  galleryKeyframeMatches,
  type GalleryKeyframeArtifact,
} from '@/engine/galleryKeyframes'
import { resolveGalleryThumbnailLayout } from '@/engine/galleryThumbnailLayout'
import { LIBRARIES } from '@/pixelblaze/libs'
import { decodeGalleryKeyframe, hasGalleryKeyframe, loadGalleryKeyframe } from './galleryKeyframes'

const KEYFRAME_DIR = join(__dirname, 'keyframes')

function readStoredKeyframe(name: string): GalleryKeyframeArtifact {
  return JSON.parse(gunzipSync(readFileSync(join(KEYFRAME_DIR, `${name}.json.gz`))).toString('utf8'))
}

describe('stored Gallery keyframes', () => {
  it('resolves null for a Pattern with no artifact', async () => {
    expect(hasGalleryKeyframe('NotAPattern')).toBe(false)
    await expect(loadGalleryKeyframe('NotAPattern')).resolves.toBeNull()
  })

  it('decodes a stored artifact through the browser path, gzipped or already inflated', async () => {
    const name = GALLERY_PATTERNS[0].name
    expect(hasGalleryKeyframe(name)).toBe(true)
    const packed = readFileSync(join(KEYFRAME_DIR, `${name}.json.gz`))
    const expected = readStoredKeyframe(name)
    await expect(decodeGalleryKeyframe(new Uint8Array(packed))).resolves.toEqual(expected)
    await expect(decodeGalleryKeyframe(new Uint8Array(gunzipSync(packed)))).resolves.toEqual(expected)
  })

  it('every public Gallery Pattern has a stored keyframe whose key matches the current runtime', () => {
    const stale: string[] = []
    const missing: string[] = []
    for (const pattern of GALLERY_PATTERNS) {
      if (!hasGalleryKeyframe(pattern.name)) {
        missing.push(pattern.name)
        continue
      }
      const artifact = readStoredKeyframe(pattern.name)
      const prepared = prepareFastReplay(pattern.src, LIBRARIES)
      const { layout } = resolveGalleryThumbnailLayout(pattern.name, prepared)
      const key = galleryKeyframeKey({ code: prepared.code, mapPoints: layout.mapPoints, randomSeed: GALLERY_KEYFRAME_RANDOM_SEED })
      if (!galleryKeyframeMatches(artifact, key) || artifact.pixelCount !== layout.mapPoints.length) stale.push(pattern.name)
    }
    // Regenerate with `npm run gallery:keyframes` after changing a stock
    // Pattern, its recommended settings, the thumbnail caps, or the engine.
    expect({ missing, stale }).toEqual({ missing: [], stale: [] })
  })
})
