// Per-Controller pattern→program binding logic for overwrite-in-place push
// (H10, issue #202). Pure decision layer; persistence lives in storage.ts and the
// socket work in PixelblazeConnection.
//
// The #202 contract: a deliberate Send "overwrites in place" rather than piling up
// copies. So each (Controller, IDE pattern) pair remembers the device program id it
// last pushed to, and reuses it. Three cases, all decided here:
//   - first push for this pattern on this Controller → mint a fresh id (bind),
//   - a remembered id still present on the device      → reuse it (overwrite),
//   - a remembered id the user deleted on the device   → silently mint a new id.
// Control values are never part of this — the binding is identity only.
//
// Zero React, zero transport specifics.

/** A Controller's bindings: IDE pattern id → device program id. */
export type ControllerBindings = Record<string, string>

/** All bindings, keyed by Controller id (its stable address/device id). */
export type BindingStore = Record<string, ControllerBindings>

export interface ResolvedPushTarget {
  /** The device program id to push to. */
  programId: string
  /** True when freshly minted (first push, or silent re-create) — the caller must
   *  persist the new binding after a successful push. False when reusing an
   *  existing, still-present binding. */
  isNew: boolean
}

/** Decide which device program id a push should target. `deviceProgramIds` is the
 *  live program list read back from the device (so a binding to a since-deleted
 *  program is detected and re-created). `mint` supplies a fresh id when needed
 *  (injectable for determinism). */
export function resolvePushTarget(
  bindings: ControllerBindings | undefined,
  patternId: string,
  deviceProgramIds: readonly string[],
  mint: () => string,
): ResolvedPushTarget {
  const bound = bindings?.[patternId]
  if (bound && deviceProgramIds.includes(bound)) {
    return { programId: bound, isNew: false }
  }
  return { programId: mint(), isNew: true }
}

/** Return a new BindingStore with `(controllerId, patternId) → programId` recorded,
 *  without mutating the input (siblings preserved). */
export function withBinding(
  store: BindingStore,
  controllerId: string,
  patternId: string,
  programId: string,
): BindingStore {
  return {
    ...store,
    [controllerId]: { ...(store[controllerId] ?? {}), [patternId]: programId },
  }
}
