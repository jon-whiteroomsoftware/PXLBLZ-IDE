import { describe, expect, it } from 'vitest'
import mutationVitestConfig from '../vitest.mutation.config'
import {
  assertMutationScopeCovered,
  buildShowAuthoringMutationScope,
  buildStrykerConfig,
  parseMutationClassificationsJson,
  parseMutationReportJson,
  qualifyMutationReport,
  summarizeMutationReport,
} from './show-authoring-mutation'

describe('Show authoring mutation qualification (#597)', () => {
  it('isolates every mutant run in one Node worker', () => {
    expect(mutationVitestConfig).toMatchObject({
      test: {
        environment: 'node',
        globals: true,
        isolate: true,
        maxWorkers: 1,
      },
    })
  })

  it('summarizes every required result category and elapsed time', () => {
    const summary = summarizeMutationReport({
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      performance: { setup: 100, initialRun: 200, mutation: 700 },
      files: {
        'src/engine/example.ts': {
          language: 'typescript',
          source: 'export const value = true',
          mutants: [
            mutant('1', 'Killed'),
            mutant('2', 'Survived'),
            mutant('3', 'NoCoverage'),
            mutant('4', 'Timeout'),
            mutant('5', 'CompileError'),
            mutant('6', 'RuntimeError'),
            mutant('7', 'Ignored'),
          ],
        },
      },
    }, [
      classification('src/engine/example.ts', '2', 'equivalent'),
      classification('src/engine/example.ts', '3', 'mechanically-irrelevant'),
    ])

    expect(summary).toEqual({
      total: 7,
      killed: 1,
      surviving: 0,
      timeout: 1,
      error: 2,
      excludedOrEquivalent: 3,
      elapsedMs: 1_000,
    })
  })

  it('fails when a behavior-changing survivor has no concrete classification', () => {
    expect(() => qualifyMutationReport({
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      performance: { setup: 1, initialRun: 2, mutation: 3 },
      files: {
        'src/engine/example.ts': {
          language: 'typescript',
          source: 'export const value = true',
          mutants: [mutant('2', 'Survived')],
        },
      },
    }, [])).toThrow(/1 unexplained surviving mutant/)
  })

  it('rejects malformed or unsupported mutation reports', () => {
    expect(() => parseMutationReportJson('{"schemaVersion":"3","files":{}}'))
      .toThrow(/valid Stryker mutation report/)
  })

  it('accepts the Stryker 9 JSON reporter schema without embedded timing', () => {
    expect(parseMutationReportJson(JSON.stringify({
      schemaVersion: '1.0',
      thresholds: { high: 100, low: 100, break: null },
      performance: null,
      files: {},
    }))).toMatchObject({
      schemaVersion: '1.0',
      performance: null,
    })
  })

  it('uses measured wall time when the JSON reporter omits performance', () => {
    expect(summarizeMutationReport({
      schemaVersion: '1.0',
      thresholds: { high: 100, low: 100 },
      performance: null,
      files: {},
    }, [], 67_000).elapsedMs).toBe(67_000)
  })

  it('fails when the runner times out or errors on any mutant', () => {
    const report = {
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      files: {
        'src/engine/example.ts': {
          language: 'typescript',
          source: 'export const value = true',
          mutants: [
            mutant('4', 'Timeout'),
            mutant('5', 'RuntimeError'),
          ],
        },
      },
    }

    expect(() => qualifyMutationReport(report, []))
      .toThrow(/1 timed out and 1 errored/)
  })

  it('rejects stale classifications that no longer identify a survivor', () => {
    const report = {
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      files: {
        'src/engine/example.ts': {
          language: 'typescript',
          source: 'export const value = true',
          mutants: [mutant('1', 'Killed')],
        },
      },
    }

    expect(() => qualifyMutationReport(report, [
      classification('src/engine/example.ts', '2', 'equivalent'),
    ])).toThrow(/stale mutation classification/)
  })

  it('resolves a narrow named-function scope for every critical authoring operation', () => {
    const scope = buildShowAuthoringMutationScope(process.cwd())

    expect(new Set(scope.map(({ operation }) => operation))).toEqual(new Set([
      'move',
      'resize',
      'split',
      'duplicate',
      'delete',
      'inspector',
      'transition',
    ]))
    expect(scope.map(({ functionName }) => functionName)).toEqual(expect.arrayContaining([
      'moveShowClipAtGlobalTime',
      'resizeShowClipAtGlobalTime',
      'planShowClipSplitAtGlobalTime',
      'planShowClipDuplicateAfter',
      'deleteLogicalPlacement',
      'updateShowClipInspector',
      'insertShowLayerTransition',
      'resizeShowLayerTransition',
    ]))
    expect(scope.every(({ mutationRange }) => (
      /^src\/engine\/[^:*]+\.ts:\d+:\d+-\d+:\d+$/.test(mutationRange)
    ))).toBe(true)
  })

  it('builds a deterministic Vitest configuration with no broad exclusions', () => {
    const config = buildStrykerConfig(process.cwd())

    expect(config).toMatchObject({
      testRunner: 'vitest',
      coverageAnalysis: 'perTest',
      concurrency: 4,
      incremental: false,
      allowEmpty: false,
      reporters: ['clear-text', 'json'],
      jsonReporter: {
        fileName: 'reports/mutation/show-authoring.json',
      },
      thresholds: {
        high: 100,
        low: 100,
        break: null,
      },
      vitest: {
        configFile: 'vitest.mutation.config.ts',
        related: false,
      },
    })
    expect(config.mutate).toEqual(
      buildShowAuthoringMutationScope(process.cwd()).map(({ mutationRange }) => mutationRange),
    )
    expect(config).not.toHaveProperty('mutator.excludedMutations')
    expect(config.testFiles).toEqual(expect.arrayContaining([
      'src/engine/showAuthoringMatrix.test.ts',
      'src/engine/showTimelineClipAuthoring.test.ts',
      'src/engine/showCompositionModel.test.ts',
      'src/engine/showClipInspectorModel.test.ts',
      'src/engine/showLayerTransitionAuthoring.test.ts',
    ]))
  })

  it('requires concrete, unique survivor classifications', () => {
    expect(() => parseMutationClassificationsJson(JSON.stringify([
      {
        fingerprint: 'src/example.ts|BooleanLiteral|1:1-1:5|false',
        kind: 'equivalent',
        reason: '   ',
      },
    ]))).toThrow(/concrete reason/)

    expect(() => parseMutationClassificationsJson(JSON.stringify([
      {
        fingerprint: 'src/example.ts|BooleanLiteral|1:1-1:5|false',
        kind: 'equivalent',
        reason: 'Both branches return the same durable model.',
      },
      {
        fingerprint: 'src/example.ts|BooleanLiteral|1:1-1:5|false',
        kind: 'mechanically-irrelevant',
        reason: 'Duplicate fingerprint.',
      },
    ]))).toThrow(/duplicate mutation classification/)
  })

  it('fails closed when the runner leaves mutants pending', () => {
    const report = {
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      files: {
        'src/engine/example.ts': {
          language: 'typescript',
          source: 'export const value = true',
          mutants: [mutant('1', 'Pending')],
        },
      },
    }

    expect(() => qualifyMutationReport(report, []))
      .toThrow(/pending mutation result/)
  })

  it('fails closed when the runner reports no mutants', () => {
    expect(() => qualifyMutationReport({
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      files: {},
    }, [])).toThrow(/no mutants/)
  })

  it('fails closed when a configured mutation fragment emits no mutants', () => {
    const report = {
      schemaVersion: '2',
      thresholds: { high: 100, low: 100 },
      files: {
        'src/engine/example.ts': {
          language: 'typescript',
          source: 'export const value = true',
          mutants: [mutant('1', 'Killed')],
        },
      },
    }

    expect(() => assertMutationScopeCovered(report, [{
      operation: 'transition',
      file: 'src/engine/example.ts',
      functionName: 'insertTransition',
      mutationRange: 'src/engine/example.ts:10:1-10:40',
    }])).toThrow(/emitted no mutants/)
  })
})

function mutant(id: string, status: string) {
  return {
    id,
    mutatorName: 'BooleanLiteral',
    replacement: 'false',
    status,
    location: {
      start: { line: Number(id), column: 1 },
      end: { line: Number(id), column: 5 },
    },
  }
}

function classification(
  file: string,
  mutantId: string,
  kind: 'equivalent' | 'mechanically-irrelevant',
) {
  return {
    fingerprint: `${file}|BooleanLiteral|${mutantId}:1-${mutantId}:5|false`,
    kind,
    reason: 'Concrete fixture rationale.',
  }
}
