export const SHOW_EDIT_DIAGNOSTIC_MAX_ISSUES = 8
export const SHOW_EDIT_DIAGNOSTIC_MAX_CODE_BYTES = 64
export const SHOW_EDIT_DIAGNOSTIC_MAX_MESSAGE_BYTES = 256
export const SHOW_EDIT_DIAGNOSTIC_MAX_PATH_BYTES = 256
export const SHOW_EDIT_DIAGNOSTIC_MAX_BYTES = 4_096

export type ShowEditDiagnosticStage =
  | 'raw-schema'
  | 'authoring'
  | 'normalized'
  | 'metadata-invalidation'
  | 'unexpected-validator-failure'
  | 'unexpected-admission-failure'

export type ShowEditDiagnosticCategory =
  | 'schema'
  | 'structure'
  | 'composition'
  | 'missing-reference'
  | 'metadata'
  | 'delivery'
  | 'internal'

const catalog = {
  'schema-required': ['schema', 'A required Show property is missing.'],
  'schema-type': ['schema', 'A Show property has the wrong type.'],
  'schema-enum': ['schema', 'A Show property has an unsupported value.'],
  'schema-const': ['schema', 'A Show property has an unsupported value.'],
  'schema-minimum': ['schema', 'A Show number is below its supported minimum.'],
  'schema-maximum': ['schema', 'A Show number exceeds its supported maximum.'],
  'schema-exclusive-minimum': ['schema', 'A Show number is below its supported range.'],
  'schema-exclusive-maximum': ['schema', 'A Show number exceeds its supported range.'],
  'schema-min-length': ['schema', 'A Show string is too short.'],
  'schema-max-length': ['schema', 'A Show string is too long.'],
  'schema-pattern': ['schema', 'A Show string has an unsupported format.'],
  'schema-format': ['schema', 'A Show property has an unsupported format.'],
  'schema-additional-properties': ['schema', 'A Show object contains an unsupported property.'],
  'schema-unique-items': ['schema', 'A Show list contains duplicate items.'],
  'schema-min-items': ['schema', 'A Show list has too few items.'],
  'schema-max-items': ['schema', 'A Show list has too many items.'],
  'schema-one-of': ['schema', 'A Show value does not match one supported form.'],
  'schema-any-of': ['schema', 'A Show value does not match any supported form.'],
  'schema-all-of': ['schema', 'A Show value does not satisfy all required rules.'],
  'schema-invalid': ['schema', 'The Show does not match the persisted Show schema.'],
  'empty-identity': ['structure', 'An authored Show identity must not be empty.'],
  'duplicate-identity': ['structure', 'An authored Show identity must be unique.'],
  'invalid-scene-duration': ['structure', 'Scene duration must be a positive safe integer.'],
  'unknown-cell-owner': ['structure', 'A Cell references an unknown Scene or Zone.'],
  'transition-missing-scene': ['structure', 'A transition references an unknown Scene.'],
  'routing-layout-required': ['structure', 'A routing event requires a Layout target.'],
  'transition-missing-layout': ['structure', 'A transition references an unknown Layout.'],
  'layout-missing-zone': ['structure', 'A Layout references an unknown Zone.'],
  'invalid-physical-range': ['structure', 'Layout range endpoints must be safe integers.'],
  'invalid-logical-routing': ['structure', 'Logical routing is invalid.'],
  'invalid-output-count': ['structure', 'Output pixel count must be a positive safe integer.'],
  'structure-invalid': ['structure', 'The authored Show structure is invalid.'],
  'composition-invalid': ['composition', 'The authored Show composition is invalid.'],
  'duplicate-id': ['composition', 'A composition identity is duplicated.'],
  'missing-scene': ['composition', 'A composition owner references a missing Scene.'],
  'missing-zone': ['composition', 'A composition owner references a missing Zone.'],
  'missing-definition': ['composition', 'A composition owner references a missing definition.'],
  'missing-instance': ['composition', 'A composition owner references a missing Pattern instance.'],
  'missing-placement': ['composition', 'A composition owner references a missing placement.'],
  'missing-control': ['composition', 'A property track references a missing control.'],
  'missing-effect': ['composition', 'A property track references a missing Effect.'],
  'missing-effect-parameter': ['composition', 'A property track references a missing Effect parameter.'],
  'effect-identity-mismatch': ['composition', 'An Effect identity does not match its owner.'],
  'not-finite': ['composition', 'A composition number must be finite.'],
  'not-integer': ['composition', 'A composition time must use whole milliseconds.'],
  'out-of-bounds': ['composition', 'A composition item is outside its owner bounds.'],
  overlap: ['composition', 'Composition items overlap.'],
  'cross-layer': ['composition', 'A composition relationship crosses Layer ownership.'],
  'invalid-logical-clip': ['composition', 'A private Clip no longer matches its authored ownership.'],
  'invalid-transition': ['composition', 'A Layer transition is invalid.'],
  'invalid-property-track': ['composition', 'A property track is invalid.'],
  'duplicate-track-id': ['composition', 'A property track identity is duplicated.'],
  'duplicate-keyframe-id': ['composition', 'A keyframe identity is duplicated.'],
  'duplicate-target': ['composition', 'More than one property track has the same target.'],
  'unordered-keyframes': ['composition', 'Property keyframes must be ordered.'],
  'too-few-keyframes': ['composition', 'A property track requires more keyframes.'],
  'invalid-easing': ['composition', 'A property keyframe has invalid easing.'],
  'invalid-curve-segment': ['composition', 'A retained property curve segment is invalid.'],
  'pattern-reference-unavailable': ['missing-reference', 'A required Pattern is unavailable.'],
  'library-reference-unavailable': ['missing-reference', 'A required Library function is unavailable.'],
  'reference-unavailable': ['missing-reference', 'A required authored reference is unavailable.'],
  'pattern-metadata-unavailable': ['metadata', 'Required Pattern or Library metadata cannot be inspected.'],
  'control-metadata-unavailable': ['metadata', 'Required control metadata is unavailable or invalid.'],
  'map-metadata-unavailable': ['metadata', 'The selected Stage Map metadata is unavailable or invalid.'],
  'metadata-unavailable': ['metadata', 'Required authoring metadata is unavailable or invalid.'],
  'delivery-invalid': ['delivery', 'The Show cannot be delivered in its current form.'],
  'portable-reference-map-unsupported': ['delivery', 'Portable Shows require a 2D reference map.'],
  'portable-physical-routing-unsupported': ['delivery', 'Portable Shows require normalized position-based routing.'],
  'portable-logical-zone-missing': ['structure', 'Portable routing references a missing logical Zone.'],
  'portable-logical-routing-invalid': ['structure', 'Portable logical routing is invalid.'],
  'portable-renderer-unsupported': ['delivery', 'A Pattern has no Portable-compatible renderer.'],
  'portable-metadata-unavailable': ['metadata', 'Pattern metadata cannot be inspected for Portable compatibility.'],
  'metadata-invalidated': ['metadata', 'Pattern, Library, or Map metadata changed before adoption.'],
  'validation-unavailable': ['internal', 'Candidate validation could not be completed.'],
  'admission-unavailable': ['internal', 'Candidate admission could not be completed.'],
} as const satisfies Record<string, readonly [ShowEditDiagnosticCategory, string]>

