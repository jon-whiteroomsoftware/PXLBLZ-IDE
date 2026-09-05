// Output-directory reuse and replay (#945). Boundary: runCorpus and
// replayCorpus over a real output directory, with the scripted fake agent.
// Invariants: a run names exactly the transcripts it wrote in a manifest next
// to them; replay scores only what the latest run's manifest names, reports
// every other transcript in the directory as stale, and never deletes a file;
// a directory without a manifest (a legacy corpus) still replays, labelled as
// such; a manifest that names a missing transcript is an error, not a partial
// report. Oracle: the report.json and replay.json a reader opens, plus the
// directory listing after replay.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DICTATION_CASES } from '../experiment/cases.js'
import { readRunManifest, replayCorpus, RUN_MANIFEST_FILE, runCorpus } from '../experiment/cli.js'
import type { DictationReport } from '../experiment/report.js'
import { createFakeAgent } from '../experiment/runner.js'

const [CASE_A, CASE_B, CASE_C] = DICTATION_CASES
const quiet = () => {}

let directory: string
let outDir: string
let replayOut: string

const reportOnDisk = (dir: string) => JSON.parse(readFileSync(join(dir, 'report.json'), 'utf8')) as DictationReport
const transcriptsIn = (dir: string) => readdirSync(dir).filter((file) => file.endsWith('.transcript.json')).sort()

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'pxlblz-corpus-replay-'))
  outDir = join(directory, 'corpus')
  replayOut = join(directory, 'replayed')
})
afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

describe('run manifest', () => {
  it('names exactly the transcripts the run wrote, in corpus order, and the cases it could not measure', { timeout: 60_000 }, async () => {
    const result = await runCorpus({ cases: [CASE_A, CASE_B], agent: createFakeAgent(), outDir, log: quiet })
    expect(result.report.totals.cases).toBe(2)
    const manifest = readRunManifest(outDir)
    expect(manifest).toEqual({
      version: 1,
      agent: 'scripted-fake',
      runId: null,
      startedAt: expect.any(String),
      finishedAt: expect.any(String),
      transcripts: [
        { caseId: CASE_A.id, file: `${CASE_A.id}.transcript.json` },
        { caseId: CASE_B.id, file: `${CASE_B.id}.transcript.json` },
      ],
      unmeasured: [],
    })
    expect(transcriptsIn(outDir)).toEqual(manifest!.transcripts.map((entry) => entry.file).sort())
  })
})

