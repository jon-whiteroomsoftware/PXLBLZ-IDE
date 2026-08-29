import { defineConfig, devices } from '@playwright/test'
import { authenticatedPlaywrightWorkerCount } from './scripts/authenticated-playwright-user'

// Authenticated smoke owns its port. One worker-dev Vite process (#901)
// serves UI, /api, and the suite's isolated D1 store; reusing another
// runtime's server would silently point the suite at a different database.
const vitePort = requireEnvironment('PLAYWRIGHT_AUTH_SMOKE_VITE_PORT')
const studioBaseUrl = process.env.PLAYWRIGHT_STUDIO_URL ?? `http://localhost:${vitePort}/PXLBLZ-IDE/`
const persistenceDirectory = requireEnvironment('PXLBLZ_D1_PERSIST_TO')
requireEnvironment('PXLBLZ_DEV_VARS_FILE')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.auth.spec.ts',
  fullyParallel: true,
  workers: authenticatedPlaywrightWorkerCount,
  reporter: 'list',
  globalSetup: './e2e/auth.global-setup.ts',
  // All workers share one in-process Worker, so /api/me and personal content
  // loads can push a Studio route's first paint past Playwright's 5s default
  // under full-suite parallel load (#683).
  expect: { timeout: 15_000 },
  use: {
    baseURL: studioBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // VITE_API_PROXY_TARGET is cleared explicitly: an inherited value would
    // silently select legacy proxy mode and point the suite at another D1.
    command: `VITE_API_PROXY_TARGET= VITE_PORT=${vitePort} VITE_CF_PERSIST_STATE=${shellArgument(persistenceDirectory)} npm run dev`,
    // /api/me proves the in-process Worker and its D1 store, not just Vite.
    url: `http://localhost:${vitePort}/api/me`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})

function requireEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) {
    throw new Error(
      `${name} is required. Run authenticated specs through npm run test:e2e:auth-smoke or npm run test:e2e:shows.`,
    )
  }
  return value
}

function shellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}
