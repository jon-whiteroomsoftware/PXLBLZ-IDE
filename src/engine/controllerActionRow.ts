import type { ControllerStatus } from './ControllerProvider'
import type { ProgramListEntry } from './PixelblazeConnection'
import type { Route } from './routes'
import { describeSendToController, type SendGate } from './sendToController'

export type ControllerActionSubject = {
  kind: 'pattern' | 'show'
  id: string
  name: string
  deliveryBlocker: string | null
  runAlreadyPushed: boolean
  saveAlreadyPushed: boolean
}

export interface ControllerActionRowInput {
  subject?: ControllerActionSubject | null
  route: Route
  patternName: string | null
  status: ControllerStatus
  compileStatus: 'good' | 'broken'
  runAlreadyPushed: boolean
  saveAlreadyPushed: boolean
  working: boolean
  programsRead: boolean
  programCount: number
  hasRunOnlyActive?: boolean
}

export interface ControllerActionRowView {
  subject: string | null
  run: SendGate
  save: SendGate
  switch: SendGate
}

const OPEN_PATTERN_REASON = 'Open a Pattern or Show to push it to this Controller'

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
  hasRunOnlyActive,
}: Pick<
  ControllerActionRowInput,
  | 'status'
  | 'working'
  | 'programsRead'
  | 'programCount'
  | 'hasRunOnlyActive'
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
  if (programCount === 0 && !hasRunOnlyActive) {
    return disabled('This Controller has no saved Patterns')
  }
  return { enabled: true }
}

/**
 * Project the controller popover's Run/Save row from app state. Route awareness
 * is deliberate: the pattern store retains the last-open pattern while Gallery,
 * and other surfaces are active; explicit Show subjects use their mounted editor
 * capability instead. Other surfaces must not expose stale
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
  hasRunOnlyActive = false,
  subject,
}: ControllerActionRowInput): ControllerActionRowView {
  const switchGate = describeSwitchGate({
    status,
    working,
    programsRead,
    programCount,
    hasRunOnlyActive,
  })
  if (subject && (route.kind !== 'studio' || route.entity?.kind !== (subject.kind === 'show' ? 'shows' : 'patterns') || route.entity.id !== subject.id)) {
    const gate = disabled(OPEN_PATTERN_REASON)
    return { subject: null, run: gate, save: gate, switch: switchGate }
  }
  if (subject?.kind === 'show' && route.kind === 'studio' && route.entity?.kind === 'shows' && route.entity.id === subject.id) {
    const blocker = working ? 'Sending…' : subject.deliveryBlocker
    return {
      subject: subject.name,
      run: blocker ? disabled(blocker) : describeSendToController({ status, alreadyPushed: subject.runAlreadyPushed }),
      save: blocker ? disabled(blocker) : describeSendToController({ status, alreadyPushed: subject.saveAlreadyPushed }),
      switch: switchGate,
    }
  }
  const visiblePatternName = subject?.kind === 'pattern' ? subject.name : patternName
  if (!isStudioPatternRoute(route) || !visiblePatternName) {
    const gate = disabled(OPEN_PATTERN_REASON)
    return { subject: null, run: gate, save: gate, switch: switchGate }
  }

  if (working) {
    const gate = disabled('Sending…')
    return { subject: visiblePatternName, run: gate, save: gate, switch: switchGate }
  }

  const run = describeSendToController({ status, compileStatus, alreadyPushed: subject?.runAlreadyPushed ?? runAlreadyPushed })
  const save = describeSendToController({ status, compileStatus, alreadyPushed: subject?.saveAlreadyPushed ?? saveAlreadyPushed })

  return {
    subject: visiblePatternName,
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
