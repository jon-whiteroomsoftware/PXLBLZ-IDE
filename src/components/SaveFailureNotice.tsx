// The one alert bar for a failed one-shot persistence write, shared by the
// Show editor (#792) and the Controller profile page (#810). The owning store
// has already rolled the edit back; this surface reports it and offers Retry
// (re-apply the reverted edit) and Dismiss. Rendering is conditional at the
// call site — mount it only while the store holds a failure.
import { CloudOff, X } from 'lucide-react'

export function SaveFailureNotice({
  message,
  onRetry,
  onDismiss,
  testId,
}: {
  message: string
  onRetry: () => void
  onDismiss: () => void
  testId: string
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className="flex shrink-0 items-center gap-2 border-b border-red-400/25 bg-red-400/[0.06] px-3 py-1.5 text-[11px] text-zinc-300"
    >
      <CloudOff size={12} aria-hidden className="shrink-0 text-red-300/80" />
      <span className="min-w-0">{message}</span>
      <button
        type="button"
        aria-label="Retry save"
        onClick={onRetry}
        className="ml-auto h-6 shrink-0 rounded border border-red-300/30 px-2 text-[11px] text-red-200/90 transition-colors hover:border-red-300/60 hover:text-red-100"
      >
        Retry
      </button>
      <button
        type="button"
        aria-label="Dismiss save notice"
        onClick={onDismiss}
        className="grid size-5 shrink-0 place-items-center text-zinc-500 transition-colors hover:text-zinc-200"
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  )
}
