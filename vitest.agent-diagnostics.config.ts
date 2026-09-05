// Known-drift diagnostics for the agent harness (#945). These files end in
// `.diagnostic.ts`, so the ordinary `*.test.ts` discovery never runs them:
// each one keeps a V3-era oracle verbatim where the live V2 engine now
// disagrees, and its failure is the recorded discrepancy, not a CI signal.
//   npm run agent:diagnostics
import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/agent-harness/test/**/*.diagnostic.ts'],
  },
})
