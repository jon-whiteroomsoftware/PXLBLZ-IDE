import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createControllerProvider,
  setControllerProvider,
  detectControllerExtension,
  discoverControllers,
  getControllerProvider,
} from '@/engine/controllerProviderRegistry'
import {
  ControllerPermissionDeniedError,
  NullControllerProvider,
  statusMatchesConnectedController,
  type ConnectedControllerIdentity,
  type ControllerProvider,
  type ControllerStatus,
  type ControllerTarget,
  type DiscoveredController,
} from '@/engine/ControllerProvider'
import { ControllerHelperConflictError } from '@/engine/controllerHelper'
import type { FirmwareUpdateState } from '@/engine/firmwareUpdate'
import type { MapDimension } from '@/engine/sendToController'
import {
  inspectInstalledMapData,
  type LiveInstalledMapState,
} from '@/engine/installedMapObservation'
import { describePreflight, type PreflightWarning } from '@/engine/preflight'
import { recommendedMapRemedy, type RecommendedMapRemedy } from '@/engine/patternMapRemedy'
import { encodeMapData, resolveMapPushPoints } from '@/engine/mapPush'
import { mapDataHash, withMapFingerprintRecord } from '@/engine/mapFingerprint'
import { stockMapSpec } from '@/pixelblaze/stock/maps/stockCatalogue'
import { applyControllerPixelCount } from '@/engine/applyControllerPixelCount'
import { availableDiscoveredControllers } from '@/engine/controllerDiscovery'
import type { ControllerPhase } from '@/engine/controllerPillView'
import { pushPattern, type LateSaveConfirmationHandler, type PushPatternResult } from '@/engine/pushPattern'
import { sha256CompleteCompileInput, type ShowArtifactCompilationRecord } from '@/engine/showArtifactPricing'
import { queueControllerDeviceWrite } from '@/engine/controllerDeviceWriteQueue'
import { artifactHash, type ArtifactStampMeta } from '@/engine/artifactStamp'
import {
  getControllerBindings,
  setControllerBindings,
  getProgramLabels,
  setProgramLabels,
  getPushRecords,
  setPushRecords,
  updatePushRecords,
} from '@/engine/controllerMetadataStorage'
import { withProgramLabel } from '@/engine/controllerBinding'
import { bundleWithPasses, type TransformSummary } from '@/engine/passEngine'
import { planHardwareRenderer } from '@/engine/renderCompatibility'
import { compileLibraries } from '@/engine/libraries'
import {
  withTransformArtifactInspection,
  type TransformArtifactInspection,
  type TransformArtifactInspectionStore,
} from '@/engine/transformInspection'
import { buildPreviewJpeg } from '@/engine/previewThumbnailJpeg'
import { LIBRARIES } from '@/pixelblaze/libs'
import { usePatternStore, activePushKey } from '@/store/patternStore'
import { useEditorStore } from '@/store/editorStore'
import { useLibraryStore } from '@/store/libraryStore'
import { useMapStore, openMapForPushState, STOCK_MAPS } from '@/store/mapStore'
import { buildShowControllerCompatibilityContext } from '@/engine/showControllerCompatibilityContext'
import { useControllerPanelStore } from '@/store/controllerPanelStore'
import { useControllerProfileStore } from '@/store/controllerProfileStore'
import { getPersonalContentProvider } from '@/engine/personalContentProvider'
import { waitForControllerProfileWrites } from '@/engine/controllerProfileWriteQueue'
import {
  controllerProfileArtifactSignature,
  controllerProfileReconciliationSignature,
  findProfileForLiveController,
} from '@/engine/controllerProfilePassRecipe'
import { controllerForProfile } from '@/engine/controllerProfileConnection'
import { enabledControllerWrappers, type ControllerProfile } from '@/engine/controllerProfile'
import {
  executeControllerReconciliation,
  planControllerReconciliation,
  type ControllerReconciliationJob,
  type ReconciliationArtifact,
} from '@/engine/controllerReconciliation'
import {
  isReconciliationTimeout,
  sameReconciliationTarget,
  stallAfterReconciliation,
  type ReconciliationRequest,
  type ReconciliationStall,
  type ReconciliationTarget,
} from '@/engine/controllerReconciliationPolicy'
import { ControllerReconciliationQueue, type ControllerReconciliationRun } from './controllerReconciliationQueue'
import { DEMOS } from '@/pixelblaze/stock/patterns'
import { resolveShowV2StageMap } from '@/store/showV2StageMap'
import {
  prepareShowV2ControllerDelivery,
  type ShowV2ControllerDelivery,
} from '@/engine/showV2ControllerDelivery'
import {
  assessShowCompilePressure,
  type ShowCompilePressureInput,
} from '@/engine/showCompilePressure'
import { deliveredShowSourceBytes } from '@/engine/showSourceInventory'
import {
  prepareControllerArtifactDelivery,
  type PreparedControllerArtifactDelivery,
} from '@/engine/controllerArtifactDelivery'
import type { SendMode } from '@/engine/sendToController'
import { canonicalControllerDeviceId, sameControllerDeviceId } from '@/engine/controllerIdentity'

// Keyed connection orchestration for the live Controller surface (#210).
//
// Reshaped from the single-connection model (#197) to the true seam: extension
// *presence* is global (one extension, one detect), while connection *state* is a
// map of Controllers keyed by IP, exactly one marked active. Each entry carries
// its own phase (pending/live/error), nickname, and installed-map dimensionality.
//
// One isolated provider drives each Controller's socket — minted through the
// registry factory and kept in a module-local map (never serialised). The store
// points the registry's *active* provider (which the Controller panel and Send
// read/drive) at whichever Controller is active. Connection *truth* still lives in
// each provider; this store mirrors a per-Controller slice for the pills and
// remembers the last-connected IP so it alone auto-connects on reload.
//
// The data model is a map from day one (multi-Controller correctness); the header
// renders only the single-Controller affordances richly (polish deferred to #210+).

/** One Controller in the keyed map. Born `pending` on connect-attempt; settles to
 *  `live` (label → nickname) or `error`. `mapDim` gates Send-to-Controller. */
export interface ControllerEntry {
  ip: string
  /** Stable physical-device id while live/known; null means connected but unclaimed. */
  deviceId?: string | null
  /** Device name when reported; absent → the pill falls back to the IP. */
  nickname?: string
  /** Last firmware version reported by discovery or live config. */
  firmwareVersion?: string
  /** Result of the Controller's own update-service check. Session-only. */
  firmwareUpdateState?: FirmwareUpdateState
  /** Timestamp and installed version associated with that update-service result. */
  firmwareUpdateCheckedAt?: number
  firmwareUpdateObservedVersion?: string
  phase: ControllerPhase
  /** Names the connection this entry is currently living in. Fresh on every
   *  arrival at `live`, absent otherwise, and never reused. Anything cached from
   *  a live read — here or in a component — is only about the connection whose
   *  epoch it was taken under: the IP is identical across a reconnect, and so is
   *  every per-IP collection retained across the gap, so nothing else in the
   *  entry distinguishes one session from the next (#772). Session-scoped and
   *  not persisted, like the entry itself. */
  liveEpoch?: number
  /** Provider-local transport generation used to recognize a replacement
   * connection even when an obsolete completion briefly reports `live` first. */
  providerConnectionGeneration?: number
  /** Last error message when `phase === 'error'`. */
  error?: string
  /** Non-null while Chrome is waiting for the helper popup's per-IP grant (#235). */
  authorizationNeededIp?: string | null
  /** Canonical live `/pixelmap.dat` observation. Present facts and raw bytes come
   * from one read; absent and read failure remain distinct. Optional only for
   * legacy persisted entries created before installed-map observations existed. */
  installedMap?: LiveInstalledMapState
  mapDim: MapDimension
}

export type ControllerRendererAcknowledgement = 'unknown' | 'playing' | 'paused'
export type ControllerRendererCommand = 'pause' | 'resume'

export interface ControllerRendererState {
  /** Last command this PXLBLZ connection observed the Controller acknowledge.
   *  Unknown is honest after connect/reconnect because firmware exposes no
   *  authoritative paused-state readback. */
  acknowledged: ControllerRendererAcknowledgement
  /** A fresh connection does not alter the Controller's normal running renderer,
   *  and a successful Pattern activation ends by resuming it. The transport offers
   *  Pause for either case without claiming an acknowledgement. Ownership loss and
   *  the first command attempt clear this assumption. */
  assumedPlaying?: boolean
  pending: ControllerRendererCommand | null
  error?: string
}

export type ControllerReconciliationProgramState = 'current' | 'queued' | 'updating' | 'failed'

export interface ControllerReconciliationProgram {
  programId: string
  bindingKey: string
  name: string
  state: ControllerReconciliationProgramState
  message?: string
}

export interface ControllerReconciliationState {
  phase: 'idle' | 'pending' | 'running' | 'current' | 'attention' | 'not-responding'
  paused?: boolean
  restarted?: boolean
  retryAt?: number
  managedCount: number
  unmanagedCount: number
  completedCount: number
  programs: ControllerReconciliationProgram[]
}

interface ControllerConnectionState {
  /** Transient exact compile evidence; reusable only for the same source and live epoch. */
  lastShowArtifactCompilation: ShowArtifactCompilationRecord | null
  /** Is any relay Helper reachable? Helper conflicts are tracked separately. */
  extensionPresent: boolean
  helperConflict: boolean
  /** Connected (or connecting/errored) Controllers, keyed by IP. */
  controllers: Record<string, ControllerEntry>
  /** Volatile renderer transport state keyed by Controller IP. */
  rendererStates: Record<string, ControllerRendererState>
  /** Persisted safety marker for Controllers PXLBLZ may have left paused. A Pause
   *  attempt sets it before transport; acknowledged Resume or successful Pattern
   *  activation clears it. It gates only the optimistic first-connect display. */
  rendererPausedByPxlblz: Record<string, true>
  /** The IP of the active Controller — the one Send + the panel target. */
  activeIp: string | null
  /** The last Controller to reach `live`, persisted so it alone auto-connects on
   *  reload. Cleared when that Controller is explicitly removed. */
  lastConnectedIp: string | null
  /** The nickname of the last-connected Controller, persisted alongside its IP so the
   *  pill is born with the name on reload rather than the bare IP (#215). Refreshed
   *  from the device's `getConfig` once it reconnects — a rename on the device wins. */
  lastConnectedNickname: string | null
  /** Session-only Controller-reported name by stable physical device id. Display-only;
   *  the durable copy belongs on Controller profiles, not the live layer. */
  lastKnownControllerNames: Record<string, string>
  /** Session-only transport IP by stable physical device id. Display/reconnect hint
   *  only; never an identity key. */
  lastKnownControllerIps: Record<string, string>
  /** True while a Send-to-Controller push is in flight (#202) — disables the button. */
  pushing: boolean
  /** Last push outcome, surfaced transiently on the Send button. `null` = idle. */
  pushResult: PushResult | null
  /** Run/Save outcome with enough identity for the owning Pattern or Show to
   * present it without borrowing another Controller operation's result. */
  artifactPushResult: ArtifactPushResult | null
  /** The pattern source last successfully pushed, keyed controllerId → patternId.
   *  Drives the run-mode dirty gate together with the active program identity. Not
   *  persisted — a fresh session re-enables a push (the device may have changed). */
  lastPushedSource: Record<string, Record<string, string>>
  /** Program id activated by the last successful run-mode push, keyed like
   *  `lastPushedSource`. Session-only: live identity must be re-observed after reload. */
  lastRunProgramId: Record<string, Record<string, string>>
  /** The pattern source last successfully *saved* (persist mode, #238), keyed
   *  controllerId → patternId. The save-mode analogue of `lastPushedSource`: run and
   *  save are distinct acts, so the dirty gate compares against this when Save is
   *  armed. Not persisted, same as the run record. */
  lastSavedSource: Record<string, Record<string, string>>
  /** Generated-code profile signature used by the last run-mode push. */
  lastPushedProfileSignature: Record<string, Record<string, string>>
  /** Generated-code profile signature used by the last save-mode push. */
  lastSavedProfileSignature: Record<string, Record<string, string>>
  /** Clear session-only Send gates after a managed saved Pattern is deleted. */
  forgetDeletedSavedProgram: (controllerId: string, bindingKey: string) => void
  /** Whether the Send button's Save mode is armed (#238). When on, Send persists the
   *  pattern to the device's Saved Patterns (#236) instead of a run-only push. Sticky:
   *  persisted across sessions (it's a deliberate, remembered intent). */
  saveArmed: boolean
  /** The map source last successfully pushed, keyed controllerId → mapId (#204). The
   *  map analogue of `lastPushedSource`: drives the map editor's dirty gate so its Send
   *  is inert until the open map's bake changes. Not persisted (a fresh session re-enables
   *  a push — the device's shared map may have changed under us). */
  lastPushedMap: Record<string, Record<string, string>>
  /** Last pass-engine summary by Controller and pattern. Populated only when a push
   *  used an active profile transform; cleared for unchanged-artifact pushes. */
  lastTransformSummary: Record<string, Record<string, TransformSummary>>
  /** Last inspectable generated artifact by Controller and pattern. Populated
   *  alongside `lastTransformSummary`, including source and pass warnings. */
  lastTransformArtifacts: TransformArtifactInspectionStore
  /** Background saved-artifact reconciliation state keyed by Controller profile id. */
  controllerReconciliations: Record<string, ControllerReconciliationState>
  /** Pending preflight warnings (#203): non-null opens the reconciliation dialog,
   *  which Send must clear (confirm or cancel) before the push proceeds. `null` =
   *  no dialog. An empty array never appears here — a clean preflight pushes
   *  straight through. */
  preflight: PreflightWarning[] | null
  /** When the open map's point count can't conform to the device's `pixelCount`, the
   *  count the Controller must be set to for the map to apply (#213). Non-null marks the
   *  current map preflight as **blocking**: the plain "Send anyway" path is withheld and
   *  the dialog offers only the coupled remedy (set pixel count to this, then push). */
  mapPushRemedyCount: number | null
  /** The recommended-map remedy offered alongside a pattern-push dim-mismatch warning
   *  (Option A): a demo whose recommended map (of the matching dimension) can be installed
   *  on the Controller so the device map's dim matches the pattern's. Non-null only while a
   *  pattern preflight is open AND the open demo carries such a recommendation; null for
   *  user patterns and demos without one (the dialog then offers a plain "Send anyway"). */
  patternMapRemedy: RecommendedMapRemedy | null
  /** True when the current pattern preflight found a known-incompatible firmware
   * combination. A recommended-map install may still resolve it; plain send may not. */
  patternPushBlocked: boolean

