import { readdirSync, readFileSync } from 'node:fs'
import { DatabaseSync, type SQLInputValue } from 'node:sqlite'
import { createSessionToken, sessionCookieName } from './auth'
import {
  assertValidControllerProfile,
  createD1ControllerProfile,
  deleteD1ControllerProfile,
  getD1ControllerProfile,
  listD1ControllerProfiles,
  updateD1ControllerProfile,
  controllerProfileFromRow,
  type D1DatabaseControllerProfilesLike,
} from './controllerProfiles'
import type { ControllerProfile, GlobalTransform } from '../engine/controllerProfile'
import { onRequestGet, onRequestPatch } from '../worker/routes/controllers/[id]'

const profile: ControllerProfile = {
  id: 'ctrl-1',
  name: 'Burner bag',
  deviceId: 'pixelblaze_pb32_3cd4ee549434',
  lastKnownDeviceName: 'Pixelblaze shelf',
  lastSeenIp: '192.168.8.224',
  lastKnownPixelCount: 256,
  lastKnownMapDim: 2,
  lastKnownInstalledMap: {
    status: 'present',
    fingerprint: 'abcd1234',
    dimension: 2,
    pointCount: 256,
    observedAt: 95,
  },
  mapFingerprints: [
    {
      hash: 'abcd1234',
      mapId: 'map-1',
      mapName: 'Wall map',
      devicePixelCount: 256,
      pushedAt: 90,
    },
  ],
  board: {
    kind: 'pixelblaze-v3-standard',
    hardwareRevision: 3.5,
    firmwareVersion: '3.67',
    firmwareUpdate: {
      state: 'available',
      checkedAt: 90,
      firmwareVersion: '3.67',
    },
  },
  inputs: [
    {
      id: 'pot0',
      name: 'Brightness pot',
      pin: 33,
      signal: 'analog',
      smoothing: 0.2,
      fallback: 0.5,
      invert: false,
    },
  ],
  globalTransforms: [
    {
      id: 'brightness',
      type: 'hardware-brightness',
      enabled: true,
      mixinId: 'builtin:hardware-brightness',
      inputId: 'pot0',
      mode: 'multiply-output',
    },
    {
      id: 'power-cap',
      type: 'power-cap',
      enabled: true,
      mixinId: 'builtin:power-cap',
      mode: 'direct',
      maxDuty: 0.25,
      milliampsPerPixel: 60,
    },
  ],
  electricalProfile: {
    ledPresetId: 'ws2811-12v-grouped',
    supplyBudget: { value: 20, unit: 'amps' },
  },
  patternBindings: [
    {
      id: 'p1-pot0-speed',
      patternId: 'pattern-1',
      inputId: 'pot0',
      target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
    },
  ],
  updatedAt: 100,
}

function fakeDb(rows: Record<string, unknown>[] = []): {
  db: D1DatabaseControllerProfilesLike
  calls: Array<{ sql: string; values: unknown[]; action: 'all' | 'first' | 'run' }>
} {
  const calls: Array<{ sql: string; values: unknown[]; action: 'all' | 'first' | 'run' }> = []
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
          async first<T>() {
            calls.push({ sql, values: bound, action: 'first' })
            return (rows[0] ?? null) as T | null
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

function sqliteD1(sqlite: DatabaseSync): D1DatabaseControllerProfilesLike {
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql)
      let values: SQLInputValue[] = []
      return {
        bind(...bound) {
          values = bound as SQLInputValue[]
          return this
        },
        async all<T>() { return { results: statement.all(...values) as T[] } },
        async first<T>() { return (statement.get(...values) as T | undefined) ?? null },
        async run() { return statement.run(...values) },
      }
    },
  }
}

