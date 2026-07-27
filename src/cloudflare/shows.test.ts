import {
  createD1Show,
  deleteD1Show,
  listD1Shows,
  showRecordFromRow,
  updateD1Show,
  type D1DatabaseShowsLike,
} from './shows'
import { createDefaultShow, normalizeShowTransitionState } from '../engine/showModel'
import { createInstallationShowOutputContract } from '../engine/showOutputContract'
import { normalizeShowComposition } from '../engine/showCompositionModel'
import type { ShowCompositionV1 } from '../engine/personalContentRecords'

function composition(): ShowCompositionV1 {
  return {
    version: 1,
    patternInstances: [{
      id: 'instance-1',
      pattern: { kind: 'stock', id: 'TestPattern1D' },
      patternName: 'TestPattern1D',
      time: { timeScale: 1, timeOffsetMs: 0 },
    }],
    scenes: [{
      sceneId: 'scene-1',
      zones: [{
        zoneId: 'zone-1',
        main: [{
          id: 'placement-1',
          instanceId: 'instance-1',
          startMs: 0,
          durationMs: 10_000,
          view: { mirror: false, phase: 0, brightness: 1 },
        }],
        overlays: [],
      }],
    }],
  }
}

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabaseShowsLike
  calls: Array<{ sql: string; values: unknown[]; action: 'all' | 'run' }>
} {
  const calls: Array<{ sql: string; values: unknown[]; action: 'all' | 'run' }> = []
  return {
    calls,
    db: {
      prepare(sql) {
        let bound: unknown[] = []
        return {
          bind(...values) {
            bound = values
            return this
          },
          async all<T>() {
            calls.push({ sql, values: bound, action: 'all' })
            return { results: rows as T[] }
          },
          async run() {
            calls.push({ sql, values: bound, action: 'run' })
            return { success: true }
          },
        }
      },
    },
  }
}

