import type { ShowCompositionV1, ShowRecord } from '../engine/personalContentRecords'
import { normalizeShowRoutingState, normalizeShowTransitionState } from '../engine/showModel'
import { normalizeShowOutputContract } from '../engine/showOutputContract'
import { normalizeShowComposition } from '../engine/showCompositionModel'

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
  routing_switches_json?: string | null
  transitions_json?: string | null
  composition_json?: string | null
  output_contract_json?: string | null
  target_controller_profile_id: string | null
  stage_map_id: string | null
  updated_at: number
}

export function showRecordFromRow(row: D1ShowRow): ShowRecord {
  const outputContract = row.output_contract_json
    ? normalizeShowOutputContract(parseJson(row.output_contract_json, null))
    : undefined
  const show = normalizeShowTransitionState(normalizeShowRoutingState({
    id: row.id,
    name: row.name,
    scenes: parseJson(row.scenes_json, []),
    zones: parseJson(row.zones_json, []),
    cells: parseJson(row.cells_json, []),
    routingLayouts: parseJson(row.routing_layouts_json ?? '[]', []),
    routingSwitches: parseJson(row.routing_switches_json ?? '[]', []),
    ...(row.transitions_json ? { transitions: parseJson(row.transitions_json, []) } : {}),
    ...(row.target_controller_profile_id ? { targetControllerProfileId: row.target_controller_profile_id } : {}),
    stageMapId: row.stage_map_id ?? null,
    ...(outputContract ? { outputContract } : {}),
    updatedAt: row.updated_at,
  }))
  const composition = row.composition_json
    ? parseJson<ShowCompositionV1 | null>(row.composition_json, null)
    : null
  return composition?.version === 1
    ? { ...show, composition: normalizeShowComposition(show, composition) }
    : show
}

export async function listD1Shows(db: D1DatabaseShowsLike, userId: string): Promise<ShowRecord[]> {
  const { results } = await db
    .prepare(`
      SELECT id, name, scenes_json, zones_json, cells_json, routing_layouts_json, routing_switches_json, transitions_json,
             composition_json, target_controller_profile_id, stage_map_id, output_contract_json, updated_at
      FROM personal_shows
      WHERE user_id = ?
      ORDER BY updated_at DESC
    `)
    .bind(userId)
    .all<D1ShowRow>()
  return results.map(showRecordFromRow)
}

export async function createD1Show(
  db: D1DatabaseShowsLike,
  userId: string,
  record: ShowRecord,
  now = Math.floor(Date.now() / 1000),
): Promise<void> {
  await db
    .prepare(`
      INSERT INTO personal_shows (
        user_id, id, name, scenes_json, zones_json, cells_json, routing_layouts_json, routing_switches_json, transitions_json,
        composition_json, target_controller_profile_id, stage_map_id, output_contract_json, created_at, updated_at
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
      JSON.stringify(record.routingSwitches),
      JSON.stringify(normalizeShowTransitionState(record).transitions),
      record.composition ? JSON.stringify(normalizeShowComposition(record, record.composition)) : null,
      record.targetControllerProfileId ?? null,
      record.stageMapId ?? null,
      record.outputContract ? JSON.stringify(record.outputContract) : null,
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
  addAssignment(assignments, values, 'name', changes.name)
  addAssignment(assignments, values, 'scenes_json', changes.scenes, true)
  addAssignment(assignments, values, 'zones_json', changes.zones, true)
  addAssignment(assignments, values, 'cells_json', changes.cells, true)
  addAssignment(assignments, values, 'routing_layouts_json', changes.routingLayouts, true)
  addAssignment(assignments, values, 'routing_switches_json', changes.routingSwitches, true)
  addAssignment(assignments, values, 'transitions_json', changes.transitions, true)
  addAssignment(assignments, values, 'composition_json', changes.composition, true)
  addAssignment(assignments, values, 'target_controller_profile_id', changes.targetControllerProfileId)
  addAssignment(assignments, values, 'stage_map_id', changes.stageMapId)
  addAssignment(assignments, values, 'output_contract_json', changes.outputContract, true)
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
