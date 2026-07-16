import { create } from 'zustand'

export type ShowSeekStatus = 'idle' | 'rebuilding'

export function canAdvanceShowPlayback(isRunning: boolean, seekStatus: ShowSeekStatus): boolean {
  return isRunning && seekStatus === 'idle'
}

export interface ShowSeekRequest {
  id: number
  targetMs: number
}

export interface ShowPlaybackWindow {
  startMs: number
  endMs: number
}

export type ShowPlaybackStep =
  | { kind: 'advance'; targetMs: number }
  | { kind: 'rewind'; targetMs: number }
  | { kind: 'loop'; targetMs: 0 }

export function resolveShowPlaybackStep(
  elapsedMs: number,
  deltaMs: number,
  playbackWindow: ShowPlaybackWindow | null,
  showDurationMs = 0,
): ShowPlaybackStep {
  const targetMs = elapsedMs + Math.max(0, deltaMs)
  if (playbackWindow && targetMs >= playbackWindow.endMs) {
    return { kind: 'rewind', targetMs: playbackWindow.startMs }
  }
  if (!playbackWindow && showDurationMs > 0 && targetMs >= showDurationMs) {
    return { kind: 'loop', targetMs: 0 }
  }
  return { kind: 'advance', targetMs }
}

interface ShowTransportState {
  showId: string | null
  durationMs: number
  positionMs: number
  playbackWindow: ShowPlaybackWindow | null
  seekStatus: ShowSeekStatus
  seekRequest: ShowSeekRequest | null
  nextSeekId: number
  openShow: (showId: string, durationMs: number) => void
  setPosition: (showId: string, positionMs: number) => void
  setPlaybackWindow: (showId: string, window: ShowPlaybackWindow) => void
  clearPlaybackWindow: (showId: string) => void
  requestSeek: (showId: string, targetMs: number) => number
  completeSeek: (requestId: number, positionMs: number) => void
  cancelSeek: (requestId: number) => void
}

export const showTransportInitialState = {
  showId: null as string | null,
  durationMs: 0,
  positionMs: 0,
  playbackWindow: null as ShowPlaybackWindow | null,
  seekStatus: 'idle' as ShowSeekStatus,
  seekRequest: null as ShowSeekRequest | null,
  nextSeekId: 1,
}

function finiteDuration(durationMs: number): number {
  return Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0
}

function clampPosition(positionMs: number, durationMs: number, window: ShowPlaybackWindow | null = null): number {
  if (!Number.isFinite(positionMs)) return 0
  const startMs = window?.startMs ?? 0
  const endMs = window?.endMs ?? durationMs
  return Math.max(startMs, Math.min(endMs, positionMs))
}

function normalizePlaybackWindow(window: ShowPlaybackWindow, durationMs: number): ShowPlaybackWindow {
  const first = clampPosition(window.startMs, durationMs)
  const second = clampPosition(window.endMs, durationMs)
  return { startMs: Math.min(first, second), endMs: Math.max(first, second) }
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
        playbackWindow: null,
        seekStatus: 'idle',
        seekRequest: null,
      }
    }
    const playbackWindow = state.playbackWindow
      ? normalizePlaybackWindow(state.playbackWindow, durationMs)
      : null
    return {
      durationMs,
      playbackWindow,
      positionMs: clampPosition(state.positionMs, durationMs, playbackWindow),
    }
  }),
  setPosition: (showId, positionMs) => set((state) => (
    state.showId === showId
      ? { positionMs: clampPosition(positionMs, state.durationMs, state.playbackWindow) }
      : {}
  )),
  setPlaybackWindow: (showId, rawWindow) => set((state) => {
    if (state.showId !== showId) return {}
    const playbackWindow = normalizePlaybackWindow(rawWindow, state.durationMs)
    const positionMs = state.positionMs < playbackWindow.startMs || state.positionMs > playbackWindow.endMs
      ? playbackWindow.startMs
      : state.positionMs
    return {
      playbackWindow,
      positionMs,
      seekRequest: state.seekRequest
        ? { ...state.seekRequest, targetMs: clampPosition(state.seekRequest.targetMs, state.durationMs, playbackWindow) }
        : null,
    }
  }),
  clearPlaybackWindow: (showId) => set((state) => state.showId === showId ? { playbackWindow: null } : {}),
  requestSeek: (showId, targetMs) => {
    const state = get()
    if (state.showId !== showId) return -1
    const id = state.nextSeekId
    set({
      nextSeekId: id + 1,
      seekStatus: 'rebuilding',
      seekRequest: { id, targetMs: clampPosition(targetMs, state.durationMs, state.playbackWindow) },
    })
    return id
  },
  completeSeek: (requestId, positionMs) => set((state) => (
    state.seekRequest?.id === requestId
      ? {
          positionMs: clampPosition(positionMs, state.durationMs, state.playbackWindow),
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
