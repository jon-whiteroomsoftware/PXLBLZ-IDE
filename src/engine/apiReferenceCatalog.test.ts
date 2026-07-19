import { describe, expect, it } from 'vitest'
import { buildApiReferenceCatalog } from './apiReferenceCatalog'

describe('API reference catalog', () => {
  const personalLibraries = [
    {
      id: 'lib-1',
      name: 'MyLib',
      src: '// Paint one pixel.\n// @inline\nfunction paint(index) { return index }\nfunction internal() {}',
      updatedAt: 1,
    },
    {
      id: 'lib-2',
      name: 'Undocumented',
      src: 'function helper(value) {}',
      updatedAt: 2,
    },
  ]

  it('exposes Pixelblaze built-ins and provided libraries publicly', () => {
    const catalog = buildApiReferenceCatalog(personalLibraries, false)

    expect(catalog.map((entry) => entry.id)).toEqual([
      'PixelBlaze',
      'Anim',
      'Color',
      'Coord',
      'Noise',
      'SDF',
      'Shader',
    ])
    expect(catalog.some((entry) => entry.kind === 'personal')).toBe(false)
  })

  it('appends personal library documentation in Studio context', () => {
    const catalog = buildApiReferenceCatalog(personalLibraries, true)
    const personal = catalog.filter((entry) => entry.kind === 'personal')

    expect(personal.map((entry) => entry.name)).toEqual(['MyLib', 'Undocumented'])
    expect(personal[0].sections[0].entries).toEqual([
      {
        signature: 'MyLib.paint(index)',
        inlineSignature: 'MyLib.inline.paint(index)',
        description: 'Paint one pixel.',
      },
    ])
    expect(personal[1].sections).toEqual([])
    expect(personal[1].emptyReason).toBe('undocumented')
  })
})
