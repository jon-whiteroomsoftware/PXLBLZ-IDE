import type { ShowCompositionV1, ShowRecord } from '../engine/personalContentRecords'
import { normalizeShowRoutingState, normalizeShowTransitionState } from '../engine/showModel'
import { requireShowOutputContract } from '../engine/showOutputContract'
import { normalizeShowOutputEffects } from '../engine/showPreviousRgbFeedback'
import {
  normalizeShowComposition,
  validateShowComposition,
  validateShowCompositionTimelineMetadata,
} from '../engine/showCompositionModel'
import { PersonalStorageGuardError } from './resourceProtection'

export interface D1ShowStatementLike {
  bind(...values: unknown[]): D1ShowStatementLike
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>
  run(): Promise<{ success: boolean }>
}

export interface D1DatabaseShowsLike {
  prepare(sql: string): D1ShowStatementLike
}

export interface D1ShowRow {
  id: string
  name: string
  scenes_json: string
  zones_json: string
  cells_json: string
  routing_layouts_json?: string | null
  transitions_json?: string | null
  composition_json?: string | null
  output_effects_json?: string | null
  output_contract_json?: string | null
  target_controller_profile_id: string | null
  stage_map_id: string | null
  updated_at: number
}

export interface D1UnreadableShow {
  id: string
  name: string
  code: 'missing_show_output_contract' | 'invalid_show_record'
  error: string
}

export interface D1ShowListResult {
  shows: ShowRecord[]
  unreadableShows: D1UnreadableShow[]
}

export function showRecordFromRow(row: D1ShowRow): ShowRecord {
  const outputContract = requireShowOutputContract(
    row.output_contract_json ? parseJson(row.output_contract_json, null) : null,
    row.id,
  )
  const outputEffects = row.output_effects_json
    ? normalizeShowOutputEffects(parseJson(row.output_effects_json, []))
    : []
  const show = normalizeShowTransitionState(normalizeShowRoutingState({
    id: row.id,
    name: row.name,
    scenes: parseJson(row.scenes_json, []),
    zones: parseJson(row.zones_json, []),
    cells: parseJson(row.cells_json, []),
    routingLayouts: parseJson(row.routing_layouts_json ?? '[]', []),
    transitions: parseJson(row.transitions_json ?? '[]', []),
    ...(row.target_controller_profile_id ? { targetControllerProfileId: row.target_controller_profile_id } : {}),
    stageMapId: row.stage_map_id ?? null,
    outputContract,
    ...(outputEffects.length > 0 ? { outputEffects } : {}),
    updatedAt: row.updated_at,
  }))
  const composition = row.composition_json
    ? normalizeStoredComposition(show, parseJson<unknown>(row.composition_json, null))
    : undefined
  return composition ? { ...show, composition } : show
}

