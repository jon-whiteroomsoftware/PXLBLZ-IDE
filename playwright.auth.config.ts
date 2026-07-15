import { defineConfig, devices } from '@playwright/test'

const studioBaseUrl = process.env.PLAYWRIGHT_STUDIO_URL ?? 'http://localhost:5174/PXLBLZ-IDE/'

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
      command: 'npm run cf:dev:local',
      url: 'http://localhost:8788/api/me',
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: studioBaseUrl,
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
