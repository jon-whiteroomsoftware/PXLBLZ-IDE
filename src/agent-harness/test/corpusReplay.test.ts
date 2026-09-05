// Output-directory reuse and replay (#945). Boundary: runCorpus and
// replayCorpus over a real output directory, with the scripted fake agent.
// Invariants: a run names exactly the transcripts it wrote in a manifest next
// to them; replay scores only what the latest run's manifest names, reports
// every other transcript in the directory as stale, and never deletes a file;
// a directory without a manifest (a legacy corpus) still replays, labelled as
// such; malformed, contradictory or duplicate manifest membership is refused;
// a manifest that names a missing transcript is an error, not a partial report;
// source/output identity follows filesystem symlinks. Oracle: the report.json
// and replay.json a reader opens, plus source bytes after replay.
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
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
const fileHash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex')

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

  it('refuses duplicate transcript membership before scoring or writing a replay report', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    const manifestPath = join(outDir, RUN_MANIFEST_FILE)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    manifest.transcripts.push(manifest.transcripts[0])
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const sourceReportHash = fileHash(join(outDir, 'report.json'))

    await expect(replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(
      /duplicate transcript file/,
    )
    expect(fileHash(join(outDir, 'report.json'))).toBe(sourceReportHash)
    expect(existsSync(join(replayOut, 'report.json'))).toBe(false)
  })

  it('distinguishes a required finishedAt field from an explicitly unfinished run', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    const manifestPath = join(outDir, RUN_MANIFEST_FILE)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    delete manifest.finishedAt
    writeFileSync(manifestPath, JSON.stringify(manifest))

    await expect(replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(
      /finishedAt/,
    )
    expect(existsSync(join(replayOut, 'report.json'))).toBe(false)

    manifest.finishedAt = null
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const warnings: string[] = []
    const replay = await replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: (line) => warnings.push(line) })
    expect(replay.report.agent).toBe('scripted-fake (replay of an unfinished run)')
    expect(warnings.join('\n')).toMatch(/run did not finish/)
    expect(JSON.parse(readFileSync(join(replayOut, 'replay.json'), 'utf8')).manifestFinishedAt).toBeNull()
  })

  it.each<[string, Record<string, unknown>, RegExp]>([
    ['agent', { agent: '' }, /agent/],
    ['runId', { runId: 42 }, /runId/],
    ['startedAt', { startedAt: 'yesterday' }, /startedAt/],
    ['finishedAt', { finishedAt: 'later' }, /finishedAt/],
    ['transcripts', { transcripts: undefined }, /transcripts/],
    ['transcript caseId', { transcripts: [{ caseId: '', file: `${CASE_A.id}.transcript.json` }] }, /transcripts\[0\]\.caseId/],
    ['transcript file', { transcripts: [{ caseId: CASE_A.id, file: '' }] }, /transcripts\[0\]\.file/],
    ['unmeasured', { unmeasured: undefined }, /unmeasured/],
    ['unmeasured caseId', { unmeasured: [{ caseId: '', reason: 'budget refused' }] }, /unmeasured\[0\]\.caseId/],
    ['unmeasured reason', { unmeasured: [{ caseId: 'later-case', reason: '' }] }, /unmeasured\[0\]\.reason/],
  ])('refuses an invalid required %s field before changing source or destination reports', { timeout: 60_000 }, async (_field, patch, error) => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    const manifestPath = join(outDir, RUN_MANIFEST_FILE)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    Object.assign(manifest, patch)
    writeFileSync(manifestPath, JSON.stringify(manifest))
    const sourceReportHash = fileHash(join(outDir, 'report.json'))

    await expect(replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(error)
    expect(fileHash(join(outDir, 'report.json'))).toBe(sourceReportHash)
    expect(existsSync(join(replayOut, 'report.json'))).toBe(false)
  })

  it.each<[string, Record<string, unknown>, RegExp]>([
    [
      'duplicate transcript case',
      { transcripts: [
        { caseId: CASE_A.id, file: `${CASE_A.id}.transcript.json` },
        { caseId: CASE_A.id, file: `${CASE_B.id}.transcript.json` },
      ] },
      /duplicate transcript case/,
    ],
    [
      'duplicate unmeasured case',
      { unmeasured: [
        { caseId: CASE_B.id, reason: 'budget refused' },
        { caseId: CASE_B.id, reason: 'not attempted' },
      ] },
      /duplicate unmeasured case/,
    ],
    [
      'case recorded as measured and unmeasured',
      { unmeasured: [{ caseId: CASE_A.id, reason: 'budget refused' }] },
      /both measured and unmeasured/,
    ],
  ])('refuses %s membership before scoring', { timeout: 60_000 }, async (_membership, patch, error) => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    const manifestPath = join(outDir, RUN_MANIFEST_FILE)
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
    Object.assign(manifest, patch)
    writeFileSync(manifestPath, JSON.stringify(manifest))

    await expect(replayCorpus({ replayDir: outDir, outDir: replayOut, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(error)
    expect(existsSync(join(replayOut, 'report.json'))).toBe(false)
  })
})

describe('replay of the latest run', () => {
  it('refuses to write replay output over the recorded run directory and preserves its report', { timeout: 60_000 }, async () => {
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir, log: quiet })
    const reportHashBefore = fileHash(join(outDir, 'report.json'))

    await expect(replayCorpus({ replayDir: outDir, outDir, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(
      /replay output directory must differ from the recorded run directory/,
    )
    expect(fileHash(join(outDir, 'report.json'))).toBe(reportHashBefore)
    expect(existsSync(join(outDir, 'replay.json'))).toBe(false)
  })

  it('refuses an output path whose symlinked ancestor resolves to the recorded run directory', { timeout: 60_000 }, async () => {
    const realRoot = join(directory, 'real')
    const aliasRoot = join(directory, 'alias')
    const recordedRun = join(realRoot, 'corpus')
    mkdirSync(realRoot)
    await runCorpus({ cases: [CASE_A], agent: createFakeAgent(), outDir: recordedRun, log: quiet })
    symlinkSync(realRoot, aliasRoot, 'dir')
    const aliasedOutput = join(aliasRoot, 'corpus')
    const reportHashBefore = fileHash(join(recordedRun, 'report.json'))

    await expect(replayCorpus({ replayDir: recordedRun, outDir: aliasedOutput, cases: DICTATION_CASES, log: quiet })).rejects.toThrow(
      /replay output directory must differ from the recorded run directory/,
    )
    expect(fileHash(join(recordedRun, 'report.json'))).toBe(reportHashBefore)
    expect(existsSync(join(recordedRun, 'replay.json'))).toBe(false)
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