describe('replay of the latest run', () => {
  it('refuses to write replay output over the recorded run directory and preserves its report', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    const reportBefore = readFileSync(join(outDir, 'report.json'), 'utf8')

    await expect(replayCorpus({ replayDir: outDir, outDir, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(
      /replay output directory must differ from the recorded run directory/,
    )
    expect(readFileSync(join(outDir, 'report.json'), 'utf8')).toBe(reportBefore)
    expect(existsSync(join(outDir, 'replay.json'))).toBe(false)
  })

  it('re-scores a manifested run to the same case scores and labels the report as a replay', { timeout: 60_000 }, async () => {
    const run = await runCorpus({ cases: [CASE_A, CASE_B], agent: createFakeAgent(), outDir, log: quiet })
    const replay = await replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })
    expect(replay.source).toBe('manifest')
    expect(replay.stale).toEqual([])
    expect(replay.scored).toEqual([`${CASE_A.id}.transcript.json`, `${CASE_B.id}.transcript.json`])
    const written = reportOnDisk(replayOut)
    expect(written.agent).toBe('scripted-fake (replay)')
    expect(written.cases).toEqual(run.report.cases)
    expect(written.totals).toEqual(run.report.totals)
    expect(JSON.parse(readFileSync(join(replayOut, 'replay.json'), 'utf8'))).toMatchObject({
      replayedFrom: outDir,
      source: 'manifest',
      runId: null,
      scored: replay.scored,
      stale: [],
    })
    // The replayed directory is untouched.
    expect(transcriptsIn(outDir)).toHaveLength(2)
    expect(existsSync(join(outDir, RUN_MANIFEST_FILE))).toBe(true)
  })

  it('scores only what the second run measured when it reused the directory, keeps the older transcripts, and names them stale', { timeout: 90_000 }, async () => {
    await runCorpus({ cases: [CASE_A, CASE_B, CASE_C], agent: createFakeAgent(), outDir, log: quiet })
    const staleBytes = readFileSync(join(outDir, `${CASE_B.id}.transcript.json`), 'utf8')
    const second = await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    expect(second.report.totals.cases).toBe(1)

    const replay = await replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })
    expect(replay.scored).toEqual([`${CASE_A.id}.transcript.json`])
    expect(replay.stale).toEqual([`${CASE_B.id}.transcript.json`, `${CASE_C.id}.transcript.json`])
    const written = reportOnDisk(replayOut)
    expect(written.totals.cases).toBe(1)
    expect(written.cases.map((score) => score.caseId)).toEqual([CASE_A.id])
    // Nothing was deleted or rewritten: the stale transcripts are byte-identical.
    expect(transcriptsIn(outDir)).toEqual([CASE_A.id, CASE_B.id, CASE_C.id].map((id) => `${id}.transcript.json`).sort())
    expect(readFileSync(join(outDir, `${CASE_B.id}.transcript.json`), 'utf8')).toBe(staleBytes)
  })

  it('treats a second full run as current: every transcript is manifested again and none is stale', { timeout: 90_000 }, async () => {
    await runCorpus({ cases: [CASE_A, CASE_B], agent: createFakeAgent(), outDir, log: quiet })
    const first = readRunManifest(outDir)
    const again = await runCorpus({ cases: [CASE_A, CASE_B], agent: createFakeAgent(), outDir, log: quiet })
    const manifest = readRunManifest(outDir)
    expect(manifest!.transcripts).toEqual(first!.transcripts)
    const replay = await replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })
    expect(replay.stale).toEqual([])
    expect(reportOnDisk(replayOut).cases).toEqual(again.report.cases)
  })

  it('refuses to score a manifested transcript that is missing instead of writing a partial report', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A, CASE_B], agent: createFakeAgent(), outDir, log: quiet })
    rmSync(join(outDir, `${CASE_B.id}.transcript.json`))
    await expect(replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(
      new RegExp(`${CASE_B.id}\\.transcript\\.json.*missing`),
    )
    expect(existsSync(join(replayOut, 'report.json'))).toBe(false)
  })
})

describe('replay of a directory without a manifest', () => {
  it('scores every transcript present and says so in the report label and replay.json', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A, CASE_B], agent: createFakeAgent(), outDir, log: quiet })
    // A legacy corpus directory: transcripts alone, as V3 left them.
    rmSync(join(outDir, RUN_MANIFEST_FILE))
    const warnings: string[] = []
    const replay = await replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: (line) => warnings.push(line) })
    expect(replay.source).toBe('directory')
    // Without a manifest there is no corpus order to follow: the directory listing, sorted.
    expect(replay.scored).toEqual([`${CASE_A.id}.transcript.json`, `${CASE_B.id}.transcript.json`].sort())
    expect(replay.stale).toEqual([])
    expect(reportOnDisk(replayOut).agent).toBe('scripted-fake (replay, no run manifest: every transcript in the directory)')
    expect(reportOnDisk(replayOut).totals.cases).toBe(2)
    expect(warnings.join('\n')).toMatch(/no run manifest/)
    expect(JSON.parse(readFileSync(join(replayOut, 'replay.json'), 'utf8'))).toMatchObject({ source: 'directory', runId: null })
  })

  it('skips a transcript for a case the corpus no longer has, as before', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    rmSync(join(outDir, RUN_MANIFEST_FILE))
    const foreign = { ...JSON.parse(readFileSync(join(outDir, `${CASE_A.id}.transcript.json`), 'utf8')), caseId: 'retired-case' }
    writeFileSync(join(outDir, 'retired-case.transcript.json'), JSON.stringify(foreign))
    const replay = await replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })
    expect(replay.scored).toEqual([`${CASE_A.id}.transcript.json`])
    expect(reportOnDisk(replayOut).totals.cases).toBe(1)
  })
})
