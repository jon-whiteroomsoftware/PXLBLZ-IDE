import {
  resolveLayout,
  effectivePixelCount,
  INDEX_MAP_ID,
  type LayoutSource,
  type ResolveLayoutDeps,
  type ResolveLayoutInput,
} from './layout'
import type { MapPoint, PixelMap } from './maps'

// The Layout catalogue under test: line/ring shapes, flat/cylinder surfaces, and
// a spread of maps covering every resolve branch (plane, 2D cloud, cube lattice,
// 3D shells with different normal recipes, an irregular 3D cloud).
const SOURCE: LayoutSource = {
  shapes: [
    { id: 'line', name: 'Line', displayDim: 1 },
    { id: 'ring', name: 'Ring', displayDim: 2 },
    { id: 'pole', name: 'Pole', displayDim: 3 },
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
    { id: 'cube-shell', name: 'Cube (shell)', dim: 3 },
    { id: 'star-shell', name: 'Star (shell)', dim: 3 },
    { id: 'sphere', name: 'Sphere', dim: 3 },
    { id: 'helix', name: 'Helix', dim: 3 },
  ],
}

// A fake map whose resolve() emits `pixelCount` points already inside [0,1], so
// the real aspect-normalization pass (Contain) is a benign pass-through and the
// branch logic — not the geometry — is what each test exercises.
function makeMap(opts: Partial<PixelMap> & Pick<PixelMap, 'id' | 'dim'>): PixelMap {
  const is3D = opts.dim === 3
  return {
    name: opts.id,
    builtin: true,
    // Default: no clean grid. The Square overrides this below to a 1-row strip so
    // the cylinder-wrap branch has a grid to lift, mirroring a wrappable stock map.
    gridDims: () => null,
    ...opts,
    resolve(pixelCount: number): MapPoint[] {
      return Array.from({ length: pixelCount }, (_, i) => {
        const t = pixelCount > 1 ? i / (pixelCount - 1) : 0
        const pos = is3D ? ([t, t, t] as [number, number, number]) : ([t, t] as [number, number])
        const sample = is3D ? [t, t, t] : [t, t]
        return { sample, pos }
      })
    },
  }
}

function makeCylinderMap(
  id: string,
  dim: 1 | 2 | 3,
  view: 'strand' | 'surface' | 'spatial',
  natural = false,
): PixelMap {
  return {
    id,
    name: `Cylinder · ${view}`,
    builtin: true,
    dim,
    displayDim: 3,
    family: { id: 'cylinder', name: 'Cylinder', view, natural },
    gridDims: (count) => ({ cols: Math.ceil(Math.sqrt(count)), rows: Math.ceil(count / Math.ceil(Math.sqrt(count))) }),
    resolve: (count) => Array.from({ length: count }, (_, index) => {
      const t = count > 1 ? index / (count - 1) : 0
      const pos: [number, number, number] = [0.5 + 0.2 * Math.cos(t * Math.PI * 2), t, 0.5 + 0.2 * Math.sin(t * Math.PI * 2)]
      const sample = dim === 1 ? [t] : dim === 2 ? [t, t] : [...pos]
      return { sample, pos }
    }),
  }
}

