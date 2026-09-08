import type { ShowRecord } from '@/engine/personalContentRecords'
import { captureShowAuthoringBaseline, validateShowAuthoring } from '@/engine/showAuthoringValidation'
import type { ShowEditRequest, ShowEditReceipt, ShowEditSession, ShowEditSettlement } from '@/engine/showEditAdmission'
import { resizeShowClipExactly, type ShowExactClipResizeRequest } from '@/engine/showExactClipResize'
import { showResizeDependencyContext } from '@/engine/showResizeDependencies'
import { DEMOS, resolveStockPatternId } from '@/pixelblaze/stock/patterns'
import { LIBRARIES } from '@/pixelblaze/libs'
import { usePatternStore } from './patternStore'
import { useLibraryStore } from './libraryStore'
import { useMapStore } from './mapStore'

export interface ResolvedShowResizeIntent {
  operationId: string
  resize: ShowExactClipResizeRequest
  retryOf?: string
}
interface Owner {
  session: () => ShowEditSession | undefined
  current: (id: string) => ShowRecord | undefined
  revision: (id: string) => number
  subscribe: (listener: () => void) => () => void
  missing: (id: string) => boolean
  adopt: (id: string, show: ShowRecord, settle: (value: Exclude<ShowEditSettlement, 'saving'>) => void) => Promise<void>
  isStock: (id: string) => boolean
}

/** Internal owner only. The receipt identifies original logical-reference intent;
 * dependencies are captured privately, not asserted by an adapter/model.
 * A future adapter must qualify its actual supplied context before using this API.
 * This module is not exposed through the bridge, MCP, UI or a server schema. */
export function createShowResizeAdmission(owner: Owner) {
  const pending = new Map<string, { request: ShowEditRequest; resize: ShowExactClipResizeRequest; context: string; baseline: ReturnType<typeof captureShowAuthoringBaseline> }>()
  // Retained terminal identities are bounded by the shared session capacity.
  const owned = new Set<string>()
  let subscriptions: Array<() => void> = []
  const metadata = () => {
    const patterns = usePatternStore.getState().userPatterns
    return {
      source: (ref: { kind: string; id: string }) => ref.kind === 'stock' ? DEMOS[resolveStockPatternId(ref.id)] : patterns.find(pattern => pattern.id === ref.id)?.src,
      libraries: { ...LIBRARIES, ...Object.fromEntries(useLibraryStore.getState().userLibraries.map(library => [library.name, library.src])) },
    }
  }
  const release = (id: string) => {
    pending.delete(id)
    if (!pending.size) { subscriptions.forEach(stop => stop()); subscriptions = [] }
  }
  const invalidate = (showId?: string) => {
    for (const [id, value] of pending) if (!showId || value.request.showId === showId) {
      owner.session()?.refuse(id, 'revision-conflict')
      release(id)
    }
  }
  const observe = () => {
    for (const [id, value] of pending) {
      const current = owner.current(value.request.showId)
      if (!current || owner.missing(value.request.showId) || showResizeDependencyContext(current, value.resize.clipId) !== value.context) {
        owner.session()?.refuse(id, 'revision-conflict')
        release(id)
      }
    }
  }
  const watch = () => {
    if (subscriptions.length) return
    subscriptions = [owner.subscribe(observe),
      usePatternStore.subscribe((next, previous) => { if (next.userPatterns !== previous.userPatterns) invalidate() }),
      useLibraryStore.subscribe((next, previous) => { if (next.userLibraries !== previous.userLibraries) invalidate() }),
      useMapStore.subscribe((next, previous) => { if (next.userMaps !== previous.userMaps) invalidate() }),
    ]
  }
  return {
    owns: (id: string) => owned.has(id),
    invalidate,
    release,
    retire() { invalidate(); owned.clear() },
    begin(sessionId: string, input: ResolvedShowResizeIntent): ShowEditReceipt {
      const session = owner.session()
      const resize = structuredClone(input.resize)
      // Request payload is the exact operation, generated here, never client supplied.
      const payloadKey = JSON.stringify(resize)
      const current = session && owner.current(session.showId)
      const existing = session?.read(input.operationId)
      const context = (current && showResizeDependencyContext(current, resize.clipId)) ?? ''
      const intent = { operationId: input.operationId, payloadKey, referenceContext: JSON.stringify({ kind: 'internal-resolved-logical-clip', clipId: resize.clipId }), targets: [resize.clipId], ...(input.retryOf ? { retryOf: input.retryOf } : {}) }
      if (!session || session.sessionId !== sessionId) return { status: 'retired', request: { ...intent, sessionId, showId: '', baseRevision: -1 } }
      const result = session.begin(intent, owner.revision(session.showId))
      if (result.status !== 'pending' || existing) return result
      owned.add(input.operationId)
      if (!current || owner.missing(session.showId)) return session.refuse(input.operationId, 'missing-show')!
      if (!context || !current.composition || resizeShowClipExactly(current, current.composition, resize).status === 'refused') return session.refuse(input.operationId, 'invalid-candidate')!
      pending.set(input.operationId, { request: result.request, resize, context, baseline: captureShowAuthoringBaseline(current, metadata()) })
      watch()
      return result
    },
    admit(request: ShowEditRequest): ShowEditReceipt {
      const session = owner.session()
      if (!session || session.sessionId !== request.sessionId) return { status: 'retired', request }
      // The envelope is checked against the stored request, while only the
      // authoritative observer can establish independence from later revisions.
      const checked = session.check(request, { sessionId: session.sessionId, showId: session.showId, revision: owned.has(request.operationId) ? request.baseRevision : owner.revision(session.showId) })
      if (checked.status !== 'pending') return checked
      const value = pending.get(request.operationId)
      if (!value) return session.refuse(request.operationId, 'invalid-candidate')!
      observe()
      const observed = session.read(request.operationId)!
      if (observed.status !== 'pending') return observed
      const current = owner.current(request.showId)!
      const result = resizeShowClipExactly(current, current.composition!, value.resize)
      if (result.status === 'refused') { release(request.operationId); return session.refuse(request.operationId, 'invalid-candidate')! }
      const candidate = { ...current, composition: result.composition }
      if (!validateShowAuthoring(candidate, { ...metadata(), baseline: value.baseline, allowExistingMissing: true }).valid) {
        release(request.operationId)
        return session.refuse(request.operationId, 'invalid-candidate')!
      }
      release(request.operationId)
      if (result.status === 'noop') return session.noop(request.operationId)
      const applied = session.adopted(request.operationId, owner.isStock(request.showId) ? 'draft' : 'saving')
      void owner.adopt(request.showId, candidate, settlement => { if (settlement !== 'draft') session.settle(request.operationId, settlement) }).catch(() => { /* Store recovery and receipt own failure. */ })
      return applied
    },
  }
}
