// The Send-to-Controller push orchestrator (H10, issue #202; persist mode #236).
// Transport-agnostic: it composes the provider's compile + push capabilities with
// the pure binding logic, so the same flow works against any backend (extension
// today, a Node bridge if the extension route ever falls back). The provider
// supplies the transport-coupled pieces (compile in the helper, push over the
// socket); this module owns the *policy* — run-only vs save, which program id to
// overwrite, when to mint, and persisting the binding plus saved-artifact record.
//
// TWO MODES (#236):
//   - run-only (today's default): compile, mint a *throwaway* id, and load + run via
//     `pushBytecode` — exactly as the reference client's `sendPatternToRenderer`. It
//     never enters the device's program list, so it must NOT consult or churn the
//     binding (the #236 reframe — overwrite-in-place only makes sense for a *saved*
//     pattern, since a run-only id never lists and so always missed, minting + re-
//     persisting a fresh binding every push).
//   - save (`persist: true`): compile, encode a PBP blob, and write it via
//     `saveProgram`, creating the persisted `/p/{id}` record that appears in Saved
//     Patterns with its name. Here overwrite-in-place applies: reuse the bound id when
//     it is still on the device, else mint, and persist a freshly-minted binding.
//     Every successful save also overwrites the matching push record from the exact
//     artifact banner embedded in the PBP.
//
// Control values are never part of either push — the binding is identity only.
//
// Zero React, zero transport specifics; every dependency is injected so the whole
// flow is unit-testable with a fake provider + in-memory binding store.

import type { ControllerProvider } from './ControllerProvider'
import { parsePxlblzBanner, stampArtifact, type ArtifactStampMeta } from './artifactStamp'
import { bytecodeHeaderReconciles, makeProgramId } from './bytecodePush'
import { encodePbp } from './pbpEncode'
import { resolvePushTarget, withBinding, type BindingStore } from './controllerBinding'
import {
  withPushRecord,
  type ControllerPushRecords,
} from './controllerPushRecord'

/** The largest compiled-bytecode footprint observed to activate on the qualified
 * pb32 / firmware 3.67 Controller. Replacement policy treats the resident and
 * incoming bytecode as a transient overlap against this measured budget. */
export const CONTROLLER_REPLACEMENT_OVERLAP_BUDGET_BYTES = 68_384

/** The measured run-only intermediary. It deliberately renders black in every
 * supported renderer shape and owns no persistent state or Controls. */
export const CONTROLLER_DRAIN_PATTERN_SOURCE = `export function beforeRender(delta) {}
export function render(index) { rgb(0, 0, 0) }
export function render2D(index, x, y) { rgb(0, 0, 0) }`

/** Decide whether a Controller replacement needs the tiny intermediary Pattern.
 * An exact fit is safe; only a known overlap above the measured budget drains. */
export function requiresControllerDrain(
  incomingBytecodeBytes: number,
  outgoingBytecodeBytes: number | null,
): boolean {
  if (outgoingBytecodeBytes == null) return true
  return incomingBytecodeBytes + outgoingBytecodeBytes
    > CONTROLLER_REPLACEMENT_OVERLAP_BUDGET_BYTES
}

