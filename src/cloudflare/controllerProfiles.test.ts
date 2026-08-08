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
import type { ControllerProfile } from '../engine/controllerProfile'

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
  keepPatternsUpToDate: true,
  patternBindings: [
    {
      id: 'p1-pot0-speed',
      patternId: 'pattern-1',
      inputId: 'pot0',
      target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
    },
  ],
  zones: [{ id: 'arch-left', name: 'Arch left', ranges: [{ start: 0, end: 239 }] }],
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

describe('D1 controller profile persistence', () => {
  it('maps D1 rows to ControllerProfile values', () => {
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
      keep_patterns_up_to_date: 1,
      pattern_bindings_json: JSON.stringify(profile.patternBindings),
      zones_json: JSON.stringify(profile.zones),
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
      keep_patterns_up_to_date: 0,
      pattern_bindings_json: JSON.stringify([]),
      zones_json: JSON.stringify([]),
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

  it('normalizes legacy single-range zones when reading D1 rows', () => {
    expect(controllerProfileFromRow({
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
      inputs_json: JSON.stringify([]),
      global_transforms_json: JSON.stringify([]),
      electrical_profile_json: null,
      keep_patterns_up_to_date: 0,
      pattern_bindings_json: JSON.stringify([]),
      zones_json: JSON.stringify([{ id: 'legacy', name: 'Legacy', start: 2, end: 5 }]),
      updated_at: 100,
    }).zones).toEqual([{ id: 'legacy', name: 'Legacy', ranges: [{ start: 2, end: 5 }] }])
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
      keepPatternsUpToDate: false,
      updatedAt: 200,
    })
    await deleteD1ControllerProfile(db, 'github:123', 'ctrl-1')

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'ctrl-1'])
    expect(calls[0].values).toHaveLength(19)
    expect(calls[0].sql).not.toContain('output_profile')
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
    expect(calls[1].sql).toContain('keep_patterns_up_to_date = ?')
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
})
