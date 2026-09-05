// Provenance: pxlblz-v3 src/experiment/cli.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Dictation experiment CLI (#23). Runs under src/agent-harness/run.ts (Vite
// module semantics; see that file) and exports `main` for it.
//   npm run -s agent:corpus -- --fake                        run the corpus with the scripted fake agent
//   npm run -s agent:corpus -- --live --model <id> [--effort <e>] [--case <id>]   drive a real model
//     every live model goes through the OpenAI SDK (OPENAI_API_KEY); the V3
//     Anthropic route was not transferred (#945: not the pinned configuration)
//   npm run -s agent:corpus -- --replay <dir>                re-score recorded transcripts, no model call
//   --case <id>   limit to one case      --out <dir>   where transcripts and the report land
//                                        (default reports/agent-harness/corpus, gitignored)
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DICTATION_CASES } from './cases.js'
import { validateCorpus, type DictationCase } from './corpus.js'
import { dictationFixture } from './fixtures.js'
import { buildReport, renderReport } from './report.js'
import { createFakeAgent } from './runner.js'
import { runCase, scoreTranscript, type DictationTranscript } from './runner.js'
import type { RateLimitInfo } from './timing.js'

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  return index >= 0 ? process.argv[index + 1] : undefined
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

  let scores
  let agentName: string
  let rateLimit: RateLimitInfo | undefined
  if (replayDir) {
    const files = readdirSync(replayDir).filter((file) => file.endsWith('.transcript.json'))
    const transcripts = files.map((file) =>
      JSON.parse(readFileSync(join(replayDir, file), 'utf8')) as DictationTranscript)
    const byId = new Map(DICTATION_CASES.map((candidate) => [candidate.id, candidate]))
    scores = transcripts.flatMap((transcript) => {
      const dictationCase = byId.get(transcript.caseId)
      if (!dictationCase) {
        console.error(`transcript for unknown case ${transcript.caseId}; skipped`)
        return []
      }
      return [scoreTranscript(dictationCase, transcript)]
    })
    agentName = `${transcripts[0]?.agent ?? 'unknown'} (replay)`
    rateLimit = transcripts.map((transcript) => transcript.timing?.rateLimit).find((info) => info !== undefined)
  } else {
    const live = process.argv.includes('--live')
    const model = argValue('--model')
    if (live && !model) {
      console.error('--live needs --model <id> (OpenAI Responses API)')
      process.exit(1)
    }
    const agent = live
      ? (await import('./openaiAgent.js')).createOpenAiAgent({
          model: model!,
          reasoningEffort: argValue('--effort') as 'minimal' | 'low' | 'medium' | 'high' | undefined,
        })
      : createFakeAgent()
    agentName = agent.name
    mkdirSync(outDir, { recursive: true })
    const collected = []
    for (const dictationCase of cases as DictationCase[]) {
      process.stderr.write(`running ${dictationCase.id}...\n`)
      const transcript = await runCase(dictationCase, agent)
      writeFileSync(
        join(outDir, `${dictationCase.id}.transcript.json`),
        `${JSON.stringify(transcript, null, 2)}\n`,
      )
      collected.push(scoreTranscript(dictationCase, transcript))
      rateLimit ??= transcript.timing?.rateLimit
      if (transcript.timing) {
        const calls = transcript.timing.calls.length
        process.stderr.write(`  ${calls} model call${calls === 1 ? '' : 's'}, ${(transcript.timing.totalMs / 1000).toFixed(1)}s\n`)
      }
    }
    scores = collected
  }

  const report = buildReport(agentName, scores, rateLimit)
  mkdirSync(outDir, { recursive: true })
  writeFileSync(join(outDir, 'report.json'), `${JSON.stringify(report, null, 2)}\n`)
  writeFileSync(join(outDir, 'report.md'), renderReport(report))
  console.log(renderReport(report))
}
