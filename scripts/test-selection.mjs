import { existsSync } from 'node:fs'

const COMPILER_INVARIANT_TESTS = [
  'src/engine/showCompiler.test.ts',
  'src/engine/showCompilerResources.test.ts',
  'src/engine/showControllerArtifact.test.ts',
  'src/engine/showVmResourceLedger.test.ts',
]

const PERSISTENCE_INVARIANT_TESTS = [
  'src/engine/personalContentMetadata.test.ts',
  'src/engine/personalContentProvider.test.ts',
  'src/cloudflare/d1.test.ts',
  'src/cloudflare/schema.test.ts',
  'src/cloudflare/shows.test.ts',
  'functions/api/resourceProtection.test.ts',
]

const RESOURCE_INVARIANT_TESTS = [
  'src/engine/showCompilerResources.test.ts',
  'src/engine/showControllerArtifact.test.ts',
  'src/engine/showVmResourceLedger.test.ts',
]

const ARTIFACT_INVARIANT_TESTS = [
  'src/engine/bundle.test.ts',
  'src/engine/passEngine.test.ts',
  'src/engine/fxEmit.test.ts',
  'src/engine/artifactStamp.test.ts',
  'src/engine/artifactMapCompatibility.test.ts',
  'src/engine/pushPattern.test.ts',
  'src/engine/showControllerArtifact.test.ts',
  'src/engine/showPreviewArtifact.test.ts',
]

const ARTIFACT_CONTRACT_FILES = new Set([
  'src/engine/bundle.ts',
  'src/engine/passEngine.ts',
  'src/engine/fxEmit.ts',
  'src/engine/artifactStamp.ts',
  'src/engine/artifactMapCompatibility.ts',
  'src/engine/pushPattern.ts',
  'src/engine/showControllerArtifact.ts',
  'src/engine/showPreviewArtifact.ts',
])

const TEST_INFRASTRUCTURE_FILES = new Set([
  'vite.config.ts',
  'package.json',
  'package-lock.json',
  'scripts/test-selection.mjs',
  'scripts/test-staged.mjs',
  'src/test/setup.ts',
])

const TEST_INFRASTRUCTURE_SMOKE_TESTS = [
  'scripts/test-selection.test.ts',
  'src/engine/showEasing.test.ts',
  'src/components/HelpHint.test.tsx',
]

export function selectPrecommitTests(changedFiles) {
  const focusedTests = [...new Set(changedFiles.flatMap((file) => {
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(file)) return existsSync(file) ? [file] : []
    if (!/\.[cm]?[jt]sx?$/.test(file)) return []
    const adjacentTest = file.replace(/(\.[cm]?[jt]sx?)$/, '.test$1')
    return existsSync(adjacentTest) ? [adjacentTest] : []
  }))]
  const persistenceChanged = changedFiles.some((file) =>
    file.startsWith('src/engine/personalContent')
      || file === 'src/engine/remotePersonalContentProvider.ts'
      || file.startsWith('src/cloudflare/')
      || file.startsWith('functions/api/')
      || file.startsWith('migrations/'))
  const resourceLedgerChanged = changedFiles.includes('src/engine/showVmResourceLedger.ts')
  const artifactContractChanged = changedFiles.some((file) => ARTIFACT_CONTRACT_FILES.has(file))
  const testInfrastructureChanged = changedFiles.some((file) => TEST_INFRASTRUCTURE_FILES.has(file))
  const invariantTests = [...new Set([
    ...(changedFiles.includes('src/engine/showCompiler.ts') ? COMPILER_INVARIANT_TESTS : []),
    ...(persistenceChanged ? PERSISTENCE_INVARIANT_TESTS : []),
    ...(resourceLedgerChanged ? RESOURCE_INVARIANT_TESTS : []),
    ...(artifactContractChanged ? ARTIFACT_INVARIANT_TESTS : []),
    ...(testInfrastructureChanged ? TEST_INFRASTRUCTURE_SMOKE_TESTS : []),
  ])]
  return { focusedTests, invariantTests }
}

export function collectVitestInputs({ focusedTests, invariantTests }) {
  return [...new Set([...focusedTests, ...invariantTests])]
}
