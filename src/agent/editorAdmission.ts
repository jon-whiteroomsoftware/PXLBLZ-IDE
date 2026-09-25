import Ajv, { type ErrorObject } from 'ajv'
import schemaText from '../../schemas/show-record.schema.json?raw'
import type { ShowPatternRef, ShowRecord } from '@/engine/personalContentRecords'
import type { ShowEditRequest, ShowEditReceipt, ShowEditCompletion } from '@/engine/showEditAdmission'
import type { ShowInputWaitReceipt } from '@/engine/showInputWait'
import { captureShowAuthoringBaseline, validateShowAuthoring, type ShowAuthoringBaseline } from '@/engine/showAuthoringValidation'
import { captureAgentShowSnapshotV2, captureShowAuthoringBaselineV2 } from '@/engine/showAuthoringValidationV2'
import { isShowRecordV2, type ShowDocument } from '@/engine/showDocument'
import { resolveCapturedShowPatternReplacementV2 } from '@/engine/showV2ClipReplacementModel'
import type { ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useMapStore, STOCK_MAPS } from '@/store/mapStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import {
  projectAgentControllerProfiles,
  projectAgentPatterns,
  type AgentPatternDiscoveryFilter,
} from '@/engine/agentDiscovery'
export type AgentApplyPhase = 'admitted' | 'adopted' | 'settled' | 'rejected' | 'failed'
export type AgentAdmissionObserver = (request: ShowEditRequest, phase: AgentApplyPhase, show: ShowDocument | undefined, historyDepth: number) => void
import { captureAgentShowSnapshot } from '@/engine/agentShowSnapshot'
import { showEditDiagnosticInput, type ShowEditDiagnosticCode, type ShowEditDiagnosticInput } from '@/engine/showEditDiagnostic'
import type { ShowEditValidationResult } from '@/store/showStore'

const structural = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(JSON.parse(schemaText))

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

const authoringFallback: Record<'structure' | 'composition' | 'missing-reference' | 'metadata' | 'delivery', ShowEditDiagnosticCode> = {
  structure: 'structure-invalid',
  composition: 'composition-invalid',
  'missing-reference': 'reference-unavailable',
  metadata: 'metadata-unavailable',
  delivery: 'delivery-invalid',
}

const metadataInvalidatedDiagnostic = (): ShowEditDiagnosticInput => showEditDiagnosticInput('metadata-invalidation', [{ code: 'metadata-invalidated' }])
/** Observe actual URL changes synchronously, including remove/restore ABA. Does
 * not navigate or alter router preflight. Scoped to the mounted editor route. */
export function observeAgentLocation(listener: () => void): () => void {
  const push = window.history.pushState
  const replace = window.history.replaceState
  const wrappedPush: History['pushState'] = function (this: History, ...args) { push.apply(this, args); listener() }
  const wrappedReplace: History['replaceState'] = function (this: History, ...args) { replace.apply(this, args); listener() }
  window.history.pushState = wrappedPush
  window.history.replaceState = wrappedReplace
  window.addEventListener('hashchange', listener)
  window.addEventListener('popstate', listener)
  return () => {
    if (window.history.pushState === wrappedPush) window.history.pushState = push
    if (window.history.replaceState === wrappedReplace) window.history.replaceState = replace
    window.removeEventListener('hashchange', listener)
    window.removeEventListener('popstate', listener)
  }
}

/**
 * Which record version this editor holds, and - for a v2 record - its prepared
 * capture (#1039).
 *
 * The version is declared by the route that mounts the admission rather than
 * guessed from the store, so the editor and the commands attached to it are
 * always the same version for one Show (specification section 10). The capture
 * is the route's own prepared context: the same object its typed UI intents
 * adopt through, so a command sequence and a manual edit are checked against
 * one Stage preparation.
 */
export interface AgentEditorRecordBinding {
  recordVersion?: 1 | 2
  capture?: () => ShowV2PilotPreparedCapture | null
  /** Trusted route-lifetime and captured-dependency check the v2 admission calls back into. */
  isCurrentCapture?: () => boolean
}

/** Shared immutable Show admission. No transport callback or caller-supplied
 * validator can bypass the editor revision, metadata, input-wait or save owner. */
