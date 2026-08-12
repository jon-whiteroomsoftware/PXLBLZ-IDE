import { SOURCE_STOCK_MAPS, STOCK_MAP_SPECS, SEED_MAP_IDS, stockMapSpec } from './stockCatalogue'
import { squarePlaneDims, widePlaneDims } from '@/engine/maps/plane'
import { STAR_FACES, starShellNormals, starSurfaceRadius } from '@/engine/maps/starGeometry'
import { evalMapSource } from '@/engine/maps/evalMapSource'

function mapById(id: string) {
  const m = SOURCE_STOCK_MAPS.find((m) => m.id === id)
  if (!m) throw new Error(`no stock map ${id}`)
  return m
}

describe('stock catalogue', () => {
  it('pairs each stock id with metadata and a non-empty raw source', () => {
    expect(STOCK_MAP_SPECS.map((s) => s.id)).toEqual([
      'plane',
      'plane-strand',
      'wide',
      'wide-strand',
      'panel-winding',
      'panel-winding-strand',
      'cylinder-strand',
      'cylinder-surface',
      'cylinder-spatial',
      'clustered-helical-mast-strand',
      'clustered-helical-mast-surface',
      'clustered-helical-mast-spatial',
      'cube-volume-strand',
      'cube',
      'cube-shell-strand',
      'cube-shell',
      'star-shell-strand',
      'star-shell',
      'star-volume-strand',
      'star-volume',
      'sphere-shell-strand',
      'seed-sphere-3d',
      'sphere-volume-strand',
      'sphere-volume',
      'tetra-shell-strand',
      'tetra-shell',
      'tetra-volume-strand',
      'tetra-volume',
      'redline-stage-2d',
      'proscenium-stage-2d',
      'seed-ring-2d',
    ])
    for (const s of STOCK_MAP_SPECS) {
      expect(() => evalMapSource(s.source, 160)).not.toThrow()
    }
  })

  it('catalogues Cylinder once with three ordinary coordinate views', () => {
    const views = STOCK_MAP_SPECS.filter((spec) => spec.family?.id === 'cylinder')
    expect(views.map((spec) => spec.family?.view)).toEqual(['strand', 'surface', 'spatial'])
    expect(views.filter((spec) => spec.family?.natural)).toHaveLength(1)
    expect(views.find((spec) => spec.family?.natural)?.id).toBe('cylinder-surface')
    expect(views.map((spec) => spec.dim)).toEqual([1, 2, 3])
  })

  it('catalogues the clustered helical mast as three views of one physical path', () => {
    const views = STOCK_MAP_SPECS.filter((spec) => spec.family?.id === 'clustered-helical-mast')
    expect(views.map((spec) => spec.family?.view)).toEqual(['strand', 'surface', 'spatial'])
    expect(views.find((spec) => spec.family?.natural)?.id).toBe('clustered-helical-mast-surface')

    const resolved = views.map((spec) => mapById(spec.id).resolve(52))
    expect(resolved.map((points) => points[0].sample.length)).toEqual([1, 2, 3])
    expect(resolved[0].map((point) => point.pos)).toEqual(resolved[1].map((point) => point.pos))
    expect(resolved[1].map((point) => point.pos)).toEqual(resolved[2].map((point) => point.pos))
  })

  it('declares physical catalogue classification explicitly on every stock entry', () => {
    expect(STOCK_MAP_SPECS.every((spec) => spec.kind)).toBe(true)
    expect(stockMapSpec('seed-ring-2d')?.kind).toBe('path')
    expect(stockMapSpec('clustered-helical-mast-surface')?.kind).toBe('path')
    expect(stockMapSpec('plane')?.kind).toBe('surface')
    expect(stockMapSpec('seed-sphere-3d')?.kind).toBe('shell')
    expect(stockMapSpec('sphere-volume')?.kind).toBe('volume')
    expect(stockMapSpec('redline-stage-2d')?.kind).toBe('custom')
  })

  it('declares the supported view matrix from generator capabilities', () => {
    const matrix = Object.fromEntries(
      ['square-grid', 'wide-grid', 'panel-winding', 'clustered-helical-mast', 'cube-volume', 'cube-shell', 'star-shell', 'star-volume', 'sphere-shell', 'sphere-volume', 'tetra-shell', 'tetra-volume']
        .map((familyId) => [
          familyId,
          STOCK_MAP_SPECS
            .filter((spec) => spec.family?.id === familyId)
            .map((spec) => spec.family!.view),
        ]),
    )
    expect(matrix).toEqual({
      'square-grid': ['surface', 'strand'],
      'wide-grid': ['surface', 'strand'],
      'panel-winding': ['surface', 'strand'],
      'clustered-helical-mast': ['strand', 'surface', 'spatial'],
      'cube-volume': ['strand', 'spatial'],
      'cube-shell': ['strand', 'spatial'],
      'star-shell': ['strand', 'spatial'],
      'star-volume': ['strand', 'spatial'],
      'sphere-shell': ['strand', 'spatial'],
      'sphere-volume': ['strand', 'spatial'],
      'tetra-shell': ['strand', 'spatial'],
      'tetra-volume': ['strand', 'spatial'],
    })
    expect(stockMapSpec('seed-ring-2d')?.family).toBeUndefined()
    expect(stockMapSpec('redline-stage-2d')?.family).toBeUndefined()
  })

  it('builds live builtin maps of the declared dimensionality', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.builtin).toBe(true)
      expect(m.bakedCount).toBeUndefined()
    }
    expect(mapById('plane').dim).toBe(2)
    expect(mapById('cube').dim).toBe(3)
    expect(mapById('redline-stage-2d').dim).toBe(2)
    expect(mapById('proscenium-stage-2d').dim).toBe(2)
    expect(mapById('seed-ring-2d').dim).toBe(2)
    expect(mapById('seed-sphere-3d').dim).toBe(3)
  })

  it('ships each shell its normal recipe, so eligibility lives in the catalogue', () => {
    // The Sphere vouches a centroid normal is honest; the Cube shell carries per-
    // face normals; the Star shell its stellation faces. The recipe's PRESENCE is
    // the solid-eligibility gate. The volume Cube and every other stock map carry
    // no recipe and stay see-through.
    expect(mapById('seed-sphere-3d').normals).toBe('centroid')
    expect(mapById('cube-shell').normals).toBe('face')
    expect(mapById('star-shell').normals).toBe('star')
    expect(mapById('cylinder-surface').normals).toBe('cylinder')
    expect(mapById('cube').normals).toBeUndefined()
    expect(mapById('plane').normals).toBeUndefined()
    expect(mapById('redline-stage-2d').normals).toBeUndefined()
    expect(mapById('proscenium-stage-2d').normals).toBeUndefined()
    // A volume has no per-point boundary normal, so a solid ball / solid star is
    // never solid-eligible — it leans on the renderer's depth-tested opaque cores.
    expect(mapById('sphere-volume').normals).toBeUndefined()
    expect(mapById('star-volume').normals).toBeUndefined()
    // The Tetra joins the scheme: shell carries per-face normals, volume does not.
    expect(mapById('tetra-shell').normals).toBe('tetra')
    expect(mapById('tetra-volume').normals).toBeUndefined()
  })

  it('derives a wrappable grid live from the count, null for everything else', () => {
    // The Square squares up; the Wide runs 2:1 — both from the count, mirroring
    // their `.js` sources, so the cylinder wrap and layout readout read the grid
    // off the map with no provenance switch.
    expect(mapById('plane').gridDims(100)).toEqual(squarePlaneDims(100))
    expect(mapById('panel-winding').gridDims(100)).toEqual(squarePlaneDims(100))
    expect(mapById('wide').gridDims(100)).toEqual(widePlaneDims(100))
    // The volumetric cube is a regular side³ lattice, so it reports cols×rows×depth
    // (512 = 8³). An irregular 2D cloud and the shells still expose no clean lattice.
    expect(mapById('cube').gridDims(512)).toEqual({ cols: 8, rows: 8, depth: 8 })
    expect(mapById('redline-stage-2d').gridDims(2000)).toBeNull()
    expect(mapById('proscenium-stage-2d').gridDims(1000)).toBeNull()
    expect(mapById('seed-ring-2d').gridDims(60)).toBeNull()
  })

  it('exposes the relocated cloud ids for IDB pruning', () => {
    expect(SEED_MAP_IDS).toEqual(['seed-sphere-3d', 'seed-ring-2d'])
  })
})

