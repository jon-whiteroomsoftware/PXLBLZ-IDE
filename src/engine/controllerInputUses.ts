import {
  analogPinsForBoard,
  validateControllerProfile,
  type ControllerInput,
  type ControllerProfile,
  type ControllerProfileValidationIssue,
  type PatternBinding,
} from './controllerProfile'
import { controllerProfileArtifactSignature } from './controllerProfilePassRecipe'
import type { ControllerPushRecord } from './controllerPushRecord'
import type { MapDimension } from './renderCompatibility'

/** Whether a configured use would emit code for the profile as it stands.
 * This is a pure statement about configuration, never about live hardware. */
export type ControllerInputUseState = 'live' | 'blocked'

/** Level 2: whether the Pattern on the Controller was built from this profile.
 * It is a (Controller, Pattern) fact and is therefore reported per Pattern.
 * `unknown` is the absence of a claim, not a claim about the Pattern. */
export type ControllerPatternPushState = 'current' | 'stale' | 'not-pushed' | 'unknown'

/** The push-record metadata behind a Level 2 comparison. `read` carries what a
 * completed read found, and an empty record set is then real evidence that
 * nothing was pushed. `unknown` covers a read still in flight and a read that
 * failed: neither says anything about the Controller (#772). */
export type ControllerPushRecordsRead =
  | { status: 'unknown' }
  | { status: 'read'; records: Record<string, ControllerPushRecord> }

/** A use sentence split so the component can set identifiers in mono and the
 * surrounding prose in sans. */
export interface ControllerUseDetail {
  lead: string
  code: string
  trail?: string
}

export interface ControllerBrightnessUse {
  kind: 'brightness'
  label: 'Brightness'
  /** 'every Pattern', or 'every Pattern except Caustics' when a Pattern use on
   * this same input takes precedence while that Pattern runs. */
  scope: string
  exceptPatternLabels: string[]
  state: ControllerInputUseState
}

export interface ControllerPatternUse {
  kind: 'pattern'
  bindingId: string
  patternId: string
  label: string
  /** True when no name is known for the stored Pattern id. */
  patternUnknown: boolean
  detail: ControllerUseDetail
  overridesBrightness: boolean
  state: ControllerInputUseState
  push: ControllerPatternPushState | null
}

export interface ControllerNoUse {
  kind: 'none'
  label: 'Nothing yet'
  detail: 'no Pattern reads it yet'
}

export type ControllerInputUse = ControllerBrightnessUse | ControllerPatternUse | ControllerNoUse

/** A one-click repair for an input-scoped validation error, expressed as the
 * input change to apply. */
export interface ControllerInputCorrection {
  label: string
  change: Partial<ControllerInput>
}

export interface ControllerInputIssue {
  path: string
  message: string
  correction: ControllerInputCorrection | null
}

export interface ControllerInputPresentation {
  inputId: string
  /** 'IO33' — the machine anchor for the card. */
  pin: string
  /** Terse physical facts, already formatted: signal, smoothing, fallback, direction. */
  physical: string[]
  brightnessAssigned: boolean
  uses: ControllerInputUse[]
  issues: ControllerInputIssue[]
  state: 'live' | 'idle' | 'error'
}

export interface ControllerInputUsesView {
  inputs: ControllerInputPresentation[]
  /** Validation errors that do not belong to one input; the page banner owns these. */
  profileIssues: ControllerProfileValidationIssue[]
}

export interface DescribeControllerInputUsesOptions {
  /** Display names for bound Pattern ids. Missing ids fall back to the id. */
  patternNames?: Record<string, string>
  /** Level 2 states, keyed by Pattern id. Absent means "say nothing". */
  patternPushStates?: Record<string, ControllerPatternPushState>
}

export function controllerUseDetailText(detail: ControllerUseDetail): string {
  return [detail.lead, detail.code, detail.trail].filter(Boolean).join(' ')
}

export function describeControllerInputUses(
  profile: ControllerProfile,
  options: DescribeControllerInputUsesOptions = {},
): ControllerInputUsesView {
  const issuesByInput = new Map<string, ControllerInputIssue[]>()
  const profileIssues: ControllerProfileValidationIssue[] = []
  for (const issue of validateControllerProfile(profile).errors) {
    const inputId = inputIdForPath(issue.path, profile)
    if (!inputId) {
      profileIssues.push(issue)
      continue
    }
    const bucket = issuesByInput.get(inputId) ?? []
    bucket.push({ ...issue, correction: correctionFor(issue.path, profile, inputId) })
    issuesByInput.set(inputId, bucket)
  }

  const brightness = profile.globalTransforms.find(
    (transform) => transform.type === 'hardware-brightness' && transform.enabled,
  )
  const brightnessInputId = brightness && brightness.type === 'hardware-brightness'
    ? brightness.inputId
    : null

  const inputs = profile.inputs.map((input) => {
    const issues = issuesByInput.get(input.id) ?? []
    const bindings = profile.patternBindings.filter((binding) => binding.inputId === input.id)
    const brightnessAssigned = brightnessInputId === input.id
    const uses: ControllerInputUse[] = []

    if (brightnessAssigned) {
      const exceptPatternLabels = distinct(
        bindings.map((binding) => patternLabel(binding.patternId, options.patternNames)),
      )
      uses.push({
        kind: 'brightness',
        label: 'Brightness',
        scope: brightnessScope(exceptPatternLabels),
        exceptPatternLabels,
        state: input.signal === 'analog' ? 'live' : 'blocked',
      })
    }

    for (const binding of bindings) {
      const label = patternLabel(binding.patternId, options.patternNames)
      uses.push({
        kind: 'pattern',
        bindingId: binding.id,
        patternId: binding.patternId,
        label,
        patternUnknown: label === binding.patternId,
        detail: describeBindingTarget(binding),
        overridesBrightness: brightnessAssigned,
        state: 'live',
        push: options.patternPushStates?.[binding.patternId] ?? null,
      })
    }

    if (uses.length === 0) {
      uses.push({ kind: 'none', label: 'Nothing yet', detail: 'no Pattern reads it yet' })
    }

    return {
      inputId: input.id,
      pin: `IO${input.pin}`,
      physical: describePhysicalInput(input),
      brightnessAssigned,
      uses,
      issues,
      state: inputState(uses, issues),
    }
  })

  return { inputs, profileIssues }
}

