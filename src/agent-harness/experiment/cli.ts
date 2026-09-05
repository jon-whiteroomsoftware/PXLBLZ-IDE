// Provenance: pxlblz-v3 src/experiment/cli.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Dictation experiment CLI (#23). Runs under src/agent-harness/run.ts (Vite
// module semantics; see that file) and exports `main` for it.
//   npm run -s agent:corpus -- --fake                        run the corpus with the scripted fake agent
//   npm run -s agent:corpus -- --live --model <id> [--effort <e>] [--case <id>]   drive a real model
//     every live model goes through the OpenAI SDK (OPENAI_API_KEY); the V3
//     Anthropic route was not transferred (#945: not the pinned configuration).
//     A live run opens the paid-call ledger (#945) and stops at the first
//     refusal; the cases it could not measure are listed in budget.json.
//   npm run -s agent:corpus -- --replay <dir>                re-score recorded transcripts, no model call
//     scores the transcripts the directory's run-manifest.json names (the latest
//     run's own); other transcripts in the directory are reported as stale and
//     left in place. A directory without a manifest replays every transcript and
//     the report says so.
//   --case <id>   limit to one case      --out <dir>   where transcripts and the report land
//     run default: reports/agent-harness/corpus (gitignored); replay default: <replay-dir>-replay
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { DICTATION_CASES } from './cases.js'
import { validateCorpus, type DictationCase } from './corpus.js'
import { dictationFixture } from './fixtures.js'
import { PaidCallRefusedError } from './paidCallBudget.js'
import { describeStatus, openPaidCallGuard, type PaidCallGuard, type PaidCallStatus } from './paidCallGuard.js'
import { buildReport, renderReport, type DictationReport } from './report.js'
import { createFakeAgent, type DictationAgent } from './runner.js'
import { runCase, scoreTranscript, type DictationTranscript } from './runner.js'
import type { RateLimitInfo } from './timing.js'

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
}

export interface CorpusRunOptions {
  cases: DictationCase[]
  agent: DictationAgent
  outDir: string
  /** The paid-call guard for a live agent (#945); one accounting unit per case. */
  guard?: PaidCallGuard
  log?: (line: string) => void
}

export interface CorpusRunResult {
  report: DictationReport
  /** Cases the budget prevented measuring, in corpus order, with the refusal. */
  unmeasured: Array<{ caseId: string; reason: string }>
  budget?: PaidCallStatus
}

/** Written next to the transcripts: which of them this run wrote (#945). */
export const RUN_MANIFEST_FILE = 'run-manifest.json'

/**
 * The record of one run in its output directory. The default directory is
 * reused across runs, and a run that refuses or skips a case leaves that
 * case's older transcript behind; the manifest names exactly the transcripts
 * this run wrote, so replay never scores a leftover as current. It is written
 * when the run starts and rewritten after every transcript; an interrupted or
 * malformed manifest is surfaced rather than treated as permission to score leftovers.
 */
export interface CorpusRunManifest {
  version: 1
  agent: string
  /** The paid-call guard's run id for a live run; null for the fake agent. */
  runId: string | null
  startedAt: string
  /** Null while the run is in progress or after a crash. */
  finishedAt: string | null
  /** Transcript files this run wrote, in corpus order. */
  transcripts: Array<{ caseId: string; file: string }>
  /** Cases this run did not measure, with the refusal. */
  unmeasured: Array<{ caseId: string; reason: string }>
}

/** The manifest in a run directory, or null when the directory has none. */
export function readRunManifest(dir: string): CorpusRunManifest | null {
  const path = join(dir, RUN_MANIFEST_FILE)
  if (!existsSync(path)) return null
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (
    typeof parsed !== 'object' || parsed === null ||
    (parsed as { version?: unknown }).version !== 1 ||
    !Array.isArray((parsed as { transcripts?: unknown }).transcripts)
  ) {
    throw new Error(`${path} is not a run manifest this replay understands`)
  }
  return parsed as CorpusRunManifest
}

/**
 * Run the cases in order, one accounting unit each, and stop at the first
 * budget refusal: the refused case and every case after it are recorded as
 * unmeasured, the report covers what ran, and budget.json carries the
 * ledger status so the accounting is visible next to the scores.
 */