export async function listD1Shows(db: D1DatabaseShowsLike, userId: string): Promise<D1ShowListResult> {
  const { results } = await db
    .prepare(`
      SELECT id, name, scenes_json, zones_json, cells_json, routing_layouts_json, transitions_json,
             composition_json, output_effects_json, target_controller_profile_id, stage_map_id, output_contract_json, updated_at
      FROM personal_shows
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1ShowRow>()
  const shows: ShowRecord[] = []
  const unreadableShows: D1UnreadableShow[] = []
  for (const row of results) {
    try {
      shows.push(showRecordFromRow(row))
    } catch (error) {
      unreadableShows.push({
        id: row.id,
        name: row.name,
        code: row.output_contract_json ? 'invalid_show_record' : 'missing_show_output_contract',
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return { shows, unreadableShows }
}

export async function createD1Show(
  db: D1DatabaseShowsLike,
  userId: string,
  record: ShowRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  const outputContract = requireWritableShowOutputContract(record.outputContract, record.id)
  if (
    record.composition != null
    && (!isShowSceneArray(record.scenes) || !isShowZoneArray(record.zones))
  ) {
    throw unsupportedCompositionError()
  }
  const composition = record.composition == null
    ? null
    : requireValidComposition(record, record.composition)
  await db
    .prepare(`
      INSERT INTO personal_shows (
        user_id, id, name, scenes_json, zones_json, cells_json, routing_layouts_json, transitions_json,
        composition_json, output_effects_json, target_controller_profile_id, stage_map_id, output_contract_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .bind(
      userId,
      record.id,
      record.name,
      JSON.stringify(record.scenes),
      JSON.stringify(record.zones),
      JSON.stringify(record.cells),
      JSON.stringify(record.routingLayouts),
      JSON.stringify(normalizeShowTransitionState(record).transitions),
      composition ? JSON.stringify(composition) : null,
      record.outputEffects?.length ? JSON.stringify(normalizeShowOutputEffects(record.outputEffects)) : null,
      record.targetControllerProfileId ?? null,
      record.stageMapId ?? null,
      JSON.stringify(outputContract),
      now,
      record.updatedAt,
    )
    .run()
}

export async function updateD1Show(
  db: D1DatabaseShowsLike,
  userId: string,
  id: string,
  changes: Partial<Omit<ShowRecord, 'id'>>,
): Promise<void> {
  const assignments: string[] = []
  const values: unknown[] = []
  const outputContract = changes.outputContract === undefined
    ? undefined
    : requireWritableShowOutputContract(changes.outputContract, id)
  const composition = await normalizeCompositionUpdate(db, userId, id, changes)
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'scenes_json', changes.scenes, true)
  addAssignment(assignments, values, 'zones_json', changes.zones, true)
  addAssignment(assignments, values, 'cells_json', changes.cells, true)
  addAssignment(assignments, values, 'routing_layouts_json', changes.routingLayouts, true)
  addAssignment(assignments, values, 'transitions_json', changes.transitions, true)
  addAssignment(assignments, values, 'composition_json', composition, true)
  addAssignment(assignments, values, 'output_effects_json', changes.outputEffects, true)
  addAssignment(assignments, values, 'target_controller_profile_id', changes.targetControllerProfileId)
  addAssignment(assignments, values, 'stage_map_id', changes.stageMapId)
  addAssignment(assignments, values, 'output_contract_json', outputContract, true)
  addAssignment(assignments, values, 'updated_at', changes.updatedAt)
  if (assignments.length === 0) return

  await db
    .prepare(`
      UPDATE personal_shows
      SET ${assignments.join(', ')}
      WHERE user_id = ? AND id = ?
    `)
    .bind(...values, userId, id)
    .run()
}

export async function deleteD1Show(db: D1DatabaseShowsLike, userId: string, id: string): Promise<void> {
  await db
    .prepare('DELETE FROM personal_shows WHERE user_id = ? AND id = ?')
    .bind(userId, id)
    .run()
}

function addAssignment(
  assignments: string[],
  values: unknown[],
  column: string,
  value: unknown,
  json = false,
): void {
  if (value === undefined) return
  assignments.push(`${column} = ?`)
  values.push(json && value !== null ? JSON.stringify(value) : value)
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

function normalizeStoredComposition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  value: unknown,
): ShowCompositionV1 | undefined {
  try {
    if (!isCompositionV1Envelope(value)) return undefined
    if (validateShowCompositionTimelineMetadata(value).length > 0) return undefined
    const normalized = normalizeShowComposition(show, value)
    return validateShowComposition(show, normalized).length === 0 ? normalized : undefined
  } catch {
    return undefined
  }
}

function requireValidComposition(
  show: Pick<ShowRecord, 'scenes' | 'zones'>,
  value: unknown,
): ShowCompositionV1 {
  if (!isCompositionV1Envelope(value)) throw unsupportedCompositionError()
  try {
    if (validateShowCompositionTimelineMetadata(value).length > 0) throw unsupportedCompositionError()
    const normalized = normalizeShowComposition(show, value)
    if (validateShowComposition(show, normalized).length > 0) throw unsupportedCompositionError()
    return normalized
  } catch (error) {
    if (error instanceof PersonalStorageGuardError) throw error
    throw unsupportedCompositionError()
  }
}

async function normalizeCompositionUpdate(
  db: D1DatabaseShowsLike,
  userId: string,
  id: string,
  changes: Partial<Omit<ShowRecord, 'id'>>,
): Promise<ShowCompositionV1 | null | undefined> {
  if (changes.composition === undefined || changes.composition === null) return changes.composition
  if (!isCompositionV1Envelope(changes.composition)) throw unsupportedCompositionError()
  try {
    if (validateShowCompositionTimelineMetadata(changes.composition).length > 0) throw unsupportedCompositionError()
    if (changes.scenes !== undefined && !isShowSceneArray(changes.scenes)) throw unsupportedCompositionError()
    if (changes.zones !== undefined && !isShowZoneArray(changes.zones)) throw unsupportedCompositionError()
    let scenes: unknown = changes.scenes
    let zones: unknown = changes.zones
    if (scenes === undefined || zones === undefined) {
      const { results } = await db
        .prepare(`
          SELECT scenes_json, zones_json
          FROM personal_shows
          WHERE user_id = ? AND id = ?
        `)
        .bind(userId, id)
        .all<Pick<D1ShowRow, 'scenes_json' | 'zones_json'>>()
      const stored = results[0]
      if (!stored) throw unsupportedCompositionError()
      if (scenes === undefined) scenes = parseJson<unknown>(stored.scenes_json, null)
      if (zones === undefined) zones = parseJson<unknown>(stored.zones_json, null)
    }
    if (!isShowSceneArray(scenes) || !isShowZoneArray(zones)) throw unsupportedCompositionError()
    return requireValidComposition({ scenes, zones }, changes.composition)
  } catch (error) {
    if (error instanceof PersonalStorageGuardError) throw error
    throw unsupportedCompositionError()
  }
}

function isCompositionV1Envelope(value: unknown): value is ShowCompositionV1 {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<ShowCompositionV1> & { version?: unknown }
  return candidate.version === 1
    && Array.isArray(candidate.patternInstances)
    && Array.isArray(candidate.scenes)
}

function isShowSceneArray(value: unknown): value is ShowRecord['scenes'] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((scene) => (
      isRecord(scene)
      && isNonEmptyString(scene.id)
      && typeof scene.name === 'string'
      && Number.isInteger(scene.durationMs)
      && Number(scene.durationMs) > 0
      && (
        scene.routingTargets === undefined
        || (
          isRecord(scene.routingTargets)
          && (
            scene.routingTargets.splitPosition === undefined
            || Number.isFinite(scene.routingTargets.splitPosition)
          )
        )
      )
      && (
        scene.sampleTargets === undefined
        || (
          isRecord(scene.sampleTargets)
          && (
            scene.sampleTargets.repeatScale === undefined
            || Number.isFinite(scene.sampleTargets.repeatScale)
          )
        )
      )
    ))
}

function isShowZoneArray(value: unknown): value is ShowRecord['zones'] {
  return Array.isArray(value)
    && value.length > 0
    && value.every((zone) => (
      isRecord(zone)
      && isNonEmptyString(zone.id)
      && typeof zone.name === 'string'
      && Number.isInteger(zone.nominalPixelCount)
      && Number(zone.nominalPixelCount) > 0
      && (zone.color === undefined || typeof zone.color === 'string')
      && (zone.icon === undefined || typeof zone.icon === 'string')
    ))
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function unsupportedCompositionError(): PersonalStorageGuardError {
  return new PersonalStorageGuardError(
    'unsupported_show_composition',
    400,
    'Show composition must be a valid version-1 payload',
  )
}

function requireWritableShowOutputContract(value: unknown, showId: string) {
  try {
    return requireShowOutputContract(value, showId)
  } catch {
    throw new PersonalStorageGuardError(
      'missing_show_output_contract',
      400,
      `Show ${showId} is missing a valid output contract`,
    )
  }
}
