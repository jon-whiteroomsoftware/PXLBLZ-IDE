export interface DocumentHistory<T> {
  past: T[]
  future: T[]
}

const queues = new Map<string, Promise<void>>()

export function editedHistory<T>(history: DocumentHistory<T>, previous: T): DocumentHistory<T> {
  return { past: [...history.past, previous], future: [] }
}

export function undoHistory<T>(history: DocumentHistory<T>, current: T): { replacement: T; history: DocumentHistory<T> } | null {
  const replacement = history.past[history.past.length - 1]
  if (!replacement) return null
  return { replacement, history: { past: history.past.slice(0, -1), future: [current, ...history.future] } }
}

export function redoHistory<T>(history: DocumentHistory<T>, current: T): { replacement: T; history: DocumentHistory<T> } | null {
  const replacement = history.future[0]
  if (!replacement) return null
  return { replacement, history: { past: [...history.past, current], future: history.future.slice(1) } }
}

export function nextShowOrderingStamp(previous: number, now = Date.now()): number {
  return Math.max(now, previous + 1)
}

export function hasQueuedShowPersistence(id: string): boolean {
  return queues.has(id)
}

export function hasAnyQueuedShowPersistence(): boolean {
  return queues.size > 0
}

export async function queueShowPersistence(id: string, operation: () => Promise<void>): Promise<void> {
  const previous = queues.get(id) ?? Promise.resolve()
  const persistence = previous.catch(() => undefined).then(operation)
  queues.set(id, persistence)
  try {
    await persistence
  } finally {
    if (queues.get(id) === persistence) queues.delete(id)
  }
}