describe('source regeneration', () => {
  it('places clustered helical mast pixels at each three-emitter group centre', () => {
    const spec = stockMapSpec('clustered-helical-mast-spatial')
    expect(spec).toBeDefined()

    const raw = evalMapSource(spec!.source, 52)
    expect(raw).toHaveLength(52)
    expect(raw[0][1]).toBeCloseTo(5.559370, 6)
    expect(raw[1][1] - raw[0][1]).toBeCloseTo(16.678110, 6)
    expect(raw[raw.length - 1][1] - raw[0][1]).toBeCloseTo(850.583620, 6)
    expect(Math.hypot(raw[0][0] - 11, raw[0][2] - 11)).toBeCloseTo(11, 6)
    expect(raw[0][2]).toBeLessThan(11)

    const points = mapById('clustered-helical-mast-spatial').resolve(52)
    expect(points).toHaveLength(52)
    expect(points.every((point) => point.sample.length === 3)).toBe(true)
    expect(points[0].sample[1]).toBeLessThan(points[points.length - 1].sample[1])
  })

  it('builds the 2,000-pixel Redline installation as one panel and four targets', () => {
    const points = mapById('redline-stage-2d').resolve(2_000)
    const center = points.slice(0, 800)
    const targets = Array.from({ length: 4 }, (_, index) => (
      points.slice(800 + index * 300, 1_100 + index * 300)
    ))

    expect(points).toHaveLength(2_000)
    expect(center).toHaveLength(800)
    expect(targets.every((target) => target.length === 300)).toBe(true)
    expect(points.every((point) => point.sample.length === 2 && point.pos?.length === 2)).toBe(true)

    const bounds = (group: typeof points) => ({
      minX: Math.min(...group.map((point) => point.pos![0])),
      maxX: Math.max(...group.map((point) => point.pos![0])),
      minY: Math.min(...group.map((point) => point.pos![1])),
      maxY: Math.max(...group.map((point) => point.pos![1])),
    })
    const panelBounds = bounds(center)
    expect(panelBounds.maxX - panelBounds.minX).toBeGreaterThan(
      2 * (panelBounds.maxY - panelBounds.minY),
    )

    const targetCenters = targets.map((target) => {
      const targetBounds = bounds(target)
      return [
        (targetBounds.minX + targetBounds.maxX) / 2,
        (targetBounds.minY + targetBounds.maxY) / 2,
      ]
    })
    expect(targetCenters[0][0]).toBeLessThan(panelBounds.minX)
    expect(targetCenters[1][0]).toBeLessThan(panelBounds.minX)
    expect(targetCenters[2][0]).toBeGreaterThan(panelBounds.maxX)
    expect(targetCenters[3][0]).toBeGreaterThan(panelBounds.maxX)
    expect(targetCenters[0][1]).toBeLessThan(targetCenters[1][1])
    expect(targetCenters[2][1]).toBeLessThan(targetCenters[3][1])
  })

  it('builds the 1,000-pixel Proscenium stage as a walk: left column, stage, arch, right column', () => {
    const points = mapById('proscenium-stage-2d').resolve(1_000)
    const leftColumn = points.slice(0, 250)
    const stage = points.slice(250, 500)
    const arch = points.slice(500, 750)
    const rightColumn = points.slice(750, 1_000)

    expect(points).toHaveLength(1_000)
    expect(points.every((point) => point.sample.length === 2 && point.pos?.length === 2)).toBe(true)

    const bounds = (group: typeof points) => ({
      minX: Math.min(...group.map((point) => point.pos![0])),
      maxX: Math.max(...group.map((point) => point.pos![0])),
      minY: Math.min(...group.map((point) => point.pos![1])),
      maxY: Math.max(...group.map((point) => point.pos![1])),
    })
    const stageBounds = bounds(stage)
    const archBounds = bounds(arch)
    const leftBounds = bounds(leftColumn)
    const rightBounds = bounds(rightColumn)
    const all = bounds(points)

    // The columns flank the arch; the arch band frames the stage field on
    // both sides and from above (+y renders downward); nothing overlaps.
    expect(leftBounds.maxX).toBeLessThan(archBounds.minX)
    expect(rightBounds.minX).toBeGreaterThan(archBounds.maxX)
    expect(archBounds.minX).toBeLessThan(stageBounds.minX)
    expect(archBounds.maxX).toBeGreaterThan(stageBounds.maxX)
    expect(archBounds.minY).toBeLessThan(stageBounds.minY)

    // The arch is pointed: its apex sits at the top centre of the silhouette,
    // well above the column tops.
    const apex = arch.reduce((lowest, point) => (point.pos![1] < lowest.pos![1] ? point : lowest))
    expect(apex.pos![1]).toBeLessThan(0.1 * (all.maxY - all.minY) + all.minY)
    expect(Math.abs(apex.pos![0] - (all.minX + all.maxX) / 2)).toBeLessThan(0.2)
    expect(apex.pos![1]).toBeLessThan(leftBounds.minY)
    expect(apex.pos![1]).toBeLessThan(rightBounds.minY)

    // The arch walks like its wiring: each strand starts at the deck on the
    // left, climbs the leg (+y renders downward, so y decreases), crosses the
    // apex, and returns to the deck on the right.
    expect(arch[0].pos![1]).toBeGreaterThan(archBounds.maxY - 0.2)
    expect(arch[0].pos![0]).toBeLessThan((all.minX + all.maxX) / 2)
    expect(arch[arch.length - 1].pos![1]).toBeGreaterThan(archBounds.maxY - 0.2)
    expect(arch[arch.length - 1].pos![0]).toBeGreaterThan((all.minX + all.maxX) / 2)
    for (let i = 1; i < 5; i++) {
      expect(arch[i].pos![1]).toBeLessThan(arch[i - 1].pos![1])
    }

    // Columns and stage wire from the deck upward, and the columns run tall
    // enough to flank most of the stage height.
    expect(leftColumn[0].pos![1]).toBeGreaterThan(leftColumn[leftColumn.length - 1].pos![1])
    expect(rightColumn[0].pos![1]).toBeGreaterThan(rightColumn[rightColumn.length - 1].pos![1])
    expect(stage[0].pos![1]).toBeGreaterThan(stage[stage.length - 1].pos![1])
    expect(leftBounds.maxY - leftBounds.minY).toBeGreaterThan((stageBounds.maxY - stageBounds.minY) * 0.9)

    // The whole silhouette keeps the wide preview-filling aspect the Redline
    // stage established (~1.7:1).
    const aspect = (all.maxX - all.minX) / (all.maxY - all.minY)
    expect(aspect).toBeGreaterThan(1.55)
    expect(aspect).toBeLessThan(1.85)
  })

  it('regenerates exactly pixelCount points for any count (no baked replay)', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.resolve(7)).toHaveLength(7)
      expect(m.resolve(200)).toHaveLength(200)
    }
    // The exact-count contract holds down to degenerate counts; the
    // Proscenium generator honors it without a minimum-count floor.
    for (const count of [1, 2, 3]) {
      expect(mapById('proscenium-stage-2d').resolve(count)).toHaveLength(count)
    }
  })

  it('ships only procedural stock maps: no entry pins a measured point count', () => {
    // The last literal coordinate-array stock maps (the sunflower pucks)
    // retired with #707; every remaining source regenerates for any count,
    // so no stock entry carries fixedPixelCount into output-contract setup.
    for (const m of SOURCE_STOCK_MAPS) {
      expect(m.fixedPixelCount, m.id).toBeUndefined()
    }
  })

  it('normalizes every coordinate into [0,1] per axis', () => {
    for (const m of SOURCE_STOCK_MAPS) {
      for (const pt of m.resolve(120)) {
        for (const c of pt.sample) {
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
        if (!m.family) expect(pt.pos).toEqual(pt.sample)
      }
    }
  })

  it('changes Cylinder samples without moving its physical wall points', () => {
    const count = 35
    const strand = mapById('cylinder-strand').resolve(count)
    const surface = mapById('cylinder-surface').resolve(count)
    const spatial = mapById('cylinder-spatial').resolve(count)

    expect(strand.map((point) => point.pos)).toEqual(surface.map((point) => point.pos))
    expect(surface.map((point) => point.pos)).toEqual(spatial.map((point) => point.pos))
    expect(strand.every((point) => point.sample.length === 1)).toBe(true)
    expect(surface.every((point) => point.sample.length === 2)).toBe(true)
    expect(spatial.every((point) => point.sample.length === 3)).toBe(true)
    expect(strand.map((point) => point.sample[0])).toEqual(
      Array.from({ length: count }, (_, index) => index / (count - 1)),
    )
  })

  it('keeps Cylinder row-major wire order, circumference seam, and square-cell aspect', () => {
    const count = 35
    const cylinder = mapById('cylinder-surface')
    const points = cylinder.resolve(count)
    const dims = cylinder.gridDims(count)
    expect(dims).toEqual(squarePlaneDims(count))

    const cols = dims!.cols
    expect(points[0].sample).toEqual([0, 0])
    expect(points[cols].sample[1]).toBeGreaterThan(points[0].sample[1])
    expect(points[cols - 1].pos).not.toEqual(points[0].pos)
    expect(points[cols].pos?.[0]).toBeCloseTo(points[0].pos![0], 12)
    expect(points[cols].pos![2]!).toBeCloseTo(points[0].pos![2]!, 12)
  })

  it('keeps every retrofitted family position-stable while Strand follows wire order', () => {
    const count = 120
    const families = new Map<string, typeof SOURCE_STOCK_MAPS>()
    for (const map of SOURCE_STOCK_MAPS) {
      if (!map.family || map.family.id === 'cylinder') continue
      families.set(map.family.id, [...(families.get(map.family.id) ?? []), map])
    }

    for (const [familyId, maps] of families) {
      expect(maps.length, familyId).toBeGreaterThan(1)
      const resolved = maps.map((map) => map.resolve(count))
      for (let index = 1; index < resolved.length; index++) {
        expect(resolved[index].map((point) => point.pos), familyId).toEqual(
          resolved[0].map((point) => point.pos),
        )
      }
      const strand = maps.find((map) => map.family?.view === 'strand')!
      expect(strand.resolve(count).map((point) => point.sample[0]), familyId).toEqual(
        Array.from({ length: count }, (_, index) => index / (count - 1)),
      )
    }
  })

  it('does not synthesize Surface views for shells or volumes', () => {
    const spatialFamilies = STOCK_MAP_SPECS.filter((spec) => spec.kind === 'shell' || spec.kind === 'volume')
    expect(spatialFamilies.some((spec) => spec.family?.view === 'surface')).toBe(false)
    expect(spatialFamilies.filter((spec) => spec.kind === 'shell').every((spec) => spec.normals)).toBe(true)
    expect(spatialFamilies.filter((spec) => spec.kind === 'volume').every((spec) => !spec.normals)).toBe(true)
  })

  it('keeps shell and volume siblings as different physical distributions', () => {
    for (const [shellId, volumeId] of [
      ['cube-shell', 'cube'],
      ['star-shell', 'star-volume'],
      ['seed-sphere-3d', 'sphere-volume'],
      ['tetra-shell', 'tetra-volume'],
    ]) {
      expect(mapById(shellId).resolve(120).map((point) => point.pos)).not.toEqual(
        mapById(volumeId).resolve(120).map((point) => point.pos),
      )
    }
  })

  it('clouds do not origin-snap on a count bump (live, not frozen)', () => {
    // A baked cloud would pad past its frozen length with the origin; a live one
    // never does — the last point is real geometry at any count.
    const ring = mapById('seed-ring-2d').resolve(300)
    const last = ring[ring.length - 1].pos!
    expect(last).not.toEqual([0, 0])
  })
})