export interface PushPatternDeps {
  /** The connected backend — only the push-relevant surface is needed. */
  provider: Pick<
    ControllerProvider,
    'compile' | 'getActiveProgramBytecodeSize' | 'pushBytecode' | 'saveProgram' | 'listPrograms'
  >
  /** Stable id of the target Controller (its address/device id) — the binding key.
   *  Used in save mode only. */
  controllerId: string
  /** The IDE pattern's id — the other half of the binding key. Save mode only. */
  patternId: string
  /** Pattern source to compile + push. */
  source: string
  /** Human label stored with the program on the device. Defaults to ''. */
  name?: string
  /** When true, write a persisted PBP record (appears in Saved Patterns; overwrite-
   *  in-place via the binding). When false/undefined, run-only — load + run under a
   *  throwaway id, no binding. */
  persist?: boolean
  /** Save mode normally activates the saved Pattern. Background reconciliation
   * disables this so a batch does not visibly cycle through every program. */
  activateOnSave?: boolean
  /** Refuse to mint a replacement when the bound saved program disappeared. Used
   * by non-destructive reconciliation, which never recreates device-deleted content. */
  requireExisting?: boolean
  /** Load the persisted binding store (e.g. from the API/D1 metadata backend). Save mode only. */
  loadBindings: () => Promise<BindingStore>
  /** Persist the binding store after a freshly-minted binding. Save mode only. */
  saveBindings: (bindings: BindingStore) => Promise<void>
  /** Load saved-artifact metadata keyed like bindings. Save mode only. */
  loadPushRecords: () => Promise<ControllerPushRecords>
  /** Persist the latest saved-artifact metadata after every successful save push. */
  savePushRecords: (records: ControllerPushRecords) => Promise<void>
  /** Injectable id minter (determinism in tests). Defaults to makeProgramId. */
  mintId?: () => string
  /** Injectable throwaway id for the transport-only drain Pattern. */
  mintDrainId?: () => string
  /** Optional JPEG preview bytes for the saved PBP blob (#259). Save mode only —
   *  run-only never persists a record. Omitting it writes an empty preview section
   *  (the pre-#259 behaviour), which stalls the stock app's pattern list. */
  previewImage?: Uint8Array
  /** Transform/pass names baked into the generated source, for the artifact banner. */
  transforms?: string[]
  /** Generated-code Controller profile signature stored with the push record. */
  profileSignature?: string
  /** Hash of the canonical Studio source before Controller-specific transforms. */
  sourceHash?: string
  /** Override the saved artifact's provenance. Shows pass their canonical Show stamp;
   * ordinary Pattern sends omit this and retain the historical Pattern stamp. */
  artifactStamp?: ArtifactStampMeta
  /** Injectable artifact stamp time for deterministic tests. Defaults to now. */
  stampedAt?: Date | string
}

export interface PushPatternResult {
  /** The device program id the pattern was pushed to. */
  programId: string
  /** True when this push created a new program (run-only always mints; save mode on a
   *  first push or silent re-create); false when save mode overwrote a bound program. */
  created: boolean
}

