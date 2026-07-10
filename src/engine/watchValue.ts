const ARRAY_PREVIEW_SIZE = 3

export interface WatchArraySummary {
  kind: 'array-summary'
  items: unknown[]
  total: number
}

function isWatchArraySummary(value: unknown): value is WatchArraySummary {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<WatchArraySummary>
  return candidate.kind === 'array-summary'
    && Array.isArray(candidate.items)
    && typeof candidate.total === 'number'
}

export function isWatchArrayValue(value: unknown): boolean {
  return Array.isArray(value) || isWatchArraySummary(value)
}

/** Capture only the portion of a watched value the UI can display. Arrays may be
 * pixel-sized, so never clone/decode the whole allocation on every preview frame. */
export function snapshotWatchValue(
  value: unknown,
  decodeNumber: (value: number) => number,
): unknown {
  if (typeof value === 'number') return decodeNumber(value)
  if (!Array.isArray(value)) return value
  return {
    kind: 'array-summary',
    items: value.slice(0, ARRAY_PREVIEW_SIZE).map((item) =>
      typeof item === 'number' ? decodeNumber(item) : item,
    ),
    total: value.length,
  } satisfies WatchArraySummary
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

function formatArray(summary: WatchArraySummary): string {
  const items = summary.items.map((item) =>
    typeof item === 'number' ? formatNumber(item) : '?',
  )
  const remaining = Math.max(0, summary.total - summary.items.length)
  return items.join(', ') + (remaining > 0 ? `, … +${remaining}` : '')
}

export function formatWatchValue(value: unknown): string {
  if (value === undefined || value === null) return '—'
  if (typeof value === 'number') return formatNumber(value)
  if (isWatchArraySummary(value)) return formatArray(value)
  if (Array.isArray(value)) {
    return formatArray({
      kind: 'array-summary',
      items: value.slice(0, ARRAY_PREVIEW_SIZE),
      total: value.length,
    })
  }
  return String(value)
}
