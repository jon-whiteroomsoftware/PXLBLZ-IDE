import type { ControllerProvider } from './ControllerProvider'
import type { ControllerMetadataStorage } from './controllerMetadataStorage'
import { mutateControllerPatternImport } from './controllerMetadataStorage'
import type { PersonalContentProvider } from './personalContentProvider'
import type { PatternRecord } from './personalContentRecords'
import type { ControllerProfile } from './controllerProfile'
import type { RecoveredSavedProgram } from './controllerSavedProgramRead'
import { queueControllerDeviceWrite } from './controllerDeviceWriteQueue'
import {
  assessControllerPatternImport, createControllerPatternImportPlan,
  controllerPatternImportAccountRecordDigest, controllerPatternImportRetry,
  findControllerPatternImport, readControllerPatternImportLedger, sha256ControllerProgram,
  type ControllerImportStage, type ControllerPatternImportReceipt, type KnownControllerImportSource,
} from './controllerPatternImport'
import { activateTarget, drainBeforeUnsafeActivation } from './pushPattern'
import { decodePbp, encodePbp } from './pbpEncode'
import { bundleWithPasses } from './passEngine'
import { controllerProfilePassRecipe } from './controllerProfilePassRecipe'
import { artifactTransformIds } from './controllerArtifactDelivery'
import { planHardwareRenderer } from './renderCompatibility'
import { bytecodeHeaderReconciles } from './bytecodePush'
import { artifactHash, parsePxlblzBanner, stampArtifact } from './artifactStamp'
import { withBinding, type BindingStore } from './controllerBinding'
import { withPushRecord } from './controllerPushRecord'

export interface ControllerPatternImportExecutionDeps {
  provider: Pick<ControllerProvider, 'compile' | 'getActiveProgramBytecodeSize' | 'pushBytecode' | 'saveProgram' | 'readSavedProgram'>
  controllerId: string
  metadataStorage: ControllerMetadataStorage
  personalContent: Pick<PersonalContentProvider, 'listPatterns' | 'createPattern'>
  assertCurrent: () => void
  resolveKnownSource: (saved: RecoveredSavedProgram) => Promise<KnownControllerImportSource | undefined>
  waitForProfileWrites: () => Promise<void>
  loadProfile: (patternId: string) => Promise<{ profile: ControllerProfile | null; signature: string }>
  assertProfileCurrent: (patternId: string, signature: string) => void
  libraries: Record<string, string>
  mapDim: 1 | 2 | 3 | null
  firmwareVersion?: string
  allocatePatternId: () => string
  now: () => number
  queue?: typeof queueControllerDeviceWrite
  mintDrainId?: () => string
  onPatternVerified?: (record: PatternRecord) => void
}

type Stage = ControllerImportStage | 'assessment' | 'preparation'
const messages = {
  session: 'Controller session or account changed. Retry on the same Controller.',
  slot: 'Saved Pattern changed on the Controller. Refresh before importing.',
  account: 'The imported account Pattern changed. Retry will not overwrite it.',
  create: 'Account copy could not be confirmed. Nothing was sent. Retry reuses this import.',
  write: 'Account copy saved; Controller write could not be confirmed. Retry checks the same slot.',
  activate: 'Controller copy verified; activation did not complete. Retry resumes this import.',
  binding: 'Controller copy verified; account binding is incomplete. Retry finishes this import.',
  bookkeeping: 'Controller binding saved; import bookkeeping is incomplete. Retry finishes this import.',
  destination: 'The import binding points to another saved program. Refresh before retrying.',
  unreadable: 'Saved program could not be read. No Pattern was imported.',
  compile: 'Saved Pattern source cannot compile. Nothing was sent.',
}

