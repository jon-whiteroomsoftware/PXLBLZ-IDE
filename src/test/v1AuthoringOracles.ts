import { expect, vi } from 'vitest'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import fixture from './fixtures/v1AuthoringOracles.json'

// Return values of the retired v1 authoring owners, frozen before their deletion (#1042 4-4b).
// v2 tests use them as the preserved expected value or input of a v1-then-convert comparison.
// v1 owners stamp updatedAt from Date.now(); pinning it keeps the frozen output stable across runs.
function runPinned<T>(live: () => T): T {
  const now = vi.spyOn(Date, 'now').mockReturnValue(0)
  try { return live() } finally { now.mockRestore() }
}

export function frozenV1Output<T>(key: string, live: () => T): T {
  if (process.env.PXLBLZ_V1_ORACLE_WRITE === '1') {
    const value = runPinned(live)
    const roundTrip = JSON.parse(JSON.stringify(value)) as T
    expect(roundTrip).toEqual(value)
    let path: string
    try {
      path = fileURLToPath(new URL('./fixtures/v1AuthoringOracles.json', import.meta.url))
    } catch {
      path = resolve(process.cwd(), 'src/test/fixtures/v1AuthoringOracles.json')
    }
    const data = JSON.parse(readFileSync(path, 'utf8')) as { provenance: typeof fixture.provenance; entries: Record<string, unknown> }
    data.entries[key] = roundTrip
    data.entries = Object.fromEntries(Object.entries(data.entries).sort(([left], [right]) => left.localeCompare(right)))
    writeFileSync(path, JSON.stringify(data, null, 1) + '\n')
    return roundTrip
  }
  const frozen = (fixture.entries as Record<string, unknown>)[key]
  if (frozen === undefined) throw new Error(`No frozen v1 output for "${key}".`)
  expect(JSON.parse(JSON.stringify(runPinned(live))), `frozen v1 output "${key}" is stale`).toEqual(frozen)
  return structuredClone(frozen) as T
}
