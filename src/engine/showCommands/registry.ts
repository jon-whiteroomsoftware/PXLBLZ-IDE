import { validateShowEasing } from '../showEasing'
// The Show command registry: one typed data table over the pure Show
// mutations. Each entry carries a stable name, a one-paragraph description,
// an input schema, the ShowRecord JSON-pointer patterns it may write, and an
// apply that calls the existing pure engine function at the global-time
// layer. Nothing here imports React or a store; the registry is data over
// functions, which is what makes a command palette, keyboard customization,
// scripting, and table-driven tests possible over the whole mutation
// surface.
//
// Contract: apply never mutates its arguments; a refusal is typed and leaves
// the record untouched; an engine identity refusal (input returned
// unchanged) is a refusal unless the command independently validates a no-op; commands
// backed by a plan* function run the plan first and pass its user-legible
// reason through.
import type { ShowAuthoringContext } from '../showAuthoringValidation'
import type { ShowCompositionV1, ShowRecord } from '../personalContentRecords'
export type ShowCommandContext = Pick<ShowAuthoringContext, 'source' | 'libraries'>

/** A typed reason a command was refused. A refusal is never silent. */
export interface ShowCommandIssue {
  code: string
  message: string
  /** JSONPath into the command input when the refusal belongs to one field. */
  path?: string
  /** What the caller can do instead, where one exists. */
  remedy?: string
  /** Nearest known ids when an id failed to resolve. */
  candidates?: string[]
  availableRange?: { startMs: number; endMs: number }
}

/** One entry of the structured change list an accepted command returns. */
export interface ShowCommandChange {
  command: string
  targetId?: string
  description: string
  before?: unknown
  after?: unknown
  details?: Record<string, unknown>
}

export type ShowCommandOutcome =
  | { ok: true; record: ShowRecord; changes: ShowCommandChange[] }
  | { ok: false; issues: ShowCommandIssue[] }

/** Dependency-free input schema: enough for palettes and validation. */
interface ShowCommandFieldBase {
  description: string
  optional?: boolean
  /** May the value be null (distinct from omitted)? */
  nullable?: boolean
  /** Domain-specific code when this field's primitive validation fails. */
  issueCode?: string
}

export type ShowCommandField = ShowCommandFieldBase & (
  | { kind: 'string'; enum?: readonly string[] }
  | { kind: 'number'; minimum?: number; maximum?: number }
  | { kind: 'integer'; safeInteger?: boolean; minimum?: number; maximum?: number }
  | { kind: 'boolean' | 'json' | 'layer' | 'easing' }
  | { kind: 'object'; properties: Record<string, ShowCommandField>; allowEmpty?: boolean }
  | { kind: 'array'; items: ShowCommandField; minItems?: number; maxItems?: number }
  | { kind: 'record'; values: ShowCommandField }
  | { kind: 'union'; variants: readonly ShowCommandField[] }
) & {
  /** Legacy scalar aliases kept here for structural compatibility. */
  safeInteger?: boolean
  minimum?: number
  maximum?: number
  enum?: readonly string[]
}

export interface ShowCommandDescriptor {
  /** Stable snake_case name; renaming is a breaking change. */
  name: string
  /** One paragraph for a human or tool choosing commands. */
  description: string
  /** ShowRecord JSON-pointer patterns this command may write; '*' matches one segment. */
  touches: string[]
  fields: Record<string, ShowCommandField>
  exactlyOne?: readonly string[]
  atLeastOne?: readonly string[]
  atMostOne?: readonly string[]
  /** Independent semantic issues that can be collected alongside shape errors. */
  preflight?: (record: ShowRecord, input: Record<string, unknown>, context?: ShowCommandContext) => ShowCommandIssue[]
  apply: (record: ShowRecord, input: Record<string, unknown>, context?: ShowCommandContext) => ShowCommandOutcome
}

export type ShowCommandRefusal = Extract<ShowCommandOutcome, { ok: false }>

export function refuseShowCommand(...issues: ShowCommandIssue[]): ShowCommandRefusal {
  return { ok: false, issues }
}

/** The composition every registered command edits through; refusal when absent. */
export function commandComposition(
  record: ShowRecord,
): { ok: true; composition: ShowCompositionV1 } | { ok: false; issues: ShowCommandIssue[] } {
  if (!record.composition) {
    return refuseShowCommand({
      code: 'missing-composition',
      message: 'This Show has no composition; open it in the editor once to normalize it.',
    })
  }
  return { ok: true, composition: record.composition }
}

