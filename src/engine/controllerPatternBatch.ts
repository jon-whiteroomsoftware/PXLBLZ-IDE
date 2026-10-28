export type ControllerPatternSection = 'saved' | 'unimported' | 'other'
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

export async function retryControllerPatternBatch(
  previous: ControllerPatternBatchResult,
  perform: (pattern: ControllerBatchPattern) => Promise<void>,
): Promise<ControllerPatternBatchResult> {
  const retried = await runControllerPatternBatch(previous.failed.map((item) => item.pattern), perform)
  return { succeeded: [...previous.succeeded, ...retried.succeeded], failed: retried.failed }
}

export function controllerPatternBatchNames(patterns: readonly ControllerBatchPattern[]): string[] {
  return [...patterns.slice(0, 8).map((pattern) => pattern.name), ...(patterns.length > 8 ? [`…${patterns.length - 8} more`] : [])]
}

export function controllerPatternDeleteDisabledReason(
  programId: string,
  state: { sessionKnown: boolean; activeProgramId?: string; activatingProgramId: string | null },
): string | null {
  if (!state.sessionKnown || !state.activeProgramId?.trim() || programId === state.activatingProgramId) {
    return 'Waiting to confirm the running Pattern'
  }
  return programId === state.activeProgramId ? 'Running now — switch to another Pattern first' : null
}
