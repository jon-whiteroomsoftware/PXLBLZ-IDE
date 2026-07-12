import { execFileSync } from 'node:child_process'

export default function prepareAuthenticatedPlaywrightUser(): void {
  const now = Math.floor(Date.now() / 1000)
  const sql = `INSERT INTO users (id, display_name, avatar_url, created_at, updated_at)
    VALUES ('github:playwright-shows', 'Playwright Shows', NULL, ${now}, ${now})
    ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, updated_at = excluded.updated_at;`

  execFileSync('npx', [
    'wrangler', 'd1', 'execute', 'pxlblz-ide', '--local', '--command', sql,
  ], { cwd: process.cwd(), stdio: 'inherit' })
}
