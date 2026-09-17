// The version-2 records of the #945 baseline fixture set (#1039).
//
// `fixtures.ts` stays exactly as it is, and deliberately so: those flat and
// composition-shaped records are the pinned legacy inputs of the 47-record
// parity census (`scripts/show-v2-parity.ts`, specification section 2), which
// must keep converting and comparing identically. Re-authoring them would
// silently move that census's baseline.
//
// So the agent baseline reads the same pinned records and converts them through
// the app's own converter, which is the route specification section 10 names.
// That also keeps `fixtures.ts` importable by Playwright without Vite: the
// converter reaches the v2 schema through `?raw`, so it lives here instead.
import { convertShowRecordV1ToV2 } from '@/engine/showRecordV1ToV2'
import type { PatternRecord, ShowRecord } from '@/engine/personalContentRecords'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { stockShowById } from '@/pixelblaze/stock/shows'
import { stockPatternSource } from '../shows/stockCatalogue.js'
import { resolveBaselineFixtureRecord, type BaselineFixture } from './fixtures.js'

/**
 * Convert one pinned legacy record, with the exact Pattern source every flat
 * cell and instance needs. A refused conversion throws: a baseline fixture that
 * cannot become a v2 record is a reportable fact, never a skipped row.
 */
export function convertBaselineRecord(
  legacy: ShowRecord,
  label: string,
  patterns: readonly PatternRecord[] = [],
): ShowRecordV2 {
  const sourceOf = (reference: { kind: string; id: string }): string | undefined => (
    reference.kind === 'stock'
      ? stockPatternSource(reference.id)
      : patterns.find((pattern) => pattern.id === reference.id)?.src
  )
  const converted = convertShowRecordV1ToV2(legacy, {
    byCellId: Object.fromEntries(legacy.cells.flatMap((cell) => {
      const source = sourceOf(cell.pattern)
      return source === undefined ? [] : [[cell.id, source]]
    })),
    byPatternInstanceId: Object.fromEntries((legacy.composition?.patternInstances ?? []).flatMap((instance) => {
      const source = sourceOf(instance.pattern)
      return source === undefined ? [] : [[instance.id, source]]
    })),
    stageDimension: 2,
  })
  if (converted.status !== 'converted') {
    throw new Error(`${label} did not convert to version 2: ${JSON.stringify(converted.issues)}`)
  }
  return converted.record
}

/** The version-2 record the agent baseline opens for one fixture. */
export function baselineFixtureRecordV2(fixture: BaselineFixture): ShowRecordV2 {
  const legacy = resolveBaselineFixtureRecord(fixture, (id) => stockShowById(id)?.show)
  return convertBaselineRecord(legacy, `baseline fixture ${fixture.id}`, fixture.patterns ?? [])
}
