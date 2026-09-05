// Provenance: pxlblz-v3 src/experiment/report.ts at 9ecd481f (adapted mechanically; see src/agent-harness/PROVENANCE.md)
// Report aggregation for the dictation experiment (#23): reliability grouped
// by operation family and by referent source, ask/refuse correctness, tool
// and transaction counts, and every generic-operation use with the pointers
// touched. Deterministic given the same scores.
import type { CaseScore } from './runner.js'
import { estimateCostUsd, priceFor } from './pricing.js'
import type { RateLimitInfo } from './timing.js'

export interface GroupStat {
  group: string
  cases: number
  firstTry: number
  percent: number
}

export interface DictationReport {
  agent: string
  cases: CaseScore[]
  byFamily: GroupStat[]
  byReferent: GroupStat[]
  totals: {
    cases: number
    firstTry: number
    percent: number
    toolCalls: number
    transactions: number
    asksExpected: number
    asksCorrect: number
    refusalsExpected: number
    refusalsCorrect: number
  }
  genericUse: Array<{ caseId: string; operation: string; pointers: string[] }>
  /** Latency and cost (#33); present only when at least one case carries telemetry. */
  latency?: LatencySummary
}

export interface LatencySummary {
  /** Cases that carried telemetry; aggregates cover only these. */
  timedCases: number
  meanModelCallsPerCase: number
  maxModelCallsPerCase: number
  meanSecondsPerCase: number
  maxSecondsPerCase: number
  meanSecondsPerModelCall: number
  meanInputTokensPerCall: number
  /** Cached input tokens over all input tokens, 0..1. */
  cacheRatio: number
  totals: {
    modelCalls: number
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
    reasoningTokens: number
    rateLimitWaitMs: number
  }
  /** USD for the run, or null when the agent's model has no price entry. */
  costUsd: number | null
  rateLimit?: RateLimitInfo
}

function round(value: number, places: number): number {
  const factor = 10 ** places
  return Math.round(value * factor) / factor
}

function summarizeLatency(agent: string, scores: CaseScore[], rateLimit?: RateLimitInfo): LatencySummary | undefined {
  const timed = scores.flatMap((score) => (score.timing ? [score.timing] : []))
  if (timed.length === 0) return undefined
  const sum = (pick: (timing: NonNullable<CaseScore['timing']>) => number) =>
    timed.reduce((total, timing) => total + pick(timing), 0)
  const totals = {
    modelCalls: sum((timing) => timing.modelCalls),
    inputTokens: sum((timing) => timing.inputTokens),
    cachedInputTokens: sum((timing) => timing.cachedInputTokens),
    outputTokens: sum((timing) => timing.outputTokens),
    reasoningTokens: sum((timing) => timing.reasoningTokens),
    rateLimitWaitMs: sum((timing) => timing.rateLimitWaitMs),
  }
  const totalMs = sum((timing) => timing.totalMs)
  const price = priceFor(agent)
  return {
    timedCases: timed.length,
    meanModelCallsPerCase: round(totals.modelCalls / timed.length, 2),
    maxModelCallsPerCase: Math.max(...timed.map((timing) => timing.modelCalls)),
    meanSecondsPerCase: round(totalMs / timed.length / 1000, 1),
    maxSecondsPerCase: round(Math.max(...timed.map((timing) => timing.totalMs)) / 1000, 1),
    meanSecondsPerModelCall: totals.modelCalls === 0 ? 0 : round(totalMs / totals.modelCalls / 1000, 1),
    meanInputTokensPerCall: totals.modelCalls === 0 ? 0 : Math.round(totals.inputTokens / totals.modelCalls),
    cacheRatio: totals.inputTokens === 0 ? 0 : round(totals.cachedInputTokens / totals.inputTokens, 3),
    totals,
    costUsd: price ? estimateCostUsd(price, totals) : null,
    ...(rateLimit ? { rateLimit } : {}),
  }
}

function groupBy(scores: CaseScore[], key: (score: CaseScore) => string): GroupStat[] {
  const groups = new Map<string, CaseScore[]>()
  for (const score of scores) {
    const group = key(score)
    groups.set(group, [...(groups.get(group) ?? []), score])
  }
  return [...groups.entries()]
    .map(([group, members]) => ({
      group,
      cases: members.length,
      firstTry: members.filter((member) => member.firstTrySuccess).length,
      percent: Math.round((members.filter((member) => member.firstTrySuccess).length / members.length) * 1000) / 10,
    }))
    .sort((left, right) => left.group.localeCompare(right.group))
}

