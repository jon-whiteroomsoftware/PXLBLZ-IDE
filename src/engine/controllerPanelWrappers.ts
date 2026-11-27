// The Controller panel's Wrappers group (#1280, wrappers specification §7).
// Pure: which reported controls are Wrapper Controls, their values, and the line a
// Show reads instead. The panel renders the result; the reserved export names come
// from `PATTERN_WRAPPER_CONTROLS` (#1276) and the saved outcome from the confirmed
// push record (#1279, `docs/reference/contracts/controller-wrappers.md`).
import type { BindingStore } from './controllerBinding'
import {
  CONTROLLER_WRAPPER_TYPES,
  type ControllerInput,
  type ControllerWrapperOutcome,
  type ControllerWrapperType,
} from './controllerProfile'
import { savedControllerWrapperOutcome, type ControllerPushRecords } from './controllerPushRecord'
import { controllerSliderValue } from './controllerPanelView'
import { PATTERN_WRAPPER_CONTROLS } from './slowMo'
import { formatPercentageValue } from './percentageValue'
import type { PanelReadout } from './previewPanel'

export const CONTROLLER_PANEL_WRAPPER_LABELS: Record<ControllerWrapperType, string> = {
  'slow-mo': 'Slow-mo',
  dreamy: 'Dreamy',
}

export type ControllerPanelWrapperRow = {
  type: ControllerWrapperType
  label: string
  /** The reserved native export the slider writes. */
  exportName: string
} & (
  | { input: { name: string }; value?: never }
  /** The reported 0..1 position, or `null` while no usable value is known. */
  | { input?: never; value: number | null }
)

export type ControllerPanelWrapperGroup =
  | { kind: 'absent' }
  | { kind: 'show-line'; text: string }
  | { kind: 'rows'; rows: ControllerPanelWrapperRow[] }

/** What the active program is, as far as the saved bindings can tell. */
export type ControllerPanelWrapperSource = 'pattern' | 'show' | 'unknown'

export interface ControllerPanelWrapperEvidence {
  sourceKind: ControllerPanelWrapperSource
  /** The confirmed outcome for exactly this program ID; absent when unknown. */
  outcome?: ControllerWrapperOutcome
}

/** Resolve the active program's binding and confirmed Wrapper outcome. `bindings`
 *  is `null` until read; an unbound (foreign) program is `unknown`. */
export function resolveControllerPanelWrapperEvidence(input: {
  controllerId: string | null
  activeProgramId: string | undefined
  bindings: BindingStore | null
  pushRecords: ControllerPushRecords | null
}): ControllerPanelWrapperEvidence {
  const { controllerId, activeProgramId, bindings } = input
  if (!controllerId || !activeProgramId || !bindings) return { sourceKind: 'unknown' }
  const bindingKey = Object.entries(bindings[controllerId] ?? {})
    .find(([, programId]) => programId === activeProgramId)?.[0]
  if (!bindingKey) return { sourceKind: 'unknown' }
  if (bindingKey.startsWith('show:')) return { sourceKind: 'show' }
  const outcome = savedControllerWrapperOutcome(
    input.pushRecords?.[controllerId]?.[bindingKey],
    activeProgramId,
  )
  return outcome ? { sourceKind: 'pattern', outcome } : { sourceKind: 'pattern' }
}

/** "Slow-mo and Dreamy are off for Shows.", naming only the Wrappers that are on. */
export function controllerPanelShowWrapperLine(
  enabled: readonly ControllerWrapperType[],
): string | null {
  const names = CONTROLLER_WRAPPER_TYPES
    .filter((type) => enabled.includes(type))
    .map((type) => CONTROLLER_PANEL_WRAPPER_LABELS[type])
  if (!names.length) return null
  return `${names.join(' and ')} ${names.length > 1 ? 'are' : 'is'} off for Shows.`
}

function wrapperRowValue(raw: unknown): number | null {
  return typeof raw === 'number' ? controllerSliderValue(raw) : null
}

