import Ajv from 'ajv'
import schemaText from '../../schemas/show-record.schema.json?raw'
import type { ShowRecord } from '@/engine/personalContentRecords'
import type { ShowEditRequest, ShowEditReceipt, ShowEditCompletion } from '@/engine/showEditAdmission'
import type { ShowInputWaitReceipt } from '@/engine/showInputWait'
import { captureShowAuthoringBaseline, validateShowAuthoring } from '@/engine/showAuthoringValidation'
import { useShowStore } from '@/store/showStore'
import { usePatternStore } from '@/store/patternStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useMapStore, STOCK_MAPS } from '@/store/mapStore'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { recordAgentObservation, showRecordDigest, type AgentApplyPhase } from './agentObservation'
import { captureAgentShowSnapshot } from './agentShowSnapshot'
import { parseAgentResizeIntent, sameAgentResizeIntent, type AgentResizeIntent } from './agentResizeProtocol'
import { applyShowCommand } from '@/engine/showCommands/registry'

const structural = new Ajv({ allErrors: true, strict: false, strictNumbers: true }).compile(JSON.parse(schemaText))
export const agentUrlEnabled = () => {
  const values = new URLSearchParams(window.location.search).getAll('agent')
  return values.length === 1 && values[0] === '1'
}

/** Observe actual URL changes synchronously, including remove/restore ABA. Does
 * not navigate or alter router preflight. Scoped to the development editor. */
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

/** Broad full-Show diagnostic context is deliberately NOT qualified for C1. No
 * exposed callback or client-supplied validator can bypass this boundary. */
