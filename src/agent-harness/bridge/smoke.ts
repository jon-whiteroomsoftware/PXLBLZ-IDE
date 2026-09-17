// Bridge smoke (#945): one scripted, no-paid-call turn through the real
// loopback bridge, judged at the consumer surfaces.
//   npm run agent:smoke [-- --delay-ms <n>]   prints the verdict, writes reports/agent-harness/smoke/<time>.json
// Runs under src/agent-harness/run.ts, which awaits the exported `main`.
//
// The path is the one a live model takes: HTTP POST /utterance, NDJSON
// progress, the in-memory MCP client/server pair, a grammar session, and the
// shared turn runner. The fake agent resolves its Clip reference through
// describe_show and edits through resize_clip like a model would. The
// returned candidate is then exported through the editor's own version-2
// `.pxlshow` pair and reopened through the v2 Show importer, and exported as
// `.epe` and reopened through the Pattern importer; the facts asserted come from
// those reopened artifacts projected with the editor's timeline projection,
// never from the bridge's own reply.
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEpe } from '@/engine/epeImport'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { buildShowFileBundle, parseShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { applyShowImportPlanV2, planShowImportV2 } from '@/engine/showImportPlanV2'
import { projectShowTimelineV2 } from '@/engine/showTimelineViewModelV2'
import type { ScriptStep } from '../experiment/corpus.js'
import { dictationFixture } from '../experiment/fixtures.js'
import { exportShowDocument } from '../shows/exportShow.js'
import { createScriptedAgent, parseBridgeEvents, startBridge } from './service.js'

export const SMOKE_UTTERANCE = 'make the first Clip twelve seconds'
export const SMOKE_REPLY = 'The first Clip is twelve seconds.'
/** The scripted solution: resolve the Clip at 0 ms, resize it, finish in the same call. */
export const SMOKE_SCRIPT: ScriptStep[] = [
  { tool: 'resize_clip', args: { clip_id: '$clipAt:0', duration_ms: 12_000, finish_turn_reply: { intent: 'apply', reply: SMOKE_REPLY } } },
]
const STAMPED_AT = '2026-09-04T00:00:00.000Z'

export interface ShowFacts {
  id: string
  name: string
  clipCount: number
  firstClipDurationMs: number
}

/** What the editor's timeline projection shows for a version-2 record. */
export function showFacts(show: ShowRecordV2): ShowFacts {
  const timeline = projectShowTimelineV2(show)
  const clips = timeline.rows.flatMap((row) => row.layers.flatMap((layer) => layer.items))
  const first = [...clips].sort((a, b) => a.startMs - b.startMs || a.id.localeCompare(b.id))[0]
  return {
    id: show.id,
    name: show.name,
    clipCount: clips.length,
    firstClipDurationMs: first?.durationMs ?? -1,
  }
}

export interface BridgeSmokeOptions {
  /** Scripted completion delay forwarded to the bridge. */
  delayMs?: number
}

export interface SmokeCheck {
  name: string
  ok: boolean
  detail: string
}

export interface BridgeSmokeResult {
  bridgeUrl: string
  agent: string
  utterance: string
  script: ScriptStep[]
  delayMs: number
  turnMs: number
  toolEvents: string[]
  response: { reply: string; changed: boolean; summaries: string[] }
  fixture: ShowFacts
  candidate: ShowFacts
  pxlshow: {
    filename: string
    bytes: number
    reopenedShowName: string
    reopenedClipCount: number
    reopenedFirstClipDurationMs: number
  }
  epe: {
    filename: string
    bytes: number
    stampKind: string | null
    sourceChangedFromFixture: boolean
  }
  checks: SmokeCheck[]
  ok: boolean
}

export async function runBridgeSmoke(options: BridgeSmokeOptions = {}): Promise<BridgeSmokeResult> {
  const delayMs = options.delayMs ?? 0
  const bridge = await startBridge({ agent: createScriptedAgent(), scripted: true, port: 0, log: () => {} })
  try {
    const fixture = dictationFixture('base')
    const health = (await (await fetch(`${bridge.url}/health`)).json()) as { model: string }

    const turnStart = Date.now()
    const response = await fetch(`${bridge.url}/utterance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show: fixture, utterance: SMOKE_UTTERANCE, script: SMOKE_SCRIPT, delayMs, context: {} }),
    })
    const events = parseBridgeEvents(await response.text())
    const turnMs = Date.now() - turnStart
    const done = events.find((event) => event.kind === 'done')
    if (!done || done.kind !== 'done') throw new Error('the bridge stream ended without a result')
    const toolEvents = events.flatMap((event) => (event.kind === 'tool' ? [event.name] : []))
    const candidate = done.show as ShowRecordV2 | undefined
    if (!candidate) throw new Error(`the bridge returned no candidate: ${done.reply}`)

    const fixtureFacts = showFacts(fixture)
    const candidateFacts = showFacts(candidate)
    const directory = mkdtempSync(join(tmpdir(), 'pxlblz-agent-smoke-'))

    // .pxlshow: the editor's "Export Show file" pair, reopened by the
    // Pattern list's import pair into a fresh record.
    const { filename, bundle } = buildShowFileBundle(
      candidate,
      { patterns: [], maps: [] },
      { appVersion: 'agent-smoke', exportedAt: STAMPED_AT },
    )
    const pxlshowPath = join(directory, filename)
    writeFileSync(pxlshowPath, await serializeShowFileBundle(bundle))
    const pxlshowBytes = readFileSync(pxlshowPath)
    const reopened = await parseShowFileBundle(new Uint8Array(pxlshowBytes), { acceptV2: true })
    if (reopened.version !== 2) throw new Error(`the reopened Show file is version ${String(reopened.version)}, not 2`)
    const plan = planShowImportV2(reopened, { patterns: [], maps: [], libraries: [], showNames: [] }, { createId: () => 'agent-smoke-import', now: 1 })
    const imported = applyShowImportPlanV2(plan).show
    const importedFacts = showFacts(imported)

    // .epe: the compiled deliverable, reopened by the Pattern importer. The
    // fixture's own export at the same stamp is the reference the edit must
    // move away from.
    const fixtureEpe = exportShowDocument(fixture, [], { stampedAt: STAMPED_AT, epeId: 'agent-smoke' })
    const candidateEpe = exportShowDocument(candidate, [], { stampedAt: STAMPED_AT, epeId: 'agent-smoke' })
    if (!fixtureEpe.ok) throw new Error(`the fixture did not export: ${JSON.stringify(fixtureEpe.errors)}`)
    if (!candidateEpe.ok) throw new Error(`the candidate did not export: ${JSON.stringify(candidateEpe.errors)}`)
    const epePath = join(directory, candidateEpe.epeFilename)
    writeFileSync(epePath, candidateEpe.epeText)
    const epeText = readFileSync(epePath, 'utf8')
    const parsedEpe = parseEpe(epeText)

    const result: Omit<BridgeSmokeResult, 'checks' | 'ok'> = {
      bridgeUrl: bridge.url,
      agent: health.model,
      utterance: SMOKE_UTTERANCE,
      script: SMOKE_SCRIPT,
      delayMs,
      turnMs,
      toolEvents,
      response: { reply: done.reply, changed: done.changed, summaries: done.summaries },
      fixture: fixtureFacts,
      candidate: candidateFacts,
      pxlshow: {
        filename,
        bytes: pxlshowBytes.length,
        reopenedShowName: reopened.show.name,
        reopenedClipCount: importedFacts.clipCount,
        reopenedFirstClipDurationMs: importedFacts.firstClipDurationMs,
      },
      epe: {
        filename: candidateEpe.epeFilename,
        bytes: Buffer.byteLength(epeText),
        stampKind: parsedEpe.stamp?.kind ?? null,
        sourceChangedFromFixture: parsedEpe.src !== parseEpe(fixtureEpe.epeText).src,
      },
    }
    const checks: SmokeCheck[] = [
      check('tool path', toolEvents.join(',') === 'describe_show,resize_clip', `tool events ${JSON.stringify(toolEvents)}`),
      check('committed once', done.changed && done.summaries.length === 1, `changed=${done.changed} summaries=${done.summaries.length}`),
      check('reply', done.reply === SMOKE_REPLY, JSON.stringify(done.reply)),
      check('same Show', candidateFacts.id === fixtureFacts.id && candidateFacts.clipCount === fixtureFacts.clipCount, `${fixtureFacts.id} -> ${candidateFacts.id}, ${fixtureFacts.clipCount} -> ${candidateFacts.clipCount} clips`),
      check('candidate resized', fixtureFacts.firstClipDurationMs === 30_000 && candidateFacts.firstClipDurationMs === 12_000, `${fixtureFacts.firstClipDurationMs} -> ${candidateFacts.firstClipDurationMs} ms`),
      check('.pxlshow reopened', importedFacts.firstClipDurationMs === 12_000 && importedFacts.clipCount === fixtureFacts.clipCount && reopened.show.name === fixtureFacts.name, `${result.pxlshow.bytes} bytes, first Clip ${importedFacts.firstClipDurationMs} ms, ${importedFacts.clipCount} clips`),
      check('.epe reopened', parsedEpe.stamp?.kind === 'show' && result.epe.sourceChangedFromFixture, `${result.epe.bytes} bytes, stamp ${parsedEpe.stamp?.kind ?? 'none'}, source changed ${result.epe.sourceChangedFromFixture}`),
      check('delay honoured', turnMs >= delayMs, `${turnMs} ms turn, ${delayMs} ms requested`),
    ]
    return { ...result, checks, ok: checks.every((entry) => entry.ok) }
  } finally {
    await bridge.close()
  }
}

function check(name: string, ok: boolean, detail: string): SmokeCheck {
  return { name, ok, detail }
}

export async function main(): Promise<void> {
  const delayArg = process.argv.indexOf('--delay-ms')
  const delayMs = delayArg >= 0 ? Number(process.argv[delayArg + 1]) : 0
  const result = await runBridgeSmoke({ delayMs })
  const outDir = join('reports', 'agent-harness', 'smoke')
  mkdirSync(outDir, { recursive: true })
  const outPath = join(outDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`)
  console.log(`agent smoke: ${result.agent} at ${result.bridgeUrl}, "${result.utterance}" in ${result.turnMs} ms`)
  for (const entry of result.checks) console.log(`  ${entry.ok ? 'ok  ' : 'FAIL'} ${entry.name}: ${entry.detail}`)
  console.log(`${result.ok ? 'PASS' : 'FAIL'}; record written to ${outPath}`)
  process.exitCode = result.ok ? 0 : 1
}
