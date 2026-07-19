import { buildLibraryDocIndex } from '@/engine/libraryDocs'
import { resolvePixelblazeHover } from './providers'

describe('monaco providers (#350)', () => {
  it('resolves cloud library hover docs case-sensitively', () => {
    const docs = buildLibraryDocIndex({
      MyLib: '// Paints one pixel\nfunction paint(index, amount) { hsv(index, 1, amount) }',
    })

    expect(resolvePixelblazeHover('  MyLib.paint(index, 1)', 9, 'paint', docs)).toEqual({
      signature: 'MyLib.paint(index, amount)',
      doc: 'Paints one pixel',
    })
    expect(resolvePixelblazeHover('  mylib.paint(index, 1)', 9, 'paint', docs)).toBeNull()
  })

  it('keeps built-in hover docs available', () => {
    const hover = resolvePixelblazeHover('hsv(index, 1, 1)', 1, 'hsv', {})

    expect(hover?.signature).toBe('hsv(h, s, v)')
    expect(hover?.doc).toContain('Set')
  })

  it('resolves the inline call-site form for eligible library functions', () => {
    const docs = buildLibraryDocIndex({
      MathLib: '// Squares a value\n// @inline\nfunction square(v) { return v * v }',
    })

    expect(resolvePixelblazeHover('MathLib.inline.square(index)', 16, 'square', docs)).toEqual({
      signature: 'MathLib.inline.square(v)',
      doc: 'Squares a value',
    })
  })
})
