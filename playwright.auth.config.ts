import { defineConfig, devices } from '@playwright/test'

// Authenticated smoke owns its two ports. The persistent 5174/8788 dev pair can
// belong to another worktree, and reusing only one of that pair silently points
// Vite at a different local D1 database.
const vitePort = requireEnvironment('PLAYWRIGHT_AUTH_SMOKE_VITE_PORT')
const wranglerPort = requireEnvironment('PLAYWRIGHT_AUTH_SMOKE_WRANGLER_PORT')
const studioBaseUrl = process.env.PLAYWRIGHT_STUDIO_URL ?? `http://localhost:${vitePort}/PXLBLZ-IDE/`
const wranglerUrl = `http://localhost:${wranglerPort}`
const persistenceDirectory = requireEnvironment('PXLBLZ_D1_PERSIST_TO')
requireEnvironment('PXLBLZ_DEV_VARS_FILE')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.auth.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/auth.global-setup.ts',
  use: {
    baseURL: studioBaseUrl,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: [
        'npx wrangler pages dev dist',
        `--port ${wranglerPort}`,
        `--persist-to ${shellArgument(persistenceDirectory)}`,
        '--show-interactive-dev-session=false',
      ].join(' '),
      url: `${wranglerUrl}/api/me`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: `VITE_PORT=${vitePort} VITE_API_PROXY_TARGET=${wranglerUrl} npm run dev`,
      url: studioBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
    },
  ],
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
