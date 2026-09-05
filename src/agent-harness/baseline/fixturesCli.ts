// Fixture evidence for the #945 baseline: every baseline fixture is exported
// as `.pxlshow` and `.epe` at a fixed stamp, sent through one scripted bridge
// turn (real HTTP, NDJSON, MCP, session, turn runner; no paid call), and the
// returned candidate is exported again. Record and artifact hashes go to
// `src/agent-harness/baseline/evidence/fixtures.json`; timing goes only to
// the console and the gitignored report, never into committed evidence.
//   npm run agent:baseline:fixtures            compare against the committed evidence (exit 1 on drift)
//   npm run agent:baseline:fixtures -- --write   rewrite the committed evidence
// Runs under src/agent-harness/run.ts (Vite module semantics), which awaits `main`.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEpe } from '@/engine/epeImport'
import type { PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import { buildShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { showLoopDurationMs } from '@/engine/showModel'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { createScriptedAgent, parseBridgeEvents, startBridge } from '../bridge/service.js'
import { showFacts } from '../bridge/smoke.js'
import { exportShowDocument } from '../shows/exportShow.js'
import { openShowDocument } from '../grammar/openShow.js'
import {
  evidenceDifferences,
  recordSha256,
  sha256Hex,
  type ArtifactEvidence,
  type BaselineFixtureEvidence,
  type FixtureEvidence,
} from './evidence.js'
import { BASELINE_FIXTURES, resolveBaselineFixtureRecord, type BaselineFixture } from './fixtures.js'
import { BASELINE_UTTERANCES } from './scripts.js'

const here = dirname(fileURLToPath(import.meta.url))
export const EVIDENCE_PATH = join(here, 'evidence', 'fixtures.json')
const STAMPED_AT = '2026-09-05T00:00:00.000Z'
const UTTERANCE = BASELINE_UTTERANCES[0].utterance

async function artifactEvidence(show: ShowRecord, patterns: PatternRecord[], epeId: string): Promise<ArtifactEvidence> {
  let pxlshow: ArtifactEvidence['pxlshow']
  try {
    const { filename, bundle } = buildShowFileBundle(show, { patterns, maps: [] }, { appVersion: 'agent-baseline', exportedAt: STAMPED_AT })
    const bytes = await serializeShowFileBundle(bundle)
    // Hash the bundle document rather than the container bytes: the zip
    // writer is free to vary its own headers, the content is what matters.
    pxlshow = { filename, bytes: bytes.length, contentSha256: sha256Hex(JSON.stringify(bundle)) }
  } catch (error) {
    pxlshow = { error: error instanceof Error ? error.message : String(error) }
  }
  let epe: ArtifactEvidence['epe']
  const exported = exportShowDocument(
    show,
    patterns.map((pattern) => ({ id: pattern.id, name: pattern.name, source: pattern.src })),
    { stampedAt: STAMPED_AT, epeId },
  )
  if (exported.ok) {
    const parsed = parseEpe(exported.epeText)
    epe = {
      filename: exported.epeFilename,
      bytes: Buffer.byteLength(exported.epeText),
      sourceSha256: sha256Hex(parsed.src ?? ''),
      stampKind: parsed.stamp?.kind ?? null,
    }
  } else {
    epe = { error: exported.errors.map((issue) => issue.message).join('; ') }
  }
  return { pxlshow, epe }
}

export interface FixtureRun {
  evidence: FixtureEvidence
  turnMs: number
}

export async function runFixture(fixture: BaselineFixture, bridgeUrl: string): Promise<FixtureRun> {
  const record = resolveBaselineFixtureRecord(fixture, (id) => stockShowById(id)?.show)
  const patterns = fixture.patterns ?? []
  const facts = showFacts(record)
  const opened = openShowDocument(record, [], { allowUnresolvedUserPatterns: true })
  const before = await artifactEvidence(record, patterns, `agent-baseline-${fixture.id}`)
  const turnStart = Date.now()
  const response = await fetch(`${bridgeUrl}/utterance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestId: `fixture-${fixture.id}`, show: record, utterance: UTTERANCE, delayMs: 0, context: {} }),
  })
  const events = parseBridgeEvents(await response.text())
  const turnMs = Date.now() - turnStart
  const done = events[events.length - 1]
  if (!done || done.kind !== 'done') throw new Error(`${fixture.id}: the bridge stream ended without a result`)
  const candidate = done.show as ShowRecord | undefined
  const after = candidate
    ? {
        ...(await artifactEvidence(candidate, patterns, `agent-baseline-${fixture.id}`)),
        recordSha256: recordSha256(candidate),
        clipCount: showFacts(candidate).clipCount,
        firstClipDurationMs: showFacts(candidate).firstClipDurationMs,
      }
    : null
  return {
    turnMs,
    evidence: {
      id: fixture.id,
      source: fixture.source,
      features: fixture.features,
      recordSha256: recordSha256(record),
      loopDurationMs: showLoopDurationMs(record),
      clipCount: facts.clipCount,
      before,
      bridge: {
        opened: opened.ok,
        changed: done.changed,
        summaries: done.summaries,
        reply: done.reply,
        toolEvents: events.flatMap((event) => (event.kind === 'tool' ? [event.name] : [])),
        refusals: done.timing.toolCalls.flatMap((call) => (call.isError ? [`${call.name}: ${call.issue ?? 'refused'}`] : [])),
      },
      after,
    },
  }
}

export async function collectFixtureEvidence(): Promise<{ document: BaselineFixtureEvidence; timings: Record<string, number> }> {
  const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, port: 0, log: () => {} })
  const timings: Record<string, number> = {}
  try {
    const fixtures: FixtureEvidence[] = []
    for (const fixture of BASELINE_FIXTURES) {
      const run = await runFixture(fixture, bridge.url)
      fixtures.push(run.evidence)
      timings[fixture.id] = run.turnMs
    }
    return { document: { version: 1, stampedAt: STAMPED_AT, utterance: UTTERANCE, fixtures }, timings }
  } finally {
    await bridge.close()
  }
}

export async function main(): Promise<void> {
  const write = process.argv.includes('--write')
  const { document, timings } = await collectFixtureEvidence()
  for (const fixture of document.fixtures) {
    const outcome = fixture.after
      ? `changed, first Clip ${fixture.after.firstClipDurationMs} ms, .epe ${'error' in fixture.after.epe ? 'ERROR' : 'ok'}`
      : `no candidate${fixture.bridge.refusals.length ? `: ${fixture.bridge.refusals.join(' | ').slice(0, 160)}` : `: ${fixture.bridge.reply.slice(0, 100)}`}`
    console.log(`  ${fixture.id}: ${fixture.clipCount} clips, ${fixture.loopDurationMs} ms loop; before .epe ${'error' in fixture.before.epe ? 'ERROR ' + fixture.before.epe.error.slice(0, 80) : 'ok'}; bridge ${timings[fixture.id]} ms, ${outcome}`)
  }
  const reportDir = join('reports', 'agent-harness', 'baseline')
  mkdirSync(reportDir, { recursive: true })
  const reportPath = join(reportDir, `fixtures-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(reportPath, `${JSON.stringify({ ...document, scriptedTurnMs: timings }, null, 2)}\n`)
  if (write) {
    mkdirSync(dirname(EVIDENCE_PATH), { recursive: true })
    writeFileSync(EVIDENCE_PATH, `${JSON.stringify(document, null, 2)}\n`)
    console.log(`evidence written to ${EVIDENCE_PATH}; run record at ${reportPath}`)
    return
  }
  if (!existsSync(EVIDENCE_PATH)) {
    console.error(`no committed evidence at ${EVIDENCE_PATH}; run with --write to record it`)
    process.exitCode = 1
    return
  }
  const expected = JSON.parse(readFileSync(EVIDENCE_PATH, 'utf8')) as BaselineFixtureEvidence
  const differences = evidenceDifferences(expected, document)
  if (differences.length === 0) {
    console.log(`fixture evidence unchanged (${document.fixtures.length} fixtures); run record at ${reportPath}`)
    return
  }
  console.error(`fixture evidence differs from ${EVIDENCE_PATH} at ${differences.length} path(s):`)
  for (const path of differences.slice(0, 40)) console.error(`  ${path}`)
  console.error('Inspect the run record before deciding whether to re-record with --write; a changed artifact is never blessed automatically.')
  process.exitCode = 1
}
