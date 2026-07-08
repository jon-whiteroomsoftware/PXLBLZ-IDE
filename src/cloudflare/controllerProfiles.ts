import {
  controllerProfileValidationErrors,
  validateControllerProfile,
  type ControllerBoardProfile,
  type ControllerInput,
  type ControllerProfile,
  type GlobalTransform,
  type PatternBinding,
  type ControllerZone,
} from '../engine/controllerProfile'

export interface D1DatabaseControllerProfilesLike {
  prepare(sql: string): D1ControllerProfileStatementLike
}

export interface D1ControllerProfileStatementLike {
  bind(...values: unknown[]): D1ControllerProfileStatementLike
  all<T>(): Promise<{ results: T[] }>
  first<T>(): Promise<T | null>
  run(): Promise<unknown>
}

export interface D1ControllerProfileRow {
  id: string
  name: string
  device_id: string | null
  last_known_device_name: string | null
  last_seen_ip: string | null
  last_known_pixel_count: number | null
  last_known_map_dim: number | null
  board_json: string
  inputs_json: string
  global_transforms_json: string
  pattern_bindings_json: string
  zones_json: string
  updated_at: number
}

export type ControllerProfileChanges = Partial<Omit<ControllerProfile, 'id'>>

export function controllerProfileFromRow(row: D1ControllerProfileRow): ControllerProfile {
  return {
    id: row.id,
    name: row.name,
    ...(row.device_id ? { deviceId: row.device_id } : {}),
    ...(row.last_known_device_name ? { lastKnownDeviceName: row.last_known_device_name } : {}),
    ...(row.last_seen_ip ? { lastSeenIp: row.last_seen_ip } : {}),
    ...(typeof row.last_known_pixel_count === 'number' ? { lastKnownPixelCount: row.last_known_pixel_count } : {}),
    ...(row.last_known_map_dim === 1 || row.last_known_map_dim === 2 || row.last_known_map_dim === 3
      ? { lastKnownMapDim: row.last_known_map_dim }
      : {}),
    board: parseJson<ControllerBoardProfile>(row.board_json),
    inputs: parseJson<ControllerInput[]>(row.inputs_json),
    globalTransforms: parseJson<GlobalTransform[]>(row.global_transforms_json),
    patternBindings: parseJson<PatternBinding[]>(row.pattern_bindings_json),
    zones: parseJson<ControllerZone[]>(row.zones_json),
    updatedAt: row.updated_at,
  }
}

export async function listD1ControllerProfiles(
  db: D1DatabaseControllerProfilesLike,
  userId: string,
): Promise<ControllerProfile[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, device_id, board_json, inputs_json, global_transforms_json,
             pattern_bindings_json, zones_json, last_known_device_name, last_seen_ip,
             last_known_pixel_count, last_known_map_dim, updated_at
      FROM controller_profiles
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1ControllerProfileRow>()
  return results.map(controllerProfileFromRow)
}

export async function getD1ControllerProfile(
  db: D1DatabaseControllerProfilesLike,
  userId: string,
  id: string,
): Promise<ControllerProfile | undefined> {
  const row = await db
    .prepare(`
      SELECT id, name, device_id, board_json, inputs_json, global_transforms_json,
             pattern_bindings_json, zones_json, last_known_device_name, last_seen_ip,
             last_known_pixel_count, last_known_map_dim, updated_at
      FROM controller_profiles
      WHERE user_id = ? AND id = ?
      LIMIT 1
    `)
    .bind(userId, id)
    .first<D1ControllerProfileRow>()
  return row ? controllerProfileFromRow(row) : undefined
}

export async function createD1ControllerProfile(
  db: D1DatabaseControllerProfilesLike,
  userId: string,
  profile: ControllerProfile,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  assertValidControllerProfile(profile)
  await db
    .prepare(`
      INSERT INTO controller_profiles (
        user_id, id, name, device_id, last_known_device_name, last_seen_ip,
        last_known_pixel_count, last_known_map_dim, board_json, inputs_json,
        global_transforms_json, pattern_bindings_json, zones_json,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      profile.id,
      profile.name,
      profile.deviceId ?? null,
      profile.lastKnownDeviceName ?? null,
      profile.lastSeenIp ?? null,
      profile.lastKnownPixelCount ?? null,
      profile.lastKnownMapDim ?? null,
      JSON.stringify(profile.board),
      JSON.stringify(profile.inputs),
      JSON.stringify(profile.globalTransforms),
      JSON.stringify(profile.patternBindings),
      JSON.stringify(profile.zones),
      now,
      profile.updatedAt,
    )
    .run()
}

export async function updateD1ControllerProfile(
  db: D1DatabaseControllerProfilesLike,
  userId: string,
  id: string,
  changes: ControllerProfileChanges,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'device_id', changes.deviceId ?? null, false, changes.deviceId !== undefined)
  addAssignment(assignments, values, 'last_known_device_name', changes.lastKnownDeviceName ?? null, false, changes.lastKnownDeviceName !== undefined)
  addAssignment(assignments, values, 'last_seen_ip', changes.lastSeenIp ?? null, false, changes.lastSeenIp !== undefined)
  addAssignment(assignments, values, 'last_known_pixel_count', changes.lastKnownPixelCount ?? null, false, changes.lastKnownPixelCount !== undefined)
  addAssignment(assignments, values, 'last_known_map_dim', changes.lastKnownMapDim ?? null, false, changes.lastKnownMapDim !== undefined)
  addAssignment(assignments, values, 'board_json', changes.board, true)
  addAssignment(assignments, values, 'inputs_json', changes.inputs, true)
  addAssignment(assignments, values, 'global_transforms_json', changes.globalTransforms, true)
  addAssignment(assignments, values, 'pattern_bindings_json', changes.patternBindings, true)
  addAssignment(assignments, values, 'zones_json', changes.zones, true)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE controller_profiles
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1ControllerProfile(
  db: D1DatabaseControllerProfilesLike,
  userId: string,
  id: string,
): Promise<void> {
  await db
    .prepare('DELETE FROM controller_profiles WHERE user_id = ? AND id = ?')
    .bind(userId, id)
    .run()
}

export function assertValidControllerProfile(profile: ControllerProfile): void {
  const result = validateControllerProfile(profile)
  if (!result.ok) throw new Error(controllerProfileValidationErrors(result).join('\n'))
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
  json = false,
  include = value !== undefined,
): void {
  if (!include) return
  assignments.push(`${column} = ?`)
  values.push(json ? JSON.stringify(value) : value)
}

function parseJson<T>(value: string): T {
  return JSON.parse(value) as T
}