export function createAgentEditorAdmission(showId: string, getContext: () => unknown, bindFieldActivity?: (acquire: () => () => void) => () => void) {
  const store = () => useShowStore.getState()
  const pathname = window.location.pathname
  const sessionId = store().beginShowEditSession(showId)
  let retired = false
  const listeners = new Set<() => void>()
  const resizeEntries = new Map<string, { request: ShowEditRequest; intent: AgentResizeIntent }>()
  const entries = new Map<string, { request: ShowEditRequest; show: ShowRecord; context: unknown; baseline: ReturnType<typeof captureShowAuthoringBaseline>; invalidated: boolean; delivered?: boolean; retryResize?: AgentResizeIntent }>()
  let metadataStops: Array<() => void> = []
  const releaseMetadata = () => {
    if ([...entries.values()].some(entry => store().readShowEdit(sessionId, entry.request.operationId)?.status === 'pending')) return
    metadataStops.forEach(stop => stop())
    metadataStops = []
  }
  const observe = (request: ShowEditRequest, phase: AgentApplyPhase) => {
    const current = store().resolveEditableShow(showId)
    recordAgentObservation({ kind: 'agent-apply', phase, showId, requestId: request.operationId, at: Date.now(),
      ...(current ? { digest: showRecordDigest(current), updatedAt: current.updatedAt } : {}),
      historyDepth: store().showHistories[showId]?.past.length ?? 0 })
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
  let stops: Array<() => void> = []
  const close = () => {
    if (retired) return
    retired = true
    store().retireShowEditSession(sessionId)
    stops.forEach(stop => stop())
    stops = []
    entries.clear()
    resizeEntries.clear()
    releaseMetadata()
    listeners.forEach(listener => listener())
    listeners.clear()
  }
  const available = () => {
    if (!agentUrlEnabled() || window.location.pathname !== pathname) close()
    return !retired
  }
  const invalidate = () => {
    for (const entry of entries.values()) if (store().readShowEdit(sessionId, entry.request.operationId)?.status === 'pending') {
      entry.invalidated = true
      if (store().readShowEditCandidate(sessionId, entry.request.operationId)?.status === 'waiting') store().invalidateShowEditCandidate(entry.request)
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
  const validate = (candidate: ShowRecord, entry: { show: ShowRecord; baseline: ReturnType<typeof captureShowAuthoringBaseline> }) => {
    const stageMap = [...STOCK_MAPS, ...useMapStore.getState().userMaps].find(map => map.id === candidate.stageMapId)
    if (candidate.stageMapId && candidate.stageMapId !== entry.show.stageMapId && (!stageMap || (stageMap.dim !== 2 && stageMap.dim !== 3))) return false
    return validateShowAuthoring(candidate, { ...metadata(), baseline: entry.baseline, allowExistingMissing: true, stageDimension: stageMap?.dim === 3 ? 3 : 2 }).valid
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
  const retryEligible = (request: ShowEditRequest) => {
    const value = store().readShowEdit(sessionId, request.operationId)
    return value?.status === 'cancelled' || (value?.status === 'applied' && value.settlement === 'rolled-back')
      || (value?.status === 'refused' && (value.reason === 'revision-conflict' || value.reason === 'interaction-timeout'))
  }
  const matchesResize = (show: ShowRecord, candidate: unknown, intent: AgentResizeIntent) => {
    if (!structural(candidate)) return false
    const expected = applyShowCommand(show, 'resize_clip', { clip_id: intent.clipId, duration_ms: intent.durationMs })
    const canonical = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
    // The command stamps its own clock; the store stamps adoption again. No
    // authored field or document identity is omitted from this comparison.
    return expected.ok && canonical({ ...candidate as ShowRecord, updatedAt: 0 }) === canonical({ ...expected.record, updatedAt: 0 })
  }
  return {
    sessionId, available, close,
    onClose(listener: () => void) { if (retired) listener(); else listeners.add(listener); return () => { listeners.delete(listener) } },
    getShow() { return available() ? structuredClone(store().resolveEditableShow(showId)) : undefined },
    getEditorFocus() { return available() ? structuredClone(getContext()) : undefined },
    beginResizeRequest(operationId: string, value: unknown) {
      const intent = parseAgentResizeIntent(value)
      if (!available() || typeof operationId !== 'string' || !operationId || !intent) return undefined
      const result = store().beginResolvedShowResize(sessionId, { operationId, resize: intent })
      if (result.status !== 'pending') return undefined
      const prior = resizeEntries.get(operationId)
      if (!prior) resizeEntries.set(operationId, { request: result.request, intent })
      return structuredClone(resizeEntries.get(operationId)!)
    },
    applyResize(value: unknown, request?: ShowEditRequest): ShowInputWaitReceipt {
      if (!available()) return request ? { request, status: 'retired' } : invalid()
      if (!request) return invalid()
      const entry = resizeEntries.get(request.operationId)
      if (request.sessionId !== sessionId || !entry || JSON.stringify(request) !== JSON.stringify(entry.request)) return invalid(request)
      if (!sameAgentResizeIntent(entry.intent, value)) return store().rejectResolvedShowResize(request)
      const result = store().admitResolvedShowResize(request)
      observeOutcome(result)
      return result
    },
    beginRequest(operationId: string, utterance: string, history: unknown) {
      if (!available() || typeof operationId !== 'string' || !operationId || typeof utterance !== 'string') return undefined
      const prior = entries.get(operationId)
      const current = prior?.show ?? structuredClone(store().resolveEditableShow(showId))
      if (!current) return undefined
      const stageMap = [...STOCK_MAPS, ...useMapStore.getState().userMaps].find(map => map.id === current.stageMapId)
      const show = prior?.show ?? captureAgentShowSnapshot(current, metadata().source, stageMap?.dim === 3 ? 3 : 2)
      if (!show) return undefined
      const context = prior?.context ?? structuredClone(getContext())
      const result = store().beginShowEdit(sessionId, { operationId, payloadKey: JSON.stringify({ utterance, history }), referenceContext: JSON.stringify(context), targets: [showId] })
      if (result.status !== 'pending') return undefined
      if (!prior) entries.set(operationId, { request: result.request, show, context, baseline: captureShowAuthoringBaseline(show, metadata()), invalidated: false })
      watchMetadata()
      return structuredClone({ request: result.request, show, context })
    },
    applyShow(candidate: unknown, request?: ShowEditRequest, retryResize?: unknown): ShowInputWaitReceipt {
      if (!available()) return request ? { request, status: 'retired' } : invalid()
      if (!request || request.sessionId !== sessionId) return invalid(request)
      const entry = entries.get(request.operationId)
      if (!entry || JSON.stringify(request) !== JSON.stringify(entry.request)) return invalid(request)
      const binding = parseAgentResizeIntent(retryResize)
      if ((retryResize !== undefined && (!binding || !matchesResize(entry.show, candidate, binding)))
        || (entry.retryResize && !sameAgentResizeIntent(entry.retryResize, retryResize))
        || (request.retryOf && (!binding || !matchesResize(entry.show, candidate, binding)))) {
        const result = store().invalidateShowEditCandidate(request)
        observeOutcome(result)
        releaseMetadata()
        return result ?? invalid(request)
      }
      if (!entry.delivered) {
        entry.delivered = true
        if (binding && matchesResize(entry.show, candidate, binding)) entry.retryResize = binding
      }
      const existing = store().readShowEditCandidate(sessionId, request.operationId)
      if (existing?.status === 'pending') observe(request, 'admitted')
      const result = store().deliverShowEditCandidate(request, candidate,
        next => !entry.invalidated && validate(next, entry),
        raw => !entry.invalidated && structural(raw) && validate(raw as ShowRecord, entry))
      observeOutcome(result)
      releaseMetadata()
      return result
    },
    complete(request: ShowEditRequest, completion: ShowEditCompletion) {
      if (!available()) return { request, status: 'retired' } as const
      const entry = entries.get(request.operationId) ?? resizeEntries.get(request.operationId)
      if (request.sessionId !== sessionId || !entry || JSON.stringify(request) !== JSON.stringify(entry.request)) return invalid(request)
      const result = store().completeShowEdit(request, completion)
      releaseMetadata()
      return result
    },
    readOutcome(request: ShowEditRequest) {
      if (!available() || request.sessionId !== sessionId) return undefined
      const entry = entries.get(request.operationId) ?? resizeEntries.get(request.operationId)
      const result = entry && JSON.stringify(request) === JSON.stringify(entry.request) ? store().readShowEditCandidate(sessionId, request.operationId) : undefined
      observeOutcome(result)
      releaseMetadata()
      return result
    },
    cancel(request: ShowEditRequest) {
      if (!available() || request.sessionId !== sessionId) return undefined
      const entry = entries.get(request.operationId) ?? resizeEntries.get(request.operationId)
      const result = entry && JSON.stringify(request) === JSON.stringify(entry.request) ? store().cancelShowEdit(sessionId, request.operationId) : undefined
      releaseMetadata()
      return result
    },
    beginRetry(operationId: string, original: ShowEditRequest) {
      if (!available() || !original || typeof operationId !== 'string' || !operationId || operationId === original.operationId) return undefined
      const entry = entries.get(original.operationId)
      if (!entry?.retryResize || JSON.stringify(original) !== JSON.stringify(entry.request) || !retryEligible(original)) return undefined
      const prior = entries.get(operationId)
      const current = prior?.show ?? store().resolveEditableShow(showId)
      if (!current) return undefined
      const stageMap = [...STOCK_MAPS, ...useMapStore.getState().userMaps].find(map => map.id === current.stageMapId)
      const show = prior?.show ?? captureAgentShowSnapshot(current, metadata().source, stageMap?.dim === 3 ? 3 : 2)
      if (!show) return undefined
      const { payloadKey, referenceContext, targets } = entry.request
      const result = store().beginShowEdit(sessionId, { operationId, retryOf: original.operationId, payloadKey, referenceContext, targets })
      if (result.status !== 'pending') return undefined
      if (!prior) entries.set(operationId, { request: result.request, show, context: structuredClone(entry.context), baseline: captureShowAuthoringBaseline(show, metadata()), invalidated: false, retryResize: structuredClone(entry.retryResize) })
      watchMetadata()
      return structuredClone({ request: result.request, show, context: entry.context, retryResize: entry.retryResize })
    },
    retryIntent(request: ShowEditRequest) {
      if (!request) return undefined
      const entry = entries.get(request.operationId)
      return available() && entry?.retryResize && JSON.stringify(request) === JSON.stringify(entry.request) && retryEligible(request) ? structuredClone(entry.retryResize) : undefined
    },
  }
}
