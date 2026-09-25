import { create } from 'zustand'
import { trackEntityCreated } from '@/analytics'
import {
  importedStageMapIdForController,
  normalizeShowEntryState,
  normalizeShowTransitionState,
} from '@/engine/showModel'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { ShowV1RetiredError } from '@/engine/remotePersonalContentProvider'
import type { ShowRecord, ShowOutputContract } from '@/engine/personalContentRecords'
import { type ControllerProfile } from '@/engine/controllerProfile'
import { newPersonalContentId } from '@/engine/personalContentMetadata'
import { uniquePatternName } from '@/engine/patternName'
import { useMapStore } from '@/store/mapStore'
import { createInstallationShowOutputContract } from '@/engine/showOutputContract'
import { normalizeShowComposition } from '@/engine/showCompositionModel'
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import {
  createShowEditSession,
  type ShowEditIntent,
  type ShowEditRequest,
  type ShowEditReceipt,
  type ShowEditSession,
  type ShowEditSettlement,
} from '@/engine/showEditAdmission'
import { createShowV2CandidateAdmission, type ShowV2CandidateDelivery } from './showV2CandidateAdmission'
import { createShowInputWait, type ShowEditActivity, type ShowInputWaitReceipt } from '@/engine/showInputWait'
import type { ShowEditDiagnosticInput } from '@/engine/showEditDiagnostic'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { cloneValidShowRecordV2 } from '@/engine/showDocument'
import { applyShowCommandV2 } from '@/engine/showCommandsV2/registry'
import { createShowV2WithOutputContract } from '@/engine/showCreationV2'
import { isShowV2RouteEnabled } from '@/engine/showV2RouteGate'
import type { ShowV1ToV2Issue } from '@/engine/showRecordV1ToV2'
import {
  editedHistory,
  hasQueuedShowPersistence,
  nextShowOrderingStamp,
  queueShowPersistence,
  redoHistory,
  undoHistory,
  type DocumentHistory,
} from './showReplacementPolicy'

const showsPendingDeletion = new Set<string>()
// The in-flight loadShows, so record creation can wait for hydration to
// apply instead of racing a stale list snapshot (#794).
let showsHydration: Promise<void> | null = null
// The last record each v2 Show is known to hold durably, paired with the undo
// history that belongs to it (#792): rollback after a failed write restores
// this pair, never an unpersisted optimistic intermediate or a history that
// could replay one.
const lastPersistedShowV2Pilots = new Map<string, { record: ShowRecordV2; history: ShowV2History }>()
let showV2WorkspaceGeneration = 0

