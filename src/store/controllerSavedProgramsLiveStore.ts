import { create } from 'zustand'
import { getControllerBindings, getPushRecords } from '@/engine/controllerMetadataStorage'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import type { BindingStore } from '@/engine/controllerBinding'
import type { ControllerPushRecords } from '@/engine/controllerPushRecord'

export interface ControllerSavedProgramsReadRequest {
  controllerId: string
  liveEpoch: number | undefined
  programs: readonly ProgramListEntry[]
  pushRecordsRevision: number
  refreshGeneration: number
  refreshPrograms?: () => Promise<readonly ProgramListEntry[]>
}

export interface ControllerSavedProgramsRead {
  readKey: string
  phase: 'loading' | 'ready' | 'failed'
  programs: ProgramListEntry[]
  bindings: BindingStore
  pushRecords: ControllerPushRecords
  refreshGeneration: number
}

interface ControllerSavedProgramsLiveState {
  readsByProfile: Record<string, ControllerSavedProgramsRead>
  refreshGenerationsByProfile: Record<string, number>
  syncProfile: (profileId: string, request: ControllerSavedProgramsReadRequest) => Promise<void>
  requestRefresh: (profileId: string) => void
  clearProfile: (profileId: string) => void
}

export const controllerSavedProgramsLiveInitialState = {
  readsByProfile: {} as Record<string, ControllerSavedProgramsRead>,
  refreshGenerationsByProfile: {} as Record<string, number>,
}

/** Names every fact that can make a saved-program inventory answer obsolete. */
export function controllerSavedProgramsReadKey(
  request: ControllerSavedProgramsReadRequest,
): string {
  return JSON.stringify([
    request.controllerId,
    request.liveEpoch ?? null,
    request.programs,
    request.pushRecordsRevision,
    request.refreshGeneration,
  ])
}

export function selectControllerSavedProgramsRead(
  state: Pick<ControllerSavedProgramsLiveState, 'readsByProfile'>,
  profileId: string,
  readKey: string,
): Omit<ControllerSavedProgramsRead, 'readKey' | 'refreshGeneration'> {
  const read = state.readsByProfile[profileId]
  if (read?.readKey === readKey) return read
  return { phase: 'loading', programs: [], bindings: {}, pushRecords: {} }
}

/** Owns the evidence lifecycle for the Controller profile's saved inventory.
 * React supplies the live question; only an answer to its exact read key can be
 * selected. New connections, durable writes, and refresh generations therefore
 * retire old freshness claims immediately. */
export const useControllerSavedProgramsLiveStore = create<ControllerSavedProgramsLiveState>()((set, get) => ({
  ...controllerSavedProgramsLiveInitialState,

  syncProfile: async (profileId, request) => {
    const initialReadKey = controllerSavedProgramsReadKey(request)
    const current = get().readsByProfile[profileId]
    if (current?.readKey === initialReadKey && current.phase !== 'failed') return
    const refreshPrograms = request.refreshGeneration > (current?.refreshGeneration ?? 0)
      ? request.refreshPrograms
      : undefined

    set((state) => ({
      readsByProfile: {
        ...state.readsByProfile,
        [profileId]: {
          readKey: initialReadKey,
          phase: 'loading',
          programs: [],
          bindings: {},
          pushRecords: {},
          refreshGeneration: request.refreshGeneration,
        },
      },
    }))

    let programs = [...request.programs]
    let readKey = initialReadKey
    try {
      if (refreshPrograms) {
        programs = [...await refreshPrograms()]
        readKey = controllerSavedProgramsReadKey({ ...request, programs })
        if (readKey !== initialReadKey) {
          set((state) => state.readsByProfile[profileId]?.readKey === initialReadKey
            ? {
                readsByProfile: {
                  ...state.readsByProfile,
                  [profileId]: {
                    readKey,
                    phase: 'loading',
                    programs: [],
                    bindings: {},
                    pushRecords: {},
                    refreshGeneration: request.refreshGeneration,
                  },
                },
              }
            : state)
        }
      }
      const [bindings, pushRecords] = await Promise.all([
        getControllerBindings(),
        getPushRecords(),
      ])
      set((state) => state.readsByProfile[profileId]?.readKey === readKey
        ? {
            readsByProfile: {
              ...state.readsByProfile,
              [profileId]: {
                readKey,
                phase: 'ready',
                programs,
                bindings,
                pushRecords,
                refreshGeneration: request.refreshGeneration,
              },
            },
          }
        : state)
    } catch {
      set((state) => state.readsByProfile[profileId]?.readKey === readKey
        ? {
            readsByProfile: {
              ...state.readsByProfile,
              [profileId]: {
                readKey,
                phase: 'failed',
                programs: [],
                bindings: {},
                pushRecords: {},
                refreshGeneration: request.refreshGeneration,
              },
            },
          }
        : state)
    }
  },

  requestRefresh: (profileId) => set((state) => ({
    refreshGenerationsByProfile: {
      ...state.refreshGenerationsByProfile,
      [profileId]: (state.refreshGenerationsByProfile[profileId] ?? 0) + 1,
    },
  })),

  clearProfile: (profileId) => set((state) => {
    if (!(profileId in state.readsByProfile)) return state
    const { [profileId]: _cleared, ...readsByProfile } = state.readsByProfile
    return { readsByProfile }
  }),
}))
