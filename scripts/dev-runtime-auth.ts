import { readFileSync } from 'node:fs'
import type { SessionUser } from '../src/cloudflare/auth'
import type {
  RuntimeManifest,
  RuntimeRegistry,
} from './dev-runtime-core'

export type LocalSessionRequest =
  | { developer: true; issue?: never }
  | { developer?: false; issue: string }

export function localSessionUser(
  request: LocalSessionRequest,
  registry: RuntimeRegistry,
  manifest: RuntimeManifest,
): SessionUser {
  const userId = request.developer
    ? manifest.localIdentities.developerUserId
    : registry.assignments.find((assignment) => assignment.issue === request.issue)?.userId
  if (!userId) throw new Error(`Issue ${request.issue} has no runtime assignment.`)
  const localId = userId.replace(/^github:/, '')
  const agentMatch = /^local-agent-(\d+)$/.exec(localId)
  const displayName = localId === 'local-dev'
    ? 'Local Dev'
    : agentMatch
      ? `Local Agent ${agentMatch[1]}`
      : localId
  return {
    userId,
    primaryProvider: 'github',
    primaryHandle: localId,
    githubUserId: localId,
    githubLogin: localId,
    displayName,
    avatarUrl: null,
  }
}

export function readDevVarsFile(path: string): Record<string, string> {
  return Object.fromEntries(readFileSync(path, 'utf8').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) return []
    const separator = trimmed.indexOf('=')
    return separator === -1
      ? []
      : [[trimmed.slice(0, separator), trimmed.slice(separator + 1)]]
  }))
}

export function localIdentitySeedSql(manifest: RuntimeManifest): string {
  const users = [
    manifest.localIdentities.developerUserId,
    ...Array.from(
      { length: manifest.localIdentities.agentPoolSize },
      (_, index) => (
        `${manifest.localIdentities.agentUserIdPrefix}${String(index + 1).padStart(2, '0')}`
      ),
    ),
  ]
  return users.map((userId) => {
    const localId = userId.replace(/^github:/, '')
    const displayName = localId === 'local-dev'
      ? 'Local Dev'
      : `Local Agent ${localId.slice(-2)}`
    return `INSERT INTO users (
      id, github_user_id, github_login, display_name, avatar_url, created_at, updated_at
    ) VALUES (
      '${sqlLiteral(userId)}', '${sqlLiteral(localId)}', '${sqlLiteral(localId)}',
      '${sqlLiteral(displayName)}', NULL, unixepoch(), unixepoch()
    ) ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      updated_at = excluded.updated_at;`
  }).join('\n')
}

function sqlLiteral(value: string): string {
  return value.replaceAll("'", "''")
}