export type ShowEditDiagnosticCode = keyof typeof catalog

export interface ShowEditDiagnosticIssueInput {
  readonly code: ShowEditDiagnosticCode
  readonly path?: string
}

export interface ShowEditDiagnosticInput {
  readonly stage: ShowEditDiagnosticStage
  readonly issues: readonly ShowEditDiagnosticIssueInput[]
}

export interface ShowEditDiagnosticIssue {
  readonly category: ShowEditDiagnosticCategory
  readonly code: ShowEditDiagnosticCode
  readonly message: string
  readonly path?: string
}

export interface ShowEditDiagnostic {
  readonly stage: ShowEditDiagnosticStage
  readonly issues: readonly ShowEditDiagnosticIssue[]
  readonly truncated: boolean
}

const stages = new Set<ShowEditDiagnosticStage>([
  'raw-schema', 'authoring', 'normalized', 'metadata-invalidation',
  'unexpected-validator-failure', 'unexpected-admission-failure',
])

const utf8 = new TextEncoder()
const byteLength = (value: string) => utf8.encode(value).byteLength

function boundedText(value: string, maxBytes: number): { value: string; truncated: boolean } {
  let result = ''
  let truncated = false
  for (const scalar of value) {
    const point = scalar.codePointAt(0)!
    const safe = point <= 0x1f || point === 0x7f ? ' ' : scalar
    if (byteLength(result + safe) > maxBytes) {
      truncated = true
      break
    }
    result += safe
  }
  return { value: result, truncated }
}