const MAPS: Record<string, PixelMap> = {
  reverse1d: {
    id: 'reverse1d',
    name: 'Reverse strand',
    builtin: false,
    dim: 1,
    bakedCount: 3,
    gridDims: () => null,
    resolve: (pixelCount) => Array.from({ length: pixelCount }, (_, i) => ({
      sample: [pixelCount > 1 ? 1 - i / (pixelCount - 1) : 0],
    })),
  },
  plane: makeMap({ id: 'plane', dim: 2, gridDims: (count) => ({ cols: count, rows: 1 }) }),
  ring2d: makeMap({ id: 'ring2d', dim: 2, bakedCount: 60 }),
  'cylinder-strand': makeCylinderMap('cylinder-strand', 1, 'strand'),
  'cylinder-surface': makeCylinderMap('cylinder-surface', 2, 'surface', true),
  'cylinder-spatial': makeCylinderMap('cylinder-spatial', 3, 'spatial'),
  // A non-`plane` 2D map that still resolves to a clean lattice (the Wide 2:1 case):
  // its label must come from its own gridDims, not from a hard-coded id check.
  wide: makeMap({ id: 'wide', dim: 2, gridDims: (count) => ({ cols: count, rows: 2 }) }),
  // Mirrors the real cube: a side³ lattice that reports cols×rows×depth from count.
  cube: makeMap({
    id: 'cube',
    dim: 3,
    gridDims: (count) => {
      const side = Math.round(Math.cbrt(count))
      return { cols: side, rows: side, depth: side }
    },
  }),
  'cube-shell': makeMap({ id: 'cube-shell', dim: 3, normals: 'face' }),
  'star-shell': makeMap({ id: 'star-shell', dim: 3, normals: 'star' }),
  sphere: makeMap({ id: 'sphere', dim: 3, normals: 'centroid' }),
  helix: makeMap({ id: 'helix', dim: 3 }),
}

const deps: ResolveLayoutDeps = {
  resolveMap: (mapId) => MAPS[mapId ?? 'plane'] ?? MAPS.plane,
  defaultCountForDim: (dim) => (dim === 1 ? 100 : dim === 2 ? 256 : 512),
}

function input(over: Partial<ResolveLayoutInput>): ResolveLayoutInput {
  return {
    selection: {},
    nativeDim: 2,
    source: SOURCE,
    persistedCount: null,
    normalizeMode: 'contain',
    poleCols: null,
    shapeDefaultCount: 100,
    ...over,
  }
}

describe('effectivePixelCount — the modeled-count precedence chain', () => {
  it('persisted beats recommended beats baked beats fallback', () => {
    expect(effectivePixelCount({ persisted: 7, recommended: 8, baked: 9, fallback: 10 })).toBe(7)
    expect(effectivePixelCount({ persisted: null, recommended: 8, baked: 9, fallback: 10 })).toBe(8)
    expect(effectivePixelCount({ persisted: null, baked: 9, fallback: 10 })).toBe(9)
    expect(effectivePixelCount({ persisted: null, fallback: 10 })).toBe(10)
  })

  it('treats a 0 count as a real value (not skipped by ??)', () => {
    expect(effectivePixelCount({ persisted: 0, fallback: 10 })).toBe(0)
  })
})

describe('resolveLayout — 1D shapes', () => {
  it('combines a true 1D map sample with an independent ring position', () => {
    const r = resolveLayout(
      input({
        nativeDim: 1,
        selection: { mapId: 'reverse1d', shapeId: 'ring' },
      }),
      deps,
    )
    expect(r.correctedSelection).toEqual({ mapId: 'reverse1d', shapeId: 'ring' })
    expect(r.pixelCount).toBe(3)
    expect(r.mapPoints.map((p) => p.sample)).toEqual([[65535 / 65536], [0.5], [0]])
    expect(r.mapPoints.every((p) => p.pos?.length === 2)).toBe(true)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
  })

  it('line draws through the 2D channel with implicit index samples', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'line' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(1)
    expect(r.draw.positions).toHaveLength(r.pixelCount)
    expect(r.mapPoints[0].sample).toEqual([0])
    expect(r.mapPoints[r.mapPoints.length - 1]?.sample[0]).toBeCloseTo(
      (r.pixelCount - 1) / r.pixelCount,
    )
    expect(r.layoutLabel).toBeNull()
  })

  it('ring is a 2D-display shape, still the 2D channel', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'ring' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
  })

  it('pole wraps a 1D strip into the 3D channel with normals', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'pole' } }), deps)
    expect(r.draw.kind).toBe('3d')
    expect(r.displayDim).toBe(3)
    if (r.draw.kind === '3d') {
      expect(r.draw.normals).not.toBeNull()
      expect(r.draw.normals).toHaveLength(r.pixelCount)
    }
  })

  it('honours the persisted count, else the shape default', () => {
    expect(resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'line' } }), deps).pixelCount).toBe(100)
    expect(
      resolveLayout(input({ nativeDim: 1, selection: { shapeId: 'line' }, persistedCount: 42 }), deps).pixelCount,
    ).toBe(42)
  })
})

