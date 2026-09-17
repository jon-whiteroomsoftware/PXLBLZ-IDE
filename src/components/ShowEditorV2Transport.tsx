import { useEffect } from 'react'
import { Pause, Play, SkipBack } from 'lucide-react'
import { claimStudioPreviewSpace, studioControlOwnsKeyboardEvent } from '@/engine/keyboardShortcuts'
import { usePreviewStore } from '@/store/previewStore'
import { useShowTransportStore } from '@/store/showTransportStore'

/** What one arrow press moves the playhead, as on the v1 route. */
export const SHOW_V2_SEEK_STEP_MS = 5_000

/**
 * The v2 editor route's transport (#1056 slice 6): play and pause, return to
 * the Show start, the playhead time, and the keyboard seek the v1 route
 * offers - Space, `A` and the arrow keys.
 *
 * The Stage preview owns playback itself; this only asks the transport store
 * for a position, exactly as the v1 controls do. The arrow keys belong to a
 * focused Clip first: the timeline surface cancels the event it handles, so a
 * cancelled event never also seeks.
 */
export function ShowEditorV2Transport({ showId, showEndMs }: { showId: string; showEndMs: number }) {
  const isRunning = usePreviewStore((state) => state.isRunning)
  const togglePlayback = usePreviewStore((state) => state.toggle)
  const positionMs = useShowTransportStore((state) => state.showId === showId ? state.positionMs : 0)
  const open = useShowTransportStore((state) => state.showId === showId)

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (studioControlOwnsKeyboardEvent(event.target)) return
      if (claimStudioPreviewSpace(event)) {
        usePreviewStore.getState().toggle()
        return
      }
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return
      const transport = useShowTransportStore.getState()
      if (transport.showId !== showId) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault()
        if (event.repeat) return
        const direction = event.key === 'ArrowLeft' ? -1 : 1
        requestShowV2Seek(showId, transport.positionMs + direction * SHOW_V2_SEEK_STEP_MS)
        return
      }
      if (event.key.toLowerCase() === 'a') {
        event.preventDefault()
        requestShowV2Seek(showId, 0)
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [showId])

  return (
    <div
      role="group"
      aria-label="Show transport controls"
      data-testid="show-editor-v2-transport"
      data-studio-space-preview="true"
      className="flex shrink-0 items-center gap-1"
    >
      <button
        type="button"
        aria-label={isRunning ? 'Pause Show preview' : 'Play Show preview'}
        title={`${isRunning ? 'Pause' : 'Play'} Show preview (Space)`}
        onClick={togglePlayback}
        className={`flex h-6 w-6 items-center justify-center rounded-sm outline-none focus-visible:ring-1 focus-visible:ring-live/80 ${
          isRunning ? 'bg-amber-400/10 text-amber-300' : 'text-zinc-400 hover:bg-white/5'}`}
      >
        {isRunning ? <Pause size={13} aria-hidden /> : <Play size={13} aria-hidden />}
      </button>
      <button
        type="button"
        aria-label="Go to Show start"
        title="Go to Show start (A)"
        aria-disabled={!open || undefined}
        onClick={() => { if (open) requestShowV2Seek(showId, 0) }}
        className="flex h-6 w-6 items-center justify-center rounded-sm text-zinc-400 outline-none hover:bg-white/5 focus-visible:ring-1 focus-visible:ring-live/80 aria-disabled:opacity-35"
      >
        <SkipBack size={13} aria-hidden />
      </button>
      <output
        aria-label="Playhead position"
        data-testid="show-editor-v2-playhead-time"
        className="min-w-[5.5rem] font-mono text-[10px] tabular-nums text-zinc-400"
      >
        {formatTransportTime(open ? positionMs : 0)} / {formatTransportTime(showEndMs)}
      </output>
    </div>
  )
}

/** Seeking pauses, moves and resumes, so a running preview lands where asked. */
export function requestShowV2Seek(showId: string, targetMs: number): void {
  const preview = usePreviewStore.getState()
  const shouldResume = preview.isRunning
  if (shouldResume) preview.toggle()
  const transport = useShowTransportStore.getState()
  transport.setPosition(showId, targetMs)
  transport.requestSeek(showId, targetMs)
  if (shouldResume && !usePreviewStore.getState().isRunning) usePreviewStore.getState().toggle()
}

export function formatTransportTime(timeMs: number): string {
  const total = Math.max(0, Math.round(timeMs))
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1_000).toString().padStart(2, '0')
  return `${minutes}:${seconds}.${Math.floor((total % 1_000) / 100)}`
}
