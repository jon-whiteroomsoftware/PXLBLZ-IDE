import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'

export type MutationStatus =
  | 'Killed'
  | 'Survived'
  | 'NoCoverage'
  | 'CompileError'
  | 'RuntimeError'
  | 'Timeout'
  | 'Ignored'
  | 'Pending'

interface MutationPosition {
  line: number
  column: number
}

interface MutationResult {
  id: string
  mutatorName: string
  replacement?: string
  status: MutationStatus
  location: {
    start: MutationPosition
    end: MutationPosition
  }
}

export interface MutationReport {
  schemaVersion: string
  thresholds: { high: number; low: number }
  performance?: {
    setup: number
    initialRun: number
    mutation: number
  } | null
  files: Record<string, {
    language: string
    source: string
    mutants: MutationResult[]
  }>
}

export interface MutationClassification {
  fingerprint: string
  kind: 'equivalent' | 'mechanically-irrelevant'
  reason: string
}

export interface MutationSummary {
  total: number
  killed: number
  surviving: number
  timeout: number
  error: number
  excludedOrEquivalent: number
  elapsedMs: number
}

type ShowAuthoringOperation =
  | 'move'
  | 'resize'
  | 'split'
  | 'duplicate'
  | 'delete'
  | 'inspector'
  | 'transition'

interface MutationTarget {
  operation: ShowAuthoringOperation
  file: string
  functionName: string
  fragment?: string
}

export interface ResolvedMutationTarget extends MutationTarget {
  mutationRange: string
}

const SHOW_AUTHORING_MUTATION_TARGETS: MutationTarget[] = [
  target(
    'move',
    'showTimelineClipAuthoring.ts',
    'moveShowClipAtGlobalTime',
    'if (logicalSegments.length > 1 || targetSlices.length > 1) {',
  ),
  target(
    'resize',
    'showTimelineClipAuthoring.ts',
    'resizeShowClipAtGlobalTime',
    [
      'track.keyframes.forEach((keyframe) => {',
      '        keyframe.timeMs += offsetMs',
      '      })',
    ].join('\n'),
  ),
  target(
    'split',
    'showTimelineClipAuthoring.ts',
    'planShowClipSplitAtGlobalTime',
    'return input.globalTimeMs > startMs && input.globalTimeMs < endMs',
  ),
  target(
    'duplicate',
    'showTimelineClipAuthoring.ts',
    'planShowClipDuplicateAfter',
    'const targetEndMs = targetStartMs + durationMs',
  ),
  target('delete', 'showCompositionModel.ts', 'deleteLogicalPlacement'),
  target(
    'inspector',
    'showClipInspectorModel.ts',
    'updateShowClipInspector',
    [
      'const timingAccepted = resized !== stagedLocal',
      '        || (desiredStartMs === range.globalStartMs && desiredDurationMs === range.durationMs)',
      '      composition = timingAccepted ? resized : localBasis',
    ].join('\n'),
  ),
  target(
    'transition',
    'showLayerTransitionAuthoring.ts',
    'insertShowLayerTransition',
    'if (validateShowComposition(show, draft).length > 0 || hasConcurrentLayerTransitions(show, draft)) return composition',
  ),
  target(
    'transition',
    'showLayerTransitionAuthoring.ts',
    'resizeShowLayerTransition',
    'const deltaMs = durationMs - transition.durationMs',
  ),
]

export function buildShowAuthoringMutationScope(repoRoot: string): ResolvedMutationTarget[] {
  const sourceFiles = new Map<string, ts.SourceFile>()
  return SHOW_AUTHORING_MUTATION_TARGETS.map((mutationTarget) => {
    let sourceFile = sourceFiles.get(mutationTarget.file)
    if (!sourceFile) {
      const absolutePath = join(repoRoot, mutationTarget.file)
      sourceFile = ts.createSourceFile(
        mutationTarget.file,
        readFileSync(absolutePath, 'utf8'),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
      )
      sourceFiles.set(mutationTarget.file, sourceFile)
    }

    const declaration = sourceFile.statements.find((statement): statement is ts.FunctionDeclaration => (
      ts.isFunctionDeclaration(statement) && statement.name?.text === mutationTarget.functionName
    ))
    if (!declaration) {
      throw new Error(`Mutation target ${mutationTarget.functionName} was not found in ${mutationTarget.file}.`)
    }

    const declarationStart = declaration.getStart(sourceFile)
    let rangeStart = declarationStart
    let rangeEnd = declaration.getEnd()
    if (mutationTarget.fragment) {
      const declarationText = sourceFile.text.slice(declarationStart, rangeEnd)
      const fragmentOffset = declarationText.indexOf(mutationTarget.fragment)
      if (fragmentOffset < 0 || declarationText.indexOf(mutationTarget.fragment, fragmentOffset + 1) >= 0) {
        throw new Error(`Mutation fragment for ${mutationTarget.functionName} must occur exactly once.`)
      }
      rangeStart = declarationStart + fragmentOffset
      rangeEnd = rangeStart + mutationTarget.fragment.length
    }
    const start = sourceFile.getLineAndCharacterOfPosition(rangeStart)
    const end = sourceFile.getLineAndCharacterOfPosition(rangeEnd)
    return {
      ...mutationTarget,
      mutationRange: `${mutationTarget.file}:${start.line + 1}:${start.character + 1}-${end.line + 1}:${end.character + 1}`,
    }
  })
}