export function withComposition(record: ShowRecord, composition: ShowCompositionV1): ShowRecord {
  // The deterministic-loop proof binds to the authored cast: any command
  // that added or removed a Pattern instance forfeits the stamp, the same
  // way the extending-add engine path does.
  const castBefore = new Set((record.composition?.patternInstances ?? []).map((instance) => instance.id))
  const castAfter = composition.patternInstances.map((instance) => instance.id)
  const castChanged = castAfter.length !== castBefore.size
    || castAfter.some((id) => !castBefore.has(id))
  let next = composition
  if (castChanged && composition.executionModel !== undefined) {
    next = { ...composition }
    delete next.executionModel
  }
  // Monotonic even when a prior rapid edit stamped updatedAt ahead of the
  // clock; the store's durable rollback baseline relies on this.
  return { ...record, composition: next, updatedAt: Math.max(Date.now(), record.updatedAt + 1) }
}

function validateField(field: ShowCommandField, value: unknown, path: string): ShowCommandIssue[] {
  if (value === null) return field.nullable
    ? []
    : [{ code: 'invalid-argument', path, message: `${path} may not be null.` }]
  const invalid = (expected: string): ShowCommandIssue[] => [{
    code: field.issueCode ?? 'invalid-argument',
    path,
    message: `${path} must be ${expected}${field.nullable ? ' or null' : ''}.`,
  }]
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' && (!field.enum || field.enum.includes(value)) ? [] : invalid(field.enum ? `one of ${field.enum.join(', ')}` : 'a string')
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
        && (field.minimum === undefined || value >= field.minimum)
        && (field.maximum === undefined || value <= field.maximum) ? [] : invalid('a finite number in the supported range')
    case 'integer':
      return typeof value === 'number'
        && (field.safeInteger ? Number.isSafeInteger(value) : Number.isInteger(value))
        && (field.minimum === undefined || value >= field.minimum)
        && (field.maximum === undefined || value <= field.maximum)
        ? [] : invalid(field.safeInteger ? 'a safe integer in the supported range' : 'an integer in the supported range')
    case 'boolean':
      return typeof value === 'boolean' ? [] : invalid('a boolean')
    case 'layer':
      return value === 'main' || (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) ? [] : invalid('"main" or a zero-based Layer index')
    case 'easing':
      return (typeof value === 'string' ? ['linear', 'ease-in', 'ease-out', 'ease-in-out'].includes(value) : validateShowEasing(value).valid) ? [] : invalid('a supported easing')
    case 'json':
      return []
    case 'union': {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const discriminator = (value as Record<string, unknown>).kind
        const variant = field.variants.find(candidate => (
          candidate.kind === 'object'
          && candidate.properties.kind?.kind === 'string'
          && candidate.properties.kind.enum?.includes(discriminator as string)
        ))
        if (variant) return validateField(variant, value, path)
      }
      if (field.variants.some(variant => validateField(variant, value, path).length === 0)) return []
      return invalid('one of the documented alternatives')
    }
    case 'array': {
      if (!Array.isArray(value)) return invalid('an array')
      if (field.minItems !== undefined && value.length < field.minItems) {
        return [{ code: field.minItems === 1 ? 'empty-collection' : 'invalid-argument', path, message: `${path} requires at least ${field.minItems} item${field.minItems === 1 ? '' : 's'}.` }]
      }
      if (field.maxItems !== undefined && value.length > field.maxItems) {
        return [{ code: 'batch-too-large', path, message: `${path} accepts at most ${field.maxItems} items.` }]
      }
      return value.flatMap((item, index) => validateField(field.items, item, `${path}[${index}]`))
    }
    case 'record': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('an object')
      return Object.entries(value).flatMap(([key, item]) => validateField(field.values, item, `${path}[${JSON.stringify(key)}]`))
    }
    case 'object': {
      if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid('an object')
      const object = value as Record<string, unknown>
      const issues: ShowCommandIssue[] = []
      for (const [name, property] of Object.entries(field.properties)) {
        if (object[name] === undefined) {
          if (!property.optional) issues.push({ code: 'invalid-argument', path: `${path}.${name}`, message: `${path}.${name} is required (${property.description}).` })
        } else issues.push(...validateField(property, object[name], `${path}.${name}`))
      }
      for (const name of Object.keys(object)) {
        if (!Object.prototype.hasOwnProperty.call(field.properties, name)) issues.push({ code: 'unknown-field', path: `${path}.${name}`, message: `${path} has no field named "${name}".` })
      }
      if (!field.allowEmpty && Object.keys(object).length === 0) issues.push({ code: 'empty-patch', path, message: `${path} must contain at least one field.` })
      return issues
    }
  }
}

