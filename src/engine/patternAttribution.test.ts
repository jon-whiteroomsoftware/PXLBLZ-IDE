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
})
