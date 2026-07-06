import { galleryCloneRecord } from './galleryClone'
import type { GalleryPattern } from './galleryCatalog'

const pattern: GalleryPattern = {
  name: 'IridescentFibers',
  slug: 'iridescent-fibers',
  src: 'export function render(index) {}',
  dim: 2,
  sections: ['ShaderToy Ports'],
}

describe('galleryCloneRecord', () => {
  it('creates a writable pattern record from a gallery pattern', () => {
    expect(galleryCloneRecord({
      pattern,
      existingNames: [],
      id: 'clone-1',
      updatedAt: 123,
    })).toEqual({
      id: 'clone-1',
      name: 'IridescentFibers',
      src: pattern.src,
      controls: {},
      updatedAt: 123,
    })
  })

  it('uses the standard unique-name suffix when the pattern already exists', () => {
    expect(galleryCloneRecord({
      pattern,
      existingNames: ['IridescentFibers'],
      id: 'clone-2',
      updatedAt: 456,
    }).name).toBe('IridescentFibers 1')
  })
})