describe('D1 show persistence (#318)', () => {
  it('maps D1 rows to ShowRecord values', () => {
    const show = createDefaultShow('show-1', 'Tazii nights', 123)
    const outputContract = createInstallationShowOutputContract({ outputMapId: 'map-1', pixelCount: 240 })
    const outputEffects = [{ id: 'trails', kind: 'trails' as const, retention: 0.75 }]

    expect(showRecordFromRow({
      id: show.id,
      name: show.name,
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
      cells_json: JSON.stringify(show.cells),
      routing_layouts_json: JSON.stringify(show.routingLayouts),
      transitions_json: JSON.stringify(show.transitions),
      composition_json: JSON.stringify(composition()),
      output_effects_json: JSON.stringify(outputEffects),
      target_controller_profile_id: 'ctrl-1',
      stage_map_id: 'map-1',
      output_contract_json: JSON.stringify(outputContract),
      updated_at: 123,
    })).toEqual(expect.objectContaining({
      ...show,
      transitions: [expect.objectContaining({ id: 'transition-scene-1', kind: 'crossfade' })],
      targetControllerProfileId: 'ctrl-1',
      stageMapId: 'map-1',
      outputContract,
      outputEffects,
      composition: composition(),
    }))
  })

  it('scopes list, update, and delete by signed-in user', async () => {
    const { db, calls } = fakeDb()
    await listD1Shows(db, 'github:123')
    await updateD1Show(db, 'github:123', 'show-1', { name: 'Renamed', updatedAt: 2 })
    await deleteD1Show(db, 'github:123', 'show-1')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'show-1'])
    expect(calls[2].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[2].values).toEqual(['github:123', 'show-1'])
  })

  it('creates shows with user id in the key and serialized strip data', async () => {
    const { db, calls } = fakeDb()
    const show = {
      ...createDefaultShow('show-1', 'Tazii nights', 123),
      outputContract: createInstallationShowOutputContract({ outputMapId: 'map-1', pixelCount: 240 }),
      composition: composition(),
      outputEffects: [{ id: 'trails', kind: 'trails' as const, retention: 0.75 }],
    }

    await createD1Show(db, 'github:123', show, 100)

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'show-1'])
    expect(calls[0].values).toContain(JSON.stringify(show.scenes))
    expect(calls[0].values).toContain(JSON.stringify(show.cells))
    expect(calls[0].values).toContain(JSON.stringify(show.routingLayouts))
    expect(calls[0].values).toContain(JSON.stringify(normalizeShowTransitionState(show).transitions))
    expect(calls[0].values).toContain(JSON.stringify(show.outputContract))
    expect(calls[0].values).toContain(JSON.stringify(show.composition))
    expect(calls[0].values).toContain(JSON.stringify(show.outputEffects))
    expect(calls[0].values).toContain(null)
  })

  it('rejects a contract-less Show before a D1 create write', async () => {
    const { db, calls } = fakeDb()
    const { outputContract: _outputContract, ...show } = createDefaultShow(
      'contract-less-show',
      'Contract-less',
      123,
    )

    await expect(createD1Show(db, 'github:123', show as never, 100)).rejects.toMatchObject({
      code: 'missing_show_output_contract',
      status: 400,
      message: 'Show contract-less-show is missing a valid output contract',
    })
    expect(calls).toEqual([])
  })

  it('rejects clearing a Show output contract before a D1 update write', async () => {
    const { db, calls } = fakeDb()

    await expect(updateD1Show(db, 'github:123', 'show-1', {
      outputContract: null,
      updatedAt: 124,
    } as never)).rejects.toMatchObject({
      code: 'missing_show_output_contract',
      status: 400,
    })
    expect(calls).toEqual([])
  })

  it('round-trips a normalized composition through the D1 column contract', async () => {
    const { db, calls } = fakeDb()
    const show = {
      ...createDefaultShow('show-round-trip', 'Composition round trip', 123),
      composition: composition(),
    }

    await createD1Show(db, 'github:123', show, 100)
    const values = calls[0].values
    const reloaded = showRecordFromRow({
      id: String(values[1]),
      name: String(values[2]),
      scenes_json: String(values[3]),
      zones_json: String(values[4]),
      cells_json: String(values[5]),
      routing_layouts_json: String(values[6]),
      transitions_json: String(values[7]),
      composition_json: String(values[8]),
      output_effects_json: values[9] as string | null,
      target_controller_profile_id: values[10] as string | null,
      stage_map_id: values[11] as string | null,
      output_contract_json: values[12] as string | null,
      updated_at: Number(values[14]),
    })

    expect(reloaded.composition).toEqual(normalizeShowComposition(show, show.composition))
    expect(reloaded).toEqual(expect.objectContaining({
      id: show.id,
      name: show.name,
      scenes: show.scenes,
      zones: show.zones,
      cells: show.cells,
    }))
  })

  it('rejects rows without the required output contract', () => {
    const show = createDefaultShow('legacy-show', 'Legacy', 123)
    expect(() => showRecordFromRow({
      id: show.id,
      name: show.name,
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
      cells_json: JSON.stringify(show.cells),
      routing_layouts_json: JSON.stringify(show.routingLayouts),
      transitions_json: JSON.stringify(show.transitions),
      composition_json: null,
      target_controller_profile_id: null,
      stage_map_id: 'plane',
      output_contract_json: null,
      updated_at: 123,
    })).toThrow('Show legacy-show is missing a valid output contract')
  })

  it('reports a contract-less row without failing the readable Shows collection', async () => {
    const readable = createDefaultShow('readable-show', 'Readable', 124)
    const legacy = createDefaultShow('legacy-show', 'Legacy', 123)
    const row = (show: typeof readable, outputContract: string | null) => ({
      id: show.id,
      name: show.name,
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
      cells_json: JSON.stringify(show.cells),
      routing_layouts_json: JSON.stringify(show.routingLayouts),
      transitions_json: JSON.stringify(show.transitions),
      composition_json: null,
      target_controller_profile_id: null,
      stage_map_id: null,
      output_contract_json: outputContract,
      updated_at: show.updatedAt,
    })
    const { db } = fakeDb([
      row(readable, JSON.stringify(readable.outputContract)),
      row(legacy, null),
    ])

    await expect(listD1Shows(db, 'github:123')).resolves.toEqual({
      shows: [expect.objectContaining({ id: readable.id })],
      unreadableShows: [{
        id: legacy.id,
        name: legacy.name,
        code: 'missing_show_output_contract',
        error: 'Show legacy-show is missing a valid output contract',
      }],
    })
  })

  it.each([
    ['an unknown future version', { ...composition(), version: 2 }],
    ['a malformed version-1 payload', { version: 1, patternInstances: null, scenes: [] }],
    ['a semantically invalid version-1 payload', {
      ...composition(),
      scenes: [{ sceneId: 'missing-scene', zones: [] }],
    }],
    ['invalid Show End and Marker metadata', {
      ...composition(),
      durationMs: 0,
      markers: [{ id: 'negative-marker', timeMs: -1 }],
    }],
  ])('keeps the flat Show readable when composition_json contains %s', (_label, invalidComposition) => {
    const show = createDefaultShow('safe-flat-show', 'Safe flat Show', 123)
    const record = showRecordFromRow({
      id: show.id,
      name: show.name,
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
      cells_json: JSON.stringify(show.cells),
      routing_layouts_json: JSON.stringify(show.routingLayouts),
      transitions_json: JSON.stringify(show.transitions),
      composition_json: JSON.stringify(invalidComposition),
      target_controller_profile_id: null,
      stage_map_id: null,
      output_contract_json: JSON.stringify(show.outputContract),
      updated_at: 123,
    })

    expect(record).toEqual(expect.objectContaining({
      id: show.id,
      scenes: show.scenes,
      zones: show.zones,
      cells: show.cells,
    }))
    expect(record.composition).toBeUndefined()
  })

  it.each([
    ['create', async (db: D1DatabaseShowsLike, show: ReturnType<typeof createDefaultShow>, invalidComposition: unknown) => {
      await createD1Show(db, 'github:123', { ...show, composition: invalidComposition } as never, 100)
    }],
    ['update', async (db: D1DatabaseShowsLike, show: ReturnType<typeof createDefaultShow>, invalidComposition: unknown) => {
      await updateD1Show(db, 'github:123', show.id, { composition: invalidComposition } as never)
    }],
  ])('rejects an unsupported composition version before a D1 %s write', async (_label, write) => {
    const { db, calls } = fakeDb()
    const show = createDefaultShow('safe-write-show', 'Safe write Show', 123)

    await expect(write(db, show, { ...composition(), version: 2 })).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })
    expect(calls).toEqual([])
  })

  it.each([
    ['create', async (db: D1DatabaseShowsLike, show: ReturnType<typeof createDefaultShow>, invalidComposition: unknown) => {
      await createD1Show(db, 'github:123', { ...show, composition: invalidComposition } as never, 100)
    }],
    ['update', async (db: D1DatabaseShowsLike, show: ReturnType<typeof createDefaultShow>, invalidComposition: unknown) => {
      await updateD1Show(db, 'github:123', show.id, { composition: invalidComposition } as never)
    }],
  ])('rejects invalid Show End and Marker metadata before a D1 %s write (#592)', async (_label, write) => {
    const { db, calls } = fakeDb()
    const show = createDefaultShow('invalid-timeline-metadata', 'Invalid timeline metadata', 123)
    const invalidComposition = {
      ...composition(),
      durationMs: 0,
      markers: [{ id: 'negative-marker', timeMs: -1 }],
    }

    await expect(write(db, show, invalidComposition)).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })
    expect(calls).toEqual([])
  })

  it('updates a Show composition as one serialized sidecar', async () => {
    const show = createDefaultShow('show-1', 'Stored Show', 123)
    const { db, calls } = fakeDb([{
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
    }])

    await updateD1Show(db, 'github:123', 'show-1', {
      composition: composition(),
      updatedAt: 456,
    })

    expect(calls[0].sql).toContain('SELECT scenes_json, zones_json')
    expect(calls[1].sql).toContain('composition_json = ?')
    expect(calls[1].values).toContain(JSON.stringify(composition()))
  })

  it('rejects a semantically invalid composition-only update against its stored owners', async () => {
    const show = createDefaultShow('show-1', 'Stored Show', 123)
    const invalid = {
      ...composition(),
      patternInstances: [],
    }
    const { db, calls } = fakeDb([{
      scenes_json: JSON.stringify(show.scenes),
      zones_json: JSON.stringify(show.zones),
    }])

    await expect(updateD1Show(db, 'github:123', show.id, {
      composition: invalid,
      updatedAt: 456,
    })).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })

    expect(calls).toHaveLength(1)
    expect(calls[0].action).toBe('all')
  })

  it('rejects malformed owner fields instead of validating against stored replacements', async () => {
    const { db, calls } = fakeDb()

    await expect(updateD1Show(db, 'github:123', 'show-1', {
      scenes: 'corrupt',
      composition: composition(),
      updatedAt: 456,
    } as never)).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })

    expect(calls).toEqual([])
  })

  it('rejects structurally malformed Scene owner arrays before a composition PATCH write', async () => {
    const show = createDefaultShow('show-1', 'Stored Show', 123)
    const { db, calls } = fakeDb()

    await expect(updateD1Show(db, 'github:123', show.id, {
      scenes: [{ id: 'scene-1' }],
      zones: show.zones,
      composition: { version: 1, patternInstances: [], scenes: [] },
      updatedAt: 456,
    } as never)).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })

    expect(calls).toEqual([])
  })

  it('rejects structurally malformed Zone owner arrays before a composition PATCH write', async () => {
    const show = createDefaultShow('show-1', 'Stored Show', 123)
    const { db, calls } = fakeDb()

    await expect(updateD1Show(db, 'github:123', show.id, {
      scenes: show.scenes,
      zones: [{ id: 'zone-1' }],
      composition: { version: 1, patternInstances: [], scenes: [] },
      updatedAt: 456,
    } as never)).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })

    expect(calls).toEqual([])
  })

  it('rejects structurally malformed owner arrays before a composition create write', async () => {
    const show = createDefaultShow('show-1', 'Stored Show', 123)
    const { db, calls } = fakeDb()

    await expect(createD1Show(db, 'github:123', {
      ...show,
      scenes: [{ id: 'scene-1' }],
      composition: { version: 1, patternInstances: [], scenes: [] },
    } as never, 100)).rejects.toMatchObject({
      code: 'unsupported_show_composition',
      status: 400,
    })

    expect(calls).toEqual([])
  })

  it('updates Show output Effects as one serialized sidecar (#537)', async () => {
    const { db, calls } = fakeDb()
    const outputEffects = [{ id: 'trails', kind: 'trails' as const, retention: 0.75 }]

    await updateD1Show(db, 'github:123', 'show-1', { outputEffects, updatedAt: 456 })

    expect(calls[0].sql).toContain('output_effects_json = ?')
    expect(calls[0].values).toContain(JSON.stringify(outputEffects))
  })

  it('clears authored composition with SQL NULL when undo returns to a flat Show', async () => {
    const { db, calls } = fakeDb()

    await updateD1Show(db, 'github:123', 'show-1', { composition: null, updatedAt: 457 })

    expect(calls[0].sql).toContain('composition_json = ?')
    expect(calls[0].values[0]).toBeNull()
  })
})
