import { describe, expect, it } from 'vitest'
import {
  projectFlatShowToCompositionV1WithCellOrigins,
  validateShowComposition,
} from './showCompositionModel'
import { createDefaultShow } from './showModel'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import type { ShowFileBundleV1 } from './showFileBundle'
import { applyShowImportPlan, planShowImport } from './showImportPlan'

function pattern(id: string, name: string, src: string): PatternRecord {
  return { id, name, src, controls: {}, updatedAt: 10 }
}

function map(id: string, name: string, points: number[][]): MapRecord {
  return { id, name, dim: 2, generator: 'custom', params: {}, points, updatedAt: 10 }
}

describe('Show import planning', () => {
  it('classifies stock, reused, added, and diverged Patterns and rewrites every user reference', () => {
    const show = createDefaultShow('show-source', 'Voltage Bloom', 20)
    show.cells = [
      { ...show.cells[0], id: 'stock-cell' },
      {
        ...show.cells[0],
        id: 'reused-cell',
        pattern: { kind: 'user', id: 'pattern-reused' },
        patternName: 'Glass Ripples',
      },
      {
        ...show.cells[0],
        id: 'added-cell',
        pattern: { kind: 'user', id: 'pattern-added' },
        patternName: 'Squiggles',
      },
      {
        ...show.cells[0],
        id: 'diverged-cell',
        pattern: { kind: 'user', id: 'pattern-diverged' },
        patternName: 'Neon Rain',
      },
    ]
    const bundledReused = pattern('pattern-reused', 'Glass Ripples', 'export function render(i) { hsv(0.1, 1, 1) }')
    const bundledAdded = pattern('pattern-added', 'Squiggles', 'export function render(i) { hsv(0.2, 1, 1) }')
    const bundledDiverged = pattern('pattern-diverged', 'Neon Rain', 'export function render(i) { hsv(0.3, 1, 1) }')
    const bundle: ShowFileBundleV1 = {
      version: 1,
      show,
      patterns: [bundledReused, bundledAdded, bundledDiverged],
      maps: [],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: 'show-source',
      },
    }
    const library = {
      patterns: [
        pattern('pattern-reused', 'Glass Ripples', bundledReused.src),
        pattern('pattern-diverged', 'Neon Rain edited', 'export function render(i) { hsv(0.9, 1, 1) }'),
      ],
      maps: [],
      showNames: ['Voltage Bloom'],
    }
    const before = structuredClone({ bundle, library })
    const ids = ['show-imported', 'pattern-copy']

    const plan = planShowImport(bundle, library, {
      createId: () => ids.shift()!,
      now: 100,
    })

    expect(plan.show).toEqual({ id: 'show-imported', name: 'Voltage Bloom (2)' })
    expect(plan.patterns.builtIn.map((item) => item.id)).toEqual(['TestPattern1D'])
    expect(plan.patterns.reused.map((item) => item.id)).toEqual(['pattern-reused'])
    expect(plan.patterns.added.map((item) => item.id)).toEqual(['pattern-added'])
    expect(plan.patterns.copied).toEqual([{
      id: 'pattern-diverged',
      name: 'Neon Rain',
      targetId: 'pattern-copy',
      targetName: 'Neon Rain (Voltage Bloom)',
    }])

    const applied = applyShowImportPlan(plan)
    expect(applied.show.id).toBe('show-imported')
    expect(applied.show.name).toBe('Voltage Bloom (2)')
    expect(applied.show.importMetadata).toEqual({
      kind: 'show-file',
      originalShowId: 'show-source',
      appVersion: '1.0.0',
      exportedAt: '2026-08-14T12:00:00.000Z',
      importedAt: 100,
    })
    expect(applied.show.cells.map((cell) => cell.pattern)).toEqual([
      { kind: 'stock', id: 'TestPattern1D' },
      { kind: 'user', id: 'pattern-reused' },
      { kind: 'user', id: 'pattern-added' },
      { kind: 'user', id: 'pattern-copy' },
    ])
    expect(applied.newPatterns.map((item) => ({ id: item.id, name: item.name, src: item.src }))).toEqual([
      { id: 'pattern-added', name: 'Squiggles', src: bundledAdded.src },
      { id: 'pattern-copy', name: 'Neon Rain (Voltage Bloom)', src: bundledDiverged.src },
    ])
    expect({ bundle, library }).toEqual(before)
  })

  it('creates a Show-tied Map copy when the bundled custom Map differs from the same library id', () => {
    const show = createDefaultShow('show-source', 'Mapped Show', 20)
    show.stageMapId = 'map-shared'
    show.outputContract = {
      version: 1,
      kind: 'installation',
      outputMapId: 'map-shared',
      pixelCount: 2,
      resolution: 'fixed',
    }
    const bundledMap = map('map-shared', 'Warehouse Grid', [[0, 0], [1, 1]])
    const bundle: ShowFileBundleV1 = {
      version: 1,
      show,
      patterns: [],
      maps: [bundledMap],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: 'show-source',
      },
    }
    const ids = ['show-imported', 'map-copy']

    const plan = planShowImport(bundle, {
      patterns: [],
      maps: [map('map-shared', 'Warehouse Grid edited', [[0, 1], [1, 0]])],
      showNames: [],
    }, {
      createId: () => ids.shift()!,
      now: 100,
    })

    expect(plan.maps.copied).toEqual([{
      id: 'map-shared',
      name: 'Warehouse Grid',
      targetId: 'map-copy',
      targetName: 'Warehouse Grid (Mapped Show)',
    }])
    const applied = applyShowImportPlan(plan)
    expect(applied.show.stageMapId).toBe('map-copy')
    expect(applied.show.outputContract).toMatchObject({ outputMapId: 'map-copy' })
    expect(applied.newMaps).toEqual([{
      ...bundledMap,
      id: 'map-copy',
      name: 'Warehouse Grid (Mapped Show)',
      updatedAt: 100,
    }])
  })

  it.each([
    { label: 'adds', existing: [] as MapRecord[], bucket: 'added' as const },
    { label: 'reuses', existing: [map('map-shared', 'Existing name', [[0, 0], [1, 1]])], bucket: 'reused' as const },
  ])('$label a custom Map under its original id when no rewrite is needed', ({ existing, bucket }) => {
    const show = createDefaultShow('show-source', 'Mapped Show', 20)
    show.stageMapId = 'map-shared'
    show.outputContract = {
      version: 1,
      kind: 'installation',
      outputMapId: 'map-shared',
      pixelCount: 2,
      resolution: 'fixed',
    }
    const bundledMap = map('map-shared', 'Warehouse Grid', [[0, 0], [1, 1]])
    const bundle: ShowFileBundleV1 = {
      version: 1,
      show,
      patterns: [],
      maps: [bundledMap],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: show.id,
      },
    }

    const plan = planShowImport(bundle, { patterns: [], maps: existing, showNames: [] }, {
      createId: () => 'show-imported',
      now: 100,
    })
    const applied = applyShowImportPlan(plan)

    expect(plan.maps[bucket]).toEqual([{ id: 'map-shared', name: 'Warehouse Grid' }])
    expect(applied.show.stageMapId).toBe('map-shared')
    expect(applied.show.outputContract).toMatchObject({ outputMapId: 'map-shared' })
    expect(applied.newMaps).toEqual(bucket === 'added' ? [{ ...bundledMap, updatedAt: 100 }] : [])
  })

  it('normalizes and validates the complete imported Show before returning it', () => {
    const show = createDefaultShow('show-source', 'Normalized Show', 20)
    const projected = projectFlatShowToCompositionV1WithCellOrigins(show, {
      byCellId: Object.fromEntries(show.cells.map((cell) => [cell.id, cell.id])),
    })
    show.composition = {
      ...projected.composition,
      patternInstances: [...projected.composition.patternInstances].reverse(),
      scenes: [...projected.composition.scenes].reverse(),
    }
    const bundle: ShowFileBundleV1 = {
      version: 1,
      show,
      patterns: [],
      maps: [],
      provenance: {
        appVersion: '1.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: show.id,
      },
    }

    const applied = applyShowImportPlan(planShowImport(bundle, {
      patterns: [], maps: [], showNames: [],
    }, {
      createId: () => 'show-imported',
      now: 100,
    }))

    expect(applied.show.composition!.patternInstances.map((item) => item.id)).toEqual(
      [...applied.show.composition!.patternInstances.map((item) => item.id)].sort(),
    )
    expect(applied.show.composition!.scenes.map((item) => item.sceneId)).toEqual(show.scenes.map((scene) => scene.id))
    expect(validateShowComposition(applied.show, applied.show.composition!)).toEqual([])
  })

  it('rejects an unknown built-in Pattern by id during planning', () => {
    const show = createDefaultShow('show-source', 'Future Show', 20)
    show.cells[0] = {
      ...show.cells[0],
      pattern: { kind: 'stock', id: 'AuroraCascade' },
      patternName: 'Aurora Cascade',
    }
    const bundle: ShowFileBundleV1 = {
      version: 1,
      show,
      patterns: [],
      maps: [],
      provenance: {
        appVersion: '2.0.0',
        exportedAt: '2026-08-14T12:00:00.000Z',
        originalShowId: show.id,
      },
    }

    expect(() => planShowImport(bundle, { patterns: [], maps: [], showNames: [] })).toThrow(expect.objectContaining({
      code: 'unknown_stock_pattern',
      message: expect.stringContaining('AuroraCascade'),
    }))
  })
})