describe('plane no-regression (byte-stable 2D baseline)', () => {
  it('reproduces the legacy grid x = col/(cols-1), y = row/(rows-1)', () => {
    const plane = mapById('plane')
    for (const count of [1024, 256, 99, 1]) {
      const { cols, rows } = squarePlaneDims(count)
      const pts = plane.resolve(count)
      for (let i = 0; i < count; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        const x = cols > 1 ? col / (cols - 1) : 0
        const y = rows > 1 ? row / (rows - 1) : 0
        expect(pts[i].sample).toEqual([x, y])
      }
    }
  })
})

describe('wide grid', () => {
  it('lays out roughly twice as wide as it is tall', () => {
    const wide = mapById('wide')
    for (const count of [200, 512, 1024]) {
      const pts = wide.resolve(count)
      const xs = pts.map((p) => p.sample[0])
      const ys = pts.map((p) => p.sample[1])
      const wSpan = Math.max(...xs) - Math.min(...xs)
      const hSpan = Math.max(...ys) - Math.min(...ys)
      // Normalize anchors the longest (wide) axis to 1.0; the short axis lands near
      // 0.5, i.e. the grid is about 2:1.
      expect(wSpan).toBeCloseTo(1, 5)
      expect(hSpan).toBeGreaterThan(0.4)
      expect(hSpan).toBeLessThan(0.65)
    }
  })
})

