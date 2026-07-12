import { parsePxlblzBanner, stampArtifact } from './artifactStamp'
import { prepareShowControllerArtifact } from './showControllerArtifact'

const SHOW_2D = stampArtifact([
  'var t = 0',
  'export function beforeRender(delta) { t += delta }',
  'export function render2D(index, x, y) { hsv(x + t, 1, y) }',
].join('\n'), {
  kind: 'show',
  id: 'show-1',
  name: 'Opening Night',
  transforms: ['show'],
  stampedAt: '2026-07-11T12:00:00.000Z',
})

describe('Show Controller artifact preparation (#429)', () => {
  it('keeps the canonical Show source byte-identical when no adapter is needed', () => {
    const prepared = prepareShowControllerArtifact(SHOW_2D, 2, '3.67')

    expect(prepared.source).toBe(SHOW_2D)
    expect(prepared.warnings).toEqual([])
    expect(prepared.blocked).toBe(false)
  })

  it('adds and reports an exact-arity adapter while preserving Show provenance', () => {
    const prepared = prepareShowControllerArtifact(SHOW_2D, 1, '3.67')

    expect(prepared.blocked).toBe(false)
    expect(prepared.warnings.map((warning) => warning.kind)).toEqual(['pattern-dim-mismatch'])
    expect(prepared.source).toContain('export function render(index, x)')
    expect(prepared.source).toContain('render2D(index, x, 0.5)')
    expect(parsePxlblzBanner(prepared.source)).toMatchObject({
      kind: 'show',
      id: 'show-1',
      name: 'Opening Night',
      transforms: ['show', 'renderer-adapter'],
    })
  })

  it('blocks a renderer fallback known to be unsupported by old firmware', () => {
    const prepared = prepareShowControllerArtifact(SHOW_2D, 1, '3.65')

    expect(prepared.blocked).toBe(true)
    expect(prepared.warnings.map((warning) => warning.kind)).toEqual([
      'pattern-dim-mismatch',
      'pattern-firmware-unsupported',
    ])
  })
})
