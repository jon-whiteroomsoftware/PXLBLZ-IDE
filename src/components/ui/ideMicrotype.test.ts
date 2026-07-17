import { describe, expect, it } from 'vitest'
import { IDE_MICROTYPE, contrastRatio } from './ideMicrotype'

describe('IDE microtype roles (#465)', () => {
  it('defines one dense hierarchy from pane headings through entity rows', () => {
    expect(IDE_MICROTYPE.header).toMatchObject({ fontSizePx: 13, colorHex: '#e4e4e7' })
    expect(IDE_MICROTYPE.entity).toMatchObject({ fontSizePx: 12, colorHex: '#a1a1aa' })
    expect(IDE_MICROTYPE.header.sizeClassName).toContain('text-[13px]')
    expect(IDE_MICROTYPE.entity.sizeClassName).toContain('text-[12px]')
    expect(contrastRatio(IDE_MICROTYPE.header.colorHex, IDE_MICROTYPE.panelHex)).toBeGreaterThan(12)
    expect(contrastRatio(IDE_MICROTYPE.entity.colorHex, IDE_MICROTYPE.panelHex)).toBeGreaterThan(7.5)
  })

  it('keeps required and secondary text legible on the production panel background', () => {
    expect(IDE_MICROTYPE.required.fontSizePx).toBe(10)
    expect(IDE_MICROTYPE.secondary.fontSizePx).toBe(9)
    expect(contrastRatio(IDE_MICROTYPE.required.colorHex, IDE_MICROTYPE.panelHex)).toBeGreaterThan(7.5)
    expect(contrastRatio(IDE_MICROTYPE.secondary.colorHex, IDE_MICROTYPE.panelHex)).toBeGreaterThan(7.5)
    expect(IDE_MICROTYPE.required.className).toContain('text-zinc-400')
    expect(IDE_MICROTYPE.secondary.className).toContain('text-zinc-400')
  })

  it('reserves the smallest weaker token for nonessential ornament', () => {
    expect(IDE_MICROTYPE.ornament.fontSizePx).toBe(8)
    expect(IDE_MICROTYPE.ornament.className).toContain('text-zinc-500')
    expect(contrastRatio(IDE_MICROTYPE.ornament.colorHex, IDE_MICROTYPE.panelHex)).toBeGreaterThan(4)
  })
})