export function buildReport(agent: string, scores: CaseScore[], rateLimit?: RateLimitInfo): DictationReport {
  const ordered = [...scores].sort((left, right) => left.caseId.localeCompare(right.caseId))
  const latency = summarizeLatency(agent, ordered, rateLimit)
  const asks = ordered.filter((score) => score.expectedOutcome === 'ask')
  const refusals = ordered.filter(
    (score) => score.expectedOutcome === 'refuse' || score.expectedOutcome === 'no-edit')
  return {
    agent,
    cases: ordered,
    byFamily: groupBy(ordered, (score) => score.family),
    byReferent: groupBy(ordered, (score) => score.referent),
    totals: {
      cases: ordered.length,
      firstTry: ordered.filter((score) => score.firstTrySuccess).length,
      percent: Math.round((ordered.filter((score) => score.firstTrySuccess).length / Math.max(1, ordered.length)) * 1000) / 10,
      toolCalls: ordered.reduce((sum, score) => sum + score.toolCalls, 0),
      transactions: ordered.reduce((sum, score) => sum + score.transactions, 0),
      asksExpected: asks.length,
      asksCorrect: asks.filter((score) => score.outcome === 'ask').length,
      refusalsExpected: refusals.length,
      refusalsCorrect: refusals.filter((score) => score.outcome !== 'edit').length,
    },
    genericUse: ordered.flatMap((score) =>
      score.genericUses.map((use) => ({
        caseId: score.caseId,
        operation: use.operation,
        pointers: use.pointers,
      }))),
    ...(latency ? { latency } : {}),
  }
}

export function renderReport(report: DictationReport): string {
  const lines: string[] = []
  lines.push(`# Dictation experiment report — ${report.agent}`)
  lines.push('')
  lines.push(
    `First-try success: **${report.totals.firstTry}/${report.totals.cases}** (${report.totals.percent}%). ` +
    `Tool calls: ${report.totals.toolCalls}; transactions: ${report.totals.transactions}. ` +
    `Asked when it should: ${report.totals.asksCorrect}/${report.totals.asksExpected}; ` +
    `refused when it should: ${report.totals.refusalsCorrect}/${report.totals.refusalsExpected}.`,
  )
  lines.push('')
  lines.push('## By operation family')
  lines.push('')
  lines.push('| Family | Cases | First-try | % |')
  lines.push('| --- | --- | --- | --- |')
  for (const stat of report.byFamily) {
    lines.push(`| ${stat.group} | ${stat.cases} | ${stat.firstTry} | ${stat.percent}% |`)
  }
  lines.push('')
  lines.push('## By referent source')
  lines.push('')
  lines.push('| Referent | Cases | First-try | % |')
  lines.push('| --- | --- | --- | --- |')
  for (const stat of report.byReferent) {
    lines.push(`| ${stat.group} | ${stat.cases} | ${stat.firstTry} | ${stat.percent}% |`)
  }
  lines.push('')
  if (report.latency) {
    const latency = report.latency
    lines.push('## Latency and cost')
    lines.push('')
    lines.push(
      `Over ${latency.timedCases} timed case${latency.timedCases === 1 ? '' : 's'}: ` +
      `**${latency.meanModelCallsPerCase} model calls per case** (max ${latency.maxModelCallsPerCase}), ` +
      `${latency.meanSecondsPerCase} s per case (max ${latency.maxSecondsPerCase} s), ` +
      `${latency.meanSecondsPerModelCall} s per model call.`,
    )
    lines.push('')
    lines.push('| Measure | Value |')
    lines.push('| --- | --- |')
    lines.push(`| Input tokens per model call | ${latency.meanInputTokensPerCall} |`)
    lines.push(`| Cache ratio (cached / input) | ${Math.round(latency.cacheRatio * 100)}% |`)
    lines.push(`| Input tokens, run total | ${latency.totals.inputTokens} (${latency.totals.cachedInputTokens} cached) |`)
    lines.push(`| Output tokens, run total | ${latency.totals.outputTokens} (${latency.totals.reasoningTokens} reasoning) |`)
    lines.push(`| Rate-limit waits | ${round(latency.totals.rateLimitWaitMs / 1000, 1)} s |`)
    if (latency.rateLimit) {
      const tier = [
        latency.rateLimit.requestsPerMinute !== undefined ? `${latency.rateLimit.requestsPerMinute} requests/min` : null,
        latency.rateLimit.tokensPerMinute !== undefined ? `${latency.rateLimit.tokensPerMinute} tokens/min` : null,
      ].filter((part) => part !== null)
      lines.push(`| Rate tier (response headers) | ${tier.join(', ') || 'not reported'} |`)
    }
    lines.push(`| Run cost | ${latency.costUsd === null ? 'price unknown (add the model to src/experiment/pricing.ts)' : `$${latency.costUsd.toFixed(2)}`} |`)
    lines.push('')
  }
  lines.push('## Generic-operation use (the gap signal)')
  lines.push('')
  if (report.genericUse.length === 0) {
    lines.push('None.')
  } else {
    for (const use of report.genericUse) {
      lines.push(`- ${use.caseId}: ${use.operation} touching ${use.pointers.join(', ')}`)
    }
  }
  lines.push('')
  lines.push('## Failures')
  lines.push('')
  const failed = report.cases.filter((score) => !score.firstTrySuccess)
  if (failed.length === 0) {
    lines.push('None.')
  } else {
    for (const score of failed) {
      lines.push(`- ${score.caseId} (${score.family}/${score.referent}): ${score.failures.join('; ')}`)
    }
  }
  lines.push('')
  return lines.join('\n')
}
