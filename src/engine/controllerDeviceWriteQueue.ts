const tails = new Map<string, Promise<void>>()

/** Runs device mutations in order for one Controller. Controllers remain
 * independent, and a rejected operation never poisons the following write. */
export function queueControllerDeviceWrite<T>(
  controllerId: string,
  write: () => Promise<T>,
): Promise<T> {
  const previous = tails.get(controllerId) ?? Promise.resolve()
  const result = previous.catch(() => undefined).then(write)
  const tail = result.then(() => undefined, () => undefined)
  tails.set(controllerId, tail)
  void tail.finally(() => {
    if (tails.get(controllerId) === tail) tails.delete(controllerId)
  })
  return result
}

/** True from the moment a write is queued for this Controller until the last
 * queued write settles, whether it succeeds or fails. The panel poll pauses on
 * it so periodic reads never compete with a write on a slow Controller (#1268). */
export function hasPendingControllerDeviceWrites(controllerId: string): boolean {
  return tails.has(controllerId)
}

/** Resolves once this Controller has no queued or running write, including
 * writes appended while waiting. Never rejects. */
export async function whenControllerDeviceWritesIdle(controllerId: string): Promise<void> {
  for (let tail = tails.get(controllerId); tail; tail = tails.get(controllerId)) {
    await tail
    // The tail's own cleanup runs in a later microtask; let it settle before
    // deciding whether another write was appended.
    await Promise.resolve()
  }
}

/** Test-only. Call only when no queued write is still in flight. */
export function __resetControllerDeviceWriteQueue(): void {
  tails.clear()
}
