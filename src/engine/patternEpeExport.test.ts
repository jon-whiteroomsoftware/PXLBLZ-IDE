import { describe, expect, it } from 'vitest'
import { buildPatternEpeExport } from './patternEpeExport'
import { isPxlblzProgramId } from './bytecodePush'
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

  it('derives one stable, well-formed id per seed so re-uploads replace instead of duplicate', () => {
    const a1 = buildPatternEpeExport('A', 'src', { idSeed: 'record-a' })
    const a2 = buildPatternEpeExport('A renamed', 'src v2', { idSeed: 'record-a' })
    const b = buildPatternEpeExport('B', 'src', { idSeed: 'record-b' })

    const id = (epe: { text: string }) => (JSON.parse(epe.text) as { id: string }).id
    expect(id(a1)).toBe(id(a2))
    expect(id(b)).not.toBe(id(a1))
    expect(isPxlblzProgramId(id(a1))).toBe(true)
    expect(isPxlblzProgramId(id(b))).toBe(true)
  })

  it('falls back to a generic stem and name for unusable titles', () => {
    const epe = buildPatternEpeExport('   ', 'export function render(index) {}')
    expect(epe.filename).toBe('pattern.epe')
    expect((JSON.parse(epe.text) as { name: string }).name).toBe('Pattern')
  })
})
