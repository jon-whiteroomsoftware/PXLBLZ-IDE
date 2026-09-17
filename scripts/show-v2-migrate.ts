// #1039: the section 10 personal-row conversion runbook, as an operator command.
//
//   npm run show:v2-migrate -- inventory --persist-to <dir> --user <id>
//   npm run show:v2-migrate -- convert   --persist-to <dir> --user <id> --report <path>
//   npm run show:v2-migrate -- rollback  --persist-to <dir> --user <id> --ids <a,b>
//
// The runbook it drives is the landed owner: inventory actual rows, snapshot
// originals into personal_show_v2_migration_backups, record per-row source
// hash/version/outcome in personal_show_v2_migration_outcomes, convert and
// validate in memory, write explicit v2 under a compare-and-set over the
// original columns, then read back, reopen and compile. Already-v2 rows are
// idempotent no-ops. An interrupted pass resumes from the recorded outcomes,
// and a row whose original changed since its outcome is rechecked rather than
// trusted. A failed row keeps its snapshot, is reported, and is restored by
// name with `rollback`.
//
// Local D1 only, by design. The remote pass is blocked on a recorded
// Cloudflare migration authorization failure; this command has no `--remote`
// backend, so it cannot be pointed at production by accident.
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { createD1ShowV2MigrationStore } from '@/cloudflare/showV2Migration'
import { artifactHash } from '@/engine/artifactStamp'
import type { LibraryRecord, MapRecord, PatternRecord, ShowPatternRef } from '@/engine/personalContentRecords'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { rehearseShowV2Migration, rollbackShowV2Migration, type ShowV2MigrationOutcome } from '@/engine/showV2Migration'
import {
  qualifyMigratedShowV2Record,
  resolveShowStageDimensionV2,
  type ShowV2MigrationAssets,
} from '@/engine/showV2MigrationQualification'
import {
  buildShowV2MigrateReport,
  openLocalD1,
  parseShowV2MigrateArgs,
  resolveLocalD1File,
  ShowV2MigrateArgsError,
  ShowV2MigrateStopped,
  showV2MigrateUsage,
  stopAfterSettledRows,
  type ShowV2MigrateArgs,
} from './show-v2-migrate-lib'

