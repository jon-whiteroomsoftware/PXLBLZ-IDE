import { describe, expect, it } from 'vitest'
import {
  collectVitestInputs,
  requiresTypecheck,
  selectPrecommitTests,
  typecheckBuildArgs,
} from './test-selection.mjs'

describe('pre-commit test selection', () => {
  it('typechecks changes that can affect the TypeScript projects', () => {
    expect(requiresTypecheck([
      'src/engine/showLayoutIntervals.ts',
      'src/components/ShowEditor.test.tsx',
      'functions/api/show.ts',
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.node.json',
      'package.json',
      'package-lock.json',
    ])).toBe(true)

    expect(requiresTypecheck([
      'docs/reference/PXLBLZ Technical Reference.md',
      'scripts/test-selection.test.ts',
      'public/favicon.svg',
    ])).toBe(false)

    expect(requiresTypecheck([
      'scripts/review-candidate.ts',
      'scripts/dev-runtime.ts',
    ])).toBe(true)
  })

  it('builds both configured TypeScript projects during the staged gate', () => {
    expect(typecheckBuildArgs()).toEqual([
      'tsc',
      '-b',
      'tsconfig.json',
      'tsconfig.node.json',
      '--pretty',
      'false',
    ])
  })

  it('skips Vitest for documentation-only changes', () => {
    expect(selectPrecommitTests([
      'docs/reference/PXLBLZ Technical Reference.md',
      'README.md',
    ])).toEqual({
      focusedTests: [],
      invariantTests: [],
    })
  })

  it('selects colocated tests for changed source and test files', () => {
    expect(selectPrecommitTests([
      'src/engine/showEasing.ts',
      'src/engine/showEasing.test.ts',
      'docs/notes.md',
    ])).toEqual({
      focusedTests: ['src/engine/showEasing.test.ts'],
      invariantTests: [],
    })
  })

  it('adds compiler, artifact, and resource invariants for Show compiler changes', () => {
    expect(selectPrecommitTests(['src/engine/showCompiler.ts'])).toEqual({
      focusedTests: ['src/engine/showCompiler.test.ts'],
      invariantTests: [
        'src/engine/showCompiler.test.ts',
        'src/engine/showCompilerResources.test.ts',
        'src/engine/showControllerArtifact.test.ts',
        'src/engine/showMotionTransitionSharing.test.ts',
        'src/engine/showVmResourceLedger.test.ts',
        'test/perf-harness/issue514.test.ts',
        'test/perf-harness/issue525.test.ts',
        'test/perf-harness/issue536.test.ts',
      ],
    })
  })

  it('adds persistence invariants for provider, API, or migration changes', () => {
    expect(selectPrecommitTests([
      'src/engine/personalContentRecords.ts',
      'migrations/0012_example.sql',
    ])).toEqual({
      focusedTests: [],
      invariantTests: [
        'src/engine/personalContentMetadata.test.ts',
        'src/engine/personalContentProvider.test.ts',
        'src/cloudflare/d1.test.ts',
        'src/cloudflare/schema.test.ts',
        'src/cloudflare/shows.test.ts',
        'functions/api/resourceProtection.test.ts',
      ],
    })
  })

  it('adds resource-ledger invariants when resource accounting changes', () => {
    expect(selectPrecommitTests(['src/engine/showVmResourceLedger.ts'])).toEqual({
      focusedTests: ['src/engine/showVmResourceLedger.test.ts'],
      invariantTests: [
        'src/engine/showCompilerResources.test.ts',
        'src/engine/showControllerArtifact.test.ts',
        'src/engine/showVmResourceLedger.test.ts',
      ],
    })
  })

  it('adds artifact-contract invariants when artifact production changes', () => {
    expect(selectPrecommitTests([
      'src/engine/bundle.ts',
      'src/engine/artifactStamp.ts',
      'src/engine/artifactMapCompatibility.ts',
    ])).toEqual({
      focusedTests: [
        'src/engine/bundle.test.ts',
        'src/engine/artifactStamp.test.ts',
        'src/engine/artifactMapCompatibility.test.ts',
      ],
      invariantTests: [
        'src/engine/bundle.test.ts',
        'src/engine/passEngine.test.ts',
        'src/engine/fxEmit.test.ts',
        'src/engine/artifactStamp.test.ts',
        'src/engine/artifactMapCompatibility.test.ts',
        'src/engine/pushPattern.test.ts',
        'src/engine/showControllerArtifact.test.ts',
        'src/engine/showPreviewArtifact.test.ts',
      ],
    })
  })

  it('deduplicates changed files and invariant tests before invoking Vitest', () => {
    expect(collectVitestInputs({
      focusedTests: ['src/engine/showCompiler.test.ts'],
      invariantTests: [
        'src/engine/showCompiler.test.ts',
        'src/engine/showCompilerResources.test.ts',
      ],
    })).toEqual([
      'src/engine/showCompiler.test.ts',
      'src/engine/showCompilerResources.test.ts',
    ])
  })

  it('smoke-tests both projects when the test infrastructure changes', () => {
    expect(selectPrecommitTests(['vite.config.ts'])).toEqual({
      focusedTests: [],
      invariantTests: [
        'scripts/dev-runtime-auth.test.ts',
        'scripts/dev-runtime-core.test.ts',
        'scripts/dev-runtime-store.test.ts',
        'scripts/dev-runtime.test.ts',
        'scripts/run-authenticated-playwright.test.ts',
        'scripts/push-review.test.ts',
        'scripts/review-approvals.test.ts',
        'scripts/review-candidate.test.ts',
        'scripts/review-status.test.ts',
        'scripts/test-selection.test.ts',
        'scripts/vitest-discovery.test.ts',
        'scripts/update-issues.test.ts',
        'scripts/show-authoring-mutation.test.ts',
        'src/engine/showEasing.test.ts',
        'src/components/HelpHint.test.tsx',
      ],
    })
  })

  it('runs Show authoring consumers when the shared edit contract changes', () => {
    expect(selectPrecommitTests(['src/test/showAuthoringContract.ts'])).toEqual({
      focusedTests: ['src/test/showAuthoringContract.test.ts'],
      invariantTests: [
        'src/engine/showAuthoringMatrix.test.ts',
        'src/engine/showTimelineClipAuthoring.test.ts',
        'src/engine/showCompositionModel.test.ts',
        'src/engine/showClipInspectorModel.test.ts',
        'src/engine/showLayerTransitionAuthoring.test.ts',
        'src/store/showStore.test.ts',
      ],
    })
  })
})
