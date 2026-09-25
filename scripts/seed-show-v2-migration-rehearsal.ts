// #1039: seed a local D1 with v1 Show rows so the section 10 conversion runbook
// can be rehearsed against real storage rather than a memory fixture.
//
//   tsx scripts/seed-show-v2-migration-rehearsal.ts --persist-to <dir> --user <id>
//
// The corpus is the pinned #1034 corpus the parity harness uses - forty stock
// Shows and seven agent baseline fixtures - written through the production v1
// writer, plus one deliberately malformed row with no output contract so the
// runbook's undecodable partition is exercised on a real row. Seeding clears
// this user's Shows, backups and outcomes first, so a rehearsal always starts
// from a known state.
//
// Local D1 only, like the migration command itself.
import { createD1Show } from '@/cloudflare/shows'
import { BASELINE_FIXTURES, resolveBaselineFixtureRecord } from '@/agent-harness/baseline/fixtures'
import { V1_STOCK_SHOWS, v1StockShowById } from '@/test/v1StockShowsFixture'
import type { ShowRecord } from '@/engine/personalContentRecords'
import { openLocalD1, resolveLocalD1File } from './show-v2-migrate-lib'

export const MALFORMED_REHEARSAL_ROW_ID = 'rehearsal-malformed-row'

async function main(): Promise<void> {
  const args = new Map<string, string>()
  const argv = process.argv.slice(2)
  for (let index = 0; index < argv.length; index += 2) args.set(argv[index].replace(/^--/, ''), argv[index + 1])
  const persistTo = args.get('persist-to')
  const userId = args.get('user')
  if (!persistTo || !userId) {
    throw new Error('Usage: tsx scripts/seed-show-v2-migration-rehearsal.ts --persist-to <dir> --user <id>')
  }

  const database = openLocalD1(resolveLocalD1File(persistTo))
  try {
    for (const table of ['personal_shows', 'personal_patterns', 'personal_libraries', 'personal_show_v2_migration_backups', 'personal_show_v2_migration_outcomes']) {
      await database.prepare(`DELETE FROM ${table} WHERE user_id = ?`).bind(userId).run()
    }

    const records: ShowRecord[] = [
      ...V1_STOCK_SHOWS.map(item => structuredClone(item.show)),
      // A baseline fixture derived from a stock Show keeps that Show's id, so
      // the seeded row is namespaced to stay a distinct personal row.
      ...BASELINE_FIXTURES.map(fixture => {
        const record = resolveBaselineFixtureRecord(fixture, id => v1StockShowById(id)?.show)
        return { ...record, id: `baseline-${fixture.id}`, name: `Baseline ${fixture.id}` }
      }),
    ]
    for (const record of records) await createD1Show(database, userId, record, 1)

    // A fixture that runs a personal Pattern or Library needs those rows too,
    // or conversion refuses it for a missing source and the personal-dependency
    // path goes unrehearsed.
    for (const fixture of BASELINE_FIXTURES) {
      for (const pattern of fixture.patterns ?? []) {
        await database
          .prepare(`
            INSERT INTO personal_patterns (user_id, id, name, src, controls_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, '{}', 1, 1)
            ON CONFLICT(user_id, id) DO NOTHING
          `)
          .bind(userId, pattern.id, pattern.name, pattern.src)
          .run()
      }
      for (const library of fixture.libraries ?? []) {
        await database
          .prepare(`
            INSERT INTO personal_libraries (user_id, id, name, src, created_at, updated_at)
            VALUES (?, ?, ?, ?, 1, 1)
            ON CONFLICT(user_id, id) DO NOTHING
          `)
          .bind(userId, library.id, library.name, library.src)
          .run()
      }
    }

    await database
      .prepare(`
        INSERT INTO personal_shows (user_id, id, name, scenes_json, zones_json, cells_json, created_at, updated_at)
        VALUES (?, ?, ?, '[]', '[]', '[]', 1, 1)
      `)
      .bind(userId, MALFORMED_REHEARSAL_ROW_ID, 'Malformed rehearsal row')
      .run()

    console.log(`Seeded ${records.length} v1 rows and one malformed row for ${userId}.`)
  } finally {
    database.close()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