async function drainBeforeUnsafeActivation(
  deps: PushPatternDeps,
  incomingBytecodeBytes: number,
): Promise<void> {
  const outgoingBytecodeBytes = await deps.provider.getActiveProgramBytecodeSize()
  if (!requiresControllerDrain(incomingBytecodeBytes, outgoingBytecodeBytes)) return

  const drainBytecode = await deps.provider.compile(CONTROLLER_DRAIN_PATTERN_SOURCE)
  if (!bytecodeHeaderReconciles(drainBytecode)) {
    throw new Error('Compiled drain bytecode failed its header sanity check; not pushing')
  }
  try {
    await deps.provider.pushBytecode(drainBytecode, {
      id: (deps.mintDrainId ?? makeProgramId)(),
      name: '',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Controller drain activation failed: ${message}`, { cause: error })
  }
}

async function activateTarget(
  deps: PushPatternDeps,
  bytecode: Uint8Array,
  opts: { id: string; name: string },
): Promise<void> {
  try {
    await deps.provider.pushBytecode(bytecode, opts)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Controller target activation failed: ${message}`, { cause: error })
  }
}

/** Compile, frame, and push the open pattern to the connected Controller. Run-only
 *  loads + runs under a throwaway id; save mode writes a persisted PBP record,
 *  overwriting in place per the remembered per-Controller binding. Throws on a
 *  compile failure or a bytecode that fails the header sanity check (so a bad blob
 *  is never pushed). */
export async function pushPattern(deps: PushPatternDeps): Promise<PushPatternResult> {
  const mint = deps.mintId ?? makeProgramId

  const bytecode = await deps.provider.compile(deps.source)
  if (!bytecodeHeaderReconciles(bytecode)) {
    throw new Error('Compiled bytecode failed its header sanity check; not pushing')
  }

  // Run-only: throwaway id, load + run, no list read and no binding (the #236 reframe).
  // The name is deliberately empty (matching the reference client's `setCode` —
  // `name:""`): a run-only program is never persisted, so a name here would only ever be
  // a phantom on a throwaway id. The display name lives in the local label cache instead
  // (the caller records it against the returned id), and the real name only persists
  // inside a saved PBP blob (the persist branch below). #237.
  if (!deps.persist) {
    const programId = mint()
    await drainBeforeUnsafeActivation(deps, bytecode.length)
    await activateTarget(deps, bytecode, { id: programId, name: '' })
    return { programId, created: true }
  }

  // Save mode: overwrite-in-place. The program list resolves the binding (a since-
  // deleted id re-mints); the binding store remembers the target.
  const [programs, bindings, pushRecords] = await Promise.all([
    deps.provider.listPrograms(),
    deps.loadBindings(),
    deps.loadPushRecords(),
  ])
  const { programId, isNew } = resolvePushTarget(
    bindings[deps.controllerId],
    deps.patternId,
    programs.map((p) => p.id),
    mint,
  )
  if (deps.requireExisting && isNew) {
    throw new Error('Managed saved program no longer exists on the Controller')
  }

  const stampedSource = stampArtifact(deps.source, deps.artifactStamp ?? {
    kind: 'pattern',
    id: deps.patternId,
    name: deps.name ?? '',
    transforms: deps.transforms,
    stampedAt: deps.stampedAt,
  })
  const stamp = parsePxlblzBanner(stampedSource)
  if (!stamp) throw new Error('Generated artifact stamp could not be read back')

  const blob = encodePbp({
    id: programId,
    name: deps.name ?? '',
    sourceCode: stampedSource,
    byteCode: bytecode,
    previewImage: deps.previewImage,
  })
  if (deps.activateOnSave !== false) {
    await drainBeforeUnsafeActivation(deps, bytecode.length)
  }
  await deps.provider.saveProgram(blob, { id: programId })

  // Once persistence succeeds, this id owns the saved artifact even if the
  // following activation fails. Try to record a new overwrite binding now so
  // Retry reuses the same Controller slot instead of orphaning it and minting
  // another. A cloud metadata failure must not strand the Controller on a drain,
  // so activating Saves retry that write after the target is running. Push
  // records still describe fully successful Sends and remain downstream.
  let retryBindingAfterActivation = false
  if (isNew) {
    try {
      await deps.saveBindings(withBinding(bindings, deps.controllerId, deps.patternId, programId))
    } catch (error) {
      if (deps.activateOnSave === false) throw error
      retryBindingAfterActivation = true
    }
  }

  // Save-and-run (#238): persisting writes the PBP record to flash but does not make it
  // the active program, so the device keeps running whatever it ran before and the panel
  // never reflects the save. Explicitly run the same bytecode under the *same* stable id
  // so the device switches to the saved program (LEDs change, config.activeProgramId
  // becomes S, the panel's list tier resolves it → no `unsaved` marker). This matches the
  // stock IDE's save-and-run and is robust whether or not firmware auto-activates on
  // putSourceCode. Unlike run-only, the run carries the real name — S is a real saved
  // program, so its setCode name is no phantom.
  if (deps.activateOnSave !== false) {
    await activateTarget(deps, bytecode, { id: programId, name: deps.name ?? '' })
  }

  if (retryBindingAfterActivation) {
    await deps.saveBindings(withBinding(bindings, deps.controllerId, deps.patternId, programId))
  }

  await deps.savePushRecords(withPushRecord(pushRecords, deps.controllerId, deps.patternId, {
    transforms: stamp.transforms,
    ...(deps.profileSignature ? { profileSignature: deps.profileSignature } : {}),
    ...(deps.sourceHash ? { sourceHash: deps.sourceHash } : {}),
    artifactHash: stamp.hash,
    stampedAt: stamp.stamped,
    name: deps.name ?? '',
    ...(stamp.showOutputContract ? { showOutputContract: stamp.showOutputContract } : {}),
  }))

  return { programId, created: isNew }
}
