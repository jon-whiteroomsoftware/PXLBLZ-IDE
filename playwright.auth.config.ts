import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.auth.spec.ts',
  fullyParallel: false,
  workers: 1,
  reporter: 'list',
  globalSetup: './e2e/auth.global-setup.ts',
  use: {
    baseURL: 'http://localhost:5174/PXLBLZ-IDE/',
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
      url: 'http://localhost:5174/PXLBLZ-IDE/',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
})
