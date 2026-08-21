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
// unchanged) is surfaced as a typed refusal, never as success; commands
// backed by a plan* function run the plan first and pass its user-legible
// reason through.
import type { ShowCompositionV1, ShowRecord } from '../personalContentRecords'

/** A typed reason a command was refused. A refusal is never silent. */
export interface ShowCommandIssue {
  code: string
  message: string
  /** What the caller can do instead, where one exists. */
  remedy?: string
  /** Nearest known ids when an id failed to resolve. */
  candidates?: string[]
}

/** One entry of the structured change list an accepted command returns. */
export interface ShowCommandChange {
  command: string
  targetId?: string
  description: string
  details?: Record<string, unknown>
}

export type ShowCommandOutcome =
  | { ok: true; record: ShowRecord; changes: ShowCommandChange[] }
  | { ok: false; issues: ShowCommandIssue[] }

/** Dependency-free input schema: enough for palettes and validation. */
export interface ShowCommandField {
  kind: 'string' | 'number' | 'integer' | 'boolean' | 'json'
  description: string
  optional?: boolean
  /** For string fields limited to a closed set. */
  enum?: readonly string[]
  /** May the value be null (distinct from omitted)? */
  nullable?: boolean
}

export interface ShowCommandDescriptor {
  /** Stable snake_case name; renaming is a breaking change. */
  name: string
  /** One paragraph for a human or tool choosing commands. */
  description: string
  /** ShowRecord JSON-pointer patterns this command may write; '*' matches one segment. */
  touches: string[]
  fields: Record<string, ShowCommandField>
  apply: (record: ShowRecord, input: Record<string, unknown>) => ShowCommandOutcome
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

function fieldTypeMatches(field: ShowCommandField, value: unknown): boolean {
  if (value === null) return field.nullable === true
  switch (field.kind) {
    case 'string':
      return typeof value === 'string' && (!field.enum || field.enum.includes(value))
    case 'number':
      return typeof value === 'number' && Number.isFinite(value)
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'json':
      return true
  }
}

export function validateShowCommandInput(
  descriptor: ShowCommandDescriptor,
  input: Record<string, unknown>,
): ShowCommandIssue[] {
  const issues: ShowCommandIssue[] = []
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
    if (!fieldTypeMatches(field, value)) {
      issues.push({
        code: 'invalid-argument',
        message:
          `${descriptor.name}: field "${name}" must be ${field.enum ? `one of ${field.enum.join(', ')}` : field.kind}` +
          `${field.nullable ? ' or null' : ''}.`,
      })
    }
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
import { SHOW_STRUCTURE_COMMANDS } from './structure'
import { SHOW_TIMELINE_COMMANDS } from './timeline'

export const SHOW_COMMANDS: ShowCommandDescriptor[] = [
  ...SHOW_CLIP_COMMANDS,
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
): ShowCommandOutcome {
  const descriptor = commandByName().get(name)
  if (!descriptor) {
    return refuseShowCommand({
      code: 'unknown-command',
      message: `No Show command is named "${name}".`,
      candidates: SHOW_COMMANDS.map((command) => command.name),
    })
  }
  const issues = validateShowCommandInput(descriptor, input)
  if (issues.length > 0) return { ok: false, issues }
  return descriptor.apply(record, input)
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
):
  | { ok: true; record: ShowRecord; changes: ShowCommandChange[] }
  | { ok: false; step: number; issues: ShowCommandIssue[] } {
  let current = record
  const changes: ShowCommandChange[] = []
  for (const [step, command] of commands.entries()) {
    const outcome = applyShowCommand(current, command.name, command.input ?? {})
    if (!outcome.ok) return { ok: false, step, issues: outcome.issues }
    current = outcome.record
    changes.push(...outcome.changes)
  }
  return { ok: true, record: current, changes }
}
