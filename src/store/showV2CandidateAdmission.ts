// The v2 candidate-delivery admission (#1039, specification section 9).
//
// `showV2PreparedEditAdmission` is the v2 route's own writer: it admits a typed
// UI *intent*, runs one closed pure owner and adopts the record that owner
// returns. An agent command sequence is different in exactly one way that
// matters - the candidate is produced outside the store, by folding
// `applyShowCommandV2` over a private copy - so the record arriving here is
// caller-supplied and untrusted, while everything around it must stay the same
// writer: one prepared-capture recheck, one adoption, one history entry, one
// ordinary save with the existing rollback and supersession.
//
// So this owner keeps the intent path's guard sequence and replaces only its
// middle: instead of calling an owner to produce the record, it validates the
// delivered one. Section 9 requires those to remain distinct checks rather than
// one permissive normalize-and-accept, and they are, in this order:
//
//   1. session and revision      - the shared `ShowEditSession`
//   2. the Show still exists     - and is not pending deletion
//   3. capture currency          - record, dependencies, provider, route
//   4. candidate identity        - a v2 record for this Show
//   5. structure                 - the provisional v2 JSON Schema
//   6. domain                    - `validateShowRecordV2` references and timing
//   7. dependencies              - Pattern/Library/control availability
//   8. zero write                - a candidate equal to the current record
//   9. compiler eligibility      - `prepareShowStageV2` over the capture
//  10. recheck, then adopt once
//
// No step repairs, normalizes or moves data, and a refusal at any step leaves
// the store, the history and the save queue untouched.
import type { ErrorObject } from 'ajv'
import { LIBRARIES } from '@/pixelblaze/libs'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import type { ShowPatternRef } from '@/engine/personalContentRecords'
import type { ShowEditReceipt, ShowEditRequest, ShowEditSession, ShowEditSettlement } from '@/engine/showEditAdmission'
import type { createShowInputWait, ShowInputAdmissionTiming, ShowInputWaitReceipt } from '@/engine/showInputWait'
import { validateShowRecordV2Domain, validateShowRecordV2Structure, type ShowCompositionV2ValidationCode, type ShowRecordV2 } from '@/engine/showCompositionV2'
import { showEditDiagnosticInput, type ShowEditDiagnosticCode, type ShowEditDiagnosticInput } from '@/engine/showEditDiagnostic'
import { isValidatedEmptyShowV2 } from '@/engine/showMarkerRouteModel'
import {
  prepareShowStageFromCapturedInputsV2,
  prepareShowStageV2,
  type ShowPreparedStageResultV2,
} from '@/engine/showPreparedStageV2'
import { validateShowAuthoringV2 } from '@/engine/showAuthoringValidationV2'
import type { ShowAuthoringBaseline } from '@/engine/showAuthoringValidation'
import { resolveShowV2StageMap, showV2StageMapAvailable } from './showV2StageMap'
import type { ShowV2PilotPreparedCapture } from './showV2PreparedEditAdmission'

const schemaCodes: Partial<Record<string, ShowEditDiagnosticCode>> = {
  required: 'schema-required',
  type: 'schema-type',
  enum: 'schema-enum',
  const: 'schema-const',
  minimum: 'schema-minimum',
  maximum: 'schema-maximum',
  exclusiveMinimum: 'schema-exclusive-minimum',
  exclusiveMaximum: 'schema-exclusive-maximum',
  minLength: 'schema-min-length',
  maxLength: 'schema-max-length',
  pattern: 'schema-pattern',
  format: 'schema-format',
  additionalProperties: 'schema-additional-properties',
  uniqueItems: 'schema-unique-items',
  minItems: 'schema-min-items',
  maxItems: 'schema-max-items',
  oneOf: 'schema-one-of',
  anyOf: 'schema-any-of',
  allOf: 'schema-all-of',
}

/** v2 record validation codes carry their own meaning; reuse a v1 diagnostic code only where it is unchanged. */
const domainCodes: Record<ShowCompositionV2ValidationCode, ShowEditDiagnosticCode> = {
  schema: 'schema-invalid',
  'invalid-version': 'structure-invalid',
  'duplicate-id': 'duplicate-id',
  'missing-reference': 'reference-unavailable',
  'not-finite': 'not-finite',
  'not-integer': 'not-integer',
  'out-of-bounds': 'out-of-bounds',
  overlap: 'overlap',
  'invalid-transition': 'invalid-transition',
  'invalid-layout-coverage': 'composition-invalid',
  'invalid-group-binding': 'composition-invalid',
  'invalid-property-target': 'invalid-property-track',
}

