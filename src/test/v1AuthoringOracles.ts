import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// Return values of the retired v1 authoring owners, frozen before their deletion (#1042 4-4b).
// v2 tests use them as the preserved expected value or input of a v1-then-convert comparison.
// The owners were deleted in #1042 4-4b2, so the fixture can no longer be regenerated.
let entries: Record<string, unknown> | undefined

export function frozenV1Output<T>(key: string): T {
  entries ??= (JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'v1AuthoringOracles.json'), 'utf8')) as { entries: Record<string, unknown> }).entries
  const frozen = entries[key]
  if (frozen === undefined) throw new Error(`No frozen v1 output for "${key}".`)
  return structuredClone(frozen) as T
}