describe('resolveLayout — 2D maps', () => {
  it.each(['contain', 'fill'] as const)(
    'caps %s sample endpoints to the hardware maximum without shrinking preview positions',
    (normalizeMode) => {
      const r = resolveLayout(
        input({ selection: { mapId: 'plane', surfaceId: 'flat' }, persistedCount: 2, normalizeMode }),
        deps,
      )
      expect(r.mapPoints[1].sample).toEqual([65535 / 65536, 65535 / 65536])
      expect(r.mapPoints[1].pos).toEqual([1, 1])
    },
  )

  it('plane reports a cols×rows label and draws 2D', () => {
    const r = resolveLayout(input({ selection: { mapId: 'plane', surfaceId: 'flat' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
    expect(r.layoutLabel).toMatch(/^\d+×\d+$/)
    expect(r.pixelCount).toBe(256) // dim-2 default
  })

  it('a non-plane 2D grid map (Wide) still reports its cols×rows label', () => {
    const r = resolveLayout(input({ selection: { mapId: 'wide', surfaceId: 'flat' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
    expect(r.layoutLabel).toMatch(/^\d+×\d+$/)
  })

  it('a 2D cloud defaults its count to the baked length', () => {
    const r = resolveLayout(input({ selection: { mapId: 'ring2d', surfaceId: 'flat' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.pixelCount).toBe(60)
    expect(r.layoutLabel).toBeNull()
  })

  it('cylinder surface lifts a wrappable map into the 3D channel', () => {
    const r = resolveLayout(input({ selection: { mapId: 'plane', surfaceId: 'cylinder' } }), deps)
    expect(r.draw.kind).toBe('3d')
    expect(r.displayDim).toBe(3)
    if (r.draw.kind === '3d') expect(r.draw.normals).not.toBeNull()
    // The map keeps owning `sample`; only `pos` is the surface's.
    expect(r.mapPoints[0].sample).toHaveLength(2)
  })

  it('cylinder on a non-grid map stays flat 2D', () => {
    const r = resolveLayout(input({ selection: { mapId: 'ring2d', surfaceId: 'cylinder' } }), deps)
    expect(r.draw.kind).toBe('2d')
    expect(r.displayDim).toBe(2)
  })
})

describe('resolveLayout — generated geometry coordinate views', () => {
  it.each([
    ['cylinder-strand', 1],
    ['cylinder-surface', 2],
    ['cylinder-spatial', 3],
  ] as const)('draws %s from its intrinsic 3D positions without a separate embedding', (mapId, dim) => {
    const r = resolveLayout(input({ nativeDim: dim, selection: { mapId }, persistedCount: 24 }), deps)
    expect(r.correctedSelection).toEqual({ mapId })
    expect(r.mapDim).toBe(dim)
    expect(r.mapPoints[0].sample).toHaveLength(dim)
    expect(r.mapPoints[0].pos).toHaveLength(3)
    expect(r.draw.kind).toBe('3d')
    expect(r.displayDim).toBe(3)
  })

  it('keeps positions stable while the selected view changes samples', () => {
    const results = ['cylinder-strand', 'cylinder-surface', 'cylinder-spatial'].map((mapId) =>
      resolveLayout(input({ selection: { mapId }, persistedCount: 24 }), deps),
    )
    expect(results[0].mapPoints.map((point) => point.pos)).toEqual(results[1].mapPoints.map((point) => point.pos))
    expect(results[1].mapPoints.map((point) => point.pos)).toEqual(results[2].mapPoints.map((point) => point.pos))
  })
})

describe('resolveLayout — 3D maps', () => {
  it('cube squares the count up and labels s×s×s', () => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId: 'cube' }, persistedCount: 512 }), deps)
    expect(r.draw.kind).toBe('3d')
    expect(r.layoutLabel).toBe('8×8×8')
    expect(r.pixelCount).toBe(512)
  })

  it('keeps a rounded cube lattice within an optional realized-count ceiling', () => {
    const r = resolveLayout(input({
      nativeDim: 3,
      selection: { mapId: 'cube' },
      persistedCount: 2048,
      maxPixelCount: 2048,
    }), deps)

    expect(r.layoutLabel).toBe('12×12×12')
    expect(r.pixelCount).toBe(1728)
  })

  it('caps exact-count layouts at the same optional ceiling', () => {
    const r = resolveLayout(input({
      selection: { mapId: 'plane', surfaceId: 'flat' },
      persistedCount: 4096,
      maxPixelCount: 2048,
    }), deps)

    expect(r.pixelCount).toBe(2048)
  })

  it.each([
    ['cube-shell', 'face normals'],
    ['star-shell', 'star normals'],
    ['sphere', 'centroid normals'],
  ])('a solid-eligible %s map carries normals (%s)', (mapId) => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId } }), deps)
    expect(r.draw.kind).toBe('3d')
    if (r.draw.kind === '3d') {
      expect(r.draw.normals).not.toBeNull()
      expect(r.draw.normals).toHaveLength(r.pixelCount)
    }
  })

  it('a non-eligible 3D cloud (helix) carries no normals', () => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId: 'helix' } }), deps)
    expect(r.draw.kind).toBe('3d')
    if (r.draw.kind === '3d') expect(r.draw.normals).toBeNull()
  })
})

