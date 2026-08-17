import { create } from 'zustand'

export type StudioOperationSurface = 'rail' | 'editor'
export type StudioOperationAction = 'create' | 'clone' | 'rename' | 'delete' | 'empty-trash'
export type StudioOperationEntityKind = 'pattern' | 'map' | 'mixin' | 'library' | 'controller'

export interface StudioOperationSpec {
  surface: StudioOperationSurface
  action: StudioOperationAction
  entityKind: StudioOperationEntityKind
  entityName: string
  run: () => Promise<void>
  failureMessage?: string | (() => string)
}

export interface StudioOperationFailure {
  action: StudioOperationAction
  entityKind: StudioOperationEntityKind
  entityName: string
  message: string
  operation: StudioOperationSpec
}

export function studioOperationRetryLabel(failure: StudioOperationFailure): string {
  if (failure.action === 'empty-trash') return `Retry empty ${failure.entityName}`
  return `Retry ${failure.action} ${failure.entityKind}`
}

export function studioOperationDismissLabel(failure: StudioOperationFailure): string {
  if (failure.action === 'empty-trash') return `Dismiss empty ${failure.entityName} notice`
  return `Dismiss ${failure.action} ${failure.entityKind} notice`
}

interface StudioOperationState {
  failures: Record<StudioOperationSurface, StudioOperationFailure | null>
  attemptIds: Record<StudioOperationSurface, number>
  execute: (operation: StudioOperationSpec) => Promise<boolean>
  retry: (surface: StudioOperationSurface) => Promise<boolean>
  dismiss: (surface: StudioOperationSurface) => void
}

export const studioOperationInitialState = {
  failures: {
    rail: null,
    editor: null,
  } as Record<StudioOperationSurface, StudioOperationFailure | null>,
  attemptIds: {
    rail: 0,
    editor: 0,
  } as Record<StudioOperationSurface, number>,
}

function operationFailureMessage(operation: StudioOperationSpec): string {
  if (typeof operation.failureMessage === 'function') return operation.failureMessage()
  if (operation.failureMessage) return operation.failureMessage
  if (operation.action === 'empty-trash') {
    return `Could not empty ${operation.entityName}.`
  }
  return `Could not ${operation.action} ${operation.entityKind} "${operation.entityName}".`
}

export const useStudioOperationStore = create<StudioOperationState>()((set, get) => ({
  ...studioOperationInitialState,

  execute: async (operation) => {
    const attemptId = get().attemptIds[operation.surface] + 1
    set((state) => ({
      failures: { ...state.failures, [operation.surface]: null },
      attemptIds: { ...state.attemptIds, [operation.surface]: attemptId },
    }))
    try {
      await operation.run()
      return true
    } catch {
      if (get().attemptIds[operation.surface] === attemptId) {
        set((state) => ({
          failures: {
            ...state.failures,
            [operation.surface]: {
              action: operation.action,
              entityKind: operation.entityKind,
              entityName: operation.entityName,
              message: operationFailureMessage(operation),
              operation,
            },
          },
        }))
      }
      return false
    }
  },

  retry: async (surface) => {
    const failure = get().failures[surface]
    if (!failure) return false
    return get().execute(failure.operation)
  },

  dismiss: (surface) => set((state) => ({
    failures: { ...state.failures, [surface]: null },
    attemptIds: { ...state.attemptIds, [surface]: state.attemptIds[surface] + 1 },
  })),
}))