function ownKeysAre(value: object, allowed: readonly string[]): boolean {
  const keys = Object.keys(value)
  return keys.length <= allowed.length && keys.every(key => allowed.includes(key))
}

export function isShowEditDiagnosticInput(value: unknown): value is ShowEditDiagnosticInput {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !ownKeysAre(value, ['stage', 'issues'])) return false
  const input = value as { stage?: unknown; issues?: unknown }
  if (typeof input.stage !== 'string' || !stages.has(input.stage as ShowEditDiagnosticStage) || !Array.isArray(input.issues) || input.issues.length === 0) return false
  return input.issues.slice(0, SHOW_EDIT_DIAGNOSTIC_MAX_ISSUES).every(issue => {
    if (!issue || typeof issue !== 'object' || Array.isArray(issue) || !ownKeysAre(issue, ['code', 'path'])) return false
    const candidate = issue as { code?: unknown; path?: unknown }
    return typeof candidate.code === 'string' && Object.prototype.hasOwnProperty.call(catalog, candidate.code)
      && (candidate.path === undefined || typeof candidate.path === 'string')
  })
}

/** The sole boundary from internal validation detail to a retained public receipt. */
export function retainShowEditDiagnostic(value: unknown): ShowEditDiagnostic | undefined {
  try {
    if (!isShowEditDiagnosticInput(value)) return undefined
    let truncated = value.issues.length > SHOW_EDIT_DIAGNOSTIC_MAX_ISSUES
    const issues = value.issues.slice(0, SHOW_EDIT_DIAGNOSTIC_MAX_ISSUES).map(issue => {
      const [category, template] = catalog[issue.code]
      const message = boundedText(template, SHOW_EDIT_DIAGNOSTIC_MAX_MESSAGE_BYTES)
      const path = issue.path === undefined ? undefined : boundedText(issue.path, SHOW_EDIT_DIAGNOSTIC_MAX_PATH_BYTES)
      truncated ||= message.truncated || Boolean(path?.truncated)
      return Object.freeze({
        category,
        code: issue.code,
        message: message.value,
        ...(path ? { path: path.value } : {}),
      })
    })
    while (issues.length > 0 && byteLength(JSON.stringify({ stage: value.stage, issues, truncated })) > SHOW_EDIT_DIAGNOSTIC_MAX_BYTES) {
      issues.pop()
      truncated = true
    }
    if (issues.length === 0) return undefined
    return Object.freeze({ stage: value.stage, issues: Object.freeze(issues), truncated })
  } catch {
    return undefined
  }
}

export function showEditDiagnosticInput(stage: ShowEditDiagnosticStage, issues: readonly ShowEditDiagnosticIssueInput[]): ShowEditDiagnosticInput {
  return { stage, issues }
}

/** Re-project even a transported receipt through the catalog before showing copy. */
export function showEditDiagnosticMessage(diagnostic: unknown): string | undefined {
  try {
    if (!diagnostic || typeof diagnostic !== 'object' || Array.isArray(diagnostic)) return undefined
    const value = diagnostic as { stage?: unknown; issues?: unknown }
    if (typeof value.stage !== 'string' || !Array.isArray(value.issues)) return undefined
    const issue = value.issues[0]
    if (!issue || typeof issue !== 'object' || Array.isArray(issue)) return undefined
    const candidate = issue as { code?: unknown; path?: unknown }
    if (typeof candidate.code !== 'string' || (candidate.path !== undefined && typeof candidate.path !== 'string')) return undefined
    return retainShowEditDiagnostic({ stage: value.stage, issues: [{ code: candidate.code, ...(candidate.path === undefined ? {} : { path: candidate.path }) }] })?.issues[0]?.message
  } catch {
    return undefined
  }
}
