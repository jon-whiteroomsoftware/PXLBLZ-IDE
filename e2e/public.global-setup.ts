import { realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { FullConfig } from '@playwright/test'
import { verifyServedIdentity } from '../scripts/run-public-playwright'

// The public suite refuses to run against a server it cannot prove is serving
// this worktree (#746): the stable main runtime always occupies 5174, so an
// unverified target means a candidate gate can silently pass against old
// main. The dev server reports the worktree it serves at /__identity; no
// answer is a refusal, not a pass.
export default async function verifyPublicPlaywrightTarget(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0]?.use?.baseURL
  if (!baseURL) throw new Error('The public Playwright config declares no baseURL.')
  const identityUrl = new URL('/__identity', baseURL)
  let payload: unknown
  try {
    const response = await fetch(identityUrl)
    if (!response.ok) throw new Error(`GET ${identityUrl} returned ${response.status}`)
    payload = await response.json()
  } catch (error) {
    throw new Error(
      `Cannot verify which build ${baseURL} serves (${error instanceof Error ? error.message : String(error)}). `
      + 'The public suite only runs against a dev server exposing /__identity (#746).',
      { cause: error },
    )
  }
  // This file lives in e2e/, so the worktree under test is its parent.
  // (FullConfig.rootDir resolves to testDir, not the config directory.)
  const identity = verifyServedIdentity(
    payload,
    fileURLToPath(new URL('..', import.meta.url)),
    (path) => realpathSync(path),
  )
  console.log(
    `Public e2e verified target: ${baseURL} serving ${identity.worktree}`
    + (identity.commit ? ` @ ${identity.commit}` : ''),
  )
}
