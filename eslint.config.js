import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import reactHooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    // `src/engine/maps/sources/*.js` are intentionally bare `function(pixelCount){…}`
    // expressions consumed verbatim via Vite `?raw` (ADR-0008), not ES modules — they
    // can't be parsed standalone and must not be wrapped in `export`.
    ignores: [
      'dist',
      'node_modules',
      'src/pixelblaze/lib',
      'src/pixelblaze/demos',
      'src/engine/maps/sources/**',
      'test/divergence-harness/probe.js',
      'test/perf-harness/profiler.js',
      // Throwaway hardware spikes: MV3 extension code (browser/SW globals,
      // `eval`'d remote compiler), human-in-the-loop, excluded from the gate.
      'test/h1-extension-spike/**',
      'test/h8-compiler-spike/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Allow `_`-prefixed bindings to be intentionally unused — the convention
      // for destructuring keys purely to drop them (e.g. stripping a legacy
      // persisted blob's stale fields out of a rest spread).
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
)