async function runCommand(): Promise<number> {
  let args: ShowV2MigrateArgs
  try {
    args = parseShowV2MigrateArgs(process.argv.slice(2))
  } catch (error) {
    console.error(error instanceof ShowV2MigrateArgsError ? error.message : showV2MigrateUsage())
    return 2
  }

  const database = openLocalD1(resolveLocalD1File(args.persistTo))
  try {
    const store = createD1ShowV2MigrationStore(database, args.userId)
    const assets = await readAssets(database, args.userId)

    if (args.command === 'inventory') {
      const sources = await store.inventory()
      for (const source of sources) {
        const settled = await store.outcome(source.id)
        console.log([
          source.id,
          `v${source.sourceVersion}`,
          settled ? settled.status : 'unrecorded',
          source.error ? `undecodable: ${source.error}` : '',
        ].filter(Boolean).join('  '))
      }
      console.log(`${sources.length} row(s); ${sources.filter(source => source.sourceVersion === 2).length} already v2.`)
      return 0
    }

    if (args.command === 'rollback') {
      await rollbackShowV2Migration(store, args.ids!)
      console.log(`Restored ${args.ids!.length} row(s) from their migration backups.`)
      return 0
    }

    let outcomes: ShowV2MigrationOutcome[] = []
    // The interruption belongs after a row's outcome is durably recorded, so
    // the resume path is exercised exactly as an operator's interrupted run
    // leaves the store: n settled rows and the rest untouched.
    const pass = args.stopAfter === undefined ? store : stopAfterSettledRows(store, args.stopAfter)
    try {
      outcomes = await rehearseShowV2Migration(pass, {
        sources: show => ({
          byCellId: Object.fromEntries(show.cells.flatMap(cell => {
            const source = patternSource(cell.pattern, assets.patterns)
            return source === undefined ? [] : [[cell.id, source]]
          })),
          byPatternInstanceId: Object.fromEntries((show.composition?.patternInstances ?? []).flatMap(instance => {
            const source = patternSource(instance.pattern, assets.patterns)
            return source === undefined ? [] : [[instance.id, source]]
          })),
          // The Stage this row actually compiles at, not an assumed 2D one.
          stageDimension: resolveShowStageDimensionV2(show.stageMapId, assets.maps),
        }),
        qualify: record => qualifyMigratedShowV2Record(record, assets),
      })
    } catch (error) {
      if (!(error instanceof ShowV2MigrateStopped)) throw error
      console.log(error.message)
      console.log('Re-run the same command to resume from the recorded per-row outcomes.')
      return 3
    }

    const report = buildShowV2MigrateReport(args.command, artifactHash(args.userId), outcomes, new Date().toISOString())
    for (const row of report.rows) {
      console.log([row.id, `v${row.sourceVersion}`, row.status, row.detail ?? ''].filter(Boolean).join('  '))
    }
    console.log(JSON.stringify(report.totals))
    if (args.report) {
      mkdirSync(dirname(args.report), { recursive: true })
      writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`)
      console.log(`Report written to ${args.report}`)
    }
    return report.rows.some(row => row.status === 'refused') ? 1 : 0
  } finally {
    database.close()
  }
}

/**
 * The dependencies a converted record needs to reopen and compile. They come
 * from the same database as the Shows, so the qualification sees exactly what
 * the owner of those rows would see.
 */
async function readAssets(database: ReturnType<typeof openLocalD1>, userId: string): Promise<ShowV2MigrationAssets> {
  const rows = async <T>(sql: string): Promise<T[]> => (await database.prepare(sql).bind(userId).all<T>()).results
  const patterns = (await rows<{ id: string; name: string; src: string; controls_json: string; created_at: number; updated_at: number }>(
    'SELECT id, name, src, controls_json, created_at, updated_at FROM personal_patterns WHERE user_id = ? ORDER BY id',
  )).map(row => ({
    id: row.id,
    name: row.name,
    src: row.src,
    controls: parseJson(row.controls_json, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as unknown as PatternRecord)
  const maps = (await rows<{ id: string; name: string; dim: number; generator: string; params_json: string; points_json: string | null; source: string | null; created_at: number; updated_at: number }>(
    'SELECT id, name, dim, generator, params_json, points_json, source, created_at, updated_at FROM personal_maps WHERE user_id = ? ORDER BY id',
  )).map(row => ({
    id: row.id,
    name: row.name,
    dim: row.dim,
    generator: row.generator,
    params: parseJson(row.params_json, {}),
    ...(row.points_json ? { points: parseJson(row.points_json, []) } : {}),
    ...(row.source ? { source: row.source } : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }) as unknown as MapRecord)
  const libraries = (await rows<{ id: string; name: string; src: string; created_at: number; updated_at: number }>(
    'SELECT id, name, src, created_at, updated_at FROM personal_libraries WHERE user_id = ? ORDER BY id',
  )).map(row => ({
    id: row.id, name: row.name, src: row.src, createdAt: row.created_at, updatedAt: row.updated_at,
  }) as unknown as LibraryRecord)
  return { patterns, maps, libraries }
}

/**
 * Resolve one Pattern reference's exact source. A stock reference resolves
 * against the built-in catalogue; a personal reference against this user's own
 * Patterns. An unresolvable reference contributes nothing, so conversion
 * refuses that row by name instead of converting it against a guess.
 */
function patternSource(reference: ShowPatternRef, patterns: readonly PatternRecord[]): string | undefined {
  if (reference.kind === 'stock') {
    const id = resolveStockPatternId(reference.id)
    return Object.prototype.hasOwnProperty.call(DEMOS, id) ? DEMOS[id] : undefined
  }
  return patterns.find(pattern => pattern.id === reference.id)?.src
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback
  try {
    return JSON.parse(text) as T
  } catch {
    return fallback
  }
}

/**
 * The entry the module runner awaits. This command runs under
 * `src/agent-harness/run.ts` rather than plain `tsx`, because it resolves the
 * built-in Pattern catalogue, which loads its sources through Vite's
 * `import.meta.glob` and has no Node equivalent.
 */
export async function main(): Promise<void> {
  try {
    process.exitCode = await runCommand()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}