export class ControllerPatternImportExecutionError extends Error {
  constructor(message: string, public readonly stage: Stage, public readonly patternId: string | null,
    public readonly programId: string, cause?: unknown) {
    const detail = cause instanceof Error ? cause.message : cause === undefined ? '' : String(cause)
    super(detail && !message.includes(detail) ? `${message} ${detail}` : message, { cause })
    this.name = 'ControllerPatternImportExecutionError'
  }
}

// Bindings/push records are separate rows. Serialize their short read/merge/write
// turns across commands too, so concurrent Controllers preserve each other's keys.
let metadataTail: Promise<void> = Promise.resolve()
function metadataTurn<T>(action: () => Promise<T>): Promise<T> {
  const result = metadataTail.then(action)
  metadataTail = result.then(() => undefined, () => undefined)
  return result
}
const stages: ControllerImportStage[] = ['planned', 'account-saved', 'write-pending', 'saved-verified', 'activated', 'metadata-pending', 'complete']
function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item)
}

/** One captured account/session and one selected saved slot throughout the intent. */
export async function importControllerPattern(
  input: { programId: string; controllerDeviceId: string }, deps: ControllerPatternImportExecutionDeps,
): Promise<{ patternId: string; programId: string; complete: true }> {
  let stage: Stage = 'assessment'
  let receipt: ControllerPatternImportReceipt | null = null
  let signature: string | undefined
  let failureMessage = messages.unreadable
  const error = (message: string, cause?: unknown) => new ControllerPatternImportExecutionError(
    message, stage, receipt?.patternId ?? null, input.programId, cause)
  const guard = () => {
    try {
      deps.assertCurrent()
      if (!deps.controllerId.trim() || !input.controllerDeviceId.trim()) throw new Error('Missing Controller identity')
      if (signature !== undefined && receipt) deps.assertProfileCurrent(receipt.patternId, signature)
    } catch (cause) { throw error(messages.session, cause) }
  }
  // Every awaited capability is followed by a guard; mutable calls are also
  // guarded immediately before invocation, including ambiguous rejection paths.
  const call = async <T>(action: () => Promise<T>): Promise<T> => {
    guard()
    try { return await action() } finally { guard() }
  }
  const ledger = async () => {
    if (deps.metadataStorage.id === 'demo' || !deps.metadataStorage.getPatternImports || !deps.metadataStorage.setPatternImports) {
      throw new Error('Controller import storage is unavailable')
    }
    return readControllerPatternImportLedger(await call(() => deps.metadataStorage.getPatternImports!()))
  }
  const progress = async (next: ControllerImportStage, patch: Partial<Pick<ControllerPatternImportReceipt,
    'writeBaselineDigest' | 'deliveryDigest' | 'profileSignature'>> = {}) => {
    const expected = receipt!
    receipt = await call(() => mutateControllerPatternImport({ storage: deps.metadataStorage, assertAccountSession: guard },
      expected.patternId, (current) => {
        if (!current || stableJson(current) !== stableJson(expected)) {
          throw new Error('Import progress changed; retry from durable state')
        }
        return { ...current, ...patch, stage: next }
      }))
  }
  const readSlot = async () => {
    const saved = await call(() => deps.provider.readSavedProgram(input.programId))
    if (!saved?.storedArtifact) throw error(receipt ? messages.slot : messages.unreadable)
    const pbp = saved.storedArtifact.pbp.slice()
    const decoded = decodePbp(pbp)
    if (!decoded) throw error(receipt ? messages.slot : messages.unreadable)
    const digest = await call(() => sha256ControllerProgram(pbp))
    return { saved, pbp, decoded, digest }
  }
  const checkBinding = (bindings: BindingStore, patternId: string) => {
    const bound = bindings[deps.controllerId]?.[patternId]
    if (bound && bound !== input.programId) throw error(messages.destination)
    const occupant = Object.entries(bindings[deps.controllerId] ?? {}).find(([id, slot]) => slot === input.programId && id !== patternId)
    if (occupant) throw error('This saved program is already linked to an account Pattern.')
  }
  const accounts = () => call(() => deps.personalContent.listPatterns())
  const accountDigest = (record: PatternRecord) => call(() => controllerPatternImportAccountRecordDigest(record))
  const checkAccount = async () => {
    const record = (await accounts()).find((r) => r.id === receipt!.patternId)
    if (!record || await accountDigest(record) !== receipt!.accountRecordDigest) throw error(messages.account)
    return record
  }
  try {
    guard()
    return await (deps.queue ?? queueControllerDeviceWrite)(deps.controllerId, async () => {
      guard()
      receipt = findControllerPatternImport(await ledger(), input.controllerDeviceId, input.programId)
      if (receipt?.stage === 'complete') return { patternId: receipt.patternId, programId: input.programId, complete: true }
      stage = receipt?.stage ?? 'assessment'
      const observed = await readSlot()
      failureMessage = messages.create
      const patterns = await accounts()
      const bindings = await call(() => deps.metadataStorage.getControllerBindings())
      let record: PatternRecord
      let newIntent = false
      let action: ReturnType<typeof controllerPatternImportRetry> = 'write'
      if (!receipt) {
        if (Object.values(bindings[deps.controllerId] ?? {}).includes(input.programId)) {
          throw error('This saved program is already linked to an account Pattern.')
        }
        const knownSource = await call(() => deps.resolveKnownSource(observed.saved))
        const assessment = await call(() => assessControllerPatternImport({ programId: input.programId, pbp: observed.pbp, knownSource }))
        if (!assessment.ok) throw error(assessment.message)
        const plan = await call(() => createControllerPatternImportPlan({ assessment, patternId: deps.allocatePatternId(),
          controllerDeviceId: input.controllerDeviceId, programId: input.programId, now: deps.now(), existingNames: patterns.map((r) => r.name) }))
        receipt = plan.receipt
        record = plan.record
        newIntent = true
      } else {
        stage = receipt.stage
        checkBinding(bindings, receipt.patternId)
        const existing = patterns.find((r) => r.id === receipt!.patternId)
        if (!existing && receipt.stage !== 'planned') throw error(messages.account)
        const digest = existing ? await accountDigest(existing) : null
        if (existing && digest !== receipt.accountRecordDigest) throw error(messages.account)
        action = controllerPatternImportRetry({ receipt, accountRecordDigest: digest, observedPbpDigest: observed.digest })
        if (action === 'conflict') throw error(messages.slot)
        if (!existing) {
          const knownSource = await call(() => deps.resolveKnownSource(observed.saved))
          const assessment = await call(() => assessControllerPatternImport({ programId: input.programId, pbp: observed.pbp, knownSource }))
          if (!assessment.ok || assessment.sourceMode !== receipt.sourceMode) throw error(messages.account)
          const reconstructed = await call(() => createControllerPatternImportPlan({ assessment,
            patternId: receipt!.patternId, controllerDeviceId: input.controllerDeviceId, programId: input.programId,
            now: receipt!.createdAt, existingNames: patterns.map((r) => r.name) }))
          if (reconstructed.receipt.accountRecordDigest !== receipt.accountRecordDigest) throw error(messages.account)
          record = reconstructed.record
        } else record = existing
      }
      checkBinding(bindings, receipt.patternId)
      // Validity beyond the ledger's wire schema is execution-specific. Never
      // interpret a verified stage without its delivery witness.
      if (stages.indexOf(receipt.stage) >= stages.indexOf('write-pending') && !receipt.deliveryDigest) throw error(messages.slot)
      if (receipt.sourceMode === 'authored-verified' && stages.indexOf(receipt.stage) >= stages.indexOf('write-pending')
        && receipt.profileSignature === undefined) throw error(messages.slot)
      if (receipt.sourceMode === 'stored-artifact' && receipt.profileSignature !== undefined) throw error(messages.slot)
      if (receipt.sourceMode === 'stored-artifact' && [receipt.deliveryDigest, receipt.writeBaselineDigest]
        .some((digest) => digest !== undefined && digest !== receipt!.origin.pbpDigest)) throw error(messages.slot)
      let profile: ControllerProfile | null = null
      stage = 'preparation'
      failureMessage = messages.compile
      if (receipt.sourceMode === 'authored-verified') {
        await call(deps.waitForProfileWrites)
        const loaded = await call(() => deps.loadProfile(receipt!.patternId))
        profile = loaded.profile
        signature = loaded.signature
        guard()
      }
      const profileChanged = receipt.sourceMode === 'authored-verified' && receipt.profileSignature !== undefined
        && receipt.profileSignature !== signature
      if (profileChanged) action = 'write'
      let delivery: Uint8Array = observed.pbp.slice()
      if (newIntent || action === 'write' || action === 'create-account') {
        const recipe = receipt.sourceMode === 'authored-verified'
          ? controllerProfilePassRecipe(profile, record.src, record.id) : []
        if (receipt.sourceMode === 'authored-verified' && deps.mapDim) {
          recipe.push({ id: 'renderer-adapter', kind: 'renderer-adapter', mapDim: deps.mapDim })
        }
        const bundled = bundleWithPasses(record.src, deps.libraries, recipe)
        if (deps.mapDim) {
          const hardware = planHardwareRenderer(deps.mapDim, bundled.metadata.renderFns, deps.firmwareVersion)
          if (hardware.firmwareSupport === 'unsupported') throw new Error(hardware.reason ?? 'Unsupported Controller renderer/map combination')
        }
        const collision = bundled.warnings.find((w) => w.code === 'renderer-adapter-name-collision')
        if (collision) throw new Error(collision.message)
        if (receipt.sourceMode === 'authored-verified') {
          const bytecode = await call(() => deps.provider.compile(bundled.code))
          if (!bytecodeHeaderReconciles(bytecode)) throw new Error('Compiled bytecode failed its header sanity check')
          delivery = encodePbp({ id: input.programId, name: record.name, byteCode: bytecode, previewImage: observed.decoded.jpeg,
            sourceCode: stampArtifact(bundled.code, { kind: 'pattern', id: record.id, name: record.name,
              transforms: artifactTransformIds(bundled.summary.passes), stampedAt: new Date(receipt.createdAt) }) })
        }
      }
      guard()
      stage = 'planned'
      failureMessage = messages.create
      if (newIntent) {
        const planned = receipt
        receipt = await call(() => mutateControllerPatternImport({ storage: deps.metadataStorage, assertAccountSession: guard },
          planned.patternId, (current) => {
            if (current) throw new Error('Import destination already exists')
            return planned
          }))
      }
      if (!patterns.some((r) => r.id === record.id)) {
        let postError: unknown
        try { await call(() => deps.personalContent.createPattern(record)) } catch (cause) {
          if (cause instanceof ControllerPatternImportExecutionError) throw cause
          postError = cause
        }
        const reopened = (await accounts()).find((r) => r.id === record.id)
        if (!reopened || await accountDigest(reopened) !== receipt.accountRecordDigest) throw error(messages.create, postError)
        record = reopened
      }
      guard()
      deps.onPatternVerified?.(structuredClone(record))
      guard()
      if (receipt.stage === 'planned') await progress('account-saved')

      let verified = observed
      let drainedForWrite = false
      const activationDeps = {
        provider: {
          compile: (source: string) => call(() => deps.provider.compile(source)),
          getActiveProgramBytecodeSize: () => call(() => deps.provider.getActiveProgramBytecodeSize()),
          pushBytecode: (bytes: Uint8Array, opts: { id: string; name: string }) => call(() => deps.provider.pushBytecode(bytes, opts)),
        }, assertDeviceSession: guard, mintDrainId: deps.mintDrainId,
      }
      if (newIntent || action === 'write' || action === 'create-account') {
        stage = 'write-pending'
        failureMessage = messages.write
        await checkAccount()
        checkBinding(await call(() => deps.metadataStorage.getControllerBindings()), record.id)
        const latest = await readSlot()
        if (latest.digest !== observed.digest) throw error(messages.slot)
        const deliveryDigest = await call(() => sha256ControllerProgram(delivery))
        await progress('write-pending', { deliveryDigest, writeBaselineDigest: observed.digest,
          ...(signature !== undefined ? { profileSignature: signature } : {}) })
        const decoded = decodePbp(delivery)!
        await drainBeforeUnsafeActivation(activationDeps, decoded.byteCode.length)
        drainedForWrite = true
        await call(() => deps.provider.saveProgram(delivery.slice(), { id: input.programId }))
        verified = await readSlot()
        if (verified.digest !== deliveryDigest) throw new Error('Saved PBP readback differs from delivery')
        await progress('saved-verified')
      } else if (action === 'activate' && receipt.stage !== 'saved-verified') {
        stage = 'saved-verified'
        failureMessage = messages.activate
        await progress('saved-verified')
      }
      if (receipt.stage === 'saved-verified') {
        stage = 'saved-verified'
        failureMessage = messages.activate
        await checkAccount()
        verified = await readSlot()
        if (verified.digest !== receipt.deliveryDigest) throw error(messages.slot)
        if (!bytecodeHeaderReconciles(verified.decoded.byteCode)) throw error(messages.slot)
        if (!drainedForWrite) await drainBeforeUnsafeActivation(activationDeps, verified.decoded.byteCode.length)
        await activateTarget(activationDeps, verified.decoded.byteCode.slice(), { id: input.programId, name: verified.decoded.name })
        await progress('activated')
      }
      stage = 'metadata-pending'
      failureMessage = messages.binding
      if (receipt.stage === 'activated') await progress('metadata-pending')
      if (receipt.stage !== 'metadata-pending') throw error(messages.slot)
      await metadataTurn(async () => {
        await checkAccount()
        verified = await readSlot()
        if (verified.digest !== receipt!.deliveryDigest) throw error(messages.slot)
        const latestBindings = await call(() => deps.metadataStorage.getControllerBindings())
        checkBinding(latestBindings, record.id)
        await call(() => deps.metadataStorage.setControllerBindings(withBinding(latestBindings, deps.controllerId, record.id, input.programId)))
        const confirmed = await call(() => deps.metadataStorage.getControllerBindings())
        if (confirmed[deps.controllerId]?.[record.id] !== input.programId) throw new Error('Binding readback failed')
        failureMessage = messages.bookkeeping
        if (receipt!.sourceMode === 'authored-verified') {
          const banner = parsePxlblzBanner(verified.decoded.sourceCode)
          if (!banner || banner.id !== record.id || banner.hash !== artifactHash(verified.decoded.sourceCode)) throw new Error('Delivery banner is invalid')
          const pushRecord = { transforms: banner.transforms, artifactHash: banner.hash, stampedAt: banner.stamped,
            name: verified.decoded.name, profileSignature: receipt!.profileSignature, sourceHash: artifactHash(record.src) }
          const latestRecords = await call(() => deps.metadataStorage.getPushRecords())
          await call(() => deps.metadataStorage.setPushRecords(withPushRecord(latestRecords, deps.controllerId, record.id, pushRecord)))
          const confirmedRecords = await call(() => deps.metadataStorage.getPushRecords())
          if (stableJson(confirmedRecords[deps.controllerId]?.[record.id]) !== stableJson(pushRecord)) throw new Error('Push record readback failed')
        }
        await progress('complete')
      })
      guard()
      return { patternId: receipt.patternId, programId: input.programId, complete: true }
    })
  } catch (cause) {
    if (cause instanceof ControllerPatternImportExecutionError) throw cause
    throw error(failureMessage, cause)
  }
}