export function buildStrykerConfig(repoRoot: string) {
  return {
    testRunner: 'vitest',
    plugins: ['@stryker-mutator/vitest-runner'],
    mutate: buildShowAuthoringMutationScope(repoRoot).map(({ mutationRange }) => mutationRange),
    testFiles: [
      'src/engine/showAuthoringMatrix.test.ts',
      'src/engine/showTimelineClipAuthoring.test.ts',
      'src/engine/showCompositionModel.test.ts',
      'src/engine/showClipInspectorModel.test.ts',
      'src/engine/showLayerTransitionAuthoring.test.ts',
    ],
    vitest: {
      configFile: 'vitest.mutation.config.ts',
      related: false,
    },
    coverageAnalysis: 'perTest',
    concurrency: 4,
    incremental: false,
    allowEmpty: false,
    timeoutMS: 10_000,
    dryRunTimeoutMinutes: 5,
    cleanTempDir: 'always',
    reporters: ['clear-text', 'json'],
    jsonReporter: {
      fileName: 'reports/mutation/show-authoring.json',
    },
    thresholds: {
      high: 100,
      low: 100,
      break: null,
    },
  }
}

export function parseMutationReportJson(json: string): MutationReport {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('The runner did not produce a valid Stryker mutation report.')
  }
  if (!isMutationReport(value)) {
    throw new Error('The runner did not produce a valid Stryker mutation report.')
  }
  return value
}

export function parseMutationClassificationsJson(json: string): MutationClassification[] {
  let value: unknown
  try {
    value = JSON.parse(json)
  } catch {
    throw new Error('Mutation classifications must be valid JSON.')
  }
  if (!Array.isArray(value)) {
    throw new Error('Mutation classifications must be an array.')
  }

  const fingerprints = new Set<string>()
  return value.map((candidate) => {
    if (
      !isRecord(candidate)
      || typeof candidate.fingerprint !== 'string'
      || (candidate.kind !== 'equivalent' && candidate.kind !== 'mechanically-irrelevant')
      || typeof candidate.reason !== 'string'
      || candidate.reason.trim().length === 0
    ) {
      throw new Error('Every mutation classification requires a fingerprint, supported kind, and concrete reason.')
    }
    if (fingerprints.has(candidate.fingerprint)) {
      throw new Error(`Found duplicate mutation classification: ${candidate.fingerprint}`)
    }
    fingerprints.add(candidate.fingerprint)
    return {
      fingerprint: candidate.fingerprint,
      kind: candidate.kind,
      reason: candidate.reason.trim(),
    }
  })
}

export function assertMutationScopeCovered(
  report: MutationReport,
  scope: ResolvedMutationTarget[],
): void {
  for (const target of scope) {
    const range = parseMutationRange(target.mutationRange)
    const mutants = report.files[target.file]?.mutants ?? []
    if (!mutants.some(({ location }) => rangesOverlap(range, location))) {
      throw new Error(
        `Mutation target ${target.operation}:${target.functionName} emitted no mutants.`,
      )
    }
  }
}

export function qualifyMutationReport(
  report: MutationReport,
  classifications: MutationClassification[],
  measuredElapsedMs?: number,
): MutationSummary {
  const entries = mutationEntries(report)
  if (entries.length === 0) {
    throw new Error('The runner reported no mutants for the configured Show authoring scope.')
  }
  if (entries.some(({ mutant }) => mutant.status === 'Pending')) {
    throw new Error('The runner produced a pending mutation result.')
  }
  const survivorFingerprints = new Set(
    entries
      .filter(({ mutant }) => mutant.status === 'Survived' || mutant.status === 'NoCoverage')
      .map(({ file, mutant }) => mutationFingerprint(file, mutant)),
  )
  const stale = classifications.find(({ fingerprint }) => !survivorFingerprints.has(fingerprint))
  if (stale) {
    throw new Error(`Found stale mutation classification: ${stale.fingerprint}`)
  }
  const summary = summarizeMutationReport(report, classifications, measuredElapsedMs)
  if (summary.timeout > 0 || summary.error > 0) {
    throw new Error(`${summary.timeout} timed out and ${summary.error} errored mutant${summary.timeout + summary.error === 1 ? '' : 's'}`)
  }
  if (summary.surviving > 0) {
    throw new Error(`${summary.surviving} unexplained surviving mutant${summary.surviving === 1 ? '' : 's'}`)
  }
  return summary
}