// The Star tests work in the source's RAW geometry (centred at the origin),
// before the shared normalize pass, so a point's radius is directly comparable to
// the stellated surface's ray-exit radius along its direction — no normalization
// scale to untangle. `starSurfaceRadius` is the distance to the one triangle a
// ray from the origin passes through.
function rawCoords(id: string, count: number): number[][] {
  return evalMapSource(stockMapSpec(id)!.source, count)
}
// For each raw coord: the fraction of the way from the origin to the surface
// along its direction (1.0 == exactly on the surface).
function surfaceFractions(coords: number[][]): number[] {
  return coords.map((p) => {
    const r = Math.hypot(p[0], p[1], p[2])
    if (r === 0) return 0
    const u: [number, number, number] = [p[0] / r, p[1] / r, p[2] / r]
    return r / starSurfaceRadius(u)
  })
}

describe('star shell (stellated surface)', () => {
  it('is a distinct, solid-eligible 3D map (not the volume)', () => {
    expect(mapById('star-shell').dim).toBe(3)
    expect(mapById('star-shell').normals).toBe('star')
    expect(mapById('star-shell').id).not.toBe(mapById('star-volume').id)
  })

  it('retires the wireframe star id', () => {
    expect(stockMapSpec('star')).toBeUndefined()
  })

  it('places every point ON the stellated surface (radius == ray exit)', () => {
    // Every surface point's radius equals the ray's exit radius through the solid,
    // so its fraction is 1.0.
    for (const f of surfaceFractions(rawCoords('star-shell', 1200))) {
      expect(f).toBeCloseTo(1, 6)
    }
  })

  it.each([512, 1024, 1728])('assigns all %i wire indices distinct surface coordinates', (count) => {
    const coords = rawCoords('star-shell', count)
    const unique = new Set(coords.map((point) => point.map((value) => value.toFixed(12)).join(',')))

    expect(coords).toHaveLength(count)
    expect(unique.size).toBe(count)
  })

  it('yields faceted, outward per-face normals (starShellNormals)', () => {
    const samples = mapById('star-shell').resolve(1200).map((p) => p.sample)
    // centroid of the normalized samples
    const c = [0, 0, 0]
    for (const s of samples) for (let a = 0; a < 3; a++) c[a] += s[a]
    for (let a = 0; a < 3; a++) c[a] /= samples.length
    const normals = starShellNormals(samples as [number, number, number][])
    const distinct = new Set<string>()
    for (let i = 0; i < samples.length; i++) {
      const n = normals[i]
      expect(Math.hypot(n[0], n[1], n[2])).toBeCloseTo(1, 6) // unit length
      // outward: agrees with the radial direction from the centre
      const d = [samples[i][0] - c[0], samples[i][1] - c[1], samples[i][2] - c[2]]
      expect(n[0] * d[0] + n[1] * d[1] + n[2] * d[2]).toBeGreaterThan(0)
      distinct.add(n.map((v) => v.toFixed(3)).join(','))
    }
    // Many distinct face normals — a faceted shell, not a smooth sphere.
    expect(distinct.size).toBeGreaterThan(20)
  })

  it('exposes all 60 stellation faces', () => {
    expect(STAR_FACES).toHaveLength(60)
  })
})

