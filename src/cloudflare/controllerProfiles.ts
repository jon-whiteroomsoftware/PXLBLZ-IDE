import {
  controllerProfileRecordIssues,
  normalizeControllerInputs,
  validateControllerProfile,
  type ControllerBoardProfile,
  type ControllerInput,
  type ControllerMapFingerprint,
  type ControllerProfile,
  type GlobalTransform,
  type PatternBinding,
} from '../engine/controllerProfile'
import type { ControllerElectricalProfile } from '../engine/controllerElectricalProfile'
import type { InstalledMapSnapshot } from '../engine/installedMapObservation'

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
  last_known_installed_map_json: string | null
  map_fingerprints_json: string | null
  board_json: string
  inputs_json: string
  global_transforms_json: string
  electrical_profile_json: string | null
  keep_patterns_up_to_date: number | null
  pattern_bindings_json: string
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
    ...(row.last_known_installed_map_json
      ? { lastKnownInstalledMap: parseJson<InstalledMapSnapshot>(row.last_known_installed_map_json) }
      : {}),
    mapFingerprints: parseJson<ControllerMapFingerprint[]>(row.map_fingerprints_json, []),
    board: parseJson<ControllerBoardProfile>(row.board_json),
    inputs: normalizeControllerInputs(parseJson<ControllerInput[]>(row.inputs_json)),
    globalTransforms: parseJson<GlobalTransform[]>(row.global_transforms_json),
    ...(row.electrical_profile_json
      ? { electricalProfile: parseJson<ControllerElectricalProfile>(row.electrical_profile_json) }
      : {}),
    keepPatternsUpToDate: row.keep_patterns_up_to_date === 1,
    patternBindings: parseJson<PatternBinding[]>(row.pattern_bindings_json),
    updatedAt: row.updated_at,
  }
}

export async function listD1ControllerProfiles(
  db: D1DatabaseControllerProfilesLike,
  userId: string,
): Promise<ControllerProfile[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, device_id, board_json, inputs_json, global_transforms_json, electrical_profile_json,
             keep_patterns_up_to_date,
             pattern_bindings_json, last_known_device_name, last_seen_ip,
             last_known_pixel_count, last_known_map_dim, last_known_installed_map_json,
             map_fingerprints_json, updated_at
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
      SELECT id, name, device_id, board_json, inputs_json, global_transforms_json, electrical_profile_json,
             keep_patterns_up_to_date,
             pattern_bindings_json, last_known_device_name, last_seen_ip,
             last_known_pixel_count, last_known_map_dim, last_known_installed_map_json,
             map_fingerprints_json, updated_at
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
        last_known_pixel_count, last_known_map_dim, last_known_installed_map_json,
        map_fingerprints_json, board_json, inputs_json,
        global_transforms_json, electrical_profile_json, keep_patterns_up_to_date,
        pattern_bindings_json,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      profile.lastKnownInstalledMap ? JSON.stringify(profile.lastKnownInstalledMap) : null,
      JSON.stringify(profile.mapFingerprints ?? []),
      JSON.stringify(profile.board),
      JSON.stringify(profile.inputs),
      JSON.stringify(profile.globalTransforms),
      profile.electricalProfile ? JSON.stringify(profile.electricalProfile) : null,
      profile.keepPatternsUpToDate ? 1 : 0,
      JSON.stringify(profile.patternBindings),
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
  addAssignment(
    assignments,
    values,
    'last_known_installed_map_json',
    changes.lastKnownInstalledMap,
    true,
  )
  addAssignment(assignments, values, 'map_fingerprints_json', changes.mapFingerprints, true)
  addAssignment(assignments, values, 'board_json', changes.board, true)
  addAssignment(assignments, values, 'inputs_json', changes.inputs, true)
  addAssignment(assignments, values, 'global_transforms_json', changes.globalTransforms, true)
  addAssignment(
    assignments,
    values,
    'electrical_profile_json',
    changes.electricalProfile ?? null,
    true,
    changes.electricalProfile !== undefined,
  )
  addAssignment(
    assignments,
    values,
    'keep_patterns_up_to_date',
    changes.keepPatternsUpToDate ? 1 : 0,
    false,
    changes.keepPatternsUpToDate !== undefined,
  )
  addAssignment(assignments, values, 'pattern_bindings_json', changes.patternBindings, true)
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
  // Only record-level issues block the write. A configuration issue such as
  // hardware brightness on a digital input is coherent and storable; refusing it
  // would lock an affected profile out of every edit, including its repair.
  const issues = controllerProfileRecordIssues(validateControllerProfile(profile))
  if (issues.length > 0) throw new Error(issues.map((issue) => issue.message).join('\n'))
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

function parseJson<T>(value: string | null, fallback?: T): T {
  if (value === null) return fallback as T
  return JSON.parse(value) as T
}
