import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'

// Return values of the retired v1 authoring and composition owners, frozen before their deletion.
// v2 tests use them as the preserved expected value or input of a v1-then-convert comparison.
// Both fixtures can no longer be regenerated: their v1 owners were deleted in #1042 4-4b2 and 4-5c2a.
let entries: Record<string, unknown> | undefined

function frozenEntries(): Record<string, unknown> {
  if (entries) return entries
  const directory = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')
  const authoring = (JSON.parse(readFileSync(join(directory, 'v1AuthoringOracles.json'), 'utf8')) as { entries: Record<string, unknown> }).entries
  const composition = (JSON.parse(gunzipSync(readFileSync(join(directory, 'v1CompositionOracles.json.gz'))).toString('utf8')) as { entries: Record<string, unknown> }).entries
  for (const key of Object.keys(composition)) {
    if (Object.prototype.hasOwnProperty.call(authoring, key)) throw new Error(`Duplicate frozen v1 output key "${key}".`)
  }
  entries = { ...authoring, ...composition }
  return entries
}

export function frozenV1Output<T>(key: string): T {
  const frozen = frozenEntries()[key]
  if (frozen === undefined) throw new Error(`No frozen v1 output for "${key}".`)
  return structuredClone(frozen) as T
}
