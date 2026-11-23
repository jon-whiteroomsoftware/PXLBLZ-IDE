import type { ProgramListEntry } from './PixelblazeConnection'

export type ControllerPatternSection = 'saved' | 'other'
export type ControllerPatternSelection = { section: ControllerPatternSection | null; selectedIds: readonly string[] }
export type ControllerBatchPattern = { id: string; name: string }
export type ControllerPatternBatchResult = {
  succeeded: ControllerBatchPattern[]
  failed: { pattern: ControllerBatchPattern; error: string }[]
}

export function enterControllerPatternSelection(section: ControllerPatternSection): ControllerPatternSelection {
  return { section, selectedIds: [] }
}

export function reconcileControllerPatternSelection(state: ControllerPatternSelection, eligibleIds: readonly string[]): ControllerPatternSelection {
  return { section: state.section, selectedIds: state.section === null ? [] : state.selectedIds.filter((id) => eligibleIds.includes(id)) }
}

export function toggleControllerPatternSelection(state: ControllerPatternSelection, id: string, eligibleIds: readonly string[]): ControllerPatternSelection {
  const current = reconcileControllerPatternSelection(state, eligibleIds)
  if (current.section === null || !eligibleIds.includes(id)) return current
  return { ...current, selectedIds: current.selectedIds.includes(id) ? current.selectedIds.filter((selected) => selected !== id) : [...current.selectedIds, id] }
}

export function toggleAllControllerPatternSelection(state: ControllerPatternSelection, eligibleIds: readonly string[]): ControllerPatternSelection {
  if (state.section === null) return { section: null, selectedIds: [] }
  return { ...state, selectedIds: eligibleIds.every((id) => state.selectedIds.includes(id)) ? [] : [...eligibleIds] }
}

export async function runControllerPatternBatch(patterns: readonly ControllerBatchPattern[], perform: (pattern: ControllerBatchPattern) => Promise<void>): Promise<ControllerPatternBatchResult> {
  const result: ControllerPatternBatchResult = { succeeded: [], failed: [] }
  for (const pattern of patterns) {
    try {
      await perform(pattern)
      result.succeeded.push(pattern)
    } catch (error) {
      result.failed.push({ pattern, error: error instanceof Error ? error.message : String(error) })
    }
  }
  return result
}

export function controllerPatternBatchNames(patterns: readonly ControllerBatchPattern[]): string[] {
  return [...patterns.slice(0, 8).map((pattern) => pattern.name), ...(patterns.length > 8 ? [`…${patterns.length - 8} more`] : [])]
}

/** One selected saved Pattern, carrying the device name the user confirmed. */
export type ControllerBatchDeleteTarget = { id: string; expectedName: string }
export type ControllerBatchDeleteStep =
  | { target: ControllerBatchDeleteTarget; action: 'send' | 'absent' }
  | { target: ControllerBatchDeleteTarget; action: 'skip'; reason: string }
export type ControllerBatchDeletePlan =
  | { refusal: string; steps?: undefined }
  | { refusal?: undefined; steps: ControllerBatchDeleteStep[] }

/** Classifies a bulk delete from one inventory and one config read (#1266).
 * The whole batch is refused when the running Pattern is unknown or the
 * sequencer can change it; otherwise each target, in order, is sent, skipped
 * with its reason, or already absent. */
export function planControllerBatchDelete(
  baseline: readonly ProgramListEntry[],
  config: { activeProgramId?: string; runSequencer?: boolean },
  targets: readonly ControllerBatchDeleteTarget[],
): ControllerBatchDeletePlan {
  if (!config.activeProgramId) return { refusal: 'Controller did not identify its running Pattern; refresh before deleting.' }
  if (config.runSequencer) return { refusal: 'Stop the Controller sequencer before deleting saved Patterns.' }
  return { steps: targets.map((target): ControllerBatchDeleteStep => {
    const current = baseline.find((program) => program.id === target.id)
    if (target.id === config.activeProgramId) return { target, action: 'skip', reason: 'Running now — switch to another Pattern first' }
    if (!current) return { target, action: 'absent' }
    if (current.name !== target.expectedName) return {
      target, action: 'skip',
      reason: `Controller Pattern id ${target.id} now identifies ${current.name}; choose the Pattern again before deleting.`,
    }
    return { target, action: 'send' }
  }) }
}

export type ControllerBatchDeleteConfirmation = {
  /** Processed ids the final read no longer lists. */
  confirmedIds: string[]
  /** Processed ids the final read still lists. */
  stillListedIds: string[]
  /** Baseline Patterns the batch did not send that are now missing or renamed. */
  collateral: ProgramListEntry[]
}

/** Judges a bulk delete against the single final program-list read (#1266).
 * Absence from that read is the only success evidence; every baseline entry
 * the batch did not send must survive with its name. */
export function confirmControllerBatchDelete(
  baseline: readonly ProgramListEntry[],
  finalPrograms: readonly ProgramListEntry[],
  processedIds: readonly string[],
  sentIds: readonly string[],
): ControllerBatchDeleteConfirmation {
  const listed = (id: string) => finalPrograms.some((program) => program.id === id)
  return {
    confirmedIds: processedIds.filter((id) => !listed(id)),
    stillListedIds: processedIds.filter(listed),
    collateral: baseline.filter((before) => !sentIds.includes(before.id)
      && !finalPrograms.some((after) => after.id === before.id && after.name === before.name)),
  }
}
