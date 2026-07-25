export const authenticatedPlaywrightUserId = 'github:playwright-shows'
export const authenticatedPlaywrightProbeId = '__playwright_local_d1_owner_probe__'

export function authenticatedPlaywrightSeedSql(now: number): string {
  return `INSERT INTO users (id, display_name, avatar_url, created_at, updated_at)
    VALUES ('${authenticatedPlaywrightUserId}', 'Playwright Shows', NULL, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at;
    INSERT INTO personal_patterns (user_id, id, name, src, controls_json, created_at, updated_at)
    VALUES ('${authenticatedPlaywrightUserId}', '${authenticatedPlaywrightProbeId}', 'Local D1 ownership probe', 'export function render(index) { }', '{}', ${now}, ${now})
    ON CONFLICT(user_id, id) DO UPDATE SET updated_at = excluded.updated_at;`
}
