import { describe, expect, it } from 'vitest'
import { IDE_MICROTYPE, contrastRatio } from './ideMicrotype'

describe('IDE microtype roles (#465)', () => {
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
