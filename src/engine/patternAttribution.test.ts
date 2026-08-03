import {
  buildShowPatternCreditLines,
  extractPatternAuthors,
  normalizePatternAuthors,
} from './patternAttribution'

describe('Pattern attribution metadata', () => {
  it('extracts explicit author comments without keeping the comments in source metadata', () => {
    expect(extractPatternAuthors(`
// Author: Jane Pixels <jane@example.test>
// @author Pixel Cat

export function render(index) { rgb(1, 0, 0) }
    `)).toEqual(['Jane Pixels <jane@example.test>', 'Pixel Cat'])
  })

  it('extracts upstream authors from standardized Pattern credit lines', () => {
    expect(extractPatternAuthors(`
// Pattern: Iridescent Fibers
// Built with PXLBLZ-IDE https://pxlblz-ide.whiteroomsoftware.com/
// Credit: "iridescent fibers" by evesira — https://www.shadertoy.com/view/tffSDr
// Credit: palette method by Inigo Quilez — https://iquilezles.org/articles/palettes/
//
// Description.

export function render2D(index, x, y) { rgb(x, y, 0) }
    `)).toEqual(['evesira', 'Inigo Quilez'])
  })

  it('normalizes, deduplicates, and ignores empty author values', () => {
    expect(normalizePatternAuthors([
      ' Jane Pixels <jane@example.test> ',
      '',
      'Jane Pixels <jane@example.test>',
      'Pixel Cat',
    ])).toEqual(['Jane Pixels <jane@example.test>', 'Pixel Cat'])
  })

  it('deduplicates Show credit lines by pattern name and author list', () => {
    expect(buildShowPatternCreditLines([
      { name: 'User Cost Fix', authors: ['Ada <ada@example.test>'] },
      { name: 'User Cost Fix', authors: ['Ada <ada@example.test>'] },
      { name: 'Blank Accent', authors: [] },
    ])).toEqual([
      '- User Cost Fix by Ada <ada@example.test>',
      '- Blank Accent',
    ])
  })

  describe('bare date+name signature lines', () => {
    const body = '\n\nvar coreSize = 0.1\nexport function render2D(index, x, y) { hsv(0, 0, 1) }\n'

    it('extracts the Coronal Mass Ejection trailing signature verbatim', () => {
      expect(extractPatternAuthors(`// Coronal Mass Ejection 2D
// A demonstration of Pixelblaze's Perlin noise and smoothstep functions
//
// 10/09/2022 ZRanger1
${body}`)).toEqual(['ZRanger1'])
    })

    it('accepts common date forms before the name', () => {
      expect(extractPatternAuthors(`// 3/7/21 Scruffynerf${body}`)).toEqual(['Scruffynerf'])
      expect(extractPatternAuthors(`// 2022-10-09 ZRanger1${body}`)).toEqual(['ZRanger1'])
      expect(extractPatternAuthors(`// Oct 2022 Jeff Vyduna${body}`)).toEqual(['Jeff Vyduna'])
      expect(extractPatternAuthors(`// October 9, 2022 ZRanger1${body}`)).toEqual(['ZRanger1'])
    })

    it('accepts a name-first signature', () => {
      expect(extractPatternAuthors(`// ZRanger1 10/09/2022${body}`)).toEqual(['ZRanger1'])
    })

    it('accepts multi-word names including lowercase particles', () => {
      expect(extractPatternAuthors(`// 2022-10-09 Jeff Vyduna${body}`)).toEqual(['Jeff Vyduna'])
      expect(extractPatternAuthors(`// 2022-10-09 Ludwig van Beethoven${body}`)).toEqual(['Ludwig van Beethoven'])
    })

    it('conservatively skips verb-shaped multi-word remainders, losing rare names', () => {
      // "Alfred" is indistinguishable from an unlisted changelog verb by shape;
      // the no-false-authors invariant deliberately wins over completeness.
      expect(extractPatternAuthors(`// 2022-10-09 Alfred Jones${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 2022-10-09 Corrected Render Cache${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 2022-10-09 Reordered Palette${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 2022-10-09 Fix the Cache${body}`)).toEqual([])
    })

    it('accepts a leading version token before the date', () => {
      expect(extractPatternAuthors(`// v1.2 10/09/2022 ZRanger1${body}`)).toEqual(['ZRanger1'])
      expect(extractPatternAuthors(`// 1.0.0 10/09/2022 ZRanger1${body}`)).toEqual(['ZRanger1'])
    })

    it('accepts a signature row inside a block comment header', () => {
      expect(extractPatternAuthors(`/*
 * Ember study
 * 10/09/2022 ZRanger1
 */${body}`)).toEqual(['ZRanger1'])
    })

    it('extracts the labeled fixture-form signature with a source link line', () => {
      expect(extractPatternAuthors(`// Coronal Mass Ejection 2D
// A demonstration of Pixelblaze's Perlin noise and smoothstep functions.
//
// Original Pattern: 10/09/2022 ZRanger1
// Source: https://electromage.com/patterns/
${body}`)).toEqual(['ZRanger1'])
    })

    it('rejects dated changelog prose', () => {
      expect(extractPatternAuthors(`// 10/09/2022 fixed flicker on dense strips${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 10/09/2022 Fixed flicker${body}`)).toEqual([])
      expect(extractPatternAuthors(`// updated May 2022 more sparkle${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 2022-10-09 Improved performance${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 2022-10-09 Improved Performance${body}`)).toEqual([])
      expect(extractPatternAuthors(`// Fixed: 2022-10-09 Render Cache${body}`)).toEqual([])
    })

    it('rejects single-word dated changelog remainders (#684 review)', () => {
      expect(extractPatternAuthors(`// 2022-10-09 Reordered${body}`)).toEqual([])
      expect(extractPatternAuthors(`// Tested 10/09/2022${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 10/09/2022 hotfix${body}`)).toEqual([])
    })

    it('rejects bare dates, URLs, digit-led remainders, and title lines', () => {
      expect(extractPatternAuthors(`// 10/09/2022${body}`)).toEqual([])
      expect(extractPatternAuthors(`// https://github.com/zranger1 10/09/2022${body}`)).toEqual([])
      expect(extractPatternAuthors(`// 10/09/2022 2D${body}`)).toEqual([])
      expect(extractPatternAuthors(`// Coronal Mass Ejection 2D${body}`)).toEqual([])
    })

    it('rejects signature-shaped lines after code begins', () => {
      expect(extractPatternAuthors(`// Comet
${body}
// 10/09/2022 ZRanger1
`)).toEqual([])
    })

    it('deduplicates signature authors against keyword authors', () => {
      expect(extractPatternAuthors(`// by ZRanger1
// 10/09/2022 ZRanger1
${body}`)).toEqual(['ZRanger1'])
    })
  })
})
