import { create } from 'zustand'

export type ShowSeekStatus = 'idle' | 'rebuilding'

export interface ShowSeekRequest {
  id: number
  targetMs: number
}

interface ShowTransportState {
  showId: string | null
  durationMs: number
  positionMs: number
  seekStatus: ShowSeekStatus
  seekRequest: ShowSeekRequest | null
  nextSeekId: number
  openShow: (showId: string, durationMs: number) => void
  setPosition: (showId: string, positionMs: number) => void
  requestSeek: (showId: string, targetMs: number) => number
  completeSeek: (requestId: number, positionMs: number) => void
  cancelSeek: (requestId: number) => void
}

export const showTransportInitialState = {
  showId: null as string | null,
  durationMs: 0,
  positionMs: 0,
  seekStatus: 'idle' as ShowSeekStatus,
  seekRequest: null as ShowSeekRequest | null,
  nextSeekId: 1,
}

function finiteDuration(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
}

function clampPosition(positionMs: number, durationMs: number): number {
  if (!Number.isFinite(positionMs)) return 0
  return Math.max(0, Math.min(durationMs, positionMs))
}

export const useShowTransportStore = create<ShowTransportState>()((set, get) => ({
  ...showTransportInitialState,
  openShow: (showId, rawDurationMs) => set((state) => {
    const durationMs = finiteDuration(rawDurationMs)
    if (state.showId !== showId) {
      return {
        showId,
        durationMs,
        positionMs: 0,
        seekStatus: 'idle',
        seekRequest: null,
      }
    }
    return {
      durationMs,
      positionMs: clampPosition(state.positionMs, durationMs),
    }
  }),
  setPosition: (showId, positionMs) => set((state) => (
    state.showId === showId
      ? { positionMs: clampPosition(positionMs, state.durationMs) }
      : {}
  )),
  requestSeek: (showId, targetMs) => {
    const state = get()
    if (state.showId !== showId) return -1
    const id = state.nextSeekId
    set({
      nextSeekId: id + 1,
      seekStatus: 'rebuilding',
      seekRequest: { id, targetMs: clampPosition(targetMs, state.durationMs) },
    })
    return id
  },
  completeSeek: (requestId, positionMs) => set((state) => (
    state.seekRequest?.id === requestId
      ? {
          positionMs: clampPosition(positionMs, state.durationMs),
          seekStatus: 'idle',
          seekRequest: null,
        }
      : {}
  )),
  cancelSeek: (requestId) => set((state) => (
    state.seekRequest?.id === requestId
      ? { seekStatus: 'idle', seekRequest: null }
      : {}
  )),
}))
