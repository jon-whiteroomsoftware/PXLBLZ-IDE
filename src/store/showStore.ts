import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  addShowRoutingLayout,
  addShowScene,
  addShowZone,
  createShowWithOutputContract,
  cloneShowCellAfter,
  duplicateShowScene,
  extendShowCell,
  importedStageMapIdForController,
  moveShowCellToSlot,
  normalizeShowEntryState,
  normalizeShowTransitionState,
  placeShowClip,
  removeShowClip,
  removeShowScene,
  removeShowRoutingLayout,
  removeShowZone,
  spanShowCellZones,
  splitShowAtTime,
  removeShowBoundaryTransition,
  updateShowCellZoneMode,
  updateShowBoundaryTransition,
  updateShowZone,
  updateShowCellAdaptations,
  updateShowCellEffects,
  updateShowCellControlTarget,
  updateShowCellPattern,
  updateShowCellRestartOnEntry,
  updateShowScene,
  updateShowRoutingLayout,
  updateShowRoutingSwitch,
  updateShowTransition,
  showCellAtSlot,
  forfeitShowExecutionModelOnCastChange,
  reconcileShowExecutionModelOnCastReturn,
} from '@/engine/showModel'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import type {
  ShowCell,
  ShowCellAdaptations,
  ShowClipEffect,
  ShowBoundaryTransition,
  ShowRecord,
  ShowOutputContract,
  ShowPortalSettings,
  ShowRoutingLayout,
  ShowScene,
  ShowTransitionKind,
  ShowZone,
} from '@/engine/personalContentRecords'
import { type ControllerProfile } from '@/engine/controllerProfile'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { useMapStore } from '@/store/mapStore'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { normalizeShowComposition } from '@/engine/showCompositionModel'
import { stockShowById } from '@/pixelblaze/stock/shows'
import {
  createShowEditSession,
  type ShowEditIntent,
  type ShowEditRequest,
  type ShowEditReceipt,
  type ShowEditSession,
  type ShowEditSettlement,
} from '@/engine/showEditAdmission'
import { createShowResizeAdmission, type ResolvedShowResizeIntent } from './showResizeAdmission'
import { createShowInputWait, type ShowEditActivity, type ShowInputWaitReceipt } from '@/engine/showInputWait'

const showPersistenceQueues = new Map<string, Promise<void>>()
const showsPendingDeletion = new Set<string>()
// The in-flight loadShows, so record creation can wait for hydration to
// apply instead of racing a stale list snapshot (#794).
let showsHydration: Promise<void> | null = null
// The last record each Show is known to hold durably, paired with the undo
// history that belongs to it (#792): rollback after a failed write restores
// this pair, never an unpersisted optimistic intermediate or a history that
// could replay one.
const lastPersistedShowRecords = new Map<string, { record: ShowRecord; history: ShowHistory }>()

// Advance the durable baseline for a completed write, but never behind the
// latest ordering stamp observed by this client. An equal stamp means
// loadShows observed this same write and reset its history; the just-persisted
// record with its richer history wins.
//
// updatedAt is only a single-client ordering stamp, not a document revision.
// Cross-client revisions and clock-skew-safe ordering remain #802.
function advanceDurableBaseline(id: string, record: ShowRecord, history: ShowHistory): void {
  const baseline = lastPersistedShowRecords.get(id)
  if (!baseline || baseline.record.updatedAt <= record.updatedAt) {
    lastPersistedShowRecords.set(id, { record, history })
  }
}

function replacementWithNextOrderingStamp(previous: ShowRecord, replacement: ShowRecord): ShowRecord {
  return {
    ...normalizeShowRecord(replacement),
    updatedAt: Math.max(Date.now(), previous.updatedAt + 1),
  }
}

