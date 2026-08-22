// Lazy access to stored Gallery keyframes (#888). Each artifact is a gzipped
// JSON asset, fetched and inflated only when a card first needs it.
import type { GalleryKeyframeArtifact } from '@/engine/galleryKeyframes'

const keyframeUrls = import.meta.glob('./keyframes/*.json.gz', {
  query: '?url',
  import: 'default',
  eager: true,
}) as Record<string, string>

const urlByName = new Map<string, string>(
  Object.entries(keyframeUrls).map(([path, url]) => [
    path.replace('./keyframes/', '').replace(/\.json\.gz$/, ''),
    url,
  ]),
)

export function hasGalleryKeyframe(name: string): boolean {
  return urlByName.has(name)
}

export function galleryKeyframeUrl(name: string): string | null {
  return urlByName.get(name) ?? null
}

/**
 * Decodes a fetched artifact. The bytes are gzip unless the server already
 * applied `Content-Encoding: gzip` to the `.gz` asset and the browser inflated
 * them, so the gzip magic number decides. Exposed so tests can feed bytes
 * read from disk.
 */
export async function decodeGalleryKeyframe(bytes: Uint8Array): Promise<GalleryKeyframeArtifact> {
  const isGzip = bytes.length > 2 && bytes[0] === 0x1f && bytes[1] === 0x8b
  if (!isGzip) return JSON.parse(new TextDecoder().decode(bytes)) as GalleryKeyframeArtifact
  const inflated = new Blob([bytes as BlobPart]).stream().pipeThrough(
    new DecompressionStream('gzip') as unknown as ReadableWritablePair<Uint8Array, Uint8Array>,
  )
  return (await new Response(inflated).json()) as GalleryKeyframeArtifact
}

/** Resolves to null when no artifact is stored for the Pattern or it cannot be read. */
export async function loadGalleryKeyframe(name: string): Promise<GalleryKeyframeArtifact | null> {
  const url = urlByName.get(name)
  if (!url) return null
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    return await decodeGalleryKeyframe(new Uint8Array(await response.arrayBuffer()))
  } catch {
    return null
  }
}