/** Compare each Pattern's saved artifact against the code this profile would
 * generate now. `mapDim` comes from the live Controller, so an offline page
 * reports nothing rather than guessing from `lastKnownMapDim`. */
export function controllerPatternPushStates(args: {
  profile: ControllerProfile
  patternIds: readonly string[]
  pushRecords: ControllerPushRecordsRead
  mapDim: MapDimension | null
  live: boolean
}): Record<string, ControllerPatternPushState> {
  if (!args.live) return {}
  const states: Record<string, ControllerPatternPushState> = {}
  for (const patternId of distinct(args.patternIds)) {
    if (args.pushRecords.status === 'unknown') {
      states[patternId] = 'unknown'
      continue
    }
    const record = args.pushRecords.records[patternId]
    if (!record) {
      states[patternId] = 'not-pushed'
      continue
    }
    const signature = controllerProfileArtifactSignature(args.profile, patternId, {
      mapDim: args.mapDim,
    })
    states[patternId] = record.profileSignature === signature ? 'current' : 'stale'
  }
  return states
}

export function describePhysicalInput(input: ControllerInput): string[] {
  return [
    input.signal,
    `smooth ${formatPercent(input.smoothing)}`,
    `fallback ${formatPercent(input.fallback)}`,
    input.invert ? '1 -> 0' : '0 -> 1',
  ]
}

function describeBindingTarget(binding: PatternBinding): ControllerUseDetail {
  const target = binding.target
  if (target.kind === 'call-exported-slider') {
    return { lead: 'drives exported slider', code: target.name }
  }
  if (target.kind === 'call-function') {
    return { lead: 'calls', code: `${target.name}()` }
  }
  const range = `over ${formatNumber(target.min)} to ${formatNumber(target.max)}`
  return {
    lead: 'assigns',
    code: target.name,
    trail: target.quantize ? `${range} in steps of ${formatNumber(target.quantize)}` : range,
  }
}

function brightnessScope(exceptPatternLabels: string[]): string {
  if (exceptPatternLabels.length === 0) return 'every Pattern'
  return `every Pattern except ${formatList(exceptPatternLabels)}`
}

function inputState(
  uses: ControllerInputUse[],
  issues: ControllerInputIssue[],
): ControllerInputPresentation['state'] {
  if (issues.length > 0) return 'error'
  return uses.some((use) => use.kind !== 'none' && use.state === 'live') ? 'live' : 'idle'
}

function inputIdForPath(path: string, profile: ControllerProfile): string | null {
  const match = /^inputs\.(.+)\.[^.]+$/.exec(path)
  if (!match) return null
  const inputId = match[1]
  return profile.inputs.some((input) => input.id === inputId) ? inputId : null
}

/** A correction has to satisfy every validation rule at once, not just the one
 * it is offered against: the persistence gate refuses a profile that still holds
 * a record issue, so a partial repair is optimistically applied and then rolled
 * straight back. When no change can satisfy them all, offer none (#772). */
function correctionFor(
  path: string,
  profile: ControllerProfile,
  inputId: string,
): ControllerInputCorrection | null {
  const input = profile.inputs.find((candidate) => candidate.id === inputId)
  if (!input) return null

  if (path === `inputs.${inputId}.signal`) {
    if (analogPinsForBoard(profile.board).includes(input.pin)) {
      return { label: 'Switch this input to analog', change: { signal: 'analog' } }
    }
    // The pin cannot be read as analog either, so the signal alone is not a
    // repair. Move the input in the same change and say so on the button.
    const pin = firstFreeAnalogPin(profile, inputId)
    return pin == null ? null : { label: `Switch to analog on IO${pin}`, change: { signal: 'analog', pin } }
  }
  if (path === `inputs.${inputId}.pin`) {
    const pin = firstFreeAnalogPin(profile, inputId)
    return pin == null ? null : { label: `Move to IO${pin}`, change: { pin } }
  }
  return null
}

/** An analog pin this board can read that no other input already holds. Taking
 * an occupied pin would silently put two inputs on one wire, so a board with
 * nothing free reports none and the caller offers no repair. */
function firstFreeAnalogPin(profile: ControllerProfile, inputId: string): number | null {
  const taken = new Set(
    profile.inputs.filter((input) => input.id !== inputId).map((input) => input.pin),
  )
  return analogPinsForBoard(profile.board).find((pin) => !taken.has(pin)) ?? null
}

function patternLabel(patternId: string, names: Record<string, string> | undefined): string {
  const name = names?.[patternId]?.trim()
  return name ? name : patternId
}

function distinct(values: readonly string[]): string[] {
  return [...new Set(values)]
}

function formatList(values: string[]): string {
  if (values.length <= 1) return values.join('')
  if (values.length === 2) return `${values[0]} and ${values[1]}`
  return `${values.slice(0, -1).join(', ')}, and ${values[values.length - 1]}`
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)}%`
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)))
}
