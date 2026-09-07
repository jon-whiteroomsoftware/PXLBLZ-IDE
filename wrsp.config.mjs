// PXLBLZ-IDE configuration for @whiteroom/software-process (#724, #940).
//
// review.projectPolicy participates in the review policy fingerprint:
// editing it changes new candidate review context. WRSP 0.8.0 retains
// historical native approvals under their recorded policy. The selection boundaries reproduce the invariant map
// that previously lived in scripts/test-selection.mjs.
//
// The UI proof policy is deliberately NOT here: wrsp-ui-proof.json is a
// pure-data file the gate reads as a blob from both ends of a candidate
// range, so executable configuration can never substitute its own patterns.
export default {
  review: {
    projectPolicy: `For changed user flows, assess whether the candidate's tests and required proof demonstrate the affected behavior. Focused checks support implementation and repairs; the required full suites in runner.suites produce exact-tip evidence before landing and the publication hook consumes it. An X-E2E trailer or an e2e spec change is not execution evidence. Do not demand an additional equivalent full local suite merely because runner evidence is produced separately. During explicit deferred-UI-proof code review, missing deferred UI evidence is not itself a defect; assess code, tests, and other required proof normally. During evidence review, proof-only insufficiency may return proof-incomplete; actual product defects retain normal severity. Ordinary review still requires browser/artifact proof, and missing behavioral coverage or other required proof remains a finding under the normal severity contract.`,
  },
  runner: {
    suites: {
      'full-vitest': {
        command: ['npm', 'run', 'test:full'],
        required: true,
        timeoutMinutes: 10,
        resourceClass: 'default',
      },
      'e2e-public': {
        command: ['npm', 'run', 'test:e2e'],
        required: true,
        timeoutMinutes: 15,
        artifacts: ['playwright-report/**', 'test-results/**/trace.zip'],
        resourceClass: 'exclusive',
      },
      'e2e-auth-smoke': {
        command: ['npm', 'run', 'test:e2e:auth-smoke'],
        required: true,
        timeoutMinutes: 15,
        artifacts: ['playwright-report/**', 'test-results/**/trace.zip'],
        resourceClass: 'exclusive',
      },
      'e2e-shows': {
        command: ['npm', 'run', 'test:e2e:shows'],
        required: true,
        timeoutMinutes: 20,
        artifacts: ['playwright-report/**', 'test-results/**/trace.zip'],
        resourceClass: 'exclusive',
      },
    },
  },
  selection: {
    typecheckExact: [
      'vite.config.ts',
      'tsconfig.json',
      'tsconfig.node.json',
      'package.json',
      'package-lock.json',
      'playwright.config.ts',
      'playwright.auth.config.ts',
      'e2e/auth.global-setup.ts',
      'e2e/public.global-setup.ts',
      'e2e/fixtures/authenticated.ts',
      'scripts/authenticated-playwright-user.ts',
      'scripts/dev-runtime-auth.ts',
      'scripts/dev-runtime-core.ts',
      'scripts/dev-runtime-store.ts',
      'scripts/dev-runtime.ts',
      'scripts/local-session-cookie.ts',
      'scripts/run-authenticated-playwright.ts',
      'scripts/run-public-playwright.ts',
      'scripts/with-suite-lock.ts',
      'scripts/vitest-project-identity.ts',
    ],
    typecheckPatterns: ['^(src|functions)/.*\\.[cm]?[jt]sx?$'],
    typecheckArgs: [
      'tsc',
      '-b',
      'tsconfig.json',
      'tsconfig.node.json',
      '--pretty',
      'false',
    ],
    boundaries: [
      {
        name: 'show-compiler',
        exact: ['src/engine/showCompiler.ts'],
        tests: [
          'src/engine/showCompiler.test.ts',
          'src/engine/showCompilerResources.test.ts',
          'src/engine/showControllerArtifact.test.ts',
          'src/engine/showMotionTransitionSharing.test.ts',
          'src/engine/showVmResourceLedger.test.ts',
          'test/perf-harness/issue514.test.ts',
          'test/perf-harness/issue525.test.ts',
          'test/perf-harness/issue536.test.ts',
        ],
      },
      {
        name: 'persistence',
        exact: ['src/engine/remotePersonalContentProvider.ts'],
        prefixes: [
          'src/engine/personalContent',
          'src/cloudflare/',
          'src/worker/routes/',
          'migrations/',
        ],
        tests: [
          'src/engine/personalContentMetadata.test.ts',
          'src/engine/personalContentProvider.test.ts',
          'src/cloudflare/d1.test.ts',
          'src/cloudflare/schema.test.ts',
          'src/cloudflare/shows.test.ts',
          'src/worker/index.test.ts',
        ],
      },
      {
        name: 'resource-ledger',
        exact: ['src/engine/showVmResourceLedger.ts'],
        tests: [
          'src/engine/showCompilerResources.test.ts',
          'src/engine/showControllerArtifact.test.ts',
          'src/engine/showVmResourceLedger.test.ts',
        ],
      },
      {
        name: 'artifact-contract',
        exact: [
          'src/engine/bundle.ts',
          'src/engine/passEngine.ts',
          'src/engine/fxEmit.ts',
          'src/engine/artifactStamp.ts',
          'src/engine/artifactMapCompatibility.ts',
          'src/engine/pushPattern.ts',
          'src/engine/showControllerArtifact.ts',
          'src/engine/showPreviewArtifact.ts',
        ],
        tests: [
          'src/engine/bundle.test.ts',
          'src/engine/passEngine.test.ts',
          'src/engine/fxEmit.test.ts',
          'src/engine/artifactStamp.test.ts',
          'src/engine/artifactMapCompatibility.test.ts',
          'src/engine/pushPattern.test.ts',
          'src/engine/showControllerArtifact.test.ts',
          'src/engine/showPreviewArtifact.test.ts',
        ],
      },
      {
        name: 'test-infrastructure',
        exact: [
          '.husky/pre-commit',
          '.husky/pre-push',
          '.husky/scripts/update-issues.sh',
          'dev-runtime.json',
          'playwright.config.ts',
          'playwright.auth.config.ts',
          'runner/dev.vars.runner',
          'vite.config.ts',
          'vitest.mutation.config.ts',
          'package.json',
          'package-lock.json',
          'wrsp.config.mjs',
          'wrsp-ui-proof.json',
          'e2e/auth.global-setup.ts',
          'e2e/public.global-setup.ts',
          'e2e/fixtures/authenticated.ts',
          'scripts/authenticated-playwright-user.ts',
          'scripts/dev-runtime-auth.ts',
          'scripts/dev-runtime-core.ts',
          'scripts/dev-runtime-store.ts',
          'scripts/dev-runtime.ts',
          'scripts/local-session-cookie.ts',
          'scripts/run-authenticated-playwright.ts',
          'scripts/run-public-playwright.ts',
          'scripts/with-suite-lock.ts',
          'scripts/vitest-project-identity.ts',
          'scripts/wrsp-guard-fixture.ts',
          'scripts/qualify-layout-757.mjs',
          'src/test/setup.ts',
          'src/test/layout.setup.ts',
        ],
        prefixes: ['vendor/'],
        tests: [
          'scripts/dev-runtime-auth.test.ts',
          'scripts/dev-runtime-core.test.ts',
          'scripts/dev-runtime-store.test.ts',
          'scripts/dev-runtime.test.ts',
          'scripts/run-authenticated-playwright.test.ts',
          'scripts/run-public-playwright.test.ts',
          'scripts/with-suite-lock.test.ts',
          'scripts/vitest-discovery.test.ts',
          'scripts/update-issues.test.ts',
          'scripts/show-authoring-mutation.test.ts',
          'scripts/wrsp-ui-proof-gate.test.ts',
          'scripts/wrsp-artifact-oracle-gate.test.ts',
          'scripts/wrsp-preflight-gate.test.ts',
          'src/engine/showFileBundle.oracle.test.ts',
          'src/engine/showEpeExport.oracle.test.ts',
          'src/engine/showEasing.test.ts',
          'src/components/HelpHint.test.tsx',
        ],
      },
      {
        name: 'layout-contract',
        exact: [
          'vite.config.ts',
          'package.json',
          'package-lock.json',
          'scripts/qualify-layout-757.mjs',
          'src/components/ControllerPanel.tsx',
          'src/components/ControllerProfilePage.tsx',
          'src/components/InstalledMapPresentation.tsx',
          'src/components/OrbitControls.tsx',
          'src/components/OrbitControls.test.tsx',
          'src/components/Preview.tsx',
          'src/components/PreviewDeck.tsx',
          'src/components/ui/bounded-number-field.tsx',
          'src/test/layout.setup.ts',
          'src/test/layoutCanary.layout.test.ts',
          'src/test/layoutEnvironment.layout.test.tsx',
          'src/test/layoutSurfaceManifest.tsx',
          'src/test/layoutSurfaces.layout.test.tsx',
          'src/components/OrbitControls.layout.test.tsx',
        ],
        tests: [
          'src/test/layoutCanary.layout.test.ts',
          'src/test/layoutEnvironment.layout.test.tsx',
          'src/test/layoutSurfaces.layout.test.tsx',
          'src/components/OrbitControls.layout.test.tsx',
        ],
        runner: 'chromium-layout',
      },
      {
        name: 'show-authoring-contract',
        exact: ['src/test/showAuthoringContract.ts'],
        tests: [
          'src/engine/showAuthoringMatrix.test.ts',
          'src/engine/showTimelineClipAuthoring.test.ts',
          'src/engine/showCompositionModel.test.ts',
          'src/engine/showClipInspectorModel.test.ts',
          'src/engine/showLayerTransitionAuthoring.test.ts',
          'src/store/showStore.test.ts',
        ],
      },
    ],
    runners: {
      'chromium-layout': ['npm', 'run', 'test:layout', '--', '--reporter=verbose'],
      // Vitest 4 has no `basic` reporter, so the package's default
      // `npx vitest run --reporter basic <test>` fails at startup here; the
      // artifact oracle deliverables name this runner instead (#940).
      'artifact-oracle': ['npx', 'vitest', 'run', '--project', 'node', '--reporter', 'default'],
    },
    advisories: [
      {
        name: 'unmapped-layout-sensitive-change',
        pathPatterns: ['^src/.*\\.(css|tsx)$'],
        diffPatterns: [
          'className',
          '@media',
          '(?:^|[^a-z-])(?:display|position|overflow|width|height|min-width|max-width|grid|flex)',
        ],
        message: 'Layout-sensitive UI change is outside the authoritative layout surface map; add or justify coverage.',
      },
    ],
  },
  layout: {
    runner: 'chromium-layout',
    canaryTest: 'src/test/layoutCanary.layout.test.ts',
  },
  // Exported-artifact oracles (#940): each test exports the real Show
  // deliverable through the same entrypoints the editor uses, reopens the
  // written file through its ordinary importer, and emits one
  // WRSP-ARTIFACT-ORACLE report that `npm run check:artifact-oracle` validates.
  artifacts: {
    deliverables: [
      {
        name: 'show-pxlshow',
        test: 'src/engine/showFileBundle.oracle.test.ts',
        runner: 'artifact-oracle',
      },
      {
        name: 'show-epe',
        test: 'src/engine/showEpeExport.oracle.test.ts',
        runner: 'artifact-oracle',
      },
    ],
  },
}