  /** Controllers surfaced by the last discovery sweep (H14, #206), awaiting connect.
   *  Cleared when discovery re-runs. */
  discovered: DiscoveredController[]
  /** True while a discovery sweep is in flight — drives the dropdown's spinner. */
  discovering: boolean
  /** True when the latest sweep could not reach the helper or cloud discovery service. */
  discoveryUnavailable: boolean

  /** Probe extension presence and record it (global). */
  detectExtension: () => Promise<boolean>
  /** Run a cloud discovery sweep and record the candidates (#206). */
  discover: () => Promise<void>
  /** Begin connecting to a Controller: born as a pending pill, made active immediately.
   *  Settles to live (nickname + mapDim read) or error. Re-adding an existing IP
   *  retries it. Rejection is swallowed — the pill reflects the error.
   *  `seedNickname` pre-labels the pending pill (used by auto-reconnect, #215); it is
   *  overwritten once the device reports its real name. */
  addController: (target: string | DiscoveredController, seedNickname?: string) => Promise<void>
  /** Disconnect + drop a Controller. If it was active, activates another (or none).
   *  Clears the remembered last-connected IP if it was this one. */
  removeController: (ip: string) => Promise<void>
  /** Make `ip` the active Controller (points the registry's active provider at it). */
  setActive: (ip: string) => void
  /** Refresh one Controller's canonical installed-map observation without adding
   * the map read to telemetry polling. */
  refreshInstalledMap: (
    ip: string,
    options?: { expectedFingerprint?: string; reuseObserved?: boolean },
  ) => Promise<void>
  /** Send an acknowledged device-wide renderer command to exactly one Controller. */
  setRendererPaused: (ip: string, paused: boolean) => Promise<void>
  /** Rename the matching live physical Controller, confirm device truth, then
   * reconcile its keyed session and durable profile. Offline profiles cannot be
   * renamed into local-only aliases. */
  renameControllerProfile: (profileId: string, name: string) => Promise<void>
  /** Startup auto-reconnect: try only the remembered last-connected Controller. */
  autoConnect: () => Promise<void>
  /** Compile + push the active pattern to the active Controller, overwrite-in-place
   *  (#202). Reads the last-clean preview source and active pattern id; a no-op when
   *  nothing is active. Sets `pushing`/`pushResult` for the button to reflect. */
  pushActivePattern: () => Promise<void>
  /** Send an already-generated artifact (currently a Show) through the same Run/Save
   * identity and device policy as an ordinary Pattern without making it editor-active. */
  pushGeneratedArtifact: (artifact: GeneratedArtifactPush) => Promise<void>
  /** Push the active pattern to the active Controller. Pixel count is irrelevant, but
   * cross-dimensional renderer/firmware compatibility is reconciled against the live
   * installed map before the one-click or confirmation path. */
  requestPush: () => Promise<void>
  /** Acknowledge a non-blocking pattern preflight and push WITHOUT the coupled map
   * install. Known unsupported firmware combinations cannot use this path. */
  confirmPatternPush: () => Promise<void>
  /** Acknowledge the pattern preflight and FIRST install the demo's recommended map (set
   *  the Controller's pixel count to the recommended count, then write the stock map),
   *  then push the pattern. The coupled remedy offered by the dim-mismatch checkbox
   *  (Option A). Order matters — count before map, then pattern — mirroring confirmMapPush.
   *  If the map install fails, the pattern is not pushed (surfaced as a Send-failed). */
  confirmPatternPushWithMap: () => Promise<void>
  /** Dismiss the (pattern- or map-push) preflight dialog without pushing. */
  cancelPush: () => void
  /** Run the map-send preflight (#204): reconcile the open map's baked point count
   *  against the Controller's configured pixel count and always surface the map-overwrite
   *  warning (writing the shared map is a deliberate act). Opens the reconciliation
   *  dialog (`preflight`), deferring the write to confirmMapPush. A no-op when no map
   *  is open or no Controller is active. */
  requestMapPush: () => Promise<void>
  /** Acknowledge the map preflight dialog and write the map to the Controller. When the
   *  preflight is blocking (`mapPushRemedyCount` set — the map can't conform to the
   *  device count), this first sets the Controller's pixel count to that remedy count,
   *  then pushes; otherwise it's a plain write. The coupled set-count-then-push is the
   *  only thing that makes a fixed-count map apply (#213). */
  confirmMapPush: () => Promise<void>
  /** Push the map *without* the coupled setPixelCount — the escape hatch offered
   *  alongside the remedy on a blocking mismatch (#213). The firmware will silently drop
   *  a count-mismatched map, so this is the deliberate "I know, push it anyway" path; the
   *  remedy (`confirmMapPush`) stays the recommended default. */
  confirmMapPushOnly: () => Promise<void>
  /** Set the Controller's pixel count to the remedy count *without* pushing the map —
   *  the combination chosen when the map-push popover's "Push map" box is unchecked but
   *  "Push pixel count" is left on. No-op when there's no armed remedy (#213). */
  confirmSetPixelCountOnly: () => Promise<void>
  /** Write the open map's baked coordinates to the active Controller's single shared
   *  map slot (#204). Reuses `pushing`/`pushResult` for the button animation; a no-op
   *  when nothing is open/active. */
  pushActiveMap: () => Promise<void>
  /** Arm/disarm Save mode (#238). Sticky across sessions. */
  setSaveArmed: (armed: boolean) => void
  /** Clear the transient push result (e.g. after the toast/badge times out). */
  clearPushResult: () => void
  /** Dismiss the visible, artifact-scoped Run/Save outcome. */
  clearArtifactPushResult: () => void
  /** Publish a generated-artifact failure discovered before the shared push
   * pipeline starts (for example, an async preview outliving its Show/session). */
  reportArtifactPushFailure: (result: ArtifactPushResult & { ok: false }) => void
  /** Reconcile installed PXLBLZ-managed artifacts for one opted-in Controller profile. */
  reconcileControllerProfile: (profileId: string) => Promise<void>
  /** Debounced entry point used after profile edits and reconnect. */
  scheduleControllerReconciliation: (profileId: string, profileChanged?: boolean) => void
  pauseControllerReconciliation: (profileId: string) => void
  resumeControllerReconciliation: (profileId: string) => void
}

export interface GeneratedArtifactPush {
  artifactId: string
  source: string
  name: string
  persist: boolean
  compilePressure: Omit<ShowCompilePressureInput, 'deliveredSourceBytes'>
  artifactStamp: ArtifactStampMeta
  previewImage?: Uint8Array
  /** Connected Controller identity and live connection epoch that authorized
   * this prepared artifact. Shows supply it; session-agnostic generated callers
   * may omit it. */
  expectedControllerSession?: GeneratedArtifactControllerSession
}

export interface GeneratedArtifactControllerSession extends ConnectedControllerIdentity {
  /** Connection generation from ControllerEntry. Stable across status/metadata
   * refreshes and fresh on every reconnect. */
  liveEpoch: number
}

/** The outcome of a single Send-to-Controller push, surfaced on the button. */
export type PushResult =
  | { ok: true; created: boolean }
  | { ok: false; message: string }

export type ArtifactPushResult = PushResult & {
  artifactId: string
  mode: SendMode
}

export const controllerInitialState = {
  lastShowArtifactCompilation: null as ShowArtifactCompilationRecord | null,
  extensionPresent: false,
  helperConflict: false,
  controllers: {} as Record<string, ControllerEntry>,
  rendererStates: {} as Record<string, ControllerRendererState>,
  rendererPausedByPxlblz: {} as Record<string, true>,
  activeIp: null as string | null,
  lastConnectedIp: null as string | null,
  lastConnectedNickname: null as string | null,
  lastKnownControllerNames: {} as Record<string, string>,
  lastKnownControllerIps: {} as Record<string, string>,
  pushing: false,
  pushResult: null as PushResult | null,
  artifactPushResult: null as ArtifactPushResult | null,
  lastPushedSource: {} as Record<string, Record<string, string>>,
  lastRunProgramId: {} as Record<string, Record<string, string>>,
  lastSavedSource: {} as Record<string, Record<string, string>>,
  lastPushedProfileSignature: {} as Record<string, Record<string, string>>,
  lastSavedProfileSignature: {} as Record<string, Record<string, string>>,
  saveArmed: false,
  lastPushedMap: {} as Record<string, Record<string, string>>,
  lastTransformSummary: {} as Record<string, Record<string, TransformSummary>>,
  lastTransformArtifacts: {} as TransformArtifactInspectionStore,
  controllerReconciliations: {} as Record<string, ControllerReconciliationState>,
  preflight: null as PreflightWarning[] | null,
  mapPushRemedyCount: null as number | null,
  patternMapRemedy: null as RecommendedMapRemedy | null,
  patternPushBlocked: false,
  discovered: [] as DiscoveredController[],
  discovering: false,
  discoveryUnavailable: false,
}

function withoutControllerMemoEntry<T>(
  records: Record<string, Record<string, T>>,
  controllerId: string,
  bindingKey: string,
): Record<string, Record<string, T>> {
  const controllerRecords = records[controllerId]
  if (!controllerRecords || !Object.prototype.hasOwnProperty.call(controllerRecords, bindingKey)) {
    return records
  }
  const { [bindingKey]: _removed, ...remaining } = controllerRecords
  return { ...records, [controllerId]: remaining }
}

// Live provider per Controller IP, plus each one's status unsubscribe. Kept
// module-local so they never serialise and a stale render never holds a socket.
const providers = new Map<string, ControllerProvider>()
const unsubscribers = new Map<string, () => void>()
const rendererCommandGenerations = new Map<string, number>()
const installedMapReadGenerations = new Map<string, number>()
// Automatic consumers reuse both pending and settled reads in this connection.
// Explicit refresh and post-push reads replace the record, including failed reads.
const installedMapReads = new Map<string, {
  provider: ControllerProvider
  liveEpoch: number | undefined
  promise: Promise<void>
}>()
const firmwareUpdateCheckedAt = new Map<string, number>()
const reconciliationTimers = new Map<string, ReturnType<typeof setTimeout>>()
const reconciliationRetryTimers = new Map<string, ReturnType<typeof setTimeout>>()
const reconciliationStalls = new Map<string, ReconciliationStall>()
const reconciliationQueue = new ControllerReconciliationQueue()
const reconciliationPatternSources = new Map<string, {
  target: ReconciliationTarget
  patternSources: ReadonlyMap<string, string>
}>()
const unconfirmedSaves = new Map<string, {
  target: ReconciliationTarget
  programIds: Set<string>
}>()

interface LateSaveConfirmation {
  programId: string
  profileSignature: string
  recorded: Promise<boolean>
}

interface SaveAttempt {
  ip: string
  bindingKey: string
  source: string
  foreground: boolean
  confirmation?: LateSaveConfirmation
}

const saveAttempts = new Map<string, Map<string, SaveAttempt>>()

function beginSaveAttempt(ip: string, bindingKey: string, source: string, foreground: boolean): SaveAttempt {
  const attempt = { ip, bindingKey, source, foreground }
  const byBinding = saveAttempts.get(ip) ?? new Map<string, SaveAttempt>()
  byBinding.set(bindingKey, attempt)
  saveAttempts.set(ip, byBinding)
  return attempt
}

function isLatestSaveAttempt(attempt: SaveAttempt): boolean {
  return saveAttempts.get(attempt.ip)?.get(attempt.bindingKey) === attempt
}

function forgetSaveAttempt(attempt: SaveAttempt | undefined): void {
  if (!attempt || !isLatestSaveAttempt(attempt)) return
  const byBinding = saveAttempts.get(attempt.ip)!
  byBinding.delete(attempt.bindingKey)
  if (!byBinding.size) saveAttempts.delete(attempt.ip)
}

function unconfirmedProgramsFor(target: ReconciliationTarget): Set<string> | undefined {
  const entry = unconfirmedSaves.get(target.ip)
  return entry && sameReconciliationTarget(entry.target, target) ? entry.programIds : undefined
}