describe('star volume (filled stellated solid)', () => {
  it('is NOT solid-eligible', () => {
    expect(mapById('star-volume').normals).toBeUndefined()
  })

  it('fills the interior out to the spiky boundary, never past it', () => {
    const fracs = surfaceFractions(rawCoords('star-volume', 2000))
    // No point escapes the stellated surface.
    for (const f of fracs) expect(f).toBeLessThanOrEqual(1 + 1e-6)
    // The fill reaches the rim and the deep interior — not a shell.
    expect(Math.max(...fracs)).toBeGreaterThan(0.9)
    expect(Math.min(...fracs)).toBeLessThan(0.2)
    // A healthy fraction sit well inside the outer half.
    const inner = fracs.filter((f) => f < 0.5).length
    expect(inner / fracs.length).toBeGreaterThan(0.1)
  })
})

describe('2D panel winding', () => {
  it('snakes by column on a 16x16 panel', () => {
    const pts = mapById('panel-winding').resolve(256)

    expect(pts[0].pos).toEqual([0, 0])
    expect(pts[15].pos).toEqual([0, 1])
    expect(pts[16].pos).toEqual([1 / 15, 1])
    expect(pts[31].pos).toEqual([1 / 15, 0])
    expect(pts[32].pos).toEqual([2 / 15, 0])
  })
})

