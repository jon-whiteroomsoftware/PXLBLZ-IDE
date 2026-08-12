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
  retryLabel = 'Retry save',
  dismissLabel = 'Dismiss save notice',
  compact = false,
  testId,
}: {
  message: string
  onRetry?: () => void
  onDismiss: () => void
  retryLabel?: string
  dismissLabel?: string
  compact?: boolean
  testId: string
}) {
  return (
    <div
      role="alert"
      data-testid={testId}
      className={`relative flex shrink-0 border-b border-red-400/25 bg-red-400/[0.06] py-1.5 text-[11px] text-zinc-300 ${compact ? 'flex-col items-stretch gap-1.5 px-2' : 'items-center gap-2 px-3'}`}
    >
      <span className={`flex min-w-0 gap-2 ${compact ? 'items-start pr-4' : 'flex-1 items-center'}`}>
        <CloudOff size={12} aria-hidden className="shrink-0 text-red-300/80" />
        <span className="min-w-0 break-words">{message}</span>
      </span>
      {onRetry && (
        <button
          type="button"
          aria-label={retryLabel}
          onClick={onRetry}
          className={`h-6 shrink-0 rounded border border-red-300/30 px-2 text-[11px] text-red-200/90 transition-colors hover:border-red-300/60 hover:text-red-100 ${compact ? 'w-full' : ''}`}
        >
          Retry
        </button>
      )}
      <button
        type="button"
        aria-label={dismissLabel}
        onClick={onDismiss}
        className={`grid size-5 shrink-0 place-items-center text-zinc-500 transition-colors hover:text-zinc-200 ${compact ? 'absolute right-1 top-1' : onRetry ? '' : 'ml-auto'}`}
      >
        <X size={12} aria-hidden />
      </button>
    </div>
  )
}