const authoringFallback: Record<'structure' | 'composition' | 'missing-reference' | 'metadata' | 'delivery', ShowEditDiagnosticCode> = {
  structure: 'structure-invalid',
  composition: 'composition-invalid',
  'missing-reference': 'reference-unavailable',
  metadata: 'metadata-unavailable',
  delivery: 'delivery-invalid',
}

function schemaErrorPath(error: ErrorObject): string | undefined {
  let path = error.instancePath
  if (error.keyword === 'required' && typeof error.params.missingProperty === 'string') {
    path += `/${error.params.missingProperty.replace(/~/g, '~0').replace(/\//g, '~1')}`
  }
  return path || undefined
}

function rawSchemaDiagnostic(errors: ErrorObject[] | null | undefined): ShowEditDiagnosticInput {
  return showEditDiagnosticInput('raw-schema', (errors?.length ? errors : [{ keyword: '', instancePath: '', params: {}, schemaPath: '' } as ErrorObject]).map(error => {
    const path = schemaErrorPath(error)
    return { code: schemaCodes[error.keyword] ?? 'schema-invalid', ...(path ? { path } : {}) }
  }))
}

/** The captured Pattern and Library metadata this candidate is validated against. */
function capturedMetadata(capture: ShowV2PilotPreparedCapture) {
  const patterns = capture.prepared.status === 'ready' ? capture.prepared.bundle.assets.patterns : capture.dependencies.patterns
  const libraries = capture.prepared.status === 'ready' ? capture.prepared.bundle.assets.libraries : capture.dependencies.libraries
  return {
    source: (ref: ShowPatternRef): string | undefined => (
      ref.kind === 'stock'
        ? Object.prototype.hasOwnProperty.call(DEMOS, resolveStockPatternId(ref.id)) ? DEMOS[resolveStockPatternId(ref.id)] : undefined
        : patterns.find(pattern => pattern.id === ref.id)?.src
    ),
    libraries: { ...LIBRARIES, ...Object.fromEntries(libraries.map(library => [library.name, library.src])) },
  }
}

/** Semantic equality: the ordering stamp belongs to adoption, not to the candidate. */
function sameAuthoredRecord(left: ShowRecordV2, right: ShowRecordV2): boolean {
  const canonical = (record: ShowRecordV2) => JSON.stringify({ ...record, updatedAt: 0 })
  return canonical(left) === canonical(right)
}

export interface ShowV2CandidateDelivery {
  /** The registered immutable request envelope for this operation. */
  request: ShowEditRequest
  /** Caller-supplied and untrusted until every check below has passed. */
  candidate: unknown
  /** The route's prepared capture; identity is rechecked, never rebuilt here. */
  capture: ShowV2PilotPreparedCapture
  /** Dependency exceptions captured when the operation began. */
  baseline: ShowAuthoringBaseline
  /** Trusted route-lifetime and captured-dependency check, as the intent admission uses. */
  isCurrent: () => boolean
  /** Whether Pattern, Library or Map metadata was replaced since capture. */
  invalidated?: () => boolean
}

export interface ShowV2CandidateAdmissionOwner {
  session: () => ShowEditSession | undefined
  inputWait: ReturnType<typeof createShowInputWait>
  current: (showId: string) => ShowRecordV2 | undefined
  revision: (showId: string) => number
  missing: (showId: string) => boolean
  adopt: (showId: string, next: ShowRecordV2, settle: (settlement: Exclude<ShowEditSettlement, 'saving' | 'draft'>) => void) => Promise<void>
}

/**
 * One store-owned admission for caller-supplied `ShowRecordV2` candidates.
 *
 * Constructed by the Show store with its own session, input wait and adoption
 * primitives, the way `createShowResizeAdmission` is. Nothing here reads the
 * store directly, so the guards cannot drift from the ones the store applies.
 */
