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
import { stockShowV2ById } from '@/pixelblaze/stock/showsV2'
import {
  createShowEditSession,
  type ShowEditIntent,
  type ShowEditRequest,
  type ShowEditReceipt,
  type ShowEditSession,
  type ShowEditSettlement,
} from '@/engine/showEditAdmission'
import { createShowResizeAdmission, type ResolvedShowResizeIntent } from './showResizeAdmission'
import { createShowV2CandidateAdmission, type ShowV2CandidateDelivery } from './showV2CandidateAdmission'
import { createShowInputWait, type ShowEditActivity, type ShowInputWaitReceipt } from '@/engine/showInputWait'
import { isShowEditDiagnosticInput, retainShowEditDiagnostic, type ShowEditDiagnosticInput } from '@/engine/showEditDiagnostic'
import type { ShowRecordV2 } from '@/engine/showCompositionV2'
import { cloneValidShowRecordV2 } from '@/engine/showDocument'
import { createShowV2WithOutputContract } from '@/engine/showCreationV2'
import { isShowV2RouteEnabled } from '@/engine/showV2RouteGate'
import { convertShowRecordV1ToV2, type ShowV1ToV2Issue } from '@/engine/showRecordV1ToV2'
import {
  editedHistory,
  hasQueuedShowPersistence,
  nextShowOrderingStamp,
  queueShowPersistence,
  redoHistory,
  undoHistory,
  type DocumentHistory,
} from './showReplacementPolicy'

export type ShowEditValidationResult = boolean | {
  readonly valid: boolean
  readonly diagnostic?: ShowEditDiagnosticInput
}

type ParsedShowEditValidation =
  | { readonly valid: true }
  | { readonly valid: false; readonly diagnostic?: ShowEditDiagnosticInput }

const admissionUnavailableDiagnostic = (): ShowEditDiagnosticInput => ({
  stage: 'unexpected-admission-failure',
  issues: [{ code: 'admission-unavailable' }],
})

const validatorUnavailableDiagnostic = (): ShowEditDiagnosticInput => ({
  stage: 'unexpected-validator-failure',
  issues: [{ code: 'validation-unavailable' }],
})

const ephemeralInvalidCandidate = (request: ShowEditRequest, diagnostic?: ShowEditDiagnosticInput): ShowEditReceipt => {
  const retained = retainShowEditDiagnostic(diagnostic)
  return { request, status: 'refused', reason: 'invalid-candidate', ...(retained ? { diagnostic: retained } : {}) }
}

function parseShowEditValidationResult(value: unknown): ParsedShowEditValidation {
  try {
    if (value === true) return { valid: true }
    if (value === false) return { valid: false }
    if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
      return { valid: false, diagnostic: admissionUnavailableDiagnostic() }
    }
    const keys = Object.keys(value)
    const result = value as { valid?: unknown; diagnostic?: unknown }
    if (result.valid === true && keys.length === 1 && keys[0] === 'valid') return { valid: true }
    if (result.valid === false && keys.length === 1 && keys[0] === 'valid') return { valid: false }
    if (result.valid === false && keys.length === 2 && keys.includes('valid') && keys.includes('diagnostic') && isShowEditDiagnosticInput(result.diagnostic)) {
      return { valid: false, diagnostic: result.diagnostic }
    }
  } catch {
    return { valid: false, diagnostic: admissionUnavailableDiagnostic() }
  }
  return { valid: false, diagnostic: admissionUnavailableDiagnostic() }
}

const showsPendingDeletion = new Set<string>()
// The in-flight loadShows, so record creation can wait for hydration to
// apply instead of racing a stale list snapshot (#794).
let showsHydration: Promise<void> | null = null
// The last record each Show is known to hold durably, paired with the undo
// history that belongs to it (#792): rollback after a failed write restores
// this pair, never an unpersisted optimistic intermediate or a history that
// could replay one.
const lastPersistedShowRecords = new Map<string, { record: ShowRecord; history: ShowHistory }>()
const lastPersistedShowV2Pilots = new Map<string, { record: ShowRecordV2; history: ShowV2History }>()
// The Show ids whose v2 pilot was opened as a built-in lesson (#1066
// slice 11a). Membership is explicit state, never inferred from the id: a
// pilot placed directly under a built-in id (as agent tests do for channel
// authority) is personal content and still saves. Lesson pilots are
// session-only in-memory drafts, exactly as v1 stock drafts are.
const showV2LessonDraftIds = new Set<string>()
let showV2WorkspaceGeneration = 0

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