interface ShowState {
  showRevisions: Record<string, number>
  beginShowEditSession: (showId: string, capacity?: number) => string
  retireShowEditSession: (sessionId: string) => void
  beginShowEdit: (sessionId: string, intent: ShowEditIntent) => ShowEditReceipt
  readShowEdit: (sessionId: string, operationId: string) => ShowEditReceipt | undefined
  completeShowEdit: (request: ShowEditRequest, completion: import('@/engine/showEditAdmission').ShowEditCompletion) => ShowEditReceipt
  cancelShowEdit: (sessionId: string, operationId: string) => ShowEditReceipt | undefined
  admitShowEdit: (
    request: ShowEditRequest,
    evaluate: (current: ShowRecord) => ShowRecord | null,
    validate: (candidate: ShowRecord, current: ShowRecord) => boolean,
  ) => ShowEditReceipt
  beginResolvedShowResize: (sessionId: string, intent: ResolvedShowResizeIntent) => ShowEditReceipt
  admitResolvedShowResize: (request: ShowEditRequest) => ShowInputWaitReceipt
  shows: ShowRecord[]
  showsLoaded: boolean
  activeShowId: string | null
  showCreation: { previousShowId: string | null } | null
  showHistories: Record<string, ShowHistory>
  stockShowDrafts: Record<string, ShowRecord>
  // The most recent persistence write that failed and rolled back (#792).
  // Holds the rejected record so the notice can offer a retry.
  showSaveFailure: { showId: string; record: ShowRecord } | null
  loadShows: () => Promise<void>
  createNewShow: (input: { name?: string; outputContract: ShowOutputContract }) => Promise<ShowRecord>
  createShowFromController: (profile: ControllerProfile) => Promise<ShowRecord>
  beginShowCreation: () => void
  cancelShowCreation: () => void
  openShow: (id: string | null) => Promise<void>
  addShow: (record: ShowRecord) => Promise<void>
  addImportedShow: (record: ShowRecord) => Promise<void>
  renameShow: (id: string, name: string) => Promise<void>
  removeShow: (id: string) => Promise<void>
  /**
   * Persists a copy of a personal Show or of a built-in's current session
   * draft under a fresh identity (#794). Callers displaying a transient
   * projection (built-in Pattern-slot selections) pass it as sourceRecord so
   * the copy keeps what the user sees. Resolves null when the source is
   * unknown or the create fails.
   */
  duplicateShow: (sourceId: string, sourceRecord?: ShowRecord) => Promise<ShowRecord | null>
  updateShow: (id: string, next: ShowRecord) => Promise<void>
  // Resolves the record an edit operation should start from: a personal
  // record, an in-memory built-in draft, or the pristine built-in fixture.
  resolveEditableShow: (id: string) => ShowRecord | undefined
  resetStockShowDraft: (id: string) => void
  updateStageMap: (showId: string, stageMapId: string | null) => Promise<void>
  addScene: (showId: string) => Promise<void>
  duplicateScene: (showId: string, sceneId: string) => Promise<void>
  cloneClip: (showId: string, cellId: string) => Promise<ShowCell | null>
  moveClip: (showId: string, cellId: string, zoneId: string, sceneId: string) => Promise<boolean>
  removeScene: (showId: string, sceneId: string) => Promise<void>
  updateScene: (showId: string, sceneId: string, changes: Partial<Omit<ShowScene, 'id'>>) => Promise<void>
  updateTransition: (
    showId: string,
    sceneId: string,
    kind: ShowTransitionKind,
    durationMs: number,
    feather?: number,
    portal?: Partial<ShowPortalSettings>,
  ) => Promise<void>
  removeClip: (showId: string, clipId: string) => Promise<void>
  placeClip: (
    showId: string,
    zoneId: string,
    sceneId: string,
    patch: Pick<ShowCell, 'pattern' | 'patternName'>,
  ) => Promise<ShowCell | null>
  updateCellAdaptations: (
    showId: string,
    cellId: string,
    changes: Partial<ShowCellAdaptations>,
  ) => Promise<void>
  updateCellEffects: (showId: string, cellId: string, effects: ShowClipEffect[]) => Promise<void>
  updateCellPattern: (
    showId: string,
    cellId: string,
    patch: Pick<ShowCell, 'pattern' | 'patternName'>,
  ) => Promise<void>
  updateCellControlTarget: (showId: string, cellId: string, exportName: string, value: number | undefined) => Promise<void>
  updateCellRestartOnEntry: (showId: string, cellId: string, restartOnEntry: boolean) => Promise<void>
  updateBoundaryTransition: (
    showId: string,
    transitionId: string,
    changes: Partial<Omit<ShowBoundaryTransition, 'id' | 'afterSceneId'>>,
  ) => Promise<void>
  removeBoundaryTransition: (showId: string, transitionId: string) => Promise<void>
  splitAtTime: (showId: string, atMs: number) => Promise<void>
  extendCell: (showId: string, cellId: string, sceneSpan: number) => Promise<void>
  spanCellZones: (showId: string, cellId: string, zoneSpan: number) => Promise<void>
  updateCellZoneMode: (showId: string, cellId: string, zoneMode: NonNullable<ShowCell['zoneMode']>) => Promise<void>
  addZone: (showId: string) => Promise<void>
  updateZone: (showId: string, zoneId: string, changes: Partial<Omit<ShowZone, 'id'>>) => Promise<void>
  removeZone: (showId: string, zoneId: string) => Promise<void>
  /** Resolves with the new Zone Layout's id so callers can select what they just defined. */
  addRoutingLayout: (showId: string, sourceLayoutId?: string) => Promise<string | null>
  updateRoutingLayout: (showId: string, layoutId: string, changes: Partial<Omit<ShowRoutingLayout, 'id'>>) => Promise<void>
  removeRoutingLayout: (showId: string, layoutId: string) => Promise<void>
  updateRoutingSwitch: (showId: string, afterSceneId: string, layoutId: string | null) => Promise<void>
  undoShow: (showId: string) => Promise<boolean>
  redoShow: (showId: string) => Promise<boolean>
  dismissShowSaveFailure: () => void
  /** Re-applies the rolled-back record; a still-failing write keeps the notice without rejecting. */
  retryShowSaveFailure: () => Promise<void>
  acquireShowEditActivity: (sessionId: string, showId: string, kind: ShowEditActivity['kind']) => ShowEditActivity | undefined
  releaseShowEditActivity: (token: ShowEditActivity) => void
  deliverShowEditCandidate: (request: ShowEditRequest, candidate: unknown, validate: (candidate: ShowRecord, current: ShowRecord) => boolean, validateRaw?: (candidate: unknown) => boolean) => ShowInputWaitReceipt
  invalidateShowEditCandidate: (request: ShowEditRequest) => ShowEditReceipt | undefined
  readShowEditCandidate: (sessionId: string, operationId: string) => ShowInputWaitReceipt | undefined
}

