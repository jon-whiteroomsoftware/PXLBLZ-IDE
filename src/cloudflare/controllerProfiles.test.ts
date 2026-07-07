import {
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
  board: { kind: 'pixelblaze-v3-standard', hardwareRevision: 3.5, firmwareVersion: '3.67' },
  inputs: [
    {
      id: 'pot0',
      name: 'Brightness pot',
      pin: 33,
      signal: 'analog',
      role: 'brightness',
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
  ],
  patternBindings: [
    {
      id: 'p1-pot0-speed',
      patternId: 'pattern-1',
      inputId: 'pot0',
      target: { kind: 'call-exported-slider', name: 'sliderSpeed' },
    },
  ],
  zones: [{ id: 'arch-left', name: 'Arch left', start: 0, end: 239 }],
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
      board_json: JSON.stringify(profile.board),
      inputs_json: JSON.stringify(profile.inputs),
      global_transforms_json: JSON.stringify(profile.globalTransforms),
      pattern_bindings_json: JSON.stringify(profile.patternBindings),
      zones_json: JSON.stringify(profile.zones),
      updated_at: 100,
    })).toEqual(profile)
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
    await updateD1ControllerProfile(db, 'github:123', 'ctrl-1', { name: 'Renamed', updatedAt: 200 })
    await deleteD1ControllerProfile(db, 'github:123', 'ctrl-1')

    expect(calls[0].values.slice(0, 2)).toEqual(['github:123', 'ctrl-1'])
    expect(calls[1].sql).toContain('WHERE user_id = ? AND id = ?')
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