/** Keep source-only retries eligible even when the next pass has a matching
 * profile signature and no earlier plan to compare with. */
function rememberSaveOutcome(target: ReconciliationTarget, delivery: PushPatternResult): void {
  const previous = unconfirmedProgramsFor(target)
  if (delivery.save === 'unconfirmed' && !delivery.created) {
    const programIds = previous ?? new Set<string>()
    programIds.add(delivery.programId)
    unconfirmedSaves.set(target.ip, { target, programIds })
  } else if (previous) {
    previous.delete(delivery.programId)
    if (!previous.size) unconfirmedSaves.delete(target.ip)
  }
}

type ReconciliationOutcome = Parameters<typeof stallAfterReconciliation>[2]
class ReconciliationWriteCancelled extends Error {}
class ReconciliationPlanInvalidated extends Error {}

function clearReconciliationTimer(
  timers: Map<string, ReturnType<typeof setTimeout>>,
  profileId: string,
): void {
  clearTimeout(timers.get(profileId))
  timers.delete(profileId)
}

function idleReconciliation(): ControllerReconciliationState {
  return { phase: 'idle', managedCount: 0, unmanagedCount: 0, completedCount: 0, programs: [] }
}
const FIRMWARE_UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000

// Source of `ControllerEntry.liveEpoch`. Module-local and monotonic for the life
// of the page, so no two connections — to the same Controller or different ones
// — ever share an epoch. Entries are not persisted, so this never has to survive
// a reload or agree with a restored value.
let liveEpochCounter = 0

/** Map a provider status to the keyed entry's mirrored fields. The nickname is
 *  only ever *set* (when the status carries a device name), never cleared — it is
 *  fetched once via getConfig on connect and must survive a transient reconnect,
 *  which re-emits connecting/connected without a name. */
function phaseFromStatus(status: ControllerStatus): Partial<ControllerEntry> | null {
  switch (status.kind) {
    case 'connecting':
      return {
        phase: 'pending',
        error: undefined,
        authorizationNeededIp: status.authorizationNeededIp ?? null,
      }
    case 'connected':
      return {
        phase: 'live',
        ...(status.connectionGeneration != null
          ? { providerConnectionGeneration: status.connectionGeneration }
          : {}),
        deviceId: status.controller.deviceId ? canonicalControllerDeviceId(status.controller.deviceId) : status.controller.deviceId,
        error: undefined,
        authorizationNeededIp: null,
        ...(status.controller.name ? { nickname: status.controller.name } : {}),
        ...(status.controller.firmwareVersion ? { firmwareVersion: status.controller.firmwareVersion } : {}),
      }
    case 'error':
      return { phase: 'error', error: status.message, authorizationNeededIp: null }
    default:
      // extension-present / no-extension aren't entry states; ignore.
      return null
  }
}

// Install a stock map by id — the coupled remedy behind the pattern dim-mismatch checkbox
// (Option A). Mirrors pushActiveMap: re-bake the stock source to the DEVICE's current pixel
// count (the firmware stores exactly pixelCount entries, and the hardware count — not any
// preview size — is what the map must match) and write it. The hardware count is left
// untouched. Throws on an unknown id, an unreadable device count, or any transport failure
// so the caller can surface it.
async function installStockMap(remedy: RecommendedMapRemedy): Promise<string> {
  const spec = stockMapSpec(remedy.mapId)
  if (!spec) throw new Error(`Unknown map: ${remedy.mapId}`)
  const provider = getControllerProvider()
  const config = await provider.getConfig().catch(() => null)
  const points = resolveMapPushPoints(spec.source, [], config?.pixelCount ?? null)
  if (points.length === 0) {
    throw new Error("Couldn't read the Controller's pixel count to size the map")
  }
  await provider.setPixelMap(points)
  return mapDataHash(encodeMapData(points))
}

function withTransformSummary(
  summaries: Record<string, Record<string, TransformSummary>>,
  controllerId: string,
  patternId: string,
  summary: TransformSummary | null,
): Record<string, Record<string, TransformSummary>> {
  const next = { ...summaries }
  const controllerSummaries = { ...next[controllerId] }
  if (summary) {
    next[controllerId] = { ...controllerSummaries, [patternId]: summary }
    return next
  }
  delete controllerSummaries[patternId]
  if (Object.keys(controllerSummaries).length === 0) {
    delete next[controllerId]
  } else {
    next[controllerId] = controllerSummaries
  }
  return next
}

function normalizeControllerTarget(
  target: string | DiscoveredController,
  seedNickname?: string,
): { ip: string; connectTarget: ControllerTarget; seedNickname?: string } {
  if (typeof target === 'string') {
    const ip = target.trim()
    return {
      ip,
      connectTarget: { address: ip },
      seedNickname,
    }
  }
  const ip = target.address.trim()
  return {
    ip,
    connectTarget: {
      address: ip,
      deviceId: canonicalControllerDeviceId(target.id),
      ...(target.name ? { name: target.name } : {}),
      ...(target.version ? { firmwareVersion: target.version } : {}),
    },
    seedNickname: target.name ?? seedNickname,
  }
}