describe('cube lattice', () => {
  it('orders x-fastest then y then z and spans corner to corner', () => {
    const cube = mapById('cube')
    const pts = cube.resolve(64) // side 4
    expect(pts[0].pos).toEqual([0, 0, 0])
    expect(pts[63].pos).toEqual([1, 1, 1])
    expect(pts[1].pos).toEqual([1 / 3, 0, 0])
    expect(pts[4].pos).toEqual([0, 1 / 3, 0])
    expect(pts[16].pos).toEqual([0, 0, 1 / 3])
  })

  it('collapses a degenerate single-cell lattice to the origin (shared normalize)', () => {
    const cube = mapById('cube')
    expect(cube.resolve(1)[0].pos).toEqual([0, 0, 0])
  })
})

describe('cube shell (faceted 3D shell)', () => {
  const onAFace = (c: number) => Math.abs(c) < 1e-9 || Math.abs(c - 1) < 1e-9

  it('is a distinct 3D map from the volume cube', () => {
    expect(mapById('cube-shell').dim).toBe(3)
    expect(mapById('cube-shell').id).not.toBe(mapById('cube').id)
  })

  it('places every point ON a cube face (one axis pinned to 0 or 1, others interior)', () => {
    for (const { pos } of mapById('cube-shell').resolve(120)) {
      const pinned = pos!.filter(onAFace)
      // at least one axis sits on a face; the others stay strictly inside
      expect(pinned.length).toBeGreaterThanOrEqual(1)
      for (const c of pos!) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
  })

  it('covers all six faces for a count that fills them', () => {
    const faces = new Set<string>()
    for (const { pos } of mapById('cube-shell').resolve(120)) {
      pos!.forEach((c, axis) => {
        if (Math.abs(c) < 1e-9) faces.add(`-${axis}`)
        if (Math.abs(c - 1) < 1e-9) faces.add(`+${axis}`)
      })
    }
    expect(faces.size).toBe(6)
  })

  it('keeps in-face offsets strictly inside (cell centres, never on an edge)', () => {
    // exactly one coordinate pinned to a face; the other two strictly between 0,1
    for (const { pos } of mapById('cube-shell').resolve(96)) {
      const interior = pos!.filter((c) => !onAFace(c))
      for (const c of interior) {
        expect(c).toBeGreaterThan(0)
        expect(c).toBeLessThan(1)
      }
    }
  })
})

describe('sphere volume (solid ball)', () => {
  // The cloud's own centroid is the ball centre; radius is the distance from it.
  function centroidOf(pts: number[][]) {
    const c = [0, 0, 0]
    for (const p of pts) for (let a = 0; a < 3; a++) c[a] += p[a]
    return c.map((v) => v / pts.length)
  }
  const radiusFrom = (c: number[]) => (p: number[]) =>
    Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2])

  it('is a distinct 3D map from the Sphere shell', () => {
    expect(mapById('sphere-volume').dim).toBe(3)
    expect(mapById('sphere-volume').id).not.toBe(mapById('seed-sphere-3d').id)
  })

  it('fills the interior: points span a range of radii, not just the shell', () => {
    const samples = mapById('sphere-volume').resolve(2000).map((p) => p.sample)
    const radius = radiusFrom(centroidOf(samples))
    const radii = samples.map(radius)
    const maxR = Math.max(...radii)
    const minR = Math.min(...radii)
    // A genuine fill reaches the centre and the rim — the shell would pin every
    // radius near the max.
    expect(minR).toBeLessThan(maxR * 0.1)
    // Points are spread across radii, not bunched at the surface: a healthy
    // fraction sit inside the outer half-radius.
    const inner = radii.filter((r) => r < maxR * 0.5).length
    expect(inner / radii.length).toBeGreaterThan(0.1)
  })

  it('stays within the unit ball after normalization', () => {
    const pts = mapById('sphere-volume').resolve(500)
    const radius = radiusFrom(centroidOf(pts.map((p) => p.sample)))
    for (const { sample, pos } of pts) {
      // radius from the ball centre stays near the normalized half-extent; the
      // slack absorbs per-axis offsets from aspect normalization anchoring to the
      // single longest axis (finite sampling makes the ball's extents slightly
      // non-cubic). The hard guarantee is the [0,1] per-axis bound checked below.
      expect(radius(sample)).toBeLessThanOrEqual(0.55)
      for (const c of sample) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
      expect(pos).toEqual(sample)
    }
  })
})
