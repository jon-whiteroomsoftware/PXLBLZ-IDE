import type { GalleryPattern } from './galleryCatalog'
import type { PatternRecord } from './personalContentRecords'
import { uniquePatternName } from './patternName'

export const pendingGalleryCloneKey = 'pxlblz:pending-gallery-clone'

export function galleryCloneRecord(input: {
  pattern: GalleryPattern
  existingNames: string[]
  id: string
  updatedAt: number
}): PatternRecord {
  return {
    id: input.id,
    name: uniquePatternName(input.pattern.name, input.existingNames),
    src: input.pattern.src,
    controls: {},
    updatedAt: input.updatedAt,
  }
}
