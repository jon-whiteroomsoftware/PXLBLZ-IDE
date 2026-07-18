import { addShowZone, createShowWithOutputContract, updateShowRoutingLayout } from './showModel'
import { createPortableShowOutputContract } from './showOutputContract'
import { portableCompatibilityBlockingMessage, validatePortableShowCompatibility } from './showPortableCompatibility'

describe('Portable 2D compatibility (#436)', () => {
  it('accepts normalized 2D subdivisions without physical identity', () => {
    let show = createShowWithOutputContract(
      'portable',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
    )
    show = addShowZone(show, { name: 'right' })
    show = updateShowRoutingLayout(show, show.routingLayouts[0].id, {
      logical: { kind: 'stripes', axis: 'x', zoneIds: show.zones.map((zone) => zone.id) },
    })

    expect(validatePortableShowCompatibility(show, [{
      cellId: show.cells[0].id,
      patternName: 'Surface',
      source: 'export function render2D(index, x, y) { rgb(x, y, 1) }',
    }], 2)).toMatchObject({ compatible: true, issues: [] })
  })

  it('rejects persisted Checker routing without exactly two zones (#507)', () => {
    const show = createShowWithOutputContract(
      'checker-invalid',
      'Checker invalid',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1024 }),
    )
    show.routingLayouts[0].logical = {
      kind: 'checker',
      columns: 0,
      rows: 4,
      zoneIds: [show.zones[0].id],
    } as unknown as typeof show.routingLayouts[0]['logical']

    const result = validatePortableShowCompatibility(show, [{
      cellId: show.cells[0].id,
      patternName: 'Surface',
      source: 'export function render2D(index, x, y) { rgb(x, y, 1) }',
    }], 2)

    expect(result?.issues).toContain('Routing layout "Default": Checker needs exactly two Zones.')
    expect(result?.issues).toContain('Routing layout "Default": Checker columns and rows must be positive whole numbers.')
  })

  it('rejects physical layouts, 3D references, and 3D-only members', () => {
    const show = createShowWithOutputContract(
      'portable',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'cube', referencePixelCount: 512 }),
    )
    show.routingLayouts[0].logical = undefined
    const result = validatePortableShowCompatibility(show, [{
      cellId: show.cells[0].id,
      patternName: 'Volume',
      source: 'export function render3D(index, x, y, z) { rgb(x, y, z) }',
    }], 3)

    expect(result!.issues).toEqual([
      'The reference output is 3D; Portable currently supports only 2D mapped surfaces.',
      'Routing layout "Default" uses physical pixel ranges; Portable requires normalized position-based zones.',
      'Volume defines only render3D.',
    ])
    expect(portableCompatibilityBlockingMessage(result)).toBe(
      'Portable 2D compatibility failed: The reference output is 3D; Portable currently supports only 2D mapped surfaces. Choose a 2D reference map before export or send.',
    )
  })

  it('reports a 1D renderer as an explicit compatible adaptation', () => {
    const show = createShowWithOutputContract(
      'portable',
      'Portable',
      createPortableShowOutputContract({ referenceMapId: 'plane', referencePixelCount: 1536 }),
    )
    const result = validatePortableShowCompatibility(show, [{
      cellId: show.cells[0].id,
      patternName: 'Bands',
      source: 'export function render(index) { rgb(index / pixelCount, 0, 0) }',
    }], 2)

    expect(result).toMatchObject({ compatible: true, issues: [] })
    expect(result!.advisories).toEqual(['Bands uses render; Portable adapts its normalized local position to a resolution-dependent index.'])
  })
})
