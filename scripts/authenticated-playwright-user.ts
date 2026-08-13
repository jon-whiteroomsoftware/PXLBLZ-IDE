export const authenticatedPlaywrightProbeId = '__playwright_local_d1_owner_probe__'

export const authenticatedPlaywrightWorkerCount = 4

export function authenticatedPlaywrightUser(workerIndex: number) {
  const suffix = String(workerIndex).padStart(2, '0')
  const handle = `playwright-worker-${suffix}`
  return {
    userId: `github:${handle}`,
    primaryProvider: 'github' as const,
    primaryHandle: handle,
    githubUserId: handle,
    githubLogin: handle,
    displayName: `Playwright Worker ${suffix}`,
    avatarUrl: null,
  }
}

export function authenticatedPlaywrightSeedSql(
  now: number,
  workerCount = authenticatedPlaywrightWorkerCount,
): string {
  const users = Array.from({ length: workerCount }, (_, workerIndex) => {
    const user = authenticatedPlaywrightUser(workerIndex)
    return `INSERT INTO users (
      id, github_user_id, github_login, display_name, avatar_url, created_at, updated_at
    ) VALUES (
      '${user.userId}', '${user.githubUserId}', '${user.githubLogin}',
      '${user.displayName}', NULL, ${now}, ${now}
    ) ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at;`
  }).join('\n')
  const owner = authenticatedPlaywrightUser(0)
  return `${users}
    INSERT INTO personal_patterns (user_id, id, name, src, controls_json, created_at, updated_at)
    VALUES ('${owner.userId}', '${authenticatedPlaywrightProbeId}', 'Local D1 ownership probe', 'export function render(index) { }', '{}', ${now}, ${now})
    ON CONFLICT(user_id, id) DO UPDATE SET updated_at = excluded.updated_at;`
}