export const useControllerStore = create<ControllerConnectionState>()(
  persist(
    (set, get) => {
      // Resolve the map currently open in the editor's map mode into the bits a push
      // needs: its stable id, baked coordinate array, and a change signature (its
      // source) for the dirty gate. Works for both custom maps and read-only stock maps.
      const openMapForPush = ():
        | { id: string; name: string; points: number[][]; source: string | undefined; signature: string }
        | null => {
        return openMapForPushState(useMapStore.getState())
      }

      // Fold a per-Controller patch into the keyed map without dropping siblings.
      // Arriving at `live` from anywhere else opens a new connection, and this is
      // the only path an entry can take to get there — `addController` builds its
      // entry `pending` — so stamping the epoch here covers every arrival,
      // including any added later. Re-asserting `live` while already live is the
      // same connection and keeps its epoch: minting one for every observation
      // would make readers keyed to the epoch re-read continuously (#772).
      const patchController = (ip: string, patch: Partial<ControllerEntry>) =>
        set((s) => {
          const existing = s.controllers[ip]
          if (!existing) return s
          const providerGenerationChanged = patch.phase === 'live'
            && patch.providerConnectionGeneration != null
            && patch.providerConnectionGeneration !== existing.providerConnectionGeneration
          const arrivingLive = patch.phase === 'live'
            && (existing.phase !== 'live' || providerGenerationChanged)
          const next = arrivingLive
            ? { ...existing, ...patch, liveEpoch: ++liveEpochCounter }
            : { ...existing, ...patch }
          return { controllers: { ...s.controllers, [ip]: next } }
        })

      const invalidateRendererState = (ip: string) => {
        rendererCommandGenerations.set(ip, (rendererCommandGenerations.get(ip) ?? 0) + 1)
        set((s) => {
          if (!s.controllers[ip]) return s
          return {
            rendererStates: {
              ...s.rendererStates,
              [ip]: { acknowledged: 'unknown', pending: null },
            },
          }
        })
      }

      const retainRendererResumeRecovery = (ip: string) => {
        set((s) => {
          if (!s.controllers[ip]) return s
          return {
            rendererPausedByPxlblz: {
              ...s.rendererPausedByPxlblz,
              [ip]: true,
            },
          }
        })
      }

      // After a failed or unconfirmed Save/Run whose device write started, read the
      // Controller's list and active Pattern once the write queue is idle, so the
      // IDE shows the Controller's state rather than its own guess (#1268).
      const rereadController = (ip: string) => {
        void useControllerPanelStore.getState().rereadAfterFailedWrite(ip)
      }

      const recordLateSave = (
        attempt: SaveAttempt,
        target: ControllerEntry,
        profileSignature: string,
        checkSession: () => boolean,
      ): LateSaveConfirmationHandler => (delivery, record) => {
        const isCurrent = () => {
          const current = get().controllers[attempt.ip]
          if (!isLatestSaveAttempt(attempt) || current?.phase !== 'live'
            || current.liveEpoch !== target.liveEpoch || !sameReconciliationTarget(current, target)) return false
          try {
            return checkSession()
          } catch {
            return false
          }
        }
        if (!isCurrent()) return
        const recorded = queueControllerDeviceWrite(attempt.ip, async () => {
          if (!isCurrent() || !await record(isCurrent)) return false
          if (isCurrent()) rememberSaveOutcome(target, delivery)
          return true
        }).catch(() => false)
        attempt.confirmation = { programId: delivery.programId, profileSignature, recorded }
      }

      const assumeRendererPlaying = (ip: string) => {
        set((s) => {
          if (!s.controllers[ip]) return s
          const rendererPausedByPxlblz = { ...s.rendererPausedByPxlblz }
          delete rendererPausedByPxlblz[ip]
          return {
            rendererPausedByPxlblz,
            rendererStates: {
              ...s.rendererStates,
              [ip]: {
                acknowledged: 'unknown',
                assumedPlaying: true,
                pending: null,
              },
            },
          }
        })
      }

      const reconciliationProvider = (ip: string) =>
        providers.get(ip) ?? (get().activeIp === ip ? getControllerProvider() : null)

      const setReconciliation = (
        profileId: string,
        update: (current: ControllerReconciliationState) => ControllerReconciliationState,
      ) => set((state) => ({
        controllerReconciliations: {
          ...state.controllerReconciliations,
          [profileId]: update(state.controllerReconciliations[profileId] ?? idleReconciliation()),
        },
      }))

      const setReconciliationPhase = (
        profileId: string,
        phase: ControllerReconciliationState['phase'],
        retryAt?: number,
      ) => setReconciliation(profileId, (state) => ({
        ...state,
        phase,
        retryAt,
        restarted: phase === 'running' ? state.restarted : undefined,
      }))

      const queueForegroundPush = (
        ip: string,
        binding: string,
        persist: boolean,
        push: (mark: () => void) => Promise<PushPatternResult>,
      ): Promise<PushPatternResult> => queueControllerDeviceWrite(ip, async () => {
        let finishSave: (() => void) | undefined
        let savedTarget: ReconciliationTarget | undefined
        try {
          const delivery = await push(() => {
            if (persist && !finishSave) {
              savedTarget = get().controllers[ip] ?? { ip }
              finishSave = reconciliationQueue.beginForegroundSave(savedTarget, binding)
            }
          })
          if (savedTarget) rememberSaveOutcome(savedTarget, delivery)
          return delivery
        } finally {
          finishSave?.()
        }
      })

      const runReconciliationPass = async ({
        profile,
        profiles,
        live,
        provider,
        isCurrentSession,
        protectedBindings,
        recheckPatternSources,
        reportPhase,
      }: {
        profile: ControllerProfile
        profiles: ControllerProfile[]
        live: ControllerEntry
        provider: ControllerProvider
        isCurrentSession: () => boolean
        protectedBindings: ReadonlySet<string>
        recheckPatternSources: boolean
        reportPhase: (phase: 'pending' | 'current' | 'attention') => void
      }): Promise<ReconciliationOutcome> => {
        const profileId = profile.id

        const programs = await provider.listPrograms()
        if (!isCurrentSession()) return 'interrupted'
        const config = await provider.getConfig().catch((error: unknown) => {
          if (isReconciliationTimeout(error)) throw error
          return null
        })
        if (!isCurrentSession()) return 'interrupted'

        // Read the metadata after any late publications already in progress.
        // A later acknowledgement can still satisfy a captured job before it starts.
        const confirmationsAtRead = new Set(
          [...(saveAttempts.get(live.ip)?.values() ?? [])].flatMap(
            ({ confirmation }) => confirmation ? [confirmation] : [],
          ),
        )
        if (confirmationsAtRead.size) {
          await Promise.all([...confirmationsAtRead].map(({ recorded }) => recorded))
          if (!isCurrentSession()) return 'interrupted'
        }

        // A failed Show list rejects the reconciliation with the other
        // reads: planning on a partial set would unmanage its Shows (#1129).
        const personalContent = getPersonalContentProvider()
        const [bindings, pushRecords, showRecords] = await Promise.all([
          getControllerBindings(),
          getPushRecords(),
          personalContent.listShowDocumentsV2?.() ?? Promise.resolve([]),
        ])
        if (!isCurrentSession()) return 'interrupted'
        const patternState = usePatternStore.getState()
        const libraryState = useLibraryStore.getState()
        const mapState = useMapStore.getState()
        // Every saved v2 Show through the editor's delivery chain, against
        // the editor's compatibility context; a refused Show is neither
        // pushed nor counted as managed (#1129).
        const compatibility = buildShowControllerCompatibilityContext(
          profile,
          mapState.userMaps,
          live.installedMap,
          STOCK_MAPS,
        )
        // Unattended reconciliation never writes an Installation Show: the
        // installed map cannot be verified atomically at write time, so it
        // reaches a Controller only by an explicit editor send (#1129).
        const showArtifacts = showRecords.flatMap((record) => {
          if (record.outputContract.kind === 'installation') return []
          let delivery: ShowV2ControllerDelivery
          try {
            delivery = prepareShowV2ControllerDelivery({
              record,
              dependencies: {
                patterns: patternState.userPatterns,
                libraries: libraryState.userLibraries,
                maps: mapState.userMaps,
                profiles,
                stageMap: resolveShowV2StageMap(record.stageMapId, mapState.userMaps),
              },
              targetPixelCount: profile.lastKnownPixelCount,
              controller: {
                mapDim: live.mapDim,
                firmwareVersion: live.firmwareVersion,
                compatibility,
              },
            })
          } catch {
            return []
          }
          if (delivery.status !== 'ready') return []
          if (delivery.artifactStamp.showOutputContract?.kind === 'installation') return []
          const bindingKey = `show:${record.id}`
          return [{
            bindingKey,
            name: record.name,
            source: delivery.source,
            artifactStamp: delivery.artifactStamp,
            profileSignature: controllerProfileArtifactSignature(
              profile,
              bindingKey,
              { mapDim: live.mapDim },
            ),
          }]
        })
        const patterns = [
          ...patternState.userPatterns.map((pattern) => ({
            bindingKey: pattern.id,
            name: pattern.name,
            source: pattern.src,
            profileSignature: controllerProfileArtifactSignature(
              profile,
              pattern.id,
              { mapDim: live.mapDim },
              [],
            ),
          })),
          ...Object.entries(DEMOS).map(([name, source]) => ({
            bindingKey: `demo:${name}`,
            name,
            source,
            profileSignature: controllerProfileArtifactSignature(
              profile,
              `demo:${name}`,
              { mapDim: live.mapDim },
              [],
            ),
          })),
        ]
        const wrappersEnabled = enabledControllerWrappers(profile).length > 0
        const pixelCount = config?.pixelCount
        let compiledLibraries: Record<string, string> | undefined
        const prepareDelivery = (artifact: ReconciliationArtifact) =>
          prepareControllerArtifactDelivery({
            source: artifact.source,
            profile,
            artifactId: artifact.bindingKey,
            pixelCount,
            mapDim: live.mapDim,
            alwaysBundle: true,
            libraries: compiledLibraries ??= compileLibraries(LIBRARIES, libraryState.userLibraries),
            extraPasses: live.mapDim && !artifact.bindingKey.startsWith('show:')
              ? [{ id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: live.mapDim }]
              : [],
          })
        const prepared = new Map<string, PreparedControllerArtifactDelivery>()
        const preparationErrors = new Map<string, unknown>()
        const preceding = reconciliationPatternSources.get(live.ip)
        const precedingPatternSources = preceding && sameReconciliationTarget(live, preceding.target)
          ? preceding.patternSources
          : undefined
        const plan = planControllerReconciliation({
          controllerId: live.ip,
          programs,
          bindings,
          pushRecords,
          artifacts: [...patterns, ...showArtifacts],
          resolveArtifact: (artifact) => {
            if (!wrappersEnabled || artifact.bindingKey.startsWith('show:')) return artifact
            try {
              const delivery = prepareDelivery(artifact)
              prepared.set(artifact.bindingKey, delivery)
              return { ...artifact, profileSignature: delivery.profileSignature }
            } catch (error) {
              preparationErrors.set(artifact.bindingKey, error)
              return { ...artifact, profileSignature: null }
            }
          },
          precedingPatternSources: recheckPatternSources ? precedingPatternSources : undefined,
          unconfirmedProgramIds: unconfirmedProgramsFor(live),
        })
        const patternSources = new Map(patterns.map(({ bindingKey, source }) => [bindingKey, source]))
        const preserveEdits = recheckPatternSources || [...reconciliationStalls.values()].some(
          (stall) => sameReconciliationTarget(live, stall.target),
        )
        // An interrupted recheck or an ordinary alias pass during a stall
        // must leave the preceding source available until the edit is saved.
        if (preserveEdits && precedingPatternSources) {
          const records = pushRecords[live.ip]
          for (const [bindingKey, source] of patternSources) {
            const previous = precedingPatternSources.get(bindingKey)
            if (previous !== undefined && previous !== source
              && records?.[bindingKey]?.sourceHash !== artifactHash(source)) {
              patternSources.set(bindingKey, previous)
            }
          }
        }
        reconciliationPatternSources.set(live.ip, { target: live, patternSources })
        const initialPrograms: ControllerReconciliationProgram[] = [
          ...plan.current.map((artifact) => ({
            programId: artifact.programId,
            bindingKey: artifact.bindingKey,
            name: artifact.name,
            state: 'current' as const,
          })),
          ...plan.jobs.map((job) => ({
            programId: job.programId,
            bindingKey: job.bindingKey,
            name: job.name,
            state: 'queued' as const,
          })),
        ]
        setReconciliation(profileId, (state) => ({
          ...state,
          ...(plan.jobs.length > 0 ? { phase: 'running' } : {}),
          managedCount: plan.managedCount,
          unmanagedCount: plan.unmanaged.length,
          completedCount: plan.current.length,
          programs: initialPrograms,
        }))
        const reconciliationSignature = controllerProfileReconciliationSignature(profile)
        const mayStartJob = () => isCurrentSession() && !get().controllerReconciliations[profileId]?.paused
        const planIsCurrent = async () => {
          if (!mayStartJob()) return false
          const latestProfiles = await getPersonalContentProvider().listControllerProfiles().catch(() => [])
          const latest = latestProfiles.find((candidate) => candidate.id === profileId)
          const latestLive = latest ? controllerForProfile(latest, get().controllers) : null
          return Boolean(latest && mayStartJob() && latestLive?.ip === live.ip
            && controllerProfileReconciliationSignature(latest) === reconciliationSignature)
        }
        const patternSourceIsCurrent = ({ bindingKey, source }: ReconciliationArtifact) =>
          (bindingKey.startsWith('demo:')
            || usePatternStore.getState().userPatterns.find((pattern) => pattern.id === bindingKey)?.src === source)
          && libraryState.userLibraries === useLibraryStore.getState().userLibraries
        const outcomeUpdates = plan.current.flatMap((artifact) => {
          const record = pushRecords[live.ip]?.[artifact.bindingKey]
          const delivery = prepared.get(artifact.bindingKey)
          if (!record || artifact.bindingKey.startsWith('show:')) return []
          const wrapperOutcome = delivery?.wrapperOutcome ?? { applied: [], skipped: {} }
          const wrapperPixelCount = delivery ? pixelCount : undefined
          if (!delivery && !Object.keys(record.wrapperOutcome?.skipped ?? {}).length) return []
          if (record.wrapperProgramId !== undefined && record.wrapperProgramId !== artifact.programId) return []
          if (record.sourceHash !== artifactHash(artifact.source)) return []
          if (delivery && record.artifactHash !== artifactHash(delivery.source)) return []
          if (record.wrapperProgramId === artifact.programId && record.wrapperPixelCount === wrapperPixelCount
            && JSON.stringify(record.wrapperOutcome) === JSON.stringify(wrapperOutcome)) return []
          return [{ artifact, record, wrapperOutcome, wrapperPixelCount }]
        })
        if (outcomeUpdates.length) {
          await queueControllerDeviceWrite(live.ip, async () => {
            if (!await planIsCurrent()) return
            if (wrappersEnabled && (await provider.getConfig()).pixelCount !== pixelCount) {
              if (isCurrentSession()) get().scheduleControllerReconciliation(profileId, true)
              return
            }
            const currentBindings = await getControllerBindings()
            await updatePushRecords((records) => {
              if (!mayStartJob()) return records
              let next = records
              for (const { artifact, record, wrapperOutcome, wrapperPixelCount } of outcomeUpdates) {
                const current = records[live.ip]?.[artifact.bindingKey]
                if (currentBindings[live.ip]?.[artifact.bindingKey] !== artifact.programId
                  || protectedBindings.has(artifact.bindingKey)
                  || !patternSourceIsCurrent(artifact)
                  || JSON.stringify(record) !== JSON.stringify(current)) continue
                next = {
                  ...next,
                  [live.ip]: {
                    ...next[live.ip],
                    [artifact.bindingKey]: {
                      ...record,
                      wrapperOutcome,
                      wrapperPixelCount,
                      wrapperProgramId: artifact.programId,
                    },
                  },
                }
              }
              return next
            })
          })
        }
        if (plan.jobs.length === 0) {
          reportPhase('current')
          return 'finished'
        }
        let rereadNeeded = false
        const rememberPatternSource = (job: ControllerReconciliationJob) => {
          if (patternSources.has(job.bindingKey)) patternSources.set(job.bindingKey, job.source)
        }
        const updateProgram = (
          job: ControllerReconciliationJob,
          patch: Partial<ControllerReconciliationProgram>,
          completed = 0,
        ) => setReconciliation(profileId, (state) => ({
          ...state,
          completedCount: state.completedCount + completed,
          programs: state.programs.map((program) =>
            program.programId === job.programId ? { ...program, ...patch } : program),
        }))
        const result = await executeControllerReconciliation({
          jobs: plan.jobs,
          activeProgramId: config?.activeProgramId,
          shouldContinue: planIsCurrent,
          onJobStart: (job) => updateProgram(job, { state: 'updating', message: undefined }),
          onJobComplete: (job) => {
            rememberPatternSource(job)
            updateProgram(job, { state: 'current' }, 1)
          },
          onJobFailed: ({ job, message }) => updateProgram(job, { state: 'failed', message }),
          onJobDeferred: (job) => updateProgram(job, { state: 'queued' }),
          overwrite: async (job, activate) => {
            const profileSignature = job.profileSignature
            if (profileSignature === null) {
              throw preparationErrors.get(job.bindingKey) ?? new Error('Controller artifact preparation failed.')
            }
            const previous = saveAttempts.get(live.ip)?.get(job.bindingKey)
            const confirmation = previous?.confirmation
            if (previous && confirmation && !confirmationsAtRead.has(confirmation)
              && confirmation.programId === job.programId
              && confirmation.profileSignature === profileSignature
              && previous.source === job.source
              && await confirmation.recorded && isLatestSaveAttempt(previous) && isCurrentSession()) return
            const deliveryInputs = prepared.get(job.bindingKey)
            const deliveryArtifact = deliveryInputs ?? prepareDelivery(job)
            const bundled = deliveryArtifact.bundled!
            if (live.mapDim) {
              const hardwarePlan = planHardwareRenderer(
                live.mapDim,
                bundled.metadata.renderFns,
                live.firmwareVersion,
              )
              if (hardwarePlan.firmwareSupport === 'unsupported') {
                throw new Error(hardwarePlan.reason ?? 'Unsupported Controller renderer/map combination')
              }
            }
            const adapterCollision = bundled.warnings.find(
              (warning) => warning.code === 'renderer-adapter-name-collision',
            )
            if (adapterCollision) throw new Error(adapterCollision.message)
            const previewImage = (await buildPreviewJpeg(bundled)) ?? undefined
            const transforms = deliveryArtifact.transformIds
            const artifactStamp = job.artifactStamp
              ? {
                  ...job.artifactStamp,
                  transforms: [...new Set([
                    ...(job.artifactStamp.transforms ?? []),
                    ...transforms,
                  ])],
                }
              : undefined
            let deviceWriteEntered = false
            const assertWriteAllowed = () => {
              if (!isCurrentSession() || protectedBindings.has(job.bindingKey)) {
                throw new ReconciliationWriteCancelled()
              }
              if (deliveryInputs && !deviceWriteEntered && !patternSourceIsCurrent(job)) {
                throw new ReconciliationPlanInvalidated()
              }
            }
            const attempt = beginSaveAttempt(live.ip, job.bindingKey, job.source, false)
            try {
              const delivery = await queueControllerDeviceWrite(live.ip, async () => {
                if (deliveryInputs) {
                  const currentConfig = await provider.getConfig()
                  if (currentConfig.pixelCount !== pixelCount || !await planIsCurrent()) {
                    throw new ReconciliationPlanInvalidated()
                  }
                }
                assertWriteAllowed()
                invalidateRendererState(live.ip)
                if (activate) retainRendererResumeRecovery(live.ip)
                const result = await pushPattern({
                  provider,
                  controllerId: live.ip,
                  patternId: job.bindingKey,
                  source: bundled.code,
                  ...(job.bindingKey.startsWith('show:')
                    ? {}
                    : { sourceHash: artifactHash(job.source) }),
                  name: job.name,
                  persist: true,
                  activateOnSave: activate,
                  requireExisting: true,
                  previewImage,
                  transforms,
                  artifactStamp,
                  profileSignature,
                  wrapperOutcome: deliveryArtifact.wrapperOutcome,
                  wrapperPixelCount: deliveryInputs ? pixelCount : undefined,
                  loadBindings: getControllerBindings,
                  saveBindings: setControllerBindings,
                  loadPushRecords: getPushRecords,
                  savePushRecords: setPushRecords,
                  updatePushRecords,
                  assertDeviceSession: assertWriteAllowed,
                  onDeviceWrite: () => { deviceWriteEntered = true },
                  onLateSaveConfirmation: recordLateSave(attempt, live, profileSignature, isCurrentSession),
                })
                rememberSaveOutcome(live, result)
                if (result.save !== 'unconfirmed') forgetSaveAttempt(attempt)
                return result
              })
              if (!isCurrentSession()) return false
              if (delivery.save === 'unconfirmed') {
                rereadNeeded = true
                return false
              }
              if (delivery.activation === 'unconfirmed') rereadNeeded = true
              else if (activate) assumeRendererPlaying(live.ip)
              // Finish activation and publish the captured receipt before replanning an edit.
              if (deliveryInputs && !patternSourceIsCurrent(job)) {
                get().scheduleControllerReconciliation(profileId, true)
              }
            } catch (error) {
              forgetSaveAttempt(attempt)
              if (!isCurrentSession()) return false
              if (error instanceof ReconciliationPlanInvalidated) {
                // Stop this pass with the preceding source intact for the recheck.
                get().scheduleControllerReconciliation(profileId, true)
                return false
              }
              if (error instanceof ReconciliationWriteCancelled) {
                // Preserve precedence for the overlapping foreground Save.
                rememberPatternSource(job)
                return 'defer' as const
              }
              throw error
            }
          },
        })
        if (result.timedOut) return 'timeout'
        if (rereadNeeded) rereadController(live.ip)
        if (result.stopped) {
          reportPhase('pending')
          return 'interrupted'
        }

        if (!rereadNeeded && get().activeIp === live.ip && isCurrentSession()) {
          await useControllerPanelStore.getState().refreshPrograms(live.ip)
        }
        reportPhase(result.failed.length ? 'attention' : result.deferred ? 'pending' : 'current')
        return 'finished'
      }

      const requestReconciliation = (profileId: string, request: ReconciliationRequest) =>
        reconciliationQueue.request(profileId, request, async (run) => {
          let followUp = false
          let failed: { error: unknown } | undefined
          let phase: 'pending' | 'current' | 'attention' | undefined
          for (let next = run.next(); next; next = run.next()) {
            try {
              await runReconciliation(profileId, next, followUp, run, (settled) => { phase = settled })
            } catch (error) {
              failed ??= { error }
            }
            followUp = true
          }
          // A timeout, missing profile or disconnected session can already have
          // replaced the displayed phase. A trailing read failure leaves the
          // last pass's rows and completion intact.
          if (phase && get().controllerReconciliations[profileId]?.phase !== 'not-responding') {
            setReconciliationPhase(profileId, phase)
          }
          if (failed) throw failed.error
        })

      const reportBackgroundReconciliationError = (error: unknown) => {
        console.error('Managed Pattern reconciliation failed', error)
      }

      const reconcileConnectedController = async (ip: string) => {
        const live = get().controllers[ip]
        if (live?.phase !== 'live') return
        const profiles = await getPersonalContentProvider().listControllerProfiles().catch(() => [])
        const current = get().controllers[ip]
        if (current?.phase !== 'live' || current.liveEpoch !== live.liveEpoch) return
        const profile = findProfileForLiveController(profiles, current)
        if (profile) get().scheduleControllerReconciliation(profile.id)
      }

      const updateStall = (profileId: string, stall: ReconciliationStall | undefined): void => {
        clearReconciliationTimer(reconciliationRetryTimers, profileId)
        if (!stall) {
          reconciliationStalls.delete(profileId)
          return
        }
        reconciliationStalls.set(profileId, stall)
        if (stall.stage !== 'scheduled') return
        const timer = setTimeout(() => {
          reconciliationRetryTimers.delete(profileId)
          void requestReconciliation(profileId, { kind: 'automatic', scheduled: stall })
            .catch(reportBackgroundReconciliationError)
        }, Math.max(0, stall.at - Date.now()))
        reconciliationRetryTimers.set(profileId, timer)
      }

      const settleReconciliation = (
        profileId: string,
        target: Pick<ControllerEntry, 'ip' | 'deviceId'>,
        automatic: boolean,
        outcome: ReconciliationOutcome,
      ): void => {
        const stall = stallAfterReconciliation(target, automatic, outcome, Date.now())
        updateStall(profileId, stall)
        if (stall) {
          setReconciliationPhase(profileId, 'not-responding', stall.stage === 'scheduled' ? stall.at : undefined)
        }
      }

      async function runReconciliation(
        profileId: string,
        request: ReconciliationRequest,
        followUp: boolean,
        run: ControllerReconciliationRun,
        reportPhase: (phase: 'pending' | 'current' | 'attention' | undefined) => void,
      ): Promise<void> {
        const scheduled = request.kind === 'automatic' ? request.scheduled : undefined
        const clearStall = () => {
          updateStall(profileId, undefined)
          setReconciliationPhase(profileId, 'pending')
        }
        const initialStall = reconciliationStalls.get(profileId)
        if (request.kind === 'manual' && initialStall) clearStall()

        for (;;) {
          if (scheduled && reconciliationStalls.get(profileId) !== scheduled) return
          if (get().controllerReconciliations[profileId]?.paused) {
            if (scheduled) settleReconciliation(profileId, scheduled.target, true, 'interrupted')
            return
          }
          await waitForControllerProfileWrites()
          const profiles = await getPersonalContentProvider().listControllerProfiles().catch(() => null)
          if (!profiles) {
            if (scheduled) settleReconciliation(profileId, scheduled.target, true, 'interrupted')
            return
          }
          const profile = profiles.find((candidate) => candidate.id === profileId)
          if (!profile) {
            updateStall(profileId, undefined)
            setReconciliation(profileId, idleReconciliation)
            reportPhase(undefined)
            return
          }

          const live = controllerForProfile(profile, get().controllers)
          const stall = reconciliationStalls.get(profileId)
          const replaced = Boolean(live && stall && !sameReconciliationTarget(live, stall.target))
          if (replaced) {
            clearStall()
            // Only a new trigger can start work against the replacement.
            if (scheduled) return
          }
          if (request.kind === 'background') {
            if (stall && !replaced) return
            if (request.stalledTarget && !request.profileChanged
              && (!live || sameReconciliationTarget(live, request.stalledTarget))) return
          }
          const provider = live?.phase === 'live' ? reconciliationProvider(live.ip) : null
          if (!live || !provider) {
            if (scheduled) settleReconciliation(profileId, scheduled.target, true, 'interrupted')
            else reportPhase('pending')
            return
          }

          const claim = run.claim(live)
          if ('wait' in claim) {
            await claim.wait
            followUp = true
            continue
          }
          const { lease } = claim
          const isCurrentSession = () => {
            const current = get().controllers[live.ip]
            return current?.phase === 'live' && current.liveEpoch === live.liveEpoch
              && sameReconciliationTarget(current, live) && reconciliationProvider(live.ip) === provider
          }
          let outcome: ReconciliationOutcome = 'interrupted'
          try {
            if (scheduled) {
              updateStall(profileId, { target: scheduled.target, stage: 'retrying' })
              setReconciliationPhase(profileId, 'running')
            }
            outcome = await runReconciliationPass({
              profile,
              profiles,
              live,
              provider,
              isCurrentSession,
              protectedBindings: lease.protectedBindings,
              recheckPatternSources: followUp || Boolean(initialStall),
              reportPhase,
            })
          } catch (error) {
            if (!isReconciliationTimeout(error)) throw error
            if (isCurrentSession()) outcome = 'timeout'
          } finally {
            settleReconciliation(profileId, live, Boolean(scheduled), outcome)
          }
          return
        }
      }

      return {
        ...controllerInitialState,

        detectExtension: async () => {
          const availability = await detectControllerExtension().catch(() => 'absent' as const)
          const present = availability !== 'absent'
          set({ extensionPresent: present, helperConflict: availability === 'multiple' })
          return present
        },

        discover: async () => {
          // Re-entrancy guard: auto-on-open, the periodic tick, and the manual
          // refresh affordance can all fire — never let two sweeps overlap.
          if (get().discovering) return
          set({ discovering: true, discoveryUnavailable: false })
          let found: DiscoveredController[]
          try {
            found = await discoverControllers()
          } catch (error) {
            if (error instanceof ControllerHelperConflictError) {
              set({ extensionPresent: true, helperConflict: true, discovered: [], discovering: false })
              return
            }
            set({ discovered: [], discovering: false, discoveryUnavailable: true })
            return
          }
          // Drop active connection attempts and live Controllers from discovery.
          // Keep errored entries discoverable so the network list can be used as
          // the normal retry path after a failed connect. Match by stable device
          // id when possible so the same hardware does not reappear after an IP
          // change.
          const connected = get().controllers
          set({
            discovered: availableDiscoveredControllers(found, Object.values(connected)),
            discovering: false,
            discoveryUnavailable: false,
          })
        },

        setActive: (ip) => {
          set({ activeIp: ip })
          setControllerProvider(providers.get(ip) ?? new NullControllerProvider())
        },

        forgetDeletedSavedProgram: (controllerId, bindingKey) => set((state) => ({
          lastSavedSource: withoutControllerMemoEntry(
            state.lastSavedSource,
            controllerId,
            bindingKey,
          ),
          lastSavedProfileSignature: withoutControllerMemoEntry(
            state.lastSavedProfileSignature,
            controllerId,
            bindingKey,
          ),
          lastPushedSource: withoutControllerMemoEntry(
            state.lastPushedSource,
            controllerId,
            bindingKey,
          ),
          lastPushedProfileSignature: withoutControllerMemoEntry(
            state.lastPushedProfileSignature,
            controllerId,
            bindingKey,
          ),
          lastRunProgramId: withoutControllerMemoEntry(
            state.lastRunProgramId,
            controllerId,
            bindingKey,
          ),
        })),

        refreshInstalledMap: async (ip, options = {}) => {
          const provider = providers.get(ip) ?? (get().activeIp === ip ? getControllerProvider() : null)
          const entry = get().controllers[ip]
          if (!provider || !entry) return
          const prior = installedMapReads.get(ip)
          if (options.reuseObserved && !options.expectedFingerprint
            && prior?.provider === provider && prior.liveEpoch === entry.liveEpoch) {
            return prior.promise
          }
          const generation = (installedMapReadGenerations.get(ip) ?? 0) + 1
          installedMapReadGenerations.set(ip, generation)
          // Start asynchronously so the shared promise exists before publishing loading.
          const promise = Promise.resolve().then(async () => {
            let observation: LiveInstalledMapState = { status: 'error', message: 'Map unavailable' }
            const attempts = options.expectedFingerprint ? 3 : 1
            for (let attempt = 0; attempt < attempts; attempt += 1) {
              try {
                observation = inspectInstalledMapData(await provider.getPixelMapData())
              } catch (error) {
                observation = {
                  status: 'error',
                  message: error instanceof Error ? error.message : String(error),
                }
              }
              const settled = !options.expectedFingerprint
                || (observation.status === 'present' && observation.fingerprint === options.expectedFingerprint)
              if (settled || attempt === attempts - 1) break
              await new Promise((resolve) => setTimeout(resolve, 150 * (attempt + 1)))
            }
            if (
              installedMapReadGenerations.get(ip) !== generation
              || !get().controllers[ip]
              || get().controllers[ip].liveEpoch !== entry.liveEpoch
            ) return
            patchController(ip, {
              installedMap: observation,
              ...(observation.status === 'present' ? { mapDim: observation.dimension } : observation.status === 'absent' ? { mapDim: null } : {}),
            })
          })
          installedMapReads.set(ip, { provider, liveEpoch: entry.liveEpoch, promise })
          patchController(ip, { installedMap: { status: 'loading' } })
          return promise
        },

        addController: async (controllerTarget, seedNickname) => {
          const { ip: target, connectTarget, seedNickname: targetSeed } =
            normalizeControllerTarget(controllerTarget, seedNickname)
          if (!target) return
          const initialConnection = get().controllers[target] === undefined
            && get().rendererPausedByPxlblz[target] !== true

          // Reconnecting to the controller we last connected to? Seed the pending pill
          // from the cached name so it never flashes the bare IP before getConfig lands
          // (#230). The live read below still overwrites it if the device was renamed.
          const seed =
            targetSeed ??
            (target === get().lastConnectedIp ? get().lastConnectedNickname ?? undefined : undefined)

          // Reuse an existing provider (retry) or mint a fresh one.
          let provider = providers.get(target)
          if (!provider) {
            provider = createControllerProvider(target)
            providers.set(target, provider)
            unsubscribers.set(
              target,
              provider.subscribe((status) => {
                if (status.kind === 'error' && status.reason === 'multiple-helpers') {
                  set({ extensionPresent: true, helperConflict: true })
                }
                const previousEpoch = get().controllers[target]?.liveEpoch
                const patch = phaseFromStatus(status)
                if (patch) patchController(target, patch)
                if (status.kind === 'connected' && previousEpoch !== undefined
                  && get().controllers[target]?.liveEpoch !== previousEpoch) {
                  void reconcileConnectedController(target)
                }
                if (status.kind === 'connecting' || status.kind === 'error') {
                  invalidateRendererState(target)
                }
              }),
            )
          }

          // Born pending + active the instant the add is submitted.
          rendererCommandGenerations.set(
            target,
            (rendererCommandGenerations.get(target) ?? 0) + 1,
          )
          set((s) => ({
            controllers: {
              ...s.controllers,
              [target]: {
                ip: target,
                deviceId: connectTarget.deviceId ?? null,
                phase: 'pending',
                installedMap: { status: 'loading' },
                mapDim: null,
                nickname: seed || undefined,
                firmwareVersion: connectTarget.firmwareVersion,
                firmwareUpdateState: s.controllers[target]?.firmwareUpdateState,
                authorizationNeededIp: null,
              },
            },
            rendererStates: {
              ...s.rendererStates,
              [target]: { acknowledged: 'unknown', pending: null },
            },
          }))
          get().setActive(target)

          try {
            await provider.connect(connectTarget)
          } catch (e) {
            // A declined per-IP permission grant (#229) is a user choice, not a
            // failure to dwell on: drop the half-created entry so the UI returns to
            // the pre-connect state and the next Connect re-prompts. Any other
            // failure leaves the entry, whose pill the status subscription has
            // already flipped to error.
            if (e instanceof ControllerPermissionDeniedError) await get().removeController(target)
            return
          }
          if (initialConnection) assumeRendererPlaying(target)

          // Live: read config and the one canonical raw installed-map observation.
          const nicknameBeforeBootstrap = get().controllers[target]?.nickname
          const [config] = await Promise.all([
            provider.getConfig().catch(() => null),
            get().refreshInstalledMap(target, { reuseObserved: true }),
          ])
          const liveDeviceId = get().controllers[target]?.deviceId ?? connectTarget.deviceId ?? null
          const currentNickname = get().controllers[target]?.nickname
          // A live rename may finish while the map read is still pending. In that
          // case the earlier config response is stale and must not republish its
          // name into the entry or either reconnect cache.
          const nicknameChangedDuringBootstrap = currentNickname !== nicknameBeforeBootstrap
          const acceptedConfigName = nicknameChangedDuringBootstrap ? undefined : config?.name
          const reportedName = nicknameChangedDuringBootstrap
            ? currentNickname
            : acceptedConfigName ?? connectTarget.name
          const rememberedName = nicknameChangedDuringBootstrap
            ? currentNickname
            : acceptedConfigName
          const reportedFirmwareVersion = config?.firmwareVersion ?? connectTarget.firmwareVersion
          patchController(target, {
            phase: 'live',
            // Sticky name: only overwrite when getConfig actually returned one. During
            // the reconnect churn (#230) getConfig can land on a torn-down socket and
            // reject (→ null here); clobbering the name to undefined would flash the
            // pill back to the bare IP. Keep the seeded/last-known name instead.
            ...(acceptedConfigName ? { nickname: acceptedConfigName } : {}),
            ...(reportedFirmwareVersion ? { firmwareVersion: reportedFirmwareVersion } : {}),
          })
          // Remember the IP *and* the freshly-read name (#215). A device rename since
          // last session lands here, so the persisted nickname reflects the device's
          // current name. Only overwrite the remembered name when we actually read one
          // — a transient getConfig failure must not poison the seed for next reload.
          set({
            lastConnectedIp: target,
            ...(rememberedName ? { lastConnectedNickname: rememberedName } : {}),
          })
          if (liveDeviceId) {
            set((s) => ({
              lastKnownControllerIps: { ...s.lastKnownControllerIps, [liveDeviceId]: target },
              ...(reportedName
                ? {
                    lastKnownControllerNames: {
                      ...s.lastKnownControllerNames,
                      [liveDeviceId]: reportedName,
                    },
                  }
                : {}),
            }))
          }
          // Warm the panel store immediately so it opens populated rather than
          // empty-then-jumping as the first lazy poll lands (#225). The panel still
          // owns the polling interval (started on open); this is a one-shot seed.
          useControllerPanelStore.getState().seed(target)

          await reconcileConnectedController(target)

          // The Controller owns compatibility and release selection. Keep this
          // best-effort and off the connection's critical path; reconnect churn
          // reuses the session result for an hour.
          const firmwareCheckKey = liveDeviceId ?? target
          const lastFirmwareCheck = firmwareUpdateCheckedAt.get(firmwareCheckKey)
          if (
            lastFirmwareCheck == null ||
            Date.now() - lastFirmwareCheck >= FIRMWARE_UPDATE_CHECK_INTERVAL_MS
          ) {
            const checkedAt = Date.now()
            const observedVersion = get().controllers[target]?.firmwareVersion
            firmwareUpdateCheckedAt.set(firmwareCheckKey, checkedAt)
            void provider
              .checkFirmwareUpdate()
              .then((firmwareUpdateState) => patchController(target, {
                firmwareUpdateState,
                firmwareUpdateCheckedAt: checkedAt,
                ...(observedVersion ? { firmwareUpdateObservedVersion: observedVersion } : {}),
              }))
              .catch(() => patchController(target, {
                firmwareUpdateState: 'unknown',
                firmwareUpdateCheckedAt: checkedAt,
                ...(observedVersion ? { firmwareUpdateObservedVersion: observedVersion } : {}),
              }))
          }
        },

        removeController: async (ip) => {
          installedMapReads.delete(ip)
          installedMapReadGenerations.set(ip, (installedMapReadGenerations.get(ip) ?? 0) + 1)
          const provider = providers.get(ip)
          unsubscribers.get(ip)?.()
          unsubscribers.delete(ip)
          providers.delete(ip)
          await provider?.disconnect().catch(() => {})

          set((s) => {
            const controllers = { ...s.controllers }
            const rendererStates = { ...s.rendererStates }
            delete controllers[ip]
            delete rendererStates[ip]
            const nextActive =
              s.activeIp === ip ? (Object.keys(controllers)[0] ?? null) : s.activeIp
            return {
              controllers,
              rendererStates,
              activeIp: nextActive,
              lastConnectedIp: s.lastConnectedIp === ip ? null : s.lastConnectedIp,
              lastConnectedNickname:
                s.lastConnectedIp === ip ? null : s.lastConnectedNickname,
            }
          })
          rendererCommandGenerations.set(ip, (rendererCommandGenerations.get(ip) ?? 0) + 1)
          // Re-point the active provider at the new active Controller (or none).
          const { activeIp } = get()
          setControllerProvider(activeIp ? providers.get(activeIp)! : new NullControllerProvider())
        },

        setRendererPaused: async (ip, paused) => {
          const provider = providers.get(ip)
          const entry = get().controllers[ip]
          if (
            !provider ||
            entry?.phase !== 'live' ||
            (get().pushing && get().activeIp === ip)
          ) return

          const pending: ControllerRendererCommand = paused ? 'pause' : 'resume'
          const generation = (rendererCommandGenerations.get(ip) ?? 0) + 1
          rendererCommandGenerations.set(ip, generation)
          set((s) => {
            const rendererPausedByPxlblz = { ...s.rendererPausedByPxlblz }
            if (paused) rendererPausedByPxlblz[ip] = true
            return {
              rendererPausedByPxlblz,
              rendererStates: {
                ...s.rendererStates,
                [ip]: {
                  acknowledged: s.rendererStates[ip]?.acknowledged ?? 'unknown',
                  pending,
                },
              },
            }
          })

          try {
            await queueControllerDeviceWrite(ip, () => provider.setRendererPaused(paused))
            if (
              rendererCommandGenerations.get(ip) !== generation ||
              providers.get(ip) !== provider ||
              get().controllers[ip]?.phase !== 'live'
            ) return
            set((s) => {
              const rendererPausedByPxlblz = { ...s.rendererPausedByPxlblz }
              if (!paused) delete rendererPausedByPxlblz[ip]
              return {
                rendererPausedByPxlblz,
                rendererStates: {
                  ...s.rendererStates,
                  [ip]: {
                    acknowledged: paused ? 'paused' : 'playing',
                    pending: null,
                  },
                },
              }
            })
          } catch (error) {
            if (
              rendererCommandGenerations.get(ip) !== generation ||
              providers.get(ip) !== provider ||
              get().controllers[ip]?.phase !== 'live'
            ) return
            const message = error instanceof Error ? error.message : String(error)
            set((s) => ({
              rendererStates: {
                ...s.rendererStates,
                [ip]: {
                  acknowledged: s.rendererStates[ip]?.acknowledged ?? 'unknown',
                  pending: null,
                  error: message,
                },
              },
            }))
          }
        },

        renameControllerProfile: async (profileId, requestedName) => {
          const name = requestedName.trim()
          if (!name) throw new Error('Controller name is required')

          const profile = useControllerProfileStore.getState().profiles.find(
            (candidate) => candidate.id === profileId,
          )
          const entry = profile
            ? controllerForProfile(profile, get().controllers)
            : null
          if (
            !profile?.deviceId
            || !entry
            || entry.phase !== 'live'
            || !sameControllerDeviceId(entry.deviceId, profile.deviceId)
            || entry.liveEpoch == null
          ) {
            throw new Error('Connect this Controller before renaming it')
          }

          const ip = entry.ip
          const deviceId = profile.deviceId
          const liveEpoch = entry.liveEpoch
          const provider = providers.get(ip)
          const status = provider?.getStatus()
          if (!provider || !status || status.kind !== 'connected') {
            throw new Error('Connect this Controller before renaming it')
          }
          const expectedController = {
            id: status.controller.id,
            address: status.controller.address,
          }

          const assertCurrentSession = () => {
            const current = get().controllers[ip]
            if (
              providers.get(ip) !== provider
              || current?.phase !== 'live'
              || !sameControllerDeviceId(current.deviceId, deviceId)
              || current.liveEpoch !== liveEpoch
              || !statusMatchesConnectedController(expectedController, provider.getStatus())
            ) {
              throw new Error('Controller connection changed before the rename completed')
            }
          }

          const assertCurrentProfile = () => {
            const currentProfile = useControllerProfileStore.getState().profiles.find(
              (candidate) => candidate.id === profileId,
            )
            if (!sameControllerDeviceId(currentProfile?.deviceId, deviceId)) {
              throw new Error('Controller profile changed before the rename completed')
            }
          }

          await queueControllerDeviceWrite(ip, async () => {
            assertCurrentProfile()
            assertCurrentSession()
            await provider.setName(name)
            assertCurrentSession()
            const confirmed = await provider.getConfig()
            assertCurrentSession()
            if (confirmed.name !== name) {
              throw new Error(`Controller did not confirm the name “${name}”`)
            }
            assertCurrentProfile()

            patchController(ip, { nickname: name })
            set((state) => ({
              ...(state.lastConnectedIp === ip ? { lastConnectedNickname: name } : {}),
              lastKnownControllerNames: {
                ...state.lastKnownControllerNames,
                [deviceId]: name,
              },
            }))
            await useControllerProfileStore.getState().updateProfile(profileId, {
              name,
              lastKnownDeviceName: name,
            })
          })
        },

        autoConnect: async () => {
          const remembered = get().lastConnectedIp?.trim()
          if (!remembered) return
          await get().addController(remembered, get().lastConnectedNickname ?? undefined)
        },

        setSaveArmed: (armed) => set({ saveArmed: armed }),

        clearPushResult: () => set({ pushResult: null }),

        clearArtifactPushResult: () => set({ artifactPushResult: null }),

        reportArtifactPushFailure: (result) => set({ artifactPushResult: result }),

        scheduleControllerReconciliation: (profileId, profileChanged) => {
          clearReconciliationTimer(reconciliationTimers, profileId)
          const state = get().controllerReconciliations[profileId]
          if (state?.paused) return
          const request: ReconciliationRequest = {
            kind: 'background',
            stalledTarget: reconciliationStalls.get(profileId)?.target,
            profileChanged,
          }
          const enqueue = () => {
            void requestReconciliation(profileId, request).catch(reportBackgroundReconciliationError)
          }
          if (reconciliationQueue.busy(profileId)) {
            if (profileChanged && state?.phase === 'running' && !state.restarted) {
              setReconciliation(profileId, (state) => ({ ...state, restarted: true }))
            }
            enqueue()
            return
          }
          if (!state) setReconciliationPhase(profileId, 'pending')
          reconciliationTimers.set(profileId, setTimeout(() => {
            reconciliationTimers.delete(profileId)
            enqueue()
          }, 600))
        },

        pauseControllerReconciliation: (profileId) => {
          clearReconciliationTimer(reconciliationTimers, profileId)
          setReconciliation(profileId, (state) => ({ ...state, paused: true }))
        },

        resumeControllerReconciliation: (profileId) => {
          if (!get().controllerReconciliations[profileId]?.paused) return
          setReconciliation(profileId, (state) => ({ ...state, paused: false }))
          const request = reconciliationStalls.has(profileId)
            ? { kind: 'manual' } as const
            : { kind: 'background' } as const
          void requestReconciliation(profileId, request).catch(reportBackgroundReconciliationError)
        },

        reconcileControllerProfile: (profileId) => {
          clearReconciliationTimer(reconciliationTimers, profileId)
          if (get().controllerReconciliations[profileId]?.paused) {
            setReconciliation(profileId, (state) => ({ ...state, paused: false }))
          }
          return requestReconciliation(profileId, { kind: 'manual' })
        },

        pushGeneratedArtifact: async (artifact) => {
          const controllerId = get().activeIp
          if (!controllerId || artifact.source.length === 0) return

          const mode: SendMode = artifact.persist ? 'save' : 'run'
          const attempt = artifact.persist
            ? beginSaveAttempt(controllerId, artifact.artifactId, artifact.source, true)
            : undefined
          // Set by pushPattern just before its first device write (drain, Save or
          // activation): only then can a failure leave the Controller in a state the
          // IDE did not observe. A compile or read failure leaves it unset (#1268).
          let deviceWriteEntered = false
          set({ pushing: true, pushResult: null, artifactPushResult: null })
          invalidateRendererState(controllerId)
          retainRendererResumeRecovery(controllerId)
          try {
            const activeController = get().controllers[controllerId]
            await waitForControllerProfileWrites()
            const profiles = await getPersonalContentProvider().listControllerProfiles().catch(() => [])
            const profile = activeController
              ? findProfileForLiveController(profiles, activeController)
              : null
            const pixelCount = enabledControllerWrappers(profile, artifact.artifactId).length
              ? (await getControllerProvider().getConfig()).pixelCount
              : undefined
            const extraPasses = []
            if (activeController?.mapDim && artifact.artifactStamp.kind !== 'show') {
              extraPasses.push({
                id: 'renderer-adapter',
                kind: 'renderer-adapter' as const,
                mapDim: activeController.mapDim,
              })
            }
            const delivery = prepareControllerArtifactDelivery({
              source: artifact.source,
              profile,
              artifactId: artifact.artifactId,
              pixelCount,
              mapDim: activeController?.mapDim ?? null,
              libraries: compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries),
              extraPasses,
            })
            const { profileSignature } = delivery
            const bundled = delivery.bundled
            if (bundled && activeController?.mapDim) {
              const hardwarePlan = planHardwareRenderer(
                activeController.mapDim,
                bundled.metadata.renderFns,
                activeController.firmwareVersion,
              )
              if (hardwarePlan.firmwareSupport === 'unsupported') {
                throw new Error(hardwarePlan.reason ?? 'Unsupported Controller renderer/map combination')
              }
            }
            const adapterCollision = bundled?.warnings.find(
              (warning) => warning.code === 'renderer-adapter-name-collision',
            )
            if (adapterCollision) throw new Error(adapterCollision.message)
            const source = delivery.source
            const pressure = assessShowCompilePressure({
              deliveredSourceBytes: deliveredShowSourceBytes(source),
              ...artifact.compilePressure,
            })
            if (pressure.status === 'blocked') {
              throw new Error(pressure.blocks.join(' '))
            }
            const transforms = delivery.transformIds
            const artifactStamp = {
              ...artifact.artifactStamp,
              transforms: [...new Set([
                ...(artifact.artifactStamp.transforms ?? []),
                ...transforms,
              ])],
            }
            const { created, programId, activation, save } = await queueForegroundPush(
              controllerId,
              artifact.artifactId,
              artifact.persist,
              (markSave) => {
                const provider = getControllerProvider()
                const status = provider.getStatus()
                const liveEpoch = get().controllers[controllerId]?.liveEpoch
                const expectedControllerSession = artifact.expectedControllerSession
                  ?? (status.kind === 'connected' && liveEpoch != null
                    ? { ...status.controller, liveEpoch }
                    : undefined)
                const assertDeviceSession = expectedControllerSession
                  ? () => {
                      if (
                        get().activeIp !== controllerId
                        || (get().controllers[controllerId]?.liveEpoch ?? 0) !== expectedControllerSession.liveEpoch
                        || getControllerProvider() !== provider
                        || !statusMatchesConnectedController(expectedControllerSession, provider.getStatus())
                      ) {
                        throw new Error('Controller session changed before Show delivery')
                      }
                    }
                  : undefined
                // Compilation evidence survives upload failure, but never a stale
                // asynchronous hash completion. It is excluded from persistence.
                set({ lastShowArtifactCompilation: null })
                return pushPattern({
                  provider,
                  controllerId,
                  patternId: artifact.artifactId,
                  source,
                  name: artifact.name,
                  persist: artifact.persist,
                  previewImage: artifact.previewImage,
                  artifactStamp,
                  profileSignature,
                  wrapperOutcome: delivery.wrapperOutcome,
                  wrapperPixelCount: pixelCount,
                  transforms: artifactStamp.transforms,
                  stampedAt: artifact.artifactStamp.stampedAt,
                  loadBindings: getControllerBindings,
                  saveBindings: setControllerBindings,
                  loadPushRecords: getPushRecords,
                  savePushRecords: setPushRecords,
                  updatePushRecords,
                  ...(assertDeviceSession ? { assertDeviceSession } : {}),
                  ...(attempt && activeController && assertDeviceSession && {
                    onLateSaveConfirmation: recordLateSave(attempt, activeController, profileSignature, () => {
                      assertDeviceSession()
                      return true
                    }),
                  }),
                  onDeviceWrite: () => {
                    deviceWriteEntered = true
                    markSave()
                  },
                  onCompiledArtifact: async (compiled) => {
                    let sourceSha256: string
                    try {
                      sourceSha256 = await sha256CompleteCompileInput(compiled.source)
                    } catch {
                      assertDeviceSession?.()
                      return
                    }
                    assertDeviceSession?.()
                    if (!expectedControllerSession) return
                    set({ lastShowArtifactCompilation: {
                      controllerId: expectedControllerSession.id,
                      liveEpoch: expectedControllerSession.liveEpoch,
                      sourceSha256,
                      byteLength: compiled.byteLength,
                    } })
                  },
                })
              },
            )
            if (save === 'unconfirmed') {
              set({ pushing: false })
              rereadController(controllerId)
              return
            }
            forgetSaveAttempt(attempt)
            const activationUnconfirmed = activation === 'unconfirmed'
            if (!activationUnconfirmed) {
              assumeRendererPlaying(controllerId)
              useControllerPanelStore.getState().noteProgramActivated(programId, controllerId)
            }

            if (artifact.name) {
              const labels = withProgramLabel(
                await getProgramLabels(),
                controllerId,
                programId,
                artifact.name,
              )
              await setProgramLabels(labels)
              useControllerPanelStore.getState().noteProgramLabel(programId, artifact.name)
            }
            // Saved, activation unconfirmed: the re-read replaces the ordinary refresh
            // and reports whichever Pattern the Controller is actually running.
            if (activationUnconfirmed) rereadController(controllerId)
            else if (artifact.persist) void useControllerPanelStore.getState().refreshPrograms()

            const recordKey = artifact.persist ? 'lastSavedSource' : 'lastPushedSource'
            const profileRecordKey = artifact.persist
              ? 'lastSavedProfileSignature'
              : 'lastPushedProfileSignature'
            const result: ArtifactPushResult = {
              ok: true,
              created,
              artifactId: artifact.artifactId,
              mode,
            }
            set((state) => ({
              pushing: false,
              pushResult: null,
              artifactPushResult: result,
              [recordKey]: {
                ...state[recordKey],
                [controllerId]: {
                  ...state[recordKey][controllerId],
                  [artifact.artifactId]: artifact.source,
                },
              },
              [profileRecordKey]: {
                ...state[profileRecordKey],
                [controllerId]: {
                  ...state[profileRecordKey][controllerId],
                  [artifact.artifactId]: profileSignature,
                },
              },
              ...(!artifact.persist
                ? {
                    lastRunProgramId: {
                      ...state.lastRunProgramId,
                      [controllerId]: {
                        ...state.lastRunProgramId[controllerId],
                        [artifact.artifactId]: programId,
                      },
                    },
                  }
                : {}),
            }))
          } catch (error) {
            forgetSaveAttempt(attempt)
            const message = error instanceof Error ? error.message : String(error)
            set({
              pushing: false,
              pushResult: null,
              artifactPushResult: {
                ok: false,
                message,
                artifactId: artifact.artifactId,
                mode,
              },
            })
            if (deviceWriteEntered) rereadController(controllerId)
          }
        },

        requestPush: async () => {
          // A pattern push has no *count* preflight (#239) — it sends bytecode only and
          // the device runs it on its own pixels + map. The one concern is the dim match:
          // a pattern whose dimensionality differs from the installed map renders against
          // coordinates that don't line up. That's a soft warning, so reconcile and, only
          // when it fires, open the popover; otherwise push straight through (the valued
          // one-click path). The guard inside pushActivePattern makes a stray call inert.
          const activeIp = get().activeIp
          const active = activeIp ? get().controllers[activeIp] : undefined
          const editor = useEditorStore.getState()
          const patternDim = editor.nativeDim
          let rendererPlan
          if (active?.mapDim && editor.previewSource) {
            try {
              const metadata = bundleWithPasses(
                editor.previewSource,
                compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries),
              ).metadata
              rendererPlan = planHardwareRenderer(
                active.mapDim,
                metadata.renderFns,
                active.firmwareVersion,
              )
            } catch {
              // The normal push path owns compile/bundle errors. A preflight miss must
              // not replace its actionable Send-failed result with a second error path.
            }
          }
          const { warnings, blocking } = describePreflight({
            pushingMap: false,
            patternDim,
            mapDim: active?.mapDim ?? null,
            rendererPlan,
          })
          if (warnings.length > 0) {
            // A cross-dimensional plan may carry a coupled remedy (Option A): a demo
            // whose recommended map can be installed first. Known pre-3.66 fallbacks
            // are blocking unless that remedy changes the installed map.
            const demoName = usePatternStore.getState().activeDemoName
            set({
              preflight: warnings,
              mapPushRemedyCount: null,
              patternMapRemedy: recommendedMapRemedy(demoName, patternDim),
              patternPushBlocked: blocking,
            })
            return
          }
          await get().pushActivePattern()
        },

        confirmPatternPush: async () => {
          if (get().patternPushBlocked) return
          set({
            preflight: null,
            mapPushRemedyCount: null,
            patternMapRemedy: null,
            patternPushBlocked: false,
          })
          await get().pushActivePattern()
        },

        confirmPatternPushWithMap: async () => {
          const remedy = get().patternMapRemedy
          const controllerId = get().activeIp
          const patternId = activePushKey(usePatternStore.getState())
          const mode: SendMode = get().saveArmed ? 'save' : 'run'
          set({
            preflight: null,
            mapPushRemedyCount: null,
            patternMapRemedy: null,
            patternPushBlocked: false,
          })
          // No remedy to apply (shouldn't happen via the checkbox) — plain push.
          if (!remedy) {
            await get().pushActivePattern()
            return
          }
          // Install the recommended map first (count, then map). A failure aborts before
          // the pattern push — surfaced through the same pushResult the button reads.
          set({ pushing: true, pushResult: null, artifactPushResult: null })
          try {
            const expectedFingerprint = await installStockMap(remedy)
            if (controllerId) {
              await get().refreshInstalledMap(controllerId, { expectedFingerprint })
            }
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({
              pushing: false,
              pushResult: { ok: false, message },
              ...(patternId
                ? {
                    artifactPushResult: {
                      ok: false as const,
                      message,
                      artifactId: patternId,
                      mode,
                    },
                  }
                : {}),
            })
            return
          }
          await get().pushActivePattern()
        },

        cancelPush: () =>
          set({
            preflight: null,
            mapPushRemedyCount: null,
            patternMapRemedy: null,
            patternPushBlocked: false,
          }),

        requestMapPush: async () => {
          const controllerId = get().activeIp
          const map = openMapForPush()
          if (!controllerId || !map) return

          // Fresh device count (best-effort) for the count-fit reconciliation; a read
          // failure leaves it unknown and only the overwrite warning shows.
          const config = await getControllerProvider().getConfig().catch(() => null)
          const devicePixelCount = config?.pixelCount ?? null
          // Reconcile against what we will *actually* send: the map re-baked to the
          // device count (#204), not the preview-baked array. A map whose source honours
          // its `pixelCount` argument conforms here and the counts match; a hard-coded
          // point count can't, leaving a mismatch the firmware would silently drop (#213).
          const points = resolveMapPushPoints(map.source, map.points, devicePixelCount)
          const { warnings, blocking, remedyPixelCount } = describePreflight({
            localPixelCount: points.length,
            devicePixelCount,
            // A map send always overwrites the device's single shared map, so the
            // overwrite warning always fires — the dialog always opens (a deliberate
            // act, never a silent one-click like a clean pattern push).
            pushingMap: true,
          })
          // A blocking mismatch arms the coupled remedy; otherwise the dialog offers the
          // plain "Send anyway" path.
          set({ preflight: warnings, mapPushRemedyCount: blocking ? remedyPixelCount : null })
        },

        confirmMapPush: async () => {
          const remedy = get().mapPushRemedyCount
          set({ preflight: null, mapPushRemedyCount: null })
          // Blocking mismatch: the map can't conform, so couple the push with a
          // setPixelCount that makes the device match the map's fixed point count. Order
          // matters — the firmware validates a saved map against the *current* pixelCount,
          // so the count must be set first. If that fails, abort rather than push a map
          // the firmware would silently drop (#213).
          if (remedy != null) {
            try {
              await getControllerProvider().setPixelCount(remedy)
            } catch (err) {
              const message = err instanceof Error ? err.message : String(err)
              set({ pushResult: { ok: false, message } })
              return
            }
          }
          await get().pushActiveMap()
        },

        confirmMapPushOnly: async () => {
          set({ preflight: null, mapPushRemedyCount: null })
          await get().pushActiveMap()
        },

        confirmSetPixelCountOnly: async () => {
          const remedy = get().mapPushRemedyCount
          set({ preflight: null, mapPushRemedyCount: null })
          if (remedy == null) return
          // Set the count alone — no map write. Surfaces success/failure through the same
          // pushResult slice the button reads, so the check/Send-failed states still apply.
          set({ pushing: true, pushResult: null })
          try {
            // When this lowers the count (#222), the helper blacks out the strip
            // before shrinking so pixels beyond the new limit go dark — exactly as a
            // panel edit does. A reduction is judged against the live device count.
            const prev = useControllerPanelStore.getState().pixelCount
            await applyControllerPixelCount(getControllerProvider(), remedy, prev)
            set({ pushing: false, pushResult: { ok: true, created: false } })
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({ pushing: false, pushResult: { ok: false, message } })
          }
        },

        pushActiveMap: async () => {
          const controllerId = get().activeIp
          const map = openMapForPush()
          if (!controllerId || !map) return

          set({ pushing: true, pushResult: null })
          try {
            // Re-bake to the device's pixel count before sending (#204): the firmware
            // ignores a map whose entry count differs from its wired pixelCount, and the
            // baked `points` are sized to the preview, not the device.
            const config = await getControllerProvider().getConfig().catch(() => null)
            const points = resolveMapPushPoints(map.source, map.points, config?.pixelCount ?? null)
            await getControllerProvider().setPixelMap(points)
            const pushedFingerprint = mapDataHash(encodeMapData(points))
            const profileStore = useControllerProfileStore.getState()
            const profiles = profileStore.profilesLoaded
              ? profileStore.profiles
              : await getPersonalContentProvider().listControllerProfiles().catch(() => [])
            const activeController = get().controllers[controllerId]
            const profile = activeController
              ? findProfileForLiveController(profiles, activeController)
              : null
            if (profile) {
              const pushedAt = Date.now()
              await profileStore.updateProfile(profile.id, {
                mapFingerprints: withMapFingerprintRecord(profile.mapFingerprints, {
                  hash: pushedFingerprint,
                  mapId: map.id,
                  mapName: map.name,
                  devicePixelCount: points.length,
                  pushedAt,
                }),
              }).catch(() => {})
            }
            await get().refreshInstalledMap(controllerId, {
              expectedFingerprint: pushedFingerprint,
            })
            set((s) => ({
              pushing: false,
              // A Controller has one map slot — a push always overwrites it in place,
              // so `created` is always false (unlike a pattern, which can mint a new id).
              pushResult: { ok: true, created: false },
              lastPushedMap: {
                ...s.lastPushedMap,
                [controllerId]: { ...s.lastPushedMap[controllerId], [map.id]: map.signature },
              },
            }))
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err)
            set({ pushing: false, pushResult: { ok: false, message } })
          }
        },

        pushActivePattern: async () => {
          const controllerId = get().activeIp
          // Any pushable pattern — a user pattern by id, a demo by its `demo:` key — so
          // demos push without forking (#208 follow-up). null only for a library/nothing.
          const patternId = activePushKey(usePatternStore.getState())
          const { previewSource, previewPatternName } = useEditorStore.getState()
          // The button's gate already guarantees a connected Controller + a matching
          // active pattern, but guard anyway so a stray call is an inert no-op.
          if (!controllerId || !patternId || !previewSource) return

          // The armed mode (#238): Save on persists a PBP record (#236); off is a
          // run-only push. Captured up front so the post-push dirty-gate record lands
          // in the matching map (run vs save are tracked separately).
          const persist = get().saveArmed
          const mode: SendMode = persist ? 'save' : 'run'
          const attempt = persist
            ? beginSaveAttempt(controllerId, patternId, previewSource, true)
            : undefined
          // Set before the first device write (#1268); see pushGeneratedArtifact.
          let deviceWriteEntered = false

          set({ pushing: true, pushResult: null, artifactPushResult: null })
          invalidateRendererState(controllerId)
          retainRendererResumeRecovery(controllerId)
          try {
            // Push the bundled artifact (library-inlined) — the same code Copy/Download
            // emit — never raw editor source. Use the last *clean* preview source so a
            // broken edit is never compiled and pushed.
            const activeController = get().controllers[controllerId]
            const provider = getControllerProvider()
            const expectedStatus = provider.getStatus()
            const expectedLiveEpoch = activeController?.liveEpoch ?? 0
            const assertDeviceSession = () => {
              if (
                expectedStatus.kind !== 'connected'
                || get().activeIp !== controllerId
                || (get().controllers[controllerId]?.liveEpoch ?? 0) !== expectedLiveEpoch
                || getControllerProvider() !== provider
                || !statusMatchesConnectedController(expectedStatus.controller, provider.getStatus())
              ) {
                throw new Error('Controller session changed before Pattern delivery')
              }
            }
            await waitForControllerProfileWrites()
            const profiles = await getPersonalContentProvider().listControllerProfiles().catch(() => [])
            const profile = activeController
              ? findProfileForLiveController(profiles, activeController)
              : null
            const mapDim = activeController?.mapDim ?? null
            const dirtySignature = controllerProfileArtifactSignature(
              profile,
              patternId,
              { mapDim },
            )
            const pixelCount = enabledControllerWrappers(profile, patternId).length
              ? (await provider.getConfig()).pixelCount
              : undefined
            assertDeviceSession()
            const delivery = prepareControllerArtifactDelivery({
              source: previewSource,
              profile,
              artifactId: patternId,
              pixelCount,
              mapDim,
              libraries: compileLibraries(LIBRARIES, useLibraryStore.getState().userLibraries),
              alwaysBundle: true,
              extraPasses: mapDim ? [{ id: 'renderer-adapter', kind: 'renderer-adapter', mapDim }] : [],
            })
            const { profileSignature } = delivery
            const bundled = delivery.bundled!
            if (activeController?.mapDim) {
              const hardwarePlan = planHardwareRenderer(
                activeController.mapDim,
                bundled.metadata.renderFns,
                activeController.firmwareVersion,
              )
              if (hardwarePlan.firmwareSupport === 'unsupported') {
                throw new Error(hardwarePlan.reason ?? 'Unsupported Controller renderer/map combination')
              }
            }
            const adapterCollision = bundled.warnings.find(
              (warning) => warning.code === 'renderer-adapter-name-collision',
            )
            if (adapterCollision) throw new Error(adapterCollision.message)
            const hasTransformArtifact =
              bundled.summary.passes.length > 0 || bundled.warnings.length > 0
            const transformSummary = hasTransformArtifact ? bundled.summary : null
            const transformArtifact: TransformArtifactInspection | null = hasTransformArtifact
              ? {
                  summary: bundled.summary,
                  warnings: bundled.warnings,
                  generatedSource: bundled.code,
                  ...(previewPatternName ? { patternName: previewPatternName } : {}),
                  updatedAt: Date.now(),
                }
              : null
            const { code } = bundled
            // Save mode only: render the device-matched 100x150 waterfall preview and
            // embed it in the PBP blob (#259). A run-only push never persists a record,
            // so it needs no preview. A null result (render/encode failure) falls back to
            // the empty preview section rather than blocking the save.
            const previewImage = persist
              ? (await buildPreviewJpeg(bundled)) ?? undefined
              : undefined
            assertDeviceSession()
            const { created, programId, activation, save } = await queueForegroundPush(
              controllerId,
              patternId,
              persist,
              async (markSave) => {
                if (pixelCount !== undefined && (await provider.getConfig()).pixelCount !== pixelCount) {
                  throw new Error('Controller pixel count changed before Pattern delivery.')
                }
                assertDeviceSession()
                return pushPattern({
                  provider,
                  controllerId,
                  patternId,
                  source: code,
                  sourceHash: artifactHash(previewSource),
                  name: previewPatternName,
                  persist,
                  previewImage,
                  transforms: delivery.transformIds,
                  profileSignature,
                  wrapperOutcome: delivery.wrapperOutcome,
                  wrapperPixelCount: pixelCount,
                  loadBindings: getControllerBindings,
                  saveBindings: setControllerBindings,
                  loadPushRecords: getPushRecords,
                  savePushRecords: setPushRecords,
                  updatePushRecords,
                  assertDeviceSession,
                  ...(attempt && activeController && {
                    onLateSaveConfirmation: recordLateSave(attempt, activeController, profileSignature, () => {
                      assertDeviceSession()
                      return true
                    }),
                  }),
                  onDeviceWrite: () => {
                    deviceWriteEntered = true
                    markSave()
                  },
                })
              },
            )
            assertDeviceSession()
            if (save === 'unconfirmed') {
              set({ pushing: false })
              rereadController(controllerId)
              return
            }
            forgetSaveAttempt(attempt)
            const activationUnconfirmed = activation === 'unconfirmed'
            if (!activationUnconfirmed) {
              assumeRendererPlaying(controllerId)
              useControllerPanelStore.getState().noteProgramActivated(programId, controllerId)
            }
            // Record the name we pushed against the device program id (#237) so the
            // panel resolves a run-only program — which never enters the device's
            // program list — to the pattern's name instead of the raw generated id.
            // Persist the cache and mirror it into the panel store for immediate display.
            if (previewPatternName) {
              const labels = withProgramLabel(
                await getProgramLabels(),
                controllerId,
                programId,
                previewPatternName,
              )
              await setProgramLabels(labels)
              useControllerPanelStore.getState().noteProgramLabel(programId, previewPatternName)
            }
            // Save-and-run (#238): the saved program is now on the device and active, but
            // the panel's `programs` list was last fetched on seed and so is stale —
            // refresh it so the freshly-saved id resolves via the list tier and the
            // `unsaved` marker clears. Run-only pushes never enter the list, so skip.
            // Saved, activation unconfirmed (#1268): the re-read replaces this refresh
            // and reports whichever Pattern the Controller is actually running.
            if (activationUnconfirmed) {
              rereadController(controllerId)
            } else if (persist) {
              void useControllerPanelStore.getState().refreshPrograms()
            }
            // Remember the clean artifact. Run also records the exact transient program
            // id, so observing another active program re-arms it without a source edit.
            // Save remains independent and uses its own source/profile record (#238).
            const recordKey = persist ? 'lastSavedSource' : 'lastPushedSource'
            const profileRecordKey = persist
              ? 'lastSavedProfileSignature'
              : 'lastPushedProfileSignature'
            const result: ArtifactPushResult = {
              ok: true,
              created,
              artifactId: patternId,
              mode,
            }
            set((s) => ({
              pushing: false,
              pushResult: { ok: true, created },
              artifactPushResult: result,
              [recordKey]: {
                ...s[recordKey],
                [controllerId]: { ...s[recordKey][controllerId], [patternId]: previewSource },
              },
              [profileRecordKey]: {
                ...s[profileRecordKey],
                [controllerId]: {
                  ...s[profileRecordKey][controllerId],
                  [patternId]: dirtySignature,
                },
              },
              ...(!persist
                ? {
                    lastRunProgramId: {
                      ...s.lastRunProgramId,
                      [controllerId]: {
                        ...s.lastRunProgramId[controllerId],
                        [patternId]: programId,
                      },
                    },
                  }
                : {}),
              lastTransformSummary: withTransformSummary(
                s.lastTransformSummary,
                controllerId,
                patternId,
                transformSummary,
              ),
              lastTransformArtifacts: withTransformArtifactInspection(
                s.lastTransformArtifacts,
                controllerId,
                patternId,
                transformArtifact,
              ),
            }))
          } catch (err) {
            forgetSaveAttempt(attempt)
            const message = err instanceof Error ? err.message : String(err)
            set({
              pushing: false,
              pushResult: { ok: false, message },
              artifactPushResult: {
                ok: false,
                message,
                artifactId: patternId,
                mode,
              },
            })
            if (deviceWriteEntered) rereadController(controllerId)
          }
        },
      }
    },
    {
      name: 'pixelblaze-controller',
      partialize: (s) => ({
        lastConnectedIp: s.lastConnectedIp,
        lastConnectedNickname: s.lastConnectedNickname,
        rendererPausedByPxlblz: s.rendererPausedByPxlblz,
        saveArmed: s.saveArmed,
      }),
    },
  ),
)

