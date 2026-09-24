// v2-only baselines that guard the v1 authoring removal (#1042 Phase 0).
//
// The parity reports compare against the v1 stock builder and the v1
// converter, so they stop existing once v1 authoring code goes. This set pins
// v2 outputs alone: the native v2 stock catalogue and the agent-baseline
// fixtures as committed v2 JSON snapshots. Nothing here converts a v1 record;
// every #1042 slice must leave `baselines.json` byte-identical, and the whole
// directory is deleted when #1042 closes.
//
//   npm run show:v2-baselines            (check, the default)
//   npm run show:v2-baselines -- --write
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { createFastReplayRuntime } from '@/engine/fastReplay'
import { compileLibraries } from '@/engine/libraries'
import { nativeDimension } from '@/engine/loadPattern'
import type { MapPoint } from '@/engine/maps/types'
import type { LibraryRecord, PatternRecord } from '@/engine/personalContentRecords'
import { compileShow, type GeneratedShowArtifact } from '@/engine/showCompiler'
import { prepareShowV2ForCompile } from '@/engine/showCompositionLoweringV2'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { buildShowEpeExportV2 } from '@/engine/showEpeExportV2'
import { buildShowFileBundle, serializeShowFileBundle } from '@/engine/showFileBundle'
import { materializeShowGroupsV2 } from '@/engine/showGroupsV2'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { STOCK_SHOWS_V2 } from '@/pixelblaze/stock/showsV2'
import { nativeStockStageDimensionV2 } from '@/pixelblaze/stock/showsV2Compile'

export const BASELINE_DIR = resolve('docs/reference/evidence/issue-1042-v2-baselines')
export const BASELINES_PATH = resolve(BASELINE_DIR, 'baselines.json')
const FIXTURE_DIR = resolve(BASELINE_DIR, 'fixtures')

/** Fixed export stamps, so the export hashes are functions of the record alone. */
const EXPORT_STAMP = { appVersion: 'show-v2-baselines', exportedAt: '2026-09-24T00:00:00.000Z' }
const EPE_ID = 'show-v2-baselines'
/** The runtime settings of scripts/show-v2-parity.ts, v2 half only. */
const STEP_MS = 16
const RANDOM_SEED = 1034
const MAX_RUNTIME_SAMPLES = 8

export type BaselineInput = {
  corpus: 'stock' | 'fixture'
  id: string
  record: ShowRecordV2
  patterns: PatternRecord[]
  libraries: LibraryRecord[]
}

export type RecordBaseline = {
  corpus: BaselineInput['corpus']
  id: string
  recordSha256: string
  preparation: { status: 'ready' } | { status: 'refused'; codes: string[] }
  compiled?: { sourceSha256: string; sourceBytes: number }
  pxlshowPayloadSha256: string
  epe: { status: 'exported'; sha256: string } | { status: 'refused'; code: string }
  runtime?: { mode: 'fast'; sampledMs: number[]; framesSha256: string }
}

export type Baselines = {
  schemaVersion: 1
  issue: 1042
  corpus: { stock: number; fixture: number }
  records: RecordBaseline[]
}

export function baselineInputs(): BaselineInput[] {
  const stock = STOCK_SHOWS_V2.map((record): BaselineInput => ({
    corpus: 'stock', id: record.id, record: structuredClone(record), patterns: [], libraries: [],
  }))
  const fixtures = readdirSync(FIXTURE_DIR).filter(name => name.endsWith('.json')).sort().map((name): BaselineInput => {
    const snapshot = JSON.parse(readFileSync(resolve(FIXTURE_DIR, name), 'utf8')) as Omit<BaselineInput, 'corpus'>
    return { corpus: 'fixture', id: snapshot.id, record: snapshot.record, patterns: snapshot.patterns, libraries: snapshot.libraries }
  })
  return [...stock, ...fixtures]
}

