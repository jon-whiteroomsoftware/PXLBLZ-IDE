import type { ControllerStatus } from './ControllerProvider'
import type { ProgramListEntry } from './PixelblazeConnection'
import type { Route } from './routes'
import { describeSendToController, type SendGate } from './sendToController'

export interface ControllerActionRowInput {
  route: Route
  patternName: string | null
  status: ControllerStatus
  compileStatus: 'good' | 'broken'
  runAlreadyPushed: boolean
  saveAlreadyPushed: boolean
  working: boolean
  programsRead: boolean
  programCount: number
}

export interface ControllerActionRowView {
  subject: string | null
  run: SendGate
  save: SendGate
  switch: SendGate
}

const OPEN_PATTERN_REASON = 'Open a pattern to push it to this Controller'

function isStudioPatternRoute(route: Route): boolean {
  return route.kind === 'studio' && route.entity?.kind === 'patterns'
}

function disabled(reason: string): SendGate {
  return { enabled: false, reason }
}

function describeSwitchGate({
  status,
  working,
  programsRead,
  programCount,
}: Pick<
  ControllerActionRowInput,
  'status' | 'working' | 'programsRead' | 'programCount'
>): SendGate {
  if (status.kind !== 'connected') {
    return disabled('Connect this Controller to switch saved Patterns')
  }
  if (working) {
    return disabled('Wait for the current send to finish before switching Patterns')
  }
  if (!programsRead) {
    return disabled('Saved Patterns have not been read from this Controller')
  }
  if (programCount === 0) {
    return disabled('This Controller has no saved Patterns')
  }
  return { enabled: true }
}

/**
 * Project the controller popover's Run/Save row from app state. Route awareness
 * is deliberate: the pattern store retains the last-open pattern while Gallery,
 * Shows, and other surfaces are active, but those surfaces must not expose stale
 * push verbs as if they acted on the visible content.
 */
export function describeControllerActionRow({
  route,
  patternName,
  status,
  compileStatus,
  runAlreadyPushed,
  saveAlreadyPushed,
  working,
  programsRead,
  programCount,
}: ControllerActionRowInput): ControllerActionRowView {
  const switchGate = describeSwitchGate({ status, working, programsRead, programCount })
  if (!isStudioPatternRoute(route) || !patternName) {
    const gate = disabled(OPEN_PATTERN_REASON)
    return { subject: null, run: gate, save: gate, switch: switchGate }
  }

  if (working) {
    const gate = disabled('Sending…')
    return { subject: patternName, run: gate, save: gate, switch: switchGate }
  }

  const run = describeSendToController({ status, compileStatus, alreadyPushed: runAlreadyPushed })
  const save = describeSendToController({ status, compileStatus, alreadyPushed: saveAlreadyPushed })

  return {
    subject: patternName,
    run,
    save,
    switch: switchGate,
  }
}

export interface ControllerProgramMenuRow {
  id: string
  name: string
  running: boolean
  unsaved: boolean
  disabled: boolean
}

export interface ControllerProgramMenuView {
  rows: ControllerProgramMenuRow[]
  showFilter: boolean
}

export interface ControllerProgramMenuInput {
  programs: ProgramListEntry[]
  activeProgramId?: string
  programLabels?: Record<string, string>
  filter: string
}

/**
 * Project the saved-Pattern switcher as one deterministic flat list. A run-only
 * active Pattern is deliberately outside filtering: it stays pinned as device
 * truth even when the user narrows the saved inventory beneath it.
 */
export function projectControllerProgramMenu({
  programs,
  activeProgramId,
  programLabels,
  filter,
}: ControllerProgramMenuInput): ControllerProgramMenuView {
  const query = filter.trim().toLocaleLowerCase()
  const sorted = [...programs].sort((left, right) => {
    const byName = left.name.localeCompare(right.name, undefined, { sensitivity: 'base' })
    return byName || left.id.localeCompare(right.id)
  })
  const savedRows = sorted
    .filter((program) => (
      !query
      || program.name.toLocaleLowerCase().includes(query)
      || program.id.toLocaleLowerCase().includes(query)
    ))
    .map((program): ControllerProgramMenuRow => ({
      ...program,
      running: program.id === activeProgramId,
      unsaved: false,
      disabled: false,
    }))
  const activeIsSaved = !!activeProgramId
    && programs.some((program) => program.id === activeProgramId)
  const runOnlyRow: ControllerProgramMenuRow[] = activeProgramId && !activeIsSaved
    ? [{
        id: activeProgramId,
        name: programLabels?.[activeProgramId] ?? activeProgramId,
        running: true,
        unsaved: true,
        disabled: true,
      }]
    : []

  return {
    rows: [...runOnlyRow, ...savedRows],
    showFilter: programs.length > 8,
  }
}