describe('resolveLayout — selection correction & precedence', () => {
  it('resolves a 1D Pattern against a selected 3D map', () => {
    const r = resolveLayout(input({ nativeDim: 1, selection: { mapId: 'cube' } }), deps)
    expect(r.mapDim).toBe(3)
    expect(r.correctedSelection).toEqual({ mapId: 'cube' })
    expect(r.mapPoints[0].sample).toHaveLength(3)
    expect(r.draw.kind).toBe('3d')
  })

  it('resolves a 3D Pattern against Index with an independent Shape', () => {
    const r = resolveLayout(
      input({ nativeDim: 3, selection: { mapId: INDEX_MAP_ID, shapeId: 'ring' } }),
      deps,
    )
    expect(r.mapDim).toBe(1)
    expect(r.correctedSelection).toEqual({ mapId: INDEX_MAP_ID, shapeId: 'ring' })
    expect(r.mapPoints[0].sample).toHaveLength(1)
    expect(r.displayDim).toBe(2)
  })

  it('corrects a stale 1D shape on a 2D pattern and reports it', () => {
    // A 2D pattern carrying only a stale shapeId gets a map + flat surface.
    const r = resolveLayout(input({ nativeDim: 2, selection: { shapeId: 'line' } }), deps)
    expect(r.correctedSelection.mapId).toBe('plane')
    expect(r.correctedSelection.shapeId).toBeUndefined()
    expect(r.draw.kind).toBe('2d')
  })

  // Demo recommendations no longer enter resolveLayout: the settings cascade
  // seeds a recommended map/count into the persisted selection upstream,
  // so they arrive here as ordinary persisted values.
  it('honours a seeded map id in the selection', () => {
    const r = resolveLayout(input({ nativeDim: 3, selection: { mapId: 'sphere' } }), deps)
    expect(r.correctedSelection.mapId).toBe('sphere')
  })

  it('honours a seeded pixel count over the per-dim default', () => {
    const r = resolveLayout(
      input({ nativeDim: 3, selection: { mapId: 'helix' }, persistedCount: 4096 }),
      deps,
    )
    expect(r.pixelCount).toBe(4096)
  })
})