describe('D1 controller profile persistence', () => {
  it('drops the legacy flag from profiles with values 0 and 1 and preserves the rest of each row and schema', async () => {
    using sqlite = new DatabaseSync(':memory:')
    const previousMigrations = readdirSync('migrations')
      .filter((name) => /^\d+.*\.sql$/.test(name) && Number.parseInt(name, 10) < 30)
      .sort()
    for (const migration of previousMigrations) {
      sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
    }
    const user = 'github:123'
    sqlite.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)').run(user, 1, 1)
    const db = sqliteD1(sqlite)
    const setLegacyFlag = sqlite.prepare(
      'UPDATE controller_profiles SET keep_patterns_up_to_date = ? WHERE user_id = ? AND id = ?',
    )
    const existingProfiles = [0, 1].map((flag) => ({ ...profile, id: `legacy-${flag}`, name: `Legacy ${flag}` }))
    for (const [flag, existing] of existingProfiles.entries()) {
      await createD1ControllerProfile(db, user, existing, flag + 1)
      setLegacyFlag.run(flag, user, existing.id)
    }

    const readRows = () => sqlite.prepare('SELECT * FROM controller_profiles ORDER BY user_id, id').all()
    const readColumns = () => sqlite.prepare(`
      SELECT name, type, "notnull", dflt_value, pk, hidden
      FROM pragma_table_xinfo('controller_profiles') ORDER BY cid
    `).all()
    const readIndexes = () => sqlite.prepare(`
      SELECT name, sql FROM sqlite_schema
      WHERE type = 'index' AND tbl_name = 'controller_profiles' ORDER BY name
    `).all()
    const readForeignKeys = () => sqlite.prepare('PRAGMA foreign_key_list(controller_profiles)').all()
    const rows = readRows()
    expect(rows.map((row) => row.keep_patterns_up_to_date)).toEqual([0, 1])
    const preservedRows = rows.map(({ keep_patterns_up_to_date: _flag, ...row }) => row)
    const preservedColumns = readColumns().filter(({ name }) => name !== 'keep_patterns_up_to_date')
    const indexes = readIndexes()
    const foreignKeys = readForeignKeys()

    sqlite.exec(readFileSync('migrations/0030_drop_controller_keep_patterns_up_to_date.sql', 'utf8'))

    expect(readColumns()).toEqual(preservedColumns)
    expect(readRows()).toEqual(preservedRows)
    expect(readIndexes()).toEqual(indexes)
    expect(readForeignKeys()).toEqual(foreignKeys)
    expect(sqlite.prepare("SELECT value FROM app_metadata WHERE key = 'schema_version'").get()).toEqual({ value: '30' })

    for (const existing of existingProfiles) {
      expect(await getD1ControllerProfile(db, user, existing.id)).toEqual(existing)
      await updateD1ControllerProfile(db, user, existing.id, { name: 'Renamed' })
      expect(await getD1ControllerProfile(db, user, existing.id)).toEqual({ ...existing, name: 'Renamed' })
    }
    await createD1ControllerProfile(db, user, profile)
    expect((await listD1ControllerProfiles(db, user)).map(({ id }) => id).sort())
      .toEqual([profile.id, 'legacy-0', 'legacy-1'])
    await deleteD1ControllerProfile(db, user, profile.id)
    expect(await getD1ControllerProfile(db, user, profile.id)).toBeUndefined()
  })

  it('maps a D1 row to a Controller profile', () => {
    expect(controllerProfileFromRow({
      id: 'ctrl-1',
      name: 'Burner bag',
      device_id: 'pixelblaze_pb32_3cd4ee549434',
      last_known_device_name: 'Pixelblaze shelf',
      last_seen_ip: '192.168.8.224',
      last_known_pixel_count: 256,
      last_known_map_dim: 2,
      last_known_installed_map_json: JSON.stringify(profile.lastKnownInstalledMap),
      map_fingerprints_json: JSON.stringify(profile.mapFingerprints),
      board_json: JSON.stringify(profile.board),
      inputs_json: JSON.stringify(profile.inputs),
      global_transforms_json: JSON.stringify(profile.globalTransforms),
      electrical_profile_json: JSON.stringify(profile.electricalProfile),
      pattern_bindings_json: JSON.stringify(profile.patternBindings),
      updated_at: 100,
    })).toEqual(profile)
  })

  it('drops the retired input role annotation when reading D1 rows (#772)', () => {
    const legacyInputs = profile.inputs.map((input) => ({ ...input, role: 'brightness' }))

    const read = controllerProfileFromRow({
      id: 'ctrl-1',
      name: 'Burner bag',
      device_id: null,
      last_known_device_name: null,
      last_seen_ip: null,
      last_known_pixel_count: null,
      last_known_map_dim: null,
      last_known_installed_map_json: null,
      map_fingerprints_json: null,
      board_json: JSON.stringify(profile.board),
      inputs_json: JSON.stringify(legacyInputs),
      global_transforms_json: JSON.stringify([]),
      electrical_profile_json: null,
      pattern_bindings_json: JSON.stringify([]),
      updated_at: 100,
    })

    expect(read.inputs).toEqual(profile.inputs)
    for (const input of read.inputs) expect(input).not.toHaveProperty('role')
  })

  it('stores a profile whose configuration is coherent but does nothing (#772)', () => {
    // Hardware brightness on a digital input is a validation error the user must
    // see and repair. Blocking the write would trap the profile: every later
    // edit, including the repair itself, would be rejected too.
    const stuck: ControllerProfile = {
      ...profile,
      inputs: [{ ...profile.inputs[0], signal: 'digital' }],
      patternBindings: [],
    }

    expect(() => assertValidControllerProfile(stuck)).not.toThrow()
  })

  it('still refuses a profile the record model cannot represent', () => {
    const broken: ControllerProfile = {
      ...profile,
      globalTransforms: profile.globalTransforms.map((transform) =>
        transform.type === 'hardware-brightness'
          ? { ...transform, inputId: 'ghost' }
          : transform),
      patternBindings: [],
    }

    expect(() => assertValidControllerProfile(broken))
      .toThrow(/references missing input "ghost"/)
  })

  it('lists and gets profiles scoped to the signed-in user', async () => {
    const { db, calls } = fakeDb()

    await listD1ControllerProfiles(db, 'github:123')
    await getD1ControllerProfile(db, 'github:123', 'ctrl-1')

    expect(calls[0].sql).toContain('WHERE user_id = ?')
    expect(calls[0].values).toEqual(['github:123'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].values).toEqual(['github:123', 'ctrl-1'])
  })

  it('creates, updates, and deletes profiles with user id in the key', async () => {
    const { db, calls } = fakeDb()

    await createD1ControllerProfile(db, 'github:123', profile, 50)
    await updateD1ControllerProfile(db, 'github:123', 'ctrl-1', {
      name: 'Renamed',
      lastKnownDeviceName: 'Renamed on device',
      lastSeenIp: '192.168.8.99',
      lastKnownPixelCount: 512,
      lastKnownMapDim: 3,
      lastKnownInstalledMap: { status: 'absent', observedAt: 200 },
      mapFingerprints: [],
      globalTransforms: profile.globalTransforms,
      electricalProfile: {
        ledPresetId: 'ws2812-5v-individual',
        supplyBudget: { value: 15, unit: 'watts' },
      },
      updatedAt: 200,
    })
    await deleteD1ControllerProfile(db, 'github:123', 'ctrl-1')

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'ctrl-1'])
    expect(calls[0].values).toHaveLength(17)
    expect(calls[0].values.slice(-3)).toEqual([JSON.stringify(profile.patternBindings), 50, profile.updatedAt])
    expect(calls[0].sql).not.toContain('output_profile')
    expect(calls[0].sql).not.toContain('zones_json')
    expect(calls[0].values).toContain('Pixelblaze shelf')
    expect(calls[0].values).toContain('192.168.8.224')
    expect(calls[0].values).toContain(256)
    expect(calls[0].values).toContain(2)
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
    expect(calls[1].sql).toContain('last_known_device_name = ?')
    expect(calls[1].sql).toContain('last_seen_ip = ?')
    expect(calls[1].sql).toContain('last_known_pixel_count = ?')
    expect(calls[1].sql).toContain('last_known_map_dim = ?')
    expect(calls[1].sql).toContain('last_known_installed_map_json = ?')
    expect(calls[1].sql).toContain('map_fingerprints_json = ?')
    expect(calls[1].sql).toContain('global_transforms_json = ?')
    expect(calls[1].sql).toContain('electrical_profile_json = ?')
    expect(calls[1].sql).not.toContain('output_profile')
    expect(calls[1].values).toContain('Renamed on device')
    expect(calls[1].values).toContain('192.168.8.99')
    expect(calls[1].values).toContain(512)
    expect(calls[1].values).toContain(3)
    expect(calls[1].values).toContain(JSON.stringify({ status: 'absent', observedAt: 200 }))
    expect(calls[1].values).toContain(JSON.stringify([]))
    expect(calls[1].values).toContain(JSON.stringify(profile.globalTransforms))
    expect(calls[1].values).toContain(JSON.stringify({
      ledPresetId: 'ws2812-5v-individual',
      supplyBudget: { value: 15, unit: 'watts' },
    }))
    expect(calls[1].values.slice(-2)).toEqual(['github:123', 'ctrl-1'])
    expect(calls[2].values).toEqual(['github:123', 'ctrl-1'])
  })

  it('rejects invalid profiles before writing them', async () => {
    const { db, calls } = fakeDb()
    const invalid: ControllerProfile = {
      ...profile,
      inputs: [{ ...profile.inputs[0], pin: 25 }],
    }

    await expect(createD1ControllerProfile(db, 'github:123', invalid)).rejects.toThrow(
      /IO25 for analog input/,
    )
    expect(calls).toEqual([])
  })

  it('rejects each invalid Wrapper edit over authenticated PATCH and reads back the whole prior row', async () => {
    using sqlite = new DatabaseSync(':memory:')
    for (const migration of readdirSync('migrations').filter((name) => /^\d+.*\.sql$/.test(name)).sort()) {
      sqlite.exec(readFileSync(`migrations/${migration}`, 'utf8'))
    }
    const db = sqliteD1(sqlite)
    const userId = 'github:123'
    sqlite.prepare('INSERT INTO users (id, created_at, updated_at) VALUES (?, ?, ?)').run(userId, 1, 1)
    const existing: ControllerProfile = {
      ...profile,
      inputs: [...profile.inputs, { ...profile.inputs[0], id: 'pot1', pin: 34 }],
    }
    await createD1ControllerProfile(db, userId, existing)
    const token = await createSessionToken({
      userId, primaryProvider: 'github', primaryHandle: 'test',
      githubUserId: '123', githubLogin: 'test', displayName: 'Test', avatarUrl: null,
    }, 'test-secret')
    const context = {
      params: { id: existing.id },
      env: { SESSION_SECRET: 'test-secret', PXLBLZ_DB: db },
    }
    function request(method: string, changes?: Partial<ControllerProfile>) {
      return new Request(`https://pxlblz.example/api/controllers/${existing.id}`, {
        method,
        headers: { cookie: `${sessionCookieName}=${encodeURIComponent(token)}`, 'content-type': 'application/json' },
        body: changes === undefined ? undefined : JSON.stringify(changes),
      })
    }
    const slowMo = { id: 'slow-mo', type: 'slow-mo', enabled: true, inputId: 'pot1' } as const
    const dreamy = { id: 'dreamy', type: 'dreamy', enabled: true, inputId: 'pot1' } as const
    const invalid: Array<{ additions: GlobalTransform[]; error: RegExp }> = [
      { additions: [{ ...slowMo, inputId: 'missing' }], error: /missing input "missing"/ },
      { additions: [slowMo, dreamy], error: /drives Slow-mo and Dreamy/ },
      { additions: [{ ...dreamy, inputId: 'pot0' }], error: /drives Brightness and Dreamy/ },
      { additions: [{ ...dreamy, enabled: false }], error: /Dreamy is off/ },
      { additions: [slowMo, { ...slowMo, id: 'duplicate', inputId: 'pot0' }], error: /a single slow-mo/ },
    ]
    for (const { additions, error } of invalid) {
      const response = await onRequestPatch({
        ...context, request: request('PATCH', { name: 'Rejected rename', globalTransforms: [...existing.globalTransforms, ...additions] }),
      })
      expect(response.status).toBe(400)
      expect((await response.json()).error).toMatch(error)
      const read = await onRequestGet({ ...context, request: request('GET') })
      expect(read.status).toBe(200)
      await expect(read.json()).resolves.toEqual({ controller: existing })
    }
    const response = await onRequestPatch({
      ...context, request: request('PATCH', { globalTransforms: [...existing.globalTransforms, slowMo] }),
    })
    expect(response.status).toBe(200)
    const read = await onRequestGet({ ...context, request: request('GET') })
    await expect(read.json()).resolves.toEqual({
      controller: { ...existing, globalTransforms: [...existing.globalTransforms, slowMo] },
    })
  })
})
