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
//   --case <id>   limit to one case      --out <dir>   where transcripts and the report land
//                                        (default reports/agent-harness/corpus, gitignored)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
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
    writeFileSync(
      join(outDir, `${dictationCase.id}.transcript.json`),
      `${JSON.stringify(transcript, null, 2)}\n`,
    )
    collected.push(scoreTranscript(dictationCase, transcript))
    rateLimit ??= transcript.timing?.rateLimit
    if (transcript.timing) {
      const calls = transcript.timing.calls.length
      log(`  ${calls} model call${calls === 1 ? '' : 's'}, ${(transcript.timing.totalMs / 1000).toFixed(1)}s`)
    }
  }
  const report = buildReport(agent.name, collected, rateLimit)
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outDir, 'report.md'), renderReport(report))
  const budget = guard?.status()
  if (budget) {
    writeFileSync(join(outDir, 'budget.json'), `${JSON.stringify({ ...budget, unmeasured }, null, 2)}\n`)
  }
  return { report, unmeasured, ...(budget ? { budget } : {}) }
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

  const outDir = argValue('--out') ?? 'reports/agent-harness/corpus'
  const replayDir = argValue('--replay')

  if (replayDir) {
    const files = readdirSync(replayDir).filter((file) => file.endsWith('.transcript.json'))
    const transcripts = files.map((file) =>
      JSON.parse(readFileSync(join(replayDir, file), 'utf8')) as DictationTranscript)
    const byId = new Map(DICTATION_CASES.map((candidate) => [candidate.id, candidate]))
    const scores = transcripts.flatMap((transcript) => {
      const dictationCase = byId.get(transcript.caseId)
      if (!dictationCase) {
        console.error(`transcript for unknown case ${transcript.caseId}; skipped`)
        return []
      }
      return [scoreTranscript(dictationCase, transcript)]
    })
    const agentName = `${transcripts[0]?.agent ?? 'unknown'} (replay)`
    const rateLimit = transcripts.map((transcript) => transcript.timing?.rateLimit).find((info) => info !== undefined)
    const report = buildReport(agentName, scores, rateLimit)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(outDir, 'report.md'), renderReport(report))
    console.log(renderReport(report))
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
