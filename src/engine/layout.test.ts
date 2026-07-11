import {
  mapOptions,
  embeddingOptions,
  selectionForOption,
  selectedMapId,
  selectedEmbeddingId,
  coordinateViewOptions,
  selectedFamilyOptionId,
  resolveLayoutSelection,
  resolveSolidity,
  INDEX_MAP_ID,
  type LayoutSource,
} from './layout'

const SOURCE: LayoutSource = {
  shapes: [
    { id: 'line', name: 'Line', displayDim: 1 },
    { id: 'ring', name: 'Ring', displayDim: 2 },
  ],
  surfaces: [
    { id: 'flat', name: 'Flat', displayDim: 2, needsGrid: false },
    { id: 'cylinder', name: 'Cylinder', displayDim: 3, needsGrid: true },
  ],
  maps: [
    { id: 'reverse1d', name: 'Reverse strand', dim: 1 },
    { id: 'plane', name: 'Square', dim: 2, wrappable: true },
    { id: 'ring2d', name: 'Ring', dim: 2, wrappable: false },
    {
      id: 'cylinder-strand', name: 'Cylinder · Strand', dim: 1, displayDim: 3,
      family: { id: 'cylinder', name: 'Cylinder', view: 'strand' },
    },
    {
      id: 'cylinder-surface', name: 'Cylinder · Surface', dim: 2, displayDim: 3,
      family: { id: 'cylinder', name: 'Cylinder', view: 'surface', natural: true },
    },
    {
      id: 'cylinder-spatial', name: 'Cylinder · Spatial', dim: 3, displayDim: 3,
      family: { id: 'cylinder', name: 'Cylinder', view: 'spatial' },
    },
    { id: 'cube', name: 'Cube', dim: 3 },
  ],
}

describe('mapOptions (exact dimension first)', () => {
  it('offers Index plus true 1D maps first to a 1D Pattern', () => {
    expect(mapOptions(1, SOURCE).map((o) => o.id)).toEqual([
      INDEX_MAP_ID,
      'reverse1d',
      'plane',
      'ring2d',
      'cylinder-surface',
      'cube',
    ])
  })

  it('offers a 2D Pattern every map with exact-dimensional choices first', () => {
    const options = mapOptions(2, SOURCE)
    expect(options.map((o) => o.id)).toEqual([
      'plane',
      'ring2d',
      'cylinder-surface',
      INDEX_MAP_ID,
      'reverse1d',
      'cube',
    ])
    expect(options.map((o) => o.group)).toEqual([
      'recommended',
      'recommended',
      'recommended',
      'other',
      'other',
      'other',
    ])
    expect(mapOptions(2, SOURCE).every((o) => o.kind === 'map')).toBe(true)
  })

  it('offers a 3D Pattern its dim-3 map first, then every other dimension', () => {
    expect(mapOptions(3, SOURCE).map((o) => o.id)).toEqual([
      'cube',
      INDEX_MAP_ID,
      'reverse1d',
      'plane',
      'ring2d',
      'cylinder-surface',
    ])
  })

  it('catalogues Cylinder once and exposes its views progressively', () => {
    expect(mapOptions(2, SOURCE).filter((option) => option.name === 'Cylinder')).toHaveLength(1)
    expect(selectedFamilyOptionId('cylinder-spatial', SOURCE)).toBe('cylinder-surface')
    expect(coordinateViewOptions('cylinder-surface', SOURCE)).toEqual([
      { mapId: 'cylinder-strand', view: 'strand', label: 'Strand', dim: 1 },
      { mapId: 'cylinder-surface', view: 'surface', label: 'Surface', dim: 2 },
      { mapId: 'cylinder-spatial', view: 'spatial', label: 'Spatial', dim: 3 },
    ])
  })
})

describe('embeddingOptions (shapes for 1D, surfaces for 2D)', () => {
  it('offers a 1D pattern every shape', () => {
    const opts = embeddingOptions(1, SOURCE)
    expect(opts.map((o) => o.id)).toEqual(['line', 'ring'])
    expect(opts.every((o) => o.kind === 'shape')).toBe(true)
  })

  it('offers both surfaces for a 2D pattern on a wrappable map', () => {
    const opts = embeddingOptions(2, SOURCE, SOURCE.maps.find((m) => m.id === 'plane'))
    expect(opts.map((o) => o.id)).toEqual(['flat', 'cylinder'])
    expect(opts.every((o) => o.kind === 'surface')).toBe(true)
  })

  it('offers only Flat for a 2D pattern on an irregular map', () => {
    const opts = embeddingOptions(2, SOURCE, SOURCE.maps.find((m) => m.id === 'ring2d'))
    expect(opts.map((o) => o.id)).toEqual(['flat'])
  })

  it('offers no embedding for a 3D pattern', () => {
    expect(embeddingOptions(3, SOURCE, SOURCE.maps.find((m) => m.id === 'cube'))).toEqual([])
  })

  it('offers no separate embedding for a geometry family that owns its positions', () => {
    const cylinder = SOURCE.maps.find((map) => map.id === 'cylinder-surface')
    expect(embeddingOptions(2, SOURCE, cylinder)).toEqual([])
  })
})