export async function runCorpus(options: CorpusRunOptions): Promise<CorpusRunResult> {
  const { agent, outDir, guard } = options
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`))
  mkdirSync(outDir, { recursive: true })
  const collected = []
  const unmeasured: CorpusRunResult['unmeasured'] = []
  const manifest: CorpusRunManifest = {
    version: 1,
    agent: agent.name,
    runId: guard?.runId ?? null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    transcripts: [],
    unmeasured: [],
  }
  const writeManifest = () => writeFileSync(join(outDir, RUN_MANIFEST_FILE), `${JSON.stringify(manifest, null, 2)}\n`)
  writeManifest()
  let rateLimit: RateLimitInfo | undefined
  for (const [index, dictationCase] of options.cases.entries()) {
    log(`running ${dictationCase.id}...`)
    guard?.beginUnit(dictationCase.id)
    let transcript: DictationTranscript
    try {
      transcript = await runCase(dictationCase, agent)
    } catch (error) {
      if (!(error instanceof PaidCallRefusedError)) throw error
      log(`  ${error.message}`)
      unmeasured.push({ caseId: dictationCase.id, reason: error.message })
      for (const skipped of options.cases.slice(index + 1)) {
        unmeasured.push({ caseId: skipped.id, reason: `not attempted after the refusal on ${dictationCase.id}` })
      }
      break
    }
    const file = `${dictationCase.id}.transcript.json`
    writeFileSync(join(outDir, file), `${JSON.stringify(transcript, null, 2)}\n`)
    manifest.transcripts.push({ caseId: dictationCase.id, file })
    writeManifest()
    collected.push(scoreTranscript(dictationCase, transcript))
    rateLimit ??= transcript.timing?.rateLimit
    if (transcript.timing) {
      const calls = transcript.timing.calls.length
      log(`  ${calls} model call${calls === 1 ? '' : 's'}, ${(transcript.timing.totalMs / 1000).toFixed(1)}s`)
    }
  }
  manifest.unmeasured = unmeasured
  manifest.finishedAt = new Date().toISOString()
  writeManifest()
  const report = buildReport(agent.name, collected, rateLimit)
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outDir, 'report.md'), renderReport(report))
  const budget = guard?.status()
  if (budget) {
    writeFileSync(join(outDir, 'budget.json'), `${JSON.stringify({ ...budget, unmeasured }, null, 2)}\n`)
  }
  return { report, unmeasured, ...(budget ? { budget } : {}) }
}

export interface CorpusReplayOptions {
  /** The run directory to re-score. */
  replayDir: string
  /** Where report.json, report.md and replay.json land. */
  outDir: string
  /** The corpus the transcripts are scored against. */
  cases: DictationCase[]
  log?: (line: string) => void
}

export interface CorpusReplayResult {
  report: DictationReport
  /** Whether the transcript list came from the directory's manifest or from listing the directory. */
  source: 'manifest' | 'directory'
  /** The manifest's run id, when there was a manifest and a live run. */
  runId: string | null
  /** Transcript files scored, in the order scored. */
  scored: string[]
  /** Transcript files present but not named by the manifest: left in place, not scored. */
  stale: string[]
}

/**
 * Re-score recorded transcripts without a model call. With a manifest, only
 * the transcripts it names are scored and every other transcript in the
 * directory is reported as stale; a manifested file that is missing is an
 * error rather than a partial report. Without a manifest (a legacy corpus
 * directory), every transcript is scored and the report label says so. The
 * recorded run's reports and transcripts are never changed; report.json,
 * report.md and a replay.json naming the provenance go to a different outDir.
 */
export async function replayCorpus(options: CorpusReplayOptions): Promise<CorpusReplayResult> {
  const { replayDir, outDir } = options
  if (resolve(replayDir) === resolve(outDir)) {
    throw new Error('replay output directory must differ from the recorded run directory; choose --out or use the CLI default sibling directory')
  }
  const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`))
  const present = readdirSync(replayDir).filter((file) => file.endsWith('.transcript.json')).sort()
  const manifest = readRunManifest(replayDir)
  let files: string[]
  let stale: string[]
  let source: CorpusReplayResult['source']
  if (manifest) {
    source = 'manifest'
    files = manifest.transcripts.map((entry) => entry.file)
    const missing = files.filter((file) => !present.includes(file))
    if (missing.length > 0) {
      throw new Error(`${join(replayDir, RUN_MANIFEST_FILE)} names ${missing.join(', ')} but the file is missing; nothing was scored`)
    }
    stale = present.filter((file) => !files.includes(file))
    if (manifest.finishedAt === null) log(`${join(replayDir, RUN_MANIFEST_FILE)}: the run did not finish; scoring what it wrote`)
    for (const file of stale) log(`${join(replayDir, file)}: not written by the manifested run; stale, skipped and left in place`)
  } else {
    source = 'directory'
    files = present
    stale = []
    log(`${replayDir}: no run manifest; scoring every transcript in the directory`)
  }
  const transcripts = files.map((file) => ({ file, transcript: JSON.parse(readFileSync(join(replayDir, file), 'utf8')) as DictationTranscript }))
  const byId = new Map(options.cases.map((candidate) => [candidate.id, candidate]))
  const scored: string[] = []
  const scores = transcripts.flatMap(({ file, transcript }) => {
    const dictationCase = byId.get(transcript.caseId)
    if (!dictationCase) {
      log(`${join(replayDir, file)}: transcript for unknown case ${transcript.caseId}; skipped`)
      return []
    }
    scored.push(file)
    return [scoreTranscript(dictationCase, transcript)]
  })
  const baseName = manifest?.agent ?? transcripts[0]?.transcript.agent ?? 'unknown'
  const agentName = manifest
    ? `${baseName} (replay${manifest.finishedAt === null ? ' of an unfinished run' : ''})`
    : `${baseName} (replay, no run manifest: every transcript in the directory)`
  const rateLimit = transcripts.map(({ transcript }) => transcript.timing?.rateLimit).find((info) => info !== undefined)
  const report = buildReport(agentName, scores, rateLimit)
  const result: CorpusReplayResult = { report, source, runId: manifest?.runId ?? null, scored, stale }
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outDir, 'report.md'), renderReport(report))
  writeFileSync(
    join(outDir, 'replay.json'),
    `${JSON.stringify({ replayedFrom: replayDir, source, runId: result.runId, manifestFinishedAt: manifest?.finishedAt ?? null, scored, stale }, null, 2)}\n`,
  )
  return result
}

