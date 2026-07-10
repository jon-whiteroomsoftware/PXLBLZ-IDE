export interface ControllerPushRecord {
  transforms: string[]
  artifactHash: string
  stampedAt: string
  name: string
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
      },
    },
  }
}
