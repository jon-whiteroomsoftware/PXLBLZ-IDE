type ProfileWrite = () => Promise<void>

const profileWriteTails = new Map<string, Promise<void>>()

/** Serialize durable writes per Controller Profile so rapid live edits cannot land
 * out of order in the personal-content provider. */
export function queueControllerProfileWrite(
  profileId: string,
  write: ProfileWrite,
): Promise<void> {
  const previous = profileWriteTails.get(profileId) ?? Promise.resolve()
  const current = previous.catch(() => undefined).then(write)
  profileWriteTails.set(profileId, current)
  void current.finally(() => {
    if (profileWriteTails.get(profileId) === current) profileWriteTails.delete(profileId)
  }).catch(() => undefined)
  return current
}

/** Barrier used by deployment: do not read durable profiles until every live edit
 * queued before (or during) the barrier has settled. Failed writes remain failures
 * for their caller but do not deadlock subsequent deployment attempts. */
export async function waitForControllerProfileWrites(): Promise<void> {
  while (profileWriteTails.size > 0) {
    await Promise.all([...profileWriteTails.values()].map((write) => write.catch(() => undefined)))
  }
}

/** Test-only queue reset. Call only when no writes are still running. */
export function __resetControllerProfileWriteQueue(): void {
  profileWriteTails.clear()
}
