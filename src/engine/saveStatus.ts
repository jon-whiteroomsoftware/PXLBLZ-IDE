// The save-status vocabulary for the auto-saving code editors (#810).
//
// Every code editor (pattern, map, mixin, library) persists its buffer on the
// editor's periodic sync tick, gated on a clean parse. That leaves two ways the
// buffer can be durably ahead of the stored record, and each gets one signal:
//
//   wont-save — the source is broken, so autosave is paused by design. Fixing
//               the errors resumes saving.
//   cant-save — the persistence write itself is failing (offline, server
//               error). The tick keeps retrying; the state clears on the first
//               successful save.
//
// Dirty-but-clean buffers inside one tick interval are deliberately silent:
// the next tick saves them, and flagging every keystroke would make the signal
// meaningless. Pure derivation only; the stores own the inputs.

export type StuckSaveStatus = 'wont-save' | 'cant-save'

export function deriveStuckSaveStatus(input: {
  buffer: string
  persisted: string | null
  compileBroken: boolean
  autosaveFailed: boolean
}): StuckSaveStatus | null {
  if (input.persisted === null) return null
  if (input.buffer === input.persisted) return null
  // Autosave deliberately never persists an empty buffer (the guard also
  // protects records from pre-hydration boot races), so an emptied editor is
  // stuck the same way broken source is.
  if (input.compileBroken || input.buffer === '') return 'wont-save'
  if (input.autosaveFailed) return 'cant-save'
  return null
}

// Absolute timestamp rather than a relative age: the tooltip string is
// computed at render time, and "2 min ago" would silently go stale while the
// user hovers. "Aug 11, 3:42 PM" stays true no matter when it is read.
export function lastSavedPhrase(updatedAt: number): string {
  const stamp = new Date(updatedAt).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  return `Last saved ${stamp}.`
}

export function stuckSaveStatusLabel(
  status: StuckSaveStatus,
  lastSavedAt: number | null,
): string {
  const base = status === 'wont-save'
    ? 'Changes not saved — only clean, non-empty source is autosaved. Fix the errors or restore content to resume saving.'
    : "Can't reach storage — retrying automatically. Your latest edits are only in this tab until a save succeeds."
  return lastSavedAt === null ? base : `${base} ${lastSavedPhrase(lastSavedAt)}`
}