// Advance the durable baseline for a completed write, but never behind the
// latest ordering stamp observed by this client.
//
// updatedAt is only a single-client ordering stamp, not a document revision.
// Cross-client revisions and clock-skew-safe ordering remain #802.
function advanceDurableShowV2Baseline(id: string, record: ShowRecordV2, history: ShowV2History): void {
  const baseline = lastPersistedShowV2Pilots.get(id)
  if (!baseline || baseline.record.updatedAt <= record.updatedAt) {
    lastPersistedShowV2Pilots.set(id, { record, history })
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
  /** @deprecated v1: unreachable from the UI since #1042 Phase 1b; deleted in Phase 2 */
  shows: ShowRecord[]
  showsLoaded: boolean
  activeShowId: string | null
  showCreation: { previousShowId: string | null } | null
  showV2Pilots: Record<string, ShowRecordV2>
  showV2Histories: Record<string, ShowV2History>
  showV2SaveFailure: { showId: string; record: ShowRecordV2 } | null
  /**
   * The Show ids whose v2 pilot was opened as a built-in lesson (#1066 slice
   * 11a). Membership is explicit state, never inferred from the id: a pilot
   * placed directly under a built-in id (as agent tests do for channel
   * authority) is personal content and still saves. Lesson pilots are
   * session-only in-memory drafts. Store state, so a reset to
   * `showInitialState` forgets it with the pilots it describes.
   */
  showV2LessonDraftIds: Record<string, true>
  /**
   * The stored v2 rows the Show list offers behind the route gate (#1056
   * slice 6). A v2 row is absent from `shows`, which stays v1-typed until
   * #1039, so the list reads this alongside it rather than through it.
   */
  showV2Rows: ShowV2ListRow[]
  /** A native fresh v2 Show, created and persisted behind the route gate. */
  createNewShowV2: (input: { name?: string; outputContract: ShowOutputContract }) => Promise<ShowRecordV2>
  /** An imported v2 Show, persisted through the same isolated boundary. */
  addImportedShowV2: (record: ShowRecordV2) => Promise<void>
  openShowV2Pilot: (showId: string) => Promise<{ status: 'ready'; record: ShowRecordV2 } | { status: 'refused'; issues: ShowV1ToV2Issue[] }>
  updateShowV2Pilot: (showId: string, next: ShowRecordV2) => Promise<void>
  renameShowV2Pilot: (showId: string, name: string) => Promise<void>
  undoShowV2Pilot: (showId: string) => Promise<boolean>
  redoShowV2Pilot: (showId: string) => Promise<boolean>
  reloadShowV2Pilot: (showId: string) => Promise<ShowRecordV2 | null>
  loadShows: () => Promise<void>
  createShowFromController: (profile: ControllerProfile) => Promise<ShowRecordV2>
  beginShowCreation: () => void
  cancelShowCreation: () => void
  openShow: (id: string | null) => Promise<void>
  /**
   * Drop the v1 selection without touching a session another editor holds.
   * The routed v2 editor and the v1 store share one edit session slot, so
   * `openShow(null)` would retire the v2 route's session; this retires only
   * a session that belongs to the row being deselected (#1039).
   */
  clearActiveShowSelection: () => void
  renameShow: (id: string, name: string) => Promise<void>
  removeShow: (id: string) => Promise<void>
  /**
   * Persists a copy of one stored v2 row under a fresh identity and a free
   * name (#1039). Callers displaying a
   * transient projection (lesson Try with Pattern selections) pass it as
   * sourceRecord so the copy keeps what the user sees. Resolves null when the
   * row is unknown, the workspace cannot store v2 Shows, or the create fails.
   */
  duplicateShowV2Row: (sourceId: string, sourceRecord?: ShowRecordV2) => Promise<ShowRecordV2 | null>
  /**
   * Re-seed one lesson's session-only v2 draft from its built-in copy (#1066
   * slice 11a). A no-op unless the id names a built-in lesson, the pilot was
   * opened as that lesson, and a pilot exists. Otherwise the pilot returns to
   * a fresh clone of the lesson copy with an empty history, and the revision
   * advances. No provider call, exactly as opening the lesson makes none.
   */
  resetShowV2LessonDraft: (id: string) => void
  /**
   * Read-only membership for a session-only v2 lesson draft (#1066 slice
   * 11a). True exactly when the pilot was opened as that built-in lesson;
   * a pilot placed directly under a built-in id by other means is personal
   * content and reads false.
   */
  isShowV2LessonDraft: (id: string) => boolean
  dismissShowV2SaveFailure: () => void
  /** Re-applies the rolled-back v2 record; a still-failing write keeps the notice without rejecting. */
  retryShowV2SaveFailure: () => Promise<void>
  acquireShowEditActivity: (sessionId: string, showId: string, kind: ShowEditActivity['kind']) => ShowEditActivity | undefined
  releaseShowEditActivity: (token: ShowEditActivity) => void
  /**
   * Deliver one complete caller-supplied `ShowRecordV2` candidate (#1039). The
   * v2 route's own edits adopt through `showV2PreparedEditAdmission`, which
   * admits typed intents; this is the same store writer for a candidate an
   * agent command sequence produced outside it.
   */
  deliverShowV2EditCandidate: (delivery: ShowV2CandidateDelivery) => ShowInputWaitReceipt
  invalidateShowEditCandidate: (request: ShowEditRequest, diagnostic?: ShowEditDiagnosticInput) => ShowEditReceipt | undefined
  readShowEditCandidate: (sessionId: string, operationId: string) => ShowInputWaitReceipt | undefined
}

export type ShowV2History = DocumentHistory<ShowRecordV2>

/**
 * Every personal Show the rail lists, in both stored versions (#1039). The
 * organization the rail persists is keyed by these ids, so reconciling it
 * against one collection alone prunes the other's rows.
 */
export function personalShowIds(state: { shows: ShowRecord[]; showV2Rows: ShowV2ListRow[] }): string[] {
  return [...state.shows.map((show) => show.id), ...state.showV2Rows.map((row) => row.id)]
}

/** What the Show list needs of a stored v2 row: its identity and its name. */
export interface ShowV2ListRow {
  id: string
  name: string
  updatedAt: number
}

export type { ShowRecord }

export const showInitialState = {
  showRevisions: {} as Record<string, number>,
  shows: [] as ShowRecord[],
  showsLoaded: false,
  activeShowId: null as string | null,
  showCreation: null as { previousShowId: string | null } | null,
  showV2Pilots: {} as Record<string, ShowRecordV2>,
  showV2Histories: {} as Record<string, ShowV2History>,
  showV2SaveFailure: null as { showId: string; record: ShowRecordV2 } | null,
  showV2LessonDraftIds: {} as Record<string, true>,
  showV2Rows: [] as ShowV2ListRow[],
}

export const useShowStore = create<ShowState>()((set, get) => {
  let editSession: ShowEditSession | undefined
  const inputWait = createShowInputWait(() => editSession)
  // The caller-supplied v2 candidate path (#1039). It shares this store's
  // session, input wait, revisions and adoption, so an agent command sequence
  // and the route's own typed intents are one writer.
  const v2CandidateAdmission = createShowV2CandidateAdmission({
    inputWait,
    session: () => editSession,
    current: id => get().showV2Pilots[id],
    revision: id => get().showRevisions[id] ?? 0,
    missing: id => showsPendingDeletion.has(id),
    adopt: (id, next, settle) => updateShowV2Record(id, next, settle),
    isDraft: id => get().showV2LessonDraftIds[id] === true,
  })
  const revisionPatch = (state: ShowState, id: string) => ({
    showRevisions: { ...state.showRevisions, [id]: (state.showRevisions[id] ?? 0) + 1 },
  })
  // The rail reads `showV2Rows`, so every accepted v2 replacement updates the
  // row it describes; otherwise a renamed Show keeps its old name in the list
  // until the next workspace load (#1039).
  const showV2RowPatch = (state: ShowState, record: ShowRecordV2) => (
    state.showV2Rows.some(row => row.id === record.id)
      ? {
        showV2Rows: state.showV2Rows.map(row => (
          row.id === record.id ? { id: record.id, name: record.name, updatedAt: record.updatedAt } : row
        )),
      }
      : {}
  )
  /** Whether this personal Show is stored as a v2 document rather than a v1 record. */
  const isPersonalShowV2Row = (id: string): boolean => (
    get().showV2LessonDraftIds[id] !== true
    && (get().showV2Pilots[id] !== undefined || get().showV2Rows.some(row => row.id === id))
  )
  /**
   * Rename one stored v2 row. An open Show renames through its own adoption
   * owner, so the edit joins that Show's history and save queue; a listed row
   * that is not open is replaced in place without becoming a working copy.
   */
  const renameShowV2Row = async (showId: string, name: string): Promise<void> => {
    if (get().showV2Pilots[showId]) {
      await get().renameShowV2Pilot(showId, name)
      return
    }
    const row = get().showV2Rows.find(candidate => candidate.id === showId)
    if (!row || row.name === name) return
    const provider = getPersonalContentProvider()
    if (!provider.replaceShowV2 || !provider.listShowDocumentsV2) return
    const workspaceGeneration = showV2WorkspaceGeneration
    const revision = get().showRevisions[showId] ?? 0
    await queueShowPersistence(showId, async () => {
      const current = () => showV2WorkspaceGeneration === workspaceGeneration
        && getPersonalContentProvider() === provider
        && (get().showRevisions[showId] ?? 0) === revision
        && get().showV2Pilots[showId] === undefined
      if (!current()) return
      const stored = (await provider.listShowDocumentsV2!()).find(record => record.id === showId)
      if (!stored || !current()) return
      const next = {
        ...cloneValidShowRecordV2({ ...stored, name }),
        updatedAt: nextShowOrderingStamp(stored.updatedAt),
      }
      await provider.replaceShowV2!(showId, next)
      if (showV2WorkspaceGeneration !== workspaceGeneration || getPersonalContentProvider() !== provider) return
      set(state => ({ ...revisionPatch(state, showId), ...showV2RowPatch(state, next) }))
    })
  }
  const adoptShowV2PilotReplacement = async (
    id: string,
    replacement: ShowRecordV2,
    history: ShowV2History,
    fallback: { record: ShowRecordV2; history: ShowV2History },
    onSettlement?: (settlement: Exclude<ShowEditSettlement, 'saving'>) => void,
  ): Promise<void> => {
    // A lesson draft is session-only: the same synchronous state update as a
    // personal adoption, but no provider check, no queued persistence and no
    // rollback path. The settlement reports the draft.
    const lessonDraft = get().showV2LessonDraftIds[id] === true
    const provider = getPersonalContentProvider()
    const workspaceGeneration = showV2WorkspaceGeneration
    if (!lessonDraft && !provider.replaceShowV2) throw new Error('The active personal-content provider does not support v2 Shows.')
    const validated = cloneValidShowRecordV2(replacement)
    const adopted = { ...validated, updatedAt: nextShowOrderingStamp(fallback.record.updatedAt) }
    set(state => ({
      ...revisionPatch(state, id),
      showV2Pilots: { ...state.showV2Pilots, [id]: adopted },
      showV2Histories: { ...state.showV2Histories, [id]: history },
      ...showV2RowPatch(state, adopted),
      ...(state.showV2SaveFailure?.showId === id ? { showV2SaveFailure: null } : {}),
    }))
    if (lessonDraft) {
      onSettlement?.('draft')
      return
    }
    try {
      await queueShowPersistence(id, () => provider.replaceShowV2!(id, adopted))
      if (showV2WorkspaceGeneration !== workspaceGeneration || getPersonalContentProvider() !== provider) {
        onSettlement?.('superseded')
        return
      }
      advanceDurableShowV2Baseline(id, adopted, history)
      onSettlement?.(get().showV2Pilots[id] === adopted ? 'saved' : 'superseded')
    } catch (cause) {
      if (showV2WorkspaceGeneration !== workspaceGeneration || getPersonalContentProvider() !== provider) {
        onSettlement?.('superseded')
        return
      }
      // A failed v2 save invalidates any candidate still waiting on active
      // input.
      inputWait.invalidate(id)
      let rolledBack = false
      set(state => {
        if (state.showV2Pilots[id]?.updatedAt !== adopted.updatedAt) return state
        rolledBack = true
        const durable = lastPersistedShowV2Pilots.get(id) ?? fallback
        return {
          ...revisionPatch(state, id),
          showV2Pilots: { ...state.showV2Pilots, [id]: durable.record },
          showV2Histories: { ...state.showV2Histories, [id]: durable.history },
          ...showV2RowPatch(state, durable.record),
          showV2SaveFailure: { showId: id, record: adopted },
        }
      })
      onSettlement?.(rolledBack ? 'rolled-back' : 'superseded')
      if (rolledBack) throw cause
    }
  }
  /** One v2 replacement: the validated previous record becomes the Undo base. */
  const updateShowV2Record = async (
    showId: string,
    next: ShowRecordV2,
    onSettlement?: (settlement: Exclude<ShowEditSettlement, 'saving'>) => void,
  ): Promise<void> => {
    const current = get().showV2Pilots[showId]
    if (!current || next === current || next.id !== showId) return
    const previous = cloneValidShowRecordV2(current)
    const previousHistory = get().showV2Histories[showId] ?? { past: [], future: [] }
    await adoptShowV2PilotReplacement(showId, next, editedHistory(previousHistory, previous), { record: previous, history: previousHistory }, onSettlement)
  }

  return {
  ...showInitialState,
  acquireShowEditActivity: (sessionId, showId, kind) => inputWait.acquire(sessionId, showId, kind),
  releaseShowEditActivity: token => inputWait.releaseActivity(token),
  readShowEditCandidate: (sessionId, id) => editSession?.sessionId === sessionId ? inputWait.read(id) : undefined,
  deliverShowV2EditCandidate: delivery => v2CandidateAdmission.deliver(delivery),
  invalidateShowEditCandidate: (request, diagnostic) => {
    const session = editSession
    if (!session || session.sessionId !== request.sessionId) return undefined
    const checked = session.checkIdentity(request, session)
    if (checked !== session.read(request.operationId) || checked.status !== 'pending') return checked
    inputWait.release(request.operationId)
    return session.refuse(request.operationId, 'invalid-candidate', diagnostic)
  },

  beginShowEditSession: (showId, capacity) => {
    inputWait.retire()
    editSession?.retire()
    editSession = createShowEditSession(crypto.randomUUID(), showId, capacity)
    return editSession.sessionId
  },
  retireShowEditSession: (sessionId) => {
    if (editSession?.sessionId !== sessionId) return
    inputWait.retire()
    editSession.retire()
    editSession = undefined
  },
  beginShowEdit: (sessionId, intent) => {
    if (!editSession || editSession.sessionId !== sessionId) {
      return { status: 'retired', request: { ...intent, targets: [...intent.targets], sessionId, showId: '', baseRevision: -1 } }
    }
    const result = editSession.begin(intent, get().showRevisions[editSession.showId] ?? 0)
    // A session belongs to the open v2 working copy of its Show (#1039, #1042).
    const present = get().showV2Pilots[editSession.showId]
    if (result.status === 'pending' && (!present || showsPendingDeletion.has(editSession.showId))) {
      return editSession.refuse(intent.operationId, 'missing-show') ?? result
    }
    return result
  },
  readShowEdit: (sessionId, operationId) => editSession?.sessionId === sessionId ? editSession.read(operationId) : undefined,
  cancelShowEdit: (sessionId, operationId) => {
    if (editSession?.sessionId !== sessionId) return undefined
    inputWait.release(operationId)
    return editSession.cancel(operationId)
  },
  completeShowEdit: (request, completion) => {
    const session = editSession
    if (!session || session.sessionId !== request.sessionId) return { request, status: 'retired' }
    const checked = session.checkIdentity(request, { sessionId: session.sessionId, showId: session.showId })
    if (checked.status !== 'pending') return checked
    if (!['asked', 'refused', 'nothing-applied', 'commit-refused', 'incomplete', 'service-refused', 'service-failed'].includes(completion)) return { request, status: 'refused', reason: 'identity-mismatch' }
    inputWait.release(request.operationId)
    return session.complete(request.operationId, completion)!
  },

  loadShows: async () => {
    inputWait.invalidate()
    // Personal pilots are provider-owned content. Retire them before a workspace
    // reload so a same-id record from the previous account cannot satisfy the
    // next route before its provider has been consulted. Lesson drafts are
    // session-only copies of built-in Shows, so retain them and their history
    // across a reload.
    showV2WorkspaceGeneration += 1
    lastPersistedShowV2Pilots.clear()
    set(state => ({
      showV2Pilots: Object.fromEntries(Object.entries(state.showV2Pilots)
        .filter(([id]) => state.showV2LessonDraftIds[id])),
      showV2Histories: Object.fromEntries(Object.entries(state.showV2Histories)
        .filter(([id]) => state.showV2LessonDraftIds[id])),
      showV2SaveFailure: null,
      showV2Rows: [],
    }))
    const listProvider = getPersonalContentProvider()
    const listGeneration = showV2WorkspaceGeneration
    const hydration = (async () => {
    // The remote provider refuses the retired v1 list (#1042); a workspace
    // then holds no v1 rows and hydrates from the v2 list alone.
    const shows = (await listProvider.listShows().catch((error: unknown) => {
      if (error instanceof ShowV1RetiredError) return []
      throw error
    }))
      .map(normalizeShowRecord)
    // The v2 rows the list offers beside them. They are a separate read
    // because `shows` stays v1-typed until #1039, and the gate keeps the
    // list and the editor route switching together (specification §10).
    const v2Rows = isShowV2RouteEnabled() && listProvider.listShowDocumentsV2
      ? (await listProvider.listShowDocumentsV2().catch(() => []))
        .map((record): ShowV2ListRow => ({ id: record.id, name: record.name, updatedAt: record.updatedAt }))
      : []
    // Rows list newest first, as v1 does (#1117).
    v2Rows.sort((a, b) => b.updatedAt - a.updatedAt)
    // A workspace that changed while the rows were read owns its own listing.
    const currentWorkspace = showV2WorkspaceGeneration === listGeneration
      && getPersonalContentProvider() === listProvider
    inputWait.invalidate()
    set((state) => ({
      ...(currentWorkspace ? { showV2Rows: v2Rows } : {}),
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

  createNewShowV2: async (input) => {
    const provider = getPersonalContentProvider()
    if (!provider.createShowV2) throw new Error('This workspace cannot store version-2 Shows.')
    const id = newPersonalContentId()
    const taken = [...get().shows.map((show) => show.name), ...get().showV2Rows.map((row) => row.name)]
    const name = uniquePatternName(input?.name?.trim() || 'Untitled Show', taken)
    const record = createShowV2WithOutputContract(id, name, input.outputContract)
    await get().addImportedShowV2(record)
    trackEntityCreated('show')
    return record
  },

  addImportedShowV2: async (record) => {
    const provider = getPersonalContentProvider()
    if (!provider.createShowV2) throw new Error('This workspace cannot store version-2 Shows.')
    // A stale list snapshot resolving after this create would drop the new
    // row from state; wait for the hydration to apply first (#794).
    if (showsHydration) await showsHydration.catch(() => {})
    const stored = cloneValidShowRecordV2(record)
    await provider.createShowV2(stored)
    lastPersistedShowV2Pilots.set(stored.id, { record: stored, history: { past: [], future: [] } })
    set((state) => ({
      ...revisionPatch(state, stored.id),
      showV2Rows: [
        { id: stored.id, name: stored.name, updatedAt: stored.updatedAt },
        ...state.showV2Rows.filter((row) => row.id !== stored.id),
      ],
      showV2Pilots: { ...state.showV2Pilots, [stored.id]: stored },
      showV2Histories: { ...state.showV2Histories, [stored.id]: { past: [], future: [] } },
      showsLoaded: true,
    }))
  },

  createShowFromController: async (profile) => {
    const id = newPersonalContentId()
    const taken = [...get().shows.map((show) => show.name), ...get().showV2Rows.map((row) => row.name)]
    const name = uniquePatternName(`${profile.name} Show`, taken)
    const stageMapId = importedStageMapIdForController(profile, useMapStore.getState().userMaps)
    const pixelCount = profile.lastKnownPixelCount ?? 60
    // The single seeded zone and its Default layout must cover the contract's
    // complete output, so the Show compiles without manual range repair (#775
    // review P2). createShowV2WithOutputContract sizes both from the contract.
    const show = {
      ...createShowV2WithOutputContract(
        id,
        name,
        createInstallationShowOutputContract({ outputMapId: stageMapId, pixelCount }),
      ),
      targetControllerProfileId: profile.id,
    }
    await get().addImportedShowV2(show)
    trackEntityCreated('show')
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

  clearActiveShowSelection: () => {
    const previous = get().activeShowId
    if (previous === null) return
    if (editSession && editSession.showId === previous) get().retireShowEditSession(editSession.sessionId)
    set({ activeShowId: null, showCreation: null })
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

  renameShow: async (id, name) => {
    // The rail lists only personal v2 rows, and each renames through its own
    // owner (#1039). Any other id, including a built-in Show (which is copied,
    // never renamed in place), returns without effect (#1042).
    if (isPersonalShowV2Row(id)) await renameShowV2Row(id, name)
  },

  removeShow: async (id) => {
    if (showsPendingDeletion.has(id)) return
    inputWait.invalidate(id)
    showsPendingDeletion.add(id)
    set((state) => revisionPatch(state, id))
    try {
      // One delete serves both versions: the stored row is addressed by id and
      // the session state a v2 Show holds is forgotten with the v1 state.
      await deletePersistedShow(id)
      lastPersistedShowV2Pilots.delete(id)
      set((state) => {
        const showV2Pilots = { ...state.showV2Pilots }
        delete showV2Pilots[id]
        const showV2Histories = { ...state.showV2Histories }
        delete showV2Histories[id]
        const showV2LessonDraftIds = { ...state.showV2LessonDraftIds }
        delete showV2LessonDraftIds[id]
        return {
          shows: state.shows.filter((show) => show.id !== id),
          showV2Rows: state.showV2Rows.filter((row) => row.id !== id),
          showV2Pilots,
          showV2Histories,
          showV2LessonDraftIds,
          activeShowId: state.activeShowId === id ? null : state.activeShowId,
          ...(state.showV2SaveFailure?.showId === id ? { showV2SaveFailure: null } : {}),
        }
      })
    } finally {
      showsPendingDeletion.delete(id)
    }
  },

  duplicateShowV2Row: async (sourceId, sourceRecord) => {
    if (showsHydration) await showsHydration.catch(() => {})
    const provider = getPersonalContentProvider()
    if (!provider.createShowV2) return null
    // The open working copy is what the user sees, so it is what gets copied;
    // a listed row that is not open copies its stored bytes.
    const source = sourceRecord
      ?? get().showV2Pilots[sourceId]
      ?? (provider.listShowDocumentsV2
        ? (await provider.listShowDocumentsV2()).find((record) => record.id === sourceId)
        : undefined)
    if (!source) return null
    const taken = [...get().shows.map((show) => show.name), ...get().showV2Rows.map((row) => row.name)]
    const record = cloneValidShowRecordV2({
      ...source,
      id: newPersonalContentId(),
      name: uniquePatternName(`${source.name} copy`, taken),
      updatedAt: Date.now(),
    })
    try {
      await get().addImportedShowV2(record)
    } catch {
      return null
    }
    return record
  },

  isShowV2LessonDraft: (id) => get().showV2LessonDraftIds[id] === true,

  resetShowV2LessonDraft: (id) => {
    const lesson = stockShowV2ById(id)
    if (!lesson || !get().showV2LessonDraftIds[id] || !get().showV2Pilots[id]) return
    inputWait.invalidate(id)
    const record = cloneValidShowRecordV2(lesson)
    set((state) => {
      if (!state.showV2Pilots[id]) return state
      return {
        ...revisionPatch(state, id),
        showV2Pilots: { ...state.showV2Pilots, [id]: record },
        showV2Histories: { ...state.showV2Histories, [id]: { past: [], future: [] } },
      }
    })
  },

  dismissShowV2SaveFailure: () => set({ showV2SaveFailure: null }),

  retryShowV2SaveFailure: async () => {
    const failure = get().showV2SaveFailure
    if (!failure) return
    try { await get().updateShowV2Pilot(failure.showId, failure.record) } catch { /* a still-failing write re-records showV2SaveFailure */ }
  },

    openShowV2Pilot: async (showId) => {
      // A built-in lesson opens from its native v2 copy as a session-only
      // draft. A second open keeps the session draft; neither open consults
      // the provider nor records a durable baseline.
      const lesson = stockShowV2ById(showId)
      if (lesson) {
        const existing = get().showV2Pilots[showId]
        if (existing && get().showV2LessonDraftIds[showId]) {
          return { status: 'ready', record: existing }
        }
        const record = cloneValidShowRecordV2(lesson)
        const history = { past: [], future: [] }
        set(state => ({
          showV2Pilots: { ...state.showV2Pilots, [showId]: record },
          showV2Histories: { ...state.showV2Histories, [showId]: history },
          showV2LessonDraftIds: { ...state.showV2LessonDraftIds, [showId]: true },
        }))
        return { status: 'ready', record }
      }
      const provider = getPersonalContentProvider()
      const workspaceGeneration = showV2WorkspaceGeneration
      const hydration = showsHydration
      if (hydration) await hydration
      if (showV2WorkspaceGeneration !== workspaceGeneration || getPersonalContentProvider() !== provider) {
        return {
          status: 'refused',
          issues: [{ code: 'invalid-v1', path: 'id', message: `Show "${showId}" changed while opening.` }],
        }
      }
      const revision = get().showRevisions[showId] ?? 0
      let result: Awaited<ReturnType<ShowState['openShowV2Pilot']>> | undefined
      await queueShowPersistence(showId, async () => {
        const readIsCurrent = () => (
          showV2WorkspaceGeneration === workspaceGeneration
          && getPersonalContentProvider() === provider
          && (get().showRevisions[showId] ?? 0) === revision
        )
        if (!readIsCurrent()) return
        const stored = provider.listShowDocumentsV2
          ? (await provider.listShowDocumentsV2()).find(record => record.id === showId)
          : undefined
        if (!readIsCurrent()) return
        if (stored) {
          const record = cloneValidShowRecordV2(stored)
          const history = { past: [], future: [] }
          lastPersistedShowV2Pilots.set(showId, { record, history })
          set(state => ({
            showV2Pilots: { ...state.showV2Pilots, [showId]: record },
            showV2Histories: { ...state.showV2Histories, [showId]: history },
          }))
          result = { status: 'ready', record }
          return
        }
        // Every built-in Show opened above as a lesson; an id with no stored
        // v2 row has nothing to open (#1042).
        result = { status: 'refused', issues: [{ code: 'invalid-v1', path: 'id', message: `Show "${showId}" is unavailable.` }] }
      })
      return result ?? {
        status: 'refused',
        issues: [{ code: 'invalid-v1', path: 'id', message: `Show "${showId}" changed while opening.` }],
      }
    },

    updateShowV2Pilot: (showId, next) => updateShowV2Record(showId, next),

    renameShowV2Pilot: async (showId, name) => {
      const current = get().showV2Pilots[showId]
      if (!current) return
      // The rename applies the registry owner so the name follows the same rules as the agent path (#1091).
      const outcome = applyShowCommandV2(cloneValidShowRecordV2(current), 'rename_show', { name })
      if (outcome.status !== 'changed') return
      await get().updateShowV2Pilot(showId, outcome.record)
    },

    undoShowV2Pilot: async (showId) => {
      const current = get().showV2Pilots[showId]
      const history = get().showV2Histories[showId]
      if (!current || !history) return false
      const transition = undoHistory(history, cloneValidShowRecordV2(current))
      if (!transition) return false
      try {
        await adoptShowV2PilotReplacement(showId, transition.replacement, transition.history, { record: current, history })
        return true
      } catch {
        return false
      }
    },

    redoShowV2Pilot: async (showId) => {
      const current = get().showV2Pilots[showId]
      const history = get().showV2Histories[showId]
      if (!current || !history) return false
      const transition = redoHistory(history, cloneValidShowRecordV2(current))
      if (!transition) return false
      try {
        await adoptShowV2PilotReplacement(showId, transition.replacement, transition.history, { record: current, history })
        return true
      } catch {
        return false
      }
    },

    reloadShowV2Pilot: async (showId) => {
      const provider = getPersonalContentProvider()
      if (!provider.listShowDocumentsV2) return null
      const workspaceGeneration = showV2WorkspaceGeneration
      const revision = get().showRevisions[showId] ?? 0
      let reloaded: ShowRecordV2 | null = null
      await queueShowPersistence(showId, async () => {
        if (
          showV2WorkspaceGeneration !== workspaceGeneration
          || getPersonalContentProvider() !== provider
          || (get().showRevisions[showId] ?? 0) !== revision
        ) return
        const stored = (await provider.listShowDocumentsV2!()).find(record => record.id === showId)
        if (
          !stored
          || showV2WorkspaceGeneration !== workspaceGeneration
          || getPersonalContentProvider() !== provider
          || (get().showRevisions[showId] ?? 0) !== revision
        ) return
        const record = cloneValidShowRecordV2(stored)
        const history = { past: [], future: [] }
        lastPersistedShowV2Pilots.set(showId, { record, history })
        set(state => ({ showV2Pilots: { ...state.showV2Pilots, [showId]: record }, showV2Histories: { ...state.showV2Histories, [showId]: history }, showV2SaveFailure: null }))
        reloaded = record
      })
      return reloaded
    },
  }
})

function reconcileHydratedShows(state: Pick<ShowState, 'shows'>, hydrated: ShowRecord[]): Pick<ShowState, 'shows'> {
  const hydratedIds = new Set(hydrated.map((show) => show.id))
  const shows = hydrated.map((show) => {
    const current = state.shows.find((candidate) => candidate.id === show.id)
    const keepPending = hasQueuedShowPersistence(show.id)
      && current !== undefined
      && current.updatedAt >= show.updatedAt
    return keepPending ? current! : show
  })

  // A list snapshot may omit a record whose local write has not reached the
  // provider yet. Keep that accepted replacement until its queued outcome is
  // known.
  for (const current of state.shows) {
    if (!hydratedIds.has(current.id) && hasQueuedShowPersistence(current.id)) shows.push(current)
  }
  return { shows: shows.sort((a, b) => b.updatedAt - a.updatedAt) }
}

function normalizeShowRecord(show: ShowRecord): ShowRecord {
  const normalized = normalizeShowEntryState(normalizeShowTransitionState(show))
  return normalized.composition
    ? { ...normalized, composition: normalizeShowComposition(normalized, normalized.composition) }
    : withoutComposition(normalized)
}

function withoutComposition(show: ShowRecord): ShowRecord {
  const { composition: _composition, ...flat } = show
  return flat
}

async function deletePersistedShow(id: string): Promise<void> {
  await queueShowPersistence(id, () => getPersonalContentProvider().deleteShow(id))
}
