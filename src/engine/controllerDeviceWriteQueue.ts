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

/** Test-only. Call only when no queued write is still in flight. */
export function __resetControllerDeviceWriteQueue(): void {
  tails.clear()
}