export function createShowV2CandidateAdmission(owner: ShowV2CandidateAdmissionOwner) {
  const metadataInvalidated = (): ShowEditDiagnosticInput => showEditDiagnosticInput('metadata-invalidation', [{ code: 'metadata-invalidated' }])
  const admissionUnavailable = (): ShowEditDiagnosticInput => showEditDiagnosticInput('unexpected-admission-failure', [{ code: 'admission-unavailable' }])

  /** Steps 1-9 over one delivered candidate. Returns the receipt to publish, or the validated record to adopt. */
  const evaluate = (delivery: ShowV2CandidateDelivery, timing?: ShowInputAdmissionTiming): { adopt: ShowRecordV2 } | ShowEditReceipt => {
    const { request, capture } = delivery
    const session = owner.session()
    if (!session || session.sessionId !== request.sessionId) return { request, status: 'retired' }
    const refuse = (reason: Parameters<ShowEditSession['refuse']>[1], diagnostic?: ShowEditDiagnosticInput) => (
      session.refuse(request.operationId, reason, diagnostic) ?? { request, status: 'retired' as const }
    )
    const eligibility = () => ({ sessionId: session.sessionId, showId: session.showId, revision: owner.revision(request.showId) })
    const checked = session.check(request, eligibility())
    if (checked.status !== 'pending') return checked
    const current = owner.current(request.showId)
    if (!current || owner.missing(request.showId)) return refuse('missing-show')
    // The capture is the editor's own prepared context. A superseded record,
    // replaced dependency set, swapped provider or unmounted route all make
    // this candidate stale rather than invalid.
    let live: boolean
    try { live = capture.record === current && delivery.isCurrent() } catch { live = false }
    if (!live) return refuse('revision-conflict')
    if (delivery.invalidated?.()) return refuse('invalid-candidate', metadataInvalidated())
    let candidate: ShowRecordV2
    try { candidate = structuredClone(delivery.candidate) as ShowRecordV2 } catch { return refuse('invalid-candidate', admissionUnavailable()) }
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || candidate.version !== 2 || candidate.id !== request.showId) {
      return refuse('invalid-candidate')
    }
    const shape = validateShowRecordV2Structure(candidate)
    if (!shape.valid) return refuse('invalid-candidate', rawSchemaDiagnostic(shape.errors))
    const domain = validateShowRecordV2Domain(candidate)
    if (domain.length) {
      return refuse('invalid-candidate', showEditDiagnosticInput('normalized', domain.map(issue => ({
        code: domainCodes[issue.code] ?? 'structure-invalid',
        ...(issue.path ? { path: issue.path } : {}),
      }))))
    }
    const metadata = capturedMetadata(capture)
    // A command may select another Stage map, which the capture's pinned map
    // cannot describe. The Portable rule reads the dimension of the map this
    // candidate actually names, resolved the way step 9 below resolves it.
    const movedStage = (candidate.stageMapId ?? null) !== (capture.record.stageMapId ?? null)
    const stageDimension: 1 | 2 | 3 = (movedStage
      ? resolveShowV2StageMap(candidate.stageMapId, capture.dependencies.maps)?.dim
      : capture.dependencies.stageMap?.dim) === 3 ? 3 : 2
    let authoring: ReturnType<typeof validateShowAuthoringV2>
    try {
      authoring = validateShowAuthoringV2(candidate, { ...metadata, baseline: delivery.baseline, allowExistingMissing: true, stageDimension })
    } catch { return refuse('invalid-candidate', showEditDiagnosticInput('unexpected-validator-failure', [{ code: 'validation-unavailable' }])) }
    if (!authoring.valid) {
      return refuse('invalid-candidate', showEditDiagnosticInput('authoring', authoring.errors.map(issue => ({
        code: issue.diagnosticCode ?? authoringFallback[issue.code],
        ...(issue.path ? { path: issue.path } : {}),
      }))))
    }
    // A candidate that writes nothing has no adoption, history entry, save or
    // ordering stamp to publish, and the caller declared changes it did not make.
    if (sameAuthoredRecord(candidate, current)) return refuse('no-candidate')
    // The named map must also be one this workspace can still prepare: refuse a
    // map that is gone or at an unsupported dimension rather than preparing the
    // Show against geometry it does not name.
    if (movedStage && !showV2StageMapAvailable(candidate.stageMapId, capture.dependencies.maps)) {
      return refuse('invalid-candidate', showEditDiagnosticInput('normalized', [{ code: 'map-metadata-unavailable', path: JSON.stringify(['stageMap', candidate.stageMapId]) }]))
    }
    let prepared: ShowPreparedStageResultV2
    try {
      prepared = movedStage
        ? prepareShowStageV2(candidate, { ...capture.dependencies, stageMap: resolveShowV2StageMap(candidate.stageMapId, capture.dependencies.maps) })
        : capture.inputCapture?.status === 'qualified'
          ? prepareShowStageFromCapturedInputsV2(candidate, capture.inputCapture.inputs)
          : prepareShowStageV2(candidate, capture.prepared.status === 'ready'
            ? { ...capture.prepared.bundle.assets, stageMap: capture.dependencies.stageMap }
            : capture.dependencies)
    } catch { return refuse('invalid-candidate', admissionUnavailable()) }
    // Section 9: final-content deletion may leave an empty Show, which stays
    // editable and saveable while preview and export are unavailable.
    if (prepared.status === 'refused' || (prepared.status === 'empty' && !isValidatedEmptyShowV2(candidate))) {
      return refuse('invalid-candidate', showEditDiagnosticInput('normalized', [{ code: 'delivery-invalid' }]))
    }
    // Recheck after the trusted synchronous validators, in case one reentered.
    if (owner.session() !== session) return { request, status: 'retired' }
    // A wait that outlived its deadline while validating refuses here, before
    // any adoption: the recheck below observes the refusal.
    if (timing?.kind === 'after-active-input' && performance.now() >= timing.deadline) session.refuse(request.operationId, 'interaction-timeout')
    const rechecked = session.check(request, eligibility())
    if (rechecked.status !== 'pending') return rechecked
    try { if (capture.record !== owner.current(request.showId) || !delivery.isCurrent()) return refuse('revision-conflict') } catch { return refuse('revision-conflict') }
    return { adopt: candidate }
  }

  const admit = (delivery: ShowV2CandidateDelivery, timing?: ShowInputAdmissionTiming): ShowEditReceipt => {
    const session = owner.session()
    const outcome = evaluate(delivery, timing)
    if (!('adopt' in outcome)) return outcome
    const adopted = session!.adopted(delivery.request.operationId, 'saving')
    void owner.adopt(delivery.request.showId, outcome.adopt, settlement => {
      session!.settle(delivery.request.operationId, settlement)
    }).catch(() => { /* The store recovery notice and the receipt own the failure. */ })
    return adopted
  }

  return {
    /**
     * Deliver one complete candidate. Identity, duplicate delivery and the
     * active-input wait are the shared session's; only the record-shaped checks
     * above are this owner's.
     */
    deliver(delivery: ShowV2CandidateDelivery): ShowInputWaitReceipt {
      const arrivedAt = performance.now()
      const session = owner.session()
      if (!session || session.sessionId !== delivery.request.sessionId) return { request: delivery.request, status: 'retired' }
      const request = structuredClone(delivery.request)
      let identity: string
      let captured: ShowV2CandidateDelivery
      try {
        captured = { ...delivery, request, candidate: structuredClone(delivery.candidate) }
        identity = JSON.stringify(captured.candidate) ?? 'undefined'
      } catch {
        return session.refuse(request.operationId, 'invalid-candidate', admissionUnavailable()) ?? { request, status: 'retired' }
      }
      return owner.inputWait.deliver(request, identity, arrivedAt,
        timing => admit(captured, timing),
        () => {
          const current = owner.session()
          if (!current || current.sessionId !== request.sessionId) return { request, status: 'retired' }
          const eligible = current.check(request, { sessionId: current.sessionId, showId: current.showId, revision: owner.revision(request.showId) })
          if (eligible.status !== 'pending') return eligible
          // Raw structure is checked before the wait so a malformed candidate is
          // refused immediately rather than after the person stops typing.
          const value = captured.candidate as { id?: unknown; version?: unknown }
          if (!value || typeof value !== 'object' || Array.isArray(value) || value.version !== 2 || value.id !== request.showId) {
            return current.refuse(request.operationId, 'invalid-candidate') ?? eligible
          }
          const shape = validateShowRecordV2Structure(value)
          if (!shape.valid) return current.refuse(request.operationId, 'invalid-candidate', rawSchemaDiagnostic(shape.errors)) ?? eligible
          return eligible
        })
    },
  }
}

export type ShowV2CandidateAdmission = ReturnType<typeof createShowV2CandidateAdmission>
