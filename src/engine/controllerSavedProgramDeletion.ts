import type { BindingStore } from './controllerBinding'
import type { ControllerPushRecords } from './controllerPushRecord'

export interface ControllerSavedProgramDeletionMetadata {
  getControllerBindings: () => Promise<BindingStore>
  setControllerBindings: (bindings: BindingStore) => Promise<void>
  getPushRecords: () => Promise<ControllerPushRecords>
  setPushRecords: (records: ControllerPushRecords) => Promise<void>
}

export interface ManagedControllerSavedProgramDeletion {
  controllerId: string
  bindingKey: string | null
  programId: string
}

export type ManagedControllerSavedProgramDeletionResult =
  | { removed: false }
  | { removed: true; bindingKey: string }

function withoutEntry<T>(records: Record<string, T>, key: string): Record<string, T> {
  const { [key]: _removed, ...remaining } = records
  return remaining
}

/**
 * Remove the durable identity for one device-confirmed managed Pattern deletion.
 * Foreign and stale UI rows are no-ops. Push records are written first so a
 * failed binding write can restore them without losing the overwrite identity.
 */
export async function removeManagedControllerSavedProgramMetadata(
  deletion: ManagedControllerSavedProgramDeletion,
  metadata: ControllerSavedProgramDeletionMetadata,
): Promise<ManagedControllerSavedProgramDeletionResult> {
  if (!deletion.bindingKey) return { removed: false }

  const [bindings, pushRecords] = await Promise.all([
    metadata.getControllerBindings(),
    metadata.getPushRecords(),
  ])
  if (bindings[deletion.controllerId]?.[deletion.bindingKey] !== deletion.programId) {
    return { removed: false }
  }

  const nextBindings: BindingStore = {
    ...bindings,
    [deletion.controllerId]: withoutEntry(
      bindings[deletion.controllerId] ?? {},
      deletion.bindingKey,
    ),
  }
  const nextPushRecords: ControllerPushRecords = {
    ...pushRecords,
    [deletion.controllerId]: withoutEntry(
      pushRecords[deletion.controllerId] ?? {},
      deletion.bindingKey,
    ),
  }

  await metadata.setPushRecords(nextPushRecords)
  try {
    await metadata.setControllerBindings(nextBindings)
  } catch (error) {
    try {
      await metadata.setPushRecords(pushRecords)
    } catch (rollbackError) {
      const message = error instanceof Error ? error.message : String(error)
      const rollbackMessage = rollbackError instanceof Error
        ? rollbackError.message
        : String(rollbackError)
      throw new Error(
        `${message}; restoring Controller push records also failed: ${rollbackMessage}`,
        { cause: rollbackError },
      )
    }
    throw error
  }

  return { removed: true, bindingKey: deletion.bindingKey }
}
