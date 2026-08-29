import { defineConfig, devices } from '@playwright/test'

// E2E config. Specs live in e2e/ (kept out of the Vitest unit suite — see vite.config.ts).
//
// The target is always explicit (#746): the stable reviewed-main runtime
// intentionally always occupies 5174, so a config that reused whatever
// listened there let a worktree gate run silently pass against old main.
// `npm run test:e2e` (scripts/run-public-playwright.ts) reserves a registry
// port and sets both variables so Playwright starts a candidate-owned
// server; alternatively set PLAYWRIGHT_STUDIO_URL alone to target a managed
// runtime already serving this worktree. Global setup verifies the served
// worktree identity before any spec runs.
const studioUrl = process.env.PLAYWRIGHT_STUDIO_URL
if (!studioUrl) {
  throw new Error(
    'PLAYWRIGHT_STUDIO_URL is required. Run the public suite with `npm run test:e2e`, '
    + 'which reserves a candidate-owned server, or set PLAYWRIGHT_STUDIO_URL to a managed '
    + 'runtime already serving this worktree (#746).',
  )
}
const vitePort = process.env.PLAYWRIGHT_PUBLIC_VITE_PORT
const persistState = process.env.PLAYWRIGHT_PUBLIC_PERSIST_STATE

function shellArgument(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

export default defineConfig({
  testDir: './e2e',
  testIgnore: '**/*.auth.spec.ts',
  fullyParallel: true,
  reporter: 'list',
  globalSetup: './e2e/public.global-setup.ts',
  use: {
    baseURL: studioUrl,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: vitePort && persistState
    ? {
        // Hermetic single-process candidate server (#901): the candidate's
        // Worker and a throwaway migrated D1 run inside the Vite process.
        // VITE_API_PROXY_TARGET is cleared explicitly: an inherited value would
        // silently select legacy proxy mode and bypass the candidate Worker.
        command: `VITE_API_PROXY_TARGET= VITE_PORT=${vitePort} VITE_CF_PERSIST_STATE=${shellArgument(persistState)} npm run dev`,
        url: `http://localhost:${vitePort}/api/me`,
        reuseExistingServer: false,
        timeout: 120_000,
      }
    : undefined,
})
