import type { ShowPatternRef } from '@/engine/personalContentRecords'
import type { ShowEditRequest, ShowEditReceipt, ShowEditCompletion } from '@/engine/showEditAdmission'
import type { ShowInputWaitReceipt } from '@/engine/showInputWait'
import type { ShowAuthoringBaseline } from '@/engine/showAuthoringValidation'
import { captureAgentShowSnapshotV2, captureShowAuthoringBaselineV2 } from '@/engine/showAuthoringValidationV2'
import type { ShowDocument } from '@/engine/showDocument'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { resolveCapturedShowPatternReplacementV2 } from '@/engine/showV2ClipReplacementModel'
import type { ShowV2PilotPreparedCapture } from '@/store/showV2PreparedEditAdmission'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useMapStore } from '@/store/mapStore'
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
import { showEditDiagnosticInput, type ShowEditDiagnosticInput } from '@/engine/showEditDiagnostic'

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
 * The v2 record's prepared capture (#1039, #1042).
 *
 * The capture is the route's own prepared context: the same object its typed UI
 * intents adopt through, so a command sequence and a manual edit are checked
 * against one Stage preparation.
 */
export interface AgentEditorRecordBinding {
  capture?: () => ShowV2PilotPreparedCapture | null
  /** Trusted route-lifetime and captured-dependency check the v2 admission calls back into. */
  isCurrentCapture?: () => boolean
}

/** Shared immutable Show admission. No transport callback or caller-supplied
 * validator can bypass the editor revision, metadata, input-wait or save owner. */
export function createAgentEditorAdmission(showId: string, getContext: () => unknown, bindFieldActivity?: (acquire: () => () => void) => () => void, onObservation?: AgentAdmissionObserver, binding: AgentEditorRecordBinding = {}) {
  const store = () => useShowStore.getState()
  const pathname = window.location.pathname
  const sessionId = store().beginShowEditSession(showId)
  /** The one record this editor holds. Without a v2 working copy nothing is admitted. */
  const resolveShow = (): ShowRecordV2 | undefined => store().showV2Pilots[showId]
  const capture = (): ShowV2PilotPreparedCapture | null => binding.capture?.() ?? null
  let retired = false
  const listeners = new Set<() => void>()
  const entries = new Map<string, { request: ShowEditRequest; show: ShowRecordV2; context: unknown; baseline: ShowAuthoringBaseline; invalidated: boolean }>()
  let metadataStops: Array<() => void> = []
  const releaseMetadata = () => {
    if ([...entries.values()].some(entry => store().readShowEdit(sessionId, entry.request.operationId)?.status === 'pending')) return
    metadataStops.forEach(stop => stop())
    metadataStops = []
  }
  const observe = (request: ShowEditRequest, phase: AgentApplyPhase) => {
    onObservation?.(request, phase, resolveShow(), store().showV2Histories[showId]?.past.length ?? 0)
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
    /** The v2 record this editor holds; `read_show` returns it. */
    getShow() { return available() ? structuredClone(resolveShow()) : undefined },
    recordVersion: 2 as const,
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
      // The v2 catalogue resolves a Pattern through the route's own captured
      // bundle, so a command and the inspector replace a Pattern identically.
      const prepared = capture()
      if (!prepared) return undefined
      return {
        commandContext: { resolvePattern: (ref: { kind: string; id: string }) => resolveCapturedShowPatternReplacementV2(prepared, ref as ShowPatternRef) },
        retainedBytes: new TextEncoder().encode(JSON.stringify({ stock, personal, libraries })).byteLength,
      }
    },
    beginRequest(operationId: string, utterance: string, history: unknown, maxCaptureBytes = Infinity) {
      if (!available() || typeof operationId !== 'string' || !operationId || typeof utterance !== 'string') return undefined
      const prior = entries.get(operationId)
      const current = prior?.show ?? structuredClone(resolveShow())
      if (!current) return undefined
      // A v2 record is already the one representation commands read.
      const show = prior?.show ?? captureAgentShowSnapshotV2(current)
      if (!show) return undefined
      const context = prior?.context ?? structuredClone(getContext())
      const identity = { operationId, payloadKey: JSON.stringify({ utterance, history }), referenceContext: JSON.stringify(context), targets: [showId] }
      if (new TextEncoder().encode(JSON.stringify({ show, context, request: { ...identity, sessionId, showId, baseRevision: Number.MAX_SAFE_INTEGER } })).byteLength > maxCaptureBytes) return undefined
      const result = store().beginShowEdit(sessionId, identity)
      if (result.status !== 'pending') return undefined
      if (!prior) entries.set(operationId, { request: result.request, show, context, baseline: captureShowAuthoringBaselineV2(show, metadata()), invalidated: false })
      watchMetadata()
      return structuredClone({ request: result.request, show, context })
    },
    applyShow(candidate: unknown, request?: ShowEditRequest): ShowInputWaitReceipt {
      if (!available()) return request ? { request, status: 'retired' } : invalid()
      if (!request || request.sessionId !== sessionId) return invalid(request)
      const entry = entries.get(request.operationId)
      if (!entry || JSON.stringify(request) !== JSON.stringify(entry.request)) return invalid(request)
      const prepared = capture()
      // The Stage capture is the editor's own; without it there is nothing to
      // check this candidate against and nothing to adopt it into.
      if (!prepared) return store().invalidateShowEditCandidate(request) ?? invalid(request)
      const existing = store().readShowEditCandidate(sessionId, request.operationId)
      if (existing?.status === 'pending') observe(request, 'admitted')
      const receipt = store().deliverShowV2EditCandidate({
        request, candidate, capture: prepared, baseline: entry.baseline,
        isCurrent: () => (binding.isCurrentCapture?.() ?? true) && capture() === prepared,
        invalidated: () => entry.invalidated,
      })
      observeOutcome(receipt)
      releaseMetadata()
      return receipt
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