export function createAgentEditorAdmission(showId: string, getContext: () => unknown, bindFieldActivity?: (acquire: () => () => void) => () => void, onObservation?: AgentAdmissionObserver, binding: AgentEditorRecordBinding = {}) {
  const store = () => useShowStore.getState()
  const pathname = window.location.pathname
  const v2 = binding.recordVersion === 2
  const sessionId = store().beginShowEditSession(showId)
  /** The one record this editor holds, in the version the route declared. */
  const resolveShow = (): ShowDocument | undefined => (v2 ? store().showV2Pilots[showId] : store().resolveEditableShow(showId))
  const capture = (): ShowV2PilotPreparedCapture | null => binding.capture?.() ?? null
  let retired = false
  const listeners = new Set<() => void>()
  const entries = new Map<string, { request: ShowEditRequest; show: ShowDocument; context: unknown; baseline: ShowAuthoringBaseline; invalidated: boolean }>()
  let metadataStops: Array<() => void> = []
  const releaseMetadata = () => {
    if ([...entries.values()].some(entry => store().readShowEdit(sessionId, entry.request.operationId)?.status === 'pending')) return
    metadataStops.forEach(stop => stop())
    metadataStops = []
  }
  const observe = (request: ShowEditRequest, phase: AgentApplyPhase) => {
    const histories = v2 ? store().showV2Histories : store().showHistories
    onObservation?.(request, phase, resolveShow(), histories[showId]?.past.length ?? 0)
  }
  const observedSettlement = new Set<string>()
  const observedApplication = new Set<string>()
  const observeOutcome = (receipt: ShowInputWaitReceipt | undefined) => {
    const result = receipt && store().readShowEdit(sessionId, receipt.request.operationId)
    if (!result || result.status === 'pending' || result.status === 'completed') return
    const id = result.request.operationId
    if (!observedApplication.has(id)) {
      observedApplication.add(id)
      observe(result.request, result.status === 'applied' ? 'adopted' : 'rejected')
    }
    if (result.status === 'applied' && result.settlement !== 'saving' && !observedSettlement.has(id)) {
      observedSettlement.add(id)
      observe(result.request, result.settlement === 'rolled-back' ? 'failed' : 'settled')
    }
  }
  const metadata = () => ({
    source: (ref: { kind: string; id: string }) => ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : usePatternStore.getState().userPatterns.find(pattern => pattern.id === ref.id)?.src,
    libraries: { ...LIBRARIES, ...Object.fromEntries(useLibraryStore.getState().userLibraries.map(library => [library.name, library.src])) },
  })
  const capturePatternMetadata = () => {
    const patterns = usePatternStore.getState()
    const libraries = useLibraryStore.getState()
    const stock = Object.freeze({ ...DEMOS })
    const personal = Object.freeze(Object.fromEntries(patterns.userPatterns.map(pattern => [pattern.id, pattern.src])))
    return {
      loaded: patterns.patternsLoaded && libraries.librariesLoaded,
      sources: [
        ...Object.entries(stock).map(([id, source]) => ({ kind: 'stock' as const, id, name: id, source })),
        ...patterns.userPatterns.map(pattern => ({ kind: 'user' as const, id: pattern.id, name: pattern.name, source: personal[pattern.id] })),
      ],
      stock,
      personal,
      libraries: Object.freeze({ ...LIBRARIES, ...Object.fromEntries(libraries.userLibraries.map(library => [library.name, library.src])) }),
    }
  }
  let stops: Array<() => void> = []
  const close = () => {
    if (retired) return
    retired = true
    store().retireShowEditSession(sessionId)
    stops.forEach(stop => stop())
    stops = []
    entries.clear()
    releaseMetadata()
    listeners.forEach(listener => listener())
    listeners.clear()
  }
  const available = () => {
    if (window.location.pathname !== pathname) close()
    return !retired
  }
  const invalidate = () => {
    for (const entry of entries.values()) if (store().readShowEdit(sessionId, entry.request.operationId)?.status === 'pending') {
      entry.invalidated = true
      if (store().readShowEditCandidate(sessionId, entry.request.operationId)?.status === 'waiting') {
        store().invalidateShowEditCandidate(entry.request, metadataInvalidatedDiagnostic())
      }
    }
    releaseMetadata()
  }
  window.addEventListener('pagehide', close)
  stops = [observeAgentLocation(available), () => window.removeEventListener('pagehide', close)]
  const watchMetadata = () => {
    if (metadataStops.length) return
    metadataStops = [
      usePatternStore.subscribe((a, b) => { if (a.userPatterns !== b.userPatterns) invalidate() }),
      useLibraryStore.subscribe((a, b) => { if (a.userLibraries !== b.userLibraries) invalidate() }),
      useMapStore.subscribe((a, b) => { if (a.userMaps !== b.userMaps) invalidate() }),
    ]
  }
  /** The Stage dimension a v1 snapshot projects at; a v2 record resolves its own. */
  const v1StageDimension = (record: ShowRecord): 1 | 2 | 3 => (
    [...STOCK_MAPS, ...useMapStore.getState().userMaps].find(map => map.id === record.stageMapId)?.dim === 3 ? 3 : 2
  )
  const authoringBaseline = (show: ShowDocument): ShowAuthoringBaseline => (
    isShowRecordV2(show) ? captureShowAuthoringBaselineV2(show, metadata()) : captureShowAuthoringBaseline(show, metadata())
  )
  const validate = (candidate: ShowRecord, entry: { show: ShowRecord; baseline: ShowAuthoringBaseline }, stage: 'authoring' | 'normalized'): ShowEditValidationResult => {
    const stageMap = [...STOCK_MAPS, ...useMapStore.getState().userMaps].find(map => map.id === candidate.stageMapId)
    if (candidate.stageMapId && candidate.stageMapId !== entry.show.stageMapId && (!stageMap || (stageMap.dim !== 2 && stageMap.dim !== 3))) {
      return { valid: false, diagnostic: showEditDiagnosticInput(stage, [{ code: 'map-metadata-unavailable', path: JSON.stringify(['stageMap', candidate.stageMapId]) }]) }
    }
    const result = validateShowAuthoring(candidate, { ...metadata(), baseline: entry.baseline, allowExistingMissing: true, stageDimension: stageMap?.dim === 3 ? 3 : 2 })
    if (result.valid) return { valid: true }
    return {
      valid: false,
      diagnostic: showEditDiagnosticInput(stage, result.errors.map(issue => ({
        code: issue.diagnosticCode ?? authoringFallback[issue.code],
        ...(issue.path ? { path: issue.path } : {}),
      }))),
    }
  }
  const invalid = (request?: ShowEditRequest): ShowEditReceipt => ({
    request: request ?? { operationId: '', payloadKey: '', referenceContext: '', targets: [], sessionId, showId, baseRevision: -1 },
    status: 'refused', reason: 'identity-mismatch',
  })
  const unbindFields = bindFieldActivity?.(() => {
    try {
      const token = store().acquireShowEditActivity(sessionId, showId, 'dirty-field')
      if (token) return () => store().releaseShowEditActivity(token)
    } catch (error) {
      if (!(error instanceof RangeError)) { close(); throw error }
    }
    // Manual input remains usable, but no candidate may use an untracked session.
    close()
    return () => {}
  })
  if (unbindFields) {
    if (retired) unbindFields()
    else stops.push(unbindFields)
  }
  return {
    sessionId, available, close,
    onClose(listener: () => void) { if (retired) listener(); else listeners.add(listener); return () => { listeners.delete(listener) } },
    /** The record this editor holds, in its own version: `read_show` returns v2 for a v2 record. */
    getShow() { return available() ? structuredClone(resolveShow()) : undefined },
    recordVersion: v2 ? 2 as const : 1 as const,
    getEditorFocus() { return available() ? structuredClone(getContext()) : undefined },
    getPatterns(filter: AgentPatternDiscoveryFilter = {}) {
      if (!available()) return undefined
      const captured = capturePatternMetadata()
      return captured.loaded ? projectAgentPatterns(captured.sources, captured.libraries, filter) : undefined
    },
    getControllerProfiles() {
      if (!available()) return undefined
      const profiles = useControllerProfileStore.getState()
      return profiles.profilesLoaded ? projectAgentControllerProfiles(profiles.profiles) : undefined
    },
    /** Immutable browser-owned source metadata for a private command sequence. */
    captureCommandContext() {
      if (!available()) return undefined
      const { stock, personal, libraries } = capturePatternMetadata()
      if (v2) {
        // The v2 catalogue resolves a Pattern through the route's own captured
        // bundle, so a command and the inspector replace a Pattern identically.
        const prepared = capture()
        if (!prepared) return undefined
        return {
          commandContext: { resolvePattern: (ref: { kind: string; id: string }) => resolveCapturedShowPatternReplacementV2(prepared, ref as ShowPatternRef) },
          retainedBytes: new TextEncoder().encode(JSON.stringify({ stock, personal, libraries })).byteLength,
        }
      }
      return {
        commandContext: {
          source: (ref: { kind: string; id: string }) => ref.kind === 'stock' ? stock[resolveStockPatternId(ref.id)] : personal[ref.id],
          libraries,
        },
        retainedBytes: new TextEncoder().encode(JSON.stringify({ stock, personal, libraries })).byteLength,
      }
    },
    beginRequest(operationId: string, utterance: string, history: unknown, maxCaptureBytes = Infinity) {
      if (!available() || typeof operationId !== 'string' || !operationId || typeof utterance !== 'string') return undefined
      const prior = entries.get(operationId)
      const current = prior?.show ?? structuredClone(resolveShow())
      if (!current) return undefined
      // A v2 record is already the one representation commands read; a v1 flat
      // Show is projected into a composition before an agent can address it.
      const show = prior?.show ?? (isShowRecordV2(current)
        ? captureAgentShowSnapshotV2(current)
        : captureAgentShowSnapshot(current, metadata().source, v1StageDimension(current)))
      if (!show) return undefined
      const context = prior?.context ?? structuredClone(getContext())
      const identity = { operationId, payloadKey: JSON.stringify({ utterance, history }), referenceContext: JSON.stringify(context), targets: [showId] }
      if (new TextEncoder().encode(JSON.stringify({ show, context, request: { ...identity, sessionId, showId, baseRevision: Number.MAX_SAFE_INTEGER } })).byteLength > maxCaptureBytes) return undefined
      const result = store().beginShowEdit(sessionId, identity)
      if (result.status !== 'pending') return undefined
      if (!prior) entries.set(operationId, { request: result.request, show, context, baseline: authoringBaseline(show), invalidated: false })
      watchMetadata()
      return structuredClone({ request: result.request, show, context })
    },
    applyShow(candidate: unknown, request?: ShowEditRequest): ShowInputWaitReceipt {
      if (!available()) return request ? { request, status: 'retired' } : invalid()
      if (!request || request.sessionId !== sessionId) return invalid(request)
      const entry = entries.get(request.operationId)
      if (!entry || JSON.stringify(request) !== JSON.stringify(entry.request)) return invalid(request)
      if (v2) {
        const prepared = capture()
        // The Stage capture is the editor's own; without it there is nothing to
        // check this candidate against and nothing to adopt it into.
        if (!prepared) return store().invalidateShowEditCandidate(request) ?? invalid(request)
        const existingV2 = store().readShowEditCandidate(sessionId, request.operationId)
        if (existingV2?.status === 'pending') observe(request, 'admitted')
        const receipt = store().deliverShowV2EditCandidate({
          request, candidate, capture: prepared, baseline: entry.baseline,
          isCurrent: () => (binding.isCurrentCapture?.() ?? true) && capture() === prepared,
          invalidated: () => entry.invalidated,
        })
        observeOutcome(receipt)
        releaseMetadata()
        return receipt
      }
      const v1Entry = entry as typeof entry & { show: ShowRecord }
      const existing = store().readShowEditCandidate(sessionId, request.operationId)
      if (existing?.status === 'pending') observe(request, 'admitted')
      const result = store().deliverShowEditCandidate(request, candidate,
        next => entry.invalidated ? { valid: false, diagnostic: metadataInvalidatedDiagnostic() } : validate(next, v1Entry, 'normalized'),
        raw => {
          if (entry.invalidated) return { valid: false, diagnostic: metadataInvalidatedDiagnostic() }
          if (!structural(raw)) return { valid: false, diagnostic: rawSchemaDiagnostic(structural.errors) }
          return validate(raw as ShowRecord, v1Entry, 'authoring')
        })
      observeOutcome(result)
      releaseMetadata()
      return result
    },
    complete(request: ShowEditRequest, completion: ShowEditCompletion) {
      if (!available()) return { request, status: 'retired' } as const
      const entry = entries.get(request.operationId)
      if (request.sessionId !== sessionId || !entry || JSON.stringify(request) !== JSON.stringify(entry.request)) return invalid(request)
      const result = store().completeShowEdit(request, completion)
      releaseMetadata()
      return result
    },
    readOutcome(request: ShowEditRequest) {
      if (!available() || request.sessionId !== sessionId) return undefined
      const entry = entries.get(request.operationId)
      const result = entry && JSON.stringify(request) === JSON.stringify(entry.request) ? store().readShowEditCandidate(sessionId, request.operationId) : undefined
      observeOutcome(result)
      releaseMetadata()
      return result
    },
    cancel(request: ShowEditRequest) {
      if (!available() || request.sessionId !== sessionId) return undefined
      const entry = entries.get(request.operationId)
      const result = entry && JSON.stringify(request) === JSON.stringify(entry.request) ? store().cancelShowEdit(sessionId, request.operationId) : undefined
      releaseMetadata()
      return result
    },
  }
}