export function summarizeMutationReport(
  report: MutationReport,
  classifications: MutationClassification[],
  measuredElapsedMs?: number,
): MutationSummary {
  const classified = new Set(classifications.map(({ fingerprint }) => fingerprint))
  const summary: MutationSummary = {
    total: 0,
    killed: 0,
    surviving: 0,
    timeout: 0,
    error: 0,
    excludedOrEquivalent: 0,
    elapsedMs: measuredElapsedMs ?? (report.performance
      ? report.performance.setup + report.performance.initialRun + report.performance.mutation
      : 0),
  }

  for (const [file, result] of Object.entries(report.files)) {
    for (const mutant of result.mutants) {
      summary.total += 1
      if (mutant.status === 'Killed') summary.killed += 1
      else if (mutant.status === 'Timeout') summary.timeout += 1
      else if (mutant.status === 'CompileError' || mutant.status === 'RuntimeError') summary.error += 1
      else if (mutant.status === 'Ignored') summary.excludedOrEquivalent += 1
      else if (classified.has(mutationFingerprint(file, mutant))) summary.excludedOrEquivalent += 1
      else if (mutant.status === 'Survived' || mutant.status === 'NoCoverage') summary.surviving += 1
    }
  }

  return summary
}

function mutationFingerprint(file: string, mutant: MutationResult): string {
  const { start, end } = mutant.location
  return [
    file,
    mutant.mutatorName,
    `${start.line}:${start.column}-${end.line}:${end.column}`,
    mutant.replacement ?? '',
  ].join('|')
}

function mutationEntries(report: MutationReport): Array<{ file: string; mutant: MutationResult }> {
  return Object.entries(report.files).flatMap(([file, result]) => (
    result.mutants.map((mutant) => ({ file, mutant }))
  ))
}

function isMutationReport(value: unknown): value is MutationReport {
  if (!isRecord(value) || !/^[12](?:\.|$)/.test(value.schemaVersion as string)) return false
  if (!isRecord(value.thresholds) || !isFiniteNumber(value.thresholds.high) || !isFiniteNumber(value.thresholds.low)) return false
  if (!isRecord(value.files)) return false
  if (value.performance !== undefined && value.performance !== null && (
    !isRecord(value.performance)
    || !isFiniteNumber(value.performance.setup)
    || !isFiniteNumber(value.performance.initialRun)
    || !isFiniteNumber(value.performance.mutation)
  )) return false

  return Object.values(value.files).every((file) => (
    isRecord(file)
    && typeof file.language === 'string'
    && typeof file.source === 'string'
    && Array.isArray(file.mutants)
    && file.mutants.every(isMutationResult)
  ))
}

function isMutationResult(value: unknown): value is MutationResult {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.mutatorName !== 'string') return false
  if (value.replacement !== undefined && typeof value.replacement !== 'string') return false
  if (!MUTATION_STATUSES.has(value.status as MutationStatus) || !isRecord(value.location)) return false
  return isPosition(value.location.start) && isPosition(value.location.end)
}

function isPosition(value: unknown): value is MutationPosition {
  return isRecord(value) && Number.isInteger(value.line) && Number.isInteger(value.column)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

const MUTATION_STATUSES = new Set<MutationStatus>([
  'Killed',
  'Survived',
  'NoCoverage',
  'CompileError',
  'RuntimeError',
  'Timeout',
  'Ignored',
  'Pending',
])

function target(
  operation: ShowAuthoringOperation,
  fileName: string,
  functionName: string,
  fragment?: string,
): MutationTarget {
  return {
    operation,
    file: `src/engine/${fileName}`,
    functionName,
    fragment,
  }
}

function parseMutationRange(mutationRange: string): MutationResult['location'] {
  const match = /:(\d+):(\d+)-(\d+):(\d+)$/.exec(mutationRange)
  if (!match) throw new Error(`Invalid mutation range: ${mutationRange}`)
  return {
    start: { line: Number(match[1]), column: Number(match[2]) },
    end: { line: Number(match[3]), column: Number(match[4]) },
  }
}

function rangesOverlap(
  left: MutationResult['location'],
  right: MutationResult['location'],
): boolean {
  return comparePositions(left.start, right.end) < 0
    && comparePositions(right.start, left.end) < 0
}

function comparePositions(left: MutationPosition, right: MutationPosition): number {
  return left.line === right.line
    ? left.column - right.column
    : left.line - right.line
}