export function validateShowCommandInput(
  descriptor: ShowCommandDescriptor,
  input: Record<string, unknown>,
): ShowCommandIssue[] {
  const issues: ShowCommandIssue[] = []
  if (descriptor.exactlyOne && descriptor.exactlyOne.filter(name => input[name] !== undefined).length !== 1) {
    issues.push({ code: 'invalid-argument', message: `Give exactly one of ${descriptor.exactlyOne.join(' or ')}.` })
  }
  if (descriptor.atLeastOne && descriptor.atLeastOne.every(name => input[name] === undefined)) {
    issues.push({ code: 'invalid-argument', message: `Give at least one of ${descriptor.atLeastOne.join(', ')}.` })
  }
  if (descriptor.atMostOne && descriptor.atMostOne.filter(name => input[name] !== undefined).length > 1) {
    issues.push({ code: 'invalid-argument', message: `Give at most one of ${descriptor.atMostOne.join(' or ')}.` })
  }
  for (const [name, field] of Object.entries(descriptor.fields)) {
    const value = input[name]
    if (value === undefined) {
      if (!field.optional) {
        issues.push({
          code: 'invalid-argument',
          message: `${descriptor.name}: required field "${name}" is missing (${field.description}).`,
        })
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

// Family modules import only types and helpers from this module.
import { SHOW_ANIMATION_COMMANDS } from './animation'
import { SHOW_CLIP_COMMANDS } from './clips'
import { SHOW_EFFECT_COMMANDS } from './effects'
import { SHOW_JUNCTION_COMMANDS } from './junctions'
import { SHOW_LAYER_TRANSITION_COMMANDS } from './layerTransitions'
import { SHOW_OVERLAY_LAYER_COMMANDS } from './overlayLayers'
import { SHOW_STRUCTURE_COMMANDS } from './structure'
import { SHOW_TIMELINE_COMMANDS } from './timeline'
import { SHOW_BULK_AUTHORING_COMMANDS } from './bulkAuthoring'

export const SHOW_COMMANDS: ShowCommandDescriptor[] = [
  ...SHOW_BULK_AUTHORING_COMMANDS,
  ...SHOW_CLIP_COMMANDS,
  ...SHOW_OVERLAY_LAYER_COMMANDS,
  ...SHOW_TIMELINE_COMMANDS,
  ...SHOW_JUNCTION_COMMANDS,
  ...SHOW_LAYER_TRANSITION_COMMANDS,
  ...SHOW_EFFECT_COMMANDS,
  ...SHOW_ANIMATION_COMMANDS,
  ...SHOW_STRUCTURE_COMMANDS,
]

const commandByName = () => new Map(SHOW_COMMANDS.map((command) => [command.name, command]))

/** Apply one registry command; input is validated against the entry's schema first. */
export function applyShowCommand(
  record: ShowRecord,
  name: string,
  input: Record<string, unknown> = {},
  context?: ShowCommandContext,
): ShowCommandOutcome {
  const descriptor = commandByName().get(name)
  if (!descriptor) {
    return refuseShowCommand({
      code: 'unknown-command',
      message: `No Show command is named "${name}".`,
      candidates: SHOW_COMMANDS.map((command) => command.name),
    })
  }
  const issues = [
    ...validateShowCommandInput(descriptor, input),
    ...(descriptor.preflight?.(record, input, context) ?? []),
  ]
  if (issues.length > 0) return { ok: false, issues }
  return descriptor.apply(record, input, context)
}

/**
 * Fold a list of commands over the Show, all-or-nothing. The caller persists
 * the returned record once, so the whole transaction is one history snapshot
 * and one undo step. A refusal reports which step refused and leaves the
 * caller's record untouched.
 */
export function runShowCommandTransaction(
  record: ShowRecord,
  commands: Array<{ name: string; input?: Record<string, unknown> }>,
  context?: ShowCommandContext,
):
  | { ok: true; record: ShowRecord; changes: ShowCommandChange[] }
  | { ok: false; step: number; issues: ShowCommandIssue[] } {
  let current = record
  const changes: ShowCommandChange[] = []
  for (const [step, command] of commands.entries()) {
    const outcome = applyShowCommand(current, command.name, command.input ?? {}, context)
    if (!outcome.ok) return { ok: false, step, issues: outcome.issues }
    current = outcome.record
    changes.push(...outcome.changes)
  }
  return { ok: true, record: current, changes }
}
