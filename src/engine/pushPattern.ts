// The Send-to-Controller push orchestrator (H10, issue #202). Transport-agnostic:
// it composes the provider's compile + push capabilities with the pure
// overwrite-in-place binding logic and the binding store, so the same flow works
// against any backend (extension today, a Node bridge if the extension route ever
// falls back). The provider supplies the transport-coupled pieces (compile in the
// helper, push over the socket); this module owns the *policy* — which program id
// to overwrite, when to mint, and persisting the binding.
//
// The #202 contract, realised here:
//   - compile the open pattern to bytecode (device's own compiler),
//   - read the device's live program list,
//   - reuse the remembered program id when it is still on the device (overwrite),
//     mint a fresh one on first push or when the remembered id was deleted,
//   - push the bytecode to that id (save + run), control values NOT in the payload,
//   - persist a freshly-minted binding so the next push overwrites in place.
//
// Zero React, zero transport specifics; every dependency is injected so the whole
// flow is unit-testable with a fake provider + in-memory binding store.

import type { ControllerProvider } from './ControllerProvider'
import { bytecodeHeaderReconciles, makeProgramId } from './bytecodePush'
import { resolvePushTarget, withBinding, type BindingStore } from './controllerBinding'

export interface PushPatternDeps {
  /** The connected backend — only the push-relevant surface is needed. */
  provider: Pick<ControllerProvider, 'compile' | 'pushBytecode' | 'listPrograms'>
  /** Stable id of the target Controller (its address/device id) — the binding key. */
  controllerId: string
  /** The IDE pattern's id — the other half of the binding key. */
  patternId: string
  /** Pattern source to compile + push. */
  source: string
  /** Human label stored with the program on the device. Defaults to ''. */
  name?: string
  /** Load the persisted binding store (e.g. from IndexedDB). */
  loadBindings: () => Promise<BindingStore>
  /** Persist the binding store after a freshly-minted binding. */
  saveBindings: (bindings: BindingStore) => Promise<void>
  /** Injectable id minter (determinism in tests). Defaults to makeProgramId. */
  mintId?: () => string
}

export interface PushPatternResult {
  /** The device program id the pattern was pushed to. */
  programId: string
  /** True when this push created a new program (first push or silent re-create);
   *  false when it overwrote an existing bound program in place. */
  created: boolean
}

/** Compile, frame, and push the open pattern to the connected Controller,
 *  overwriting in place per the remembered per-Controller binding. Throws on a
 *  compile failure or a bytecode that fails the header sanity check (so a bad blob
 *  is never pushed). */
export async function pushPattern(deps: PushPatternDeps): Promise<PushPatternResult> {
  const mint = deps.mintId ?? makeProgramId

  // Compile and read the program list together — independent round-trips.
  const [bytecode, programs] = await Promise.all([
    deps.provider.compile(deps.source),
    deps.provider.listPrograms(),
  ])

  if (!bytecodeHeaderReconciles(bytecode)) {
    throw new Error('Compiled bytecode failed its header sanity check; not pushing')
  }

  const bindings = await deps.loadBindings()
  const deviceProgramIds = programs.map((p) => p.id)
  const { programId, isNew } = resolvePushTarget(
    bindings[deps.controllerId],
    deps.patternId,
    deviceProgramIds,
    mint,
  )

  await deps.provider.pushBytecode(bytecode, { id: programId, name: deps.name ?? '' })

  if (isNew) {
    await deps.saveBindings(withBinding(bindings, deps.controllerId, deps.patternId, programId))
  }

  return { programId, created: isNew }
}
