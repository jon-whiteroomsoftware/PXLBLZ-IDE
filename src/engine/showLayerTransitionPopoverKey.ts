/**
 * The entity a Layer Transition popover edits (#1098). Linked Group
 * occurrences share a definition-local Transition id, so the occurrence is
 * part of it. The editor keys the popover with this, so moving to another
 * entity remounts it and clears its refusal line.
 */
export function showLayerTransitionPopoverKey(target: {
  groupOccurrenceId?: string
  groupTransitionId?: string
  transitionId?: string
  legacy?: { id: string }
}): string {
  return JSON.stringify([
    target.groupOccurrenceId ?? null,
    target.groupTransitionId ?? null,
    target.transitionId ?? null,
    target.legacy?.id ?? null,
  ])
}
