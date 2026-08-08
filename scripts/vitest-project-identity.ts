export interface VitestProjectIdentity {
  test?: {
    name?: string
    environment?: string
    browser?: {
      enabled?: boolean
    }
  }
}

const REAL_BROWSER_NAME = /browser|chromium|firefox|webkit|playwright/i

/**
 * Keeps project labels honest: browser-oriented names are evidence claims and
 * may only be attached to projects that actually enable Vitest Browser Mode.
 */
export function assertVitestProjectIdentity(
  projects: readonly VitestProjectIdentity[],
): void {
  for (const project of projects) {
    const name = project.test?.name
    if (!name || !REAL_BROWSER_NAME.test(name)) continue
    if (project.test?.browser?.enabled === true) continue
    const environment = project.test?.environment
      ? ` (environment: ${project.test.environment})`
      : ''
    throw new Error(
      `Vitest project ${JSON.stringify(name)} implies real browser coverage${environment}, but Browser Mode is not enabled.`,
    )
  }
}
