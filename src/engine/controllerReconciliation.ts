import type { ProgramListEntry } from './PixelblazeConnection'
import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecords } from './controllerPushRecord'
import { artifactHash, type ArtifactStampMeta } from './artifactStamp'
import { normalizeStoredArtifactSignature } from './controllerProfilePassRecipe'
import { isReconciliationTimeout } from './controllerReconciliationPolicy'

export interface ReconciliationArtifact {
  bindingKey: string
  name: string
  source: string
  profileSignature: string
  artifactStamp?: ArtifactStampMeta
}

export interface ControllerReconciliationJob extends ReconciliationArtifact {
  programId: string
  state: 'queued'
}

export interface CurrentManagedArtifact extends ReconciliationArtifact {
  programId: string
  state: 'current'
}

export type UnmanagedProgramReason = 'foreign' | 'missing-push-record' | 'missing-source'

export interface UnmanagedControllerProgram {
  programId: string
  bindingKey?: string
  reason: UnmanagedProgramReason
}

export interface ControllerReconciliationPlan {
  jobs: ControllerReconciliationJob[]
  current: CurrentManagedArtifact[]
  managedCount: number
  unmanaged: UnmanagedControllerProgram[]
}

export function planControllerReconciliation(input: {
  controllerId: string
  programs: readonly ProgramListEntry[]
  bindings: BindingStore
  pushRecords: ControllerPushRecords
  artifacts: readonly ReconciliationArtifact[]
  precedingPatternSources?: ReadonlyMap<string, string>
  unconfirmedProgramIds?: ReadonlySet<string>
}): ControllerReconciliationPlan {
  const bindingByProgramId = new Map<string, string>()
  for (const [bindingKey, programId] of Object.entries(input.bindings[input.controllerId] ?? {})) {
    if (!bindingByProgramId.has(programId)) bindingByProgramId.set(programId, bindingKey)
  }
  const artifactByBindingKey = new Map(input.artifacts.map((artifact) => [artifact.bindingKey, artifact]))
  const records = input.pushRecords[input.controllerId] ?? {}
  const jobs: ControllerReconciliationJob[] = []
  const current: CurrentManagedArtifact[] = []
  const unmanaged: UnmanagedControllerProgram[] = []

  for (const program of input.programs) {
    const bindingKey = bindingByProgramId.get(program.id)
    if (!bindingKey) {
      unmanaged.push({ programId: program.id, reason: 'foreign' })
      continue
    }
    const pushRecord = records[bindingKey]
    if (!pushRecord) {
      unmanaged.push({ programId: program.id, bindingKey, reason: 'missing-push-record' })
      continue
    }
    const artifact = artifactByBindingKey.get(bindingKey)
    if (!artifact) {
      unmanaged.push({ programId: program.id, bindingKey, reason: 'missing-source' })
      continue
    }
    // The record is persisted while the artifact signature is computed now, so
    // the stored side is read in today's terms first (#772). A record carrying
    // no signature at all stays eligible for one reconciliation, as before.
    const storedSignature = pushRecord.profileSignature === undefined
      ? undefined
      : normalizeStoredArtifactSignature(pushRecord.profileSignature)
    const precedingSource = input.precedingPatternSources?.get(bindingKey)
    const sourceChanged = precedingSource !== undefined
      && precedingSource !== artifact.source
      && pushRecord.sourceHash !== undefined
      && pushRecord.sourceHash !== artifactHash(artifact.source)
    if (storedSignature === artifact.profileSignature && !sourceChanged
      && !input.unconfirmedProgramIds?.has(program.id)) {
      current.push({ ...artifact, programId: program.id, state: 'current' })
    } else {
      jobs.push({ ...artifact, programId: program.id, state: 'queued' })
    }
  }

  return { jobs, current, managedCount: jobs.length + current.length, unmanaged }
}

export interface FailedControllerReconciliationJob {
  job: ControllerReconciliationJob
  message: string
}

export interface ControllerReconciliationExecutionResult {
  completed: ControllerReconciliationJob[]
  failed: FailedControllerReconciliationJob[]
  stopped: boolean
  timedOut: boolean
  deferred: boolean
}

export async function executeControllerReconciliation(input: {
  jobs: readonly ControllerReconciliationJob[]
  activeProgramId?: string | null
  overwrite: (job: ControllerReconciliationJob, activate: boolean) => Promise<void | false | 'defer'>
  shouldContinue?: () => boolean | Promise<boolean>
  onJobStart?: (job: ControllerReconciliationJob) => void
  onJobComplete?: (job: ControllerReconciliationJob) => void
  onJobFailed?: (failure: FailedControllerReconciliationJob) => void
  onJobDeferred?: (job: ControllerReconciliationJob) => void
}): Promise<ControllerReconciliationExecutionResult> {
  const active = input.activeProgramId
  const ordered = [
    ...input.jobs.filter((job) => job.programId !== active),
    ...input.jobs.filter((job) => job.programId === active),
  ]
  const completed: ControllerReconciliationJob[] = []
  const failed: FailedControllerReconciliationJob[] = []
  let stopped = false
  let timedOut = false
  let deferred = false

  for (const job of ordered) {
    if (input.shouldContinue && !(await input.shouldContinue())) {
      stopped = true
      break
    }
    input.onJobStart?.(job)
    try {
      const written = await input.overwrite(job, job.programId === active)
      if (written === false) {
        input.onJobDeferred?.(job)
        stopped = true
        break
      }
      if (written === 'defer') {
        input.onJobDeferred?.(job)
        deferred = true
        continue
      }
      completed.push(job)
      input.onJobComplete?.(job)
    } catch (error) {
      if (isReconciliationTimeout(error)) {
        input.onJobDeferred?.(job)
        stopped = true
        timedOut = true
        break
      }
      const failure = {
        job,
        message: error instanceof Error ? error.message : String(error),
      }
      failed.push(failure)
      input.onJobFailed?.(failure)
    }
  }

  return { completed, failed, stopped, timedOut, deferred }
}
