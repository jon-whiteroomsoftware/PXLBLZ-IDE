import {
  buildLibraryDocIndex,
  libraryDocsByFunction,
  parseLibraryApiReference,
} from './libraryDocs'

describe('libraryDocs (#350)', () => {
  it('parses function docs, params, out-vars, and referenced stock libraries', () => {
    const reference = parseLibraryApiReference('MyLib', [
      'var outH = 0, outS = 0',
      '// Paints the current pixel.',
      '// Uses a stock color helper.',
      'function paint(index, amount) {',
      '  Color.lerpHSV(index, 1, amount, 0.7, 1, 1, 0.5)',
      '}',
    ].join('\n'), ['Color', 'Shader'])

    expect(reference.functions).toEqual([{
      name: 'paint',
      params: ['index', 'amount'],
      doc: 'Paints the current pixel. Uses a stock color helper.',
      inlineEligible: false,
    }])
    expect(reference.outVars).toEqual(['outH', 'outS'])
    expect(reference.referencedStockLibraries).toEqual(['Color'])
  })

  it('keeps undocumented functions visible for signatures and empty-state counts', () => {
    const reference = parseLibraryApiReference('MyLib', 'function helper(v) { return v }')

    expect(reference.functions).toEqual([{ name: 'helper', params: ['v'], doc: '', inlineEligible: false }])
    expect(libraryDocsByFunction(reference).helper.doc).toBe('')
  })

  it('exposes inline eligibility without leaking the compiler annotation into prose', () => {
    const reference = parseLibraryApiReference('MathLib', [
      '// Squares a value.',
      '// @inline',
      'function square(v) { return v * v }',
    ].join('\n'))

    expect(reference.functions).toEqual([{
      name: 'square',
      params: ['v'],
      doc: 'Squares a value.',
      inlineEligible: true,
    }])
  })

  it('builds a case-sensitive doc index for stock and cloud namespaces', () => {
    const index = buildLibraryDocIndex({
      Shader: '// Hash helper\nfunction hash21(x, y) { return x }',
      MyLib: '// Cloud helper\nfunction paint(index) { hsv(index, 1, 1) }',
    })

    expect(index.Shader.hash21.doc).toBe('Hash helper')
    expect(index.MyLib.paint.doc).toBe('Cloud helper')
    expect(index.shader).toBeUndefined()
  })
})
