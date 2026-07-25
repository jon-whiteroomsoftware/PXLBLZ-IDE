import { defineConfig, devices } from '@playwright/test'

// Authenticated smoke owns its two ports. The persistent 5174/8788 dev pair can
// belong to another worktree, and reusing only one of that pair silently points
// Vite at a different local D1 database.
const vitePort = process.env.PLAYWRIGHT_AUTH_SMOKE_VITE_PORT ?? '5175'
const wranglerPort = process.env.PLAYWRIGHT_AUTH_SMOKE_WRANGLER_PORT ?? '8789'
const studioBaseUrl = process.env.PLAYWRIGHT_STUDIO_URL ?? `http://localhost:${vitePort}/PXLBLZ-IDE/`
const wranglerUrl = `http://localhost:${wranglerPort}`

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
      command: `npx wrangler pages dev dist --port ${wranglerPort}`,
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