export interface ShowHistory {
  past: ShowRecord[]
  future: ShowRecord[]
}

export type { ShowRecord }

export const showInitialState = {
  showRevisions: {} as Record<string, number>,
  shows: [] as ShowRecord[],
  showsLoaded: false,
  activeShowId: null as string | null,
  showCreation: null as { previousShowId: string | null } | null,
  showHistories: {} as Record<string, ShowHistory>,
  // Session-only working copies of built-in Shows. Never persisted: a reload
  // resets every built-in to its pristine catalogue definition.
  stockShowDrafts: {} as Record<string, ShowRecord>,
  showSaveFailure: null as { showId: string; record: ShowRecord } | null,
}

// Convenience mutators resolve quietly when persistence fails (#792): the
// rollback plus showSaveFailure already report the failure, and their UI
// callers discard the promise or gate on a returned value. Only the
// updateShow primitive keeps rejecting, for callers that await it directly.
async function updateShowQuietly(
  updateShow: (id: string, next: ShowRecord) => Promise<void>,
  id: string,
  next: ShowRecord,
): Promise<boolean> {
  try {
    await updateShow(id, next)
    return true
  } catch {
    return false
  }
}

export const useShowStore = create<ShowState>()((set, get, api) => {
  let editSession: ShowEditSession | undefined
  const inputWait = createShowInputWait(() => editSession)
  const resizeAdmission = createShowResizeAdmission({
    inputWait,
    session: () => editSession,
    current: id => get().resolveEditableShow(id),
    revision: id => get().showRevisions[id] ?? 0,
    subscribe: listener => api.subscribe(listener),
    missing: id => showsPendingDeletion.has(id),
    adopt: (id, next, settle) => updateShowRecord(id, next, settle),
    isStock: id => !!stockShowById(id),
  })
  const revisionPatch = (state: ShowState, id: string) => ({
    showRevisions: { ...state.showRevisions, [id]: (state.showRevisions[id] ?? 0) + 1 },
  })
  // All personal replacement paths use this one adoption and recovery policy.
  // The ordering stamp is assigned here, where V2 accepts the replacement;
  // manual and agent callers cannot accidentally retain a captured stamp.
  const adoptPersonalShowReplacement = async (
    id: string,
    replacement: ShowRecord,
    history: ShowHistory,
    fallback: { record: ShowRecord; history: ShowHistory },
    onSettlement?: (settlement: Exclude<ShowEditSettlement, 'saving' | 'draft'>) => void,
  ): Promise<void> => {
    const adopted = replacementWithNextOrderingStamp(fallback.record, replacement)
    set((state) => ({
      ...revisionPatch(state, id),
      shows: replaceShowRecord(state.shows, adopted),
      showHistories: { ...state.showHistories, [id]: history },
      ...(state.showSaveFailure?.showId === id ? { showSaveFailure: null } : {}),
    }))
    try {
      await persistShowRecord(adopted)
      advanceDurableBaseline(id, adopted, history)
      set((state) => ({
        // A hydration that observed this exact ordering stamp may have reset
        // its session history. Restore the matching pair only while no later
        // accepted replacement has superseded it.
        ...(state.showHistories[id] === undefined
          && state.shows.find((show) => show.id === id)?.updatedAt === adopted.updatedAt
          ? { showHistories: { ...state.showHistories, [id]: history } }
          : {}),
      }))
      onSettlement?.(get().shows.find((show) => show.id === id)?.updatedAt === adopted.updatedAt ? 'saved' : 'superseded')
    } catch (cause) {
      resizeAdmission.invalidate(id)
      inputWait.invalidate(id)
      let rolledBack = false
      set((state) => {
        const current = state.shows.find((show) => show.id === id)
        // Within this client every accepted replacement receives a strictly
        // increasing stamp. Equality identifies the failed adoption without
        // treating the timestamp as a cross-client document revision (#802).
        if (current?.updatedAt !== adopted.updatedAt) return state
        rolledBack = true
        const durable = lastPersistedShowRecords.get(id)
        return {
          ...revisionPatch(state, id),
          shows: replaceShowRecord(state.shows, durable?.record ?? fallback.record),
          showHistories: { ...state.showHistories, [id]: durable?.history ?? fallback.history },
          showSaveFailure: { showId: id, record: adopted },
        }
      })
      onSettlement?.(rolledBack ? 'rolled-back' : 'superseded')
      if (rolledBack) throw cause
    }
  }

  const updateShowRecord = async (
    id: string,
    next: ShowRecord,
    onSettlement?: (settlement: Exclude<ShowEditSettlement, 'saving'>) => void,
  ): Promise<void> => {
    if (stockShowById(id)) {
      const previousRecord = get().resolveEditableShow(id)
      if (!previousRecord || next === previousRecord) return
      next = reconcileShowExecutionModelOnCastReturn(previousRecord, forfeitShowExecutionModelOnCastChange(previousRecord, next))
      const previous = normalizeShowRecord(previousRecord)
      const adopted = replacementWithNextOrderingStamp(previous, next)
      const previousHistory = get().showHistories[id] ?? { past: [], future: [] }
      set((state) => ({
        ...revisionPatch(state, id),
        stockShowDrafts: { ...state.stockShowDrafts, [id]: adopted },
        showHistories: {
          ...state.showHistories,
          [id]: { past: [...previousHistory.past, previous], future: [] },
        },
      }))
      onSettlement?.('draft')
      return
    }
    if (showsPendingDeletion.has(id)) return
    const previousRecord = get().shows.find((show) => show.id === id)
    if (!previousRecord || next === previousRecord) return
    next = reconcileShowExecutionModelOnCastReturn(previousRecord, forfeitShowExecutionModelOnCastChange(previousRecord, next))
    const previous = normalizeShowRecord(previousRecord)
    const previousHistory = get().showHistories[id] ?? { past: [], future: [] }
    const optimisticHistory = { past: [...previousHistory.past, previous], future: [] }
    await adoptPersonalShowReplacement(id, next, optimisticHistory, {
      record: previous,
      history: previousHistory,
    }, onSettlement)
  }

  return {
  ...showInitialState,
  acquireShowEditActivity: (sessionId, showId, kind) => inputWait.acquire(sessionId, showId, kind),
  releaseShowEditActivity: token => inputWait.releaseActivity(token),
  readShowEditCandidate: (sessionId, id) => editSession?.sessionId === sessionId ? inputWait.read(id) : undefined,
  deliverShowEditCandidate: (request, candidate, validate, validateRaw) => {
    const arrivedAt = performance.now()
    if (resizeAdmission.owns(request.operationId)) return { request, status: 'refused', reason: 'invalid-candidate' }
    const capturedRequest = structuredClone(request)
    const capturedSession = editSession
    let capturedCandidate: ShowRecord
    let identity: string
    try {
      capturedCandidate = structuredClone(candidate) as ShowRecord
      identity = JSON.stringify(capturedCandidate) ?? 'undefined'
    } catch {
      return { request, status: 'refused', reason: 'invalid-candidate' }
    }
    return inputWait.deliver(capturedRequest, identity, arrivedAt,
      timing => get().admitShowEdit(capturedRequest, () => capturedCandidate, (next, current) => {
        const valid = validate(next, current)
        if (timing.kind === 'after-active-input' && performance.now() >= timing.deadline) capturedSession?.refuse(capturedRequest.operationId, 'interaction-timeout')
        return valid
      }),
      () => {
        const checked = editSession!.check(capturedRequest, { sessionId: editSession!.sessionId, showId: editSession!.showId, revision: get().showRevisions[capturedRequest.showId] ?? 0 })
        if (checked.status !== 'pending') return checked
        try {
          if (!capturedCandidate || capturedCandidate.id !== request.showId || (validateRaw && !validateRaw(capturedCandidate))) return editSession!.refuse(request.operationId, 'invalid-candidate')!
        } catch { return editSession!.refuse(request.operationId, 'invalid-candidate')! }
        return checked
      })
  },
  invalidateShowEditCandidate: request => {
    const session = editSession
    if (!session || session.sessionId !== request.sessionId) return undefined
    if (resizeAdmission.owns(request.operationId)) return { request, status: 'refused', reason: 'invalid-candidate' }
    const checked = session.checkIdentity(request, session)
    if (checked !== session.read(request.operationId) || checked.status !== 'pending') return checked
    inputWait.release(request.operationId)
    return session.refuse(request.operationId, 'invalid-candidate')
  },
  beginResolvedShowResize: (sessionId, intent) => resizeAdmission.begin(sessionId, intent),
  admitResolvedShowResize: request => resizeAdmission.admit(request),

  beginShowEditSession: (showId, capacity) => {
    resizeAdmission.retire()
    inputWait.retire()
    editSession?.retire()
    editSession = createShowEditSession(crypto.randomUUID(), showId, capacity)
    return editSession.sessionId
  },
  retireShowEditSession: (sessionId) => {
    if (editSession?.sessionId !== sessionId) return
    resizeAdmission.retire()
    inputWait.retire()
    editSession.retire()
    editSession = undefined
  },
  beginShowEdit: (sessionId, intent) => {
    if (!editSession || editSession.sessionId !== sessionId) {
      return { status: 'retired', request: { ...intent, targets: [...intent.targets], sessionId, showId: '', baseRevision: -1 } }
    }
    const result = editSession.begin(intent, get().showRevisions[editSession.showId] ?? 0)
    if (result.status === 'pending' && (!get().resolveEditableShow(editSession.showId) || showsPendingDeletion.has(editSession.showId))) {
      return editSession.refuse(intent.operationId, 'missing-show') ?? result
    }
    return result
  },
  readShowEdit: (sessionId, operationId) => editSession?.sessionId === sessionId ? editSession.read(operationId) : undefined,
  cancelShowEdit: (sessionId, operationId) => {
    if (editSession?.sessionId !== sessionId) return undefined
    resizeAdmission.release(operationId)
    inputWait.release(operationId)
    return editSession.cancel(operationId)
  },
  admitShowEdit: (request, evaluate, validate) => {
    const session = editSession
    if (!session || session.sessionId !== request.sessionId) return { request, status: 'retired' }
    if (resizeAdmission.owns(request.operationId) || inputWait.owns(request.operationId)) return { request, status: 'refused', reason: 'invalid-candidate' }
    const eligibility = () => ({ sessionId: session.sessionId, showId: session.showId, revision: get().showRevisions[session.showId] ?? 0 })
    const checked = session.check(request, eligibility())
    if (checked.status !== 'pending') return checked
    const current = get().resolveEditableShow(request.showId)
    if (!current || showsPendingDeletion.has(request.showId)) return session.refuse(request.operationId, 'missing-show')!
    let candidate: ShowRecord
    try {
      const privateCurrent = structuredClone(current)
      const evaluated = evaluate(privateCurrent)
      if (!evaluated || evaluated === privateCurrent) return session.refuse(request.operationId, 'no-candidate')!
      candidate = normalizeShowRecord(reconcileShowExecutionModelOnCastReturn(current, forfeitShowExecutionModelOnCastChange(current, structuredClone(evaluated))))
      if (candidate.id !== request.showId || validate(structuredClone(candidate), structuredClone(current)) !== true) {
        return session.refuse(request.operationId, 'invalid-candidate')!
      }
    } catch {
      return session.refuse(request.operationId, 'invalid-candidate')!
    }
    // Recheck after trusted synchronous callbacks in case they reentered the store.
    if (editSession !== session) return { request, status: 'retired' }
    const rechecked = session.check(request, eligibility())
    if (rechecked.status !== 'pending') return rechecked
    const adopted = session.adopted(request.operationId, stockShowById(request.showId) ? 'draft' : 'saving')
    void updateShowRecord(request.showId, candidate, (settlement) => {
      if (settlement !== 'draft') session.settle(request.operationId, settlement)
    }).catch(() => { /* Store recovery notice and receipt own the failure. */ })
    return adopted
  },
  completeShowEdit: (request, completion) => {
    const session = editSession
    if (!session || session.sessionId !== request.sessionId) return { request, status: 'retired' }
    const checked = session.checkIdentity(request, { sessionId: session.sessionId, showId: session.showId })
    if (checked.status !== 'pending') return checked
    if (!['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused', 'service-failed'].includes(completion)) return { request, status: 'refused', reason: 'identity-mismatch' }
    resizeAdmission.release(request.operationId)
    inputWait.release(request.operationId)
    return session.complete(request.operationId, completion)!
  },

  loadShows: async () => {
    resizeAdmission.invalidate()
    inputWait.invalidate()
    const hydration = (async () => {
    const shows = (await getPersonalContentProvider().listShows())
      .map(normalizeShowRecord)
    resizeAdmission.invalidate()
    inputWait.invalidate()
    set((state) => ({
      ...reconcileHydratedShows(state, shows),
      showRevisions: Object.fromEntries(
        [...new Set([...Object.keys(state.showRevisions), ...state.shows.map((show) => show.id), ...shows.map((show) => show.id)])]
          .map((id) => [id, (state.showRevisions[id] ?? 0) + 1]),
      ),
      showsLoaded: true,
    }))
    })()
    showsHydration = hydration
    try {
      await hydration
    } finally {
      if (showsHydration === hydration) showsHydration = null
    }
  },

  createNewShow: async (input) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(input?.name?.trim() || 'Untitled Show', get().shows.map((show) => show.name))
    const show = createShowWithOutputContract(id, name, input.outputContract)
    await get().addShow(show)
    return show
  },

  createShowFromController: async (profile) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(`${profile.name} Show`, get().shows.map((show) => show.name))
    const stageMapId = importedStageMapIdForController(profile, useMapStore.getState().userMaps)
    const pixelCount = profile.lastKnownPixelCount ?? 60
    // The single seeded zone and its Default layout must cover the contract's
    // complete output, so the Show compiles without manual range repair (#775
    // review P2). createShowWithOutputContract sizes both from the contract.
    const show = {
      ...createShowWithOutputContract(
        id,
        name,
        createInstallationShowOutputContract({ outputMapId: stageMapId, pixelCount }),
      ),
      targetControllerProfileId: profile.id,
    }
    await get().addShow(show)
    return show
  },

  beginShowCreation: () => {
    if (get().showCreation) return
    if (editSession) get().retireShowEditSession(editSession.sessionId)
    set({ showCreation: { previousShowId: get().activeShowId } })
  },

  cancelShowCreation: () => {
    const creation = get().showCreation
    if (!creation) return
    set({ activeShowId: creation.previousShowId, showCreation: null })
  },

  openShow: async (id) => {
    if (id === null) {
      if (editSession) get().retireShowEditSession(editSession.sessionId)
      set({ activeShowId: null, showCreation: null })
      return
    }
    if (get().activeShowId === id) return
    const show = get().shows.find((candidate) => candidate.id === id)
    if (!show) return
    if (editSession && editSession.showId !== id) get().retireShowEditSession(editSession.sessionId)
    set({ activeShowId: id, showCreation: null })
    getPersonalContentProvider().setLastActive({ type: 'show', id }).catch(() => {})
  },

  addShow: async (record) => {
    // A stale list snapshot resolving after this create would drop the new
    // record from state; wait for the hydration to apply first (#794).
    if (showsHydration) await showsHydration.catch(() => {})
    await getPersonalContentProvider().createShow(record)
    lastPersistedShowRecords.set(record.id, { record: normalizeShowRecord(record), history: { past: [], future: [] } })
    trackEntityCreated('show')
    set((state) => ({ ...revisionPatch(state, record.id), shows: [record, ...state.shows], showsLoaded: true }))
  },

  addImportedShow: async (record) => {
    await get().addShow(record)
  },

  renameShow: async (id, name) => {
    const existing = get().resolveEditableShow(id)
    if (!existing || existing.name === name) return
    const next = { ...existing, name, updatedAt: Date.now() }
    await updateShowQuietly(get().updateShow, id, next)
  },

  removeShow: async (id) => {
    if (showsPendingDeletion.has(id)) return
    resizeAdmission.invalidate(id)
    inputWait.invalidate(id)
    showsPendingDeletion.add(id)
    set((state) => revisionPatch(state, id))
    try {
      await deletePersistedShow(id)
      lastPersistedShowRecords.delete(id)
      set((state) => {
        const showHistories = { ...state.showHistories }
        delete showHistories[id]
        return {
          shows: state.shows.filter((show) => show.id !== id),
          activeShowId: state.activeShowId === id ? null : state.activeShowId,
          showHistories,
          ...(state.showSaveFailure?.showId === id ? { showSaveFailure: null } : {}),
        }
      })
    } finally {
      showsPendingDeletion.delete(id)
    }
  },

  duplicateShow: async (sourceId, sourceRecord) => {
    if (showsHydration) await showsHydration.catch(() => {})
    const source = sourceRecord ?? get().resolveEditableShow(sourceId)
    if (!source) return null
    const record = {
      ...source,
      id: newPersonalContentId(),
      name: uniquePatternName(`${source.name} copy`, get().shows.map((show) => show.name)),
      updatedAt: Date.now(),
    }
    try {
      await get().addShow(record)
    } catch {
      return null
    }
    return record
  },

  resolveEditableShow: (id) => {
    const state = get()
    return state.shows.find((show) => show.id === id)
      ?? state.stockShowDrafts[id]
      ?? stockShowById(id)?.show
  },

  resetStockShowDraft: (id) => set((state) => {
    resizeAdmission.invalidate(id)
    inputWait.invalidate(id)
    if (!(id in state.stockShowDrafts)) return state
    const stockShowDrafts = { ...state.stockShowDrafts }
    delete stockShowDrafts[id]
    const showHistories = { ...state.showHistories }
    delete showHistories[id]
    return { ...revisionPatch(state, id), stockShowDrafts, showHistories }
  }),

  updateShow: (id, next) => updateShowRecord(id, next),

  dismissShowSaveFailure: () => set({ showSaveFailure: null }),

  retryShowSaveFailure: async () => {
    const failure = get().showSaveFailure
    if (!failure) return
    // A still-failing write re-records showSaveFailure; the notice stays up.
    await updateShowQuietly(get().updateShow, failure.showId, { ...failure.record, updatedAt: Date.now() })
  },

  updateStageMap: async (showId, stageMapId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, { ...show, stageMapId, updatedAt: Date.now() })
  },

  addScene: async (showId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, addShowScene(show))
  },

  duplicateScene: async (showId, sceneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, duplicateShowScene(show, sceneId))
  },

  cloneClip: async (showId, cellId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return null
    const next = cloneShowCellAfter(show, cellId)
    if (next === show) return null
    if (!(await updateShowQuietly(get().updateShow, showId, next))) return null
    return next.cells.find((cell) => !show.cells.some((previous) => previous.id === cell.id)) ?? null
  },

  moveClip: async (showId, cellId, zoneId, sceneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return false
    const next = moveShowCellToSlot(show, cellId, zoneId, sceneId)
    if (next === show) return false
    return updateShowQuietly(get().updateShow, showId, next)
  },

  removeScene: async (showId, sceneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowScene(show, sceneId))
  },

  updateScene: async (showId, sceneId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowScene(show, sceneId, changes))
  },

  updateTransition: async (showId, sceneId, kind, durationMs, feather, portal) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowTransition(show, sceneId, kind, durationMs, feather, portal))
  },

  removeClip: async (showId, clipId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowClip(show, clipId))
  },

  placeClip: async (showId, zoneId, sceneId, patch) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return null
    const next = placeShowClip(show, zoneId, sceneId, patch)
    if (next === show) return null
    if (!(await updateShowQuietly(get().updateShow, showId, next))) return null
    return showCellAtSlot(next, zoneId, sceneId) ?? null
  },

  updateCellAdaptations: async (showId, cellId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellAdaptations(show, cellId, changes))
  },

  updateCellEffects: async (showId, cellId, effects) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellEffects(show, cellId, effects))
  },

  updateCellControlTarget: async (showId, cellId, exportName, value) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellControlTarget(show, cellId, exportName, value))
  },

  updateCellPattern: async (showId, cellId, patch) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellPattern(show, cellId, patch))
  },

  updateCellRestartOnEntry: async (showId, cellId, restartOnEntry) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellRestartOnEntry(show, cellId, restartOnEntry))
  },

  updateBoundaryTransition: async (showId, transitionId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowBoundaryTransition(show, transitionId, changes))
  },

  removeBoundaryTransition: async (showId, transitionId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowBoundaryTransition(show, transitionId))
  },

  splitAtTime: async (showId, atMs) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    const next = splitShowAtTime(show, atMs)
    if (next === show) return
    await updateShowQuietly(get().updateShow, showId, next)
  },

  extendCell: async (showId, cellId, sceneSpan) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, extendShowCell(show, cellId, sceneSpan))
  },

  spanCellZones: async (showId, cellId, zoneSpan) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, spanShowCellZones(show, cellId, zoneSpan))
  },

  updateCellZoneMode: async (showId, cellId, zoneMode) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowCellZoneMode(show, cellId, zoneMode))
  },

  addZone: async (showId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, addShowZone(show))
  },

  updateZone: async (showId, zoneId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowZone(show, zoneId, changes))
  },

  removeZone: async (showId, zoneId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowZone(show, zoneId))
  },

  addRoutingLayout: async (showId, sourceLayoutId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return null
    const next = addShowRoutingLayout(show, undefined, sourceLayoutId)
    if (!(await updateShowQuietly(get().updateShow, showId, next))) return null
    return next.routingLayouts[next.routingLayouts.length - 1]?.id ?? null
  },

  updateRoutingLayout: async (showId, layoutId, changes) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowRoutingLayout(show, layoutId, changes))
  },

  removeRoutingLayout: async (showId, layoutId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, removeShowRoutingLayout(show, layoutId))
  },

  updateRoutingSwitch: async (showId, afterSceneId, layoutId) => {
    const show = get().resolveEditableShow(showId)
    if (!show) return
    await updateShowQuietly(get().updateShow, showId, updateShowRoutingSwitch(show, afterSceneId, layoutId))
  },

  undoShow: async (showId) => {
    if (showsPendingDeletion.has(showId)) return false
    const show = get().resolveEditableShow(showId)
    const history = get().showHistories[showId]
    const snapshot = history?.past[history.past.length - 1]
    if (!show || !history || !snapshot) return false
    const replacement = normalizeShowRecord(snapshot)
    const nextHistory = {
      past: history.past.slice(0, -1),
      future: [normalizeShowRecord(show), ...history.future],
    }
    if (stockShowById(showId)) {
      const next = replacementWithNextOrderingStamp(show, replacement)
      set((state) => ({
        ...revisionPatch(state, showId),
        stockShowDrafts: { ...state.stockShowDrafts, [showId]: next },
        showHistories: { ...state.showHistories, [showId]: nextHistory },
      }))
      return true
    }
    try {
      await adoptPersonalShowReplacement(showId, replacement, nextHistory, { record: show, history })
      return true
    } catch {
      return false
    }
  },

  redoShow: async (showId) => {
    if (showsPendingDeletion.has(showId)) return false
    const show = get().resolveEditableShow(showId)
    const history = get().showHistories[showId]
    const snapshot = history?.future[0]
    if (!show || !history || !snapshot) return false
    const replacement = normalizeShowRecord(snapshot)
    const nextHistory = {
      past: [...history.past, normalizeShowRecord(show)],
      future: history.future.slice(1),
    }
    if (stockShowById(showId)) {
      const next = replacementWithNextOrderingStamp(show, replacement)
      set((state) => ({
        ...revisionPatch(state, showId),
        stockShowDrafts: { ...state.stockShowDrafts, [showId]: next },
        showHistories: { ...state.showHistories, [showId]: nextHistory },
      }))
      return true
    }
    try {
      await adoptPersonalShowReplacement(showId, replacement, nextHistory, { record: show, history })
      return true
    } catch {
      return false
    }
  },
  }
})