export async function computeBaselines(inputs: BaselineInput[] = baselineInputs()): Promise<Baselines> {
  const records: RecordBaseline[] = []
  for (const input of inputs) records.push(await baselineFor(input))
  return {
    schemaVersion: 1,
    issue: 1042,
    corpus: {
      stock: inputs.filter(input => input.corpus === 'stock').length,
      fixture: inputs.filter(input => input.corpus === 'fixture').length,
    },
    records,
  }
}

async function baselineFor(input: BaselineInput): Promise<RecordBaseline> {
  const { record } = input
  const libraries = compileLibraries(LIBRARIES, input.libraries)
  const prepared = prepareShowV2ForCompile(record, sourceLookup(record, input.patterns), { libraries })
  const built = buildShowFileBundle(record, { patterns: input.patterns, maps: [], libraries: input.libraries }, EXPORT_STAMP)
  const pxlshowPayload = gunzipSync(await serializeShowFileBundle(built.bundle))
  const base = {
    corpus: input.corpus,
    id: input.id,
    recordSha256: sha256(stableJson(record)),
    pxlshowPayloadSha256: sha256(pxlshowPayload),
  }
  if (prepared.status !== 'ready') {
    return {
      ...base,
      preparation: { status: 'refused', codes: prepared.issues.map(issue => `${issue.path}: ${issue.message}`) },
      epe: { status: 'refused', code: 'preparation-refused' },
    }
  }
  const artifact = compileShow(prepared.recipe, libraries)
  const epe = buildShowEpeExportV2(record, artifact.code, { stampedAt: EXPORT_STAMP.exportedAt, id: EPE_ID })
  return {
    ...base,
    preparation: { status: 'ready' },
    compiled: { sourceSha256: sha256(artifact.code), sourceBytes: artifact.code.length },
    epe: epe.status === 'exported' ? { status: 'exported', sha256: sha256(epe.text) } : { status: 'refused', code: epe.code },
    runtime: runtimeFingerprint(record, artifact),
  }
}

/** Stock sources from the catalogue, personal sources from the snapshot. */
function sourceLookup(record: ShowRecordV2, patterns: readonly PatternRecord[]) {
  const composition = record.composition
  const instances = [
    ...(composition.groupOccurrences.length > 0 ? materializeShowGroupsV2(record) : record).composition.patternInstances,
    ...composition.groupDefinitions.flatMap(definition => definition.patternInstances),
  ]
  const byPatternInstanceId = Object.fromEntries(instances.flatMap(instance => {
    const source = instance.pattern.kind === 'stock'
      ? DEMOS[resolveStockPatternId(instance.pattern.id)]
      : patterns.find(pattern => pattern.id === instance.pattern.id)?.src
    return source === undefined ? [] : [[instance.id, source]]
  }))
  return { byCellId: {}, byPatternInstanceId, stageDimension: nativeStockStageDimensionV2(record) }
}

/**
 * 0, 25%, 50% and 75% of Show End, then each Transition's midpoint in time
 * order, capped at MAX_RUNTIME_SAMPLES.
 */
export function runtimeSampleTimes(record: ShowRecordV2): number[] {
  const effective = materializeShowGroupsV2(record)
  const showEndMs = effective.composition.showEndMs
  const clipById = new Map(effective.composition.clips.map(clip => [clip.id, clip]))
  const quarters = [0, 0.25, 0.5, 0.75].map(fraction => Math.floor(showEndMs * fraction))
  const midpoints = effective.composition.transitions.flatMap(transition => {
    const starts = transition.wholeOutput
      ? [transition.wholeOutput.startMs]
      : transition.participants.flatMap(participant => {
        const from = clipById.get(participant.fromClipId)
        return from ? [from.startMs + from.durationMs] : []
      })
    return starts.map(startMs => Math.floor(startMs + transition.durationMs / 2))
  })
  const unique = [...new Set([...quarters, ...midpoints.sort((a, b) => a - b)])]
    .filter(timeMs => Number.isSafeInteger(timeMs) && timeMs >= 0 && timeMs < showEndMs)
  return unique.slice(0, MAX_RUNTIME_SAMPLES).sort((a, b) => a - b)
}

