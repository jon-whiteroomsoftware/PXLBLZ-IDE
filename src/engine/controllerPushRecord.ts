import type { ArtifactShowOutputContract } from './artifactStamp'

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
}

export type ControllerPushRecords = Record<string, Record<string, ControllerPushRecord>>

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
      },
    },
  }
}
