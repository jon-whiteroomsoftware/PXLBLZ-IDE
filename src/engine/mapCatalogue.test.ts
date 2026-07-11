import {
  groupMapCatalogue,
  type MapCatalogueEntry,
} from './mapCatalogue'

const ENTRIES: MapCatalogueEntry[] = [
  { id: 'ring', name: 'Ring', dim: 2, kind: 'path', provenance: 'stock' },
  { id: 'plane', name: 'Square', dim: 2, kind: 'surface', provenance: 'stock' },
  {
    id: 'cylinder-strand', name: 'Cylinder · Strand', dim: 1, kind: 'surface', provenance: 'stock',
    family: { id: 'cylinder', name: 'Cylinder', view: 'strand' },
  },
  {
    id: 'cylinder-surface', name: 'Cylinder · Surface', dim: 2, kind: 'surface', provenance: 'stock',
    family: { id: 'cylinder', name: 'Cylinder', view: 'surface', natural: true },
  },
  {
    id: 'cylinder-spatial', name: 'Cylinder · Spatial', dim: 3, kind: 'surface', provenance: 'stock',
    family: { id: 'cylinder', name: 'Cylinder', view: 'spatial' },
  },
  { id: 'sphere-shell', name: 'Sphere shell', dim: 3, kind: 'shell', provenance: 'stock' },
  { id: 'cube-volume', name: 'Cube volume', dim: 3, kind: 'volume', provenance: 'stock' },
  { id: 'pucks', name: 'Sunflower pucks', dim: 3, kind: 'custom', provenance: 'stock' },
  { id: 'mine', name: 'My tree', dim: 3, kind: 'custom', provenance: 'user' },
]

describe('groupMapCatalogue', () => {
  it('uses the durable group order and omits empty scaffolding', () => {
    const groups = groupMapCatalogue(ENTRIES)
    expect(groups.map((group) => group.kind)).toEqual(['path', 'surface', 'shell', 'volume', 'custom'])
    expect(groups.map((group) => group.label)).toEqual(['Paths', 'Surfaces', 'Shells', 'Volumes', 'Custom / imported'])
  })

  it('collapses coordinate views into one recognizable family item', () => {
    const cylinder = groupMapCatalogue(ENTRIES)
      .flatMap((group) => group.items)
      .find((item) => item.familyId === 'cylinder')
    expect(cylinder?.name).toBe('Cylinder')
    expect(cylinder?.id).toBe('cylinder-surface')
    expect(cylinder?.views.map((view) => view.id)).toEqual([
      'cylinder-strand',
      'cylinder-surface',
      'cylinder-spatial',
    ])
  })

  it('filters family views by dimension without losing the family', () => {
    const groups = groupMapCatalogue(ENTRIES, { dim: 1 })
    expect(groups.map((group) => group.kind)).toEqual(['surface'])
    expect(groups[0].items[0].name).toBe('Cylinder')
    expect(groups[0].items[0].views.map((view) => view.id)).toEqual(['cylinder-strand'])
  })

  it('searches family, item, and coordinate-view names case-insensitively', () => {
    expect(groupMapCatalogue(ENTRIES, { query: 'spatial' })[0].items[0].name).toBe('Cylinder')
    expect(groupMapCatalogue(ENTRIES, { query: 'TREE' })[0].items[0].id).toBe('mine')
  })

  it('can preserve ownership sections without changing taxonomy', () => {
    const stock = groupMapCatalogue(ENTRIES, { provenance: 'stock' })
    const user = groupMapCatalogue(ENTRIES, { provenance: 'user' })
    expect(stock.flatMap((group) => group.items).some((item) => item.id === 'mine')).toBe(false)
    expect(user).toHaveLength(1)
    expect(user[0].kind).toBe('custom')
  })
})
