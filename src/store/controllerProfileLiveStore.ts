import { create } from 'zustand'
import { getControllerBindings } from '@/engine/controllerMetadataStorage'
import {
  installedControllerPatternChoices,
  type InstalledControllerPatternChoice,
} from '@/engine/controllerSavedPrograms'
import type { ProgramListEntry } from '@/engine/PixelblazeConnection'
import { useControllerProfileStore } from './controllerProfileStore'

export interface ControllerProfileLiveReadRequest {
  liveIp: string
  liveEpoch: number | undefined
  programs: readonly ProgramListEntry[]
}

interface ControllerProfileLiveRead {
  readKey: string
  phase: 'loading' | 'ready' | 'failed'
  patternChoices: InstalledControllerPatternChoice[]
}

interface ControllerProfileLiveState {
  readsByProfile: Record<string, ControllerProfileLiveRead>
  syncProfile: (profileId: string, request: ControllerProfileLiveReadRequest) => Promise<void>
  clearProfile: (profileId: string) => void
}

export const controllerProfileLiveInitialState = {
  readsByProfile: {} as Record<string, ControllerProfileLiveRead>,
}

/** Names the complete live question: Controller, connection instance, and the
 * program-list content the bindings are interpreted against. */
export function controllerProfileLiveReadKey(request: ControllerProfileLiveReadRequest): string {
  return JSON.stringify([
    request.liveIp,
    request.liveEpoch ?? null,
    request.programs,
  ])
}

export function selectControllerProfilePatternChoices(
  state: Pick<ControllerProfileLiveState, 'readsByProfile'>,
  profileId: string,
  readKey: string,
): InstalledControllerPatternChoice[] {
  const read = state.readsByProfile[profileId]
  return read?.readKey === readKey && read.phase === 'ready'
    ? read.patternChoices
    : []
}

/** Owns live Controller-profile read lifecycle outside React. A result may
 * publish only while the exact question it answered is still current. */
export const useControllerProfileLiveStore = create<ControllerProfileLiveState>()((set, get) => ({
  ...controllerProfileLiveInitialState,

  syncProfile: async (profileId, request) => {
    const readKey = controllerProfileLiveReadKey(request)
    // Metadata is a one-off observation requested every time the profile route
    // opens. It is independent of the connection-scoped bindings cache below.
    void useControllerProfileStore.getState().refreshLiveMetadata(profileId)
    const current = get().readsByProfile[profileId]
    if (current?.readKey === readKey && current.phase !== 'failed') return

    set((state) => ({
      readsByProfile: {
        ...state.readsByProfile,
        [profileId]: { readKey, phase: 'loading', patternChoices: [] },
      },
    }))

    try {
      const bindings = await getControllerBindings()
      const patternChoices = installedControllerPatternChoices({
        controllerId: request.liveIp,
        programs: request.programs,
        bindings,
      })
      set((state) => state.readsByProfile[profileId]?.readKey === readKey
        ? {
            readsByProfile: {
              ...state.readsByProfile,
              [profileId]: { readKey, phase: 'ready', patternChoices },
            },
          }
        : state)
    } catch {
      set((state) => state.readsByProfile[profileId]?.readKey === readKey
        ? {
            readsByProfile: {
              ...state.readsByProfile,
              [profileId]: { readKey, phase: 'failed', patternChoices: [] },
            },
          }
        : state)
    }
  },

  clearProfile: (profileId) => set((state) => {
    if (!(profileId in state.readsByProfile)) return state
    const { [profileId]: _cleared, ...readsByProfile } = state.readsByProfile
    return { readsByProfile }
  }),
}))
