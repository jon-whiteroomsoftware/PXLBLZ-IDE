import type { ControllerStatus } from './ControllerProvider'
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
}

export interface ControllerActionRowView {
  caption: string
  run: SendGate
  save: SendGate
}

const OPEN_PATTERN_REASON = 'Open a pattern to push it to this Controller'

function isStudioPatternRoute(route: Route): boolean {
  return route.kind === 'studio' && route.entity?.kind === 'patterns'
}

function disabled(reason: string): SendGate {
  return { enabled: false, reason }
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
}: ControllerActionRowInput): ControllerActionRowView {
  if (!isStudioPatternRoute(route) || !patternName) {
    const gate = disabled(OPEN_PATTERN_REASON)
    return { caption: `${OPEN_PATTERN_REASON}.`, run: gate, save: gate }
  }

  if (working) {
    const gate = disabled('Sending…')
    return { caption: `Sending ${patternName}…`, run: gate, save: gate }
  }

  const run = describeSendToController({ status, compileStatus, alreadyPushed: runAlreadyPushed })
  const save = describeSendToController({ status, compileStatus, alreadyPushed: saveAlreadyPushed })
  const sharedReason = !run.enabled && !save.enabled && run.reason === save.reason
    ? run.reason
    : undefined

  return {
    caption: sharedReason && sharedReason !== 'No changes since the last send'
      ? `${sharedReason}.`
      : `Acts on the open pattern — ${patternName}`,
    run,
    save,
  }
}