function replaceShowRecord(shows: ShowRecord[], next: ShowRecord): ShowRecord[] {
  return shows
    .map((show) => show.id === next.id ? next : show)
    .sort((a, b) => b.updatedAt - a.updatedAt)
}

function reconcileHydratedShows(
  state: Pick<ShowState, 'shows' | 'showHistories'>,
  hydrated: ShowRecord[],
): Pick<ShowState, 'shows' | 'showHistories'> {
  const staleHistoryIds = new Set<string>()
  const hydratedIds = new Set(hydrated.map((show) => show.id))
  const nextBaselines = new Map<string, { record: ShowRecord; history: ShowHistory }>()

  const shows = hydrated.map((show) => {
    const existing = lastPersistedShowRecords.get(show.id)
    const current = state.shows.find((candidate) => candidate.id === show.id)
    const currentHistory = state.showHistories[show.id] ?? { past: [], future: [] }
    const keepPending = showPersistenceQueues.has(show.id)
      && current !== undefined
      && current.updatedAt >= show.updatedAt
    const baselineHistory = keepPending && current?.updatedAt === show.updatedAt
      ? currentHistory
      : existing?.record.updatedAt === show.updatedAt
        ? existing.history
        : { past: [], future: [] }
    nextBaselines.set(show.id, { record: show, history: baselineHistory })

    if (keepPending) return current!
    if (!existing || existing.record.updatedAt !== show.updatedAt) staleHistoryIds.add(show.id)
    return show
  })

  // A list snapshot may omit a record whose local write has not reached the
  // provider yet. Keep that accepted replacement until its queued outcome is
  // known. Non-pending personal records omitted by hydration lose stale
  // history; stock draft histories are not members of state.shows and remain.
  for (const current of state.shows) {
    if (hydratedIds.has(current.id)) continue
    if (showPersistenceQueues.has(current.id)) {
      shows.push(current)
      const existing = lastPersistedShowRecords.get(current.id)
      if (existing) nextBaselines.set(current.id, existing)
    } else {
      staleHistoryIds.add(current.id)
    }
  }

  lastPersistedShowRecords.clear()
  for (const [id, baseline] of nextBaselines) lastPersistedShowRecords.set(id, baseline)
  return {
    shows: shows.sort((a, b) => b.updatedAt - a.updatedAt),
    showHistories: Object.fromEntries(
      Object.entries(state.showHistories).filter(([id]) => !staleHistoryIds.has(id)),
    ),
  }
}

