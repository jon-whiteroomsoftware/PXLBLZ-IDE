// The prepared v2 Show command registry: one typed data table over the pure v2
// engine owners. Every entry carries a stable snake_case name, a description, the
// ShowRecordV2 JSON-pointer patterns it may write, a fully typed input schema and
// an apply that calls an owner. Nothing here imports React or a store, and no
// entry reimplements a domain rule.
//
// Catalogue rules (issue #1041) that this module and its census enforce:
//  1. Identity addressing only; no index, Scene or time-lookup addressing.
//  2. Global integer milliseconds with half-open intervals and checked addition.
//  3. A closed verb vocabulary.
//  4. A uniform no-op: an already-satisfied valid request returns `unchanged`
//     with zero changes. It never refuses and never aborts a batch.
//  5. Fully typed inputs: no `json` field kind, enums for closed sets, bounds in
//     the schema, `null` only where clearing is documented, bulk arrays 1–128.
//  6. One affected-entity result vocabulary, identical to the manual owner.
//  7. Refusal codes reuse a v1 code only where its meaning is unchanged.
//  8. A `tools/list` size budget.
//  9. One read representation: the v2 record.
// 10. A singular command is the bulk schema fragment of one.
//
// This catalogue is prepared, not activated. Production MCP keeps the v1
// registry until the coordinated cutover in #1039.
import type { ShowRecordV2 } from '../showCompositionV2'
import type { ShowPatternRef } from '../personalContentRecords'
import type { ResolvedShowPatternReplacementV2 } from '../showClipsV2'
import { validateShowEasing } from '../showEasing'

/**
 * Trusted dependency metadata for the commands that need a resolved Pattern
 * source. It comes from the caller's captured bundle boundary, never from
 * command arguments (specification section 6). A command that needs a resolver
 * and is given none refuses with `missing-dependency`.
 */
export interface ShowCommandV2Context {
  resolvePattern?: (reference: ShowPatternRef) =>
    | { status: 'ready'; replacement: ResolvedShowPatternReplacementV2 }
    | { status: 'refused'; message: string }
}

/** A typed reason a command was refused. A refusal is never silent. */
export interface ShowCommandV2Issue {
  code: string
  message: string
  /** JSONPath into the command input when the refusal belongs to one field. */
  path?: string
  /** What the caller can do instead, where one exists. */
  remedy?: string
  /** Nearest known identities when an id failed to resolve. */
  candidates?: string[]
}

/**
 * The one affected-entity vocabulary every changed command reports, matching the
 * manual owner's collections exactly (specification section 9). Requested scope
 * is the command input; affected scope is this.
 */
export interface ShowCommandV2Affected {
  clips: string[]
  instances: string[]
  transitions: string[]
  tracks: string[]
  layoutDefinitions: string[]
  layoutIntervals: string[]
  groupDefinitions: string[]
  groupOccurrences: string[]
  layers: string[]
  markers: string[]
  appearanceKeys: string[]
  propertyKeys: string[]
  removed: string[]
  discardedControlTargets: Array<{ instanceId: string; exportName: string }>
}

export function emptyShowCommandV2Affected(): ShowCommandV2Affected {
  return {
    clips: [], instances: [], transitions: [], tracks: [],
    layoutDefinitions: [], layoutIntervals: [], groupDefinitions: [], groupOccurrences: [],
    layers: [], markers: [], appearanceKeys: [], propertyKeys: [],
    removed: [], discardedControlTargets: [],
  }
}

/** The fourteen affected collection names, in report order. */
export const SHOW_COMMAND_V2_AFFECTED_COLLECTIONS = Object.keys(
  emptyShowCommandV2Affected(),
) as ReadonlyArray<keyof ShowCommandV2Affected>