function advanceDurableShowV2Baseline(id: string, record: ShowRecordV2, history: ShowV2History): void {
  const baseline = lastPersistedShowV2Pilots.get(id)
  if (!baseline || baseline.record.updatedAt <= record.updatedAt) {
    lastPersistedShowV2Pilots.set(id, { record, history })
  }
}

function replacementWithNextOrderingStamp(previous: ShowRecord, replacement: ShowRecord): ShowRecord {
  return {
    ...normalizeShowRecord(replacement),
    updatedAt: nextShowOrderingStamp(previous.updatedAt),
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
    validate: (candidate: ShowRecord, current: ShowRecord) => ShowEditValidationResult,
  ) => ShowEditReceipt
  beginResolvedShowResize: (sessionId: string, intent: ResolvedShowResizeIntent) => ShowEditReceipt
  admitResolvedShowResize: (request: ShowEditRequest) => ShowInputWaitReceipt
  rejectResolvedShowResize: (request: ShowEditRequest) => ShowEditReceipt
  shows: ShowRecord[]
  showsLoaded: boolean
  activeShowId: string | null
  showCreation: { previousShowId: string | null } | null
  showHistories: Record<string, ShowHistory>
  stockShowDrafts: Record<string, ShowRecord>
  // The most recent persistence write that failed and rolled back (#792).
  // Holds the rejected record so the notice can offer a retry.
  showSaveFailure: { showId: string; record: ShowRecord } | null
  showV2Pilots: Record<string, ShowRecordV2>
  showV2Histories: Record<string, ShowV2History>
  showV2SaveFailure: { showId: string; record: ShowRecordV2 } | null
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
  createNewShow: (input: { name?: string; outputContract: ShowOutputContract }) => Promise<ShowRecord>
  createShowFromController: (profile: ControllerProfile) => Promise<ShowRecord>
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
  /**
   * Persists a copy of one stored v2 row under a fresh identity and a free
   * name (#1039), the v2 counterpart of `duplicateShow`. Callers displaying a
   * transient projection (lesson Try with Pattern selections) pass it as
   * sourceRecord so the copy keeps what the user sees. Resolves null when the
   * row is unknown, the workspace cannot store v2 Shows, or the create fails.
   */
  duplicateShowV2Row: (sourceId: string, sourceRecord?: ShowRecordV2) => Promise<ShowRecordV2 | null>
  updateShow: (id: string, next: ShowRecord) => Promise<void>
  // Resolves the record an edit operation should start from: a personal
  // record, an in-memory built-in draft, or the pristine built-in fixture.
  resolveEditableShow: (id: string) => ShowRecord | undefined
  resetStockShowDraft: (id: string) => void
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
  dismissShowV2SaveFailure: () => void
  /** Re-applies the rolled-back v2 record; a still-failing write keeps the notice without rejecting. */
  retryShowV2SaveFailure: () => Promise<void>
  acquireShowEditActivity: (sessionId: string, showId: string, kind: ShowEditActivity['kind']) => ShowEditActivity | undefined
  releaseShowEditActivity: (token: ShowEditActivity) => void
  deliverShowEditCandidate: (request: ShowEditRequest, candidate: unknown, validate: (candidate: ShowRecord, current: ShowRecord) => ShowEditValidationResult, validateRaw?: (candidate: unknown) => ShowEditValidationResult) => ShowInputWaitReceipt
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

export type ShowHistory = DocumentHistory<ShowRecord>
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
  showHistories: {} as Record<string, ShowHistory>,
  // Session-only working copies of built-in Shows. Never persisted: a reload
  // resets every built-in to its pristine catalogue definition.
  stockShowDrafts: {} as Record<string, ShowRecord>,
  showSaveFailure: null as { showId: string; record: ShowRecord } | null,
  showV2Pilots: {} as Record<string, ShowRecordV2>,
  showV2Histories: {} as Record<string, ShowV2History>,
  showV2SaveFailure: null as { showId: string; record: ShowRecordV2 } | null,
  showV2Rows: [] as ShowV2ListRow[],
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
    isDraft: id => showV2LessonDraftIds.has(id),
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
    !showV2LessonDraftIds.has(id)
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
    // rollback path. The settlement reports the draft, as v1 stock drafts do.
    const lessonDraft = showV2LessonDraftIds.has(id)
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
      // input, exactly as the v1 adoption path does.
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
          [id]: editedHistory(previousHistory, previous),
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
    const optimisticHistory = editedHistory(previousHistory, previous)
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
      return ephemeralInvalidCandidate(request, admissionUnavailableDiagnostic())
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
        if (!capturedCandidate || capturedCandidate.id !== capturedRequest.showId) return editSession!.refuse(capturedRequest.operationId, 'invalid-candidate')!
        if (validateRaw) {
          let validation: unknown
          try { validation = validateRaw(capturedCandidate) } catch {
            return editSession!.refuse(capturedRequest.operationId, 'invalid-candidate', validatorUnavailableDiagnostic())!
          }
          const parsed = parseShowEditValidationResult(validation)
          if (!parsed.valid) return editSession!.refuse(capturedRequest.operationId, 'invalid-candidate', parsed.diagnostic)!
        }
        return checked
      })
  },
  deliverShowV2EditCandidate: delivery => v2CandidateAdmission.deliver(delivery),
  invalidateShowEditCandidate: (request, diagnostic) => {
    const session = editSession
    if (!session || session.sessionId !== request.sessionId) return undefined
    if (resizeAdmission.owns(request.operationId)) return { request, status: 'refused', reason: 'invalid-candidate' }
    const checked = session.checkIdentity(request, session)
    if (checked !== session.read(request.operationId) || checked.status !== 'pending') return checked
    inputWait.release(request.operationId)
    return session.refuse(request.operationId, 'invalid-candidate', diagnostic)
  },
  beginResolvedShowResize: (sessionId, intent) => resizeAdmission.begin(sessionId, intent),
  admitResolvedShowResize: request => resizeAdmission.admit(request),
  rejectResolvedShowResize: request => resizeAdmission.reject(request),

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
    // A session belongs to whichever record version the editor holds for this
    // Show: the v1 collection, or the open v2 working copy (#1039).
    const present = get().resolveEditableShow(editSession.showId) ?? get().showV2Pilots[editSession.showId]
    if (result.status === 'pending' && (!present || showsPendingDeletion.has(editSession.showId))) {
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
    } catch {
      return session.refuse(request.operationId, 'invalid-candidate', admissionUnavailableDiagnostic())!
    }
    if (candidate.id !== request.showId) return session.refuse(request.operationId, 'invalid-candidate')!
    let validationCandidate: ShowRecord
    let validationCurrent: ShowRecord
    try {
      validationCandidate = structuredClone(candidate)
      validationCurrent = structuredClone(current)
    } catch {
      return session.refuse(request.operationId, 'invalid-candidate', admissionUnavailableDiagnostic())!
    }
    let validation: unknown
    try { validation = validate(validationCandidate, validationCurrent) } catch {
      return session.refuse(request.operationId, 'invalid-candidate', validatorUnavailableDiagnostic())!
    }
    const parsed = parseShowEditValidationResult(validation)
    if (!parsed.valid) return session.refuse(request.operationId, 'invalid-candidate', parsed.diagnostic)!
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
    // Pilot documents are provider-owned personal content. Retire them before
    // a workspace reload so a same-id record from the previous account cannot
    // satisfy the next route before its provider has been consulted.
    showV2WorkspaceGeneration += 1
    lastPersistedShowV2Pilots.clear()
    showV2LessonDraftIds.clear()
    set({ showV2Pilots: {}, showV2Histories: {}, showV2SaveFailure: null, showV2Rows: [] })
    const listProvider = getPersonalContentProvider()
    const listGeneration = showV2WorkspaceGeneration
    const hydration = (async () => {
    const shows = (await listProvider.listShows())
      .map(normalizeShowRecord)
    // The v2 rows the list offers beside them. They are a separate read
    // because `shows` stays v1-typed until #1039, and the gate keeps the
    // list and the editor route switching together (specification §10).
    const v2Rows = isShowV2RouteEnabled() && listProvider.listShowDocumentsV2
      ? (await listProvider.listShowDocumentsV2().catch(() => []))
        .map((record): ShowV2ListRow => ({ id: record.id, name: record.name, updatedAt: record.updatedAt }))
      : []
    // A workspace that changed while the rows were read owns its own listing.
    const currentWorkspace = showV2WorkspaceGeneration === listGeneration
      && getPersonalContentProvider() === listProvider
    resizeAdmission.invalidate()
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

  createNewShow: async (input) => {
    const id = newPersonalContentId()
    const name = uniquePatternName(input?.name?.trim() || 'Untitled Show', get().shows.map((show) => show.name))
    const show = createShowWithOutputContract(id, name, input.outputContract)
    await get().addShow(show)
    return show
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
    // The rail is one list of personal Shows; a v2 row renames through its own
    // owner rather than through the v1 record path (#1039).
    if (isPersonalShowV2Row(id)) {
      await renameShowV2Row(id, name)
      return
    }
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
      // One delete serves both versions: the stored row is addressed by id and
      // the session state a v2 Show holds is forgotten with the v1 state.
      await deletePersistedShow(id)
      lastPersistedShowRecords.delete(id)
      lastPersistedShowV2Pilots.delete(id)
      showV2LessonDraftIds.delete(id)
      set((state) => {
        const showHistories = { ...state.showHistories }
        delete showHistories[id]
        const showV2Pilots = { ...state.showV2Pilots }
        delete showV2Pilots[id]
        const showV2Histories = { ...state.showV2Histories }
        delete showV2Histories[id]
        return {
          shows: state.shows.filter((show) => show.id !== id),
          showV2Rows: state.showV2Rows.filter((row) => row.id !== id),
          showV2Pilots,
          showV2Histories,
          activeShowId: state.activeShowId === id ? null : state.activeShowId,
          showHistories,
          ...(state.showSaveFailure?.showId === id ? { showSaveFailure: null } : {}),
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

  isShowV2LessonDraft: (id) => showV2LessonDraftIds.has(id),

  resetShowV2LessonDraft: (id) => {
    const lesson = stockShowV2ById(id)
    if (!lesson || !showV2LessonDraftIds.has(id) || !get().showV2Pilots[id]) return
    resizeAdmission.invalidate(id)
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
        if (existing && showV2LessonDraftIds.has(showId)) {
          return { status: 'ready', record: existing }
        }
        const record = cloneValidShowRecordV2(lesson)
        const history = { past: [], future: [] }
        showV2LessonDraftIds.add(showId)
        set(state => ({
          showV2Pilots: { ...state.showV2Pilots, [showId]: record },
          showV2Histories: { ...state.showV2Histories, [showId]: history },
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
        const source = get().resolveEditableShow(showId)
        if (!source) {
          result = { status: 'refused', issues: [{ code: 'invalid-v1', path: 'id', message: `Show "${showId}" is unavailable.` }] }
          return
        }
        const converted = convertShowRecordV1ToV2(source)
        if (converted.status === 'refused') {
          result = converted
          return
        }
        const record = cloneValidShowRecordV2(converted.record)
        const history = { past: [], future: [] }
        lastPersistedShowV2Pilots.set(showId, { record, history })
        set(state => ({
          showV2Pilots: { ...state.showV2Pilots, [showId]: record },
          showV2Histories: { ...state.showV2Histories, [showId]: history },
        }))
        result = { status: 'ready', record }
      })
      return result ?? {
        status: 'refused',
        issues: [{ code: 'invalid-v1', path: 'id', message: `Show "${showId}" changed while opening.` }],
      }
    },

    updateShowV2Pilot: (showId, next) => updateShowV2Record(showId, next),

    renameShowV2Pilot: async (showId, name) => {
      const current = get().showV2Pilots[showId]
      if (!current || current.name === name) return
      await get().updateShowV2Pilot(showId, { ...current, name })
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
    if (!show || !history) return false
    const transition = undoHistory(history, normalizeShowRecord(show))
    if (!transition) return false
    const replacement = normalizeShowRecord(transition.replacement)
    const nextHistory = transition.history
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
    if (!show || !history) return false
    const transition = redoHistory(history, normalizeShowRecord(show))
    if (!transition) return false
    const replacement = normalizeShowRecord(transition.replacement)
    const nextHistory = transition.history
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
    const keepPending = hasQueuedShowPersistence(show.id)
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
    if (hasQueuedShowPersistence(current.id)) {
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
