import { describe, expect, it } from 'vitest'
import { buildPatternEpeExport } from './patternEpeExport'
import { parseEpe } from './epeImport'

describe('buildPatternEpeExport', () => {
  it('packages a stamped pattern artifact as a real .epe the importer can read back', () => {
    const stamped = '// PXLBLZ banner\nexport function render2D(index, x, y) { rgb(x, y, 0) }'
    const epe = buildPatternEpeExport('Redline Machine Portable', stamped)

    expect(epe.filename).toBe('redline-machine-portable.epe')
    const parsed = JSON.parse(epe.text) as { name: string; id: string; sources: { main: string }; preview: string }
    expect(parsed.name).toBe('Redline Machine Portable')
    expect(parsed.id.length).toBeGreaterThan(0)
    expect(parsed.sources.main).toBe(stamped)
    expect(parsed.preview).toBe('')

    expect(parseEpe(epe.text).src).toBe(stamped)
  })

  it('falls back to a generic stem and name for unusable titles', () => {
    const epe = buildPatternEpeExport('   ', 'export function render(index) {}')
    expect(epe.filename).toBe('pattern.epe')
    expect((JSON.parse(epe.text) as { name: string }).name).toBe('Pattern')
  })
})