// A raw edit supersedes a Save before the preview compiles or autosave settles.
// Opening another buffer uses setSource and does not count as an edit.
useEditorStore.subscribe((state, previous) => {
  if (!state.bufferEdited || state.source === previous.source) return
  const bindingKey = activePushKey(usePatternStore.getState())
  if (!bindingKey) return
  for (const byBinding of saveAttempts.values()) forgetSaveAttempt(byBinding.get(bindingKey))
})

usePatternStore.subscribe((state, previous) => {
  if (state.userPatterns === previous.userPatterns) return
  for (const byBinding of saveAttempts.values()) {
    for (const attempt of byBinding.values()) {
      const before = previous.userPatterns.find(({ id }) => id === attempt.bindingKey)
      const after = state.userPatterns.find(({ id }) => id === attempt.bindingKey)
      if (before?.name !== after?.name || (before?.src !== after?.src && after?.src !== attempt.source)) {
        forgetSaveAttempt(attempt)
      }
    }
  }
})

useControllerStore.subscribe((state, previous) => {
  if (state.activeIp === previous.activeIp || !previous.activeIp) return
  const attempts = saveAttempts.get(previous.activeIp)
  for (const attempt of attempts?.values() ?? []) {
    if (attempt.foreground) forgetSaveAttempt(attempt)
  }
})

/** Test-only: drop all live providers + subscriptions (no persistence touch). */
export function __resetControllerProviders(): void {
  installedMapReads.clear()
  unsubscribers.forEach((u) => u())
  unsubscribers.clear()
  providers.clear()
  rendererCommandGenerations.clear()
  installedMapReadGenerations.clear()
  firmwareUpdateCheckedAt.clear()
  for (const timer of reconciliationTimers.values()) clearTimeout(timer)
  for (const timer of reconciliationRetryTimers.values()) clearTimeout(timer)
  reconciliationTimers.clear()
  reconciliationRetryTimers.clear()
  reconciliationStalls.clear()
  reconciliationPatternSources.clear()
  unconfirmedSaves.clear()
  saveAttempts.clear()
  reconciliationQueue.reset()
}
