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
// A check on a different Node major still checks non-runtime evidence and exits 3.
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
export const FRAMES_PATH = resolve(BASELINE_DIR, 'runtime-frames.json')
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
  schemaVersion: 2
  generator: { nodeMajor: number }
  issue: 1042
  corpus: { stock: number; fixture: number }
  records: RecordBaseline[]
}

export type RuntimeFrames = { sampledMs: number[]; frames: number[][] }
export type FramesFile = { schemaVersion: 1; records: Record<string, RuntimeFrames> }
type ComputedBaselines = { baselines: Baselines; runtimeFrames: FramesFile }

export function runtimeComparability(generatorNodeMajor: number, nodeVersion: string):
  { comparable: true } | { comparable: false; reason: string } {
  const runningMajor = Number(nodeVersion.split('.')[0])
  return generatorNodeMajor === runningMajor
    ? { comparable: true }
    : { comparable: false, reason: `runtime frames not compared: generated on Node ${generatorNodeMajor}, running Node ${runningMajor}` }
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

export async function computeBaselines(inputs: BaselineInput[] = baselineInputs()): Promise<ComputedBaselines> {
  const records: RecordBaseline[] = []
  const frameEntries: Array<[string, RuntimeFrames]> = []
  for (const input of inputs) {
    const { baseline, runtimeFrames } = await baselineFor(input)
    records.push(baseline)
    if (runtimeFrames) frameEntries.push([`${input.corpus}:${input.id}`, runtimeFrames])
  }
  return {
    baselines: {
      schemaVersion: 2,
      generator: { nodeMajor: Number(process.versions.node.split('.')[0]) },
      issue: 1042,
      corpus: {
        stock: inputs.filter(input => input.corpus === 'stock').length,
        fixture: inputs.filter(input => input.corpus === 'fixture').length,
      },
      records,
    },
    runtimeFrames: { schemaVersion: 1, records: Object.fromEntries(frameEntries.sort(([a], [b]) => a.localeCompare(b))) },
  }
}

async function baselineFor(input: BaselineInput): Promise<{ baseline: RecordBaseline; runtimeFrames?: RuntimeFrames }> {
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
    return { baseline: {
      ...base,
      preparation: { status: 'refused', codes: prepared.issues.map(issue => `${issue.path}: ${issue.message}`) },
      epe: { status: 'refused', code: 'preparation-refused' },
    } }
  }
  const artifact = compileShow(prepared.recipe, libraries)
  const epe = buildShowEpeExportV2(record, artifact.code, { stampedAt: EXPORT_STAMP.exportedAt, id: EPE_ID })
  const runtime = runtimeFingerprint(record, artifact)
  return {
    baseline: {
      ...base,
      preparation: { status: 'ready' },
      compiled: { sourceSha256: sha256(artifact.code), sourceBytes: artifact.code.length },
      epe: epe.status === 'exported' ? { status: 'exported', sha256: sha256(epe.text) } : { status: 'refused', code: epe.code },
      runtime: { mode: 'fast', sampledMs: runtime.sampledMs, framesSha256: runtime.framesSha256 },
    },
    runtimeFrames: { sampledMs: runtime.sampledMs, frames: runtime.frames },
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

function runtimeFingerprint(record: ShowRecordV2, artifact: GeneratedShowArtifact): RuntimeFrames & { framesSha256: string } {
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
  return { sampledMs, frames, framesSha256: sha256(JSON.stringify(frames)) }
}

function mapPoints(dimension: 1 | 2 | 3): MapPoint[] {
  return Array.from({ length: 8 }, (_, index) => {
    const x = index / 7
    const sample = dimension === 1 ? [x] : dimension === 2 ? [x, 0.5] : [x, 0.5, 0.25]
    return { sample, pos: [x, 0.5] }
  })
}

/** The first changed sample and pixel value, if the committed and fresh frames differ. */
export function firstDifferentRuntimeFrame(key: string, committed: RuntimeFrames, fresh: RuntimeFrames): string | undefined {
  const samples = Math.max(committed.frames.length, fresh.frames.length)
  for (let sample = 0; sample < samples; sample++) {
    const before = committed.frames[sample] ?? []
    const after = fresh.frames[sample] ?? []
    for (let index = 0; index < Math.max(before.length, after.length); index++) {
      const a = JSON.stringify(before[index])
      const b = JSON.stringify(after[index])
      if (a === b) continue
      const ms = committed.sampledMs[sample] ?? fresh.sampledMs[sample]
      return `${key} runtime frame at ${ms} ms, value ${index}: committed ${a}, now ${b} (|Δ| ${Math.abs(before[index] - after[index])})`
    }
  }
  return undefined
}

/** Every record and field where the fresh baselines differ from the committed ones. */
export function diffBaselines(
  committed: Baselines,
  fresh: Baselines,
  options: { compareRuntime?: boolean; committedFrames?: FramesFile; freshFrames?: FramesFile } = {},
): string[] {
  const differences: string[] = []
  if (committed.schemaVersion !== fresh.schemaVersion) differences.push(`schemaVersion: committed ${committed.schemaVersion}, now ${fresh.schemaVersion}`)
  if (committed.issue !== fresh.issue) differences.push(`issue: committed ${committed.issue}, now ${fresh.issue}`)
  if (options.compareRuntime !== false && stableJson(committed.generator) !== stableJson(fresh.generator)) {
    differences.push(`generator: committed ${stableJson(committed.generator)}, now ${stableJson(fresh.generator)}`)
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
      if (field === 'runtime' && options.compareRuntime === false) continue
      if (stableJson(record[field]) !== stableJson(now[field])) {
        differences.push(`${key(record)} ${field}: committed ${stableJson(record[field])}, now ${stableJson(now[field])}`)
        if (field === 'runtime' && record.runtime?.framesSha256 !== now.runtime?.framesSha256) {
          const before = options.committedFrames?.records[key(record)]
          const after = options.freshFrames?.records[key(record)]
          if (before && after) {
            const first = firstDifferentRuntimeFrame(key(record), before, after)
            if (first) differences.push(first)
          }
        }
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

export function serializeRuntimeFrames(frames: FramesFile): string {
  return `${JSON.stringify(frames, null, 2)}\n`
}

/** A different Node major yields a partial check, never a full-pass result. */
export async function checkBaselines(options: { nodeVersion?: string } = {}): Promise<{
  differences: string[]
  runtime: { comparable: true } | { comparable: false; reason: string }
}> {
  const fresh = await computeBaselines()
  const text = readFileSync(BASELINES_PATH, 'utf8')
  const frameText = readFileSync(FRAMES_PATH, 'utf8')
  const committed = JSON.parse(text) as Baselines
  const committedFrames = JSON.parse(frameText) as FramesFile
  const runtime = runtimeComparability(committed.generator.nodeMajor, options.nodeVersion ?? process.versions.node)
  const differences = diffBaselines(committed, fresh.baselines, {
    compareRuntime: runtime.comparable,
    committedFrames,
    freshFrames: fresh.runtimeFrames,
  })
  const comparableBaselines = runtime.comparable ? fresh.baselines : {
    ...fresh.baselines,
    generator: committed.generator,
    records: fresh.baselines.records.map(record => ({
      ...record,
      runtime: committed.records.find(item => item.corpus === record.corpus && item.id === record.id)?.runtime,
    })),
  }
  if (differences.length === 0 && text !== serializeBaselines(comparableBaselines)) {
    differences.push('baselines.json: bytes differ from the serialized baselines although every compared field matches')
  }
  const comparableFrames = runtime.comparable ? fresh.runtimeFrames : {
    ...fresh.runtimeFrames,
    records: Object.fromEntries(Object.keys(fresh.runtimeFrames.records).map(key => [key, committedFrames.records[key]])),
  }
  if (frameText !== serializeRuntimeFrames(comparableFrames)) {
    differences.push('runtime-frames.json: bytes differ from the serialized runtime frames')
  }
  return { differences, runtime }
}

export async function main(): Promise<void> {
  if (process.argv.includes('--write')) {
    const { baselines, runtimeFrames } = await computeBaselines()
    writeFileSync(BASELINES_PATH, serializeBaselines(baselines))
    writeFileSync(FRAMES_PATH, serializeRuntimeFrames(runtimeFrames))
    console.log(`wrote ${BASELINES_PATH} and ${FRAMES_PATH}: ${baselines.records.length} records`)
    return
  }
  const { differences, runtime } = await checkBaselines()
  if (differences.length > 0) {
    console.error(`v2 baselines drifted (${differences.length}):\n${differences.map(line => `  ${line}`).join('\n')}`)
    process.exitCode = 1
    return
  }
  const count = (JSON.parse(readFileSync(BASELINES_PATH, 'utf8')) as Baselines).records.length
  if (!runtime.comparable) {
    console.log(`v2 baselines match: ${count} records; ${runtime.reason}.`)
    process.exitCode = 3
    return
  }
  console.log(`v2 baselines match: ${count} records.`)
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
