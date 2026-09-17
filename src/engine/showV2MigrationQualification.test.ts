// #1039: the migration runbook's reopen-and-compile oracle. The assertions are
// at the surfaces an operator cares about - portable bytes that reopen as the
// same record, dependencies that resolve through the ordinary v2 import
// planner, and a compiled artifact - not at converter internals.
import { expect, it } from 'vitest'
import { convertibleV1Show } from '../test/showV2TracerFixture'
import type { MapRecord, PatternRecord } from './personalContentRecords'
import { convertShowRecordV1ToV2 } from './showRecordV1ToV2'
import type { ShowRecordV2 } from './showCompositionV2'
import {
  qualifyMigratedShowV2Record,
  resolveShowStageDimensionV2,
  type ShowV2MigrationAssets,
} from './showV2MigrationQualification'

const assets: ShowV2MigrationAssets = { patterns: [], maps: [], libraries: [] }

function migrated(): ShowRecordV2 {
  const converted = convertShowRecordV1ToV2(convertibleV1Show())
  if (converted.status === 'refused') throw new Error(converted.issues[0].message)
  return converted.record
}

// The compiled hash and size are pinned, not merely shaped. That is what makes
// the compile step provable: a qualification that skipped compilation, or that
// compiled a different record, cannot produce these values. A deliberate
// compiler change re-pins them with an explanation, the way the parity report
// is re-pinned.
it('qualifies a converted stock-sourced record through reopen and compile', async () => {
  await expect(qualifyMigratedShowV2Record(migrated(), assets))
    .resolves.toEqual({ status: 'qualified', compiled: { hash: '0e4bd46e', codeBytes: 3282 } })
})

it('qualifies a record whose Pattern source is a personal Pattern the assets carry', async () => {
  const record = migrated()
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'personal' }
  const pattern = {
    id: 'personal', name: 'Personal', src: 'export function render(index) { hsv(0, 1, 1) }',
    controls: {}, createdAt: 1, updatedAt: 1,
  } as unknown as PatternRecord
  // A different Pattern source compiles to different bytes, so the hash also
  // proves the compiled artifact belongs to this record rather than a constant.
  await expect(qualifyMigratedShowV2Record(record, { ...assets, patterns: [pattern] }))
    .resolves.toEqual({ status: 'qualified', compiled: { hash: 'a4785d03', codeBytes: 2687 } })
})

it('refuses a record whose personal Pattern is missing from the assets', async () => {
  const record = migrated()
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'absent' }
  const result = await qualifyMigratedShowV2Record(record, assets)
  expect(result.status).toBe('refused')
  expect(result.status === 'refused' && result.detail).toMatch(/Reopen failed/)
})

it('refuses a record whose Pattern source no longer parses, at the reopen step', async () => {
  const record = migrated()
  record.composition.patternInstances[0].pattern = { kind: 'user', id: 'broken' }
  const pattern = {
    id: 'broken', name: 'Broken', src: 'export function render(index) { this is not Pixelblaze source',
    controls: {}, createdAt: 1, updatedAt: 1,
  } as unknown as PatternRecord
  const result = await qualifyMigratedShowV2Record(record, { ...assets, patterns: [pattern] })
  // The portable bundle reads exported controls out of the source, so an
  // unparseable Pattern is caught before preparation ever runs.
  expect(result).toEqual({ status: 'refused', detail: expect.stringMatching(/^Reopen failed: /) })
})

it('refuses a document that is not a version-2 Show', async () => {
  const result = await qualifyMigratedShowV2Record(convertibleV1Show(), assets)
  expect(result).toEqual({ status: 'refused', detail: 'The stored record is not a version-2 Show.' })
})

// Reopen runs first and is the stricter of the two gates: it revalidates the
// record, rebuilds the portable bytes and resolves every dependency through the
// ordinary v2 import planner. Each dependency partition below therefore refuses
// at reopen rather than at compile, and the compile step covers what survives
// that - compiler-domain preparation refusals over an otherwise resolvable
// record. Both gates run for every row; the ordering is what the details name.
it('refuses a record whose stock Pattern no longer exists, at the reopen step', async () => {
  const record = migrated()
  record.composition.patternInstances[0].pattern = { kind: 'stock', id: 'RetiredStockPattern' }
  const result = await qualifyMigratedShowV2Record(record, assets)
  expect(result).toEqual({
    status: 'refused',
    detail: 'Reopen failed: The imported Show needs unknown built-in Pattern "RetiredStockPattern".',
  })
})

// Residual, recorded rather than papered over: no edit to a record reaches the
// compile branch's *refusal* details, because reopen revalidates the record and
// resolves every dependency first and is therefore the stricter gate. The
// compile step itself is proved by the pinned artifact hashes above rather than
// by a refusal. A record that exercises a preparation-only refusal (an
// RL08-RL10 scheduler restriction, say) through migration is future work for
// the owner that lands one.

it('refuses a structurally invalid record when the portable bytes are parsed back', async () => {
  const record = migrated()
  record.composition.clips[0].instanceId = 'absent-instance'
  const result = await qualifyMigratedShowV2Record(record, assets)
  // Pinned to the parser's own message: only serializing and re-parsing the
  // bundle produces it, so a qualification that trusted the built bundle
  // instead of the round trip would report something else.
  expect(result).toEqual({
    status: 'refused',
    detail: 'Reopen failed: This Show file has an invalid version-2 Show record.',
  })
})

/**
 * The Stage dimension the row actually compiles at (#1039). Qualifying every
 * migrated row at 2 would compile a 3D Show against geometry the editor never
 * uses, so a row whose Stage map is 3D would be reported as passing a
 * compilation nothing reproduces.
 */
it('resolves the Stage dimension from the record rather than assuming 2D', () => {
  const userMap = { id: 'personal-volume', name: 'Personal volume', dim: 3 } as unknown as MapRecord
  expect(resolveShowStageDimensionV2(null, [])).toBe(2)
  expect(resolveShowStageDimensionV2(undefined, [])).toBe(2)
  expect(resolveShowStageDimensionV2('cube', [])).toBe(3)
  expect(resolveShowStageDimensionV2('square', [])).toBe(2)
  expect(resolveShowStageDimensionV2('personal-volume', [userMap])).toBe(3)
  // A named Stage map that is gone compiles at the editor's own fallback.
  expect(resolveShowStageDimensionV2('retired-map', [])).toBe(2)
})

// What the dimension changes downstream is the compiler's own domain check:
// `showModel`'s recipe lookup refuses `portal`, `motion` and a 2D `wipe` unless
// the Stage is 2D. This slice's fixtures build no such Transition, so the
// consequence is proved where that gate lives rather than restated here; what
// is proved here is the resolution the migration hands it, which was the
// hard-coded value. Recorded as a residual in the #1039 evidence packet.
it('leaves a Stage map that names a 2D map at the 2D dimension', () => {
  const record = migrated()
  record.stageMapId = 'square'
  expect(resolveShowStageDimensionV2(record.stageMapId, assets.maps)).toBe(2)
})