export async function main(): Promise<void> {
  const problems = validateCorpus(DICTATION_CASES, dictationFixture)
  if (problems.length > 0) {
    console.error('corpus invalid:')
    for (const problem of problems) console.error(`  - ${problem}`)
    process.exit(1)
  }

  const onlyCase = argValue('--case')
  const cases = onlyCase
    ? DICTATION_CASES.filter((candidate) => candidate.id === onlyCase)
    : DICTATION_CASES
  if (cases.length === 0) {
    console.error(`no case named "${onlyCase}"; ids: ${DICTATION_CASES.map((c) => c.id).join(', ')}`)
    process.exit(1)
  }

  const replayDir = argValue('--replay')
  const outDir = argValue('--out') ?? (replayDir ? `${replayDir}-replay` : 'reports/agent-harness/corpus')

  if (replayDir) {
    const replay = await replayCorpus({ replayDir, outDir, cases: DICTATION_CASES })
    console.log(renderReport(replay.report))
    if (replay.stale.length > 0) {
      console.log(`\n${replay.stale.length} stale transcript${replay.stale.length === 1 ? '' : 's'} not scored (see ${join(outDir, 'replay.json')})`)
    }
    return
  }

  const live = process.argv.includes('--live')
  const model = argValue('--model')
  if (live && !model) {
    console.error('--live needs --model <id> (OpenAI Responses API)')
    process.exit(1)
  }
  let guard: PaidCallGuard | undefined
  if (live) {
    // The ledger is opened before the agent exists: a missing, malformed or
    // locked ledger stops the run here, with no credential touched.
    try {
      guard = openPaidCallGuard()
    } catch (error) {
      if (!(error instanceof PaidCallRefusedError)) throw error
      console.error(error.message)
      process.exitCode = 1
      return
    }
    console.error(describeStatus(guard.status()))
  }
  try {
    const agent: DictationAgent = guard
      ? (await import('./openaiAgent.js')).createOpenAiAgent({
          model: model!,
          reasoningEffort: argValue('--effort') as 'minimal' | 'low' | 'medium' | 'high' | undefined,
          budget: guard,
        })
      : createFakeAgent()
    const result = await runCorpus({ cases: cases as DictationCase[], agent, outDir, guard })
    console.log(renderReport(result.report))
    if (result.unmeasured.length > 0) {
      console.log(`\n${result.unmeasured.length} case${result.unmeasured.length === 1 ? '' : 's'} not measured (see ${join(outDir, 'budget.json')}):`)
      for (const entry of result.unmeasured) console.log(`  - ${entry.caseId}: ${entry.reason}`)
    }
  } finally {
    if (guard) {
      console.error(describeStatus(guard.status()))
      guard.close()
    }
  }
}