function normalizeShowRecord(show: ShowRecord): ShowRecord {
  const normalized = normalizeShowEntryState(normalizeShowTransitionState(show))
  return normalized.composition
    ? { ...normalized, composition: normalizeShowComposition(normalized, normalized.composition) }
    : withoutComposition(normalized)
}

function showPersistenceChanges(next: ShowRecord): Partial<Omit<ShowRecord, 'id'>> {
  return {
    name: next.name,
    scenes: next.scenes,
    zones: next.zones,
    cells: next.cells,
    routingLayouts: next.routingLayouts,
    transitions: next.transitions,
    composition: next.composition ?? null,
    outputEffects: next.outputEffects,
    targetControllerProfileId: next.targetControllerProfileId,
    stageMapId: next.stageMapId ?? null,
    outputContract: next.outputContract,
    importMetadata: next.importMetadata,
    updatedAt: next.updatedAt,
  }
}

function withoutComposition(show: ShowRecord): ShowRecord {
  const { composition: _composition, ...flat } = show
  return flat
}

async function persistShowRecord(next: ShowRecord): Promise<void> {
  await queueShowPersistence(next.id, () => (
    getPersonalContentProvider().updateShow(next.id, showPersistenceChanges(next))
  ))
}

async function deletePersistedShow(id: string): Promise<void> {
  await queueShowPersistence(id, () => getPersonalContentProvider().deleteShow(id))
}

async function queueShowPersistence(id: string, operation: () => Promise<void>): Promise<void> {
  const previous = showPersistenceQueues.get(id) ?? Promise.resolve()
  const persistence = previous
    .catch(() => undefined)
    .then(operation)
  showPersistenceQueues.set(id, persistence)
  try {
    await persistence
  } finally {
    if (showPersistenceQueues.get(id) === persistence) showPersistenceQueues.delete(id)
  }
}
