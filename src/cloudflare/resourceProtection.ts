export const MAX_WRITE_REQUEST_BYTES = 1_900_000
export const MAX_PERSONAL_ENTITY_ROWS = 1_000_000
export const MAX_PERSONAL_CONTENT_BYTES = 100_000_000

export interface D1ResourceProtectionStatementLike {
  bind(...values: unknown[]): D1ResourceProtectionStatementLike
  first(): Promise<PersonalStorageUsage | null>
}

export interface D1ResourceProtectionDatabaseLike {
  prepare(sql: string): D1ResourceProtectionStatementLike
}

export interface PersonalStorageUsage {
  entity_count: number
  content_bytes: number
}

const personalStorageUsageSql = `
  WITH
    patterns AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(id) + LENGTH(name) + LENGTH(src) + LENGTH(controls_json)
          + COALESCE(LENGTH(params_json), 0) + COALESCE(LENGTH(settings_json), 0)), 0) AS content_bytes
      FROM personal_patterns WHERE user_id = ?
    ),
    maps AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(id) + LENGTH(name) + LENGTH(generator) + LENGTH(params_json)
          + COALESCE(LENGTH(points_json), 0) + COALESCE(LENGTH(source), 0)
          + COALESCE(LENGTH(grid_dims_json), 0) + COALESCE(LENGTH(import_metadata_json), 0)), 0) AS content_bytes
      FROM personal_maps WHERE user_id = ?
    ),
    mixins AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(id) + LENGTH(name) + LENGTH(kind) + LENGTH(src)), 0) AS content_bytes
      FROM personal_mixins WHERE user_id = ?
    ),
    libraries AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(id) + LENGTH(name) + LENGTH(src)), 0) AS content_bytes
      FROM personal_libraries WHERE user_id = ?
    ),
    shows AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(id) + LENGTH(name) + LENGTH(scenes_json) + LENGTH(zones_json) + LENGTH(cells_json)
          + COALESCE(LENGTH(routing_layouts_json), 0) + COALESCE(LENGTH(routing_switches_json), 0)
          + COALESCE(LENGTH(transitions_json), 0) + COALESCE(LENGTH(output_contract_json), 0)
          + COALESCE(LENGTH(composition_json), 0) + COALESCE(LENGTH(output_effects_json), 0)), 0) AS content_bytes
      FROM personal_shows WHERE user_id = ?
    ),
    controllers AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(id) + LENGTH(name) + COALESCE(LENGTH(device_id), 0)
          + COALESCE(LENGTH(last_known_device_name), 0) + COALESCE(LENGTH(last_seen_ip), 0)
          + COALESCE(LENGTH(map_fingerprints_json), 0) + LENGTH(board_json) + LENGTH(inputs_json)
          + LENGTH(global_transforms_json) + LENGTH(pattern_bindings_json) + LENGTH(zones_json)), 0) AS content_bytes
      FROM controller_profiles WHERE user_id = ?
    ),
    settings AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(key) + LENGTH(value_json)), 0) AS content_bytes
      FROM personal_settings WHERE user_id = ?
    ),
    controller_metadata_rows AS (
      SELECT COUNT(*) AS entity_count,
        COALESCE(SUM(LENGTH(key) + LENGTH(value_json)), 0) AS content_bytes
      FROM controller_metadata WHERE user_id = ?
    )
  SELECT
    patterns.entity_count + maps.entity_count + mixins.entity_count + libraries.entity_count
      + shows.entity_count + controllers.entity_count + settings.entity_count
      + controller_metadata_rows.entity_count AS entity_count,
    patterns.content_bytes + maps.content_bytes + mixins.content_bytes + libraries.content_bytes
      + shows.content_bytes + controllers.content_bytes + settings.content_bytes
      + controller_metadata_rows.content_bytes AS content_bytes
  FROM patterns, maps, mixins, libraries, shows, controllers, settings, controller_metadata_rows
`

const allowedSettingsKeys = new Set([
  'lastActive',
  'demoOverrides',
  'patternOrganization',
  'showOrganization',
  'mapOrganization',
  'controllerOrganization',
  'mixinOrganization',
  'libraryOrganization',
  'workspaceStarterState',
])
const allowedControllerMetadataKeys = new Set([
  'controller-bindings',
  'controller-program-labels',
  'controller-push-records',
])

export class PersonalStorageGuardError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    message: string,
  ) {
    super(message)
    this.name = 'PersonalStorageGuardError'
  }
}

export function assertAllowedPersonalStorageKey(
  kind: 'settings' | 'controller-metadata',
  key: string,
): void {
  if (kind === 'settings' && allowedSettingsKeys.has(key)) return
  if (kind === 'controller-metadata' && allowedControllerMetadataKeys.has(key)) return
  throw new PersonalStorageGuardError('unknown_storage_key', 404, 'Unknown personal-storage key')
}

export function personalStorageGuardResponse(error: unknown): Response | undefined {
  if (!(error instanceof PersonalStorageGuardError)) return undefined
  return Response.json(
    { error: error.message, code: error.code },
    { status: error.status },
  )
}

export async function readProtectedJson<T>(
  request: Request,
  db: D1ResourceProtectionDatabaseLike,
  userId: string,
  options: { createsEntity?: boolean } = {},
): Promise<T> {
  const declaredLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(declaredLength) && declaredLength > MAX_WRITE_REQUEST_BYTES) {
    throw new PersonalStorageGuardError(
      'payload_too_large',
      413,
      `Request body exceeds ${MAX_WRITE_REQUEST_BYTES.toLocaleString()} bytes`,
    )
  }

  const body = await request.text()
  const bodyBytes = new TextEncoder().encode(body).byteLength
  if (bodyBytes > MAX_WRITE_REQUEST_BYTES) {
    throw new PersonalStorageGuardError(
      'payload_too_large',
      413,
      `Request body exceeds ${MAX_WRITE_REQUEST_BYTES.toLocaleString()} bytes`,
    )
  }
  let parsed: T
  try {
    parsed = JSON.parse(body) as T
  } catch {
    throw new PersonalStorageGuardError('malformed_json', 400, 'Request body must be valid JSON')
  }

  const usage = await db
    .prepare(personalStorageUsageSql)
    .bind(userId, userId, userId, userId, userId, userId, userId, userId)
    .first()
  const entityCount = usage?.entity_count ?? 0
  if (options.createsEntity && entityCount >= MAX_PERSONAL_ENTITY_ROWS) {
    throw new PersonalStorageGuardError(
      'entity_limit_reached',
      409,
      `Account has reached the ${MAX_PERSONAL_ENTITY_ROWS.toLocaleString()}-entity safety limit`,
    )
  }
  const contentBytes = usage?.content_bytes ?? 0
  if (contentBytes + bodyBytes > MAX_PERSONAL_CONTENT_BYTES) {
    throw new PersonalStorageGuardError(
      'storage_limit_reached',
      409,
      `Account has reached the ${MAX_PERSONAL_CONTENT_BYTES.toLocaleString()}-byte content safety limit`,
    )
  }

  return parsed
}
