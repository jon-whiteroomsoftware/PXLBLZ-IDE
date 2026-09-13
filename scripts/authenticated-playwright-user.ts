export const authenticatedPlaywrightProbeId = '__playwright_local_d1_owner_probe__'

export const authenticatedPlaywrightWorkerCount = 4
export const authenticatedPlaywrightAccountsPerWorker = 64

export function authenticatedPlaywrightAccountIndex(workerIndex: number, sequence: number): number {
  if (!Number.isSafeInteger(workerIndex) || workerIndex < 0 || workerIndex >= authenticatedPlaywrightWorkerCount) throw new Error('Authenticated Playwright worker index is out of range.')
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence >= authenticatedPlaywrightAccountsPerWorker) throw new Error('Authenticated Playwright exhausted its per-worker account pool.')
  return workerIndex * authenticatedPlaywrightAccountsPerWorker + sequence
}

export function authenticatedPlaywrightUser(accountIndex: number) {
  const suffix = String(accountIndex).padStart(3, '0')
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
  accountCount = authenticatedPlaywrightWorkerCount * authenticatedPlaywrightAccountsPerWorker,
): string {
  const users = Array.from({ length: accountCount }, (_, accountIndex) => {
    const user = authenticatedPlaywrightUser(accountIndex)
    return `INSERT INTO users (
      id, github_user_id, github_login, display_name, avatar_url, created_at, updated_at
    ) VALUES (
      '${user.userId}', '${user.githubUserId}', '${user.githubLogin}',
      '${user.displayName}', NULL, ${now}, ${now}
    ) ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at;
    INSERT INTO personal_settings (user_id, key, value_json, updated_at)
    VALUES (
      '${user.userId}', 'workspaceStarterState',
      '{"version":1,"initialized":["patterns","maps","mixins","libraries"]}', ${now}
    ) ON CONFLICT(user_id, key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_at = excluded.updated_at;`
  }).join('\n')
  const owner = authenticatedPlaywrightUser(0)
  return `${users}
    INSERT INTO personal_patterns (user_id, id, name, src, controls_json, created_at, updated_at)
    VALUES ('${owner.userId}', '${authenticatedPlaywrightProbeId}', 'Local D1 ownership probe', 'export function render(index) { }', '{}', ${now}, ${now})
    ON CONFLICT(user_id, id) DO UPDATE SET updated_at = excluded.updated_at;`
}