function runtimeFingerprint(record: ShowRecordV2, artifact: GeneratedShowArtifact): RecordBaseline['runtime'] {
  const dimension = nativeDimension(artifact.metadata.renderFns) as 1 | 2 | 3
  const runtime = createFastReplayRuntime({
    code: artifact.code, fxCode: artifact.fxCode, metadata: artifact.metadata, dimension,
  }, { mapPoints: mapPoints(dimension), randomSeed: RANDOM_SEED, fidelity: 'fast' })
  const sampledMs = runtimeSampleTimes(record)
  const frames: number[][] = []
  for (const timeMs of sampledMs) {
    const result = timeMs === 0
      ? runtime.renderCurrentFrame()
      : runtime.advanceTo(timeMs, { stepMs: STEP_MS, forceFullIntermediateRender: true })
    frames.push(Array.from(result.frame))
  }
  return { mode: 'fast', sampledMs, framesSha256: sha256(JSON.stringify(frames)) }
}

function mapPoints(dimension: 1 | 2 | 3): MapPoint[] {
  return Array.from({ length: 8 }, (_, index) => {
    const x = index / 7
    const sample = dimension === 1 ? [x] : dimension === 2 ? [x, 0.5] : [x, 0.5, 0.25]
    return { sample, pos: [x, 0.5] }
  })
}

/** Every record and field where the fresh baselines differ from the committed ones. */
export function diffBaselines(committed: Baselines, fresh: Baselines): string[] {
  const differences: string[] = []
  if (stableJson(committed.corpus) !== stableJson(fresh.corpus)) {
    differences.push(`corpus: committed ${stableJson(committed.corpus)}, now ${stableJson(fresh.corpus)}`)
  }
  const key = (record: RecordBaseline) => `${record.corpus}:${record.id}`
  const freshByKey = new Map(fresh.records.map(record => [key(record), record]))
  const committedKeys = new Set(committed.records.map(key))
  for (const record of committed.records) {
    const now = freshByKey.get(key(record))
    if (!now) {
      differences.push(`${key(record)}: missing from the corpus`)
      continue
    }
    const fields = [...new Set([...Object.keys(record), ...Object.keys(now)])] as Array<keyof RecordBaseline>
    for (const field of fields) {
      if (stableJson(record[field]) !== stableJson(now[field])) {
        differences.push(`${key(record)} ${field}: committed ${stableJson(record[field])}, now ${stableJson(now[field])}`)
      }
    }
  }
  for (const record of fresh.records) {
    if (!committedKeys.has(key(record))) differences.push(`${key(record)}: not in the committed baselines`)
  }
  return differences
}

export function serializeBaselines(baselines: Baselines): string {
  return `${JSON.stringify(baselines, null, 2)}\n`
}

/** Returns the differences; empty means the committed file is byte-identical. */
export async function checkBaselines(): Promise<string[]> {
  const fresh = await computeBaselines()
  const text = readFileSync(BASELINES_PATH, 'utf8')
  const differences = diffBaselines(JSON.parse(text) as Baselines, fresh)
  if (differences.length === 0 && text !== serializeBaselines(fresh)) {
    differences.push('baselines.json: bytes differ from the serialized baselines although every field matches')
  }
  return differences
}

export async function main(): Promise<void> {
  if (process.argv.includes('--write')) {
    const baselines = await computeBaselines()
    writeFileSync(BASELINES_PATH, serializeBaselines(baselines))
    console.log(`wrote ${BASELINES_PATH}: ${baselines.records.length} records`)
    return
  }
  const differences = await checkBaselines()
  if (differences.length > 0) {
    console.error(`v2 baselines drifted (${differences.length}):\n${differences.map(line => `  ${line}`).join('\n')}`)
    process.exitCode = 1
    return
  }
  console.log(`v2 baselines match: ${JSON.parse(readFileSync(BASELINES_PATH, 'utf8')).records.length} records.`)
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, sortValue(item)]))
  }
  return value
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}