/** Split the reported controls into the Wrappers group and the Pattern's own
 *  Controls. Membership is the saved applied record when known; otherwise the
 *  reported reserved exports. A memory refusal follows the Control-name check,
 *  so a reported value for that skipped export is leftover state. A name clash,
 *  a structural refusal, or an unevaluated Wrapper leaves the reported name in
 *  the Pattern's own Controls. Show Controls stay together, with the Show line
 *  while a Wrapper is on. */
export function deriveControllerPanelWrappers(input: {
  reported: Readonly<Record<string, unknown>>
  evidence: ControllerPanelWrapperEvidence
  /** Names in the current profile, matched to saved evidence by input ID. */
  inputs?: readonly Pick<ControllerInput, 'id' | 'name'>[]
  /** Wrappers on in the Controller's profile, ignoring the Show exception. */
  enabled: readonly ControllerWrapperType[]
}): { group: ControllerPanelWrapperGroup; ownReported: Record<string, number> } {
  const { reported, evidence } = input
  const own = (omit: ReadonlySet<string>) => {
    const out: Record<string, number> = {}
    for (const [name, value] of Object.entries(reported)) {
      if (!omit.has(name)) out[name] = value as number
    }
    return out
  }

  if (evidence.sourceKind === 'show') {
    const text = controllerPanelShowWrapperLine(input.enabled)
    return { group: text ? { kind: 'show-line', text } : { kind: 'absent' }, ownReported: own(new Set()) }
  }

  const has = (name: string) => Object.prototype.hasOwnProperty.call(reported, name)
  const outcome = evidence.outcome
  const members = CONTROLLER_WRAPPER_TYPES.filter((type) =>
    outcome ? outcome.applied.includes(type) : has(PATTERN_WRAPPER_CONTROLS[type].exportName),
  )
  const omitted = new Set<string>()
  for (const type of CONTROLLER_WRAPPER_TYPES) {
    const exportName = PATTERN_WRAPPER_CONTROLS[type].exportName
    const skip = outcome?.skipped[type]
    if (members.includes(type) || skip?.reason === 'array-budget') omitted.add(exportName)
  }
  const rows = members.map((type): ControllerPanelWrapperRow => {
    const exportName = PATTERN_WRAPPER_CONTROLS[type].exportName
    const row = { type, label: CONTROLLER_PANEL_WRAPPER_LABELS[type], exportName }
    const bound = outcome?.inputs?.[type]
    if (!bound) return { ...row, value: wrapperRowValue(reported[exportName]) }
    const name = input.inputs?.find(({ id }) => id === bound.inputId)?.name ?? bound.name
    return { ...row, input: { name } }
  })
  return {
    group: rows.length ? { kind: 'rows', rows } : { kind: 'absent' },
    ownReported: own(omitted),
  }
}

/** Add Wrapper values the Controller reports for the same program after the seed.
 *  An unset Wrapper slider remains indeterminate until a usable value arrives.
 *  Usable local values stay slider-owned. Other newly reported names keep the
 *  seed-only behaviour. Returns `local` itself when nothing changes. */
export function adoptReportedWrapperValues(
  local: Record<string, number>,
  reported: Readonly<Record<string, number>> | undefined,
): Record<string, number> {
  if (!reported) return local
  let next = local
  for (const type of CONTROLLER_WRAPPER_TYPES) {
    const exportName = PATTERN_WRAPPER_CONTROLS[type].exportName
    if (!(exportName in reported)) continue
    const incoming = reported[exportName]
    if (exportName in local && (wrapperRowValue(local[exportName]) !== null || wrapperRowValue(incoming) === null)) continue
    if (next === local) next = { ...local }
    next[exportName] = incoming
  }
  return next
}

/** The folded Wrappers section's readout, matching the Controls readout. */
export function describeControllerWrappersReadout(rows: readonly ControllerPanelWrapperRow[]): PanelReadout[] {
  return rows.map((row) => ({
    label: row.label.toLowerCase(),
    value: row.input ? row.input.name : row.value === null ? '—' : formatPercentageValue(row.value, 0.01),
    live: !row.input,
  }))
}
