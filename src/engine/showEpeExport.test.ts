import { parseEpe } from './epeImport'
import { parsePxlblzBanner } from './artifactStamp'
import { addShowRoutingLayout, createDefaultShow, updateShowRoutingSwitch } from './showModel'
import { buildShowEpeExport } from './showEpeExport'

describe('Show EPE export (#399)', () => {
  it('round-trips a stamped generated Show through the standard EPE importer', () => {
    const base = createDefaultShow('show-1', 'Pattern Prism', 1000)
    const withLayout = addShowRoutingLayout(base, 'Quadrants', base.routingLayouts[0].id)
    const show = updateShowRoutingSwitch(withLayout, base.scenes[0].id, withLayout.routingLayouts[1].id)
    const generatedCode = 'export function render(index) { rgb(index, 0, 0) }'

    const exported = buildShowEpeExport(show, generatedCode, {
      id: 'pxb22222222222222',
      preview: '/9j/test-preview',
      stampedAt: '2026-07-10T12:00:00.000Z',
    })
    const envelope = JSON.parse(exported.text)
    const parsed = parseEpe(exported.text)

    expect(exported.filename).toBe('pattern-prism.epe')
    expect(envelope.id).toBe('pxb22222222222222')
    expect(envelope.preview).toBe('/9j/test-preview')
    expect(Object.keys(envelope)).toEqual(['name', 'id', 'sources', 'preview'])
    expect(parsed.name).toBe('Pattern Prism')
    expect(parsePxlblzBanner(parsed.src)).toMatchObject({
      kind: 'show',
      id: 'show-1',
      name: 'Pattern Prism',
      stamped: '2026-07-10T12:00:00.000Z',
    })
    expect(parsed.src).toContain('Compiled PXLBLZ Show: Pattern Prism')
    expect(parsed.src).toContain('Source Patterns:')
    expect(parsed.src).toContain('- TestPattern1D [stock:TestPattern1D]')
    expect(parsed.src).toContain('Routing Layouts: Default -> Quadrants')
    expect(parsed.src).toContain('Scene 1 (30s): switch to Quadrants after scene')
    expect(parsed.src).toContain('Generated orchestration follows; member bindings are isolated with collision-safe prefixes.')
    expect(parsed.src).toContain(generatedCode)
  })

  it('makes a safe ASCII filename without changing the Show name in the envelope', () => {
    const show = createDefaultShow('show-2', '  Ribbons / Stars!  ', 1000)
    const exported = buildShowEpeExport(show, 'export function render() {}', {
      stampedAt: '2026-07-10T12:00:00.000Z',
    })

    expect(exported.filename).toBe('ribbons-stars.epe')
    expect(parseEpe(exported.text).name).toBe('Ribbons / Stars!')
  })
})