export function mergeShowCommandV2Affected(
  ...parts: ReadonlyArray<Partial<ShowCommandV2Affected>>
): ShowCommandV2Affected {
  const result = emptyShowCommandV2Affected()
  for (const part of parts) {
    for (const key of SHOW_COMMAND_V2_AFFECTED_COLLECTIONS) {
      const value = part[key]
      if (!value) continue
      if (key === 'discardedControlTargets') {
        const targets = result.discardedControlTargets
        for (const target of value as ShowCommandV2Affected['discardedControlTargets']) {
          if (!targets.some(existing => existing.instanceId === target.instanceId && existing.exportName === target.exportName)) {
            targets.push({ instanceId: target.instanceId, exportName: target.exportName })
          }
        }
      } else {
        const ids = result[key] as string[]
        for (const id of value as string[]) if (!ids.includes(id)) ids.push(id)
      }
    }
  }
  for (const key of SHOW_COMMAND_V2_AFFECTED_COLLECTIONS) {
    if (key !== 'discardedControlTargets') (result[key] as string[]).sort()
  }
  result.discardedControlTargets.sort((left, right) => (
    left.instanceId.localeCompare(right.instanceId) || left.exportName.localeCompare(right.exportName)
  ))
  return result
}

/** One entry of the structured change list an accepted command returns. */
export interface ShowCommandV2Change {
  command: string
  targetId?: string
  description: string
  details: ShowCommandV2Affected
}

export type ShowCommandV2Outcome =
  | { status: 'changed'; record: ShowRecordV2; changes: ShowCommandV2Change[] }
  | { status: 'unchanged'; record: ShowRecordV2; changes: [] }
  | { status: 'refused'; record: ShowRecordV2; issues: ShowCommandV2Issue[] }

interface ShowCommandV2FieldBase {
  description: string
  optional?: boolean
  /** May the value be null? Only where the field documents clearing. */
  nullable?: boolean
  /** Domain-specific code when this field's primitive validation fails. */
  issueCode?: string
}

/**
 * Dependency-free input schema. There is deliberately no `json` kind: every
 * production descriptor field is structurally typed so a tool caller can be
 * told what is accepted before it calls.
 */
export type ShowCommandV2Field = ShowCommandV2FieldBase & (
  | { kind: 'string'; enum?: readonly string[]; maxLength?: number }
  | { kind: 'number'; minimum?: number; maximum?: number }
  | { kind: 'integer'; minimum?: number; maximum?: number }
  | { kind: 'boolean' }
  | { kind: 'easing' }
  | { kind: 'object'; properties: Record<string, ShowCommandV2Field>; atLeastOne?: readonly string[] }
  | { kind: 'array'; items: ShowCommandV2Field; minItems: number; maxItems: number }
  | { kind: 'record'; values: ShowCommandV2Field }
  | { kind: 'union'; variants: readonly ShowCommandV2Field[] }
)

export interface ShowCommandV2Descriptor {
  /** Stable snake_case name; renaming is a breaking change. */
  name: string
  /** The catalogue family, used by the census and the coverage report. */
  family: string
  /** One paragraph for a human or tool choosing commands. */
  description: string
  /** ShowRecordV2 JSON-pointer patterns this command may write; '*' matches one segment. */
  touches: string[]
  fields: Record<string, ShowCommandV2Field>
  exactlyOne?: readonly string[]
  atLeastOne?: readonly string[]
  atMostOne?: readonly string[]
  apply: (record: ShowRecordV2, input: Record<string, unknown>, context?: ShowCommandV2Context) => ShowCommandV2Outcome
}

export function refuseShowCommandV2(record: ShowRecordV2, ...issues: ShowCommandV2Issue[]): ShowCommandV2Outcome {
  return { status: 'refused', record, issues }
}

export function unchangedShowCommandV2(record: ShowRecordV2): ShowCommandV2Outcome {
  return { status: 'unchanged', record, changes: [] }
}

export function changedShowCommandV2(
  record: ShowRecordV2,
  command: string,
  description: string,
  details: ShowCommandV2Affected,
  targetId?: string,
): ShowCommandV2Outcome {
  return {
    status: 'changed',
    record,
    changes: [{ command, description, details, ...(targetId ? { targetId } : {}) }],
  }
}

const EASING_PRESETS = ['linear', 'ease-in', 'ease-out', 'ease-in-out'] as const

function invalid(field: ShowCommandV2Field, path: string, expected: string): ShowCommandV2Issue[] {
  return [{
    code: field.issueCode ?? 'invalid-argument',
    path,
    message: `${path} must be ${expected}${field.nullable ? ' or null' : ''}.`,
  }]
}

