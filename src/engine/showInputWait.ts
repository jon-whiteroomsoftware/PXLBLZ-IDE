import type { ShowEditReceipt, ShowEditRequest, ShowEditSession } from './showEditAdmission'

export const SHOW_INPUT_WAIT_MS = 5000
export const SHOW_ACTIVITY_CAPACITY = 256
export type ShowEditActivity = Readonly<{ sessionId: string; showId: string; kind: 'drag' | 'dirty-field' }>
export type ShowInputWaitReceipt = ShowEditReceipt | { readonly status: 'waiting'; readonly request: ShowEditRequest; readonly deadline: number }

/** Internal synchronous owner. Tokens are object capabilities, never DOM focus. */
export function createShowInputWait(session: () => ShowEditSession | undefined) {
  const activity = new Set<ShowEditActivity>()
  const identities = new Map<string, string>()
  const pending = new Map<string, { request: ShowEditRequest; deadline: number; timer: ReturnType<typeof setTimeout>; apply: () => ShowEditReceipt }>()
  const release = (id: string) => {
    const value = pending.get(id)
    if (value) clearTimeout(value.timer)
    pending.delete(id)
  }
  const settle = (id: string) => {
    const value = pending.get(id)
    if (!value) return
    const current = session()
    if (!current || current.sessionId !== value.request.sessionId) { release(id); return }
    const checked = current.checkIdentity(value.request, current)
    if (checked.status !== 'pending') { release(id); return }
    if (performance.now() >= value.deadline) {
      release(id)
      current.refuse(id, 'interaction-timeout')
    } else if (!activity.size) {
      release(id)
      value.apply()
    } else {
      clearTimeout(value.timer)
      value.timer = setTimeout(() => settle(id), value.deadline - performance.now())
    }
  }
  const read = (id: string): ShowInputWaitReceipt | undefined => {
    const value = pending.get(id)
    if (value) settle(id)
    const waiting = pending.get(id)
    return waiting ? { status: 'waiting', request: waiting.request, deadline: waiting.deadline } : session()?.read(id)
  }
  return {
    read,
    owns: (id: string) => pending.has(id),
    release,
    acquire(sessionId: string, showId: string, kind: ShowEditActivity['kind']): ShowEditActivity | undefined {
      const current = session()
      if (!current || current.sessionId !== sessionId || current.showId !== showId) return undefined
      if (kind !== 'drag' && kind !== 'dirty-field') throw new TypeError('Unsupported active input')
      // Never return an untracked success: callers must not start an edit on failure.
      if (activity.size >= SHOW_ACTIVITY_CAPACITY) throw new RangeError('Show activity capacity exhausted')
      const token = Object.freeze({ sessionId, showId, kind })
      activity.add(token)
      return token
    },
    releaseActivity(token: ShowEditActivity) {
      if (!activity.delete(token)) return
      for (const id of [...pending.keys()]) settle(id)
    },
    deliver(request: ShowEditRequest, identity: string, arrivedAt: number, apply: () => ShowEditReceipt, eligible: () => ShowEditReceipt): ShowInputWaitReceipt {
      const current = session()
      if (!current || current.sessionId !== request.sessionId) return { status: 'retired', request }
      const checked = current.checkIdentity(request, current)
      // Wrong envelopes cannot overwrite the registered candidate or terminal result.
      if (checked !== current.read(request.operationId)) return checked
      const original = identities.get(request.operationId)
      if (original !== undefined && original !== identity) return { status: 'refused', reason: 'identity-mismatch', request }
      if (checked.status !== 'pending') return checked
      if (original !== undefined) return read(request.operationId)!
      identities.set(request.operationId, identity)
      const admitted = eligible()
      if (admitted.status !== 'pending') return admitted
      const deadline = arrivedAt + SHOW_INPUT_WAIT_MS
      if (performance.now() >= deadline) return current.refuse(request.operationId, 'interaction-timeout')!
      if (!activity.size) return apply()
      pending.set(request.operationId, { request: checked.request, deadline, apply, timer: setTimeout(() => settle(request.operationId), deadline - performance.now()) })
      return read(request.operationId)!
    },
    invalidate(showId?: string) {
      for (const [id, value] of pending) if (!showId || value.request.showId === showId) {
        session()?.refuse(id, 'revision-conflict')
        release(id)
      }
    },
    retire() {
      for (const id of pending.keys()) release(id)
      activity.clear()
      identities.clear()
    },
  }
}
