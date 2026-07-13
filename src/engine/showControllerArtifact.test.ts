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
  preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
  compatibility: {
    portability: 'adaptive',
    dimensions: [2],
    mapClasses: ['surface'],
    resolution: 'adaptive',
    exactMap: false,
  },
  showOutputContract: {
    version: 1,
    kind: 'portable-2d',
    dimensions: [2],
    mapClasses: ['surface'],
    resolution: 'variable',
  },
  stampedAt: '2026-07-11T12:00:00.000Z',
})

const INSTALLATION_SHOW_2D = stampArtifact('export function render2D(index, x, y) { hsv(x, 1, y) }', {
  kind: 'show',
  id: 'show-fixed',
  name: 'Measured wall Show',
  preferredMap: { kind: 'custom', name: 'Measured wall' },
  compatibility: {
    portability: 'installation-bound',
    dimensions: [2],
    mapClasses: ['custom'],
    resolution: 'fixed',
    exactMap: true,
  },
  showOutputContract: {
    version: 1,
    kind: 'installation',
    pixelCount: 256,
    outputMap: { kind: 'custom', name: 'Measured wall', fingerprint: '11111111' },
  },
  stampedAt: '2026-07-12T00:00:00.000Z',
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
    expect(prepared.warnings.map((warning) => warning.kind)).toEqual(['show-map-compatibility', 'pattern-dim-mismatch'])
    expect(prepared.source).toContain('export function render(index, x)')
    expect(prepared.source).toContain('render2D(index, x, 0.5)')
    expect(parsePxlblzBanner(prepared.source)).toMatchObject({
      kind: 'show',
      id: 'show-1',
      name: 'Opening Night',
      transforms: ['show', 'renderer-adapter'],
      preferredMap: { kind: 'stock', id: 'plane', name: 'Square' },
      compatibility: { portability: 'adaptive', dimensions: [2], exactMap: false },
      showOutputContract: { kind: 'portable-2d', resolution: 'variable' },
    })
  })

  it('blocks a renderer fallback known to be unsupported by old firmware', () => {
    const prepared = prepareShowControllerArtifact(SHOW_2D, 1, '3.65')

    expect(prepared.blocked).toBe(true)
    expect(prepared.warnings.map((warning) => warning.kind)).toEqual([
      'show-map-compatibility',
      'pattern-dim-mismatch',
      'pattern-firmware-unsupported',
    ])
  })

  it('discloses exact-map intent separately without changing Controller map state (#411)', () => {
    const prepared = prepareShowControllerArtifact(INSTALLATION_SHOW_2D, 2, '3.67')

    expect(prepared.source).toBe(INSTALLATION_SHOW_2D)
    expect(prepared.blocked).toBe(false)
    expect(prepared.warnings).toContainEqual({
      kind: 'show-map-compatibility',
      message: 'This Installation Show expects its authored map "Measured wall".',
      detail: 'The Controller map identity cannot be confirmed. Confirm the physical map before sending; the Show will not install or change it.',
    })
  })

  it('accepts an exact Installation count and map fingerprint (#437)', () => {
    const prepared = prepareShowControllerArtifact(INSTALLATION_SHOW_2D, 2, '3.67', {
      pixelCount: 256,
      map: { name: 'Measured wall', fingerprint: '11111111', mapClass: 'custom' },
    })

    expect(prepared.blocked).toBe(false)
    expect(prepared.warnings).toEqual([])
  })

  it.each([
    {
      context: { pixelCount: 255, map: { name: 'Measured wall', fingerprint: '11111111', mapClass: 'custom' as const } },
      message: 'This Installation Show requires 256 pixels; the Controller reports 255.',
    },
    {
      context: { pixelCount: 256, map: { name: 'Other wall', fingerprint: '22222222', mapClass: 'custom' as const } },
      message: 'This Installation Show map fingerprint does not match the Controller map.',
    },
  ])('blocks a known-invalid Installation target (#437)', ({ context, message }) => {
    const prepared = prepareShowControllerArtifact(INSTALLATION_SHOW_2D, 2, '3.67', context)

    expect(prepared.blocked).toBe(true)
    expect(prepared.warnings).toContainEqual(expect.objectContaining({
      kind: 'show-map-compatibility',
      message,
    }))
  })

  it('advises on Portable target compatibility without requiring its reference count or exact map (#437)', () => {
    const compatible = prepareShowControllerArtifact(SHOW_2D, 2, '3.67', {
      pixelCount: 999,
      map: { id: 'wide', name: 'Wide 2:1', mapClass: 'surface' },
    })
    expect(compatible.warnings).toEqual([])

    const incompatibleClass = prepareShowControllerArtifact(SHOW_2D, 2, '3.67', {
      pixelCount: 16,
      map: { name: 'Measured ring', mapClass: 'path' },
    })
    expect(incompatibleClass.blocked).toBe(false)
    expect(incompatibleClass.warnings).toContainEqual(expect.objectContaining({
      kind: 'show-map-compatibility',
      message: 'This Portable Show promises compatible surface maps; the Controller map is classified as path.',
    }))
  })
})