function validateField(field: ShowCommandV2Field, value: unknown, path: string): ShowCommandV2Issue[] {
  if (value === null) {
    return field.nullable ? [] : [{ code: 'invalid-argument', path, message: `${path} may not be null.` }]
  }
  switch (field.kind) {
    case 'string':
      return typeof value === 'string'
        && (!field.enum || field.enum.includes(value))
        && (field.maxLength === undefined || value.length <= field.maxLength)
        ? [] : invalid(field, path, field.enum ? `one of ${field.enum.join(', ')}` : 'a string')
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        && (field.minimum === undefined || value >= field.minimum)
        && (field.maximum === undefined || value <= field.maximum)
        ? [] : invalid(field, path, 'a finite number inside the documented range')
    case 'integer':
      return typeof value === 'number' && Number.isSafeInteger(value)
        && (field.minimum === undefined || value >= field.minimum)
        && (field.maximum === undefined || value <= field.maximum)
        ? [] : invalid(field, path, 'a safe integer inside the documented range')
    case 'boolean':
      return typeof value === 'boolean' ? [] : invalid(field, path, 'a boolean')
    case 'easing':
      return (typeof value === 'string'
        ? (EASING_PRESETS as readonly string[]).includes(value)
        : validateShowEasing(value).valid)
        ? [] : invalid(field, path, 'a supported easing preset or structured curve')
    case 'union': {
      if (isObject(value)) {
        const discriminator = value.kind ?? value.curve
        const variant = field.variants.find(candidate => candidate.kind === 'object'
          && ((candidate.properties.kind?.kind === 'string' && candidate.properties.kind.enum?.includes(discriminator as string))
            || (candidate.properties.curve?.kind === 'string' && candidate.properties.curve.enum?.includes(discriminator as string))))
        if (variant) return validateField(variant, value, path)
      }
      if (field.variants.some(variant => validateField(variant, value, path).length === 0)) return []
      return invalid(field, path, 'one of the documented alternatives')
    }
    case 'array': {
      if (!Array.isArray(value)) return invalid(field, path, 'an array')
      if (value.length < field.minItems) {
        return [{
          code: field.minItems === 1 ? 'empty-collection' : 'invalid-argument',
          path,
          message: `${path} requires at least ${field.minItems} item${field.minItems === 1 ? '' : 's'}.`,
        }]
      }
      if (value.length > field.maxItems) {
        return [{ code: 'batch-too-large', path, message: `${path} accepts at most ${field.maxItems} items.` }]
      }
      return value.flatMap((item, index) => validateField(field.items, item, `${path}[${index}]`))
    }
    case 'record': {
      if (!isObject(value)) return invalid(field, path, 'an object')
      return Object.entries(value).flatMap(([key, item]) => validateField(field.values, item, `${path}[${JSON.stringify(key)}]`))
    }
    case 'object': {
      if (!isObject(value)) return invalid(field, path, 'an object')
      const issues: ShowCommandV2Issue[] = []
      for (const [name, property] of Object.entries(field.properties)) {
        if (value[name] === undefined) {
          if (!property.optional) {
            issues.push({ code: 'invalid-argument', path: `${path}.${name}`, message: `${path}.${name} is required (${property.description}).` })
          }
        } else issues.push(...validateField(property, value[name], `${path}.${name}`))
      }
      for (const name of Object.keys(value)) {
        if (!Object.prototype.hasOwnProperty.call(field.properties, name)) {
          issues.push({ code: 'unknown-field', path: `${path}.${name}`, message: `${path} has no field named "${name}".` })
        }
      }
      if (field.atLeastOne && field.atLeastOne.every(name => value[name] === undefined)) {
        issues.push({ code: 'empty-patch', path, message: `${path} must set at least one of ${field.atLeastOne.join(', ')}.` })
      }
      return issues
    }
  }
}

