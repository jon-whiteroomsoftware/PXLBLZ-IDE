import type { ArtifactShowOutputContract } from './artifactStamp'
import type { ControllerWrapperOutcome } from './controllerProfile'

export interface ControllerPushRecord {
  transforms: string[]
  /** Generated-code profile signature used for the saved artifact. Missing on
   * legacy records, which makes the artifact eligible for one reconciliation. */
  profileSignature?: string
  /** Hash of the canonical Studio source before Controller-specific transforms.
   * Missing on legacy records, which retain profile-only freshness semantics. */
  sourceHash?: string
  artifactHash: string
  stampedAt: string
  name: string
  showOutputContract?: ArtifactShowOutputContract
  /** Wrapper decision for these confirmed saved bytes. */
  wrapperOutcome?: ControllerWrapperOutcome
  wrapperProgramId?: string
  /** Confirmed count used to evaluate an enabled Wrapper set. */
  wrapperPixelCount?: number
}

export type ControllerPushRecords = Record<string, Record<string, ControllerPushRecord>>

export function savedControllerWrapperOutcome(
  record: ControllerPushRecord | undefined,
  programId: string,
): ControllerWrapperOutcome | undefined {
  return record?.wrapperProgramId === programId ? record.wrapperOutcome : undefined
}

/** Return a new record store with the latest saved artifact for one
 *  (Controller, IDE pattern) binding key. Siblings are preserved; a re-push
 *  deliberately overwrites the previous record for the same key. */
export function withPushRecord(
  store: ControllerPushRecords,
  controllerId: string,
  patternId: string,
  record: ControllerPushRecord,
): ControllerPushRecords {
  return {
    ...store,
    [controllerId]: {
      ...(store[controllerId] ?? {}),
      [patternId]: {
        ...record,
        transforms: [...record.transforms],
        ...(record.showOutputContract ? { showOutputContract: structuredClone(record.showOutputContract) } : {}),
        ...(record.wrapperOutcome ? { wrapperOutcome: structuredClone(record.wrapperOutcome) } : {}),
      },
    },
  }
}