describe('selectionForOption (routing)', () => {
  it('routes a shape choice to shapeId', () => {
    expect(selectionForOption({ kind: 'shape', id: 'ring', name: 'Ring', displayDim: 2 })).toEqual({
      shapeId: 'ring',
    })
  })

  it('routes a surface choice to surfaceId', () => {
    expect(
      selectionForOption({ kind: 'surface', id: 'cylinder', name: 'Cylinder', displayDim: 3 }),
    ).toEqual({ surfaceId: 'cylinder' })
  })

  it('routes a map choice to mapId', () => {
    expect(selectionForOption({ kind: 'map', id: 'plane', name: 'Square', displayDim: 2 })).toEqual({
      mapId: 'plane',
    })
  })
})

describe('selectedMapId / selectedEmbeddingId', () => {
  it('reads the mapId and shapeId independently for a 1D pattern', () => {
    const sel = { shapeId: 'ring', mapId: 'reverse1d', surfaceId: 'cylinder' as const }
    expect(selectedMapId(sel, 1)).toBe('reverse1d')
    expect(selectedEmbeddingId(sel, 1)).toBe('ring')
  })

  it('reads the mapId and the surfaceId for a 2D pattern', () => {
    const sel = { shapeId: 'ring', mapId: 'plane', surfaceId: 'cylinder' as const }
    expect(selectedMapId(sel, 2)).toBe('plane')
    expect(selectedEmbeddingId(sel, 2)).toBe('cylinder')
  })

  it('defaults the 2D embedding to Flat when no surface persisted', () => {
    expect(selectedEmbeddingId({ mapId: 'plane' }, 2)).toBe('flat')
  })

  it('reads the mapId and no embedding for a 3D pattern', () => {
    expect(selectedMapId({ mapId: 'cube' }, 3)).toBe('cube')
    expect(selectedEmbeddingId({ mapId: 'cube' }, 3)).toBeUndefined()
  })
})

describe('resolveLayoutSelection (open / restore)', () => {
  it('restores a valid persisted 1D shape', () => {
    expect(resolveLayoutSelection({ shapeId: 'ring' }, 1, SOURCE)).toEqual({
      mapId: INDEX_MAP_ID,
      shapeId: 'ring',
    })
  })

  it('falls back to the first shape when nothing persisted (1D default = line)', () => {
    expect(resolveLayoutSelection({}, 1, SOURCE)).toEqual({ mapId: INDEX_MAP_ID, shapeId: 'line' })
  })

  it('falls back to the default shape when the persisted id is no longer offered', () => {
    expect(resolveLayoutSelection({ shapeId: 'helix' }, 1, SOURCE)).toEqual({
      mapId: INDEX_MAP_ID,
      shapeId: 'line',
    })
  })

  it('restores a persisted map + surface for a 2D pattern', () => {
    expect(resolveLayoutSelection({ mapId: 'plane', surfaceId: 'cylinder' }, 2, SOURCE)).toEqual({
      mapId: 'plane',
      surfaceId: 'cylinder',
    })
  })

  it('uses the selected 3D map dimension, not Pattern dimension, to choose embeddings', () => {
    expect(resolveLayoutSelection({ mapId: 'cube', shapeId: 'ring' }, 1, SOURCE)).toEqual({
      mapId: 'cube',
    })
  })

  it('defaults a 2D pattern to the first map and Flat', () => {
    expect(resolveLayoutSelection({}, 2, SOURCE)).toEqual({ mapId: 'plane', surfaceId: 'flat' })
  })

  it('drops a stale cylinder back to Flat on an irregular map', () => {
    expect(resolveLayoutSelection({ mapId: 'ring2d', surfaceId: 'cylinder' }, 2, SOURCE)).toEqual({
      mapId: 'ring2d',
      surfaceId: 'flat',
    })
  })

  it('ignores a persisted shapeId when the pattern is 2D', () => {
    expect(resolveLayoutSelection({ shapeId: 'ring' }, 2, SOURCE)).toEqual({
      mapId: 'plane',
      surfaceId: 'flat',
    })
  })

  it('resolves just the map for a 3D pattern', () => {
    expect(resolveLayoutSelection({ mapId: 'cube' }, 3, SOURCE)).toEqual({ mapId: 'cube' })
  })

  it('still offers the implicit Index view when no real maps exist', () => {
    expect(resolveLayoutSelection({}, 3, { shapes: [], surfaces: [], maps: [] })).toEqual({
      mapId: INDEX_MAP_ID,
    })
  })

  it('honours a seeded map id, ignoring the first-match default', () => {
    // Demo recommendations now arrive pre-seeded into the persisted selection
    // (the settings cascade), so they resolve like any persisted map.
    const source: LayoutSource = {
      ...SOURCE,
      maps: [...SOURCE.maps, { id: 'sphere', name: 'Sphere', dim: 3 }],
    }
    expect(resolveLayoutSelection({ mapId: 'sphere' }, 3, source)).toEqual({ mapId: 'sphere' })
  })
})

describe('resolveSolidity', () => {
  it('honours a persisted solidity above all else', () => {
    expect(resolveSolidity(0.4, 0.3, 1)).toBe(0.4)
    // Persisted 0 wins over the recommendation (a real value, not absent).
    expect(resolveSolidity(0, 0.3, 1)).toBe(0)
  })

  it('falls back to the recommendation when nothing is persisted', () => {
    expect(resolveSolidity(undefined, 0.3, 1)).toBe(0.3)
  })

  it('falls back to the global default when neither is present', () => {
    expect(resolveSolidity(undefined, undefined, 1)).toBe(1)
  })
})