export function validateShowCommandV2Input(
  descriptor: ShowCommandV2Descriptor,
  input: Record<string, unknown>,
): ShowCommandV2Issue[] {
  const issues: ShowCommandV2Issue[] = []
  if (descriptor.exactlyOne && descriptor.exactlyOne.filter(name => input[name] !== undefined).length !== 1) {
    issues.push({ code: 'invalid-argument', message: `${descriptor.name}: give exactly one of ${descriptor.exactlyOne.join(' or ')}.` })
  }
  if (descriptor.atLeastOne && descriptor.atLeastOne.every(name => input[name] === undefined)) {
    issues.push({ code: 'invalid-argument', message: `${descriptor.name}: give at least one of ${descriptor.atLeastOne.join(', ')}.` })
  }
  if (descriptor.atMostOne && descriptor.atMostOne.filter(name => input[name] !== undefined).length > 1) {
    issues.push({ code: 'invalid-argument', message: `${descriptor.name}: give at most one of ${descriptor.atMostOne.join(' or ')}.` })
  }
  for (const [name, field] of Object.entries(descriptor.fields)) {
    const value = input[name]
    if (value === undefined) {
      if (!field.optional) {
        issues.push({ code: 'invalid-argument', message: `${descriptor.name}: required field "${name}" is missing (${field.description}).` })
      }
      continue
    }
    issues.push(...validateField(field, value, `$.${name}`))
  }
  for (const name of Object.keys(input)) {
    if (!Object.prototype.hasOwnProperty.call(descriptor.fields, name)) {
      issues.push({
        code: 'invalid-argument',
        message: `${descriptor.name}: unknown field "${name}". Fields: ${Object.keys(descriptor.fields).join(', ')}.`,
      })
    }
  }
  return issues
}

export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Family modules import only the types and helpers above.
import { SHOW_V2_ANIMATION_COMMANDS } from './animation'
import { SHOW_V2_CLIP_COMMANDS } from './clips'
import { SHOW_V2_EFFECT_COMMANDS } from './effects'
import { SHOW_V2_GROUP_COMMANDS } from './groups'
import { SHOW_V2_LAYER_COMMANDS } from './layers'
import { SHOW_V2_LAYOUT_COMMANDS } from './layouts'
import { SHOW_V2_MARKER_COMMANDS } from './markers'
import { SHOW_V2_SHOW_COMMANDS } from './show'
import { SHOW_V2_TRANSITION_COMMANDS } from './transitions'

export const SHOW_COMMANDS_V2: ShowCommandV2Descriptor[] = [
  ...SHOW_V2_SHOW_COMMANDS,
  ...SHOW_V2_LAYER_COMMANDS,
  ...SHOW_V2_CLIP_COMMANDS,
  ...SHOW_V2_TRANSITION_COMMANDS,
  ...SHOW_V2_LAYOUT_COMMANDS,
  ...SHOW_V2_MARKER_COMMANDS,
  ...SHOW_V2_EFFECT_COMMANDS,
  ...SHOW_V2_ANIMATION_COMMANDS,
  ...SHOW_V2_GROUP_COMMANDS,
]

const commandByName = new Map(SHOW_COMMANDS_V2.map(command => [command.name, command]))

/** Apply one registry command; input is validated against the entry's schema first. */
export function applyShowCommandV2(
  record: ShowRecordV2,
  name: string,
  input: Record<string, unknown> = {},
  context?: ShowCommandV2Context,
): ShowCommandV2Outcome {
  const descriptor = commandByName.get(name)
  if (!descriptor) {
    return refuseShowCommandV2(record, {
      code: 'unknown-command',
      message: `No Show command is named "${name}".`,
      candidates: SHOW_COMMANDS_V2.map(command => command.name),
    })
  }
  const issues = validateShowCommandV2Input(descriptor, input)
  if (issues.length > 0) return { status: 'refused', record, issues }
  return descriptor.apply(record, input, context)
}

/**
 * Fold a list of commands over one Show, all-or-nothing. A no-op step contributes
 * no change and never aborts the batch; a refusal reports which step refused and
 * leaves the caller's record untouched.
 */
export function runShowCommandV2Transaction(
  record: ShowRecordV2,
  commands: ReadonlyArray<{ name: string; input?: Record<string, unknown> }>,
  context?: ShowCommandV2Context,
):
  | { status: 'changed' | 'unchanged'; record: ShowRecordV2; changes: ShowCommandV2Change[] }
  | { status: 'refused'; record: ShowRecordV2; step: number; issues: ShowCommandV2Issue[] } {
  let current = record
  const changes: ShowCommandV2Change[] = []
  for (const [step, command] of commands.entries()) {
    const outcome = applyShowCommandV2(current, command.name, command.input ?? {}, context)
    if (outcome.status === 'refused') return { status: 'refused', record, step, issues: outcome.issues }
    current = outcome.record
    changes.push(...outcome.changes)
  }
  return { status: changes.length > 0 ? 'changed' : 'unchanged', record: current, changes }
}
